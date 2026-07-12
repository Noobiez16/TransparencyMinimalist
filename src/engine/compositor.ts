import { type Doc, type Layer, type BlendMode, getFilterString, getActiveLayer, layerNaturalSize } from './document';

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
    if (layer.bitmap) ctx.drawImage(layer.bitmap, -layer.bitmap.width / 2, -layer.bitmap.height / 2);
  } else {
    ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = layer.text.split('\n');
    const lineHeight = layer.fontSize * 1.2;
    const startY = (-(lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 0, startY + i * lineHeight));
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
    const active = getActiveLayer(doc);
    if (active && active.visible) drawOutline(ctx, active, opts.overlayScale ?? 1);
  }
}

function drawOutline(ctx: CanvasRenderingContext2D, layer: Layer, screenScale: number): void {
  const { w, h } = layerNaturalSize(layer);
  if (w === 0 && h === 0) return;
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scaleX / 100, layer.scaleY / 100);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  // 1 SCREEN pixel regardless of doc scale and zoom
  ctx.lineWidth = (100 / Math.max(Math.abs(layer.scaleX), Math.abs(layer.scaleY))) / screenScale;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

export function renderToCanvas(doc: Doc): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  composite(doc, canvas.getContext('2d')!);
  return canvas;
}
