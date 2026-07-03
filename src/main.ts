interface LayerState {
  id: string;
  name: string;
  type: 'image' | 'text';
  visible: boolean;
  opacity: number;
  blendMode: string;
  xOffset: number;
  yOffset: number;
  scale: number;
  // Image Layer
  imageSrc: string | null;
  imageName: string | null;
  blur: number;
  contrast: number;
  saturation: number;
  brightness: number;
  invert: boolean;
  // Text Layer
  textContent: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

interface AppState {
  layers: LayerState[];
  activeLayerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  canvasRatio: string;
  canvasBgType: 'transparent' | 'white' | 'black' | 'custom';
  canvasBgColor: string;
}

const state: AppState = {
  layers: [],
  activeLayerId: null,
  canvasWidth: 1024,
  canvasHeight: 1024,
  canvasRatio: '1:1',
  canvasBgType: 'transparent',
  canvasBgColor: '#ffffff'
};

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
};

// --- Layer Management ---
let layerCounter = 0;

function createNewLayer(type: 'image' | 'text'): LayerState {
  layerCounter++;
  const id = `layer_${Date.now()}_${layerCounter}`;
  return {
    id,
    name: `${type === 'image' ? 'Image' : 'Text'} Layer ${layerCounter}`,
    type,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    xOffset: 0,
    yOffset: 0,
    scale: 100,
    imageSrc: null,
    imageName: null,
    blur: 0,
    contrast: 100,
    saturation: 100,
    brightness: 100,
    invert: false,
    textContent: 'Double click properties to edit text',
    fontFamily: 'Inter',
    fontSize: 32,
    textColor: '#000000'
  };
}

$('btn-add-image').addEventListener('click', () => {
  const layer = createNewLayer('image');
  state.layers.unshift(layer); // Add on top of stack
  state.activeLayerId = layer.id;
  updateUI();
});

$('btn-add-text').addEventListener('click', () => {
  const layer = createNewLayer('text');
  state.layers.unshift(layer);
  state.activeLayerId = layer.id;
  updateUI();
});

// --- Canvas Dimension & Presets ---
const canvasRatioSelect = $('canvas-ratio') as HTMLSelectElement;
const customDimsRow = $('custom-dims-row');
const canvasWidthInput = $('canvas-width') as HTMLInputElement;
const canvasHeightInput = $('canvas-height') as HTMLInputElement;
const viewport = $('canvas-viewport');

function updateCanvasDimensions() {
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
}

canvasRatioSelect.addEventListener('change', updateCanvasDimensions);
canvasWidthInput.addEventListener('input', updateCanvasDimensions);
canvasHeightInput.addEventListener('input', updateCanvasDimensions);

// --- Drag and Drop Stub ---
function bindDragAndDropEvents(_card: HTMLElement) {
  // Stub for Task 5
}

// --- UI Rendering & Sync ---
const layersListContainer = $('layers-list-container');
const propertiesEditorContainer = $('properties-editor-container');
const noActiveWarning = $('no-active-warning');

const propNameInput = $('prop-name') as HTMLInputElement;
const propOpacityRange = $('prop-opacity') as HTMLInputElement;
const propOpacityNum = $('prop-opacity-num') as HTMLInputElement;
const propBlendSelect = $('prop-blend') as HTMLSelectElement;
const propXOffset = $('prop-x-offset') as HTMLInputElement;
const propYOffset = $('prop-y-offset') as HTMLInputElement;
const propScale = $('prop-scale') as HTMLInputElement;

const propBlur = $('prop-blur') as HTMLInputElement;
const propContrast = $('prop-contrast') as HTMLInputElement;
const propSaturation = $('prop-saturation') as HTMLInputElement;
const propBrightness = $('prop-brightness') as HTMLInputElement;
const propInvert = $('prop-invert') as HTMLInputElement;

const sectionTextProps = $('section-text-properties');
const propTextContent = $('prop-text-content') as HTMLTextAreaElement;
const propFontFamily = $('prop-font-family') as HTMLSelectElement;
const propFontSize = $('prop-font-size') as HTMLInputElement;
const propTextColor = $('prop-text-color') as HTMLInputElement;

function getActiveLayer(): LayerState | undefined {
  return state.layers.find(l => l.id === state.activeLayerId);
}

