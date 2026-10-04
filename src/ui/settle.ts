/*
 * The one choke point every action goes through after it changes anything.
 *
 * `retireStale()` only does its job when something calls it, and for a while
 * nothing called it after locking or signing. The cost was measured on the built
 * page: re-locking a different note left the previous OPENED verdict standing,
 * green, with the OLD note quoted directly beneath a NEW locked block. That is
 * the worst form of this defect, because a stale result that still reads as a
 * result is indistinguishable from evidence about what is currently on screen.
 *
 * Rather than remember to call three functions in the right order at the end of
 * every handler, every handler calls this. A new action added later gets the
 * invalidation and the gating for free, and cannot forget them — which is the
 * only kind of fix that survives the next edit.
 */
import { applyGates } from './gates';
import { retireStale } from './verdict';
import { refreshNextSteps } from './nextStep';

export function settled(): void {
  retireStale();
  applyGates();
  refreshNextSteps();
}
