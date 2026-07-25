# Phase D1 Shape Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** live verification runs on the preview server (`dev`) at `http://localhost:<port>/?audit-raf` — the port is assigned by `preview_start` (autoPort is on; it is not always 3000). Three harness lessons from Phases B and C, all mandatory:
> 1. A browser-console `import('/src/x.ts')` may resolve to a **different module instance** than the app's extensionless `'./x'` import. Verify through the DOM, canvas pixels, or by patching `CanvasRenderingContext2D.prototype` methods — and prove instance sharing with a probe (drive a change through the UI, then read it back through the import) before trusting any import-based assertion.
> 2. The canvas rect **moves** when the options bar changes rows on a tool switch. Re-read `getBoundingClientRect()` *after* every tool change inside synthetic-pointer helpers.
> 3. `history.entries().length` can stay flat after an undo because the redo tail truncates. Assert `history.cursor()` deltas or command labels instead.

**Goal:** Vector shape layers — Rectangle (`U`), Ellipse, Line, and Polygon tools producing resolution-independent layers with editable fill, stroke, corner radius, and sides, plus Rasterize Shape — per `docs/superpowers/specs/2026-07-20-shape-layers-design.md`.

**Architecture:** A third layer kind, `ShapeLayer`, stores shape parameters rather than pixels. A pure module (`src/engine/shape-geometry.ts`) turns those parameters into a list of drawing commands in the layer's local space, plus its natural size and the Shift/Alt drag constraints — all plain data, so all of it is unit-testable in node. The compositor replays the command list inside the existing layer transform, which means `layerNaturalSize()` is the only integration point Free Transform, snapping, crop, and hit-testing need.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest with the established `vi.stubGlobal` bootstrap; `test:ui` source contracts; `?audit-raf` live harness.

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies.
- Tools: `shape-rect` (`U`) with `shape-ellipse`, `shape-line`, `shape-polygon` nested in its flyout. Pen stays a grayed stub (phase D2); Custom Shape is not listed.
- Shape layers stay vector permanently. Fill, stroke, stroke width, corner radius, and polygon sides stay editable after creation.
- Appearance: fill colour (or none), stroke colour (or none), stroke width in document pixels. No dashes, caps, or joins.
- **Colour sourcing** (plan-level clarification of the spec): the options bar carries Fill and Stroke **on/off toggles** plus numeric Width / Radius / Sides. The actual colours at creation come from the Phase A foreground (fill) and background (stroke) chips; per-layer colours are edited afterwards in the Properties panel.
- Clamps: polygon sides 3–24 (integer), corner radius 0 … half the shorter side, stroke width 0–100, all dimensions non-negative.
- One history command per shape creation (`Add rectangle` / `Add ellipse` / `Add line` / `Add polygon`) via the existing `cmdAddLayer`; property edits use coalesced `cmdPatchLayer`.
- Shape tools are inert while a stroke, transform, or crop session is live (`isEditingSessionLive()`).
- The project file version **stays at 2** — a new layer kind is additive and does not change how existing data is read.
- Commits: subject only, NO Co-Authored-By trailer; `git push origin main` after each task.
- All four gates before every commit: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`.
- Superseded `test:ui` contracts are replaced in the same task that changes the source.

## File structure

| File | Responsibility |
| --- | --- |
| `src/engine/document.ts` (modify) | `ShapeSpec` + `ShapeLayer` types, `createShapeLayer`, `cloneLayer` shape branch, `getFilterString` kind widening, `layerNaturalSize` shape branch |
| `src/engine/shape-geometry.ts` (create) | Pure core: `shapeCommands`, `shapeNaturalSize`, `constrainDragRect`, `constrainLine`, `clampShape` |
| `src/engine/compositor.ts` (modify) | `drawLayer` shape branch (fill then stroke), shared by preview and export |
| `src/engine/shape-raster.ts` (create) | `rasterizeShapeLayer(layerId)` — replay commands into a bitmap, swap kind, one undoable command |
| `src/tools/shape-config.ts` (create) | Options state: fill/stroke toggles, stroke width, corner radius, polygon sides, with clamps |
| `src/tools/shape-shared.ts` (create) | Shared drag lifecycle, preview, and commit for all four tools |
| `src/tools/shape-tools.ts` (create) | The four `Tool` objects |
| `src/properties-panel.ts` (modify) | Shape section; stop treating "not image" as "text" |
| `src/layers-panel.ts` (modify) | Shape thumbnails and glyph |
| `src/engine/stroke-session.ts` (modify) | Refuse painting on shape layers |
| `src/engine/selection-edit.ts` | No change — already image-only |
| `src/engine/persistence.ts` | No change — shape layers serialize as plain JSON through the existing non-image branch |

---

### Task 1: ShapeLayer type and the third-kind audit

**Files:**
- Modify: `src/engine/document.ts`, `src/engine/commands.ts`
- Test: `tests/shape-layer-type.test.ts`

**Interfaces:**
- Consumes: existing `LayerBase`, `baseLayer`, `cloneLayer`, `getFilterString`.
- Produces (used by every later task):
  - `type ShapeSpec = { kind:'rect'; w:number; h:number; radius:number } | { kind:'ellipse'; rx:number; ry:number } | { kind:'line'; dx:number; dy:number } | { kind:'polygon'; radius:number; sides:number }`
  - `interface ShapeLayer extends LayerBase { kind:'shape'; shape: ShapeSpec; fill: string | null; stroke: string | null; strokeWidth: number }`
  - `type Layer = ImageLayer | TextLayer | ShapeLayer`
  - `createShapeLayer(doc: Doc, shape: ShapeSpec, opts: { fill: string | null; stroke: string | null; strokeWidth: number }, name?: string): ShapeLayer`
  - `getFilterString(effects, kind: 'image' | 'text' | 'shape')`

**Why this is its own task:** several branches in the codebase treat "not image" as "text" (`cloneLayer`, `layerNaturalSize`, `drawLayer`, the Properties panel). Introducing the type first makes the compiler enumerate them instead of leaving silent fallthroughs.

- [ ] **Step 1: Write the failing test**

Create `tests/shape-layer-type.test.ts`:

```ts
import { beforeAll, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  documentModel = await import('../src/engine/document');
});

test('createShapeLayer builds a centred vector layer', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'rect', w: 100, h: 50, radius: 8 },
    { fill: '#ff0000', stroke: '#000000', strokeWidth: 4 }
  );
  expect(layer.kind).toBe('shape');
  expect(layer.shape).toEqual({ kind: 'rect', w: 100, h: 50, radius: 8 });
  expect(layer.fill).toBe('#ff0000');
  expect(layer.stroke).toBe('#000000');
  expect(layer.strokeWidth).toBe(4);
  expect(layer.x).toBe(200);
  expect(layer.y).toBe(150);
  expect(layer.scaleX).toBe(100);
  expect(layer.rotation).toBe(0);
});

test('cloneLayer deep-copies a shape layer with a fresh id', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'polygon', radius: 40, sides: 6 },
    { fill: null, stroke: '#123456', strokeWidth: 2 }
  );
  const copy = documentModel.cloneLayer(doc, layer);
  expect(copy.kind).toBe('shape');
  expect(copy.id).not.toBe(layer.id);
  expect(copy.name).toBe(`${layer.name} copy`);
  if (copy.kind !== 'shape') throw new Error('expected a shape layer');
  expect(copy.shape).toEqual(layer.shape);
  expect(copy.shape).not.toBe(layer.shape);   // deep copy, not a shared reference
  expect(copy.stroke).toBe('#123456');
  expect(copy.fill).toBeNull();
});

