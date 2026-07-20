import { state, notify } from '../state';
import { layerNaturalSize, type ImageLayer } from './document';
import * as history from './history';
import { documentToBitmap, type Point } from './transform-geometry';
import { clampRect, stampBounds, stampPoints, unionRects, type Rect } from './stroke-geometry';
import type { PaintToolId } from '../tools/paint-config';
import { getTransformSession } from './transform-session';
import { getCropSession } from './crop-session';
import { isTransformSessionGuardOpen } from '../transform-session-guard';

export interface StrokeConfig {
  tool: PaintToolId;
  size: number;
  hardness: number;
  opacity: number;
  color: string;
}

export type StrokeRefusal = 'missing' | 'text-layer' | 'hidden' | 'busy';

interface AllocationSnapshot { x: number; y: number; scaleX: number; scaleY: number }

interface Session {
  layerId: string;
  config: StrokeConfig;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  last: Point | null;
  dirty: Rect | null;
  allocated: boolean;
  prevTransform: AllocationSnapshot | null;
}

let session: Session | null = null;
const listeners: Array<() => void> = [];
const emit = () => listeners.forEach((fn) => fn());

export function getStrokeSession(): { layerId: string; config: StrokeConfig; canvas: HTMLCanvasElement } | null {
  return session ? { layerId: session.layerId, config: session.config, canvas: session.canvas } : null;
}

export function subscribeStrokeSession(fn: () => void): void {
  listeners.push(fn);
}

function activeImageLayer(layerId: string): ImageLayer | null {
  const layer = state.doc.layers.find((l) => l.id === layerId);
  return layer && layer.kind === 'image' ? layer : null;
}

function drawStamp(ctx: CanvasRenderingContext2D, point: Point, config: StrokeConfig): void {
  const radius = config.size / 2;
  // The eraser stamps opaque marks: the stroke canvas acts as an alpha mask via destination-out.
  const color = config.tool === 'eraser' ? '#000000' : config.color;
  if (config.tool === 'brush' && config.hardness < 100) {
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(Math.max(0, Math.min(1, config.hardness / 100)), color);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient as unknown as string;
  } else {
    ctx.fillStyle = color;
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function beginStroke(layerId: string, config: StrokeConfig): { ok: true } | { ok: false; reason: StrokeRefusal } {
  if (session) return { ok: false, reason: 'busy' };
  if (getTransformSession() || getCropSession() || isTransformSessionGuardOpen()) {
    return { ok: false, reason: 'busy' };
  }
  const layer = state.doc.layers.find((l) => l.id === layerId);
  if (!layer) return { ok: false, reason: 'missing' };
  if (layer.kind === 'text') return { ok: false, reason: 'text-layer' };
  if (!layer.visible) return { ok: false, reason: 'hidden' };

  let allocated = false;
  let prevTransform: AllocationSnapshot | null = null;
  if (!layer.bitmap) {
    const bitmap = document.createElement('canvas');
    bitmap.width = state.doc.width;
    bitmap.height = state.doc.height;
    prevTransform = { x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY };
    layer.bitmap = bitmap;
    layer.bitmapRev++;
    layer.x = state.doc.width / 2;
    layer.y = state.doc.height / 2;
    layer.scaleX = 100;
    layer.scaleY = 100;
    allocated = true;
  }

  const canvas = document.createElement('canvas');
  canvas.width = layer.bitmap.width;
  canvas.height = layer.bitmap.height;
  session = {
    layerId,
    config,
    canvas,
    ctx: canvas.getContext('2d')!,
    last: null,
    dirty: null,
    allocated,
    prevTransform
  };
  emit();
  return { ok: true };
}

export function addStrokePoint(point: Point): void {
  if (!session) return;
  const layer = activeImageLayer(session.layerId);
  if (!layer || !layer.bitmap) return;
  const natural = layerNaturalSize(layer);
  const target = documentToBitmap(layer, natural, point);
  const stamps = session.last
    ? stampPoints(session.last, target, Math.max(1, session.config.size / 4))
    : [target];
  for (const stamp of stamps) {
    drawStamp(session.ctx, stamp, session.config);
    session.dirty = unionRects(session.dirty, stampBounds(stamp, session.config.size / 2));
  }
  session.last = target;
  notify('composite');
}

function revertAllocation(layer: ImageLayer, prev: AllocationSnapshot): void {
  layer.bitmap = null;
  layer.bitmapRev++;
  layer.x = prev.x;
  layer.y = prev.y;
  layer.scaleX = prev.scaleX;
  layer.scaleY = prev.scaleY;
}

export function cancelStroke(): void {
  if (!session) return;
  const finished = session;
  session = null;
  const layer = activeImageLayer(finished.layerId);
  if (finished.allocated && finished.prevTransform && layer) {
    revertAllocation(layer, finished.prevTransform);
  }
  emit();
  notify('layerProps', 'composite');
}

export function endStroke(): void {
  if (!session) return;
  const finished = session;
  session = null;
  const layer = activeImageLayer(finished.layerId);
  if (!layer || !layer.bitmap) { emit(); return; }

  const rect = finished.dirty
    ? clampRect(finished.dirty, layer.bitmap.width, layer.bitmap.height)
    : null;
  if (!rect) {
    if (finished.allocated && finished.prevTransform) revertAllocation(layer, finished.prevTransform);
    emit();
    notify('layerProps', 'composite');
    return;
  }

  const bctx = layer.bitmap.getContext('2d')!;
  const before = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  bctx.save();
  bctx.globalAlpha = finished.config.opacity / 100;
  bctx.globalCompositeOperation = finished.config.tool === 'eraser' ? 'destination-out' : 'source-over';
  bctx.drawImage(finished.canvas, 0, 0);
  bctx.restore();
  const after = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  layer.bitmapRev++;

  const labels: Record<PaintToolId, string> = {
    brush: 'Brush stroke',
    pencil: 'Pencil stroke',
    eraser: 'Eraser stroke'
  };
  const allocated = finished.allocated;
  const prev = finished.prevTransform;
  const width = layer.bitmap.width;
  const height = layer.bitmap.height;
  const docCenter = { x: state.doc.width / 2, y: state.doc.height / 2 };

  history.push({
    label: labels[finished.config.tool],
    bytes: rect.w * rect.h * 8,
    // The pixels are already composited, so the first do() is an idempotent replay.
    do: () => {
      if (allocated && !layer.bitmap) {
        const bitmap = document.createElement('canvas');
        bitmap.width = width;
        bitmap.height = height;
        layer.bitmap = bitmap;
        layer.x = docCenter.x;
        layer.y = docCenter.y;
        layer.scaleX = 100;
        layer.scaleY = 100;
      }
      layer.bitmap!.getContext('2d')!.putImageData(after, rect.x, rect.y);
      layer.bitmapRev++;
      notify('layerProps', 'composite');
    },
    undo: () => {
      if (allocated && prev) {
        revertAllocation(layer, prev);
      } else {
        layer.bitmap!.getContext('2d')!.putImageData(before, rect.x, rect.y);
        layer.bitmapRev++;
      }
      notify('layerProps', 'composite');
    }
  });
  emit();
  notify('layerProps', 'composite');
}
