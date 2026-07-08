# Core Canvas Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DOM preview with a Canvas2D engine (single render path for preview+export) and add the document model, tool framework, command-based undo/redo with History panel, and project save/open/autosave — keeping every shipped feature working.

**Architecture:** New `src/engine/` domain (document, compositor, history, tools, persistence) in vanilla TS. Panels dispatch Commands instead of mutating state. The existing rAF observer gains a `composite` flag; `canvas.ts` becomes viewport glue (screen canvas, DPR, zoom/pan, pointer→doc coords). Old DOM layer rendering and the duplicate export path are deleted.

**Tech Stack:** TypeScript 5, Vite 5, Canvas2D, IndexedDB. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-core-canvas-engine-design.md`

## Global Constraints

- No new npm dependencies; no test framework — verification per task = `npx tsc --noEmit` exit 0 AND `npm run build` exit 0, plus the controller's browser checks.
- One render path: preview and export both call `composite()`; no drawing code may be duplicated.
- Positions are document pixels (layer center). Blur is document pixels, slider 0–100. **Font size is also document pixels now** (same rationale as the spec's blur decision): slider range 8–512, seeded default 64 (visually matches the old export's 32px × scaleFactor≈2 at 1024²).
- History: capacity 50 entries, memory budget 150 MB (`bytes` hints), coalesce window 800 ms. Commands capture before/after VALUES (never deltas) so `do()` is idempotent and re-runnable for redo.
- Autosave: debounce 2000 ms after last command, IndexedDB db `mledit`, store `autosave`, key `latest`. Project file: `{ app: 'minimalist-editor', version: 1, doc: ... }`; loader rejects `version > 1` with a toast.
- Selection changes and zoom/pan are NOT history entries. Loading/opening a project clears history.
- Keyboard shortcuts (V/H/Z, Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y, Space-hand) are suppressed while an input/textarea/contenteditable is focused.
- Existing dark-studio tokens, animations, reduced-motion, and mobile stacking must keep working.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure (end state)

| File | Responsibility |
|---|---|
| `src/engine/document.ts` | Doc/Layer/Effects types, factories, `getFilterString`, `layerBounds`, text measurement |
| `src/engine/compositor.ts` | `composite(doc, ctx, opts)`, `renderToCanvas(doc)`, overlay outline |
| `src/engine/history.ts` | `Command`, history stack (push/undo/redo/jump/coalesce/budgets), change listeners |
| `src/engine/commands.ts` | Command factories: patch layer/effects/doc, add/delete/reorder layer |
| `src/engine/tools.ts` | `Tool`/`ToolOption` interfaces, registry, active tool, `layerAt` hit-test |
| `src/engine/persistence.ts` | serialize/deserialize (PNG data URLs), save/open, IndexedDB autosave |
| `src/tools/move.ts`, `src/tools/hand.ts`, `src/tools/zoom.ts` | Launch tools |
| `src/state.ts` | `state.doc`, observer (+`composite` flag), UI-only state |
| `src/canvas.ts` | Screen canvas + DPR sizing, zoom/pan, pointer routing to tools, composite scheduling |
| `src/export.ts` | `renderToCanvas` → toBlob → download |
| Panels/topbar/rail | Same jobs, dispatching commands; rail becomes tool rail; right panel tabbed; options bar |

---

### Task 1: Engine document model

**Files:**
- Create: `src/engine/document.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact): `BlendMode`, `Effects`, `LayerBase`, `ImageLayer` (`kind:'image'`, `bitmap: HTMLCanvasElement | null`, `bitmapRev: number`, `sourceName: string | null`), `TextLayer` (`kind:'text'`, `text`, `fontFamily`, `fontSize`, `color`), `Layer`, `Doc`; `defaultEffects(): Effects`; `createDoc(width?, height?): Doc`; `createImageLayer(doc: Doc, name?: string): ImageLayer`; `createTextLayer(doc: Doc, name?: string): TextLayer`; `getActiveLayer(doc: Doc): Layer | undefined`; `getFilterString(effects: Effects, kind: 'image' | 'text'): string`; `layerSize(layer: Layer): { w: number; h: number }` (unscaled intrinsic size); `layerBounds(layer: Layer): { x: number; y: number; w: number; h: number }` (axis-aligned, scaled, centered on x/y).

- [ ] **Step 1: Write `src/engine/document.ts`**

```ts
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export interface Effects {
  blur: number; blurOn: boolean;           // blur in DOCUMENT pixels, 0-100
  brightness: number; brightnessOn: boolean;
  contrast: number; contrastOn: boolean;
  saturation: number; saturationOn: boolean;
  invert: boolean;
}

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;                          // 0-100
  blendMode: BlendMode;
  x: number; y: number;                     // layer CENTER in document pixels
  scale: number;                            // percent 10-400
  effects: Effects;
}

export interface ImageLayer extends LayerBase {
  kind: 'image';
  bitmap: HTMLCanvasElement | null;         // natural resolution
  bitmapRev: number;                        // bump on pixel change (thumbnail invalidation)
  sourceName: string | null;
}

export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;                         // DOCUMENT pixels, 8-512
  color: string;
}

export type Layer = ImageLayer | TextLayer;

export interface Doc {
  version: 1;
  width: number;
  height: number;
  bgType: 'transparent' | 'white' | 'black' | 'custom';
  bgColor: string;
  layers: Layer[];                          // index 0 = TOPMOST (matches panel order)
  activeLayerId: string | null;
}

export function defaultEffects(): Effects {
  return {
    blur: 0, blurOn: false,
    brightness: 100, brightnessOn: false,
    contrast: 100, contrastOn: false,
    saturation: 100, saturationOn: false,
    invert: false
  };
}

let layerCounter = 0;

function baseLayer(doc: Doc, name: string): LayerBase {
  layerCounter++;
  return {
    id: `layer_${Date.now()}_${layerCounter}`,
    name,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    x: doc.width / 2,
    y: doc.height / 2,
    scale: 100,
    effects: defaultEffects()
  };
}

export function createDoc(width = 1024, height = 1024): Doc {
  return {
    version: 1, width, height,
    bgType: 'transparent', bgColor: '#ffffff',
    layers: [], activeLayerId: null
  };
}

export function createImageLayer(doc: Doc, name?: string): ImageLayer {
  return { ...baseLayer(doc, name ?? `Image Layer ${layerCounter + 1}`), kind: 'image', bitmap: null, bitmapRev: 0, sourceName: null };
}

export function createTextLayer(doc: Doc, name?: string): TextLayer {
  return { ...baseLayer(doc, name ?? `Text Layer ${layerCounter + 1}`), kind: 'text', text: 'Edit me', fontFamily: 'Inter', fontSize: 64, color: '#000000' };
}

export function getActiveLayer(doc: Doc): Layer | undefined {
  return doc.layers.find((l) => l.id === doc.activeLayerId);
}

export function getFilterString(effects: Effects, kind: 'image' | 'text'): string {
  const parts: string[] = [];
  const blur = effects.blurOn ? effects.blur : 0;
  if (blur > 0) parts.push(`blur(${blur}px)`);
  if (kind === 'image') {
    parts.push(`contrast(${effects.contrastOn ? effects.contrast : 100}%)`);
    parts.push(`saturate(${effects.saturationOn ? effects.saturation : 100}%)`);
    parts.push(`brightness(${effects.brightnessOn ? effects.brightness : 100}%)`);
  }
  if (effects.invert) parts.push('invert(1)');
  return parts.length ? parts.join(' ') : 'none';
}

// Module-level measurement context (text metrics without touching the DOM tree)
const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d')!;

export function layerSize(layer: Layer): { w: number; h: number } {
  if (layer.kind === 'image') {
    return layer.bitmap ? { w: layer.bitmap.width, h: layer.bitmap.height } : { w: 0, h: 0 };
  }
  measureCtx.font = `${layer.fontSize}px ${layer.fontFamily}`;
  const lines = layer.text.split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width);
  const h = lines.length * layer.fontSize * 1.2;
  return { w, h };
}

export function layerBounds(layer: Layer): { x: number; y: number; w: number; h: number } {
  const { w, h } = layerSize(layer);
  const sw = (w * layer.scale) / 100;
  const sh = (h * layer.scale) / 100;
  return { x: layer.x - sw / 2, y: layer.y - sh / 2, w: sw, h: sh };
}
```

