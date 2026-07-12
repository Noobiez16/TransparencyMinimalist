# Professional Core Editing Workflow Design

**Date:** 2026-07-12

**Status:** Approved design

**Audience:** Product, design, and engineering contributors

## Purpose

Advance Transparency from a visually Photoshop-inspired editor into a professionally usable canvas workspace while preserving the approved balanced spatial-glass design. This tranche focuses on the most important direct-editing gap: precise on-canvas transformation, non-destructive document cropping, and intelligent alignment.

The workflow must feel familiar to Photoshop users without requiring newcomers to know Photoshop conventions in advance. Professional layer organization and broader productivity features remain planned upgrades with explicit extension points, not part of this implementation.

## Approved Product Direction

The selected visual direction is **Option A: Contextual Photoshop**:

- direct transform controls appear on the canvas;
- the contextual options bar exposes fast numeric editing and mode-specific actions;
- the Properties dock retains the full selected-layer controls;
- the current rail, canvas workspace, right dock, status bar, and balanced spatial-glass surfaces remain recognizable;
- all new controls use Transparency's existing inline SVG icon system rather than text glyphs, emoji, raster icons, or an external icon library.

The feature is a balanced professional foundation. It includes transform, crop, snapping, guides, and numeric controls. It does not include multi-layer selection, masks, groups, persistent rulers, skew, perspective, or warp.

## Users and Success Criteria

### Newcomers

New users should be able to select a layer and discover resize/rotate handles immediately. Labels, tooltips, status hints, constrained defaults, visible Apply/Cancel actions, and reversible history must make experimentation safe.

### Photoshop users

Experienced users should recognize contextual transform controls, `Ctrl/Cmd+T`, Enter to apply, Escape to cancel, linked proportions, rotation fields, smart guides, modifier constraints, crop ratios, and one-step undo behavior.

### Product success

The editor succeeds when direct manipulation feels accurate at every zoom, preview matches export, old projects retain their appearance, each gesture has predictable history semantics, and the approved spatial-glass workspace remains easy to scan.

## Scope

### Included

- on-canvas transform box with eight resize handles and a rotation handle;
- linked-proportion corner scaling and independent side-handle scaling;
- rotation with 15-degree `Shift` constraints;
- visible-by-default transform controls with a Move-tool visibility toggle;
- hybrid direct manipulation and explicit Free Transform sessions;
- numeric X, Y, W, H, linked proportions, and rotation controls;
- smart snapping to document and visible-layer geometry;
- temporary alignment guides and distance labels;
- non-destructive document Crop tool with free/custom/preset ratios;
- rule-of-thirds crop overlay, reset, Apply, Cancel, Enter, and Escape;
- version 1 project migration to a version 2 affine layer model;
- original inline SVG icons and responsive contextual controls;
- focused automated tests for geometry, sessions, commands, migration, and UI contracts.

### Deferred roadmap

1. Layer groups, locking, duplication, masks, clipping, multi-selection, and layer context menus.
2. Application menus, command search, richer shortcuts, navigator, persistent rulers/guides, and workspace productivity controls.
3. Skew, perspective, warp, destructive crop, and per-layer crop.

### Excluded

- changes to the spatial-glass visual identity;
- a new UI framework or server-side editor dependency;
- destructive bitmap editing;
- selection marquees or pixel selections;
- multi-document behavior beyond the existing visual tab;
- persistent transform/crop session state inside project files.

## Architecture

The existing Canvas 2D compositor, document state, command/history system, tool registry, persistence layer, rail, options bar, and dock modules remain the foundation. New behavior is split into focused units with explicit interfaces.

### `src/engine/transform-geometry.ts`

Owns pure affine geometry:

- local-to-document and document-to-local point conversion;
- rotated layer corners and quadrilateral bounds;
- axis-aligned display bounds;
- transform handle positions and handle hit testing;
- proportional and independent-axis scaling calculations;
- rotation normalization and constrained angles;
- inverse-transformed layer hit testing.

No DOM, history, or UI state belongs in this module.

### `src/engine/snap-engine.ts`

