import { state, subscribe, notify } from './state';
import { composite } from './engine/compositor';
import { layerBounds } from './engine/document';
import { $ } from './dom';
import * as history from './engine/history';
import { cmdPatchDoc } from './engine/commands';

const viewport = $('canvas-viewport');
const screenCanvas = $('doc-canvas') as unknown as HTMLCanvasElement;
const screenCtx = screenCanvas.getContext('2d')!;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

let zoom = 1, panX = 0, panY = 0;
const zoomWrap = $('zoom-wrap');

function applyZoom(): void {
  zoomWrap.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  $('zoom-readout').textContent = `${Math.round(zoom * 100)}%`;
}

function setZoom(next: number, cx = 0, cy = 0): void {
  const clamped = Math.max(0.25, Math.min(4, next));
  const factor = clamped / zoom;
  panX -= cx * (factor - 1);
  panY -= cy * (factor - 1);
  zoom = clamped;
  if (zoom === 1) { panX = 0; panY = 0; }
  applyZoom();
}

export function applyCanvasDimensions(): void {
  const { width, height } = state.doc;
  screenCanvas.width = width * dpr;
  screenCanvas.height = height * dpr;
  viewport.style.aspectRatio = `${width}/${height}`;
  if (width >= height) { viewport.style.width = '100%'; viewport.style.height = 'auto'; }
  else { viewport.style.width = 'auto'; viewport.style.height = '100%'; }
  screenCanvas.style.width = '100%';
  screenCanvas.style.height = '100%';
}

export function flashCanvas(): void {
  viewport.classList.remove('flash');
  void viewport.offsetWidth;
  viewport.classList.add('flash');
}

export function requestComposite(): void { notify('composite'); }

function renderScreen(): void {
  screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // overlayScale = CSS screen px per document px. getBoundingClientRect already
  // includes the zoom transform; the dpr is already in the ctx transform, so it
  // must NOT appear here (it would double-count and thin the outline).
  const rect = screenCanvas.getBoundingClientRect();
  const overlayScale = rect.width / state.doc.width;
  composite(state.doc, screenCtx, { overlay: true, overlayScale });
}

export function screenToDoc(e: PointerEvent): { x: number; y: number } {
  const rect = screenCanvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * state.doc.width,
    y: ((e.clientY - rect.top) / rect.height) * state.doc.height
  };
}

function syncBackgroundUI(): void {
  const bg = state.doc.bgType;
  const colorPicker = $<HTMLInputElement>('bg-color-picker');

  document.querySelectorAll('.btn-theme').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.bg === bg);
  });

  viewport.className = 'canvas-viewport';
  viewport.style.backgroundColor = '';

  if (bg === 'transparent') {
    viewport.classList.add('checkerboard-bg');
    colorPicker.style.display = 'none';
  } else if (bg === 'white') {
    viewport.style.backgroundColor = '#ffffff';
    colorPicker.style.display = 'none';
  } else if (bg === 'black') {
    viewport.style.backgroundColor = '#000000';
    colorPicker.style.display = 'none';
  } else if (bg === 'custom') {
    colorPicker.style.display = 'inline-block';
    viewport.style.backgroundColor = state.doc.bgColor;
  }
  if (colorPicker.value !== state.doc.bgColor) colorPicker.value = state.doc.bgColor;
}

