# Phase C Selection System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** live verification runs on the preview server (`dev`, port 3000) at `http://localhost:3000/?audit-raf`. One browser pane → run inline. Two harness lessons from Phase B, both mandatory here: (1) a browser-console `import('/src/x.ts')` is a **different module instance** than the app's extensionless `'./x'` import — never drive app state through a dynamic import; verify via DOM, canvas pixels, or by patching `CanvasRenderingContext2D.prototype` methods; (2) the canvas rect **moves** when the options bar changes rows on a tool switch, so re-read `getBoundingClientRect()` *after* every tool change in synthetic-pointer helpers.

**Goal:** Rectangular/elliptical marquees, freehand/polygonal lassos, boolean combination, marching ants, a live Select menu, and selection-constrained painting, clearing, filling, and cropping — per `docs/superpowers/specs/2026-07-19-selection-system-design.md`.

**Architecture:** The selection is an ordered list of operations (`src/engine/selection.ts`); the document-sized mask canvas is a derived cache re-rasterized on change, so undo stores kilobyte op arrays instead of 4 MB pixel snapshots. Everything that can be pure is pure and unit-tested — contour tracing, bounds scanning, the ops reducer, the doc→bitmap matrix — while rasterization fidelity is proven by live pixel checks.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest with the established `vi.stubGlobal` bootstrap; `test:ui` source contracts; `?audit-raf` live harness.

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies.
- Tools: Rectangular Marquee (`M`) + Elliptical (nested); Lasso (`L`) freehand + Polygonal (nested). Magic Wand / Quick Selection / Object Selection stay grayed stubs.
- Selection edges are **hard** — no feathering, no anti-aliasing.
- Boolean modes: options-bar `select` option (New/Add/Subtract/Intersect), overridden live by Shift (add), Alt (subtract), Shift+Alt (intersect).
- Composite mapping: `new` → clear then `source-over`; `add` → `source-over`; `subtract` → `destination-out`; `intersect` → `destination-in`.
- One history command per selection change, storing before/after op arrays with `bytes` ≈ total points × 16.
- Selection tools are inert while a stroke, transform, or crop session is live (`isEditingSessionLive()`); marching-ants animation pauses in the same condition.
- Out of scope: feathering, transforming/moving selected pixels, Magic Wand family, alpha-channel storage, selection persistence in `.mledit.json`, Refine Edge.
- Commits: subject only, NO Co-Authored-By trailer; `git push origin main` after each task.
- All four gates before every commit: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`.
- Superseded `test:ui` contracts are replaced in the same task that changes the source (Phase B promoted tools out of the stub list; Phase C does the same for Marquee/Lasso).

---

### Task 1: `documentToBitmapMatrix`

**Files:**
- Modify: `src/engine/transform-geometry.ts` (after the shipped `documentToBitmap`)
- Test: `tests/document-to-bitmap-matrix.test.ts`

**Interfaces:**
- Consumes: existing `LayerTransform`, `Size`, `normalizeDegrees`, `safeSize`.
- Produces (used by Task 8): `documentToBitmapMatrix(transform: LayerTransform, natural: Size): [number, number, number, number, number, number]` — the `setTransform(a,b,c,d,e,f)` tuple mapping document coordinates into bitmap pixel coordinates. Returns the identity tuple `[1,0,0,1,0,0]` when either scale is degenerate (non-invertible).

Math: bitmap→document is `translate(x,y) · rotate(r) · scale(sx/100, sy/100) · translate(-w/2, -h/2)`. This returns its inverse, so drawing a document-space image through it lands in bitmap space.

- [ ] **Step 1: Write the failing test**

Create `tests/document-to-bitmap-matrix.test.ts`:

```ts
import { expect, test } from 'vitest';
import { documentToBitmap, documentToBitmapMatrix, type LayerTransform } from '../src/engine/transform-geometry';

const natural = { w: 100, h: 50 };

/** Apply a setTransform tuple to a point the way canvas would. */
function applyMatrix(m: number[], p: { x: number; y: number }) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

test('identity transform maps doc origin to the bitmap top-left', () => {
  const t: LayerTransform = { x: 50, y: 25, scaleX: 100, scaleY: 100, rotation: 0 };
  const m = documentToBitmapMatrix(t, natural);
  expect(applyMatrix(m, { x: 0, y: 0 }).x).toBeCloseTo(0, 6);
  expect(applyMatrix(m, { x: 0, y: 0 }).y).toBeCloseTo(0, 6);
});

test('the matrix agrees with documentToBitmap for translated and scaled layers', () => {
  const t: LayerTransform = { x: 512, y: 512, scaleX: 400, scaleY: 400, rotation: 0 };
  const m = documentToBitmapMatrix(t, { w: 320, h: 200 });
  for (const p of [{ x: 512, y: 512 }, { x: 552, y: 512 }, { x: 300, y: 700 }]) {
    const viaMatrix = applyMatrix(m, p);
    const viaPoint = documentToBitmap(t, { w: 320, h: 200 }, p);
    expect(viaMatrix.x).toBeCloseTo(viaPoint.x, 6);
    expect(viaMatrix.y).toBeCloseTo(viaPoint.y, 6);
  }
});

test('the matrix agrees with documentToBitmap under rotation', () => {
  const t: LayerTransform = { x: 200, y: 150, scaleX: 150, scaleY: 150, rotation: 37 };
  const m = documentToBitmapMatrix(t, natural);
  for (const p of [{ x: 200, y: 150 }, { x: 260, y: 120 }, { x: 90, y: 210 }]) {
    const viaMatrix = applyMatrix(m, p);
    const viaPoint = documentToBitmap(t, natural, p);
    expect(viaMatrix.x).toBeCloseTo(viaPoint.x, 6);
    expect(viaMatrix.y).toBeCloseTo(viaPoint.y, 6);
  }
});