Builds snap candidates from canvas edges/centers and visible-layer edges/centers. It accepts the active gesture geometry, zoom-derived threshold, and modifier state, then returns corrected geometry plus transient guide/measurement descriptors.

Candidates are cached for one gesture. The threshold is expressed in screen pixels and converted to document units, so snapping feels consistent at 25%, 100%, and 400% zoom.

### `src/engine/transform-session.ts`

Owns the active transform transaction:

- starting snapshot;
- live preview transform;
- active handle/gesture;
- linked-proportion and modifier state;
- direct versus explicit session mode;
- Apply, Cancel, pointer completion, and pointer interruption;
- one-command commit semantics.

The Move tool delegates transform gestures to this session instead of absorbing geometry and transaction logic.

### `src/engine/crop-session.ts`

Owns the crop rectangle, ratio constraint, starting document geometry, crop overlay data, validation, reset, Apply, and Cancel. Applying produces a reversible document crop command; the session does not destructively alter layer content.

### `src/canvas-overlay.ts`

Draws non-exported interaction visuals through the editor canvas overlay path:

- selected-layer transform box;
- eight resize handles and rotation handle;
- smart guides and distance labels;
- crop exclusion shading and rule-of-thirds grid;
- invalid/disabled states when required.

Overlay marks retain constant screen size and larger invisible pointer hit targets. The module consumes geometry/session descriptors and does not own document mutations.

### `src/tools/crop.ts`

Registers the Crop tool with shortcut `C`, original inline SVG icon, contextual options, and pointer routing into `crop-session.ts`.

### Existing modules

- `src/tools/move.ts` keeps selection and movement, delegating resize/rotate gestures to the transform session.
- `src/engine/compositor.ts` applies translation, rotation, and independent X/Y scale for preview and export.
- `src/engine/document.ts` defines the affine layer fields and shared geometry-facing types.
- `src/engine/commands.ts` adds reversible transform and crop commands.
- `src/engine/persistence.ts` migrates version 1 and serializes version 2.
- `src/options-bar.ts` renders the approved contextual control groups and session actions.
- `src/properties-panel.ts` replaces the single scale control with linked affine transform controls while retaining other properties/effects.
- `src/canvas.ts` coordinates pointer capture, zoom conversion, preview invalidation, and overlay rendering.
- `src/dom.ts` supplies all new inline SVG icons.

## Layer Transform Model

Project format version 2 replaces the uniform layer `scale` field with:

```ts
interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}
```

`x` and `y` remain the layer center in document pixels. `scaleX` and `scaleY` are percentages. Rotation is stored in degrees and normalized consistently for display and comparison.

New layers start with `scaleX: 100`, `scaleY: 100`, and `rotation: 0`. Image placement applies the same cover-fit value to both scale axes. Proportions are linked by default in the UI but can be unlinked for independent resizing.

Geometry, hit testing, snapping, selection outlines, thumbnails, interactive preview, and export all consume these fields through shared helpers rather than duplicating transform math.

## Project Compatibility

Loading a version 1 project maps each layer as follows:

```ts
scaleX = scale
scaleY = scale
rotation = 0
```

The legacy field is not retained when the project is next saved. Saving and autosaving write a version 2 envelope. Unsupported future versions remain rejected. Migration must preserve the exact visible composition of every valid version 1 project.

Transform controls, crop previews, smart guides, session snapshots, snapping state, and Show Transform Controls are workspace-only and are never serialized.

## Transform Experience

### Default Move-tool behavior

Selecting a visible layer shows transform controls by default. The Move options include Auto-select, Show Transform Controls, X, Y, W, H, linked proportions, rotation, snapping, and alignment actions.

- Drag inside the box to move.
- Drag a corner to scale proportionally.
- Drag a side handle to scale one axis.
- Drag the rotation handle to rotate freely.
- Hold `Shift` to constrain movement, maintain proportions when appropriate, or snap rotation to 15-degree increments.
- Hold `Ctrl/Cmd` to bypass snapping temporarily.

A direct gesture previews continuously and commits one history command on pointer release. Pointer cancellation or lost capture restores the starting snapshot.

### Explicit Free Transform

`Ctrl/Cmd+T` begins an explicit session for the active layer. Multiple pointer and numeric changes remain one transaction.

