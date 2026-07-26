# Phase D3a Type Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** live verification runs on the preview server (`dev`) at `http://localhost:<port>/?audit-raf` — read the port from `preview_start` (autoPort is on). Five harness rules, all learned the hard way in Phases B–D2:
> 1. A browser-console `import('/src/x.ts')` may be a **different module instance** than the app's. Prove instance sharing first (drive a change through the UI, read it back through the import); otherwise verify via DOM, canvas pixels, or by patching `CanvasRenderingContext2D.prototype`.
> 2. **Any prototype patch must be wrapped in `try/finally`.** A snippet that hits the 30-second cap aborts mid-await, the restore never runs, and the leaked patch degrades every later frame until reload.
> 3. **Keep browser snippets short.** Long ones hit the 30-second cap; split verification into small chunks.
> 4. Re-read `getBoundingClientRect()` *after* every tool change — the options bar changes rows and moves the canvas.
> 5. `history.entries().length` can stay flat after an undo (the redo tail truncates); assert `history.cursor()` deltas or command labels. An open tool flyout blocks keyboard tool-switching.

**Goal:** A rich-text layer model with styled spans, a pure layout engine (alignment, leading, tracking), a Type tool, full type properties, Rasterize Type, and Convert to Shape — per `docs/superpowers/specs/2026-07-22-type-engine-design.md`.

**Architecture:** A text layer becomes a flat string plus normalized style spans, so a caret will later be an integer index (D3b). Layout is a pure function over an injected measurement callback, which makes line breaking, alignment, leading, and tracking fully node-testable; the compositor and `layerNaturalSize` both read from it, so transform, snapping, and hit-testing keep working unchanged.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Vitest with the established `vi.stubGlobal` bootstrap; `test:ui` source contracts; `?audit-raf` live harness.

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies. **No font-parsing library** — glyph outlines are unavailable, which is why Convert to Shape traces a rasterization.
- Point type only: lines break **only** on `\n`. No paragraph box, no word wrap.
- Spans are contiguous, sorted, and cover `[0, text.length)`; `normalizeSpans` enforces this and repairs gaps, overlaps, and out-of-range spans rather than trusting callers.
- Clamps live in the model, not the UI: font size 8–512, leading 1–1000, tracking −100–500.
- Font families are limited to the four the app ships: `Inter`, `sans-serif`, `serif`, `monospace`.
- A line's height is the **maximum leading** among its runs; its baseline is `lineTop + 0.8 × maxFontSize` (the standard ascent approximation available without font metrics).
- Migration: a pre-D3 text layer becomes one span with `tracking: 0`, `leading: fontSize × 1.2`, `align: 'center'`. Content, styling, geometry, and alignment are preserved; glyphs shift vertically by a fraction of the font size because line positioning moves from centre-of-line to baseline. **Do not claim pixel-identical rendering.**
- The project file version **stays at 2** — the change is additive.
- The Type tool is inert while a stroke, transform, or crop session is live (`isEditingSessionLive()`).
- Commits: subject only, NO Co-Authored-By trailer; `git push origin main` after each task.
- All four gates before every commit: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`.
- Superseded `test:ui` contracts are replaced in the same task that changes the source.

## File structure

| File | Responsibility |
| --- | --- |
| `src/engine/text-model.ts` (create) | `TextStyle`, `StyleSpan`, `normalizeSpans`, `styleAt`, `applyStyleToRange`, `defaultTextStyle`, clamps, `migrateTextLayer` |
| `src/engine/text-layout.ts` (create) | Pure `layoutText(text, spans, align, measure)` → lines, pieces, baselines |
| `src/engine/document.ts` (modify) | `TextLayer` gains `spans` + `align`, loses `fontFamily`/`fontSize`/`color`; `createTextLayer`; `layerNaturalSize` text branch |
| `src/engine/compositor.ts` (modify) | Text branch renders from the layout |
| `src/engine/text-raster.ts` (create) | `rasterizeTextLayer`, `convertTextToShape` |
| `src/tools/type-tool.ts` (create) | Type tool (`T`): click to create or select |
| `src/tools/type-config.ts` (create) | Options-bar style state for the next layer, with clamps |
| `src/properties-panel.ts` (modify) | Text section: family, size, colour, alignment, leading, tracking |
| `src/shell/color-chips.ts` (modify) | Foreground → text colour now writes spans |
| `src/engine/commands.ts` (modify) | `cmdPatchLayer` patch type: `spans`, `align` |
| `src/engine/persistence.ts` (modify) | Migrate pre-D3 text layers on load |

---

### Task 1: Text style model

**Files:**
- Create: `src/engine/text-model.ts`
- Test: `tests/text-model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `interface TextStyle { fontFamily: string; fontSize: number; color: string; tracking: number; leading: number }`
  - `interface StyleSpan { start: number; end: number; style: TextStyle }`
  - `type TextAlign = 'left' | 'center' | 'right'`
  - `defaultTextStyle(): TextStyle`
  - `clampTextStyle(style: TextStyle): TextStyle`
  - `normalizeSpans(spans: StyleSpan[], textLength: number): StyleSpan[]`
  - `styleAt(spans: StyleSpan[], index: number): TextStyle`
  - `applyStyleToRange(spans, start, end, patch: Partial<TextStyle>, textLength): StyleSpan[]`

- [ ] **Step 1: Write the failing test**

Create `tests/text-model.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  applyStyleToRange, clampTextStyle, defaultTextStyle, normalizeSpans, styleAt,
  type StyleSpan, type TextStyle
} from '../src/engine/text-model';

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...defaultTextStyle(), ...patch });

test('the default style is a sane 64px Inter', () => {
  const d = defaultTextStyle();
  expect(d.fontFamily).toBe('Inter');
  expect(d.fontSize).toBe(64);
  expect(d.color).toBe('#000000');
  expect(d.tracking).toBe(0);
  expect(d.leading).toBeCloseTo(64 * 1.2, 6);
});

test('clamps bound size, leading, and tracking', () => {
  expect(clampTextStyle(style({ fontSize: 2 })).fontSize).toBe(8);
  expect(clampTextStyle(style({ fontSize: 9999 })).fontSize).toBe(512);
  expect(clampTextStyle(style({ leading: 0 })).leading).toBe(1);
  expect(clampTextStyle(style({ leading: 5000 })).leading).toBe(1000);
  expect(clampTextStyle(style({ tracking: -900 })).tracking).toBe(-100);
  expect(clampTextStyle(style({ tracking: 900 })).tracking).toBe(500);
  expect(clampTextStyle(style({ fontSize: Number.NaN })).fontSize).toBe(8);
});

test('normalizeSpans merges identical neighbours', () => {
  const spans: StyleSpan[] = [
    { start: 0, end: 3, style: style() },
    { start: 3, end: 7, style: style() }
  ];
  const out = normalizeSpans(spans, 7);
  expect(out.length).toBe(1);
  expect(out[0]).toMatchObject({ start: 0, end: 7 });
});

test('normalizeSpans keeps differing neighbours apart', () => {
  const spans: StyleSpan[] = [
    { start: 0, end: 3, style: style() },
    { start: 3, end: 7, style: style({ color: '#ff0000' }) }
  ];
  expect(normalizeSpans(spans, 7).length).toBe(2);
});

test('normalizeSpans fills gaps and clamps to the text length', () => {
  const spans: StyleSpan[] = [{ start: 2, end: 4, style: style({ color: '#ff0000' }) }];
  const out = normalizeSpans(spans, 6);
  expect(out[0].start).toBe(0);
  expect(out[out.length - 1].end).toBe(6);
  // every index is covered exactly once
  for (let i = 1; i < out.length; i++) expect(out[i].start).toBe(out[i - 1].end);
});

test('normalizeSpans on empty text yields no spans', () => {
  expect(normalizeSpans([{ start: 0, end: 5, style: style() }], 0)).toEqual([]);
});

test('styleAt reads the covering span and falls back to the default', () => {
  const spans = normalizeSpans([
    { start: 0, end: 3, style: style() },
    { start: 3, end: 6, style: style({ color: '#00ff00' }) }
  ], 6);
  expect(styleAt(spans, 0).color).toBe('#000000');
  expect(styleAt(spans, 4).color).toBe('#00ff00');
  expect(styleAt([], 0).color).toBe(defaultTextStyle().color);
});

test('applyStyleToRange splits a span and merges identical results', () => {
  const spans = normalizeSpans([{ start: 0, end: 10, style: style() }], 10);
  const out = applyStyleToRange(spans, 3, 6, { color: '#ff0000' }, 10);
  expect(out.length).toBe(3);
  expect(out.map((s) => [s.start, s.end])).toEqual([[0, 3], [3, 6], [6, 10]]);
  expect(out[1].style.color).toBe('#ff0000');
  expect(out[0].style.color).toBe('#000000');

  // applying the same colour to the whole string collapses back to one span
  const merged = applyStyleToRange(out, 0, 10, { color: '#000000' }, 10);
  expect(merged.length).toBe(1);
});

test('applyStyleToRange clamps the range and ignores empty ranges', () => {
  const spans = normalizeSpans([{ start: 0, end: 5, style: style() }], 5);
  expect(applyStyleToRange(spans, 4, 4, { color: '#ff0000' }, 5)).toEqual(spans);
  const out = applyStyleToRange(spans, -5, 99, { fontSize: 120 }, 5);
  expect(out.length).toBe(1);
  expect(out[0].style.fontSize).toBe(120);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/text-model.test.ts`