test('degenerate scales fall back to identity', () => {
  const t: LayerTransform = { x: 10, y: 10, scaleX: 0, scaleY: 100, rotation: 0 };
  expect(documentToBitmapMatrix(t, natural)).toEqual([1, 0, 0, 1, 0, 0]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/document-to-bitmap-matrix.test.ts`
Expected: FAIL — `documentToBitmapMatrix is not a function`.

- [ ] **Step 3: Implement** — add to `src/engine/transform-geometry.ts` directly after `documentToBitmap`:

```ts
/**
 * setTransform(a,b,c,d,e,f) tuple mapping DOCUMENT coordinates into BITMAP pixel
 * coordinates — the inverse of the layer's draw transform. Drawing a document-space
 * image through it lands each pixel where that document point sits on the bitmap.
 */
export function documentToBitmapMatrix(
  transform: LayerTransform,
  natural: Size
): [number, number, number, number, number, number] {
  const size = safeSize(natural);
  const sx = finite(transform.scaleX) / 100;
  const sy = finite(transform.scaleY) / 100;
  if (Math.abs(sx) <= EPSILON || Math.abs(sy) <= EPSILON) return [1, 0, 0, 1, 0, 0];
  const angle = (normalizeDegrees(transform.rotation) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Inverse of: translate(x,y) rotate(r) scale(sx,sy) translate(-w/2,-h/2)
  const a = cos / sx;
  const b = -sin / sy;
  const c = sin / sx;
  const d = cos / sy;
  const tx = finite(transform.x);
  const ty = finite(transform.y);
  const e = size.w / 2 - (a * tx + c * ty);
  const f = size.h / 2 - (b * tx + d * ty);
  return [a, b, c, d, e, f];
}
```

- [ ] **Step 4: Run the test** — PASS (4 tests).
- [ ] **Step 5: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build` — all PASS.

```bash
git add src/engine/transform-geometry.ts tests/document-to-bitmap-matrix.test.ts
git commit -m "feat: add the document-to-bitmap transform matrix"
git push origin main
```

---

### Task 2: Contour tracing for marching ants

**Files:**
- Create: `src/engine/selection-contour.ts`
- Test: `tests/selection-contour.test.ts`

**Interfaces:**
- Consumes: `Point` from transform-geometry (type import only).
- Produces (used by Task 5): `traceContours(alpha: Uint8Array, width: number, height: number, threshold?: number): Point[][]` — closed polylines in document pixel coordinates along selected-pixel boundaries, with collinear points collapsed. Default `threshold` is 128.

Method: edge walking on the pixel lattice rather than classic marching squares — for every selected pixel, emit the boundary edges whose neighbour is unselected (wound clockwise), then stitch those unit segments into closed loops. This is exact for hard-edged selections, has no saddle-case ambiguity, and is a pure function over a typed array.

- [ ] **Step 1: Write the failing test**

Create `tests/selection-contour.test.ts`:

```ts
import { expect, test } from 'vitest';
import { traceContours } from '../src/engine/selection-contour';

/** Build an alpha grid from an ASCII map ('#' = selected). */
function grid(rows: string[]): { alpha: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const alpha = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { alpha[y * w + x] = ch === '#' ? 255 : 0; }));
  return { alpha, w, h };
}

function loopKey(loop: { x: number; y: number }[]): string {
  return loop.map((p) => `${p.x},${p.y}`).sort().join(' ');
}

test('an empty grid has no contours', () => {
  const { alpha, w, h } = grid(['...', '...', '...']);
  expect(traceContours(alpha, w, h)).toEqual([]);
});

test('a single pixel yields one four-corner loop', () => {
  const { alpha, w, h } = grid(['...', '.#.', '...']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(1);
  expect(loopKey(loops[0])).toBe(loopKey([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]));
});

test('a rectangle collapses collinear points to four corners', () => {
  const { alpha, w, h } = grid(['.....', '.###.', '.###.', '.....']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(1);
  expect(loops[0].length).toBe(4);
  expect(loopKey(loops[0])).toBe(loopKey([{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 1, y: 3 }]));
});

test('a shape with a hole yields an outer and an inner loop', () => {
  const { alpha, w, h } = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(2);
  expect(loops.some((l) => l.length === 4 && loopKey(l) === loopKey([{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }]))).toBe(true);
  expect(loops.some((l) => loopKey(l) === loopKey([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }]))).toBe(true);
});

test('two disjoint blobs yield two loops', () => {
  const { alpha, w, h } = grid(['#..#', '#..#', '....']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(2);
});

test('pixels touching the grid edge still close their loop', () => {
  const { alpha, w, h } = grid(['##', '##']);
  const loops = traceContours(alpha, w, h);
  expect(loops.length).toBe(1);
  expect(loops[0].length).toBe(4);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/selection-contour.ts`:

```ts
import type { Point } from './transform-geometry';

interface Segment { from: Point; to: Point }

const keyOf = (p: Point): string => `${p.x},${p.y}`;

/**
 * Closed contours around selected pixels, in document pixel coordinates.
 * Walks the pixel lattice: every selected pixel contributes the edges whose
 * neighbour is unselected, wound clockwise, then the unit edges are stitched
 * into loops. Exact for hard-edged selections; no saddle-case ambiguity.
 */
export function traceContours(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold = 128
): Point[][] {
  const selected = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] >= threshold;

  const segments: Segment[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!selected(x, y)) continue;
      if (!selected(x, y - 1)) segments.push({ from: { x, y }, to: { x: x + 1, y } });
      if (!selected(x + 1, y)) segments.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 } });
      if (!selected(x, y + 1)) segments.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 } });
      if (!selected(x - 1, y)) segments.push({ from: { x, y: y + 1 }, to: { x, y } });
    }
  }
  if (segments.length === 0) return [];

  const outgoing = new Map<string, Segment[]>();
  for (const segment of segments) {
    const key = keyOf(segment.from);
    const list = outgoing.get(key);
    if (list) list.push(segment);
    else outgoing.set(key, [segment]);
  }

  const loops: Point[][] = [];
  const used = new Set<Segment>();
  for (const start of segments) {
    if (used.has(start)) continue;
    const loop: Point[] = [];
    let current: Segment | undefined = start;
    while (current && !used.has(current)) {
      used.add(current);
      loop.push(current.from);
      const candidates = outgoing.get(keyOf(current.to)) ?? [];
      current = candidates.find((candidate) => !used.has(candidate));
    }
    if (loop.length >= 4) loops.push(collapseCollinear(loop));
  }
  return loops;
}

/** Drop points that lie on a straight run so rectangles keep four corners. */
function collapseCollinear(loop: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const curr = loop[i];
    const next = loop[(i + 1) % loop.length];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (cross !== 0) out.push(curr);
  }
  return out.length >= 3 ? out : loop;
}
```

- [ ] **Step 4: Run the test** — PASS (6 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/selection-contour.ts tests/selection-contour.test.ts
git commit -m "feat: add selection contour tracing"
git push origin main
```

---

### Task 3: Pure selection ops — reducer, bounds, composite mapping

**Files:**
- Create: `src/engine/selection-ops.ts`
- Test: `tests/selection-ops.test.ts`

**Interfaces:**
- Consumes: `Point` (type import).
- Produces (used by Tasks 4, 6, 9):
  - `type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect'`
  - `type SelectionShape = { kind: 'rect'; x; y; w; h } | { kind: 'ellipse'; cx; cy; rx; ry } | { kind: 'polygon'; points: Point[] }`
  - `type SelectionOp = { kind: 'shape'; shape: SelectionShape; mode: SelectionMode } | { kind: 'all' } | { kind: 'invert' }`
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `reduceOps(ops: SelectionOp[], op: SelectionOp): SelectionOp[]`
  - `compositeOpFor(mode: SelectionMode): GlobalCompositeOperation`
  - `boundsFromAlpha(alpha: Uint8Array, width: number, height: number, threshold?: number): Rect | null` (bounds come from the rasterized mask, not from shape geometry, so subtract and invert are handled correctly)
  - `opsPointCount(ops: SelectionOp[]): number` — history byte accounting

- [ ] **Step 1: Write the failing test**

Create `tests/selection-ops.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  boundsFromAlpha, compositeOpFor, opsPointCount, reduceOps,
  type SelectionOp
} from '../src/engine/selection-ops';

const rect = (x: number, y: number, w: number, h: number) =>
  ({ kind: 'rect', x, y, w, h }) as const;

test('a new-mode shape replaces the whole list', () => {
  const ops: SelectionOp[] = [
    { kind: 'shape', shape: rect(0, 0, 10, 10), mode: 'new' },
    { kind: 'shape', shape: rect(5, 5, 10, 10), mode: 'add' }
  ];
  const next = reduceOps(ops, { kind: 'shape', shape: rect(20, 20, 5, 5), mode: 'new' });
  expect(next.length).toBe(1);
  expect(next[0]).toEqual({ kind: 'shape', shape: rect(20, 20, 5, 5), mode: 'new' });
});

test('add, subtract, and intersect append to the list', () => {
  let ops: SelectionOp[] = [{ kind: 'shape', shape: rect(0, 0, 10, 10), mode: 'new' }];
  for (const mode of ['add', 'subtract', 'intersect'] as const) {
    ops = reduceOps(ops, { kind: 'shape', shape: rect(1, 1, 2, 2), mode });
  }
  expect(ops.length).toBe(4);
  expect(ops.map((o) => (o.kind === 'shape' ? o.mode : o.kind))).toEqual(['new', 'add', 'subtract', 'intersect']);
});

test('select-all resets the list and invert appends', () => {
  const ops: SelectionOp[] = [{ kind: 'shape', shape: rect(0, 0, 4, 4), mode: 'new' }];
  const all = reduceOps(ops, { kind: 'all' });
  expect(all).toEqual([{ kind: 'all' }]);
  const inverted = reduceOps(all, { kind: 'invert' });
  expect(inverted).toEqual([{ kind: 'all' }, { kind: 'invert' }]);
});

test('modes map to the documented composite operations', () => {
  expect(compositeOpFor('new')).toBe('source-over');
  expect(compositeOpFor('add')).toBe('source-over');
  expect(compositeOpFor('subtract')).toBe('destination-out');
  expect(compositeOpFor('intersect')).toBe('destination-in');
});

test('boundsFromAlpha finds the tight box and nulls when empty', () => {
  const w = 5, h = 4;
  const alpha = new Uint8Array(w * h);
  expect(boundsFromAlpha(alpha, w, h)).toBeNull();
  alpha[1 * w + 2] = 255;
  alpha[2 * w + 3] = 255;
  expect(boundsFromAlpha(alpha, w, h)).toEqual({ x: 2, y: 1, w: 2, h: 2 });
});

test('opsPointCount sizes history commands', () => {
  expect(opsPointCount([{ kind: 'all' }])).toBe(1);
  expect(opsPointCount([{ kind: 'shape', shape: rect(0, 0, 1, 1), mode: 'new' }])).toBe(4);
  expect(opsPointCount([
    { kind: 'shape', shape: { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, mode: 'add' }
  ])).toBe(3);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/selection-ops.ts`:

```ts
import type { Point } from './transform-geometry';

export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';

export type SelectionShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; points: Point[] };

export type SelectionOp =
  | { kind: 'shape'; shape: SelectionShape; mode: SelectionMode }
  | { kind: 'all' }
  | { kind: 'invert' };

export interface Rect { x: number; y: number; w: number; h: number }

/** A `new` shape or Select All restarts the list; everything else appends. */
export function reduceOps(ops: SelectionOp[], op: SelectionOp): SelectionOp[] {
  if (op.kind === 'all') return [op];
  if (op.kind === 'shape' && op.mode === 'new') return [op];
  return [...ops, op];
}

export function compositeOpFor(mode: SelectionMode): GlobalCompositeOperation {
  if (mode === 'subtract') return 'destination-out';
  if (mode === 'intersect') return 'destination-in';
  return 'source-over'; // 'new' clears the mask first, then draws normally
}

/** Tight box around selected pixels; null when nothing is selected. */
export function boundsFromAlpha(
  alpha: Uint8Array,
  width: number,
  height: number,
  threshold = 128
): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Point budget for history byte accounting. */
export function opsPointCount(ops: SelectionOp[]): number {
  let total = 0;
  for (const op of ops) {
    if (op.kind !== 'shape') { total += 1; continue; }
    total += op.shape.kind === 'polygon' ? op.shape.points.length : 4;
  }
  return total;
}
```

- [ ] **Step 4: Run the test** — PASS (7 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/selection-ops.ts tests/selection-ops.test.ts
git commit -m "feat: add pure selection ops, bounds, and composite mapping"
git push origin main
```

---

### Task 4: Selection state module

**Files:**
- Create: `src/engine/selection.ts`
- Test: `tests/selection-state.test.ts`

**Interfaces:**
- Consumes: Task 3's ops/types/helpers; `state`, `notify` (`src/state.ts`); `history` + `Command` (`src/engine/history.ts`).
- Produces (used by Tasks 5–9):
  - `hasSelection(): boolean`
  - `getSelectionOps(): SelectionOp[]` (copy)
  - `getSelectionMask(): HTMLCanvasElement | null` — doc-sized; null when empty
  - `getSelectionAlpha(): Uint8Array | null` — one byte per document pixel (contours + bounds)
  - `getSelectionBounds(): Rect | null`
  - `commitSelection(op: SelectionOp, label: string): void` — reduces, pushes one history command
  - `selectAll()` · `deselect()` · `reselect()` · `invertSelection()`
  - `subscribeSelection(fn: () => void): void`
  - `__setSelectionOpsForTest(ops: SelectionOp[]): void`

Mask/alpha/bounds/contours are lazily derived caches invalidated on every ops change and on document resize.

- [ ] **Step 1: Write the failing test**

Create `tests/selection-state.test.ts` (canvas is stubbed, so this asserts **op-list and history semantics**, not rasterized pixels — rasterization is proven live in Tasks 6+):

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    fillStyle: '', globalCompositeOperation: 'source-over',
    fillRect: () => {}, clearRect: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, ellipse: () => {}, fill: () => {},
    save: () => {}, restore: () => {}, drawImage: () => {}, setTransform: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let selection: typeof import('../src/engine/selection');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  selection = await import('../src/engine/selection');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
  selection.__setSelectionOpsForTest([]);
});

const rectOp = (x: number, y: number, w: number, h: number, mode: 'new' | 'add' | 'subtract' = 'new') =>
  ({ kind: 'shape', shape: { kind: 'rect', x, y, w, h }, mode }) as const;

test('committing a selection pushes exactly one command and sets state', () => {
  expect(selection.hasSelection()).toBe(false);
  selection.commitSelection(rectOp(10, 10, 50, 50), 'Rectangular selection');
  expect(selection.hasSelection()).toBe(true);
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Rectangular selection');
  expect(selection.getSelectionOps().length).toBe(1);
});

test('undo and redo move between selection states', () => {
  selection.commitSelection(rectOp(0, 0, 20, 20), 'Rectangular selection');
  selection.commitSelection(rectOp(30, 30, 20, 20, 'add'), 'Add to selection');
  expect(selection.getSelectionOps().length).toBe(2);
  history.undo();
  expect(selection.getSelectionOps().length).toBe(1);
  history.undo();
  expect(selection.hasSelection()).toBe(false);
  history.redo();
  expect(selection.getSelectionOps().length).toBe(1);
});

test('select all, deselect, and reselect round-trip', () => {
  selection.selectAll();
  expect(selection.hasSelection()).toBe(true);
  selection.deselect();
  expect(selection.hasSelection()).toBe(false);
  selection.reselect();
  expect(selection.hasSelection()).toBe(true);
  expect(selection.getSelectionOps()).toEqual([{ kind: 'all' }]);
});

test('deselect on an empty selection pushes no command', () => {
  const before = history.entries().length;
  selection.deselect();
  expect(history.entries().length).toBe(before);
});

test('invert appends an invert op', () => {
  selection.commitSelection(rectOp(0, 0, 10, 10), 'Rectangular selection');
  selection.invertSelection();
  const ops = selection.getSelectionOps();
  expect(ops[ops.length - 1]).toEqual({ kind: 'invert' });
});

test('subscribers fire on every selection change', () => {
  let calls = 0;
  selection.subscribeSelection(() => { calls++; });
  selection.selectAll();
  selection.deselect();
  expect(calls).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/selection.ts`:

```ts
import { state, notify } from '../state';
import * as history from './history';
import {
  boundsFromAlpha, compositeOpFor, opsPointCount, reduceOps,
  type Rect, type SelectionOp, type SelectionShape
} from './selection-ops';

let ops: SelectionOp[] = [];
let lastNonEmpty: SelectionOp[] = [];
const listeners: Array<() => void> = [];

let maskCache: HTMLCanvasElement | null = null;
let alphaCache: Uint8Array | null = null;
let boundsCache: Rect | null = null;
let cacheKey = '';

const emit = () => listeners.forEach((fn) => fn());

function invalidate(): void {
  maskCache = null;
  alphaCache = null;
  boundsCache = null;
  cacheKey = '';
}

export function subscribeSelection(fn: () => void): void { listeners.push(fn); }

export function hasSelection(): boolean { return ops.length > 0; }

export function getSelectionOps(): SelectionOp[] { return [...ops]; }

function drawShape(ctx: CanvasRenderingContext2D, shape: SelectionShape): void {
  ctx.beginPath();
  if (shape.kind === 'rect') {
    ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    return;
  }
  if (shape.kind === 'ellipse') {
    ctx.ellipse(shape.cx, shape.cy, Math.abs(shape.rx), Math.abs(shape.ry), 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape.points.length < 3) return;
  ctx.moveTo(shape.points[0].x, shape.points[0].y);
  for (const point of shape.points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fill();
}

/** Rasterize the op list into a document-sized mask (alpha = selected). */
function rasterize(): HTMLCanvasElement | null {
  if (ops.length === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = state.doc.width;
  canvas.height = state.doc.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  for (const op of ops) {
    if (op.kind === 'all') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      continue;
    }
    if (op.kind === 'invert') {
      const inverted = document.createElement('canvas');
      inverted.width = canvas.width;
      inverted.height = canvas.height;
      const ictx = inverted.getContext('2d')!;
      ictx.fillStyle = '#ffffff';
      ictx.fillRect(0, 0, inverted.width, inverted.height);
      ictx.globalCompositeOperation = 'destination-out';
      ictx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(inverted, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      continue;
    }
    if (op.mode === 'new') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.globalCompositeOperation = compositeOpFor(op.mode);
    }
    ctx.save();
    drawShape(ctx, op.shape);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

function ensureCaches(): void {
  const key = `${ops.length}:${state.doc.width}x${state.doc.height}:${JSON.stringify(ops)}`;
  if (key === cacheKey && (maskCache || ops.length === 0)) return;
  cacheKey = key;
  maskCache = rasterize();
  if (!maskCache) { alphaCache = null; boundsCache = null; return; }
  const ctx = maskCache.getContext('2d')!;
  const data = ctx.getImageData(0, 0, maskCache.width, maskCache.height).data;
  const alpha = new Uint8Array(maskCache.width * maskCache.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  alphaCache = alpha;
  boundsCache = boundsFromAlpha(alpha, maskCache.width, maskCache.height);
}

export function getSelectionMask(): HTMLCanvasElement | null { ensureCaches(); return maskCache; }
export function getSelectionAlpha(): Uint8Array | null { ensureCaches(); return alphaCache; }
export function getSelectionBounds(): Rect | null { ensureCaches(); return boundsCache; }

function setOps(next: SelectionOp[]): void {
  ops = next;
  if (next.length > 0) lastNonEmpty = [...next];
  invalidate();
  emit();
  notify('composite');
}

/** Push one history command carrying the before/after op arrays. */
function pushSelectionCommand(label: string, next: SelectionOp[]): void {
  const before = [...ops];
  const after = [...next];
  history.push({
    label,
    bytes: (opsPointCount(before) + opsPointCount(after)) * 16,
    do: () => setOps([...after]),
    undo: () => setOps([...before])
  });
}

export function commitSelection(op: SelectionOp, label: string): void {
  pushSelectionCommand(label, reduceOps(ops, op));
}

export function selectAll(): void {
  pushSelectionCommand('Select all', reduceOps(ops, { kind: 'all' }));
}

export function deselect(): void {
  if (ops.length === 0) return;
  pushSelectionCommand('Deselect', []);
}

export function reselect(): void {
  if (ops.length > 0 || lastNonEmpty.length === 0) return;
  pushSelectionCommand('Reselect', [...lastNonEmpty]);
}

export function invertSelection(): void {
  if (ops.length === 0) { selectAll(); return; }
  pushSelectionCommand('Inverse selection', reduceOps(ops, { kind: 'invert' }));
}

export function __setSelectionOpsForTest(next: SelectionOp[]): void {
  ops = [...next];
  lastNonEmpty = next.length ? [...next] : [];
  invalidate();
}
```

- [ ] **Step 4: Run the test** — PASS (6 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/selection.ts tests/selection-state.test.ts
git commit -m "feat: add selection state with op-list undo"
git push origin main
```

---

### Task 5: Marching ants overlay

**Files:**
- Modify: `src/canvas-overlay.ts` (contour drawing), `src/main.ts` (animation timer)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `getSelectionAlpha`, `subscribeSelection` (Task 4); `traceContours` (Task 2); `isEditingSessionLive` (`src/engine/session-status.ts`).
- Produces: `drawSelectionAnts(ctx, scale)` invoked from `drawCanvasOverlay` **before** its transformable-layer early return; `startAntsAnimation()` exported from `src/main.ts` scope as an internal timer (no export needed by later tasks).

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('marching ants trace the selection and pause during live sessions', () => {
  const overlay = readFileSync(resolve(root, 'src/canvas-overlay.ts'), 'utf8');
  assert.match(overlay, /traceContours/);
  assert.match(overlay, /setLineDash/);
  assert.match(main, /isEditingSessionLive/);
  assert.match(main, /lineDashOffset|antsPhase/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui` → FAIL.

- [ ] **Step 3: Implement the overlay** — in `src/canvas-overlay.ts` add imports and the drawing function:

```ts
import { getSelectionAlpha } from './engine/selection';
import { traceContours } from './engine/selection-contour';
```

```ts
let antsPhase = 0;
let contourCache: Point[][] = [];
let contourKey = '';

export function setAntsPhase(phase: number): void { antsPhase = phase; }

function drawSelectionAnts(ctx: CanvasRenderingContext2D, doc: Doc, scale: number): void {
  const alpha = getSelectionAlpha();
  if (!alpha) { contourCache = []; contourKey = ''; return; }
  const key = `${doc.width}x${doc.height}:${alpha.length}:${antsSignature(alpha)}`;
  if (key !== contourKey) {
    contourKey = key;
    contourCache = traceContours(alpha, doc.width, doc.height);
  }
  if (contourCache.length === 0) return;
  ctx.save();
  ctx.lineWidth = 1 / scale;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)';
    ctx.setLineDash(pass === 0 ? [] : [4 / scale, 4 / scale]);
    ctx.lineDashOffset = pass === 0 ? 0 : -antsPhase / scale;
    ctx.beginPath();
    for (const loop of contourCache) {
      if (loop.length < 2) continue;
      ctx.moveTo(loop[0].x, loop[0].y);
      for (const point of loop.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** Cheap change signature: sampled alpha, enough to catch selection edits. */
function antsSignature(alpha: Uint8Array): number {
  let sum = 0;
  const step = Math.max(1, Math.floor(alpha.length / 4096));
  for (let i = 0; i < alpha.length; i += step) sum = (sum + alpha[i] * (i + 1)) % 2147483647;
  return sum;
}
```

and call it in `drawCanvasOverlay` right after `drawCropOverlay(...)`:

```ts
  drawSelectionAnts(ctx, doc, scale);
```

- [ ] **Step 4: Implement the timer** — in `src/main.ts`:

```ts
import { hasSelection, subscribeSelection } from './engine/selection';
import { setAntsPhase } from './canvas-overlay';
import { isEditingSessionLive } from './engine/session-status';

let antsTimer: number | null = null;
let antsPhaseValue = 0;

function syncAntsAnimation(): void {
  const shouldRun = hasSelection();
  if (shouldRun && antsTimer === null) {
    antsTimer = window.setInterval(() => {
      // Pause while a stroke, transform, or crop session owns the canvas.
      if (isEditingSessionLive()) return;
      antsPhaseValue = (antsPhaseValue + 1) % 8;
      setAntsPhase(antsPhaseValue);
      notify('composite');
    }, 100);
  } else if (!shouldRun && antsTimer !== null) {
    clearInterval(antsTimer);
    antsTimer = null;
    antsPhaseValue = 0;
    setAntsPhase(0);
  }
}

subscribeSelection(syncAntsAnimation);
```

- [ ] **Step 5: Gates** — all four PASS.

- [ ] **Step 6: Live verify** — on `?audit-raf`: with no selection, patching `CanvasRenderingContext2D.prototype.setLineDash` records no dashed strokes; after `Select All` (Task 7 isn't in yet, so drive it by committing a rect through a tool in Task 6's verification instead — **defer this step's live check to Task 6** and note it). For this task verify only that gates pass and no console errors appear on load.

- [ ] **Step 7: Commit**

```bash
git add src/canvas-overlay.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: draw and animate marching ants for the selection"
git push origin main
```

---

### Task 6: Marquee and Lasso tools

**Files:**
- Create: `src/tools/selection-shared.ts`, `src/tools/marquee.ts`, `src/tools/lasso.ts`
- Modify: `src/dom.ts` (icons), `src/shell/toolbar-groups.ts`, `src/main.ts` (registration), `src/engine/tools.ts` if `Tool` lacks a double-click hook — it does, so polygonal lasso closes on `Enter`/double-click via its own document listener
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `commitSelection` (Task 4), `SelectionMode`/`SelectionShape` (Task 3), `isEditingSessionLive`.
- Produces: live tools `marquee-rect`, `marquee-ellipse`, `lasso-free`, `lasso-poly`; shared `effectiveMode(e: PointerEvent | KeyboardEvent | MouseEvent): SelectionMode` and `getSelectionModeOption()`.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`, and in the existing `'the toolbar renders the manual tool groups with grayed future slots'` test remove `'Rectangular Marquee'` and `'Lasso'` from the stub list (they go live now) leaving the rest:

```js
test('selection tools are live with boolean modes', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  for (const live of ['marquee-rect', 'marquee-ellipse', 'lasso-free', 'lasso-poly']) {
    assert.match(groups, new RegExp(`tool:\\s*['"]${live}['"]`), `missing live tool ${live}`);
  }
  const shared = readFileSync(resolve(root, 'src/tools/selection-shared.ts'), 'utf8');
  assert.match(shared, /shiftKey/);
  assert.match(shared, /altKey/);
  assert.match(shared, /isEditingSessionLive/);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Icons** — add to `src/dom.ts`'s `icons` map:

```ts
  marquee: svg('<rect x="2.5" y="3.5" width="11" height="9" stroke-dasharray="2 2"/>'),
  marqueeEllipse: svg('<ellipse cx="8" cy="8" rx="5.5" ry="4.5" stroke-dasharray="2 2"/>'),
  lasso: svg('<path d="M8 3c3 0 5 1.6 5 3.6S11 10 8 10 3 8.6 3 6.6 5 3 8 3z"/><path d="M5 9.5c0 2 1 3.5 1 4.5"/>'),
  lassoPoly: svg('<path d="M3 5.5 8 2.5l5 3-2 6.5H5z" stroke-dasharray="2 2"/>')
```

- [ ] **Step 4: Implement `src/tools/selection-shared.ts`:**

```ts
import { toast } from '../toast';
import { commitSelection } from '../engine/selection';
import { isEditingSessionLive } from '../engine/session-status';
import type { SelectionMode, SelectionShape } from '../engine/selection-ops';
import type { ToolOption } from '../engine/tools';

let baseMode: SelectionMode = 'new';

export function setBaseMode(mode: SelectionMode): void { baseMode = mode; }

/** Modifiers temporarily override the options-bar mode (Photoshop behaviour). */
export function effectiveMode(e: { shiftKey?: boolean; altKey?: boolean }): SelectionMode {
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return baseMode;
}

export function selectionBlocked(): boolean {
  if (!isEditingSessionLive()) return false;
  toast('Finish the current session before selecting.');
  return true;
}

export function commitShape(shape: SelectionShape, mode: SelectionMode, label: string): void {
  commitSelection({ kind: 'shape', shape, mode }, label);
}

export function modeOption(key: string): ToolOption {
  return {
    key, label: 'Mode', kind: 'select', group: 'selection',
    choices: ['New', 'Add', 'Subtract', 'Intersect'],
    get: () => baseMode.charAt(0).toUpperCase() + baseMode.slice(1),
    set: (value: string) => { setBaseMode(value.toLowerCase() as SelectionMode); }
  };
}
```

- [ ] **Step 5: Implement `src/tools/marquee.ts`:**

```ts
import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { commitShape, effectiveMode, modeOption, selectionBlocked } from './selection-shared';
import { setSelectionPreview } from '../canvas-overlay';

interface Drag { start: DocPoint; current: DocPoint; mode: ReturnType<typeof effectiveMode> }
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
    options: [modeOption('marquee-mode')]
  };
}

export const marqueeRectTool = makeMarquee('marquee-rect', 'Rectangular Marquee', icons.marquee, 'm', false);
export const marqueeEllipseTool = makeMarquee('marquee-ellipse', 'Elliptical Marquee', icons.marqueeEllipse, '', true);
```

- [ ] **Step 6: Implement `src/tools/lasso.ts`:**

```ts
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
```

- [ ] **Step 7: Preview rendering** — in `src/canvas-overlay.ts` add:

```ts
import type { SelectionShape } from './engine/selection-ops';

let selectionPreview: SelectionShape | null = null;

export function setSelectionPreview(shape: SelectionShape | null): void { selectionPreview = shape; }

function drawSelectionPreview(ctx: CanvasRenderingContext2D, scale: number): void {
  if (!selectionPreview) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([4 / scale, 4 / scale]);
  ctx.beginPath();
  if (selectionPreview.kind === 'rect') {
    ctx.rect(selectionPreview.x, selectionPreview.y, selectionPreview.w, selectionPreview.h);
  } else if (selectionPreview.kind === 'ellipse') {
    ctx.ellipse(selectionPreview.cx, selectionPreview.cy,
      Math.abs(selectionPreview.rx), Math.abs(selectionPreview.ry), 0, 0, Math.PI * 2);
  } else if (selectionPreview.points.length >= 2) {
    ctx.moveTo(selectionPreview.points[0].x, selectionPreview.points[0].y);
    for (const point of selectionPreview.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
```

and call `drawSelectionPreview(ctx, scale);` immediately after `drawSelectionAnts(ctx, doc, scale);`.

- [ ] **Step 8: Wire tools** — `src/shell/toolbar-groups.ts` move-select group becomes:

```ts
  { id: 'move-select', entries: [{ tool: 'move' }, { tool: 'marquee-rect' }, { tool: 'marquee-ellipse' }, { tool: 'lasso-free' }, { tool: 'lasso-poly' }, { stub: 'Object Selection', key: 'W', phase: 'E' }] },
```

`src/main.ts`: import and `registerTool(marqueeRectTool); registerTool(marqueeEllipseTool); registerTool(lassoFreeTool); registerTool(lassoPolyTool);` after the painting tools; add Escape/Enter handling for the polygonal lasso inside the existing document keydown handler, before the tool-shortcut lookup:

```ts
  if (polygonInProgress() && e.key === 'Enter') { e.preventDefault(); finishPolygonLasso(); return; }
  if (polygonInProgress() && e.key === 'Escape') { e.preventDefault(); cancelPolygonLasso(); return; }
```

and per-tool status hints in `syncContextStatus`:

```ts
    else if (tool.id === 'marquee-rect' || tool.id === 'marquee-ellipse') status.textContent = 'Marquee · Drag to select · Shift adds · Alt subtracts';
    else if (tool.id === 'lasso-free') status.textContent = 'Lasso · Drag to select freehand · Shift adds · Alt subtracts';
    else if (tool.id === 'lasso-poly') status.textContent = 'Polygonal Lasso · Click points · Enter closes · Esc cancels';
```

- [ ] **Step 9: Gates** — all four PASS.

- [ ] **Step 10: Live verify** (fresh `?audit-raf`, fixture seeded, fixture layer selected). Re-read the canvas rect after each tool switch:

1. `M` activates the rectangular marquee; drag a box → `hasSelection()` true, one history entry `Rectangular selection`, marching ants stroke (patch `CanvasRenderingContext2D.prototype.setLineDash` and confirm dashed strokes occur).
2. Shift-drag a second box → entry `Rectangular selection` with mode add; selection bounds grow to cover both.
3. Alt-drag over part of it → bounds shrink or the alpha inside that box drops to 0.
4. Elliptical marquee from the flyout selects an ellipse (alpha at the ellipse centre is 255, at the box corner 0).
5. `L` freehand lasso drag traces a region → one `Lasso selection` entry.
6. Polygonal lasso: three clicks then `Enter` closes → one `Polygonal selection` entry; `Escape` mid-polygon cancels with no entry.
7. Undo reverts each selection change; redo restores it.
8. A selection tool drag during a live Free Transform is refused with the busy toast.

- [ ] **Step 11: Commit**

```bash
git add src/tools/selection-shared.ts src/tools/marquee.ts src/tools/lasso.ts src/dom.ts src/canvas-overlay.ts src/shell/toolbar-groups.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: add marquee and lasso selection tools"
git push origin main
```

---

### Task 7: Select menu goes live

**Files:**
- Modify: `src/main.ts` (replace the Phase A `phase: 'C'` stubs with working commands), `src/shell/menu-bar.ts` (add `select.reselect` to the Select menu)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `selectAll`, `deselect`, `reselect`, `invertSelection`, `hasSelection` (Task 4).
- Produces: working `select.all`, `select.deselect`, `select.reselect`, `select.inverse` commands.

**Important:** `registerCommand` throws on duplicate ids, so the existing stub registrations for `select.all`, `select.deselect`, and `select.inverse` in `src/main.ts` must be **edited in place**, not added alongside. `select.subject` stays a grayed stub.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('the Select menu drives real selection commands', () => {
  assert.match(main, /id:\s*'select\.all'[\s\S]{0,200}?selectAll\(\)/);
  assert.match(main, /id:\s*'select\.deselect'[\s\S]{0,200}?deselect\(\)/);
  assert.match(main, /id:\s*'select\.reselect'/);
  assert.match(main, /id:\s*'select\.inverse'[\s\S]{0,200}?invertSelection\(\)/);
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  assert.match(menu, /select\.reselect/);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement** — in `src/main.ts` replace these three registrations verbatim:

```ts
registerCommand({ id: 'select.all', label: 'Select All', shortcut: 'Ctrl+A', phase: 'C' });
registerCommand({ id: 'select.deselect', label: 'Deselect', shortcut: 'Ctrl+D', phase: 'C' });
registerCommand({ id: 'select.inverse', label: 'Inverse', shortcut: 'Shift+Ctrl+I', phase: 'C' });
```

with:

```ts
registerCommand({ id: 'select.all', label: 'Select All', shortcut: 'Ctrl+A', bindKey: true, run: () => selectAll() });
registerCommand({ id: 'select.deselect', label: 'Deselect', shortcut: 'Ctrl+D', bindKey: true, enabled: () => hasSelection(), run: () => deselect() });
registerCommand({ id: 'select.reselect', label: 'Reselect', shortcut: 'Shift+Ctrl+D', bindKey: true, enabled: () => !hasSelection(), run: () => reselect() });
registerCommand({ id: 'select.inverse', label: 'Inverse', shortcut: 'Shift+Ctrl+I', bindKey: true, enabled: () => hasSelection(), run: () => invertSelection() });
```

with the import `import { deselect, hasSelection, invertSelection, reselect, selectAll, subscribeSelection } from './engine/selection';` (Task 5 already imported `hasSelection`/`subscribeSelection`; extend that line rather than duplicating it).

In `src/shell/menu-bar.ts`, the Select menu entry becomes:

```ts
  { title: 'Select', items: ['select.all', 'select.deselect', 'select.reselect', 'select.inverse', 'select.subject'] },
```

- [ ] **Step 4: Gates** — all four PASS.

- [ ] **Step 5: Live verify** — `Ctrl+A` selects everything (ants appear around the document edge); Deselect is enabled and clears it; Reselect is enabled only when empty and restores the previous selection; Inverse flips coverage (alpha at a previously-selected pixel becomes 0 and vice versa); each is one undoable step; all four are inert while typing in a text field.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/shell/menu-bar.ts tests/ui-layout.test.mjs
git commit -m "feat: make the Select menu commands live"
git push origin main
```

---

### Task 8: Clip painting to the selection

**Files:**
- Modify: `src/engine/stroke-session.ts` (`endStroke`)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `getSelectionMask` (Task 4), `documentToBitmapMatrix` (Task 1), `layerNaturalSize`.
- Produces: strokes affect only selected pixels; dirty rect, single-command undo, and byte accounting are unchanged.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('stroke commits clip to the active selection', () => {
  const stroke = readFileSync(resolve(root, 'src/engine/stroke-session.ts'), 'utf8');
  assert.match(stroke, /getSelectionMask/);
  assert.match(stroke, /documentToBitmapMatrix/);
  assert.match(stroke, /destination-in/);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement** — in `src/engine/stroke-session.ts` add imports:

```ts
import { documentToBitmap, documentToBitmapMatrix, type Point } from './transform-geometry';
import { getSelectionMask } from './selection';
```

(replacing the existing `documentToBitmap` import line), and insert this immediately **before** the `const bctx = layer.bitmap.getContext('2d')!;` line in `endStroke`:

```ts
  // Clip the stroke to the selection: the mask is document-space, the stroke canvas
  // is bitmap-space, so render the mask through the layer's inverse affine first.
  const mask = getSelectionMask();
  if (mask) {
    const matrix = documentToBitmapMatrix(layer, layerNaturalSize(layer));
    const clip = document.createElement('canvas');
    clip.width = finished.canvas.width;
    clip.height = finished.canvas.height;
    const cctx = clip.getContext('2d')!;
    cctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    cctx.drawImage(mask, 0, 0);
    const sctx = finished.canvas.getContext('2d')!;
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(clip, 0, 0);
    sctx.restore();
  }
```

- [ ] **Step 4: Gates** — all four PASS.

- [ ] **Step 5: Live verify** (this is the phase's headline behaviour, so verify with bitmap-level pixels, not the composite):
  1. Seed the fixture, select the fixture layer, `M`, drag a marquee over the left half of the layer.
  2. `B`, set a distinct foreground, drag a stroke that crosses the marquee boundary left-to-right.
  3. Read the layer bitmap: a pixel inside the marquee on the stroke path is the paint colour; a pixel **outside** the marquee on the same path is byte-identical to its pre-stroke value.
  4. One `Brush stroke` entry; undo restores the inside pixel exactly.
  5. Deselect, repeat the same stroke: it now paints on both sides (proves the clip is selection-driven, not an accident).
  6. With an inverted selection, the same stroke paints only on the previously-unselected side.

- [ ] **Step 6: Commit**

```bash
git add src/engine/stroke-session.ts tests/ui-layout.test.mjs
git commit -m "feat: clip painting to the active selection"
git push origin main
```

---

### Task 9: Clear, Fill, and Crop to Selection

**Files:**
- Create: `src/engine/selection-edit.ts`
- Modify: `src/main.ts` (commands), `src/shell/menu-bar.ts` (Edit and Image menu items)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `getSelectionMask`, `getSelectionBounds`, `hasSelection` (Task 4); `documentToBitmapMatrix` (Task 1); `getForeground` (color-state); `beginCrop`/`previewCrop`/`applyCrop` (crop-session); `clampRect` (`src/engine/stroke-geometry.ts`).
- Produces:
  - `clearSelection(): boolean` — erases selected pixels on the active image layer, one command `Clear selection`
  - `fillSelection(color: string): boolean` — fills them, one command `Fill selection`
  - `cropToSelection(): boolean` — crops the document to the selection bounds

Both pixel operations reuse Phase B's dirty-rect command shape: snapshot the region, apply, snapshot, push once with `bytes = w * h * 8`.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('selection editing commands are registered', () => {
  const edit = readFileSync(resolve(root, 'src/engine/selection-edit.ts'), 'utf8');
  assert.match(edit, /destination-out/);
  assert.match(edit, /documentToBitmapMatrix/);
  assert.match(main, /edit\.clear/);
  assert.match(main, /edit\.fill/);
  assert.match(main, /image\.cropToSelection/);
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  assert.match(menu, /edit\.clear/);
  assert.match(menu, /image\.cropToSelection/);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement** — create `src/engine/selection-edit.ts`:

```ts
import { state, notify } from '../state';
import * as history from './history';
import { layerNaturalSize, type ImageLayer } from './document';
import { documentToBitmapMatrix } from './transform-geometry';
import { clampRect } from './stroke-geometry';
import { getSelectionBounds, getSelectionMask } from './selection';
import { beginCrop, previewCrop, applyCrop } from './crop-session';

function activeImageLayer(): ImageLayer | null {
  const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
  return layer && layer.kind === 'image' && layer.bitmap ? layer : null;
}

/** The selection mask rendered into the layer's bitmap space. */
function maskInBitmapSpace(layer: ImageLayer): HTMLCanvasElement | null {
  const mask = getSelectionMask();
  if (!mask || !layer.bitmap) return null;
  const matrix = documentToBitmapMatrix(layer, layerNaturalSize(layer));
  const clip = document.createElement('canvas');
  clip.width = layer.bitmap.width;
  clip.height = layer.bitmap.height;
  const ctx = clip.getContext('2d')!;
  ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  ctx.drawImage(mask, 0, 0);
  return clip;
}

function applyWithinSelection(
  label: string,
  paint: (ctx: CanvasRenderingContext2D, clip: HTMLCanvasElement) => void
): boolean {
  const layer = activeImageLayer();
  if (!layer || !layer.bitmap) return false;
  const clip = maskInBitmapSpace(layer);
  if (!clip) return false;
  const rect = clampRect(
    { x: 0, y: 0, w: layer.bitmap.width, h: layer.bitmap.height },
    layer.bitmap.width, layer.bitmap.height
  );
  if (!rect) return false;

  const bctx = layer.bitmap.getContext('2d')!;
  const before = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  paint(bctx, clip);
  const after = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  layer.bitmapRev++;

  history.push({
    label,
    bytes: rect.w * rect.h * 8,
    do: () => {
      layer.bitmap!.getContext('2d')!.putImageData(after, rect.x, rect.y);
      layer.bitmapRev++;
      notify('layerProps', 'composite');
    },
    undo: () => {
      layer.bitmap!.getContext('2d')!.putImageData(before, rect.x, rect.y);
      layer.bitmapRev++;
      notify('layerProps', 'composite');
    }
  });
  notify('layerProps', 'composite');
  return true;
}

export function clearSelection(): boolean {
  return applyWithinSelection('Clear selection', (ctx, clip) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(clip, 0, 0);
    ctx.restore();
  });
}

export function fillSelection(color: string): boolean {
  return applyWithinSelection('Fill selection', (ctx, clip) => {
    // Tint the clip, then composite it so only selected pixels receive paint.
    const tinted = document.createElement('canvas');
    tinted.width = clip.width;
    tinted.height = clip.height;
    const tctx = tinted.getContext('2d')!;
    tctx.drawImage(clip, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, tinted.width, tinted.height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tinted, 0, 0);
    ctx.restore();
  });
}

export function cropToSelection(): boolean {
  const bounds = getSelectionBounds();
  if (!bounds || bounds.w < 1 || bounds.h < 1) return false;
  if (!beginCrop()) return false;
  previewCrop({ x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h });
  return applyCrop();
}
```

- [ ] **Step 4: Register commands** — in `src/main.ts`:

```ts
import { clearSelection, cropToSelection, fillSelection } from './engine/selection-edit';
import { getForeground } from './engine/color-state'; // extend the existing color-state import

registerCommand({
  id: 'edit.clear', label: 'Clear', shortcut: 'Delete', bindKey: true,
  enabled: () => hasSelection() && Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    if (!clearSelection()) toast('Select an area on an image layer first.');
  })
});
registerCommand({
  id: 'edit.fill', label: 'Fill with Foreground', shortcut: 'Shift+F5', bindKey: true,
  enabled: () => hasSelection() && Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    if (!fillSelection(getForeground())) toast('Select an area on an image layer first.');
  })
});
registerCommand({
  id: 'image.cropToSelection', label: 'Crop to Selection',
  enabled: () => hasSelection(),
  run: () => guardTransformSession(() => {
    if (!cropToSelection()) toast('Make a selection first.');
  })
});
```

In `src/shell/menu-bar.ts` extend two menus:

```ts
  { title: 'Edit', items: ['edit.undo', 'edit.redo', '—', 'edit.freeTransform', '—', 'edit.clear', 'edit.fill'] },
  { title: 'Image', items: ['image.canvasSize', 'image.cropToSelection', 'image.imageSize', 'image.mode'] },
```

- [ ] **Step 5: Gates** — all four PASS.

- [ ] **Step 6: Live verify**
  1. Marquee a region on the fixture layer, press `Delete` → bitmap alpha inside the region is 0, outside is unchanged; one `Clear selection` entry; undo restores exactly.
  2. Set a distinct foreground, `Shift+F5` → those pixels become that colour, outside unchanged; undo restores.
  3. Marquee a region, `Image > Crop to Selection` → document dimensions equal the selection bounds; undo restores 1024×1024.
  4. With no selection both Edit items render grayed in the menu.

- [ ] **Step 7: Commit**

```bash
git add src/engine/selection-edit.ts src/main.ts src/shell/menu-bar.ts tests/ui-layout.test.mjs
git commit -m "feat: add Clear, Fill, and Crop to Selection"
git push origin main
```

---

### Task 10: Final regression, docs, and close-out

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/changelog.md`
- No source changes.

- [ ] **Step 1: Full live regression** on `?audit-raf` at 1280×800 — re-read the canvas rect after every tool change:
  - Selection: rect marquee, Shift-add, Alt-subtract, ellipse, freehand lasso, polygonal lasso (Enter closes, Escape cancels), Select All / Deselect / Reselect / Inverse, undo/redo for each.
  - Integration: clipped stroke (inside painted, outside byte-identical), Clear, Fill, Crop to Selection.
  - Marching ants animate while a selection exists and **pause** during a held stroke (capture `setLineDash` calls during a stroke and confirm the dash offset stops advancing).
  - Phase A/B regressions: menu commands, dock tabs, Tab/Shift+Tab, Reset Essentials, brush stroke + undo, eraser, eyedropper, transform session + guard, crop apply/undo, save round-trip.
  - Geometry probe across the surfaces: zero violations.

- [ ] **Step 2: Docs**

- `README.md`: Workspace table — extend the Toolbar row with "selection tools (marquees, lassos)"; add an Editing Workflow paragraph: selections constrain painting, Clear, and Fill; Shift adds and Alt subtracts; `M`/`L` shortcuts; Select menu commands with their shortcuts. Essential Shortcuts add `M`, `L`, `Ctrl+A`, `Ctrl+D`, `Shift+Ctrl+D`, `Shift+Ctrl+I`, `Delete`, `Shift+F5`.
- `docs/architecture.md`: add a paragraph next to the other engines describing `src/engine/selection.ts` (op-list state, derived mask cache, why op lists rather than 4 MB snapshots), `selection-contour.ts` (lattice edge walking for marching ants), and the document-space-mask ↔ bitmap-space clipping via `documentToBitmapMatrix`.
- `docs/changelog.md` top entry:

```markdown
## 3.4.0 - 2026-07-19

### Added

- **Selection system**: rectangular and elliptical marquees (`M`), freehand and polygonal lassos (`L`), boolean combination (Shift adds, Alt subtracts, Shift+Alt intersects) with an options-bar mode, animated marching ants, and a live Select menu (Select All, Deselect, Reselect, Inverse). Selections constrain painting to their interior and enable Clear (`Delete`), Fill with Foreground (`Shift+F5`), and Crop to Selection. Selection changes are undoable as compact operation lists rather than full-resolution mask snapshots. (Plan: 2026-07-19-selection-system.)
```

- [ ] **Step 3: Gates + commit + protocol**

```bash
git add README.md docs/architecture.md docs/changelog.md
git commit -m "docs: document the selection system and record 3.4.0"
git push origin main
```

AGENTS.md protocol: hooks refresh the graph; new modules (`selection`, `selection-ops`, `selection-contour`, `selection-edit`, `selection-shared`, `marquee`, `lasso`) change structure → `python -m graphify export obsidian`; verify `graphify-out/` stays untracked; update the project memory (Phase C shipped, Phase D next).
