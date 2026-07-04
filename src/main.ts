import { state, createNewLayer, getActiveLayer, type LayerState, notify } from './state';
import { $ } from './dom';
import { toast } from './toast';
import { initExport } from './export';
import { initCanvas } from './canvas';

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

// --- File Upload & Drag-and-Drop ---
const uploadZone = $('upload-zone');
const fileInput = $('file-input') as HTMLInputElement;

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleUploadedFiles(files);
  }
});

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length > 0) {
    handleUploadedFiles(files);
  }
});

function handleUploadedFiles(files: FileList) {
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      // If an Image layer is selected and has no image, load into it
      const layer = getActiveLayer();
      if (layer && layer.type === 'image' && !layer.imageSrc) {
        layer.imageSrc = dataUrl;
        layer.imageName = file.name;
      } else {
        // Otherwise, create a new image layer
        const newLayer = createNewLayer('image');
        newLayer.imageSrc = dataUrl;
        newLayer.imageName = file.name;
        state.layers.unshift(newLayer);
        state.activeLayerId = newLayer.id;
      }
      updateUI();
    };
    reader.onerror = () => {
      toast('Failed to read file.');
    };
    reader.readAsDataURL(file);
  });
}


let draggedId: string | null = null;

function bindDragAndDropEvents(card: HTMLElement) {
  card.addEventListener('dragstart', (e) => {
    draggedId = card.dataset.id || null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetId = card.dataset.id;
    if (!draggedId || !targetId || draggedId === targetId) return;

    const draggedIndex = state.layers.findIndex(l => l.id === draggedId);
    const targetIndex = state.layers.findIndex(l => l.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = state.layers.splice(draggedIndex, 1);
      state.layers.splice(targetIndex, 0, removed);
      updateUI();
    }
    draggedId = null;
  });

  card.addEventListener('dragend', () => {
    draggedId = null;
  });
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

let lastSyncedLayerId: string | null = null;

function syncPropertiesPanel() {
  const layer = getActiveLayer();
  if (!layer) return;

  const isLayerSwitched = lastSyncedLayerId !== layer.id;
  lastSyncedLayerId = layer.id;

  const syncVal = (inputEl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, val: string) => {
    if (isLayerSwitched || document.activeElement !== inputEl) {
      inputEl.value = val;
    }
  };

  syncVal(propNameInput, layer.name);
  syncVal(propOpacityRange, layer.opacity.toString());
  syncVal(propOpacityNum, layer.opacity.toString());
  syncVal(propBlendSelect, layer.blendMode);
  syncVal(propXOffset, layer.xOffset.toString());
  $('x-offset-value').textContent = `${layer.xOffset}%`;
  syncVal(propYOffset, layer.yOffset.toString());
  $('y-offset-value').textContent = `${layer.yOffset}%`;
  syncVal(propScale, layer.scale.toString());
  $('scale-value').textContent = `${layer.scale}%`;

  syncVal(propBlur, layer.blur.toString());
  $('blur-value').textContent = `${layer.blur}px`;
  syncVal(propContrast, layer.contrast.toString());
  $('contrast-value').textContent = `${layer.contrast}%`;
  syncVal(propSaturation, layer.saturation.toString());
  $('saturation-value').textContent = `${layer.saturation}%`;
  syncVal(propBrightness, layer.brightness.toString());
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
    
    syncVal(propTextContent, layer.textContent);
    syncVal(propFontFamily, layer.fontFamily);
    syncVal(propFontSize, layer.fontSize.toString());
    $('font-size-value').textContent = `${layer.fontSize}px`;
    syncVal(propTextColor, layer.textColor);
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

  // 2. Properties Panel Visibility
  if (state.activeLayerId) {
    propertiesEditorContainer.style.display = 'block';
    noActiveWarning.style.display = 'none';
    syncPropertiesPanel();
  } else {
    propertiesEditorContainer.style.display = 'none';
    noActiveWarning.style.display = 'block';
  }

  notify('layerProps');
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

// Clipboard Paste Support (Ctrl+V)
document.addEventListener('paste', (e) => {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }

  const clipboardData = e.clipboardData;
  if (!clipboardData) return;

  const items = clipboardData.items;
  const fileList: File[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) fileList.push(file);
    }
  }

  if (fileList.length > 0) {
    const targetFile = fileList[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const layer = getActiveLayer();
      
      if (layer && layer.type === 'image' && !layer.imageSrc) {
        layer.imageSrc = dataUrl;
        layer.imageName = `pasted_image_${Date.now()}.png`;
      } else {
        const newLayer = createNewLayer('image');
        newLayer.imageSrc = dataUrl;
        newLayer.imageName = `pasted_image_${Date.now()}.png`;
        state.layers.unshift(newLayer);
        state.activeLayerId = newLayer.id;
      }
      updateUI();
    };
    reader.onerror = () => {
      toast('Failed to read pasted image.');
    };
    reader.readAsDataURL(targetFile);
  }
});

initCanvas();
initExport();

// Seed two default layers on startup
const defaultTextLayer = createNewLayer('text');
defaultTextLayer.name = "Text Overlay";
defaultTextLayer.textContent = "Minimalist Editor";
defaultTextLayer.yOffset = -10; // offset slightly
state.layers.push(defaultTextLayer);

const defaultImageLayer = createNewLayer('image');
defaultImageLayer.name = "Background Image";
state.layers.push(defaultImageLayer);

state.activeLayerId = defaultTextLayer.id;

// Initialize canvas presets and UI
notify('canvasConfig');
updateUI();