Expected: FAIL — cannot find module `../src/engine/text-model`.

- [ ] **Step 3: Implement** — create `src/engine/text-model.ts`:

```ts
export interface TextStyle {
  fontFamily: string;
  fontSize: number;      // DOCUMENT pixels, 8-512
  color: string;
  tracking: number;      // extra advance per character, -100..500
  leading: number;       // line height in document pixels, 1..1000
}

export interface StyleSpan { start: number; end: number; style: TextStyle }

export type TextAlign = 'left' | 'center' | 'right';

export const TEXT_FAMILIES = ['Inter', 'sans-serif', 'serif', 'monospace'] as const;

export function defaultTextStyle(): TextStyle {
  return { fontFamily: 'Inter', fontSize: 64, color: '#000000', tracking: 0, leading: 64 * 1.2 };
}

const bound = (value: number, lo: number, hi: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
};

export function clampTextStyle(style: TextStyle): TextStyle {
  return {
    fontFamily: style.fontFamily,
    fontSize: bound(style.fontSize, 8, 512, 8),
    color: style.color,
    tracking: bound(style.tracking, -100, 500, 0),
    leading: bound(style.leading, 1, 1000, 1)
  };
}

const sameStyle = (a: TextStyle, b: TextStyle): boolean =>
  a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.color === b.color &&
  a.tracking === b.tracking && a.leading === b.leading;

/**
 * Repair spans into the invariant the rest of the engine relies on: sorted,
 * contiguous, non-overlapping, covering exactly [0, textLength).
 */
export function normalizeSpans(spans: StyleSpan[], textLength: number): StyleSpan[] {
  if (textLength <= 0) return [];
  const sorted = [...spans]
    .map((s) => ({
      start: Math.max(0, Math.min(textLength, Math.floor(s.start))),
      end: Math.max(0, Math.min(textLength, Math.floor(s.end))),
      style: clampTextStyle(s.style)
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const out: StyleSpan[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor) {
      // Gap: fill it with the previous style, or the default at the very start.
      const filler = out.length ? out[out.length - 1].style : defaultTextStyle();
      out.push({ start: cursor, end: span.start, style: filler });
    }
    const start = Math.max(cursor, span.start);
    if (span.end > start) {
      out.push({ start, end: span.end, style: span.style });
      cursor = span.end;
    }
  }
  if (cursor < textLength) {
    const filler = out.length ? out[out.length - 1].style : defaultTextStyle();
    out.push({ start: cursor, end: textLength, style: filler });
  }

  const merged: StyleSpan[] = [];
  for (const span of out) {
    const last = merged[merged.length - 1];
    if (last && sameStyle(last.style, span.style)) last.end = span.end;
    else merged.push({ ...span, style: { ...span.style } });
  }
  return merged;
}

export function styleAt(spans: StyleSpan[], index: number): TextStyle {
  for (const span of spans) {
    if (index >= span.start && index < span.end) return span.style;
  }
  return spans.length ? spans[spans.length - 1].style : defaultTextStyle();
}

export function applyStyleToRange(
  spans: StyleSpan[], start: number, end: number, patch: Partial<TextStyle>, textLength: number
): StyleSpan[] {
  const from = Math.max(0, Math.min(textLength, Math.floor(start)));
  const to = Math.max(0, Math.min(textLength, Math.floor(end)));
  if (to <= from) return normalizeSpans(spans, textLength);

  const base = normalizeSpans(spans, textLength);
  const out: StyleSpan[] = [];
  for (const span of base) {
    // Portion before the range
    if (span.start < from) {
      out.push({ start: span.start, end: Math.min(span.end, from), style: { ...span.style } });
    }
    // Overlapping portion gets the patch
    const overlapStart = Math.max(span.start, from);
    const overlapEnd = Math.min(span.end, to);
    if (overlapEnd > overlapStart) {
      out.push({
        start: overlapStart, end: overlapEnd,
        style: clampTextStyle({ ...span.style, ...patch })
      });
    }
    // Portion after the range
    if (span.end > to) {
      out.push({ start: Math.max(span.start, to), end: span.end, style: { ...span.style } });
    }
  }
  return normalizeSpans(out, textLength);
}
```

- [ ] **Step 4: Run the test** — PASS (9 tests).
- [ ] **Step 5: Gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build` — all PASS.

```bash
git add src/engine/text-model.ts tests/text-model.test.ts
git commit -m "feat: add the styled-span text model"
git push origin main
```

---

### Task 2: Text layout engine

**Files:**
- Create: `src/engine/text-layout.ts`
- Test: `tests/text-layout.test.ts`

**Interfaces:**
- Consumes: `TextStyle`, `StyleSpan`, `TextAlign`, `styleAt` (Task 1).
- Produces (used by Tasks 3, 6, 7):
  - `type MeasureChar = (char: string, style: TextStyle) => number`
  - `interface LaidOutPiece { text: string; style: TextStyle; x: number; width: number; start: number }`
  - `interface LaidOutLine { pieces: LaidOutPiece[]; top: number; baseline: number; height: number; width: number }`
  - `interface TextLayout { lines: LaidOutLine[]; width: number; height: number }`
  - `layoutText(text: string, spans: StyleSpan[], align: TextAlign, measure: MeasureChar): TextLayout`
  - `const ASCENT_RATIO = 0.8`

Rules: split on `\n` only; within a line, consecutive characters sharing a style form one piece; a character's advance is `measure(char, style) + style.tracking`; line height is the maximum `leading` on that line; line baseline is `top + ASCENT_RATIO × maxFontSize`; block width is the widest line; alignment offsets each line inside the block.

- [ ] **Step 1: Write the failing test**

Create `tests/text-layout.test.ts`:

```ts
import { expect, test } from 'vitest';
import { ASCENT_RATIO, layoutText, type MeasureChar } from '../src/engine/text-layout';
import { defaultTextStyle, normalizeSpans, type StyleSpan, type TextStyle } from '../src/engine/text-model';

// Deterministic stub: every character is half the font size wide.
const measure: MeasureChar = (_char, style) => style.fontSize * 0.5;
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...defaultTextStyle(), ...patch });
const oneSpan = (text: string, patch: Partial<TextStyle> = {}): StyleSpan[] =>
  normalizeSpans([{ start: 0, end: text.length, style: style(patch) }], text.length);

