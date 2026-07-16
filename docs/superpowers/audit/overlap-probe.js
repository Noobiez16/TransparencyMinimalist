// docs/superpowers/audit/overlap-probe.js
// Evaluate in the running app's page. Returns a report object:
//   surfaceViolations — glass surfaces intersecting (canvas-workspace pairs excluded: by design)
//   occluded          — interactive controls whose center hit-tests to a foreign element
//   clipped           — interactive controls extending outside the viewport
(() => {
  const overlapArea = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  };

  // Self-test: abort rather than emit garbage.
  const T = (left, top, right, bottom) => ({ left, top, right, bottom });
  const selfTests = [
    [overlapArea(T(0, 0, 10, 10), T(5, 5, 15, 15)), 25],
    [overlapArea(T(0, 0, 10, 10), T(10, 0, 20, 10)), 0], // edge touch is not overlap
    [overlapArea(T(0, 0, 10, 10), T(20, 20, 30, 30)), 0]
  ];
  for (const [got, want] of selfTests) {
    if (got !== want) return { error: `probe self-test failed: got ${got}, want ${want}` };
  }

  const describe = (el) =>
    el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const SURFACES = [
    '.appbar', '.options-bar', '.rail', '.canvas-workspace', '.properties-dock',
    '.layers-history-dock', '.statusbar', '#transform-session-guard'
  ];
  const surfaces = SURFACES
    .map((sel) => [sel, document.querySelector(sel)])
    .filter(([, el]) => el && visible(el));

  const surfaceViolations = [];
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const [selA, a] = surfaces[i];
      const [selB, b] = surfaces[j];
      // Panels floating over the canvas are by design (spatial glass).
      if (selA === '.canvas-workspace' || selB === '.canvas-workspace') continue;
      // The session guard intentionally covers everything while open.
      if (selA === '#transform-session-guard' || selB === '#transform-session-guard') continue;
      const area = overlapArea(a.getBoundingClientRect(), b.getBoundingClientRect());
      if (area > 1) surfaceViolations.push({ a: selA, b: selB, area: Math.round(area) });
    }
  }

  const controls = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')]
    .filter((el) => visible(el) && !el.closest('[inert]'));

  const occluded = [];
  const clipped = [];
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) {
      clipped.push({ control: describe(el), rect: { l: r.left, t: r.top, r: r.right, b: r.bottom } });
      continue;
    }
    const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      occluded.push({ control: describe(el), by: describe(hit) });
    }
  }

  return {
    viewport: { w: innerWidth, h: innerHeight },
    surfaceViolations,
    occluded,
    clipped
  };
})();
