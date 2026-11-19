import type { DatabaseSync } from 'node:sqlite';
import {
  createFixedCommitCapture,
  useFixedCommitCapture,
} from '../../application/dist/fixed-commit-source.js';

import type { HistoryReadLimits } from '../../storage/dist/analysis/activation-history-format.js';
import { installCommitSourceCapture } from '../../storage/dist/source-state/commit-capture.js';

// Internal composition. The trusted embedding supplies the existing RAW grant owner.
// Storage never takes a verifier or a root/manifest from the public request.
export async function prepareFixedCommitAnalysis(
  db: DatabaseSync,
  owner: Parameters<typeof createFixedCommitCapture>[0],
  paths: readonly string[],
  account: Parameters<ReturnType<typeof createFixedCommitCapture>>[1],
  limits: HistoryReadLimits,
) {
  const handle = await createFixedCommitCapture(owner)(paths, account);
  const recheck = () => useFixedCommitCapture(handle, () => undefined);
  return useFixedCommitCapture(handle, (manifest) =>
    installCommitSourceCapture(db, manifest, limits, recheck),
  );
}