test('empty text lays out to nothing', () => {
  const out = layoutText('', [], 'left', measure);
  expect(out.lines).toEqual([]);
  expect(out.width).toBe(0);
  expect(out.height).toBe(0);
});

test('a single line measures characters and sets one piece', () => {
  const text = 'abcd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10 }), 'left', measure);
  expect(out.lines.length).toBe(1);
  expect(out.lines[0].pieces.length).toBe(1);
  expect(out.lines[0].pieces[0].text).toBe('abcd');
  expect(out.lines[0].width).toBeCloseTo(4 * 5, 6);      // 4 chars x (10 * 0.5)
  expect(out.width).toBeCloseTo(20, 6);
});

test('tracking adds advance per character', () => {
  const text = 'abcd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10, tracking: 3 }), 'left', measure);
  expect(out.lines[0].width).toBeCloseTo(4 * (5 + 3), 6);
});

test('newlines split lines and stack them by leading', () => {
  const text = 'ab\ncd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10, leading: 20 }), 'left', measure);
  expect(out.lines.length).toBe(2);
  expect(out.lines[0].top).toBe(0);
  expect(out.lines[1].top).toBeCloseTo(20, 6);
  expect(out.height).toBeCloseTo(40, 6);
});

test('a line height is the maximum leading among its runs', () => {
  const text = 'abcd';
  const spans = normalizeSpans([
    { start: 0, end: 2, style: style({ fontSize: 10, leading: 12 }) },
    { start: 2, end: 4, style: style({ fontSize: 40, leading: 50 }) }
  ], text.length);
  const out = layoutText(text, spans, 'left', measure);
  expect(out.lines.length).toBe(1);
  expect(out.lines[0].height).toBeCloseTo(50, 6);
  expect(out.lines[0].baseline).toBeCloseTo(ASCENT_RATIO * 40, 6);   // tallest run wins
  expect(out.lines[0].pieces.length).toBe(2);
  expect(out.lines[0].pieces[1].x).toBeCloseTo(2 * 5, 6);            // after two 10px chars
});

test('alignment offsets each line within the block', () => {
  const text = 'ab\nabcd';
  const spans = oneSpan(text, { fontSize: 10 });
  const left = layoutText(text, spans, 'left', measure);
  expect(left.lines[0].pieces[0].x).toBeCloseTo(0, 6);
  expect(left.lines[1].pieces[0].x).toBeCloseTo(0, 6);

  const centered = layoutText(text, spans, 'center', measure);
  // block width is the wider line (4 chars = 20); the short line (10) is inset by 5
  expect(centered.lines[0].pieces[0].x).toBeCloseTo(5, 6);
  expect(centered.lines[1].pieces[0].x).toBeCloseTo(0, 6);

  const right = layoutText(text, spans, 'right', measure);
  expect(right.lines[0].pieces[0].x).toBeCloseTo(10, 6);
  expect(right.lines[1].pieces[0].x).toBeCloseTo(0, 6);
});

test('a blank line still occupies its leading', () => {
  const text = 'a\n\nb';
  const out = layoutText(text, oneSpan(text, { fontSize: 10, leading: 20 }), 'left', measure);
  expect(out.lines.length).toBe(3);
  expect(out.lines[1].pieces).toEqual([]);
  expect(out.height).toBeCloseTo(60, 6);
});

test('pieces record their start index for later caret mapping', () => {
  const text = 'ab\ncd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10 }), 'left', measure);
  expect(out.lines[0].pieces[0].start).toBe(0);
  expect(out.lines[1].pieces[0].start).toBe(3);   // after 'ab' and the newline
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/text-layout.ts`:

```ts
import { styleAt, type StyleSpan, type TextAlign, type TextStyle } from './text-model';

export type MeasureChar = (char: string, style: TextStyle) => number;

export interface LaidOutPiece {
  text: string;
  style: TextStyle;
  x: number;        // relative to the line's left edge after alignment
  width: number;
  start: number;    // index into the source string (D3b maps carets through this)
}

export interface LaidOutLine {
  pieces: LaidOutPiece[];
  top: number;
  baseline: number;
  height: number;
  width: number;
}

export interface TextLayout { lines: LaidOutLine[]; width: number; height: number }

/** Ascent as a fraction of font size — the standard approximation without font metrics. */
export const ASCENT_RATIO = 0.8;

interface RawLine { pieces: LaidOutPiece[]; width: number; height: number; maxFontSize: number }

function buildLine(text: string, spans: StyleSpan[], from: number, to: number, measure: MeasureChar): RawLine {
  const pieces: LaidOutPiece[] = [];
  let x = 0;
  let height = 0;
  let maxFontSize = 0;
  let current: LaidOutPiece | null = null;
  let currentStyle: TextStyle | null = null;

  for (let i = from; i < to; i++) {
    const style = styleAt(spans, i);
    const advance = measure(text[i], style) + style.tracking;
    if (style.leading > height) height = style.leading;
    if (style.fontSize > maxFontSize) maxFontSize = style.fontSize;

    if (!current || currentStyle !== style) {
      current = { text: text[i], style, x, width: advance, start: i };
      currentStyle = style;
      pieces.push(current);
    } else {
      current.text += text[i];
      current.width += advance;
    }
    x += advance;
  }
  return { pieces, width: x, height, maxFontSize };
}

/** Lay out point type: lines break only on '\n'. */
export function layoutText(
  text: string, spans: StyleSpan[], align: TextAlign, measure: MeasureChar
): TextLayout {
  if (text.length === 0) return { lines: [], width: 0, height: 0 };

  const raw: RawLine[] = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      const line = buildLine(text, spans, lineStart, i, measure);
      if (line.pieces.length === 0) {
        // A blank line still occupies a line box, styled by the character at its position.
        const style = styleAt(spans, Math.min(lineStart, text.length - 1));
        line.height = style.leading;
        line.maxFontSize = style.fontSize;
      }
      raw.push(line);
      lineStart = i + 1;
    }
  }

  const width = raw.reduce((max, line) => Math.max(max, line.width), 0);
  const lines: LaidOutLine[] = [];
  let top = 0;
  for (const line of raw) {
    const offset = align === 'center' ? (width - line.width) / 2
      : align === 'right' ? width - line.width
      : 0;
    lines.push({
      pieces: line.pieces.map((p) => ({ ...p, x: p.x + offset })),
      top,
      baseline: top + ASCENT_RATIO * line.maxFontSize,
      height: line.height,
      width: line.width
    });
    top += line.height;
  }
  return { lines, width, height: top };
}
```

- [ ] **Step 4: Run the test** — PASS (8 tests).
- [ ] **Step 5: Gates and commit**

```bash
git add src/engine/text-layout.ts tests/text-layout.test.ts
git commit -m "feat: add the pure text layout engine"
git push origin main
```

---

### Task 3: Migrate the TextLayer model

**Files:**
- Modify: `src/engine/document.ts`, `src/engine/commands.ts`, `src/engine/persistence.ts`, `src/shell/color-chips.ts`, `src/properties-panel.ts`, `src/engine/compositor.ts`
- Test: `tests/text-layer-migration.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `TextLayer` becomes `{ kind: 'text'; text: string; spans: StyleSpan[]; align: TextAlign }` — `fontFamily`, `fontSize`, and `color` are **removed**
  - `createTextLayer(doc, name?, style?: TextStyle)` 
  - `migrateTextLayer(raw: Record<string, unknown>): { text: string; spans: StyleSpan[]; align: TextAlign }` in `text-model.ts`
  - `cmdPatchLayer`'s patch type gains `spans` and `align` and loses the three removed fields

**Why this is its own task:** removing three fields from `TextLayer` breaks six call sites across the codebase (`compositor`, `layerNaturalSize`, `properties-panel` ×5, `color-chips`, `commands`, `state`). Changing the type first makes the compiler enumerate them instead of leaving a silent gap — the same discipline that caught `stroke-session` in D1.

- [ ] **Step 1: Write the failing test**

Create `tests/text-layer-migration.test.ts`:

```ts
import { beforeAll, expect, test, vi } from 'vitest';

let documentModel: typeof import('../src/engine/document');
let textModel: typeof import('../src/engine/text-model');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ font: '', measureText: (t: string) => ({ width: t.length * 10 }), drawImage: () => {} })
    })
  });
  documentModel = await import('../src/engine/document');
  textModel = await import('../src/engine/text-model');
});

test('a new text layer carries one span covering its text', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createTextLayer(doc);
  expect(layer.kind).toBe('text');
  expect(layer.align).toBe('center');
  expect(layer.spans.length).toBe(1);
  expect(layer.spans[0].start).toBe(0);
  expect(layer.spans[0].end).toBe(layer.text.length);
  expect(layer.spans[0].style.fontSize).toBe(64);
});

test('migrateTextLayer converts a pre-D3 layer into one span', () => {
  const migrated = textModel.migrateTextLayer({
    kind: 'text', text: 'Hello\nthere', fontFamily: 'serif', fontSize: 32, color: '#ff0000'
  });
  expect(migrated.text).toBe('Hello\nthere');
  expect(migrated.align).toBe('center');           // preserves today's centred rendering
  expect(migrated.spans.length).toBe(1);
  expect(migrated.spans[0]).toMatchObject({ start: 0, end: 11 });
  expect(migrated.spans[0].style).toMatchObject({
    fontFamily: 'serif', fontSize: 32, color: '#ff0000', tracking: 0
  });
  expect(migrated.spans[0].style.leading).toBeCloseTo(32 * 1.2, 6);
});

test('migrateTextLayer tolerates missing fields', () => {
  const migrated = textModel.migrateTextLayer({ kind: 'text' });
  expect(typeof migrated.text).toBe('string');
  expect(migrated.spans.length === 0 || migrated.spans[0].start === 0).toBe(true);
  expect(migrated.align).toBe('center');
});

test('a layer already carrying spans is passed through', () => {
  const spans = [{ start: 0, end: 2, style: textModel.defaultTextStyle() }];
  const migrated = textModel.migrateTextLayer({ kind: 'text', text: 'hi', spans, align: 'left' });
  expect(migrated.align).toBe('left');
  expect(migrated.spans.length).toBe(1);
  expect(migrated.spans[0].end).toBe(2);
});

test('cloneLayer deep-copies text spans', () => {
  const doc = documentModel.createDoc(400, 300);
  const layer = documentModel.createTextLayer(doc);
  const copy = documentModel.cloneLayer(doc, layer);
  if (copy.kind !== 'text') throw new Error('expected a text layer');
  expect(copy.spans).toEqual(layer.spans);
  expect(copy.spans).not.toBe(layer.spans);
  expect(copy.spans[0]).not.toBe(layer.spans[0]);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: `migrateTextLayer` is not a function, and `layer.align` is undefined.

- [ ] **Step 3: Add the migration helper** — append to `src/engine/text-model.ts`:

```ts
/** Convert a pre-D3 text layer (flat style fields) into the span model. */
export function migrateTextLayer(
  raw: Record<string, unknown>
): { text: string; spans: StyleSpan[]; align: TextAlign } {
  const text = typeof raw.text === 'string' ? raw.text : '';
  const align: TextAlign =
    raw.align === 'left' || raw.align === 'right' || raw.align === 'center' ? raw.align : 'center';

  if (Array.isArray(raw.spans)) {
    return { text, spans: normalizeSpans(raw.spans as StyleSpan[], text.length), align };
  }
  const base = defaultTextStyle();
  const fontSize = typeof raw.fontSize === 'number' ? raw.fontSize : base.fontSize;
  const style: TextStyle = clampTextStyle({
    fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : base.fontFamily,
    fontSize,
    color: typeof raw.color === 'string' ? raw.color : base.color,
    tracking: 0,
    leading: fontSize * 1.2      // matches the pre-D3 renderer's line spacing
  });
  return { text, spans: normalizeSpans([{ start: 0, end: text.length, style }], text.length), align };
}
```

- [ ] **Step 4: Change the layer type** — in `src/engine/document.ts`:

```ts
import type { StyleSpan, TextAlign, TextStyle } from './text-model';
import { defaultTextStyle, normalizeSpans } from './text-model';
```

Replace the `TextLayer` interface:

```ts
export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  spans: StyleSpan[];                       // contiguous, sorted, covering [0, text.length)
  align: TextAlign;
}
```

Replace `createTextLayer`:

```ts
export function createTextLayer(doc: Doc, name?: string, style?: TextStyle): TextLayer {
  const text = 'Edit me';
  const applied = style ?? defaultTextStyle();
  return {
    ...baseLayer(doc, name ?? `Text Layer ${layerCounter + 1}`),
    kind: 'text',
    text,
    spans: normalizeSpans([{ start: 0, end: text.length, style: applied }], text.length),
    align: 'center'
  };
}
```

In `cloneLayer`, replace the text return with a deep copy:

```ts
  return {
    ...common,
    kind: 'text',
    spans: layer.kind === 'text'
      ? layer.spans.map((s) => ({ ...s, style: { ...s.style } }))
      : []
  } as TextLayer;
```

- [ ] **Step 5: Widen the patch type** — in `src/engine/commands.ts`, replace the text fields in `cmdPatchLayer`'s patch parameter:

```ts
  patch: Partial<LayerBase & {
    text: string; spans: StyleSpan[]; align: TextAlign;
    shape: ShapeSpec; fill: string | null; stroke: string | null; strokeWidth: number;
  }>,
```

adding `import type { StyleSpan, TextAlign } from './text-model';` to that file.

- [ ] **Step 6: Fix the sites the compiler flags.** Run `npm run build` and expect errors in `compositor.ts`, `document.ts` (`layerNaturalSize`), `properties-panel.ts`, and `color-chips.ts`. Fix each:

`src/engine/compositor.ts` — replace the text branch body with a layout-driven render (imports at the top):

```ts
import { layoutText } from './text-layout';
import { measureCharForStyle } from './document';
```

```ts
  } else if (layer.kind === 'text') {
    const layout = layoutText(layer.text, layer.spans, layer.align, measureCharForStyle);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const originX = -layout.width / 2;
    const originY = -layout.height / 2;
    for (const line of layout.lines) {
      for (const piece of line.pieces) {
        ctx.font = `${piece.style.fontSize}px ${piece.style.fontFamily}`;
        ctx.fillStyle = piece.style.color;
        if (piece.style.tracking === 0) {
          ctx.fillText(piece.text, originX + piece.x, originY + line.baseline);
        } else {
          // Tracking means per-character placement, matching how the layout measured it.
          let cx = originX + piece.x;
          for (const char of piece.text) {
            ctx.fillText(char, cx, originY + line.baseline);
            cx += ctx.measureText(char).width + piece.style.tracking;
          }
        }
      }
    }
  } else {
```

`src/engine/document.ts` — export the measurement callback and use the layout for natural size:

```ts
export function measureCharForStyle(char: string, style: TextStyle): number {
  measureCtx.font = `${style.fontSize}px ${style.fontFamily}`;
  return measureCtx.measureText(char).width;
}
```

and replace the text branch of `layerNaturalSize`:

```ts
  const layout = layoutText(layer.text, layer.spans, layer.align, measureCharForStyle);
  return { w: layout.width, h: layout.height };
```

with `import { layoutText } from './text-layout';` at the top.

`src/shell/color-chips.ts` — the foreground chip now writes a span patch. Replace the text-layer branch:

```ts
    if (layer && layer.kind === 'text') {
      const current = layer.spans.length ? layer.spans[0].style.color : null;
      if (current !== fg) {
        history.push(cmdPatchLayer(
          layer.id, 'Text color',
          { spans: applyStyleToRange(layer.spans, 0, layer.text.length, { color: fg }, layer.text.length) },
          `${layer.id}:color`
        ));
      }
    }
```

with `import { applyStyleToRange } from '../engine/text-model';` added.

`src/properties-panel.ts` — Task 5 rebuilds this section properly. For now, make it compile by reading through the span model:

```ts
  } else if (layer.kind === 'text') {
    const style = layer.spans.length ? layer.spans[0].style : defaultTextStyle();
    syncVal(propTextContent, layer.text);
    syncVal(propFontFamily, style.fontFamily);
    syncVal(propFontSize, String(style.fontSize));
    fontSizeValueEl.textContent = `${style.fontSize}px`;
    syncVal(propTextColor, style.color);
  }
