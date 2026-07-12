# Task 2 Report: Pure Transform Geometry

Status: `DONE`

## RED evidence

- Initial focused run: `npx.cmd vitest run tests/transform-geometry.test.ts` failed at collection because `../src/engine/transform-geometry` did not exist. This was the expected feature-missing failure before production implementation.
- Normalization self-review regression: focused suite failed 1 of 19 tests because `normalizeDegrees(-360)` returned JavaScript negative zero instead of canonical positive zero.
- Independent-review regression: focused suite failed 1 of 20 tests because a layer with `scaleX: 0` hit-tested as an infinite strip.
- Threshold follow-up regression: focused suite failed 1 of 20 tests because `scaleX: 1e-11` passed a percentage-unit guard while coordinate inversion treated the corresponding scale factor as non-invertible.

## GREEN evidence

- `npx.cmd vitest run tests/transform-geometry.test.ts`: PASS — 1 file, 20 tests.
- `npm.cmd run test:core`: PASS — 3 files, 34 tests.
- `npm.cmd run test:ui`: PASS — 9 tests.
- `npm.cmd run test:docs`: PASS — 9 tests.
- `npm.cmd run build`: PASS — strict TypeScript compilation and Vite production build; 25 modules transformed.
- `git diff --cached --check`: PASS before the feature commit.

## Changed files

- `src/engine/transform-geometry.ts`
- `tests/transform-geometry.test.ts`
- `src/engine/document.ts`
- `src/engine/tools.ts`

## Implementation decisions

- Defined `LayerTransform`, `Point`, and `Size` in the pure geometry module and re-exported them from `document.ts`, preserving the version 2 affine interface without introducing a runtime import cycle.
- Used natural layer pixels as local coordinates and immutable center-based translation, independent scale, and rotation conversions.
- Ordered quad corners clockwise from northwest and derived all eight resize handles plus the outward rotation handle from the rotated quad.
- Implemented exact rotated hit-testing through inverse affine conversion. Empty or effectively non-invertible displayed axes do not produce selectable infinite strips.
- Kept one shared scale-invertibility predicate for inverse conversion and hit-testing so percentage and scale-factor units cannot diverge.
- Kept the opposite edge or corner fixed during resizing. Linked corner resizing projects onto the starting diagonal to preserve proportions; side handles resize one axis; crossing the anchor clamps at the requested minimum instead of flipping.
- Normalized degree results to `[0, 360)`, including canonical positive zero, and applied 15-degree pointer constraints.
- Replaced duplicated document hit-test math and made `layerAt()` call the pure helper directly while preserving visible, front-to-back traversal.

## Commit

`71a06e05e3a129e04e1d6f2df7982016360e15a7` — `feat: add affine transform geometry`

## Self-review

- Confirmed the geometry module has no DOM, state, history, rendering, or other imports.
- Confirmed no sessions, overlays, snapping, crop, or UI changes were introduced.
- Confirmed input transforms are not mutated and public outputs are newly allocated values.
- Independent review initially found the degenerate-scale hit-test issue and then the threshold-unit mismatch. Both were reproduced with failing tests and fixed through a shared predicate.
- Final independent correction review found no remaining Critical or Important issues.

## Concerns

- Vitest and Vite configuration loading required approved execution outside the restricted filesystem sandbox; this was an environment limitation, not a project failure.
- The exact feature SHA can only be recorded after the feature commit exists, so this report is stored in a follow-up documentation commit.
