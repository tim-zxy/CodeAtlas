import type { DatabaseSync } from 'node:sqlite';
import type { NativeClientOptions } from '../../providers/dist/index.js';
import {
  prepareNativeRefreshAnalysisV3,
  type NativeRefreshInvocationV3,
} from './native-refresh-preparation.js';
import { applyPreparedNativeRefreshAnalysisV3 } from './native-refresh-workspace.js';
import { applyObservedNativeRefreshComposition } from './native-refresh-composition-observation.js';

/** Internal production entry; admission precedes opener, SQL, stage and spawn. */
export async function applyNativeRefreshAnalysisV3(
  database: DatabaseSync,
  memoryBudgetBytes: number,
  openContext: () => NativeRefreshInvocationV3,
  options: NativeClientOptions,
) {
  const prepared = prepareNativeRefreshAnalysisV3(
    database,
    memoryBudgetBytes,
    openContext,
    options,
  );
  return applyObservedNativeRefreshComposition(prepared, () =>
    applyPreparedNativeRefreshAnalysisV3(database, prepared, options),
  );
}
