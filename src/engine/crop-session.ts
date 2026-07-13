import { cmdCropDocument, type DocumentGeometry } from './commands';
import * as history from './history';
import { notify, state } from '../state';

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropRatioPreset = 'free' | 'original' | '1:1' | '4:5' | '16:9' | '9:16';
export type CropRatio = CropRatioPreset | { numerator: number; denominator: number };

export interface CropGesture {
  handle: CropHandle;
  startPointer: { x: number; y: number };
  startRect: CropRect;
}

export interface CropSession {
  rect: CropRect;
  ratio: CropRatio;
  gesture: CropGesture | null;
}

const PRESET_VALUES: Record<Exclude<CropRatioPreset, 'free' | 'original'>, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
  '9:16': 9 / 16
};

const MAX_CUSTOM = 4096;

const listeners = new Set<() => void>();
let session: CropSession | null = null;

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch (error) { console.error('crop session listener failed', error); }
  }
}

function copyRect(rect: CropRect): CropRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function fullRect(): CropRect {
  return { x: 0, y: 0, width: state.doc.width, height: state.doc.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Numeric aspect (width / height) for the session's ratio, or null when free. */
function ratioValue(ratio: CropRatio): number | null {
  if (ratio === 'free') return null;
  if (ratio === 'original') return state.doc.width / state.doc.height;
  if (typeof ratio === 'string') return PRESET_VALUES[ratio];
  return ratio.numerator / ratio.denominator;
}

/**
 * Clamp a rect into the document. Position is honored first; the size then
 * shrinks to the space available from that position (ratio-preserving when
 * a ratio is given).
 */
function clampRect(rect: CropRect, ratio: number | null): CropRect {
  const x = clamp(rect.x, 0, state.doc.width - 1);
  const y = clamp(rect.y, 0, state.doc.height - 1);
  const maxWidth = state.doc.width - x;
  const maxHeight = state.doc.height - y;
  let width = clamp(rect.width, 1, maxWidth);
  let height = clamp(rect.height, 1, maxHeight);
  if (ratio !== null) {
    const fit = Math.min(1, maxWidth / rect.width, maxHeight / (rect.width / ratio));
    width = Math.max(1, rect.width * fit);
    height = Math.max(1, width / ratio);
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.max(1, height * ratio);
    }
  }
  return { x, y, width, height };
}

/** Largest ratio-locked rect that fits inside the given rect, sharing its center. */
function fitToRatio(rect: CropRect, ratio: number): CropRect {
  let width = rect.width;
  let height = width / ratio;
  if (height > rect.height) {
    height = rect.height;
    width = height * ratio;
  }
  return clampRect({
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
    width,
    height
  }, ratio);
}

export function beginCrop(): boolean {
  if (session) return false;
  session = { rect: fullRect(), ratio: 'free', gesture: null };
  notify('composite');
  emit();
  return true;
}

export function getCropSession(): Readonly<CropSession> | null {
  if (!session) return null;
  return {
    rect: copyRect(session.rect),
    ratio: session.ratio,
    gesture: session.gesture
      ? {
          handle: session.gesture.handle,
          startPointer: { ...session.gesture.startPointer },
          startRect: copyRect(session.gesture.startRect)
        }
      : null
  };
}

export function setCropRatio(ratio: CropRatio): boolean {
  if (!session) return false;
  if (typeof ratio === 'object') {
    const { numerator, denominator } = ratio;
    const valid = [numerator, denominator].every(
      (value) => Number.isInteger(value) && value >= 1 && value <= MAX_CUSTOM
    );
    if (!valid) return false;
  }
  session.ratio = ratio;
  const value = ratioValue(ratio);
  if (value !== null) session.rect = fitToRatio(session.rect, value);
  notify('composite');
  emit();
  return true;
}

export function previewCrop(patch: Partial<CropRect>): boolean {
  if (!session) return false;
  for (const value of Object.values(patch)) {
    if (value !== undefined && !Number.isFinite(value)) return false;
  }
  const ratio = ratioValue(session.ratio);
  let next: CropRect = { ...session.rect, ...patch };
  if (ratio !== null) {
    if (patch.width !== undefined) {
      next.width = Math.max(1, next.width);
      next.height = next.width / ratio;
    } else if (patch.height !== undefined) {
      next.height = Math.max(1, next.height);
      next.width = next.height * ratio;
    }
  }
  session.rect = clampRect(next, ratio);
  notify('composite');
  emit();
  return true;
}

export function beginCropGesture(handle: CropHandle, point: { x: number; y: number }): boolean {
  if (!session || session.gesture) return false;
  session.gesture = {
    handle,
    startPointer: { x: point.x, y: point.y },
    startRect: copyRect(session.rect)
  };
  emit();
  return true;
}

function resizeFromGesture(gesture: CropGesture, point: { x: number; y: number }, ratio: number | null): CropRect {
  const start = gesture.startRect;
  const handle = gesture.handle;
  const anchorX = handle.includes('w') ? start.x + start.width : start.x;
  const anchorY = handle.includes('n') ? start.y + start.height : start.y;
  const hasX = handle.includes('e') || handle.includes('w');
  const hasY = handle.includes('n') || handle.includes('s');

  let width = hasX ? Math.abs(point.x - anchorX) : start.width;
  let height = hasY ? Math.abs(point.y - anchorY) : start.height;
  width = Math.max(1, hasX && ((handle.includes('e') && point.x < anchorX) || (handle.includes('w') && point.x > anchorX)) ? 1 : width);
  height = Math.max(1, hasY && ((handle.includes('s') && point.y < anchorY) || (handle.includes('n') && point.y > anchorY)) ? 1 : height);

  if (ratio !== null) {
    if (hasX && hasY) {
      const side = Math.max(width, height * ratio);
      width = side;
      height = side / ratio;
    } else if (hasX) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }
  }

  let x = handle.includes('w') ? anchorX - width : hasX ? anchorX : start.x;
  let y = handle.includes('n') ? anchorY - height : hasY ? anchorY : start.y;
  if (ratio !== null && !hasX) x = start.x + start.width / 2 - width / 2;
  if (ratio !== null && !hasY) y = start.y + start.height / 2 - height / 2;

  // Shrink toward the anchor so clamping never detaches the dragged edge.
  const maxWidth = handle.includes('w') ? anchorX : state.doc.width - x;
  const maxHeight = handle.includes('n') ? anchorY : state.doc.height - y;
  if (width > maxWidth) {
    width = Math.max(1, maxWidth);
    if (ratio !== null) height = width / ratio;
  }
  if (height > maxHeight) {
    height = Math.max(1, maxHeight);
    if (ratio !== null) width = height * ratio;
  }
  if (handle.includes('w')) x = anchorX - width;
  if (handle.includes('n')) y = anchorY - height;

  return clampRect({ x, y, width, height }, ratio);
}

