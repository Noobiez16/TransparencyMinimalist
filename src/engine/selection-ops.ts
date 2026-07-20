import type { Point } from './transform-geometry';

export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';

export type SelectionShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; points: Point[] };

export type SelectionOp =
  | { kind: 'shape'; shape: SelectionShape; mode: SelectionMode }
  | { kind: 'all' }
  | { kind: 'invert' };

export interface Rect { x: number; y: number; w: number; h: number }

/** A `new` shape or Select All restarts the list; everything else appends. */
export function reduceOps(ops: SelectionOp[], op: SelectionOp): SelectionOp[] {
  if (op.kind === 'all') return [op];
  if (op.kind === 'shape' && op.mode === 'new') return [op];
  return [...ops, op];
}

export function compositeOpFor(mode: SelectionMode): GlobalCompositeOperation {
  if (mode === 'subtract') return 'destination-out';
  if (mode === 'intersect') return 'destination-in';
  return 'source-over'; // 'new' clears the mask first, then draws normally
}

/** Tight box around selected pixels; null when nothing is selected. */
export function boundsFromAlpha(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold = 128
): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Point budget for history byte accounting. */
export function opsPointCount(ops: SelectionOp[]): number {
  let total = 0;
  for (const op of ops) {
    if (op.kind !== 'shape') { total += 1; continue; }
    total += op.shape.kind === 'polygon' ? op.shape.points.length : 4;
  }
  return total;
}
