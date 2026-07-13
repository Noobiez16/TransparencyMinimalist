# Composition Examples

These recipes use the controls currently available in Transparency. In the Layers panel, layer 0 is the first card and is visually topmost; lower cards are composited behind it.

## Before You Start

Choose a document size and a Background option before composing. Select **Transparent** when the exported artwork needs an alpha channel. New image and text layers start at the document center. Their **Position X (px)** and **Position Y (px)** values describe the layer center in document pixels, so use half the document width and height to center a layer rather than percentage offsets.

The supported blending choices are **Normal**, **Multiply**, **Screen**, **Overlay**, **Darken**, and **Lighten**. **Opacity** and **Scale** apply to either layer type. **Blur** can apply to image or text layers, while **Brightness**, **Contrast**, and **Saturation** apply to image layers. Each effect has its own switch and must be enabled before its value affects the composition.

## Precise Placement and Framing

This workflow positions a layer exactly and then reframes the whole document without losing pixels.

1. Select the layer with the Move tool and drag it. Smart alignment guides appear as the layer approaches the document center, a document edge, or another visible layer, and the drag snaps to the highlighted line. Hold `Ctrl/Cmd` to bypass snapping for one gesture, or turn **Snap** off in the options bar.
2. For exact values, press `Ctrl+T` to open Free Transform, then edit the X, Y, width, height, or rotation fields in the options bar. Hold `Shift` while dragging a handle to constrain it. Press `Enter` to apply the session or `Escape` to discard every change from it.
3. To reframe the composition, switch to the **Crop** tool (`C`). Pick a ratio such as **1:1** or **16:9** (or enter a custom ratio), drag the handles or the window, and press `Enter` to apply. The crop changes only the document bounds and layer positions, so one undo restores the previous framing exactly.

## Transparency-Aware Artwork

This workflow creates artwork whose transparent and partially transparent regions can respond to the background chosen by a viewer or publishing service.

1. Select **Transparent** under Background.
2. Add a base image or text layer, then place it below any foreground layer in the Layers panel.
3. Add the foreground image as layer 0 so it remains visually topmost.
4. Try **Multiply** for dark detail, **Screen** for light detail, or **Overlay** for stronger combined contrast.
5. Adjust **Opacity** as needed. To check contrast in the editor, you may temporarily switch the document Background to **White** or **Black**; these choices change the saved document background and add that opaque fill to the export.
6. Return to **Transparent** before using **Export** for a transparent PNG. As an alternative, keep the document Transparent and inspect the exported PNG over light and dark surfaces in an external viewer.

PNG preserves transparency produced by the editor. A hosting or social service may still recompress the file, convert it to another format, or flatten it against a background, so verify the uploaded result on every target service.

## Double Exposure

1. Add a landscape image and keep it below the portrait layer.
2. Add a high-contrast portrait or silhouette; because a new layer is inserted at layer 0, it appears visually above the landscape.
3. Select the portrait and try **Screen** or **Lighten**. Which mode works best depends on the source tones.
4. Reduce its **Opacity** until both images remain legible.
5. For softer depth, enable **Blur** on the landscape and raise the value gradually.
6. If the sources need tonal adjustment, enable **Brightness**, **Contrast**, or **Saturation** before changing the corresponding value.

## High-Contrast Editorial Text

1. Add a background image and enable **Blur** to reduce distracting detail.
2. Enable **Brightness** or **Contrast** on that image if the text needs more separation.
3. Add a text layer. Keep it at or near layer 0 so it stays topmost.
4. Enter the copy under **Text Content**, then choose its font, size, and color.
5. Center the text by setting **Position X (px)** to half the document width and **Position Y (px)** to half the document height. For a 1024 by 1024 document, use `x = 512` and `y = 512` document pixels.
6. Use **Normal** for predictable typography, or test **Overlay** when interaction with the background is intentional.

## Reusable Project Workflow

Use **Save project** to download a `.mledit.json` project file. It contains the document, layers, settings, and serialized image data needed for later editing. Use **Open project** to select that file and replace the current document; the editor asks before replacing unsaved work when history is dirty.

After changes, autosave serializes the current project into browser storage. On a later visit, the editor can offer to restore the latest autosave. Treat this as recovery assistance, not as the portable copy: browser storage can be cleared or unavailable. Keep important `.mledit.json` files in normal backed-up storage.

Saving a project does not create the final image. Use **Export** separately to download the rendered PNG.

## Export Checklist

- Confirm the intended document size and Background choice.
- Review layer order, visibility, **Opacity**, and blend modes.
- Confirm each intended effect is enabled, not merely assigned a value.
- If you temporarily selected **White** or **Black** to check contrast, return to **Transparent** before using **Export** for a transparent PNG.
- Save a `.mledit.json` project if future editing matters.
- Export the PNG and inspect the downloaded file before publishing it.
