# Remove the In-Editor Document Graph — Design Specification

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan

## Purpose

Transparency currently includes an in-editor Document Graph overlay opened from the tool rail or with the `G` key. The feature adds application code, event listeners, animation work, responsive CSS, documentation claims, and a project-data-to-`innerHTML` security risk without supporting the core editing workflow.

Remove the in-editor Document Graph completely.

## Goals

- Remove the Document Graph control, overlay, runtime module, event handling, animation, styles, icon, and tests that require its presence.
- Remove public documentation claims that advertise an in-editor graph.
- Remove security-review claims that describe the graph-detail DOM-injection path, because deleting the sink resolves that specific path.
- Keep the editor workspace, canvas compositor, persistence format, history, layer controls, and responsive behavior otherwise unchanged.
- Keep `G` intentionally unassigned for a future editor feature.
- Preserve the Mermaid system diagram in `docs/architecture.md`; it explains application data flow and is not the removed UI feature.

## Non-Goals

- Do not replace the removed feature with another in-editor graph or assign the `G` key.
- Do not remove or redesign the Mermaid diagram in `docs/architecture.md`.
- Do not reorganize the tool rail, inspector dock, canvas workspace, or responsive layout beyond allowing the removed rail button's space to collapse naturally.
- Do not change document state, project serialization, autosave, history, rendering, or export behavior.
- Do not implement any later task from the broader request, including resizable panels, video layers, or additional editing features.

## Current Feature Boundary

The Document Graph is a self-contained overlay rather than a three-column workspace panel. Its implementation crosses these boundaries:

| Area | Current responsibility |
|---|---|
| `index.html` | Graph rail button and overlay/inspector markup |
| `src/graph-panel.ts` | Graph model, rendering, animation, search, pointer interaction, keyboard handling, and resize handling |
| `src/main.ts` | Imports and initializes the graph module |
| `src/dom.ts` | Supplies the graph rail icon |
| `src/style.css` | Graph overlay, inspector, responsive, and no-blur fallback styling |
| `tests/ui-layout.test.mjs` | Requires graph DOM identifiers to exist |
| Public documentation | Advertises the editor graph and describes its architecture, interaction, and security behavior |

The graph module owns no `Doc` fields, persisted project data, history entries, autosave records, or compositor state. Removal therefore needs no data migration.

## Removal Design

### Runtime and markup

- Delete `src/graph-panel.ts` rather than retaining dormant or feature-flagged code.
- Remove `#rail-graph` and the complete `#graph-overlay` subtree from `index.html`.
- Remove the `initGraphPanel` import and call from `src/main.ts`.
- Remove `icons.graph` from `src/dom.ts` after verifying no remaining consumer exists.
- Remove every graph-specific selector from `src/style.css`, including base overlay rules, compact responsive adjustments, and fallback selectors.

No replacement control is added. The rail's existing flex layout absorbs the vacant space. The workspace grid and canvas sizing rules remain unchanged.

### Keyboard and event behavior

The deleted module currently owns the `G` shortcut, `Escape` close behavior, graph pointer handlers, graph search handlers, a window resize listener, and its animation-frame loop. Deleting the module removes these listeners together.

After removal:

- `G` has no editor action.
- `Escape` has no graph-close action; other features may continue to own their own Escape behavior.
- No graph animation frame or graph-specific pointer, search, key, or resize listener remains.

### Documentation

Update public documents that currently describe the runtime feature:

- `README.md`: remove the Document Graph highlight, workspace/rail wording, and `G`/Escape shortcut rows.
- `docs/architecture.md`: remove the `src/graph-panel.ts` module row and graph-animation performance sentence. Preserve the Mermaid system diagram.
- `docs/design.md`: remove graph-overlay references from workspace, component, interaction, responsive, and fallback guidance.
- `docs/security-audit.md`: remove the graph-detail `innerHTML` injection path and its remediation because the sink no longer exists. Preserve all remaining trust-boundary findings, including incomplete nested project validation, remote bitmap requests, canvas tainting, Google Fonts, persistence, object URL, and resource-exhaustion risks.

## Data, Compatibility, and Failure Behavior

No schema or state transition changes. Existing projects load exactly as before because the graph reads editor state but does not serialize its own data.

There is no runtime fallback or removal error state. The implementation succeeds when all graph-owned entry points are deleted and the application initializes without querying missing graph elements. Partial removal is not acceptable because it would leave dead imports, missing-element failures, unused CSS, or hidden listeners.

## Testing Strategy

Implementation follows test-first removal contracts:

1. Update the UI layout contract so it no longer requires graph identifiers and instead rejects `rail-graph`, `graph-overlay`, `graph-canvas`, and remaining graph initialization references.
2. Update documentation contracts so public documents no longer advertise the in-editor graph or require the removed graph-injection limitation.
3. Add a filesystem assertion that `src/graph-panel.ts` is absent.
4. Preserve a positive assertion that the architecture Mermaid fence remains present.

Final verification includes:

- `npm.cmd run test:ui`
- `npm.cmd run test:docs`
- `npm.cmd run build`
- `git diff --check`
- A targeted source scan showing no runtime graph identifiers, imports, initialization calls, icons, or selectors remain.
- A targeted documentation scan confirming runtime graph claims are gone while the architecture Mermaid diagram remains.

## Acceptance Criteria

- The editor shows no Document Graph rail control or overlay.
- Pressing `G` has no assigned action.
- `src/graph-panel.ts` is deleted.
- No graph-owned DOM, TypeScript, icon, CSS, event, animation, or test reference remains.
- The tool rail, canvas workspace, inspector dock, responsive layout, existing projects, and exports continue to work.
- Public documentation accurately describes the editor without a Document Graph.
- The architecture Mermaid diagram remains intact.
- The graph-detail DOM-injection finding is removed from the security guide, while unrelated security limitations remain documented.
- UI tests, documentation tests, production build, and whitespace checks pass.

## Follow-On Work

After this specification is implemented and verified, the broader request continues as separate design/specification cycles for resizable inspector panels, video layers, and the remaining prioritized editing features. Those projects must use the current canvas-compositor architecture as their source of truth rather than assuming a DOM-based live preview.
