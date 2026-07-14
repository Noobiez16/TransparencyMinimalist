# UI Functionality & Layout Audit — Design

**Date:** 2026-07-13
**Status:** Approved
**Goal:** Every interactive control in the editor produces its intended end effect, and no UI surfaces overlap or clip each other at the supported window sizes.

## Requirements (validated with owner)

- **Scope:** Full systematic sweep of the running app — every button, slider, input, select, and chip on every surface. Not limited to known issues.
- **Viewports:** Desktop-first. Primary target 1280×800 and up; at ~1024px width "degrades gracefully" means zero overlap violations per the definition in Phase 1 (cosmetic tightness is acceptable). Mobile issues are logged but fixed only if cheap.
- **Functional bar:** Full behavior check — a control passes only if its intended end effect is observable (document state changes, canvas re-renders, history entry appears, file downloads, etc.). "Clickable and doesn't throw" is not sufficient.
- **Fix policy:** Triage checkpoint. The sweep produces a findings ledger; the owner approves, defers, or rejects each item before any fix is implemented.

## Phase 1 — Discovery

### Control inventory (static)

Derive a complete checklist from source before opening the browser:

- Surfaces: `src/topbar.ts`, `src/rail.ts`, `src/options-bar.ts`, `src/properties-panel.ts`, `src/history-panel.ts`, the layers panel, `src/toast.ts`, and tool option descriptors in `src/engine/tools.ts` (Action/Number/Select/Toggle/Display options per tool).
- Each entry records: control, surface, expected end effect (per README / docs / shortcuts), and verification method.

### Live behavior sweep

- Dev server via browser preview at 1280×800 (Vite, port 3000 with fallback — use the port the preview reports).
- Exercise each control in its real UI states:
  - per active tool (Move / Hand / Zoom / Crop — the options bar re-renders per tool);
  - with no layer selected, with a raster layer selected, with a text layer selected (text props section);
  - during live sessions (Free Transform, Crop): the transform-session guard intentionally inerts background controls — a correctly blocked control is a **pass**, not a finding.
- Verify end effects concretely: UI state via DOM reads (fields, history entries, layer list), canvas changes via pixel sampling. Assert on settled state (rAF batching and debounced autosave mean immediate reads can be stale).
- Fold the deferred phase-1 minors into the sweep as candidate findings to confirm or clear: size-menu presets not syncing custom W/H inputs; zoom float drift vs `zoom===1` pan reset; blur first-ON re-seeding 0; `draggedId` dangling on drag-then-delete; mobile stacking order (log-only unless cheap).

### Overlap detection (geometry)

- A probe script measures `getBoundingClientRect` for every UI region and floating panel and reports pairwise intersections.
- Run at 1280×800 and 1024px width, across panel open/closed states and session states (crop UI visible, Free Transform active).
- **Overlap violation definition** (spatial-glass UI — panels floating over the canvas are by design):
  1. two interactive surfaces intersect such that a control is occluded or unclickable; or
  2. content is clipped by its container or the viewport.

### Findings ledger

Each finding: ID, surface, severity (`broken` / `overlap` / `cosmetic`), repro steps, expected vs. actual. Presented sorted by severity for triage.

## Phase 2 — Triage checkpoint

The owner reviews the ledger and approves, defers, or rejects each item. Only approved items proceed. Deferred items are recorded in the progress ledger so they are not lost.

## Phase 3 — Fixes

- Approved fixes land in severity order, one logical fix per commit (bare subject, no trailer; push after each task).
- Layout fixes stay in CSS/DOM structure where possible. Behavior fixes follow existing engine patterns: one command per edit, DirtyFlag notifications, session-guard respect.
- Anything requiring structural rework (layout system changes, session-model changes) is flagged back to the owner instead of being folded in silently.

## Phase 4 — Regression protection

- Each fix ships with a test in the existing suites where a node-side test can genuinely catch a regression:
  - structural/layout contracts → `tests/ui-layout.test.mjs` (`npm run test:ui`);
  - engine/state behavior → vitest (`npm run test:core`).
- Purely visual/geometric issues that node tests cannot observe (real rendering) are verified live in the browser instead, with the verification noted in the commit. No tests that assert nothing.

## Verification & protocol

- Before each commit: `npm run test:core`, `npm run test:ui`, `npm run test:docs`, `npm run build`, plus re-exercising the fixed control live in the browser.
- After shipping: AGENTS.md Section 3 protocol — changelog entry under this plan's name, public docs updated if behavior or shortcuts changed, git hooks refresh the graph, vault re-export if module structure changed.

## Error handling (for the sweep itself)

- Dev server on a fallback port: use the URL the preview tooling reports; never hardcode.
- Control unreachable because a session guard is open: record as expected behavior.
- Timing flakiness (rAF, debounce): assert on settled state, retry once before recording a finding.

## Out of scope

- Full mobile/tablet responsive support (log-only).
- New E2E frameworks or runtime dependencies.
- Roadmap features (groups/masks, rulers/guides, skew/warp, per-layer crop).
