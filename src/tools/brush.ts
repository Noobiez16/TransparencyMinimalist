import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import {
  abortPaintStroke, continuePaintStroke, finishPaintStroke, paintOptions, startPaintStroke
} from './paint-shared';

export const brushTool: Tool = {
  id: 'brush', label: 'Brush', icon: icons.brush, cursor: 'crosshair', shortcut: 'b',
  onDown(p: DocPoint) { startPaintStroke('brush', p); },
  onMove(p: DocPoint) { continuePaintStroke(p); },
  onUp() { finishPaintStroke(); },
  onCancel() { abortPaintStroke(); },
  options: paintOptions('brush', true)
};
