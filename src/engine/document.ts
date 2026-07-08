export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface Effects {
  blur: number; blurOn: boolean;           // blur in DOCUMENT pixels, 0-100
  brightness: number; brightnessOn: boolean;
  contrast: number; contrastOn: boolean;
  saturation: number; saturationOn: boolean;
  invert: boolean;
}

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;                          // 0-100
  blendMode: BlendMode;
  x: number; y: number;                     // layer CENTER in document pixels
  scale: number;                            // percent 10-400
  effects: Effects;
}

export interface ImageLayer extends LayerBase {
  kind: 'image';
  bitmap: HTMLCanvasElement | null;         // natural resolution
  bitmapRev: number;                        // bump on pixel change (thumbnail invalidation)
  sourceName: string | null;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;                         // DOCUMENT pixels, 8-512
  color: string;
}

export type Layer = ImageLayer | TextLayer;

export interface Doc {
  version: 1;
  width: number;
  height: number;
  bgType: 'transparent' | 'white' | 'black' | 'custom';
  bgColor: string;
  layers: Layer[];                          // index 0 = TOPMOST (matches panel order)
  activeLayerId: string | null;
}

export function defaultEffects(): Effects {
  return {
    blur: 0, blurOn: false,
    brightness: 100, brightnessOn: false,
    contrast: 100, contrastOn: false,
    saturation: 100, saturationOn: false,
    invert: false
  };
}

let layerCounter = 0;

function baseLayer(doc: Doc, name: string): LayerBase {
  layerCounter++;
  return {
    id: `layer_${Date.now()}_${layerCounter}`,
    name,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    x: doc.width / 2,
    y: doc.height / 2,
    scale: 100,
    effects: defaultEffects()
  };
}

export function createDoc(width = 1024, height = 1024): Doc {
  return {
    version: 1, width, height,
    bgType: 'transparent', bgColor: '#ffffff',
    layers: [], activeLayerId: null
  };
}

export function createImageLayer(doc: Doc, name?: string): ImageLayer {
  return { ...baseLayer(doc, name ?? `Image Layer ${layerCounter + 1}`), kind: 'image', bitmap: null, bitmapRev: 0, sourceName: null };
}

export function createTextLayer(doc: Doc, name?: string): TextLayer {
  return { ...baseLayer(doc, name ?? `Text Layer ${layerCounter + 1}`), kind: 'text', text: 'Edit me', fontFamily: 'Inter', fontSize: 64, color: '#000000' };
}

export function getActiveLayer(doc: Doc): Layer | undefined {
  return doc.layers.find((l) => l.id === doc.activeLayerId);
}

export function getFilterString(effects: Effects, kind: 'image' | 'text'): string {
  const parts: string[] = [];
  const blur = effects.blurOn ? effects.blur : 0;
  if (blur > 0) parts.push(`blur(${blur}px)`);
  if (kind === 'image') {
    parts.push(`contrast(${effects.contrastOn ? effects.contrast : 100}%)`);
    parts.push(`saturate(${effects.saturationOn ? effects.saturation : 100}%)`);
    parts.push(`brightness(${effects.brightnessOn ? effects.brightness : 100}%)`);
  }
  if (effects.invert) parts.push('invert(1)');
  return parts.length ? parts.join(' ') : 'none';
}

// Module-level measurement context (text metrics without touching the DOM tree)
const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d')!;

export function layerSize(layer: Layer): { w: number; h: number } {
  if (layer.kind === 'image') {
    return layer.bitmap ? { w: layer.bitmap.width, h: layer.bitmap.height } : { w: 0, h: 0 };
  }
  measureCtx.font = `${layer.fontSize}px ${layer.fontFamily}`;
  const lines = layer.text.split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width);
  const h = lines.length * layer.fontSize * 1.2;
  return { w, h };
}

export function layerBounds(layer: Layer): { x: number; y: number; w: number; h: number } {
  const { w, h } = layerSize(layer);
  const sw = (w * layer.scale) / 100;
  const sh = (h * layer.scale) / 100;
  return { x: layer.x - sw / 2, y: layer.y - sh / 2, w: sw, h: sh };
}
