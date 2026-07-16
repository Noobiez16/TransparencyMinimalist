# UI Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** every task ends with a live browser verification against the dev server (browser preview, URL `http://localhost:3000/?audit-raf` — the query flag restores rAF in the hidden audit renderer). There is one browser pane per session, so run tasks **inline**, not in parallel subagents. Helpers used in verification snippets: `window.__settled = () => new Promise(r => setTimeout(r, 100))`.

**Goal:** Fix all 12 owner-approved findings from the UI audit (`docs/superpowers/audit/2026-07-13-findings.md`) — 5 broken controls, the 3-finding options-bar overlap cluster, and 4 cosmetics — each with a regression contract.

**Architecture:** Small, per-finding fixes following existing engine patterns (DirtyFlag notifications, session guards, one command per edit). The overlap cluster is one CSS change: promote the already-proven compact wrap strategy to all widths and delete the sticky Apply/Cancel overlay. One new module (`src/engine/session-status.ts`) shares the "is an editing session live" predicate between `main.ts` and the history panel.

**Tech Stack:** Vanilla TypeScript + Vite, zero runtime deps. Tests: vitest (`npm run test:core`), node test-runner source contracts (`npm run test:ui` → `tests/ui-layout.test.mjs`).

## Global Constraints

- ZERO runtime npm dependencies; no new dev dependencies.
- Severity order: broken (Tasks 1–5) → overlap (Task 6) → cosmetic (Tasks 7–10).
- One logical fix per commit; commit subject only (conventional prefix, e.g. `fix:`), NO Co-Authored-By trailer; `git push origin main` after each task.
- Before every commit run all four gates: `npm run test:core; npm run test:ui; npm run test:docs; npm run build` — all must pass.
- Owner acceptance criterion for Task 6: **no button may overlap another button at any width ≥1024 px and in all four dock visibility states** (both docks / hide-left / hide-right / both hidden).
- Engine patterns: state changes go through commands/notify; a control's effect must be observable immediately (no "works after the next repaint").
- The `?audit-raf` shim in `index.html` and the `launch.json` port fix are KEPT (owner decision).
- Live verification per fix: re-exercise the fixed control in the browser before committing (steps included per task).

---

### Task 1: F-005 — custom background color picker visibility

**Files:**
- Modify: `src/canvas.ts:83-108` (`syncBackgroundUI`)
- Test: `tests/ui-layout.test.mjs` (extend)

**Interfaces:**
- Consumes: `[hidden] { display: none !important; }` rule in `src/style.css:29` (kept — the fix works *with* it, toggling the attribute instead of fighting it with inline styles).
- Produces: `#bg-color-picker` visible exactly when `state.doc.bgType === 'custom'`.

- [ ] **Step 1: Write the failing contract**

Add to `tests/ui-layout.test.mjs` (after the last existing `test(...)` block):

```js
test('custom background color picker toggles the hidden attribute, not inline display', () => {
  assert.match(canvas, /colorPicker\.hidden\s*=\s*bg\s*!==\s*['"]custom['"]/);
  assert.doesNotMatch(canvas, /colorPicker\.style\.display/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:ui`
Expected: FAIL — `colorPicker.style.display` still present in `src/canvas.ts`.

- [ ] **Step 3: Implement**

Replace the body of `syncBackgroundUI()` in `src/canvas.ts` with:

```ts
function syncBackgroundUI(): void {
  const bg = state.doc.bgType;
  const colorPicker = $<HTMLInputElement>('bg-color-picker');

  document.querySelectorAll('.btn-theme').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.bg === bg);
  });

  viewport.className = 'canvas-viewport';
  viewport.style.backgroundColor = '';
  // [hidden] carries !important in style.css — toggle the attribute, never inline display.
  colorPicker.hidden = bg !== 'custom';

  if (bg === 'transparent') {
    viewport.classList.add('checkerboard-bg');
  } else if (bg === 'white') {
    viewport.style.backgroundColor = '#ffffff';
  } else if (bg === 'black') {
    viewport.style.backgroundColor = '#000000';
  } else if (bg === 'custom') {
    viewport.style.backgroundColor = state.doc.bgColor;
  }
  if (colorPicker.value !== state.doc.bgColor) colorPicker.value = state.doc.bgColor;
}
```

- [ ] **Step 4: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

- [ ] **Step 5: Live verify**

