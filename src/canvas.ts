import { state, subscribe, notify, getFilterString } from './state';
import { $ } from './dom';

const viewport = $('canvas-viewport');

export function applyCanvasDimensions(): void {
  const canvasRatioSelect = $('canvas-ratio') as HTMLSelectElement;
  const customDimsRow = $('custom-dims-row');
  const canvasWidthInput = $('canvas-width') as HTMLInputElement;
  const canvasHeightInput = $('canvas-height') as HTMLInputElement;

  const ratio = canvasRatioSelect.value;
  state.canvasRatio = ratio;

  if (ratio === 'custom') {
    customDimsRow.style.display = 'flex';
    state.canvasWidth = parseInt(canvasWidthInput.value, 10) || 1024;
    state.canvasHeight = parseInt(canvasHeightInput.value, 10) || 1024;
  } else {
    customDimsRow.style.display = 'none';
    if (ratio === '1:1') {
      state.canvasWidth = 1024;
      state.canvasHeight = 1024;
    } else if (ratio === '16:9') {
      state.canvasWidth = 1920;
      state.canvasHeight = 1080;
    } else if (ratio === '9:16') {
      state.canvasWidth = 1080;
      state.canvasHeight = 1920;
    } else if (ratio === '4:5') {
      state.canvasWidth = 1080;
      state.canvasHeight = 1350;
    }
  }
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
  });
}

export function initCanvas(): void {
  // --- Canvas Dimension & Presets ---
  const canvasRatioSelect = $('canvas-ratio') as HTMLSelectElement;
  const canvasWidthInput = $('canvas-width') as HTMLInputElement;
  const canvasHeightInput = $('canvas-height') as HTMLInputElement;

  canvasRatioSelect.addEventListener('change', () => notify('canvasConfig'));
  canvasWidthInput.addEventListener('input', () => notify('canvasConfig'));
  canvasHeightInput.addEventListener('input', () => notify('canvasConfig'));

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
}
