export interface CommandDef {
  id: string;
  label: string;
  shortcut?: string;
  /** True when the global shortcut dispatcher should bind `shortcut`. Commands whose
   *  keys are already handled elsewhere (Ctrl+Z/T in main.ts) leave this unset and
   *  show the shortcut as display text only. */
  bindKey?: boolean;
  /** Renders a check prefix in menus when it returns true (e.g. View > Snap To). */
  checked?: () => boolean;
  /** When set, the menu bar renders this command's button with the given DOM id so
   *  existing modules (topbar/export/history wiring) can attach their listeners. */
  legacyId?: string;
  enabled?: () => boolean;
  run?: () => void;
  /** Roadmap phase for a not-yet-implemented command. A def with `phase` and no
   *  `run` is a permanent grayed stub. */
  phase?: 'B' | 'C' | 'D' | 'E' | 'F';
}

const commands = new Map<string, CommandDef>();

export function registerCommand(def: CommandDef): void {
  if (commands.has(def.id)) throw new Error(`Command already registered: ${def.id}`);
  commands.set(def.id, def);
}

export function getCommand(id: string): CommandDef | undefined {
  return commands.get(id);
}

export function isCommandEnabled(id: string): boolean {
  const def = commands.get(id);
  if (!def) return false;
  if (!def.run && !def.legacyId) return false;
  if (def.enabled && !def.enabled()) return false;
  return true;
}

export function runCommand(id: string): boolean {
  const def = commands.get(id);
  if (!def || !def.run || !isCommandEnabled(id)) return false;
  def.run();
  return true;
}

export function __resetCommandsForTest(): void {
  commands.clear();
}
