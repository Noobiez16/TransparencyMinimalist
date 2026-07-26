# Photoshop Workspace Replication — Phase D3a: Type Engine — Design

**Date:** 2026-07-22
**Status:** Approved
**Roadmap:** Sub-project D3a of Phase D, whose three-way split is recorded in
`docs/superpowers/specs/2026-07-20-shape-layers-design.md` (D1 shape layers — shipped 3.5.0;
D2 pen & paths — shipped 3.6.0; D3 type expansion — split again, see below).
**Goal:** A rich-text layer model with styled spans, a pure layout engine (alignment, leading,
tracking), a Type tool, full type properties, Rasterize Type, and Convert to Shape.

## Scope decomposition

D3 as originally scoped — multi-style runs *and* a full custom on-canvas editor — is roughly 18–20
tasks and contains two subsystems with a clean dependency edge. It is split:

- **D3a — Type engine (this spec).** Styled-span text model and migration, pure layout engine,
  rendering, Type tool placement, options bar and Properties, Rasterize Type, Convert to Shape.
- **D3b — On-canvas editor (pending).** Caret rendering and placement, keyboard navigation,
  selection ranges, clipboard, IME via an offscreen input, and applying a style to a selected
  range. Depends entirely on D3a's model and layout.

## Owner decisions (validated)

- **Editing model:** full custom on-canvas editing (D3b). Keystrokes, clipboard, and IME will be
  captured through an offscreen input while the caret and selection are drawn on canvas — the
  technique real editors use — but all layout, hit-testing, and drawing remain ours.
- **Rich text:** multi-style runs, represented as a flat string plus style spans.
- **Type kinds:** point type only. Lines break where the user presses Enter; no paragraph box or
  word wrap.
- **Properties:** font family, size, colour, alignment, leading, tracking.
- **Convert to Shape:** traced outlines (see the constraint below), not true glyph vectors.

## Constraint: no glyph outlines

Canvas 2D exposes no glyph outline API, and the project has **zero runtime dependencies**, so a
font parser (opentype.js and similar) is not an option. True vector text conversion is therefore
unreachable. Convert to Shape instead rasterizes the text and traces its alpha with the
`traceContours` function shipped in Phase C. This is stated as a limitation rather than implied
parity: the result is a real, editable path, good at display sizes and visibly stair-stepped on
small text.

## Architecture

### `src/engine/text-model.ts` — the data

```ts
export interface TextStyle {
  fontFamily: string;
  fontSize: number;      // document pixels, 8-512
  color: string;
  tracking: number;      // extra advance per character, -100..500
  leading: number;       // line height in document pixels, 1..1000
}

export interface StyleSpan { start: number; end: number; style: TextStyle }   // [start, end)

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  spans: StyleSpan[];                       // contiguous, sorted, covering [0, text.length)
  align: 'left' | 'center' | 'right';
}
```

**The invariant** — spans are contiguous, sorted, and cover the whole string — is enforced by
`normalizeSpans(spans, textLength)`, which merges neighbours with identical styles, clamps to the
text length, and fills any gap. That single rule is what keeps the model coherent once D3b begins
splitting spans on every style change.

Helpers: `styleAt(spans, index)`, `applyStyleToRange(spans, start, end, patch, textLength)`,
`migrateTextLayer(raw)`, `defaultTextStyle()`.

### `src/engine/text-layout.ts` — the pure core

`layoutText(text, spans, align, measure)` returns:

```ts
interface LaidOutPiece { text: string; style: TextStyle; x: number; width: number; start: number }
interface LaidOutLine { pieces: LaidOutPiece[]; baseline: number; height: number; width: number }
interface TextLayout { lines: LaidOutLine[]; width: number; height: number }
```

- Lines break **only** on `\n` (point type).
- A line's height is the **maximum leading among the runs on that line** — Photoshop's rule, and
  the reason leading belongs to the style rather than the layer.
- Tracking adds per-character advance, so a run's width is measured character by character rather
  than with a single `measureText` call.
- Alignment shifts each line horizontally within the block width.

`measure` is an injected callback (`(char: string, style: TextStyle) => number`), which is what
makes the engine node-testable: tests pass a deterministic stub and assert exact positions.

### Rendering

The compositor's text branch draws from `layoutText` instead of its current fixed centred
rendering, using a real `measureText`-backed callback. `layerNaturalSize` returns the layout's
width and height, so Free Transform, snapping, crop, and hit-testing keep working unchanged.

### Migration

