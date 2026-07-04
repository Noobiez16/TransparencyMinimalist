import { state, subscribe, notify, getFilterString } from './state';
import { $ } from './dom';

const viewport = $('canvas-viewport');

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
  viewport.style.aspectRatio = `${state.canvasWidth}/${state.canvasHeight}`;
  if (state.canvasWidth >= state.canvasHeight) {
    viewport.style.width = '100%';
    viewport.style.height = 'auto';
  } else {
    viewport.style.width = 'auto';
    viewport.style.height = '100%';
  }
}

function renderViewport(): void {
  // Get active visible layers in reversed order (bottom to top)
  const activeVisibleLayers = [...state.layers].reverse().filter(l => l.visible);
  const activeIds = new Set(activeVisibleLayers.map(l => l.id));

  // Remove any elements that are no longer active or visible
  Array.from(viewport.children).forEach((child) => {
    const el = child as HTMLElement;
    if (!activeIds.has(el.dataset.id || '')) {
      viewport.removeChild(el);
    }
  });

  // Render/update elements in correct order
  activeVisibleLayers.forEach((layer) => {
    let el = viewport.querySelector(`[data-id="${layer.id}"]`) as HTMLElement | null;

    if (!el) {
      if (layer.type === 'image') {
        const img = document.createElement('img');
        img.className = 'layer-preview-el';
        img.dataset.id = layer.id;
        el = img;
      } else {
        const div = document.createElement('div');
        div.className = 'layer-preview-el';
        div.dataset.id = layer.id;
        el = div;
      }
      viewport.appendChild(el);
    } else {
      // Re-append to maintain correct Z-order (bottom to top)
      viewport.appendChild(el);
    }

    // Update properties in-place
    if (layer.type === 'image') {
      const img = el as HTMLImageElement;
      if (img.src !== (layer.imageSrc || '')) {
        img.src = layer.imageSrc || '';
      }
      img.style.display = layer.imageSrc ? 'block' : 'none';
      img.style.filter = getFilterString(layer);
    } else {
      const div = el as HTMLDivElement;
      if (div.textContent !== layer.textContent) {
        div.textContent = layer.textContent;
      }
      div.style.fontFamily = layer.fontFamily;
      div.style.fontSize = `${layer.fontSize}px`;
      div.style.color = layer.textColor;
      div.style.filter = getFilterString(layer);
    }

    el.style.opacity = (layer.opacity / 100).toString();
    el.style.mixBlendMode = layer.blendMode;
    el.style.transform = `translate(${layer.xOffset}%, ${layer.yOffset}%) scale(${layer.scale / 100})`;
    el.classList.toggle('canvas-selected', layer.id === state.activeLayerId);
  });
}

export function initCanvas(): void {
  // --- Canvas Background theme & Custom Color selection ---
  document.querySelectorAll('.btn-theme').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const bg = target.dataset.bg as 'transparent' | 'white' | 'black' | 'custom';

      document.querySelectorAll('.btn-theme').forEach(b => b.classList.remove('active'));
      target.classList.add('active');

      state.canvasBgType = bg;
      const colorPicker = $<HTMLInputElement>('bg-color-picker');

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
        viewport.style.backgroundColor = colorPicker.value;
      }
    });
  });

  $('bg-color-picker').addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    state.canvasBgColor = val;
    if (state.canvasBgType === 'custom') {
      viewport.style.backgroundColor = val;
    }
  });

  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) applyCanvasDimensions();
    if (dirty.has('structure') || dirty.has('selection') || dirty.has('layerProps')) renderViewport();
  });
  applyCanvasDimensions();

  // --- Click-select and drag-move ---
  let drag: { id: string; startX: number; startY: number; origX: number; origY: number } | null = null;

  viewport.addEventListener('pointerdown', (e) => {
    const target = (e.target as HTMLElement).closest('.layer-preview-el') as HTMLElement | null;
    if (!target || !target.dataset.id) {
      state.activeLayerId = null;
      notify('selection');
      return;
    }
    const layer = state.layers.find((l) => l.id === target.dataset.id);
    if (!layer) return;
    if (state.activeLayerId !== layer.id) {
      state.activeLayerId = layer.id;
      notify('selection');
    }
    drag = { id: layer.id, startX: e.clientX, startY: e.clientY, origX: layer.xOffset, origY: layer.yOffset };
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = drag;
    const layer = state.layers.find((l) => l.id === d.id);
    if (!layer) return;
    const rect = viewport.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));
    layer.xOffset = clamp(d.origX + ((e.clientX - d.startX) / rect.width) * 100);
    layer.yOffset = clamp(d.origY + ((e.clientY - d.startY) / rect.height) * 100);
    notify('layerProps');
  });

  const endDrag = () => { drag = null; };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

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