Dev server → `http://localhost:3000/?audit-raf`. Evaluate:

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  [...document.querySelectorAll('.btn-theme')].find(b => b.dataset.bg === 'custom').click();
  await settled();
  const p = document.getElementById('bg-color-picker');
  const visible = getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0;
  [...document.querySelectorAll('.btn-theme')].find(b => b.dataset.bg === 'transparent').click();
  await settled();
  const hiddenAgain = getComputedStyle(p).display === 'none';
  return { visible, hiddenAgain }; // expect { visible: true, hiddenAgain: true }
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/canvas.ts tests/ui-layout.test.mjs
git commit -m "fix: show the custom background color picker by toggling its hidden attribute"
git push origin main
```

---

### Task 2: F-008 — show-controls toggle repaints immediately

**Files:**
- Modify: `src/canvas-overlay.ts:29-31` (`setShowTransformControls`) + add one import
- Test: Create `tests/audit-fixes.test.ts`

**Interfaces:**
- Consumes: `notify(...flags)` from `src/state.ts` (rAF-batched DirtyFlag publish).
- Produces: `setShowTransformControls(show: boolean): void` now publishes `'composite'`, matching the snap toggle's pattern (`setSnapEnabled` in `src/tools/move.ts`).

- [ ] **Step 1: Write the failing vitest**

Create `tests/audit-fixes.test.ts` (Task 5 later extends this same file with crop/session-status imports):

```ts
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/canvas', () => ({ getOverlayScale: () => 1 }));

let documentModel: typeof import('../src/engine/document');
let stateModule: typeof import('../src/state');
let history: typeof import('../src/engine/history');
let overlay: typeof import('../src/canvas-overlay');
let sessions: typeof import('../src/engine/transform-session');

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 10 })
      })
    })
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  documentModel = await import('../src/engine/document');
  stateModule = await import('../src/state');
  history = await import('../src/engine/history');
  overlay = await import('../src/canvas-overlay');
  sessions = await import('../src/engine/transform-session');
});

beforeEach(() => {
  sessions.cancelTransform();
  stateModule.state.doc = documentModel.createDoc(800, 600);
  history.clear();
  overlay.setShowTransformControls(true);
});