- [ ] **Step 2: Verify** — Run `npx tsc --noEmit` (exit 0) and `npm run build` (exit 0). The app is untouched and must run exactly as before.

- [ ] **Step 3: Commit**

```bash
git add src/engine/document.ts
git commit -m "feat(engine): document model with pixel-space layers and effects

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Compositor

**Files:**
- Create: `src/engine/compositor.ts`

**Interfaces:**
- Consumes: everything from `./document`.
- Produces (exact): `composite(doc: Doc, ctx: CanvasRenderingContext2D, opts?: { overlay?: boolean; overlayScale?: number }): void`; `renderToCanvas(doc: Doc): HTMLCanvasElement`.

- [ ] **Step 1: Write `src/engine/compositor.ts`**

```ts
import { type Doc, type Layer, type BlendMode, getFilterString, getActiveLayer, layerSize } from './document';

const BLEND_TO_OP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen',
  overlay: 'overlay', darken: 'darken', lighten: 'lighten'
};

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  ctx.save();
  ctx.globalAlpha = layer.opacity / 100;
  ctx.globalCompositeOperation = BLEND_TO_OP[layer.blendMode];
  ctx.filter = getFilterString(layer.effects, layer.kind);
  ctx.translate(layer.x, layer.y);
  ctx.scale(layer.scale / 100, layer.scale / 100);
  if (layer.kind === 'image') {
    if (layer.bitmap) ctx.drawImage(layer.bitmap, -layer.bitmap.width / 2, -layer.bitmap.height / 2);
  } else {
    ctx.font = `${layer.fontSize}px ${layer.fontFamily}`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = layer.text.split('\n');
    const lineHeight = layer.fontSize * 1.2;
    const startY = (-(lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 0, startY + i * lineHeight));
  }
  ctx.restore();
}

export function composite(doc: Doc, ctx: CanvasRenderingContext2D, opts: { overlay?: boolean; overlayScale?: number } = {}): void {
  ctx.clearRect(0, 0, doc.width, doc.height);
  if (doc.bgType !== 'transparent') {
    ctx.fillStyle = doc.bgType === 'white' ? '#ffffff' : doc.bgType === 'black' ? '#000000' : doc.bgColor;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const layer of [...doc.layers].reverse()) {
    if (!layer.visible) continue;
    drawLayer(ctx, layer);
  }
  if (opts.overlay) {
    const active = getActiveLayer(doc);
    if (active && active.visible) drawOutline(ctx, active, opts.overlayScale ?? 1);
  }
}

function drawOutline(ctx: CanvasRenderingContext2D, layer: Layer, screenScale: number): void {
  const { w, h } = layerSize(layer);
  if (w === 0 && h === 0) return;
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.scale(layer.scale / 100, layer.scale / 100);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  // 1 SCREEN pixel regardless of doc scale and zoom
  ctx.lineWidth = (100 / layer.scale) / screenScale;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

export function renderToCanvas(doc: Doc): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  composite(doc, canvas.getContext('2d')!);
  return canvas;
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` exit 0; `npm run build` exit 0; app unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/engine/compositor.ts
git commit -m "feat(engine): compositor with single render path and overlay pass

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: History stack

**Files:**
- Create: `src/engine/history.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact): `interface Command { label: string; do(): void; undo(): void; coalesceKey?: string; bytes?: number }`; `push(cmd: Command): void`; `undo(): void`; `redo(): void`; `jump(index: number): void`; `canUndo(): boolean`; `canRedo(): boolean`; `entries(): ReadonlyArray<{ label: string }>`; `cursor(): number` (index of last done entry, −1 = none); `clear(): void`; `onChange(fn: () => void): void`; `markSaved(): void`; `isDirty(): boolean`.

- [ ] **Step 1: Write `src/engine/history.ts`**

```ts
export interface Command {
  label: string;
  do(): void;
  undo(): void;
  coalesceKey?: string;
  bytes?: number;
}

const MAX_ENTRIES = 50;
const MAX_BYTES = 150 * 1024 * 1024;
const COALESCE_MS = 800;

let stack: Command[] = [];
let index = -1;                 // last DONE entry
let lastPushAt = 0;
let savedAt = -1;               // cursor position at last save/load
const listeners: Array<() => void> = [];

function emit(): void { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error('history listener failed', e); } }); }

function totalBytes(): number { return stack.reduce((sum, c) => sum + (c.bytes ?? 0), 0); }

function trim(): void {
  while (stack.length > MAX_ENTRIES || (totalBytes() > MAX_BYTES && stack.length > 1)) {
    stack.shift();
    index--;
    if (savedAt >= 0) savedAt--;
  }
}

export function push(cmd: Command): void {
  cmd.do();
  const now = Date.now();
  const top = stack[index];
  if (
    cmd.coalesceKey && top && top.coalesceKey === cmd.coalesceKey &&
    index === stack.length - 1 && now - lastPushAt <= COALESCE_MS
  ) {
    // Replace top: keep the ORIGINAL undo (gesture start), adopt the new do/label
    stack[index] = { label: cmd.label, do: cmd.do, undo: top.undo, coalesceKey: cmd.coalesceKey, bytes: cmd.bytes };
  } else {
    stack.splice(index + 1);    // truncate redo tail
    if (savedAt > index) savedAt = -2; // saved state no longer reachable
    stack.push(cmd);
    index = stack.length - 1;
    trim();
  }
  lastPushAt = now;
  emit();
}

export function undo(): void { if (index >= 0) { stack[index].undo(); index--; emit(); } }
export function redo(): void { if (index < stack.length - 1) { index++; stack[index].do(); emit(); } }
export function jump(target: number): void {
  while (index > target) { stack[index].undo(); index--; }
  while (index < target) { index++; stack[index].do(); }
  emit();
}
export function canUndo(): boolean { return index >= 0; }
export function canRedo(): boolean { return index < stack.length - 1; }
export function entries(): ReadonlyArray<{ label: string }> { return stack.map((c) => ({ label: c.label })); }
export function cursor(): number { return index; }
export function clear(): void { stack = []; index = -1; savedAt = -1; lastPushAt = 0; emit(); }
export function onChange(fn: () => void): void { listeners.push(fn); }
export function markSaved(): void { savedAt = index; }
export function isDirty(): boolean { return savedAt !== index; }
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` exit 0; `npm run build` exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/engine/history.ts
git commit -m "feat(engine): command history stack with coalescing and budgets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: The switchover — state, canvas rendering, panels, import, export

