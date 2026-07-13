import { type Tool, type DocPoint, layerAt } from '../engine/tools';
import { getActiveLayer, state, notify } from '../state';
import { icons } from '../dom';
import { clearActiveGuides, getShowTransformControls, hitTestCanvasOverlay, setShowTransformControls } from '../canvas-overlay';
import { getOverlayScale } from '../canvas';
import {
  applyTransform,
  beginHandleGesture,
  beginTransform,
  cancelTransform,
  finishGesture,
  getTransformSession,
  hasActiveTransformGesture,
  interruptGesture,
  previewTransform,
  updateTransform
} from '../engine/transform-session';
import { normalizeDegrees, type HandleId } from '../engine/transform-geometry';
import { layerNaturalSize, type Layer, type LayerTransform } from '../engine/document';
import { cmdPatchLayer } from '../engine/commands';
import * as history from '../engine/history';

const LINKED_HANDLES = new Set<HandleId>(['nw', 'ne', 'se', 'sw']);
let autoSelect = true;
let proportionsLinked = true;
let snapEnabled = true;

export function getSnapEnabled(): boolean { return snapEnabled; }
export function setSnapEnabled(value: boolean): void {
  snapEnabled = value;
  if (!value) clearActiveGuides();
  notify('composite');
}

export type TransformField = 'x' | 'y' | 'width' | 'height' | 'rotation';

function transformedSize(layer: Layer): { width: number; height: number } {
  const natural = layerNaturalSize(layer);
  return {
    width: Math.abs(natural.w * layer.scaleX / 100),
    height: Math.abs(natural.h * layer.scaleY / 100)
  };
}

export function getTransformFieldValue(field: TransformField, layer = getActiveLayer()): number {
  if (!layer) return 0;
  if (field === 'width' || field === 'height') return transformedSize(layer)[field];
  return layer[field];
}

export function getTransformProportionsLinked(): boolean { return proportionsLinked; }
export function setTransformProportionsLinked(value: boolean): void {
  proportionsLinked = value;
  notify('layerProps');
}

export function setTransformFieldValue(field: TransformField, value: number): boolean {
  const layer = getActiveLayer();
  if (!layer || !Number.isFinite(value)) return false;
  let patch: Partial<LayerTransform>;
  if (field === 'x' || field === 'y') {
    patch = { [field]: value };
  } else if (field === 'rotation') {
    patch = { rotation: normalizeDegrees(value) };
  } else {
    const natural = layerNaturalSize(layer);
    const current = transformedSize(layer);
    if (field === 'width') {
      const scaleX = natural.w ? value / natural.w * 100 : layer.scaleX;
      const ratio = current.width ? value / current.width : 1;
      patch = proportionsLinked ? { scaleX, scaleY: layer.scaleY * ratio } : { scaleX };
    } else {
      const scaleY = natural.h ? value / natural.h * 100 : layer.scaleY;
      const ratio = current.height ? value / current.height : 1;
      patch = proportionsLinked ? { scaleY, scaleX: layer.scaleX * ratio } : { scaleY };
    }
  }
  const session = getTransformSession();
  if (session?.mode === 'explicit' && session.layerId === layer.id) return updateTransform(patch);
  history.push(cmdPatchLayer(layer.id, `Transform ${field}`, patch, `${layer.id}:transform:${field}`));
  return true;
}

const hasLayer = () => !getActiveLayer();
const hasExplicitSession = () => getTransformSession()?.mode !== 'explicit';

function preparePointerTransform(layerId: string): boolean {
  const session = getTransformSession();
  if (!session) return beginTransform(layerId, 'direct');
  return session.mode === 'explicit' && session.layerId === layerId && !session.gesture;
}

export const moveTool: Tool = {
  id: 'move', label: 'Move', icon: icons.move, cursor: 'default', shortcut: 'v',
  onDown(p: DocPoint) {
    const active = getActiveLayer();
    const handle = active ? hitTestCanvasOverlay(state.doc, p, getOverlayScale()) : null;
    if (active && handle) {
      if (preparePointerTransform(active.id)) {
        beginHandleGesture(handle, p, proportionsLinked && LINKED_HANDLES.has(handle), {
          enabled: snapEnabled,
          overlayScale: getOverlayScale()
        });
      }
      return;
    }

    const hit = layerAt(p);
    if (!autoSelect && hit?.id !== active?.id) return;
    const session = getTransformSession();
    if (session?.mode === 'explicit' && session.layerId !== hit?.id) return;
    if (!hit) {
      state.doc.activeLayerId = null;
      notify('selection', 'composite');
      return;
    }
    if (state.doc.activeLayerId !== hit.id) {
      state.doc.activeLayerId = hit.id;
      notify('selection', 'composite');
    }
    if (preparePointerTransform(hit.id)) beginHandleGesture('move', p, false, {
      enabled: snapEnabled,
      overlayScale: getOverlayScale()
    });
  },
  onMove(p: DocPoint, e: PointerEvent) {
    if (!hasActiveTransformGesture()) return;
    previewTransform(p, {
      shift: e.shiftKey,
      bypassSnap: e.ctrlKey || e.metaKey
    });
  },
  onUp() {
    finishGesture();
  },
  onCancel() {
    interruptGesture();
  },
  options: [
    { key: 'auto-select', label: 'Auto-select', kind: 'toggle', group: 'selection', get: () => autoSelect, set: (value) => { autoSelect = value; } },
    { key: 'show-controls', label: 'Show controls', kind: 'toggle', group: 'selection', get: getShowTransformControls, set: setShowTransformControls },
    { key: 'x', label: 'X', kind: 'number', group: 'geometry', min: -16384, max: 16384, step: 1, get: () => getTransformFieldValue('x'), set: (value) => { setTransformFieldValue('x', value); }, disabled: hasLayer },
    { key: 'y', label: 'Y', kind: 'number', group: 'geometry', min: -16384, max: 16384, step: 1, get: () => getTransformFieldValue('y'), set: (value) => { setTransformFieldValue('y', value); }, disabled: hasLayer },
    { key: 'width', label: 'W', kind: 'number', group: 'geometry', min: 1, max: 16384, step: 1, get: () => getTransformFieldValue('width'), set: (value) => { setTransformFieldValue('width', value); }, disabled: hasLayer },
    { key: 'height', label: 'H', kind: 'number', group: 'geometry', min: 1, max: 16384, step: 1, get: () => getTransformFieldValue('height'), set: (value) => { setTransformFieldValue('height', value); }, disabled: hasLayer },
    { key: 'link', label: 'Link proportions', kind: 'toggle', group: 'geometry', icon: () => proportionsLinked ? icons.link : icons.unlink, get: getTransformProportionsLinked, set: setTransformProportionsLinked, disabled: hasLayer },
    { key: 'rotation', label: 'Rotation', kind: 'number', group: 'geometry', icon: icons.rotate, min: -360, max: 360, step: 0.1, get: () => getTransformFieldValue('rotation'), set: (value) => { setTransformFieldValue('rotation', value); }, disabled: hasLayer },
    { key: 'snap', label: 'Snap', kind: 'toggle', group: 'assist', icon: icons.snap, get: getSnapEnabled, set: setSnapEnabled },
    { key: 'apply', label: 'Apply', kind: 'action', group: 'session', icon: icons.apply, essential: true, disabled: hasExplicitSession, run: () => { applyTransform(); } },
    { key: 'cancel', label: 'Cancel', kind: 'action', group: 'session', icon: icons.cancel, essential: true, disabled: hasExplicitSession, run: () => { cancelTransform(); } }
  ]
};
