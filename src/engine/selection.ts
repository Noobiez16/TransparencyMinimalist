import { state, notify } from '../state';
import * as history from './history';
import {
  boundsFromAlpha, compositeOpFor, opsPointCount, reduceOps,
  type Rect, type SelectionOp, type SelectionShape
} from './selection-ops';

let ops: SelectionOp[] = [];
let lastNonEmpty: SelectionOp[] = [];
const listeners: Array<() => void> = [];

let maskCache: HTMLCanvasElement | null = null;
let alphaCache: Uint8Array | null = null;
let boundsCache: Rect | null = null;
let cacheKey = '';

const emit = () => listeners.forEach((fn) => fn());

function invalidate(): void {
  maskCache = null;
  alphaCache = null;
  boundsCache = null;
  cacheKey = '';
}

export function subscribeSelection(fn: () => void): void { listeners.push(fn); }

export function hasSelection(): boolean { return ops.length > 0; }

export function getSelectionOps(): SelectionOp[] { return [...ops]; }

function drawShape(ctx: CanvasRenderingContext2D, shape: SelectionShape): void {
  ctx.beginPath();
  if (shape.kind === 'rect') {
    ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    return;
  }
  if (shape.kind === 'ellipse') {
    ctx.ellipse(shape.cx, shape.cy, Math.abs(shape.rx), Math.abs(shape.ry), 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape.points.length < 3) return;
  ctx.moveTo(shape.points[0].x, shape.points[0].y);
  for (const point of shape.points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fill();
}

/** Rasterize the op list into a document-sized mask (alpha = selected). */
function rasterize(): HTMLCanvasElement | null {
  if (ops.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = state.doc.width;
  canvas.height = state.doc.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  for (const op of ops) {
    if (op.kind === 'all') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      continue;
    }
    if (op.kind === 'invert') {
      const inverted = document.createElement('canvas');
      inverted.width = canvas.width;
      inverted.height = canvas.height;
      const ictx = inverted.getContext('2d')!;
      ictx.fillStyle = '#ffffff';
      ictx.fillRect(0, 0, inverted.width, inverted.height);
      ictx.globalCompositeOperation = 'destination-out';
      ictx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(inverted, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      continue;
    }
    if (op.mode === 'new') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.globalCompositeOperation = compositeOpFor(op.mode);
    }
    ctx.save();
    drawShape(ctx, op.shape);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

function ensureCaches(): void {
  const key = `${ops.length}:${state.doc.width}x${state.doc.height}:${JSON.stringify(ops)}`;
  if (key === cacheKey && (maskCache || ops.length === 0)) return;
  cacheKey = key;
  maskCache = rasterize();
  if (!maskCache) { alphaCache = null; boundsCache = null; return; }
  const ctx = maskCache.getContext('2d')!;
  const data = ctx.getImageData(0, 0, maskCache.width, maskCache.height).data;
  const alpha = new Uint8Array(maskCache.width * maskCache.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  alphaCache = alpha;
  boundsCache = boundsFromAlpha(alpha, maskCache.width, maskCache.height);
}

export function getSelectionMask(): HTMLCanvasElement | null { ensureCaches(); return maskCache; }
export function getSelectionAlpha(): Uint8Array | null { ensureCaches(); return alphaCache; }
export function getSelectionBounds(): Rect | null { ensureCaches(); return boundsCache; }

function setOps(next: SelectionOp[]): void {
  ops = next;
  if (next.length > 0) lastNonEmpty = [...next];
  invalidate();
  emit();
  notify('composite');
}

/** Push one history command carrying the before/after op arrays. */
function pushSelectionCommand(label: string, next: SelectionOp[]): void {
  const before = [...ops];
  const after = [...next];
  history.push({
    label,
    bytes: (opsPointCount(before) + opsPointCount(after)) * 16,
    do: () => setOps([...after]),
    undo: () => setOps([...before])
  });
}

export function commitSelection(op: SelectionOp, label: string): void {
  pushSelectionCommand(label, reduceOps(ops, op));
}

export function selectAll(): void {
  pushSelectionCommand('Select all', reduceOps(ops, { kind: 'all' }));
}

export function deselect(): void {
  if (ops.length === 0) return;
  pushSelectionCommand('Deselect', []);
}

export function reselect(): void {
  if (ops.length > 0 || lastNonEmpty.length === 0) return;
  pushSelectionCommand('Reselect', [...lastNonEmpty]);
}

export function invertSelection(): void {
  if (ops.length === 0) { selectAll(); return; }
  pushSelectionCommand('Inverse selection', reduceOps(ops, { kind: 'invert' }));
}

export function __setSelectionOpsForTest(next: SelectionOp[]): void {
  ops = [...next];
  lastNonEmpty = next.length ? [...next] : [];
  invalidate();
}
