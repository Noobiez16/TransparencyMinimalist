# Minimalist Editor — Dark Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the layer image editor as a dark "studio" tool — floating panels, effect-stack properties, interactive canvas, micro-animations — while splitting `src/main.ts` into modules and eliminating full-DOM rebuilds.

**Architecture:** Vanilla TypeScript + Vite, no frameworks. A tiny observer in `src/state.ts` (dirty flags flushed once per `requestAnimationFrame`) replaces the monolithic `updateUI()`. Each UI region is a module with an `init()` that subscribes to the flags it cares about. Phases: modularize (no visual change) → dark shell → effect-stack properties → interactive canvas → polish.

**Tech Stack:** TypeScript 5, Vite 5, plain DOM APIs, CSS custom properties. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-minimalist-editor-dark-studio-redesign-design.md`

## Global Constraints

- No new npm dependencies; no animation or UI libraries.
- **White is the only accent color.** Tokens exactly: `--bg: #0A0A0B`, `--panel: #151517`, `--card: #1E1E21`, `--card-hi: #26262A`, `--line: #2A2A2E`, `--txt: #F2F2F4`, `--mut: #85858D`. The indigo `--accent-color` must not survive.
- Radii: 12px panels, 8–10px controls, 999px pills. Remove `border-radius: 0 !important`.
- Motion timing: 150–250ms; movement uses `cubic-bezier(0.2, 0.8, 0.2, 1)`; all motion disabled under `@media (prefers-reduced-motion: reduce)`.
- Export pixel output must be identical in framing/math to pre-redesign for the same state (zoom and all UI changes are preview-only).
- No test framework: every task verifies via `npx tsc --noEmit` (must exit 0) plus specific manual checks in the running dev server (`npm run dev`, open the URL Vite prints).
- All user-facing errors use the toast module, never `alert()`.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure (end state)

| File | Responsibility |
|---|---|
| `src/dom.ts` | `$` element getter, `inlineEdit` helper, SVG icon strings |
| `src/state.ts` | Types, `state`, layer factory, active-layer helper, `getFilterString`, subscribe/notify observer, `PROP_DEFAULTS` |
| `src/toast.ts` | Toast notifications |
| `src/export.ts` | PNG export (logic unchanged) + Export button binding |
| `src/canvas.ts` | Viewport rendering, dimensions, background controls, select/drag/zoom |
| `src/layers-panel.ts` | Layer list (keyed reconciliation), add/upload/paste, reorder |
| `src/properties-panel.ts` | Effect-stack panel, sliders, chips, blend, text section, rename |
| `src/topbar.ts` | Size chip + dimensions dropdown |
| `src/main.ts` | Entry point: init modules, seed default layers |
| `index.html` | New shell: topbar, icon rail, floating panels |
| `src/style.css` | Dark studio theme |

---

### Task 1: Foundation modules — `dom.ts`, `state.ts`, `toast.ts`

**Files:**
- Create: `src/dom.ts`, `src/state.ts`, `src/toast.ts`
- Modify: `src/main.ts` (delete the local `interface LayerState`, `interface AppState`, `const state`, `const $`, `createNewLayer`, `getActiveLayer`, `layerCounter`; import them instead; replace all 3 `alert(...)` calls with `toast(...)`)
- Modify: `src/style.css` (append toast styles)

**Interfaces:**
- Consumes: nothing.
- Produces: `$<T>(id): T`; `state: AppState`; `createNewLayer(type: 'image'|'text'): LayerState`; `getActiveLayer(): LayerState | undefined`; `getFilterString(layer: LayerState, scaleFactor?: number): string`; `subscribe(fn: (dirty: Set<DirtyFlag>) => void): void`; `notify(...flags: DirtyFlag[]): void`; `DirtyFlag = 'structure' | 'selection' | 'layerProps' | 'canvasConfig'`; `PROP_DEFAULTS: Record<string, number>`; `toast(message: string): void`. `LayerState` gains boolean flags `blurOn`, `contrastOn`, `saturationOn`, `brightnessOn` (all default `true` in this task to preserve current slider behavior; Task 9 flips them).

- [ ] **Step 1: Create `src/dom.ts`**

```ts
export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
};
```

- [ ] **Step 2: Create `src/state.ts`**

```ts
export interface LayerState {
  id: string;
  name: string;
  type: 'image' | 'text';
  visible: boolean;
  opacity: number;
  blendMode: string;
  xOffset: number;
  yOffset: number;
  scale: number;
  imageSrc: string | null;
  imageName: string | null;
  blur: number;
  blurOn: boolean;
  contrast: number;
  contrastOn: boolean;
  saturation: number;
  saturationOn: boolean;
  brightness: number;
  brightnessOn: boolean;
  invert: boolean;
  textContent: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

export interface AppState {
  layers: LayerState[];
  activeLayerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  canvasRatio: string;
  canvasBgType: 'transparent' | 'white' | 'black' | 'custom';
  canvasBgColor: string;
}

export const state: AppState = {
  layers: [],
  activeLayerId: null,
  canvasWidth: 1024,
  canvasHeight: 1024,
  canvasRatio: '1:1',
  canvasBgType: 'transparent',
  canvasBgColor: '#ffffff'
};

export type DirtyFlag = 'structure' | 'selection' | 'layerProps' | 'canvasConfig';
type Listener = (dirty: Set<DirtyFlag>) => void;

const listeners: Listener[] = [];
let pending = new Set<DirtyFlag>();
let scheduled = false;

export function subscribe(fn: Listener): void {
  listeners.push(fn);
}

export function notify(...flags: DirtyFlag[]): void {
  flags.forEach((f) => pending.add(f));
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    const dirty = pending;
    pending = new Set();
    scheduled = false;
    listeners.forEach((fn) => fn(dirty));
  });
}

export const PROP_DEFAULTS: Record<string, number> = {
  opacity: 100, xOffset: 0, yOffset: 0, scale: 100,
  blur: 0, contrast: 100, saturation: 100, brightness: 100, fontSize: 32
};

let layerCounter = 0;

export function createNewLayer(type: 'image' | 'text'): LayerState {
  layerCounter++;
  return {
    id: `layer_${Date.now()}_${layerCounter}`,
    name: `${type === 'image' ? 'Image' : 'Text'} Layer ${layerCounter}`,
    type,
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    xOffset: 0,
    yOffset: 0,
    scale: 100,
    imageSrc: null,
    imageName: null,
    blur: 0, blurOn: true,
    contrast: 100, contrastOn: true,
    saturation: 100, saturationOn: true,
    brightness: 100, brightnessOn: true,
    invert: false,
    textContent: 'Edit me',
    fontFamily: 'Inter',
    fontSize: 32,
    textColor: '#000000'
  };
}

export function getActiveLayer(): LayerState | undefined {
  return state.layers.find((l) => l.id === state.activeLayerId);
}

export function getFilterString(l: LayerState, scaleFactor = 1): string {
  const parts: string[] = [];
  const blur = l.blurOn ? l.blur : 0;
  if (blur > 0) parts.push(`blur(${blur * scaleFactor}px)`);
  if (l.type === 'image') {
    parts.push(`contrast(${l.contrastOn ? l.contrast : 100}%)`);
    parts.push(`saturate(${l.saturationOn ? l.saturation : 100}%)`);
    parts.push(`brightness(${l.brightnessOn ? l.brightness : 100}%)`);
  }
  if (l.invert) parts.push('invert(1)');
  return parts.length ? parts.join(' ') : 'none';
}
```

- [ ] **Step 3: Create `src/toast.ts`**

```ts
let container: HTMLDivElement | null = null;

export function toast(message: string): void {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }, 3000);
}
```

- [ ] **Step 4: Append toast styles to `src/style.css`**

```css
/* Toasts */
.toast-container {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 100;
}
.toast {
  background: #1E1E21; color: #F2F2F4; padding: 10px 18px; font-size: 12px;
  border-radius: 10px !important; box-shadow: 0 8px 30px rgba(0,0,0,.5);
  opacity: 0; transform: translateY(12px); transition: opacity .25s ease, transform .25s ease;
}
.toast.show { opacity: 1; transform: translateY(0); }
```

(The `!important` on radius is temporary until Task 6 removes the global `border-radius: 0 !important`.)

- [ ] **Step 5: Rewire `src/main.ts`**

At the top of `main.ts` add:

```ts
import { state, createNewLayer, getActiveLayer, type LayerState } from './state';
import { $ } from './dom';
import { toast } from './toast';
```

Then delete from `main.ts`: the `LayerState` and `AppState` interfaces, the `const state = {...}` block, the `const $ = ...` helper, `let layerCounter = 0;`, the `createNewLayer` function, and the `getActiveLayer` function. Replace `alert('Failed to read file.')` → `toast('Failed to read file.')`, `alert('Failed to read pasted image.')` → `toast('Failed to read pasted image.')`, `alert('Add at least one layer to export.')` → `toast('Add at least one layer to export.')`. In the seed block at the bottom, change `defaultTextLayer.textContent = "Minimalist Editor";` stays, but any other behavior is untouched. The two inline `img.style.filter = ...` / `div.style.filter = ...` template literals inside `updateUI()` are replaced with `el.style.filter = getFilterString(layer);` (add `getFilterString` to the state import).

- [ ] **Step 6: Typecheck and verify**

