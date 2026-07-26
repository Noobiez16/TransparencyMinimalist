import { expect, test } from 'vitest';
import { ASCENT_RATIO, layoutText, type MeasureChar } from '../src/engine/text-layout';
import { defaultTextStyle, normalizeSpans, type StyleSpan, type TextStyle } from '../src/engine/text-model';

// Deterministic stub: every character is half the font size wide.
const measure: MeasureChar = (_char, style) => style.fontSize * 0.5;
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...defaultTextStyle(), ...patch });
const oneSpan = (text: string, patch: Partial<TextStyle> = {}): StyleSpan[] =>
  normalizeSpans([{ start: 0, end: text.length, style: style(patch) }], text.length);

test('empty text lays out to nothing', () => {
  const out = layoutText('', [], 'left', measure);
  expect(out.lines).toEqual([]);
  expect(out.width).toBe(0);
  expect(out.height).toBe(0);
});

test('a single line measures characters and sets one piece', () => {
  const text = 'abcd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10 }), 'left', measure);
  expect(out.lines.length).toBe(1);
  expect(out.lines[0].pieces.length).toBe(1);
  expect(out.lines[0].pieces[0].text).toBe('abcd');
  expect(out.lines[0].width).toBeCloseTo(4 * 5, 6);
  expect(out.width).toBeCloseTo(20, 6);
});

test('tracking adds advance per character', () => {
  const text = 'abcd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10, tracking: 3 }), 'left', measure);
  expect(out.lines[0].width).toBeCloseTo(4 * (5 + 3), 6);
});

test('newlines split lines and stack them by leading', () => {
  const text = 'ab\ncd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10, leading: 20 }), 'left', measure);
  expect(out.lines.length).toBe(2);
  expect(out.lines[0].top).toBe(0);
  expect(out.lines[1].top).toBeCloseTo(20, 6);
  expect(out.height).toBeCloseTo(40, 6);
});

test('a line height is the maximum leading among its runs', () => {
  const text = 'abcd';
  const spans = normalizeSpans([
    { start: 0, end: 2, style: style({ fontSize: 10, leading: 12 }) },
    { start: 2, end: 4, style: style({ fontSize: 40, leading: 50 }) }
  ], text.length);
  const out = layoutText(text, spans, 'left', measure);
  expect(out.lines.length).toBe(1);
  expect(out.lines[0].height).toBeCloseTo(50, 6);
  expect(out.lines[0].baseline).toBeCloseTo(ASCENT_RATIO * 40, 6);
  expect(out.lines[0].pieces.length).toBe(2);
  expect(out.lines[0].pieces[1].x).toBeCloseTo(2 * 5, 6);
});

test('alignment offsets each line within the block', () => {
  const text = 'ab\nabcd';
  const spans = oneSpan(text, { fontSize: 10 });
  const left = layoutText(text, spans, 'left', measure);
  expect(left.lines[0].pieces[0].x).toBeCloseTo(0, 6);
  expect(left.lines[1].pieces[0].x).toBeCloseTo(0, 6);

  const centered = layoutText(text, spans, 'center', measure);
  expect(centered.lines[0].pieces[0].x).toBeCloseTo(5, 6);
  expect(centered.lines[1].pieces[0].x).toBeCloseTo(0, 6);

  const right = layoutText(text, spans, 'right', measure);
  expect(right.lines[0].pieces[0].x).toBeCloseTo(10, 6);
  expect(right.lines[1].pieces[0].x).toBeCloseTo(0, 6);
});

test('a blank line still occupies its leading', () => {
  const text = 'a\n\nb';
  const out = layoutText(text, oneSpan(text, { fontSize: 10, leading: 20 }), 'left', measure);
  expect(out.lines.length).toBe(3);
  expect(out.lines[1].pieces).toEqual([]);
  expect(out.height).toBeCloseTo(60, 6);
});

test('pieces record their start index for later caret mapping', () => {
  const text = 'ab\ncd';
  const out = layoutText(text, oneSpan(text, { fontSize: 10 }), 'left', measure);
  expect(out.lines[0].pieces[0].start).toBe(0);
  expect(out.lines[1].pieces[0].start).toBe(3);
});
