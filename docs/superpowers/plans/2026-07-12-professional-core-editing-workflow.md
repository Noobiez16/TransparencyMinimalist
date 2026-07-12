# Professional Core Editing Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Photoshop-familiar affine transforms, smart guides, and non-destructive document cropping while preserving Transparency's balanced spatial-glass workspace.

**Architecture:** Extend the versioned layer model first, then build pure geometry and snapping services, transactional transform/crop sessions, a canvas-only overlay, and thin Move/Crop tool adapters. All persistent mutations remain reversible commands; editor-only previews and guides never enter project files or exports.

**Tech Stack:** TypeScript 5, Canvas 2D, DOM Pointer Events, Vitest 3, Node test runner, Vite 5.

## Global Constraints

- Preserve the existing balanced spatial-glass visual identity and right-dock layout.
- Use only project-native inline SVG icons from `src/dom.ts`; no emoji, text glyph icons, raster icons, icon fonts, or remote icon dependency.
- Keep Node.js 18 support. Pin Vitest to major version 3 because Vitest 4 requires Node 20 and Vite 6.
- Version 1 projects must migrate without a visible composition change and save as version 2.
- One completed direct gesture or explicit session produces exactly one history action.
- Overlay controls, crop shading, smart guides, and measurements never appear in exports or serialization.
- Keep groups, masks, locks, multi-selection, persistent rulers, skew, perspective, warp, destructive crop, and per-layer crop out of scope.
- Retain the current Move, Hand, Zoom, persistence, autosave, layers, properties, history, and export behavior unless this plan explicitly changes it.

## File Map

- `src/engine/document.ts`: version 2 affine layer fields and transformed dimensions.
- `src/engine/transform-geometry.ts`: pure rotated geometry, handles, hit testing, scale/rotation constraints.
- `src/engine/snap-engine.ts`: deterministic screen-threshold snapping and guide descriptors.
- `src/engine/transform-session.ts`: direct/explicit transform transaction lifecycle.
- `src/engine/crop-session.ts`: crop preview lifecycle and ratio constraints.
- `src/engine/commands.ts`: exact transform and crop commands.
- `src/engine/compositor.ts`: shared rotation and independent-axis rendering.
- `src/engine/persistence.ts`: version 1 migration and version 2 serialization.
- `src/canvas-overlay.ts`: editor-only transform, guide, measurement, and crop rendering.
- `src/canvas.ts`: overlay-aware pointer routing and zoom-scale exposure.
- `src/tools/move.ts`: selection/move adapter for transform sessions and snapping.
- `src/tools/crop.ts`: Crop tool adapter and contextual option descriptors.
- `src/engine/tools.ts`: richer typed contextual options and cancel-aware pointer lifecycle.
- `src/options-bar.ts`: grouped numeric/toggle/action/select controls.
- `src/properties-panel.ts`: persistent affine numeric controls.
- `src/main.ts`: Crop registration, Free Transform shortcut, Apply/Cancel routing.
- `src/dom.ts`: native SVG crop/link/apply/cancel/snap/align/rotate icons.
- `index.html`, `src/style.css`: Option A contextual shell, responsive controls, and accessible session prompt.
- `tests/*.test.ts`: Vitest behavior tests.
- `tests/ui-layout.test.mjs`, `tests/documentation.test.mjs`: static UI/docs contracts.
- `README.md`, `docs/architecture.md`, `docs/design.md`, `docs/examples.md`: user/contributor documentation.

---

### Task 1: TypeScript Test Infrastructure and Version 2 Affine Model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/document-model.test.ts`
- Create: `tests/persistence-migration.test.ts`
- Modify: `src/engine/document.ts`
- Modify: `src/engine/compositor.ts`
- Modify: `src/engine/persistence.ts`
- Modify: `src/state.ts`
- Modify: `src/layers-panel.ts`

**Interfaces:**
- Produces `LayerTransform { x; y; scaleX; scaleY; rotation }`, `layerNaturalSize(layer)`, `layerDisplaySize(layer)`, version 2 `Doc`, and `migrateSerialLayer(raw, fileVersion)`.
- Later tasks consume those names exactly.

- [ ] **Step 1: Add the failing model and migration tests**