```

and change the three listeners that wrote `fontFamily`, `fontSize`, and `color` to write spans instead:

```ts
  const patchTextStyle = (layer: Layer, patch: Partial<TextStyle>, label: string, key: string): void => {
    if (layer.kind !== 'text') return;
    history.push(cmdPatchLayer(
      layer.id, label,
      { spans: applyStyleToRange(layer.spans, 0, layer.text.length, patch, layer.text.length) },
      `${layer.id}:${key}`
    ));
  };
```

```ts
  propFontFamily.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer) patchTextStyle(layer, { fontFamily: propFontFamily.value }, 'Font family', 'fontFamily');
  });
  propFontSize.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      patchTextStyle(layer, { fontSize: parseInt(propFontSize.value, 10) }, 'Font size', 'fontSize');
      fontSizeValueEl.textContent = `${propFontSize.value}px`;
    }
  });
  propTextColor.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) patchTextStyle(layer, { color: propTextColor.value }, 'Text color', 'color');
  });
```

with `import { applyStyleToRange, defaultTextStyle, type TextStyle } from './engine/text-model';` added.

- [ ] **Step 7: Migrate on load** — in `src/engine/persistence.ts`, inside `deserializeDoc`'s layer loop, replace the non-image branch:

```ts
    } else if (sl.kind === 'text') {
      const migrated = migrateTextLayer(sl as Record<string, unknown>);
      layers.push({ ...(sl as object), ...migrated } as Layer);
    } else {
      layers.push({ ...(sl as object) } as Layer);
    }
```

with `import { migrateTextLayer } from './text-model';` added.

- [ ] **Step 8: Run the tests and gates** — `npx vitest run tests/text-layer-migration.test.ts` PASS (5 tests); all four gates PASS.

- [ ] **Step 9: Live check** — load `?audit-raf` and confirm the startup "Text Overlay" layer still renders centred with the same text, and that changing font size in Properties still resizes it.

- [ ] **Step 10: Commit**

```bash
git add src/engine/text-model.ts src/engine/document.ts src/engine/commands.ts src/engine/compositor.ts src/engine/persistence.ts src/shell/color-chips.ts src/properties-panel.ts tests/text-layer-migration.test.ts
git commit -m "feat: migrate text layers to the styled-span model"
git push origin main
```

---

### Task 4: Type tool

**Files:**
- Create: `src/tools/type-config.ts`, `src/tools/type-tool.ts`
- Modify: `src/dom.ts` (icon), `src/shell/toolbar-groups.ts`, `src/main.ts`
- Test: `tests/type-config.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `defaultTextStyle`, `clampTextStyle`, `TextStyle`, `TextAlign` (Task 1); `createTextLayer` (Task 3); `cmdAddLayer`; `hitTestLayer`; `isEditingSessionLive`.
- Produces:
  - `src/tools/type-config.ts`: `getTypeStyle(): TextStyle`, `setTypeStyle(patch: Partial<TextStyle>): void`, `getTypeAlign(): TextAlign`, `setTypeAlign(a: TextAlign): void`, `__resetTypeConfigForTest(): void`
  - `src/tools/type-tool.ts`: `typeTool`

- [ ] **Step 1: Write the failing config test**

Create `tests/type-config.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest';
import {
  __resetTypeConfigForTest, getTypeAlign, getTypeStyle, setTypeAlign, setTypeStyle
} from '../src/tools/type-config';

beforeEach(() => __resetTypeConfigForTest());

test('defaults match the default text style', () => {
  expect(getTypeStyle().fontFamily).toBe('Inter');
  expect(getTypeStyle().fontSize).toBe(64);
  expect(getTypeAlign()).toBe('center');
});

test('patches merge and clamp', () => {
  setTypeStyle({ fontSize: 9999 });
  expect(getTypeStyle().fontSize).toBe(512);
  setTypeStyle({ tracking: -900 });
  expect(getTypeStyle().tracking).toBe(-100);
  setTypeStyle({ fontFamily: 'serif' });
  expect(getTypeStyle().fontFamily).toBe('serif');
  expect(getTypeStyle().fontSize).toBe(512);      // earlier patch survives
});

test('alignment round-trips', () => {
  setTypeAlign('right');
  expect(getTypeAlign()).toBe('right');
});
```

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement the config** — create `src/tools/type-config.ts`:

```ts
import { clampTextStyle, defaultTextStyle, type TextAlign, type TextStyle } from '../engine/text-model';

let style: TextStyle = defaultTextStyle();
let align: TextAlign = 'center';

export function getTypeStyle(): TextStyle { return { ...style }; }

export function setTypeStyle(patch: Partial<TextStyle>): void {
  style = clampTextStyle({ ...style, ...patch });
}

export function getTypeAlign(): TextAlign { return align; }
export function setTypeAlign(next: TextAlign): void { align = next; }

export function __resetTypeConfigForTest(): void {
  style = defaultTextStyle();
  align = 'center';
}
```

- [ ] **Step 4: Add the contract** — add to `tests/ui-layout.test.mjs`:

```js
test('the type tool is live', () => {
  const groups = readFileSync(resolve(root, 'src/shell/toolbar-groups.ts'), 'utf8');
  assert.match(groups, /tool:\s*['"]type['"]/);
  assert.doesNotMatch(groups, /stub: 'Horizontal Type'/, 'Horizontal Type is no longer a stub');
  const tool = readFileSync(resolve(root, 'src/tools/type-tool.ts'), 'utf8');
  assert.match(tool, /isEditingSessionLive/);
  assert.match(tool, /cmdAddLayer/);
  assert.match(main, /Type · Click to add text/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 5: Add the icon** — add to the `icons` map in `src/dom.ts`:

```ts
  type: svg('<path d="M3 3.5h10"/><line x1="8" y1="3.5" x2="8" y2="12.5"/><path d="M6 12.5h4"/>')
```

- [ ] **Step 6: Implement the tool** — create `src/tools/type-tool.ts`:

```ts
import { type DocPoint, type Tool } from '../engine/tools';
import { icons } from '../dom';
import { state, notify } from '../state';
import { toast } from '../toast';
import * as history from '../engine/history';
import { cmdAddLayer } from '../engine/commands';
import { createTextLayer, layerNaturalSize } from '../engine/document';
import { hitTestLayer } from '../engine/transform-geometry';
import { isEditingSessionLive } from '../engine/session-status';
import { getTypeAlign, getTypeStyle } from './type-config';

export const typeTool: Tool = {
  id: 'type', label: 'Horizontal Type', icon: icons.type, cursor: 'text', shortcut: 't',

  onDown(p: DocPoint) {
    if (isEditingSessionLive()) { toast('Finish the current session before adding text.'); return; }

    // Clicking an existing text layer selects it instead of stacking a new one.
    const hit = state.doc.layers.find(
      (l) => l.kind === 'text' && l.visible && hitTestLayer(l, layerNaturalSize(l), p)
    );
    if (hit) {
      state.doc.activeLayerId = hit.id;
      notify('selection', 'composite');
      return;
    }

    const layer = createTextLayer(state.doc, undefined, getTypeStyle());
    layer.align = getTypeAlign();
    layer.x = p.x;
    layer.y = p.y;
    history.push(cmdAddLayer(layer, 0, 'Add text layer'));
  },

  onMove() {},
  onUp() {},
  options: []
};
```

- [ ] **Step 7: Register** — in `src/shell/toolbar-groups.ts`:

```ts
  { id: 'type', entries: [{ tool: 'type' }] },
