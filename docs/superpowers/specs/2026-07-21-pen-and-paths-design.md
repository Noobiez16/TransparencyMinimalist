# Photoshop Workspace Replication — Phase D2: Pen Tool & Paths Panel — Design

**Date:** 2026-07-21
**Status:** Approved
**Roadmap:** Sub-project D2 of Phase D, whose three-way split is recorded in
`docs/superpowers/specs/2026-07-20-shape-layers-design.md` (D1 shape layers — shipped 3.5.0;
D2 pen & paths — this spec; D3 type expansion — pending).
**Goal:** A working Bézier Pen tool, anchor and handle editing, and a live Paths panel, with
paths bridging to the shape, selection, and painting engines already shipped.

## Owner decisions (validated)

- **Path model:** paths are stored on the **document** and listed in the Paths panel, independent
  of layers. A Convert to Shape command bridges back to D1, so no separate pen Shape/Path mode
  toggle is needed.
- **Pen drawing:** click places a corner anchor, click-and-drag places a smooth anchor and pulls
  symmetric handles, clicking the first anchor closes the subpath, `Enter` finishes an open path
  and `Escape` discards it. No Freeform or Curvature pen.
- **Editing:** drag anchors and handles; add and delete anchors; convert corner ↔ smooth; move a
  whole subpath.
- **Operations:** Convert to Shape, Load as Selection, Fill Path, Stroke Path, and Make Work Path
  from Selection.

## Architecture

### `src/engine/path-model.ts` — the data

```ts
export interface Anchor {
  x: number; y: number;          // document pixels
  inDx: number; inDy: number;    // incoming handle, RELATIVE to the anchor
  outDx: number; outDy: number;  // outgoing handle, RELATIVE to the anchor
}
export interface SubPath { anchors: Anchor[]; closed: boolean }
export interface PathItem { id: string; name: string; subpaths: SubPath[] }
```

A **corner anchor is one whose handle offsets are all zero** — there is no separate corner/smooth
flag to keep in sync, so conversion is arithmetic rather than a state change. Handles are
relative so moving an anchor carries its handles automatically.

Document storage: `doc.paths: PathItem[]` and `doc.activePathId: string | null`. Paths serialize
as plain JSON; **the project file version stays at 2**, additive exactly as D1's shape layers were.

### `src/engine/path-geometry.ts` — the pure core

- `pathToCommands(subpaths: SubPath[]): PathCommand[]` — emits D1's `PathCommand[]`, extended with
  `bezierCurveTo`. A segment whose adjoining handles are both zero emits `lineTo`, so straight
  runs stay straight.
- `hitTestAnchor(subpaths, point, radius)`, `hitTestHandle(...)`, `hitTestSegment(...)` — return
  indices identifying what was hit; the radius is passed in document units so callers can divide
  by the overlay scale and keep targets grabbable at any zoom.
- `insertAnchorOnSegment(subpaths, hit)` — **De Casteljau split**, so inserting an anchor does not
  change the curve's shape.
- `deleteAnchor`, `setAnchorSmooth`, `setAnchorCorner`, `moveAnchor`, `moveHandle` (mirroring the
  partner handle on smooth anchors), `translateSubPath`, `pathBounds`.

### Rendering — paths are non-printing

Paths draw in `src/canvas-overlay.ts`, **never in the compositor**, so they never appear in a PNG
export. This matches Photoshop: a path is a guide until it is converted, filled, or stroked. Only
the active path is drawn — outline, a square at every anchor, and handle lines with round knobs
for the selected anchor — with all handle sizes divided by the overlay scale.

### Tools

- **Pen (`P`)** replaces its grayed stub in the Drawing group. Click appends a corner anchor;
  click-drag appends a smooth anchor and pulls handles; clicking the first anchor closes the
  subpath; `Enter` finishes, `Escape` discards. A rubber band previews from the last anchor to
  the cursor. With no path present, the first click creates one named **Work Path**.
  Photoshop's default **auto add/delete** applies: clicking a segment inserts an anchor,
  Alt-clicking an anchor deletes it.
- **Direct Selection (`A`)** drags anchors and handles on the active path; dragging one handle of
  a smooth anchor mirrors its partner; **Alt-dragging an anchor converts** corner ↔ smooth.
- **Path Selection** (nested under `A`) drags an entire subpath.

Every drag commits **one** history entry via a coalesce key. All three tools refuse while a
stroke, transform, or crop session is live (`isEditingSessionLive()`).

### Paths panel

Registered through the Phase A dock framework, replacing the grayed `phase: 'D'` stub in stack 3:
a list of paths with the active one highlighted, inline rename (reusing the layers panel's
`inlineEdit`), New / Duplicate / Delete, and a small rendered thumbnail per row built from the
same command list.

### Operations

- **Convert to Shape** — adds a `{ kind: 'path'; subpaths: SubPath[] }` variant to D1's
  `ShapeSpec`, whose `shapeCommands` delegates to `pathToCommands`. The result is an ordinary
  vector shape layer: transformable, editable, rasterizable, with no new rendering code.
- **Load as Selection** — rasterizes the path and feeds it to the Phase C selection as a new op
  kind, so a drawn curve clips painting, Clear, and Fill.
- **Fill Path** / **Stroke Path** — paint the interior or outline onto the active image layer with
  the foreground colour, through Phase C's `selection-edit` dirty-rect command pattern (snapshot,
  apply, snapshot, push once).
- **Make Work Path from Selection** — traces the current selection with Phase C's `traceContours`
  into corner anchors. **Limitation, stated deliberately:** Photoshop fits smooth curves under a
  tolerance setting; this produces corner anchors that can then be smoothed by hand.

## Error handling

- A subpath with fewer than two anchors renders but converts, fills, and strokes to nothing.
- Operations refuse with a toast when there is no active path; Fill and Stroke also refuse when
  there is no active image layer.
- Deleting the active path clears `activePathId`; deleting the last path leaves an empty list.
- Anchors clamp to document bounds. A crop or canvas resize leaves path coordinates untouched,
  matching how layer positions behave.
- Pen, Direct Selection, and Path Selection are inert during a live stroke, transform, or crop.

## Testing

- **Vitest (pure core):** `pathToCommands` for open and closed subpaths and for corner vs smooth
  anchors (straight runs must emit `lineTo`); all three hit-tests including misses;
  `insertAnchorOnSegment` asserting the curve midpoint is unchanged after insertion;
  `deleteAnchor`; corner ↔ smooth conversion; handle mirroring; `translateSubPath`; `pathBounds`.
- **Contracts (`test:ui`):** live `tool: 'pen' | 'direct-select' | 'path-select'` entries; the
  Paths panel registered without a `phase`; each operation's command registration; the compositor
  containing no path-rendering code (paths stay overlay-only).
- **Live verification:** clicked anchors land at the clicked document points; dragging a handle
  visibly bends the outline; an inserted anchor leaves the curve's midpoint unmoved; Alt-drag
  converts a corner to smooth; Path Selection moves every anchor by the same delta; Convert to
  Shape yields a filled shape layer; Load as Selection clips a brush stroke to the curve; Fill and
  Stroke paint one undoable step each; Make Work Path produces anchors tracing the selection;
  drag operations produce exactly one history entry; and **an exported PNG contains no path
  outline**, proving paths are non-printing.

## Out of scope (D2)

Freeform and Curvature pens; boolean path operations (unite, subtract, intersect, exclude); path
alignment and distribution; clipping masks and vector masks; curve fitting with a tolerance
setting when making a work path; type on a path (D3); rubber-band preview options; multiple
selected anchors with marquee selection.
