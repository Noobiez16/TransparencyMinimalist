interface HiddenEffects {
  blendMode: 'normal' | 'multiply' | 'screen';
  blur: number;
  contrast: number;
  saturation: number;
  brightness: number;
  invert: boolean;
}

interface AppState {
  mainImage: string | null;
  hiddenImage: string | null;
  mainImageName: string | null;
  hiddenImageName: string | null;
  activeLayer: 'main' | 'hidden';
  mainOpacity: number;
  hiddenOpacity: number;
  mainVisible: boolean;
  hiddenVisible: boolean;
  hiddenEffects: HiddenEffects;
  exportRatio: '1:1' | '4:5';
  exportResolution: 1 | 2 | 3;
  theme: 'light' | 'dim' | 'dark';
}

const state: AppState = {
  mainImage: null,
  hiddenImage: null,
  mainImageName: null,
  hiddenImageName: null,
  activeLayer: 'main',
  mainOpacity: 100,
  hiddenOpacity: 4, // Default 4% for hidden image
  mainVisible: true,
  hiddenVisible: true,
  hiddenEffects: {
    blendMode: 'normal',
    blur: 0,
    contrast: 100,
    saturation: 100,
    brightness: 100,
    invert: false
  },
  exportRatio: '1:1',
  exportResolution: 2,
  theme: 'light'
};

// DOM Selection Helper
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
};

// Drag and Drop File Handlers & Caching
const uploadZone = $('upload-zone');
const fileInput = $('file-input') as HTMLInputElement;

const imgMain = $('layer-main') as HTMLImageElement;
const previewBoxMain = $('preview-box-main');
const fileInfoMain = $('file-info-main');

const imgHidden = $('layer-hidden') as HTMLImageElement;
const previewBoxHidden = $('preview-box-hidden');
const fileInfoHidden = $('file-info-hidden');

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
      if (!state.mainImage) {
        state.mainImage = dataUrl;
        state.mainImageName = file.name;
      } else {
        state.hiddenImage = dataUrl;
        state.hiddenImageName = file.name;
      }
      updateUI();
    };
    reader.readAsDataURL(file);
  });
}

function updateUI() {
  // Update main preview panel source
  if (state.mainImage) {
    imgMain.src = state.mainImage;
    imgMain.style.display = 'block';
    previewBoxMain.innerHTML = `<img src="${state.mainImage}" alt="Main Image">`;
    fileInfoMain.textContent = state.mainImageName || 'image_main.png';
  } else {
    imgMain.style.display = 'none';
    previewBoxMain.innerHTML = `<span class="placeholder">No Image</span>`;
    fileInfoMain.textContent = 'No file selected';
  }

  // Update hidden preview panel source
  if (state.hiddenImage) {
    imgHidden.src = state.hiddenImage;
    imgHidden.style.display = 'block';
    previewBoxHidden.innerHTML = `<img src="${state.hiddenImage}" alt="Hidden Image">`;
    fileInfoHidden.textContent = state.hiddenImageName || 'image_hidden.png';
  } else {
    imgHidden.style.display = 'none';
    previewBoxHidden.innerHTML = `<span class="placeholder">No Image</span>`;
    fileInfoHidden.textContent = 'No file selected';
  }

  applyEffectsToPreview();
}

// Swap Role Buttons
document.querySelectorAll('.btn-swap').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tempImg = state.mainImage;
    const tempName = state.mainImageName;

    state.mainImage = state.hiddenImage;
    state.mainImageName = state.hiddenImageName;

    state.hiddenImage = tempImg;
    state.hiddenImageName = tempName;

    updateUI();
  });
});

// Theme selection
document.querySelectorAll('.btn-theme').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget as HTMLButtonElement;
    const theme = target.dataset.theme as 'light' | 'dim' | 'dark';
    
    document.querySelectorAll('.btn-theme').forEach(b => b.classList.remove('active'));
    target.classList.add('active');

    state.theme = theme;
    
    const viewport = $('canvas-viewport');
    viewport.className = 'canvas-viewport';
    if (theme === 'dim') viewport.classList.add('theme-dim');
    if (theme === 'dark') viewport.classList.add('theme-dark');
  });
});

// Layer selection, opacity sync, and visibility toggles
const opacitySlider = $('opacity-slider') as HTMLInputElement;
const opacityNumber = $('opacity-number') as HTMLInputElement;

