import { type Tool } from '../engine/tools';
import { zoomAt, getZoomPercent } from '../canvas';
import { icons } from '../dom';

export const zoomTool: Tool = {
  id: 'zoom', label: 'Zoom', icon: icons.zoom, cursor: 'zoom-in', shortcut: 'z',
  onDown(_p, e) { zoomAt(e.altKey ? 1 / 1.25 : 1.25, e.clientX, e.clientY); },
  onMove() {}, onUp() {},
  options: [{ key: 'zoom', label: 'Zoom', kind: 'display', get: () => getZoomPercent() + '%' }]
};
