# Photoshop Workspace Replication — Phase A: Workspace Shell — Design

**Date:** 2026-07-17
**Status:** Approved
**Reference:** Adobe "Photoshop Essentials Workspace" manual (owner-provided PDF, 7 pages) — spatial
architecture of the default Essentials layout.
**Goal:** Rebuild the editor's UI shell to replicate the Photoshop Essentials workspace layout —
menu bar, grouped toolbar with color chips, three tabbed right-dock stacks, document tab,
diagnostics status bar — wired to the editor's existing capabilities, with future features visible
as grayed placeholders.

## Replication roadmap (owner-approved decomposition)

Full replication is a six-phase program; each phase gets its own spec → plan → implementation
cycle. This spec covers Phase A only.

| Phase | Scope | Unlocked by |
|-------|-------|-------------|
| **A — Workspace shell** (this spec) | Menu bar, toolbar groups, dock stacks, document tab, status bar, workspace behaviors | — |
| B — Color & painting | Color/Swatches feeding brush color; brush/pencil/eraser raster engines | A (color state, panels, tool slots) |
| C — Selection system | Marquees, lasso, Select menu, selection-constrained edits, quick mask | A (menu/tool slots) |
| D — Shapes, paths & type | Vector shape tools, pen paths, Paths panel, type expansion | A, C |
| E — Adjustments, filters & channels | Adjustment layers, Filter menu, Channels panel | A |
| F — Document lifecycle | Multi-document tabs, New Document / Image Size dialogs, Place variants | A |

## Owner decisions (validated)

- **Aesthetic:** keep the spatial-glass design language; replicate the manual's *spatial
  architecture* (regions, bars, docks), not Adobe's flat-gray skin. Existing glass token
  contracts stay.
- **Menu bar:** all eleven headings from day one (File, Edit, Image, Layer, Type, Select, Filter,
  View, Plugins, Window, Help). Commands arriving in later phases render disabled (grayed).
- **Right docks:** faithful three-stack layout with a working History tab: Color+Swatches /
  Properties+Adjustments(grayed) / Layers+History+Channels(grayed)+Paths(grayed).
- **Toolbar:** manual's group order with nested-group triangles and right-click flyouts working
  now; future tools visible but disabled. Color chips live (D resets, X swaps).
- **Behaviors in scope:** typeable zoom field + status metric selector; Tab / Shift+Tab panel
  toggling; Window > Workspace > Reset Essentials; stack collapse.
- **Out of Phase A:** floating contextual task bar (manual §5.2), tear-off floating panels,
  panel icon-collapse, layout persistence across sessions, blend/opacity controls inside the
  Layers panel (stays in Properties; recorded fidelity gap), all Phase B–F features.

## Architecture

Approach: **command registry + dock framework** (approved over direct restructure and a component
framework). New modules, all zero-runtime-dependency vanilla TypeScript:

| Module | Responsibility |
|--------|----------------|
| `src/shell/commands.ts` | Command registry: `registerCommand({id, label, shortcut?, enabled?, run?, phase?})`, `runCommand(id)`, change notifications. A command with `phase` and no `run` is a permanent grayed stub. Duplicate ids throw. |
| `src/shell/menu-bar.ts` | Renders the eleven menus from a declarative menu structure of command ids. Open on click, close on outside click/Escape, `enabled()` re-evaluated on every open. |
| `src/shell/dock.ts` | Panel framework: `registerPanel({id, title, stack: 1|2|3, order, render(host), fkey?})`. Owns tab strips, active tab per stack, collapse-to-tab-strip, visibility. Grayed tabs for phase-stub panels. |
| `src/shell/toolbar.ts` | Replaces `src/rail.ts`. Renders tool groups from `toolbar-groups.ts`, nested-group triangles, right-click flyouts, spring order, single/double column toggle, color chips, disabled future slots. |
| `src/shell/toolbar-groups.ts` | Declarative group data: group → entries (tool id or stub {label, shortcut, phase}). |
| `src/shell/workspace.ts` | Workspace state (panel visibility, collapse, toolbar columns), Tab/Shift+Tab handlers, `resetWorkspace()` (= Reset Essentials). In-memory only. |
| `src/engine/color-state.ts` | Foreground/background color state + subscribe. Phase B brushes will consume it; Phase A consumers are the chips, Color panel, text-color application, canvas custom background. |
| `src/panels/color-panel.ts` | Color panel: RGB sliders + hex field + chip pair. Editing sets the foreground color. |
| `src/panels/swatches-panel.ts` | Swatch grid: presets + "save current foreground"; swatch click sets foreground. Swatch data persists in `localStorage` (data, not layout). |

Existing panels (`properties-panel.ts`, `layers-panel.ts`, `history-panel.ts`) re-register into
the dock framework with internals unchanged. Existing engine, tools, sessions, persistence:
untouched except where listed below.

## Region designs

### Top region

- **Menu bar** replaces the appbar: identity mark, then the eleven headings. Today's appbar
  buttons become menu items **keeping their DOM ids** (`#btn-open`, `#btn-save`, `#btn-undo`,
  `#btn-redo`, `#btn-export`) so feature-id contracts keep holding.
