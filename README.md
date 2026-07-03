# Transparency Minimalist Layer Image Editor

A sleek, premium, high-fidelity browser-based image editor designed with a minimalist aesthetic and a general-purpose layer-editing workflow. Build dynamic layer stacks, adjust styles with real-time CSS filters and transformations, and export high-resolution compositions with pixel-perfect accuracy.

---

## 🚀 Key Features

* **Dynamic Layer Stack**: Layer-based editing supporting multiple image layers and custom styled text overlays. Includes native HTML5 drag-and-drop reordering to easily swap Z-indices.
* **Responsive Live Viewport Preview**: Powered by a highly-optimized in-place DOM updating engine that modifies element attributes directly, ensuring buttery-smooth 60fps adjustments even during active slider dragging.
* **Premium Styling Controls**:
  * Aspect ratio presets (1:1 Square, 16:9 Landscape, 9:16 Portrait, 4:5) alongside custom width/height inputs.
  * Canvas background themes (Transparent Checkerboard, Solid White, Solid Black, and Custom Hex Color Picker).
  * Filter controls: Blur, Contrast, Saturation, Brightness, and Invert.
  * Layer transforms: Opacity, Scale, and coordinate X/Y translations.
  * Blend modes: Normal, Multiply, Screen, Overlay, Darken, and Lighten.
* **High-Resolution Canvas Export**: An offscreen rendering engine that pre-loads all images asynchronously to guarantee Z-index fidelity before rendering to a PNG download. Features aspect-ratio-aware font/blur scaling, text newline separation, and center-cover cropping bounds (matching CSS `object-fit: cover`).
* **Input-Safe Event Handling**: Global Ctrl+V paste listens for image uploads but automatically suspends checks when a text input or textarea is active, preventing accidental layer duplication. Focused input guarding prevents annoying cursor resets or focus loss.

---

## 🛠️ Technology Stack

* **Core**: [TypeScript](https://www.typescriptlang.org/) for robust static typing.
* **Build Tool**: [Vite](https://vitejs.dev/) for lightning-fast bundling.
* **Styling**: Vanilla CSS with custom properties (CSS variables) for flat design aesthetics, sharp outlines, and zero-drop-shadow layout panels.
* **Rendering**: Hybrid HTML/CSS for responsive browser previews and HTML5 Canvas 2D for high-resolution offscreen PNG compilation.

---

## 📁 Project Structure

```
├── index.html           # Main UI editor template (3-column layout)
├── src/
│   ├── main.ts          # Core application logic, event loops, & export engine
│   └── style.css        # Premium minimalist variables and viewport styling
├── dist/                # Production build output
├── tsconfig.json        # TypeScript compiler configurations
└── vite.config.ts       # Vite bundler parameters
```

---

## 💻 Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Local Development

Launch the hot-reloading development server:

```bash
npm run dev
```

### Production Compilation

Compile and build the production bundle:

```bash
npm run build
```

The compiled assets will be outputted to the `dist/` directory, optimized and ready for static hosting.

---

## 📐 Hybrid Rendering Architecture

To deliver both a high-fidelity experience and desktop performance, the editor leverages a **Hybrid Preview-to-Export** model:

1. **CSS Live Viewport Preview**: As sliders are adjusted, the editor updates the styling properties (`transform`, `filter`, `opacity`, `mix-blend-mode`) on DOM nodes in-place. This offloads the rendering logic directly to the browser's hardware-accelerated compositor.
2. **Canvas 2D Export Engine**: On export, the editor creates a hidden offscreen canvas at the user's defined physical resolutions. It pre-loads all layer images asynchronously using `Promise.all` and then executes a deterministic, synchronous bottom-to-top drawing sequence. This avoids rendering races and ensures filters and Z-indices match the preview exactly.
