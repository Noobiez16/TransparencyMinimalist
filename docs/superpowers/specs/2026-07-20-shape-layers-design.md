# Photoshop Workspace Replication — Phase D1: Shape Layers — Design

**Date:** 2026-07-20
**Status:** Approved
**Roadmap:** Phase D of the six-phase program in
`docs/superpowers/specs/2026-07-17-photoshop-workspace-shell-design.md`.
**Goal:** Vector shape layers — Rectangle, Ellipse, Line, and Polygon tools producing
resolution-independent layers with editable fill, stroke, and geometry parameters.

## Scope decomposition

Phase D as scoped in the roadmap ("vector shape tools, pen paths, Paths panel, type expansion")
is three subsystems, together comparable in size to Phases A, B, and C combined. It is split
into three sub-projects, each with its own spec, plan, and execution cycle:

- **D1 — Shape layers (this spec).** The vector layer kind, geometry model, four shape tools,
  fill/stroke, and Rasterize Shape.
- **D2 — Pen tool & Paths panel.** Bézier pen, anchor and handle editing, path storage, and the
  grayed Paths dock tab. Builds on D1's geometry model.
- **D3 — Type expansion.** On-canvas Type tool, live text editing, alignment/leading/tracking,
  Rasterize Type (already promised by name in the Phase B/C refusal toast), and Convert to
  Shape (which depends on D1).

## Owner decisions (validated)

- **Tools:** Rectangle (`U`) with Ellipse, Line, and Polygon nested in its flyout. Custom Shape
  stays grayed — it needs a preset shape library.
- **Editability:** shape layers stay vector permanently. Fill, stroke, stroke width, corner
  radius, and polygon sides remain editable after creation, alongside the existing transform.
  Anchor-point editing belongs to D2.
- **Appearance:** fill colour (or none), stroke colour (or none), stroke width in document pixels.
  Dash patterns, caps, and joins are out of scope.
- **Representation:** parametric layer plus a pure command-list geometry module (chosen over
  rasterizing at draw time and over per-shape SVG overlay elements).
- **Rasterize Shape** is included, so shape layers are not a dead end for painting.

## Architecture

### Data model

`ShapeLayer` joins `ImageLayer` and `TextLayer` in the `Layer` union:

```ts
export type ShapeSpec =
  | { kind: 'rect'; w: number; h: number; radius: number }
  | { kind: 'ellipse'; rx: number; ry: number }
  | { kind: 'line'; dx: number; dy: number }
  | { kind: 'polygon'; radius: number; sides: number };

export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeSpec;
  fill: string | null;      // null = no fill
  stroke: string | null;    // null = no stroke
  strokeWidth: number;      // document pixels
}
```

### `src/engine/shape-geometry.ts` — the pure core

- `shapeCommands(shape: ShapeSpec): PathCommand[]` — drawing commands
  (`{op:'moveTo'|'lineTo'|'arcTo'|'ellipse'|'close', …}`) in the layer's **local space**, centred
  on the origin exactly as text layers are.
- `shapeNaturalSize(shape: ShapeSpec): Size` — bounding size derived from the parameters.
- `constrainShapeDrag(start, current, kind, shift, alt): { origin, size }` — Shift constrains a
  rectangle to a square, an ellipse to a circle, and a line to 15° increments; Alt draws from the
  centre; both combine.
- `clampShape(shape: ShapeSpec): ShapeSpec` — sides 3–24, corner radius ≤ half the shorter side,
  all dimensions non-negative.

These are plain data structures rather than `Path2D` objects specifically so they are fully
unit-testable in node, matching the pure-core discipline of Phases B and C.

**Why this keeps the integration small:** `layerNaturalSize()` gains a shape branch, and from
there Free Transform, smart-snapping guides, crop, the transform-session guard, and hit-testing
all work unchanged, because each already routes through natural size plus the layer affine.

### Rendering

