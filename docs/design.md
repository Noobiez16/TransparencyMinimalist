# Design System Spec

This document details the visual guidelines, typography, grids, layout structures, and design tokens of the Minimalist Dynamic Layer Image Editor.

---

## 1. Visual Style & Philosophy

The application utilizes a **Premium Minimalist / High-Fidelity Flat Design** theme, emphasizing content utility and visual clarity:
* **Sharp Lines**: Solid, fine borders (`1px solid`) with `0px` border-radii throughout control panels, sliders, and canvases to construct a modern blueprint feel.
* **No Drop Shadows**: Avoids complex gradients or drop-shadows to ensure the preview workspace remains flat and distraction-free.
* **Contrast & Depth**: Employs high-contrast transitions (pure white backgrounds with deep charcoal elements) for distinct module categorization.

---

## 2. Color Palette & Tokens

| Token | CSS Variable | Hex Code | Purpose |
| --- | --- | --- | --- |
| **Primary Background** | `--bg-color` | `#FFFFFF` | Core workspace, panels, and columns background. |
| **Secondary Background** | `--panel-bg` | `#F5F5F5` | Secondary panels, layers list backgrounds, and disabled controls. |
| **Primary Text / Borders** | `--border-color` / `--text-color` | `#000000` | Solid borders, titles, active labels, and icons. |
| **Secondary text / Guides** | `--secondary-text` | `#A0A0A0` | Inactive labels, units, placeholders, and drag indicators. |
| **Accent Highlight** | `--accent-color` | `#6366F1` | Sleek Indigo violet used for active borders, slider tracks, and buttons. |

---

## 3. Typography

The design is built on a single, highly-readable sans-serif font family, loaded dynamically via Google Fonts:
* **Font Family**: `Inter`, System Sans-Serif
* **Scales**:
  * Title Headers: `1.25rem` (medium weight, tracking `-0.02em`)
  * Control Sections: `0.85rem` (bold uppercase, tracking `0.05em`)
  * Input Labels: `0.75rem` (medium weight)
  * Values / Metrics: `0.7rem` (monospace font stack for stable value increments)

---

## 4. 3-Column Layout System

The editor uses a responsive CSS Grid interface split into three distinct columns:

```
+-------------------+---------------------------+-------------------+
|     Column 1      |         Column 2          |     Column 3      |
|   Source/Layers   |      Canvas Preview       |  Properties Panel |
|                   |                           |                   |
| - Layer Creator   | - Resolution Presets      | - Selection Info  |
| - Drag-reorder    | - BG Theme Toggles        | - Sliders/Filters |
| - Visibility/Del  | - Centered Checkerboard   | - Text Properties |
|                   | - Export Button           |                   |
+-------------------+---------------------------+-------------------+
```

1. **Left Panel (Source & Layers List)**: Dedicated to layer stack management. Houses layer creation tools and layer card stacks (supporting drag-to-reorder and delete/visibility controls).
2. **Center Panel (Workspace)**: A spacious workbench displaying the active canvas. Houses canvas preset controls, theme toggles, and the main download action.
3. **Right Panel (Properties Inspector)**: Accommodates properties sliders. Hidden when no layer is selected, and adapts dynamically depending on whether an image or text layer is active.

---

## 5. Responsive Adaptability

For screen widths below `1024px`, the application adapts using media query break rules:
* The 3-column split transforms into a single-column layout.
* The workspace moves to the top of the viewport, with source selection and control panels stacking below.
* Inputs and controls widen to fit touch targets.