This is the pivotal task: the app moves onto the engine. Larger than the others by necessity (rendering can't be half-switched); take it methodically.

**Files:**
- Modify: `src/state.ts` (doc-based), `src/canvas.ts` (screen canvas + composite), `src/layers-panel.ts` (import→bitmap, thumbnails, factories), `src/properties-panel.ts` (field paths, px chips), `src/export.ts` (compositor), `src/topbar.ts` (doc fields), `index.html` (viewport contains a `<canvas>`)

**Interfaces:**
- Consumes: Tasks 1–2 exports.
- Produces: `state.doc: Doc`; `DirtyFlag` gains `'composite'`; `screenToDoc(e: PointerEvent): { x: number; y: number }` exported from `canvas.ts`; `requestComposite(): void` = `notify('composite')`. Every mutation site now also notifies `'composite'` when it affects pixels. `attachReset` in properties-panel accepts `number | (() => number)`.

- [ ] **Step 1: Rework `src/state.ts`**

Replace the `LayerState`/`AppState` interfaces, `state` object, `createNewLayer`, `getActiveLayer`, `getFilterString`, and `PROP_DEFAULTS` with:

```ts
import { type Doc, createDoc, getActiveLayer as docActiveLayer, type Layer } from './engine/document';

export const state: { doc: Doc } = { doc: createDoc() };

export function getActiveLayer(): Layer | undefined { return docActiveLayer(state.doc); }

export const PROP_DEFAULTS: Record<string, number> = {
  opacity: 100, scale: 100,
  blur: 0, contrast: 100, saturation: 100, brightness: 100, fontSize: 64
};
// x/y defaults are dynamic (doc center) — panels use function-style resets.

export type DirtyFlag = 'structure' | 'selection' | 'layerProps' | 'canvasConfig' | 'composite';
```

Keep `subscribe`/`notify` (with the per-listener try/catch) unchanged apart from the widened `DirtyFlag` union. Everything else that referenced old fields moves in the later steps.

- [ ] **Step 2: Rewrite `src/canvas.ts` rendering core**

Delete `renderViewport()` and all `.layer-preview-el` logic. The viewport element now hosts one canvas (update `index.html`: `<div class="canvas-viewport checkerboard-bg" id="canvas-viewport"><canvas id="doc-canvas"></canvas></div>`). New core:

```ts
import { state, subscribe, notify } from './state';
import { composite } from './engine/compositor';
import { $ } from './dom';

const viewport = $('canvas-viewport');
const screenCanvas = $('doc-canvas') as unknown as HTMLCanvasElement;
const screenCtx = screenCanvas.getContext('2d')!;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

export function applyCanvasDimensions(): void {
  const { width, height } = state.doc;
  screenCanvas.width = width * dpr;
  screenCanvas.height = height * dpr;
  viewport.style.aspectRatio = `${width}/${height}`;
  if (width >= height) { viewport.style.width = '100%'; viewport.style.height = 'auto'; }
  else { viewport.style.width = 'auto'; viewport.style.height = '100%'; }
  screenCanvas.style.width = '100%';
  screenCanvas.style.height = '100%';
}

function renderScreen(): void {
  screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // overlayScale = CSS screen px per document px. getBoundingClientRect already
  // includes the zoom transform; the dpr is already in the ctx transform, so it
  // must NOT appear here (it would double-count and thin the outline).
  const rect = screenCanvas.getBoundingClientRect();
  const overlayScale = rect.width / state.doc.width;
  composite(state.doc, screenCtx, { overlay: true, overlayScale });
}

export function screenToDoc(e: PointerEvent): { x: number; y: number } {
  const rect = screenCanvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * state.doc.width,
    y: ((e.clientY - rect.top) / rect.height) * state.doc.height
  };
}
```

The subscriber becomes: `canvasConfig` → `applyCanvasDimensions()` then `renderScreen()`; any of `structure | selection | layerProps | composite` → `renderScreen()`. Keep: zoom/pan wrap + pill + Ctrl-wheel + pan handlers, background segmented-control bindings (`canvasConfig` + the checkerboard class logic — note the checkerboard stays a CSS underlay; the canvas itself stays transparent), `flashCanvas()`. Port the Task-12-era select/drag pointer handlers to document space for now (they move into the Move tool in Task 7): on down, hit-test via `layerBounds` (import from engine) over `state.doc.layers` topmost-first; drag writes `layer.x/y = Math.round(start + delta in doc px)` clamped to `[-doc.width/2, 1.5*doc.width]` / same for y; `notify('layerProps', 'composite')`.

- [ ] **Step 3: Update `src/layers-panel.ts`**

- Replace `createNewLayer(type)` calls: `createImageLayer(state.doc)` / `createTextLayer(state.doc)` (import from `./engine/document`), pushing into `state.doc.layers` and setting `state.doc.activeLayerId`. All `state.layers` / `state.activeLayerId` references become `state.doc.layers` / `state.doc.activeLayerId`. Every mutation adds `'composite'` to its notify call.
- Import pipeline — replace `addImageFromDataUrl` with bitmap decoding:

```ts
function placeBitmap(layer: ImageLayer, bitmap: HTMLCanvasElement, name: string): void {
  layer.bitmap = bitmap;
  layer.bitmapRev++;
  layer.sourceName = name;
  // cover-fit the document, preserving the old look; clamp to the scale slider's max
  const cover = Math.max(state.doc.width / bitmap.width, state.doc.height / bitmap.height) * 100;
  layer.scale = Math.round(Math.min(400, Math.max(10, cover)));
  layer.x = state.doc.width / 2;
  layer.y = state.doc.height / 2;
}

function decodeImageFile(file: File): void {
  if (!file.type.startsWith('image/')) { toast('Only image files are supported.'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const active = getActiveLayer();
    if (active && active.kind === 'image' && !active.bitmap) {
      placeBitmap(active, c, file.name);
      notify('layerProps', 'composite');
    } else {
      const layer = createImageLayer(state.doc);
      placeBitmap(layer, c, file.name);
      state.doc.layers.unshift(layer);
      state.doc.activeLayerId = layer.id;
      notify('structure', 'selection', 'composite');
      flashCanvas();
    }
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Failed to read file.'); };
  img.src = url;
}
```

- Thumbnails: in `updateCard`, image layers draw the bitmap into a 26×26 thumbnail canvas, cached by `bitmapRev`:

```ts
if (layer.kind === 'image' && layer.bitmap) {
  let tc = thumb.querySelector('canvas') as HTMLCanvasElement | null;
  if (!tc) { tc = document.createElement('canvas'); tc.width = 26; tc.height = 26; thumb.textContent = ''; thumb.appendChild(tc); }
  if (tc.dataset.rev !== String(layer.bitmapRev)) {
    tc.dataset.rev = String(layer.bitmapRev);
    const tctx = tc.getContext('2d')!;
    tctx.clearRect(0, 0, 26, 26);
    const s = Math.min(26 / layer.bitmap.width, 26 / layer.bitmap.height);
    tctx.drawImage(layer.bitmap, (26 - layer.bitmap.width * s) / 2, (26 - layer.bitmap.height * s) / 2, layer.bitmap.width * s, layer.bitmap.height * s);
  }
}
```

(`layer.type` comparisons become `layer.kind`.)

- [ ] **Step 4: Update `src/properties-panel.ts` field paths**

Mechanical mapping (apply everywhere — bindings, `syncPanel`, effect rows, chips):

| Old | New |
|---|---|
| `layer.xOffset` | `layer.x` (chips/labels show `px`, no `%`) |
| `layer.yOffset` | `layer.y` |
| `layer.blur` / `layer.blurOn` | `layer.effects.blur` / `layer.effects.blurOn` |
| `layer.contrast(_On)` etc. | `layer.effects.contrast(On)` etc. |
| `layer.invert` | `layer.effects.invert` |
| `layer.type` | `layer.kind` |
| `layer.textContent` | `layer.text` |
| `layer.textColor` | `layer.color` |
| `state.layers` / `state.activeLayerId` | `state.doc.layers` / `state.doc.activeLayerId` |

Details: `bindSlider` writes gain `'composite'` in their notify; the EFFECTS config reads/writes `layer.effects[...]` (the `on` key indexes `Effects`, not `Layer`); X/Y slider ranges become dynamic — on `canvasConfig` flushes set `propXOffset.min = String(-state.doc.width / 2)`, `max = String(1.5 * state.doc.width)` (same pattern for Y with height; the properties-panel subscriber must therefore ALSO react to `dirty.has('canvasConfig')` — extend its condition), and their reset uses the new function form: change `attachReset(range: HTMLInputElement, def: number)` to `attachReset(range: HTMLInputElement, def: number | (() => number))` resolving at dblclick time (`const v = typeof def === 'function' ? def() : def;`), then `attachReset(propXOffset, () => Math.round(state.doc.width / 2))`. Blur slider `max="100"`; font-size slider `min="8" max="512"` (update `index.html` attributes accordingly, and the X/Y labels from "X Offset (%)" to "Position X (px)").

- [ ] **Step 5: Rewrite `src/export.ts`**

```ts
import { state } from './state';
import { renderToCanvas } from './engine/compositor';
import { toast } from './toast';
import { $ } from './dom';

export function exportComposition(): void {
  if (state.doc.layers.length === 0) { toast('Add at least one layer to export.'); return; }
  renderToCanvas(state.doc).toBlob((blob) => {
    if (!blob) { toast('Export failed.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `composition_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function initExport(): void { $('btn-export').addEventListener('click', exportComposition); }
```

- [ ] **Step 6: Update `src/topbar.ts` and `src/main.ts`**

Topbar: `state.canvasWidth/Height/Ratio` → `state.doc.width/height` (drop the unused ratio field or keep a local), notifies add `'composite'`. Main seed block:

```ts
const text = createTextLayer(state.doc, 'Text Overlay');
text.text = 'Minimalist Editor';
text.y = state.doc.height / 2 - state.doc.height * 0.1;
state.doc.layers.push(text);
const image = createImageLayer(state.doc, 'Background Image');
state.doc.layers.push(image);
state.doc.activeLayerId = text.id;
notify('structure', 'selection', 'canvasConfig', 'composite');
```

Delete from the codebase: old `getFilterString` in state.ts, `drawCoverImage` remnants, all `.layer-preview-el` CSS rules (`src/style.css`), `mix-blend-mode` usage. Add `#doc-canvas { display: block; }` CSS.

- [ ] **Step 7: Verify**

`npx tsc --noEmit` exit 0; `npm run build` exit 0. Grep: `layer-preview-el` → 0 hits anywhere; `xOffset` → 0 hits. Browser (controller): full regression — layers render on canvas; select/drag works in doc pixels; all sliders/effects/blend/backgrounds live-update; import/paste shows image; thumbnails render; export PNG framing matches pre-engine export for image+text reference doc.

- [ ] **Step 8: Commit**

```bash
git add -A src/ index.html
git commit -m "feat(engine): switch rendering to canvas compositor with pixel-space model

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Command dispatch — undo/redo everywhere

**Files:**
- Create: `src/engine/commands.ts`
- Modify: `src/properties-panel.ts`, `src/layers-panel.ts`, `src/topbar.ts`, `src/canvas.ts` (drag → command), `index.html` (undo/redo buttons), `src/style.css`

**Interfaces:**
- Consumes: `push` etc. from `./engine/history`; `state`, `notify`.
- Produces (exact, all return `Command`): `cmdPatchLayer(layerId: string, label: string, patch: Partial<LayerBase & { text: string; fontFamily: string; fontSize: number; color: string }>, coalesceKey?: string)`; `cmdPatchEffects(layerId: string, label: string, patch: Partial<Effects>, coalesceKey?: string)`; `cmdPatchDoc(label: string, patch: Partial<Pick<Doc, 'width' | 'height' | 'bgType' | 'bgColor'>>)`; `cmdAddLayer(layer: Layer, index: number, label: string)`; `cmdDeleteLayer(layerId: string, label: string)`; `cmdReorderLayer(layerId: string, toIndex: number, label: string)`. Each `do()`/`undo()` sets captured VALUES and fires the right notify flags (`layerProps`+`composite` for patches; `structure`+`selection`+`composite` for layer ops; `canvasConfig`+`composite` for doc).

- [ ] **Step 1: Write `src/engine/commands.ts`**

```ts
import { state, notify } from '../state';
import { type Doc, type Layer, type LayerBase, type Effects } from './document';

function findLayer(id: string): Layer | undefined { return state.doc.layers.find((l) => l.id === id); }

function captureKeys<T extends object>(target: T, patch: Partial<T>): Partial<T> {
  const prev: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) prev[k] = target[k];
  return prev;
}

