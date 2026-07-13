import { layerBounds, layerNaturalSize, type Doc } from './document';

export type SnapAxis = 'x' | 'y';
export type SnapAnchor = 'start' | 'center' | 'end';

export interface SnapCandidate {
  axis: SnapAxis;
  value: number;
  source: 'document' | 'layer';
  anchor: SnapAnchor;
  layerId?: string;
  layerOrder: number;
  /** Candidate extent on the axis perpendicular to the alignment guide. */
  start: number;
  end: number;
}

export interface AlignmentGuideDescriptor {
  kind: 'alignment';
  axis: SnapAxis;
  position: number;
  start: number;
  end: number;
  source: SnapCandidate['source'];
  anchor: SnapAnchor;
  activeAnchor: SnapAnchor;
  layerId?: string;
}

export interface MeasurementGuideDescriptor {
  kind: 'measurement';
  axis: SnapAxis;
  from: number;
  to: number;
  cross: number;
  label: string;
}

export type GuideDescriptor = AlignmentGuideDescriptor | MeasurementGuideDescriptor;

export interface SnapResult {
  x: number;
  y: number;
  guides: GuideDescriptor[];
}

export interface SnapTranslationInput {
  /** Proposed center in document coordinates. */
  x: number;
  y: number;
  /** Axis-aligned display bounds of the active geometry. */
  width: number;
  height: number;
  candidates: readonly SnapCandidate[];
  /** CSS screen pixels per document pixel. */
  overlayScale: number;
  /** Fixed screen-space snapping radius. */
  screenPx: number;
  bypass?: boolean;
  anchors?: { x?: readonly SnapAnchor[]; y?: readonly SnapAnchor[] };
}

const ANCHORS: readonly SnapAnchor[] = ['center', 'start', 'end'];
const BUILD_ANCHORS: readonly SnapAnchor[] = ['start', 'center', 'end'];

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function candidatePriority(candidate: SnapCandidate): number {
  if (candidate.source === 'document') return candidate.anchor === 'center' ? 0 : 1;
  return 2;
}

function anchorValue(center: number, size: number, anchor: SnapAnchor): number {
  if (anchor === 'start') return center - size / 2;
  if (anchor === 'end') return center + size / 2;
  return center;
}

