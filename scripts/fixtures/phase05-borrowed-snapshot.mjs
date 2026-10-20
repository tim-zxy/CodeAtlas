import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mock } from 'node:test';
import * as admission from '../../packages/runtime/dist/native-metadata-admission.js';
import * as rows from '../../packages/storage/dist/analysis/evaluation-state.js';
import { openRepositoryIndexSession } from '../../packages/storage/dist/index.js';

// Branch/transaction unit control ONLY. No admitted Native read or qualified
// graph is produced: the row boundary throws before any Native state is decoded.
const mode = process.argv[2];
assert.ok(['published', 'retained'].includes(mode));
const root = await realpath(process.argv[3]);
const databasePath = path.join(root, 'repository.sqlite');
const session = await openRepositoryIndexSession(
  { databasePath, repositoryId: 'repo', repositoryRoot: root, initialize: true, readOnly: false },
  { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
);
session.close();

let reached = false;
const boundary = new Error('unit row boundary reached');
mock.module(new URL('../../packages/runtime/dist/native-metadata-admission.js', import.meta.url), {
  exports: { ...admission, assertNativeMetadataAdmission() {} },
});
const rejectRows = async (db) => {
  assert.equal(db.isTransaction, true, 'real binding snapshot must still be active');
  reached = true;
  throw boundary;
};
mock.module(new URL('../../packages/storage/dist/analysis/evaluation-state.js', import.meta.url), {
  exports: {
    ...rows,
    readEvaluationStateRows: rejectRows,
    readEvaluationRetainedStateRows: rejectRows,
  },
});
const starts = [],
  original = DatabaseSync.prototype.exec;
mock.method(DatabaseSync.prototype, 'exec', function (sql, ...args) {
  if (sql === 'BEGIN') starts.push(this.isTransaction);
  return Reflect.apply(original, this, [sql, ...args]);
});
const helper = await import('../helpers/phase05-evaluation-fixture.mjs');
const expected = {
  repositoryId: 'repo',
  revisionId: 'worktree',
  contentFingerprint: 'old',
  providerId: 'native',
  providerVersion: '1',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '1',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '2',
  policyFingerprint: 'policy',
  requestedCapabilities: ['SYMBOL'],
};
const limits = { maxSerializedBytes: 1000000, memoryBudgetBytes: 16 * 1024 * 1024 };
const input = {
  databasePath,
  repositoryRoot: root,
  repositoryId: 'repo',
  budget: { maxMetadataRows: 5000, maxResultBytes: 1000000, timeoutMs: 10000 },
};
const operation =
  mode === 'published'
    ? () => helper.readPhase05PublishedState({ ...input, native: { expected, limits } })
    : () =>
        helper.readPhase05RetainedPublication({
          ...input,
          binding: {
            expected,
            limits,
            snapshotId: 'snapshot',
            sourceFiles: [],
            token: {
              committedSnapshotCount: 1,
              indexedRevisionId: 'worktree',
              indexedContentFingerprint: 'old',
              states: [
                { providerId: 'native', snapshotId: 'snapshot', summaryDigest: '0'.repeat(64) },
              ],
            },
          },
        });
await assert.rejects(operation);
assert.deepEqual(starts, [false], 'only the real session owner starts the read snapshot');
assert.equal(
  reached,
  true,
  'borrowed snapshot must reach the selected row boundary without nested BEGIN',
);
process.stdout.write(JSON.stringify({ mode, rowBoundaryReached: true, qualified: false }) + '\n');
