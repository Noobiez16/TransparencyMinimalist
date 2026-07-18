import { registerCommand } from './commands';
import { getDockState } from './dock';
import { setToolbarColumns } from './toolbar';
import { isTypingTarget, isTransformSessionGuardOpen } from '../transform-session-guard';

export function resetWorkspace(): void {
  document.body.classList.remove('ws-hide-all', 'ws-hide-right');
  document.querySelector('.dashboard-wrapper')?.classList.remove('hide-left', 'hide-right');
  getDockState().reset();
  setToolbarColumns(false);
}

export function initWorkspace(): void {
  registerCommand({ id: 'workspace.reset', label: 'Workspace: Reset Essentials', run: () => resetWorkspace() });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (isTypingTarget(document.activeElement) || isTransformSessionGuardOpen()) return;
    e.preventDefault();
    // Tab hides all panels and toolbars; Shift+Tab hides only the right-side docks (manual §6.2).
    if (e.shiftKey) document.body.classList.toggle('ws-hide-right');
    else document.body.classList.toggle('ws-hide-all');
  });
}
