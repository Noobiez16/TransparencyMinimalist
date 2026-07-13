import { getActiveLayer, layerNaturalSize, type Doc } from './engine/document';
import { getHandlePoints, getLayerQuad, hitTestHandle, type HandleId, type Point } from './engine/transform-geometry';
import type { GuideDescriptor } from './engine/snap-engine';

const HANDLE_SIZE_PX = 8;
const HANDLE_HIT_RADIUS_PX = 10;
const ROTATION_OFFSET_PX = 32;
let showTransformControls = true;
let activeGuides: GuideDescriptor[] = [];

function safeScale(overlayScale: number): number {
  return Number.isFinite(overlayScale) && overlayScale > 0 ? overlayScale : 1;
}

function transformableLayer(doc: Doc) {
  if (!showTransformControls) return undefined;
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