export function cmdPatchLayer(layerId: string, label: string, patch: Record<string, unknown>, coalesceKey?: string) {
  const layer = findLayer(layerId);
  const prev = layer ? captureKeys(layer as unknown as Record<string, unknown>, patch) : {};
  const apply = (vals: Record<string, unknown>) => {
    const l = findLayer(layerId);
    if (!l) return;
    Object.assign(l, vals);
    notify('layerProps', 'composite');
  };
  return { label, do: () => apply(patch), undo: () => apply(prev), coalesceKey };
}

export function cmdPatchEffects(layerId: string, label: string, patch: Partial<Effects>, coalesceKey?: string) {
  const layer = findLayer(layerId);
  const prev = layer ? captureKeys(layer.effects, patch) : {};
  const apply = (vals: Partial<Effects>) => {
    const l = findLayer(layerId);
    if (!l) return;
    Object.assign(l.effects, vals);
    notify('layerProps', 'composite');
  };
  return { label, do: () => apply(patch), undo: () => apply(prev), coalesceKey };
}

export function cmdPatchDoc(label: string, patch: Partial<Pick<Doc, 'width' | 'height' | 'bgType' | 'bgColor'>>) {
  const prev = captureKeys(state.doc, patch);
  const apply = (vals: object) => { Object.assign(state.doc, vals); notify('canvasConfig', 'composite'); };
  return { label, do: () => apply(patch), undo: () => apply(prev) };
}

export function cmdAddLayer(layer: Layer, index: number, label: string) {
  const prevActive = state.doc.activeLayerId;
  return {
    label,
    do: () => {
      state.doc.layers.splice(index, 0, layer);
      state.doc.activeLayerId = layer.id;
      notify('structure', 'selection', 'composite');
    },
    undo: () => {
      state.doc.layers = state.doc.layers.filter((l) => l.id !== layer.id);
      state.doc.activeLayerId = prevActive;
      notify('structure', 'selection', 'composite');
    }
  };
}

export function cmdDeleteLayer(layerId: string, label: string) {
  const index = state.doc.layers.findIndex((l) => l.id === layerId);
  const layer = state.doc.layers[index];
  const prevActive = state.doc.activeLayerId;
  return {
    label,
    do: () => {
      state.doc.layers = state.doc.layers.filter((l) => l.id !== layerId);
      if (state.doc.activeLayerId === layerId) state.doc.activeLayerId = state.doc.layers[0]?.id ?? null;
      notify('structure', 'selection', 'composite');
    },
    undo: () => {
      state.doc.layers.splice(index, 0, layer);
      state.doc.activeLayerId = prevActive;
      notify('structure', 'selection', 'composite');
    }
  };
}

