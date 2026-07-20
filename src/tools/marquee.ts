import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { commitShape, effectiveMode, modeOption, selectionBlocked } from './selection-shared';
import { setSelectionPreview } from '../canvas-overlay';
import type { SelectionMode } from '../engine/selection-ops';

interface Drag { start: DocPoint; current: DocPoint; mode: SelectionMode }
let drag: Drag | null = null;

const clampX = (v: number) => Math.max(0, Math.min(state.doc.width, v));
const clampY = (v: number) => Math.max(0, Math.min(state.doc.height, v));

function rectFromDrag(d: Drag) {
  const x = Math.min(clampX(d.start.x), clampX(d.current.x));
  const y = Math.min(clampY(d.start.y), clampY(d.current.y));
  const w = Math.abs(clampX(d.current.x) - clampX(d.start.x));
  const h = Math.abs(clampY(d.current.y) - clampY(d.start.y));
  return { x, y, w, h };
}

function makeMarquee(id: string, label: string, icon: string, shortcut: string, elliptical: boolean): Tool {
  return {
    id, label, icon, cursor: 'crosshair', shortcut,
    onDown(p: DocPoint, e: PointerEvent) {
      if (selectionBlocked()) return;
      drag = { start: p, current: p, mode: effectiveMode(e) };
    },
    onMove(p: DocPoint) {
      if (!drag) return;
      drag.current = p;
      const r = rectFromDrag(drag);
      setSelectionPreview(elliptical
        ? { kind: 'ellipse', cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2 }
        : { kind: 'rect', ...r });
      notify('composite');
    },
    onUp() {
      if (!drag) return;
      const r = rectFromDrag(drag);
      const mode = drag.mode;
      drag = null;
      setSelectionPreview(null);
      notify('composite');
      if (r.w < 1 || r.h < 1) return; // zero-area drag commits nothing
      if (elliptical) {
        commitShape(
          { kind: 'ellipse', cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2 },
          mode, 'Elliptical selection'
        );
      } else {
        commitShape({ kind: 'rect', ...r }, mode, 'Rectangular selection');
      }
    },
    onCancel() { drag = null; setSelectionPreview(null); notify('composite'); },
    options: [modeOption(`${id}-mode`)]
  };
}

export const marqueeRectTool = makeMarquee('marquee-rect', 'Rectangular Marquee', icons.marquee, 'm', false);
export const marqueeEllipseTool = makeMarquee('marquee-ellipse', 'Elliptical Marquee', icons.marqueeEllipse, '', true);
