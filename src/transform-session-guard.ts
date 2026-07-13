import { $, icons } from './dom';
import {
  applyTransform,
  cancelTransform,
  getTransformSession,
  hasActiveTransformGesture,
  interruptGesture
} from './engine/transform-session';

type DeferredAction = () => void | Promise<void>;

let pendingAction: DeferredAction | null = null;
let initialized = false;
let previousFocus: HTMLElement | null = null;
let inertedElements: HTMLElement[] = [];

function host(): HTMLElement { return $('transform-session-guard'); }

export function isInteractiveTarget(target: Element | null): boolean {
  if (!target) return false;
  return (target as HTMLElement).isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
}

export function getGuardKeyboardResolution(key: string, target: Element | null): 'apply' | 'cancel' | null {
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && !isInteractiveTarget(target)) return 'apply';
  return null;
}

function setBackgroundInert(inert: boolean): void {
  if (inert) {
    inertedElements = Array.from(document.body.children).filter((child): child is HTMLElement =>
      child instanceof HTMLElement && child !== host() && !child.inert
    );
    inertedElements.forEach((element) => { element.inert = true; });
  } else {
    inertedElements.forEach((element) => { element.inert = false; });
    inertedElements = [];
  }
}

function resolveTransformSession(apply: boolean): void {
  const action = pendingAction;
  pendingAction = null;
  host().hidden = true;
  if (apply) applyTransform();
  else cancelTransform();
  setBackgroundInert(false);
  const restoreFocus = previousFocus;
  previousFocus = null;
  if (restoreFocus?.isConnected) restoreFocus.focus();
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
    if (event.key === 'Tab') {
      const buttons = Array.from(host().querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    const resolution = getGuardKeyboardResolution(event.key, event.target as Element | null);
    if (resolution) { event.preventDefault(); resolveTransformSession(resolution === 'apply'); }
  });
}

export function isTransformSessionGuardOpen(): boolean { return pendingAction !== null; }

export function guardTransformSession(action: DeferredAction): boolean {
  if (pendingAction) return false;
  const session = getTransformSession();
  if (!session || session.mode !== 'explicit') {
    // A direct-mode session only exists while a pointer gesture is live.
    // End it (restoring the pre-drag transform) before the action runs so a
    // tool switch can never leave two editing sessions active at once.
    if (session && hasActiveTransformGesture()) interruptGesture();
    void action();
    return true;
  }
  pendingAction = action;
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setBackgroundInert(true);
  host().hidden = false;
  $<HTMLButtonElement>('transform-session-apply').focus();
  return false;
}
