# Core Canvas Engine — Design Spec (Photoshop Foundation, Sub-project A)

**Date:** 2026-07-04
**Status:** Approved design, pending implementation plan
**Depends on:** the shipped dark-studio redesign (`2026-07-03-minimalist-editor-dark-studio-redesign-design.md`)
**Roadmap context:** First of four approved sub-projects: **A. Core engine (this spec)** → B. Draw & retouch (brush, eraser, eyedropper, fill) → C. Selections & transforms (marquee/lasso, handles, crop) → D. Pro layers (masks, groups, adjustment layers). Each later phase gets its own spec; this spec's job is to make them plug-in work, not rework.

## Goal

Replace the DOM-based preview with a true canvas rendering engine and add the three foundations every Photoshop-like capability needs: a serializable document model, a tool framework, and command-based undo/redo — while keeping every shipped feature working and evolving the dark-studio UI (tool rail, options bar, history panel, save/open). Zero new npm dependencies (Approach 1: own Canvas2D engine; Konva/Fabric and WebGL rejected — libraries obstruct the raw-pixel work phases B/D need, WebGL is overkill at ≤4096² documents).

## User-visible outcomes

1. Everything works as today: image/text layers, opacity, blend modes, effect stack, transforms, backgrounds, canvas presets, zoom/pan, drag-move, click-select, rename, PNG export, responsive layout, toasts, reduced motion.
2. **Undo/redo for every action** — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, top-bar buttons, and a History panel listing labeled steps (click a step to jump to it).
3. **Save / Open project files** and **autosave crash recovery**.
4. **Tool rail** with Move, Hand, and Zoom tools (Space = temporary Hand, as in Photoshop) and a contextual **options bar**.

## 1. Architecture

New `src/engine/` domain plus rewired panels. All vanilla TypeScript, no dependencies.

| Unit | Responsibility | Depends on |
|---|---|---|
| `engine/document.ts` | Document/Layer types, factories, (de)serialization helpers, active-layer helpers | — |
| `engine/compositor.ts` | Render a `Doc` to any 2D canvas (screen preview and export use the SAME function); overlay pass (selection outline, future marquee/handles) | document |
| `engine/history.ts` | Command stack: push/undo/redo/jump, coalescing, capacity + memory budget | — |
| `engine/tools.ts` | `Tool` interface, registry, active-tool state, pointer routing, options-bar model | document, history |
| `engine/persistence.ts` | Project file save/load (JSON + PNG-base64 bitmaps), IndexedDB autosave + session restore | document |
| `tools/move.ts`, `tools/hand.ts`, `tools/zoom.ts` | The three launch tools | tools, history |
| `canvas.ts` (rewritten) | Viewport glue: screen canvas element, DPR sizing, zoom/pan transform, pointer→document coordinate conversion, requesting composites | compositor, tools |
| `export.ts` (thin) | Compose at 1:1 via compositor → `toBlob` → download | compositor |
| Panels (`layers-panel`, `properties-panel`, `topbar`, `rail`) | Same jobs, but every mutation dispatches a **Command** instead of writing state directly | history, document |
| `state.ts` | Keeps the rAF-batched observer (`subscribe`/`notify`, dirty flags) and app-level UI state; layer data moves to `engine/document.ts` | — |

The existing observer and dirty-flag semantics are retained; a new flag `composite` marks "canvas needs re-render." The DOM `.layer-preview-el` system, the CSS `mix-blend-mode` path, and the duplicated export drawing code are **deleted** — one render path only.

## 2. Document model

```ts
interface Doc {
  version: 1;
  width: number; height: number;              // document pixels, 64–4096
  bgType: 'transparent' | 'white' | 'black' | 'custom';
  bgColor: string;
  layers: Layer[];                            // index 0 = topmost (matches current UI)
  activeLayerId: string | null;
}

interface LayerBase {
  id: string; name: string; visible: boolean;
  opacity: number;                            // 0–100
  blendMode: 'normal'|'multiply'|'screen'|'overlay'|'darken'|'lighten';
  x: number; y: number;                       // layer CENTER in document pixels
  scale: number;                              // percent, 10–400
  effects: { blur: number; blurOn: boolean;   // blur in DOCUMENT pixels, 0–100 (see §8)
             brightness: number; brightnessOn: boolean;
             contrast: number; contrastOn: boolean; saturation: number; saturationOn: boolean;
             invert: boolean };
}

interface ImageLayer extends LayerBase { kind: 'image'; bitmap: HTMLCanvasElement | null; sourceName: string | null; }
interface TextLayer  extends LayerBase { kind: 'text';  text: string; fontFamily: string; fontSize: number; color: string; }
type Layer = ImageLayer | TextLayer;
```

