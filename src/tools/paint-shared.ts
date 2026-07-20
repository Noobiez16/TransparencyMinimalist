import { state, notify } from '../state';
import { toast } from '../toast';
import { getForeground } from '../engine/color-state';
import {
  addStrokePoint, beginStroke, cancelStroke, endStroke, getStrokeSession,
  type StrokeRefusal
} from '../engine/stroke-session';
import { getActiveTool, type DocPoint, type ToolOption } from '../engine/tools';
import { getPaintSetting, nudgeSize, setPaintSetting, type PaintToolId } from './paint-config';

const REASONS: Record<StrokeRefusal, string> = {
  missing: 'Select a layer to paint on.',
  'text-layer': "Text layers can't be painted — Rasterize Type arrives in Phase D",
  hidden: 'Layer is hidden.',
  busy: 'Finish the current session before painting.'
};

export function startPaintStroke(tool: PaintToolId, point: DocPoint): void {
  const result = beginStroke(state.doc.activeLayerId ?? '', {
    tool,
    size: getPaintSetting(tool, 'size'),
    hardness: getPaintSetting(tool, 'hardness'),
    opacity: getPaintSetting(tool, 'opacity'),
    color: getForeground()
  });
  if (!result.ok) { toast(REASONS[result.reason]); return; }
  addStrokePoint(point);
}

export function continuePaintStroke(point: DocPoint): void {
  if (getStrokeSession()) addStrokePoint(point);
}

export function finishPaintStroke(): void { endStroke(); }
export function abortPaintStroke(): void { cancelStroke(); }

export function paintOptions(tool: PaintToolId, full: boolean): ToolOption[] {
  const options: ToolOption[] = [{
    key: `${tool}-size`, label: 'Size', kind: 'number', group: 'brush',
    min: 1, max: 500, step: 1,
    get: () => getPaintSetting(tool, 'size'),
    set: (value) => { setPaintSetting(tool, 'size', value); }
  }];
  if (full) {
    options.push({
      key: `${tool}-hardness`, label: 'Hardness', kind: 'number', group: 'brush',
      min: 0, max: 100, step: 1,
      get: () => getPaintSetting(tool, 'hardness'),
      set: (value) => { setPaintSetting(tool, 'hardness', value); }
    }, {
      key: `${tool}-opacity`, label: 'Opacity', kind: 'number', group: 'brush',
      min: 1, max: 100, step: 1,
      get: () => getPaintSetting(tool, 'opacity'),
      set: (value) => { setPaintSetting(tool, 'opacity', value); }
    });
  }
  return options;
}

export function nudgeActivePaintSize(direction: 1 | -1): void {
  const id = getActiveTool().id;
  if (id !== 'brush' && id !== 'pencil' && id !== 'eraser') return;
  nudgeSize(id, direction);
  notify('view'); // refresh the options-bar size field
}
