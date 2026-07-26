import { beforeEach, expect, test } from 'vitest';
import {
  __resetTypeConfigForTest, getTypeAlign, getTypeStyle, setTypeAlign, setTypeStyle
} from '../src/tools/type-config';

beforeEach(() => __resetTypeConfigForTest());

test('defaults match the default text style', () => {
  expect(getTypeStyle().fontFamily).toBe('Inter');
  expect(getTypeStyle().fontSize).toBe(64);
  expect(getTypeAlign()).toBe('center');
});

test('patches merge and clamp', () => {
  setTypeStyle({ fontSize: 9999 });
  expect(getTypeStyle().fontSize).toBe(512);
  setTypeStyle({ tracking: -900 });
  expect(getTypeStyle().tracking).toBe(-100);
  setTypeStyle({ fontFamily: 'serif' });
  expect(getTypeStyle().fontFamily).toBe('serif');
  expect(getTypeStyle().fontSize).toBe(512);      // earlier patch survives
});

test('alignment round-trips', () => {
  setTypeAlign('right');
  expect(getTypeAlign()).toBe('right');
});
