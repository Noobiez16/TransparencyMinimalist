import type { Point } from './transform-geometry';

export interface Rect { x: number; y: number; w: number; h: number }

/** Stamp positions from `from` (exclusive) to `to` (inclusive), stepping by `spacing`. */
export function stampPoints(from: Point, to: Point, spacing: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [];
  const step = Math.max(1, spacing);
  const points: Point[] = [];
  for (let d = step; d < distance; d += step) {
    points.push({ x: from.x + (dx * d) / distance, y: from.y + (dy * d) / distance });
  }
  points.push({ x: to.x, y: to.y });
  return points;
}

export function stampBounds(center: Point, radius: number): Rect {
  const x = Math.floor(center.x - radius) - 1;
  const y = Math.floor(center.y - radius) - 1;
  const right = Math.ceil(center.x + radius) + 1;
  const bottom = Math.ceil(center.y + radius) + 1;
  return { x, y, w: right - x, h: bottom - y };
}

export function unionRects(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

/** Integer intersection with the bitmap; null when the rect falls entirely outside. */
export function clampRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.w));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.h));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}
