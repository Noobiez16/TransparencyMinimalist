# Security Audit

This document conducts a security review of the Minimalist Dynamic Layer Image Editor, focusing on sanitization, cross-site scripting (XSS) defenses, clipboard interactions, and data storage privacy.

---

## 1. Cross-Site Scripting (XSS) Prevention

### Viewport Text Rendering
* **Vulnerability Threat**: Malicious actors importing or pasting text containing script tags (e.g. `<script>alert('XSS')</script>` or SVG image load onerror payloads).
* **Mitigation**: When updating text layer strings in the preview viewport, the application assigns data to nodes using the `textContent` property:
  ```typescript
  div.textContent = layer.textContent;
  ```
  This forces the browser to treat all inputs strictly as raw text strings rather than parsing them as executable HTML.

### Export Canvas Text
* **Mitigation**: Text strings rendered in the canvas export engine are drawn using `ctx.fillText(line, x, y)`. The 2D canvas drawing API is inherently immune to HTML-based XSS, treating inputs strictly as shapes.

---

## 2. Input Sanitization & Bounds Checking

### Slider and Control Ranges
* Slider values are validated in the browser through `min`, `max`, and `step` properties in `index.html`.
* Inside `src/main.ts`, the parsing routines sanitize values strictly to ensure memory overflows or boundary crashes are avoided:
  ```typescript
  propOpacityNum.addEventListener('input', () => {
    const layer = getActiveLayer();
    if (layer) {
      let val = parseInt(propOpacityNum.value, 10);
      if (isNaN(val)) val = 0;
      if (val < 0) val = 0;
      if (val > 100) val = 100;
      layer.opacity = val;
      ...
  ```
* Every custom dimension input is parsed using base-10 radixes (`parseInt(value, 10)`) and falls back to safe default dimensions (`1024px`) if inputs evaluate to `NaN`.

---

## 3. Clipboard and Paste Safety

* **Active Input Interception**: The clipboard paste handler includes a boundary selector check:
  ```typescript
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }
  ```
  This ensures that when a user is typing inside text fields, the paste event is passed to the input's default text buffer, preventing the creation of new layers.
* **Content Filtering**: The paste handler validates clipboard items against prefix matches:
  ```typescript
  if (item.type.startsWith('image/')) { ... }
  ```
  Only items with verified MIME image categories are parsed via the `FileReader` object, preventing script files from being executed.

---

## 4. CORS and Privacy Sandbox

* **Data Isolation**: The editor is completely client-side. All processing, image scaling, composition, and file exports are executed inside the browser's local sandbox memory space. No images, text content, or metadata are transmitted to external servers.
* **CORS Safety**: Loaded images are converted to local Data URLs (Base64 representation) during import:
  ```typescript
  reader.readAsDataURL(file);
  ```
  Because the image assets are converted to data URLs, drawing them on the `<canvas>` does not violate origin rules, preventing canvas "dirtying" errors during PNG blob creation.
