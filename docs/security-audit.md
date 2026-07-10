# Security Review

This Engineering review describes safeguards visible in the current Transparency source and identifies remaining risk. It is a practical contributor reference, not an assurance that every browser, deployment, or untrusted file is safe.

## Scope and Trust Boundaries

The reviewed boundary includes the browser UI, canvas compositor, image and project import paths, clipboard and drop handling, project persistence, undo history, and file export. The deployment host, browser implementation, files supplied by a user, and third-party network resources remain separate trust boundaries.

Transparency has no application server in this repository. However, `index.html` requests Inter from Google Fonts through `fonts.googleapis.com` and `fonts.gstatic.com`, so opening the application can disclose ordinary request metadata to those services. That external font dependency must be included in privacy and deployment decisions.

## Data Flow and Privacy

Imported media is decoded into in-memory canvases. Project data and autosaves otherwise stay in browser memory or browser storage unless the user explicitly saves a project or exports an image. The application source does not upload imported media or project content to an application backend.

This local flow does not eliminate all external communication: the Google Fonts request described above still occurs, and browser extensions, hosting infrastructure, or modified deployments are outside this repository's control.

## Text and DOM Safety

Text layers are rendered by `CanvasRenderingContext2D.fillText`, which paints glyphs rather than inserting the layer text into the HTML document. UI-generated layer names and status strings are assigned through `textContent`. These paths keep user strings out of HTML parsing.

Some fixed internal icon, layer-card, effect-row, and legend templates use `innerHTML`. Those templates interpolate trusted strings defined by the application. Graph details that include a layer name escape it before assigning an HTML-formatted summary. Contributors should preserve this separation: untrusted names, project text, and file metadata should use `textContent` or explicit escaping rather than direct HTML interpolation.

## Image Import, Clipboard, and Drop Handling

Image selection and dropped image files pass a MIME-prefix check using `file.type.startsWith('image/')`; clipboard items are likewise considered only when their type starts with `image/`. This is a useful routing check, but a MIME label alone is not proof that file contents are benign or within safe resource limits. The browser image decoder remains part of the trust boundary.

Image files are decoded from an object URL. The import path revokes that object URL after either successful loading or an error. Dropped `.json` files are routed to the project loader instead of the image decoder.

The document-level paste handler suppresses image-layer creation when the active element is an `INPUT` or `TEXTAREA`. Normal text paste therefore remains available while a user edits a field.

## Project Files and Persistence

Saved projects use a JSON envelope with the app marker `minimalist-editor` and `version: 1`. The loader checks the app marker, requires a document, and rejects versions newer than it supports. It then reconstructs image canvases from serialized data URLs.

The loader does not fully validate the nested document and layer data against a schema or enforce every numeric range before casting it to the application types. A malformed or adversarial project can therefore reach browser decoding, allocation, and rendering paths with unexpected values. Treat `.mledit.json` files as untrusted input.

Autosave serializes the same project representation into IndexedDB database `mledit`, including Base64 image data URLs, under the latest autosave entry. That data persists until browser storage is cleared or the browser evicts site data; the project has no in-app autosave deletion control.

## Export and Object URLs

Project save creates a JSON Blob and a temporary object URL. PNG export composites the document into a canvas, encodes an image Blob, and creates another temporary object URL. In both paths the application triggers a browser download and then revokes the object URL.

Revocation limits the lifetime of those temporary URL handles. It does not delete a file already downloaded by the user or clear the related autosave from IndexedDB.

## Resource Exhaustion Risks

The main remaining browser-side risk is resource exhaustion rather than script execution. Relevant pressure points include:

- Large decoded image dimensions, which can require substantial canvas memory even when the source file is compressed.
- Base64 image data in `.mledit.json` projects and IndexedDB, which increases serialized size and creates additional copies during parsing and save operations.
- Repeated compositor work for large documents, multiple layers, scaling, blend modes, and enabled effects, which can consume CPU and GPU time.
- Undo history, which is limited to 50 entries and uses a 150 MiB estimate cap, but whose byte estimates do not account for every browser allocation or duplicated reference.

The current import path has no explicit upload-size or decoded-dimension ceiling. Browser or device limits may be reached before the history estimate cap provides meaningful protection.

## Deployment Recommendations

- Serve the built application over HTTPS with a restrictive `Content-Security-Policy`; keep `script-src` and `style-src` narrow, explicitly account for required font origins, and use `object-src 'none'` unless a deployment proves otherwise necessary.
- Add restrictive hosting headers appropriate to the environment, including MIME-sniffing protection, a deliberate framing policy, and a conservative referrer policy.
- Review and update build dependencies regularly, and review any new runtime or remote dependency before deployment.
- Add file-size, decoded-image-dimension, document-dimension, layer-count, and project-schema validation before accepting hostile or public uploads.
- Offer self-hosted Inter files or a system-font-only build for deployments with stricter privacy or offline requirements.
- Test save, restore, import, and export limits on representative low-memory devices and browsers.

## Remaining Limitations

This review is source-based and does not include browser-engine fuzzing, third-party infrastructure assessment, penetration testing, or exhaustive malformed-file testing. MIME-prefix checks do not verify file signatures. Project deserialization does not enforce a complete schema or all ranges. Imported images, large Base64 projects, and expensive compositions can still exhaust resources. IndexedDB retains autosaves beyond the current session, and the default page contacts Google Fonts.

Future changes to dependencies, hosting headers, remote assets, parser behavior, or browser APIs require a new review. Contributors should treat this document as a current snapshot and keep claims aligned with implemented safeguards and remaining limitations.