export function cmdReorderLayer(layerId: string, toIndex: number, label: string) {
  const fromIndex = state.doc.layers.findIndex((l) => l.id === layerId);
  const move = (from: number, to: number) => {
    const [l] = state.doc.layers.splice(from, 1);
    state.doc.layers.splice(to, 0, l);
    notify('structure', 'composite');
  };
  return { label, do: () => move(fromIndex, toIndex), undo: () => move(toIndex, fromIndex) };
}
```

- [ ] **Step 2: Route every mutation through `history.push()`**

- properties-panel `bindSlider`: body becomes `history.push(cmdPatchLayer(layer.id, \`${labelText}\`, { [key]: parseInt(input.value, 10) }, \`${layer.id}:${String(key)}\`))` — effect-row ranges use `cmdPatchEffects` with key `${layer.id}:fx:${fx.key}`. Effect toggles: `cmdPatchEffects(layer.id, 'Toggle ' + fx.label, { [fx.on]: nowOn, ...(seed blur ? { blur: 4 } : {}) })` (no coalesce). Blend: `cmdPatchLayer(id, 'Blend: ' + mode, { blendMode: mode })`. Text fields: `cmdPatchLayer` with coalesce keys (`id:text`, `id:fontSize`...). Rename (both paths): `cmdPatchLayer(id, 'Rename layer', { name: v })`.
- layers-panel: add buttons → `history.push(cmdAddLayer(layer, 0, 'Add image layer'))` (and text); delete (after the leave animation timeout) → `cmdDeleteLayer(id, 'Delete layer')`; visibility → `cmdPatchLayer(id, layer.visible ? 'Hide layer' : 'Show layer', { visible: !layer.visible })`; drag-reorder drop → `cmdReorderLayer(draggedId, targetIndex, 'Reorder layer')`. Import (`decodeImageFile` new-layer branch) → `cmdAddLayer`; the load-into-empty-layer branch → `cmdPatchLayer(id, 'Place image', { })` won't capture bitmap — instead build an inline command capturing `prevBitmap/prevScale/prevX/prevY` and setting the new ones (bitmaps are references; `bytes` hint = `bitmap.width * bitmap.height * 4`).
- topbar size menu → `cmdPatchDoc('Canvas size', { width, height })`; background controls (canvas.ts) → `cmdPatchDoc('Background', { bgType, ... })`.
- canvas.ts drag: on pointerup with movement, `history.push(cmdPatchLayer(id, 'Move layer', { x: finalX, y: finalY }))` — during the drag keep direct writes + notify for live feedback; the command's captured `prev` must be the DRAG-START values (capture them at pointerdown, construct the command manually: `{ label: 'Move layer', do: set final, undo: set start }`).
- Selection (card clicks, canvas click-select, deselect) stays DIRECT mutation + notify — never a command.

- [ ] **Step 3: Undo/redo UI + shortcuts**

index.html top bar (left of Export): `<div class="undo-cluster"><button class="btn-icon" id="btn-undo" title="Undo (Ctrl+Z)"></button><button class="btn-icon" id="btn-redo" title="Redo (Ctrl+Shift+Z)"></button></div>`. New module code (put in `src/main.ts` or a small `initHistoryUI` inside properties-panel? No — create the wiring in `src/main.ts`):

```ts
import * as history from './engine/history';
import { icons } from './dom';

function initHistoryUI(): void {
  const undoBtn = $('btn-undo'); const redoBtn = $('btn-redo');
  undoBtn.innerHTML = icons.undo; redoBtn.innerHTML = icons.redo;
  const refresh = () => {
    (undoBtn as HTMLButtonElement).disabled = !history.canUndo();
    (redoBtn as HTMLButtonElement).disabled = !history.canRedo();
  };
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  history.onChange(refresh);
  refresh();
  document.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as HTMLElement).isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
  });
}
```

Add `undo`/`redo` icons to `dom.ts` (`undo: svg('<path d="M6 3 2.5 6.5 6 10"/><path d="M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7"/>')`, `redo` = mirrored: `svg('<path d="M10 3 13.5 6.5 10 10"/><path d="M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/>')`). CSS: `.undo-cluster { display: flex; gap: 4px; } .btn-icon { width: 30px; height: 30px; border: none; border-radius: 8px; background: var(--card); color: var(--txt); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s, color .15s; } .btn-icon:hover:not(:disabled) { background: var(--card-hi); } .btn-icon:disabled { color: #3A3A40; cursor: default; }`

- [ ] **Step 4: Verify** — tsc/build exit 0. Browser: every mutation undoes and redoes correctly (spot-check each command type); one slider drag = ONE undo step; Ctrl+Z while typing in the text content textarea does NOT trigger app undo; buttons disable at stack ends.

- [ ] **Step 5: Commit**

```bash
git add src/engine/commands.ts src/properties-panel.ts src/layers-panel.ts src/topbar.ts src/canvas.ts src/main.ts src/dom.ts index.html src/style.css
git commit -m "feat: command-based undo/redo across all mutations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: History panel (right-panel tabs)

**Files:**
- Modify: `index.html` (tab header + history list container), `src/properties-panel.ts` (tab switching), `src/style.css`
- Create: `src/history-panel.ts`

**Interfaces:**
- Consumes: `entries()`, `cursor()`, `jump()`, `onChange()` from `./engine/history`.
- Produces: `initHistoryPanel(): void` (called from main.ts).

- [ ] **Step 1: HTML** — In the right panel, replace `<h2>Properties</h2>` with:

```html
<div class="seg panel-tabs" id="right-tabs">
  <button data-tab="properties" class="active">Properties</button>
  <button data-tab="history">History</button>
</div>
```

Wrap ALL existing right-panel content (name chip, warning, editor container) in `<div id="tab-properties">`, and add `<div id="tab-history" hidden><div class="history-list" id="history-list"></div></div>` after it.

- [ ] **Step 2: `src/history-panel.ts`**

```ts
import * as history from './engine/history';
import { $ } from './dom';

export function initHistoryPanel(): void {
  const list = $('history-list');
  const tabs = $('right-tabs');
  tabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      $('tab-properties').hidden = btn.dataset.tab !== 'properties';
      $('tab-history').hidden = btn.dataset.tab !== 'history';
    });
  });
  const render = () => {
    list.innerHTML = '';
    const cur = history.cursor();
    history.entries().forEach((entry, i) => {
      const row = document.createElement('button');
      row.className = 'history-row' + (i === cur ? ' current' : '') + (i > cur ? ' undone' : '');
      row.textContent = entry.label;
      row.addEventListener('click', () => history.jump(i));
      list.prepend(row);            // newest first
    });
    if (!history.entries().length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No actions yet.';
      list.appendChild(empty);
    }
  };
  history.onChange(render);
  render();
}
```

- [ ] **Step 3: CSS**

```css
.panel-tabs { margin-bottom: 14px; }
.history-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.history-row { font-family: inherit; font-size: 11px; text-align: left; padding: 7px 10px; border: none; border-radius: 8px; background: var(--card); color: var(--txt); cursor: pointer; transition: background .15s, opacity .15s; }
.history-row:hover { background: var(--card-hi); }
.history-row.current { outline: 1px solid #fff; }
.history-row.undone { opacity: 0.45; }
.history-empty { font-size: 11px; color: var(--mut); text-align: center; padding: 20px 0; }
```

- [ ] **Step 4: Verify** — tsc/build 0. Browser: tab switch works; rows appear per action; clicking an older row undoes to it (canvas follows); rows past cursor dim; clicking a dimmed row redoes to it.

- [ ] **Step 5: Commit**

```bash
git add index.html src/history-panel.ts src/properties-panel.ts src/main.ts src/style.css
git commit -m "feat: history panel with jump-to-step in tabbed right panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Tool framework + Move tool + tool rail

**Files:**
- Create: `src/engine/tools.ts`, `src/tools/move.ts`
- Modify: `src/canvas.ts` (route pointers to active tool; delete hardcoded select/drag), `src/rail.ts` + `index.html` (tool rail), `src/dom.ts` (tool icons), `src/style.css`

**Interfaces:**
- Consumes: `screenToDoc` from `../canvas`; `layerBounds` from `./document`; history/commands.
- Produces (exact): `interface DocPoint { x: number; y: number }`; `interface ToolOption { key: string; label: string; kind: 'slider' | 'toggle' | 'select' | 'display'; min?: number; max?: number; choices?: string[]; get(): unknown; set(v: unknown): void }`; `interface Tool { id: string; label: string; icon: string; cursor: string; shortcut: string; onDown(p: DocPoint, e: PointerEvent): void; onMove(p: DocPoint, e: PointerEvent): void; onUp(p: DocPoint, e: PointerEvent): void; drawOverlay?(ctx: CanvasRenderingContext2D): void; options?: ToolOption[] }`; `registerTool(t: Tool): void`; `setActiveTool(id: string): void`; `getActiveTool(): Tool`; `onToolChange(fn: (t: Tool) => void): void`; `layerAt(p: DocPoint): Layer | null`.

- [ ] **Step 1: `src/engine/tools.ts`**

```ts
import { state } from '../state';
import { type Layer, layerBounds } from './document';

export interface DocPoint { x: number; y: number }
export interface ToolOption { key: string; label: string; kind: 'slider' | 'toggle' | 'select' | 'display'; min?: number; max?: number; choices?: string[]; get(): unknown; set(v: unknown): void }
export interface Tool {
  id: string; label: string; icon: string; cursor: string; shortcut: string;
  onDown(p: DocPoint, e: PointerEvent): void;
  onMove(p: DocPoint, e: PointerEvent): void;
  onUp(p: DocPoint, e: PointerEvent): void;
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  options?: ToolOption[];
}

const tools = new Map<string, Tool>();
let active: Tool | null = null;
const changeListeners: Array<(t: Tool) => void> = [];

export function registerTool(t: Tool): void { tools.set(t.id, t); if (!active) active = t; }
export function getActiveTool(): Tool { return active!; }
export function setActiveTool(id: string): void {
  const t = tools.get(id);
  if (!t || t === active) return;
  active = t;
  changeListeners.forEach((fn) => { try { fn(t); } catch (e) { console.error(e); } });
}
export function onToolChange(fn: (t: Tool) => void): void { changeListeners.push(fn); }
export function allTools(): Tool[] { return [...tools.values()]; }

export function layerAt(p: DocPoint): Layer | null {
  for (const layer of state.doc.layers) {          // index 0 = topmost
    if (!layer.visible) continue;
    const b = layerBounds(layer);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return layer;
  }
  return null;
}
```

- [ ] **Step 2: `src/tools/move.ts`** (ports the select/drag behavior as a tool; whole drag = one manually-built command)

```ts
import { type Tool, type DocPoint, layerAt } from '../engine/tools';
import { state, notify } from '../state';
import * as history from '../engine/history';
import { icons } from '../dom';

let drag: { id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null = null;

function clampX(v: number): number { return Math.max(-state.doc.width / 2, Math.min(1.5 * state.doc.width, Math.round(v))); }
function clampY(v: number): number { return Math.max(-state.doc.height / 2, Math.min(1.5 * state.doc.height, Math.round(v))); }

export const moveTool: Tool = {
  id: 'move', label: 'Move', icon: icons.move, cursor: 'default', shortcut: 'v',
  onDown(p: DocPoint) {
    const hit = layerAt(p);
    if (!hit) {
      state.doc.activeLayerId = null;
      notify('selection', 'composite');
      return;
    }
    if (state.doc.activeLayerId !== hit.id) {
      state.doc.activeLayerId = hit.id;
      notify('selection', 'composite');
    }
    drag = { id: hit.id, startX: p.x, startY: p.y, origX: hit.x, origY: hit.y, moved: false };
  },
  onMove(p: DocPoint) {
    if (!drag) return;
    const layer = state.doc.layers.find((l) => l.id === drag!.id);
    if (!layer) return;
    layer.x = clampX(drag.origX + (p.x - drag.startX));
    layer.y = clampY(drag.origY + (p.y - drag.startY));
    drag.moved = true;
    notify('layerProps', 'composite');
  },
  onUp() {
    if (drag && drag.moved) {
      const d = drag;
      const layer = state.doc.layers.find((l) => l.id === d.id);
      if (layer) {
        const fx = layer.x, fy = layer.y, ox = d.origX, oy = d.origY;
        history.push({
          label: 'Move layer',
          do() { const l = state.doc.layers.find((x) => x.id === d.id); if (l) { l.x = fx; l.y = fy; notify('layerProps', 'composite'); } },
          undo() { const l = state.doc.layers.find((x) => x.id === d.id); if (l) { l.x = ox; l.y = oy; notify('layerProps', 'composite'); } }
        });
      }
    }
    drag = null;
  }
};
```

- [ ] **Step 3: Pointer routing in `src/canvas.ts`**

Delete the hardcoded select/drag handlers from Task 4. Add:

```ts
import { getActiveTool } from './engine/tools';

screenCanvas.addEventListener('pointerdown', (e) => {
  screenCanvas.setPointerCapture(e.pointerId);
  getActiveTool().onDown(screenToDoc(e), e);
});
screenCanvas.addEventListener('pointermove', (e) => getActiveTool().onMove(screenToDoc(e), e));
screenCanvas.addEventListener('pointerup', (e) => getActiveTool().onUp(screenToDoc(e), e));
screenCanvas.addEventListener('pointercancel', (e) => getActiveTool().onUp(screenToDoc(e), e));
```

Cursor: on tool change (`onToolChange`), set `screenCanvas.style.cursor = tool.cursor`.

- [ ] **Step 4: Tool rail**

index.html rail becomes (keep ids of existing bottom buttons):

```html
<nav class="rail" aria-label="Toolbar">
  <div class="rail-tools" id="rail-tools"></div>
  <div class="rail-divider"></div>
  <button class="rail-btn" id="rail-add-image" title="Add image layer"></button>
  <button class="rail-btn" id="rail-add-text" title="Add text layer"></button>
  <div class="rail-spacer"></div>
  <button class="rail-btn active" id="rail-layers" title="Toggle layers panel"></button>
  <button class="rail-btn active" id="rail-props" title="Toggle properties panel"></button>
</nav>
```

`src/rail.ts` gains tool buttons (registration happens in main.ts BEFORE `initRail`):

```ts
import { allTools, setActiveTool, onToolChange, getActiveTool } from './engine/tools';

// inside initRail(), before existing bindings:
const toolsHost = $('rail-tools');
allTools().forEach((tool) => {
  const btn = document.createElement('button');
  btn.className = 'rail-btn';
  btn.title = `${tool.label} (${tool.shortcut.toUpperCase()})`;
  btn.dataset.tool = tool.id;
  btn.innerHTML = tool.icon;
  btn.addEventListener('click', () => setActiveTool(tool.id));
  toolsHost.appendChild(btn);
});
const syncToolButtons = () => {
  toolsHost.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tool === getActiveTool().id));
};
onToolChange(syncToolButtons);
syncToolButtons();
```

Icons in dom.ts: `move: svg('<path d="M8 2v12M2 8h12"/><path d="M8 2 6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2"/>')`. CSS: `.rail-tools { display: flex; flex-direction: column; gap: 6px; } .rail-divider { width: 20px; height: 1px; background: var(--line); margin: 6px 0; } .rail-spacer { flex: 1; }`.

main.ts: `registerTool(moveTool);` before `initRail()`; import from `./tools/move`.

- [ ] **Step 5: Verify** — tsc/build 0. Browser: Move tool selected by default; click-select/drag/deselect identical to before; drag is one history entry and undoes to the drag start; rail shows the Move button active.

- [ ] **Step 6: Commit**

```bash
git add src/engine/tools.ts src/tools/move.ts src/canvas.ts src/rail.ts src/dom.ts src/main.ts index.html src/style.css
git commit -m "feat: tool framework with move tool and tool rail

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Hand + Zoom tools, Space-hand, tool shortcuts

**Files:**
- Create: `src/tools/hand.ts`, `src/tools/zoom.ts`
- Modify: `src/canvas.ts` (export pan/zoom API), `src/main.ts` (register + shortcuts), `src/dom.ts` (icons)

**Interfaces:**
- Consumes: tools registry.
- Produces: from `canvas.ts`: `panBy(dxScreen: number, dyScreen: number): void`; `zoomAt(factor: number, clientX?: number, clientY?: number): void`; `resetView(): void` (wrap existing zoom/pan internals; the pill/wheel handlers now call these too).

- [ ] **Step 1: Extract the view API in `src/canvas.ts`**

Wrap the existing module-local `zoom/panX/panY/applyZoom/setZoom` into exported functions:

```ts
export function panBy(dx: number, dy: number): void { panX += dx; panY += dy; applyZoom(); }
export function zoomAt(factor: number, clientX?: number, clientY?: number): void {
  if (clientX === undefined || clientY === undefined) { setZoom(zoom * factor); return; }
  const rect = container.getBoundingClientRect();
  const cx = clientX - rect.left - rect.width / 2 - panX;
  const cy = clientY - rect.top - rect.height / 2 - panY;
  setZoom(zoom * factor, cx, cy);
}
export function resetView(): void { zoom = 1; panX = 0; panY = 0; applyZoom(); }
```

Rewire the pill buttons, readout click, and Ctrl-wheel to call these (no behavior change). Keep the container-level pan-drag for zoom>1.

- [ ] **Step 2: `src/tools/hand.ts`**

```ts
import { type Tool } from '../engine/tools';
import { panBy } from '../canvas';
import { icons } from '../dom';

let last: { x: number; y: number } | null = null;

export const handTool: Tool = {
  id: 'hand', label: 'Hand', icon: icons.hand, cursor: 'grab', shortcut: 'h',
  onDown(_p, e) { last = { x: e.clientX, y: e.clientY }; },
  onMove(_p, e) { if (last) { panBy(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY }; } },
  onUp() { last = null; }
};
```

- [ ] **Step 3: `src/tools/zoom.ts`**

```ts
import { type Tool } from '../engine/tools';
import { zoomAt } from '../canvas';
import { icons } from '../dom';

export const zoomTool: Tool = {
  id: 'zoom', label: 'Zoom', icon: icons.zoom, cursor: 'zoom-in', shortcut: 'z',
  onDown(_p, e) { zoomAt(e.altKey ? 1 / 1.25 : 1.25, e.clientX, e.clientY); },
  onMove() {}, onUp() {}
};
```

- [ ] **Step 4: Shortcuts + Space-hand in `src/main.ts`**

```ts
let spaceHeld = false;
let toolBeforeSpace: string | null = null;

document.addEventListener('keydown', (e) => {
  const t = document.activeElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as HTMLElement).isContentEditable)) return;
  if (e.code === 'Space' && !e.repeat && !spaceHeld) {
    spaceHeld = true;
    toolBeforeSpace = getActiveTool().id;
    setActiveTool('hand');
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = allTools().find((x) => x.shortcut === e.key.toLowerCase());
  if (tool) setActiveTool(tool.id);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spaceHeld) {
    spaceHeld = false;
    if (toolBeforeSpace) setActiveTool(toolBeforeSpace);
    toolBeforeSpace = null;
  }
});
```

Register: `registerTool(moveTool); registerTool(handTool); registerTool(zoomTool);` before `initRail()`. Icons in dom.ts: `hand: svg('<path d="M5 8V4.5a1 1 0 0 1 2 0V8m0-4.5v-1a1 1 0 0 1 2 0V8m0-4a1 1 0 0 1 2 0v5.5"/><path d="M11 9.5c1-1 2.5-.5 2 1l-1.5 3A3 3 0 0 1 8.7 15H8a3 3 0 0 1-3-3V6"/>')`, `zoom: svg('<circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>')`.

- [ ] **Step 5: Verify** — tsc/build 0. Browser: H pans by dragging the canvas at any zoom; Z clicks zoom in, Alt+Z-click zooms out toward the cursor; V returns to Move; holding Space from Move temporarily pans, releasing restores Move; typing "v" in the text content textarea does NOT switch tools; pill/wheel/reset still work.

- [ ] **Step 6: Commit**

```bash
git add src/tools/hand.ts src/tools/zoom.ts src/canvas.ts src/main.ts src/dom.ts
git commit -m "feat: hand and zoom tools with space-hand and tool shortcuts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Options bar

