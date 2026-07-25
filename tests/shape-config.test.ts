import { beforeEach, expect, test } from 'vitest';
import {
  __resetShapeConfigForTest, getShapeNumber, getShapeSetting, setShapeNumber, setShapeToggle
} from '../src/tools/shape-config';

beforeEach(() => __resetShapeConfigForTest());

test('defaults draw a filled, unstroked shape', () => {
  expect(getShapeSetting('fillOn')).toBe(true);
  expect(getShapeSetting('strokeOn')).toBe(false);
  expect(getShapeNumber('strokeWidth')).toBe(4);
  expect(getShapeNumber('radius')).toBe(0);
  expect(getShapeNumber('sides')).toBe(5);
});

test('numbers clamp to their documented ranges', () => {
  setShapeNumber('sides', 99);
  expect(getShapeNumber('sides')).toBe(24);
  setShapeNumber('sides', 1);
  expect(getShapeNumber('sides')).toBe(3);
  setShapeNumber('strokeWidth', 500);
  expect(getShapeNumber('strokeWidth')).toBe(100);
  setShapeNumber('radius', -20);
  expect(getShapeNumber('radius')).toBe(0);
});

test('toggles round-trip', () => {
  setShapeToggle('fillOn', false);
  setShapeToggle('strokeOn', true);
  expect(getShapeSetting('fillOn')).toBe(false);
  expect(getShapeSetting('strokeOn')).toBe(true);
});
