# UI Functionality & Layout Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** Tasks 3–7 drive the live app through the session's browser preview pane. There is one browser pane per session, so these tasks should run **inline** (executing-plans), not in parallel subagents.

**Goal:** Produce a complete, owner-triageable findings ledger proving (or disproving) that every interactive control works end-to-end and no UI surfaces overlap or clip, per the approved spec `docs/superpowers/specs/2026-07-13-ui-functionality-audit-design.md`.

**Architecture:** Three discovery instruments — a static control inventory (from source), a self-testing browser geometry probe (overlaps/occlusion/clipping), and a stateful live behavior sweep — all writing into one findings ledger. The plan ends at the owner triage checkpoint; approved findings then get a follow-up fix plan (one TDD'd fix per commit).

**Tech Stack:** Vanilla TypeScript + Vite app (zero runtime deps). Node `node:test` (`test:ui`, `test:docs`), vitest (`test:core`). Browser driven via the session preview (`.claude/launch.json` server name `dev`, configured port 5173 — always use the URL the preview reports).

## Global Constraints

- ZERO runtime npm dependencies; no new E2E frameworks or dev dependencies.
- Viewports: primary 1280×800 and up; at ~1024px width "degrades gracefully" means **zero overlap violations** (cosmetic tightness is acceptable). Mobile (375px) is log-only.
- Functional bar: a control passes only if its **intended end effect is observable** (document state, canvas pixels, history entry, download). "Clickable and doesn't throw" is not sufficient.
- Overlap violation (spatial-glass UI — panels floating over the canvas are by design): (1) two interactive surfaces intersect so a control is occluded or unclickable; (2) content is clipped by its container or the viewport.
- A control correctly blocked by the transform-session guard is a **pass**, not a finding.
- Triage checkpoint: NO fix is implemented in this plan. Discovery only; owner approves findings first.
- Commits: subject line only (conventional prefix like `docs:`), NO Co-Authored-By trailer. Push to origin after each task.
- Before each commit run all gates: `npm run test:core`, `npm run test:ui`, `npm run test:docs`, `npm run build`.
- Audit artifacts live in `docs/superpowers/audit/` (pruned later per docs-housekeeping convention, like completed plans).

## Shared helpers (used by Tasks 3–7 via the browser JS console)

```js
// Wait for rAF-batched renders to settle before asserting.
const settled = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

// Sample one canvas pixel (canvas-space coordinates, DPR already baked into canvas.width).
const px = (x, y) => {
  const c = document.getElementById('doc-canvas');
  return [...c.getContext('2d').getImageData(x, y, 1, 1).data];
};

// Seed a deterministic image layer without an OS file dialog.
const seedImageLayer = async () => {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#e5484d'; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#30a46c'; g.fillRect(40, 40, 120, 80);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'probe.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.getElementById('file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settled();
};
// If the change-event path does not create a layer, fall back to a drop event:
const seedViaDrop = async (dt) => {
  const zone = document.getElementById('upload-zone');
  zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  await settled();
};
```

Timing rule for every assertion: `await settled()` first; if a check still fails, retry once after a second `settled()` before recording a finding (rAF batching + debounced autosave).

**Sweep procedure for every inventory row (Tasks 4–7):** put the app in the row's required state → exercise the control (click/type/keyboard) → `await settled()` → verify the row's "Verify by" observation → mark the row PASS, or append a ledger finding and mark FAIL(F-nnn). A control correctly blocked by the session guard is PASS.

---

### Task 1: Static control inventory + completeness checker

**Files:**
- Create: `docs/superpowers/audit/2026-07-13-control-inventory.md`
- Create: `docs/superpowers/audit/check-inventory.mjs`

**Interfaces:**
- Consumes: `index.html`, `src/topbar.ts`, `src/rail.ts`, `src/options-bar.ts`, `src/properties-panel.ts`, `src/layers-panel.ts`, `src/history-panel.ts`, `src/toast.ts`, `src/export.ts`, `src/engine/tools.ts`, `src/tools/move.ts`, `src/tools/hand.ts`, `src/tools/zoom.ts`, `src/tools/crop.ts`, `src/transform-session-guard.ts`, `src/main.ts` (keyboard routing), `README.md` (documented behavior/shortcuts).
- Produces: inventory rows with stable IDs `C-001…C-nnn` that Tasks 4–7 mark PASS/FAIL; checker script `node docs/superpowers/audit/check-inventory.mjs` exiting 0 when complete.

- [ ] **Step 1: Write the completeness checker first (it is the test for the inventory)**

```js
// docs/superpowers/audit/check-inventory.mjs
// Fails (exit 1) if any static interactive control in index.html is missing
// from the control inventory document.
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const inv = readFileSync('docs/superpowers/audit/2026-07-13-control-inventory.md', 'utf8');

const ids = [...html.matchAll(/<(?:button|input|select|textarea)[^>]*\sid=["']([^"']+)["']/g)]
  .map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !inv.includes('`#' + id + '`'));

if (missing.length) {
  console.error('MISSING from inventory:', missing.join(', '));
  process.exit(1);
}
console.log(`OK — all ${new Set(ids).size} static interactive ids covered`);
```

- [ ] **Step 2: Run the checker to verify it fails before the inventory exists**

Run: `node docs/superpowers/audit/check-inventory.mjs`
Expected: FAIL — `ENOENT` (inventory file does not exist yet).

- [ ] **Step 3: Build the inventory document**

Read each source file listed under **Consumes** and record EVERY interactive control — static (in `index.html`) and dynamically created (rail tool buttons from the tool registry; options-bar controls from each tool's `ToolOption` descriptors including Crop's `crop-width`, `crop-height`, `crop-reset`, `crop-apply`, `crop-cancel` and ratio presets `free/original/1:1/4:5/16:9/9:16/custom`; properties-panel effect rows, blend select, transform fields `#prop-transform-x/y/width/height/rotation`, `#prop-transform-link`, name chip; layers-panel row controls; history-panel entries; toast action buttons; guard buttons `#transform-session-apply`/`#transform-session-cancel`). Include documented keyboard shortcuts (V/H/Z/C, Ctrl+T, Enter/Escape, Ctrl+Z/Y) as rows — the sweep verifies button/shortcut parity only where README documents both.

Document format (every row uses backticked selector so the checker matches):

```markdown
# UI Control Inventory — 2026-07-13

| ID | Control | Surface | Source | Expected end effect | Verify by |
|----|---------|---------|--------|---------------------|-----------|
| C-001 | `#btn-undo` | Appbar | src/topbar.ts | Last command reverted; history pointer moves up | #history-list selection + canvas pixel change |
| C-002 | `#btn-redo` | Appbar | src/topbar.ts | Reverted command re-applied | #history-list selection + canvas pixel change |
```

Also add a `## Sweep states` section listing the states every applicable control is tested in: per tool (Move/Hand/Zoom/Crop), no-layer / image-layer / text-layer selected, live session (Free Transform, Crop) with guard, panel hidden/shown.

- [ ] **Step 4: Run the checker to verify it passes**

Run: `node docs/superpowers/audit/check-inventory.mjs`
Expected: `OK — all N static interactive ids covered` (exit 0).

- [ ] **Step 5: Run quality gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS (no source was touched).

```bash
git add docs/superpowers/audit/2026-07-13-control-inventory.md docs/superpowers/audit/check-inventory.mjs
git commit -m "docs: add UI audit control inventory and completeness checker"
git push origin main
```

---

### Task 2: Self-testing overlap probe

**Files:**
- Create: `docs/superpowers/audit/overlap-probe.js`

**Interfaces:**
- Consumes: region classes/ids contracted in `tests/ui-layout.test.mjs`: `.appbar`, `.rail`, `.canvas-workspace`, `.properties-dock`, `.layers-history-dock`, `.statusbar`, `#transform-session-guard`.
- Produces: an IIFE that returns `{ viewport, surfaceViolations, occluded, clipped }` when evaluated in the page; Task 3 runs it verbatim via the browser JS console.

- [ ] **Step 1: Write the probe (geometry self-test built in — the script refuses to report if its own math is wrong)**

```js
// docs/superpowers/audit/overlap-probe.js
// Evaluate in the running app's page. Returns a report object:
//   surfaceViolations — glass surfaces intersecting (canvas-workspace pairs excluded: by design)
//   occluded          — interactive controls whose center hit-tests to a foreign element
//   clipped           — interactive controls extending outside the viewport
(() => {
  const overlapArea = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  };

  // Self-test: abort rather than emit garbage.
  const T = (left, top, right, bottom) => ({ left, top, right, bottom });
  const selfTests = [
    [overlapArea(T(0, 0, 10, 10), T(5, 5, 15, 15)), 25],
    [overlapArea(T(0, 0, 10, 10), T(10, 0, 20, 10)), 0], // edge touch is not overlap
    [overlapArea(T(0, 0, 10, 10), T(20, 20, 30, 30)), 0]
  ];
  for (const [got, want] of selfTests) {
    if (got !== want) return { error: `probe self-test failed: got ${got}, want ${want}` };
  }

  const describe = (el) =>
    el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const SURFACES = [
    '.appbar', '.rail', '.canvas-workspace', '.properties-dock',
    '.layers-history-dock', '.statusbar', '#transform-session-guard'
  ];
  const surfaces = SURFACES
    .map((sel) => [sel, document.querySelector(sel)])
    .filter(([, el]) => el && visible(el));

  const surfaceViolations = [];
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const [selA, a] = surfaces[i];
      const [selB, b] = surfaces[j];
      // Panels floating over the canvas are by design (spatial glass).
      if (selA === '.canvas-workspace' || selB === '.canvas-workspace') continue;
      // The session guard intentionally covers everything while open.
      if (selA === '#transform-session-guard' || selB === '#transform-session-guard') continue;
      const area = overlapArea(a.getBoundingClientRect(), b.getBoundingClientRect());
      if (area > 1) surfaceViolations.push({ a: selA, b: selB, area: Math.round(area) });
    }
  }

  const controls = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')]
    .filter((el) => visible(el) && !el.closest('[inert]'));

  const occluded = [];
  const clipped = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) {
      clipped.push({ control: describe(el), rect: { l: r.left, t: r.top, r: r.right, b: r.bottom } });
      continue;
    }
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      occluded.push({ control: describe(el), by: describe(hit) });
    }
  }

  return {
    viewport: { w: innerWidth, h: innerHeight },
    surfaceViolations,
    occluded,
    clipped
  };
})();
```

- [ ] **Step 2: Start the preview and validate the probe runs**

Start the `dev` server via the browser preview (server name `dev` in `.claude/launch.json`; use the URL/port the preview reports). Evaluate the full script in the page.
Expected: a report object with `viewport.w`/`viewport.h` matching the window, no `error` key, and the three arrays present (their contents are Task 3's business, not this task's).

- [ ] **Step 3: Prove the self-test guard works**

Temporarily change `25` to `26` in the first self-test entry, re-evaluate.
Expected: `{ error: "probe self-test failed: got 25, want 26" }`. Revert to `25`, re-evaluate, expected: normal report again.

- [ ] **Step 4: Run quality gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/overlap-probe.js
git commit -m "docs: add self-testing overlap probe for UI audit"
git push origin main
```

---

### Task 3: Geometry sweep (both widths, all layout states)

**Files:**
- Create: `docs/superpowers/audit/2026-07-13-findings.md`

**Interfaces:**
- Consumes: `overlap-probe.js` (Task 2), rail toggles `#rail-layers` / `#rail-props`, tool shortcuts V/H/Z/C, Ctrl+T (Free Transform), C + drag (crop session), `seedImageLayer` helper.
- Produces: findings ledger with entries `F-001…`; Tasks 4–7 append using the next free `F-` number.

Ledger entry format (used by every subsequent task):

```markdown
## F-001 — [broken|overlap|cosmetic] Short title
- Surface: <where>
- State: <viewport, tool, panel/session state>
- Repro: 1) … 2) …
- Expected: …
- Actual: …
- Candidate cause: src/file.ts (optional, only if obvious)
```

- [ ] **Step 1: Create the ledger skeleton**

```markdown
# UI Audit Findings — 2026-07-13

Severity: **broken** (control has no/incorrect end effect) > **overlap** (occlusion/clipping per spec definition) > **cosmetic**.
Status values are assigned at triage: approved / deferred / rejected.

<!-- entries appended below -->
```

- [ ] **Step 2: Run the probe matrix at 1280×800**

Resize the preview to 1280×800. With an image layer seeded (`seedImageLayer`), evaluate the probe in each state and record every non-empty `surfaceViolations` / `occluded` / `clipped` entry as a ledger finding (severity `overlap`):

1. Default (both docks visible), Move tool
2. `#rail-layers` toggled off (layers-history dock hidden)
3. `#rail-props` toggled off (properties dock hidden)
4. Both docks hidden
5. Both docks visible again; Hand tool (H), Zoom tool (Z), Crop tool (C) — one run each (options bar re-renders per tool)
6. Crop session active (C, then drag a crop rect on the canvas) — run, then Escape
7. Free Transform active (select layer, Ctrl+T) — run, then Escape; if the guard opens on Escape, that is expected — use `#transform-session-cancel`

Expected: a probe report per state; findings recorded with the exact state string.

- [ ] **Step 3: Repeat the same matrix at 1024×800**

Same 7+ states. Per the spec, ANY overlap violation at 1024px is a finding (cosmetic tightness is not).

- [ ] **Step 4: One log-only mobile run**

Resize to 375×812, default state, run the probe once. Record findings with severity `cosmetic` and a `(mobile — log-only per spec)` marker; fold in the known deferred minor "mobile stacking order vs spec §2" here if reproduced.

- [ ] **Step 5: Run quality gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/2026-07-13-findings.md
git commit -m "docs: record UI audit geometry sweep findings"
git push origin main
```

---

### Task 4: Behavior sweep — appbar, size chip, zoom cluster, statusbar, upload

**Files:**
- Modify: `docs/superpowers/audit/2026-07-13-control-inventory.md` (mark PASS/FAIL per row)
- Modify: `docs/superpowers/audit/2026-07-13-findings.md` (append failures)

**Interfaces:**
- Consumes: inventory rows for `src/topbar.ts` / `src/export.ts` / upload controls; helpers `settled`, `px`, `seedImageLayer`; ledger `F-` numbering.
- Produces: every appbar/status/upload inventory row marked PASS or FAIL(F-nnn).

Sweep procedure for every row (identical in Tasks 4–7): put the app in the row's required state → exercise the control (click/type/keyboard) → `await settled()` → verify the row's "Verify by" observation → mark PASS, or record a ledger finding and mark FAIL(F-nnn). On unexpected failure, retry once after another `settled()` before recording.

- [ ] **Step 1: Runtime completeness check for this surface**

At 1280×800, default state, list live controls and diff against the inventory:

```js
[...document.querySelectorAll('.appbar button, .appbar input, .appbar select, .statusbar button')]
  .map(el => el.id ? '#' + el.id : el.className).join('\n');
```

Any control not in the inventory gets appended to the inventory (new `C-` row) before sweeping.

- [ ] **Step 2: Sweep document/file controls**

Fresh page load, then `seedImageLayer`. Exercise and verify at minimum: `#btn-open` (guarded file dialog — verify the dialog request or guard behavior, do not complete an OS dialog), `#btn-save` (project download triggered — verify via the browser's download/network evidence), `#btn-export` (PNG download; verify canvas render path was used — a re-render must not differ from screen), `#btn-undo` / `#btn-redo` (make one edit first: history pointer moves AND a sampled canvas pixel reverts/reapplies — use `px`), `#btn-add-image` / `#btn-add-text` (a new layer appears and becomes active; rail buttons `#rail-add-image`/`#rail-add-text` are Task 5's), `#upload-zone` + `#file-input` (via `seedImageLayer`: a new layer row appears in `#layers-list-container` and the canvas shows the seeded red/green fixture).

- [ ] **Step 3: Sweep size chip + custom dimensions + background color**

`#size-chip` presets: pick a preset → `#canvas-width` / `#canvas-height` inputs AND `#status-doc-size` must reflect it (this is deferred minor "size-menu presets don't sync custom W/H inputs" — confirm or clear it explicitly). Custom `#canvas-width`/`#canvas-height` entry: canvas resizes, status text updates. `#bg-color-picker`: background pixel changes (`px` on an empty corner).

- [ ] **Step 4: Sweep zoom cluster and statusbar**

`#zoom-in` / `#zoom-out` / `#zoom-readout`: readout percentage changes and canvas scale visibly changes. Deferred minor "zoom float drift vs `zoom===1` pan reset": zoom in N times then out N times — readout must return to exactly 100% and pan-reset behavior must trigger; record drift otherwise. `#status-context` updates when switching tools (V/H/Z/C).

- [ ] **Step 5: Run gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/2026-07-13-control-inventory.md docs/superpowers/audit/2026-07-13-findings.md
git commit -m "docs: record appbar and status behavior sweep results"
git push origin main
```

---

### Task 5: Behavior sweep — rail, tools, options bar, session guard

**Files:**
- Modify: `docs/superpowers/audit/2026-07-13-control-inventory.md`
- Modify: `docs/superpowers/audit/2026-07-13-findings.md`

**Interfaces:**
- Consumes: inventory rows for `src/rail.ts`, `src/engine/tools.ts`, `src/tools/*.ts`, `src/options-bar.ts`, `src/transform-session-guard.ts`; helpers; ledger numbering.
- Produces: every rail/tool/options/guard row marked PASS or FAIL(F-nnn).

- [ ] **Step 1: Runtime completeness check per tool**

For each tool (V, H, Z, C), list `#options-host` controls (`[data-option-key]` elements) and append any control missing from the inventory:

```js
[...document.querySelectorAll('#options-host [data-option-key]')]
  .map(el => el.dataset.optionKey).join(', ');
```

- [ ] **Step 2: Sweep the rail**

Tool buttons in `#rail-tools`: clicking each activates the tool (active styling, `#status-context` change, options bar re-render) and matches its shortcut (V/H/Z/C parity). `#rail-add-image` (layer added via seeded file path), `#rail-add-text` (text layer appears, becomes active), `#rail-layers` / `#rail-props` (docks hide/show; `.dashboard-wrapper` gains `hide-left`/`hide-right`).

- [ ] **Step 3: Sweep per-tool options and behaviors**

- **Move (V):** drag moves the active layer (canvas pixel + `#prop-transform-x/y` change); Shift constrains axis; snapping guides appear near alignment and Ctrl bypasses them; each Move `ToolOption` in `#options-host` produces its descriptor's effect; Free Transform via options action and Ctrl+T parity — handles appear, Enter applies (one history entry), Escape cancels (state identical to pre-session).
- **Hand (H):** drag pans the viewport (canvas offset changes, document untouched — no new history entry).
- **Zoom (Z):** click zooms in, Alt/modifier-click zooms out per source; readout matches.
- **Crop (C):** every ratio preset (`free`, `original`, `1:1`, `4:5`, `16:9`, `9:16`, `custom`) constrains the crop rect; `crop-width`/`crop-height` inputs resize it; `crop-reset` restores; `crop-apply` commits (one history entry, undo restores exactly); `crop-cancel` discards.

- [ ] **Step 4: Sweep the session guard**

Open Free Transform, then attempt background interactions (click a rail button, press Ctrl+Z): background must be inert (recorded as PASS when blocked), guard `#transform-session-apply` applies, `#transform-session-cancel` cancels, Tab stays trapped inside the guard, focus returns to the previously focused element on close.

- [ ] **Step 5: Run gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/2026-07-13-control-inventory.md docs/superpowers/audit/2026-07-13-findings.md
git commit -m "docs: record rail, tools, and session guard sweep results"
git push origin main
```

---

### Task 6: Behavior sweep — properties panel + layers panel

**Files:**
- Modify: `docs/superpowers/audit/2026-07-13-control-inventory.md`
- Modify: `docs/superpowers/audit/2026-07-13-findings.md`

**Interfaces:**
- Consumes: inventory rows for `src/properties-panel.ts`, `src/layers-panel.ts`; helpers; ledger numbering.
- Produces: every properties/layers row marked PASS or FAIL(F-nnn).

- [ ] **Step 1: Runtime completeness check**

With an image layer AND a text layer present, list `#properties-editor-container` and `#layers-list-container` interactive elements; append missing inventory rows.

- [ ] **Step 2: Sweep transform fields**

With the image layer active: `#prop-transform-x/y/width/height/rotation` — typing a value moves/resizes/rotates the layer on canvas (pixel check) and creates exactly one history entry per committed edit; `#prop-transform-link` toggles proportional W/H (change width → height follows when linked, stays when unlinked). With NO layer selected: fields disabled/hidden and the no-active-layer warning shows.

- [ ] **Step 3: Sweep appearance controls**

Opacity slider (canvas compositing visibly changes; readout matches), blend mode select (pixel changes per mode), each effect row in the effects stack: toggle ON (canvas changes), adjust its slider, toggle OFF (canvas reverts). Deferred minor "blur first-ON re-seeds a deliberate 0": first enable of blur — record what value it seeds and whether the canvas matches the UI value. Name chip inline rename: new name appears in the layers list.

- [ ] **Step 4: Sweep text properties**

With the text layer active, `#properties-editor-container` shows the text section: content edit re-renders the canvas text, font family select and font size change rendering, text color changes pixels.

- [ ] **Step 5: Sweep the layers panel**

Row click selects (properties follow), visibility toggle hides/shows on canvas, delete removes layer + canvas updates + undo restores, drag-reorder changes z-order (pixel check where layers overlap). Deferred minor "`draggedId` dangling on drag-then-delete": start dragging a row, drop it, delete that layer, then drag another row — no error, no ghost state (watch the console for exceptions).

- [ ] **Step 6: Run gates and commit**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/2026-07-13-control-inventory.md docs/superpowers/audit/2026-07-13-findings.md
git commit -m "docs: record properties and layers panel sweep results"
git push origin main
```

---

### Task 7: Behavior sweep — history panel, tabs, toasts, persistence

**Files:**
- Modify: `docs/superpowers/audit/2026-07-13-control-inventory.md`
- Modify: `docs/superpowers/audit/2026-07-13-findings.md`

**Interfaces:**
- Consumes: inventory rows for `src/history-panel.ts`, `src/toast.ts`, `src/engine/persistence.ts` (autosave), tabs `#tab-layers`/`#tab-history`/`#tab-properties`; helpers; ledger numbering.
- Produces: every remaining inventory row marked PASS or FAIL(F-nnn); ledger discovery-complete.

- [ ] **Step 1: Sweep dock tabs**

`#tab-layers` / `#tab-history` switch the lower-right dock content; `#tab-properties` shows the properties editor. Active-tab styling follows.

- [ ] **Step 2: Sweep the history panel**

Make 3+ distinct edits. `#history-list` shows one entry per edit; clicking an older entry jumps document state there (canvas pixel check); clicking newest returns. During a live session (Ctrl+T open): history navigation is blocked — clicking entries and Ctrl+Z must be inert (PASS when blocked). Close the session; navigation works again.

- [ ] **Step 3: Sweep toasts**

Trigger a toast through a real flow (e.g., save/export confirmation or an error path found in `src/toast.ts` call sites — check call sites first and use a reachable one). Verify: toast appears, its action button (if any) performs the labeled action, it auto-dismisses after its timer, and stacked toasts don't occlude interactive controls (probe run with a toast visible).

- [ ] **Step 4: Verify autosave round-trip**

Make an edit, wait past the autosave debounce (watch IndexedDB or console evidence), reload the page. The document must restore (layers, transforms, canvas pixels). Record any mismatch as `broken`.

- [ ] **Step 5: Mark discovery complete and commit**

Every inventory row must now carry PASS or FAIL(F-nnn) — grep the inventory for rows missing a mark; sweep any stragglers.

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/2026-07-13-control-inventory.md docs/superpowers/audit/2026-07-13-findings.md
git commit -m "docs: record history, toast, and persistence sweep results"
git push origin main
```

---

### Task 8: Consolidate ledger and present triage — STOP POINT

**Files:**
- Modify: `docs/superpowers/audit/2026-07-13-findings.md` (sort, summarize)

**Interfaces:**
- Consumes: all `F-` entries from Tasks 3–7.
- Produces: triage-ready ledger; owner decisions recorded per finding (`approved` / `deferred` / `rejected`).

- [ ] **Step 1: Consolidate**

Sort entries by severity (`broken` → `overlap` → `cosmetic`), merge duplicates (same root symptom found by different tasks — keep one entry, note both repro paths), and add a summary table at the top: `| ID | Severity | Surface | Title |`. Explicitly state the verdict on each of the five known deferred minors (confirmed as F-nnn / cleared).

- [ ] **Step 2: Commit the consolidated ledger**

Run: `npm run test:core; npm run test:ui; npm run test:docs; npm run build`
Expected: all PASS.

```bash
git add docs/superpowers/audit/2026-07-13-findings.md
git commit -m "docs: consolidate UI audit findings for triage"
git push origin main
```

- [ ] **Step 3: Present triage to the owner and STOP**

Present the summary table with severity, one-line description, and repro reference per finding. Ask for approve / defer / reject on each. **Do not implement any fix.** Record decisions in the ledger (`Status:` line per entry); deferred items also go to the progress ledger so they are not lost.

- [ ] **Step 4: Hand off to the fix plan**

After triage, write the follow-up fix plan (`docs/superpowers/plans/YYYY-MM-DD-ui-audit-fixes.md`) from the approved findings using the writing-plans skill. Fix-plan requirements fixed by the spec, restated here so triage output is written with them in mind: severity order; one logical fix per commit (bare subject, push after each); layout fixes in CSS/DOM where possible; behavior fixes follow engine patterns (one command per edit, DirtyFlags, session-guard respect); each fix ships with a regression contract in `tests/ui-layout.test.mjs` (`test:ui`) or vitest (`test:core`) where node can catch it, otherwise live browser verification noted in the commit; all four gates before each commit; structural rework is flagged to the owner, never folded in silently; AGENTS.md Section 3 protocol (changelog under this plan's name, public docs if behavior/shortcuts changed, graph hooks, vault re-export) after fixes ship.
