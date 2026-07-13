import { cmdTransformLayer } from './commands';
import { layerNaturalSize, type LayerTransform } from './document';
import {
  getLayerQuad,
  normalizeDegrees,
  resizeFromHandle,
  rotationFromPointer,
  type HandleId,
  type Point,
  type ResizeHandleId,
  type Size
} from './transform-geometry';
import { buildSnapCandidates, snapTranslation, type SnapAnchor, type SnapCandidate } from './snap-engine';
import * as history from './history';
import { notify, state } from '../state';
import { clearActiveGuides, setActiveGuides } from '../canvas-overlay';

export type TransformMode = 'direct' | 'explicit';

export interface TransformGesture {
  handle: HandleId | 'move';
  startPointer: Point;
  startTransform: LayerTransform;
  naturalSize: Size;
  linked: boolean;
}

interface InternalTransformGesture extends TransformGesture {
  snap: { candidates: SnapCandidate[]; overlayScale: number; screenPx: number } | null;
}

export interface TransformSnapOptions {
  enabled: boolean;
  overlayScale: number;
  screenPx?: number;
}

export interface TransformSession {
  layerId: string;
  mode: TransformMode;
  start: LayerTransform;
  current: LayerTransform;
  gesture: TransformGesture | null;
}

interface InternalTransformSession extends Omit<TransformSession, 'gesture'> {
  gesture: InternalTransformGesture | null;
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

const listeners = new Set<() => void>();
let activeSession: InternalTransformSession | null = null;

function copyTransform(transform: LayerTransform): LayerTransform {
  return {
    x: transform.x,
    y: transform.y,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    rotation: transform.rotation
  };
}

function sameTransform(a: LayerTransform, b: LayerTransform): boolean {
  return a.x === b.x && a.y === b.y && a.scaleX === b.scaleX &&
    a.scaleY === b.scaleY && a.rotation === b.rotation;
}

function findLayer() {
  return activeSession
    ? state.doc.layers.find((layer) => layer.id === activeSession!.layerId)
    : undefined;
}

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.error('transform session listener failed', error); }
  }
}

function clearSession(): void {
  clearActiveGuides();
  activeSession = null;
  notify('composite');
  emit();
}

function restore(transform: LayerTransform): boolean {
  const layer = findLayer();
  if (!layer) return false;
  Object.assign(layer, transform);
  notify('layerProps', 'composite');
  return true;
}

export function beginTransform(layerId: string, mode: TransformMode): boolean {
  const layer = state.doc.layers.find((candidate) => candidate.id === layerId);
  if (!layer || activeSession) return false;
  const snapshot = copyTransform(layer);
  clearActiveGuides();
  activeSession = {
    layerId,
    mode,
    start: snapshot,
    current: copyTransform(snapshot),
    gesture: null
  };
  emit();
  return true;
}

export function beginHandleGesture(
  handle: HandleId | 'move',
  point: Point,
  linked: boolean,
  snapOptions?: TransformSnapOptions
): boolean {
  const layer = findLayer();
  if (!activeSession || !layer || activeSession.gesture) return false;
  activeSession.gesture = {
    handle,
    startPointer: { x: point.x, y: point.y },
    startTransform: copyTransform(layer),
    naturalSize: layerNaturalSize(layer),
    linked,
    snap: snapOptions?.enabled ? {
      candidates: buildSnapCandidates(state.doc, layer.id),
      overlayScale: snapOptions.overlayScale,
      screenPx: snapOptions.screenPx ?? 6
    } : null
  };
  emit();
  return true;
}

