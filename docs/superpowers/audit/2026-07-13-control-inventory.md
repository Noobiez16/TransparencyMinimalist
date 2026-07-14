# UI Control Inventory — 2026-07-13

Every interactive control in the editor, static and dynamically created. Tasks 4–7 of the audit plan
fill the **Result** column with PASS or FAIL(F-nnn). A control correctly blocked by the
transform-session guard is PASS.

## Appbar

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-001 | `#btn-open` | Appbar | src/topbar.ts | Guarded; clicks hidden `#project-input` to open a project file dialog | Guard fires during session; input click otherwise (no OS dialog completion) | |
| C-002 | `#btn-save` | Appbar | src/topbar.ts | `saveProject()` downloads the `.mledit.json` envelope | Download evidence | |
| C-003 | `#project-input` | Appbar (hidden) | src/topbar.ts | On change, `openProjectFile(file)` replaces the document | Programmatic file injection round-trip | |
| C-004 | `#btn-undo` | Appbar | src/main.ts | `history.undo()`; disabled when no undo or session live | `#history-list` pointer + canvas pixel revert; disabled during session | |
| C-005 | `#btn-redo` | Appbar | src/main.ts | `history.redo()`; disabled when no redo or session live | Pointer + pixel reapply | |
| C-006 | `#btn-export` | Appbar | src/export.ts | Guarded; PNG download via `renderToCanvas`; empty doc → toast "Add at least one layer to export." | Download evidence; toast on empty doc | |

## Options bar — workspace settings (static)

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-010 | `.btn-theme` ×4 (`data-bg` transparent/white/black/custom) | Options bar | src/canvas.ts | `cmdPatchDoc` bgType; viewport background changes (checkerboard/white/black/custom); one history entry "Background"; active styling follows | Viewport class/style + history entry | |
| C-011 | `#bg-color-picker` | Options bar | src/canvas.ts | Visible only for custom; input patches `bgColor` (coalesced `doc:bgColor`); viewport backgroundColor updates | Style + single history entry while dragging | |
| C-012 | `#size-chip` | Options bar | src/topbar.ts | Toggles `#size-menu`; outside click closes; text mirrors doc size | Menu hidden state + chip text | |
| C-013 | `#size-menu` presets ×4 (`data-ratio`) | Options bar | src/topbar.ts | `cmdPatchDoc` width/height per preset; menu closes; chip, `#status-doc-size`, `#canvas-width`, `#canvas-height` all sync (deferred minor: preset→custom-inputs sync) | All four readouts after preset click | |
| C-014 | `#canvas-width` | Options bar | src/topbar.ts | Holds pending custom width; synced from state on canvasConfig | Value after preset + after apply | |
| C-015 | `#canvas-height` | Options bar | src/topbar.ts | Holds pending custom height; synced from state | Same | |
| C-016 | `#size-custom-apply` | Options bar | src/topbar.ts | Clamps 64–4096, `cmdPatchDoc` "Canvas size"; menu closes | Canvas resize + history entry + clamping at 5000→4096 | |