**Files:**
- Modify: `index.html` (bar strip + size chip relocation), `src/topbar.ts` (chip moves; top bar keeps title/Open-Save placeholder/undo/Export), `src/style.css`
- Create: `src/options-bar.ts`

**Interfaces:**
- Consumes: `getActiveTool`, `onToolChange`, `ToolOption`.
- Produces: `initOptionsBar(): void`. Zoom tool gains `options: [{ key: 'zoom', label: 'Zoom', kind: 'display', get: () => readout, set: () => {} }]` — add an exported `getZoomPercent(): number` from canvas.ts for it.

- [ ] **Step 1: HTML** — after `</header>` insert:

```html
<div class="options-bar">
  <div class="options-host" id="options-host"><span class="options-empty" id="options-empty">No options for this tool</span></div>
  <div class="size-chip-wrap"><!-- MOVE the existing #size-chip button and #size-menu here unchanged --></div>
</div>
```

- [ ] **Step 2: `src/options-bar.ts`**

```ts
import { getActiveTool, onToolChange, type ToolOption } from './engine/tools';
import { $ } from './dom';

function renderOption(opt: ToolOption): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'opt';
  const label = document.createElement('span');
  label.className = 'opt-label';
  label.textContent = opt.label;
  wrap.appendChild(label);
  if (opt.kind === 'display') {
    const val = document.createElement('span');
    val.className = 'opt-value';
    val.textContent = String(opt.get());
    wrap.appendChild(val);
  } else if (opt.kind === 'slider') {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(opt.min ?? 0); input.max = String(opt.max ?? 100);
    input.value = String(opt.get());
    input.addEventListener('input', () => opt.set(parseInt(input.value, 10)));
    wrap.appendChild(input);
  } else if (opt.kind === 'toggle') {
    const btn = document.createElement('button');
    btn.className = 'switch';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(Boolean(opt.get())));
    btn.addEventListener('click', () => { const v = !opt.get(); opt.set(v); btn.setAttribute('aria-checked', String(v)); });
    wrap.appendChild(btn);
  } else {
    const sel = document.createElement('select');
    (opt.choices ?? []).forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    sel.value = String(opt.get());
    sel.addEventListener('change', () => opt.set(sel.value));
    wrap.appendChild(sel);
  }
  return wrap;
}

export function initOptionsBar(): void {
  const host = $('options-host');
  const render = () => {
    host.innerHTML = '';
    const opts = getActiveTool().options ?? [];
    if (!opts.length) {
      const empty = document.createElement('span');
      empty.className = 'options-empty';
      empty.textContent = `${getActiveTool().label} — no options`;
      host.appendChild(empty);
      return;
    }
    opts.forEach((o) => host.appendChild(renderOption(o)));
  };
  onToolChange(render);
  render();
}
```