```ts
import { describe, expect, it } from 'vitest';
import { createDoc, createTextLayer, layerDisplaySize } from '../src/engine/document';
import { migrateSerialLayer } from '../src/engine/persistence';

it('creates affine version 2 layers', () => {
  const doc = createDoc(800, 600);
  const layer = createTextLayer(doc);
  expect(doc.version).toBe(2);
  expect(layer).toMatchObject({ scaleX: 100, scaleY: 100, rotation: 0 });
});

it('migrates version 1 scale without changing display size', () => {
  const migrated = migrateSerialLayer({ kind: 'text', scale: 125 }, 1);
  expect(migrated).toMatchObject({ scaleX: 125, scaleY: 125, rotation: 0 });
  expect(migrated).not.toHaveProperty('scale');
});
```

- [ ] **Step 2: Install and run Vitest 3 to verify RED**

Run `npm.cmd install --save-dev vitest@^3.2.4`, add `"test:core": "vitest run"`, then run `npm.cmd run test:core`.

Expected: FAIL because affine fields and migration export do not exist.

- [ ] **Step 3: Implement the affine model and compositor**

Use:

```ts
export interface LayerTransform {
  x: number; y: number;
  scaleX: number; scaleY: number;
  rotation: number;
}

export interface LayerBase extends LayerTransform { /* existing fields */ }
export interface Doc { version: 2; /* existing fields */ }
export function layerDisplaySize(layer: Layer) {
  const { w, h } = layerNaturalSize(layer);
  return { w: w * layer.scaleX / 100, h: h * layer.scaleY / 100 };
}
```

In `drawLayer`, call `ctx.rotate(layer.rotation * Math.PI / 180)` before `ctx.scale(layer.scaleX / 100, layer.scaleY / 100)`. Replace every old `scale` write/read, including image cover placement and reset defaults.

- [ ] **Step 4: Implement version 1 migration and version 2 save**

Export a pure `migrateSerialLayer` that strips `scale`, supplies missing affine values, and preserves all other validated fields. Accept envelopes 1 and 2; reject `> 2`; serialize `version: 2` and `doc.version: 2`.

- [ ] **Step 5: Verify and commit**

Run `npm.cmd run test:core`, `npm.cmd run test:ui`, and `npm.cmd run build`.

Commit: `feat: add affine layer model and project migration`.

### Task 2: Pure Transform Geometry

**Files:**
- Create: `src/engine/transform-geometry.ts`
- Create: `tests/transform-geometry.test.ts`
- Modify: `src/engine/document.ts`
- Modify: `src/engine/tools.ts`

**Interfaces:**
- Produces `Point`, `LayerQuad`, `HandleId`, `getLayerQuad`, `getHandlePoints`, `documentToLocal`, `localToDocument`, `hitTestLayer`, `hitTestHandle`, `resizeFromHandle`, `rotationFromPointer`, `normalizeDegrees`.

- [ ] **Step 1: Write geometry tests before implementation**

Cover 0/45/90-degree corners, local/document round trips, rotated hit tests, all eight handle locations, linked corner resize, independent side resize, negative drags, minimum 1px display size, and 15-degree constraints.

```ts
expect(getLayerQuad(layer, { w: 100, h: 50 }).corners[0].x).toBeCloseTo(50);
expect(documentToLocal(layer, localToDocument(layer, { x: 12, y: -4 }))).toEqual({ x: 12, y: -4 });
expect(normalizeDegrees(370)).toBe(10);
expect(rotationFromPointer(center, pointer, true) % 15).toBe(0);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `npx vitest run tests/transform-geometry.test.ts`.

Expected: FAIL with missing module/exports.

- [ ] **Step 3: Implement pure geometry**

Use center-based affine math, return immutable values, and keep DOM/history/state imports out. `resizeFromHandle` accepts `{ start, handle, pointer, linked, minSize: 1 }` and returns a complete `LayerTransform`.

- [ ] **Step 4: Replace axis-aligned hit testing**

Change `layerAt()` to call `hitTestLayer(layer, p, layerNaturalSize(layer))`; preserve front-to-back visible-layer order.

- [ ] **Step 5: Verify and commit**

Run core tests and build. Commit: `feat: add affine transform geometry`.

### Task 3: Reversible Transform and Crop Commands

**Files:**
- Modify: `src/engine/commands.ts`
- Create: `tests/editor-commands.test.ts`

**Interfaces:**
- Produces `cmdTransformLayer(layerId, before, after, label?, coalesceKey?)` and `cmdCropDocument(before, after)`.
- `DocumentGeometry` contains `{ width; height; positions: Record<string, {x; y}> }`.

- [ ] **Step 1: Write failing command tests**

Test exact five-field transform do/undo, crop dimension/position do/undo, missing-layer safety, dirty flags, and no bitmap duplication.

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/editor-commands.test.ts`.

- [ ] **Step 3: Implement exact snapshot commands**

