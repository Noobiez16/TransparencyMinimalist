import { state } from '../state';
import { type Layer, layerNaturalSize } from './document';
import { hitTestLayer } from './transform-geometry';

export interface DocPoint { x: number; y: number }
export interface ToolOption { key: string; label: string; kind: 'slider' | 'toggle' | 'select' | 'display'; min?: number; max?: number; choices?: string[]; get(): unknown; set(v: unknown): void }
export interface Tool {
  id: string; label: string; icon: string; cursor: string; shortcut: string;
  onDown(p: DocPoint, e: PointerEvent): void;
  onMove(p: DocPoint, e: PointerEvent): void;
  onUp(p: DocPoint, e: PointerEvent): void;
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  options?: ToolOption[];
}

const tools = new Map<string, Tool>();
let active: Tool | null = null;
const changeListeners: Array<(t: Tool) => void> = [];

export function registerTool(t: Tool): void { tools.set(t.id, t); if (!active) active = t; }
export function getActiveTool(): Tool { return active!; }
export function setActiveTool(id: string): void {
  const t = tools.get(id);
  if (!t || t === active) return;
  active = t;
  changeListeners.forEach((fn) => { try { fn(t); } catch (e) { console.error(e); } });
}
export function onToolChange(fn: (t: Tool) => void): void { changeListeners.push(fn); }
export function allTools(): Tool[] { return [...tools.values()]; }

export function layerAt(p: DocPoint): Layer | null {
  for (const layer of state.doc.layers) {          // index 0 = topmost
    if (!layer.visible) continue;
    if (hitTestLayer(layer, layerNaturalSize(layer), p)) return layer;
  }
  return null;
}