test('toggling show-controls publishes a composite so the overlay repaints immediately', () => {
  const seen: Array<Set<string>> = [];
  stateModule.subscribe((dirty) => seen.push(new Set(dirty)));
  overlay.setShowTransformControls(false);
  expect(seen.some((dirty) => dirty.has('composite'))).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:core`
Expected: the new test FAILS (no composite published); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `src/canvas-overlay.ts`, add to the imports:

```ts
import { notify } from './state';
```

and change:

```ts
export function setShowTransformControls(show: boolean): void {
  showTransformControls = show;
  notify('composite');
}
```

- [ ] **Step 4: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

- [ ] **Step 5: Live verify**

With a layer selected on `?audit-raf` (Move tool), evaluate:

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  const st = await import('/src/state.ts');
  const doc = await import('/src/engine/document.ts');
  const layer = st.getActiveLayer();
  const nat = doc.layerNaturalSize(layer);
  const cx = Math.round(layer.x - Math.abs(nat.w * layer.scaleX / 100) / 2);
  const cy = Math.round(layer.y - Math.abs(nat.h * layer.scaleY / 100) / 2);
  const ctx = document.getElementById('doc-canvas').getContext('2d');
  const sum = () => { let s = 0; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const p = ctx.getImageData(cx + dx, cy + dy, 1, 1).data; s += p[0] + p[1] + p[2] + p[3]; } return s; };
  const on = sum();
  document.querySelector('#options-host [data-option-key="show-controls"] button').click();
  await settled();
  const off = sum(); // must differ WITHOUT any other action
  document.querySelector('#options-host [data-option-key="show-controls"] button').click();
  await settled();
  return { changedImmediately: on !== off, backOn: sum() === on };
})();
```

Expected: `{ changedImmediately: true, backOn: true }`.

- [ ] **Step 6: Commit**

```bash
git add src/canvas-overlay.ts tests/audit-fixes.test.ts
git commit -m "fix: repaint transform controls immediately when the toggle changes"
git push origin main
```

---

### Task 3: F-010 — keyboard shortcuts work while a button keeps focus

**Files:**
- Modify: `src/transform-session-guard.ts:19-22` (add `isTypingTarget`; keep `isInteractiveTarget`)
- Modify: `src/main.ts:48-53` (`initHistoryUI` keydown) and `src/main.ts:73-100` (document keydown)
- Test: `tests/ui-layout.test.mjs` (extend + update one regex)

**Interfaces:**
- Consumes: existing `isInteractiveTarget(target: Element | null): boolean` (INPUT/TEXTAREA/SELECT/BUTTON/A/contentEditable) — still used by the guard's Enter resolution and for preserving native button semantics.
- Produces: `isTypingTarget(target: Element | null): boolean` — true only for INPUT/TEXTAREA/SELECT/contentEditable. Later tasks and tests reference this exact name.

Design: letter tool shortcuts and Ctrl+Z/Y/T must work whenever the user is not *typing*. Enter/Escape/Space keep their native behavior when a button or link is focused (Enter/Space activate the focused control; our session handlers step aside).

- [ ] **Step 1: Update/extend the contracts (they fail first)**

In `tests/ui-layout.test.mjs`:

(a) In the test `'history navigation is blocked while any editing session is live'`, change:

```js
  assert.match(main, /isInteractiveTarget\(t\)\s*\|\|\s*historySessionBlocked\(\)/);
```

to:

```js
  assert.match(main, /isTypingTarget\(t\)\s*\|\|\s*historySessionBlocked\(\)/);
```

(b) Add a new test at the end:

```js
test('keyboard shortcuts are suppressed only while typing, not on focused buttons', () => {
  const guardSrc = readFileSync(resolve(root, 'src/transform-session-guard.ts'), 'utf8');
  assert.match(guardSrc, /export function isTypingTarget/);
  assert.doesNotMatch(guardSrc, /isTypingTarget[\s\S]{0,200}?'BUTTON'/);
  assert.match(main, /isTypingTarget\(t\)\s*\|\|\s*isTransformSessionGuardOpen\(\)/);
  assert.match(main, /buttonLikeFocused/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:ui`
Expected: both changed/new tests FAIL (`isTypingTarget` does not exist yet).

- [ ] **Step 3: Implement — guard module**

In `src/transform-session-guard.ts`, after `isInteractiveTarget`, add:

```ts
/** True only for elements the user types into — single-letter shortcuts stay active on buttons/links. */
export function isTypingTarget(target: Element | null): boolean {
  if (!target) return false;
  return (target as HTMLElement).isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
```

- [ ] **Step 4: Implement — main.ts keyboard routing**

In `src/main.ts` add `isTypingTarget` to the existing import from `'./transform-session-guard'`. Replace the `initHistoryUI` keydown listener with:

```ts
  document.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    if (isTypingTarget(t) || historySessionBlocked()) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
  });
```

Replace the document-level keydown handler (the one containing Ctrl+T / Enter / Escape / Space / tool letters) with:

```ts
document.addEventListener('keydown', (e) => {
  const t = document.activeElement;
  if (isTypingTarget(t) || isTransformSessionGuardOpen()) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    const activeLayer = state.doc.layers.find((layer) => layer.id === state.doc.activeLayerId);
    if (!activeLayer) { toast('Select a layer before starting Free Transform.'); return; }
    if (getTransformSession()) return;
    setActiveTool('move');
    beginTransform(activeLayer.id, 'explicit');
    return;
  }
  // Enter, Escape, and Space keep their native semantics on focused buttons/links.
  const buttonLikeFocused = isInteractiveTarget(t);
  if (!buttonLikeFocused) {
    const transformSession = getTransformSession();
    if (transformSession?.mode === 'explicit' && e.key === 'Enter') { e.preventDefault(); applyTransform(); return; }
    if (transformSession?.mode === 'explicit' && e.key === 'Escape') { e.preventDefault(); cancelTransform(); return; }
    if (getCropSession() && e.key === 'Enter') { e.preventDefault(); applyCrop(); setActiveTool('move'); return; }
    if (getCropSession() && e.key === 'Escape') { e.preventDefault(); cancelCrop(); setActiveTool('move'); return; }
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Space' && !e.repeat && !spaceHeld) {
      spaceHeld = true;
      toolBeforeSpace = getActiveTool().id;
      setActiveTool('hand');
      return;
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = allTools().find((x) => x.shortcut === e.key.toLowerCase());
  if (tool) guardTransformSession(() => setActiveTool(tool.id));
});
```

- [ ] **Step 5: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS (the `'Option A exposes contextual affine controls'` test still matches `e.key === 'Enter'` / `'Escape'` and `isInteractiveTarget(t)` in main).

- [ ] **Step 6: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  document.getElementById('btn-save').focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
  await settled();
  const toolWithButtonFocus = document.querySelector('#rail-tools .rail-btn.active')?.dataset.tool; // expect 'hand'
  document.activeElement?.blur?.();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
  await settled();
  // typing still suppresses:
  const xf = document.getElementById('prop-transform-x');
  xf.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
  await settled();
  const toolWhileTyping = document.querySelector('#rail-tools .rail-btn.active')?.dataset.tool; // expect 'move'
  xf.blur();
  return { toolWithButtonFocus, toolWhileTyping }; // expect { 'hand', 'move' }
})();
```

- [ ] **Step 7: Commit**

```bash
git add src/transform-session-guard.ts src/main.ts tests/ui-layout.test.mjs
git commit -m "fix: keep keyboard shortcuts active while buttons hold focus"
git push origin main
```

---

### Task 4: F-012 — Escape reverts the visible value in properties transform fields

**Files:**
- Modify: `src/properties-panel.ts:292-295` (Escape branch in the transform-field keydown)
- Test: `tests/ui-layout.test.mjs` (extend)

**Interfaces:**
- Consumes: `syncTransformFields(layer)` (skips `document.activeElement` to protect live typing).
- Produces: blur-then-sync ordering so the sync no longer skips the just-escaped field.

- [ ] **Step 1: Write the failing contract**

Add to `tests/ui-layout.test.mjs`:

```js
test('escape in properties transform fields blurs before syncing so the draft is discarded', () => {
  assert.match(propertiesPanel, /Escape[\s\S]{0,300}?input\.blur\(\);[\s\S]{0,300}?syncTransformFields\(layer\)/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:ui`
Expected: FAIL (current order is sync-then-blur).

- [ ] **Step 3: Implement**

In `src/properties-panel.ts`, inside `initPropertiesPanel()`'s transform-input keydown listener, replace the Escape branch:

```ts
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); input.blur(); }
      if (event.key === 'Escape') {
        event.preventDefault();
        // Blur FIRST: syncTransformFields skips the focused element to protect
        // live typing, so syncing before blur left the abandoned draft visible.
        input.blur();
        const layer = getActiveLayer();
        if (layer) syncTransformFields(layer);
      }
    });