```

In `src/main.ts`:

```ts
import { typeTool } from './tools/type-tool';
```

```ts
registerTool(typeTool);
```

and the status hint beside the others in `syncContextStatus`:

```ts
    else if (tool.id === 'type') status.textContent = 'Type · Click to add text · Edit in Properties';
```

- [ ] **Step 8: Gates** — all four PASS.

- [ ] **Step 9: Live verify** — `T` activates the tool and shows its hint; clicking empty canvas creates a text layer centred on the click point with one `Add text layer` history entry; clicking that layer again selects it rather than creating a second; clicking during a live crop session is refused with the busy toast; undo removes the layer.

- [ ] **Step 10: Commit**

```bash
git add src/tools/type-config.ts src/tools/type-tool.ts src/dom.ts src/shell/toolbar-groups.ts src/main.ts tests/type-config.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add the Type tool"
git push origin main
```

---

### Task 5: Type options bar and Properties

**Files:**
- Modify: `src/tools/type-tool.ts` (options), `index.html`, `src/properties-panel.ts`, `src/style.css`
- Test: `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `type-config` (Task 4); `applyStyleToRange`, `TEXT_FAMILIES` (Task 1); `cmdPatchLayer` (Task 3).
- Produces: six style controls on both surfaces, sharing one write path.

**Shared write path:** both surfaces edit the selected text layer through
`applyStyleToRange(spans, 0, text.length, patch, text.length)` — the whole-layer case of the same
function D3b will narrow to a selection — and update `type-config` so the next new layer inherits
the choice.

- [ ] **Step 1: Contract first** — add to `tests/ui-layout.test.mjs`:

```js
test('type style controls exist on both surfaces', () => {
  for (const id of ['prop-text-align', 'prop-text-leading', 'prop-text-tracking']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing control ${id}`);
  }
  const tool = readFileSync(resolve(root, 'src/tools/type-tool.ts'), 'utf8');
  for (const key of ['type-family', 'type-size', 'type-align', 'type-leading', 'type-tracking']) {
    assert.match(tool, new RegExp(`['"]${key}['"]`), `missing option ${key}`);
  }
  const props = readFileSync(resolve(root, 'src/properties-panel.ts'), 'utf8');
  assert.match(props, /applyStyleToRange/);
  assert.match(props, /prop-text-align/);
});
```

Run `npm run test:ui` → FAIL.

- [ ] **Step 2: Add the options** — replace `options: []` in `src/tools/type-tool.ts` with:

```ts
  options: [
    {
      key: 'type-family', label: 'Font', kind: 'select', group: 'type',
      choices: [...TEXT_FAMILIES],
      get: () => getTypeStyle().fontFamily,
      set: (v: string) => { setTypeStyle({ fontFamily: v }); applyToSelectedText({ fontFamily: v }, 'Font family', 'fontFamily'); }
    },
    {
      key: 'type-size', label: 'Size', kind: 'number', group: 'type',
      min: 8, max: 512, step: 1,
      get: () => getTypeStyle().fontSize,
      set: (v: number) => { setTypeStyle({ fontSize: v }); applyToSelectedText({ fontSize: v }, 'Font size', 'fontSize'); }
    },
    {
      key: 'type-align', label: 'Align', kind: 'select', group: 'type',
      choices: ['Left', 'Center', 'Right'],
      get: () => {
        const a = activeTextLayer()?.align ?? getTypeAlign();
        return a.charAt(0).toUpperCase() + a.slice(1);
      },
      set: (v: string) => {
        const align = v.toLowerCase() as TextAlign;
        setTypeAlign(align);
        const layer = activeTextLayer();
        if (layer) history.push(cmdPatchLayer(layer.id, 'Text alignment', { align }));
      }
    },
    {
      key: 'type-leading', label: 'Leading', kind: 'number', group: 'type',
      min: 1, max: 1000, step: 1,
      get: () => getTypeStyle().leading,
      set: (v: number) => { setTypeStyle({ leading: v }); applyToSelectedText({ leading: v }, 'Leading', 'leading'); }
    },
    {
      key: 'type-tracking', label: 'Tracking', kind: 'number', group: 'type',
      min: -100, max: 500, step: 1,
      get: () => getTypeStyle().tracking,
      set: (v: number) => { setTypeStyle({ tracking: v }); applyToSelectedText({ tracking: v }, 'Tracking', 'tracking'); }
    }
  ]
```

and add the shared helpers above the tool in the same file:

```ts
import * as history from '../engine/history';
import { cmdPatchLayer } from '../engine/commands';
import { applyStyleToRange, TEXT_FAMILIES, type TextAlign, type TextStyle } from '../engine/text-model';
import { getTypeAlign, getTypeStyle, setTypeAlign, setTypeStyle } from './type-config';
import type { TextLayer } from '../engine/document';

function activeTextLayer(): TextLayer | null {
  const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
  return layer && layer.kind === 'text' ? layer : null;
}

/** Whole-layer style edit — the same span path D3b will narrow to a selection. */
function applyToSelectedText(patch: Partial<TextStyle>, label: string, key: string): void {
  const layer = activeTextLayer();
  if (!layer) return;
  history.push(cmdPatchLayer(
    layer.id, label,
    { spans: applyStyleToRange(layer.spans, 0, layer.text.length, patch, layer.text.length) },
    `${layer.id}:${key}`
  ));
}
```

- [ ] **Step 3: Add the Properties markup** — in `index.html`, inside `#section-text-properties`, after the existing Text Color row:

```html
                <div class="control-row">
                  <label for="prop-text-align">Alignment</label>
                  <select id="prop-text-align">
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                <div class="control-row">
                  <label for="prop-text-leading">Leading (px)</label>
                  <input type="range" id="prop-text-leading" min="1" max="1000" value="77">
                  <span class="value-display" id="prop-text-leading-value">77</span>
                </div>

                <div class="control-row">
                  <label for="prop-text-tracking">Tracking</label>
                  <input type="range" id="prop-text-tracking" min="-100" max="500" value="0">
                  <span class="value-display" id="prop-text-tracking-value">0</span>
                </div>
```

- [ ] **Step 4: Wire Properties** — in `src/properties-panel.ts`, add the lookups beside the other text elements:

```ts
const propTextAlign = $('prop-text-align') as HTMLSelectElement;
const propTextLeading = $('prop-text-leading') as HTMLInputElement;
const propTextTracking = $('prop-text-tracking') as HTMLInputElement;
```

extend the text sync branch (replacing the Task 3 stopgap):

```ts
  } else if (layer.kind === 'text') {
    const style = layer.spans.length ? layer.spans[0].style : defaultTextStyle();
    syncVal(propTextContent, layer.text);
    syncVal(propFontFamily, style.fontFamily);
    syncVal(propFontSize, String(style.fontSize));
    fontSizeValueEl.textContent = `${style.fontSize}px`;
    syncVal(propTextColor, style.color);
    syncVal(propTextAlign, layer.align);
    syncVal(propTextLeading, String(Math.round(style.leading)));
    $('prop-text-leading-value').textContent = String(Math.round(style.leading));
    syncVal(propTextTracking, String(Math.round(style.tracking)));
    $('prop-text-tracking-value').textContent = String(Math.round(style.tracking));
  }
```

and add the three listeners beside the existing text ones:

```ts
  propTextAlign.addEventListener('change', () => {
    const layer = getActiveLayer();
    if (layer && layer.kind === 'text') {
      history.push(cmdPatchLayer(layer.id, 'Text alignment', { align: propTextAlign.value as TextAlign }));
    }
  });

  propTextLeading.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      patchTextStyle(layer, { leading: Number(propTextLeading.value) }, 'Leading', 'leading');
      $('prop-text-leading-value').textContent = propTextLeading.value;
    }
  });

  propTextTracking.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      patchTextStyle(layer, { tracking: Number(propTextTracking.value) }, 'Tracking', 'tracking');
      $('prop-text-tracking-value').textContent = propTextTracking.value;
    }
  });
```

