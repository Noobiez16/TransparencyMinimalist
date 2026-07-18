# Photoshop Workspace Replication — Phase B: Color & Painting — Design

**Date:** 2026-07-18
**Status:** Approved
**Roadmap:** Phase B of the six-phase program in
`docs/superpowers/specs/2026-07-17-photoshop-workspace-shell-design.md`.
**Goal:** Real per-pixel painting — Brush, Pencil, Eraser, and Eyedropper tools driven by the
Phase A color system, with budget-respecting single-command undo per stroke.

## Owner decisions (validated)

- **Tools:** Brush (`B`), Pencil (nested in the Brush flyout), Eraser (`E`), Eyedropper (`I`).
  Clone Stamp, Mixer, and Background Eraser stay grayed for a later pass.
- **Paint target policy:** image layers only. Painting on an EMPTY image layer first allocates a
  document-sized transparent bitmap centered at scale 100 (bundled into the same undo command as
  the stroke). Text layers refuse with a toast ("Text layers can't be painted — Rasterize Type
  arrives in Phase D").
- **Options:** Brush/Eraser expose Size (1–500 document px), Hardness (0–100 %), Opacity
  (1–100 %); Pencil exposes Size only; Eyedropper shows the last sampled hex as a display option.
  Per-stroke blend modes and flow are deferred.
- **Approach:** stroke sessions painting in bitmap space with dirty-rect undo (chosen over a CPU
  stamp engine and over direct per-move stamping).

## Architecture

### `src/engine/stroke-session.ts` — the fourth session type

Follows the transform/crop session pattern (module state + subscribe, one command per edit):

- `beginStroke(layerId, config)` where
  `config = { tool: 'brush' | 'pencil' | 'eraser', size, hardness, opacity, color }`.
  Refuses while `isEditingSessionLive()` (transform, crop, or guard). Refuses text layers with
  the toast above. On an empty image layer, allocates a document-sized transparent bitmap
  (natural size = doc size, layer centered at doc center, scale 100) — recorded in the stroke's
  undo command so one undo removes both.
- `addPoint(docPoint)` maps the point through the layer's inverse affine into bitmap space
  (`docToLayerPoint` — new helper in `src/engine/transform-geometry.ts`, inverse of the existing
  quad mapping) and stamps interpolated circles onto a session-owned **stroke canvas** at
  bitmap resolution. Stamp spacing = size/4. Brush stamps are radial gradients whose inner stop
  follows hardness; pencil stamps are plain filled circles (hardness pinned to 100).
- `endStroke()`:
  1. dirty rect = union of stamp bounds, clamped to the bitmap; empty rect → session discards;
  2. snapshot `before = getImageData(rect)` from the layer bitmap;
  3. composite the stroke canvas into the bitmap once — `source-over` with
     `globalAlpha = opacity` for brush/pencil, `destination-out` for eraser;
  4. snapshot `after`; bump `bitmapRev`;
  5. push one command (`Brush stroke` / `Pencil stroke` / `Eraser stroke`) with
     `bytes = rect.w × rect.h × 8`, `do`/`undo` = `putImageData` of after/before (+ bitmap
     de/allocation when the layer was empty), then notify `layerProps` + `composite`.
- `cancelStroke()` (pointercancel/lostpointercapture) discards the stroke canvas, no command.
- `getStrokeSession()` / `subscribeStrokeSession(fn)` for the compositor, options bar, and
  session-status.

### Live preview

While a stroke session is live the compositor overlays the stroke canvas on its layer with the
layer's transform and the stroke's opacity (crop-overlay pattern). Eraser preview renders the
layer through a scratch canvas with the stroke applied `destination-out` so erasing previews
truthfully rather than drawing paint.

### Eyedropper

On click: `renderToCanvas(state.doc)` (the shared export compositor), `getImageData` at the doc
point, `setForeground(hex)`. Transparent samples are ignored. Per Phase A wiring, setting the
foreground also live-updates an active text layer's color — documented behavior, not a bug.

### Tools & UI integration

- `src/tools/brush.ts`, `pencil.ts`, `eraser.ts`, `eyedropper.ts` registered in `main.ts`.
  Painting tools drive the stroke session from `onDown/onMove/onUp/onCancel`; brush color reads
  `getForeground()` at stroke start.
- `src/shell/toolbar-groups.ts`: Painting group → `{ tool: 'brush' }` with Pencil as a nested
  live sibling; Eraser slot live; Measurement group → live Eyedropper. Mixer and Background
  Eraser remain grayed stubs.
- Options via existing `ToolOption` descriptors. `[` / `]` registry commands (`bindKey`) nudge
  the active painting tool's size (no-ops when a non-painting tool is active).
- Status hints: "Brush · Drag to paint · [ ] adjusts size" (same pattern per tool);
  `syncContextStatus` also reports a live stroke ("Painting…").
- **Brush outline cursor** (droppable task, like the pasteboard menu): a circle of the current
  brush size at the pointer, scaled by zoom, drawn in the canvas overlay while a painting tool
  is active.

### Cross-cutting rules

- Mutual exclusion: strokes refuse to start during transform/crop/guard; `isEditingSessionLive()`
  gains the stroke session so history stays frozen mid-stroke; tool switches mid-stroke cancel
  the stroke (pointer routing already delivers `onCancel`).
- Serialization: unchanged — bitmaps already round-trip as data URLs; strokes only bump
  `bitmapRev`. Autosave and project save/open need no changes.
- Layer thumbnails refresh from `bitmapRev` as they already do.

## Error handling

- Stroke on a missing/invisible layer: refused (toast for invisible: "Layer is hidden").
- Points outside the bitmap: stamped positions clamp into the dirty-rect only when they
  intersect the bitmap; strokes entirely outside produce no command.
- Byte budget: a full-bitmap stroke on a 4096×4096 image is ~268 MB of snapshots — over budget;
  `endStroke` caps the dirty rect at the bitmap and relies on the history's existing eviction;
  the command's honest `bytes` value lets the budget logic do its job.
- The rAF-shim harness (`?audit-raf`) remains the verification environment.

## Testing

- **Vitest:** `docToLayerPoint` (identity, translated, scaled, rotated, combined — against
  hand-computed points); dirty-rect union/clamp math; stroke command do/undo round-trip and byte
  accounting with stubbed canvases; empty-layer allocation (bundled undo); config
  validation/refusal paths (text layer, live session).
- **Contracts (`test:ui`):** live `tool: 'brush' | 'pencil' | 'eraser' | 'eyedropper'` entries in
  `toolbar-groups.ts`; stroke-session source participates in session-status; `[`/`]` command
  registrations; painting status hints in `main.ts`.
- **Live verification:** paint red on the fixture → sampled pixels match; single undo restores
  exactly; eraser stroke clears to transparency; 50 % opacity blends over the fixture; painting
  on a rotated+scaled layer lands under the cursor; eyedropper picks the fixture green into the
  foreground chip; stroke refused during Free Transform; history rows inert mid-stroke.

## Out of scope (Phase B)

Clone Stamp / retouching, Mixer brush, per-stroke blend modes, flow, brush presets/libraries,
pressure/tablet input, selection-constrained painting (Phase C), text rasterization (Phase D).
