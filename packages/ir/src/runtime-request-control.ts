import { phase1Assert } from './phase1-support.js';
/** Explicit cooperative traversal controls. No profile, defaults or OS resource claim. */
export type RuntimeRequestControl = {
  maxItems: number;
  maxDepth: number;
  deadlineEpochMs: number;
  signal: AbortSignal;
};
export function assertRuntimeRequestControl(c: RuntimeRequestControl): void {
  phase1Assert(
    c &&
      Number.isSafeInteger(c.maxItems) &&
      c.maxItems > 0 &&
      Number.isSafeInteger(c.maxDepth) &&
      c.maxDepth >= 0 &&
      Number.isFinite(c.deadlineEpochMs) &&
      c.signal instanceof AbortSignal,
  );
}
export function runtimeStopReason(c: RuntimeRequestControl): 'CANCELLED' | 'DEADLINE' | null {
  return c.signal.aborted ? 'CANCELLED' : Date.now() >= c.deadlineEpochMs ? 'DEADLINE' : null;
}
