import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import {
  abortPaintStroke, continuePaintStroke, finishPaintStroke, paintOptions, startPaintStroke
} from './paint-shared';

export const pencilTool: Tool = {
  id: 'pencil', label: 'Pencil', icon: icons.pencil, cursor: 'crosshair', shortcut: '',
  onDown(p: DocPoint) { startPaintStroke('pencil', p); },
  onMove(p: DocPoint) { continuePaintStroke(p); },
  onUp() { finishPaintStroke(); },
  onCancel() { abortPaintStroke(); },
  options: paintOptions('pencil', false)
};