```

- [ ] **Step 4: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

- [ ] **Step 5: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  const st = await import('/src/state.ts');
  if (!st.getActiveLayer()) document.querySelector('#layers-list-container .layer-card')?.click();
  await settled();
  const yf = document.getElementById('prop-transform-y');
  const docVal = yf.value;
  yf.focus(); yf.value = '999';
  yf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settled();
  return { fieldShows: yf.value, expected: docVal, reverted: yf.value === docVal }; // reverted: true
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/properties-panel.ts tests/ui-layout.test.mjs
git commit -m "fix: revert the visible transform field value when Escape abandons a draft"
git push origin main
```

---

### Task 5: F-013 — history rows respect the live-session block

**Files:**
- Create: `src/engine/session-status.ts`
- Modify: `src/main.ts:29-31` (`historySessionBlocked` delegates), `src/history-panel.ts` (guard row clicks)
- Test: `tests/audit-fixes.test.ts` (extend), `tests/ui-layout.test.mjs` (update the history-block test)

**Interfaces:**
- Consumes: `getTransformSession()` (`src/engine/transform-session.ts`), `getCropSession()` (`src/engine/crop-session.ts`), `isTransformSessionGuardOpen()` (`src/transform-session-guard.ts`).
- Produces: `isEditingSessionLive(): boolean` in `src/engine/session-status.ts` — used by `main.ts` and `src/history-panel.ts`.

- [ ] **Step 1: Write the failing tests**

(a) Extend `tests/audit-fixes.test.ts` — add the imports and beforeEach lines that Task 2 deferred, plus the test:

```ts
// add to the `let` declarations:
let crop: typeof import('../src/engine/crop-session');
let sessionStatus: typeof import('../src/engine/session-status');

// add inside beforeAll after the other imports:
  crop = await import('../src/engine/crop-session');
  sessionStatus = await import('../src/engine/session-status');

// add inside beforeEach, first line:
  crop.cancelCrop();

// new test:
test('isEditingSessionLive tracks transform and crop sessions', () => {
  expect(sessionStatus.isEditingSessionLive()).toBe(false);
  const layer = documentModel.createTextLayer(stateModule.state.doc);
  stateModule.state.doc.layers.push(layer);
  sessions.beginTransform(layer.id, 'explicit');
  expect(sessionStatus.isEditingSessionLive()).toBe(true);
  sessions.cancelTransform();
  expect(sessionStatus.isEditingSessionLive()).toBe(false);
  crop.beginCrop();
  expect(sessionStatus.isEditingSessionLive()).toBe(true);
  crop.cancelCrop();
  expect(sessionStatus.isEditingSessionLive()).toBe(false);
});
```

(b) In `tests/ui-layout.test.mjs`, replace the test `'history navigation is blocked while any editing session is live'` with:

```js
test('history navigation is blocked while any editing session is live', () => {
  assert.match(main, /historySessionBlocked/);
  assert.match(main, /isTypingTarget\(t\)\s*\|\|\s*historySessionBlocked\(\)/);
  const sessionStatus = readFileSync(resolve(root, 'src/engine/session-status.ts'), 'utf8');
  assert.match(sessionStatus, /getTransformSession\(\)\)\s*\|\|\s*Boolean\(getCropSession\(\)/);
  const historyPanel = readFileSync(resolve(root, 'src/history-panel.ts'), 'utf8');
  assert.match(historyPanel, /isEditingSessionLive\(\)/);
  assert.match(main, /subscribeTransformSession\(refresh\)/);
  assert.match(main, /subscribeCropSession\(refresh\)/);
  const guardSource = readFileSync(resolve(root, 'src/transform-session-guard.ts'), 'utf8');
  assert.match(guardSource, /hasActiveTransformGesture\(\)\)\s*interruptGesture\(\)/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:core; npm run test:ui`
