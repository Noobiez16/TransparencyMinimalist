import { $, icons } from './dom';
import { applyTransform, cancelTransform, getTransformSession } from './engine/transform-session';

type DeferredAction = () => void | Promise<void>;

let pendingAction: DeferredAction | null = null;
let initialized = false;

function host(): HTMLElement { return $('transform-session-guard'); }

function resolveTransformSession(apply: boolean): void {
  const action = pendingAction;
  pendingAction = null;
  host().hidden = true;
  if (apply) applyTransform();
  else cancelTransform();
  if (action) void action();
}

export function initTransformSessionGuard(): void {
  if (initialized) return;
  initialized = true;
  const applyButton = $<HTMLButtonElement>('transform-session-apply');
  const cancelButton = $<HTMLButtonElement>('transform-session-cancel');
  applyButton.innerHTML = `${icons.apply}<span>Apply</span>`;
  cancelButton.innerHTML = `${icons.cancel}<span>Cancel</span>`;
  applyButton.addEventListener('click', () => resolveTransformSession(true));
  cancelButton.addEventListener('click', () => resolveTransformSession(false));
  host().addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); resolveTransformSession(true); }
    if (event.key === 'Escape') { event.preventDefault(); resolveTransformSession(false); }
  });
}

export function isTransformSessionGuardOpen(): boolean { return pendingAction !== null; }

export function guardTransformSession(action: DeferredAction): boolean {
  if (pendingAction) return false;
  const session = getTransformSession();
  if (!session || session.mode !== 'explicit') {
    void action();
    return true;
  }
  pendingAction = action;
  host().hidden = false;
  $<HTMLButtonElement>('transform-session-apply').focus();
  return false;
}
