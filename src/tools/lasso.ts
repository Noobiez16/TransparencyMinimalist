import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { commitShape, effectiveMode, modeOption, selectionBlocked } from './selection-shared';
import { setSelectionPreview } from '../canvas-overlay';
import type { SelectionMode } from '../engine/selection-ops';

const clamp = (p: DocPoint): DocPoint => ({
  x: Math.max(0, Math.min(state.doc.width, p.x)),
  y: Math.max(0, Math.min(state.doc.height, p.y))
});

let freePoints: DocPoint[] = [];
let freeMode: SelectionMode = 'new';

export const lassoFreeTool: Tool = {
  id: 'lasso-free', label: 'Lasso', icon: icons.lasso, cursor: 'crosshair', shortcut: 'l',
  onDown(p: DocPoint, e: PointerEvent) {
    if (selectionBlocked()) return;
    freeMode = effectiveMode(e);
    freePoints = [clamp(p)];
  },
  onMove(p: DocPoint) {
    if (freePoints.length === 0) return;
    freePoints.push(clamp(p));
    setSelectionPreview({ kind: 'polygon', points: [...freePoints] });
    notify('composite');
  },
  onUp() {
    const points = freePoints;
    freePoints = [];
    setSelectionPreview(null);
    notify('composite');
    if (points.length < 3) return;
    commitShape({ kind: 'polygon', points }, freeMode, 'Lasso selection');
  },
  onCancel() { freePoints = []; setSelectionPreview(null); notify('composite'); },
  options: [modeOption('lasso-mode')]
};

let polyPoints: DocPoint[] = [];
let polyMode: SelectionMode = 'new';

function closePolygon(): void {
  const points = polyPoints;
  polyPoints = [];
  setSelectionPreview(null);
  notify('composite');
  if (points.length < 3) return; // fewer than three vertices cancels silently
  commitShape({ kind: 'polygon', points }, polyMode, 'Polygonal selection');
}

export function cancelPolygonLasso(): void {
  polyPoints = [];
  setSelectionPreview(null);
  notify('composite');
}

export function polygonInProgress(): boolean { return polyPoints.length > 0; }
export function finishPolygonLasso(): void { if (polyPoints.length > 0) closePolygon(); }

export const lassoPolyTool: Tool = {
  id: 'lasso-poly', label: 'Polygonal Lasso', icon: icons.lassoPoly, cursor: 'crosshair', shortcut: '',
  onDown(p: DocPoint, e: PointerEvent) {
    if (selectionBlocked()) return;
    if (polyPoints.length === 0) polyMode = effectiveMode(e);
    polyPoints.push(clamp(p));
    setSelectionPreview({ kind: 'polygon', points: [...polyPoints] });
    notify('composite');
    if (e.detail >= 2) closePolygon(); // double-click closes
  },
  onMove() {},
  onUp() {},
  onCancel() { cancelPolygonLasso(); },
  options: [modeOption('lasso-poly-mode')]
};
