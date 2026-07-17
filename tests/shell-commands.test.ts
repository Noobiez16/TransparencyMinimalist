import { beforeEach, expect, test } from 'vitest';
import {
  __resetCommandsForTest,
  getCommand,
  isCommandEnabled,
  registerCommand,
  runCommand
} from '../src/shell/commands';

beforeEach(() => {
  __resetCommandsForTest();
});

test('registers and runs an enabled command', () => {
  let ran = 0;
  registerCommand({ id: 'test.run', label: 'Run', run: () => { ran++; } });
  expect(getCommand('test.run')?.label).toBe('Run');
  expect(isCommandEnabled('test.run')).toBe(true);
  expect(runCommand('test.run')).toBe(true);
  expect(ran).toBe(1);
});

test('duplicate ids throw at registration', () => {
  registerCommand({ id: 'dup', label: 'A', run: () => {} });
  expect(() => registerCommand({ id: 'dup', label: 'B', run: () => {} })).toThrow(/dup/);
});

test('phase stubs without run are permanently disabled and inert', () => {
  registerCommand({ id: 'stub.marquee', label: 'Rectangular Marquee', shortcut: 'M', phase: 'C' });
  expect(isCommandEnabled('stub.marquee')).toBe(false);
  expect(runCommand('stub.marquee')).toBe(false);
});

test('enabled() gates both reporting and running', () => {
  let on = false;
  let ran = 0;
  registerCommand({ id: 'gated', label: 'Gated', enabled: () => on, run: () => { ran++; } });
  expect(isCommandEnabled('gated')).toBe(false);
  expect(runCommand('gated')).toBe(false);
  on = true;
  expect(isCommandEnabled('gated')).toBe(true);
  expect(runCommand('gated')).toBe(true);
  expect(ran).toBe(1);
});

test('missing commands report disabled and refuse to run', () => {
  expect(isCommandEnabled('nope')).toBe(false);
  expect(runCommand('nope')).toBe(false);
});
