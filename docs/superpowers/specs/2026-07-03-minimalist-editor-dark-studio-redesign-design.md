# Minimalist Editor — Dark Studio Redesign

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Scope:** UI/UX redesign, interactive canvas, animations, performance, and code restructuring for the layer image editor (`index.html`, `src/main.ts`, `src/style.css`).

## Goal

Transform the current white, hard-edged three-column editor into a dark, professional "studio" tool that a common user finds familiar and pleasant: dark monochrome theme, floating panels, an effect-stack Properties panel, direct manipulation on the canvas, and polished micro-animations — while fixing the full-rebuild rendering bottleneck and splitting the single-file codebase into modules.

The user validated this direction against a reference screenshot of a dark audio editor (rounded panels, white-outlined selections, pill toggles, segmented controls, no color accents) via interactive mockups, and picked: dark studio style → floating panels (no divider lines) → effect-stack Properties layout → fully interactive canvas → perf + code structure optimization.

## 1. Visual System

All colors become CSS custom properties on `:root`:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | Workspace background |
| `--panel` | `#151517` | Floating panels, top bar surfaces |
| `--card` | `#1E1E21` | Control cards, buttons, inputs |
| `--card-hi` | `#26262A` | Hover state, thumbnails |
| `--line` | `#2A2A2E` | Rare hairlines (canvas edge only) |
| `--txt` | `#F2F2F4` | Primary text |
| `--mut` | `#85858D` | Muted labels, secondary text |

- **White is the only accent.** Selection outlines, filled slider tracks, active toggle states, active segmented items, and the Export button are white. The indigo `--accent-color` is removed.
- Radii: 12px panels, 8–10px controls/cards, 999px pills. The global `border-radius: 0 !important` rule is removed.
- Typography: Inter (kept). Section labels are 9–10px uppercase with 0.8px letter-spacing in `--mut`. Numeric readouts use `font-variant-numeric: tabular-nums`.
- Icons: replace emoji glyphs (👁, ❌, ☰, ✕) with inline SVG icons in `currentColor` so they render consistently and inherit hover colors.
- Transparency checkerboard becomes dark (`#121214` / `#1B1B1E` squares) so a transparent canvas doesn't glare in the dark UI. The exported PNG is unaffected (checkerboard is preview-only).

## 2. Layout

Structure (desktop, ≥1024px):

```
┌─────────────────────────────────────────────────────┐
│ Top bar: "Minimalist Editor"   [1024 × 1024 ▾]  [Export] │
├──┬───────────┬──────────────────────┬───────────────┤
│ R │ Layers    │      Canvas          │ Properties    │
│ a │ (floating │  (segmented bg ctrl) │ (floating     │
│ i │  island)  │  [canvas viewport]   │  island)      │
│ l │           │  (zoom pill)         │               │
└──┴───────────┴──────────────────────┴───────────────┘
```

- **Top bar** (full width, `--panel`, no bottom border):
  - Left: app title breadcrumb ("Minimalist Editor").
  - Center: **canvas-size chip** showing current dimensions (e.g. `1024 × 1024`). Clicking opens a dropdown with the four presets (1:1, 16:9, 9:16, 4:5) plus Custom with width/height number inputs. This replaces the "Canvas & Export Settings" section in the Properties panel.
  - Right: white **Export** button (moves out of the Properties panel).
- **Icon rail** (left edge, 44–48px wide, `--panel`): four icon buttons — toggle Layers panel, Add Image layer, Add Text layer, toggle Properties panel. Toggling a panel animates it out and gives the canvas the space. Active/pressed rail buttons get the `--card-hi` background treatment.
- **Floating panels**: Layers (left, ~250px) and Properties (right, ~280px) are rounded 12px islands with ~10px gaps from the rail, top bar, and window edges, with a soft drop shadow. **No divider lines between chrome regions anywhere.**
- **Canvas area**: background segmented control (Transparent / White / Black / Custom + color swatch) floats above the viewport; the viewport is a rounded rectangle with a deep shadow; a zoom pill (`− 100% +`) floats below it.
- **Responsive** (<1024px): panels stack vertically as full-width rounded cards (top bar → canvas → layers → properties); icon rail becomes a horizontal strip under the top bar. Same behavior as today's stacked layout, restyled.

