# Spatial Glass Photoshop-Style Editor UI

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Scope:** Reorganize and restyle the existing editor UI without changing editor capabilities, document state, rendering, tools, persistence, export behavior, or other feature work in progress.

## 1. Goal

Convert the current dark floating-panel interface into a professional editor that combines:

- Photoshop's familiar workspace organization;
- balanced spatial-glass materials and depth;
- enough labels and breathing room for newcomers;
- compact controls, shortcuts, and predictable placement for experienced Photoshop users.

The result must feel easier to scan and use while preserving all current functionality. This work is a presentation and UI-composition change, not a feature expansion.

## 2. Approved Direction

The approved direction combines two concepts from the visual comparison:

- **Layout:** the Photoshop Classic option;
- **Material:** balanced spatial glass rather than solid classic panels.

The approved detailed mockup places the contextual options bar above the workspace, tools on the left, the document canvas in the center, Properties in the upper-right dock, and Layers/History in a tabbed lower-right dock.

Spatial glass is restrained: dark translucent surfaces, background blur, fine light borders, soft inner highlights, and layered shadows. Readability takes precedence over transparency or glow.

## 3. Non-Goals

This implementation will not:

- add, remove, or redefine editing tools;
- change the document model, command history, compositor, canvas behavior, export, autosave, or project persistence;
- implement unfinished tasks being developed concurrently;
- imitate Photoshop branding, icons, or exact proprietary visuals;
- introduce draggable/dockable panels, customizable workspaces, new menus, or new shortcuts;
- refactor unrelated modules;
- add nonfunctional menu labels merely for visual similarity.

## 4. Design Principles

### 4.1 Familiar frame

Use the professional-editor hierarchy users already recognize: application actions and contextual controls above, tools at the left edge, the document in the center, and inspectors on the right.

### 4.2 Easy scanning

Keep familiar icons, but retain visible labels for settings and less-obvious actions. Use consistent alignment, compact but accessible control heights, clear selected states, and a limited number of surface levels.

### 4.3 Spatial restraint

Depth distinguishes workspace regions. It must not compete with the artwork. The canvas remains the strongest visual focus, while toolbar and inspector glass is darker and quieter.

### 4.4 Functional honesty

Every interactive-looking control must perform an existing action. The implementation will style and regroup current Open, Save, Undo, Redo, Export, tool, panel, and layer actions without adding decorative controls that appear clickable but do nothing.

## 5. Desktop Layout

The desktop layout applies at viewport widths of 1024px and above.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ App actions: Transparency | Open Save | Undo Redo              Export   │
├──────────────────────────────────────────────────────────────────────────┤
│ Context options for active tool                     Size | Background   │
├──────┬─────────────────────────────────────────────┬─────────────────────┤
│ Tool │ Document tab                                │ Properties          │
│ rail │                                             ├─────────────────────┤
│      │                 Canvas                      │ Layers | History    │
│      │                                             │                     │
├──────┴─────────────────────────────────────────────┴─────────────────────┤
│ Tool guidance / document status / dimensions                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Application bar

- Left: compact product mark and `Transparency` name.
- Middle-left: existing Open, Save, Undo, and Redo actions, grouped by purpose.
- Right: the existing Export action as the highest-emphasis button.
- The bar uses a continuous glass surface with restrained depth.
- Photoshop-like nonfunctional menu labels are not added. Existing actions remain directly visible and discoverable.

### 5.2 Contextual options bar

- Remains directly below the application bar.
- Continues to render the active tool's existing controls from `options-bar.ts`.
- The existing canvas-size control remains at the right side.
- Existing background controls move into this top workspace region without changing their values or handlers.
- Controls use compact glass fields, segmented buttons, clear units, and visible focus states.

### 5.3 Left tool rail

- Contains the current Move, Hand, and Zoom tools generated from the tool registry.
- Keeps existing Add Image, Add Text, document graph, Layers visibility, and Properties visibility actions.
- Active tools use a light raised-glass selection state.
- Keyboard shortcuts remain in tooltips; no shortcuts change.
- The rail visually floats above the workspace but remains anchored to the left edge.

### 5.4 Canvas workspace

