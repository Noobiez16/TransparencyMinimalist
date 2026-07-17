import { beforeEach, expect, test } from 'vitest';
import {
  getBackground,
  getForeground,
  resetColors,
  setBackground,
  setForeground,
  subscribeColors,
  swapColors
} from '../src/engine/color-state';

beforeEach(() => {
  resetColors();
});

test('defaults are black foreground over white background', () => {
  expect(getForeground()).toBe('#000000');
  expect(getBackground()).toBe('#ffffff');
});

test('set, swap, and reset drive both chips', () => {
  setForeground('#E5484D');
  setBackground('#30a46c');
  expect(getForeground()).toBe('#e5484d');
  expect(getBackground()).toBe('#30a46c');
  swapColors();
  expect(getForeground()).toBe('#30a46c');
  expect(getBackground()).toBe('#e5484d');
  resetColors();
  expect(getForeground()).toBe('#000000');
  expect(getBackground()).toBe('#ffffff');
});

test('invalid hex values are ignored', () => {
  setForeground('#12');
  setForeground('red');
  expect(getForeground()).toBe('#000000');
});

test('subscribers fire on every change', () => {
  let calls = 0;
  subscribeColors(() => { calls++; });
  setForeground('#123456');
  swapColors();
  resetColors();
  expect(calls).toBe(3);
});
