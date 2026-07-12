export interface Point { x: number; y: number }
export interface Size { w: number; h: number }

export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface LayerQuad {
  corners: [Point, Point, Point, Point];
  center: Point;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';
export type ResizeHandleId = Exclude<HandleId, 'rotate'>;

export interface ResizeInput {
  start: LayerTransform;
  natural: Size;
  handle: ResizeHandleId;
  startPointer: Point;
  pointer: Point;
  linked: boolean;
  minSize: number;
}

const DEFAULT_ROTATION_OFFSET = 32;
const EPSILON = 1e-12;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function radians(rotation: number): number {
  return (normalizeDegrees(rotation) * Math.PI) / 180;
}

function rotate(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

function safeTransform(transform: LayerTransform): LayerTransform {
  return {
    x: finite(transform.x),
    y: finite(transform.y),
    scaleX: finite(transform.scaleX),
    scaleY: finite(transform.scaleY),
    rotation: normalizeDegrees(transform.rotation)
  };
}

function safeSize(size: Size): Size {
  return { w: Math.abs(finite(size.w)), h: Math.abs(finite(size.h)) };
}

function isInvertibleScale(scalePercent: number): boolean {
  return Math.abs(scalePercent / 100) > EPSILON;
}

export function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  if (Object.is(normalized, -0)) return 0;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function localToDocument(transform: LayerTransform, point: Point): Point {
  const safe = safeTransform(transform);
  const scaled = {
    x: finite(point.x) * safe.scaleX / 100,
    y: finite(point.y) * safe.scaleY / 100
  };
  const rotated = rotate(scaled, radians(safe.rotation));
  return { x: finite(safe.x + rotated.x), y: finite(safe.y + rotated.y) };
}

export function documentToLocal(transform: LayerTransform, point: Point): Point {
  const safe = safeTransform(transform);
  const unrotated = rotate(
    { x: finite(point.x) - safe.x, y: finite(point.y) - safe.y },
    -radians(safe.rotation)
  );
  const scaleX = safe.scaleX / 100;
  const scaleY = safe.scaleY / 100;
  return {
    x: isInvertibleScale(safe.scaleX) ? finite(unrotated.x / scaleX) : 0,
    y: isInvertibleScale(safe.scaleY) ? finite(unrotated.y / scaleY) : 0
  };
}

export function getLayerQuad(transform: LayerTransform, natural: Size): LayerQuad {
  const size = safeSize(natural);
  const corners: [Point, Point, Point, Point] = [
    { x: -size.w / 2, y: -size.h / 2 },
    { x: size.w / 2, y: -size.h / 2 },
    { x: size.w / 2, y: size.h / 2 },
    { x: -size.w / 2, y: size.h / 2 }
  ].map((point) => localToDocument(transform, point)) as [Point, Point, Point, Point];
  const safe = safeTransform(transform);
  return { corners, center: { x: safe.x, y: safe.y } };
}

export function getHandlePoints(
  transform: LayerTransform,
  natural: Size,
  rotationOffset = DEFAULT_ROTATION_OFFSET
): Record<HandleId, Point> {
  const { corners, center } = getLayerQuad(transform, natural);
  const [nw, ne, se, sw] = corners;
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const n = midpoint(nw, ne);
  const offset = Math.max(0, finite(rotationOffset, DEFAULT_ROTATION_OFFSET));
  const outward = rotate({ x: 0, y: -offset }, radians(transform.rotation));
  return {
    nw, n, ne,
    e: midpoint(ne, se),
    se,
    s: midpoint(se, sw),
    sw,
    w: midpoint(sw, nw),
    rotate: { x: finite(n.x + outward.x, center.x), y: finite(n.y + outward.y, center.y) }
  };
}

export function hitTestLayer(transform: LayerTransform, natural: Size, point: Point): boolean {
  const size = safeSize(natural);
  const safe = safeTransform(transform);
  if (
    size.w <= 0 || size.h <= 0 ||
    !isInvertibleScale(safe.scaleX) || !isInvertibleScale(safe.scaleY) ||
    !Number.isFinite(point.x) || !Number.isFinite(point.y)
  ) return false;
  const local = documentToLocal(transform, point);
  return Math.abs(local.x) <= size.w / 2 && Math.abs(local.y) <= size.h / 2;
}

export function hitTestHandle(
  transform: LayerTransform,
  natural: Size,
  point: Point,
  radiusDoc: number,
  rotationOffset = DEFAULT_ROTATION_OFFSET
): HandleId | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const radius = Math.max(0, finite(radiusDoc));
  const radiusSquared = radius * radius;
  const handles = getHandlePoints(transform, natural, rotationOffset);
  const order: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'];
  for (const id of order) {
    const dx = point.x - handles[id].x;
    const dy = point.y - handles[id].y;
    if (dx * dx + dy * dy <= radiusSquared) return id;
  }
  return null;
}

const HANDLE_AXES: Record<ResizeHandleId, Point> = {
  nw: { x: -1, y: -1 }, n: { x: 0, y: -1 }, ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 }, se: { x: 1, y: 1 }, s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 }, w: { x: -1, y: 0 }
};

