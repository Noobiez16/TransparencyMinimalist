import { beforeEach, expect, test } from 'vitest';
import { __resetPaintConfigForTest, getPaintSetting, nudgeSize, setPaintSetting } from '../src/tools/paint-config';

beforeEach(() => __resetPaintConfigForTest());

test('defaults per tool', () => {
  expect(getPaintSetting('brush', 'size')).toBe(24);
  expect(getPaintSetting('brush', 'hardness')).toBe(50);
  expect(getPaintSetting('brush', 'opacity')).toBe(100);
  expect(getPaintSetting('pencil', 'size')).toBe(4);
  expect(getPaintSetting('pencil', 'hardness')).toBe(100);
  expect(getPaintSetting('eraser', 'size')).toBe(32);
});

test('clamping and integer sizes', () => {
  setPaintSetting('brush', 'size', 9999);
  expect(getPaintSetting('brush', 'size')).toBe(500);
  setPaintSetting('brush', 'size', 0);
  expect(getPaintSetting('brush', 'size')).toBe(1);
  setPaintSetting('brush', 'size', 12.7);
  expect(getPaintSetting('brush', 'size')).toBe(13);
  setPaintSetting('brush', 'hardness', 150);
  expect(getPaintSetting('brush', 'hardness')).toBe(100);
  setPaintSetting('brush', 'opacity', 0);
  expect(getPaintSetting('brush', 'opacity')).toBe(1);
});

test('pencil hardness stays pinned to 100', () => {
  setPaintSetting('pencil', 'hardness', 30);
  expect(getPaintSetting('pencil', 'hardness')).toBe(100);
});

test('nudge steps follow Photoshop bands', () => {
  setPaintSetting('brush', 'size', 5);
  nudgeSize('brush', 1);
  expect(getPaintSetting('brush', 'size')).toBe(6);
  setPaintSetting('brush', 'size', 20);
  nudgeSize('brush', 1);
  expect(getPaintSetting('brush', 'size')).toBe(25);
  setPaintSetting('brush', 'size', 60);
  nudgeSize('brush', -1);
  expect(getPaintSetting('brush', 'size')).toBe(50);
  setPaintSetting('brush', 'size', 1);
  nudgeSize('brush', -1);
  expect(getPaintSetting('brush', 'size')).toBe(1);
});