export function previewCropGesture(point: { x: number; y: number }): void {
  if (!session?.gesture) return;
  const gesture = session.gesture;
  if (gesture.handle === 'move') {
    const start = gesture.startRect;
    session.rect = {
      x: clamp(start.x + point.x - gesture.startPointer.x, 0, state.doc.width - start.width),
      y: clamp(start.y + point.y - gesture.startPointer.y, 0, state.doc.height - start.height),
      width: start.width,
      height: start.height
    };
  } else {
    session.rect = resizeFromGesture(gesture, point, ratioValue(session.ratio));
  }
  notify('composite');
  emit();
}

export function finishCropGesture(): void {
  if (!session?.gesture) return;
  session.gesture = null;
  notify('composite');
  emit();
}

export function interruptCropGesture(): void {
  if (!session?.gesture) return;
  session.rect = copyRect(session.gesture.startRect);
  session.gesture = null;
  notify('composite');
  emit();
}

export function resetCrop(): boolean {
  if (!session) return false;
  session.rect = fullRect();
  session.ratio = 'free';
  session.gesture = null;
  notify('composite');
  emit();
  return true;
}

function roundedRect(rect: CropRect): CropRect {
  const width = clamp(Math.round(rect.width), 1, state.doc.width);
  const height = clamp(Math.round(rect.height), 1, state.doc.height);
  return {
    x: clamp(Math.round(rect.x), 0, state.doc.width - width),
    y: clamp(Math.round(rect.y), 0, state.doc.height - height),
    width,
    height
  };
}

export function applyCrop(): boolean {
  if (!session) return false;
  const rect = roundedRect(session.rect);
  session = null;
  const unchanged = rect.x === 0 && rect.y === 0 &&
    rect.width === state.doc.width && rect.height === state.doc.height;
  if (unchanged) {
    notify('composite');
    emit();
    return true;
  }
  const before: DocumentGeometry = { width: state.doc.width, height: state.doc.height, positions: {} };
  const after: DocumentGeometry = { width: rect.width, height: rect.height, positions: {} };
  for (const layer of state.doc.layers) {
    before.positions[layer.id] = { x: layer.x, y: layer.y };
    after.positions[layer.id] = { x: layer.x - rect.x, y: layer.y - rect.y };
  }
  history.push(cmdCropDocument(before, after));
  emit();
  return true;
}

export function cancelCrop(): boolean {
  if (!session) return false;
  session = null;
  notify('composite');
  emit();
  return true;
}

export function subscribeCropSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