export function resizeFromHandle(input: ResizeInput): LayerTransform {
  const start = safeTransform(input.start);
  const natural = safeSize(input.natural);
  if (natural.w <= 0 || natural.h <= 0) return { ...start };

  const width = Math.max(EPSILON, natural.w * Math.abs(start.scaleX) / 100);
  const height = Math.max(EPSILON, natural.h * Math.abs(start.scaleY) / 100);
  const minimum = Math.max(0, finite(input.minSize, 1));
  const axes = HANDLE_AXES[input.handle];
  const angle = radians(start.rotation);
  const pointerDelta = rotate({
    x: finite(input.pointer.x) - finite(input.startPointer.x),
    y: finite(input.pointer.y) - finite(input.startPointer.y)
  }, -angle);

  const startHandle = { x: axes.x * width / 2, y: axes.y * height / 2 };
  const anchor = { x: -startHandle.x, y: -startHandle.y };
  let moving = { x: startHandle.x + pointerDelta.x, y: startHandle.y + pointerDelta.y };
  let nextWidth = width;
  let nextHeight = height;

  if (input.linked && axes.x !== 0 && axes.y !== 0) {
    const original = { x: axes.x * width, y: axes.y * height };
    const desired = { x: moving.x - anchor.x, y: moving.y - anchor.y };
    const ratio = (desired.x * original.x + desired.y * original.y) /
      (original.x * original.x + original.y * original.y);
    const minimumRatio = Math.max(minimum / width, minimum / height);
    const clampedRatio = Math.max(minimumRatio, finite(ratio));
    nextWidth = width * clampedRatio;
    nextHeight = height * clampedRatio;
    moving = { x: anchor.x + original.x * clampedRatio, y: anchor.y + original.y * clampedRatio };
  } else {
    if (axes.x !== 0) {
      nextWidth = Math.max(minimum, finite(axes.x * (moving.x - anchor.x)));
      moving.x = anchor.x + axes.x * nextWidth;
    }
    if (axes.y !== 0) {
      nextHeight = Math.max(minimum, finite(axes.y * (moving.y - anchor.y)));
      moving.y = anchor.y + axes.y * nextHeight;
    }
  }

  const centerInStartFrame = {
    x: axes.x === 0 ? 0 : (anchor.x + moving.x) / 2,
    y: axes.y === 0 ? 0 : (anchor.y + moving.y) / 2
  };
  const centerDelta = rotate(centerInStartFrame, angle);
  return {
    x: finite(start.x + centerDelta.x),
    y: finite(start.y + centerDelta.y),
    scaleX: finite(nextWidth / natural.w * 100),
    scaleY: finite(nextHeight / natural.h * 100),
    rotation: start.rotation
  };
}

export function rotationFromPointer(center: Point, pointer: Point, constrained: boolean): number {
  const dx = finite(pointer.x) - finite(center.x);
  const dy = finite(pointer.y) - finite(center.y);
  if (Math.abs(dx) <= EPSILON && Math.abs(dy) <= EPSILON) return 0;
  const degrees = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
  return constrained ? normalizeDegrees(Math.round(degrees / 15) * 15) : degrees;
}