function transformBounds(transform: LayerTransform, natural: Size): { x: number; y: number; w: number; h: number } {
  const { corners } = getLayerQuad(transform, natural);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function resizeAnchors(handle: ResizeHandleId): { x: readonly SnapAnchor[]; y: readonly SnapAnchor[] } {
  const x: readonly SnapAnchor[] = handle.includes('e') ? ['end'] : handle.includes('w') ? ['start'] : [];
  const y: readonly SnapAnchor[] = handle.includes('s') ? ['end'] : handle.includes('n') ? ['start'] : [];
  return { x, y };
}

export function previewTransform(
  point: Point,
  modifiers: { shift: boolean; bypassSnap: boolean }
): void {
  if (!activeSession?.gesture) return;
  const layer = findLayer();
  if (!layer) { clearSession(); return; }

  const gesture = activeSession.gesture;
  const dx = point.x - gesture.startPointer.x;
  const dy = point.y - gesture.startPointer.y;
  let next: LayerTransform;

  if (gesture.handle === 'move') {
    const constrained = modifiers.shift
      ? (Math.abs(dx) >= Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: dy })
      : { x: dx, y: dy };
    next = {
      ...gesture.startTransform,
      x: gesture.startTransform.x + constrained.x,
      y: gesture.startTransform.y + constrained.y
    };
  } else if (gesture.handle === 'rotate') {
    const center = { x: gesture.startTransform.x, y: gesture.startTransform.y };
    const startAngle = rotationFromPointer(center, gesture.startPointer, false);
    const pointerAngle = rotationFromPointer(center, point, false);
    let rotation = normalizeDegrees(gesture.startTransform.rotation + pointerAngle - startAngle);
    if (modifiers.shift) rotation = normalizeDegrees(Math.round(rotation / 15) * 15);
    next = { ...gesture.startTransform, rotation };
  } else {
    next = resizeFromHandle({
      start: gesture.startTransform,
      natural: gesture.naturalSize,
      handle: gesture.handle as ResizeHandleId,
      startPointer: gesture.startPointer,
      pointer: point,
      linked: gesture.linked || modifiers.shift,
      minSize: 1
    });
  }

  if (gesture.snap && gesture.handle !== 'rotate') {
    const bounds = transformBounds(next, gesture.naturalSize);
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const result = snapTranslation({
      x: center.x,
      y: center.y,
      width: bounds.w,
      height: bounds.h,
      candidates: gesture.snap.candidates,
      overlayScale: gesture.snap.overlayScale,
      screenPx: gesture.snap.screenPx,
      bypass: modifiers.bypassSnap,
      ...(gesture.handle === 'move' ? {} : { anchors: resizeAnchors(gesture.handle as ResizeHandleId) })
    });
    setActiveGuides(result.guides);
    if (!modifiers.bypassSnap) {
      const correction = { x: result.x - center.x, y: result.y - center.y };
      if (gesture.handle === 'move') {
        next = { ...next, x: next.x + correction.x, y: next.y + correction.y };
      } else {
        next = resizeFromHandle({
          start: gesture.startTransform,
          natural: gesture.naturalSize,
          handle: gesture.handle as ResizeHandleId,
          startPointer: gesture.startPointer,
          pointer: { x: point.x + correction.x, y: point.y + correction.y },
          linked: gesture.linked || modifiers.shift,
          minSize: 1
        });
      }
    }
  } else {
    clearActiveGuides();
  }
  Object.assign(layer, next);
  activeSession.current = copyTransform(next);
  notify('layerProps', 'composite');
  emit();
}

export function finishGesture(): void {
  if (!activeSession?.gesture) return;
  clearActiveGuides();
  activeSession.gesture = null;
  if (activeSession.mode === 'direct') {
    applyTransform();
  } else {
    notify('composite');
    emit();
  }
}

export function interruptGesture(): void {
  if (!activeSession?.gesture) return;
  clearActiveGuides();
  const interrupted = activeSession.gesture.startTransform;
  const mode = activeSession.mode;
  if (!restore(interrupted)) { clearSession(); return; }
  activeSession.current = copyTransform(interrupted);
  activeSession.gesture = null;
  if (mode === 'direct') clearSession();
  else emit();
}

export function updateTransform(patch: Partial<LayerTransform>): boolean {
  if (!activeSession || activeSession.mode !== 'explicit' || activeSession.gesture) return false;
  const layer = findLayer();
  if (!layer) { clearSession(); return false; }
  for (const value of Object.values(patch)) {
    if (value !== undefined && !Number.isFinite(value)) return false;
  }
  const next = { ...activeSession.current, ...patch };
  Object.assign(layer, next);
  activeSession.current = copyTransform(next);
  notify('layerProps', 'composite');
  emit();
  return true;
}

export function applyTransform(): boolean {
  clearActiveGuides();
  notify('composite');
  if (!activeSession) return false;
  const layer = findLayer();
  if (!layer) { clearSession(); return false; }
  const { layerId, start } = activeSession;
  const after = copyTransform(activeSession.current);
  activeSession = null;
  if (sameTransform(start, after)) { emit(); return true; }
  Object.assign(layer, start);
  history.push(cmdTransformLayer(layerId, start, after));
  emit();
  return true;
}

export function cancelTransform(): boolean {
  clearActiveGuides();
  notify('composite');
  if (!activeSession) return false;
  const start = activeSession.start;
  const restored = restore(start);
  clearSession();
  return restored;
}

export function getTransformSession(): DeepReadonly<TransformSession> | null {
  if (!activeSession) return null;
  return {
    layerId: activeSession.layerId,
    mode: activeSession.mode,
    start: copyTransform(activeSession.start),
    current: copyTransform(activeSession.current),
    gesture: activeSession.gesture ? {
      handle: activeSession.gesture.handle,
      startPointer: { ...activeSession.gesture.startPointer },
      startTransform: copyTransform(activeSession.gesture.startTransform),
      naturalSize: { ...activeSession.gesture.naturalSize },
      linked: activeSession.gesture.linked
    } : null
  };
}

export function hasActiveTransformGesture(): boolean {
  return Boolean(activeSession?.gesture);
}

export function subscribeTransformSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
