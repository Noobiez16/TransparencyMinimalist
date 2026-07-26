export interface Anchor {
  x: number; y: number;
  inDx: number; inDy: number;     // incoming handle, RELATIVE to the anchor
  outDx: number; outDy: number;   // outgoing handle, RELATIVE to the anchor
}

export interface SubPath { anchors: Anchor[]; closed: boolean }

export interface PathItem { id: string; name: string; subpaths: SubPath[] }

let pathCounter = 0;

/** A corner anchor is simply one with zero-length handles — no separate flag to desync. */
export function createAnchor(x: number, y: number): Anchor {
  return { x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 };
}

export function isCornerAnchor(a: Anchor): boolean {
  return a.inDx === 0 && a.inDy === 0 && a.outDx === 0 && a.outDy === 0;
}

export function createPathItem(name: string): PathItem {
  pathCounter++;
  return { id: `path_${Date.now()}_${pathCounter}`, name, subpaths: [] };
}

export function clonePathItem(path: PathItem, name: string): PathItem {
  pathCounter++;
  return {
    id: `path_${Date.now()}_${pathCounter}`,
    name,
    subpaths: path.subpaths.map((sp) => ({ closed: sp.closed, anchors: sp.anchors.map((a) => ({ ...a })) }))
  };
}
