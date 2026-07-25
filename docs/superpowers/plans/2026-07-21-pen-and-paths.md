# Phase D2 Pen Tool & Paths Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** live verification runs on the preview server (`dev`) at `http://localhost:<port>/?audit-raf` — read the port from `preview_start` (autoPort is on; it is not always 3000). Four harness lessons from Phases B–D1, all mandatory:
> 1. A browser-console `import('/src/x.ts')` may be a **different module instance** than the app's `'./x'` import. Prove instance sharing first (drive a change through the UI, read it back through the import), then verify via DOM, canvas pixels, or by patching `CanvasRenderingContext2D.prototype`.
> 2. The canvas rect **moves** when the options bar changes rows on a tool switch. Re-read `getBoundingClientRect()` *after* every tool change in synthetic-pointer helpers.
> 3. `history.entries().length` can stay flat after an undo (the redo tail truncates). Assert `history.cursor()` deltas or command labels.
> 4. Canvas pixel probes near a **selected layer's** edges are contaminated by the transform-controls overlay. Deactivate the layer or sample away from handles before asserting colours.

**Goal:** A working Bézier Pen tool, anchor/handle editing, and a live Paths panel, with paths bridging to the shape, selection, and painting engines — per `docs/superpowers/specs/2026-07-21-pen-and-paths-design.md`.

