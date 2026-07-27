export interface TextStyle {
  fontFamily: string;
  fontSize: number;      // DOCUMENT pixels, 8-512
  color: string;
  tracking: number;      // extra advance per character, -100..500
  leading: number;       // line height in document pixels, 1..1000
}

export interface StyleSpan { start: number; end: number; style: TextStyle }

export type TextAlign = 'left' | 'center' | 'right';

export const TEXT_FAMILIES = ['Inter', 'sans-serif', 'serif', 'monospace'] as const;

export function defaultTextStyle(): TextStyle {
  return { fontFamily: 'Inter', fontSize: 64, color: '#000000', tracking: 0, leading: 64 * 1.2 };
}

const bound = (value: number, lo: number, hi: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(hi, Math.max(lo, value));
};

export function clampTextStyle(style: TextStyle): TextStyle {
  return {
    fontFamily: style.fontFamily,
    fontSize: bound(style.fontSize, 8, 512, 8),
    color: style.color,
    tracking: bound(style.tracking, -100, 500, 0),
    leading: bound(style.leading, 1, 1000, 1)
  };
}

const sameStyle = (a: TextStyle, b: TextStyle): boolean =>
  a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.color === b.color &&
  a.tracking === b.tracking && a.leading === b.leading;

/**
 * Repair spans into the invariant the rest of the engine relies on: sorted,
 * contiguous, non-overlapping, covering exactly [0, textLength).
 */
export function normalizeSpans(spans: StyleSpan[], textLength: number): StyleSpan[] {
  if (textLength <= 0) return [];
  const sorted = [...spans]
    .map((s) => ({
      start: Math.max(0, Math.min(textLength, Math.floor(s.start))),
      end: Math.max(0, Math.min(textLength, Math.floor(s.end))),
      style: clampTextStyle(s.style)
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  const out: StyleSpan[] = [];
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor) {
      // Gap: fill it with the previous style, or the default at the very start.
      const filler = out.length ? out[out.length - 1].style : defaultTextStyle();
      out.push({ start: cursor, end: span.start, style: filler });
    }
    const start = Math.max(cursor, span.start);
    if (span.end > start) {
      out.push({ start, end: span.end, style: span.style });
      cursor = span.end;
    }
  }
  if (cursor < textLength) {
    const filler = out.length ? out[out.length - 1].style : defaultTextStyle();
    out.push({ start: cursor, end: textLength, style: filler });
  }

  const merged: StyleSpan[] = [];
  for (const span of out) {
    const last = merged[merged.length - 1];
    if (last && sameStyle(last.style, span.style)) last.end = span.end;
    else merged.push({ ...span, style: { ...span.style } });
  }
  return merged;
}

export function styleAt(spans: StyleSpan[], index: number): TextStyle {
  for (const span of spans) {
    if (index >= span.start && index < span.end) return span.style;
  }
  return spans.length ? spans[spans.length - 1].style : defaultTextStyle();
}

export function applyStyleToRange(
  spans: StyleSpan[], start: number, end: number, patch: Partial<TextStyle>, textLength: number
): StyleSpan[] {
  const from = Math.max(0, Math.min(textLength, Math.floor(start)));
  const to = Math.max(0, Math.min(textLength, Math.floor(end)));
  if (to <= from) return normalizeSpans(spans, textLength);

  const base = normalizeSpans(spans, textLength);
  const out: StyleSpan[] = [];
  for (const span of base) {
    if (span.start < from) {
      out.push({ start: span.start, end: Math.min(span.end, from), style: { ...span.style } });
    }
    const overlapStart = Math.max(span.start, from);
    const overlapEnd = Math.min(span.end, to);
    if (overlapEnd > overlapStart) {
      out.push({
        start: overlapStart, end: overlapEnd,
        style: clampTextStyle({ ...span.style, ...patch })
      });
    }
    if (span.end > to) {
      out.push({ start: Math.max(span.start, to), end: span.end, style: { ...span.style } });
    }
  }
  return normalizeSpans(out, textLength);
}

/**
 * Replace a text layer's string, keeping its spans covering exactly the new length.
 * Changing `text` without this leaves spans sized to the old string, which still renders
 * (styleAt falls back to the trailing span) but breaks the invariant that caret and
 * selection indices rely on.
 */
export function setTextContent(layer: { text: string; spans: StyleSpan[] }, text: string): void {
  layer.text = text;
  layer.spans = normalizeSpans(layer.spans, text.length);
}

/** Convert a pre-D3 text layer (flat style fields) into the span model. */
export function migrateTextLayer(
  raw: Record<string, unknown>
): { text: string; spans: StyleSpan[]; align: TextAlign } {
  const text = typeof raw.text === 'string' ? raw.text : '';
  const align: TextAlign =
    raw.align === 'left' || raw.align === 'right' || raw.align === 'center' ? raw.align : 'center';

  if (Array.isArray(raw.spans)) {
    return { text, spans: normalizeSpans(raw.spans as StyleSpan[], text.length), align };
  }
  const base = defaultTextStyle();
  const fontSize = typeof raw.fontSize === 'number' ? raw.fontSize : base.fontSize;
  const style: TextStyle = clampTextStyle({
    fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : base.fontFamily,
    fontSize,
    color: typeof raw.color === 'string' ? raw.color : base.color,
    tracking: 0,
    leading: fontSize * 1.2      // matches the pre-D3 renderer's line spacing
  });
  return { text, spans: normalizeSpans([{ start: 0, end: text.length, style }], text.length), align };
}
