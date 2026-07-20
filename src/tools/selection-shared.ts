import { toast } from '../toast';
import { commitSelection } from '../engine/selection';
import { isEditingSessionLive } from '../engine/session-status';
import type { SelectionMode, SelectionShape } from '../engine/selection-ops';
import type { ToolOption } from '../engine/tools';

let baseMode: SelectionMode = 'new';

export function setBaseMode(mode: SelectionMode): void { baseMode = mode; }

/** Modifiers temporarily override the options-bar mode (Photoshop behaviour). */
export function effectiveMode(e: { shiftKey?: boolean; altKey?: boolean }): SelectionMode {
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return baseMode;
}

export function selectionBlocked(): boolean {
  if (!isEditingSessionLive()) return false;
  toast('Finish the current session before selecting.');
  return true;
}

export function commitShape(shape: SelectionShape, mode: SelectionMode, label: string): void {
  commitSelection({ kind: 'shape', shape, mode }, label);
}

export function modeOption(key: string): ToolOption {
  return {
    key, label: 'Mode', kind: 'select', group: 'selection',
    choices: ['New', 'Add', 'Subtract', 'Intersect'],
    get: () => baseMode.charAt(0).toUpperCase() + baseMode.slice(1),
    set: (value: string) => { setBaseMode(value.toLowerCase() as SelectionMode); }
  };
}
