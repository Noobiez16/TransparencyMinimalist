import type { ShapeSpec } from './document';
import type { Point, Size } from './transform-geometry';

export type PathCommand =
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | { op: 'arcTo'; x1: number; y1: number; x2: number; y2: number; r: number }
  | { op: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { op: 'close' };

/** Regular-polygon vertices, first vertex pointing up, wound clockwise. */
export function polygonPoints(radius: number, sides: number): Point[] {
  const count = Math.max(3, Math.round(sides));
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
}

/** Drawing commands in the layer's LOCAL space, centred on the origin. */
export function shapeCommands(shape: ShapeSpec): PathCommand[] {
  if (shape.kind === 'rect') {
    const hw = shape.w / 2;
    const hh = shape.h / 2;
    const r = Math.min(shape.radius, hw, hh);
    if (r <= 0) {
      return [
        { op: 'moveTo', x: -hw, y: -hh },
        { op: 'lineTo', x: hw, y: -hh },
        { op: 'lineTo', x: hw, y: hh },
        { op: 'lineTo', x: -hw, y: hh },
        { op: 'close' }
      ];
    }
    return [
      { op: 'moveTo', x: -hw + r, y: -hh },
      { op: 'arcTo', x1: hw, y1: -hh, x2: hw, y2: hh, r },
      { op: 'arcTo', x1: hw, y1: hh, x2: -hw, y2: hh, r },
      { op: 'arcTo', x1: -hw, y1: hh, x2: -hw, y2: -hh, r },
      { op: 'arcTo', x1: -hw, y1: -hh, x2: hw, y2: -hh, r },
      { op: 'close' }
    ];
  }
  if (shape.kind === 'ellipse') {
    return [{ op: 'ellipse', cx: 0, cy: 0, rx: shape.rx, ry: shape.ry }, { op: 'close' }];
  }
  if (shape.kind === 'line') {
    return [
      { op: 'moveTo', x: -shape.dx / 2, y: -shape.dy / 2 },
      { op: 'lineTo', x: shape.dx / 2, y: shape.dy / 2 }
    ];
  }
  const points = polygonPoints(shape.radius, shape.sides);
  const commands: PathCommand[] = [{ op: 'moveTo', x: points[0].x, y: points[0].y }];
  for (const point of points.slice(1)) commands.push({ op: 'lineTo', x: point.x, y: point.y });
  commands.push({ op: 'close' });
  return commands;
}

/** Drag rectangle with Shift (square) and Alt (from centre) applied. */
export function constrainDragRect(
  start: Point,
  current: Point,
  opts: { square: boolean; fromCenter: boolean }
): { cx: number; cy: number; w: number; h: number } {
  let dx = current.x - start.x;
  let dy = current.y - start.y;
  if (opts.square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = size * (dx < 0 ? -1 : 1);
    dy = size * (dy < 0 ? -1 : 1);
  }
  if (opts.fromCenter) {
    return { cx: start.x, cy: start.y, w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  }
  return { cx: start.x + dx / 2, cy: start.y + dy / 2, w: Math.abs(dx), h: Math.abs(dy) };
}

const LINE_SNAP_RADIANS = (15 * Math.PI) / 180;

/** Line endpoints as a centre plus delta; `snap` quantises the angle to 15 degrees. */
export function constrainLine(
  start: Point,
  current: Point,
  snap: boolean
): { cx: number; cy: number; dx: number; dy: number } {
  let dx = current.x - start.x;
  let dy = current.y - start.y;
  if (snap) {
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / LINE_SNAP_RADIANS) * LINE_SNAP_RADIANS;
    dx = length * Math.cos(angle);
    dy = length * Math.sin(angle);
  }
  return { cx: start.x + dx / 2, cy: start.y + dy / 2, dx, dy };
}

export function clampStrokeWidth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampShape(shape: ShapeSpec): ShapeSpec {
  if (shape.kind === 'rect') {
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);
    const radius = Math.min(Math.max(0, shape.radius), w / 2, h / 2);
    return { kind: 'rect', w, h, radius: Number.isFinite(radius) ? radius : 0 };
  }
  if (shape.kind === 'ellipse') {
    return { kind: 'ellipse', rx: Math.abs(shape.rx), ry: Math.abs(shape.ry) };
  }
  if (shape.kind === 'line') return { kind: 'line', dx: shape.dx, dy: shape.dy };
  return {
    kind: 'polygon',
    radius: Math.abs(shape.radius),
    sides: Math.min(24, Math.max(3, Math.round(shape.sides)))
  };
}

/** Geometric bounding box, ignoring stroke width (see layerNaturalSize for the stroke floor). */
export function shapeNaturalSize(shape: ShapeSpec): Size {
  if (shape.kind === 'rect') return { w: Math.abs(shape.w), h: Math.abs(shape.h) };
  if (shape.kind === 'ellipse') return { w: Math.abs(shape.rx) * 2, h: Math.abs(shape.ry) * 2 };
  if (shape.kind === 'line') return { w: Math.abs(shape.dx), h: Math.abs(shape.dy) };
  const points = polygonPoints(shape.radius, shape.sides);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
