import { state, subscribe, notify } from './state';
import { composite } from './engine/compositor';
import { $ } from './dom';
import * as history from './engine/history';
import { cmdPatchDoc } from './engine/commands';
import { createToolPointerRouter, getActiveTool, onToolChange } from './engine/tools';

const viewport = $('canvas-viewport');
const screenCanvas = $('doc-canvas') as unknown as HTMLCanvasElement;
const screenCtx = screenCanvas.getContext('2d')!;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

let zoom = 1, panX = 0, panY = 0;
const zoomWrap = $('zoom-wrap');
const container = $('canvas-container');
const pointerRouter = createToolPointerRouter(getActiveTool);

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
  // Button steps accumulate float error (1 ± ε reads as 100%): snap within an
  // epsilon so returning to 100% always recenters.
  if (Math.abs(zoom - 1) < 1e-6) { zoom = 1; panX = 0; panY = 0; }
  applyZoom();
}

export function panBy(dx: number, dy: number): void { panX += dx; panY += dy; applyZoom(); }
export function zoomAt(factor: number, clientX?: number, clientY?: number): void {
  if (clientX === undefined || clientY === undefined) { setZoom(zoom * factor); return; }
  const rect = container.getBoundingClientRect();
  const cx = clientX - rect.left - rect.width / 2 - panX;
  const cy = clientY - rect.top - rect.height / 2 - panY;
  setZoom(zoom * factor, cx, cy);
}
export function resetView(): void { zoom = 1; panX = 0; panY = 0; applyZoom(); }
export function getZoomPercent(): number { return Math.round(zoom * 100); }
export function getOverlayScale(): number {
  const rect = screenCanvas.getBoundingClientRect();
  return rect.width > 0 ? rect.width / state.doc.width : 1;
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
  composite(state.doc, screenCtx, { overlay: true, overlayScale: getOverlayScale() });
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
  // [hidden] carries !important in style.css — toggle the attribute, never inline display.
  colorPicker.hidden = bg !== 'custom';

  if (bg === 'transparent') {
    viewport.classList.add('checkerboard-bg');
  } else if (bg === 'white') {
    viewport.style.backgroundColor = '#ffffff';
  } else if (bg === 'black') {
    viewport.style.backgroundColor = '#000000';
  } else if (bg === 'custom') {
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

  // --- Pointer routing to the active tool ---
  screenCanvas.addEventListener('pointerdown', (e) => {
    screenCanvas.setPointerCapture(e.pointerId);
    pointerRouter.onDown(screenToDoc(e), e);
  });
  screenCanvas.addEventListener('pointermove', (e) => pointerRouter.onMove(screenToDoc(e), e));
  screenCanvas.addEventListener('pointerup', (e) => pointerRouter.onUp(screenToDoc(e), e));
  const cancelPointer = (e: PointerEvent) => {
    pointerRouter.onCancel(screenToDoc(e), e);
  };
  screenCanvas.addEventListener('pointercancel', cancelPointer);
  screenCanvas.addEventListener('lostpointercapture', cancelPointer);
  onToolChange((tool) => {
    screenCanvas.style.cursor = tool.cursor;
  });
  screenCanvas.style.cursor = getActiveTool().cursor;

  // --- Zoom & pan ---
  $('zoom-in').addEventListener('click', () => zoomAt(1 + 0.1 / zoom));
  $('zoom-out').addEventListener('click', () => zoomAt(1 - 0.1 / zoom));
  $('zoom-readout').addEventListener('click', () => resetView());

  container.addEventListener('wheel', (e) => {
    const wheelEvent = e as WheelEvent;
    if (!wheelEvent.ctrlKey) return;
    wheelEvent.preventDefault();
    zoomAt(wheelEvent.deltaY < 0 ? 1.1 : 0.9, wheelEvent.clientX, wheelEvent.clientY);
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
