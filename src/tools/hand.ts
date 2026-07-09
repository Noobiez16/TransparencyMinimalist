import { type Tool } from '../engine/tools';
import { panBy } from '../canvas';
import { icons } from '../dom';

let last: { x: number; y: number } | null = null;

export const handTool: Tool = {
  id: 'hand', label: 'Hand', icon: icons.hand, cursor: 'grab', shortcut: 'h',
  onDown(_p, e) { last = { x: e.clientX, y: e.clientY }; },
  onMove(_p, e) { if (last) { panBy(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; } },
  onUp() { last = null; }
};