Run: `npx tsc --noEmit` — Expected: exit 0, no output.
In the browser (`npm run dev`): app looks and behaves exactly as before; click Export with layers present downloads a PNG; delete all layers and click Export — a dark toast slides up instead of an alert.

- [ ] **Step 7: Commit**

```bash
git add src/dom.ts src/state.ts src/toast.ts src/main.ts src/style.css
git commit -m "refactor: extract state, dom, and toast modules from main.ts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Export module

**Files:**
- Create: `src/export.ts`
- Modify: `src/main.ts` (delete `mapBlendModeToCompositeOp`, `drawCoverImage`, and the whole `$('btn-export').addEventListener(...)` block; call `initExport()` instead)

**Interfaces:**
- Consumes: `state`, `getFilterString`, `LayerState` from `./state`; `toast` from `./toast`; `$` from `./dom`.
- Produces: `initExport(): void` (binds `#btn-export`), `exportComposition(): void`.

- [ ] **Step 1: Create `src/export.ts`**

Move the existing export code verbatim into this file with this shape (bodies are the current `main.ts` code, with `ctx.filter = ...` template literals replaced by `getFilterString(layer, scaleFactor)`; note `getFilterString` omits blur when 0 — identical rendering because `blur(0px)` is a no-op):

```ts
import { state, getFilterString, type LayerState } from './state';
import { toast } from './toast';
import { $ } from './dom';

function mapBlendModeToCompositeOp(blend: string): GlobalCompositeOperation { /* moved unchanged */ }
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void { /* moved unchanged */ }

export function exportComposition(): void {
  if (state.layers.length === 0) {
    toast('Add at least one layer to export.');
    return;
  }
  // ... the existing loadPromises + Promise.all draw/download body, moved unchanged,
  // except both ctx.filter assignments become:
  //   ctx.filter = getFilterString(layer, scaleFactor);
  // and after Promise.all resolves, count layers where layer.type === 'image'
  // && layer.imageSrc && img === null; if that count > 0:
  //   toast(`${count} layer(s) could not be rendered.`);
}

export function initExport(): void {
  $('btn-export').addEventListener('click', exportComposition);
}
```

The two comment lines above describe moves of existing code, not new logic — the only *new* lines are the failed-image count and its toast:

```ts
const failed = loadedLayers.filter(
  (x) => x.layer.type === 'image' && x.layer.imageSrc && !x.img
).length;
if (failed > 0) toast(`${failed} layer(s) could not be rendered.`);
```

- [ ] **Step 2: Rewire `main.ts`**

Delete the moved functions/blocks; add `import { initExport } from './export';` and call `initExport();` once near the bottom (before the seed block).

- [ ] **Step 3: Typecheck and verify**

Run: `npx tsc --noEmit` — exit 0.
Browser: export a composition with an image + text layer on each of the four backgrounds; PNGs look identical to before (same framing, blur, filters).

- [ ] **Step 4: Commit**

```bash
git add src/export.ts src/main.ts
git commit -m "refactor: extract export module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Canvas module

**Files:**
- Create: `src/canvas.ts`
- Modify: `src/main.ts` (remove canvas-related code; keep calling `updateUI()` for the panels for now)

**Interfaces:**
- Consumes: `state`, `subscribe`, `getFilterString` from `./state`; `$` from `./dom`.
- Produces: `initCanvas(): void`. Subscribes to all flags: re-renders viewport layers on `structure`/`selection`/`layerProps`, applies dimensions/background on `canvasConfig`. Also owns the `#canvas-ratio`/`#canvas-width`/`#canvas-height` inputs and `.btn-theme` background buttons (unchanged DOM, moved bindings) **until Task 7 moves dimension inputs to the topbar** — to keep coupling low, export `applyCanvasDimensions(): void` so Task 7 can reuse it.

- [ ] **Step 1: Create `src/canvas.ts`**

Move from `main.ts`: `updateCanvasDimensions` (rename to `applyCanvasDimensions`, reading/writing `state` as today), the `canvasRatioSelect`/`canvasWidthInput`/`canvasHeightInput` bindings, the `.btn-theme` and `#bg-color-picker` bindings, and section "2. Render Canvas Viewport Layers" of `updateUI()` extracted into a local `renderViewport()` function (same reconcile-in-place logic, using `el.style.filter = getFilterString(layer)`).

```ts
import { state, subscribe, getFilterString } from './state';
import { $ } from './dom';

const viewport = $('canvas-viewport');

export function applyCanvasDimensions(): void { /* moved updateCanvasDimensions body */ }

function renderViewport(): void { /* moved section 2 of updateUI */ }

export function initCanvas(): void {
  /* moved input + theme-button bindings; each handler ends with
     notify('canvasConfig') instead of calling updateUI/applyCanvasDimensions directly */
  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) applyCanvasDimensions();
    if (dirty.has('structure') || dirty.has('selection') || dirty.has('layerProps')) renderViewport();
  });
  applyCanvasDimensions();
}
```

(Import `notify` too. The theme-button handlers keep their direct `viewport.style.backgroundColor` writes — that's `applyCanvasDimensions`-independent and fine.)

- [ ] **Step 2: Rewire `main.ts`**

Remove the moved code. In `updateUI()`, delete section 2 (viewport rendering) — `main.ts`'s `updateUI()` now only builds the layer list and syncs the properties panel. Everywhere `updateUI()` is called, also call `notify('layerProps')` is NOT yet needed — instead, at the end of `updateUI()` add `notify('layerProps');` so the canvas re-renders through the observer. Add `import { initCanvas } from './canvas';` and call `initCanvas();` before `initExport();`. Replace the direct `updateCanvasDimensions()` call at the bottom with `notify('canvasConfig');`.

- [ ] **Step 3: Typecheck and verify**

Run: `npx tsc --noEmit` — exit 0.
Browser: all sliders still live-update the preview (now one frame later via rAF — visually identical); ratio presets resize the viewport; background buttons work.

- [ ] **Step 4: Commit**

```bash
git add src/canvas.ts src/main.ts
git commit -m "refactor: extract canvas module with rAF-batched rendering

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Layers panel module with keyed reconciliation

**Files:**
- Create: `src/layers-panel.ts`
- Modify: `src/main.ts` (remove layer-list building, add-buttons, upload/paste handling)

**Interfaces:**
- Consumes: `state`, `subscribe`, `notify`, `createNewLayer`, `getActiveLayer`, `LayerState` from `./state`; `$` from `./dom`; `toast` from `./toast`.
- Produces: `initLayersPanel(): void`. Cards are **created once per layer and updated in place** — the perf fix. Card DOM keeps the exact classes used today (`layer-card`, `layer-thumbnail`, `layer-name-label`, `btn-layer-vis`, `btn-layer-del`) so existing CSS applies.

- [ ] **Step 1: Create `src/layers-panel.ts`**

```ts
import { state, subscribe, notify, createNewLayer, getActiveLayer, type LayerState } from './state';
import { $ } from './dom';
import { toast } from './toast';

const container = $('layers-list-container');
const cards = new Map<string, HTMLElement>();
let draggedId: string | null = null;

function findLayer(id: string): LayerState | undefined {
  return state.layers.find((l) => l.id === id);
}

function createCard(id: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'layer-card';
  card.setAttribute('draggable', 'true');
  card.dataset.id = id;
  card.innerHTML = `
    <div class="layer-card-left">
      <span class="icon-drag">☰</span>
      <div class="layer-thumbnail"></div>
      <span class="layer-name-label"></span>
    </div>
    <div class="layer-card-actions">
      <span class="btn-layer-vis"></span>
      <span class="btn-layer-del">✕</span>
    </div>`;

  card.addEventListener('click', (e) => {
    const layer = findLayer(id);
    if (!layer) return;
    const target = e.target as HTMLElement;
    if (target.classList.contains('btn-layer-vis')) {
      layer.visible = !layer.visible;
      notify('layerProps');
      return;
    }
    if (target.classList.contains('btn-layer-del')) {
      state.layers = state.layers.filter((l) => l.id !== id);
      if (state.activeLayerId === id) state.activeLayerId = state.layers[0]?.id || null;
      notify('structure', 'selection');
      return;
    }
    state.activeLayerId = id;
    notify('selection');
  });

  card.addEventListener('dragstart', (e) => {
    draggedId = id;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggedId || draggedId === id) return;
    const from = state.layers.findIndex((l) => l.id === draggedId);
    const to = state.layers.findIndex((l) => l.id === id);
    if (from !== -1 && to !== -1) {
      const [moved] = state.layers.splice(from, 1);
      state.layers.splice(to, 0, moved);
      notify('structure');
    }
    draggedId = null;
  });
  card.addEventListener('dragend', () => { draggedId = null; });
  return card;
}

function updateCard(card: HTMLElement, layer: LayerState): void {
  card.classList.toggle('active', state.activeLayerId === layer.id);
  const nameEl = card.querySelector('.layer-name-label') as HTMLElement;
  if (nameEl.textContent !== layer.name) nameEl.textContent = layer.name;
  const vis = card.querySelector('.btn-layer-vis') as HTMLElement;
  const visGlyph = layer.visible ? '👁' : '⊘';
  if (vis.textContent !== visGlyph) vis.textContent = visGlyph;
  card.style.opacity = layer.visible ? '' : '0.5';
  const thumb = card.querySelector('.layer-thumbnail') as HTMLElement;
  if (layer.type === 'image' && layer.imageSrc) {
    let img = thumb.querySelector('img');
    if (!img) { img = document.createElement('img'); thumb.textContent = ''; thumb.appendChild(img); }
    if (img.src !== layer.imageSrc) img.src = layer.imageSrc;
  } else if (!thumb.querySelector('img')) {
    const glyph = layer.type === 'image' ? 'IMG' : 'TXT';
    if (thumb.textContent !== glyph) thumb.textContent = glyph;
  }
}