Zoom tool options (in `src/tools/zoom.ts`): `options: [{ key: 'zoom', label: 'Zoom', kind: 'display', get: () => getZoomPercent() + '%', set: () => {} }]`; canvas.ts exports `getZoomPercent(): number { return Math.round(zoom * 100); }`.

- [ ] **Step 3: CSS**

```css
.options-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 0 10px; padding: 6px 12px; background: var(--panel); border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4); min-height: 40px;
}
.options-host { display: flex; align-items: center; gap: 16px; }
.opt { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.opt-label { color: var(--mut); }
.opt-value { font-variant-numeric: tabular-nums; }
.options-empty { font-size: 11px; color: var(--mut); }
```

Mobile media query: `.options-bar { margin: 0; flex-wrap: wrap; }`.

- [ ] **Step 4: Verify** — tsc/build 0. Browser: bar shows under the top bar; switching tools updates it (Move/Hand show "no options", Zoom shows the % readout); size chip works from its new home; top bar layout intact.

- [ ] **Step 5: Commit**

```bash
git add index.html src/options-bar.ts src/tools/zoom.ts src/canvas.ts src/topbar.ts src/main.ts src/style.css
git commit -m "feat: contextual options bar with relocated size chip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Project save/open

**Files:**
- Create: `src/engine/persistence.ts`
- Modify: `src/topbar.ts` + `index.html` (Open/Save buttons), `src/layers-panel.ts` (drop `.json` → open project), `src/dom.ts` (icons), `src/style.css`

**Interfaces:**
- Consumes: document types, `renderToCanvas` NOT needed (serialize raw bitmaps), history (`clear`, `markSaved`, `isDirty`), `state`, `notify`, `toast`.
- Produces (exact): `serializeDoc(doc: Doc): Promise<string>`; `deserializeDoc(json: string): Promise<Doc>` (throws `Error` with a user-presentable message on invalid/newer files); `saveProject(): Promise<void>`; `openProjectFile(file: File): Promise<void>` (confirm dialog if `history.isDirty()`).

- [ ] **Step 1: `src/engine/persistence.ts`**

```ts
import { type Doc, type Layer } from './document';
import { state, notify } from '../state';
import * as history from './history';
import { toast } from '../toast';

interface SerialLayer extends Omit<Layer, 'bitmap'> { bitmap?: string | null }
interface ProjectFile { app: 'minimalist-editor'; version: 1; doc: Omit<Doc, 'layers'> & { layers: SerialLayer[] } }

function canvasToDataUrl(c: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (!blob) { reject(new Error('encode failed')); return; }
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('encode failed'));
      r.readAsDataURL(blob);
    }, 'image/png');
  });
}

function dataUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('bitmap decode failed'));
    img.src = url;
  });
}

export async function serializeDoc(doc: Doc): Promise<string> {
  const layers: SerialLayer[] = [];
  for (const layer of doc.layers) {
    if (layer.kind === 'image') {
      const { bitmap, ...rest } = layer;
      layers.push({ ...rest, bitmap: bitmap ? await canvasToDataUrl(bitmap) : null } as SerialLayer);
    } else {
      layers.push({ ...layer } as SerialLayer);
    }
  }
  const file: ProjectFile = { app: 'minimalist-editor', version: 1, doc: { ...doc, layers } };
  return JSON.stringify(file);
}

export async function deserializeDoc(json: string): Promise<Doc> {
  let parsed: ProjectFile;
  try { parsed = JSON.parse(json); } catch { throw new Error('Not a valid project file.'); }
  if (parsed?.app !== 'minimalist-editor' || !parsed.doc) throw new Error('Not a valid project file.');
  if (parsed.version > 1) throw new Error('This project was saved by a newer version.');
  const layers: Layer[] = [];
  for (const sl of parsed.doc.layers) {
    if (sl.kind === 'image') {
      const bitmap = sl.bitmap ? await dataUrlToCanvas(sl.bitmap) : null;
      layers.push({ ...(sl as object), bitmap, bitmapRev: 0 } as Layer);
    } else {
      layers.push({ ...(sl as object) } as Layer);
    }
  }
  return { ...parsed.doc, layers } as Doc;
}

