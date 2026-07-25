import { type DocPoint, type Tool, type ToolOption } from '../engine/tools';
import { icons } from '../dom';
import { beginShapeDrag, cancelShapeDrag, finishShapeDrag, updateShapeDrag, type ShapeKind } from './shape-shared';
import { getShapeNumber, getShapeSetting, setShapeNumber, setShapeToggle } from './shape-config';

function commonOptions(kind: ShapeKind): ToolOption[] {
  const options: ToolOption[] = [];
  if (kind !== 'line') {
    options.push({
      key: `${kind}-fill`, label: 'Fill', kind: 'toggle', group: 'shape',
      get: () => getShapeSetting('fillOn'),
      set: (v: boolean) => setShapeToggle('fillOn', v)
    });
    options.push({
      key: `${kind}-stroke`, label: 'Stroke', kind: 'toggle', group: 'shape',
      get: () => getShapeSetting('strokeOn'),
      set: (v: boolean) => setShapeToggle('strokeOn', v)
    });
  }
  options.push({
    key: `${kind}-width`, label: 'Width', kind: 'number', group: 'shape',
    min: 0, max: 100, step: 1,
    get: () => getShapeNumber('strokeWidth'),
    set: (v: number) => setShapeNumber('strokeWidth', v)
  });
  if (kind === 'rect') {
    options.push({
      key: 'rect-radius', label: 'Radius', kind: 'number', group: 'shape',
      min: 0, max: 500, step: 1,
      get: () => getShapeNumber('radius'),
      set: (v: number) => setShapeNumber('radius', v)
    });
  }
  if (kind === 'polygon') {
    options.push({
      key: 'polygon-sides', label: 'Sides', kind: 'number', group: 'shape',
      min: 3, max: 24, step: 1,
      get: () => getShapeNumber('sides'),
      set: (v: number) => setShapeNumber('sides', v)
    });
  }
  return options;
}

function makeShapeTool(kind: ShapeKind, id: string, label: string, icon: string, shortcut: string): Tool {
  return {
    id, label, icon, cursor: 'crosshair', shortcut,
    onDown(p: DocPoint) { beginShapeDrag(kind, p); },
    onMove(p: DocPoint, e: PointerEvent) { updateShapeDrag(p, e); },
    onUp(p: DocPoint, e: PointerEvent) { finishShapeDrag(p, e); },
    onCancel() { cancelShapeDrag(); },
    options: commonOptions(kind)
  };
}

export const shapeRectTool = makeShapeTool('rect', 'shape-rect', 'Rectangle', icons.shapeRect, 'u');
export const shapeEllipseTool = makeShapeTool('ellipse', 'shape-ellipse', 'Ellipse', icons.shapeEllipse, '');
export const shapeLineTool = makeShapeTool('line', 'shape-line', 'Line', icons.shapeLine, '');
export const shapePolygonTool = makeShapeTool('polygon', 'shape-polygon', 'Polygon', icons.shapePolygon, '');
