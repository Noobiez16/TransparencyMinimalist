import { state, notify } from '../state';
import * as history from './history';
import { cmdAddLayer } from './commands';
import {
  createShapeLayer, measureCharForStyle,
  type ImageLayer, type Layer, type TextLayer
} from './document';
import { layoutText } from './text-layout';
import { traceContours } from './selection-contour';
import { createAnchor, type SubPath } from './path-model';
import { getForeground } from './color-state';

const TRACE_SCALE = 2;   // supersample before tracing, then halve the coordinates

function textLayer(layerId: string): TextLayer | null {
  const layer = state.doc.layers.find((l) => l.id === layerId);
  return layer && layer.kind === 'text' ? layer : null;
}

/** Draw a text layer's laid-out glyphs into a fresh bitmap at `scale`. */
function renderTextBitmap(layer: TextLayer, scale: number): HTMLCanvasElement | null {
  if (layer.text.length === 0) return null;
  const layout = layoutText(layer.text, layer.spans, layer.align, measureCharForStyle);
  const width = Math.round(layout.width * scale);
  const height = Math.round(layout.height * scale);
  if (width < 1 || height < 1) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // save/restore is load-bearing: a 2D context is a singleton per canvas, so leaving the
  // scale applied would offset every later drawImage into this bitmap (the D1 bug).
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of layout.lines) {
    for (const piece of line.pieces) {
      ctx.font = `${piece.style.fontSize}px ${piece.style.fontFamily}`;
      ctx.fillStyle = piece.style.color;
      if (piece.style.tracking === 0) {
        ctx.fillText(piece.text, piece.x, line.baseline);
      } else {
        let cx = piece.x;
        for (const char of piece.text) {
          ctx.fillText(char, cx, line.baseline);
          cx += ctx.measureText(char).width + piece.style.tracking;
        }
      }
    }
  }
  ctx.restore();
  return canvas;
}

/** Convert a text layer to pixels in place, keeping its identity and transform. */
export function rasterizeTextLayer(layerId: string): boolean {
  const index = state.doc.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return false;
  const layer = textLayer(layerId);
  if (!layer) return false;
  const bitmap = renderTextBitmap(layer, 1);
  if (!bitmap) return false;

  const before: Layer = layer;
  const after: ImageLayer = {
    id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity,
    blendMode: layer.blendMode, effects: { ...layer.effects },
    x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY, rotation: layer.rotation,
    kind: 'image', bitmap, bitmapRev: 1, sourceName: null
  };

  history.push({
    label: 'Rasterize type',
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

/**
 * Convert text to a vector shape by tracing its rasterized alpha.
 * Canvas exposes no glyph outlines and the project has zero runtime dependencies, so this
 * produces traced outlines — clean at display sizes, stair-stepped on small text.
 */
export function convertTextToShape(layerId: string): boolean {
  const layer = textLayer(layerId);
  if (!layer) return false;
  const bitmap = renderTextBitmap(layer, TRACE_SCALE);
  if (!bitmap) return false;

  const ctx = bitmap.getContext('2d')!;
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const alpha = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];

  const loops = traceContours(alpha, bitmap.width, bitmap.height);
  if (loops.length === 0) return false;

  const halfW = bitmap.width / TRACE_SCALE / 2;
  const halfH = bitmap.height / TRACE_SCALE / 2;
  const subpaths: SubPath[] = loops.map((loop) => ({
    // Halve the supersampled coordinates and centre on the layer origin.
    anchors: loop.map((p) => createAnchor(p.x / TRACE_SCALE - halfW, p.y / TRACE_SCALE - halfH)),
    closed: true
  }));

  // Outlines are filled, not stroked — a stroke would double the glyph edges.
  const shape = createShapeLayer(state.doc, { kind: 'path', subpaths }, {
    fill: layer.spans.length ? layer.spans[0].style.color : getForeground(),
    stroke: null,
    strokeWidth: 0
  }, `${layer.name} outlines`);
  shape.x = layer.x;
  shape.y = layer.y;
  shape.scaleX = layer.scaleX;
  shape.scaleY = layer.scaleY;
  shape.rotation = layer.rotation;
  history.push(cmdAddLayer(shape, 0, 'Convert type to shape'));
  return true;
}