export async function saveProject(): Promise<void> {
  try {
    const json = await serializeDoc(state.doc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project_${Date.now()}.mledit.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    history.markSaved();
    toast('Project saved.');
  } catch {
    toast('Saving the project failed.');
  }
}

export async function openProjectFile(file: File): Promise<void> {
  if (history.isDirty() && !window.confirm('Open project? Unsaved changes will be lost.')) return;
  try {
    const doc = await deserializeDoc(await file.text());
    state.doc = doc;
    history.clear();
    history.markSaved();
    notify('structure', 'selection', 'canvasConfig', 'composite');
    toast('Project opened.');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not open the project file.');
  }
}
```

- [ ] **Step 2: Wire the UI**

index.html top bar (left cluster, after the title): `<div class="file-cluster"><button class="btn-icon" id="btn-open" title="Open project"></button><button class="btn-icon" id="btn-save" title="Save project"></button></div>` plus a hidden `<input type="file" id="project-input" accept=".json,application/json" style="display:none">`. topbar.ts: `$('btn-open').addEventListener('click', () => $('project-input').click());` file input change → `openProjectFile(file)`; `$('btn-save').addEventListener('click', () => void saveProject());` icons: `open: svg('<path d="M2 5a1 1 0 0 1 1-1h3l1.5 2H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/>')`, `save: svg('<path d="M3 2h8l3 3v9a0 0 0 0 1 0 0H3a0 0 0 0 1 0 0V2Z"/><rect x="5" y="9" width="6" height="5"/><rect x="5" y="2" width="5" height="3"/>')`. layers-panel drop handler: before the image loop, `const proj = files.find(f => f.name.endsWith('.json')); if (proj) { void openProjectFile(proj); return; }`. `.file-cluster { display: flex; gap: 4px; }`.

**Note:** `state` must allow reassigning `doc` — it already does (`state.doc = doc` mutates the property, not the const binding).

- [ ] **Step 3: Verify** — tsc/build 0. Browser: build a doc (image + styled text), Save downloads `.mledit.json`; hard-reload; Open restores it pixel-identically (spot-check via export); opening garbage JSON toasts "Not a valid project file." and leaves the doc alone; dropping a project file onto the upload zone opens it; dirty-confirm appears when unsaved changes exist.

- [ ] **Step 4: Commit**

```bash
git add src/engine/persistence.ts src/topbar.ts src/layers-panel.ts src/dom.ts index.html src/style.css
git commit -m "feat: project save and open with versioned json format

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Autosave + restore

**Files:**
- Modify: `src/engine/persistence.ts` (autosave section), `src/toast.ts` (action support), `src/main.ts` (init + restore offer)

**Interfaces:**
- Produces: `initAutosave(): void` (subscribes to history changes, debounced 2000 ms snapshot); `tryRestoreOffer(): Promise<void>` (checks IndexedDB, offers restore). `toast(message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number })`.

- [ ] **Step 1: Toast actions in `src/toast.ts`**

Extend the existing `toast()`: options parameter; when `actionLabel` present, append `<button class="toast-action">` that runs `onAction` and dismisses; `duration` overrides the 3000 ms default. CSS: `.toast { display: flex; align-items: center; gap: 12px; } .toast-action { font-family: inherit; font-size: 12px; font-weight: 600; border: none; border-radius: 6px; padding: 4px 10px; background: #fff; color: #000; cursor: pointer; }`

- [ ] **Step 2: Autosave in `src/engine/persistence.ts`**

```ts
const DB_NAME = 'mledit';
const STORE = 'autosave';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, 'latest');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('latest');
    req.onsuccess = () => resolve((req.result as string) ?? null);
    req.onerror = () => reject(req.error);
  });
}

let autosaveTimer: number | null = null;
let autosaveErrorShown = false;

export function initAutosave(): void {
  history.onChange(() => {
    if (autosaveTimer !== null) clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(async () => {
      try { await idbPut(await serializeDoc(state.doc)); }
      catch (err) {
        if (!autosaveErrorShown) { autosaveErrorShown = true; toast('Autosave is unavailable.'); }
        console.error('autosave failed', err);
      }
    }, 2000);
  });
}

export async function tryRestoreOffer(): Promise<void> {
  try {
    const json = await idbGet();
    if (!json) return;
    toast('A previous session was found.', {
      actionLabel: 'Restore',
      duration: 10000,
      onAction: async () => {
        try {
          state.doc = await deserializeDoc(json);
          history.clear();
          history.markSaved();
          notify('structure', 'selection', 'canvasConfig', 'composite');
        } catch { toast('Could not restore the previous session.'); }
      }
    });
  } catch (err) { console.error('restore check failed', err); }
}
```

main.ts: `initAutosave(); void tryRestoreOffer();` after seeding.

- [ ] **Step 3: Verify** — tsc/build 0. Browser: make edits, wait >2s, hard-reload → "previous session" toast with Restore appears; clicking Restore brings the doc back; ignoring it leaves the seeded doc; devtools → Application → IndexedDB shows one `latest` entry.

- [ ] **Step 4: Commit**

```bash
git add src/engine/persistence.ts src/toast.ts src/main.ts src/style.css
git commit -m "feat: indexeddb autosave with session restore offer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Final sweep — mobile, README, full verification

**Files:**
- Modify: `src/style.css` (mobile: options bar + history rows), `README.md`

- [ ] **Step 1: Mobile CSS** — In the `@media (max-width: 1024px)` block add: `.options-bar { margin: 8px 0 0; }` and confirm the stacking order top bar → options bar → rail → panels holds with the new DOM (options bar sits between header and wrapper, so it stacks naturally). History list gets `max-height: 40vh` on mobile.

- [ ] **Step 2: README** — Update the feature list: canvas engine (single render path), Move/Hand/Zoom tools with shortcuts, undo/redo + history panel, project save/open (`.mledit.json`), autosave restore. Update Project Structure with `engine/` and `tools/` directories. Factual tone.

- [ ] **Step 3: Run the spec §12 verification checklist** (controller-led):
1. Full regression of every pre-engine behavior on canvas rendering.
2. Undo/redo across every command type; coalescing; History-panel jump both directions; redo truncation.
3. Save → reload → Open → identical render; autosave restore; corrupt-file rejection.
4. Export parity vs pre-engine reference (framing, blends, non-blur effects); blur preview==export self-consistency.
5. Move/Hand/Zoom + Space-hand + shortcuts + typing suppression.
6. Perf: 25 layers at 2048², slider scrub + drag smooth (devtools Performance spot-check).
7. Mobile layout, reduced-motion, zero console errors.

- [ ] **Step 4: Commit**

```bash
git add src/style.css README.md
git commit -m "feat: engine phase polish - mobile options bar and docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** §1 architecture → T1–T5 module split; §2 model → T1 (+T4 migration); §3 compositor/one render path → T2+T4 (export §T4 Step 5); §4 tools/options → T7–T9; §5 history → T3+T5+T6; §6 persistence → T10+T11; §7 UI → T5 (undo cluster), T6 (tabs), T7 (tool rail), T9 (options bar); §8 parity → T4 Step 7 + T12; §9 errors → toasts in T4/T10/T11, history listener try/catch exists; §10 perf → T12 checklist; §12 verification → T12.
- **Type consistency:** `DirtyFlag` union with `'composite'` used by all tasks; `Command` shape identical in T3/T5/T7; `ToolOption.kind` includes `'display'` (T7 def, T9 use); `screenToDoc`/`panBy`/`zoomAt`/`getZoomPercent` defined in canvas.ts before consumers (T4/T8/T9); `bitmapRev` defined T1, used T4 thumbnails.
- **Known semantic changes (spec-sanctioned):** blur and font size become document pixels (Global Constraints); position chips show px; seeded text fontSize 64.
- **Deliberate simplification:** `attachChip`/`bindSlider` history commands rely on value-coalescing (`id:key`) rather than gesture tracking — a chip commit and a slider drag within 800 ms of each other on the same property coalesce, which is acceptable.
