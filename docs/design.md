# Design System

This guide documents the balanced spatial-glass workspace implemented in `src/style.css` and `index.html`. Use it to extend the editor without weakening hierarchy, readability, responsiveness, or accessibility.

## Design Principles

Balanced spatial glass combines a readable dark tint, restrained blur, fine highlight borders, and quiet environmental gradients. Glass is a framing material for tools and metadata; the document canvas remains the visual focus. Depth comes from modest transparency, inset highlights, soft shadows, and a small radius vocabulary rather than ornamental effects.

The system follows four practical principles:

- **Protect the artwork.** Dark, low-chroma surroundings and compact controls keep attention on the composition.
- **Make depth legible.** Environmental gradients establish the room; glass fills, hairline highlights, and shadows separate working surfaces.
- **Keep controls quiet until active.** Muted labels and transparent controls gain lightness, fill, or a precise inset marker on hover and selection.
- **Preserve spatial relationships.** The application bar, contextual options bar, tool rail, canvas workspace, inspector docks, and status bar keep stable roles as the layout adapts.

Inter with system sans-serif fallback is used at a compact 12px base and 1.4 line height. Labels and supporting metadata commonly use 9-11px sizes; important titles use weight rather than a large type jump.

## Spatial Glass Tokens

The current `:root` variables form a relational palette. Opaque anchors define the environment and text, while the glass, card, line, and highlight tokens are deliberately translucent so they blend with the gradients behind them. Do not convert those translucent roles into fixed hex swatches.

| Token | Current definition | Relationship and use |
| --- | --- | --- |
| `--app-bg` | `#080b12` | Deepest page anchor beneath all environmental light. |
| `--workspace` | `#111722` | Slightly lifted dark workspace reference. |
| `--glass` | `rgba(31, 38, 52, 0.68)` | Standard tinted glass fill mixed into surface gradients. |
| `--glass-strong` | `rgba(25, 30, 42, 0.88)` | More opaque than `--glass`; used for menus, toasts, overlays, and no-blur fallback surfaces. |
| `--glass-soft` | `rgba(73, 85, 108, 0.34)` | Lighter interaction fill for hover and secondary emphasis. |
| `--glass-line` | `rgba(232, 240, 255, 0.16)` | Fine cool highlight border on glass surfaces. |
| `--glass-shine` | `rgba(255, 255, 255, 0.08)` | Restrained inset top highlight paired with surface shadows. |
| `--card` | `rgba(9, 13, 22, 0.30)` | Low-contrast nested surface inside a glass panel. |
| `--card-hi` | `rgba(215, 229, 255, 0.13)` | Selected or elevated card tint above `--card`. |
| `--line` | `rgba(232, 240, 255, 0.12)` | Quieter divider than `--glass-line`. |
| `--txt` | `#f0f4fb` | Primary foreground text on the dark environment. |
| `--mut` | `#a7b0c0` | Secondary labels, metadata, and inactive controls. |
| `--selection` | `#eef5ff` | Bright neutral selection, focus, slider thumb, and action color. |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Shared responsive motion curve for control and layout transitions. |

The body layers two low-opacity radial gradients over `--app-bg`. A `.glass-surface` layers a subtle directional gradient over `--glass`, a one-pixel `--glass-line` border, an inset `--glass-shine`, restrained shadow, and `backdrop-filter` blur with saturation. Stronger floating surfaces use `--glass-strong` and larger shadows without changing the palette family.

## Desktop Workspace

Desktop layout applies at 1024px and above. The page uses four horizontal bands: a 44px application bar, a 44px contextual options bar, the flexible editor shell, and a 24px status bar, separated by 7px gaps.

Within the editor shell, the default grid is a 44px tool rail, a flexible canvas workspace, and a 300px right inspector dock:

- The **application bar** contains product identity, open/save and undo/redo actions, plus PNG export.
- The **contextual options bar** exposes the active tool's options, document background controls, and preset or custom canvas sizing.
- The **tool rail** holds registered Move, Hand, and Zoom tools, quick layer creation, the document graph, and inspector visibility controls.
- The **document tab and canvas workspace** frame the active composition, checkerboard or configured background, and the floating zoom control.
- **Properties** occupies the upper inspector region and adapts to the selected image or text layer.
- **Layers / History** shares the lower inspector region, with tabs for layer management and command navigation.
- The **status bar** reports the workspace mode, core tool set, and current document dimensions.

The inspector dock has two stacked glass panels. Rail toggles can hide either panel; hiding both removes the dock and gives the canvas the remaining width. This is a spatial editor arrangement, not a generic equal-column page layout.

## Component Patterns

**Glass surfaces.** Use `.glass-surface` for major chrome that sits over the environment. Nested controls use quieter translucent fills and one-pixel borders. Reserve `--glass-strong` for floating menus, toasts, and the graph overlay where foreground separation matters more than seeing the environment.