test('getFilterString accepts the shape kind and skips image-only filters', () => {
  const effects = documentModel.defaultEffects();
  effects.blurOn = true;
  effects.blur = 3;
  effects.invert = true;
  const filter = documentModel.getFilterString(effects, 'shape');
  expect(filter).toContain('blur(3px)');
  expect(filter).toContain('invert(1)');
  expect(filter).not.toContain('saturate');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/shape-layer-type.test.ts`
Expected: FAIL — `createShapeLayer is not a function`.

- [ ] **Step 3: Add the types and factory** — in `src/engine/document.ts`, after the `TextLayer` interface:

```ts
export type ShapeSpec =
  | { kind: 'rect'; w: number; h: number; radius: number }
  | { kind: 'ellipse'; rx: number; ry: number }
  | { kind: 'line'; dx: number; dy: number }
  | { kind: 'polygon'; radius: number; sides: number };

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeSpec;
  fill: string | null;                      // null = no fill
  stroke: string | null;                    // null = no stroke
  strokeWidth: number;                      // DOCUMENT pixels, 0-100
}
```

and widen the union:

```ts
export type Layer = ImageLayer | TextLayer | ShapeLayer;
```

- [ ] **Step 4: Add the factory** — after `createTextLayer`:

```ts
export function createShapeLayer(
  doc: Doc,
  shape: ShapeSpec,
  opts: { fill: string | null; stroke: string | null; strokeWidth: number },
  name?: string
): ShapeLayer {
  return {
    ...baseLayer(doc, name ?? `Shape Layer ${layerCounter + 1}`),
    kind: 'shape',
    shape: { ...shape },
    fill: opts.fill,
    stroke: opts.stroke,
    strokeWidth: opts.strokeWidth
  };
}
```

- [ ] **Step 5: Fix the "not image means text" branches** — replace the tail of `cloneLayer`:

```ts
  if (layer.kind === 'shape') {
    return { ...common, kind: 'shape', shape: { ...layer.shape } } as ShapeLayer;
  }
  return { ...common, kind: 'text' } as TextLayer;
```

and widen `getFilterString`:

```ts
export function getFilterString(effects: Effects, kind: 'image' | 'text' | 'shape'): string {
```

- [ ] **Step 6: Widen the patch type** — in `src/engine/commands.ts`, change the `cmdPatchLayer` signature's patch parameter to:

```ts
  patch: Partial<LayerBase & {
    text: string; fontFamily: string; fontSize: number; color: string;
    shape: ShapeSpec; fill: string | null; stroke: string | null; strokeWidth: number;
  }>,
```

adding `ShapeSpec` to the existing `./document` type import in that file.

- [ ] **Step 7: Run the test** — PASS (3 tests).

- [ ] **Step 8: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`

Expected: vitest and both node suites pass. **`npm run build` will FAIL** with TypeScript errors in `compositor.ts`, `document.ts` (`layerNaturalSize`), `properties-panel.ts`, and `layers-panel.ts` — the compiler enumerating every place that assumed two kinds. That is the point of this task, but the tree must not be committed broken, so add these minimal guards now:

In `src/engine/document.ts`, `layerNaturalSize` — insert before the text path:

```ts
  if (layer.kind === 'shape') return { w: 0, h: 0 };   // real geometry lands in Task 4
```

In `src/engine/compositor.ts`, `drawLayer` — change `} else {` to:

```ts
  } else if (layer.kind === 'text') {
```

and close the chain after the text block with:

```ts
  }
  // Shape rendering lands in Task 4.
```

In `src/properties-panel.ts` line ~208, change `if (layer.kind === 'image') {` to `if (layer.kind !== 'text') {` so shapes take the non-text path and never read `layer.text` (Task 6 gives them their own section).

In `src/layers-panel.ts` line ~128, change the glyph expression to:

```ts
    const glyph = layer.kind === 'image' ? 'IMG' : layer.kind === 'shape' ? 'SHP' : 'TXT';
```

Re-run all four gates: all PASS.

```bash
git add src/engine/document.ts src/engine/commands.ts src/engine/compositor.ts src/properties-panel.ts src/layers-panel.ts tests/shape-layer-type.test.ts
git commit -m "feat: add the shape layer type and audit the layer-kind branches"
git push origin main
```

---

### Task 2: Shape geometry — command lists and natural size

**Files:**
- Create: `src/engine/shape-geometry.ts`
- Test: `tests/shape-geometry.test.ts`

**Interfaces:**
- Consumes: `ShapeSpec` (Task 1), `Size` from transform-geometry.
- Produces (used by Tasks 4, 5, 7, 8):
  - `type PathCommand = { op:'moveTo'; x:number; y:number } | { op:'lineTo'; x:number; y:number } | { op:'arcTo'; x1:number; y1:number; x2:number; y2:number; r:number } | { op:'ellipse'; cx:number; cy:number; rx:number; ry:number } | { op:'close' }`
  - `shapeCommands(shape: ShapeSpec): PathCommand[]` — local space, centred on the origin
  - `shapeNaturalSize(shape: ShapeSpec): Size` — geometry only, ignoring stroke width
  - `polygonPoints(radius: number, sides: number): Point[]` — exported for testing and reuse

- [ ] **Step 1: Write the failing test**

Create `tests/shape-geometry.test.ts`:

```ts
import { expect, test } from 'vitest';
import { polygonPoints, shapeCommands, shapeNaturalSize } from '../src/engine/shape-geometry';

test('a square-cornered rectangle is four lines around the origin', () => {
  const cmds = shapeCommands({ kind: 'rect', w: 100, h: 60, radius: 0 });
  expect(cmds).toEqual([
    { op: 'moveTo', x: -50, y: -30 },
    { op: 'lineTo', x: 50, y: -30 },
    { op: 'lineTo', x: 50, y: 30 },
    { op: 'lineTo', x: -50, y: 30 },
    { op: 'close' }
  ]);
});

test('a rounded rectangle uses arcTo corners and still closes', () => {
  const cmds = shapeCommands({ kind: 'rect', w: 100, h: 60, radius: 10 });
  expect(cmds[0]).toEqual({ op: 'moveTo', x: -40, y: -30 });
  expect(cmds.filter((c) => c.op === 'arcTo').length).toBe(4);
  expect(cmds[cmds.length - 1]).toEqual({ op: 'close' });
});

test('an ellipse is a single centred ellipse command', () => {
  expect(shapeCommands({ kind: 'ellipse', rx: 30, ry: 20 })).toEqual([
    { op: 'ellipse', cx: 0, cy: 0, rx: 30, ry: 20 },
    { op: 'close' }
  ]);
});

test('a line runs corner to corner through the origin', () => {
  expect(shapeCommands({ kind: 'line', dx: 80, dy: -40 })).toEqual([
    { op: 'moveTo', x: -40, y: 20 },
    { op: 'lineTo', x: 40, y: -20 }
  ]);
});

test('polygon vertices start at the top and wind evenly', () => {
  const pts = polygonPoints(50, 4);
  expect(pts.length).toBe(4);
  expect(pts[0].x).toBeCloseTo(0, 6);
  expect(pts[0].y).toBeCloseTo(-50, 6);   // first vertex points up
  expect(pts[1].x).toBeCloseTo(50, 6);
  expect(pts[1].y).toBeCloseTo(0, 6);
  const cmds = shapeCommands({ kind: 'polygon', radius: 50, sides: 6 });
  expect(cmds.filter((c) => c.op === 'lineTo').length).toBe(5);
  expect(cmds[0].op).toBe('moveTo');
  expect(cmds[cmds.length - 1]).toEqual({ op: 'close' });
});

test('natural size is the geometric bounding box', () => {
  expect(shapeNaturalSize({ kind: 'rect', w: 100, h: 60, radius: 10 })).toEqual({ w: 100, h: 60 });
  expect(shapeNaturalSize({ kind: 'ellipse', rx: 30, ry: 20 })).toEqual({ w: 60, h: 40 });
  expect(shapeNaturalSize({ kind: 'line', dx: -80, dy: 40 })).toEqual({ w: 80, h: 40 });
  const tri = shapeNaturalSize({ kind: 'polygon', radius: 50, sides: 3 });
  expect(tri.w).toBeCloseTo(Math.sqrt(3) * 50, 4);   // exact triangle bbox, not the circumcircle
  expect(tri.h).toBeCloseTo(75, 4);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/shape-geometry.ts`:

```ts
import type { ShapeSpec } from './document';
import type { Point, Size } from './transform-geometry';

export type PathCommand =
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | { op: 'arcTo'; x1: number; y1: number; x2: number; y2: number; r: number }
  | { op: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { op: 'close' };

/** Regular-polygon vertices, first vertex pointing up, wound clockwise. */
export function polygonPoints(radius: number, sides: number): Point[] {
  const count = Math.max(3, Math.round(sides));
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
}

/** Drawing commands in the layer's LOCAL space, centred on the origin. */
export function shapeCommands(shape: ShapeSpec): PathCommand[] {
  if (shape.kind === 'rect') {
    const hw = shape.w / 2;
    const hh = shape.h / 2;
    const r = Math.min(shape.radius, hw, hh);
    if (r <= 0) {
      return [
        { op: 'moveTo', x: -hw, y: -hh },
        { op: 'lineTo', x: hw, y: -hh },
        { op: 'lineTo', x: hw, y: hh },
        { op: 'lineTo', x: -hw, y: hh },
        { op: 'close' }
      ];
    }
    return [
      { op: 'moveTo', x: -hw + r, y: -hh },
      { op: 'arcTo', x1: hw, y1: -hh, x2: hw, y2: hh, r },
      { op: 'arcTo', x1: hw, y1: hh, x2: -hw, y2: hh, r },
      { op: 'arcTo', x1: -hw, y1: hh, x2: -hw, y2: -hh, r },
      { op: 'arcTo', x1: -hw, y1: -hh, x2: hw, y2: -hh, r },
      { op: 'close' }
    ];
  }
  if (shape.kind === 'ellipse') {
    return [{ op: 'ellipse', cx: 0, cy: 0, rx: shape.rx, ry: shape.ry }, { op: 'close' }];
  }
  if (shape.kind === 'line') {
    return [
      { op: 'moveTo', x: -shape.dx / 2, y: -shape.dy / 2 },
      { op: 'lineTo', x: shape.dx / 2, y: shape.dy / 2 }
    ];
  }
  const points = polygonPoints(shape.radius, shape.sides);
  const commands: PathCommand[] = [{ op: 'moveTo', x: points[0].x, y: points[0].y }];
  for (const point of points.slice(1)) commands.push({ op: 'lineTo', x: point.x, y: point.y });
  commands.push({ op: 'close' });
  return commands;
}

/** Geometric bounding box, ignoring stroke width (see layerNaturalSize for the stroke floor). */
export function shapeNaturalSize(shape: ShapeSpec): Size {
  if (shape.kind === 'rect') return { w: Math.abs(shape.w), h: Math.abs(shape.h) };
  if (shape.kind === 'ellipse') return { w: Math.abs(shape.rx) * 2, h: Math.abs(shape.ry) * 2 };
  if (shape.kind === 'line') return { w: Math.abs(shape.dx), h: Math.abs(shape.dy) };
  const points = polygonPoints(shape.radius, shape.sides);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
```

- [ ] **Step 4: Run the test** — PASS (6 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/shape-geometry.ts tests/shape-geometry.test.ts
git commit -m "feat: add pure shape geometry command lists"
git push origin main
```

---

### Task 3: Drag constraints and parameter clamps

**Files:**
- Modify: `src/engine/shape-geometry.ts`
- Test: `tests/shape-constraints.test.ts`

**Interfaces:**
- Consumes: `ShapeSpec`, `Point` (Tasks 1–2).
- Produces (used by Task 5 and Task 6):
  - `constrainDragRect(start: Point, current: Point, opts: { square: boolean; fromCenter: boolean }): { cx: number; cy: number; w: number; h: number }`
  - `constrainLine(start: Point, current: Point, snap: boolean): { cx: number; cy: number; dx: number; dy: number }` — `snap` quantises the angle to 15°
  - `clampShape(shape: ShapeSpec): ShapeSpec`
  - `clampStrokeWidth(value: number): number`

- [ ] **Step 1: Write the failing test**

Create `tests/shape-constraints.test.ts`:

```ts
import { expect, test } from 'vitest';
import { clampShape, clampStrokeWidth, constrainDragRect, constrainLine } from '../src/engine/shape-geometry';

const A = { x: 100, y: 100 };

test('a plain drag spans corner to corner', () => {
  const r = constrainDragRect(A, { x: 300, y: 200 }, { square: false, fromCenter: false });
  expect(r).toEqual({ cx: 200, cy: 150, w: 200, h: 100 });
});

test('a backwards drag still yields positive dimensions', () => {
  const r = constrainDragRect(A, { x: 40, y: 60 }, { square: false, fromCenter: false });
  expect(r).toEqual({ cx: 70, cy: 80, w: 60, h: 40 });
});

test('square constrains to the larger axis and keeps the drag direction', () => {
  const r = constrainDragRect(A, { x: 300, y: 150 }, { square: true, fromCenter: false });
  expect(r.w).toBe(200);
  expect(r.h).toBe(200);
  expect(r.cx).toBe(200);
  expect(r.cy).toBe(200);   // grew downward, matching the drag's sign
});

test('fromCenter treats the press point as the centre', () => {
  const r = constrainDragRect(A, { x: 200, y: 160 }, { square: false, fromCenter: true });
  expect(r).toEqual({ cx: 100, cy: 100, w: 200, h: 120 });
});

test('square plus fromCenter combine', () => {
  const r = constrainDragRect(A, { x: 200, y: 130 }, { square: true, fromCenter: true });
  expect(r.cx).toBe(100);
  expect(r.cy).toBe(100);
  expect(r.w).toBe(200);
  expect(r.h).toBe(200);
});

test('an unsnapped line keeps its exact delta and midpoint', () => {
  const line = constrainLine(A, { x: 220, y: 160 }, false);
  expect(line).toEqual({ cx: 160, cy: 130, dx: 120, dy: 60 });
});

test('a snapped line quantises to 15 degrees', () => {
  const flat = constrainLine(A, { x: 200, y: 8 }, true);   // ~5 degrees up
  expect(flat.dy).toBeCloseTo(0, 6);
  expect(flat.dx).toBeCloseTo(Math.hypot(100, -92), 6);
  const diagonal = constrainLine(A, { x: 200, y: 190 }, true);   // ~42 degrees
  expect(Math.abs(diagonal.dx)).toBeCloseTo(Math.abs(diagonal.dy), 6);   // snapped to 45
});

test('clampShape bounds radius, sides, and negatives', () => {
  expect(clampShape({ kind: 'rect', w: 100, h: 40, radius: 90 }))
    .toEqual({ kind: 'rect', w: 100, h: 40, radius: 20 });
  expect(clampShape({ kind: 'rect', w: -10, h: 40, radius: -5 }))
    .toEqual({ kind: 'rect', w: 10, h: 40, radius: 0 });
  expect(clampShape({ kind: 'polygon', radius: 30, sides: 1 }))
    .toEqual({ kind: 'polygon', radius: 30, sides: 3 });
  expect(clampShape({ kind: 'polygon', radius: 30, sides: 99 }))
    .toEqual({ kind: 'polygon', radius: 30, sides: 24 });
  expect(clampShape({ kind: 'polygon', radius: 30, sides: 6.4 }))
    .toEqual({ kind: 'polygon', radius: 30, sides: 6 });
  expect(clampShape({ kind: 'ellipse', rx: -5, ry: 20 }))
    .toEqual({ kind: 'ellipse', rx: 5, ry: 20 });
});

test('clampStrokeWidth bounds to 0-100', () => {
  expect(clampStrokeWidth(-3)).toBe(0);
  expect(clampStrokeWidth(250)).toBe(100);
  expect(clampStrokeWidth(4.6)).toBe(5);
  expect(clampStrokeWidth(Number.NaN)).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, exports missing.

- [ ] **Step 3: Implement** — append to `src/engine/shape-geometry.ts`:

```ts
/** Drag rectangle with Shift (square) and Alt (from centre) applied. */
export function constrainDragRect(
  start: Point,
  current: Point,
  opts: { square: boolean; fromCenter: boolean }
): { cx: number; cy: number; w: number; h: number } {
  let dx = current.x - start.x;
  let dy = current.y - start.y;
  if (opts.square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = size * (dx < 0 ? -1 : 1);
    dy = size * (dy < 0 ? -1 : 1);
  }
  if (opts.fromCenter) {
    return { cx: start.x, cy: start.y, w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  }
  return { cx: start.x + dx / 2, cy: start.y + dy / 2, w: Math.abs(dx), h: Math.abs(dy) };
}

const LINE_SNAP_RADIANS = (15 * Math.PI) / 180;

/** Line endpoints as a centre plus delta; `snap` quantises the angle to 15 degrees. */
export function constrainLine(
  start: Point,
  current: Point,
  snap: boolean
): { cx: number; cy: number; dx: number; dy: number } {
  let dx = current.x - start.x;
  let dy = current.y - start.y;
  if (snap) {
    const length = Math.hypot(dx, dy);
    const angle = Math.round(Math.atan2(dy, dx) / LINE_SNAP_RADIANS) * LINE_SNAP_RADIANS;
    dx = length * Math.cos(angle);
    dy = length * Math.sin(angle);
  }
  return { cx: start.x + dx / 2, cy: start.y + dy / 2, dx, dy };
}

export function clampStrokeWidth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampShape(shape: ShapeSpec): ShapeSpec {
  if (shape.kind === 'rect') {
    const w = Math.abs(shape.w);
    const h = Math.abs(shape.h);
    const radius = Math.min(Math.max(0, shape.radius), w / 2, h / 2);
    return { kind: 'rect', w, h, radius: Number.isFinite(radius) ? radius : 0 };
  }
  if (shape.kind === 'ellipse') {
    return { kind: 'ellipse', rx: Math.abs(shape.rx), ry: Math.abs(shape.ry) };
  }
  if (shape.kind === 'line') return { kind: 'line', dx: shape.dx, dy: shape.dy };
  return {
    kind: 'polygon',
    radius: Math.abs(shape.radius),
    sides: Math.min(24, Math.max(3, Math.round(shape.sides)))
  };
}
```

- [ ] **Step 4: Run the test** — PASS (9 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/shape-geometry.ts tests/shape-constraints.test.ts
git commit -m "feat: add shape drag constraints and parameter clamps"
git push origin main
```

---

### Task 4: Rendering and natural size

**Files:**
- Modify: `src/engine/document.ts` (`layerNaturalSize`), `src/engine/compositor.ts` (`drawLayer`)
- Test: `tests/shape-natural-size.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `shapeCommands`, `shapeNaturalSize` (Task 2), `ShapeLayer` (Task 1).
- Produces: shape layers render in preview and export; `layerNaturalSize` returns real sizes so Free Transform, snapping, crop, and hit-testing work.

**Stroke floor:** a horizontal line has a geometric height of 0, which would make it unselectable and untransformable. `layerNaturalSize` therefore floors a shape's size at its stroke width — the one place stroke width participates in geometry.

- [ ] **Step 1: Write the failing tests**

Create `tests/shape-natural-size.test.ts`:

```ts
import { beforeAll, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  documentModel = await import('../src/engine/document');
});

test('shape layers report their geometric size', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'rect', w: 120, h: 80, radius: 0 },
    { fill: '#ff0000', stroke: null, strokeWidth: 0 }
  );
  expect(documentModel.layerNaturalSize(layer)).toEqual({ w: 120, h: 80 });
});

test('a flat line is floored to its stroke width so it stays selectable', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createShapeLayer(
    doc, { kind: 'line', dx: 200, dy: 0 },
    { fill: null, stroke: '#000000', strokeWidth: 6 }
  );
  expect(documentModel.layerNaturalSize(layer)).toEqual({ w: 200, h: 6 });
});
```

and add to `tests/ui-layout.test.mjs`:

```js
test('the compositor renders shape layers from their command list', () => {
  const compositor = readFileSync(resolve(root, 'src/engine/compositor.ts'), 'utf8');
  assert.match(compositor, /shapeCommands/);
  assert.match(compositor, /case 'arcTo'/);
  assert.match(compositor, /layer\.fill/);
  assert.match(compositor, /layer\.stroke/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/shape-natural-size.test.ts` → FAIL (returns `{w:0,h:0}` from the Task 1 placeholder).
Run: `npm run test:ui` → FAIL on the new contract.

- [ ] **Step 3: Implement natural size** — in `src/engine/document.ts`, replace the Task 1 placeholder line in `layerNaturalSize` with:

```ts
  if (layer.kind === 'shape') {
    const size = shapeNaturalSize(layer.shape);
    // Floor by stroke width so a flat line still has a grabbable box.
    const floor = Math.max(0, layer.strokeWidth);
    return { w: Math.max(size.w, floor), h: Math.max(size.h, floor) };
  }
```

adding the import at the top of the file:

```ts
import { shapeNaturalSize } from './shape-geometry';
```

- [ ] **Step 4: Implement rendering** — in `src/engine/compositor.ts`, add the import:

```ts
import { shapeCommands } from './shape-geometry';
```

and replace the `// Shape rendering lands in Task 4.` comment left by Task 1 with:

```ts
  else {
    ctx.beginPath();
    for (const cmd of shapeCommands(layer.shape)) {
      switch (cmd.op) {
        case 'moveTo': ctx.moveTo(cmd.x, cmd.y); break;
        case 'lineTo': ctx.lineTo(cmd.x, cmd.y); break;
        case 'arcTo': ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r); break;
        case 'ellipse': ctx.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry, 0, 0, Math.PI * 2); break;
        case 'close': ctx.closePath(); break;
      }
    }
    if (layer.fill) {
      ctx.fillStyle = layer.fill;
      ctx.fill();
    }
    if (layer.stroke && layer.strokeWidth > 0) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke();
    }
  }
```

so the chain reads `if (image) … else if (text) … else { shape }`.

- [ ] **Step 5: Run the tests** — `npx vitest run tests/shape-natural-size.test.ts` PASS (2); `npm run test:ui` PASS.
- [ ] **Step 6: Gates and commit**

```bash
git add src/engine/document.ts src/engine/compositor.ts tests/shape-natural-size.test.ts tests/ui-layout.test.mjs
git commit -m "feat: render shape layers and derive their natural size"
git push origin main
```

---

### Task 5: The four shape tools

**Files:**
- Create: `src/tools/shape-config.ts`, `src/tools/shape-shared.ts`, `src/tools/shape-tools.ts`
- Modify: `src/dom.ts` (icons), `src/canvas-overlay.ts` (shape preview), `src/shell/toolbar-groups.ts`, `src/main.ts` (registration + status hints)
- Test: `tests/shape-config.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `constrainDragRect`, `constrainLine`, `clampShape`, `clampStrokeWidth` (Task 3); `createShapeLayer` (Task 1); `cmdAddLayer` from `src/engine/commands.ts`; `getForeground`/`getBackground` from `src/engine/color-state.ts`; `isEditingSessionLive`.
- Produces:
  - `src/tools/shape-config.ts`: `getShapeSetting(key: 'fillOn'|'strokeOn'): boolean`, `setShapeToggle(key, value)`, `getShapeNumber(key: 'strokeWidth'|'radius'|'sides'): number`, `setShapeNumber(key, value)`, `__resetShapeConfigForTest()`
  - `src/tools/shape-tools.ts`: `shapeRectTool`, `shapeEllipseTool`, `shapeLineTool`, `shapePolygonTool`
  - `src/canvas-overlay.ts`: `setShapePreview(preview: { commands: PathCommand[]; cx: number; cy: number } | null)`

- [ ] **Step 1: Write the failing config test**

Create `tests/shape-config.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import {
  __resetShapeConfigForTest, getShapeNumber, getShapeSetting, setShapeNumber, setShapeToggle
} from '../src/tools/shape-config';

beforeEach(() => __resetShapeConfigForTest());

test('defaults draw a filled, unstroked shape', () => {
  expect(getShapeSetting('fillOn')).toBe(true);
  expect(getShapeSetting('strokeOn')).toBe(false);
  expect(getShapeNumber('strokeWidth')).toBe(4);
  expect(getShapeNumber('radius')).toBe(0);
  expect(getShapeNumber('sides')).toBe(5);
});

test('numbers clamp to their documented ranges', () => {
  setShapeNumber('sides', 99);
  expect(getShapeNumber('sides')).toBe(24);
  setShapeNumber('sides', 1);
  expect(getShapeNumber('sides')).toBe(3);
  setShapeNumber('strokeWidth', 500);
  expect(getShapeNumber('strokeWidth')).toBe(100);
  setShapeNumber('radius', -20);
  expect(getShapeNumber('radius')).toBe(0);
});

test('toggles round-trip', () => {
  setShapeToggle('fillOn', false);
  setShapeToggle('strokeOn', true);
  expect(getShapeSetting('fillOn')).toBe(false);
  expect(getShapeSetting('strokeOn')).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement the config** — create `src/tools/shape-config.ts`:

```ts
import { clampStrokeWidth } from '../engine/shape-geometry';

interface ShapeConfig {
  fillOn: boolean;
  strokeOn: boolean;
  strokeWidth: number;
  radius: number;
  sides: number;
}

const DEFAULTS: ShapeConfig = { fillOn: true, strokeOn: false, strokeWidth: 4, radius: 0, sides: 5 };

let config: ShapeConfig = { ...DEFAULTS };

export function getShapeSetting(key: 'fillOn' | 'strokeOn'): boolean { return config[key]; }

export function setShapeToggle(key: 'fillOn' | 'strokeOn', value: boolean): void {
  config[key] = Boolean(value);
}

export function getShapeNumber(key: 'strokeWidth' | 'radius' | 'sides'): number { return config[key]; }

export function setShapeNumber(key: 'strokeWidth' | 'radius' | 'sides', value: number): void {
  if (!Number.isFinite(value)) return;
  if (key === 'strokeWidth') { config.strokeWidth = clampStrokeWidth(value); return; }
  if (key === 'sides') { config.sides = Math.min(24, Math.max(3, Math.round(value))); return; }
  config.radius = Math.max(0, Math.round(value));
}

export function __resetShapeConfigForTest(): void { config = { ...DEFAULTS }; }
```

- [ ] **Step 4: Add the contract** — add to `tests/ui-layout.test.mjs`:

```js
test('shape tools are live in the drawing group', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  for (const live of ['shape-rect', 'shape-ellipse', 'shape-line', 'shape-polygon']) {
    assert.match(groups, new RegExp(`tool:\\s*['"]${live}['"]`), `missing live tool ${live}`);
  }
  assert.match(groups, /stub: 'Pen'/);   // Pen stays grayed for D2
  const shared = readFileSync(resolve(root, 'src/tools/shape-shared.ts'), 'utf8');
  assert.match(shared, /constrainDragRect/);
  assert.match(shared, /isEditingSessionLive/);
  assert.match(shared, /cmdAddLayer/);
  assert.match(main, /Rectangle · Drag to draw/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 5: Add icons** — add to the `icons` map in `src/dom.ts`:

```ts
  shapeRect: svg('<rect x="2.5" y="4.5" width="11" height="7" rx="1.5"/>'),
  shapeEllipse: svg('<ellipse cx="8" cy="8" rx="5.5" ry="4"/>'),
  shapeLine: svg('<line x1="3" y1="12.5" x2="13" y2="3.5"/>'),
  shapePolygon: svg('<path d="M8 2.5 13.5 6.6 11.4 13h-6.8L2.5 6.6z"/>')
```

- [ ] **Step 6: Add the overlay preview** — in `src/canvas-overlay.ts`, add the import and state:

```ts
import type { PathCommand } from './engine/shape-geometry';
```

```ts
let shapePreview: { commands: PathCommand[]; cx: number; cy: number } | null = null;

/** In-progress shape, drawn dashed in document space until the drag commits. */
export function setShapePreview(preview: { commands: PathCommand[]; cx: number; cy: number } | null): void {
  shapePreview = preview;
}

function drawShapePreview(ctx: CanvasRenderingContext2D, scale: number): void {
  if (!shapePreview) return;
  ctx.save();
  ctx.translate(shapePreview.cx, shapePreview.cy);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([4 / scale, 4 / scale]);
  ctx.beginPath();
  for (const cmd of shapePreview.commands) {
    switch (cmd.op) {
      case 'moveTo': ctx.moveTo(cmd.x, cmd.y); break;
      case 'lineTo': ctx.lineTo(cmd.x, cmd.y); break;
      case 'arcTo': ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r); break;
      case 'ellipse': ctx.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry, 0, 0, Math.PI * 2); break;
      case 'close': ctx.closePath(); break;
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
```

and call it immediately after `drawSelectionPreview(ctx, scale);` in `drawCanvasOverlay`:

```ts
  drawShapePreview(ctx, scale);
```

- [ ] **Step 7: Implement the shared drag** — create `src/tools/shape-shared.ts`:

```ts
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
```

(`src/engine/color-state.ts` exports `getForeground()` and `getBackground()`, both returning `#rrggbb` strings.)

- [ ] **Step 8: Implement the tools** — create `src/tools/shape-tools.ts`:

```ts
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
  }
  if (kind !== 'line') {
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
```

- [ ] **Step 9: Wire the toolbar and registration** — in `src/shell/toolbar-groups.ts` replace the `draw` group:

```ts
  { id: 'draw', entries: [{ stub: 'Pen', key: 'P', phase: 'D' }, { tool: 'shape-rect' }, { tool: 'shape-ellipse' }, { tool: 'shape-line' }, { tool: 'shape-polygon' }] },
```

In `src/main.ts`, import and register after the selection tools:

```ts
import { shapeEllipseTool, shapeLineTool, shapePolygonTool, shapeRectTool } from './tools/shape-tools';
```

```ts
registerTool(shapeRectTool);
registerTool(shapeEllipseTool);
registerTool(shapeLineTool);
registerTool(shapePolygonTool);
```

and add status hints in `syncContextStatus`, beside the existing per-tool hints:

```ts
    else if (tool.id === 'shape-rect') status.textContent = 'Rectangle · Drag to draw · Shift squares · Alt from center';
    else if (tool.id === 'shape-ellipse') status.textContent = 'Ellipse · Drag to draw · Shift circles · Alt from center';
    else if (tool.id === 'shape-line') status.textContent = 'Line · Drag to draw · Shift snaps to 15°';
    else if (tool.id === 'shape-polygon') status.textContent = 'Polygon · Drag to draw · Sides set in the options bar';
```

- [ ] **Step 10: Gates** — all four PASS.

- [ ] **Step 11: Live verify** (fresh `?audit-raf`; re-read the canvas rect after every tool change; prove import instance sharing first):
  1. `U` activates Rectangle; drag → one `Add rectangle` history entry, a new shape layer, and the composited pixel at its centre equals the foreground colour.
  2. Shift-drag → the layer's `shape.w` equals `shape.h` exactly.
  3. Alt-drag → the layer centre equals the press point.
  4. Ellipse from the flyout: centre pixel filled, a bounding-box corner pixel transparent.
  5. Line: with stroke width 8, a pixel on the line reads the background-chip colour; `layerNaturalSize` height is ≥ 8 so the layer is selectable.
  6. Polygon with sides 3: exactly 3 vertices in `shapeCommands`, centre filled.
  7. A click without a drag creates nothing.
  8. Drawing during a live Free Transform is refused with the busy toast and no history entry.
  9. Undo removes the shape; redo restores it.

- [ ] **Step 12: Commit**

```bash
git add src/tools/shape-config.ts src/tools/shape-shared.ts src/tools/shape-tools.ts src/dom.ts src/canvas-overlay.ts src/shell/toolbar-groups.ts src/main.ts tests/shape-config.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add Rectangle, Ellipse, Line, and Polygon shape tools"
git push origin main
```

---

### Task 6: Properties panel shape section

**Files:**
- Modify: `index.html` (shape section markup), `src/properties-panel.ts`, `src/style.css`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `cmdPatchLayer` (widened in Task 1), `clampShape`/`clampStrokeWidth` (Task 3).
- Produces: per-layer editing of fill, stroke, stroke width, corner radius, and sides for a selected shape layer.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('the properties panel edits shape layers', () => {
  for (const id of ['prop-shape-fill', 'prop-shape-stroke', 'prop-shape-width', 'prop-shape-radius', 'prop-shape-sides']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing control ${id}`);
  }
  const props = readFileSync(resolve(root, 'src/properties-panel.ts'), 'utf8');
  assert.match(props, /kind === 'shape'/);
  assert.match(props, /cmdPatchLayer/);
  assert.match(props, /sectionShapeProps/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 2: Add the markup** — in `index.html`, immediately after the existing text-properties section (`#section-text-props`), add:

```html
<div class="prop-section" id="section-shape-props" style="display:none">
  <div class="prop-row"><label for="prop-shape-fill">Fill</label><input type="color" id="prop-shape-fill" /></div>
  <div class="prop-row"><label for="prop-shape-stroke">Stroke</label><input type="color" id="prop-shape-stroke" /></div>
  <div class="prop-row"><label for="prop-shape-width">Stroke width</label><input type="range" id="prop-shape-width" min="0" max="100" step="1" /><span class="prop-value" id="prop-shape-width-value">0</span></div>
  <div class="prop-row" id="prop-shape-radius-row"><label for="prop-shape-radius">Corner radius</label><input type="range" id="prop-shape-radius" min="0" max="500" step="1" /><span class="prop-value" id="prop-shape-radius-value">0</span></div>
  <div class="prop-row" id="prop-shape-sides-row"><label for="prop-shape-sides">Sides</label><input type="range" id="prop-shape-sides" min="3" max="24" step="1" /><span class="prop-value" id="prop-shape-sides-value">5</span></div>
</div>
```

- [ ] **Step 3: Wire the panel** — in `src/properties-panel.ts` add near the other element lookups:

```ts
const sectionShapeProps = $('section-shape-props');
const propShapeFill = $('prop-shape-fill') as HTMLInputElement;
const propShapeStroke = $('prop-shape-stroke') as HTMLInputElement;
const propShapeWidth = $('prop-shape-width') as HTMLInputElement;
const propShapeRadius = $('prop-shape-radius') as HTMLInputElement;
const propShapeSides = $('prop-shape-sides') as HTMLInputElement;
```

Replace the Task 1 stopgap `if (layer.kind !== 'text') {` block's structure with an explicit three-way sync:

```ts
  const isImage = layer.kind === 'image';
  document.querySelectorAll('.filter-image-only').forEach((el) => {
    (el as HTMLElement).style.display = isImage ? '' : 'none';
  });
  sectionTextProps.style.display = layer.kind === 'text' ? 'block' : 'none';
  sectionShapeProps.style.display = layer.kind === 'shape' ? 'block' : 'none';

  if (layer.kind === 'text') {
    syncVal(propTextContent, layer.text);
    syncVal(propFontFamily, layer.fontFamily);
    syncVal(propFontSize, layer.fontSize.toString());
    fontSizeValueEl.textContent = `${layer.fontSize}px`;
    syncVal(propTextColor, layer.color);
  } else if (layer.kind === 'shape') {
    syncVal(propShapeFill, layer.fill ?? '#000000');
    syncVal(propShapeStroke, layer.stroke ?? '#000000');
    syncVal(propShapeWidth, String(layer.strokeWidth));
    $('prop-shape-width-value').textContent = String(layer.strokeWidth);
    const isRect = layer.shape.kind === 'rect';
    const isPolygon = layer.shape.kind === 'polygon';
    $('prop-shape-radius-row').style.display = isRect ? '' : 'none';
    $('prop-shape-sides-row').style.display = isPolygon ? '' : 'none';
    if (isRect && layer.shape.kind === 'rect') {
      syncVal(propShapeRadius, String(layer.shape.radius));
      $('prop-shape-radius-value').textContent = String(Math.round(layer.shape.radius));
    }
    if (isPolygon && layer.shape.kind === 'polygon') {
      syncVal(propShapeSides, String(layer.shape.sides));
      $('prop-shape-sides-value').textContent = String(layer.shape.sides);
    }
  }
```

- [ ] **Step 4: Add the listeners** — beside the existing text listeners:

```ts
  propShapeFill.addEventListener('input', () => {
    const layer = getActiveLayer(state.doc);
    if (layer && layer.kind === 'shape') {
      history.push(cmdPatchLayer(layer.id, 'Shape fill', { fill: propShapeFill.value }, `${layer.id}:fill`));
    }
  });
  propShapeStroke.addEventListener('input', () => {
    const layer = getActiveLayer(state.doc);
    if (layer && layer.kind === 'shape') {
      history.push(cmdPatchLayer(layer.id, 'Shape stroke', { stroke: propShapeStroke.value }, `${layer.id}:stroke`));
    }
  });
  propShapeWidth.addEventListener('input', () => {
    const layer = getActiveLayer(state.doc);
    if (layer && layer.kind === 'shape') {
      const width = clampStrokeWidth(Number(propShapeWidth.value));
      history.push(cmdPatchLayer(layer.id, 'Stroke width', { strokeWidth: width }, `${layer.id}:strokeWidth`));
    }
  });
  propShapeRadius.addEventListener('input', () => {
    const layer = getActiveLayer(state.doc);
    if (layer && layer.kind === 'shape' && layer.shape.kind === 'rect') {
      const shape = clampShape({ ...layer.shape, radius: Number(propShapeRadius.value) });
      history.push(cmdPatchLayer(layer.id, 'Corner radius', { shape }, `${layer.id}:radius`));
    }
  });
  propShapeSides.addEventListener('input', () => {
    const layer = getActiveLayer(state.doc);
    if (layer && layer.kind === 'shape' && layer.shape.kind === 'polygon') {
      const shape = clampShape({ ...layer.shape, sides: Number(propShapeSides.value) });
      history.push(cmdPatchLayer(layer.id, 'Polygon sides', { shape }, `${layer.id}:sides`));
    }
  });
```

with `import { clampShape, clampStrokeWidth } from './engine/shape-geometry';` added to the file's imports.

- [ ] **Step 5: Style** — append to `src/style.css`:

```css
#section-shape-props .prop-row { align-items: center; }
#section-shape-props input[type="color"] { width: 34px; height: 24px; padding: 0; border: none; background: none; }
```

- [ ] **Step 6: Gates** — all four PASS.

- [ ] **Step 7: Live verify** — select a drawn rectangle: the shape section appears and the text section does not; changing Fill recolours it immediately; dragging Stroke width from 0 to 20 leaves **one** history entry (coalesced) and a visible outline; the Radius row shows only for rectangles and the Sides row only for polygons; dragging Sides from 5 to 3 renders a triangle; each edit undoes in one step.

- [ ] **Step 8: Commit**

```bash
git add index.html src/properties-panel.ts src/style.css tests/ui-layout.test.mjs
git commit -m "feat: edit shape layer appearance in the properties panel"
git push origin main
```

---

### Task 7: Rasterize Shape and the painting refusals

**Files:**
- Create: `src/engine/shape-raster.ts`
- Modify: `src/engine/stroke-session.ts`, `src/main.ts`, `src/shell/menu-bar.ts`
- Test: `tests/shape-raster.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `shapeCommands`, `shapeNaturalSize` (Task 2); `layerNaturalSize`; `history`.
- Produces: `rasterizeShapeLayer(layerId: string): boolean` — replays the shape into a bitmap, swaps the layer to `kind: 'image'`, pushes one undoable command; `StrokeRefusal` gains `'shape-layer'`.

- [ ] **Step 1: Write the failing test**

Create `tests/shape-raster.test.ts`:

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arcTo: () => {}, ellipse: () => {},
    closePath: () => {}, fill: () => {}, stroke: () => {}, drawImage: () => {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    measureText: (t: string) => ({ width: t.length * 10 })
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let raster: typeof import('../src/engine/shape-raster');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctxStub() };
      return canvas;
    }
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  raster = await import('../src/engine/shape-raster');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function addShape() {
  const layer = documentModel.createShapeLayer(
    stateModule.state.doc, { kind: 'rect', w: 100, h: 60, radius: 0 },
    { fill: '#ff0000', stroke: null, strokeWidth: 0 }
  );
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

test('rasterizing swaps the layer to an image and is undoable in one step', () => {
  const layer = addShape();
  expect(raster.rasterizeShapeLayer(layer.id)).toBe(true);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.kind).toBe('image');
  if (after.kind !== 'image') throw new Error('expected an image layer');
  expect(after.bitmap).not.toBeNull();
  expect(after.bitmap!.width).toBe(100);
  expect(after.bitmap!.height).toBe(60);
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Rasterize shape');

  history.undo();
  const reverted = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(reverted.kind).toBe('shape');
  if (reverted.kind !== 'shape') throw new Error('expected a shape layer');
  expect(reverted.shape).toEqual({ kind: 'rect', w: 100, h: 60, radius: 0 });
  expect(reverted.fill).toBe('#ff0000');
});

test('rasterizing preserves the layer transform and identity', () => {
  const layer = addShape();
  layer.rotation = 30;
  layer.scaleX = 150;
  layer.opacity = 60;
  raster.rasterizeShapeLayer(layer.id);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.rotation).toBe(30);
  expect(after.scaleX).toBe(150);
  expect(after.opacity).toBe(60);
  expect(after.name).toBe(layer.name);
});

test('rasterizing a non-shape layer refuses without touching history', () => {
  const image = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(image);
  expect(raster.rasterizeShapeLayer(image.id)).toBe(false);
  expect(raster.rasterizeShapeLayer('nope')).toBe(false);
  expect(history.entries().length).toBe(0);
});

test('a zero-area shape refuses to rasterize', () => {
  const layer = documentModel.createShapeLayer(
    stateModule.state.doc, { kind: 'rect', w: 0, h: 0, radius: 0 },
    { fill: '#ff0000', stroke: null, strokeWidth: 0 }
  );
  stateModule.state.doc.layers.push(layer);
  expect(raster.rasterizeShapeLayer(layer.id)).toBe(false);
  expect(history.entries().length).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/shape-raster.ts`:

```ts
import { state, notify } from '../state';
import * as history from './history';
import { layerNaturalSize, type ImageLayer, type Layer, type ShapeLayer } from './document';
import { shapeCommands } from './shape-geometry';

/** Draw a shape layer's geometry into a fresh bitmap at its natural size. */
function renderShapeBitmap(layer: ShapeLayer): HTMLCanvasElement | null {
  const size = layerNaturalSize(layer);
  const width = Math.round(size.w);
  const height = Math.round(size.h);
  if (width < 1 || height < 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(width / 2, height / 2);
  ctx.beginPath();
  for (const cmd of shapeCommands(layer.shape)) {
    switch (cmd.op) {
      case 'moveTo': ctx.moveTo(cmd.x, cmd.y); break;
      case 'lineTo': ctx.lineTo(cmd.x, cmd.y); break;
      case 'arcTo': ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r); break;
      case 'ellipse': ctx.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry, 0, 0, Math.PI * 2); break;
      case 'close': ctx.closePath(); break;
    }
  }
  if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(); }
  if (layer.stroke && layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
  return canvas;
}

/**
 * Convert a shape layer to pixels in place, keeping its id, name, transform, and
 * effects so history, the layers panel, and selection all keep pointing at it.
 */
export function rasterizeShapeLayer(layerId: string): boolean {
  const index = state.doc.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return false;
  const layer = state.doc.layers[index];
  if (layer.kind !== 'shape') return false;
  const bitmap = renderShapeBitmap(layer);
  if (!bitmap) return false;

  const before: Layer = layer;
  const after: ImageLayer = {
    id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity,
    blendMode: layer.blendMode, effects: { ...layer.effects },
    x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY, rotation: layer.rotation,
    kind: 'image', bitmap, bitmapRev: 1, sourceName: null
  };

  history.push({
    label: 'Rasterize shape',
    bytes: bitmap.width * bitmap.height * 4,
    do: () => {
      const at = state.doc.layers.findIndex((l) => l.id === layerId);
      if (at >= 0) state.doc.layers[at] = after;
      notify('structure', 'layerProps', 'composite');
    },
    undo: () => {
      const at = state.doc.layers.findIndex((l) => l.id === layerId);
      if (at >= 0) state.doc.layers[at] = before;
      notify('structure', 'layerProps', 'composite');
    }
  });
  return true;
}
```

- [ ] **Step 4: Refuse painting on shapes** — in `src/engine/stroke-session.ts`, widen the refusal type:

```ts
export type StrokeRefusal = 'missing' | 'text-layer' | 'shape-layer' | 'hidden' | 'busy';
```

and add the guard beside the text check in `beginStroke`:

```ts
  if (layer.kind === 'shape') return { ok: false, reason: 'shape-layer' };
```

In `src/tools/paint-shared.ts`, add the message to the `REASONS` map:

```ts
  'shape-layer': 'Shape layers can\'t be painted — use Layer > Rasterize > Shape first.',
```

- [ ] **Step 5: Register the command** — add the contract to `tests/ui-layout.test.mjs`:

```js
test('rasterize shape is registered and reachable from the Layer menu', () => {
  assert.match(main, /layer\.rasterizeShape/);
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  assert.match(menu, /layer\.rasterizeShape/);
  const stroke = readFileSync(resolve(root, 'src/engine/stroke-session.ts'), 'utf8');
  assert.match(stroke, /'shape-layer'/);
});
```

In `src/main.ts`:

```ts
import { rasterizeShapeLayer } from './engine/shape-raster';
```

```ts
registerCommand({
  id: 'layer.rasterizeShape', label: 'Rasterize Shape',
  enabled: () => {
    const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
    return Boolean(layer && layer.kind === 'shape');
  },
  run: () => guardTransformSession(() => {
    if (!rasterizeShapeLayer(state.doc.activeLayerId ?? '')) toast('Select a shape layer first.');
  })
});
```

In `src/shell/menu-bar.ts`, add `'layer.rasterizeShape'` to the Layer menu's item list, immediately after `'layer.duplicate'`.

- [ ] **Step 6: Gates** — all four PASS.

- [ ] **Step 7: Live verify** — with a shape selected, brush-dragging refuses with the rasterize toast and no history entry; `Layer > Rasterize Shape` is enabled only for shape layers; running it turns the layer into an image whose thumbnail shows the shape, after which a brush stroke paints on it normally; one undo returns it to an editable shape layer with its Properties section back; Clear and Fill stay grayed for shape layers.

- [ ] **Step 8: Commit**

```bash
git add src/engine/shape-raster.ts src/engine/stroke-session.ts src/tools/paint-shared.ts src/main.ts src/shell/menu-bar.ts tests/shape-raster.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add Rasterize Shape and refuse painting on shape layers"
git push origin main
```

---

### Task 8: Layer thumbnails and persistence

**Files:**
- Modify: `src/layers-panel.ts`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `shapeCommands`, `shapeNaturalSize` (Task 2).
- Produces: shape layers show a rendered thumbnail instead of the `SHP` glyph placeholder from Task 1.

**Persistence needs no code change** — `serializeDoc`'s non-image branch already spreads the layer to JSON, and `deserializeDoc`'s non-image branch reconstructs it; `shape` is plain data. This task proves that with a live round-trip rather than assuming it.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('the layers panel renders shape thumbnails', () => {
  const panel = readFileSync(resolve(root, 'src/layers-panel.ts'), 'utf8');
  assert.match(panel, /shapeCommands/);
  assert.match(panel, /kind === 'shape'/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 2: Implement** — in `src/layers-panel.ts`, add the imports:

```ts
import { shapeCommands, shapeNaturalSize } from './engine/shape-geometry';
```

The existing image branch (line ~117) reuses a 26×26 `<canvas>` child of `.layer-thumbnail` and caches by `tc.dataset.rev`. The shape branch mirrors that exactly, caching on a signature of the shape's own parameters so it repaints only when the shape actually changes. Insert it **between** the image branch and the glyph fallback:

```ts
  } else if (layer.kind === 'shape') {
    let tc = thumb.querySelector('canvas') as HTMLCanvasElement | null;
    if (!tc) { tc = document.createElement('canvas'); tc.width = 26; tc.height = 26; thumb.textContent = ''; thumb.appendChild(tc); }
    const rev = JSON.stringify([layer.shape, layer.fill, layer.stroke, layer.strokeWidth]);
    if (tc.dataset.rev !== rev) {
      tc.dataset.rev = rev;
      const tctx = tc.getContext('2d')!;
      tctx.clearRect(0, 0, 26, 26);
      const size = shapeNaturalSize(layer.shape);
      const box = Math.max(size.w, size.h, layer.strokeWidth, 1);
      const s = 22 / box;                       // 2px padding on each side
      tctx.save();
      tctx.translate(13, 13);
      tctx.scale(s, s);
      tctx.beginPath();
      for (const cmd of shapeCommands(layer.shape)) {
        switch (cmd.op) {
          case 'moveTo': tctx.moveTo(cmd.x, cmd.y); break;
          case 'lineTo': tctx.lineTo(cmd.x, cmd.y); break;
          case 'arcTo': tctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r); break;
          case 'ellipse': tctx.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry, 0, 0, Math.PI * 2); break;
          case 'close': tctx.closePath(); break;
        }
      }
      if (layer.fill) { tctx.fillStyle = layer.fill; tctx.fill(); }
      if (layer.stroke && layer.strokeWidth > 0) {
        tctx.strokeStyle = layer.stroke;
        tctx.lineWidth = layer.strokeWidth;
        tctx.stroke();
      }
      tctx.restore();
    }
  } else if (!thumb.querySelector('canvas')) {
```

so the chain becomes image → shape → glyph fallback. The fallback's glyph expression (set in Task 1) stays as it is; it now only ever runs for text layers.

- [ ] **Step 3: Gates** — all four PASS.

- [ ] **Step 4: Live verify**
  1. Draw a rectangle, an ellipse, and a polygon: each Layers-panel row shows a thumbnail of that shape, not a `SHP` glyph.
  2. `Ctrl+J` duplicates a selected shape — the copy is independent (change the original's fill; the copy keeps its own).
  3. `Ctrl+S` saves, then open the downloaded `.mledit.json`: the file contains the shape parameters and no bitmap for that layer.
  4. Re-open that file: the shape layer returns with identical `shape`, `fill`, `stroke`, `strokeWidth`, and transform, and renders identically.

- [ ] **Step 5: Commit**

```bash
git add src/layers-panel.ts tests/ui-layout.test.mjs
git commit -m "feat: render shape thumbnails in the layers panel"
git push origin main
```

---

### Task 9: Final regression, docs, and close-out

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/changelog.md`
- No source changes.

- [ ] **Step 1: Full live regression** on `?audit-raf` at 1280×800, re-reading the canvas rect after every tool change:
  - **Shapes:** draw all four; Shift and Alt constraints; options-bar Radius and Sides affect the next shape; Properties edits recolour and reshape an existing layer; undo/redo for creation and each edit.
  - **Vector proof:** scale a shape to 400% with Free Transform, then sample two adjacent pixels across its edge — the transition is a hard colour step, not a blur, proving it re-rendered from geometry rather than from pixels.
  - **Rasterize:** shape → image, paintable afterwards, one undo restores the vector layer.
  - **Phase A/B/C regression:** menu commands and dock tabs; Tab / Shift+Tab; Reset Essentials; brush stroke + undo; eraser; eyedropper; marquee and lasso selections with Shift-add and Alt-subtract; a stroke clipped to a selection; Clear, Fill, and Crop to Selection; transform session + guard; crop apply/undo; save/open round-trip.
  - **Geometry probe:** zero surface violations across the docked surfaces.

- [ ] **Step 2: Docs**

- `README.md`: extend the Toolbar row of the Workspace table with "shape tools (rectangle, ellipse, line, polygon)"; add an Editing Workflow paragraph covering drawing shapes, Shift/Alt constraints, live fill/stroke/radius/sides editing in Properties, and Rasterize Shape; add `U` (Rectangle) to Essential Shortcuts.
- `docs/architecture.md`: add a paragraph beside the other engines describing `src/engine/shape-geometry.ts` (pure command lists, natural size, drag constraints), how `layerNaturalSize` makes transform/snapping/crop/hit-testing work unchanged for a third layer kind, and `src/engine/shape-raster.ts`.
- `docs/changelog.md` top entry:

```markdown
## 3.5.0 - 2026-07-20

### Added

- **Vector shape layers**: Rectangle (`U`), Ellipse, Line, and Polygon tools draw resolution-independent shape layers with fill, stroke, stroke width, corner radius, and polygon sides that stay editable in the Properties panel. Shift constrains to squares, circles, and 15° lines; Alt draws from the centre. Shapes scale and rotate without resampling, and `Layer > Rasterize Shape` converts one to pixels when you want to paint on it. (Plan: 2026-07-20-shape-layers.)
```

- [ ] **Step 3: Gates, commit, and protocol**

```bash
git add README.md docs/architecture.md docs/changelog.md
git commit -m "docs: document vector shape layers and record 3.5.0"
git push origin main
```

AGENTS.md protocol: hooks refresh the graph; new modules (`shape-geometry`, `shape-raster`, `shape-config`, `shape-shared`, `shape-tools`) change structure → run `python -m graphify export obsidian`; verify `graphify-out/` stays untracked; update the project memory (D1 shipped, D2 pen/paths and D3 type still pending).
