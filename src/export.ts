import { state } from './state';
import { renderToCanvas } from './engine/compositor';
import { toast } from './toast';
import { $ } from './dom';

export function exportComposition(): void {
  if (state.doc.layers.length === 0) { toast('Add at least one layer to export.'); return; }
  renderToCanvas(state.doc).toBlob((blob) => {
    if (!blob) { toast('Export failed.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `composition_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function initExport(): void { $('btn-export').addEventListener('click', exportComposition); }