## Options host — per-tool controls (dynamic, `#options-host` / `[data-option-key]`)

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-020 | Move `auto-select` toggle | Options (Move) | src/tools/move.ts | Off: clicking a non-active layer does NOT select it | Click other layer; selection unchanged | |
| C-021 | Move `show-controls` toggle | Options (Move) | src/tools/move.ts | Hides/shows transform handles overlay | Overlay handles visible/gone | |
| C-022 | Move `x`/`y` numbers | Options (Move) | src/tools/move.ts | Sets layer x/y (doc pixels, layer center); one coalesced history entry per field; disabled with no layer | Canvas pixel + properties field match | |
| C-023 | Move `width`/`height` numbers | Options (Move) | src/tools/move.ts | Sets transformed size via scaleX/scaleY; linked proportions follow | Both dimensions when linked | |
| C-024 | Move `link` toggle | Options (Move) | src/tools/move.ts | Toggles proportional link (shared with properties `#prop-transform-link`); icon swaps link/unlink | W change with link on/off | |
| C-025 | Move `rotation` number | Options (Move) | src/tools/move.ts | Sets rotation (normalized degrees) | Canvas + properties rotation field | |
| C-026 | Move `snap` toggle | Options (Move) | src/tools/move.ts | Disables/enables snapping; guides cleared when off | Guides appear near center only when on; Ctrl bypasses | |
| C-027 | Move `apply` action | Options (Move) | src/tools/move.ts | `applyTransform()`; disabled unless explicit session | One history entry; session ends | |
| C-028 | Move `cancel` action | Options (Move) | src/tools/move.ts | `cancelTransform()`; layer state restored exactly | Pixel + fields match pre-session | |
| C-029 | Hand (no options) | Options (Hand) | src/options-bar.ts | Shows "Hand — no options" empty label | Label text | |
| C-030 | Zoom `zoom` display | Options (Zoom) | src/tools/zoom.ts | Read-only percent mirroring canvas zoom | Matches `#zoom-readout` | |
| C-031 | Crop `crop-ratio` select | Options (Crop) | src/tools/crop.ts | Constrains crop rect to preset (free/original/1:1/4:5/16:9/9:16/custom); disabled without session | Rect aspect after selection | |
| C-032 | Crop `crop-ratio-n`/`crop-ratio-d` numbers | Options (Crop) | src/tools/crop.ts | Custom ratio parts; disabled unless ratio=custom | Rect follows n:d | |
| C-033 | Crop `crop-width`/`crop-height` numbers | Options (Crop) | src/tools/crop.ts | `previewCrop` resizes rect | Overlay rect dimensions | |
| C-034 | Crop `crop-reset` action | Options (Crop) | src/tools/crop.ts | `resetCrop()` restores full-document rect | Rect = doc bounds | |
| C-035 | Crop `crop-apply` action | Options (Crop) | src/tools/crop.ts | `applyCrop()` commits non-destructive crop; one history entry; undo restores exactly | Canvas size/content + history | |
| C-036 | Crop `crop-cancel` action | Options (Crop) | src/tools/crop.ts | `cancelCrop()` discards rect | State identical to pre-crop | |

## Rail

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-040 | Tool buttons ×4 (`data-tool` move/hand/zoom/crop) | Rail | src/rail.ts | Guarded `setActiveTool`; active styling; options bar re-renders; `#status-context` updates; cursor changes; parity with shortcuts V/H/Z/C | All five observations per tool | |
| C-041 | `#rail-add-image` | Rail | src/rail.ts | Delegates to `#btn-add-image` | New empty image layer, active | |
| C-042 | `#rail-add-text` | Rail | src/rail.ts | Delegates to `#btn-add-text` | New text layer, active | |
| C-043 | `#rail-layers` | Rail | src/rail.ts | Toggles `.hide-left` on `.dashboard-wrapper`; button active styling | Dock visibility + class | |
| C-044 | `#rail-props` | Rail | src/rail.ts | Toggles `.hide-right` | Same | |

## Canvas workspace

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-050 | `#doc-canvas` pointer (per tool) | Canvas | src/canvas.ts | Routes to active tool: Move drags/handles, Hand pans, Zoom clicks (Alt = out), Crop rect gestures; pointercancel/lostpointercapture interrupt cleanly | Per-tool behavior rows below | |
| C-051 | `#zoom-in` | Canvas zoom pill | src/canvas.ts | `zoomAt(1 + 0.1/zoom)`; readout updates | Readout + canvas scale | |
| C-052 | `#zoom-out` | Canvas zoom pill | src/canvas.ts | `zoomAt(1 - 0.1/zoom)` | Same; also drift check: N in + N out returns exactly 100% (deferred minor) | |
| C-053 | `#zoom-readout` | Canvas zoom pill | src/canvas.ts | Click = `resetView()` (100%, centered) | Readout 100% + pan reset | |
| C-054 | Ctrl+wheel on canvas | Canvas | src/canvas.ts | Zooms at cursor | Readout changes | |

