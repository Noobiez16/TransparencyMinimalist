import { state } from '../state';
import { type Layer, layerNaturalSize } from './document';
import { hitTestLayer } from './transform-geometry';

export interface DocPoint { x: number; y: number }
interface ToolOptionBase { key: string; label: string; group?: string; icon?: string | (() => string); disabled?: () => boolean; essential?: boolean }
export interface NumberToolOption extends ToolOptionBase { kind: 'number'; min?: number; max?: number; step?: number; get(): number; set(v: number): void }
export interface ToggleToolOption extends ToolOptionBase { kind: 'toggle'; get(): boolean; set(v: boolean): void }
export interface SelectToolOption extends ToolOptionBase { kind: 'select'; choices: string[]; get(): string; set(v: string): void }
export interface ActionToolOption extends ToolOptionBase { kind: 'action'; run(): void }
export interface DisplayToolOption extends ToolOptionBase { kind: 'display'; get(): string }
export type ToolOption = NumberToolOption | ToggleToolOption | SelectToolOption | ActionToolOption | DisplayToolOption;
export interface Tool {
  id: string; label: string; icon: string; cursor: string; shortcut: string;
  onDown(p: DocPoint, e: PointerEvent): void;
  onMove(p: DocPoint, e: PointerEvent): void;
  onUp(p: DocPoint, e: PointerEvent): void;
  onCancel?(p: DocPoint, e: PointerEvent): void;
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  options?: ToolOption[];
}

export interface ToolPointerRouter {
  onDown(p: DocPoint, e: PointerEvent): void;
  onMove(p: DocPoint, e: PointerEvent): void;
  onUp(p: DocPoint, e: PointerEvent): void;
  onCancel(p: DocPoint, e: PointerEvent): void;
}

export function createToolPointerRouter(resolveActiveTool: () => Tool): ToolPointerRouter {
  let owner: { pointerId: number; tool: Tool } | null = null;
  const matchingOwner = (event: PointerEvent) => owner?.pointerId === event.pointerId ? owner.tool : null;

  return {
    onDown(point, event) {
      if (owner) return;
      const tool = resolveActiveTool();
      owner = { pointerId: event.pointerId, tool };
      tool.onDown(point, event);
    },
    onMove(point, event) {
      const tool = matchingOwner(event);
      if (tool) tool.onMove(point, event);
      else if (!owner) resolveActiveTool().onMove(point, event);
    },
    onUp(point, event) {
      const tool = matchingOwner(event);
      if (!tool) return;
      owner = null;
      tool.onUp(point, event);
    },
    onCancel(point, event) {
      const tool = matchingOwner(event);
      if (!tool) return;
      owner = null;
      tool.onCancel?.(point, event);
    }
  };
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
