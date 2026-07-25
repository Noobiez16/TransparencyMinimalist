import { state, notify } from '../state';
import * as history from './history';
import { layerNaturalSize, type ImageLayer } from './document';
import { documentToBitmapMatrix } from './transform-geometry';
import { clampRect } from './stroke-geometry';
import { getSelectionBounds, getSelectionMask } from './selection';
import { beginCrop, previewCrop, applyCrop } from './crop-session';

function activeImageLayer(): ImageLayer | null {
  const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
  return layer && layer.kind === 'image' && layer.bitmap ? layer : null;
}

/** The selection mask rendered into the layer's bitmap space. */
function maskInBitmapSpace(layer: ImageLayer): HTMLCanvasElement | null {
  const mask = getSelectionMask();
  if (!mask || !layer.bitmap) return null;
  const matrix = documentToBitmapMatrix(layer, layerNaturalSize(layer));
  const clip = document.createElement('canvas');
  clip.width = layer.bitmap.width;
  clip.height = layer.bitmap.height;
  const ctx = clip.getContext('2d')!;
  ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  ctx.drawImage(mask, 0, 0);
  return clip;
}

function applyWithinSelection(
  label: string,
  paint: (ctx: CanvasRenderingContext2D, clip: HTMLCanvasElement) => void
): boolean {
  const layer = activeImageLayer();
  if (!layer || !layer.bitmap) return false;
  const clip = maskInBitmapSpace(layer);
  if (!clip) return false;
  const rect = clampRect(
    { x: 0, y: 0, w: layer.bitmap.width, h: layer.bitmap.height },
    layer.bitmap.width, layer.bitmap.height
  );
  if (!rect) return false;

  const bctx = layer.bitmap.getContext('2d')!;
  const before = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  paint(bctx, clip);
  const after = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  layer.bitmapRev++;

  history.push({
    label,
    bytes: rect.w * rect.h * 8,
    // The pixels are already applied, so the first do() is an idempotent replay.
    do: () => {
      layer.bitmap!.getContext('2d')!.putImageData(after, rect.x, rect.y);
      layer.bitmapRev++;
      notify('layerProps', 'composite');
    },
    undo: () => {
      layer.bitmap!.getContext('2d')!.putImageData(before, rect.x, rect.y);
      layer.bitmapRev++;
      notify('layerProps', 'composite');
    }
  });
  notify('layerProps', 'composite');
  return true;
}

export function clearSelection(): boolean {
  return applyWithinSelection('Clear selection', (ctx, clip) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(clip, 0, 0);
    ctx.restore();
  });
}

export function fillSelection(color: string): boolean {
  return applyWithinSelection('Fill selection', (ctx, clip) => {
    // Tint the clip, then composite it so only selected pixels receive paint.
    const tinted = document.createElement('canvas');
    tinted.width = clip.width;
    tinted.height = clip.height;
    const tctx = tinted.getContext('2d')!;
    tctx.drawImage(clip, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, tinted.width, tinted.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tinted, 0, 0);
    ctx.restore();
  });
}

export function cropToSelection(): boolean {
  const bounds = getSelectionBounds();
  if (!bounds || bounds.w < 1 || bounds.h < 1) return false;
  if (!beginCrop()) return false;
  previewCrop({ x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h });
  return applyCrop();
}
