import { state, notify } from '../state';
import * as history from './history';
import { cmdAddLayer } from './commands';
import { createShapeLayer, layerNaturalSize, type ImageLayer } from './document';
import { getBackground, getForeground } from './color-state';
import { getActivePath } from './path-store';
import { pathBounds, pathToCommands, translateSubPath } from './path-geometry';
import { replayPathCommands } from './path-render';
import { createAnchor, createPathItem, type SubPath } from './path-model';
import { commitSelection, getSelectionAlpha } from './selection';
import { documentToBitmapMatrix } from './transform-geometry';
import { clampRect } from './stroke-geometry';
import { traceContours } from './selection-contour';

function activeSubPaths(): SubPath[] | null {
  const path = getActivePath();
  if (!path) return null;
  const usable = path.subpaths.filter((s) => s.anchors.length >= 2);
  return usable.length ? usable : null;
}

/** Convert the active path into a D1 vector shape layer, recentred on its own origin. */
export function convertPathToShape(): boolean {
  const subpaths = activeSubPaths();
  if (!subpaths) return false;
  const bounds = pathBounds(subpaths);
  if (!bounds) return false;
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  // Shape geometry is origin-centred; path anchors are document-space.
  let centred = subpaths;
  for (let i = 0; i < centred.length; i++) centred = translateSubPath(centred, i, -cx, -cy);

  const layer = createShapeLayer(state.doc, { kind: 'path', subpaths: centred }, {
    fill: getForeground(),
    stroke: getBackground(),
    strokeWidth: 2
  });
  layer.x = cx;
  layer.y = cy;
  history.push(cmdAddLayer(layer, 0, 'Convert path to shape'));
  return true;
}

/** Rasterize the active path into the Phase C selection mask. */
export function loadPathAsSelection(): boolean {
  const subpaths = activeSubPaths();
  if (!subpaths) return false;
  commitSelection({ kind: 'path', subpaths, mode: 'new' }, 'Path to selection');
  return true;
}

function activeImageLayer(): ImageLayer | null {
  const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
  return layer && layer.kind === 'image' && layer.bitmap ? layer : null;
}

/** Paint the active path onto the active image layer, one undoable dirty-rect command. */
function paintPath(label: string, paint: (ctx: CanvasRenderingContext2D) => void): boolean {
  const subpaths = activeSubPaths();
  const layer = activeImageLayer();
  if (!subpaths || !layer || !layer.bitmap) return false;
  const rect = clampRect(
    { x: 0, y: 0, w: layer.bitmap.width, h: layer.bitmap.height },
    layer.bitmap.width, layer.bitmap.height
  );
  if (!rect) return false;

  const ctx = layer.bitmap.getContext('2d')!;
  const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  const matrix = documentToBitmapMatrix(layer, layerNaturalSize(layer));
  ctx.save();
  ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  ctx.beginPath();
  replayPathCommands(ctx, pathToCommands(subpaths));
  paint(ctx);
  ctx.restore();
  const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  layer.bitmapRev++;

  history.push({
    label,
    bytes: rect.w * rect.h * 8,
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

export function fillPath(): boolean {
  return paintPath('Fill path', (ctx) => {
    ctx.fillStyle = getForeground();
    ctx.closePath();
    ctx.fill();
  });
}

export function strokePath(): boolean {
  return paintPath('Stroke path', (ctx) => {
    ctx.strokeStyle = getForeground();
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/**
 * Trace the current selection into an editable path. Photoshop fits smooth curves under a
 * tolerance setting; this produces corner anchors, which can then be smoothed by hand.
 */
export function makeWorkPathFromSelection(): boolean {
  const alpha = getSelectionAlpha();
  if (!alpha) return false;
  const loops = traceContours(alpha, state.doc.width, state.doc.height);
  if (loops.length === 0) return false;
  const subpaths: SubPath[] = loops.map((loop) => ({
    anchors: loop.map((p) => createAnchor(p.x, p.y)),
    closed: true
  }));
  const path = createPathItem('Work Path');
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Make work path',
    do: () => {
      state.doc.paths.push(path);
      path.subpaths = subpaths;
      state.doc.activePathId = path.id;
      notify('structure', 'composite');
    },
    undo: () => {
      state.doc.paths = state.doc.paths.filter((p) => p.id !== path.id);
      state.doc.activePathId = prevActive;
      notify('structure', 'composite');
    }
  });
  return true;
}
