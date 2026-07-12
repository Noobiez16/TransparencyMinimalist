import { state, subscribe, notify, getActiveLayer } from './state';
import { createImageLayer, createTextLayer, type Layer, type ImageLayer } from './engine/document';
import { $, inlineEdit, icons } from './dom';
import { toast } from './toast';
import { flashCanvas } from './canvas';
import * as history from './engine/history';
import type { Command } from './engine/history';
import { cmdAddLayer, cmdDeleteLayer, cmdPatchLayer, cmdReorderLayer } from './engine/commands';
import { openProjectFile } from './engine/persistence';
import { guardTransformSession } from './transform-session-guard';

const container = $('layers-list-container');
const cards = new Map<string, HTMLElement>();
let draggedId: string | null = null;
const deleting = new Set<string>();

function findLayer(id: string): Layer | undefined {
  return state.doc.layers.find((l) => l.id === id);
}

function createCard(id: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'layer-card';
  card.setAttribute('draggable', 'true');
  card.dataset.id = id;
  card.innerHTML = `
    <div class="layer-card-left">
      <span class="icon-drag">${icons.drag}</span>
      <div class="layer-thumbnail"></div>
      <span class="layer-name-label"></span>
    </div>
    <div class="layer-card-actions">
      <span class="btn-layer-vis"></span>
      <span class="btn-layer-del"></span>
    </div>`;

  const delBtn = card.querySelector('.btn-layer-del') as HTMLElement;
  delBtn.innerHTML = icons.x;

  card.addEventListener('click', (e) => {
    const layer = findLayer(id);
    if (!layer) return;
    const target = e.target as HTMLElement;
    guardTransformSession(() => {
      if (target.classList.contains('btn-layer-vis')) {
        history.push(cmdPatchLayer(id, layer.visible ? 'Hide layer' : 'Show layer', { visible: !layer.visible }));
        return;
      }
      if (target.classList.contains('btn-layer-del')) {
        if (deleting.has(id)) return;
        deleting.add(id);
        card.classList.add('leaving');
        setTimeout(() => {
          deleting.delete(id);
          history.push(cmdDeleteLayer(id, 'Delete layer'));
        }, 150);
        return;
      }
      state.doc.activeLayerId = id;
      notify('selection', 'composite');
    });
  });

  const nameEl = card.querySelector('.layer-name-label') as HTMLElement;
  nameEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const layer = findLayer(id);
    if (!layer) return;
    guardTransformSession(() => inlineEdit(nameEl, layer.name, (v) => {
      history.push(cmdPatchLayer(id, 'Rename layer', { name: v }));
    }));
  });

  card.addEventListener('dragstart', (e) => {
    draggedId = id;
    card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    card.classList.add('drop-above');
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('drop-above');
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drop-above');
    if (!draggedId || draggedId === id) return;
    const draggedLayerId = draggedId;
    const from = state.doc.layers.findIndex((l) => l.id === draggedLayerId);
    const to = state.doc.layers.findIndex((l) => l.id === id);
    if (from !== -1 && to !== -1) guardTransformSession(() => {
      history.push(cmdReorderLayer(draggedLayerId, to, 'Reorder layer'));
    });
    draggedId = null;
  });
  card.addEventListener('dragend', () => {
    draggedId = null;
    card.classList.remove('dragging');
  });
  return card;
}

function updateCard(card: HTMLElement, layer: Layer): void {
  card.classList.toggle('active', state.doc.activeLayerId === layer.id);
  const nameEl = card.querySelector('.layer-name-label') as HTMLElement | null;
  if (nameEl && nameEl.textContent !== layer.name) nameEl.textContent = layer.name;
  const vis = card.querySelector('.btn-layer-vis') as HTMLElement;
  if (vis.dataset.vis !== String(layer.visible)) {
    vis.dataset.vis = String(layer.visible);
    vis.innerHTML = layer.visible ? icons.eye : icons.eyeOff;
  }
  card.style.opacity = layer.visible ? '' : '0.5';
  const thumb = card.querySelector('.layer-thumbnail') as HTMLElement;
  if (layer.kind === 'image' && layer.bitmap) {
    let tc = thumb.querySelector('canvas') as HTMLCanvasElement | null;
    if (!tc) { tc = document.createElement('canvas'); tc.width = 26; tc.height = 26; thumb.textContent = ''; thumb.appendChild(tc); }
    if (tc.dataset.rev !== String(layer.bitmapRev)) {
      tc.dataset.rev = String(layer.bitmapRev);
      const tctx = tc.getContext('2d')!;
      tctx.clearRect(0, 0, 26, 26);
      const s = Math.min(26 / layer.bitmap.width, 26 / layer.bitmap.height);
      tctx.drawImage(layer.bitmap, (26 - layer.bitmap.width * s) / 2, (26 - layer.bitmap.height * s) / 2, layer.bitmap.width * s, layer.bitmap.height * s);
    }
  } else if (!thumb.querySelector('canvas')) {
    const glyph = layer.kind === 'image' ? 'IMG' : 'TXT';
    if (thumb.textContent !== glyph) thumb.textContent = glyph;
  }
}

