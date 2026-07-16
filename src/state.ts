import { type Doc, createDoc, getActiveLayer as docActiveLayer, type Layer } from './engine/document';

export const state: { doc: Doc } = { doc: createDoc() };

export function getActiveLayer(): Layer | undefined { return docActiveLayer(state.doc); }

export const PROP_DEFAULTS: Record<string, number> = {
  opacity: 100, scaleX: 100, scaleY: 100, rotation: 0,
  blur: 0, contrast: 100, saturation: 100, brightness: 100, fontSize: 64
};
// x/y defaults are dynamic (doc center) — panels use function-style resets.

export type DirtyFlag = 'structure' | 'selection' | 'layerProps' | 'canvasConfig' | 'composite' | 'view';
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
