import { state, subscribe, notify } from './state';
import { layerBounds, type Layer } from './engine/document';
import { $, icons } from './dom';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

type NodeKind = 'doc' | 'image' | 'text' | 'fx' | 'blend';

interface GNode {
  id: string;
  kind: NodeKind;
  radius: number;
  color: string;
  layerId: string | null;   // owning layer id (self for layer nodes); null for the doc node
  hidden: boolean;          // owning layer is hidden
  label: string;            // layer/doc name, used for search matching
  layer: Layer | null;      // source layer (null for the doc node)
  satLabel: string | null;  // precomputed hover label for fx/blend satellites
}

interface GEdge {
  from: string;
  to: string;
  lineWidth: number;
  dashed: boolean;
  rest: number; // spring rest length
}

interface SimPoint { x: number; y: number; vx: number; vy: number; }

const positions = new Map<string, SimPoint>();
let nodes: GNode[] = [];
let edges: GEdge[] = [];
let nodeById = new Map<string, GNode>();

const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

function capitalize(s: string): string { return s.length ? s[0].toUpperCase() + s.slice(1) : s; }

function fxLabel(key: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'invert', layer: Layer): string {
  switch (key) {
    case 'blur': return `Blur ${layer.effects.blur}px`;
    case 'brightness': return `Brightness ${layer.effects.brightness}%`;
    case 'contrast': return `Contrast ${layer.effects.contrast}%`;
    case 'saturation': return `Saturation ${layer.effects.saturation}%`;
    case 'invert': return 'Invert';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let isOpen = false;
let stale = true; // rebuild needed on next open
let alpha = 1;
let rafId: number | null = null;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

let hoveredId: string | null = null;
let draggingId: string | null = null;
let dragMoved = 0;

let searchActive = false;
let matchedLayerIds = new Set<string>();

export function initGraphPanel(): void {
  const overlay = $('graph-overlay');
  const canvas = $<HTMLCanvasElement>('graph-canvas');
  const ctx = canvas.getContext('2d')!;
  const railGraph = $('rail-graph');
  const searchInput = $<HTMLInputElement>('graph-search');
  const infoEl = $('graph-info');
  const legendEl = $('graph-legend');
  const footerEl = $('graph-footer');

  railGraph.innerHTML = icons.graph;

  // -- legend, rendered once --------------------------------------------
  legendEl.innerHTML = [
    ['#F2F2F4', 'Document'],
    ['#5B9BFF', 'Image layer'],
    ['#FFA94D', 'Text layer'],
    ['#B98CFF', 'Effect / Blend']
  ].map(([color, label]) => `<div><span class="dot" style="background:${color}"></span>${label}</div>`).join('');

  // -- canvas sizing -------------------------------------------------------
  function getCanvasCenter(): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  function resizeCanvas(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // -- data rebuild ----------------------------------------------------------
  function ensureAt(id: string, x: number, y: number, jitter: boolean): void {
    if (positions.has(id)) return;
    const jx = jitter ? Math.random() * 60 - 30 : 0;
    const jy = jitter ? Math.random() * 60 - 30 : 0;
    positions.set(id, { x: x + jx, y: y + jy, vx: 0, vy: 0 });
  }

  function rebuildGraph(): void {
    const doc = state.doc;
    const newIds = new Set<string>();
    const newNodes: GNode[] = [];
    const newEdges: GEdge[] = [];
    let satCount = 0;

    const center = getCanvasCenter();
    newIds.add('doc');
    ensureAt('doc', center.x, center.y, false);
    newNodes.push({ id: 'doc', kind: 'doc', radius: 22, color: '#F2F2F4', layerId: null, hidden: false, label: 'Document', layer: null, satLabel: null });
    const docPos = positions.get('doc')!;

    doc.layers.forEach((layer, index) => {
      const id = layer.id;
      newIds.add(id);
      const b = layerBounds(layer);
      const radius = clamp(14, 34, 10 + Math.sqrt(b.w * b.h) / 40);
      const color = layer.kind === 'image' ? '#5B9BFF' : '#FFA94D';
      ensureAt(id, docPos.x, docPos.y, true);
      newNodes.push({ id, kind: layer.kind, radius, color, layerId: id, hidden: !layer.visible, label: layer.name, layer, satLabel: null });
      const lw = Math.max(0.75, 2.5 - index * 0.15);
      newEdges.push({ from: 'doc', to: id, lineWidth: lw, dashed: !layer.visible, rest: 150 });
      const layerPos = positions.get(id)!;

      const fxKeys: Array<{ key: 'blur' | 'brightness' | 'contrast' | 'saturation'; on: boolean }> = [
        { key: 'blur', on: layer.effects.blurOn },
        { key: 'brightness', on: layer.effects.brightnessOn },
        { key: 'contrast', on: layer.effects.contrastOn },
        { key: 'saturation', on: layer.effects.saturationOn }
      ];
      fxKeys.forEach(({ key, on }) => {
        if (!on) return;
        const satId = `${id}:fx:${key}`;
        newIds.add(satId);
        ensureAt(satId, layerPos.x, layerPos.y, true);
        newNodes.push({ id: satId, kind: 'fx', radius: 5, color: '#B98CFF', layerId: id, hidden: !layer.visible, label: layer.name, layer, satLabel: fxLabel(key, layer) });
        newEdges.push({ from: id, to: satId, lineWidth: 0.75, dashed: false, rest: 42 });
        satCount++;
      });
      if (layer.effects.invert) {
        const satId = `${id}:fx:invert`;
        newIds.add(satId);
        ensureAt(satId, layerPos.x, layerPos.y, true);
        newNodes.push({ id: satId, kind: 'fx', radius: 5, color: '#B98CFF', layerId: id, hidden: !layer.visible, label: layer.name, layer, satLabel: fxLabel('invert', layer) });
        newEdges.push({ from: id, to: satId, lineWidth: 0.75, dashed: false, rest: 42 });
        satCount++;
      }
      if (layer.blendMode !== 'normal') {
        const satId = `${id}:blend`;
        newIds.add(satId);
        ensureAt(satId, layerPos.x, layerPos.y, true);
        newNodes.push({ id: satId, kind: 'blend', radius: 5, color: '#4FD1A5', layerId: id, hidden: !layer.visible, label: layer.name, layer, satLabel: `Blend ${capitalize(layer.blendMode)}` });
        newEdges.push({ from: id, to: satId, lineWidth: 0.75, dashed: false, rest: 42 });
        satCount++;
      }
    });

    for (const key of Array.from(positions.keys())) {
      if (!newIds.has(key)) positions.delete(key);
    }

    nodes = newNodes;
    edges = newEdges;
    nodeById = new Map(nodes.map((n) => [n.id, n]));
    footerEl.textContent = `${doc.layers.length} layers · ${satCount} effects`;
    applySearchFilter();
  }

  // -- physics -----------------------------------------------------------
  function reheat(): void {
    alpha = 1;
    scheduleTick();
  }

  function scheduleTick(): void {
    if (rafId != null) return;
    if (!isOpen || alpha <= 0.02) return;
    rafId = requestAnimationFrame(tick);
  }

  function stepPhysics(): void {
    const center = getCanvasCenter();
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = positions.get(nodes[i].id);
      if (!a) continue;
      for (let j = i + 1; j < n; j++) {
        const b = positions.get(nodes[j].id);
        if (!b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 30) d = 30;
        const f = 1800 / (d * d);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        if (nodes[i].id !== draggingId) { a.vx += fx; a.vy += fy; }
        if (nodes[j].id !== draggingId) { b.vx -= fx; b.vy -= fy; }
      }
    }
    for (const e of edges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const diff = d - e.rest;
      const k = 0.02;
      const fx = (dx / d) * diff * k;
      const fy = (dy / d) * diff * k;
      if (e.from !== draggingId) { a.vx += fx; a.vy += fy; }
      if (e.to !== draggingId) { b.vx -= fx; b.vy -= fy; }
    }
    const docPt = positions.get('doc');
    if (docPt && draggingId !== 'doc') {
      docPt.vx += (center.x - docPt.x) * 0.05;
      docPt.vy += (center.y - docPt.y) * 0.05;
    }
    for (const node of nodes) {
      if (node.id === draggingId) continue;
      const p = positions.get(node.id);
      if (!p) continue;
      p.vx *= 0.85;
      p.vy *= 0.85;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  function tick(): void {
    rafId = null;
    stepPhysics();
    alpha *= 0.985;
    render();
    if (isOpen && alpha > 0.02) {
      rafId = requestAnimationFrame(tick);
    }
  }

  // -- rendering -----------------------------------------------------------
  function nodeAlpha(node: GNode): number {
    const base = node.hidden ? 0.4 : 1;
    if (!searchActive || node.kind === 'doc') return base;
    const matched = node.layerId ? matchedLayerIds.has(node.layerId) : false;
    return base * (matched ? 1 : 0.25);
  }

  function render(): void {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#0A0A0B';
    ctx.fillRect(0, 0, rect.width, rect.height);

    for (const e of edges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      const toNode = nodeById.get(e.to);
      if (!a || !b || !toNode) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = e.lineWidth;
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * nodeAlpha(toNode)})`;
      ctx.setLineDash(e.dashed ? [4, 3] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const node of nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const a = nodeAlpha(node);
      ctx.beginPath();
      ctx.arc(p.x, p.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(node.color, a);
      ctx.fill();
      if (node.layerId && node.layerId === state.doc.activeLayerId && (node.kind === 'image' || node.kind === 'text')) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.stroke();
      } else if (hoveredId === node.id) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * a})`;
        ctx.stroke();
      }
    }
  }

  // -- search --------------------------------------------------------------
  function applySearchFilter(): void {
    const q = searchInput.value.trim().toLowerCase();
    searchActive = q.length > 0;
    matchedLayerIds = new Set();
    if (searchActive) {
      for (const layer of state.doc.layers) {
        if (layer.name.toLowerCase().includes(q)) matchedLayerIds.add(layer.id);
      }
    }
    render();
  }
  searchInput.addEventListener('input', applySearchFilter);

  // -- info card -------------------------------------------------------------
  function updateInfoCard(id: string | null): void {
    if (!id) { infoEl.textContent = 'Click or hover a node to inspect it'; return; }
    const node = nodeById.get(id);
    if (!node) { infoEl.textContent = 'Click or hover a node to inspect it'; return; }
    if (node.kind === 'doc') {
      infoEl.textContent = `Document · ${state.doc.width}×${state.doc.height}`;
      return;
    }
    if (node.kind === 'fx' || node.kind === 'blend') {
      const layer = node.layer!;
      infoEl.innerHTML = `${escapeHtml(node.satLabel ?? '')} &mdash; ${escapeHtml(layer.name)}`;
      return;
    }
    const layer = node.layer!;
    const enabled: string[] = [];
    if (layer.effects.blurOn) enabled.push(`Blur ${layer.effects.blur}px`);
    if (layer.effects.brightnessOn) enabled.push(`Brightness ${layer.effects.brightness}%`);
    if (layer.effects.contrastOn) enabled.push(`Contrast ${layer.effects.contrast}%`);
    if (layer.effects.saturationOn) enabled.push(`Saturation ${layer.effects.saturation}%`);
    if (layer.effects.invert) enabled.push('Invert');
    const lines = [
      escapeHtml(layer.name),
      layer.kind === 'image' ? 'Image layer' : 'Text layer',
      `Opacity: ${layer.opacity}%`,
      `Blend: ${layer.blendMode}`,
      `Effects: ${enabled.length ? enabled.join(', ') : 'None'}`
    ];
    infoEl.innerHTML = lines.join('<br>');
  }

  // -- open / close ----------------------------------------------------------
  function openOverlay(): void {
    isOpen = true;
    overlay.classList.add('open');
    railGraph.classList.add('active');
    resizeCanvas();
    if (stale) { rebuildGraph(); stale = false; }
    reheat();
  }

  function closeOverlay(): void {
    isOpen = false;
    overlay.classList.remove('open');
    railGraph.classList.remove('active');
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function toggleOverlay(): void {
    if (isOpen) closeOverlay(); else openOverlay();
  }

  railGraph.addEventListener('click', toggleOverlay);

  // -- pointer interaction -----------------------------------------------
  function getPointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTest(x: number, y: number): GNode | null {
    let best: GNode | null = null;
    let bestD = Infinity;
    for (const node of nodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= node.radius + 4 && d < bestD) { bestD = d; best = node; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const pos = getPointerPos(e);
    const hit = hitTest(pos.x, pos.y);
    if (!hit) return;
    draggingId = hit.id;
    dragMoved = 0;
    canvas.setPointerCapture(e.pointerId);
    const p = positions.get(hit.id);
    if (p) { p.vx = 0; p.vy = 0; }
    canvas.style.cursor = 'grabbing';
    reheat();
  });

  canvas.addEventListener('pointermove', (e) => {
    const pos = getPointerPos(e);
    if (draggingId) {
      const p = positions.get(draggingId);
      if (p) {
        dragMoved += Math.hypot(pos.x - p.x, pos.y - p.y);
        p.x = pos.x; p.y = pos.y; p.vx = 0; p.vy = 0;
      }
      reheat();
      render();
      return;
    }
    const hit = hitTest(pos.x, pos.y);
    const newHover = hit ? hit.id : null;
    if (newHover !== hoveredId) {
      hoveredId = newHover;
      updateInfoCard(hoveredId);
      render();
    }
    canvas.style.cursor = hit ? 'pointer' : 'grab';
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!draggingId) return;
    const node = nodeById.get(draggingId);
    if (dragMoved < 5 && node && (node.kind === 'image' || node.kind === 'text') && node.layerId) {
      state.doc.activeLayerId = node.layerId;
      notify('selection', 'composite');
    }
    canvas.releasePointerCapture(e.pointerId);
    draggingId = null;
    canvas.style.cursor = 'grab';
    render();
  });

  canvas.addEventListener('pointercancel', () => {
    draggingId = null;
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('pointerleave', () => {
    if (draggingId) return;
    if (hoveredId !== null) {
      hoveredId = null;
      updateInfoCard(null);
      render();
    }
  });

  // -- keyboard --------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.activeElement === searchInput) {
        if (searchInput.value) { searchInput.value = ''; applySearchFilter(); }
        e.preventDefault();
        return;
      }
      if (isOpen) closeOverlay();
      return;
    }
    const t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as HTMLElement).isContentEditable)) return;
    if (e.key.toLowerCase() === 'g') toggleOverlay();
  });

  // -- resize --------------------------------------------------------------
  window.addEventListener('resize', () => {
    if (!isOpen) return;
    resizeCanvas();
    render();
  });

  // -- reactive rebuilds -------------------------------------------------
  subscribe((dirty) => {
    const relevant = dirty.has('structure') || dirty.has('selection') || dirty.has('layerProps') || dirty.has('canvasConfig');
    if (!relevant) return;
    if (isOpen) {
      rebuildGraph();
      reheat();
    } else {
      stale = true;
    }
  });
}