function renderList(): void {
  const seen = new Set<string>();
  let prev: HTMLElement | null = null;
  state.layers.forEach((layer) => {
    let card = cards.get(layer.id);
    if (!card) { card = createCard(layer.id); cards.set(layer.id, card); }
    seen.add(layer.id);
    if (prev) prev.after(card);
    else if (container.firstChild !== card) container.prepend(card);
    prev = card;
    updateCard(card, layer);
  });
  for (const [id, card] of cards) {
    if (!seen.has(id)) { cards.delete(id); card.remove(); }
  }
}

function lightUpdate(): void {
  state.layers.forEach((layer) => {
    const card = cards.get(layer.id);
    if (card) updateCard(card, layer);
  });
}

function addImageFromDataUrl(dataUrl: string, name: string): void {
  const active = getActiveLayer();
  if (active && active.type === 'image' && !active.imageSrc) {
    active.imageSrc = dataUrl;
    active.imageName = name;
    notify('layerProps');
  } else {
    const layer = createNewLayer('image');
    layer.imageSrc = dataUrl;
    layer.imageName = name;
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    notify('structure', 'selection');
  }
}

function readImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    toast('Only image files are supported.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => addImageFromDataUrl(ev.target?.result as string, file.name);
  reader.onerror = () => toast('Failed to read file.');
  reader.readAsDataURL(file);
}

export function initLayersPanel(): void {
  $('btn-add-image').addEventListener('click', () => {
    const layer = createNewLayer('image');
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    notify('structure', 'selection');
  });
  $('btn-add-text').addEventListener('click', () => {
    const layer = createNewLayer('text');
    state.layers.unshift(layer);
    state.activeLayerId = layer.id;
    notify('structure', 'selection');
  });

  const uploadZone = $('upload-zone');
  const fileInput = $('file-input') as unknown as HTMLInputElement;
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    Array.from(e.dataTransfer?.files ?? []).forEach(readImageFile);
  });
  fileInput.addEventListener('change', () => {
    Array.from(fileInput.files ?? []).forEach(readImageFile);
    fileInput.value = '';
  });

  document.addEventListener('paste', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const named = new File([file], `pasted_image_${Date.now()}.png`, { type: file.type });
          readImageFile(named);
          break;
        }
      }
    }
  });

  subscribe((dirty) => {
    if (dirty.has('structure')) renderList();
    else if (dirty.has('selection') || dirty.has('layerProps')) lightUpdate();
  });
}
```

- [ ] **Step 2: Rewire `main.ts`**

Delete from `main.ts`: the add-button listeners, upload/drag/paste blocks, `handleUploadedFiles`, `bindDragAndDropEvents`, `draggedId`, and section "1. Build Layers List" of `updateUI()`. Add `import { initLayersPanel } from './layers-panel';` and call it. `updateUI()` now only handles the properties panel (section 3 + `syncPropertiesPanel`).

- [ ] **Step 3: Typecheck and verify**

Run: `npx tsc --noEmit` — exit 0.
Browser: add/select/hide/delete/reorder layers all work; **drag the opacity slider and watch the layers list in devtools Elements — cards must NOT flash/rebuild** (that's the perf win); dropping a non-image file shows the "Only image files" toast; paste (Ctrl+V) still works.

- [ ] **Step 4: Commit**

```bash
git add src/layers-panel.ts src/main.ts
git commit -m "refactor: extract layers panel with keyed card reconciliation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Properties panel module

**Files:**
- Create: `src/properties-panel.ts`
- Modify: `src/main.ts` (shrinks to entry point only)

**Interfaces:**
- Consumes: `state`, `subscribe`, `notify`, `getActiveLayer` from `./state`; `$` from `./dom`.
- Produces: `initPropertiesPanel(): void`. Internal helper `bindSlider(input, key, chipEl, suffix)` reused by Task 9/10. Panel sync keeps today's rule: never overwrite the focused input unless the active layer changed.

- [ ] **Step 1: Create `src/properties-panel.ts`**

Move the remaining panel code from `main.ts` into this module: all the `prop*` element lookups, `lastSyncedLayerId`, `syncPropertiesPanel()`, all input listeners (`bindRangeInput` renamed `bindSlider`), and section 3 of `updateUI()` as `updateVisibility()`. Every listener body replaces `updateUI()` with `notify('layerProps')` (and the name input also triggers the layers list via the same flag — `lightUpdate` covers it).

```ts
import { state, subscribe, notify, getActiveLayer, type LayerState } from './state';
import { $ } from './dom';

let lastSyncedLayerId: string | null = null;

function syncPanel(): void { /* moved syncPropertiesPanel body, unchanged */ }

function updateVisibility(): void {
  if (state.activeLayerId) {
    $('properties-editor-container').style.display = 'block';
    $('no-active-warning').style.display = 'none';
    syncPanel();
  } else {
    $('properties-editor-container').style.display = 'none';
    $('no-active-warning').style.display = 'block';
  }
}

function bindSlider(input: HTMLInputElement, key: keyof LayerState, labelId?: string, suffix = ''): void {
  input.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (!layer) return;
    (layer as any)[key] = parseInt(input.value, 10);
    if (labelId) $(labelId).textContent = `${input.value}${suffix}`;
    notify('layerProps');
  });
}

export function initPropertiesPanel(): void {
  /* moved bindings: name, opacity range+num, blend select, x/y/scale,
     blur/contrast/saturation/brightness, invert, text content/font/size/color */
  subscribe((dirty) => {
    if (dirty.has('selection') || dirty.has('structure')) updateVisibility();
  });
  updateVisibility();
}
```

- [ ] **Step 2: Slim `main.ts` to the entry point**

```ts
import { state, createNewLayer, notify } from './state';
import { initCanvas } from './canvas';
import { initLayersPanel } from './layers-panel';
import { initPropertiesPanel } from './properties-panel';
import { initExport } from './export';

initCanvas();
initLayersPanel();
initPropertiesPanel();
initExport();

const text = createNewLayer('text');
text.name = 'Text Overlay';
text.textContent = 'Minimalist Editor';
text.yOffset = -10;
state.layers.push(text);

const image = createNewLayer('image');
image.name = 'Background Image';
state.layers.push(image);

state.activeLayerId = text.id;
notify('structure', 'selection', 'canvasConfig');
```

- [ ] **Step 3: Typecheck and verify**

Run: `npx tsc --noEmit` — exit 0. Also run `npm run build` — exit 0.
Browser: full regression pass — every control in the Properties panel works; switching layers repopulates all fields; typing in the opacity number while dragging another control doesn't lose focus.

- [ ] **Step 4: Commit**