**Buttons.** Icon buttons and rail buttons start muted, brighten on hover, and compress slightly on press where applicable. Primary actions use the light selection treatment with dark text. Disabled controls lower foreground opacity and remove the action cursor.

**Tabs and selection.** The active document tab receives a lifted translucent fill. Layers use a brighter border, a soft horizontal fill, and a narrow inset selection marker. The Layers / History tab uses an inset bottom marker. These patterns preserve location while adding emphasis.

**Fields and ranges.** Inputs, selects, and textareas use dark translucent fills, compact radii, and light borders. A range control uses a quiet three-pixel track and a circular `--selection` thumb that grows on hover or drag. Value chips keep measurements aligned without overpowering labels.

**Toggles.** A switch uses a dim pill and light thumb when off. `aria-checked="true"` changes the track to a light gradient and moves a dark thumb to the right. Keep the ARIA state synchronized with the visual state.

**Transient surfaces.** Toasts enter from below with opacity and translation, can include a high-contrast action, and sit above the status bar. The graph overlay uses `--glass-strong`, a strong shadow, and its own inspector side panel so the document relationship view remains readable.

## Interaction States

State must be visible through more than motion alone:

- **Active tool:** a light gradient tile with dark icon/text and a modest inset/high shadow replaces the muted rail treatment.
- **Active tab:** brighter text plus either a translucent document-tab fill or an inset bottom selection line.
- **Active layer:** highlighted border, quiet gradient fill, and inset left marker; hidden or dragged layers retain their separate state styling.
- **Range:** the thumb enlarges and gains a surrounding halo on hover or active drag.
- **Toggle:** `aria-checked="true"` changes both track and thumb position/color.
- **Toast:** `.show` raises opacity to one and removes the entry translation; an optional action remains visually primary.
- **Graph overlay:** `.open` changes the overlay from hidden to flex layout; the graph canvas keeps a grab cursor and supporting detail panel.
- **Focus-visible:** every keyboard-focused element receives a two-pixel `--selection` outline with a two-pixel offset.

Hover may reinforce an affordance but must not be the only indication of selection, checked state, or keyboard focus. New icon-only buttons need an accessible name and a useful title where the existing pattern provides one.

## Responsive Layout

Desktop applies at 1024px and above. The rail, centered canvas, and stacked inspector dock remain side by side, with the canvas receiving flexible width.

Compact stacking applies at 1023px and below. The page becomes vertically scrollable; the dashboard becomes a column; the tool rail becomes a horizontal row; the canvas comes next with a minimum height of 58vh; and Properties plus Layers / History stack below it. The application bar wraps its actions, options can wrap, the graph side panel is hidden, and the status bar drops its center label. Existing rail visibility states still hide their corresponding inspector panels.

Narrow refinements apply at 640px and below. Outer gap and padding shrink to 4px, the application actions occupy their own centered row, secondary product and control labels disappear, canvas/background controls take the full width, theme toggles may scroll horizontally, the document tab fills the available width, and the canvas minimum height rises to 66vh.

When adding layout rules, preserve those exact breakpoint boundaries. Prefer adapting order, wrapping, and available width over creating a separate mobile component tree.

## Accessibility and Fallbacks

The universal `:focus-visible` rule provides a high-contrast keyboard indicator. Tab controls expose tab roles and selection state; switches expose `role="switch"` and `aria-checked`; icon-only controls carry labels. Text uses `--txt` and `--mut` against dark fills, while primary light controls use dark foreground text.

Glass cannot depend on blur support. The `@supports not (backdrop-filter: blur(1px))` rule gives `.glass-surface`, menus, toasts, and the graph overlay a solid-surface `--glass-strong` fallback. Keep the fill whenever adding `backdrop-filter`; include the WebKit-prefixed property on reusable glass surfaces when matching the existing browser coverage.

The `@media (prefers-reduced-motion: reduce)` rule effectively removes animation and transition duration, limits animation iteration to one, and disables smooth scrolling. New motion must use CSS transitions or animations covered by that rule, and content or state must never depend on an animation completing visibly.

## Contribution Guidelines

- Reuse the current tokens before adding a new color, translucent role, easing curve, or shadow.
- Keep artwork chrome dark and neutral; use `--selection` for active and keyboard states rather than introducing a saturated accent.
- Apply glass to major workspace and floating surfaces, then use quieter nested cards so blur and borders do not accumulate.
- Preserve the application bar, contextual options bar, tool rail, canvas workspace, inspector, and status-bar hierarchy at every breakpoint.
- Match existing compact control sizes and radii, but retain clear focus, checked, disabled, hover, and selected states.
- Test new UI at 1024px and above, 1023px and below, and 640px and below, including long labels and both inspector visibility toggles.
- Verify keyboard navigation, accessible names, switch/tab ARIA state, no-blur fallback, and reduced motion before submitting a UI change.
- Update this guide and the UI contract tests whenever a deliberate token, breakpoint, region, or state convention changes.