`drawLayer` in `src/engine/compositor.ts` gains a `kind === 'shape'` branch that replays the
command list into the context inside the existing transform, filling then stroking. Screen
preview and PNG export share this function, so export parity is automatic. Stroke width is in
document pixels and therefore scales with the layer, consistent with the rest of the app.

### Tools

`src/tools/shape-tools.ts` registers `shape-rect`, `shape-ellipse`, `shape-line`, and
`shape-polygon`, sharing `src/tools/shape-shared.ts` for the drag lifecycle — press to anchor,
drag to size with a live dashed preview drawn through the same overlay hook the marquee preview
uses, release to commit. Sub-pixel drags commit nothing.

Creation takes fill from the foreground chip and stroke from the background chip, so Phase A's
`D` and `X` are immediately meaningful, and pushes one history command (`Add rectangle`,
`Add ellipse`, `Add line`, `Add polygon`) through the existing `cmdAddLayer` path, so the Layers
panel, autosave, and undo behave exactly as they do for image and text layers.

`toolbar-groups.ts`: the Drawing group's Rectangle stub becomes the four live tools; Pen stays
grayed for D2, Custom Shape is not listed.

### Options bar and Properties

Options expose Fill, Stroke, and Stroke Width for every shape, plus Radius (rectangle) and Sides
(polygon); Line exposes width only, since a line without a stroke would be invisible. The
Properties panel gains the same controls for a selected shape layer, written through coalesced
`cmdPatchLayer` calls exactly like the existing text properties, so dragging a radius slider is
one undo step.

### Rasterize Shape

`Layer > Rasterize > Shape` replays the command list into a new bitmap at the layer's current
rendered size, swaps the layer to `kind: 'image'`, and pushes one undoable command. Without it,
shape layers could never be painted, cleared, or filled.

## Integration

- `cloneLayer` gains a shape branch so `Ctrl+J` duplicates shapes correctly.
- Layers-panel thumbnails render through the same command list.
- Painting, Clear, and Fill refuse on shape layers with a toast naming Rasterize Shape.
- Serialization is additive plain JSON. **The file version stays at 2**: the document model —
  affine fields and their migration semantics — is unchanged, and a new layer kind adds data
  without altering how existing data is read.
- Selection clipping does not apply to vector shapes; it governs painted pixels only.

## Error handling

- Sub-pixel drags commit no layer.
- Sides clamp to 3–24, corner radius to half the shorter side, stroke width to 0–100.
- Clearing both fill and stroke is allowed (Photoshop permits it); the layer still selects and
  transforms by its bounds.
- Shape tools are inert while a stroke, transform, or crop session is live
  (`isEditingSessionLive()`).
- Rasterize Shape on a non-shape layer refuses with a toast.

## Testing

- **Vitest (pure core):** command lists per shape kind (rectangle with and without corner radius,
  ellipse, line, polygon vertex count and positions); `shapeNaturalSize`; `constrainShapeDrag`
  for Shift, Alt, and both, against hand-computed geometry; `clampShape` bounds; `cloneLayer` for
  shapes; the rasterize command's do/undo.
- **Contracts (`test:ui`):** live `tool: 'shape-*'` entries in the Drawing group; options
  descriptors; the Properties shape section; the Rasterize Shape command and menu item.
- **Live verification (pixel evidence):** each shape's fill colour at its centre and stroke
  colour on its edge; Shift producing an exactly square bounding box; Alt drawing from the
  centre; a shape scaled to 400% still showing a hard-edged colour transition (proving it stayed
  vector rather than rasterizing); undo/redo of creation and property edits; Rasterize Shape
  producing a paintable image layer; `Ctrl+J` duplicating a shape; a save/open round-trip
  preserving parameters.

## Out of scope (D1)

Pen tool, anchor and handle editing, and the Paths panel (D2); type work (D3); Custom Shape
library; dash patterns, line caps, and corner joins; boolean path operations (unite, subtract,
intersect); shape-layer masks; gradient or pattern fills.