A pre-D3 layer `{ text, fontFamily, fontSize, color }` becomes one span covering the whole string
with `tracking: 0`, `leading: fontSize × 1.2`, and `align: 'center'` — preserving the text, font,
size, colour, line spacing, and centred alignment exactly. The project file version stays at 2;
the change is additive, as in D1 and D2.

**One honest caveat.** Today's renderer centres each line vertically
(`textBaseline: 'middle'`); a runs model must instead share an **alphabetic baseline** across a
line, or mixed font sizes within a line would not sit on a common baseline. Migrated documents
therefore keep identical content, styling, and geometry, but a line's glyphs shift vertically by a
fraction of the font size. Baseline placement uses `lineTop + 0.8 × maxFontSize`, the standard
ascent approximation available without font metrics. The regression check is "a pre-D3 document
reopens with identical text, spans, alignment, and layer size, and renders equivalently" — not
pixel-identical.

### Type tool

`src/tools/type-tool.ts` registers `type` (`T`), replacing the grayed Type-group stub. Clicking
empty canvas creates a text layer at that point using the options bar's current style, pushing one
`Add text layer` command via `cmdAddLayer`. Clicking an existing text layer selects it rather than
stacking a new one. The status hint reads *"Type · Click to add text · Edit in Properties"* until
D3b's editor replaces it. The tool is inert while a stroke, transform, or crop session is live.

### Options bar and Properties

Both surfaces expose font family (the four families the app already ships), size, colour,
alignment, leading, and tracking, and share one sync function so they cannot drift. With no text
selection yet, an edit applies to the whole layer — implemented as `applyStyleToRange(0, length)`,
so it already runs the span-splitting path D3b will narrow to a selection. Edits are written
through coalesced `cmdPatchLayer` calls, so dragging a slider is one undo step.

### Rasterize Type and Convert to Shape

- **Rasterize Type** (`Layer > Rasterize Type`, replacing the `type.rasterize` stub) renders the
  layout into a bitmap at natural size and swaps the layer to `kind: 'image'`, keeping its id,
  name, transform, and effects, as one undoable command. The new bitmap's context is wrapped in
  `save`/`restore` around its transform — a 2D context is a singleton per canvas, and a leaked
  `translate` silently offsets every later `drawImage` into that bitmap (the bug found in D1).
- **Convert to Shape** (`type.convertShape`) renders the text offscreen at **2× scale**, traces
  the alpha with `traceContours`, halves the traced coordinates, and emits a `{kind:'path'}` shape
  layer through D1's `ShapeSpec` path variant. Supersampling costs one scale factor and materially
  smooths the outline.

### Deprecation

The Phase B/C refusal toast currently reads *"Text layers can't be painted — Rasterize Type
arrives in Phase D."* Once the command exists it becomes *"Text layers can't be painted — use
Layer > Rasterize Type first."*

## Error handling

- Empty text refuses both Rasterize Type and Convert to Shape with a toast.
- A layout with zero width or height refuses rasterization.
- The Type tool is inert during a live stroke, transform, or crop session.
- Clamps live in the model, not the UI: size 8–512, leading 1–1000, tracking −100–500.
- `normalizeSpans` repairs any gap, overlap, or out-of-range span rather than trusting callers.
- Font family is constrained to the families the app ships.

## Testing

- **Vitest (pure core):** `normalizeSpans` merging identical neighbours, clamping to text length,
  and filling gaps; `styleAt`; `applyStyleToRange` splitting and merging; `migrateTextLayer`
  producing today's rendering; `layoutText` for single-line, multi-line, all three alignments, the
  max-leading rule, and tracking advance — all through an injected measurement stub asserting
  exact positions; the clamps.
- **Contracts (`test:ui`):** the live `tool: 'type'` entry; `type.rasterize` and
  `type.convertShape` registered with real `run` handlers rather than `phase` stubs; the options
  and Properties controls; the corrected refusal toast.
- **Live verification:** clicking creates a text layer at the clicked point; changing family,
  size, colour, alignment, leading, and tracking each changes rendered pixels; alignment shifts
  lines horizontally; leading changes block height; Rasterize Type yields a paintable image layer
  and one undo restores the text layer; Convert to Shape yields a path shape layer with anchors;
  a save/open round-trip preserves text, spans, and alignment; and **a document saved before D3a
  reopens with identical text, spans, alignment, and layer size** (see the baseline caveat under
  Migration).

## Out of scope (D3a)

The on-canvas editor — caret, navigation, selection ranges, clipboard, IME, and applying a style
to a selected range (all D3b); paragraph type with word wrap; bold and italic toggles; text on a
path; vertical type; OpenType features, ligature control, and kerning pairs; hyphenation;
true glyph-outline vector conversion.