function validLayerGeometry(doc: Doc, index: number, activeId: string): ReturnType<typeof layerBounds> | null {
  const layer = doc.layers[index];
  if (!layer.visible || layer.id === activeId) return null;
  if (![layer.x, layer.y, layer.scaleX, layer.scaleY, layer.rotation].every(Number.isFinite)) return null;
  const natural = layerNaturalSize(layer);
  if (!Number.isFinite(natural.w) || !Number.isFinite(natural.h) || natural.w <= 0 || natural.h <= 0) return null;
  if (layer.scaleX === 0 || layer.scaleY === 0) return null;
  const bounds = layerBounds(layer);
  if (![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) return null;
  return bounds;
}

function candidatesForBounds(
  bounds: { x: number; y: number; w: number; h: number },
  layerId: string,
  layerOrder: number
): SnapCandidate[] {
  const xValues: Record<SnapAnchor, number> = {
    start: bounds.x,
    center: bounds.x + bounds.w / 2,
    end: bounds.x + bounds.w
  };
  const yValues: Record<SnapAnchor, number> = {
    start: bounds.y,
    center: bounds.y + bounds.h / 2,
    end: bounds.y + bounds.h
  };
  return [
    ...BUILD_ANCHORS.map((anchor): SnapCandidate => ({
      axis: 'x', value: xValues[anchor], source: 'layer', anchor, layerId, layerOrder,
      start: bounds.y, end: bounds.y + bounds.h
    })),
    ...BUILD_ANCHORS.map((anchor): SnapCandidate => ({
      axis: 'y', value: yValues[anchor], source: 'layer', anchor, layerId, layerOrder,
      start: bounds.x, end: bounds.x + bounds.w
    }))
  ];
}

export function buildSnapCandidates(doc: Doc, activeId: string): SnapCandidate[] {
  const candidates: SnapCandidate[] = [
    { axis: 'x', value: doc.width / 2, source: 'document', anchor: 'center', layerOrder: -1, start: 0, end: doc.height },
    { axis: 'x', value: 0, source: 'document', anchor: 'start', layerOrder: -1, start: 0, end: doc.height },
    { axis: 'x', value: doc.width, source: 'document', anchor: 'end', layerOrder: -1, start: 0, end: doc.height },
    { axis: 'y', value: doc.height / 2, source: 'document', anchor: 'center', layerOrder: -1, start: 0, end: doc.width },
    { axis: 'y', value: 0, source: 'document', anchor: 'start', layerOrder: -1, start: 0, end: doc.width },
    { axis: 'y', value: doc.height, source: 'document', anchor: 'end', layerOrder: -1, start: 0, end: doc.width }
  ];
  doc.layers.forEach((layer, index) => {
    const bounds = validLayerGeometry(doc, index, activeId);
    if (bounds) candidates.push(...candidatesForBounds(bounds, layer.id, index));
  });
  return candidates;
}

interface Match {
  candidate: SnapCandidate;
  activeAnchor: SnapAnchor;
  activeValue: number;
  delta: number;
  activeOrder: number;
}

function isBetterMatch(next: Match, current: Match | null): boolean {
  if (!current) return true;
  const distance = Math.abs(next.delta) - Math.abs(current.delta);
  if (Math.abs(distance) > 1e-9) return distance < 0;
  const priority = candidatePriority(next.candidate) - candidatePriority(current.candidate);
  if (priority !== 0) return priority < 0;
  if (next.candidate.layerOrder !== current.candidate.layerOrder) {
    return next.candidate.layerOrder < current.candidate.layerOrder;
  }
  if (next.candidate.anchor !== current.candidate.anchor) {
    return ANCHORS.indexOf(next.candidate.anchor) < ANCHORS.indexOf(current.candidate.anchor);
  }
  return next.activeOrder < current.activeOrder;
}

function findMatch(
  axis: SnapAxis,
  center: number,
  size: number,
  candidates: readonly SnapCandidate[],
  threshold: number,
  activeAnchors: readonly SnapAnchor[]
): Match | null {
  let best: Match | null = null;
  for (const candidate of candidates) {
    if (candidate.axis !== axis || !Number.isFinite(candidate.value)) continue;
    for (let activeOrder = 0; activeOrder < activeAnchors.length; activeOrder++) {
      const activeAnchor = activeAnchors[activeOrder];
      const activeValue = anchorValue(center, size, activeAnchor);
      const match = { candidate, activeAnchor, activeValue, delta: candidate.value - activeValue, activeOrder };
      if (Math.abs(match.delta) <= threshold && isBetterMatch(match, best)) best = match;
    }
  }
  return best;
}

function formatPixels(distance: number): string {
  const rounded = Math.round(Math.abs(distance) * 100) / 100;
  return `${rounded} px`;
}

function descriptors(
  match: Match,
  center: number,
  crossCenter: number,
  crossSize: number
): GuideDescriptor[] {
  const candidate = match.candidate;
  const activeStart = crossCenter - crossSize / 2;
  const activeEnd = crossCenter + crossSize / 2;
  const result: GuideDescriptor[] = [{
    kind: 'alignment',
    axis: candidate.axis,
    position: candidate.value,
    start: Math.min(candidate.start, activeStart),
    end: Math.max(candidate.end, activeEnd),
    source: candidate.source,
    anchor: candidate.anchor,
    activeAnchor: match.activeAnchor,
    ...(candidate.layerId ? { layerId: candidate.layerId } : {})
  }];
  if (Math.abs(match.delta) > 1e-9) {
    result.push({
      kind: 'measurement',
      axis: candidate.axis,
      from: center,
      to: center + match.delta,
      cross: crossCenter,
      label: formatPixels(match.delta)
    });
  }
  return result;
}

export function snapTranslation(input: SnapTranslationInput): SnapResult {
  const x = finite(input.x);
  const y = finite(input.y);
  if (input.bypass) return { x, y, guides: [] };
  const scale = Number.isFinite(input.overlayScale) && input.overlayScale > 0 ? input.overlayScale : 1;
  const threshold = Math.max(0, finite(input.screenPx)) / scale;
  const width = Math.abs(finite(input.width));
  const height = Math.abs(finite(input.height));
  const xMatch = findMatch('x', x, width, input.candidates, threshold, input.anchors?.x ?? ANCHORS);
  const yMatch = findMatch('y', y, height, input.candidates, threshold, input.anchors?.y ?? ANCHORS);
  return {
    x: x + (xMatch?.delta ?? 0),
    y: y + (yMatch?.delta ?? 0),
    guides: [
      ...(xMatch ? descriptors(xMatch, x, y, height) : []),
      ...(yMatch ? descriptors(yMatch, y, x, width) : [])
    ]
  };
}