## Properties dock

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-060 | `#prop-layer-name` chip | Properties | src/properties-panel.ts | Inline rename → history "Rename layer"; layers list follows | Layer card name | |
| C-061 | `#prop-opacity` range | Properties | src/properties-panel.ts | Coalesced opacity patch; `#opacity-value` readout; canvas compositing changes | Pixel + readout | |
| C-062 | `#opacity-value` chip | Properties | src/properties-panel.ts | Click → number input; Enter/blur commits, Escape reverts; dblclick range resets to default | Value + canvas | |
| C-063 | Blend seg (`#blend-seg` normal / `#blend-alt` / `#blend-more`) | Properties | src/properties-panel.ts | Blend patch + active styling; `#blend-alt` adapts to last non-normal pick; More opens `#blend-menu` | Pixel per mode + seg state | |
| C-064 | `#blend-menu` options ×5 | Properties | src/properties-panel.ts | Sets blend, closes menu, updates `#blend-alt` label | Same | |
| C-065 | `#prop-transform-x` `#prop-transform-y` `#prop-transform-width` `#prop-transform-height` `#prop-transform-rotation` | Properties | src/properties-panel.ts | Commit on change/Enter (clamped); Escape reverts; one history entry per commit; live session routes into session update instead | Canvas + options-bar fields match | |
| C-066 | `#prop-transform-link` | Properties | src/properties-panel.ts | Shared link state with Move tool option; icon + aria-pressed | W edit follows/ignores H | |
| C-067 | Effect rows ×4 (blur/brightness/contrast/saturation): switch + range + chip | Properties | src/properties-panel.ts | Switch toggles effect (blur first-ON seeds 4 when value 0 — deferred-minor check); range coalesces value patches; canvas re-renders; brightness/contrast/saturation hidden for text layers | Pixel + aria-checked + chip | |
| C-068 | `#prop-invert` switch | Properties | src/properties-panel.ts | Toggles invert effect | Pixel inversion + aria-checked | |
| C-069 | `#prop-text-content` | Properties (text) | src/properties-panel.ts | Coalesced text patch; canvas text re-renders | Canvas text | |
| C-070 | `#prop-font-family` | Properties (text) | src/properties-panel.ts | Font family patch | Canvas rendering | |
| C-071 | `#prop-font-size` + `#font-size-value` chip | Properties (text) | src/properties-panel.ts | Coalesced size patch (doc pixels); chip editable; dblclick reset | Canvas + readout | |
| C-072 | `#prop-text-color` | Properties (text) | src/properties-panel.ts | Coalesced color patch | Canvas pixel | |

## Layers-history dock

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-080 | Dock tabs (`data-tab` layers/history) | Dock | src/history-panel.ts | Switches `#tab-layers`/`#tab-history` visibility; aria-selected + active styling | Hidden attributes + styling | |
| C-081 | `#btn-add-image` | Layers | src/layers-panel.ts | Guarded; adds empty image layer at top, becomes active, canvas flash | Layer card + selection | |
| C-082 | `#btn-add-text` | Layers | src/layers-panel.ts | Guarded; adds text layer, active | Card + canvas text | |
| C-083 | `#upload-zone` (click/drop/paste) | Layers | src/layers-panel.ts | Click → file input; drop image decodes into layer (or fills empty active image layer as "Place image"); drop .json opens project; Ctrl+V pastes image; non-image → toast | Layer added + canvas fixture visible | |
| C-084 | `#file-input` | Layers (hidden) | src/layers-panel.ts | change → decode each image file; input cleared | Same | |
| C-085 | Layer card click | Layers (dynamic) | src/layers-panel.ts | Guarded select; properties panel follows | Active card + panel | |
| C-086 | Layer card visibility toggle | Layers (dynamic) | src/layers-panel.ts | Guarded Hide/Show patch; card dims; canvas updates | Pixel + opacity style | |
| C-087 | Layer card delete | Layers (dynamic) | src/layers-panel.ts | Guarded; 150ms leave animation then delete command; undo restores | Card removed + pixel + undo | |
| C-088 | Layer card dblclick rename | Layers (dynamic) | src/layers-panel.ts | Guarded inline edit → "Rename layer" | Name label + properties chip | |
| C-089 | Layer card drag reorder | Layers (dynamic) | src/layers-panel.ts | Guarded reorder command; z-order changes; `draggedId` cleared on drop/dragend (deferred-minor: drag-then-delete) | Pixel where layers overlap + no console error | |
| C-090 | `#history-list` rows | History (dynamic) | src/history-panel.ts | Click jumps history to entry i; newest first; current/undone styling; blocked while session live | Canvas state + row classes | |

