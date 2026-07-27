import { expect, test } from 'vitest';
import {
  applyStyleToRange, clampTextStyle, defaultTextStyle, normalizeSpans, setTextContent, styleAt,
  type StyleSpan, type TextStyle
} from '../src/engine/text-model';

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...defaultTextStyle(), ...patch });

test('the default style is a sane 64px Inter', () => {
  const d = defaultTextStyle();
  expect(d.fontFamily).toBe('Inter');
  expect(d.fontSize).toBe(64);
  expect(d.color).toBe('#000000');
  expect(d.tracking).toBe(0);
  expect(d.leading).toBeCloseTo(64 * 1.2, 6);
});

test('clamps bound size, leading, and tracking', () => {
  expect(clampTextStyle(style({ fontSize: 2 })).fontSize).toBe(8);
  expect(clampTextStyle(style({ fontSize: 9999 })).fontSize).toBe(512);
  expect(clampTextStyle(style({ leading: 0 })).leading).toBe(1);
  expect(clampTextStyle(style({ leading: 5000 })).leading).toBe(1000);
  expect(clampTextStyle(style({ tracking: -900 })).tracking).toBe(-100);
  expect(clampTextStyle(style({ tracking: 900 })).tracking).toBe(500);
  expect(clampTextStyle(style({ fontSize: Number.NaN })).fontSize).toBe(8);
});

test('normalizeSpans merges identical neighbours', () => {
  const spans: StyleSpan[] = [
    { start: 0, end: 3, style: style() },
    { start: 3, end: 7, style: style() }
  ];
  const out = normalizeSpans(spans, 7);
  expect(out.length).toBe(1);
  expect(out[0]).toMatchObject({ start: 0, end: 7 });
});

test('normalizeSpans keeps differing neighbours apart', () => {
  const spans: StyleSpan[] = [
    { start: 0, end: 3, style: style() },
    { start: 3, end: 7, style: style({ color: '#ff0000' }) }
  ];
  expect(normalizeSpans(spans, 7).length).toBe(2);
});

test('normalizeSpans fills gaps and clamps to the text length', () => {
  const spans: StyleSpan[] = [{ start: 2, end: 4, style: style({ color: '#ff0000' }) }];
  const out = normalizeSpans(spans, 6);
  expect(out[0].start).toBe(0);
  expect(out[out.length - 1].end).toBe(6);
  for (let i = 1; i < out.length; i++) expect(out[i].start).toBe(out[i - 1].end);
});

test('normalizeSpans on empty text yields no spans', () => {
  expect(normalizeSpans([{ start: 0, end: 5, style: style() }], 0)).toEqual([]);
});

test('styleAt reads the covering span and falls back to the default', () => {
  const spans = normalizeSpans([
    { start: 0, end: 3, style: style() },
    { start: 3, end: 6, style: style({ color: '#00ff00' }) }
  ], 6);
  expect(styleAt(spans, 0).color).toBe('#000000');
  expect(styleAt(spans, 4).color).toBe('#00ff00');
  expect(styleAt([], 0).color).toBe(defaultTextStyle().color);
});

test('applyStyleToRange splits a span and merges identical results', () => {
  const spans = normalizeSpans([{ start: 0, end: 10, style: style() }], 10);
  const out = applyStyleToRange(spans, 3, 6, { color: '#ff0000' }, 10);
  expect(out.length).toBe(3);
  expect(out.map((s) => [s.start, s.end])).toEqual([[0, 3], [3, 6], [6, 10]]);
  expect(out[1].style.color).toBe('#ff0000');
  expect(out[0].style.color).toBe('#000000');

  const merged = applyStyleToRange(out, 0, 10, { color: '#000000' }, 10);
  expect(merged.length).toBe(1);
});

test('setTextContent keeps spans covering the new text length', () => {
  const layer = { text: 'Edit me', spans: normalizeSpans([{ start: 0, end: 7, style: style({ color: '#ff0000' }) }], 7) };

  // Growing the text must extend coverage using the trailing style.
  setTextContent(layer, 'Minimalist Editor');
  expect(layer.text).toBe('Minimalist Editor');
  expect(layer.spans[0].start).toBe(0);
  expect(layer.spans[layer.spans.length - 1].end).toBe(17);
  expect(styleAt(layer.spans, 16).color).toBe('#ff0000');

  // Shrinking must clamp rather than leave spans pointing past the end.
  setTextContent(layer, 'Hi');
  expect(layer.spans[layer.spans.length - 1].end).toBe(2);

  // Emptying leaves no spans at all.
  setTextContent(layer, '');
  expect(layer.spans).toEqual([]);
});

test('setTextContent preserves distinct styles within the surviving range', () => {
  const spans = normalizeSpans([
    { start: 0, end: 3, style: style({ color: '#ff0000' }) },
    { start: 3, end: 10, style: style({ color: '#0000ff' }) }
  ], 10);
  const layer = { text: '0123456789', spans };
  setTextContent(layer, '0123456789 more');
  expect(styleAt(layer.spans, 1).color).toBe('#ff0000');
  expect(styleAt(layer.spans, 5).color).toBe('#0000ff');
  expect(styleAt(layer.spans, 14).color).toBe('#0000ff');   // tail inherits the last style
  expect(layer.spans[layer.spans.length - 1].end).toBe(15);
});

test('applyStyleToRange clamps the range and ignores empty ranges', () => {
  const spans = normalizeSpans([{ start: 0, end: 5, style: style() }], 5);
  expect(applyStyleToRange(spans, 4, 4, { color: '#ff0000' }, 5)).toEqual(spans);
  const out = applyStyleToRange(spans, -5, 99, { fontSize: 120 }, 5);
  expect(out.length).toBe(1);
  expect(out[0].style.fontSize).toBe(120);
});
