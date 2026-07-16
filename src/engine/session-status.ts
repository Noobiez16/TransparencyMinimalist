import { getTransformSession } from './transform-session';
import { getCropSession } from './crop-session';
import { isTransformSessionGuardOpen } from '../transform-session-guard';

/**
 * True while any editing session (or its unresolved exit guard) is live.
 * History must stay frozen in this state: a mid-session jump would desync
 * cached snap candidates and silently abandon the user's in-progress edit.
 */
export function isEditingSessionLive(): boolean {
  return Boolean(getTransformSession()) || Boolean(getCropSession()) || isTransformSessionGuardOpen();
}
