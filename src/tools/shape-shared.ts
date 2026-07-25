import { state, notify } from '../state';
import { toast } from '../toast';
import * as history from '../engine/history';
import { cmdAddLayer } from '../engine/commands';
import { createShapeLayer, type ShapeSpec } from '../engine/document';
import { clampShape, constrainDragRect, constrainLine, shapeCommands } from '../engine/shape-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { getBackground, getForeground } from '../engine/color-state';
import { setShapePreview } from '../canvas-overlay';
import { getShapeNumber, getShapeSetting } from './shape-config';
import type { DocPoint } from '../engine/tools';

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'polygon';

const LABELS: Record<ShapeKind, string> = {
  rect: 'Add rectangle', ellipse: 'Add ellipse', line: 'Add line', polygon: 'Add polygon'
};

const MIN_DRAG = 2;   // document pixels; anything smaller commits nothing

let drag: { kind: ShapeKind; start: DocPoint } | null = null;

/** Build the shape spec plus its centre for the current drag. */
function specFor(kind: ShapeKind, start: DocPoint, current: DocPoint, e: PointerEvent):
  { spec: ShapeSpec; cx: number; cy: number; extent: number } {
  if (kind === 'line') {
    const line = constrainLine(start, current, e.shiftKey);
    return {
      spec: clampShape({ kind: 'line', dx: line.dx, dy: line.dy }),
      cx: line.cx, cy: line.cy, extent: Math.hypot(line.dx, line.dy)
    };
  }
  const rect = constrainDragRect(start, current, { square: e.shiftKey, fromCenter: e.altKey });
  const extent = Math.max(rect.w, rect.h);
  if (kind === 'rect') {
    return {
      spec: clampShape({ kind: 'rect', w: rect.w, h: rect.h, radius: getShapeNumber('radius') }),
      cx: rect.cx, cy: rect.cy, extent
    };
  }
  if (kind === 'ellipse') {
    return {
      spec: clampShape({ kind: 'ellipse', rx: rect.w / 2, ry: rect.h / 2 }),
      cx: rect.cx, cy: rect.cy, extent
    };
  }
  return {
    spec: clampShape({ kind: 'polygon', radius: Math.min(rect.w, rect.h) / 2, sides: getShapeNumber('sides') }),
    cx: rect.cx, cy: rect.cy, extent
  };
}

export function beginShapeDrag(kind: ShapeKind, p: DocPoint): void {
  if (isEditingSessionLive()) { toast('Finish the current session before drawing.'); return; }
  drag = { kind, start: p };
}

export function updateShapeDrag(p: DocPoint, e: PointerEvent): void {
  if (!drag) return;
  const { spec, cx, cy } = specFor(drag.kind, drag.start, p, e);
  setShapePreview({ commands: shapeCommands(spec), cx, cy });
  notify('composite');
}

export function finishShapeDrag(p: DocPoint, e: PointerEvent): void {
  if (!drag) return;
  const active = drag;
  drag = null;
  setShapePreview(null);
  notify('composite');
  const { spec, cx, cy, extent } = specFor(active.kind, active.start, p, e);
  if (extent < MIN_DRAG) return;   // a click without a drag draws nothing

  const fill = getShapeSetting('fillOn') ? getForeground() : null;
  const strokeOn = getShapeSetting('strokeOn') || active.kind === 'line';   // a line needs its stroke
  const layer = createShapeLayer(state.doc, spec, {
    fill: active.kind === 'line' ? null : fill,
    stroke: strokeOn ? getBackground() : null,
    strokeWidth: getShapeNumber('strokeWidth')
  });
  layer.x = cx;
  layer.y = cy;
  history.push(cmdAddLayer(layer, 0, LABELS[active.kind]));
}

export function cancelShapeDrag(): void {
  drag = null;
  setShapePreview(null);
  notify('composite');
}
