import { state, subscribe, notify, createNewLayer, getActiveLayer, type LayerState } from './state';
import { $, inlineEdit } from './dom';
import { toast } from './toast';

const container = $('layers-list-container');
const cards = new Map<string, HTMLElement>();
let draggedId: string | null = null;

function findLayer(id: string): LayerState | undefined {
  return state.layers.find((l) => l.id === id);
}

function createCard(id: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'layer-card';
  card.setAttribute('draggable', 'true');
  card.dataset.id = id;
  card.innerHTML = `
    <div class="layer-card-left">
      <span class="icon-drag">☰</span>
      <div class="layer-thumbnail"></div>
      <span class="layer-name-label"></span>
    </div>
    <div class="layer-card-actions">
      <span class="btn-layer-vis"></span>
      <span class="btn-layer-del">✕</span>
    </div>`;

  card.addEventListener('click', (e) => {
    const layer = findLayer(id);
    if (!layer) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('btn-layer-vis')) {
      layer.visible = !layer.visible;
      notify('layerProps');
      return;
    }
    if (target.classList.contains('btn-layer-del')) {
      state.layers = state.layers.filter((l) => l.id !== id);
      if (state.activeLayerId === id) state.activeLayerId = state.layers[0]?.id || null;
      notify('structure', 'selection');
      return;
    }
    state.activeLayerId = id;
    notify('selection');
  });

  const nameEl = card.querySelector('.layer-name-label') as HTMLElement;
  nameEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const layer = findLayer(id);
    if (!layer) return;
    inlineEdit(nameEl, layer.name, (v) => {
      layer.name = v;
      notify('layerProps');
    });
  });

  card.addEventListener('dragstart', (e) => {
    draggedId = id;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggedId || draggedId === id) return;
    const from = state.layers.findIndex((l) => l.id === draggedId);
    const to = state.layers.findIndex((l) => l.id === id);
    if (from !== -1 && to !== -1) {
      const [moved] = state.layers.splice(from, 1);
      state.layers.splice(to, 0, moved);
      notify('structure');
    }
    draggedId = null;
  });
  card.addEventListener('dragend', () => { draggedId = null; });
  return card;
}

function updateCard(card: HTMLElement, layer: LayerState): void {
  card.classList.toggle('active', state.activeLayerId === layer.id);
  const nameEl = card.querySelector('.layer-name-label') as HTMLElement;
  if (nameEl.textContent !== layer.name) nameEl.textContent = layer.name;
  const vis = card.querySelector('.btn-layer-vis') as HTMLElement;
  const visGlyph = layer.visible ? '👁' : '⊘';
  if (vis.textContent !== visGlyph) vis.textContent = visGlyph;
  card.style.opacity = layer.visible ? '' : '0.5';
  const thumb = card.querySelector('.layer-thumbnail') as HTMLElement;
  if (layer.type === 'image' && layer.imageSrc) {
    let img = thumb.querySelector('img');
    if (!img) { img = document.createElement('img'); thumb.textContent = ''; thumb.appendChild(img); }
    if (img.src !== layer.imageSrc) img.src = layer.imageSrc;
  } else if (!thumb.querySelector('img')) {
    const glyph = layer.type === 'image' ? 'IMG' : 'TXT';
    if (thumb.textContent !== glyph) thumb.textContent = glyph;
  }
}

function renderList(): void {
  const seen = new Set<string>();
  let prev: HTMLElement | null = null;
  state.layers.forEach((layer) => {
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
  state.layers.forEach((layer) => {
    const card = cards.get(layer.id);
    if (card) updateCard(card, layer);
  });
}

function addImageFromDataUrl(dataUrl: string, name: string): void {
  const active = getActiveLayer();
  if (active && active.type === 'image' && !active.imageSrc) {
    active.imageSrc = dataUrl;
    active.imageName = name;
    notify('layerProps');
  } else {
    const layer = createNewLayer('image');
    layer.imageSrc = dataUrl;
    layer.imageName = name;
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    notify('structure', 'selection');
  }
}

function readImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    toast('Only image files are supported.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => addImageFromDataUrl(ev.target?.result as string, file.name);
  reader.onerror = () => toast('Failed to read file.');
  reader.readAsDataURL(file);
}

export function initLayersPanel(): void {
  $('btn-add-image').addEventListener('click', () => {
    const layer = createNewLayer('image');
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    notify('structure', 'selection');
  });
  $('btn-add-text').addEventListener('click', () => {
    const layer = createNewLayer('text');
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    notify('structure', 'selection');
  });

  const uploadZone = $('upload-zone');
  const fileInput = $('file-input') as unknown as HTMLInputElement;
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    Array.from(e.dataTransfer?.files ?? []).forEach(readImageFile);
  });
  fileInput.addEventListener('change', () => {
    Array.from(fileInput.files ?? []).forEach(readImageFile);
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
          readImageFile(named);
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
