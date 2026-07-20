# Phase B Painting Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** live verification runs on the preview server (`dev`, port 3000) at `http://localhost:3000/?audit-raf`. One browser pane → run inline. After any Vite HMR update, bare-URL dynamic imports return phantom module instances — verify via DOM/canvas pixels, or hard-restart the dev server before importing modules in snippets.

**Goal:** Brush (`B`), Pencil, Eraser (`E`), and Eyedropper (`I`) tools painting real pixels into image-layer bitmaps with one dirty-rect history command per stroke, per `docs/superpowers/specs/2026-07-18-painting-tools-design.md`.

**Architecture:** A fourth session type (`src/engine/stroke-session.ts`) accumulates stamps on a bitmap-space stroke canvas (points mapped through the existing `documentToLocal` inverse affine), previews through the compositor, and commits once on release. Pure geometry (`stroke-geometry.ts`) and per-tool settings (`paint-config.ts`) are vitest-covered; the engine returns typed refusal reasons so tools own the toasts and the engine stays DOM-free.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest with the established `vi.stubGlobal` bootstrap; `test:ui` source contracts; `?audit-raf` live harness.

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies.
- Tools: Brush (`B`), Pencil (nested in the Brush flyout, no letter shortcut), Eraser (`E`), Eyedropper (`I`). Clone Stamp / Mixer / Background Eraser stay grayed stubs.
- Paint target policy: image layers only; empty image layer → allocate a document-sized transparent bitmap centered at scale 100, bundled into the stroke's undo; text layers refuse with toast "Text layers can't be painted — Rasterize Type arrives in Phase D".
- Options: Brush/Eraser = Size (1–500 doc px, int), Hardness (0–100), Opacity (1–100); Pencil = Size only (hardness pinned 100); Eyedropper = sampled-hex display.
- One history command per stroke: `Brush stroke` / `Pencil stroke` / `Eraser stroke`, `bytes = rect.w × rect.h × 8`, do/undo via `putImageData` regions (+ bitmap de/allocation when the layer was empty). Stamp spacing = size/4 (min 1).
- Mutual exclusion: strokes refuse while transform/crop/guard sessions are live; `isEditingSessionLive()` gains the stroke session (freezes history mid-stroke); tool change cancels a live stroke.
- Commits: subject only, NO Co-Authored-By trailer; `git push origin main` after each task.
- All four gates before every commit: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`.
- Superseded `test:ui` contracts are replaced in the same task that changes the source.

---

### Task 1: `documentToBitmap` inverse mapping

**Files:**
- Modify: `src/engine/transform-geometry.ts` (after `documentToLocal`)
- Test: `tests/document-to-bitmap.test.ts`

**Interfaces:**
- Consumes: existing `documentToLocal(transform, point)` (centered local coords) and `safeSize`.
- Produces: `documentToBitmap(transform: LayerTransform, natural: Size, point: Point): Point` — bitmap pixel coordinates (origin top-left of the bitmap).

- [ ] **Step 1: Write the failing test**

Create `tests/document-to-bitmap.test.ts`:

```ts
import { expect, test } from 'vitest';
import { documentToBitmap, type LayerTransform } from '../src/engine/transform-geometry';

const base: LayerTransform = { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0 };
const natural = { w: 100, h: 50 };

test('identity: the layer center maps to the bitmap center', () => {
  expect(documentToBitmap(base, natural, { x: 0, y: 0 })).toEqual({ x: 50, y: 25 });
});

test('translation: doc offsets shift relative to the layer position', () => {
  const t = { ...base, x: 200, y: 300 };
  expect(documentToBitmap(t, natural, { x: 210, y: 295 })).toEqual({ x: 60, y: 20 });
});

test('scale: 200% halves the doc offset in bitmap space', () => {
  const t = { ...base, scaleX: 200, scaleY: 200 };
  expect(documentToBitmap(t, natural, { x: 20, y: -10 })).toEqual({ x: 60, y: 20 });
});

test('rotation: 90 degrees unrotates before offsetting', () => {
  const t = { ...base, rotation: 90 };
  const p = documentToBitmap(t, natural, { x: 0, y: -10 });
  expect(p.x).toBeCloseTo(40, 6);
  expect(p.y).toBeCloseTo(25, 6);
});