Expected: both FAIL (`src/engine/session-status.ts` does not exist).

- [ ] **Step 3: Implement**

Create `src/engine/session-status.ts`:

```ts
import { getTransformSession } from './transform-session';
import { getCropSession } from './crop-session';
import { isTransformSessionGuardOpen } from '../transform-session-guard';

/**
 * True while any editing session (or its unresolved exit guard) is live.
 * History must stay frozen in this state: a mid-session jump would desync
 * cached snap candidates and silently abandon the user's in-progress edit.
 */
export function isEditingSessionLive(): boolean {
  return Boolean(getTransformSession()) || Boolean(getCropSession()) || isTransformSessionGuardOpen();
}
```

In `src/main.ts`, import it and delegate (keep the explanatory comment on `historySessionBlocked`):

```ts
import { isEditingSessionLive } from './engine/session-status';

function historySessionBlocked(): boolean {
  return isEditingSessionLive();
}
```

(remove the now-unused `isTransformSessionGuardOpen` from this function only if no other main.ts call site uses it — the document keydown handler still does, so the import stays.)

In `src/history-panel.ts`, add the import and guard the row click:

```ts
import { isEditingSessionLive } from './engine/session-status';
```

```ts
      row.addEventListener('click', () => {
        if (isEditingSessionLive()) return;
        history.jump(i);
      });
```

- [ ] **Step 4: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