with `TextAlign` added to the `text-model` type import.

- [ ] **Step 5: Gates** — all four PASS.

- [ ] **Step 6: Live verify** — select a text layer: the Properties Text section shows all six controls; changing family, size, and colour still works; switching alignment to Left visibly shifts the lines and is one undo step; dragging Leading from its default to 200 increases the layer's height (read `layerNaturalSize` via the transform box) as **one** coalesced history entry; dragging Tracking widens the text; the options bar shows the same values and editing there updates the layer identically.

- [ ] **Step 7: Commit**

```bash
git add src/tools/type-tool.ts index.html src/properties-panel.ts src/style.css tests/ui-layout.test.mjs
git commit -m "feat: expose type style controls in the options bar and properties"
git push origin main
```

---

### Task 6: Rasterize Type and Convert to Shape

**Files:**
- Create: `src/engine/text-raster.ts`
- Modify: `src/main.ts`, `src/tools/paint-shared.ts` (toast copy)
- Test: `tests/text-raster.test.ts`, `tests/ui-layout.test.mjs`

**Interfaces:**
- Consumes: `layoutText`, `measureCharForStyle` (Tasks 2–3); `traceContours` (Phase C); `createShapeLayer` + the `{kind:'path'}` `ShapeSpec` (D1/D2); `createAnchor` (D2).
- Produces: `rasterizeTextLayer(layerId: string): boolean`, `convertTextToShape(layerId: string): boolean`.

**Supersampling:** Convert to Shape renders at `TRACE_SCALE = 2`, traces the alpha, then halves the coordinates. Costs one scale factor and materially smooths the traced outline.

- [ ] **Step 1: Write the failing test**

Create `tests/text-raster.test.ts`:

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

function ctxStub() {
  return {
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {}, rotate: () => {},
    setTransform: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    bezierCurveTo: () => {}, arcTo: () => {}, ellipse: () => {}, closePath: () => {},
    fill: () => {}, stroke: () => {}, drawImage: () => {}, clearRect: () => {}, fillRect: () => {},
    fillText: () => {}, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    textAlign: 'left', textBaseline: 'alphabetic',
    measureText: (t: string) => ({ width: t.length * 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {}
  };
}

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let raster: typeof import('../src/engine/text-raster');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = { width: 0, height: 0, getContext: () => ctxStub() };
      return canvas;
    }
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  raster = await import('../src/engine/text-raster');
});

beforeEach(() => {
  stateModule.state.doc = documentModel.createDoc(400, 300);
  history.clear();
});

function addText() {
  const layer = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  stateModule.state.doc.activeLayerId = layer.id;
  return layer;
}

test('rasterizing swaps the layer to an image and is undoable in one step', () => {
  const layer = addText();
  expect(raster.rasterizeTextLayer(layer.id)).toBe(true);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.kind).toBe('image');
  if (after.kind !== 'image') throw new Error('expected an image layer');
  expect(after.bitmap).not.toBeNull();
  expect(history.entries().length).toBe(1);
  expect(history.entries()[0].label).toBe('Rasterize type');

  history.undo();
  const reverted = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(reverted.kind).toBe('text');
  if (reverted.kind !== 'text') throw new Error('expected a text layer');
  expect(reverted.text).toBe(layer.text);
  expect(reverted.spans.length).toBe(1);
});

test('rasterizing preserves identity and transform', () => {
  const layer = addText();
  layer.rotation = 25;
  layer.opacity = 40;
  const name = layer.name;
  raster.rasterizeTextLayer(layer.id);
  const after = stateModule.state.doc.layers.find((l) => l.id === layer.id)!;
  expect(after.rotation).toBe(25);
  expect(after.opacity).toBe(40);
  expect(after.name).toBe(name);
});

test('rasterizing refuses on a non-text layer, a missing id, or empty text', () => {
  const image = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(image);
  expect(raster.rasterizeTextLayer(image.id)).toBe(false);
  expect(raster.rasterizeTextLayer('nope')).toBe(false);

  const empty = addText();
  empty.text = '';
  empty.spans = [];
  expect(raster.rasterizeTextLayer(empty.id)).toBe(false);
  expect(history.entries().length).toBe(0);
});

test('convert refuses on empty text and on a non-text layer', () => {
  const image = documentModel.createImageLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(image);
  expect(raster.convertTextToShape(image.id)).toBe(false);
  const empty = addText();
  empty.text = '';
  empty.spans = [];
  expect(raster.convertTextToShape(empty.id)).toBe(false);
  expect(history.entries().length).toBe(0);
});
```

**Note on the stub:** `getImageData` returns all-zero alpha, so `traceContours` finds no contours and `convertTextToShape` returns `false` for a *non-empty* layer too. That is why the test asserts only the refusal paths here; the success path for Convert to Shape is proven live in Step 6, where real glyphs produce real alpha.

- [ ] **Step 2: Run to verify failure** — FAIL, module missing.

- [ ] **Step 3: Implement** — create `src/engine/text-raster.ts`:

```ts
import { state, notify } from '../state';
import * as history from './history';
import { cmdAddLayer } from './commands';
import {
  createShapeLayer, layerNaturalSize, measureCharForStyle,
  type ImageLayer, type Layer, type TextLayer
} from './document';
import { layoutText } from './text-layout';
import { traceContours } from './selection-contour';
import { createAnchor, type SubPath } from './path-model';
import { getForeground } from './color-state';

const TRACE_SCALE = 2;   // supersample before tracing, then halve the coordinates

function textLayer(layerId: string): TextLayer | null {
  const layer = state.doc.layers.find((l) => l.id === layerId);
  return layer && layer.kind === 'text' ? layer : null;
}

/** Draw a text layer's laid-out glyphs into a fresh bitmap at `scale`. */
function renderTextBitmap(layer: TextLayer, scale: number): HTMLCanvasElement | null {
  if (layer.text.length === 0) return null;
  const layout = layoutText(layer.text, layer.spans, layer.align, measureCharForStyle);
  const width = Math.round(layout.width * scale);
  const height = Math.round(layout.height * scale);
  if (width < 1 || height < 1) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // save/restore is load-bearing: a 2D context is a singleton per canvas, so leaving the
  // scale applied would offset every later drawImage into this bitmap (the D1 bug).
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of layout.lines) {
    for (const piece of line.pieces) {
      ctx.font = `${piece.style.fontSize}px ${piece.style.fontFamily}`;
      ctx.fillStyle = piece.style.color;
      if (piece.style.tracking === 0) {
        ctx.fillText(piece.text, piece.x, line.baseline);
      } else {
        let cx = piece.x;
        for (const char of piece.text) {
          ctx.fillText(char, cx, line.baseline);
          cx += ctx.measureText(char).width + piece.style.tracking;
        }
      }
    }
  }
  ctx.restore();
  return canvas;
}

/** Convert a text layer to pixels in place, keeping its identity and transform. */
export function rasterizeTextLayer(layerId: string): boolean {
  const index = state.doc.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return false;
  const layer = textLayer(layerId);
  if (!layer) return false;
  const bitmap = renderTextBitmap(layer, 1);
  if (!bitmap) return false;

  const before: Layer = layer;
  const after: ImageLayer = {
    id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity,
    blendMode: layer.blendMode, effects: { ...layer.effects },
    x: layer.x, y: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY, rotation: layer.rotation,
    kind: 'image', bitmap, bitmapRev: 1, sourceName: null
  };

  history.push({
    label: 'Rasterize type',
    bytes: bitmap.width * bitmap.height * 4,
    do: () => {
      const at = state.doc.layers.findIndex((l) => l.id === layerId);
      if (at >= 0) state.doc.layers[at] = after;
      notify('structure', 'layerProps', 'composite');
    },
    undo: () => {
      const at = state.doc.layers.findIndex((l) => l.id === layerId);
      if (at >= 0) state.doc.layers[at] = before;
      notify('structure', 'layerProps', 'composite');
    }
  });
  return true;
}