test('combined: translate + scale + rotation round-trips a known point', () => {
  const t: LayerTransform = { x: 512, y: 512, scaleX: 400, scaleY: 400, rotation: 0 };
  // fixture: 320x200 natural at 400% centered at 512 → doc (512,512) = bitmap (160,100)
  expect(documentToBitmap(t, { w: 320, h: 200 }, { x: 512, y: 512 })).toEqual({ x: 160, y: 100 });
  // doc x=512+40 (=10 bitmap px right at 400%)
  expect(documentToBitmap(t, { w: 320, h: 200 }, { x: 552, y: 512 })).toEqual({ x: 170, y: 100 });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/document-to-bitmap.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** — add to `src/engine/transform-geometry.ts` directly after `documentToLocal`:

```ts
export function documentToBitmap(transform: LayerTransform, natural: Size, point: Point): Point {
  const size = safeSize(natural);
  const local = documentToLocal(transform, point);
  return { x: local.x + size.w / 2, y: local.y + size.h / 2 };
}
```

- [ ] **Step 4: Run the test** — PASS (5 tests).
- [ ] **Step 5: Gates + commit**

```bash
git add src/engine/transform-geometry.ts tests/document-to-bitmap.test.ts
git commit -m "feat: add document-to-bitmap inverse mapping"
git push origin main
```

---

### Task 2: Pure stroke geometry

**Files:**
- Create: `src/engine/stroke-geometry.ts`
- Test: `tests/stroke-geometry.test.ts`

**Interfaces:**
- Consumes: `Point` from transform-geometry (type import only).
- Produces (used by Task 4):
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `stampPoints(from: Point, to: Point, spacing: number): Point[]` — stamps stepping `spacing` from `from` (exclusive) to `to` (inclusive); `[]` when the distance is 0.
  - `stampBounds(center: Point, radius: number): Rect` — integer-expanded bounds (floor/ceil, +1 px guard).
  - `unionRects(a: Rect | null, b: Rect): Rect`
  - `clampRect(rect: Rect, width: number, height: number): Rect | null` — integer intersection with `[0,width)×[0,height)`; `null` when empty.

- [ ] **Step 1: Write the failing test**

Create `tests/stroke-geometry.test.ts`:

```ts
import { expect, test } from 'vitest';
import { clampRect, stampBounds, stampPoints, unionRects } from '../src/engine/stroke-geometry';

test('stampPoints steps by spacing and always ends on the target', () => {
  const pts = stampPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
  expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  expect(pts.length).toBe(3); // 4, 8, 10
  expect(pts[0].x).toBeCloseTo(4);
  expect(stampPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 4)).toEqual([]);
});

test('stampBounds expands to integers with a 1px guard', () => {
  expect(stampBounds({ x: 10.4, y: 20.6 }, 5)).toEqual({ x: 4, y: 14, w: 13, h: 13 });
});

test('unionRects grows to cover both', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 5, y: 8, w: 10, h: 10 };
  expect(unionRects(a, b)).toEqual({ x: 0, y: 0, w: 15, h: 18 });
  expect(unionRects(null, b)).toEqual(b);
});

test('clampRect intersects with the bitmap and nulls when outside', () => {
  expect(clampRect({ x: -5, y: -5, w: 20, h: 8 }, 100, 100)).toEqual({ x: 0, y: 0, w: 15, h: 3 });
  expect(clampRect({ x: 200, y: 0, w: 10, h: 10 }, 100, 100)).toBeNull();
  expect(clampRect({ x: 90, y: 90, w: 40, h: 40 }, 100, 100)).toEqual({ x: 90, y: 90, w: 10, h: 10 });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/stroke-geometry.ts`:

```ts
import type { Point } from './transform-geometry';

export interface Rect { x: number; y: number; w: number; h: number }

export function stampPoints(from: Point, to: Point, spacing: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [];
  const step = Math.max(1, spacing);
  const points: Point[] = [];
  for (let d = step; d < distance; d += step) {
    points.push({ x: from.x + (dx * d) / distance, y: from.y + (dy * d) / distance });
  }
  points.push({ x: to.x, y: to.y });
  return points;
}

export function stampBounds(center: Point, radius: number): Rect {
  const x = Math.floor(center.x - radius) - 1;
  const y = Math.floor(center.y - radius) - 1;
  const right = Math.ceil(center.x + radius) + 1;
  const bottom = Math.ceil(center.y + radius) + 1;
  return { x, y, w: right - x, h: bottom - y };
}

export function unionRects(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

export function clampRect(rect: Rect, width: number, height: number): Rect | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.w));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.h));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}
```

- [ ] **Step 4: Run the test** — PASS (4 tests).
- [ ] **Step 5: Gates + commit**

```bash
git add src/engine/stroke-geometry.ts tests/stroke-geometry.test.ts
git commit -m "feat: add pure stroke geometry helpers"
git push origin main
```

---

### Task 3: Per-tool paint settings

**Files:**
- Create: `src/tools/paint-config.ts`
- Test: `tests/paint-config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 4, 6):
  - `type PaintToolId = 'brush' | 'pencil' | 'eraser'`
  - `getPaintSetting(tool: PaintToolId, key: 'size' | 'hardness' | 'opacity'): number`
  - `setPaintSetting(tool, key, value): void` — clamps (size 1–500 int, hardness 0–100, opacity 1–100); pencil hardness pinned to 100.
  - `nudgeSize(tool: PaintToolId, direction: 1 | -1): void` — Photoshop-style steps: below 10 → ±1, below 50 → ±5, else ±10.
  - `__resetPaintConfigForTest(): void`

- [ ] **Step 1: Write the failing test**

Create `tests/paint-config.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import { __resetPaintConfigForTest, getPaintSetting, nudgeSize, setPaintSetting } from '../src/tools/paint-config';

beforeEach(() => __resetPaintConfigForTest());

test('defaults per tool', () => {
  expect(getPaintSetting('brush', 'size')).toBe(24);
  expect(getPaintSetting('brush', 'hardness')).toBe(50);
  expect(getPaintSetting('brush', 'opacity')).toBe(100);
  expect(getPaintSetting('pencil', 'size')).toBe(4);
  expect(getPaintSetting('pencil', 'hardness')).toBe(100);
  expect(getPaintSetting('eraser', 'size')).toBe(32);
});

test('clamping and integer sizes', () => {
  setPaintSetting('brush', 'size', 9999);
  expect(getPaintSetting('brush', 'size')).toBe(500);
  setPaintSetting('brush', 'size', 0);
  expect(getPaintSetting('brush', 'size')).toBe(1);
  setPaintSetting('brush', 'size', 12.7);
  expect(getPaintSetting('brush', 'size')).toBe(13);
  setPaintSetting('brush', 'hardness', 150);
  expect(getPaintSetting('brush', 'hardness')).toBe(100);
  setPaintSetting('brush', 'opacity', 0);
  expect(getPaintSetting('brush', 'opacity')).toBe(1);
});

test('pencil hardness stays pinned to 100', () => {
  setPaintSetting('pencil', 'hardness', 30);
  expect(getPaintSetting('pencil', 'hardness')).toBe(100);
});

test('nudge steps follow Photoshop bands', () => {
  setPaintSetting('brush', 'size', 5);
  nudgeSize('brush', 1);
  expect(getPaintSetting('brush', 'size')).toBe(6);
  setPaintSetting('brush', 'size', 20);
  nudgeSize('brush', 1);
  expect(getPaintSetting('brush', 'size')).toBe(25);
  setPaintSetting('brush', 'size', 60);
  nudgeSize('brush', -1);
  expect(getPaintSetting('brush', 'size')).toBe(50);
  setPaintSetting('brush', 'size', 1);
  nudgeSize('brush', -1);
  expect(getPaintSetting('brush', 'size')).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/tools/paint-config.ts`:

```ts
export type PaintToolId = 'brush' | 'pencil' | 'eraser';
export type PaintSettingKey = 'size' | 'hardness' | 'opacity';

interface PaintSettings { size: number; hardness: number; opacity: number }

const DEFAULTS: Record<PaintToolId, PaintSettings> = {
  brush: { size: 24, hardness: 50, opacity: 100 },
  pencil: { size: 4, hardness: 100, opacity: 100 },
  eraser: { size: 32, hardness: 100, opacity: 100 }
};

let settings: Record<PaintToolId, PaintSettings> = structuredClone(DEFAULTS);

function clamp(key: PaintSettingKey, value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS.brush[key];
  if (key === 'size') return Math.min(500, Math.max(1, Math.round(value)));
  if (key === 'hardness') return Math.min(100, Math.max(0, Math.round(value)));
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function getPaintSetting(tool: PaintToolId, key: PaintSettingKey): number {
  return settings[tool][key];
}

export function setPaintSetting(tool: PaintToolId, key: PaintSettingKey, value: number): void {
  if (tool === 'pencil' && key === 'hardness') return; // pencil is always hard-edged
  settings[tool][key] = clamp(key, value);
}

export function nudgeSize(tool: PaintToolId, direction: 1 | -1): void {
  const current = settings[tool].size;
  const step = current < 10 ? 1 : current < 50 ? 5 : 10;
  settings[tool].size = clamp('size', current + step * direction);
}

export function __resetPaintConfigForTest(): void {
  settings = structuredClone(DEFAULTS);
}
```

- [ ] **Step 4: Run the test** — PASS (4 tests).
- [ ] **Step 5: Gates + commit**

```bash
git add src/tools/paint-config.ts tests/paint-config.test.ts
git commit -m "feat: add per-tool paint settings with clamping and size nudges"
git push origin main
```

---

### Task 4: Stroke session engine

**Files:**
- Create: `src/engine/stroke-session.ts`
- Test: `tests/stroke-session.test.ts`

**Interfaces:**
- Consumes: `documentToBitmap` (Task 1); `stampPoints`/`stampBounds`/`unionRects`/`clampRect`/`Rect` (Task 2); `PaintToolId` (Task 3); `state`, `notify` (`src/state.ts`); `layerNaturalSize`, `ImageLayer` (`src/engine/document.ts`); `history` + `Command`; `getTransformSession`, `getCropSession`, `isTransformSessionGuardOpen` (checked directly — no import cycle with session-status).
- Produces (used by Tasks 5, 6):
  - `interface StrokeConfig { tool: PaintToolId; size: number; hardness: number; opacity: number; color: string }`
  - `type StrokeRefusal = 'missing' | 'text-layer' | 'hidden' | 'busy'`
  - `beginStroke(layerId: string, config: StrokeConfig): { ok: true } | { ok: false; reason: StrokeRefusal }`
  - `addStrokePoint(point: Point): void` · `endStroke(): void` · `cancelStroke(): void`
  - `getStrokeSession(): { layerId: string; config: StrokeConfig; canvas: HTMLCanvasElement } | null`
  - `subscribeStrokeSession(fn: () => void): void`
  - The engine never toasts — tools translate refusal reasons (Task 6).

- [ ] **Step 1: Write the failing test**

Create `tests/stroke-session.test.ts` (extends the established stub with the 2D methods the session touches; `getImageData` returns real-sized buffers so byte accounting is testable):

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

function ctxStub(canvas: { width: number; height: number }) {
  return {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    measureText: (t: string) => ({ width: t.length * 10 }),
    drawImage: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctxStub(canvas) };
      return canvas;
    }
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
});

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let sessions: typeof import('../src/engine/transform-session');
let strokes: typeof import('../src/engine/stroke-session');

beforeAll(async () => {
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  sessions = await import('../src/engine/transform-session');
  strokes = await import('../src/engine/stroke-session');
});

const config = { tool: 'brush' as const, size: 20, hardness: 50, opacity: 100, color: '#ff0000' };

beforeEach(() => {
  strokes.cancelStroke();
  sessions.cancelTransform();
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function addImageLayer(withBitmap = true) {
  const layer = documentModel.createImageLayer(stateModule.state.doc);
  if (withBitmap) {
    const bitmap = document.createElement('canvas') as unknown as HTMLCanvasElement;
    (bitmap as { width: number }).width = 200;
    (bitmap as { height: number }).height = 100;
    layer.bitmap = bitmap;
  }
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

test('refusals: missing, text layer, hidden, busy', () => {
  expect(strokes.beginStroke('nope', config)).toEqual({ ok: false, reason: 'missing' });
  const text = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(text);
  expect(strokes.beginStroke(text.id, config)).toEqual({ ok: false, reason: 'text-layer' });
  const img = addImageLayer();
  img.visible = false;
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: false, reason: 'hidden' });
  img.visible = true;
  sessions.beginTransform(img.id, 'explicit');
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: false, reason: 'busy' });
  sessions.cancelTransform();
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: true });
});

test('a stroke commits exactly one command with region byte accounting', () => {
  const img = addImageLayer();
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: true });
  strokes.addStrokePoint({ x: img.x, y: img.y });
  strokes.addStrokePoint({ x: img.x + 20, y: img.y });
  strokes.endStroke();
  expect(strokes.getStrokeSession()).toBeNull();
  expect(history.entries().length).toBe(1);
  const entry = history.entries()[0];
  expect(entry.label).toBe('Brush stroke');
  expect(entry.bytes).toBeGreaterThan(0);
  expect(img.bitmapRev).toBe(1);
});

test('empty image layers allocate a doc-sized bitmap bundled into one undo', () => {
  const img = addImageLayer(false);
  expect(img.bitmap).toBeNull();
  expect(strokes.beginStroke(img.id, config)).toEqual({ ok: true });
  expect(img.bitmap).not.toBeNull();
  expect((img.bitmap as { width: number }).width).toBe(400);
  expect((img.bitmap as { height: number }).height).toBe(300);
  expect(img.scaleX).toBe(100);
  strokes.addStrokePoint({ x: 200, y: 150 });
  strokes.endStroke();
  expect(history.entries().length).toBe(1);
  history.undo();
  expect(img.bitmap).toBeNull();
  history.redo();
  expect(img.bitmap).not.toBeNull();
});

test('cancel discards everything including a fresh allocation', () => {
  const img = addImageLayer(false);
  strokes.beginStroke(img.id, config);
  strokes.addStrokePoint({ x: 200, y: 150 });
  strokes.cancelStroke();
  expect(img.bitmap).toBeNull();
  expect(history.entries().length).toBe(0);
  expect(strokes.getStrokeSession()).toBeNull();
});

test('strokes entirely outside the bitmap produce no command', () => {
  const img = addImageLayer();
  strokes.beginStroke(img.id, config);
  strokes.addStrokePoint({ x: img.x + 5000, y: img.y + 5000 });
  strokes.endStroke();
  expect(history.entries().length).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/stroke-session.ts`:

```ts
import { state, notify } from '../state';
import { layerNaturalSize, type ImageLayer } from './document';
import * as history from './history';
import { documentToBitmap, type Point } from './transform-geometry';
import { clampRect, stampBounds, stampPoints, unionRects, type Rect } from './stroke-geometry';
import type { PaintToolId } from '../tools/paint-config';
import { getTransformSession } from './transform-session';
import { getCropSession } from './crop-session';
import { isTransformSessionGuardOpen } from '../transform-session-guard';

export interface StrokeConfig {
  tool: PaintToolId;
  size: number;
  hardness: number;
  opacity: number;
  color: string;
}

export type StrokeRefusal = 'missing' | 'text-layer' | 'hidden' | 'busy';

interface Session {
  layerId: string;
  config: StrokeConfig;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  last: Point | null;
  dirty: Rect | null;
  allocated: boolean;
  prevTransform: { x: number; y: number; scaleX: number; scaleY: number } | null;
}

let session: Session | null = null;
const listeners: Array<() => void> = [];
const emit = () => listeners.forEach((fn) => fn());

export function getStrokeSession(): { layerId: string; config: StrokeConfig; canvas: HTMLCanvasElement } | null {
  return session ? { layerId: session.layerId, config: session.config, canvas: session.canvas } : null;
}

export function subscribeStrokeSession(fn: () => void): void {
  listeners.push(fn);
}

function activeImageLayer(layerId: string): ImageLayer | null {
  const layer = state.doc.layers.find((l) => l.id === layerId);
  return layer && layer.kind === 'image' ? layer : null;
}

function drawStamp(ctx: CanvasRenderingContext2D, point: Point, config: StrokeConfig): void {
  const radius = config.size / 2;
  // Eraser stamps opaque marks: the stroke canvas acts as an alpha mask via destination-out.
  const color = config.tool === 'eraser' ? '#000000' : config.color;
  if (config.tool === 'brush' && config.hardness < 100) {
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(Math.max(0, Math.min(1, config.hardness / 100)), color);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient as unknown as string;
  } else {
    ctx.fillStyle = color;
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function beginStroke(layerId: string, config: StrokeConfig): { ok: true } | { ok: false; reason: StrokeRefusal } {
  if (session) return { ok: false, reason: 'busy' };
  if (getTransformSession() || getCropSession() || isTransformSessionGuardOpen()) {
    return { ok: false, reason: 'busy' };
  }
  const layer = state.doc.layers.find((l) => l.id === layerId);
  if (!layer) return { ok: false, reason: 'missing' };
  if (layer.kind === 'text') return { ok: false, reason: 'text-layer' };
  if (!layer.visible) return { ok: false, reason: 'hidden' };

  let allocated = false;
  let prevTransform: Session['prevTransform'] = null;
  if (!layer.bitmap) {
    const bitmap = document.createElement('canvas');
    bitmap.width = state.doc.width;
    bitmap.height = state.doc.height;
    prevTransform = { x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY };
    layer.bitmap = bitmap;
    layer.bitmapRev++;
    layer.x = state.doc.width / 2;
    layer.y = state.doc.height / 2;
    layer.scaleX = 100;
    layer.scaleY = 100;
    allocated = true;
  }

  const canvas = document.createElement('canvas');
  canvas.width = layer.bitmap.width;
  canvas.height = layer.bitmap.height;
  session = {
    layerId,
    config,
    canvas,
    ctx: canvas.getContext('2d')!,
    last: null,
    dirty: null,
    allocated,
    prevTransform
  };
  emit();
  return { ok: true };
}

export function addStrokePoint(point: Point): void {
  if (!session) return;
  const layer = activeImageLayer(session.layerId);
  if (!layer || !layer.bitmap) return;
  const natural = layerNaturalSize(layer);
  const target = documentToBitmap(layer, natural, point);
  const stamps = session.last ? stampPoints(session.last, target, Math.max(1, session.config.size / 4)) : [target];
  for (const stamp of stamps) {
    drawStamp(session.ctx, stamp, session.config);
    session.dirty = unionRects(session.dirty, stampBounds(stamp, session.config.size / 2));
  }
  session.last = target;
  notify('composite');
}

function revertAllocation(layer: ImageLayer, prev: NonNullable<Session['prevTransform']>): void {
  layer.bitmap = null;
  layer.bitmapRev++;
  layer.x = prev.x;
  layer.y = prev.y;
  layer.scaleX = prev.scaleX;
  layer.scaleY = prev.scaleY;
}

export function cancelStroke(): void {
  if (!session) return;
  const layer = activeImageLayer(session.layerId);
  if (session.allocated && session.prevTransform && layer) {
    revertAllocation(layer, session.prevTransform);
  }
  session = null;
  emit();
  notify('layerProps', 'composite');
}

export function endStroke(): void {
  if (!session) return;
  const finished = session;
  session = null;
  const layer = activeImageLayer(finished.layerId);
  if (!layer || !layer.bitmap) { emit(); return; }

  const rect = finished.dirty
    ? clampRect(finished.dirty, layer.bitmap.width, layer.bitmap.height)
    : null;
  if (!rect) {
    if (finished.allocated && finished.prevTransform) revertAllocation(layer, finished.prevTransform);
    emit();
    notify('layerProps', 'composite');
    return;
  }

  const bctx = layer.bitmap.getContext('2d')!;
  const before = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  bctx.save();
  bctx.globalAlpha = finished.config.opacity / 100;
  bctx.globalCompositeOperation = finished.config.tool === 'eraser' ? 'destination-out' : 'source-over';
  bctx.drawImage(finished.canvas, 0, 0);
  bctx.restore();
  const after = bctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  layer.bitmapRev++;

  const labels: Record<PaintToolId, string> = {
    brush: 'Brush stroke',
    pencil: 'Pencil stroke',
    eraser: 'Eraser stroke'
  };
  const allocated = finished.allocated;
  const prev = finished.prevTransform;
  const width = layer.bitmap.width;
  const height = layer.bitmap.height;
  const docCenter = { x: state.doc.width / 2, y: state.doc.height / 2 };

  history.push({
    label: labels[finished.config.tool],
    bytes: rect.w * rect.h * 8,
    do: () => {
      if (allocated && !layer.bitmap) {
        const bitmap = document.createElement('canvas');
        bitmap.width = width;
        bitmap.height = height;
        layer.bitmap = bitmap;
        layer.x = docCenter.x;
        layer.y = docCenter.y;
        layer.scaleX = 100;
        layer.scaleY = 100;
      }
      layer.bitmap!.getContext('2d')!.putImageData(after, rect.x, rect.y);
      layer.bitmapRev++;
      notify('layerProps', 'composite');
    },
    undo: () => {
      if (allocated && prev) {
        revertAllocation(layer, prev);
      } else {
        layer.bitmap!.getContext('2d')!.putImageData(before, rect.x, rect.y);
        layer.bitmapRev++;
      }
      notify('layerProps', 'composite');
    }
  });
  emit();
  notify('layerProps', 'composite');
}
```

**Note on `history.push` semantics:** the engine's `push` executes the command's `do()` immediately (established behavior). Here the pixels are ALREADY composited before push, so `do()` re-applying `putImageData(after)` is an idempotent no-op on first execution — same pattern the layers panel uses for "Place image". Verify `Command`'s exact type in `src/engine/history.ts` (`{ label, do, undo, bytes? }`) before writing; if `push` requires `do` to perform the initial mutation, this idempotent form satisfies it.

- [ ] **Step 4: Run the test** — `npx vitest run tests/stroke-session.test.ts` → PASS (5 tests).
- [ ] **Step 5: Gates + commit**

```bash
git add src/engine/stroke-session.ts tests/stroke-session.test.ts
git commit -m "feat: add the stroke session engine with dirty-rect undo"
git push origin main
```

---

### Task 5: Compositor preview, session-status, and tool-change safety

**Files:**
- Modify: `src/engine/compositor.ts` (drawLayer image branch), `src/engine/session-status.ts`, `src/main.ts` (tool-change cancel + status hints)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `getStrokeSession`, `cancelStroke`, `subscribeStrokeSession` (Task 4).
- Produces: live stroke preview in every composite (screen + export path share it); `isEditingSessionLive()` includes strokes; any tool change cancels a live stroke; status line shows painting hints.

- [ ] **Step 1: Contracts first** — add to `tests/ui-layout.test.mjs`:

```js
test('stroke sessions preview in the compositor and freeze history', () => {
  const compositor = readFileSync(resolve(root, 'src/engine/compositor.ts'), 'utf8');
  assert.match(compositor, /getStrokeSession/);
  assert.match(compositor, /destination-out/);
  const sessionStatus = readFileSync(resolve(root, 'src/engine/session-status.ts'), 'utf8');
  assert.match(sessionStatus, /getStrokeSession/);
  assert.match(main, /cancelStroke/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui` → FAIL.

- [ ] **Step 3: Implement**

(a) `src/engine/session-status.ts` — extend the predicate (the existing contract regex `getTransformSession()) || Boolean(getCropSession(` keeps matching):

```ts
import { getTransformSession } from './transform-session';
import { getCropSession } from './crop-session';
import { getStrokeSession } from './stroke-session';
import { isTransformSessionGuardOpen } from '../transform-session-guard';

export function isEditingSessionLive(): boolean {
  return Boolean(getTransformSession()) || Boolean(getCropSession()) ||
    Boolean(getStrokeSession()) || isTransformSessionGuardOpen();
}
```

(b) `src/engine/compositor.ts` — import `getStrokeSession` from `./stroke-session`; replace the image branch of `drawLayer`:

```ts
  if (layer.kind === 'image') {
    if (layer.bitmap) {
      const stroke = getStrokeSession();
      const live = stroke && stroke.layerId === layer.id ? stroke : null;
      const half = { x: -layer.bitmap.width / 2, y: -layer.bitmap.height / 2 };
      if (live && live.config.tool === 'eraser') {
        // Truthful erase preview: punch the stroke out of a scratch copy.
        const scratch = document.createElement('canvas');
        scratch.width = layer.bitmap.width;
        scratch.height = layer.bitmap.height;
        const sctx = scratch.getContext('2d')!;
        sctx.drawImage(layer.bitmap, 0, 0);
        sctx.globalAlpha = live.config.opacity / 100;
        sctx.globalCompositeOperation = 'destination-out';
        sctx.drawImage(live.canvas, 0, 0);
        ctx.drawImage(scratch, half.x, half.y);
      } else {
        ctx.drawImage(layer.bitmap, half.x, half.y);
        if (live) {
          const outerAlpha = ctx.globalAlpha;
          ctx.globalAlpha = outerAlpha * (live.config.opacity / 100);
          ctx.drawImage(live.canvas, half.x, half.y);
          ctx.globalAlpha = outerAlpha;
        }
      }
    }
  } else {
```

(the text branch stays exactly as-is).

(c) `src/main.ts` — import `{ cancelStroke, getStrokeSession, subscribeStrokeSession }` from `./engine/stroke-session`; inside the existing `onToolChange` block that manages crop sessions, add `cancelStroke();` as the first line; in `syncContextStatus`, insert a stroke branch before the crop branch:

```ts
  if (getStrokeSession()) {
    status.textContent = 'Painting · Release to commit the stroke';
  } else if (getCropSession()) {
```

and register `subscribeStrokeSession(syncContextStatus);` next to the other subscriptions. Also extend the per-tool fallback hints (same `else` chain edited in the audit fixes):

```ts
    else if (tool.id === 'brush') status.textContent = 'Brush · Drag to paint · [ ] adjusts size';
    else if (tool.id === 'pencil') status.textContent = 'Pencil · Drag to draw · [ ] adjusts size';
    else if (tool.id === 'eraser') status.textContent = 'Eraser · Drag to erase · [ ] adjusts size';
    else if (tool.id === 'eyedropper') status.textContent = 'Eyedropper · Click to sample a color';
```

- [ ] **Step 4: Gates** — all four PASS (tools don't exist yet; the hints reference tool ids that simply never match).
- [ ] **Step 5: Commit**

```bash
git add src/engine/compositor.ts src/engine/session-status.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: preview live strokes in the compositor and freeze history mid-stroke"
git push origin main
```

---

### Task 6: Brush, Pencil, and Eraser tools

**Files:**
- Create: `src/tools/paint-shared.ts`, `src/tools/brush.ts`, `src/tools/pencil.ts`, `src/tools/eraser.ts`
- Modify: `src/dom.ts` (icons), `src/shell/toolbar-groups.ts`, `src/shell/toolbar.ts` (empty-shortcut label), `src/main.ts` (registrations + `[`/`]` commands)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: stroke session (Task 4), paint-config (Task 3), `getForeground` (color-state), `registerCommand`, `notify`.
- Produces: live `brush`/`pencil`/`eraser` tools; `paint.sizeDown`/`paint.sizeUp` commands on `[`/`]`.

- [ ] **Step 1: Contracts first** — add to `tests/ui-layout.test.mjs`:

```js
test('painting tools are live in the toolbar with size shortcuts', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  for (const live of ['brush', 'pencil', 'eraser']) {
    assert.match(groups, new RegExp(`tool:\\s*['"]${live}['"]`), `missing live tool ${live}`);
  }
  assert.match(main, /paint\.sizeDown/);
  assert.match(main, /paint\.sizeUp/);
  assert.match(main, /Brush · Drag to paint/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui` → FAIL (hint exists from Task 5 but the group/commands assertions fail; if the hint regex passes, the others still fail).

- [ ] **Step 3: Icons** — add to the `icons` map in `src/dom.ts`:

```ts
  brush: svg('<path d="M13.5 2.5 7.5 8.5"/><path d="M7.5 8.5C5.5 9 4.5 10.5 4.5 12.5c2 0 3.5-1 4-3z"/>'),
  pencil: svg('<path d="m3 13 .8-2.8L11 3l2 2-7.2 7.2L3 13z"/><line x1="9.5" y1="4.5" x2="11.5" y2="6.5"/>'),
  eraser: svg('<path d="m4 11 6-6 3.5 3.5-6 6H4z"/><line x1="3" y1="14.5" x2="13" y2="14.5"/>'),
  eyedropper: svg('<path d="M13.5 2.5a1.6 1.6 0 0 1 0 2.3L12 6.3 9.7 4l1.5-1.5a1.6 1.6 0 0 1 2.3 0z"/><path d="M9.7 4 3.5 10.2V12.5h2.3L12 6.3"/>')
```

- [ ] **Step 4: Implement `src/tools/paint-shared.ts`:**

```ts
import { state, notify } from '../state';
import { toast } from '../toast';
import { getForeground } from '../engine/color-state';
import {
  addStrokePoint, beginStroke, cancelStroke, endStroke, getStrokeSession,
  type StrokeRefusal
} from '../engine/stroke-session';
import { getActiveTool } from '../engine/tools';
import type { DocPoint, ToolOption } from '../engine/tools';
import { getPaintSetting, nudgeSize, setPaintSetting, type PaintToolId } from './paint-config';

const REASONS: Record<StrokeRefusal, string> = {
  missing: 'Select a layer to paint on.',
  'text-layer': "Text layers can't be painted — Rasterize Type arrives in Phase D",
  hidden: 'Layer is hidden.',
  busy: 'Finish the current session before painting.'
};

export function startPaintStroke(tool: PaintToolId, point: DocPoint): void {
  const result = beginStroke(state.doc.activeLayerId ?? '', {
    tool,
    size: getPaintSetting(tool, 'size'),
    hardness: getPaintSetting(tool, 'hardness'),
    opacity: getPaintSetting(tool, 'opacity'),
    color: getForeground()
  });
  if (!result.ok) { toast(REASONS[result.reason]); return; }
  addStrokePoint(point);
}

export function continuePaintStroke(point: DocPoint): void {
  if (getStrokeSession()) addStrokePoint(point);
}

export function finishPaintStroke(): void { endStroke(); }
export function abortPaintStroke(): void { cancelStroke(); }

export function paintOptions(tool: PaintToolId, full: boolean): ToolOption[] {
  const options: ToolOption[] = [{
    key: `${tool}-size`, label: 'Size', kind: 'number', group: 'brush',
    min: 1, max: 500, step: 1,
    get: () => getPaintSetting(tool, 'size'),
    set: (value) => { setPaintSetting(tool, 'size', value); }
  }];
  if (full) {
    options.push({
      key: `${tool}-hardness`, label: 'Hardness', kind: 'number', group: 'brush',
      min: 0, max: 100, step: 1,
      get: () => getPaintSetting(tool, 'hardness'),
      set: (value) => { setPaintSetting(tool, 'hardness', value); }
    }, {
      key: `${tool}-opacity`, label: 'Opacity', kind: 'number', group: 'brush',
      min: 1, max: 100, step: 1,
      get: () => getPaintSetting(tool, 'opacity'),
      set: (value) => { setPaintSetting(tool, 'opacity', value); }
    });
  }
  return options;
}

export function nudgeActivePaintSize(direction: 1 | -1): void {
  const id = getActiveTool().id;
  if (id !== 'brush' && id !== 'pencil' && id !== 'eraser') return;
  nudgeSize(id, direction);
  notify('view'); // refresh the options-bar size field
}
```

(Adjust the `ToolOption` usage to the exact union in `src/engine/tools.ts` — number options there use `{ key, label, kind: 'number', group, min, max, step, get, set, disabled? }`, which this matches.)

- [ ] **Step 5: The three tool files** — `src/tools/brush.ts`:

```ts
import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import {
  abortPaintStroke, continuePaintStroke, finishPaintStroke, paintOptions, startPaintStroke
} from './paint-shared';

export const brushTool: Tool = {
  id: 'brush', label: 'Brush', icon: icons.brush, cursor: 'crosshair', shortcut: 'b',
  onDown(p: DocPoint) { startPaintStroke('brush', p); },
  onMove(p: DocPoint) { continuePaintStroke(p); },
  onUp() { finishPaintStroke(); },
  onCancel() { abortPaintStroke(); },
  options: paintOptions('brush', true)
};
```

`src/tools/pencil.ts` — identical shape with `id: 'pencil'`, `label: 'Pencil'`, `icon: icons.pencil`, `shortcut: ''`, `startPaintStroke('pencil', p)`, `options: paintOptions('pencil', false)`.

`src/tools/eraser.ts` — identical shape with `id: 'eraser'`, `label: 'Eraser'`, `icon: icons.eraser`, `shortcut: 'e'`, `startPaintStroke('eraser', p)`, `options: paintOptions('eraser', true)`.

- [ ] **Step 6: Wire up**

(a) `src/shell/toolbar-groups.ts` — replace the `paint` group and split out erase:

```ts
  { id: 'paint', entries: [{ tool: 'brush' }, { tool: 'pencil' }, { stub: 'Mixer Brush', key: 'B', phase: 'E' }] },
  { id: 'erase', entries: [{ tool: 'eraser' }, { stub: 'Background Eraser', key: 'E', phase: 'E' }] },
```

(b) `src/shell/toolbar.ts` — `entryLabel` must omit empty shortcuts:

```ts
    return tool ? (tool.shortcut ? `${tool.label} (${tool.shortcut.toUpperCase()})` : tool.label) : entry.tool;
```

(c) `src/main.ts` — `import { brushTool } from './tools/brush';` (+ pencil/eraser), register after `registerTool(cropTool);`:

```ts
registerTool(brushTool);
registerTool(pencilTool);
registerTool(eraserTool);
```

and next to the color commands:

```ts
import { nudgeActivePaintSize } from './tools/paint-shared';

registerCommand({ id: 'paint.sizeDown', label: 'Decrease Brush Size', shortcut: '[', bindKey: true, run: () => nudgeActivePaintSize(-1) });
registerCommand({ id: 'paint.sizeUp', label: 'Increase Brush Size', shortcut: ']', bindKey: true, run: () => nudgeActivePaintSize(1) });
```

- [ ] **Step 7: Gates** — all four PASS.

- [ ] **Step 8: Live verify** (fresh `?audit-raf` load, fixture seeded, fixture layer selected):

1. `B` → brush active, options show Size/Hardness/Opacity, status hint correct. Set size 40, hardness 100, foreground `#e5484d`; synthetic pointer drag across the fixture center → red pixels at the stroke center (`getImageData` on `#doc-canvas`), **one** history entry `Brush stroke`; Ctrl+Z restores the exact before-pixel.
2. `[` shrinks size (40 → 30), `]` grows it; the options field updates; both dead while typing in a field.
3. Eraser (`E`), drag over the fixture → alpha 0 at the stroke center; undo restores.
4. Brush opacity 50 over the fixture green block → sampled pixel strictly between paint and block colors; undo.
5. Rotate the fixture 45° (properties rotation), stroke at a doc point over it → composited pixel at that doc point changes; undo ×2 (stroke + leave rotation), or undo stroke then reset rotation.
6. Ctrl+T session live → brush drag refuses with the busy toast, no history entry; Escape.
7. Select the empty "Background Image" layer → brush drag paints (bitmap allocated), ONE undo returns it to empty (thumbnail reverts).
8. Text layer selected → brush drag toasts the rasterize message, nothing painted.
9. Mid-stroke keyboard `V` (tool switch during a held drag) → stroke cancels, no history entry.

- [ ] **Step 9: Commit**

```bash
git add src/tools/paint-shared.ts src/tools/brush.ts src/tools/pencil.ts src/tools/eraser.ts src/dom.ts src/shell/toolbar-groups.ts src/shell/toolbar.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: add Brush, Pencil, and Eraser painting tools"
git push origin main
```

---

### Task 7: Eyedropper

**Files:**
- Create: `src/tools/eyedropper.ts`
- Modify: `src/shell/toolbar-groups.ts` (measure group), `src/main.ts` (registration)
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `renderToCanvas` (`src/engine/compositor.ts`), `setForeground` (color-state), `notify`.
- Produces: live `eyedropper` tool (`I`) with a sampled-hex display option.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('the eyedropper samples the composited document into the foreground', () => {
  const eyedropper = readFileSync(resolve(root, 'src/tools/eyedropper.ts'), 'utf8');
  assert.match(eyedropper, /renderToCanvas/);
  assert.match(eyedropper, /setForeground/);
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  assert.match(groups, /tool:\s*['"]eyedropper['"]/);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `src/tools/eyedropper.ts`:**

```ts
import { type Tool, type DocPoint } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { renderToCanvas } from '../engine/compositor';
import { setForeground } from '../engine/color-state';

let lastSample = '—';

function sample(p: DocPoint): void {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= state.doc.width || y >= state.doc.height) return;
  const pixel = renderToCanvas(state.doc).getContext('2d')!.getImageData(x, y, 1, 1).data;
  if (pixel[3] === 0) return; // transparent: keep the current foreground
  const hex = `#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  lastSample = hex;
  setForeground(hex);
  notify('view'); // refresh the sampled-hex display option
}

export const eyedropperTool: Tool = {
  id: 'eyedropper', label: 'Eyedropper', icon: icons.eyedropper, cursor: 'crosshair', shortcut: 'i',
  onDown(p: DocPoint) { sample(p); },
  onMove() {},
  onUp() {},
  options: [{ key: 'eyedropper-sample', label: 'Sampled', kind: 'display', get: () => lastSample }]
};
```

- [ ] **Step 4: Wire** — toolbar-groups measure group becomes `{ id: 'measure', entries: [{ tool: 'eyedropper' }] }`; `src/main.ts` imports and calls `registerTool(eyedropperTool);` after the eraser.

- [ ] **Step 5: Gates** — all four PASS.

- [ ] **Step 6: Live verify** — `I` activates the tool; clicking the fixture's green block sets the foreground chip to `#30a46c` and the options display shows it; clicking transparent pasteboard-adjacent canvas leaves the foreground unchanged; with the text layer active, sampling recolors the text (Phase A wiring — expected, verify no error).

- [ ] **Step 7: Commit**

```bash
git add src/tools/eyedropper.ts src/shell/toolbar-groups.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "feat: add the Eyedropper tool"
git push origin main
```

---

### Task 8: Brush outline cursor (droppable stretch)

**Files:**
- Modify: `src/canvas-overlay.ts` (hover circle), `src/canvas.ts` (track hover point)

**Interfaces:**
- Consumes: `getActiveTool`, paint-config sizes, `'view'` notifications.
- Produces: a circle of the current brush size under the pointer while brush/pencil/eraser is active.

- [ ] **Step 1: Implement**

(a) `src/canvas-overlay.ts` — add module state + drawing (called from `drawCanvasOverlay`'s existing body, after guides):

```ts
let hoverPoint: Point | null = null;
let hoverRadius = 0;

export function setPaintHover(point: Point | null, radiusDoc: number): void {
  hoverPoint = point;
  hoverRadius = radiusDoc;
}

function drawPaintCursor(ctx: CanvasRenderingContext2D, scale: number): void {
  if (!hoverPoint || hoverRadius <= 0) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  ctx.arc(hoverPoint.x, hoverPoint.y, hoverRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.arc(hoverPoint.x, hoverPoint.y, hoverRadius + 1 / scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

and invoke `drawPaintCursor(ctx, scale)` at the end of `drawCanvasOverlay`.

(b) `src/canvas.ts` — in the existing `pointermove` listener on `screenCanvas`, before routing:

```ts
    const tool = getActiveTool();
    if (tool.id === 'brush' || tool.id === 'pencil' || tool.id === 'eraser') {
      setPaintHover(screenToDoc(e), getPaintSetting(tool.id, 'size') / 2);
      notify('composite');
    } else {
      setPaintHover(null, 0);
    }
```

with imports `setPaintHover` from `./canvas-overlay` and `getPaintSetting` from `./tools/paint-config`. Also clear the hover on `pointerleave` (`screenCanvas.addEventListener('pointerleave', () => { setPaintHover(null, 0); notify('composite'); })`).

- [ ] **Step 2: Gates + live verify** — circle follows the pointer at brush size, scales with zoom, disappears for Move/Hand/Zoom/Crop and when leaving the canvas; painting still lands where the circle shows. **Droppable:** if the per-move composites visibly lag strokes, revert this task's changes and note "cursor dropped" in Task 9's close-out.

- [ ] **Step 3: Commit**

```bash
git add src/canvas-overlay.ts src/canvas.ts
git commit -m "feat: add the brush outline cursor"
git push origin main
```

---

### Task 9: Final regression, docs, and close-out

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/changelog.md`
- No source changes.

- [ ] **Step 1: Full live regression** — on `?audit-raf` at 1280×800: probe (surfaces incl. dock stacks) zero violations; one flow per Phase B surface (brush stroke + undo, pencil hard edge, eraser, opacity blend, `[`/`]`, eyedropper, empty-layer allocation round-trip, refusal toasts, mid-stroke history freeze — click a history row during a held stroke: inert); legacy flows: transform session + guard, crop apply/undo, save/open round-trip.

- [ ] **Step 2: Docs**

- `README.md`: Workspace table — extend the Toolbar row's description with "painting tools (Brush, Pencil, Eraser) and the Eyedropper"; Essential Shortcuts add `B` (Brush), `E` (Eraser), `I` (Eyedropper), `[` / `]` (brush size); Editing Workflow gains a short painting paragraph (strokes are per-pixel edits on image layers, one undo per stroke, empty layers auto-allocate, text layers need Phase D's rasterize).
- `docs/architecture.md`: in the engines section alongside `src/engine/transform-session.ts` / `crop-session.ts`, document `src/engine/stroke-session.ts` (bitmap-space stamps, inverse affine via `documentToLocal`, one dirty-rect command per stroke).
- `docs/changelog.md` top entry:

```markdown
## 3.3.0 - 2026-07-18

### Added

- **Painting tools**: Brush (`B`), Pencil, and Eraser (`E`) paint real pixels into image-layer bitmaps through a stroke session with one history command per stroke (dirty-rect undo, uniform stroke opacity, hardness falloff); the Eyedropper (`I`) samples the composited document into the foreground color; `[` and `]` adjust brush size; empty image layers allocate a canvas-sized bitmap on first paint. (Plan: 2026-07-18-painting-tools.)
```

- [ ] **Step 3: Gates + commit + protocol**

```bash
git add README.md docs/architecture.md docs/changelog.md
git commit -m "docs: document the painting tools and record 3.3.0"
git push origin main
```

AGENTS.md protocol: hooks refresh the graph; new modules (`stroke-session`, `stroke-geometry`, `paint-config`, four tool files) → `python -m graphify export obsidian`; `graphify-out/` stays untracked; update the project memory (Phase B shipped, Phase C next).