```ts
export function cmdTransformLayer(id: string, before: LayerTransform, after: LayerTransform, label = 'Transform layer', coalesceKey?: string): Command;
export function cmdCropDocument(before: DocumentGeometry, after: DocumentGeometry): Command;
```

Apply all values atomically and notify the narrowest required dirty flags.

- [ ] **Step 4: Verify and commit**

Run core/UI/build checks. Commit: `feat: add transform and crop history commands`.

### Task 4: Transform Sessions, Overlay, and Move Tool

**Files:**
- Create: `src/engine/transform-session.ts`
- Create: `src/canvas-overlay.ts`
- Create: `tests/transform-session.test.ts`
- Modify: `src/tools/move.ts`
- Modify: `src/canvas.ts`
- Modify: `src/engine/compositor.ts`
- Modify: `src/engine/tools.ts`

**Interfaces:**
- Produces `beginTransform`, `beginHandleGesture`, `previewTransform`, `finishGesture`, `applyTransform`, `cancelTransform`, `interruptGesture`, `getTransformSession`, `subscribeTransformSession`.
- Overlay consumes `OverlayState { transform; guides; crop; overlayScale }` and exports `drawCanvasOverlay(ctx, doc, state)`.

- [ ] **Step 1: Write failing transaction tests**

Prove direct pointer-up creates one command, explicit sessions combine multiple previews into one command, Cancel/pointercancel restore exact state, and a missing layer returns `false` without state.

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/transform-session.test.ts`.

- [ ] **Step 3: Implement transform session lifecycle**

Store cloned start/current transforms and mode `'direct' | 'explicit'`. Preview updates the live layer and notifies without pushing history. Apply restores the start snapshot before pushing `cmdTransformLayer` so `history.push().do()` produces the final state exactly once.

- [ ] **Step 4: Implement constant-screen overlay**

Move the old outline out of `compositor.ts`. Draw the rotated quad, eight light/dark handles, rotation stem/handle, guides, and labels after document compositing only when `overlay: true`.

- [ ] **Step 5: Delegate Move gestures**

Hit handles before layer interiors. Preserve auto-select and ordinary move, show controls by default, route `pointercancel` to interruption instead of normal pointer-up, and expose `getOverlayScale()` from canvas.

- [ ] **Step 6: Verify and commit**

Run core/UI/build checks. Commit: `feat: add direct transform controls`.

### Task 5: Contextual Free Transform UI and Native SVG Icons

**Files:**
- Modify: `src/engine/tools.ts`
- Modify: `src/options-bar.ts`
- Modify: `src/properties-panel.ts`
- Modify: `src/main.ts`
- Modify: `src/dom.ts`
- Modify: `index.html`
- Modify: `src/style.css`
- Modify: `tests/ui-layout.test.mjs`

**Interfaces:**
- Extend `ToolOption.kind` with `'number' | 'action' | 'group'`; action descriptors contain `icon`, `action`, `disabled`, and `label`.
- Both options and Properties call the transform-session API.

- [ ] **Step 1: Add failing UI contracts**

Require Crop/rotate/link/snap/apply/cancel SVG keys, contextual numeric inputs, accessible labels, pressed state, transform Properties controls, status mode text, compact wrapping, and no emoji/text-icon fallback.

- [ ] **Step 2: Verify RED**

Run `npm.cmd run test:ui`.

- [ ] **Step 3: Implement native icons and grouped options**

Add SVG paths through the existing `svg()` helper. Render number inputs with labels, link toggle, snap toggle, and Apply/Cancel icon buttons. Re-render on tool, selection, layer property, and session changes without replacing the focused field.

- [ ] **Step 4: Add explicit Free Transform keyboard behavior**

`Ctrl/Cmd+T` starts explicit mode; Enter applies; Escape cancels. Input/contenteditable targets keep their native keystrokes. Tool/layer/project actions request Apply/Cancel through a small spatial-glass session prompt.

- [ ] **Step 5: Replace Properties scale control**

Expose X/Y/W/H/rotation and linked proportions while retaining opacity, blend, effects, and text controls.

- [ ] **Step 6: Verify and commit**

Run core/UI/docs/build checks. Commit: `feat: add contextual free transform workflow`.

### Task 6: Smart Snapping and Guides

**Files:**
- Create: `src/engine/snap-engine.ts`
- Create: `tests/snap-engine.test.ts`
- Modify: `src/engine/transform-session.ts`
- Modify: `src/canvas-overlay.ts`
- Modify: `src/tools/move.ts`

**Interfaces:**
- Produces `buildSnapCandidates(doc, activeId)`, `snapTranslation(input)`, `SnapResult { x; y; guides }`, and `GuideDescriptor`.

- [ ] **Step 1: Write failing snapping tests**

Test canvas/layer anchors, hidden/empty/active exclusions, deterministic ties, threshold conversion `screenPx / overlayScale`, Ctrl/Cmd bypass, and constant results at 25/100/400% zoom.

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/snap-engine.test.ts`.

