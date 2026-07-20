import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import {
  abortPaintStroke, continuePaintStroke, finishPaintStroke, paintOptions, startPaintStroke
} from './paint-shared';

export const eraserTool: Tool = {
  id: 'eraser', label: 'Eraser', icon: icons.eraser, cursor: 'crosshair', shortcut: 'e',
  onDown(p: DocPoint) { startPaintStroke('eraser', p); },
  onMove(p: DocPoint) { continuePaintStroke(p); },
  onUp() { finishPaintStroke(); },
  onCancel() { abortPaintStroke(); },
  options: paintOptions('eraser', true)
};