Decisions:
- **Positions are document pixels** (layer center), replacing viewport-% offsets. Properties X/Y chips display px; sliders range ±document dimension. Migration mapping: `x = width/2 + xOffset%·width/100` (same for y). Scale stays %.
- **ImageLayer.bitmap is a canvas at the image's natural resolution.** At import, the layer is placed centered and scaled so the image covers the document (preserves today's cover-fit look, expressed as a scale value instead of implicit CSS). Phase B paints into this bitmap. `null` bitmap = empty image layer (renders nothing, as today).
- **TextLayer stays parametric** (re-rendered every composite from its properties) — non-destructive, like a Photoshop type layer. On-canvas text editing is phase E; editing stays in the Properties panel.
- Everything except `bitmap` is JSON-serializable; bitmaps serialize as PNG data URLs.

## 3. Compositor

`composite(doc: Doc, ctx: CanvasRenderingContext2D, opts?: { overlay?: boolean })`:

1. Clear; paint background (transparent = leave clear — the checkerboard is a CSS underlay on screen only, never composited).
2. For each **visible** layer bottom-up (`doc.layers` reversed): `save()`; `globalAlpha = opacity/100`; `globalCompositeOperation` mapped from blendMode; `filter = getFilterString(effects, kind)` (function moves into the engine, same semantics as today including image-only channels); `translate(x, y)`; `scale(scale/100)`; draw:
   - image: `drawImage(bitmap, -w/2, -h/2)` at natural size (cover-fit lives in the layer's scale value)
   - text: multi-line centered `fillText` with the current font metrics (same line-height math as today's export: 1.2 × fontSize)
   `restore()`.
3. Overlay pass (screen only, `opts.overlay`): active layer's transformed bounding box as a 1px white outline (replaces the DOM `.canvas-selected` outline; drawn crisp regardless of zoom). Future phases add marquee/handles here.

**Screen path:** one `<canvas>` sized `doc.width × doc.height` scaled by `devicePixelRatio`, CSS-transformed by the existing zoom/pan wrap. Composites run only on `composite`-dirty rAF flushes (existing observer).
**Export path:** offscreen canvas at exact document size, `composite(doc, ctx)` with no overlay, `toBlob('image/png')` → download. Blur no longer needs the old `scaleFactor` heuristic — preview and export are the same pixels by construction. Export must render text with `textAlign='center'`, `textBaseline='middle'` exactly as the screen path (shared code, not a copy).

## 4. Tool framework

```ts
interface DocPoint { x: number; y: number }   // document pixels
interface ToolOption { key: string; label: string; kind: 'slider'|'toggle'|'select';
                       min?: number; max?: number; choices?: string[]; get(): unknown; set(v: unknown): void }
interface Tool {
  id: string; label: string; icon: string;    // SVG from dom.ts icons
  cursor: string; shortcut: string;           // single key, PS-style: V, H, Z
  onDown(p: DocPoint, e: PointerEvent): void;
  onMove(p: DocPoint, e: PointerEvent): void;
  onUp(p: DocPoint, e: PointerEvent): void;
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  options?: ToolOption[];
}
```

- `engine/tools.ts` holds the registry, the active tool, and pointer routing: `canvas.ts` converts screen→document coordinates (inverse DPR/zoom/pan) and forwards pointer events to the active tool. Hit-testing helper `layerAt(p: DocPoint): Layer | null` (topmost first, transformed bounding boxes) lives here for all tools.
- **Options bar**: a strip under the top bar rendering the active tool's `options` with existing control styles (segmented/slider/toggle). Empty for launch tools except Zoom (zoom % readout) — the bar exists so phase B's brush size/opacity has a home.
- **Launch tools:** **Move (V)** — click-select (empty click deselects), drag active layer with position clamped to ±1 document size, whole drag = one coalesced command. **Hand (H)** — drags pan at any zoom; holding **Space** temporarily activates Hand from any tool. **Zoom (Z)** — click zooms in 10%, Alt+click out; pill, Ctrl+scroll-to-cursor, and reset behaviors unchanged.
- Keyboard shortcuts are suppressed while any input/textarea/contenteditable is focused.

## 5. History

```ts
interface Command { label: string; do(): void; undo(): void; coalesceKey?: string }
```

- `history.push(cmd)` executes `cmd.do()` and appends. If `coalesceKey` matches the top entry's key AND the same user gesture/burst (≤800ms since last push), the top entry is REPLACED (its original `undo` is kept, the new `do` result stands) — a slider drag or canvas drag is one entry.
- `undo()`/`redo()`; `jump(index)` walks undo/redo to the target. Pushing after undo truncates the redo tail (standard).
- Capacity: 50 entries; a `bytes()` hint on commands lets the stack enforce a ~150 MB memory budget for future bitmap snapshots (phase B) by dropping oldest entries; both limits defined in the engine now.
- **Covered by commands in this phase:** every property change (opacity, blend, x/y, scale, every effect toggle/value, text properties, rename), layer add/delete/reorder, visibility toggle, canvas size/background changes, Move-tool drags. Zoom/pan and panel toggles are viewport state, NOT history entries. Loading/opening a project clears history.
- **UI:** top-bar undo/redo buttons (disabled states reflect stack), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, and a **History panel**: the right panel becomes tabbed `Properties | History`; History lists entry labels newest-first with the current position highlighted; clicking an entry jumps to it.

## 6. Persistence

- **File format:** `*.mledit.json` — `{ app: 'minimalist-editor', version: 1, doc: <Doc with bitmaps as PNG data URLs> }`. Text layers stay parametric in the file.
- **Save:** top-bar Save button → serialize → download (name: `project name + .mledit.json`). Serialization is async (`toBlob`-based encoding) and must not freeze the UI.
- **Open:** top-bar Open button (file picker) and drag-drop: a dropped `.mledit.json`/`.json` file opens as a project (replacing the document after a confirm if there are unsaved changes); other dropped files keep today's behavior (image → new layer). Corrupt/incompatible file → error toast, current document untouched.
- **Autosave:** debounced 2s after the last command, snapshot to IndexedDB (localStorage is too small for bitmaps). On startup, if a snapshot exists, show a toast with a "Restore" action for ~10s; restoring replaces the seeded default document. Autosave failures are silent-but-logged (never toast-spam).
- Version field gates future migrations; v1 loader rejects `version > 1` with a clear toast.

## 7. UI evolution (dark studio, extended)

- **Tool rail** (left rail, reworked): tool buttons top (Move/Hand/Zoom with active state + tooltips incl. shortcut); existing add-image/add-text and panel-toggle buttons move to the rail's bottom cluster, separated by a divider.
- **Options bar:** new full-width strip under the top bar (`--panel` background, rounded, same island style), left side = active tool's options, right side = the existing size chip relocated (top bar becomes: title | Open/Save | undo/redo | Export).
- **Right panel:** segmented tab header `Properties | History`; Properties tab is today's content unchanged.
- All existing tokens, animations, and responsive behavior are kept; the mobile layout stacks: top bar → options bar → horizontal rail → canvas → layers → right panel.

## 8. Migration & parity

- On startup the seeded default document is built in the new model directly. (No persisted user data exists to migrate; the %→px mapping formula is defined for correctness of the model change: `x = width/2 + xOffset·width/100`.)
- **Parity gate:** for the same document state, the engine's export PNG must match the old renderer's framing/appearance (cover-fit images, centered multi-line text, blend rendering, non-blur effects). **Blur semantics change intentionally:** blur is now defined in document pixels (slider range 0–100px) applied identically in preview and export, replacing the old system where the stored value meant preview-pixels and export multiplied by `scaleFactor = max(w,h)/500`. The old dual-path disagreement disappears; blur radii are therefore NOT numerically comparable to the old export — the parity gate covers framing and all other effects, and blur is verified by preview==export self-consistency instead.
- Deletions: `.layer-preview-el` DOM rendering, CSS blend/filter application, `drawCoverImage`, the export-only draw code, %-based offset semantics (Properties chips relabel to px).

## 9. Error handling

- Image decode failures (import, project open) → toast, layer created empty or load aborted cleanly.
- Save/open/autosave errors → toast (autosave: log-only after the first).
- History memory-budget trims are silent; capacity trims are silent.
- The compositor never throws for missing bitmaps (`null` → skip draw); a per-listener try/catch already isolates observer subscribers.

## 10. Performance & scalability targets

- 60fps compositing during slider drags and layer drags at 2048×2048 with 25 layers on a mid-range laptop; no dropped-input at 4096².
- Composites happen at most once per rAF (existing batching); only `composite`-dirty flushes redraw.
- Autosave/save serialization never blocks pointer input (async encode; snapshot debounce).
- Memory: history budget 150 MB, autosave keeps exactly one snapshot.

## 11. Out of scope (later sub-projects)

Brush/eraser/eyedropper/fill and bitmap snapshots-in-anger (B); selections, marquee/lasso, transform handles, crop (C); masks, groups, adjustment layers (D); on-canvas text editing, shapes (E); filter gallery, dockable panels, PSD import/export; collaboration; test framework (unchanged project decision).

## 12. Verification (manual, per the project's no-test-framework decision)

1. Full regression of every shipped behavior on the engine (the §10 checklist from the previous spec, re-run).
2. Undo/redo across EVERY command type; coalescing (one slider drag = one entry); jump via History panel; redo truncation.
3. Save → reload page → Open → pixel-identical render; autosave restore flow; corrupt-file rejection.
4. Export parity vs pre-engine export for a reference document (image + text + effects + blend + custom bg).
5. Tools: Move/Hand/Zoom behaviors, Space-hand, shortcuts (and their suppression while typing).
6. Perf spot-check: 25 layers at 2048², slider scrub + drag stay smooth (devtools Performance).
7. Mobile stacked layout with the new bars; reduced-motion; zero console errors throughout.
