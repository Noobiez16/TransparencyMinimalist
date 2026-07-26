import { type Doc, type Layer, type BlendMode, getFilterString, measureCharForStyle } from './document';
import { layoutText } from './text-layout';
import { drawCanvasOverlay } from '../canvas-overlay';
import { getStrokeSession } from './stroke-session';
import { shapeCommands } from './shape-geometry';
import { replayPathCommands } from './path-render';

const BLEND_TO_OP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen',
  overlay: 'overlay', darken: 'darken', lighten: 'lighten'
};

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = BLEND_TO_OP[layer.blendMode];
  ctx.filter = getFilterString(layer.effects, layer.kind);
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scaleX / 100, layer.scaleY / 100);
  if (layer.kind === 'image') {
    if (layer.bitmap) {
      const stroke = getStrokeSession();
      const live = stroke && stroke.layerId === layer.id ? stroke : null;
      const halfX = -layer.bitmap.width / 2;
      const halfY = -layer.bitmap.height / 2;
      if (live && live.config.tool === 'eraser') {
        // Truthful erase preview: punch the in-progress stroke out of a scratch copy.
        const scratch = document.createElement('canvas');
        scratch.width = layer.bitmap.width;
        scratch.height = layer.bitmap.height;
        const sctx = scratch.getContext('2d')!;
        sctx.drawImage(layer.bitmap, 0, 0);
        sctx.globalAlpha = live.config.opacity / 100;
        sctx.globalCompositeOperation = 'destination-out';
        sctx.drawImage(live.canvas, 0, 0);
        ctx.drawImage(scratch, halfX, halfY);
      } else {
        ctx.drawImage(layer.bitmap, halfX, halfY);
        if (live) {
          const outerAlpha = ctx.globalAlpha;
          ctx.globalAlpha = outerAlpha * (live.config.opacity / 100);
          ctx.drawImage(live.canvas, halfX, halfY);
          ctx.globalAlpha = outerAlpha;
        }
      }
    }
  } else if (layer.kind === 'text') {
    const layout = layoutText(layer.text, layer.spans, layer.align, measureCharForStyle);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const originX = -layout.width / 2;
    const originY = -layout.height / 2;
    for (const line of layout.lines) {
      for (const piece of line.pieces) {
        ctx.font = `${piece.style.fontSize}px ${piece.style.fontFamily}`;
        ctx.fillStyle = piece.style.color;
        if (piece.style.tracking === 0) {
          ctx.fillText(piece.text, originX + piece.x, originY + line.baseline);
        } else {
          // Tracking means per-character placement, matching how the layout measured it.
          let cx = originX + piece.x;
          for (const char of piece.text) {
            ctx.fillText(char, cx, originY + line.baseline);
            cx += ctx.measureText(char).width + piece.style.tracking;
          }
        }
      }
    }
  } else {
    ctx.beginPath();
    replayPathCommands(ctx, shapeCommands(layer.shape));
    if (layer.fill) {
      ctx.fillStyle = layer.fill;
      ctx.fill();
    }
    if (layer.stroke && layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function composite(doc: Doc, ctx: CanvasRenderingContext2D, opts: { overlay?: boolean; overlayScale?: number } = {}): void {
  ctx.clearRect(0, 0, doc.width, doc.height);
  if (doc.bgType !== 'transparent') {
    ctx.fillStyle = doc.bgType === 'white' ? '#ffffff' : doc.bgType === 'black' ? '#000000' : doc.bgColor;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const layer of [...doc.layers].reverse()) {
    if (!layer.visible) continue;
    drawLayer(ctx, layer);
  }
  if (opts.overlay) {
    drawCanvasOverlay(ctx, doc, { overlayScale: opts.overlayScale ?? 1 });
  }
}

export function renderToCanvas(doc: Doc): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  composite(doc, canvas.getContext('2d')!);
  return canvas;
}
