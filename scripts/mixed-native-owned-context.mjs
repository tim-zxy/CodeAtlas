// Private Storage readset adapter only. The genuine handle does not prove Application provenance.
import readMixedAnalysisCapture, {
  recheckActivationContext,
  releaseActivationContext,
} from '../packages/storage/dist/analysis/activation-history.js';
import { checkedHistoryLimits } from '../packages/storage/dist/analysis/activation-history-format.js';

export function bindMixedNativeOwnedContext(database, captureHandle, limits) {
  const fixedLimits = checkedHistoryLimits(limits);
  // Storage alone checks handle branding, same connection/incarnation, schema and readset.
  // It may invalidate a bad handle; ownership transfers here only after this read succeeds.
  const readset = readMixedAnalysisCapture(database, captureHandle, fixedLimits);
  let failed = false;
  let released = false;
  return Object.freeze({
    readset,
    recheck() {
      try {
        recheckActivationContext(database, captureHandle, fixedLimits);
      } catch (error) {
        failed = true;
        // Keep Storage error identity/category and any cleanup uncertainty unchanged.
        throw error;
      }
    },
    release() {
      if (released) return;
      try {
        releaseActivationContext(database, captureHandle);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        released = true;
      }
    },
    status() {
      return Object.freeze({
        status: failed ? 'FAILED' : released ? 'RELEASED' : 'STORAGE_READSET_BOUND',
        storageReadsetVerified: !failed && !released,
        // This describes the last validation, never continuous freshness. Recheck before use.
        readsetFreshness: 'RECHECK_REQUIRED',
        databaseStateVerified: false,
        databaseFileIdentityVerified: false,
        applicationOwnershipVerified: false,
        sourceHistoryAuthenticated: false,
        toolImagesAuthenticated: false,
        environmentAuthenticated: false,
        executionAuthorized: false,
        productionAdmission: false,
        measurementEligible: false,
      });
    },
  });
}