- Apply button or Enter commits one `Transform layer` command.
- Cancel button or Escape restores the complete starting transform.
- Project/tool/layer actions that would abandon the session present an in-workspace Apply/Cancel choice.
- Starting without an active layer produces a concise toast and no state change.

### Numeric controls

Top-bar X/Y/W/H/rotation controls support precise entry. W and H reflect transformed unrotated layer dimensions rather than the rotated axis-aligned envelope. Linked proportions update the opposite dimension. Inputs validate while editing and clamp only on commit, preserving keyboard focus and partially typed values.

The Properties dock exposes the same transform values as the persistent detailed location. Both surfaces consume and update the same session/model state.

## Smart Snapping and Guides

Snapping considers:

- document left, horizontal center, and right;
- document top, vertical center, and bottom;
- visible non-active layer left/center/right and top/center/bottom anchors.

Hidden, empty, invalid, and active layers are excluded as candidates. Guides appear only when an active correction or useful equal-distance relationship exists. They use the established accent family, high-contrast labels, and a neutral outline so meaning never depends on color alone.

The snap result is deterministic when candidates tie: document center, document edges, nearer visible-layer candidates, then stable layer order. `Ctrl/Cmd` bypasses correction and guide output for the current pointer update.

Smart guides are overlay-only and never enter the document, history, autosave, project file, thumbnail, or PNG export.

## Crop Experience

The Crop tool affects the document canvas, not an individual layer. It begins with the current document bounds and offers:

- Free;
- Original Ratio;
- 1:1;
- 4:5;
- 16:9;
- 9:16;
- custom ratio entry.

The options bar shows ratio controls, crop dimensions, overlay choice, Reset, Apply, and Cancel. The first implementation uses the approved rule-of-thirds overlay.

The crop rectangle shades excluded canvas regions and retains constant-size handles. Applying crop updates the document width/height and subtracts the crop origin from every layer position. Bitmaps, text, transform values, and pixels outside the new canvas remain intact. Undo restores the previous canvas and every layer position exactly.

Crop validation blocks dimensions below 1×1 or above the existing 4096×4096 limit. Enter applies a valid crop; Escape cancels.

## Commands and History

### Transform command

One transform command stores the layer ID and complete before/after `LayerTransform`. `do()` and `undo()` apply all five values together and notify `layerProps` plus `composite`.

Direct gestures produce one command each. Explicit sessions produce one command regardless of the number of previews. Numeric edits outside an explicit session reuse the existing 800 ms coalescing behavior with stable per-layer/per-field keys.

### Crop command

One crop command stores:

- previous and next document dimensions;
- crop-origin offset;
- previous and next positions for every layer.

`do()` and `undo()` update canvas configuration, layer positions, and composite state as one history action. The command retains no duplicate bitmap data.

### Preview discipline

Session previews may update live model values for rendering, but they never push history or trigger autosave until committed. Cancel restores the captured snapshot and emits the required refresh notifications.

## Visual and Responsive Design

The approved balanced spatial-glass tokens, surface hierarchy, corner language, shadows, dock arrangement, and canvas focus remain unchanged.

New contextual controls use compact grouped fields with clear labels. At widths of 1023px and below, groups wrap into readable rows; essential Apply/Cancel, mode, and dimension controls are not silently hidden or compressed below usable sizes.

All new icons extend `src/dom.ts` with project-native inline SVG. Buttons use visible tooltips, accessible names, pressed/selected states, and established focus treatment. No icon font, emoji, raster asset, or remote icon dependency is introduced.

Transform handles use a light interior, dark outline, and larger transparent pointer targets. Smart guides pair stroke color with labels. Crop shading preserves enough contrast to identify both retained and excluded regions. Nonessential transitions respect `prefers-reduced-motion`.

The status bar describes the active mode and essential modifiers using concise contextual text.

## Safeguards and Failure Handling

