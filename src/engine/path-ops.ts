import { state } from '../state';
import * as history from './history';
import { cmdAddLayer } from './commands';
import { createShapeLayer } from './document';
import { getBackground, getForeground } from './color-state';
import { getActivePath } from './path-store';
import { pathBounds, translateSubPath } from './path-geometry';
import type { SubPath } from './path-model';
import { commitSelection } from './selection';

function activeSubPaths(): SubPath[] | null {
  const path = getActivePath();
  if (!path) return null;
  const usable = path.subpaths.filter((s) => s.anchors.length >= 2);
  return usable.length ? usable : null;
}

/** Convert the active path into a D1 vector shape layer, recentred on its own origin. */
export function convertPathToShape(): boolean {
  const subpaths = activeSubPaths();
  if (!subpaths) return false;
  const bounds = pathBounds(subpaths);
  if (!bounds) return false;
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  // Shape geometry is origin-centred; path anchors are document-space.
  let centred = subpaths;
  for (let i = 0; i < centred.length; i++) centred = translateSubPath(centred, i, -cx, -cy);

  const layer = createShapeLayer(state.doc, { kind: 'path', subpaths: centred }, {
    fill: getForeground(),
    stroke: getBackground(),
    strokeWidth: 2
  });
  layer.x = cx;
  layer.y = cy;
  history.push(cmdAddLayer(layer, 0, 'Convert path to shape'));
  return true;
}

/** Rasterize the active path into the Phase C selection mask. */
export function loadPathAsSelection(): boolean {
  const subpaths = activeSubPaths();
  if (!subpaths) return false;
  commitSelection({ kind: 'path', subpaths, mode: 'new' }, 'Path to selection');
  return true;
}
