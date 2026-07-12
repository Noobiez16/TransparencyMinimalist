import { cmdTransformLayer } from './commands';
import { layerNaturalSize, type LayerTransform } from './document';
import {
  normalizeDegrees,
  resizeFromHandle,
  rotationFromPointer,
  type HandleId,
  type Point,
  type ResizeHandleId,
  type Size
} from './transform-geometry';
import * as history from './history';
import { notify, state } from '../state';

export type TransformMode = 'direct' | 'explicit';

export interface TransformGesture {
  handle: HandleId | 'move';
  startPointer: Point;
  startTransform: LayerTransform;
  naturalSize: Size;
  linked: boolean;
}

export interface TransformSession {
  layerId: string;
  mode: TransformMode;
  start: LayerTransform;
  current: LayerTransform;
  gesture: TransformGesture | null;
}

const listeners = new Set<() => void>();
let activeSession: TransformSession | null = null;

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
  activeSession = null;
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

export function beginHandleGesture(handle: HandleId | 'move', point: Point, linked: boolean): boolean {
  const layer = findLayer();
  if (!activeSession || !layer || activeSession.gesture) return false;
  activeSession.gesture = {
    handle,
    startPointer: { x: point.x, y: point.y },
    startTransform: copyTransform(layer),
    naturalSize: layerNaturalSize(layer),
    linked
  };
  emit();
  return true;
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

  void modifiers.bypassSnap;
  Object.assign(layer, next);
  activeSession.current = copyTransform(next);
  notify('layerProps', 'composite');
  emit();
}

export function finishGesture(): void {
  if (!activeSession?.gesture) return;
  activeSession.gesture = null;
  if (activeSession.mode === 'direct') {
    applyTransform();
  } else {
    emit();
  }
}

export function interruptGesture(): void {
  if (!activeSession?.gesture) return;
  const interrupted = activeSession.gesture.startTransform;
  const mode = activeSession.mode;
  if (!restore(interrupted)) { clearSession(); return; }
  activeSession.current = copyTransform(interrupted);
  activeSession.gesture = null;
  if (mode === 'direct') clearSession();
  else emit();
}

export function applyTransform(): boolean {
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
  if (!activeSession) return false;
  const start = activeSession.start;
  const restored = restore(start);
  clearSession();
  return restored;
}

export function getTransformSession(): Readonly<TransformSession> | null {
  return activeSession;
}

export function subscribeTransformSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
