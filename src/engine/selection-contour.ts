import type { Point } from './transform-geometry';

interface Segment { from: Point; to: Point }

const keyOf = (p: Point): string => `${p.x},${p.y}`;

/**
 * Closed contours around selected pixels, in document pixel coordinates.
 * Walks the pixel lattice: every selected pixel contributes the edges whose
 * neighbour is unselected, wound clockwise, then the unit edges are stitched
 * into loops. Exact for hard-edged selections; no saddle-case ambiguity.
 */
export function traceContours(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold = 128
): Point[][] {
  const selected = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] >= threshold;

  const segments: Segment[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!selected(x, y)) continue;
      if (!selected(x, y - 1)) segments.push({ from: { x, y }, to: { x: x + 1, y } });
      if (!selected(x + 1, y)) segments.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 } });
      if (!selected(x, y + 1)) segments.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 } });
      if (!selected(x - 1, y)) segments.push({ from: { x, y: y + 1 }, to: { x, y } });
    }
  }
  if (segments.length === 0) return [];

  const outgoing = new Map<string, Segment[]>();
  for (const segment of segments) {
    const key = keyOf(segment.from);
    const list = outgoing.get(key);
    if (list) list.push(segment);
    else outgoing.set(key, [segment]);
  }

  const loops: Point[][] = [];
  const used = new Set<Segment>();
  for (const start of segments) {
    if (used.has(start)) continue;
    const loop: Point[] = [];
    let current: Segment | undefined = start;
    while (current && !used.has(current)) {
      used.add(current);
      loop.push(current.from);
      const candidates: Segment[] = outgoing.get(keyOf(current.to)) ?? [];
      current = candidates.find((candidate: Segment) => !used.has(candidate));
    }
    if (loop.length >= 4) loops.push(collapseCollinear(loop));
  }
  return loops;
}

/** Drop points that lie on a straight run so rectangles keep four corners. */
function collapseCollinear(loop: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const curr = loop[i];
    const next = loop[(i + 1) % loop.length];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (cross !== 0) out.push(curr);
  }
  return out.length >= 3 ? out : loop;
}
