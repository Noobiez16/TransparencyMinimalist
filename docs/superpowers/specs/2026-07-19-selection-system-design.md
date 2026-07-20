# Photoshop Workspace Replication — Phase C: Selection System — Design

**Date:** 2026-07-19
**Status:** Approved
**Roadmap:** Phase C of the six-phase program in
`docs/superpowers/specs/2026-07-17-photoshop-workspace-shell-design.md`.
**Goal:** Real pixel selections — rectangular and elliptical marquees, freehand and polygonal
lassos, boolean combination, marching-ants feedback, a live Select menu, and selection-constrained
painting, clearing, filling, and cropping.

## Owner decisions (validated)

- **Tools:** Rectangular Marquee (`M`) with Elliptical nested in its flyout; Lasso (`L`) freehand
  with Polygonal nested. Magic Wand, Quick Selection, and Object Selection stay grayed.
- **A selection constrains/enables:** painting clipped to the selection; Clear and Fill of selected
  pixels; Crop to Selection. **Transforming only the selected pixels is out of scope** (it would
  require floating pixels into a temporary layer).
- **Behaviors:** boolean modes (Shift adds, Alt subtracts, Shift+Alt intersects); Select menu
  All / Deselect / Reselect / Inverse; animated marching ants.
- **Edges are hard** — no feathering or anti-aliased selection edges this phase.
- **Representation:** document-space mask canvas with marching-squares contour extraction
  (chosen over a vector path list and over a rect-fast-path hybrid).

## Architecture

### `src/engine/selection.ts` — state as an operation list

The selection is an **ordered list of operations**; the doc-sized mask canvas is a derived cache
re-rasterized whenever the list changes.

```ts
type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';
type SelectionShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; points: Point[] };          // freehand and polygonal lasso
type SelectionOp =
  | { kind: 'shape'; shape: SelectionShape; mode: SelectionMode }
  | { kind: 'all' }
  | { kind: 'invert' };
```

Rasterization folds the list into an empty mask: `all` fills the document; `invert` inverts
coverage; `shape` draws with its mode's composite operation — `new` clears first then
`source-over`, `add` = `source-over`, `subtract` = `destination-out`, `intersect` =
`destination-in`.

**Why an op list rather than mask snapshots:** a 1024×1024 mask snapshot costs ~4 MB, so
undoable selection changes would exhaust the 150 MiB history budget within a dozen operations. An
op list is kilobytes. Each selection change pushes one command holding the before/after arrays
with `bytes` ≈ total points × 16. Rasterization is deterministic, so replaying a list always
reproduces the same mask.

Exports: `hasSelection()`, `getSelectionMask(): HTMLCanvasElement | null`,
`getSelectionBounds(): Rect | null`, `applyOp(op: SelectionOp)`, `selectAll()`, `deselect()`,
`reselect()`, `invertSelection()`, `subscribeSelection(fn)`. Deselect sets an empty list;
`reselect()` restores the last non-empty list.

### Tools

`src/tools/marquee.ts` (rectangular, elliptical) and `src/tools/lasso.ts` (freehand, polygonal),
sharing `src/tools/selection-shared.ts` for the drag lifecycle and modifier reading — the same
pattern `paint-shared.ts` established for the painting tools.

- Marquees drag a live preview shape; commit on release.
- Freehand lasso samples points during the drag and auto-closes on release.
- Polygonal lasso clicks vertices, closes on double-click or `Enter`, cancels on `Escape`.
- Effective mode = the options-bar `select` option (New / Add / Subtract / Intersect) unless
  modifiers override it live: Shift = add, Alt = subtract, Shift+Alt = intersect. The committed
  op records the effective mode so history replays what the user actually did.
- `toolbar-groups.ts`: the Move & Select group's Marquee and Lasso stubs become live entries with
  their nested siblings; Object Selection stays grayed.

### Marching ants

`traceContours(alpha: Uint8Array, width: number, height: number): Point[][]` — marching squares
producing closed polylines. It takes a plain typed array (not a canvas) specifically so it is a
pure, fully unit-testable function. Contours are recomputed only when the selection changes and
cached.

`canvas-overlay.ts` strokes the cached contours with `setLineDash([4, 4])`, drawing a dark line
under a light dashed line so the outline reads on any background. A ~10 fps timer advances
`lineDashOffset` and notifies `'composite'`. The timer runs **only while a selection exists** and
**pauses while a stroke, transform, or crop session is live**, so it never competes with a live
gesture or the `?audit-raf` verification harness.

### Integration

- **Painting** (`src/engine/stroke-session.ts`): when a selection exists, `endStroke` clips the
  stroke canvas before compositing. The mask is document-space and the stroke canvas is
  bitmap-space, so a new pure helper `documentToBitmapMatrix(transform, natural): [a,b,c,d,e,f]`
  (same math as the shipped `documentToBitmap`) sets the transform on a bitmap-space scratch
  canvas; the mask is drawn through it and applied to the stroke canvas with `destination-in`.
  Dirty rect, single-command undo, and byte accounting are unchanged.
- **Edit > Clear** (`Delete`) and **Edit > Fill with Foreground** (`Shift+F5`) operate on the
  active image layer inside the selection using the dirty-rect command pattern: snapshot the
  region, apply, snapshot, push one command. With no selection, Clear refuses with a toast rather
  than wiping the layer.
- **Image > Crop to Selection** feeds `getSelectionBounds()` into the existing crop command path.
- **Select menu**: All (`Ctrl+A`), Deselect (`Ctrl+D`), Reselect (`Shift+Ctrl+D`), Inverse
  (`Shift+Ctrl+I`). Deselect, Reselect, and Inverse are `enabled()`-gated on selection state.

## Error handling

- Zero-area drags (click without movement) commit no op.
- Polygonal lasso with fewer than three vertices cancels silently.
- Shapes clamp to document bounds; ops entirely outside the document produce no change.
- Document resize or crop re-rasterizes the mask at the new size and drops out-of-bounds geometry.
- Selection tools are inert while a stroke, transform, or crop session is live
  (`isEditingSessionLive()`).
- Clear/Fill with no active image layer refuse with a toast.

## Testing

- **Vitest (pure core):** ops-list reducer semantics (new/add/subtract/intersect, deselect,
  reselect, invert); `selectionBounds` per shape kind; mode → composite-operation mapping;
  `documentToBitmapMatrix` against hand-computed matrices; `traceContours` against hand-built
  alpha grids (single square, square with a hole, two disjoint blobs, empty grid).
- **Contracts (`test:ui`):** live `tool: 'marquee' | 'lasso'` entries; Select-menu command
  registrations; the ants-pause rule referencing `isEditingSessionLive`; stroke-session mask
  clipping present.
- **Live verification (pixel evidence):** paint inside a marquee leaves outside pixels
  byte-identical; Shift-add and Alt-subtract produce expected coverage; freehand lasso selects a
  region; Clear zeroes alpha only inside the selection; Inverse flips which side paints; Crop to
  Selection resizes to the bounds; one undo reverts each; marching ants animate and pause during
  a stroke.

**Note on the test split:** vitest runs in node with a stubbed canvas, so mask *rasterization*
cannot be meaningfully unit-tested there. Every piece that can be pure is designed to be pure and
is unit-tested; rasterization fidelity is proven by live pixel checks, as Phase B's strokes were.

## Out of scope (Phase C)

Feathering and anti-aliased selection edges; transforming or moving selected pixels; Magic Wand,
Quick Selection, and Object Selection; saving selections as alpha channels (Phase E); selection
persistence in `.mledit.json`; Refine Edge.
