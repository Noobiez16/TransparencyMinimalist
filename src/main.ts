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

// --- Temporary UI Stubs ---
function updateUI() {
  // Temporary empty stub for Task 2
}

// Initialize canvas presets
updateCanvasDimensions();
