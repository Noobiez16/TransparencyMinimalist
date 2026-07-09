export interface Command {
  label: string;
  do(): void;
  undo(): void;
  coalesceKey?: string;
  bytes?: number;
}

const MAX_ENTRIES = 50;
const MAX_BYTES = 150 * 1024 * 1024;
const COALESCE_MS = 800;

let stack: Command[] = [];
let index = -1;                 // last DONE entry
let lastPushAt = 0;
let savedAt = -1;               // cursor position at last save/load
const listeners: Array<() => void> = [];

function emit(): void { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error('history listener failed', e); } }); }

function totalBytes(): number { return stack.reduce((sum, c) => sum + (c.bytes ?? 0), 0); }

function trim(): void {
  while (stack.length > MAX_ENTRIES || (totalBytes() > MAX_BYTES && stack.length > 1)) {
    stack.shift();
    index--;
    if (savedAt >= 0) savedAt--;
    else savedAt = -2;              // pristine/unreachable save point is now permanently unreachable
  }
}

export function push(cmd: Command): void {
  cmd.do();
  const now = Date.now();
  const top = stack[index];
  if (
    cmd.coalesceKey && top && top.coalesceKey === cmd.coalesceKey &&
    index === stack.length - 1 && now - lastPushAt <= COALESCE_MS
  ) {
    // Replace top: keep the ORIGINAL undo (gesture start), adopt the new do/label
    stack[index] = { label: cmd.label, do: cmd.do, undo: top.undo, coalesceKey: cmd.coalesceKey, bytes: cmd.bytes };
  } else {
    stack.splice(index + 1);    // truncate redo tail
    if (savedAt > index) savedAt = -2; // saved state no longer reachable
    stack.push(cmd);
    index = stack.length - 1;
    trim();
  }
  lastPushAt = now;
  emit();
}

export function undo(): void { if (index >= 0) { stack[index].undo(); index--; emit(); } }
export function redo(): void { if (index < stack.length - 1) { index++; stack[index].do(); emit(); } }
export function jump(target: number): void {
  while (index > target) { stack[index].undo(); index--; }
  while (index < target) { index++; stack[index].do(); }
  emit();
}
export function canUndo(): boolean { return index >= 0; }
export function canRedo(): boolean { return index < stack.length - 1; }
export function entries(): ReadonlyArray<{ label: string }> { return stack.map((c) => ({ label: c.label })); }
export function cursor(): number { return index; }
export function clear(): void { stack = []; index = -1; savedAt = -1; lastPushAt = 0; emit(); }
export function onChange(fn: () => void): void { listeners.push(fn); }
export function markSaved(): void { savedAt = index; }
export function isDirty(): boolean { return savedAt !== index; }
