import { state, getFilterString, type LayerState } from './state';
import { toast } from './toast';
import { $ } from './dom';

function mapBlendModeToCompositeOp(blend: string): GlobalCompositeOperation {
  switch (blend) {
    case 'multiply': return 'multiply';
    case 'screen': return 'screen';
    case 'overlay': return 'overlay';
    case 'darken': return 'darken';
    case 'lighten': return 'lighten';
    default: return 'source-over';
  }
}

// Helper to draw image using cover cropping bounds (mimicking CSS object-fit: cover)
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = w / h;
  let sx = 0, sy = 0, sWidth = img.naturalWidth, sHeight = img.naturalHeight;

  if (imgRatio > targetRatio) {
    sWidth = img.naturalHeight * targetRatio;
    sx = (img.naturalWidth - sWidth) / 2;
  } else {
    sHeight = img.naturalWidth / targetRatio;
    sy = (img.naturalHeight - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, -w / 2, -h / 2, w, h);
}

export function exportComposition(): void {
  if (state.layers.length === 0) {
    toast('Add at least one layer to export.');
    return;
  }

  // Pre-load all image layers asynchronously before drawing
  const loadPromises = state.layers.map((layer) => {
    if (layer.type === 'image' && layer.imageSrc) {
      return new Promise<{ layer: LayerState; img: HTMLImageElement | null }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ layer, img });
        img.onerror = () => resolve({ layer, img: null });
        img.src = layer.imageSrc!;
      });
    } else {
      return Promise.resolve({ layer, img: null });
    }
  });

  Promise.all(loadPromises).then((loadedLayers) => {
    const canvas = document.createElement('canvas');
    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw background
    if (state.canvasBgType === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (state.canvasBgType === 'black') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (state.canvasBgType === 'custom') {
      ctx.fillStyle = state.canvasBgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Scale multiplier for physical blur scaling (aspect-ratio aware)
    const scaleFactor = Math.max(canvas.width, canvas.height) / 500;

    // Draw layers sequentially from bottom to top (reversed array)
    [...loadedLayers].reverse().forEach(({ layer, img }) => {
      if (!layer.visible) return;

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = mapBlendModeToCompositeOp(layer.blendMode);

      // Apply transformations
      const dx = (layer.xOffset / 100) * canvas.width;
      const dy = (layer.yOffset / 100) * canvas.height;
      ctx.translate(canvas.width / 2 + dx, canvas.height / 2 + dy);
      ctx.scale(layer.scale / 100, layer.scale / 100);

      // Apply filters
      ctx.filter = getFilterString(layer, scaleFactor);

      if (layer.type === 'image' && img) {
        // Draw image cropped-to-fit centered
        drawCoverImage(ctx, img, canvas.width, canvas.height);
      } else if (layer.type === 'text') {
        // Draw scaled text line-by-line to support multi-line newlines
        const scaledFontSize = Math.round(layer.fontSize * scaleFactor);
        ctx.font = `${scaledFontSize}px ${layer.fontFamily}`;
        ctx.fillStyle = layer.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = layer.textContent.split('\n');
        const lineHeight = scaledFontSize * 1.2;
        const totalHeight = (lines.length - 1) * lineHeight;
        const startingY = -totalHeight / 2;

        lines.forEach((line, index) => {
          ctx.fillText(line, 0, startingY + index * lineHeight);
        });
      }

      ctx.restore();
    });

    const failed = loadedLayers.filter(
      (x) => x.layer.type === 'image' && x.layer.imageSrc && !x.img
    ).length;
    if (failed > 0) toast(`${failed} layer(s) could not be rendered.`);

    // Trigger download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `composition_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  });
}

export function initExport(): void {
  $('btn-export').addEventListener('click', exportComposition);
}
