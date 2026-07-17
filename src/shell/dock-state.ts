export interface PanelDef {
  id: string;
  title: string;
  stack: 1 | 2 | 3;
  order: number;
  fkey?: string;
  /** Roadmap phase for a not-yet-implemented panel — renders as a grayed tab. */
  phase?: 'B' | 'C' | 'D' | 'E' | 'F';
}

export function createDockState() {
  const panels = new Map<string, PanelDef>();
  const active = new Map<1 | 2 | 3, string>();
  const collapsed = new Set<1 | 2 | 3>();
  let dockHidden = false;
  const listeners: Array<() => void> = [];

  const emit = () => listeners.forEach((fn) => fn());

  function panelsInStack(stack: 1 | 2 | 3): PanelDef[] {
    return [...panels.values()].filter((p) => p.stack === stack).sort((a, b) => a.order - b.order);
  }

  function firstReal(stack: 1 | 2 | 3): string | null {
    return panelsInStack(stack).find((p) => !p.phase)?.id ?? null;
  }

  return {
    addPanel(def: PanelDef): void {
      if (panels.has(def.id)) throw new Error(`Panel already registered: ${def.id}`);
      panels.set(def.id, def);
      if (!def.phase && !active.has(def.stack)) active.set(def.stack, def.id);
    },
    panelsInStack,
    activePanel(stack: 1 | 2 | 3): string | null {
      return active.get(stack) ?? null;
    },
    activate(id: string): void {
      const def = panels.get(id);
      if (!def || def.phase) return;
      active.set(def.stack, id);
      emit();
    },
    isCollapsed(stack: 1 | 2 | 3): boolean {
      return collapsed.has(stack);
    },
    toggleCollapsed(stack: 1 | 2 | 3): void {
      if (collapsed.has(stack)) collapsed.delete(stack);
      else collapsed.add(stack);
      emit();
    },
    isDockHidden(): boolean {
      return dockHidden;
    },
    setDockHidden(hidden: boolean): void {
      dockHidden = hidden;
      emit();
    },
    reset(): void {
      collapsed.clear();
      dockHidden = false;
      ([1, 2, 3] as const).forEach((stack) => {
        const first = firstReal(stack);
        if (first) active.set(stack, first);
      });
      emit();
    },
    onChange(fn: () => void): void {
      listeners.push(fn);
    }
  };
}
