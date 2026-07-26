import { state, notify } from '../state';
import * as history from './history';
import { clonePathItem, createPathItem, type PathItem, type SubPath } from './path-model';

const listeners: Array<() => void> = [];
const emit = () => listeners.forEach((fn) => fn());

export function subscribePaths(fn: () => void): void { listeners.push(fn); }

function changed(): void {
  emit();
  notify('structure', 'composite');
}

export function getActivePath(): PathItem | null {
  return state.doc.paths.find((p) => p.id === state.doc.activePathId) ?? null;
}

/** Photoshop's Work Path: created lazily on the first pen click, without its own history entry. */
export function ensureActivePath(): PathItem {
  const existing = getActivePath();
  if (existing) return existing;
  const path = createPathItem('Work Path');
  state.doc.paths.push(path);
  state.doc.activePathId = path.id;
  changed();
  return path;
}

export function setActivePath(id: string | null): void {
  state.doc.activePathId = id;
  changed();
}

export function addPath(name: string): void {
  const path = createPathItem(name);
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Add path',
    do: () => { state.doc.paths.push(path); state.doc.activePathId = path.id; changed(); },
    undo: () => {
      state.doc.paths = state.doc.paths.filter((p) => p.id !== path.id);
      state.doc.activePathId = prevActive;
      changed();
    }
  });
}

export function duplicateActivePath(): void {
  const source = getActivePath();
  if (!source) return;
  const copy = clonePathItem(source, `${source.name} copy`);
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Duplicate path',
    do: () => { state.doc.paths.push(copy); state.doc.activePathId = copy.id; changed(); },
    undo: () => {
      state.doc.paths = state.doc.paths.filter((p) => p.id !== copy.id);
      state.doc.activePathId = prevActive;
      changed();
    }
  });
}

export function deletePath(id: string): void {
  const index = state.doc.paths.findIndex((p) => p.id === id);
  if (index < 0) return;
  const removed = state.doc.paths[index];
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Delete path',
    do: () => {
      state.doc.paths.splice(index, 1);
      if (state.doc.activePathId === id) {
        state.doc.activePathId = state.doc.paths[Math.min(index, state.doc.paths.length - 1)]?.id ?? null;
      }
      changed();
    },
    undo: () => { state.doc.paths.splice(index, 0, removed); state.doc.activePathId = prevActive; changed(); }
  });
}

export function renamePath(id: string, name: string): void {
  const path = state.doc.paths.find((p) => p.id === id);
  if (!path || !name.trim() || path.name === name) return;
  const before = path.name;
  history.push({
    label: 'Rename path',
    do: () => { path.name = name; changed(); },
    undo: () => { path.name = before; changed(); }
  });
}

/** The single mutation entry point for every editing gesture. */
export function replaceSubPaths(
  pathId: string, subpaths: SubPath[], label: string, coalesceKey?: string
): void {
  const path = state.doc.paths.find((p) => p.id === pathId);
  if (!path) return;
  const before = path.subpaths;
  const after = subpaths;
  history.push({
    label,
    coalesceKey,
    do: () => { path.subpaths = after; changed(); },
    undo: () => { path.subpaths = before; changed(); }
  });
}