- Occupies all space between the left rail and right dock.
- Adds a document-tab strip above the canvas using the current project/document name where available, with a neutral fallback label.
- Retains the existing canvas background selector, canvas element, zoom controls, panning, selection bounds, and direct manipulation.
- The workspace background uses a dark environmental gradient. The actual canvas receives the strongest shadow and a fine highlight edge.
- Zoom controls become a compact floating glass control near the bottom-right of the workspace.
- The center panel no longer displays a redundant `Canvas Preview` heading.

### 5.5 Right inspector dock

The current two side panels move into one right-side column while retaining separate visibility controls.

- **Upper dock:** Properties, including the active-layer name, common settings, transforms, effects, and text settings.
- **Lower dock:** Layers and History as tabs.
- Layer creation actions remain at the top of the Layers tab.
- The upload/drop zone remains available but becomes visually compact so the layer stack receives more space.
- When Layers is hidden, Properties may use the available dock height.
- When Properties is hidden, Layers/History may use the available dock height.
- When both are hidden, the canvas workspace expands into the right-side space.

The existing `.left-panel` and `.right-panel` visibility semantics may be retained internally to minimize behavior changes, even though both panels are visually placed in the right dock.

### 5.6 Status bar

- A thin bottom glass bar provides persistent, low-priority context.
- It may show existing information only: current tool guidance, save status already available to the UI, document dimensions, and zoom.
- If a value is not already exposed, it is omitted rather than creating new application state.

## 6. Spatial Glass Visual System

### 6.1 Foundation tokens

The final values may be tuned during browser verification, but must follow these relationships:

| Token | Target | Purpose |
|---|---|---|
| `--app-bg` | near-black blue-gray | Environmental workspace background |
| `--glass` | dark blue-gray at about 68% opacity | Primary glass surfaces |
| `--glass-strong` | dark blue-gray at about 84% opacity | High-readability surfaces and fallbacks |
| `--glass-soft` | lighter glass at about 44% opacity | Hover and nested controls |
| `--glass-line` | white at about 14–18% opacity | Fine spatial edges |
| `--glass-shine` | white at about 6–10% opacity | Inner top highlight |
| `--text` | cool off-white | Primary text |
| `--text-muted` | cool gray-blue | Secondary text |
| `--selection` | near-white cool tint | Active tools, tabs, and layer selection |

### 6.2 Materials

- Use `backdrop-filter: blur(...) saturate(...)` only on application chrome, never on the artwork canvas.
- Pair blur with an explicit translucent background so the UI remains readable.
- Use one fine outer border and one subtle inner top highlight per primary glass surface.
- Use deeper shadows for the canvas and major docks; nested controls use minimal or no shadow.
- Environmental color is subtle and restricted to the workspace background.

### 6.3 Geometry

- Primary bars and dock panels: 8–10px radius.
- Compact controls: 4–6px radius.
- Pills are reserved for zoom/status or true toggle-style controls.
- Spacing follows a compact 4/8/12px rhythm.
- Desktop controls remain at least 28px high where practical; icon-only controls retain accessible hit areas.

### 6.4 Typography and icons

- Keep Inter and current SVG icon infrastructure.
- Primary interface text remains 11–13px; section labels remain compact but legible.
- Numeric values use tabular numerals.
- Icons inherit `currentColor`; emojis or platform-dependent glyphs are not introduced into the application UI.

## 7. Interaction Behavior

- Tool activation, layer selection, direct manipulation, zoom, history, persistence, and export continue through existing handlers and state.
- Active tools appear raised and light; inactive tools remain low-contrast until hover or focus.
- Active tabs use a bright lower indicator and higher text contrast.
- Selected layers use a subtle illuminated edge and tinted glass fill, not a heavy white rectangle.
- Hover transitions are short and quiet. Pressed controls compress slightly.
- Existing Layers and Properties rail toggles continue to control their respective sections after relocation.
- Dock height redistribution is handled by CSS layout rather than new application state.
- The History tab continues to use `history.jump()` and the existing history subscription.
- All interactive-looking elements map to current actions.

## 8. Responsive Behavior

### 8.1 Desktop: 1024px and above

Use the complete Photoshop-style organization described above.

### 8.2 Compact: below 1024px