- [ ] **Step 3: Implement deterministic snapping**

Use priority: document center, document edges, nearest visible-layer candidate, then stable layer order. Cache candidates at gesture start and return guide/measurement descriptors with corrected transform.

- [ ] **Step 4: Integrate preview and overlay**

Move previews and resize previews call snapping unless Ctrl/Cmd is held. Clear guides on pointer-up, cancel, tool change, or bypass.

- [ ] **Step 5: Verify and commit**

Run core/UI/build checks. Commit: `feat: add smart alignment guides`.

### Task 7: Non-Destructive Document Crop

**Files:**
- Create: `src/engine/crop-session.ts`
- Create: `src/tools/crop.ts`
- Create: `tests/crop-session.test.ts`
- Modify: `src/canvas-overlay.ts`
- Modify: `src/engine/tools.ts`
- Modify: `src/main.ts`
- Modify: `src/options-bar.ts`
- Modify: `src/style.css`
- Modify: `tests/ui-layout.test.mjs`

**Interfaces:**
- Produces `CropRect`, `CropRatio`, `beginCrop`, `previewCrop`, `resetCrop`, `applyCrop`, `cancelCrop`, `getCropSession`, and Crop tool ID `crop` shortcut `c`.

- [ ] **Step 1: Write failing crop tests**

Cover initial bounds, free and preset ratios, handle constraints, 1×1/4096×4096 validation, coordinate translation, exact undo, Reset, Enter Apply, Escape Cancel, and retained layer transform/bitmap identity.

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/crop-session.test.ts`.

- [ ] **Step 3: Implement crop session and tool**

Use ratios `free`, `original`, `1:1`, `4:5`, `16:9`, `9:16`, plus validated custom numerator/denominator. Apply subtracts crop `x/y` from every layer center and pushes one `cmdCropDocument`.

- [ ] **Step 4: Render crop overlay and contextual controls**

Draw excluded shading, crop border/handles, and rule-of-thirds lines at constant screen size. Add ratio, dimensions, Reset, Apply, Cancel using native SVG icons and accessible state.

- [ ] **Step 5: Verify and commit**

Run core/UI/build checks. Commit: `feat: add non-destructive document crop`.

### Task 8: Documentation, Responsive Polish, and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/design.md`
- Modify: `docs/examples.md`
- Modify: `tests/documentation.test.mjs`
- Modify: `index.html`
- Modify: `src/style.css`
- Test: `tests/document-model.test.ts`
- Test: `tests/transform-geometry.test.ts`
- Test: `tests/editor-commands.test.ts`
- Test: `tests/transform-session.test.ts`
- Test: `tests/snap-engine.test.ts`
- Test: `tests/crop-session.test.ts`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Produces user/contributor documentation and complete acceptance evidence.

- [ ] **Step 1: Add failing documentation contracts**

Require Move transform controls, `Ctrl+T`, Crop `C`, Enter/Escape, Shift/Ctrl modifiers, smart guides, version 2 migration, affine fields, non-destructive crop, and the explicit future roadmap.

- [ ] **Step 2: Verify RED**

Run `npm.cmd run test:docs`.

- [ ] **Step 3: Update public documentation**

Document the workflow for newcomers and Photoshop users; explain version 1 compatibility; update architecture/data flow; preserve cautious claims and security guidance.

- [ ] **Step 4: Run complete automated verification**

```powershell
npm.cmd run test:core
npm.cmd run test:ui
npm.cmd run test:docs
npm.cmd run build
git diff --check
```

Expected: zero failures, clean build, no whitespace errors.

- [ ] **Step 5: Run browser acceptance matrix**

Verify image and text layers at 25%, 100%, and 400%; direct/explicit transforms; Shift/Ctrl modifiers; pointercancel; crop presets/custom ratio; compact width; v1 open/v2 save; autosave restore; PNG parity; and overlays absent from export.

- [ ] **Step 6: Review scope and commit**

Confirm no groups/masks/rulers/skew/warp/destructive crop/per-layer crop entered the diff. Commit: `docs: document professional core editing workflow`.

- [ ] **Step 7: Final review gate**

Request code review against the approved spec, fix every Critical/Important issue, rerun the entire suite, and only then integrate into `main`.
