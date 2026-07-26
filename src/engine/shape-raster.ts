import { state, notify } from '../state';
import * as history from './history';
import { layerNaturalSize, type ImageLayer, type Layer, type ShapeLayer } from './document';
import { shapeCommands } from './shape-geometry';
import { replayPathCommands } from './path-render';

/** Draw a shape layer's geometry into a fresh bitmap at its natural size. */
function renderShapeBitmap(layer: ShapeLayer): HTMLCanvasElement | null {
  const size = layerNaturalSize(layer);
  const width = Math.round(size.w);
  const height = Math.round(size.h);
  if (width < 1 || height < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // save/restore is load-bearing: a 2D context is a singleton per canvas, so leaving the
  // translate applied would offset every later drawImage into this bitmap (e.g. brush strokes).
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.beginPath();
  replayPathCommands(ctx, shapeCommands(layer.shape));
  if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(); }
  if (layer.stroke && layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

/**
 * Convert a shape layer to pixels in place, keeping its id, name, transform, and
 * effects so history, the layers panel, and selection all keep pointing at it.
 */
export function rasterizeShapeLayer(layerId: string): boolean {
  const index = state.doc.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return false;
  const layer = state.doc.layers[index];
  if (layer.kind !== 'shape') return false;
  const bitmap = renderShapeBitmap(layer);
  if (!bitmap) return false;

  const before: Layer = layer;
  const after: ImageLayer = {
    id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity,
    blendMode: layer.blendMode, effects: { ...layer.effects },
    x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY, rotation: layer.rotation,
    kind: 'image', bitmap, bitmapRev: 1, sourceName: null
  };

  history.push({
    label: 'Rasterize shape',
    bytes: bitmap.width * bitmap.height * 4,
    do: () => {
      const at = state.doc.layers.findIndex((l) => l.id === layerId);
      if (at >= 0) state.doc.layers[at] = after;
      notify('structure', 'layerProps', 'composite');
    },
    undo: () => {
      const at = state.doc.layers.findIndex((l) => l.id === layerId);
      if (at >= 0) state.doc.layers[at] = before;
      notify('structure', 'layerProps', 'composite');
    }
  });
  return true;
}
