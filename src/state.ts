export interface LayerState {
  id: string;
  name: string;
  type: 'image' | 'text';
  visible: boolean;
  opacity: number;
  blendMode: string;
  xOffset: number;
  yOffset: number;
  scale: number;
  imageSrc: string | null;
  imageName: string | null;
  blur: number;
  blurOn: boolean;
  contrast: number;
  contrastOn: boolean;
  saturation: number;
  saturationOn: boolean;
  brightness: number;
  brightnessOn: boolean;
  invert: boolean;
  textContent: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

export interface AppState {
  layers: LayerState[];
  activeLayerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  canvasRatio: string;
  canvasBgType: 'transparent' | 'white' | 'black' | 'custom';
  canvasBgColor: string;
}

export const state: AppState = {
  layers: [],
  activeLayerId: null,
  canvasWidth: 1024,
  canvasHeight: 1024,
  canvasRatio: '1:1',
  canvasBgType: 'transparent',
  canvasBgColor: '#ffffff'
};

export type DirtyFlag = 'structure' | 'selection' | 'layerProps' | 'canvasConfig';
type Listener = (dirty: Set<DirtyFlag>) => void;

const listeners: Listener[] = [];
let pending = new Set<DirtyFlag>();
let scheduled = false;

export function subscribe(fn: Listener): void {
  listeners.push(fn);
}

export function notify(...flags: DirtyFlag[]): void {
  flags.forEach((f) => pending.add(f));
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    const dirty = pending;
    pending = new Set();
    scheduled = false;
    listeners.forEach((fn) => {
      try {
        fn(dirty);
      } catch (err) {
        console.error('state listener failed', err);
      }
    });
  });
}

export const PROP_DEFAULTS: Record<string, number> = {
  opacity: 100, xOffset: 0, yOffset: 0, scale: 100,
  blur: 0, contrast: 100, saturation: 100, brightness: 100, fontSize: 32
};

let layerCounter = 0;

export function createNewLayer(type: 'image' | 'text'): LayerState {
  layerCounter++;
  return {
    id: `layer_${Date.now()}_${layerCounter}`,
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
    blur: 0, blurOn: false,
    contrast: 100, contrastOn: false,
    saturation: 100, saturationOn: false,
    brightness: 100, brightnessOn: false,
    invert: false,
    textContent: 'Edit me',
    fontFamily: 'Inter',
    fontSize: 32,
    textColor: '#000000'
  };
}

export function getActiveLayer(): LayerState | undefined {
  return state.layers.find((l) => l.id === state.activeLayerId);
}

export function getFilterString(l: LayerState, scaleFactor = 1): string {
  const parts: string[] = [];
  const blur = l.blurOn ? l.blur : 0;
  if (blur > 0) parts.push(`blur(${blur * scaleFactor}px)`);
  if (l.type === 'image') {
    parts.push(`contrast(${l.contrastOn ? l.contrast : 100}%)`);
    parts.push(`saturate(${l.saturationOn ? l.saturation : 100}%)`);
    parts.push(`brightness(${l.brightnessOn ? l.brightness : 100}%)`);
  }
  if (l.invert) parts.push('invert(1)');
  return parts.length ? parts.join(' ') : 'none';
}