function renderList(): void {
  const seen = new Set<string>();
  let prev: HTMLElement | null = null;
  state.doc.layers.forEach((layer) => {
    let card = cards.get(layer.id);
    if (!card) { card = createCard(layer.id); cards.set(layer.id, card); }
    seen.add(layer.id);
    if (prev) prev.after(card);
    else if (container.firstChild !== card) container.prepend(card);
    prev = card;
    updateCard(card, layer);
  });
  for (const [id, card] of cards) {
    if (!seen.has(id)) { cards.delete(id); card.remove(); }
  }
}

function lightUpdate(): void {
  state.doc.layers.forEach((layer) => {
    const card = cards.get(layer.id);
    if (card) updateCard(card, layer);
  });
}

function placeBitmap(layer: ImageLayer, bitmap: HTMLCanvasElement, name: string): void {
  layer.bitmap = bitmap;
  layer.bitmapRev++;
  layer.sourceName = name;
  // cover-fit the document, preserving the old look; clamp to the scale slider's max
  const cover = Math.max(state.doc.width / bitmap.width, state.doc.height / bitmap.height) * 100;
  layer.scaleX = layer.scaleY = Math.round(Math.min(400, Math.max(10, cover)));
  layer.x = state.doc.width / 2;
  layer.y = state.doc.height / 2;
}

function decodeImageFileNow(file: File): void {
  if (!file.type.startsWith('image/')) { toast('Only image files are supported.'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const active = getActiveLayer();
    if (active && active.kind === 'image' && !active.bitmap) {
      const layer = active;
      const prevBitmap = layer.bitmap;
      const prevScaleX = layer.scaleX;
      const prevScaleY = layer.scaleY;
      const prevX = layer.x;
      const prevY = layer.y;
      const prevSourceName = layer.sourceName;
      placeBitmap(layer, c, file.name);
      const nextBitmap = layer.bitmap;
      const nextScaleX = layer.scaleX;
      const nextScaleY = layer.scaleY;
      const nextX = layer.x;
      const nextY = layer.y;
      const nextSourceName = layer.sourceName;
      const cmd: Command = {
        label: 'Place image',
        do: () => {
          layer.bitmap = nextBitmap;
          layer.scaleX = nextScaleX;
          layer.scaleY = nextScaleY;
          layer.x = nextX;
          layer.y = nextY;
          layer.sourceName = nextSourceName;
          layer.bitmapRev++;
          notify('layerProps', 'composite');
        },
        undo: () => {
          layer.bitmap = prevBitmap;
          layer.scaleX = prevScaleX;
          layer.scaleY = prevScaleY;
          layer.x = prevX;
          layer.y = prevY;
          layer.sourceName = prevSourceName;
          layer.bitmapRev++;
          notify('layerProps', 'composite');
        },
        bytes: c.width * c.height * 4
      };
      history.push(cmd);
    } else {
      const layer = createImageLayer(state.doc);
      placeBitmap(layer, c, file.name);
      history.push(cmdAddLayer(layer, 0, 'Add image layer'));
      flashCanvas();
    }
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Failed to read file.'); };
  img.src = url;
}

function decodeImageFile(file: File): void {
  guardTransformSession(() => decodeImageFileNow(file));
}

export function initLayersPanel(): void {
  $('btn-add-image').addEventListener('click', () => guardTransformSession(() => {
    const layer = createImageLayer(state.doc);
    history.push(cmdAddLayer(layer, 0, 'Add image layer'));
    flashCanvas();
  }));
  $('btn-add-text').addEventListener('click', () => guardTransformSession(() => {
    const layer = createTextLayer(state.doc);
    history.push(cmdAddLayer(layer, 0, 'Add text layer'));
    flashCanvas();
  }));

  const uploadZone = $('upload-zone');
  const fileInput = $('file-input') as unknown as HTMLInputElement;
  uploadZone.addEventListener('click', () => guardTransformSession(() => fileInput.click()));
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer?.files ?? []);
    const proj = files.find((f) => f.name.endsWith('.json'));
    if (proj) { void openProjectFile(proj); return; }
    files.forEach(decodeImageFile);
  });
  fileInput.addEventListener('change', () => {
    Array.from(fileInput.files ?? []).forEach(decodeImageFile);
    fileInput.value = '';
  });

  document.addEventListener('paste', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const named = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          decodeImageFile(named);
          break;
        }
      }
    }
  });

  subscribe((dirty) => {
    if (dirty.has('structure')) renderList();
    else if (dirty.has('selection') || dirty.has('layerProps')) lightUpdate();
  });
}
