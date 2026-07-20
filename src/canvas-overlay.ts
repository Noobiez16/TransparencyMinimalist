import { getActiveLayer, layerNaturalSize, type Doc } from './engine/document';
import { getHandlePoints, getLayerQuad, hitTestHandle, type HandleId, type Point } from './engine/transform-geometry';
import type { GuideDescriptor } from './engine/snap-engine';
import { getCropSession, type CropHandle, type CropRect } from './engine/crop-session';
import { getSelectionAlpha } from './engine/selection';
import { traceContours } from './engine/selection-contour';
import { notify } from './state';

const HANDLE_SIZE_PX = 8;
const HANDLE_HIT_RADIUS_PX = 10;
const ROTATION_OFFSET_PX = 32;
let showTransformControls = true;
let activeGuides: GuideDescriptor[] = [];

function safeScale(overlayScale: number): number {
  return Number.isFinite(overlayScale) && overlayScale > 0 ? overlayScale : 1;
}

function transformableLayer(doc: Doc) {
  if (!showTransformControls || getCropSession()) return undefined;
  const layer = getActiveLayer(doc);
  if (!layer || !layer.visible) return undefined;
  const natural = layerNaturalSize(layer);
  if (natural.w <= 0 || natural.h <= 0 || layer.scaleX === 0 || layer.scaleY === 0) return undefined;
  return { layer, natural };
}

export function getShowTransformControls(): boolean {
  return showTransformControls;
}

export function setShowTransformControls(show: boolean): void {
  showTransformControls = show;
  notify('composite');
}

export function getActiveGuides(): GuideDescriptor[] {
  return activeGuides.map((guide) => ({ ...guide }));
}

export function setActiveGuides(guides: readonly GuideDescriptor[]): void {
  activeGuides = guides.map((guide) => ({ ...guide }));
}

export function clearActiveGuides(): void {
  activeGuides = [];
}

let antsPhase = 0;
let contourCache: Point[][] = [];
let contourKey = '';

export function setAntsPhase(phase: number): void { antsPhase = phase; }

/** Cheap change signature: sampled alpha, enough to catch selection edits. */
function antsSignature(alpha: Uint8Array): number {
  let sum = 0;
  const step = Math.max(1, Math.floor(alpha.length / 4096));
  for (let i = 0; i < alpha.length; i += step) sum = (sum + alpha[i] * (i + 1)) % 2147483647;
  return sum;
}

