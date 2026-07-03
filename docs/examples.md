# Composition Examples & Guide

This document describes common design configurations and step-by-step instructions to create creative blends using the Minimalist Dynamic Layer Image Editor.

---

## 1. Twitter Hidden Images (Transparency Illusion)

A classic composition where an image behaves differently on light and dark backgrounds (common in dark-mode clients):

### Steps to Recreate
1. Open the editor and select a **Transparent** canvas background.
2. Add a new **Image Layer** (let's name it "Overlay / Hidden").
3. Upload a grayscale image (or apply a high-contrast filter) to this layer.
4. Set its **Blend Mode** to `multiply` or `screen`.
5. Add a second **Image Layer** or **Text Layer** below it (acting as the "Base").
6. Set the Base layer's opacity to a low setting (e.g. `20%` to `40%`).
7. **Export**: Export as a PNG. When viewed on Twitter/X in light mode (white background), the multiply blend will reveal the dark elements. In dark mode (black background), the screen blend reveals the light elements, making parts of the image appear to "vanish" or morph.

---

## 2. Double Exposure Effect

Blending a portrait profile silhouette with a landscape background:

### Steps to Recreate
1. Add a **Background Image Layer** containing a landscape photo (e.g., forest, city skyline).
2. Set its Scale to fit, keeping contrast high.
3. Add a second **Image Layer** on top containing a high-contrast silhouette portrait (e.g., a person's profile against a pure white background).
4. Set the silhouette layer's **Blend Mode** to `screen` or `lighten`.
5. Adjust the top layer's **Opacity** to `80%`.
6. Apply a slight **Blur** (`2px` to `5px`) to the background landscape layer to create photographic depth.
7. Export the final PNG.

---

## 3. High-Contrast Monochromatic Text Overlay

A sleek layout combining large bold text overlaying a blurred background:

### Steps to Recreate
1. Add a **Background Image** layer.
2. Increase its **Blur** slider to `15px` to create a smooth, abstract background.
3. Lower its **Brightness** to `70%` for readability.
4. Add a **Text Layer** on top.
5. In the Properties panel, input your copy (supports multiple lines).
6. Set the **Font Family** to `Inter` (or similar bold sans-serif) and increase **Font Size** to `64px`.
7. Set the text color to `#FFFFFF` (or use the Color Picker).
8. Center the text using X/Y translations (`xOffset = 0%`, `yOffset = 0%`).
9. Export the composition.
