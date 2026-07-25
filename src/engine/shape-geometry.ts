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