export function initCanvas(): void {
  // --- Canvas Background theme & Custom Color selection ---
  document.querySelectorAll('.btn-theme').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const bg = target.dataset.bg as 'transparent' | 'white' | 'black' | 'custom';
      history.push(cmdPatchDoc('Background', { bgType: bg }));
    });
  });

  $('bg-color-picker').addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    history.push(cmdPatchDoc('Background color', { bgColor: val }, 'doc:bgColor'));
  });

  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) { applyCanvasDimensions(); syncBackgroundUI(); }
    if (
      dirty.has('canvasConfig') || dirty.has('structure') || dirty.has('selection') ||
      dirty.has('layerProps') || dirty.has('composite')
    ) renderScreen();
  });
  applyCanvasDimensions();
  syncBackgroundUI();

  // --- Click-select and drag-move (doc space; ports to the Move tool in Task 7) ---
  let drag: { id: string; startX: number; startY: number; origX: number; origY: number } | null = null;

  screenCanvas.addEventListener('pointerdown', (e) => {
    const pt = screenToDoc(e);
    let hit: (typeof state.doc.layers)[number] | null = null;
    for (const layer of state.doc.layers) {
      if (!layer.visible) continue;
      const b = layerBounds(layer);
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        hit = layer;
        break;
      }
    }
    if (!hit) {
      state.doc.activeLayerId = null;
      notify('selection', 'composite');
      return;
    }
    if (state.doc.activeLayerId !== hit.id) {
      state.doc.activeLayerId = hit.id;
      notify('selection', 'composite');
    }
    drag = { id: hit.id, startX: e.clientX, startY: e.clientY, origX: hit.x, origY: hit.y };
    screenCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  screenCanvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = drag;
    const layer = state.doc.layers.find((l) => l.id === d.id);
    if (!layer) return;
    const rect = screenCanvas.getBoundingClientRect();
    const scaleX = state.doc.width / rect.width;
    const scaleY = state.doc.height / rect.height;
    const clampX = (v: number) => Math.max(-state.doc.width / 2, Math.min(1.5 * state.doc.width, Math.round(v)));
    const clampY = (v: number) => Math.max(-state.doc.height / 2, Math.min(1.5 * state.doc.height, Math.round(v)));
    layer.x = clampX(d.origX + (e.clientX - d.startX) * scaleX);
    layer.y = clampY(d.origY + (e.clientY - d.startY) * scaleY);
    notify('layerProps', 'composite');
  });

  const endDrag = () => {
    if (drag) {
      const d = drag;
      const layer = state.doc.layers.find((l) => l.id === d.id);
      if (layer && (layer.x !== d.origX || layer.y !== d.origY)) {
        const finalX = layer.x;
        const finalY = layer.y;
        const startX = d.origX;
        const startY = d.origY;
        history.push({
          label: 'Move layer',
          do: () => {
            const l = state.doc.layers.find((ll) => ll.id === d.id);
            if (l) { l.x = finalX; l.y = finalY; notify('layerProps', 'composite'); }
          },
          undo: () => {
            const l = state.doc.layers.find((ll) => ll.id === d.id);
            if (l) { l.x = startX; l.y = startY; notify('layerProps', 'composite'); }
          }
        });
      }
    }
    drag = null;
  };
  screenCanvas.addEventListener('pointerup', endDrag);
  screenCanvas.addEventListener('pointercancel', endDrag);

  // --- Zoom & pan ---
  $('zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
  $('zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
  $('zoom-readout').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; applyZoom(); });

  const container = $('canvas-container');
  container.addEventListener('wheel', (e) => {
    const wheelEvent = e as WheelEvent;
    if (!wheelEvent.ctrlKey) return;
    wheelEvent.preventDefault();
    const rect = container.getBoundingClientRect();
    const cx = wheelEvent.clientX - rect.left - rect.width / 2 - panX;
    const cy = wheelEvent.clientY - rect.top - rect.height / 2 - panY;
    setZoom(zoom * (wheelEvent.deltaY < 0 ? 1.1 : 0.9), cx, cy);
  }, { passive: false });

  // Pan by dragging empty container space when zoomed in
  let pan: { startX: number; startY: number; origX: number; origY: number } | null = null;
  container.addEventListener('pointerdown', (e) => {
    const pointerEvent = e as PointerEvent;
    if (zoom <= 1 || (pointerEvent.target !== container && pointerEvent.target !== zoomWrap)) return;
    pan = { startX: pointerEvent.clientX, startY: pointerEvent.clientY, origX: panX, origY: panY };
    container.setPointerCapture(pointerEvent.pointerId);
  });
  container.addEventListener('pointermove', (e) => {
    if (!pan) return;
    const pointerEvent = e as PointerEvent;
    panX = pan.origX + (pointerEvent.clientX - pan.startX);
    panY = pan.origY + (pointerEvent.clientY - pan.startY);
    applyZoom();
  });
  container.addEventListener('pointerup', () => { pan = null; });
  applyZoom();
}