function drawSelectionAnts(ctx: CanvasRenderingContext2D, doc: Doc, scale: number): void {
  const alpha = getSelectionAlpha();
  if (!alpha) { contourCache = []; contourKey = ''; return; }
  const key = `${doc.width}x${doc.height}:${alpha.length}:${antsSignature(alpha)}`;
  if (key !== contourKey) {
    contourKey = key;
    contourCache = traceContours(alpha, doc.width, doc.height);
  }
  if (contourCache.length === 0) return;
  ctx.save();
  ctx.lineWidth = 1 / scale;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)';
    ctx.setLineDash(pass === 0 ? [] : [4 / scale, 4 / scale]);
    ctx.lineDashOffset = pass === 0 ? 0 : -antsPhase / scale;
    ctx.beginPath();
    for (const loop of contourCache) {
      if (loop.length < 2) continue;
      ctx.moveTo(loop[0].x, loop[0].y);
      for (const point of loop.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

let hoverPoint: Point | null = null;
let hoverRadius = 0;

/** Brush outline cursor: `point` in document space, `radiusDoc` in document pixels. */
export function setPaintHover(point: Point | null, radiusDoc: number): void {
  hoverPoint = point;
  hoverRadius = radiusDoc;
}

function drawPaintCursor(ctx: CanvasRenderingContext2D, scale: number): void {
  if (!hoverPoint || hoverRadius <= 0) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  ctx.arc(hoverPoint.x, hoverPoint.y, hoverRadius + 1 / scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(hoverPoint.x, hoverPoint.y, hoverRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGuides(ctx: CanvasRenderingContext2D, scale: number): void {
  if (!activeGuides.length) return;
  const lineWidth = 1 / scale;
  const tick = 4 / scale;
  const fontSize = 11 / scale;
  ctx.save();
  ctx.strokeStyle = '#28d7d1';
  ctx.fillStyle = '#e8ffff';
  ctx.lineWidth = lineWidth;
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const guide of activeGuides) {
    ctx.beginPath();
    if (guide.kind === 'alignment') {
      if (guide.axis === 'x') {
        ctx.moveTo(guide.position, guide.start);
        ctx.lineTo(guide.position, guide.end);
      } else {
        ctx.moveTo(guide.start, guide.position);
        ctx.lineTo(guide.end, guide.position);
      }
      ctx.stroke();
      continue;
    }
    if (guide.axis === 'x') {
      ctx.moveTo(guide.from, guide.cross);
      ctx.lineTo(guide.to, guide.cross);
      ctx.moveTo(guide.from, guide.cross - tick);
      ctx.lineTo(guide.from, guide.cross + tick);
      ctx.moveTo(guide.to, guide.cross - tick);
      ctx.lineTo(guide.to, guide.cross + tick);
    } else {
      ctx.moveTo(guide.cross, guide.from);
      ctx.lineTo(guide.cross, guide.to);
      ctx.moveTo(guide.cross - tick, guide.from);
      ctx.lineTo(guide.cross + tick, guide.from);
      ctx.moveTo(guide.cross - tick, guide.to);
      ctx.lineTo(guide.cross + tick, guide.to);
    }
    ctx.stroke();
    const labelX = guide.axis === 'x' ? (guide.from + guide.to) / 2 : guide.cross;
    const labelY = guide.axis === 'x' ? guide.cross - 10 / scale : (guide.from + guide.to) / 2;
    ctx.lineWidth = 3 / scale;
    ctx.strokeStyle = 'rgba(15, 20, 28, 0.98)';
    ctx.strokeText(guide.label, labelX, labelY);
    ctx.fillText(guide.label, labelX, labelY);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = '#28d7d1';
  }
  ctx.restore();
}

function cropHandlePoints(rect: CropRect): Record<Exclude<CropHandle, 'move'>, Point> {
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return {
    nw: { x: rect.x, y: rect.y },
    n: { x: midX, y: rect.y },
    ne: { x: right, y: rect.y },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: rect.x, y: bottom },
    w: { x: rect.x, y: midY }
  };
}

export function hitTestCropOverlay(point: Point, overlayScale: number): CropHandle | null {
  const session = getCropSession();
  if (!session) return null;
  const scale = safeScale(overlayScale);
  const radius = HANDLE_HIT_RADIUS_PX / scale;
  const rect = session.rect;
  const handles = cropHandlePoints(rect);
  let best: { id: CropHandle; distance: number } | null = null;
  for (const [id, handle] of Object.entries(handles) as [Exclude<CropHandle, 'move'>, Point][]) {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance <= radius && (!best || distance < best.distance)) best = { id, distance };
  }
  if (best) return best.id;
  const inside = point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height;
  return inside ? 'move' : null;
}

function drawCropOverlay(ctx: CanvasRenderingContext2D, doc: Doc, scale: number): void {
  const session = getCropSession();
  if (!session) return;
  const rect = session.rect;
  const lineWidth = 1 / scale;
  const handleSize = HANDLE_SIZE_PX / scale;
  const halfHandle = handleSize / 2;

  ctx.save();
  // Excluded-area shading (document minus crop window, even-odd fill).
  ctx.fillStyle = 'rgba(8, 10, 14, 0.55)';
  ctx.beginPath();
  ctx.rect(0, 0, doc.width, doc.height);
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.fill('evenodd');

  // Rule-of-thirds grid inside the crop window.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let step = 1; step <= 2; step++) {
    const gx = rect.x + (rect.width * step) / 3;
    const gy = rect.y + (rect.height * step) / 3;
    ctx.moveTo(gx, rect.y);
    ctx.lineTo(gx, rect.y + rect.height);
    ctx.moveTo(rect.x, gy);
    ctx.lineTo(rect.x + rect.width, gy);
  }
  ctx.stroke();

  // Crop border and handles at constant screen size.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = 'rgba(20, 24, 32, 0.95)';
  for (const handle of Object.values(cropHandlePoints(rect))) {
    ctx.fillRect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
    ctx.strokeRect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
  }
  ctx.restore();
}

export function hitTestCanvasOverlay(
  doc: Doc,
  point: Point,
  overlayScale: number
): HandleId | null {
  const target = transformableLayer(doc);
  if (!target) return null;
  const scale = safeScale(overlayScale);
  return hitTestHandle(
    target.layer,
    target.natural,
    point,
    HANDLE_HIT_RADIUS_PX / scale,
    ROTATION_OFFSET_PX / scale
  );
}

export function drawCanvasOverlay(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  { overlayScale }: { overlayScale: number }
): void {
  const scale = safeScale(overlayScale);
  drawGuides(ctx, scale);
  drawCropOverlay(ctx, doc, scale);
  drawSelectionAnts(ctx, doc, scale);
  drawPaintCursor(ctx, scale); // before the transformable-layer early return
  const target = transformableLayer(doc);
  if (!target) return;
  const quad = getLayerQuad(target.layer, target.natural);
  const handles = getHandlePoints(target.layer, target.natural, ROTATION_OFFSET_PX / scale);
  const lineWidth = 1 / scale;
  const handleSize = HANDLE_SIZE_PX / scale;
  const halfHandle = handleSize / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(20, 24, 32, 0.95)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(quad.corners[0].x, quad.corners[0].y);
  for (let index = 1; index < quad.corners.length; index++) {
    ctx.lineTo(quad.corners[index].x, quad.corners[index].y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(handles.n.x, handles.n.y);
  ctx.lineTo(handles.rotate.x, handles.rotate.y);
  ctx.stroke();

  const resizeHandles: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  for (const id of resizeHandles) {
    const handle = handles[id];
    ctx.fillRect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
    ctx.strokeRect(handle.x - halfHandle, handle.y - halfHandle, handleSize, handleSize);
  }
  ctx.beginPath();
  ctx.arc(handles.rotate.x, handles.rotate.y, halfHandle, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