- Preserve the canvas-first order.
- Convert the left tool rail into a horizontal tool strip below the application/options bars.
- Place Properties and Layers/History below the canvas as full-width glass cards.
- Keep the same IDs and event handlers; only visual order and CSS layout change.
- Allow panel content to scroll independently where needed.
- Wrap application actions and contextual options without overlapping controls.

This is a responsive adaptation, not a separate touch editor. Touch-specific feature work remains out of scope.

## 9. Accessibility and Fallbacks

- Preserve native button, input, select, textarea, range, and file-input behavior.
- Keep or improve accessible names and titles for icon-only controls.
- Maintain visible `:focus-visible` treatment with sufficient contrast on glass.
- Do not encode selection using translucency alone; pair it with contrast and an edge or indicator.
- Keep text contrast readable against the actual glass background.
- Under `prefers-reduced-motion: reduce`, disable nonessential transitions and entrance animations.
- When `backdrop-filter` is unavailable, use `--glass-strong` opaque-enough surfaces so the layout remains readable.
- Panel overflow must scroll rather than clip controls.

Existing error toasts, validation, file errors, and export errors are unchanged. UI relocation must not obscure toasts or modal-like overlays such as the document graph.

## 10. Implementation Boundaries

### 10.1 Expected files

- `index.html`: reorganize existing controls and panel markup; preserve functional IDs.
- `src/style.css`: replace the current workspace layout and visual tokens with the approved spatial-glass system; retain graph overlay and functional state selectors.
- `src/history-panel.ts`: minimal tab-target update if required to place History beside Layers.
- `src/rail.ts`: change only if the existing hide/show class mapping cannot be preserved through CSS.

No other TypeScript file should change unless a direct markup dependency makes a minimal UI-wiring adjustment unavoidable. Such a change must not alter state, commands, rendering, persistence, or tool behavior.

### 10.2 Compatibility strategy

- Preserve every existing control ID consumed by TypeScript.
- Prefer CSS grid placement over moving feature logic.
- Keep existing `.hide-left` and `.hide-right` states as the Layers and Properties visibility signals.
- Reuse current subscriptions and event listeners.
- Do not rename state fields, dirty flags, tool IDs, keyboard shortcuts, or command labels.
- Before editing each shared file, inspect the current working-tree version to avoid overwriting concurrent changes.

## 11. Data and Event Flow

The redesign does not create a new data layer.

```text
Existing controls and tool buttons
        ↓ existing DOM listeners
Existing commands / document state / tool registry
        ↓ existing subscriptions and dirty flags
Canvas, properties, layers, history, and status presentation
```

Moving an element in the DOM must not change which handler owns it. Styling states continue to derive from existing classes, attributes, subscriptions, and disabled states.

## 12. Verification

### 12.1 Automated checks

- Run `npm run build` and require a successful TypeScript and Vite build.
- Confirm no duplicate IDs were introduced.
- Confirm no placeholder or unfinished copy remains in application markup or styling.

### 12.2 Desktop interaction checks

- Open, Save, Undo, Redo, Export.
- Move, Hand, Zoom, Space-to-pan, and keyboard tool shortcuts.
- Add image, add text, paste/drop/upload, select, reorder, hide, rename, and delete layers.
- Properties controls, effect toggles, exact value entry, and reset behavior.
- Layers/History tab switching and history jumping.
- Layers and Properties visibility toggles, both individually and together.
- Canvas-size presets and custom dimensions.
- Background choices, zoom controls, graph overlay, and toasts.
- Autosave restore behavior and project open/save flows.

### 12.3 Visual and responsive checks

- Review at representative widths above and below 1024px.
- Verify no overlap, clipped controls, inaccessible scroll regions, or canvas obstruction.
- Verify glass contrast with light, dark, and transparent artwork/backgrounds.
- Verify the solid-glass fallback with `backdrop-filter` disabled.
- Verify reduced-motion behavior.
- Verify keyboard focus order and focus visibility.
- Confirm the browser console is free of errors.

## 13. Completion Criteria

The UI is complete when the approved Photoshop-style organization and balanced spatial-glass material are present, all existing editor behaviors still work, responsive and accessibility fallbacks remain usable, the production build passes, and no unrelated or concurrent feature logic has been changed.