function syncPropertiesPanel() {
  const layer = getActiveLayer();
  if (!layer) return;

  if (document.activeElement !== propNameInput) {
    propNameInput.value = layer.name;
  }
  if (document.activeElement !== propOpacityRange) {
    propOpacityRange.value = layer.opacity.toString();
  }
  if (document.activeElement !== propOpacityNum) {
    propOpacityNum.value = layer.opacity.toString();
  }
  if (document.activeElement !== propBlendSelect) {
    propBlendSelect.value = layer.blendMode;
  }
  if (document.activeElement !== propXOffset) {
    propXOffset.value = layer.xOffset.toString();
  }
  $('x-offset-value').textContent = `${layer.xOffset}%`;
  if (document.activeElement !== propYOffset) {
    propYOffset.value = layer.yOffset.toString();
  }
  $('y-offset-value').textContent = `${layer.yOffset}%`;
  if (document.activeElement !== propScale) {
    propScale.value = layer.scale.toString();
  }
  $('scale-value').textContent = `${layer.scale}%`;

  if (document.activeElement !== propBlur) {
    propBlur.value = layer.blur.toString();
  }
  $('blur-value').textContent = `${layer.blur}px`;
  if (document.activeElement !== propContrast) {
    propContrast.value = layer.contrast.toString();
  }
  $('contrast-value').textContent = `${layer.contrast}%`;
  if (document.activeElement !== propSaturation) {
    propSaturation.value = layer.saturation.toString();
  }
  $('saturation-value').textContent = `${layer.saturation}%`;
  if (document.activeElement !== propBrightness) {
    propBrightness.value = layer.brightness.toString();
  }
  $('brightness-value').textContent = `${layer.brightness}%`;
  propInvert.checked = layer.invert;

  // Toggle filter rows based on type
  if (layer.type === 'image') {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = 'flex';
    });
    sectionTextProps.style.display = 'none';
  } else {
    document.querySelectorAll('.filter-image-only').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
    sectionTextProps.style.display = 'block';
    
    if (document.activeElement !== propTextContent) {
      propTextContent.value = layer.textContent;
    }
    if (document.activeElement !== propFontFamily) {
      propFontFamily.value = layer.fontFamily;
    }
    if (document.activeElement !== propFontSize) {
      propFontSize.value = layer.fontSize.toString();
    }
    $('font-size-value').textContent = `${layer.fontSize}px`;
    if (document.activeElement !== propTextColor) {
      propTextColor.value = layer.textColor;
    }
  }
}

function updateUI() {
  // 1. Build Layers List
  layersListContainer.innerHTML = '';
  
  state.layers.forEach((layer) => {
    const card = document.createElement('div');
    card.className = `layer-card ${state.activeLayerId === layer.id ? 'active' : ''}`;
    card.setAttribute('draggable', 'true');
    card.dataset.id = layer.id;

    card.innerHTML = `
      <div class="layer-card-left">
        <span class="icon-drag">☰</span>
        <div class="layer-thumbnail">
          ${layer.type === 'image' && layer.imageSrc ? `<img src="${layer.imageSrc}">` : layer.type === 'image' ? 'IMG' : 'TXT'}
        </div>
        <span class="layer-name-label">${layer.name}</span>
      </div>
      <div class="layer-card-actions">
        <span class="btn-layer-vis">${layer.visible ? '👁' : '❌'}</span>
        <span class="btn-layer-del">✕</span>
      </div>
    `;

    // Card selection listener
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('btn-layer-vis')) {
        layer.visible = !layer.visible;
        updateUI();
        return;
      }
      if (target.classList.contains('btn-layer-del')) {
        state.layers = state.layers.filter(l => l.id !== layer.id);
        if (state.activeLayerId === layer.id) {
          state.activeLayerId = state.layers[0]?.id || null;
        }
        updateUI();
        return;
      }
      state.activeLayerId = layer.id;
      updateUI();
    });

    // Z-index drag event triggers
    bindDragAndDropEvents(card);
    layersListContainer.appendChild(card);
  });

  // 2. Render Canvas Viewport Layers
  viewport.innerHTML = '';
  
  // Draw layers from bottom to top (reversed array)
  [...state.layers].reverse().forEach((layer) => {
    if (!layer.visible) return;
    
    let el: HTMLElement;
    if (layer.type === 'image') {
      const img = document.createElement('img');
      img.src = layer.imageSrc || '';
      img.style.display = layer.imageSrc ? 'block' : 'none';
      el = img;
    } else {
      const div = document.createElement('div');
      div.textContent = layer.textContent;
      el = div;
    }
    
    el.className = 'layer-preview-el';
    
    // Styling offsets, scale, mix blends, and filters
    el.style.opacity = (layer.opacity / 100).toString();
    el.style.mixBlendMode = layer.blendMode;
    el.style.transform = `translate(${layer.xOffset}%, ${layer.yOffset}%) scale(${layer.scale / 100})`;
    
    if (layer.type === 'image') {
      el.style.filter = `
        blur(${layer.blur}px)
        contrast(${layer.contrast}%)
        saturate(${layer.saturation}%)
        brightness(${layer.brightness}%)
        ${layer.invert ? 'invert(1)' : ''}
      `.replace(/\s+/g, ' ').trim();
    } else {
      el.style.fontFamily = layer.fontFamily;
      el.style.fontSize = `${layer.fontSize}px`;
      el.style.color = layer.textColor;
      el.style.filter = `blur(${layer.blur}px) ${layer.invert ? 'invert(1)' : ''}`;
    }

    viewport.appendChild(el);
  });

  // 3. Properties Panel Visibility
  if (state.activeLayerId) {
    propertiesEditorContainer.style.display = 'block';
    noActiveWarning.style.display = 'none';
    syncPropertiesPanel();
  } else {
    propertiesEditorContainer.style.display = 'none';
    noActiveWarning.style.display = 'block';
  }
}