## 3. Layers Panel

Content and behavior largely as today, restyled:

- "+ Image" and "+ Text" as two dark card buttons.
- Drop zone: dashed rounded rectangle; on dragover the dash brightens to white and background lightens.
- Layer cards: rounded `--card` rows with a 26px thumbnail (image preview or T/IMG glyph on dark checkerboard), name, and SVG eye/delete icons. The **active layer has a 1.5px white outline** (matching the reference's selected-clip look). Hover slides the card 2px right and lightens it.
- Drag-to-reorder is kept; while dragging, the dragged card lifts (scale + shadow) and a white insertion line shows the drop position.
- Layer visibility toggle switches the eye icon to a slashed-eye (not ❌) and dims the card to 50% opacity.

## 4. Properties Panel (Effect Stack)

Panel header: "Properties" with the **active layer's name** as a muted subtitle. When no layer is selected, the panel shows a centered muted empty state ("Select a layer to edit").

Panel body, top to bottom:

1. **Opacity** — slider row (label + numeric value chip + white-filled track).
2. **Blend** — segmented control: `Normal | Multiply | More ▾`. "More ▾" opens a small dark dropdown with Screen, Overlay, Darken, Lighten. The selected mode always shows in the segmented control (it swaps into the second slot when a dropdown mode is chosen).
3. **Transform** (always visible; core, not an "effect") — Position X, Position Y, Scale sliders with value chips.
4. **Active Effects** — one card row per effect: icon + name + pill toggle.
   - Image layers: Blur, Brightness, Contrast, Saturation, Invert.
   - Text layers: Blur, Invert.
   - Toggling ON animates the row open (height + opacity) to reveal the effect's slider; toggling OFF collapses it.
   - Each effect gets an explicit `enabled` flag in `LayerState` alongside its value. Rendering (preview and export) applies the value only when enabled; disabled renders neutral (blur 0, filters 100%, no invert). Toggling OFF keeps the value in state, so toggling back ON restores it. First-time ON uses a starting value that visibly does something (Blur 4px; Brightness/Contrast/Saturation stay at 100% but the row opens for adjustment). Invert has no slider; its toggle is the value.
5. **Text** section (text layers only): content textarea, font family select (dark styled), font size slider, text color swatch. The default placeholder text becomes "Edit me" (dropping the confusing "Double click properties to edit text").
6. **Layer name** moves into an inline-editable title: clicking the layer name in the panel header (or double-clicking the layer card) turns it into a text input.

Slider behavior everywhere:

- **Value chips are clickable**: click → becomes a number input, type exact value, Enter/blur commits, Escape cancels. Values clamp to the slider's range.
- **Double-click the track resets** the property to its default (opacity 100, offsets 0, scale 100, blur 0, filters 100).
- Knob grows ~1.3× with a soft white halo on hover/drag.

## 5. Interactive Canvas

Direct manipulation writes to the **same state** the sliders write to; export math is unchanged.

- **Select**: clicking a layer's preview element selects it (updates `activeLayerId`, syncs both panels). Clicking empty canvas deselects. The selected layer gets a subtle white bounding outline on the canvas.
- **Move**: dragging a layer updates `xOffset`/`yOffset` (converting pixel delta to the existing percentage units using the viewport's rendered size). The Properties sliders and value chips follow live. Layer preview elements get `pointer-events: auto` and `cursor: grab/grabbing`; text selection is suppressed during drag.
- **Zoom** (preview-only, never affects export):
  - Zoom pill under the canvas: `−` / percentage readout / `+` in 10% steps, range 25%–400%.
  - Ctrl+scroll (and pinch) over the canvas zooms toward the cursor.
  - Clicking the percentage readout resets to fit (100%).
  - Implemented as a scale transform on a wrapper around the viewport; at >100% the canvas area allows panning by dragging empty workspace space.
- Hidden layers are not clickable; hit-testing follows visual stacking order (topmost wins).

## 6. Animations

All CSS transitions/keyframes — no animation library. Standard timing: 150–250ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` for movement, `ease` for color/opacity.

- Slider knob hover/drag: scale 1.3 + `0 0 0 5px rgba(255,255,255,.12)` halo.
- Pill toggles: knob slides with a spring-ish cubic-bezier; track cross-fades dark→white.
- Effect rows: expand/collapse via animated `grid-template-rows: 0fr → 1fr` (height + opacity).
- Layer cards: hover slide + lighten; selection outline fades in; newly added cards animate in (fade + slight rise); deleted cards animate out before removal.
- Panels: slide + fade in on first load (staggered ~80ms); slide out/in when toggled from the rail.
- Buttons: `scale(0.97)` press feedback; Export button lifts 1px with a soft glow on hover.
- Drop zone: white dash + glow pulse on dragover.
- Canvas viewport: brief soft white outline flash when a new layer is added.
- **Toasts**: all `alert()` calls (file read errors, "add a layer to export") become a small dark toast card that slides up from the bottom-center and auto-dismisses after ~3s.
- All motion is wrapped so `@media (prefers-reduced-motion: reduce)` disables transitions and animations.

## 7. Code Structure & Performance

### Modules

`src/main.ts` (~780 lines) splits into focused modules; `main.ts` becomes the entry point that wires them:

| File | Responsibility |
|---|---|
| `src/state.ts` | `LayerState`/`AppState` types, state object, layer factory, active-layer helpers, subscribe/notify |
| `src/layers-panel.ts` | Layer list rendering, selection, visibility/delete, drag-to-reorder, add-layer buttons, upload/paste/drop handling |
| `src/properties-panel.ts` | Effect-stack panel rendering and all property inputs, value chips, resets |
| `src/canvas.ts` | Viewport layer rendering, drag-to-move, click-to-select, zoom, background controls |
| `src/export.ts` | Canvas export (image pre-loading, draw, download) — logic unchanged |
| `src/toast.ts` | Toast notifications |
| `src/topbar.ts` | Size chip + dimensions dropdown, Export button hookup |

Each module exposes an `init()` and communicates through the state module's subscribe/notify (a minimal observer — no framework).

### Performance

- **Kill the full-rebuild pattern**: today `updateUI()` clears `layersListContainer.innerHTML` and rebuilds every card on every slider `input` event. Replace with keyed reconciliation: layer cards are created/removed only when layers are added/removed/reordered; property changes update only the affected card's changed fields and the affected canvas element's styles.
- **rAF batching**: state changes mark dirty flags; a single `requestAnimationFrame` callback flushes DOM writes once per frame (matters for slider scrubbing and canvas dragging).
- Canvas preview elements are already reconciled in place — keep that, extend it with the dirty-flag flush.
- No change to export performance (one-shot operation, already fine).

## 8. Error Handling

- `FileReader` errors, image decode failures, and export-with-no-layers all surface as toasts.
- Non-image files dropped/pasted are ignored with an informational toast ("Only image files are supported").
- Numeric chip input: non-numeric input reverts to the previous value; out-of-range clamps.
- If an image layer's `imageSrc` fails to load during export, that layer is skipped (current behavior) — but now a toast reports "1 layer could not be rendered."

## 9. Out of Scope (this round)

- Undo/redo, project save/load, layer rotation, per-layer crop, layer duplication.
- Touch-optimized mobile editing (the stacked layout must remain usable, but touch drag-on-canvas is best-effort).
- Test framework introduction.

## 10. Verification

No automated tests exist in the project; verification is manual against this checklist on the running dev server:

1. Every property control (all sliders, chips, toggles, segmented controls, selects) updates the preview live and round-trips through layer switching.
2. Effect toggles: OFF renders neutral, ON restores the remembered value; collapse/expand animations run.
3. Canvas: click-select matches stacking order, drag matches slider units, zoom in/out/fit works, Ctrl+scroll zooms toward cursor, export output is pixel-identical in framing to the pre-redesign export for the same state.
4. Export correctness on all four backgrounds and all four presets + custom dims.
5. Layer operations: add, delete, reorder (drag), rename, visibility — with animations.
6. Mobile (<1024px) stacked layout is fully usable.
7. `prefers-reduced-motion: reduce` disables motion.
8. No console errors; slider scrubbing stays smooth with 10+ layers (rAF batching verified via Performance panel spot-check).