## Transform-session guard

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-100 | `#transform-session-apply` | Guard dialog | src/transform-session-guard.ts | Applies pending session, closes guard, runs deferred action, restores focus | History entry + guard hidden + deferred action ran | |
| C-101 | `#transform-session-cancel` | Guard dialog | src/transform-session-guard.ts | Cancels session, closes guard, runs deferred action | State restored + guard hidden | |
| C-102 | Guard modality | Guard dialog | src/transform-session-guard.ts | Background inert while open; Tab trapped inside dialog | Background click/keys dead; focus cycles | |

## Keyboard shortcuts (parity rows)

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-110 | V / H / Z / C | Keyboard | src/main.ts | Guarded tool switch; ignored while typing in inputs | Same effects as C-040 | |
| C-111 | Space (hold) | Keyboard | src/main.ts | Temporary Hand; release restores prior tool | Tool + cursor during/after | |
| C-112 | Ctrl/Cmd+T | Keyboard | src/main.ts | Explicit Free Transform on active layer; no layer → toast "Select a layer before starting Free Transform." | Session + handles + status text | |
| C-113 | Enter / Escape (explicit transform) | Keyboard | src/main.ts | Apply / cancel the explicit session | History entry / exact restore | |
| C-114 | Enter / Escape (crop session) | Keyboard | src/main.ts | Apply / cancel crop, tool returns to Move | Canvas + active tool | |
| C-115 | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Keyboard | src/main.ts | Undo / redo / redo; blocked during sessions and while typing | Pixel + history pointer | |
| C-116 | Ctrl+V (image paste) | Keyboard | src/layers-panel.ts | Pasted image becomes a layer; ignored while typing in inputs | Layer card + canvas | |
| C-117 | Enter / Escape in number inputs | Keyboard | src/options-bar.ts, src/properties-panel.ts | Enter commits + blurs; Escape reverts to state value + blurs | Field value + no history entry on Escape | |

## Display-only elements (no interaction contract, checked for truthfulness)

| ID | Control | Surface | Source | Expected end effect | Verify by | Result |
|----|---------|---------|--------|---------------------|-----------|--------|
| C-120 | `#status-context` | Statusbar | src/main.ts | Mirrors tool/session state (Move/Crop/Free Transform variants) | Text per state | |
| C-121 | `#status-doc-size` | Statusbar | src/topbar.ts | Mirrors doc dimensions | Text after resize | |
| C-122 | `#options-empty` | Options bar | src/options-bar.ts | Placeholder replaced by per-tool render | Never visible with options present | |
| C-123 | Toast + `.toast-action` | Overlay | src/toast.ts | Message shows, action runs `onAction` and dismisses, auto-dismiss ~3s | Element lifecycle + action effect | |

## Sweep states

Every applicable control is exercised in each relevant state:

- **Tool:** Move / Hand / Zoom / Crop (options bar re-renders per tool)
- **Selection:** no layer / image layer active / text layer active
- **Session:** none / Free Transform (direct + explicit Ctrl+T) / crop session / guard dialog open
- **Panels:** both docks visible / `.hide-left` / `.hide-right` / both hidden
- **Viewport:** 1280×800 primary; 1024×800 graceful; 375×812 log-only