// --- Active Layer Change Listeners ---
propNameInput.addEventListener('input', () => {
  const layer = getActiveLayer();
  if (layer) {
    layer.name = propNameInput.value;
    updateUI();
  }
});

const bindRangeInput = (input: HTMLInputElement, stateKey: keyof LayerState, labelId?: string, suffix: string = '') => {
  input.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      (layer as any)[stateKey] = parseInt(input.value, 10);
      if (labelId) $(labelId).textContent = `${input.value}${suffix}`;
      updateUI();
    }
  });
};

bindRangeInput(propOpacityRange, 'opacity');
propOpacityRange.addEventListener('input', () => {
  propOpacityNum.value = propOpacityRange.value;
});

propOpacityNum.addEventListener('input', () => {
  const layer = getActiveLayer();
  if (layer) {
    let val = parseInt(propOpacityNum.value, 10);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 100) val = 100;
    layer.opacity = val;
    propOpacityRange.value = val.toString();
    updateUI();
  }
});

propBlendSelect.addEventListener('change', () => {
  const layer = getActiveLayer();
  if (layer) {
    layer.blendMode = propBlendSelect.value;
    updateUI();
  }
});

bindRangeInput(propXOffset, 'xOffset', 'x-offset-value', '%');
bindRangeInput(propYOffset, 'yOffset', 'y-offset-value', '%');
bindRangeInput(propScale, 'scale', 'scale-value', '%');
bindRangeInput(propBlur, 'blur', 'blur-value', 'px');
bindRangeInput(propContrast, 'contrast', 'contrast-value', '%');
bindRangeInput(propSaturation, 'saturation', 'saturation-value', '%');
bindRangeInput(propBrightness, 'brightness', 'brightness-value', '%');

propInvert.addEventListener('change', () => {
  const layer = getActiveLayer();
  if (layer) {
    layer.invert = propInvert.checked;
    updateUI();
  }
});

// Text layer change listeners
propTextContent.addEventListener('input', () => {
  const layer = getActiveLayer();
  if (layer && layer.type === 'text') {
    layer.textContent = propTextContent.value;
    updateUI();
  }
});

propFontFamily.addEventListener('change', () => {
  const layer = getActiveLayer();
  if (layer && layer.type === 'text') {
    layer.fontFamily = propFontFamily.value;
    updateUI();
  }
});

bindRangeInput(propFontSize, 'fontSize', 'font-size-value', 'px');

propTextColor.addEventListener('input', () => {
  const layer = getActiveLayer();
  if (layer && layer.type === 'text') {
    layer.textColor = propTextColor.value;
    updateUI();
  }
});

// Initialize canvas presets and UI
updateCanvasDimensions();
updateUI();