```bash
git add src/properties-panel.ts src/main.ts
git commit -m "refactor: extract properties panel; main.ts is now the entry point

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dark studio visual foundation

**Files:**
- Modify: `src/style.css` (full replacement of the theme; keep the toast block)
- Modify: `index.html` (class tweaks only; structure unchanged)

**Interfaces:**
- Consumes: existing class names (all kept: `panel`, `layer-card`, `control-row`, `btn-theme`, `upload-zone`, `canvas-viewport`, `checkerboard-bg`, etc.).
- Produces: the token set from Global Constraints; `.seg`/`.seg button` segmented-control classes and `.switch` pill-toggle class (used by Tasks 7–11); floating-panel layout.

- [ ] **Step 1: Replace `src/style.css`**

Full new content (toast block from Task 1 stays at the end):

```css
:root {
  --bg: #0A0A0B; --panel: #151517; --card: #1E1E21; --card-hi: #26262A;
  --line: #2A2A2E; --txt: #F2F2F4; --mut: #85858D;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
*:focus-visible { outline: 2px solid var(--txt); outline-offset: 1px; }

body {
  font-family: 'Inter', sans-serif; background: var(--bg); color: var(--txt);
  overflow: hidden; height: 100vh; font-size: 12px;
}

.dashboard-wrapper {
  display: grid; grid-template-columns: 250px 1fr 280px;
  gap: 10px; padding: 10px; height: 100vh;
}

.panel {
  background: var(--panel); border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; overflow-y: auto;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

h2 {
  font-size: 13px; font-weight: 600; margin-bottom: 16px;
}
h3, .lbl {
  font-size: 9.5px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--mut); margin-bottom: 8px;
}

/* Buttons */
.btn {
  font-family: inherit; font-size: 12px; font-weight: 500; padding: 9px 12px;
  cursor: pointer; border: none; border-radius: 8px;
  background: var(--card); color: var(--txt); text-align: center;
  transition: background 0.15s ease, transform 0.1s var(--ease);
}
.btn:hover { background: var(--card-hi); }
.btn:active { transform: scale(0.97); }
.btn-primary {
  background: #fff; color: #000; font-weight: 600; padding: 12px; width: 100%; margin-top: auto;
  transition: transform 0.15s var(--ease), box-shadow 0.2s ease;
}
.btn-primary:hover { background: #fff; color: #000; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(255, 255, 255, 0.15); }

/* Segmented control (used for background + blend) */
.seg { display: flex; gap: 4px; background: var(--card); padding: 3px; border-radius: 8px; }
.seg button {
  flex: 1; font-family: inherit; font-size: 11px; padding: 5px 10px; border-radius: 6px;
  border: 1px solid transparent; background: transparent; color: var(--mut);
  cursor: pointer; white-space: nowrap; transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.seg button:hover { color: var(--txt); }
.seg button.active { color: var(--txt); background: var(--card-hi); border-color: #fff; }

/* Pill toggle */
.switch {
  width: 30px; height: 17px; border: none; padding: 0; background: #3A3A40;
  border-radius: 999px; position: relative; cursor: pointer; flex-shrink: 0;
  transition: background 0.2s ease;
}
.switch::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px;
  background: #fff; border-radius: 50%; transition: left 0.2s var(--ease), background 0.2s;
}
.switch[aria-checked="true"] { background: #fff; }
.switch[aria-checked="true"]::after { left: 15px; background: #000; }

/* Upload zone */
.upload-zone {
  border: 1px dashed #3A3A40; border-radius: 10px; padding: 24px 12px;
  text-align: center; cursor: pointer; font-size: 11px; color: var(--mut);
  margin-bottom: 16px; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.upload-zone:hover, .upload-zone.dragover {
  border-color: #fff; background: rgba(255, 255, 255, 0.03);
}
.upload-zone.dragover { box-shadow: 0 0 20px rgba(255, 255, 255, 0.08); }

.layer-creation-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.layer-creation-buttons .btn-primary { margin-top: 0; padding: 9px; background: var(--card); color: var(--txt); }
.layer-creation-buttons .btn-primary:hover { background: var(--card-hi); box-shadow: none; transform: none; }

/* Layer cards */
.layers-list { display: flex; flex-direction: column; gap: 8px; flex: 1; overflow-y: auto; }
.layer-card {
  display: flex; align-items: center; justify-content: space-between; padding: 8px;
  border: 1.5px solid transparent; border-radius: 10px; background: var(--card);
  cursor: pointer; user-select: none;
  transition: border-color 0.2s ease, background 0.15s ease, transform 0.15s var(--ease), opacity 0.2s;
}
.layer-card:hover { background: var(--card-hi); transform: translateX(2px); }
.layer-card.active { border-color: #fff; }
.layer-card-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.icon-drag { color: var(--mut); cursor: grab; }
.layer-thumbnail {
  width: 26px; height: 26px; border-radius: 6px; background-color: var(--card-hi);
  display: flex; align-items: center; justify-content: center; font-size: 8px;
  color: var(--mut); overflow: hidden; flex-shrink: 0;
  background-image: linear-gradient(45deg, #2E2E33 25%, transparent 25%, transparent 75%, #2E2E33 75%),
    linear-gradient(45deg, #2E2E33 25%, transparent 25%, transparent 75%, #2E2E33 75%);
  background-size: 8px 8px; background-position: 0 0, 4px 4px;
}
.layer-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.layer-name-label { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.layer-card-actions { display: flex; align-items: center; gap: 8px; color: var(--mut); }
.layer-card-actions span { cursor: pointer; transition: color 0.15s; }
.layer-card-actions span:hover { color: var(--txt); }

/* Center canvas area */
.center-panel { align-items: center; background: transparent; box-shadow: none; padding: 8px; }
.canvas-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.canvas-controls .control-label { display: none; }
.theme-toggles { display: flex; gap: 4px; background: var(--card); padding: 3px; border-radius: 8px; }
.btn-theme {
  border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--mut); padding: 5px 12px;
}
.btn-theme:hover { background: transparent; color: var(--txt); }
.btn-theme.active { background: var(--card-hi); border-color: #fff; color: var(--txt); }
#bg-color-picker { width: 26px; height: 26px; border: none; border-radius: 6px; background: var(--card); cursor: pointer; }

.canvas-container { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; max-height: 70vh; }
.canvas-viewport {
  position: relative; width: 100%; max-width: 520px; max-height: 520px;
  border-radius: 12px; border: 1px solid var(--line); overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
}
.canvas-viewport .layer-preview-el { position: absolute; transform-origin: center center; pointer-events: none; }
.canvas-viewport img.layer-preview-el { width: 100%; height: 100%; object-fit: cover; }
.canvas-viewport div.layer-preview-el {
  width: 100%; height: 100%; white-space: pre-wrap; text-align: center;
  display: flex; align-items: center; justify-content: center;
}
.checkerboard-bg {
  background-color: #121214;
  background-image: linear-gradient(45deg, #1B1B1E 25%, transparent 25%, transparent 75%, #1B1B1E 75%),
    linear-gradient(45deg, #1B1B1E 25%, transparent 25%, transparent 75%, #1B1B1E 75%);
  background-size: 20px 20px; background-position: 0 0, 10px 10px;
}

/* Properties controls */
.config-section { margin-bottom: 16px; padding-bottom: 14px; }
.control-row { margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.control-row.inline-row { flex-direction: row; justify-content: space-between; align-items: center; }
.control-row label { font-weight: 500; }
.properties-warning {
  font-size: 12px; color: var(--mut); text-align: center; padding: 32px 16px;
  border: 1px dashed #3A3A40; border-radius: 10px;
}

input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 3px;
  background: #333338; border-radius: 2px; outline: none; cursor: pointer;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 12px; height: 12px;
  background: #fff; border: none; border-radius: 50%; cursor: pointer;
  transition: transform 0.15s var(--ease), box-shadow 0.15s ease;
}
input[type="range"]:hover::-webkit-slider-thumb, input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(1.3); box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.12);
}

input[type="text"], input[type="number"], textarea, select {
  font-family: inherit; font-size: 12px; padding: 7px 9px; border: none; border-radius: 8px;
  background: var(--card); color: var(--txt);
}
select { cursor: pointer; }
input[type="color"] { width: 30px; height: 22px; border: none; border-radius: 6px; background: var(--card); cursor: pointer; }

input[type="checkbox"] {
  appearance: none; width: 14px; height: 14px; border: 1px solid var(--mut);
  border-radius: 4px; cursor: pointer; position: relative;
}
input[type="checkbox"]:checked { background: #fff; border-color: #fff; }

.value-display, .slider-labels { font-size: 10px; color: var(--mut); }
.value-display { text-align: right; font-variant-numeric: tabular-nums; }
.slider-labels { display: flex; justify-content: space-between; align-items: center; }
#prop-opacity-num { width: 48px; text-align: center; padding: 3px; font-size: 11px; }
.slider-group { display: flex; flex-direction: column; gap: 8px; }
.inline-row div { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.resolution-labels { display: flex; justify-content: space-between; font-size: 9px; color: var(--mut); margin-top: 4px; }

@media (max-width: 1024px) {
  .dashboard-wrapper { grid-template-columns: 1fr; height: auto; }
  body { overflow-y: auto; height: auto; }
  .canvas-container { max-height: none; padding: 20px 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}

/* Toasts — keep the Task 1 block here, but drop the !important on border-radius */
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` — exit 0.
Browser: entire app is dark; only white accents (no indigo anywhere — grep `6366F1` in `src/` returns nothing); panels are floating rounded islands with gaps and no divider lines; checkerboard is dark; slider knobs grow with a halo on hover; background buttons look like a segmented control. All functionality unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/style.css index.html
git commit -m "feat: dark studio visual foundation with floating panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Top bar with size chip and Export

**Files:**
- Create: `src/topbar.ts`
- Modify: `index.html` (add `<header>`, remove "Canvas & Export Settings" section and the export button from the right panel)
- Modify: `src/canvas.ts` (remove `#canvas-ratio` bindings — the elements move), `src/main.ts` (call `initTopbar()`), `src/style.css` (topbar styles)

**Interfaces:**
- Consumes: `state`, `notify`, `subscribe` from `./state`; `$` from `./dom`.
- Produces: `initTopbar(): void`. Sets `state.canvasWidth/Height/Ratio` and fires `notify('canvasConfig')`; `canvas.ts`'s existing subscriber applies it. `#btn-export` moves into the header (same id — `initExport()` keeps working; call order in `main.ts` must put `initExport()` after the header exists, which it does since HTML is static).

- [ ] **Step 1: Update `index.html`**

Insert as the first child of `<body>` (before `.dashboard-wrapper`):

```html
<header class="topbar">
  <div class="topbar-title">Minimalist Editor</div>
  <div class="size-chip-wrap">
    <button class="size-chip" id="size-chip">1024 × 1024 ▾</button>
    <div class="size-menu" id="size-menu" hidden>
      <button data-ratio="1:1">1:1 Square · 1024×1024</button>
      <button data-ratio="16:9">16:9 Landscape · 1920×1080</button>
      <button data-ratio="9:16">9:16 Portrait · 1080×1920</button>
      <button data-ratio="4:5">4:5 Vertical · 1080×1350</button>
      <div class="size-custom">
        <input type="number" id="canvas-width" value="1024" min="64" max="4096" aria-label="Width">
        <span>×</span>
        <input type="number" id="canvas-height" value="1024" min="64" max="4096" aria-label="Height">
        <button id="size-custom-apply">Apply</button>
      </div>
    </div>
  </div>
  <button class="btn btn-primary btn-export" id="btn-export">Export</button>
</header>
```

Delete from the right panel: the whole `<section class="config-section canvas-configs">` (including `#canvas-ratio` and `#custom-dims-row`) and the old `<button ... id="btn-export">` line. Change `.dashboard-wrapper` height handling: it now sits under the header (CSS below).

- [ ] **Step 2: Create `src/topbar.ts`**

```ts
import { state, notify, subscribe } from './state';
import { $ } from './dom';

const PRESETS: Record<string, [number, number]> = {
  '1:1': [1024, 1024], '16:9': [1920, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350]
};

export function initTopbar(): void {
  const chip = $('size-chip');
  const menu = $('size-menu');
  const widthInput = $('canvas-width') as unknown as HTMLInputElement;
  const heightInput = $('canvas-height') as unknown as HTMLInputElement;

  chip.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => {
    if (!chip.contains(e.target as Node) && !menu.contains(e.target as Node)) menu.hidden = true;
  });

  menu.querySelectorAll<HTMLButtonElement>('button[data-ratio]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ratio = btn.dataset.ratio!;
      const [w, h] = PRESETS[ratio];
      state.canvasRatio = ratio;
      state.canvasWidth = w;
      state.canvasHeight = h;
      menu.hidden = true;
      notify('canvasConfig');
    });
  });

  $('size-custom-apply').addEventListener('click', () => {
    state.canvasRatio = 'custom';
    state.canvasWidth = Math.min(4096, Math.max(64, parseInt(widthInput.value, 10) || 1024));
    state.canvasHeight = Math.min(4096, Math.max(64, parseInt(heightInput.value, 10) || 1024));
    menu.hidden = true;
    notify('canvasConfig');
  });

  subscribe((dirty) => {
    if (dirty.has('canvasConfig')) {
      chip.textContent = `${state.canvasWidth} × ${state.canvasHeight} ▾`;
    }
  });
}
```

- [ ] **Step 3: Update `src/canvas.ts`**

Remove the `#canvas-ratio`/`#canvas-width`/`#canvas-height` lookups and listeners and the `customDimsRow` logic. `applyCanvasDimensions()` simplifies to reading `state.canvasWidth/Height` only:

```ts
export function applyCanvasDimensions(): void {
  viewport.style.aspectRatio = `${state.canvasWidth}/${state.canvasHeight}`;
  if (state.canvasWidth >= state.canvasHeight) {
    viewport.style.width = '100%';
    viewport.style.height = 'auto';
  } else {
    viewport.style.width = 'auto';
    viewport.style.height = '100%';
  }
}
```

- [ ] **Step 4: Add topbar CSS to `src/style.css`**

```css
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px 0; gap: 12px;
}
.topbar-title { font-size: 13px; font-weight: 600; }
.size-chip-wrap { position: relative; }
.size-chip {
  font-family: inherit; font-size: 11px; color: var(--mut); background: var(--card);
  border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer;
  font-variant-numeric: tabular-nums; transition: color 0.15s, background 0.15s;
}
.size-chip:hover { color: var(--txt); background: var(--card-hi); }
.size-menu {
  position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: var(--card); border-radius: 10px; padding: 6px; z-index: 50;
  display: flex; flex-direction: column; gap: 2px; width: 220px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
}
.size-menu > button {
  font-family: inherit; font-size: 11px; text-align: left; padding: 7px 10px;
  border: none; border-radius: 6px; background: transparent; color: var(--txt); cursor: pointer;
}
.size-menu > button:hover { background: var(--card-hi); }
.size-custom { display: flex; align-items: center; gap: 6px; padding: 6px 4px 2px; color: var(--mut); }
.size-custom input { width: 60px; padding: 5px; font-size: 11px; background: var(--card-hi); }
.size-custom button {
  font-family: inherit; font-size: 11px; padding: 5px 10px; border: none; border-radius: 6px;
  background: #fff; color: #000; font-weight: 600; cursor: pointer;
}
.btn-export { width: auto; margin-top: 0; padding: 8px 20px; }
body { display: flex; flex-direction: column; }
.dashboard-wrapper { flex: 1; height: auto; min-height: 0; }
```

- [ ] **Step 5: Wire and verify**

In `main.ts` add `import { initTopbar } from './topbar';` and call `initTopbar();` before `initExport();`.
Run: `npx tsc --noEmit` — exit 0.
Browser: header shows title / size chip / Export; chip opens the dropdown; each preset resizes the viewport and updates the chip text; custom apply clamps 64–4096; Export still downloads; the right panel no longer has canvas settings.

- [ ] **Step 6: Commit**

```bash
git add index.html src/topbar.ts src/canvas.ts src/main.ts src/style.css
git commit -m "feat: top bar with size chip dropdown and relocated export button

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Icon rail with panel toggles

**Files:**
- Modify: `index.html` (add rail inside `.dashboard-wrapper` as first child), `src/main.ts` (init), `src/style.css`
- Create: `src/rail.ts`

**Interfaces:**
- Consumes: `$` from `./dom`. The Add buttons re-dispatch clicks to the existing `#btn-add-image` / `#btn-add-text` buttons (no duplicated logic).
- Produces: `initRail(): void`. Toggling adds/removes `hide-left` / `hide-right` classes on `.dashboard-wrapper`.

- [ ] **Step 1: Update `index.html`**

First child of `.dashboard-wrapper`:

```html
<nav class="rail" aria-label="Toolbar">
  <button class="rail-btn active" id="rail-layers" title="Toggle layers panel">▣</button>
  <button class="rail-btn" id="rail-add-image" title="Add image layer">✚</button>
  <button class="rail-btn" id="rail-add-text" title="Add text layer">T</button>
  <button class="rail-btn active" id="rail-props" title="Toggle properties panel">◧</button>
</nav>
```

- [ ] **Step 2: Create `src/rail.ts`**

```ts
import { $ } from './dom';

export function initRail(): void {
  const wrapper = document.querySelector('.dashboard-wrapper') as HTMLElement;
  const railLayers = $('rail-layers');
  const railProps = $('rail-props');

  railLayers.addEventListener('click', () => {
    wrapper.classList.toggle('hide-left');
    railLayers.classList.toggle('active');
  });
  railProps.addEventListener('click', () => {
    wrapper.classList.toggle('hide-right');
    railProps.classList.toggle('active');
  });
  $('rail-add-image').addEventListener('click', () => $('btn-add-image').click());
  $('rail-add-text').addEventListener('click', () => $('btn-add-text').click());
}
```

- [ ] **Step 3: CSS**

```css
.dashboard-wrapper { grid-template-columns: 44px 250px 1fr 280px; }
.rail {
  background: var(--panel); border-radius: 12px; padding: 10px 0;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}
.rail-btn {
  width: 30px; height: 30px; border: none; border-radius: 8px; background: transparent;
  color: var(--mut); font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.rail-btn:hover, .rail-btn.active { background: var(--card-hi); color: var(--txt); }
.left-panel, .right-panel { transition: opacity 0.2s ease, transform 0.25s var(--ease); }
.dashboard-wrapper.hide-left { grid-template-columns: 44px 0 1fr 280px; }
.dashboard-wrapper.hide-left .left-panel { opacity: 0; transform: translateX(-12px); padding: 0; overflow: hidden; pointer-events: none; }
.dashboard-wrapper.hide-right { grid-template-columns: 44px 250px 1fr 0; }
.dashboard-wrapper.hide-left.hide-right { grid-template-columns: 44px 0 1fr 0; }
.dashboard-wrapper.hide-right .right-panel { opacity: 0; transform: translateX(12px); padding: 0; overflow: hidden; pointer-events: none; }
.dashboard-wrapper { transition: grid-template-columns 0.25s var(--ease); }
```

- [ ] **Step 4: Wire, verify, commit**

`main.ts`: `import { initRail } from './rail';` + `initRail();`.
Run: `npx tsc --noEmit` — exit 0.
Browser: rail toggles slide panels away and back with the canvas expanding smoothly; rail + / T buttons add layers.

```bash
git add index.html src/rail.ts src/main.ts src/style.css
git commit -m "feat: icon rail with panel toggles and quick add buttons

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Effect-stack rows in Properties

**Files:**
- Modify: `index.html` (replace `#section-filters` content), `src/properties-panel.ts`, `src/state.ts` (flip `*On` defaults to `false`), `src/style.css`

**Interfaces:**
- Consumes: `bindSlider` from Task 5, `.switch` CSS from Task 6.
- Produces: effect rows driven by an `EFFECTS` config. Rendering already honors the flags via `getFilterString` (Task 1), so this task only changes defaults + UI.

- [ ] **Step 1: In `src/state.ts`**, change `createNewLayer` to `blurOn: false, contrastOn: false, saturationOn: false, brightnessOn: false` (values keep their neutral defaults).

- [ ] **Step 2: Replace `#section-filters` inner HTML in `index.html`**

```html
<section class="config-section" id="section-filters">
  <h3>Active Effects</h3>
  <div id="effects-stack"></div>
  <div class="fx-row" id="fx-invert">
    <div class="fx-top">
      <span class="fx-name">Invert Colors</span>
      <button class="switch" id="prop-invert" role="switch" aria-checked="false"></button>
    </div>
  </div>
</section>
```

Delete the old blur/contrast/saturation/brightness `control-row` blocks and the old invert checkbox row.

- [ ] **Step 3: Generate rows in `src/properties-panel.ts`**

```ts
type EffectKey = 'blur' | 'brightness' | 'contrast' | 'saturation';
const EFFECTS: { key: EffectKey; on: keyof LayerState; label: string; min: number; max: number; unit: string; firstOn: number; imageOnly: boolean }[] = [
  { key: 'blur', on: 'blurOn', label: 'Blur', min: 0, max: 20, unit: 'px', firstOn: 4, imageOnly: false },
  { key: 'brightness', on: 'brightnessOn', label: 'Brightness', min: 0, max: 200, unit: '%', firstOn: 100, imageOnly: true },
  { key: 'contrast', on: 'contrastOn', label: 'Contrast', min: 0, max: 200, unit: '%', firstOn: 100, imageOnly: true },
  { key: 'saturation', on: 'saturationOn', label: 'Saturation', min: 0, max: 200, unit: '%', firstOn: 100, imageOnly: true },
];

const effectEls = new Map<EffectKey, { row: HTMLElement; sw: HTMLButtonElement; range: HTMLInputElement; chip: HTMLElement }>();

function buildEffectRows(): void {
  const stack = $('effects-stack');
  EFFECTS.forEach((fx) => {
    const row = document.createElement('div');
    row.className = 'fx-row';
    row.dataset.fx = fx.key;
    if (fx.imageOnly) row.classList.add('filter-image-only');
    row.innerHTML = `
      <div class="fx-top">
        <span class="fx-name">${fx.label}</span>
        <button class="switch" role="switch" aria-checked="false"></button>
      </div>
      <div class="fx-body"><div class="fx-body-inner">
        <input type="range" min="${fx.min}" max="${fx.max}" value="${fx.min}">
        <span class="value-display value-chip">${fx.min}${fx.unit}</span>
      </div></div>`;
    stack.appendChild(row);
    const sw = row.querySelector('.switch') as HTMLButtonElement;
    const range = row.querySelector('input') as HTMLInputElement;
    const chip = row.querySelector('.value-chip') as HTMLElement;
    effectEls.set(fx.key, { row, sw, range, chip });

    sw.addEventListener('click', () => {
      const layer = getActiveLayer();
      if (!layer) return;
      const nowOn = !(layer as any)[fx.on];
      (layer as any)[fx.on] = nowOn;
      if (nowOn && fx.key === 'blur' && layer.blur === 0) {
        layer.blur = fx.firstOn; // first-time ON must visibly do something (spec §4)
      }
      syncEffectRow(fx.key, layer);
      notify('layerProps');
    });
    range.addEventListener('input', () => {
      const layer = getActiveLayer();
      if (!layer) return;
      (layer as any)[fx.key] = parseInt(range.value, 10);
      chip.textContent = `${range.value}${fx.unit}`;
      notify('layerProps');
    });
  });
}

function syncEffectRow(key: EffectKey, layer: LayerState): void {
  const fx = EFFECTS.find((f) => f.key === key)!;
  const els = effectEls.get(key)!;
  const on = Boolean((layer as any)[fx.on]);
  els.sw.setAttribute('aria-checked', String(on));
  els.row.classList.toggle('on', on);
  if (document.activeElement !== els.range) els.range.value = String(layer[key]);
  els.chip.textContent = `${layer[key]}${fx.unit}`;
}
```

Call `buildEffectRows()` at the top of `initPropertiesPanel()`. In `syncPanel()`, replace the old blur/contrast/saturation/brightness sync lines with `EFFECTS.forEach((fx) => syncEffectRow(fx.key, layer));` (guard `imageOnly` rows with the existing `.filter-image-only` show/hide). Replace the old invert-checkbox binding with the `#prop-invert` switch button:

```ts
$('prop-invert').addEventListener('click', () => {
  const layer = getActiveLayer();
  if (!layer) return;
  layer.invert = !layer.invert;
  $('prop-invert').setAttribute('aria-checked', String(layer.invert));
  notify('layerProps');
});
```

and in `syncPanel()`: `$('prop-invert').setAttribute('aria-checked', String(layer.invert));`

- [ ] **Step 4: CSS**

```css
.fx-row { background: var(--card); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
.fx-top { display: flex; align-items: center; justify-content: space-between; }
.fx-name { font-weight: 500; }
.fx-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.25s var(--ease); }
.fx-body-inner { overflow: hidden; display: flex; align-items: center; gap: 10px; }
.fx-row.on .fx-body { grid-template-rows: 1fr; }
.fx-row.on .fx-body-inner { padding-top: 10px; }
.fx-body input[type="range"] { flex: 1; }
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` — exit 0.
Browser: new layers start with all effects OFF (neutral render); toggling Blur ON animates the row open and applies 4px; toggling OFF renders sharp but remembers 4px when re-enabled; image-only rows hide for text layers; export honors ON/OFF states (blur off exports sharp).

```bash
git add index.html src/properties-panel.ts src/state.ts src/style.css
git commit -m "feat: effect-stack properties rows with pill toggles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Value chips, double-click reset, blend segmented control

**Files:**
- Modify: `index.html` (transform section markup: chips replace `.value-display` spans; blend select → segmented control), `src/properties-panel.ts`, `src/style.css`

**Interfaces:**
- Consumes: `PROP_DEFAULTS` from `./state`; `bindSlider`, `effectEls` from Task 9.
- Produces: `attachChip(range: HTMLInputElement, chip: HTMLElement, unit: string): void` and `attachReset(range: HTMLInputElement, def: number): void` — applied to every slider (opacity, X, Y, scale, font size, and all effect rows). Blend UI: `#blend-seg` with buttons `normal`, alt slot, `More ▾` + `#blend-menu`.

- [ ] **Step 1: Chip + reset helpers in `src/properties-panel.ts`**

```ts
function attachChip(range: HTMLInputElement, chip: HTMLElement, unit: string): void {
  chip.classList.add('value-chip');
  chip.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = range.min; input.max = range.max; input.value = range.value;
    input.className = 'chip-input';
    chip.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const commit = (apply: boolean) => {
      if (done) return; done = true;
      if (apply) {
        let v = parseInt(input.value, 10);
        if (!isNaN(v)) {
          v = Math.min(parseInt(range.max, 10), Math.max(parseInt(range.min, 10), v));
          range.value = String(v);
          range.dispatchEvent(new Event('input'));
        }
      }
      input.replaceWith(chip);
      chip.textContent = `${range.value}${unit}`;
    };
    input.addEventListener('blur', () => commit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
  });
}

function attachReset(range: HTMLInputElement, def: number): void {
  range.addEventListener('dblclick', () => {
    range.value = String(def);
    range.dispatchEvent(new Event('input'));
  });
}
```

Apply to every slider in `initPropertiesPanel()` — e.g. `attachChip(propXOffset, $('x-offset-value'), '%'); attachReset(propXOffset, PROP_DEFAULTS.xOffset);` for X/Y/scale/opacity/fontSize, and inside `buildEffectRows()` for each effect: `attachChip(range, chip, fx.unit); attachReset(range, PROP_DEFAULTS[fx.key]);`. For opacity, chip editing replaces the old `#prop-opacity-num` number input — delete that input and its listener; the slider-labels row becomes `<span>0%</span><span class="value-display" id="opacity-value">100%</span><span>100%</span>` and `bindSlider(propOpacityRange, 'opacity', 'opacity-value', '%')`.

- [ ] **Step 2: Blend segmented control**

`index.html` — replace the `#prop-blend` select block with:

```html
<div class="control-row">
  <label>Blending Mode</label>
  <div class="seg" id="blend-seg">
    <button data-blend="normal" class="active">Normal</button>
    <button data-blend="multiply" id="blend-alt">Multiply</button>
    <button id="blend-more">More ▾</button>
  </div>
  <div class="size-menu blend-menu" id="blend-menu" hidden>
    <button data-blend="screen">Screen</button>
    <button data-blend="overlay">Overlay</button>
    <button data-blend="darken">Darken</button>
    <button data-blend="lighten">Lighten</button>
  </div>
</div>
```

`properties-panel.ts` — replace the select binding:

```ts
function setBlend(mode: string): void {
  const layer = getActiveLayer();
  if (!layer) return;
  layer.blendMode = mode;
  syncBlendUI(mode);
  notify('layerProps');
}

function syncBlendUI(mode: string): void {
  const alt = $('blend-alt') as HTMLButtonElement;
  if (mode !== 'normal' && mode !== alt.dataset.blend) {
    alt.dataset.blend = mode;
    alt.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  }
  document.querySelectorAll('#blend-seg button[data-blend]').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.blend === mode);
  });
}
```

Wire: seg `data-blend` buttons call `setBlend`, `#blend-more` toggles `#blend-menu`, menu buttons call `setBlend` + hide menu, outside-click hides menu (same pattern as size menu). In `syncPanel()` call `syncBlendUI(layer.blendMode)`.

- [ ] **Step 3: CSS**

```css
.value-chip { cursor: pointer; background: var(--card-hi); border-radius: 5px; padding: 2px 7px; transition: color 0.15s; }
.value-chip:hover { color: var(--txt); }
.chip-input { width: 56px; padding: 2px 6px; font-size: 10px; text-align: right; background: var(--card-hi); }
.blend-menu { top: auto; left: 0; transform: none; width: 140px; }
.control-row { position: relative; }
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` — exit 0.
Browser: click any value chip → type 37 → Enter → slider and preview jump; Escape cancels; out-of-range clamps; double-click any slider resets (opacity→100, X→0, blur→0…); blend segmented switches Normal/Multiply; "More ▾" picks Screen and it appears as the active middle slot; export respects the chosen blend.

```bash
git add index.html src/properties-panel.ts src/style.css
git commit -m "feat: editable value chips, double-click reset, segmented blend control

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Text section restyle + inline layer rename

**Files:**
- Modify: `index.html` (properties header, remove `#prop-name` row), `src/properties-panel.ts`, `src/dom.ts` (add `inlineEdit`), `src/layers-panel.ts` (dblclick rename on card), `src/style.css`

**Interfaces:**
- Consumes: `notify('layerProps')` refreshes both the card label and the panel header.
- Produces: `inlineEdit(el: HTMLElement, current: string, onCommit: (v: string) => void): void` in `dom.ts`.

- [ ] **Step 1: `inlineEdit` in `src/dom.ts`**

```ts
export function inlineEdit(el: HTMLElement, current: string, onCommit: (v: string) => void): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'inline-edit';
  el.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = (apply: boolean) => {
    if (done) return; done = true;
    input.replaceWith(el);
    if (apply && input.value.trim()) onCommit(input.value.trim());
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
}
```

- [ ] **Step 2: Panel header with layer name**

`index.html` — right panel header becomes:

```html
<h2>Properties</h2>
<button class="layer-name-chip" id="prop-layer-name" title="Click to rename"></button>
```

Delete the `Layer Name` control-row (`#prop-name`).

`properties-panel.ts` — remove the `propNameInput` binding; add:

```ts
const nameChip = $('prop-layer-name');
nameChip.addEventListener('click', () => {
  const layer = getActiveLayer();
  if (!layer) return;
  inlineEdit(nameChip, layer.name, (v) => {
    layer.name = v;
    notify('layerProps');
  });
});
```

In `syncPanel()`: `nameChip.textContent = layer.name;`. In `updateVisibility()`, hide the chip when no layer is active.

- [ ] **Step 3: Card double-click rename in `src/layers-panel.ts`**

Inside `createCard`, after the click listener:

```ts
const nameEl = card.querySelector('.layer-name-label') as HTMLElement;
nameEl.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  const layer = findLayer(id);
  if (!layer) return;
  inlineEdit(nameEl, layer.name, (v) => {
    layer.name = v;
    notify('layerProps');
  });
});
```

(Import `inlineEdit` from `./dom`.)

- [ ] **Step 4: CSS**

```css
.layer-name-chip {
  font-family: inherit; font-size: 11px; color: var(--mut); background: transparent;
  border: none; cursor: pointer; padding: 0; margin: -10px 0 14px; text-align: left;
  transition: color 0.15s;
}
.layer-name-chip:hover { color: var(--txt); }
.inline-edit { font-size: 11px; padding: 2px 6px; width: 100%; }
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` — exit 0.
Browser: panel header shows "Properties / Text Overlay"; clicking the name edits inline (Enter commits, Escape cancels, empty reverts); double-clicking a layer card's name renames in place; both stay in sync; text section (content/font/size/color) still fully works with the new styling.

```bash
git add index.html src/dom.ts src/properties-panel.ts src/layers-panel.ts src/style.css
git commit -m "feat: inline layer rename in panel header and layer cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Canvas click-select and drag-move

**Files:**
- Modify: `src/canvas.ts`, `src/style.css`

**Interfaces:**
- Consumes: existing `renderViewport()`; layer elements carry `data-id`.
- Produces: pointer interaction on `#canvas-viewport`. Selected layer gets `.canvas-selected` class (white outline). Drag writes `layer.xOffset/yOffset` (integers, clamped −100…100) and fires `notify('layerProps')` — sliders/chips follow automatically via `syncPanel`. **`syncPanel` must run on `layerProps` too** when the change originated outside the panel: in `properties-panel.ts`, extend the subscriber condition to `dirty.has('selection') || dirty.has('structure') || dirty.has('layerProps')` (the existing focused-element guard prevents input fights).

- [ ] **Step 1: Enable hit-testing in `renderViewport()`**

In `src/canvas.ts`, inside the per-layer update, add:

```ts
el.style.pointerEvents = 'auto';
el.classList.toggle('canvas-selected', layer.id === state.activeLayerId);
```

and CSS:

```css
.canvas-viewport .layer-preview-el { pointer-events: auto; cursor: grab; }
.canvas-viewport .layer-preview-el:active { cursor: grabbing; }
.canvas-viewport .layer-preview-el.canvas-selected { outline: 1.5px solid rgba(255, 255, 255, 0.8); outline-offset: -1.5px; }
```

(Remove `pointer-events: none;` from the Task 6 `.layer-preview-el` rule.)

- [ ] **Step 2: Pointer handlers in `initCanvas()`**

```ts
let drag: { id: string; startX: number; startY: number; origX: number; origY: number } | null = null;

viewport.addEventListener('pointerdown', (e) => {
  const target = (e.target as HTMLElement).closest('.layer-preview-el') as HTMLElement | null;
  if (!target || !target.dataset.id) {
    state.activeLayerId = null;
    notify('selection');
    return;
  }
  const layer = state.layers.find((l) => l.id === target.dataset.id);
  if (!layer) return;
  if (state.activeLayerId !== layer.id) {
    state.activeLayerId = layer.id;
    notify('selection');
  }
  drag = { id: layer.id, startX: e.clientX, startY: e.clientY, origX: layer.xOffset, origY: layer.yOffset };
  viewport.setPointerCapture(e.pointerId);
  e.preventDefault();
});

viewport.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const layer = state.layers.find((l) => l.id === drag!.id);
  if (!layer) return;
  const rect = viewport.getBoundingClientRect();
  const clamp = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));
  layer.xOffset = clamp(drag.origX + ((e.clientX - drag.startX) / rect.width) * 100);
  layer.yOffset = clamp(drag.origY + ((e.clientY - drag.startY) / rect.height) * 100);
  notify('layerProps');
});

const endDrag = () => { drag = null; };
viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);
```

Note: `getBoundingClientRect()` reflects any zoom scale (Task 13), so the percent math stays correct after zoom lands. Hidden layers already have their elements removed from the viewport, so they can't be hit.

- [ ] **Step 3: Extend the properties-panel subscriber** as described in Interfaces above.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` — exit 0.
Browser: clicking a layer on canvas selects it (white outline + panels update); clicking checkerboard deselects (panel shows empty state); dragging text moves it and the X/Y chips tick live; dragging is clamped at ±100; export position matches what a slider-set identical offset produces; topmost layer wins overlapping clicks.

```bash
git add src/canvas.ts src/properties-panel.ts src/style.css
git commit -m "feat: click-select and drag-move layers on canvas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Canvas zoom

**Files:**
- Modify: `index.html` (zoom pill under canvas), `src/canvas.ts`, `src/style.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: module-local `zoom` (0.25–4) and `panX/panY` in `canvas.ts` — preview-only, **never stored in exported state and never read by `export.ts`**. A wrapper div `#zoom-wrap` is added around the viewport.

- [ ] **Step 1: HTML**

Wrap the viewport and add the pill (inside `.canvas-container`'s parent, after it):

```html
<div class="canvas-container" id="canvas-container">
  <div id="zoom-wrap">
    <div class="canvas-viewport checkerboard-bg" id="canvas-viewport"></div>
  </div>
</div>
<div class="zoom-pill">
  <button id="zoom-out" title="Zoom out">−</button>
  <button id="zoom-readout" title="Reset zoom">100%</button>
  <button id="zoom-in" title="Zoom in">+</button>
</div>
```

- [ ] **Step 2: Zoom logic in `src/canvas.ts`**

```ts
let zoom = 1, panX = 0, panY = 0;
const zoomWrap = $('zoom-wrap');

function applyZoom(): void {
  zoomWrap.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  $('zoom-readout').textContent = `${Math.round(zoom * 100)}%`;
}

function setZoom(next: number, cx = 0, cy = 0): void {
  const clamped = Math.max(0.25, Math.min(4, next));
  const factor = clamped / zoom;
  panX -= cx * (factor - 1);
  panY -= cy * (factor - 1);
  zoom = clamped;
  if (zoom === 1) { panX = 0; panY = 0; }
  applyZoom();
}
```

In `initCanvas()`:

```ts
$('zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
$('zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
$('zoom-readout').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; applyZoom(); });

const container = $('canvas-container');
container.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const rect = container.getBoundingClientRect();
  const cx = e.clientX - rect.left - rect.width / 2 - panX;
  const cy = e.clientY - rect.top - rect.height / 2 - panY;
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9), cx, cy);
}, { passive: false });

// Pan by dragging empty container space when zoomed in
let pan: { startX: number; startY: number; origX: number; origY: number } | null = null;
container.addEventListener('pointerdown', (e) => {
  if (zoom <= 1 || (e.target !== container && e.target !== zoomWrap)) return;
  pan = { startX: e.clientX, startY: e.clientY, origX: panX, origY: panY };
  container.setPointerCapture(e.pointerId);
});
container.addEventListener('pointermove', (e) => {
  if (!pan) return;
  panX = pan.origX + (e.clientX - pan.startX);
  panY = pan.origY + (e.clientY - pan.startY);
  applyZoom();
});
container.addEventListener('pointerup', () => { pan = null; });
applyZoom();
```

- [ ] **Step 3: CSS**

```css
.canvas-container { overflow: hidden; }
#zoom-wrap { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; transition: transform 0.15s ease-out; }
.zoom-pill {
  display: flex; align-items: center; gap: 4px; margin-top: 12px;
  background: var(--card); border-radius: 999px; padding: 4px 8px;
}
.zoom-pill button {
  font-family: inherit; font-size: 11px; color: var(--mut); background: transparent;
  border: none; border-radius: 6px; padding: 3px 8px; cursor: pointer;
  font-variant-numeric: tabular-nums; transition: color 0.15s;
}
.zoom-pill button:hover { color: var(--txt); }
```

(`#zoom-wrap`'s flex centering replaces what `.canvas-container` did; keep `.canvas-container`'s own flex centering too — both are safe.)

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` — exit 0.
Browser: +/− steps 10%; readout click resets to 100% centered; Ctrl+scroll zooms toward the cursor; when zoomed >100%, dragging empty space pans while dragging a layer still moves the layer correctly (percent math unaffected); **export at 250% zoom is pixel-identical to export at 100%**.

```bash
git add index.html src/canvas.ts src/style.css
git commit -m "feat: preview zoom with pill control, ctrl+scroll, and panning

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: SVG icons + remaining micro-animations

**Files:**
- Modify: `src/dom.ts` (icon strings), `src/layers-panel.ts`, `src/rail.ts` + `index.html` (rail icons), `src/canvas.ts` (add-layer flash), `src/style.css`

**Interfaces:**
- Produces: `icons: Record<'eye'|'eyeOff'|'x'|'drag'|'plus'|'text'|'layers'|'sliders', string>` in `dom.ts` (16×16, `stroke="currentColor"`, `fill="none"`).

- [ ] **Step 1: Icons in `src/dom.ts`**

```ts
const svg = (body: string) =>
  `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  eye: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><line x1="3" y1="13" x2="13" y2="3"/>'),
  x: svg('<line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>'),
  drag: svg('<line x1="4" y1="5" x2="12" y2="5"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="4" y1="11" x2="12" y2="11"/>'),
  plus: svg('<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>'),
  text: svg('<line x1="3" y1="4" x2="13" y2="4"/><line x1="8" y1="4" x2="8" y2="13"/>'),
  layers: svg('<path d="M8 2 14 5 8 8 2 5Z"/><path d="M2 8.5 8 11.5 14 8.5"/><path d="M2 11.5 8 14.5 14 11.5"/>'),
  sliders: svg('<line x1="3" y1="5" x2="13" y2="5"/><circle cx="6" cy="5" r="1.5" fill="currentColor"/><line x1="3" y1="11" x2="13" y2="11"/><circle cx="10" cy="11" r="1.5" fill="currentColor"/>')
};
```

- [ ] **Step 2: Use them**

- `layers-panel.ts` `createCard`: `<span class="icon-drag">${icons.drag}</span>`, del button `innerHTML = icons.x`; `updateCard` sets `vis.innerHTML = layer.visible ? icons.eye : icons.eyeOff` (compare with a `data-vis` attribute instead of textContent: `if (vis.dataset.vis !== String(layer.visible)) { vis.dataset.vis = String(layer.visible); vis.innerHTML = ...; }`).
- `index.html` rail buttons: replace glyphs with `<span class="rail-ic"></span>` and in `rail.ts` set `railLayers.innerHTML = icons.layers;` etc. (`rail-add-image` → `icons.plus`, `rail-add-text` → `icons.text`, `rail-props` → `icons.sliders`).

- [ ] **Step 3: Entrance/exit animations**

CSS:

```css
@keyframes card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.layer-card { animation: card-in 0.25s var(--ease); }
.layer-card.leaving { opacity: 0; transform: translateX(-10px) scale(0.97); }
@keyframes panel-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.panel, .rail, .topbar { animation: panel-in 0.35s var(--ease) backwards; }
.left-panel { animation-delay: 0.05s; } .center-panel { animation-delay: 0.13s; } .right-panel { animation-delay: 0.21s; }
@keyframes canvas-flash { 0% { box-shadow: 0 20px 60px rgba(0,0,0,.55), 0 0 0 2px rgba(255,255,255,.5); } 100% { box-shadow: 0 20px 60px rgba(0,0,0,.55); } }
.canvas-viewport.flash { animation: canvas-flash 0.5s ease-out; }
.layer-card.dragging { opacity: 0.6; transform: scale(1.02); box-shadow: 0 8px 24px rgba(0,0,0,.5); }
.layer-card.drop-above { box-shadow: 0 -2px 0 0 #fff; }
```

`layers-panel.ts`:
- Delete path: instead of immediate state splice, add `card.classList.add('leaving')`, then after 150ms (`setTimeout`) do the splice + notify (guard double-clicks with a `deleting` Set).
- `dragstart`: `card.classList.add('dragging')`; `dragend`: remove it. `dragover` on a card: add `drop-above`; `dragleave`/`drop`: remove it.
- After `state.layers.unshift(...)` in both add-buttons and `addImageFromDataUrl`, call `flashCanvas()`:

`canvas.ts` exports:

```ts
export function flashCanvas(): void {
  viewport.classList.remove('flash');
  void viewport.offsetWidth;
  viewport.classList.add('flash');
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` — exit 0.
Browser: consistent monochrome SVG icons everywhere (no emoji); panels stagger in on load; new layer cards rise in; deleting animates out; dragging a card lifts it with a white insertion line; adding a layer flashes the canvas edge; toggle `prefers-reduced-motion` in devtools Rendering panel → all motion stops.

```bash
git add src/dom.ts src/layers-panel.ts src/canvas.ts src/rail.ts index.html src/style.css
git commit -m "feat: svg icon set and micro-animations across panels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Responsive layout + final verification sweep

**Files:**
- Modify: `src/style.css` (mobile block), `README.md` (screenshots/description if it references the old white UI)

- [ ] **Step 1: Mobile CSS**

Replace the Task 6 `@media (max-width: 1024px)` block:

```css
@media (max-width: 1024px) {
  body { overflow-y: auto; height: auto; }
  .dashboard-wrapper { display: flex; flex-direction: column; height: auto; }
  .rail { flex-direction: row; justify-content: center; padding: 6px 10px; }
  .panel { overflow-y: visible; }
  .dashboard-wrapper.hide-left .left-panel, .dashboard-wrapper.hide-right .right-panel { display: none; }
  .canvas-container { max-height: none; padding: 12px 0; }
  .topbar { flex-wrap: wrap; }
}
```

- [ ] **Step 2: Run the spec's full verification checklist (§10)**

1. Every control (sliders, chips, toggles, segmented, selects, color pickers) live-updates and round-trips through layer switching.
2. Effect toggles: OFF renders neutral, re-ON restores value, animations run.
3. Canvas: select order = stacking order; drag matches slider units; zoom in/out/fit + Ctrl+scroll; export framing identical to slider-produced state, at any zoom.
4. Export on all 4 backgrounds × all presets + custom dims.
5. Layer ops: add, delete, reorder, rename, visibility — all animated.
6. `preview_resize`/devtools at 900px: stacked layout fully usable, rail horizontal.
7. Reduced motion disables all animation.
8. Devtools console: zero errors during a full editing session; Performance panel: slider scrub with 10+ layers shows no per-tick layout storms from the layers list.

Fix anything found, then `npm run build` — exit 0.

- [ ] **Step 3: Update `README.md`** if it describes the white/minimalist-B&W UI: adjust the design description to "dark studio theme" and note the interactive canvas (drag, zoom) and effect-stack properties. Keep it factual, no marketing.

- [ ] **Step 4: Final commit**

```bash
git add src/style.css README.md
git commit -m "feat: responsive stacked layout for the dark studio redesign

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** §1 tokens/icons/checkerboard → T6/T14; §2 topbar/rail/floating/responsive → T6–T8, T15; §3 layers panel → T4 (reconciliation), T6 (style), T14 (animations, insertion line); §4 effect stack/chips/reset/blend/rename/empty state → T9–T11 (empty state = existing `#no-active-warning`, restyled in T6); §5 interactive canvas → T12–T13; §6 animations/toasts/reduced-motion → T1, T6, T14; §7 modules/perf → T1–T5; §8 error handling → T1 (toasts), T2 (failed-layer count), T4 (non-image rejection), T10 (chip clamping); §9 out of scope respected; §10 checklist → T15.
- **Type consistency:** flags `structure|selection|layerProps|canvasConfig` used identically in T3–T5, T7, T12; `getFilterString(layer, scaleFactor?)` defined T1, consumed T2/T3; `applyCanvasDimensions` defined T3, simplified T7; `inlineEdit` defined T11 and used in both call sites; `flashCanvas` defined and consumed in T14.
- **Known intentional deviations from current behavior:** default text content becomes "Edit me" (spec §4); opacity number input replaced by editable chip (spec §4); invert checkbox becomes a pill switch.
