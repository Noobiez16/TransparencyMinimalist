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
      alert('Failed to read file.');
    };
    reader.readAsDataURL(file);
  });
}


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
  if (state.canvasWidth >= state.canvasHeight) {
    viewport.style.width = '100%';
    viewport.style.height = 'auto';
  } else {
    viewport.style.width = 'auto';
    viewport.style.height = '100%';
  }
}

canvasRatioSelect.addEventListener('change', updateCanvasDimensions);
canvasWidthInput.addEventListener('input', updateCanvasDimensions);
canvasHeightInput.addEventListener('input', updateCanvasDimensions);

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
      img.style.filter = `
        blur(${layer.blur}px)
        contrast(${layer.contrast}%)
        saturate(${layer.saturation}%)
        brightness(${layer.brightness}%)
        ${layer.invert ? 'invert(1)' : ''}
      `.replace(/\s+/g, ' ').trim();
    } else {
      const div = el as HTMLDivElement;
      if (div.textContent !== layer.textContent) {
        div.textContent = layer.textContent;
      }
      div.style.fontFamily = layer.fontFamily;
      div.style.fontSize = `${layer.fontSize}px`;
      div.style.color = layer.textColor;
      div.style.filter = `blur(${layer.blur}px) ${layer.invert ? 'invert(1)' : ''}`;
    }

    el.style.opacity = (layer.opacity / 100).toString();
    el.style.mixBlendMode = layer.blendMode;
    el.style.transform = `translate(${layer.xOffset}%, ${layer.yOffset}%) scale(${layer.scale / 100})`;
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
      alert('Failed to read pasted image.');
    };
    reader.readAsDataURL(targetFile);
  }
});

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

function mapBlendModeToCompositeOp(blend: string): GlobalCompositeOperation {
  switch (blend) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'overlay': return 'overlay';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    default: return 'source-over';
  }
}

// Helper to draw image using cover cropping bounds (mimicking CSS object-fit: cover)
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = w / h;
  let sx = 0, sy = 0, sWidth = img.naturalWidth, sHeight = img.naturalHeight;

  if (imgRatio > targetRatio) {
    sWidth = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sWidth) / 2;
  } else {
    sHeight = img.naturalWidth / targetRatio;
    sy = (img.naturalHeight - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, -w / 2, -h / 2, w, h);
}

$('btn-export').addEventListener('click', () => {
  if (state.layers.length === 0) {
    alert('Add at least one layer to export.');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = state.canvasWidth;
  canvas.height = state.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Draw background
  if (state.canvasBgType === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.canvasBgType === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.canvasBgType === 'custom') {
    ctx.fillStyle = state.canvasBgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Scale multiplier for physical blur scaling
  const scaleFactor = canvas.width / 500;

  // Compile layers from bottom to top (reversed layers array)
  const renderPromises = [...state.layers].reverse().map((layer) => {
    return new Promise<void>((resolve) => {
      if (!layer.visible) {
        resolve();
        return;
      }

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = mapBlendModeToCompositeOp(layer.blendMode);

      // Apply transformations
      const dx = (layer.xOffset / 100) * canvas.width;
      const dy = (layer.yOffset / 100) * canvas.height;
      ctx.translate(canvas.width / 2 + dx, canvas.height / 2 + dy);
      ctx.scale(layer.scale / 100, layer.scale / 100);

      // Apply filters
      if (layer.type === 'image') {
        ctx.filter = `
          blur(${layer.blur * scaleFactor}px)
          contrast(${layer.contrast}%)
          saturate(${layer.saturation}%)
          brightness(${layer.brightness}%)
          ${layer.invert ? 'invert(1)' : ''}
        `.replace(/\s+/g, ' ').trim();
      } else {
        ctx.filter = `
          blur(${layer.blur * scaleFactor}px)
          ${layer.invert ? 'invert(1)' : ''}
        `.replace(/\s+/g, ' ').trim();
      }

      if (layer.type === 'image' && layer.imageSrc) {
        const img = new Image();
        img.onload = () => {
          // Draw image cropped-to-fit centered
          drawCoverImage(ctx, img, canvas.width, canvas.height);
          ctx.restore();
          resolve();
        };
        img.onerror = () => {
          ctx.restore();
          resolve();
        };
        img.src = layer.imageSrc;
      } else if (layer.type === 'text') {
        // Draw scaled text line-by-line to support multi-line newlines
        const scaledFontSize = Math.round(layer.fontSize * (canvas.width / 500));
        ctx.font = `${scaledFontSize}px ${layer.fontFamily}`;
        ctx.fillStyle = layer.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = layer.textContent.split('\n');
        const lineHeight = scaledFontSize * 1.2;
        const totalHeight = (lines.length - 1) * lineHeight;
        const startingY = -totalHeight / 2;

        lines.forEach((line, index) => {
          ctx.fillText(line, 0, startingY + index * lineHeight);
        });

        ctx.restore();
        resolve();
      } else {
        ctx.restore();
        resolve();
      }
    });
  });

  Promise.all(renderPromises).then(() => {
    // Trigger download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `composition_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  });
});

// Seed two default layers on startup
const defaultImageLayer = createNewLayer('image');
defaultImageLayer.name = "Background Image";
state.layers.push(defaultImageLayer);

const defaultTextLayer = createNewLayer('text');
defaultTextLayer.name = "Text Overlay";
defaultTextLayer.textContent = "Minimalist Editor";
defaultTextLayer.yOffset = -10; // offset slightly
state.layers.push(defaultTextLayer);

state.activeLayerId = defaultTextLayer.id;

// Initialize canvas presets and UI
updateCanvasDimensions();
updateUI();