- [ ] **Step 5: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  const st = await import('/src/state.ts');
  const hist = await import('/src/engine/history.ts');
  // make two edits so history has entries
  document.querySelector('#layers-list-container .layer-card')?.click(); await settled();
  const xf = document.getElementById('prop-transform-x');
  xf.value = String(Number(xf.value) + 10); xf.dispatchEvent(new Event('change', { bubbles: true })); await settled();
  document.querySelector('#layers-history-tabs button[data-tab="history"]').click(); await settled();
  document.activeElement?.blur?.();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true })); await settled();
  const pre = hist.cursor();
  const rows = [...document.querySelectorAll('#history-list .history-row')];
  rows[rows.length - 1].click(); await settled();
  const blocked = hist.cursor() === pre; // expect true
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await settled();
  rows[rows.length - 1].click(); await settled();
  const worksAfter = hist.cursor() !== pre; // expect true
  document.querySelector('#history-list .history-row').click(); await settled();
  document.querySelector('#layers-history-tabs button[data-tab="layers"]').click(); await settled();
  return { blocked, worksAfter };
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/session-status.ts src/main.ts src/history-panel.ts tests/audit-fixes.test.ts tests/ui-layout.test.mjs
git commit -m "fix: block history-panel rows while an editing session is live"
git push origin main
```

---

### Task 6: F-001/F-002/F-003 (+F-004 stretch) — options row wraps; sticky overlay removed

**Files:**
- Modify: `src/style.css:262-267` (`.options-host`), `src/style.css:341-356` (`.transform-session-actions` / `.opt-essential`), `src/style.css:1378-1386` (redundant compact overrides)
- Test: `tests/ui-layout.test.mjs` (extend)

**Interfaces:**
- Consumes: the compact-mode pattern already proven at ≤1023 px (wrap + non-positioned essentials).
- Produces: an options row that wraps at every width; `.opt-essential` stays a visual chip with NO positioning. `body`'s grid gives `.editor-shell` the flexible row, so a second options row shrinks the canvas area instead of overlapping anything.

- [ ] **Step 1: Write the failing contracts**

Add to `tests/ui-layout.test.mjs`:

```js
test('options row wraps at all widths and pinned actions never overlay siblings', () => {
  assert.match(css, /\.options-host\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /\.opt-essential\s*\{[^}]*position:\s*sticky/);
  assert.doesNotMatch(css, /right:\s*70px/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:ui`
Expected: FAIL (sticky + `right: 70px` still present; no wrap on the standalone `.options-host` block).

- [ ] **Step 3: Implement the CSS**

In `src/style.css` replace the `.options-host` block (lines 262–267) with:

```css
.options-host {
  flex: 1 1 auto;
  min-width: 0;
  gap: 6px;
  flex-wrap: wrap;
  overflow: visible;
}
```

Replace the `.transform-session-actions` / `.opt-essential` blocks (lines 341–356) with:

```css
.transform-session-actions {
  margin-left: 2px;
}

.opt-essential {
  padding: 2px;
  border-radius: 6px;
  background: var(--glass-strong);
}
```

(delete the `.opt-essential[data-option-key="apply"] { right: 70px; }` block entirely.)

In the `@media (max-width: 1023px)` block, delete the now-redundant override (lines 1382–1386):

```css
  .opt-essential {
    position: relative;
    right: auto;
    background: transparent;
  }
```

and delete the redundant `.options-host { overflow: visible; }` block (lines 1378–1380). Keep the grouped `flex-wrap: wrap` rule (lines 1371–1376) — the compact contract test asserts it.

- [ ] **Step 4: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS (including the pre-existing `'compact options wrap while transform decisions stay visible'` test).

- [ ] **Step 5: Live verify — owner acceptance criterion**

Run the audit probe (`docs/superpowers/audit/overlap-probe.js`) on `?audit-raf` with a layer selected, at widths **1024, 1100, 1200, 1280, 1440** (resize the preview per width) × dock states (both visible / hide-left / hide-right / both hidden) × Move and Crop tools. Acceptance per run:

- `surfaceViolations: []` and `clipped: []`;
- no `occluded` entry whose control id starts with `#tool-option-` (properties-dock scroll false-positives remain excluded);
- additionally at each width: `document.getElementById('options-host').scrollWidth <= document.getElementById('options-host').clientWidth + 1` (nothing scrolled out — everything wrapped into view);
- rotation input is clickable: `elementFromPoint` at `#tool-option-rotation`'s center returns the input itself;
- `.editor-shell` still has positive height (`document.querySelector('.editor-shell').getBoundingClientRect().height > 300`).

Stretch (F-004): resize to 375×812 and confirm `#tool-option-snap`'s center hit-tests to itself or a descendant; if it still hits a foreign span, record "F-004 deferred" in `docs/superpowers/audit/2026-07-13-findings.md` instead of fixing further.

- [ ] **Step 6: Commit**

```bash
git add src/style.css tests/ui-layout.test.mjs
git commit -m "fix: wrap the options row at all widths and drop the sticky session-action overlay"
git push origin main
```

---

### Task 7: F-006 — deterministic pan reset at 100% zoom

**Files:**
- Modify: `src/canvas.ts:23-31` (`setZoom`)
- Test: `tests/ui-layout.test.mjs` (extend)

**Interfaces:**
- Consumes: module-level `zoom/panX/panY` in `src/canvas.ts`.
- Produces: epsilon snap — any zoom within 1e-6 of 1.0 becomes exactly 1.0 and recenters.

- [ ] **Step 1: Write the failing contract**

Add to `tests/ui-layout.test.mjs`:

```js
test('zoom snaps to exactly 100% within an epsilon so pan reset is deterministic', () => {
  assert.match(canvas, /Math\.abs\(zoom\s*-\s*1\)\s*<\s*1e-6/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:ui` — Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/canvas.ts`, replace `setZoom`:

```ts
function setZoom(next: number, cx = 0, cy = 0): void {
  const clamped = Math.max(0.25, Math.min(4, next));
  const factor = clamped / zoom;
  panX -= cx * (factor - 1);
  panY -= cy * (factor - 1);
  zoom = clamped;
  // Button steps accumulate float error (1 ± ε reads as 100%): snap within an
  // epsilon so returning to 100% always recenters.
  if (Math.abs(zoom - 1) < 1e-6) { zoom = 1; panX = 0; panY = 0; }
  applyZoom();
}
```

- [ ] **Step 4: Run gates** — all four, expected PASS.

- [ ] **Step 5: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  const cv = await import('/src/canvas.ts');
  cv.resetView(); cv.panBy(50, 30);
  for (let i = 0; i < 3; i++) document.getElementById('zoom-in').click();
  for (let i = 0; i < 3; i++) document.getElementById('zoom-out').click();
  await settled();
  const t = document.getElementById('zoom-wrap').style.transform;
  cv.resetView();
  return { transform: t, recentered: t === 'translate(0px, 0px) scale(1)' }; // recentered: true
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/canvas.ts tests/ui-layout.test.mjs
git commit -m "fix: snap zoom to exactly 100% so pan reset is deterministic"
git push origin main
```

---

### Task 8: F-007 — live zoom readout in the options bar

**Files:**
- Modify: `src/state.ts:13` (add `'view'` DirtyFlag), `src/canvas.ts:18-21` (`applyZoom` publishes it), `src/options-bar.ts:127-129` (subscribe re-renders on it)
- Test: `tests/ui-layout.test.mjs` (extend)

**Interfaces:**
- Consumes: DirtyFlag publish/subscribe in `src/state.ts`.
- Produces: `DirtyFlag` union gains `'view'`; `applyZoom()` calls `notify('view')`; the options bar re-renders on `dirty.has('view')` (rAF-batched, so pan/zoom bursts collapse to one render per frame).

- [ ] **Step 1: Write the failing contract**

Add to `tests/ui-layout.test.mjs`:

```js
test('zoom publishes a view flag and the options bar re-renders on it', () => {
  const stateSrc = readFileSync(resolve(root, 'src/state.ts'), 'utf8');
  assert.match(stateSrc, /'view'/);
  assert.match(canvas, /notify\('view'\)/);
  assert.match(optionsBar, /dirty\.has\('view'\)/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL.

- [ ] **Step 3: Implement**

`src/state.ts`:

```ts
export type DirtyFlag = 'structure' | 'selection' | 'layerProps' | 'canvasConfig' | 'composite' | 'view';
```

`src/canvas.ts` — `applyZoom` becomes (note: `canvas.ts` already imports `notify` from `'./state'`):

```ts
function applyZoom(): void {
  zoomWrap.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  $('zoom-readout').textContent = `${Math.round(zoom * 100)}%`;
  notify('view');
}
```

`src/options-bar.ts` — the subscribe callback becomes:

```ts
  subscribe((dirty) => {
    if (dirty.has('selection') || dirty.has('layerProps') || dirty.has('structure') || dirty.has('view')) render();
  });
```

- [ ] **Step 4: Run gates** — all four, expected PASS.

- [ ] **Step 5: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  document.activeElement?.blur?.();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
  await settled();
  document.getElementById('zoom-in').click();
  await settled();
  const pill = document.getElementById('zoom-readout').textContent;
  const optDisplay = document.querySelector('#options-host .opt-value')?.textContent;
  document.getElementById('zoom-readout').click(); // reset
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
  await settled();
  return { pill, optDisplay, inSync: pill === optDisplay }; // inSync: true
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/state.ts src/canvas.ts src/options-bar.ts tests/ui-layout.test.mjs
git commit -m "fix: keep the zoom option readout in sync with the live zoom"
git push origin main
```

---

### Task 9: F-009 — crop Apply/Cancel buttons return to the Move tool

**Files:**
- Modify: `src/tools/crop.ts:117-125` (both session actions) + import
- Test: `tests/ui-layout.test.mjs` (extend the existing crop-controls test)

**Interfaces:**
- Consumes: `setActiveTool(id)` from `src/engine/tools.ts` (same call the keyboard path in `src/main.ts` makes).
- Produces: button-apply/cancel end in the Move tool, matching Enter/Escape.

- [ ] **Step 1: Write the failing contract**

In `tests/ui-layout.test.mjs`, inside the existing test `'Crop contextual controls expose ratio presets, dimensions, and decisions'`, add at the end:

```js
  assert.match(crop, /applyCrop\(\);\s*setActiveTool\(['"]move['"]\)/);
  assert.match(crop, /cancelCrop\(\);\s*setActiveTool\(['"]move['"]\)/);
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL.

- [ ] **Step 3: Implement**

In `src/tools/crop.ts`, extend the first import:

```ts
import { type Tool, type DocPoint } from '../engine/tools';
```

becomes:

```ts
import { setActiveTool, type Tool, type DocPoint } from '../engine/tools';
```

and change the two session actions:

```ts
    {
      key: 'crop-apply', label: 'Apply', kind: 'action', group: 'session', icon: icons.apply, essential: true,
      disabled: noSession,
      run: () => { applyCrop(); setActiveTool('move'); }
    },
    {
      key: 'crop-cancel', label: 'Cancel', kind: 'action', group: 'session', icon: icons.cancel, essential: true,
      disabled: noSession,
      run: () => { cancelCrop(); setActiveTool('move'); }
    }
```

- [ ] **Step 4: Run gates** — all four, expected PASS.

- [ ] **Step 5: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  document.activeElement?.blur?.();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
  await settled();
  document.querySelector('#options-host [data-option-key="crop-cancel"] button').click();
  await settled();
  return { toolAfterCancel: document.querySelector('#rail-tools .rail-btn.active')?.dataset.tool }; // 'move'
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/tools/crop.ts tests/ui-layout.test.mjs
git commit -m "fix: return to the Move tool when crop is applied or cancelled from the options bar"
git push origin main
```

---

### Task 10: F-011 — truthful status hints for Hand, Zoom, and idle Crop

**Files:**
- Modify: `src/main.ts:120-134` (`syncContextStatus` fallback branch)
- Test: `tests/ui-layout.test.mjs` (extend)

**Interfaces:**
- Consumes: `getActiveTool()` from `src/engine/tools.ts`.
- Produces: per-tool fallback status text.

- [ ] **Step 1: Write the failing contract**

Add to `tests/ui-layout.test.mjs`:

```js
test('status line shows tool-appropriate hints', () => {
  assert.match(main, /Hand · Drag to pan/);
  assert.match(main, /Zoom · Click to zoom in/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test:ui`, expected FAIL.

- [ ] **Step 3: Implement**

In `src/main.ts`, replace the final `else` branch of `syncContextStatus` with:

```ts
  } else {
    const tool = getActiveTool();
    if (tool.id === 'hand') status.textContent = 'Hand · Drag to pan the view';
    else if (tool.id === 'zoom') status.textContent = 'Zoom · Click to zoom in · Alt-click zooms out';
    else if (tool.id === 'crop') status.textContent = 'Crop · Click the canvas to start a crop';
    else status.textContent = `${tool.label} · Shift constrains · Ctrl/Cmd bypasses Snap`;
  }
```

- [ ] **Step 4: Run gates** — all four, expected PASS.

- [ ] **Step 5: Live verify**

```js
(async () => {
  const settled = () => new Promise(r => setTimeout(r, 100));
  const texts = {};
  for (const k of ['h', 'z', 'v']) {
    document.activeElement?.blur?.();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    await settled();
    texts[k] = document.getElementById('status-context').textContent;
  }
  return texts; // h: 'Hand · Drag to pan the view', z: 'Zoom · Click to zoom in · Alt-click zooms out', v: 'Move · Shift constrains · Ctrl/Cmd bypasses Snap'
})();
```

- [ ] **Step 6: Commit**

```bash
git add src/main.ts tests/ui-layout.test.mjs
git commit -m "fix: show tool-appropriate hints in the status line"
git push origin main
```

---

### Task 11: Final verification, findings statuses, changelog, and agent protocol

**Files:**
- Modify: `docs/superpowers/audit/2026-07-13-findings.md` (per-finding `Status:` lines), `docs/changelog.md` (new release entry)
- No source changes.

**Interfaces:**
- Consumes: all fixes from Tasks 1–10.
- Produces: shipped release record; audit ledger closed out.

- [ ] **Step 1: Full-app live regression pass**

On `?audit-raf` at 1280×800: re-run the geometry probe (default state, Move tool, layer selected) — expect zero `surfaceViolations`, zero options-bar `occluded`, zero `clipped`. Spot-check one flow per fix task (color picker visible in Custom; show-controls immediate; `h` with a button focused; Escape reverts field text; history row inert during Ctrl+T; rotation input clickable at 1024; 3-in/3-out recenters; zoom option readout live; crop button-cancel returns to Move; Hand status text).

- [ ] **Step 2: Close out the findings ledger**

In `docs/superpowers/audit/2026-07-13-findings.md`, add `- Status: fixed (2026-07-16)` as the last line of each approved finding's entry (F-001, F-002, F-003, F-005, F-006, F-007, F-008, F-009, F-010, F-011, F-012, F-013), and for F-004 either `- Status: fixed (2026-07-16)` or `- Status: deferred — mobile is log-only per spec` per Task 6's stretch outcome.

- [ ] **Step 3: Changelog entry**

Add at the top of the release list in `docs/changelog.md` (below the intro paragraph, above `## 3.0.0`):

```markdown
## 3.1.0 - 2026-07-16

### Fixed

- **UI functionality and layout audit fixes**: the options row now wraps at every width so no control is covered or pushed out of reach (previously the pinned Apply/Cancel overlay could swallow clicks on the rotation input mid-session); the custom background color picker appears in Custom mode; transform-control visibility toggles repaint immediately; keyboard shortcuts stay active after clicking toolbar buttons; Escape discards the visible draft in properties fields; history entries are inert while a transform or crop session is live; returning to 100% zoom reliably recenters the view; the options-bar zoom readout tracks live zoom; crop Apply/Cancel buttons return to the Move tool; and the status line shows tool-appropriate hints. (Plan: 2026-07-16-ui-audit-fixes.)
```

- [ ] **Step 4: Run gates**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS (`test:docs` validates the changelog's markdown and link rules).

- [ ] **Step 5: Commit and push**

```bash
git add docs/superpowers/audit/2026-07-13-findings.md docs/changelog.md
git commit -m "docs: record audit fix statuses and 3.1.0 changelog entry"
git push origin main
```

- [ ] **Step 6: Agent protocol (AGENTS.md Section 3)**

The post-commit git hook refreshes the code graph automatically. Because Task 5 added a module (`src/engine/session-status.ts`), re-export the vault: `python -m graphify export obsidian`. Verify `graphify-out/` stays untracked (`git status --short` shows nothing to commit from it). Public docs beyond the changelog need no updates — no documented shortcut or workflow changed (Enter/Escape crop behavior is unchanged; button behavior now matches it).
