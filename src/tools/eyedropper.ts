import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { renderToCanvas } from '../engine/compositor';
import { setForeground } from '../engine/color-state';

let lastSample = '—';

function sample(p: DocPoint): void {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= state.doc.width || y >= state.doc.height) return;
  const pixel = renderToCanvas(state.doc).getContext('2d')!.getImageData(x, y, 1, 1).data;
  if (pixel[3] === 0) return; // transparent: keep the current foreground
  const hex = `#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  lastSample = hex;
  setForeground(hex);
  notify('view'); // refresh the sampled-hex display option
}

export const eyedropperTool: Tool = {
  id: 'eyedropper', label: 'Eyedropper', icon: icons.eyedropper, cursor: 'crosshair', shortcut: 'i',
  onDown(p: DocPoint) { sample(p); },
  onMove() {},
  onUp() {},
  options: [{ key: 'eyedropper-sample', label: 'Sampled', kind: 'display', get: () => lastSample }]
};
