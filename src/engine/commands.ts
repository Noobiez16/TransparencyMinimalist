import { state, notify } from '../state';
import { type Doc, type Layer, type LayerBase, type Effects } from './document';
import type { Command } from './history';

function findLayer(id: string): Layer | undefined { return state.doc.layers.find((l) => l.id === id); }

function captureKeys<T extends object>(target: T, patch: Partial<T>): Partial<T> {
  const prev: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) prev[k] = target[k];
  return prev;
}

export function cmdPatchLayer(
  layerId: string,
  label: string,
  patch: Partial<LayerBase & { text: string; fontFamily: string; fontSize: number; color: string }>,
  coalesceKey?: string
): Command {
  const layer = findLayer(layerId);
  const prev = layer ? captureKeys(layer as unknown as Record<string, unknown>, patch as Record<string, unknown>) : {};
  const apply = (vals: Record<string, unknown>) => {
    const l = findLayer(layerId);
    if (!l) return;
    Object.assign(l, vals);
    notify('layerProps', 'composite');
  };
  return { label, do: () => apply(patch as Record<string, unknown>), undo: () => apply(prev), coalesceKey };
}

export function cmdPatchEffects(layerId: string, label: string, patch: Partial<Effects>, coalesceKey?: string): Command {
  const layer = findLayer(layerId);
  const prev = layer ? captureKeys(layer.effects, patch) : {};
  const apply = (vals: Partial<Effects>) => {
    const l = findLayer(layerId);
    if (!l) return;
    Object.assign(l.effects, vals);
    notify('layerProps', 'composite');
  };
  return { label, do: () => apply(patch), undo: () => apply(prev), coalesceKey };
}

export function cmdPatchDoc(label: string, patch: Partial<Pick<Doc, 'width' | 'height' | 'bgType' | 'bgColor'>>): Command {
  const prev = captureKeys(state.doc, patch);
  const apply = (vals: object) => { Object.assign(state.doc, vals); notify('canvasConfig', 'composite'); };
  return { label, do: () => apply(patch), undo: () => apply(prev) };
}

export function cmdAddLayer(layer: Layer, index: number, label: string): Command {
  const prevActive = state.doc.activeLayerId;
  return {
    label,
    do: () => {
      state.doc.layers.splice(index, 0, layer);
      state.doc.activeLayerId = layer.id;
      notify('structure', 'selection', 'composite');
    },
    undo: () => {
      state.doc.layers = state.doc.layers.filter((l) => l.id !== layer.id);
      state.doc.activeLayerId = prevActive;
      notify('structure', 'selection', 'composite');
    }
  };
}

export function cmdDeleteLayer(layerId: string, label: string): Command {
  const index = state.doc.layers.findIndex((l) => l.id === layerId);
  const layer = state.doc.layers[index];
  const prevActive = state.doc.activeLayerId;
  return {
    label,
    do: () => {
      state.doc.layers = state.doc.layers.filter((l) => l.id !== layerId);
      if (state.doc.activeLayerId === layerId) state.doc.activeLayerId = state.doc.layers[0]?.id ?? null;
      notify('structure', 'selection', 'composite');
    },
    undo: () => {
      state.doc.layers.splice(index, 0, layer);
      state.doc.activeLayerId = prevActive;
      notify('structure', 'selection', 'composite');
    }
  };
}

export function cmdReorderLayer(layerId: string, toIndex: number, label: string): Command {
  const fromIndex = state.doc.layers.findIndex((l) => l.id === layerId);
  const move = (from: number, to: number) => {
    const [l] = state.doc.layers.splice(from, 1);
    state.doc.layers.splice(to, 0, l);
    notify('structure', 'composite');
  };
  return { label, do: () => move(fromIndex, toIndex), undo: () => move(toIndex, fromIndex) };
}