- Working Phase A commands: File — Open (Ctrl+O), Place Embedded (add-image flow), Save (Ctrl+S),
  Export; Edit — Undo (Ctrl+Z), Redo (Ctrl+Shift+Z / Ctrl+Y), Free Transform (Ctrl+T); Image —
  Canvas Size (opens the size dialog); Layer — New Image Layer, New Text Layer, Duplicate Layer
  (Ctrl+J — one new engine command built on existing clone + `cmdAddLayer`), Delete Layer; View —
  Zoom In (Ctrl+=), Zoom Out (Ctrl+-), Fit on Screen (Ctrl+0 → `resetView`), Snap To (checkbox →
  snap toggle); Window — one toggle per registered panel (Color F6, Swatches, Properties, Layers
  F7, History), Workspace > Reset Essentials; Help — About / System Info (dialog with version +
  doc stats).
- Fully grayed menus with phase labels: Type (D), Select (C), Filter (E), Plugins (—). File > New
  Document grayed (F); Image > Image Size / Mode grayed (F/E).
- All shortcuts route through the command registry behind the existing `isTypingTarget` and
  session-guard rules; mutating commands wrap in `guardTransformSession`.
- **Tool Options Bar unchanged** — already matches manual §2.2.

### Left region — toolbar

- Group order per manual §3.1: Move & Select (Move live; Marquee M / Lasso L / Object Selection W
  grayed → C) · Crop & Slice (Crop live; Frame grayed) · Measurement (Eyedropper grayed → B) ·
  Retouching (grayed → B) · Painting (grayed → B) · Drawing (grayed → D) · Type (grayed → D) ·
  Navigation (Hand, Zoom live).
- Nested-group triangle badge on grouped slots; right-click (and long-press) opens the flyout
  listing siblings; selecting a live sibling activates it; grayed siblings are inert.
- Single ↔ double column toggle at the toolbar top (manual §3).
- Bottom cluster: overlapping foreground/background **color chips**; `D` resets black/white, `X`
  swaps (both through the command registry with the typing guard). Phase A wiring: foreground
  edits live-update the active *text* layer color (coalesced command, same pattern as the
  properties color input); the background chip drives the canvas Custom background color.
  Add image / add text move to the Layer menu (toolbar keeps tools only, like Photoshop).

### Right region — dock stacks

- Stack 1 **Color · Swatches** (new panels). Stack 2 **Properties · Adjustments(grayed E)**.
  Stack 3 **Layers · History · Channels(grayed E) · Paths(grayed D)**.
- Stack headers collapse to the tab strip and re-expand; active tab per stack; `F6` focuses
  Color, `F7` focuses Layers (opening their stack if collapsed/hidden).
- Fidelity gap recorded: blend/opacity stay in Properties for Phase A.

### Center region

- **Document tab**: name · live zoom % (via the `'view'` DirtyFlag) · "RGB" profile badge.
- **Pasteboard**: the area around the canvas; right-click shade picker (three shades + default).
  Built last; droppable if it conflicts with pointer routing.

### Bottom region — status bar

- Left: **typeable zoom field** (numeric input; Enter applies, clamped 25–400%, syncs from
  `'view'` notifications).
- Center: existing per-tool hint line (unchanged).
- Right: **metric selector** menu — Document Dimensions (default; keeps `#status-doc-size` id),
  Document Sizes (estimated flat = W×H×4 bytes; layered = Σ layer bitmap bytes), Current Tool.

### Workspace behaviors

- `Tab` toggles toolbar + options bar + both dock columns; `Shift+Tab` toggles only the right
  docks. Both respect `isTypingTarget` and do nothing while the session guard is open.
- **Reset Essentials**: all panels visible, stacks expanded, active tabs Color/Properties/Layers,
  single-column toolbar.
- Workspace state is in-memory; reset is the recovery path. Cross-session layout persistence is
  deferred (future phase), matching YAGNI.

## Error handling

- Menus recompute `enabled()` at open; no cached gray states.
- Phase stubs are `disabled` buttons with no handlers.
- Registry: duplicate command/panel ids throw at registration (startup-time failure, caught by
  tests); `runCommand` on a disabled/stub command is a no-op.
- All layout changes preserve the audit's overlap guarantees: verified with the probe matrix
  (which now includes `.options-bar`; the new `.menu-bar`, `.toolbar`, and dock surfaces join the
  probe's surface list).

## Testing

- **Vitest (`test:core`)**: command registry (registration, duplicate-id throw, enabled/run,
  stub inertness), dock registry logic, color-state (set/swap/reset/subscribe), zoom-field
  parse/clamp helper.
- **Contracts (`test:ui`)**: eleven menu headings present; preserved feature ids on menu items;
  dock stack structure ids; chips + D/X wiring; Tab-toggle wiring through `isTypingTarget`;
  updated CSS contracts for the new regions. Superseded appbar/rail contracts are *replaced* by
  equivalents asserting the new structure in the same task that changes the DOM — never deleted
  bare.
- **Docs (`test:docs`)**: README/architecture updates describing the new workspace ship with the
  final task, keeping the contract-tested public docs truthful.
- **Live verification**: audit-style probe matrix across widths 1024–1600 and dock/collapse
  states, plus one behavioral check per new surface (menu command run, flyout switch, chip D/X,
  stack collapse, zoom field, metric selector, Tab/Shift+Tab, Reset Essentials), using the
  `?audit-raf` harness.

## Out of scope (Phase A)

Floating contextual task bar; tear-off/floating panels; icon-collapse docks; cross-session layout
persistence; Layers-panel blend/opacity controls; every Phase B–F feature (painting, selections,
shapes/paths/type, adjustments/filters/channels, multi-document). Grayed placeholders are the
only footprint later phases leave in Phase A.
