import type { Anchor, SubPath } from './path-model';
import type { PathCommand } from './shape-geometry';
import type { Point } from './transform-geometry';

export interface AnchorRef { sub: number; anchor: number }
export interface HandleRef extends AnchorRef { which: 'in' | 'out' }
export interface SegmentHit { sub: number; segment: number; t: number; point: Point }

function segmentCommand(from: Anchor, to: Anchor): PathCommand {
  const straight = from.outDx === 0 && from.outDy === 0 && to.inDx === 0 && to.inDy === 0;
  if (straight) return { op: 'lineTo', x: to.x, y: to.y };
  return {
    op: 'bezierCurveTo',
    c1x: from.x + from.outDx, c1y: from.y + from.outDy,
    c2x: to.x + to.inDx, c2y: to.y + to.inDy,
    x: to.x, y: to.y
  };
}

/** Drawing commands for a path, in DOCUMENT space. */
export function pathToCommands(subpaths: SubPath[]): PathCommand[] {
  const commands: PathCommand[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length < 2) continue;
    commands.push({ op: 'moveTo', x: sub.anchors[0].x, y: sub.anchors[0].y });
    for (let i = 1; i < sub.anchors.length; i++) {
      commands.push(segmentCommand(sub.anchors[i - 1], sub.anchors[i]));
    }
    if (sub.closed) {
      commands.push(segmentCommand(sub.anchors[sub.anchors.length - 1], sub.anchors[0]));
      commands.push({ op: 'close' });
    }
  }
  return commands;
}

const within = (a: Point, b: Point, radius: number): boolean =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= radius * radius;

export function hitTestAnchor(subpaths: SubPath[], point: Point, radius: number): AnchorRef | null {
  let best: AnchorRef | null = null;
  let bestDistance = Infinity;
  subpaths.forEach((sub, si) => {
    sub.anchors.forEach((anchor, ai) => {
      const d = (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2;
      if (d <= radius * radius && d < bestDistance) { bestDistance = d; best = { sub: si, anchor: ai }; }
    });
  });
  return best;
}

/** Handles are only grabbable on the selected anchor, matching what the overlay draws. */
export function hitTestHandle(
  subpaths: SubPath[], point: Point, radius: number, selected: AnchorRef | null
): HandleRef | null {
  if (!selected) return null;
  const anchor = subpaths[selected.sub]?.anchors[selected.anchor];
  if (!anchor) return null;
  const out = { x: anchor.x + anchor.outDx, y: anchor.y + anchor.outDy };
  const inp = { x: anchor.x + anchor.inDx, y: anchor.y + anchor.inDy };
  if ((anchor.outDx !== 0 || anchor.outDy !== 0) && within(out, point, radius)) {
    return { ...selected, which: 'out' };
  }
  if ((anchor.inDx !== 0 || anchor.inDy !== 0) && within(inp, point, radius)) {
    return { ...selected, which: 'in' };
  }
  return null;
}

/** Cubic point at parameter t for the segment between two anchors. */
export function bezierPointAt(from: Anchor, to: Anchor, t: number): Point {
  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + from.outDx, y: from.y + from.outDy };
  const p2 = { x: to.x + to.inDx, y: to.y + to.inDy };
  const p3 = { x: to.x, y: to.y };
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  };
}

const SEGMENT_SAMPLES = 24;

export function hitTestSegment(subpaths: SubPath[], point: Point, radius: number): SegmentHit | null {
  let best: SegmentHit | null = null;
  let bestDistance = radius * radius;
  subpaths.forEach((sub, si) => {
    const count = sub.closed ? sub.anchors.length : sub.anchors.length - 1;
    for (let seg = 0; seg < count; seg++) {
      const from = sub.anchors[seg];
      const to = sub.anchors[(seg + 1) % sub.anchors.length];
      if (!from || !to) continue;
      for (let step = 0; step <= SEGMENT_SAMPLES; step++) {
        const t = step / SEGMENT_SAMPLES;
        const p = bezierPointAt(from, to, t);
        const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
        if (d <= bestDistance) { bestDistance = d; best = { sub: si, segment: seg, t, point: p }; }
      }
    }
  });
  return best;
}