**Architecture:** Paths are document-level data (`doc.paths`), each a list of subpaths whose anchors carry their handles as relative offsets — so a corner anchor is simply one with zero-length handles. A pure geometry module converts subpaths into the `PathCommand[]` list D1 already defines, and does all hit-testing and editing arithmetic, which keeps the entire editing core unit-testable in Node. Paths render in the overlay only, never in the compositor, so they never reach an export.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest with the established `vi.stubGlobal` bootstrap; `test:ui` source contracts; `?audit-raf` live harness.

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies.
- Tools: Pen (`P`) replaces its grayed Drawing-group stub; Direct Selection (`A`) and Path Selection are added to the Move & Select group. No Freeform or Curvature pen.
- A **corner anchor is one whose handle offsets are all zero** — there is no separate corner/smooth flag.
- Handles are stored **relative** to their anchor.
- Paths are **non-printing**: they render in `src/canvas-overlay.ts` and must never be drawn by `src/engine/compositor.ts`.
- Every anchor/handle/subpath drag commits **one** history entry via a coalesce key.
- Pen, Direct Selection, and Path Selection are inert while a stroke, transform, or crop session is live (`isEditingSessionLive()`).
- The project file version **stays at 2**; `paths` and `activePathId` are additive, and files saved before D2 load with an empty path list.
- Make Work Path produces **corner anchors** (traced from Phase C's `traceContours`); curve fitting with a tolerance setting is explicitly out of scope.
- Commits: subject only, NO Co-Authored-By trailer; `git push origin main` after each task.
- All four gates before every commit: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`.
- Superseded `test:ui` contracts are replaced in the same task that changes the source.

## File structure

| File | Responsibility |
| --- | --- |
| `src/engine/path-model.ts` (create) | `Anchor`, `SubPath`, `PathItem` types; `createPathItem`; `clonePathItem` |
| `src/engine/path-geometry.ts` (create) | Pure core: `pathToCommands`, three hit-tests, insert/delete/convert/move/translate, `pathBounds` |
| `src/engine/path-render.ts` (create) | `replayPathCommands(ctx, commands)` — the single command-replay site, shared by compositor, raster, thumbnails, and overlay |
| `src/engine/shape-geometry.ts` (modify) | `PathCommand` gains `bezierCurveTo`; `ShapeSpec` path variant delegates to `pathToCommands` |
| `src/engine/document.ts` (modify) | `doc.paths`, `doc.activePathId`, `ShapeSpec` `{kind:'path'}` variant |
| `src/engine/path-store.ts` (create) | History-backed mutations: add/delete/duplicate/rename/select/replace-subpaths |
| `src/canvas-overlay.ts` (modify) | Draw the active path: outline, anchors, handles (screen-sized) |
| `src/tools/pen.ts` (create) | Pen tool: click/drag/close/finish plus auto add-delete |
| `src/tools/path-edit-tools.ts` (create) | Direct Selection and Path Selection |
| `src/panels/paths-panel.ts` (create) | Paths dock panel: list, thumbnails, new/duplicate/delete, rename |
| `src/engine/path-ops.ts` (create) | Convert to Shape, Load as Selection, Fill Path, Stroke Path, Make Work Path |
| `src/engine/selection-ops.ts` (modify) | `SelectionOp` gains a `path` kind |
| `src/engine/persistence.ts` (modify) | Default `paths`/`activePathId` when loading pre-D2 files |

---

### Task 1: Path data model and document storage

**Files:**
- Create: `src/engine/path-model.ts`
- Modify: `src/engine/document.ts`, `src/engine/persistence.ts`
- Test: `tests/path-model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `interface Anchor { x: number; y: number; inDx: number; inDy: number; outDx: number; outDy: number }`
  - `interface SubPath { anchors: Anchor[]; closed: boolean }`
  - `interface PathItem { id: string; name: string; subpaths: SubPath[] }`
  - `createAnchor(x: number, y: number): Anchor` — zero handles (a corner)
  - `createPathItem(name: string): PathItem`
  - `clonePathItem(path: PathItem, name: string): PathItem` — deep copy, fresh id
  - `isCornerAnchor(a: Anchor): boolean`
  - `Doc` gains `paths: PathItem[]` and `activePathId: string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/path-model.test.ts`:

```ts
import { beforeAll, expect, test, vi } from 'vitest';

let pathModel: typeof import('../src/engine/path-model');
let documentModel: typeof import('../src/engine/document');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  pathModel = await import('../src/engine/path-model');
  documentModel = await import('../src/engine/document');
});

test('a fresh anchor is a corner with zero handles', () => {
  const a = pathModel.createAnchor(10, 20);
  expect(a).toEqual({ x: 10, y: 20, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
  expect(pathModel.isCornerAnchor(a)).toBe(true);
  expect(pathModel.isCornerAnchor({ ...a, outDx: 5 })).toBe(false);
});

test('createPathItem starts empty with a unique id', () => {
  const a = pathModel.createPathItem('Work Path');
  const b = pathModel.createPathItem('Work Path');
  expect(a.name).toBe('Work Path');
  expect(a.subpaths).toEqual([]);
  expect(a.id).not.toBe(b.id);
});

test('clonePathItem deep-copies anchors and takes a fresh id', () => {
  const original = pathModel.createPathItem('Path 1');
  original.subpaths.push({ anchors: [pathModel.createAnchor(1, 2), pathModel.createAnchor(3, 4)], closed: true });
  const copy = pathModel.clonePathItem(original, 'Path 1 copy');
  expect(copy.id).not.toBe(original.id);
  expect(copy.name).toBe('Path 1 copy');
  expect(copy.subpaths).toEqual(original.subpaths);
  expect(copy.subpaths).not.toBe(original.subpaths);
  expect(copy.subpaths[0].anchors[0]).not.toBe(original.subpaths[0].anchors[0]);
  copy.subpaths[0].anchors[0].x = 99;
  expect(original.subpaths[0].anchors[0].x).toBe(1);
});

test('a new document starts with no paths', () => {
  const doc = documentModel.createDoc(400, 300);
  expect(doc.paths).toEqual([]);
  expect(doc.activePathId).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/path-model.test.ts`
Expected: FAIL — cannot find module `../src/engine/path-model`.

- [ ] **Step 3: Implement the model** — create `src/engine/path-model.ts`:

```ts
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
```

- [ ] **Step 4: Extend the document** — in `src/engine/document.ts` add the import and the two fields.

Import:

```ts
import type { PathItem } from './path-model';
```

In the `Doc` interface, after `activeLayerId`:

```ts
  paths: PathItem[];                        // document-level pen paths (non-printing)
  activePathId: string | null;
```

In `createDoc`'s returned object, after `layers: [], activeLayerId: null`:

```ts
    paths: [], activePathId: null
```

- [ ] **Step 5: Default them when loading older files** — in `src/engine/persistence.ts`, replace the final return of `deserializeDoc`:

```ts
  return { ...parsed.doc, version: 2, layers } as unknown as Doc;
```

with:

```ts
  // Files saved before D2 have no paths; default them rather than bumping the file version.
  const rawPaths = (parsed.doc as { paths?: unknown }).paths;
  const paths = Array.isArray(rawPaths) ? rawPaths : [];
  const rawActive = (parsed.doc as { activePathId?: unknown }).activePathId;
  const activePathId = typeof rawActive === 'string' ? rawActive : null;
  return { ...parsed.doc, version: 2, layers, paths, activePathId } as unknown as Doc;
```

- [ ] **Step 6: Run the test** — PASS (4 tests).
- [ ] **Step 7: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build` — all PASS.

```bash
git add src/engine/path-model.ts src/engine/document.ts src/engine/persistence.ts tests/path-model.test.ts
git commit -m "feat: add the path data model and document path storage"
git push origin main
```

---

### Task 2: Command replay extraction and the bezierCurveTo variant

**Files:**
- Create: `src/engine/path-render.ts`
- Modify: `src/engine/shape-geometry.ts`, `src/engine/compositor.ts`, `src/engine/shape-raster.ts`, `src/layers-panel.ts`, `src/canvas-overlay.ts`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `PathCommand` from `src/engine/shape-geometry.ts`.
- Produces: `replayPathCommands(ctx: CanvasRenderingContext2D, commands: PathCommand[]): void`; `PathCommand` gains `{ op: 'bezierCurveTo'; c1x; c1y; c2x; c2y; x; y }`.

**Why this task exists before any curve work:** `PathCommand` is currently consumed by **four separate `switch` statements** (compositor `drawLayer`, `shape-raster`, the layers-panel thumbnail, and the overlay's shape preview). None has a `default` clause, so TypeScript will *not* flag them when a new variant is added — a `bezierCurveTo` command would silently draw nothing in whichever site was missed. Collapsing them to one replay function makes that class of bug impossible.

- [ ] **Step 1: Write the failing contract** — add to `tests/ui-layout.test.mjs`:

```js
test('path commands are replayed through one shared helper', () => {
  const render = readFileSync(resolve(root, 'src/engine/path-render.ts'), 'utf8');
  assert.match(render, /case 'bezierCurveTo'/);
  assert.match(render, /bezierCurveTo\(/);
  const geometry = readFileSync(resolve(root, 'src/engine/shape-geometry.ts'), 'utf8');
  assert.match(geometry, /bezierCurveTo/);
  // Every drawing site delegates instead of re-implementing the switch.
  for (const file of ['src/engine/compositor.ts', 'src/engine/shape-raster.ts', 'src/layers-panel.ts', 'src/canvas-overlay.ts']) {
    const src = readFileSync(resolve(root, file), 'utf8');
    assert.match(src, /replayPathCommands/, `${file} should replay via the shared helper`);
    assert.doesNotMatch(src, /case 'arcTo'/, `${file} should not re-implement the command switch`);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:ui`
Expected: FAIL — `src/engine/path-render.ts` does not exist.

- [ ] **Step 3: Extend the command type** — in `src/engine/shape-geometry.ts`, add the variant to `PathCommand`:

```ts
export type PathCommand =
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | { op: 'arcTo'; x1: number; y1: number; x2: number; y2: number; r: number }
  | { op: 'bezierCurveTo'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { op: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { op: 'close' };
```

- [ ] **Step 4: Create the shared replay** — create `src/engine/path-render.ts`:

```ts
import type { PathCommand } from './shape-geometry';

/**
 * The single place a PathCommand list is turned into canvas calls. Every drawing
 * site (compositor, rasterizer, thumbnails, overlay) goes through here, so adding
 * a command variant can never silently no-op in a site that forgot to handle it.
 * Callers own beginPath/fill/stroke.
 */
export function replayPathCommands(ctx: CanvasRenderingContext2D, commands: PathCommand[]): void {
  for (const cmd of commands) {
    switch (cmd.op) {
      case 'moveTo': ctx.moveTo(cmd.x, cmd.y); break;
      case 'lineTo': ctx.lineTo(cmd.x, cmd.y); break;
      case 'arcTo': ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.r); break;
      case 'bezierCurveTo': ctx.bezierCurveTo(cmd.c1x, cmd.c1y, cmd.c2x, cmd.c2y, cmd.x, cmd.y); break;
      case 'ellipse': ctx.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry, 0, 0, Math.PI * 2); break;
      case 'close': ctx.closePath(); break;
    }
  }
}
```

- [ ] **Step 5: Replace the four inline switches.**

In `src/engine/compositor.ts`, add `import { replayPathCommands } from './path-render';` and replace the shape branch's `for (const cmd of shapeCommands(layer.shape)) { switch … }` block with:

```ts
    replayPathCommands(ctx, shapeCommands(layer.shape));
```

In `src/engine/shape-raster.ts`, add the same import and replace its `for (const cmd of shapeCommands(layer.shape)) { switch … }` block with:

```ts
  replayPathCommands(ctx, shapeCommands(layer.shape));
```

In `src/layers-panel.ts`, add `import { replayPathCommands } from './engine/path-render';` and replace the thumbnail's `for (const cmd of shapeCommands(layer.shape)) { switch … }` block with:

```ts
      replayPathCommands(tctx, shapeCommands(layer.shape));
```

In `src/canvas-overlay.ts`, add `import { replayPathCommands } from './engine/path-render';` and replace the `drawShapePreview` body's `for (const cmd of shapePreview.commands) { switch … }` block with:

```ts
  replayPathCommands(ctx, shapePreview.commands);
```

- [ ] **Step 6: Run the gates** — all four PASS. The build proves the four sites still type-check; `test:ui` proves none of them kept a private switch.

- [ ] **Step 7: Live smoke check** — on `?audit-raf`, draw a rectangle, an ellipse, and a polygon and confirm each still fills correctly, and that a layer thumbnail still renders. This is a refactor, so the bar is "nothing changed".

- [ ] **Step 8: Commit**

```bash
git add src/engine/path-render.ts src/engine/shape-geometry.ts src/engine/compositor.ts src/engine/shape-raster.ts src/layers-panel.ts src/canvas-overlay.ts tests/ui-layout.test.mjs
git commit -m "refactor: replay path commands through one shared helper"
git push origin main
```

---

### Task 3: `pathToCommands`

**Files:**
- Create: `src/engine/path-geometry.ts`
- Test: `tests/path-to-commands.test.ts`

**Interfaces:**
- Consumes: `Anchor`, `SubPath` (Task 1); `PathCommand` (Task 2).
- Produces: `pathToCommands(subpaths: SubPath[]): PathCommand[]`.

Rules: each subpath emits `moveTo` at its first anchor. A segment whose departing `out` handle and arriving `in` handle are both zero emits `lineTo`; otherwise it emits `bezierCurveTo` with control points at `anchor + handle` (absolute). A closed subpath emits its final segment back to the first anchor, then `close`. A subpath with fewer than two anchors emits nothing.

- [ ] **Step 1: Write the failing test**

Create `tests/path-to-commands.test.ts`:

```ts
import { expect, test } from 'vitest';
import { pathToCommands } from '../src/engine/path-geometry';
import type { Anchor, SubPath } from '../src/engine/path-model';

const corner = (x: number, y: number): Anchor => ({ x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
const smooth = (x: number, y: number, dx: number, dy: number): Anchor =>
  ({ x, y, inDx: -dx, inDy: -dy, outDx: dx, outDy: dy });

test('a single anchor emits nothing', () => {
  const sp: SubPath = { anchors: [corner(10, 10)], closed: false };
  expect(pathToCommands([sp])).toEqual([]);
});

test('corner anchors emit straight lines', () => {
  const sp: SubPath = { anchors: [corner(0, 0), corner(100, 0), corner(100, 50)], closed: false };
  expect(pathToCommands([sp])).toEqual([
    { op: 'moveTo', x: 0, y: 0 },
    { op: 'lineTo', x: 100, y: 0 },
    { op: 'lineTo', x: 100, y: 50 }
  ]);
});

test('a smooth anchor emits a bezier with absolute control points', () => {
  const sp: SubPath = { anchors: [smooth(0, 0, 20, 0), smooth(100, 0, 20, 0)], closed: false };
  expect(pathToCommands([sp])).toEqual([
    { op: 'moveTo', x: 0, y: 0 },
    { op: 'bezierCurveTo', c1x: 20, c1y: 0, c2x: 80, c2y: 0, x: 100, y: 0 }
  ]);
});

test('a closed subpath returns to its first anchor and closes', () => {
  const sp: SubPath = { anchors: [corner(0, 0), corner(50, 0), corner(50, 50)], closed: true };
  expect(pathToCommands([sp])).toEqual([
    { op: 'moveTo', x: 0, y: 0 },
    { op: 'lineTo', x: 50, y: 0 },
    { op: 'lineTo', x: 50, y: 50 },
    { op: 'lineTo', x: 0, y: 0 },
    { op: 'close' }
  ]);
});

test('multiple subpaths each start with their own moveTo', () => {
  const a: SubPath = { anchors: [corner(0, 0), corner(10, 0)], closed: false };
  const b: SubPath = { anchors: [corner(50, 50), corner(60, 50)], closed: false };
  const cmds = pathToCommands([a, b]);
  expect(cmds.filter((c) => c.op === 'moveTo').length).toBe(2);
  expect(cmds[2]).toEqual({ op: 'moveTo', x: 50, y: 50 });
});

test('a mixed segment (one handle only) still emits a bezier', () => {
  const sp: SubPath = {
    anchors: [{ x: 0, y: 0, inDx: 0, inDy: 0, outDx: 30, outDy: 0 }, corner(100, 0)],
    closed: false
  };
  expect(pathToCommands([sp])[1]).toEqual({ op: 'bezierCurveTo', c1x: 30, c1y: 0, c2x: 100, c2y: 0, x: 100, y: 0 });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/path-geometry.ts`:

```ts
import type { Anchor, SubPath } from './path-model';
import type { PathCommand } from './shape-geometry';

function segmentCommand(from: Anchor, to: Anchor): PathCommand {
  const straight = from.outDx === 0 && from.outDy === 0 && to.inDx === 0 && to.inDy === 0;
  if (straight) return { op: 'lineTo', x: to.x, y: to.y };
  return {
    op: 'bezierCurveTo',
    c1x: from.x + from.outDx, c1y: from.y + from.outDy,
    c2x: to.x + to.inDx, c2y: to.y + to.inDy,
    x: to.x, y: to.y
  };
}

/** Drawing commands for a path, in DOCUMENT space. */
export function pathToCommands(subpaths: SubPath[]): PathCommand[] {
  const commands: PathCommand[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length < 2) continue;
    commands.push({ op: 'moveTo', x: sub.anchors[0].x, y: sub.anchors[0].y });
    for (let i = 1; i < sub.anchors.length; i++) {
      commands.push(segmentCommand(sub.anchors[i - 1], sub.anchors[i]));
    }
    if (sub.closed) {
      commands.push(segmentCommand(sub.anchors[sub.anchors.length - 1], sub.anchors[0]));
      commands.push({ op: 'close' });
    }
  }
  return commands;
}
```

- [ ] **Step 4: Run the test** — PASS (6 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/path-geometry.ts tests/path-to-commands.test.ts
git commit -m "feat: convert paths to drawing commands"
git push origin main
```

---

### Task 4: Hit testing

**Files:**
- Modify: `src/engine/path-geometry.ts`
- Test: `tests/path-hit-test.test.ts`

**Interfaces:**
- Consumes: `SubPath` (Task 1).
- Produces:
  - `interface AnchorRef { sub: number; anchor: number }`
  - `interface HandleRef extends AnchorRef { which: 'in' | 'out' }`
  - `interface SegmentHit { sub: number; segment: number; t: number; point: Point }`
  - `hitTestAnchor(subpaths, point, radius): AnchorRef | null`
  - `hitTestHandle(subpaths, point, radius, selected: AnchorRef | null): HandleRef | null` — only the selected anchor's handles are grabbable, matching the overlay
  - `hitTestSegment(subpaths, point, radius): SegmentHit | null`
  - `bezierPointAt(from: Anchor, to: Anchor, t: number): Point`

- [ ] **Step 1: Write the failing test**

Create `tests/path-hit-test.test.ts`:

```ts
import { expect, test } from 'vitest';
import { bezierPointAt, hitTestAnchor, hitTestHandle, hitTestSegment } from '../src/engine/path-geometry';
import type { Anchor, SubPath } from '../src/engine/path-model';

const corner = (x: number, y: number): Anchor => ({ x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
const square: SubPath = { anchors: [corner(0, 0), corner(100, 0), corner(100, 100)], closed: false };

test('hitTestAnchor finds the nearest anchor inside the radius', () => {
  expect(hitTestAnchor([square], { x: 2, y: 2 }, 6)).toEqual({ sub: 0, anchor: 0 });
  expect(hitTestAnchor([square], { x: 98, y: 3 }, 6)).toEqual({ sub: 0, anchor: 1 });
  expect(hitTestAnchor([square], { x: 50, y: 50 }, 6)).toBeNull();
});

test('hitTestHandle only grabs the selected anchor handles', () => {
  const sp: SubPath = {
    anchors: [{ x: 0, y: 0, inDx: 0, inDy: 0, outDx: 40, outDy: 0 }, corner(100, 0)],
    closed: false
  };
  expect(hitTestHandle([sp], { x: 40, y: 0 }, 6, null)).toBeNull();
  expect(hitTestHandle([sp], { x: 40, y: 0 }, 6, { sub: 0, anchor: 0 }))
    .toEqual({ sub: 0, anchor: 0, which: 'out' });
  expect(hitTestHandle([sp], { x: 90, y: 0 }, 6, { sub: 0, anchor: 0 })).toBeNull();
});

test('hitTestSegment finds a point on a straight segment', () => {
  const hit = hitTestSegment([square], { x: 50, y: 1 }, 6);
  expect(hit?.sub).toBe(0);
  expect(hit?.segment).toBe(0);
  expect(hit?.t).toBeCloseTo(0.5, 1);
  expect(hitTestSegment([square], { x: 50, y: 60 }, 6)).toBeNull();
});

test('hitTestSegment covers the closing segment of a closed subpath', () => {
  const closed: SubPath = { anchors: [corner(0, 0), corner(100, 0), corner(100, 100)], closed: true };
  const hit = hitTestSegment([closed], { x: 50, y: 50 }, 8);   // on the diagonal closing edge
  expect(hit?.segment).toBe(2);
});

test('bezierPointAt returns the curve midpoint', () => {
  const from: Anchor = { x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 100 };
  const to: Anchor = { x: 100, y: 0, inDx: 0, inDy: 100, outDx: 0, outDy: 0 };
  const mid = bezierPointAt(from, to, 0.5);
  expect(mid.x).toBeCloseTo(50, 6);
  expect(mid.y).toBeCloseTo(75, 6);
  expect(bezierPointAt(from, to, 0)).toEqual({ x: 0, y: 0 });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, exports missing.

- [ ] **Step 3: Implement** — append to `src/engine/path-geometry.ts`:

```ts
import type { Point } from './transform-geometry';

export interface AnchorRef { sub: number; anchor: number }
export interface HandleRef extends AnchorRef { which: 'in' | 'out' }
export interface SegmentHit { sub: number; segment: number; t: number; point: Point }

const within = (a: Point, b: Point, radius: number): boolean =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= radius * radius;

export function hitTestAnchor(subpaths: SubPath[], point: Point, radius: number): AnchorRef | null {
  let best: AnchorRef | null = null;
  let bestDistance = Infinity;
  subpaths.forEach((sub, si) => {
    sub.anchors.forEach((anchor, ai) => {
      const d = (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2;
      if (d <= radius * radius && d < bestDistance) { bestDistance = d; best = { sub: si, anchor: ai }; }
    });
  });
  return best;
}

/** Handles are only grabbable on the selected anchor, matching what the overlay draws. */
export function hitTestHandle(
  subpaths: SubPath[], point: Point, radius: number, selected: AnchorRef | null
): HandleRef | null {
  if (!selected) return null;
  const anchor = subpaths[selected.sub]?.anchors[selected.anchor];
  if (!anchor) return null;
  const out = { x: anchor.x + anchor.outDx, y: anchor.y + anchor.outDy };
  const inp = { x: anchor.x + anchor.inDx, y: anchor.y + anchor.inDy };
  if ((anchor.outDx !== 0 || anchor.outDy !== 0) && within(out, point, radius)) {
    return { ...selected, which: 'out' };
  }
  if ((anchor.inDx !== 0 || anchor.inDy !== 0) && within(inp, point, radius)) {
    return { ...selected, which: 'in' };
  }
  return null;
}

/** Cubic point at parameter t for the segment between two anchors. */
export function bezierPointAt(from: Anchor, to: Anchor, t: number): Point {
  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + from.outDx, y: from.y + from.outDy };
  const p2 = { x: to.x + to.inDx, y: to.y + to.inDy };
  const p3 = { x: to.x, y: to.y };
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  };
}

const SEGMENT_SAMPLES = 24;

export function hitTestSegment(subpaths: SubPath[], point: Point, radius: number): SegmentHit | null {
  let best: SegmentHit | null = null;
  let bestDistance = radius * radius;
  subpaths.forEach((sub, si) => {
    const count = sub.closed ? sub.anchors.length : sub.anchors.length - 1;
    for (let seg = 0; seg < count; seg++) {
      const from = sub.anchors[seg];
      const to = sub.anchors[(seg + 1) % sub.anchors.length];
      if (!from || !to) continue;
      for (let step = 0; step <= SEGMENT_SAMPLES; step++) {
        const t = step / SEGMENT_SAMPLES;
        const p = bezierPointAt(from, to, t);
        const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
        if (d <= bestDistance) { bestDistance = d; best = { sub: si, segment: seg, t, point: p }; }
      }
    }
  });
  return best;
}
```

- [ ] **Step 4: Run the test** — PASS (5 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/path-geometry.ts tests/path-hit-test.test.ts
git commit -m "feat: add path anchor, handle, and segment hit testing"
git push origin main
```

---

### Task 5: Path editing operations

**Files:**
- Modify: `src/engine/path-geometry.ts`
- Test: `tests/path-editing.test.ts`

**Interfaces:**
- Consumes: `SubPath`, `Anchor` (Task 1); `AnchorRef`, `SegmentHit`, `bezierPointAt` (Task 4).
- Produces (all pure — they return new subpath arrays, never mutate):
  - `insertAnchorOnSegment(subpaths, hit: SegmentHit): SubPath[]` — De Casteljau split
  - `deleteAnchor(subpaths, ref: AnchorRef): SubPath[]`
  - `setAnchorSmooth(subpaths, ref, dx: number, dy: number): SubPath[]`
  - `setAnchorCorner(subpaths, ref): SubPath[]`
  - `moveAnchor(subpaths, ref, x: number, y: number): SubPath[]`
  - `moveHandle(subpaths, ref: HandleRef, x: number, y: number, mirror: boolean): SubPath[]`
  - `translateSubPath(subpaths, sub: number, dx: number, dy: number): SubPath[]`
  - `pathBounds(subpaths): { x: number; y: number; w: number; h: number } | null`

- [ ] **Step 1: Write the failing test**

Create `tests/path-editing.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  bezierPointAt, deleteAnchor, insertAnchorOnSegment, moveAnchor, moveHandle,
  pathBounds, setAnchorCorner, setAnchorSmooth, translateSubPath
} from '../src/engine/path-geometry';
import type { Anchor, SubPath } from '../src/engine/path-model';

const corner = (x: number, y: number): Anchor => ({ x, y, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });

test('inserting an anchor does not change the curve shape', () => {
  const from: Anchor = { x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 100 };
  const to: Anchor = { x: 100, y: 0, inDx: 0, inDy: 100, outDx: 0, outDy: 0 };
  const before: SubPath[] = [{ anchors: [from, to], closed: false }];
  const midBefore = bezierPointAt(from, to, 0.5);

  const after = insertAnchorOnSegment(before, { sub: 0, segment: 0, t: 0.5, point: midBefore });
  expect(after[0].anchors.length).toBe(3);
  // The new anchor sits exactly on the original curve...
  expect(after[0].anchors[1].x).toBeCloseTo(midBefore.x, 6);
  expect(after[0].anchors[1].y).toBeCloseTo(midBefore.y, 6);
  // ...and each new half still passes through the original quarter points.
  const quarterBefore = bezierPointAt(from, to, 0.25);
  const quarterAfter = bezierPointAt(after[0].anchors[0], after[0].anchors[1], 0.5);
  expect(quarterAfter.x).toBeCloseTo(quarterBefore.x, 6);
  expect(quarterAfter.y).toBeCloseTo(quarterBefore.y, 6);
  // the input is untouched
  expect(before[0].anchors.length).toBe(2);
});

test('deleting an anchor removes it and leaves the rest', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0), corner(50, 0), corner(100, 0)], closed: false }];
  const after = deleteAnchor(subs, { sub: 0, anchor: 1 });
  expect(after[0].anchors.map((a) => a.x)).toEqual([0, 100]);
  expect(subs[0].anchors.length).toBe(3);
});

test('deleting the last anchor of a subpath drops the subpath', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0)], closed: false }];
  expect(deleteAnchor(subs, { sub: 0, anchor: 0 })).toEqual([]);
});

test('smooth and corner conversion sets and clears mirrored handles', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0), corner(50, 0), corner(100, 0)], closed: false }];
  const smoothed = setAnchorSmooth(subs, { sub: 0, anchor: 1 }, 20, 10);
  expect(smoothed[0].anchors[1]).toEqual({ x: 50, y: 0, inDx: -20, inDy: -10, outDx: 20, outDy: 10 });
  const cornered = setAnchorCorner(smoothed, { sub: 0, anchor: 1 });
  expect(cornered[0].anchors[1]).toEqual({ x: 50, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 0 });
});

test('moving an anchor keeps its handles relative', () => {
  const subs: SubPath[] = [{ anchors: [{ x: 10, y: 10, inDx: -5, inDy: 0, outDx: 5, outDy: 0 }], closed: false }];
  const after = moveAnchor(subs, { sub: 0, anchor: 0 }, 100, 200);
  expect(after[0].anchors[0]).toEqual({ x: 100, y: 200, inDx: -5, inDy: 0, outDx: 5, outDy: 0 });
});

test('moving a handle mirrors its partner when asked', () => {
  const subs: SubPath[] = [{ anchors: [{ x: 0, y: 0, inDx: -10, inDy: 0, outDx: 10, outDy: 0 }], closed: false }];
  const mirrored = moveHandle(subs, { sub: 0, anchor: 0, which: 'out' }, 0, 30, true);
  expect(mirrored[0].anchors[0].outDx).toBe(0);
  expect(mirrored[0].anchors[0].outDy).toBe(30);
  expect(mirrored[0].anchors[0].inDx).toBe(-0);
  expect(mirrored[0].anchors[0].inDy).toBe(-30);
  const free = moveHandle(subs, { sub: 0, anchor: 0, which: 'out' }, 0, 30, false);
  expect(free[0].anchors[0].inDx).toBe(-10);
  expect(free[0].anchors[0].inDy).toBe(0);
});

test('translateSubPath shifts every anchor by the same delta', () => {
  const subs: SubPath[] = [{ anchors: [corner(0, 0), corner(10, 20)], closed: false }];
  const after = translateSubPath(subs, 0, 5, -5);
  expect(after[0].anchors.map((a) => [a.x, a.y])).toEqual([[5, -5], [15, 15]]);
});

test('pathBounds covers anchors and handles, and nulls when empty', () => {
  expect(pathBounds([])).toBeNull();
  const subs: SubPath[] = [{ anchors: [{ x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 40 }, corner(100, 0)], closed: false }];
  expect(pathBounds(subs)).toEqual({ x: 0, y: 0, w: 100, h: 40 });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, exports missing.

- [ ] **Step 3: Implement** — append to `src/engine/path-geometry.ts`:

```ts
const cloneSubs = (subpaths: SubPath[]): SubPath[] =>
  subpaths.map((sub) => ({ closed: sub.closed, anchors: sub.anchors.map((a) => ({ ...a })) }));

/**
 * Split a segment at parameter t using De Casteljau, so the visible curve is
 * unchanged: the two halves together reproduce the original exactly.
 */
export function insertAnchorOnSegment(subpaths: SubPath[], hit: SegmentHit): SubPath[] {
  const next = cloneSubs(subpaths);
  const sub = next[hit.sub];
  if (!sub) return next;
  const i = hit.segment;
  const j = (i + 1) % sub.anchors.length;
  const from = sub.anchors[i];
  const to = sub.anchors[j];
  if (!from || !to) return next;
  const t = hit.t;

  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + from.outDx, y: from.y + from.outDy };
  const p2 = { x: to.x + to.inDx, y: to.y + to.inDy };
  const p3 = { x: to.x, y: to.y };
  const lerp = (a: Point, b: Point) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  const a = lerp(p0, p1);
  const b = lerp(p1, p2);
  const c = lerp(p2, p3);
  const d = lerp(a, b);
  const e = lerp(b, c);
  const mid = lerp(d, e);

  from.outDx = a.x - from.x;
  from.outDy = a.y - from.y;
  to.inDx = c.x - to.x;
  to.inDy = c.y - to.y;
  const inserted: Anchor = {
    x: mid.x, y: mid.y,
    inDx: d.x - mid.x, inDy: d.y - mid.y,
    outDx: e.x - mid.x, outDy: e.y - mid.y
  };
  sub.anchors.splice(i + 1, 0, inserted);
  return next;
}

export function deleteAnchor(subpaths: SubPath[], ref: AnchorRef): SubPath[] {
  const next = cloneSubs(subpaths);
  const sub = next[ref.sub];
  if (!sub) return next;
  sub.anchors.splice(ref.anchor, 1);
  return next.filter((s) => s.anchors.length > 0);
}

export function setAnchorSmooth(subpaths: SubPath[], ref: AnchorRef, dx: number, dy: number): SubPath[] {
  const next = cloneSubs(subpaths);
  const anchor = next[ref.sub]?.anchors[ref.anchor];
  if (!anchor) return next;
  anchor.outDx = dx; anchor.outDy = dy;
  anchor.inDx = -dx; anchor.inDy = -dy;
  return next;
}

export function setAnchorCorner(subpaths: SubPath[], ref: AnchorRef): SubPath[] {
  const next = cloneSubs(subpaths);
  const anchor = next[ref.sub]?.anchors[ref.anchor];
  if (!anchor) return next;
  anchor.inDx = 0; anchor.inDy = 0; anchor.outDx = 0; anchor.outDy = 0;
  return next;
}

export function moveAnchor(subpaths: SubPath[], ref: AnchorRef, x: number, y: number): SubPath[] {
  const next = cloneSubs(subpaths);
  const anchor = next[ref.sub]?.anchors[ref.anchor];
  if (!anchor) return next;
  anchor.x = x; anchor.y = y;   // handles are relative, so they follow for free
  return next;
}

export function moveHandle(
  subpaths: SubPath[], ref: HandleRef, x: number, y: number, mirror: boolean
): SubPath[] {
  const next = cloneSubs(subpaths);
  const anchor = next[ref.sub]?.anchors[ref.anchor];
  if (!anchor) return next;
  const dx = x - anchor.x;
  const dy = y - anchor.y;
  if (ref.which === 'out') {
    anchor.outDx = dx; anchor.outDy = dy;
    if (mirror) { anchor.inDx = -dx; anchor.inDy = -dy; }
  } else {
    anchor.inDx = dx; anchor.inDy = dy;
    if (mirror) { anchor.outDx = -dx; anchor.outDy = -dy; }
  }
  return next;
}

export function translateSubPath(subpaths: SubPath[], sub: number, dx: number, dy: number): SubPath[] {
  const next = cloneSubs(subpaths);
  const target = next[sub];
  if (!target) return next;
  for (const anchor of target.anchors) { anchor.x += dx; anchor.y += dy; }
  return next;
}

export function pathBounds(subpaths: SubPath[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sub of subpaths) {
    for (const a of sub.anchors) {
      for (const p of [
        { x: a.x, y: a.y },
        { x: a.x + a.inDx, y: a.y + a.inDy },
        { x: a.x + a.outDx, y: a.y + a.outDy }
      ]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
```

- [ ] **Step 4: Run the test** — PASS (8 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/path-geometry.ts tests/path-editing.test.ts
git commit -m "feat: add path editing operations with De Casteljau insertion"
git push origin main
```

---

### Task 6: Path store and overlay rendering

**Files:**
- Create: `src/engine/path-store.ts`
- Modify: `src/canvas-overlay.ts`
- Test: `tests/path-store.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `PathItem`, `createPathItem`, `clonePathItem` (Task 1); `pathToCommands` (Task 3); `replayPathCommands` (Task 2).
- Produces:
  - `getActivePath(): PathItem | null`
  - `ensureActivePath(): PathItem` — creates "Work Path" if none exists (no history entry; the first edit carries it)
  - `addPath(name: string): void` · `duplicateActivePath(): void` · `deletePath(id: string): void` · `renamePath(id: string, name: string): void` · `setActivePath(id: string | null): void`
  - `replaceSubPaths(pathId: string, subpaths: SubPath[], label: string, coalesceKey?: string): void` — the single mutation entry point for every editing gesture
  - `subscribePaths(fn: () => void): void`
  - `src/canvas-overlay.ts`: `setPathSelection(ref: AnchorRef | null)`, and the active path drawn each frame

- [ ] **Step 1: Write the failing test**

Create `tests/path-store.test.ts`:

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let store: typeof import('../src/engine/path-store');
let model: typeof import('../src/engine/path-model');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  store = await import('../src/engine/path-store');
  model = await import('../src/engine/path-model');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

test('ensureActivePath creates a Work Path once', () => {
  const first = store.ensureActivePath();
  expect(first.name).toBe('Work Path');
  expect(stateModule.state.doc.paths.length).toBe(1);
  const second = store.ensureActivePath();
  expect(second.id).toBe(first.id);
  expect(stateModule.state.doc.paths.length).toBe(1);
});

test('replaceSubPaths pushes one undoable command', () => {
  const path = store.ensureActivePath();
  const subs = [{ anchors: [model.createAnchor(0, 0), model.createAnchor(10, 10)], closed: false }];
  store.replaceSubPaths(path.id, subs, 'Add anchor');
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Add anchor');
  expect(store.getActivePath()?.subpaths[0].anchors.length).toBe(2);
  history.undo();
  expect(store.getActivePath()?.subpaths.length).toBe(0);
});

test('add, duplicate, rename, and delete manage the list and the active id', () => {
  store.addPath('Path 1');
  expect(stateModule.state.doc.paths.length).toBe(1);
  const first = store.getActivePath()!;
  store.replaceSubPaths(first.id, [{ anchors: [model.createAnchor(1, 1), model.createAnchor(2, 2)], closed: true }], 'Edit');

  store.duplicateActivePath();
  expect(stateModule.state.doc.paths.length).toBe(2);
  const copy = store.getActivePath()!;
  expect(copy.id).not.toBe(first.id);
  expect(copy.subpaths[0].anchors.length).toBe(2);

  store.renamePath(copy.id, 'Renamed');
  expect(store.getActivePath()?.name).toBe('Renamed');

  store.deletePath(copy.id);
  expect(stateModule.state.doc.paths.length).toBe(1);
  expect(stateModule.state.doc.activePathId).toBe(first.id);
});

test('deleting the last path clears the active id', () => {
  store.addPath('Only');
  const id = store.getActivePath()!.id;
  store.deletePath(id);
  expect(stateModule.state.doc.paths).toEqual([]);
  expect(stateModule.state.doc.activePathId).toBeNull();
  expect(store.getActivePath()).toBeNull();
});

test('deleting a path is undoable', () => {
  store.addPath('Path 1');
  const id = store.getActivePath()!.id;
  history.clear();
  store.deletePath(id);
  expect(stateModule.state.doc.paths.length).toBe(0);
  history.undo();
  expect(stateModule.state.doc.paths.length).toBe(1);
  expect(stateModule.state.doc.activePathId).toBe(id);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement the store** — create `src/engine/path-store.ts`:

```ts
import { state, notify } from '../state';
import * as history from './history';
import { clonePathItem, createPathItem, type PathItem, type SubPath } from './path-model';

const listeners: Array<() => void> = [];
const emit = () => listeners.forEach((fn) => fn());

export function subscribePaths(fn: () => void): void { listeners.push(fn); }

function changed(): void {
  emit();
  notify('structure', 'composite');
}

export function getActivePath(): PathItem | null {
  return state.doc.paths.find((p) => p.id === state.doc.activePathId) ?? null;
}

/** Photoshop's Work Path: created lazily on the first pen click, without its own history entry. */
export function ensureActivePath(): PathItem {
  const existing = getActivePath();
  if (existing) return existing;
  const path = createPathItem('Work Path');
  state.doc.paths.push(path);
  state.doc.activePathId = path.id;
  changed();
  return path;
}

export function setActivePath(id: string | null): void {
  state.doc.activePathId = id;
  changed();
}

export function addPath(name: string): void {
  const path = createPathItem(name);
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Add path',
    do: () => { state.doc.paths.push(path); state.doc.activePathId = path.id; changed(); },
    undo: () => {
      state.doc.paths = state.doc.paths.filter((p) => p.id !== path.id);
      state.doc.activePathId = prevActive;
      changed();
    }
  });
}

export function duplicateActivePath(): void {
  const source = getActivePath();
  if (!source) return;
  const copy = clonePathItem(source, `${source.name} copy`);
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Duplicate path',
    do: () => { state.doc.paths.push(copy); state.doc.activePathId = copy.id; changed(); },
    undo: () => {
      state.doc.paths = state.doc.paths.filter((p) => p.id !== copy.id);
      state.doc.activePathId = prevActive;
      changed();
    }
  });
}

export function deletePath(id: string): void {
  const index = state.doc.paths.findIndex((p) => p.id === id);
  if (index < 0) return;
  const removed = state.doc.paths[index];
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Delete path',
    do: () => {
      state.doc.paths.splice(index, 1);
      if (state.doc.activePathId === id) {
        state.doc.activePathId = state.doc.paths[Math.min(index, state.doc.paths.length - 1)]?.id ?? null;
      }
      changed();
    },
    undo: () => { state.doc.paths.splice(index, 0, removed); state.doc.activePathId = prevActive; changed(); }
  });
}

export function renamePath(id: string, name: string): void {
  const path = state.doc.paths.find((p) => p.id === id);
  if (!path || !name.trim() || path.name === name) return;
  const before = path.name;
  history.push({
    label: 'Rename path',
    do: () => { path.name = name; changed(); },
    undo: () => { path.name = before; changed(); }
  });
}

/** The single mutation entry point for every editing gesture. */
export function replaceSubPaths(
  pathId: string, subpaths: SubPath[], label: string, coalesceKey?: string
): void {
  const path = state.doc.paths.find((p) => p.id === pathId);
  if (!path) return;
  const before = path.subpaths;
  const after = subpaths;
  history.push({
    label,
    coalesceKey,
    do: () => { path.subpaths = after; changed(); },
    undo: () => { path.subpaths = before; changed(); }
  });
}
```

- [ ] **Step 4: Add the overlay contract** — add to `tests/ui-layout.test.mjs`:

```js
test('paths draw in the overlay and never in the compositor', () => {
  const overlay = readFileSync(resolve(root, 'src/canvas-overlay.ts'), 'utf8');
  assert.match(overlay, /getActivePath/);
  assert.match(overlay, /pathToCommands/);
  const compositor = readFileSync(resolve(root, 'src/engine/compositor.ts'), 'utf8');
  assert.doesNotMatch(compositor, /pathToCommands|getActivePath/, 'paths must stay non-printing');
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 5: Draw the active path** — in `src/canvas-overlay.ts` add imports:

```ts
import { getActivePath } from './engine/path-store';
import { pathToCommands, type AnchorRef } from './engine/path-geometry';
```

and the drawing code (place it beside `drawShapePreview`):

```ts
let pathSelection: AnchorRef | null = null;

export function setPathSelection(ref: AnchorRef | null): void { pathSelection = ref; }

const ANCHOR_PX = 6;
const HANDLE_PX = 5;

function drawActivePath(ctx: CanvasRenderingContext2D, scale: number): void {
  const path = getActivePath();
  if (!path || path.subpaths.length === 0) return;
  const anchorSize = ANCHOR_PX / scale;
  const handleRadius = HANDLE_PX / scale;

  ctx.save();
  ctx.lineWidth = 1 / scale;
  ctx.strokeStyle = 'rgba(20, 24, 32, 0.9)';
  ctx.beginPath();
  replayPathCommands(ctx, pathToCommands(path.subpaths));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.setLineDash([3 / scale, 3 / scale]);
  ctx.stroke();
  ctx.setLineDash([]);

  path.subpaths.forEach((sub, si) => {
    sub.anchors.forEach((anchor, ai) => {
      const selected = pathSelection?.sub === si && pathSelection?.anchor === ai;
      if (selected) {
        // Handles are only shown — and only grabbable — on the selected anchor.
        for (const h of [{ x: anchor.x + anchor.inDx, y: anchor.y + anchor.inDy },
                         { x: anchor.x + anchor.outDx, y: anchor.y + anchor.outDy }]) {
          if (h.x === anchor.x && h.y === anchor.y) continue;
          ctx.strokeStyle = 'rgba(90, 160, 255, 0.95)';
          ctx.beginPath();
          ctx.moveTo(anchor.x, anchor.y);
          ctx.lineTo(h.x, h.y);
          ctx.stroke();
          ctx.fillStyle = 'rgba(90, 160, 255, 0.95)';
          ctx.beginPath();
          ctx.arc(h.x, h.y, handleRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = selected ? 'rgba(90, 160, 255, 0.95)' : 'rgba(255, 255, 255, 0.96)';
      ctx.strokeStyle = 'rgba(20, 24, 32, 0.95)';
      ctx.beginPath();
      ctx.rect(anchor.x - anchorSize / 2, anchor.y - anchorSize / 2, anchorSize, anchorSize);
      ctx.fill();
      ctx.stroke();
    });
  });
  ctx.restore();
}
```

and call it in `drawCanvasOverlay` immediately after `drawShapePreview(ctx, scale);`:

```ts
  drawActivePath(ctx, scale);
```

- [ ] **Step 6: Run the test** — `npx vitest run tests/path-store.test.ts` PASS (5 tests); all four gates PASS.
- [ ] **Step 7: Commit**

```bash
git add src/engine/path-store.ts src/canvas-overlay.ts tests/path-store.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add the path store and active-path overlay"
git push origin main
```

---

### Task 7: The Pen tool

**Files:**
- Create: `src/tools/pen.ts`
- Modify: `src/dom.ts` (icon), `src/shell/toolbar-groups.ts`, `src/main.ts`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `ensureActivePath`, `getActivePath`, `replaceSubPaths` (Task 6); `createAnchor` (Task 1); `hitTestAnchor`, `hitTestSegment`, `insertAnchorOnSegment`, `deleteAnchor` (Tasks 4–5); `isEditingSessionLive`.
- Produces: `penTool`, plus `penInProgress(): boolean`, `finishPenPath(): void`, `cancelPenPath(): void` for the keyboard handler.

Behaviour: click appends a corner anchor; click-and-drag appends a smooth anchor whose handles follow the drag; clicking within the anchor radius of the **first** anchor closes the subpath and finishes it; clicking an existing segment inserts an anchor (auto-add); Alt-clicking an existing anchor deletes it (auto-delete); `Enter` finishes an open subpath; `Escape` discards the in-progress subpath.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('the pen tool is live with auto add and delete', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  assert.match(groups, /tool:\s*['"]pen['"]/);
  assert.doesNotMatch(groups, /stub: 'Pen'/, 'Pen is no longer a stub');
  const pen = readFileSync(resolve(root, 'src/tools/pen.ts'), 'utf8');
  assert.match(pen, /insertAnchorOnSegment/);
  assert.match(pen, /deleteAnchor/);
  assert.match(pen, /isEditingSessionLive/);
  assert.match(main, /Pen · Click to add anchors/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 2: Add the icon** — add to the `icons` map in `src/dom.ts`:

```ts
  pen: svg('<path d="M8 2.5 12 6.5 6.5 12 3 12.5 3.5 9z"/><line x1="3.5" y1="9" x2="6.5" y2="12"/>')
```

- [ ] **Step 3: Implement** — create `src/tools/pen.ts`:

```ts
import { type DocPoint, type Tool } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { toast } from '../toast';
import { createAnchor, type SubPath } from '../engine/path-model';
import { ensureActivePath, getActivePath, replaceSubPaths } from '../engine/path-store';
import {
  deleteAnchor, hitTestAnchor, hitTestSegment, insertAnchorOnSegment
} from '../engine/path-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { setPathSelection } from '../canvas-overlay';
import { getOverlayScale } from '../canvas';

const HIT_PX = 7;
const hitRadius = () => HIT_PX / Math.max(0.01, getOverlayScale());

/** Index of the subpath the pen is currently extending, or null between paths. */
let activeSub: number | null = null;
let dragAnchor: number | null = null;

export function penInProgress(): boolean { return activeSub !== null; }

export function cancelPenPath(): void {
  const path = getActivePath();
  if (path && activeSub !== null) {
    const subs = path.subpaths.filter((_, i) => i !== activeSub);
    replaceSubPaths(path.id, subs, 'Discard path');
  }
  activeSub = null;
  dragAnchor = null;
  setPathSelection(null);
  notify('composite');
}

export function finishPenPath(): void {
  activeSub = null;
  dragAnchor = null;
  setPathSelection(null);
  notify('composite');
}

function currentSub(): SubPath | null {
  const path = getActivePath();
  if (!path || activeSub === null) return null;
  return path.subpaths[activeSub] ?? null;
}

export const penTool: Tool = {
  id: 'pen', label: 'Pen', icon: icons.pen, cursor: 'crosshair', shortcut: 'p',

  onDown(p: DocPoint, e: PointerEvent) {
    if (isEditingSessionLive()) { toast('Finish the current session before drawing a path.'); return; }
    const path = ensureActivePath();
    const radius = hitRadius();

    // Auto-delete: Alt-clicking an existing anchor removes it.
    if (e.altKey) {
      const hit = hitTestAnchor(path.subpaths, p, radius);
      if (hit) {
        replaceSubPaths(path.id, deleteAnchor(path.subpaths, hit), 'Delete anchor');
        setPathSelection(null);
        return;
      }
    }

    // Closing: clicking the first anchor of the subpath being drawn.
    const sub = currentSub();
    if (sub && sub.anchors.length >= 2) {
      const first = sub.anchors[0];
      if ((first.x - p.x) ** 2 + (first.y - p.y) ** 2 <= radius * radius) {
        const subs = path.subpaths.map((s, i) => (i === activeSub ? { ...s, closed: true } : s));
        replaceSubPaths(path.id, subs, 'Close path');
        finishPenPath();
        return;
      }
    }

    // Auto-add: clicking an existing segment inserts an anchor without changing the curve.
    if (!sub) {
      const segment = hitTestSegment(path.subpaths, p, radius);
      if (segment) {
        replaceSubPaths(path.id, insertAnchorOnSegment(path.subpaths, segment), 'Add anchor');
        setPathSelection({ sub: segment.sub, anchor: segment.segment + 1 });
        return;
      }
    }

    // Otherwise append an anchor, starting a subpath if needed.
    const subs = path.subpaths.map((s) => ({ closed: s.closed, anchors: s.anchors.map((a) => ({ ...a })) }));
    if (activeSub === null) {
      subs.push({ anchors: [createAnchor(p.x, p.y)], closed: false });
      activeSub = subs.length - 1;
    } else {
      subs[activeSub].anchors.push(createAnchor(p.x, p.y));
    }
    dragAnchor = subs[activeSub].anchors.length - 1;
    replaceSubPaths(path.id, subs, 'Add anchor');
    setPathSelection({ sub: activeSub, anchor: dragAnchor });
  },

  onMove(p: DocPoint) {
    if (activeSub === null || dragAnchor === null) return;
    const path = getActivePath();
    const sub = currentSub();
    if (!path || !sub) return;
    const anchor = sub.anchors[dragAnchor];
    if (!anchor) return;
    // Dragging after placing pulls symmetric handles, turning the corner into a smooth point.
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    if (dx === 0 && dy === 0) return;
    const subs = path.subpaths.map((s, si) => ({
      closed: s.closed,
      anchors: s.anchors.map((a, ai) =>
        si === activeSub && ai === dragAnchor
          ? { ...a, outDx: dx, outDy: dy, inDx: -dx, inDy: -dy }
          : { ...a })
    }));
    replaceSubPaths(path.id, subs, 'Add anchor', `pen:${path.id}:${activeSub}:${dragAnchor}`);
  },

  onUp() { dragAnchor = null; },
  onCancel() { dragAnchor = null; },
  options: []
};
```

- [ ] **Step 4: Register the tool** — in `src/shell/toolbar-groups.ts` replace the `draw` group's Pen stub:

```ts
  { id: 'draw', entries: [{ tool: 'pen' }, { tool: 'shape-rect' }, { tool: 'shape-ellipse' }, { tool: 'shape-line' }, { tool: 'shape-polygon' }] },
```

In `src/main.ts`, import and register:

```ts
import { cancelPenPath, finishPenPath, penInProgress, penTool } from './tools/pen';
```

```ts
registerTool(penTool);
```

Add the Enter/Escape handling inside the existing document keydown handler, immediately after the polygonal-lasso lines:

```ts
    if (penInProgress() && e.key === 'Enter') { e.preventDefault(); finishPenPath(); return; }
    if (penInProgress() && e.key === 'Escape') { e.preventDefault(); cancelPenPath(); return; }
```

and a status hint beside the others in `syncContextStatus`:

```ts
    else if (tool.id === 'pen') status.textContent = 'Pen · Click to add anchors · Drag for curves · Enter finishes';
```

- [ ] **Step 5: Gates** — all four PASS.

- [ ] **Step 6: Live verify** (fresh `?audit-raf`; prove import instance sharing first; re-read the canvas rect after each tool change):
  1. `P` activates the Pen and shows its status hint.
  2. Three clicks create a Work Path with three anchors at exactly the clicked document points.
  3. A click-and-drag places a fourth anchor and gives it non-zero `outDx/outDy`; the whole drag is **one** history entry (assert `history.cursor()` delta of 1 across the drag).
  4. Clicking the first anchor sets `closed: true` and ends the path.
  5. `Escape` mid-path discards the in-progress subpath; `Enter` finishes one and leaves it open.
  6. Alt-clicking an anchor deletes it.
  7. Clicking a segment inserts an anchor and the curve's sampled midpoint is unchanged (compare `bezierPointAt` before and after).
  8. Drawing during a live Free Transform is refused with the busy toast.

- [ ] **Step 7: Commit**

```bash
git add src/tools/pen.ts src/dom.ts src/shell/toolbar-groups.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: add the Pen tool"
git push origin main
```

---

### Task 8: Direct Selection and Path Selection

**Files:**
- Create: `src/tools/path-edit-tools.ts`
- Modify: `src/dom.ts` (icons), `src/shell/toolbar-groups.ts`, `src/main.ts`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: the geometry editors (Task 5), the store (Task 6), `setPathSelection` (Task 6).
- Produces: `directSelectTool` (`A`), `pathSelectTool`.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('path editing tools are live', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  assert.match(groups, /tool:\s*['"]direct-select['"]/);
  assert.match(groups, /tool:\s*['"]path-select['"]/);
  const tools = readFileSync(resolve(root, 'src/tools/path-edit-tools.ts'), 'utf8');
  assert.match(tools, /moveHandle/);
  assert.match(tools, /setAnchorSmooth|setAnchorCorner/);
  assert.match(tools, /translateSubPath/);
  assert.match(tools, /coalesce|Key/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 2: Add the icons** — add to the `icons` map in `src/dom.ts`:

```ts
  directSelect: svg('<path d="M4 2.5 4 12 6.6 9.6 8.6 13.5 10.4 12.6 8.4 8.9 11.8 8.6z" fill="none"/>'),
  pathSelect: svg('<path d="M4 2.5 4 12 6.6 9.6 8.6 13.5 10.4 12.6 8.4 8.9 11.8 8.6z"/>')
```

- [ ] **Step 3: Implement** — create `src/tools/path-edit-tools.ts`:

```ts
import { type DocPoint, type Tool } from '../engine/tools';
import { icons } from '../dom';
import { notify } from '../state';
import { toast } from '../toast';
import { getActivePath, replaceSubPaths } from '../engine/path-store';
import {
  hitTestAnchor, hitTestHandle, hitTestSegment,
  moveAnchor, moveHandle, setAnchorCorner, setAnchorSmooth, translateSubPath,
  type AnchorRef, type HandleRef
} from '../engine/path-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { setPathSelection } from '../canvas-overlay';
import { getOverlayScale } from '../canvas';

const HIT_PX = 7;
const hitRadius = () => HIT_PX / Math.max(0.01, getOverlayScale());

type Drag =
  | { kind: 'anchor'; ref: AnchorRef }
  | { kind: 'handle'; ref: HandleRef; mirror: boolean }
  | { kind: 'convert'; ref: AnchorRef }
  | { kind: 'subpath'; sub: number; last: DocPoint };

let drag: Drag | null = null;
let selected: AnchorRef | null = null;

function blocked(): boolean {
  if (!isEditingSessionLive()) return false;
  toast('Finish the current session before editing a path.');
  return true;
}

export const directSelectTool: Tool = {
  id: 'direct-select', label: 'Direct Selection', icon: icons.directSelect, cursor: 'default', shortcut: 'a',

  onDown(p: DocPoint, e: PointerEvent) {
    if (blocked()) return;
    const path = getActivePath();
    if (!path) return;
    const radius = hitRadius();

    const handle = hitTestHandle(path.subpaths, p, radius, selected);
    if (handle) {
      // Alt breaks the mirror so the two handles can point independently.
      drag = { kind: 'handle', ref: handle, mirror: !e.altKey };
      return;
    }
    const anchor = hitTestAnchor(path.subpaths, p, radius);
    if (anchor) {
      selected = anchor;
      setPathSelection(anchor);
      notify('composite');
      // Alt-dragging an anchor converts it between corner and smooth.
      drag = e.altKey ? { kind: 'convert', ref: anchor } : { kind: 'anchor', ref: anchor };
      return;
    }
    selected = null;
    setPathSelection(null);
    notify('composite');
  },

  onMove(p: DocPoint) {
    const path = getActivePath();
    if (!drag || !path) return;
    if (drag.kind === 'anchor') {
      replaceSubPaths(
        path.id, moveAnchor(path.subpaths, drag.ref, p.x, p.y),
        'Move anchor', `anchor:${path.id}:${drag.ref.sub}:${drag.ref.anchor}`
      );
    } else if (drag.kind === 'handle') {
      replaceSubPaths(
        path.id, moveHandle(path.subpaths, drag.ref, p.x, p.y, drag.mirror),
        'Move handle', `handle:${path.id}:${drag.ref.sub}:${drag.ref.anchor}:${drag.ref.which}`
      );
    } else if (drag.kind === 'convert') {
      const anchor = path.subpaths[drag.ref.sub]?.anchors[drag.ref.anchor];
      if (!anchor) return;
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      const next = (dx === 0 && dy === 0)
        ? setAnchorCorner(path.subpaths, drag.ref)
        : setAnchorSmooth(path.subpaths, drag.ref, dx, dy);
      replaceSubPaths(path.id, next, 'Convert anchor', `convert:${path.id}:${drag.ref.sub}:${drag.ref.anchor}`);
    }
  },

  onUp() { drag = null; },
  onCancel() { drag = null; },
  options: []
};

export const pathSelectTool: Tool = {
  id: 'path-select', label: 'Path Selection', icon: icons.pathSelect, cursor: 'default', shortcut: '',

  onDown(p: DocPoint) {
    if (blocked()) return;
    const path = getActivePath();
    if (!path) return;
    const radius = hitRadius();
    const anchor = hitTestAnchor(path.subpaths, p, radius);
    const segment = anchor ? null : hitTestSegment(path.subpaths, p, radius);
    const sub = anchor?.sub ?? segment?.sub ?? null;
    if (sub === null) return;
    drag = { kind: 'subpath', sub, last: p };
    setPathSelection(null);
    notify('composite');
  },

  onMove(p: DocPoint) {
    const path = getActivePath();
    if (!drag || drag.kind !== 'subpath' || !path) return;
    const dx = p.x - drag.last.x;
    const dy = p.y - drag.last.y;
    if (dx === 0 && dy === 0) return;
    drag.last = p;
    replaceSubPaths(
      path.id, translateSubPath(path.subpaths, drag.sub, dx, dy),
      'Move path', `subpath:${path.id}:${drag.sub}`
    );
  },

  onUp() { drag = null; },
  onCancel() { drag = null; },
  options: []
};
```

**Note on the convert drag:** it decides by drag distance, not by the anchor's current state — dragging away from the anchor makes it smooth with handles following the drag, and releasing without moving makes it a corner. That keeps Alt-drag a single reversible gesture.

- [ ] **Step 4: Register** — in `src/shell/toolbar-groups.ts` extend the move-select group:

```ts
  { id: 'move-select', entries: [{ tool: 'move' }, { tool: 'marquee-rect' }, { tool: 'marquee-ellipse' }, { tool: 'lasso-free' }, { tool: 'lasso-poly' }, { tool: 'direct-select' }, { tool: 'path-select' }, { stub: 'Object Selection', key: 'W', phase: 'E' }] },
```

In `src/main.ts`:

```ts
import { directSelectTool, pathSelectTool } from './tools/path-edit-tools';
```

```ts
registerTool(directSelectTool);
registerTool(pathSelectTool);
```

and status hints:

```ts
    else if (tool.id === 'direct-select') status.textContent = 'Direct Selection · Drag anchors and handles · Alt converts';
    else if (tool.id === 'path-select') status.textContent = 'Path Selection · Drag to move the whole path';
```

- [ ] **Step 5: Gates** — all four PASS.

- [ ] **Step 6: Live verify**
  1. Draw a 3-anchor path with the Pen, then `A` for Direct Selection.
  2. Clicking an anchor selects it (the overlay shows its handles) and dragging it moves only that anchor; the drag is **one** history entry.
  3. Dragging a handle bends the outline; its partner mirrors; Alt-dragging the handle leaves the partner alone.
  4. Alt-dragging an anchor converts a corner to smooth (non-zero handles appear).
  5. Path Selection drags the whole subpath: every anchor moves by the same delta (compare all anchor positions before and after).
  6. Editing during a live crop session is refused with the busy toast.

- [ ] **Step 7: Commit**

```bash
git add src/tools/path-edit-tools.ts src/dom.ts src/shell/toolbar-groups.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: add Direct Selection and Path Selection tools"
git push origin main
```

---

### Task 9: The Paths panel

**Files:**
- Create: `src/panels/paths-panel.ts`
- Modify: `index.html`, `src/shell/dock.ts`, `src/main.ts`, `src/style.css`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: the store (Task 6); `pathToCommands` (Task 3); `replayPathCommands` (Task 2); `pathBounds` (Task 5); `inlineEdit` from `src/dom.ts`.
- Produces: `initPathsPanel(): void`, mounted into `#panel-paths`.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('the paths panel is a real dock panel', () => {
  assert.match(html, /id=["']panel-paths["']/);
  const dock = readFileSync(resolve(root, 'src/shell/dock.ts'), 'utf8');
  assert.match(dock, /id: 'paths', title: 'Paths'/);
  assert.doesNotMatch(dock, /id: 'paths'[^}]*phase/, 'the Paths tab is no longer a phase stub');
  const panel = readFileSync(resolve(root, 'src/panels/paths-panel.ts'), 'utf8');
  assert.match(panel, /inlineEdit/);
  assert.match(panel, /duplicateActivePath/);
  assert.match(panel, /deletePath/);
  assert.match(main, /initPathsPanel/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 2: Add the markup** — in `index.html`, directly after the `#panel-history` block inside the stack-3 dock body:

```html
          <div id="panel-paths" hidden>
            <div class="paths-list" id="paths-list"></div>
            <div class="paths-actions">
              <button class="btn-icon" id="btn-path-new" title="New path">New</button>
              <button class="btn-icon" id="btn-path-duplicate" title="Duplicate path">Duplicate</button>
              <button class="btn-icon" id="btn-path-delete" title="Delete path">Delete</button>
            </div>
          </div>
```

- [ ] **Step 3: Un-stub the dock tab** — in `src/shell/dock.ts` replace:

```ts
  registerDockPanel({ id: 'paths', title: 'Paths', stack: 3, order: 4, phase: 'D' });
```

with:

```ts
  registerDockPanel({ id: 'paths', title: 'Paths', stack: 3, order: 4 });
```

- [ ] **Step 4: Implement the panel** — create `src/panels/paths-panel.ts`:

```ts
import { $, inlineEdit } from '../dom';
import { state, subscribe } from '../state';
import {
  addPath, deletePath, duplicateActivePath, renamePath, setActivePath, subscribePaths
} from '../engine/path-store';
import { pathToCommands, pathBounds } from '../engine/path-geometry';
import { replayPathCommands } from '../engine/path-render';
import type { PathItem } from '../engine/path-model';

const THUMB = 26;

function drawThumb(canvas: HTMLCanvasElement, path: PathItem): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, THUMB, THUMB);
  const bounds = pathBounds(path.subpaths);
  if (!bounds) return;
  const box = Math.max(bounds.w, bounds.h, 1);
  const scale = (THUMB - 4) / box;
  ctx.save();
  ctx.translate(THUMB / 2, THUMB / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(bounds.x + bounds.w / 2), -(bounds.y + bounds.h / 2));
  ctx.lineWidth = 1 / scale;
  ctx.strokeStyle = 'rgba(230, 233, 240, 0.95)';
  ctx.beginPath();
  replayPathCommands(ctx, pathToCommands(path.subpaths));
  ctx.stroke();
  ctx.restore();
}

function render(): void {
  const list = $('paths-list');
  list.textContent = '';
  for (const path of state.doc.paths) {
    const row = document.createElement('div');
    row.className = 'path-row';
    row.dataset.pathId = path.id;
    if (path.id === state.doc.activePathId) row.classList.add('active');

    const thumb = document.createElement('canvas');
    thumb.width = THUMB;
    thumb.height = THUMB;
    thumb.className = 'path-thumb';
    drawThumb(thumb, path);

    const name = document.createElement('span');
    name.className = 'path-name-label';
    name.textContent = path.name;
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      inlineEdit(name, path.name, (value) => renamePath(path.id, value));
    });

    row.append(thumb, name);
    row.addEventListener('click', () => setActivePath(path.id));
    list.appendChild(row);
  }
  $('btn-path-duplicate').toggleAttribute('disabled', !state.doc.activePathId);
  $('btn-path-delete').toggleAttribute('disabled', !state.doc.activePathId);
}

export function initPathsPanel(): void {
  $('btn-path-new').addEventListener('click', () => addPath(`Path ${state.doc.paths.length + 1}`));
  $('btn-path-duplicate').addEventListener('click', () => duplicateActivePath());
  $('btn-path-delete').addEventListener('click', () => {
    if (state.doc.activePathId) deletePath(state.doc.activePathId);
  });
  subscribePaths(render);
  subscribe((dirty) => { if (dirty.has('structure')) render(); });
  render();
}
```

- [ ] **Step 5: Mount it** — in `src/main.ts`, add the import and call it beside the other panel initializers (next to `initColorPanel(); initSwatchesPanel();`):

```ts
import { initPathsPanel } from './panels/paths-panel';
```

```ts
initPathsPanel();
```

- [ ] **Step 6: Style** — append to `src/style.css`:

```css
.paths-list { display: flex; flex-direction: column; gap: 2px; padding: 4px; }
.path-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; cursor: pointer; }
.path-row:hover { background: rgba(255, 255, 255, 0.06); }
.path-row.active { background: rgba(90, 160, 255, 0.18); }
.path-thumb { width: 26px; height: 26px; border: 1px solid var(--glass-line); border-radius: 4px; flex: 0 0 auto; }
.path-name-label { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paths-actions { display: flex; gap: 4px; padding: 6px; border-top: 1px solid var(--glass-line); }
.paths-actions .btn-icon { font-size: 11px; padding: 4px 8px; }
```

- [ ] **Step 7: Gates** — all four PASS.

- [ ] **Step 8: Live verify** — the Paths tab in stack 3 is enabled (not grayed) and `Window > Paths` focuses it; drawing with the Pen adds a "Work Path" row with a rendered thumbnail; New adds "Path 2"; clicking a row makes it active and the overlay switches to that path; Duplicate copies it independently; double-clicking a name renames it; Delete removes it and the buttons gray out when no path remains; each of New/Duplicate/Delete/Rename is one undo step.

- [ ] **Step 9: Commit**

```bash
git add src/panels/paths-panel.ts index.html src/shell/dock.ts src/main.ts src/style.css tests/ui-layout.test.mjs
git commit -m "feat: add the Paths panel"
git push origin main
```

---

### Task 10: Convert to Shape

**Files:**
- Modify: `src/engine/document.ts` (ShapeSpec variant), `src/engine/shape-geometry.ts`, `src/engine/path-ops.ts` (create), `src/main.ts`, `src/shell/menu-bar.ts`
- Test: `tests/path-to-shape.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `pathToCommands` (Task 3), `pathBounds` (Task 5), the store (Task 6), `createShapeLayer` + `cmdAddLayer`.
- Produces: `convertPathToShape(): boolean` in `src/engine/path-ops.ts`; `ShapeSpec` gains `{ kind: 'path'; subpaths: SubPath[] }`.

**Geometry note:** shape geometry is centred on the layer origin, but path anchors are in document space. The conversion therefore recentres: the new layer's `x`/`y` is the path's bounds centre, and the stored subpaths are translated by `-centre` so the shape draws around its own origin like every other shape kind.

- [ ] **Step 1: Write the failing test**

Create `tests/path-to-shape.test.ts`:

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let store: typeof import('../src/engine/path-store');
let model: typeof import('../src/engine/path-model');
let ops: typeof import('../src/engine/path-ops');
let shapeGeometry: typeof import('../src/engine/shape-geometry');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        font: '', measureText: (t: string) => ({ width: t.length * 10 }),
        drawImage: () => {}, save: () => {}, restore: () => {}, translate: () => {},
        beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, bezierCurveTo: () => {},
        arcTo: () => {}, ellipse: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) =>
          ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: () => {}
      })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  store = await import('../src/engine/path-store');
  model = await import('../src/engine/path-model');
  ops = await import('../src/engine/path-ops');
  shapeGeometry = await import('../src/engine/shape-geometry');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function squarePath() {
  const path = store.ensureActivePath();
  store.replaceSubPaths(path.id, [{
    anchors: [model.createAnchor(100, 100), model.createAnchor(200, 100), model.createAnchor(200, 200)],
    closed: true
  }], 'Draw');
  return path;
}

test('a path shape delegates to pathToCommands', () => {
  const subpaths = [{ anchors: [model.createAnchor(-10, -10), model.createAnchor(10, 10)], closed: false }];
  const cmds = shapeGeometry.shapeCommands({ kind: 'path', subpaths });
  expect(cmds).toEqual([
    { op: 'moveTo', x: -10, y: -10 },
    { op: 'lineTo', x: 10, y: 10 }
  ]);
  expect(shapeGeometry.shapeNaturalSize({ kind: 'path', subpaths })).toEqual({ w: 20, h: 20 });
});

test('convert recentres the path onto the new layer origin', () => {
  squarePath();
  expect(ops.convertPathToShape()).toBe(true);
  const layer = stateModule.state.doc.layers[0];
  expect(layer.kind).toBe('shape');
  if (layer.kind !== 'shape' || layer.shape.kind !== 'path') throw new Error('expected a path shape layer');
  // bounds are 100..200 in both axes, so the centre is (150,150)
  expect(layer.x).toBe(150);
  expect(layer.y).toBe(150);
  const xs = layer.shape.subpaths[0].anchors.map((a) => a.x);
  expect(Math.min(...xs)).toBe(-50);
  expect(Math.max(...xs)).toBe(50);
  expect(history.entries()[history.entries().length - 1].label).toBe('Convert path to shape');
});

test('convert refuses with no active path or an empty one', () => {
  expect(ops.convertPathToShape()).toBe(false);
  store.ensureActivePath();
  expect(ops.convertPathToShape()).toBe(false);
  expect(stateModule.state.doc.layers.length).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, `path-ops` missing.

- [ ] **Step 3: Add the ShapeSpec variant** — in `src/engine/document.ts`, add the import and the variant:

```ts
import type { PathItem, SubPath } from './path-model';
```

```ts
export type ShapeSpec =
  | { kind: 'rect'; w: number; h: number; radius: number }
  | { kind: 'ellipse'; rx: number; ry: number }
  | { kind: 'line'; dx: number; dy: number }
  | { kind: 'polygon'; radius: number; sides: number }
  | { kind: 'path'; subpaths: SubPath[] };
```

In `src/engine/shape-geometry.ts`, add `import { pathToCommands } from './path-geometry';` plus the two branches — in `shapeCommands`, before the polygon fallthrough:

```ts
  if (shape.kind === 'path') return pathToCommands(shape.subpaths);
```

and in `shapeNaturalSize`, before the polygon fallthrough:

```ts
  if (shape.kind === 'path') {
    const bounds = pathBounds(shape.subpaths);
    return bounds ? { w: bounds.w, h: bounds.h } : { w: 0, h: 0 };
  }
```

with `pathBounds` added to that same import.

**Import-cycle note:** `path-geometry.ts` imports only the `PathCommand` *type* from `shape-geometry.ts`, and type-only imports are erased at build time, so this pair does not create a runtime cycle.

- [ ] **Step 4: Implement the operation** — create `src/engine/path-ops.ts`:

```ts
import { state } from '../state';
import * as history from './history';
import { cmdAddLayer } from './commands';
import { createShapeLayer } from './document';
import { getForeground, getBackground } from './color-state';
import { getActivePath } from './path-store';
import { pathBounds, translateSubPath } from './path-geometry';
import type { SubPath } from './path-model';

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
```

- [ ] **Step 5: Register the command** — add the contract to `tests/ui-layout.test.mjs`:

```js
test('path operations are registered in the menus', () => {
  assert.match(main, /path\.convertToShape/);
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  assert.match(menu, /path\.convertToShape/);
});
```

In `src/main.ts`:

```ts
import { convertPathToShape } from './engine/path-ops';
```

```ts
registerCommand({
  id: 'path.convertToShape', label: 'Convert Path to Shape',
  enabled: () => Boolean(state.doc.activePathId),
  run: () => guardTransformSession(() => {
    if (!convertPathToShape()) toast('Draw a path with at least two anchors first.');
  })
});
```

In `src/shell/menu-bar.ts`, add `'path.convertToShape'` to the Layer menu's item list, immediately after `'layer.rasterizeShape'`.

- [ ] **Step 6: Run the test** — PASS (3 tests); all four gates PASS.

- [ ] **Step 7: Live verify** — draw a closed path, run Convert Path to Shape, and confirm a new shape layer appears whose filled pixels sit where the path was (sample the centre), that it transforms and rasterizes like any other shape, and that one undo removes it.

- [ ] **Step 8: Commit**

```bash
git add src/engine/path-ops.ts src/engine/document.ts src/engine/shape-geometry.ts src/main.ts src/shell/menu-bar.ts tests/path-to-shape.test.ts tests/ui-layout.test.mjs
git commit -m "feat: convert a path into a vector shape layer"
git push origin main
```

---

### Task 11: Load path as selection

**Files:**
- Modify: `src/engine/selection-ops.ts`, `src/engine/selection.ts`, `src/engine/path-ops.ts`, `src/main.ts`, `src/shell/menu-bar.ts`
- Test: `tests/selection-ops.test.ts` (extend), `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `commitSelection` and `SelectionOp` (Phase C); `pathToCommands` (Task 3); `replayPathCommands` (Task 2).
- Produces: `SelectionOp` gains `{ kind: 'path'; subpaths: SubPath[]; mode: SelectionMode }`; `loadPathAsSelection(): boolean`.

- [ ] **Step 1: Extend the ops test** — add to `tests/selection-ops.test.ts`:

```ts
test('a path op appends like any other shape op and counts its anchors', () => {
  const pathOp: SelectionOp = {
    kind: 'path',
    subpaths: [{ anchors: [
      { x: 0, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 0 },
      { x: 10, y: 0, inDx: 0, inDy: 0, outDx: 0, outDy: 0 },
      { x: 10, y: 10, inDx: 0, inDy: 0, outDx: 0, outDy: 0 }
    ], closed: true }],
    mode: 'new'
  };
  expect(reduceOps([{ kind: 'all' }], pathOp)).toEqual([pathOp]);   // 'new' restarts the list
  expect(opsPointCount([pathOp])).toBe(3);
  const added: SelectionOp = { ...pathOp, mode: 'add' };
  expect(reduceOps([pathOp], added).length).toBe(2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/selection-ops.test.ts`
Expected: FAIL — TypeScript rejects `kind: 'path'` on `SelectionOp`.

- [ ] **Step 3: Extend the selection op type** — in `src/engine/selection-ops.ts`, add the import and the variant:

```ts
import type { SubPath } from './path-model';
```

```ts
export type SelectionOp =
  | { kind: 'shape'; shape: SelectionShape; mode: SelectionMode }
  | { kind: 'path'; subpaths: SubPath[]; mode: SelectionMode }
  | { kind: 'all' }
  | { kind: 'invert' };
```

`reduceOps` already restarts the list for any op with `mode === 'new'`; widen its guard so a path op behaves identically:

```ts
export function reduceOps(ops: SelectionOp[], op: SelectionOp): SelectionOp[] {
  if (op.kind === 'all') return [op];
  if ((op.kind === 'shape' || op.kind === 'path') && op.mode === 'new') return [op];
  return [...ops, op];
}
```

and count its anchors in `opsPointCount`:

```ts
export function opsPointCount(ops: SelectionOp[]): number {
  let total = 0;
  for (const op of ops) {
    if (op.kind === 'all' || op.kind === 'invert') { total += 1; continue; }
    if (op.kind === 'path') {
      for (const sub of op.subpaths) total += sub.anchors.length;
      continue;
    }
    total += op.shape.kind === 'polygon' ? op.shape.points.length : 4;
  }
  return total;
}
```

- [ ] **Step 4: Rasterize it** — in `src/engine/selection.ts` add the imports:

```ts
import { pathToCommands } from './path-geometry';
import { replayPathCommands } from './path-render';
```

and, inside `rasterize()`'s loop, handle the new kind immediately before the existing `if (op.mode === 'new')` block:

```ts
    if (op.kind === 'path') {
      if (op.mode === 'new') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.globalCompositeOperation = compositeOpFor(op.mode);
      }
      ctx.save();
      ctx.beginPath();
      replayPathCommands(ctx, pathToCommands(op.subpaths));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      continue;
    }
```

- [ ] **Step 5: Add the operation** — add `import { commitSelection } from './selection';` to the top of `src/engine/path-ops.ts` (Task 12 consolidates this file's imports into one block), then append:

```ts
/** Rasterize the active path into the Phase C selection mask. */
export function loadPathAsSelection(): boolean {
  const subpaths = activeSubPaths();
  if (!subpaths) return false;
  commitSelection({ kind: 'path', subpaths, mode: 'new' }, 'Path to selection');
  return true;
}
```

- [ ] **Step 6: Register** — extend the operations contract in `tests/ui-layout.test.mjs`:

```js
test('path selection and painting operations are registered', () => {
  assert.match(main, /path\.loadAsSelection/);
  const menu = readFileSync(resolve(root, 'src/shell/menu-bar.ts'), 'utf8');
  assert.match(menu, /path\.loadAsSelection/);
});
```

In `src/main.ts`:

```ts
import { convertPathToShape, loadPathAsSelection } from './engine/path-ops';
```

```ts
registerCommand({
  id: 'path.loadAsSelection', label: 'Make Selection from Path',
  enabled: () => Boolean(state.doc.activePathId),
  run: () => guardTransformSession(() => {
    if (!loadPathAsSelection()) toast('Draw a path with at least two anchors first.');
  })
});
```

In `src/shell/menu-bar.ts`, add `'path.loadAsSelection'` to the Select menu's items, after `'select.inverse'`.

- [ ] **Step 7: Run the tests** — `npx vitest run tests/selection-ops.test.ts` PASS; all four gates PASS.

- [ ] **Step 8: Live verify** — draw a closed triangular path, run Make Selection from Path, confirm marching ants trace the path and `getSelectionBounds()` matches `pathBounds`; then paint a brush stroke across the boundary and confirm pixels inside the path change while pixels outside are byte-identical; one undo reverts the selection change.

- [ ] **Step 9: Commit**

```bash
git add src/engine/selection-ops.ts src/engine/selection.ts src/engine/path-ops.ts src/main.ts src/shell/menu-bar.ts tests/selection-ops.test.ts tests/ui-layout.test.mjs
git commit -m "feat: load a path as a pixel selection"
git push origin main
```

---

### Task 12: Fill Path, Stroke Path, and Make Work Path

**Files:**
- Modify: `src/engine/path-ops.ts`, `src/main.ts`, `src/shell/menu-bar.ts`
- Test: `tests/path-paint-ops.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `getSelectionAlpha` and `traceContours` (Phase C); `documentToBitmapMatrix` (Phase C); `clampRect` (Phase B); `layerNaturalSize`; the store (Task 6).
- Produces: `fillPath(): boolean`, `strokePath(): boolean`, `makeWorkPathFromSelection(): boolean`.

Fill and Stroke paint onto the active image layer through the same snapshot → apply → snapshot → push-once pattern `selection-edit.ts` uses, mapping document-space path commands into bitmap space with `documentToBitmapMatrix`.

- [ ] **Step 1: Write the failing test**

Create `tests/path-paint-ops.test.ts`:

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    setTransform: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    bezierCurveTo: () => {}, arcTo: () => {}, ellipse: () => {}, closePath: () => {},
    fill: () => {}, stroke: () => {}, drawImage: () => {}, clearRect: () => {}, fillRect: () => {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalCompositeOperation: 'source-over',
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let store: typeof import('../src/engine/path-store');
let model: typeof import('../src/engine/path-model');
let ops: typeof import('../src/engine/path-ops');

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
  store = await import('../src/engine/path-store');
  model = await import('../src/engine/path-model');
  ops = await import('../src/engine/path-ops');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function imageLayer() {
  const layer = documentModel.createImageLayer(stateModule.state.doc);
  const bitmap = document.createElement('canvas') as unknown as HTMLCanvasElement;
  (bitmap as { width: number }).width = 200;
  (bitmap as { height: number }).height = 100;
  layer.bitmap = bitmap;
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

function trianglePath() {
  const path = store.ensureActivePath();
  store.replaceSubPaths(path.id, [{
    anchors: [model.createAnchor(50, 50), model.createAnchor(150, 50), model.createAnchor(100, 120)],
    closed: true
  }], 'Draw');
  history.clear();
  return path;
}

test('fill and stroke each push one command', () => {
  imageLayer();
  trianglePath();
  expect(ops.fillPath()).toBe(true);
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Fill path');
  expect(ops.strokePath()).toBe(true);
  expect(history.entries()[history.entries().length - 1].label).toBe('Stroke path');
});

test('fill and stroke refuse without an image layer or a path', () => {
  trianglePath();
  expect(ops.fillPath()).toBe(false);        // no image layer
  stateModule.state.doc.layers = [];
  stateModule.state.doc.paths = [];
  stateModule.state.doc.activePathId = null;
  imageLayer();
  expect(ops.fillPath()).toBe(false);        // no path
  expect(ops.strokePath()).toBe(false);
  expect(history.entries().length).toBe(0);
});

test('makeWorkPathFromSelection refuses with no selection', () => {
  expect(ops.makeWorkPathFromSelection()).toBe(false);
  expect(stateModule.state.doc.paths.length).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, functions missing.

- [ ] **Step 3: Implement** — first extend the import block at the **top** of `src/engine/path-ops.ts` so it reads:

```ts
import { state, notify } from '../state';
import * as history from './history';
import { cmdAddLayer } from './commands';
import { createShapeLayer, layerNaturalSize, type ImageLayer } from './document';
import { getForeground, getBackground } from './color-state';
import { getActivePath } from './path-store';
import { pathBounds, pathToCommands, translateSubPath } from './path-geometry';
import { replayPathCommands } from './path-render';
import { createAnchor, createPathItem, type SubPath } from './path-model';
import { commitSelection, getSelectionAlpha } from './selection';
import { documentToBitmapMatrix } from './transform-geometry';
import { clampRect } from './stroke-geometry';
import { traceContours } from './selection-contour';
```

then append the implementation below it:

```ts
function activeImageLayer(): ImageLayer | null {
  const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
  return layer && layer.kind === 'image' && layer.bitmap ? layer : null;
}

/** Paint the active path onto the active image layer, one undoable dirty-rect command. */
function paintPath(label: string, paint: (ctx: CanvasRenderingContext2D) => void): boolean {
  const subpaths = activeSubPaths();
  const layer = activeImageLayer();
  if (!subpaths || !layer || !layer.bitmap) return false;
  const rect = clampRect(
    { x: 0, y: 0, w: layer.bitmap.width, h: layer.bitmap.height },
    layer.bitmap.width, layer.bitmap.height
  );
  if (!rect) return false;

  const ctx = layer.bitmap.getContext('2d')!;
  const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  const matrix = documentToBitmapMatrix(layer, layerNaturalSize(layer));
  ctx.save();
  ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  ctx.beginPath();
  replayPathCommands(ctx, pathToCommands(subpaths));
  paint(ctx);
  ctx.restore();
  const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
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

export function fillPath(): boolean {
  return paintPath('Fill path', (ctx) => {
    ctx.fillStyle = getForeground();
    ctx.closePath();
    ctx.fill();
  });
}

export function strokePath(): boolean {
  return paintPath('Stroke path', (ctx) => {
    ctx.strokeStyle = getForeground();
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/**
 * Trace the current selection into an editable path. Photoshop fits smooth curves under a
 * tolerance setting; this produces corner anchors, which can then be smoothed by hand.
 */
export function makeWorkPathFromSelection(): boolean {
  const alpha = getSelectionAlpha();
  if (!alpha) return false;
  const loops = traceContours(alpha, state.doc.width, state.doc.height);
  if (loops.length === 0) return false;
  const subpaths: SubPath[] = loops.map((loop) => ({
    anchors: loop.map((p) => createAnchor(p.x, p.y)),
    closed: true
  }));
  const path = createPathItem('Work Path');
  const prevActive = state.doc.activePathId;
  history.push({
    label: 'Make work path',
    do: () => {
      state.doc.paths.push(path);
      path.subpaths = subpaths;
      state.doc.activePathId = path.id;
      notify('structure', 'composite');
    },
    undo: () => {
      state.doc.paths = state.doc.paths.filter((p) => p.id !== path.id);
      state.doc.activePathId = prevActive;
      notify('structure', 'composite');
    }
  });
  return true;
}
```

- [ ] **Step 4: Register the commands** — extend the operations contract in `tests/ui-layout.test.mjs`:

```js
test('path painting operations are registered', () => {
  assert.match(main, /path\.fill/);
  assert.match(main, /path\.stroke/);
  assert.match(main, /path\.makeWorkPath/);
  const opsSrc = readFileSync(resolve(root, 'src/engine/path-ops.ts'), 'utf8');
  assert.match(opsSrc, /traceContours/);
  assert.match(opsSrc, /documentToBitmapMatrix/);
});
```

In `src/main.ts`:

```ts
import {
  convertPathToShape, fillPath, loadPathAsSelection, makeWorkPathFromSelection, strokePath
} from './engine/path-ops';
```

```ts
registerCommand({
  id: 'path.fill', label: 'Fill Path',
  enabled: () => Boolean(state.doc.activePathId) && Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    if (!fillPath()) toast('Select an image layer and draw a path first.');
  })
});
registerCommand({
  id: 'path.stroke', label: 'Stroke Path',
  enabled: () => Boolean(state.doc.activePathId) && Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    if (!strokePath()) toast('Select an image layer and draw a path first.');
  })
});
registerCommand({
  id: 'path.makeWorkPath', label: 'Make Work Path from Selection',
  enabled: () => hasSelection(),
  run: () => guardTransformSession(() => {
    if (!makeWorkPathFromSelection()) toast('Make a selection first.');
  })
});
```

In `src/shell/menu-bar.ts`, add `'path.fill'` and `'path.stroke'` to the Layer menu after `'path.convertToShape'`, and `'path.makeWorkPath'` to the Select menu after `'path.loadAsSelection'`.

- [ ] **Step 5: Run the tests** — PASS (3 tests); all four gates PASS.

- [ ] **Step 6: Live verify** — with an image layer selected and a closed path drawn: Fill Path paints the interior in the foreground colour (sample a bitmap pixel inside), one undo restores it exactly; Stroke Path paints the outline only (interior unchanged, a pixel on the outline changed); with a rectangular marquee active, Make Work Path from Selection creates a "Work Path" whose anchors trace the marquee's corners; both menus gray their items when the preconditions are missing.

- [ ] **Step 7: Commit**

```bash
git add src/engine/path-ops.ts src/main.ts src/shell/menu-bar.ts tests/path-paint-ops.test.ts tests/ui-layout.test.mjs
git commit -m "feat: fill and stroke paths and make a work path from a selection"
git push origin main
```

---

### Task 13: Final regression, docs, and close-out

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/changelog.md`
- No source changes.

- [ ] **Step 1: Full live regression** on `?audit-raf` at 1280×800, re-reading the canvas rect after every tool change:
  - **Paths:** pen click/drag/close; Enter and Escape; auto add and delete; Direct Selection anchor, handle, and Alt-convert drags (each exactly one history entry); Path Selection move; Paths panel new/duplicate/rename/delete/switch.
  - **Non-printing proof:** with a path visible on canvas, export a PNG and confirm the decoded image contains **no** path outline — sample pixels along the path where the overlay draws it and assert they match the underlying document (fully transparent on an empty canvas).
  - **Operations:** Convert to Shape, Make Selection from Path (then a clipped brush stroke), Fill Path, Stroke Path, Make Work Path from Selection.
  - **Persistence:** save with paths, reopen, and confirm anchors and handles round-trip; also confirm a pre-D2 project file (no `paths` key) still opens with an empty path list.
  - **Phase A/B/C/D1 regression:** menus and dock tabs; Tab / Shift+Tab; Reset Essentials; brush stroke + undo; eraser; eyedropper; marquee and lasso with Shift-add and Alt-subtract; clipped stroke; Clear/Fill/Crop to Selection; the four shape tools with Shift/Alt; shape Properties edits; Rasterize Shape; transform guard; crop apply/undo.
  - **Geometry probe:** zero surface violations.

- [ ] **Step 2: Docs**

- `README.md`: extend the Toolbar row of the Workspace table with "the Pen and path-editing tools"; add an Editing Workflow paragraph covering drawing paths with the Pen, editing anchors and handles with Direct Selection, moving subpaths with Path Selection, the Paths panel, and the five operations, noting that paths never appear in an export; add `P` (Pen) and `A` (Direct Selection) to Essential Shortcuts.
- `docs/architecture.md`: add a paragraph beside the other engines describing `src/engine/path-model.ts` (anchors with relative handles; a corner is zero-length handles), `path-geometry.ts` (commands, hit-tests, De Casteljau insertion), `path-store.ts` (one history command per mutation), `path-render.ts` (the single command-replay site), and the rule that paths render only in the overlay.
- `docs/changelog.md` top entry:

```markdown
## 3.6.0 - 2026-07-21

### Added

- **Pen tool and Paths panel**: draw Bézier paths with the Pen (`P`) — click for corners, drag for curves, click the first anchor to close — then refine them with Direct Selection (`A`) for anchors and handles, Alt-drag to convert between corner and smooth, and Path Selection to move a whole subpath. The Paths panel lists, renames, duplicates, and deletes document paths. Paths convert to vector shape layers, load as pixel selections, and fill or stroke the active image layer, and a selection can be traced back into an editable work path. Paths are non-printing and never appear in an export. (Plan: 2026-07-21-pen-and-paths.)
```

- [ ] **Step 3: Gates, commit, and protocol**

```bash
git add README.md docs/architecture.md docs/changelog.md
git commit -m "docs: document the pen tool and paths panel and record 3.6.0"
git push origin main
```

AGENTS.md protocol: hooks refresh the graph; the new modules (`path-model`, `path-geometry`, `path-render`, `path-store`, `path-ops`, `pen`, `path-edit-tools`, `paths-panel`) change structure → run `python -m graphify export obsidian`; verify `graphify-out/` stays untracked; update the project memory (D2 shipped, D3 type expansion still pending).