function updateActiveLayerControls() {
  const isMain = state.activeLayer === 'main';
  
  // Highlight active layer item card
  if (isMain) {
    $('layer-item-main').classList.add('active');
    $('layer-item-hidden').classList.remove('active');
    opacitySlider.value = state.mainOpacity.toString();
    opacityNumber.value = state.mainOpacity.toString();
    $('effects-section').classList.add('disabled');
  } else {
    $('layer-item-main').classList.remove('active');
    $('layer-item-hidden').classList.add('active');
    opacitySlider.value = state.hiddenOpacity.toString();
    opacityNumber.value = state.hiddenOpacity.toString();
    $('effects-section').classList.remove('disabled');
    syncEffectsUI();
  }
}

// Radio selection listeners
document.querySelectorAll('input[name="active-layer"]').forEach((input) => {
  input.addEventListener('change', (e) => {
    state.activeLayer = (e.target as HTMLInputElement).value as 'main' | 'hidden';
    updateActiveLayerControls();
  });
});

// Opacity change listeners
function setOpacity(val: number) {
  if (state.activeLayer === 'main') {
    state.mainOpacity = val;
  } else {
    state.hiddenOpacity = val;
  }
  applyEffectsToPreview();
}

opacitySlider.addEventListener('input', () => {
  opacityNumber.value = opacitySlider.value;
  setOpacity(parseInt(opacitySlider.value));
});

opacityNumber.addEventListener('input', () => {
  opacitySlider.value = opacityNumber.value;
  setOpacity(parseInt(opacityNumber.value));
});

// Visibility toggle icons
$('toggle-visibility-main').addEventListener('click', (e) => {
  state.mainVisible = !state.mainVisible;
  (e.target as HTMLElement).textContent = state.mainVisible ? '👁' : '❌';
  applyEffectsToPreview();
});

$('toggle-visibility-hidden').addEventListener('click', (e) => {
  state.hiddenVisible = !state.hiddenVisible;
  (e.target as HTMLElement).textContent = state.hiddenVisible ? '👁' : '❌';
  applyEffectsToPreview();
});

// Effects slider listeners and preview styling sync
const blendSelect = $('blend-mode') as HTMLSelectElement;
const blurSlider = $('blur-slider') as HTMLInputElement;
const contrastSlider = $('contrast-slider') as HTMLInputElement;
const saturationSlider = $('saturation-slider') as HTMLInputElement;
const brightnessSlider = $('brightness-slider') as HTMLInputElement;
const invertToggle = $('invert-toggle') as HTMLInputElement;

function syncEffectsUI() {
  blendSelect.value = state.hiddenEffects.blendMode;
  blurSlider.value = state.hiddenEffects.blur.toString();
  $('blur-value').textContent = `${state.hiddenEffects.blur}px`;
  contrastSlider.value = state.hiddenEffects.contrast.toString();
  $('contrast-value').textContent = `${state.hiddenEffects.contrast}%`;
  saturationSlider.value = state.hiddenEffects.saturation.toString();
  $('saturation-value').textContent = `${state.hiddenEffects.saturation}%`;
  brightnessSlider.value = state.hiddenEffects.brightness.toString();
  $('brightness-value').textContent = `${state.hiddenEffects.brightness}%`;
  invertToggle.checked = state.hiddenEffects.invert;
}

function bindEffect(slider: HTMLInputElement, valueElId: string, effectKey: keyof HiddenEffects, suffix: string = '') {
  slider.addEventListener('input', () => {
    const val = slider.value;
    $(valueElId).textContent = `${val}${suffix}`;
    if (typeof state.hiddenEffects[effectKey] === 'boolean') {
      (state.hiddenEffects as any)[effectKey] = slider.checked;
    } else {
      (state.hiddenEffects as any)[effectKey] = parseInt(val);
    }
    applyEffectsToPreview();
  });
}

blendSelect.addEventListener('change', () => {
  state.hiddenEffects.blendMode = blendSelect.value as 'normal' | 'multiply' | 'screen';
  applyEffectsToPreview();
});

invertToggle.addEventListener('change', () => {
  state.hiddenEffects.invert = invertToggle.checked;
  applyEffectsToPreview();
});

bindEffect(blurSlider, 'blur-value', 'blur', 'px');
bindEffect(contrastSlider, 'contrast-value', 'contrast', '%');
bindEffect(saturationSlider, 'saturation-value', 'saturation', '%');
bindEffect(brightnessSlider, 'brightness-value', 'brightness', '%');

// Export ratio and resolution selection listeners
const exportRatioSelect = $('export-ratio') as HTMLSelectElement;
const exportResolutionSlider = $('export-resolution') as HTMLInputElement;