- Missing active layer: Free Transform shows a toast and does not start.
- Hidden or zero-sized layer: transform handles and snap candidates are suppressed safely.
- Pointer cancellation/lost capture: restore the active gesture snapshot.
- Escape: cancel only the current gesture or explicit session.
- Invalid numeric entry: keep the field editable, show inline invalid state, and block Apply.
- Invalid crop dimensions: block Apply and preserve the preview.
- Tool/layer/project action during an explicit session: request Apply or Cancel in the workspace.
- Unsupported project version: preserve the existing rejection behavior.
- Missing image bitmap: geometry and export remain safe without inventing dimensions.
- Performance pressure: cache gesture snap candidates, batch previews through `requestAnimationFrame`, and avoid rebuilding unaffected panels.

## Accessibility

- Every new action is keyboard reachable.
- Buttons expose accessible labels and pressed/selected state.
- Original SVG icons are decorative when accompanied by labels and hidden from assistive technology where appropriate.
- Tooltips supplement rather than replace accessible names.
- Handle pointer targets support mouse, pen, and touch without enlarging the visible mark.
- Guide meaning is communicated through position and labels, not color alone.
- Focus remains stable during numeric validation and responsive wrapping.
- Mode/status text communicates Apply/Cancel and modifier behavior.

## Testing Strategy

A focused TypeScript unit-test layer covers behavior that source-pattern tests cannot prove.

Vitest is added as a development-only test runner so the pure TypeScript geometry, snapping, session, command, and migration modules execute through the project's existing Vite toolchain. The current dependency-free Node UI/documentation contracts remain in place and continue to run separately.

### Geometry

- rotated corners at representative angles;
- local/document inverse conversions;
- rotated-layer hit testing;
- handle positions and hit targets;
- linked corner scaling and independent side scaling;
- negative-direction drags and minimum usable dimensions;
- degree normalization and 15-degree constraints.

### Snapping

- document and visible-layer candidates;
- hidden/empty/active layer exclusions;
- deterministic ties;
- screen-pixel threshold equivalence at 25%, 100%, and 400%;
- modifier bypass;
- guide and distance descriptor output.

### Sessions and commands

- one history entry per direct gesture;
- one history entry per explicit session;
- exact Cancel restoration;
- pointer cancellation restoration;
- transform undo/redo;
- crop coordinate translation and exact undo;
- numeric coalescing.

### Persistence and rendering

- version 1 migration preserves appearance;
- version 2 round trip;
- rejection of unsupported future versions;
- preview/export parity for rotation and independent scale;
- overlays absent from export.

### UI contracts

- Crop tool and shortcut registration;
- original SVG icon entries;
- contextual controls and Apply/Cancel actions;
- accessible names and pressed states;
- unique DOM IDs;
- compact wrapping, fallback glass, and reduced-motion rules;
- no regression to existing workspace regions or panel toggles.

Existing UI tests, documentation tests, strict TypeScript checks, and Vite production build remain mandatory. Browser acceptance covers mouse, pen-compatible pointer events, keyboard-only operation, pointer cancellation, compact layout, image/text layers, multiple zoom levels, project migration, export, save/open, and autosave restore.

## Acceptance Criteria

- Selecting a layer shows usable transform controls by default.
- Move, resize, and rotate remain accurate under pan and all supported zoom levels.
- Direct and explicit transforms follow the approved commit/cancel semantics.
- Each completed gesture/session produces exactly one appropriate history action.
- Cancel and undo restore exact state.
- Smart guides use constant screen behavior and never appear in exported PNGs.
- Crop preserves out-of-canvas layer content and fully undoes.
- Version 1 projects load with no visible composition change and save as version 2.
- Interactive preview and PNG export match except for editor-only overlays.
- Original SVG icons, spatial-glass styling, docks, panels, and responsive behavior remain coherent.
- Move, Hand, Zoom, history, persistence, autosave, properties, layers, and export continue to pass their existing contracts.
- Deferred roadmap items are not partially implemented in this tranche.

## Implementation Order

The implementation plan should sequence work by dependency:

1. affine model, pure geometry, migration, compositor, and tests;
2. transform command/session semantics and tests;
3. overlay renderer and Move-tool direct controls;
4. contextual numeric controls and explicit Free Transform;
5. snap engine and guide rendering;
6. crop session, crop command, and Crop tool;
7. responsive polish, accessibility, documentation, and full verification.
