import { $ } from '../dom';
import { state, subscribe } from '../state';
import { getZoomPercent, setZoomPercent } from '../canvas';
import { getActiveTool, onToolChange } from '../engine/tools';
import type { Doc } from '../engine/document';

export function parseZoomInput(text: string): number | null {
  const match = text.trim().match(/^(\d+)\s*%?$/);
  if (!match) return null;
  return Math.max(25, Math.min(400, parseInt(match[1], 10)));
}

export function formatDocSizes(doc: Doc): string {
  const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  const flat = doc.width * doc.height * 4;
  let layered = flat;
  for (const layer of doc.layers) {
    if (layer.kind === 'image' && layer.bitmap) layered += layer.bitmap.width * layer.bitmap.height * 4;
  }
  return `${mb(flat)} / ${mb(layered)}`;
}

type Metric = 'dimensions' | 'sizes' | 'tool';
let metric: Metric = 'dimensions';

function metricText(): string {
  if (metric === 'sizes') return formatDocSizes(state.doc);
  if (metric === 'tool') return getActiveTool().label;
  return `${state.doc.width} × ${state.doc.height}`;
}

export function initDocumentTab(): void {
  const zoom = $('doc-tab-zoom');
  const sync = () => { zoom.textContent = `${getZoomPercent()}%`; };
  subscribe((dirty) => { if (dirty.has('view')) sync(); });
  sync();
}

export function initStatusBar(): void {
  const field = $('status-zoom-field') as unknown as HTMLInputElement;
  const display = $('status-doc-size');
  const selector = $('status-metric');
  const syncZoom = () => { if (document.activeElement !== field) field.value = `${getZoomPercent()}%`; };
  const syncMetric = () => { display.textContent = metricText(); };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = parseZoomInput(field.value);
      if (value !== null) setZoomPercent(value);
      field.blur();
    }
    if (e.key === 'Escape') { syncZoom(); field.blur(); }
  });
  field.addEventListener('blur', syncZoom);
  selector.addEventListener('click', () => {
    metric = metric === 'dimensions' ? 'sizes' : metric === 'sizes' ? 'tool' : 'dimensions';
    selector.title = `Metric: ${metric}`;
    syncMetric();
  });
  subscribe((dirty) => {
    if (dirty.has('view')) syncZoom();
    if (dirty.has('canvasConfig') || dirty.has('structure')) syncMetric();
  });
  onToolChange(syncMetric);
  syncZoom();
  syncMetric();
}