/**
 * Convert text to a vector shape by tracing its rasterized alpha.
 * Canvas exposes no glyph outlines and the project has zero runtime dependencies, so this
 * produces traced outlines — clean at display sizes, stair-stepped on small text.
 */
export function convertTextToShape(layerId: string): boolean {
  const layer = textLayer(layerId);
  if (!layer) return false;
  const bitmap = renderTextBitmap(layer, TRACE_SCALE);
  if (!bitmap) return false;

  const ctx = bitmap.getContext('2d')!;
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const alpha = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];

  const loops = traceContours(alpha, bitmap.width, bitmap.height);
  if (loops.length === 0) return false;

  const halfW = bitmap.width / TRACE_SCALE / 2;
  const halfH = bitmap.height / TRACE_SCALE / 2;
  const subpaths: SubPath[] = loops.map((loop) => ({
    // Halve the supersampled coordinates and centre on the layer origin.
    anchors: loop.map((p) => createAnchor(p.x / TRACE_SCALE - halfW, p.y / TRACE_SCALE - halfH)),
    closed: true
  }));

  // Outlines are filled, not stroked — a stroke would double the glyph edges.
  const shape = createShapeLayer(state.doc, { kind: 'path', subpaths }, {
    fill: layer.spans.length ? layer.spans[0].style.color : getForeground(),
    stroke: null,
    strokeWidth: 0
  }, `${layer.name} outlines`);
  shape.x = layer.x;
  shape.y = layer.y;
  shape.scaleX = layer.scaleX;
  shape.scaleY = layer.scaleY;
  shape.rotation = layer.rotation;
  history.push(cmdAddLayer(shape, 0, 'Convert type to shape'));
  return true;
}
```

- [ ] **Step 4: Register the commands** — add the contract to `tests/ui-layout.test.mjs`:

```js
test('type commands are real, not phase stubs', () => {
  assert.match(main, /id:\s*'type\.rasterize'[\s\S]{0,240}?rasterizeTextLayer\(/);
  assert.match(main, /id:\s*'type\.convertShape'[\s\S]{0,240}?convertTextToShape\(/);
  const paint = readFileSync(resolve(root, 'src/tools/paint-shared.ts'), 'utf8');
  assert.match(paint, /Layer > Rasterize Type/);
  assert.doesNotMatch(paint, /arrives in Phase D/, 'the stale promise is replaced');
});
```

In `src/main.ts`, replace the two stub registrations:

```ts
registerCommand({ id: 'type.rasterize', label: 'Rasterize Type', phase: 'D' });
registerCommand({ id: 'type.convertShape', label: 'Convert to Shape', phase: 'D' });
```

with:

```ts
registerCommand({
  id: 'type.rasterize', label: 'Rasterize Type',
  enabled: () => {
    const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
    return Boolean(layer && layer.kind === 'text');
  },
  run: () => guardTransformSession(() => {
    if (!rasterizeTextLayer(state.doc.activeLayerId ?? '')) toast('Select a text layer with some text first.');
  })
});
registerCommand({
  id: 'type.convertShape', label: 'Convert to Shape',
  enabled: () => {
    const layer = state.doc.layers.find((l) => l.id === state.doc.activeLayerId);
    return Boolean(layer && layer.kind === 'text');
  },
  run: () => guardTransformSession(() => {
    if (!convertTextToShape(state.doc.activeLayerId ?? '')) toast('Select a text layer with some text first.');
  })
});
```

with `import { convertTextToShape, rasterizeTextLayer } from './engine/text-raster';`.

- [ ] **Step 5: Replace the stale toast** — in `src/tools/paint-shared.ts`:

```ts
  'text-layer': "Text layers can't be painted — use Layer > Rasterize Type first.",
```

- [ ] **Step 6: Gates and live verify** — all four gates PASS. Then on `?audit-raf`:
  1. With a text layer selected, `Type > Rasterize Type` is enabled; running it produces an image layer whose thumbnail shows the glyphs, and a brush stroke then paints on it.
  2. One undo restores the text layer with its text and spans, and the Properties Text section returns.
  3. Painting on a text layer now toasts *"use Layer > Rasterize Type first."*
  4. `Type > Convert to Shape` produces a shape layer named `… outlines` positioned over the text, whose filled pixels sit where the glyphs were; one undo removes it.
  5. Both commands gray out when a non-text layer is selected.

- [ ] **Step 7: Commit**

```bash
git add src/engine/text-raster.ts src/main.ts src/tools/paint-shared.ts tests/text-raster.test.ts tests/ui-layout.test.mjs
git commit -m "feat: add Rasterize Type and Convert Type to Shape"
git push origin main
```

---

### Task 7: Final regression, docs, and close-out

**Files:**
- Modify: `README.md`, `docs/architecture.md`, `docs/changelog.md`
- No source changes.

- [ ] **Step 1: Full live regression** on `?audit-raf` at 1280×800, in **short** browser snippets (the 30-second cap), re-reading the canvas rect after every tool change:
  - **Type:** `T` creates a layer at the click point; clicking it again selects rather than duplicates; all six style controls change rendered pixels; alignment shifts lines; leading changes layer height; each slider drag is one history entry.
  - **Migration:** open a project saved before D3a (or hand-write one with `fontFamily`/`fontSize`/`color` and no `spans`) and confirm it loads with one span, `align: 'center'`, the same text, and the same font size — the layer's natural size matches the old value.
  - **Rasterize and convert:** as in Task 6, plus that the rasterized bitmap is paintable.
  - **Phase A/B/C/D1/D2 regression:** menus and dock tabs; Tab / Shift+Tab; Reset Essentials; brush + undo; eraser; eyedropper; marquee and lasso with Shift-add and Alt-subtract; a stroke clipped to a selection; Clear/Fill/Crop to Selection; the four shape tools with Shift/Alt; shape Properties; Rasterize Shape; Pen with click/drag/close; Direct Selection anchor and handle drags; the Paths panel; Convert Path to Shape; transform guard; crop apply/undo; save/open round-trip.
  - **Geometry probe:** zero surface violations.

- [ ] **Step 2: Docs**

- `README.md`: extend the Toolbar row of the Workspace table with "the Type tool"; add an Editing Workflow paragraph covering clicking to add text, the six style controls, Rasterize Type, and Convert to Shape — stating plainly that Convert to Shape traces the rendered glyphs rather than producing true font outlines; add `T` to Essential Shortcuts.
- `docs/architecture.md`: add a paragraph beside the other engines describing `src/engine/text-model.ts` (flat string plus normalized style spans, and why: a caret is then an integer index), `text-layout.ts` (pure layout over an injected measurement callback; max-leading line heights; the 0.8 ascent approximation), and `text-raster.ts` (rasterize, and traced-outline conversion with its stated limitation).
- `docs/changelog.md` top entry:

```markdown
## 3.7.0 - 2026-07-22

### Added

- **Type engine**: text layers now carry styled spans instead of a single style, laid out by a new engine that supports left/center/right alignment, leading, and tracking. The Type tool (`T`) places text on the canvas, and font, size, colour, alignment, leading, and tracking are editable from both the options bar and the Properties panel. `Type > Rasterize Type` converts text to pixels, and `Type > Convert to Shape` traces the rendered glyphs into an editable vector shape. Projects saved before this release migrate automatically. (Plan: 2026-07-22-type-engine.)
```

- [ ] **Step 3: Gates, commit, and protocol**

```bash
git add README.md docs/architecture.md docs/changelog.md
git commit -m "docs: document the type engine and record 3.7.0"
git push origin main
```

AGENTS.md protocol: hooks refresh the graph; the new modules (`text-model`, `text-layout`, `text-raster`, `type-tool`, `type-config`) change structure → run `python -m graphify export obsidian`; verify `graphify-out/` stays untracked; update the project memory (D3a shipped, D3b — the on-canvas editor — still pending).