exportRatioSelect.addEventListener('change', () => {
  state.exportRatio = exportRatioSelect.value as '1:1' | '4:5';
});

exportResolutionSlider.addEventListener('input', () => {
  state.exportResolution = parseInt(exportResolutionSlider.value) as 1 | 2 | 3;
});

function mapBlendModeToCompositeOp(blend: 'normal' | 'multiply' | 'screen'): GlobalCompositeOperation {
  switch (blend) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'normal':
    default: return 'source-over';
  }
}

const btnExport = $('btn-export');

btnExport.addEventListener('click', () => {
  if (!state.mainImage && !state.hiddenImage) {
    alert("Please upload at least one image first!");
    return;
  }

  // Determine dimensions based on resolution settings
  let width = 1024;
  if (state.exportResolution === 1) width = 512;
  if (state.exportResolution === 3) width = 2048;

  let height = width;
  if (state.exportRatio === '4:5') {
    height = Math.round(width * 1.25);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Load elements to draw
  const imgMain = $('layer-main') as HTMLImageElement;
  const imgHidden = $('layer-hidden') as HTMLImageElement;

  // Trigger sequential loading to ensure elements are ready
  drawCanvasLayers(canvas, ctx, imgMain, imgHidden);
});

function drawCanvasLayers(
  canvas: HTMLCanvasElement, 
  ctx: CanvasRenderingContext2D, 
  imgMain: HTMLImageElement, 
  imgHidden: HTMLImageElement
) {
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);

  // Scaling factor for physical pixel filters (e.g. blur scale)
  const scaleFactor = width / 500; // Base width preview is roughly 500px

  // Draw Hidden Layer First (if loaded and visible)
  if (state.hiddenImage && state.hiddenVisible) {
    ctx.save();
    ctx.globalAlpha = state.hiddenOpacity / 100;
    ctx.globalCompositeOperation = mapBlendModeToCompositeOp(state.hiddenEffects.blendMode);
    
    // Map filters to Canvas 2D filters
    ctx.filter = `
      blur(${state.hiddenEffects.blur * scaleFactor}px)
      contrast(${state.hiddenEffects.contrast}%)
      saturate(${state.hiddenEffects.saturation}%)
      brightness(${state.hiddenEffects.brightness}%)
      ${state.hiddenEffects.invert ? 'invert(1)' : ''}
    `.replace(/\s+/g, ' ').trim();

    // Cover scaling for aspect square/vertical
    drawCoverImage(ctx, imgHidden, width, height);
    ctx.restore();
  }

  // Draw Main Layer (if loaded and visible)
  if (state.mainImage && state.mainVisible) {
    ctx.save();
    ctx.globalAlpha = state.mainOpacity / 100;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';

    drawCoverImage(ctx, imgMain, width, height);
    ctx.restore();
  }

  // Download generated blob
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `twitter_hidden_image_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, 'image/png');
}

// Cover positioning helper similar to CSS object-fit: cover
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = w / h;
  let sx = 0, sy = 0, sWidth = img.naturalWidth, sHeight = img.naturalHeight;

  if (imgRatio > canvasRatio) {
    sWidth = img.naturalHeight * canvasRatio;
    sx = (img.naturalWidth - sWidth) / 2;
  } else {
    sHeight = img.naturalWidth / canvasRatio;
    sy = (img.naturalHeight - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, w, h);
}

function applyEffectsToPreview() {
  const imgMain = $('layer-main') as HTMLImageElement;
  const imgHidden = $('layer-hidden') as HTMLImageElement;

  // Apply visibility and opacity to Main Layer
  imgMain.style.opacity = state.mainVisible ? (state.mainOpacity / 100).toString() : '0';

  // Apply opacity, blending and filters to Hidden Layer
  imgHidden.style.opacity = state.hiddenVisible ? (state.hiddenOpacity / 100).toString() : '0';
  imgHidden.style.mixBlendMode = state.hiddenEffects.blendMode;
  imgHidden.style.filter = `
    blur(${state.hiddenEffects.blur}px)
    contrast(${state.hiddenEffects.contrast}%)
    saturate(${state.hiddenEffects.saturation}%)
    brightness(${state.hiddenEffects.brightness}%)
    ${state.hiddenEffects.invert ? 'invert(1)' : ''}
  `.replace(/\s+/g, ' ').trim();
}

// Call initial updates on startup
updateActiveLayerControls();
applyEffectsToPreview();
