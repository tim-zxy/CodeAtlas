// Explicitly invoked current-process identity verification; never part of pnpm test.
// Only test-owned in-memory SQLite metadata follows the one real OS lookup.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  acquireCurrentWindowsPrincipal,
  assertCurrentWindowsPrincipal,
  releaseCurrentWindowsPrincipal,
} from '../dist/windows-principal-owner.js';
import {
  createLocalCaptureOperation,
  localCapturePolicyVersions,
  authorizeLocalCaptureRead,
  assertLocalCaptureOperation,
  finishLocalCaptureOperation,
  closeLocalCaptureOperation,
} from '../dist/local-capture-operation.js';
import { HistoryReadBudget } from '../../storage/dist/analysis/activation-history-format.js';
import { ContractStore } from '../../storage/dist/runtime/contract-store.js';
import { loadMigrationPlan } from '../../storage/dist/migrations/manifest.js';
import { applyMigrationPlan } from '../../storage/dist/migrations/runner.js';
if (process.argv.length !== 3 || process.argv[2] !== '--current-process-only')
  throw Error('EXPLICIT_CURRENT_PROCESS_PROBE_REQUIRED');
const abort = new AbortController();
const control = {
  maxItems: 200000,
  maxDepth: 80,
  deadlineEpochMs: Date.now() + 30000,
  signal: abort.signal,
};
const security = {
  localOnly: true,
  remoteLlmEnabled: false,
  remoteEmbeddingEnabled: false,
  allowSensitiveRemote: false,
  allowRawSourceRemote: false,
};
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2000000,
  maxItems: 200000,
  maxDepth: 80,
  memoryBudgetBytes: 20000000,
};
let principal,
  db,
  operation,
  stage = 'principal-acquire';
try {
  principal = await acquireCurrentWindowsPrincipal(control, {
    maxInputBytes: 4 * 1024 * 1024,
    maxOutputBytes: 16 * 1024,
  });
  assertCurrentWindowsPrincipal(principal);
  assert.equal(Object.getPrototypeOf(principal), null);
  assert.throws(() => assertCurrentWindowsPrincipal(JSON.parse(JSON.stringify(principal))));
  stage = 'owned-memory-scope';
  db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const plan = await loadMigrationPlan(
    new URL('../../storage/migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  applyMigrationPlan(db, plan);
  db.exec(
    "INSERT INTO workspace VALUES(1,'ws:principal-probe','C:/test-owned-principal-probe'); INSERT INTO repositories VALUES('repo:principal-probe','ws:principal-probe','C:/test-owned-principal-probe/repo'); INSERT INTO revision_sets VALUES('set:principal-probe','ws:principal-probe',0,0)",
  );
  db.prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)').run(
    'set:principal-probe',
    'repo:principal-probe',
    'rev:principal-probe',
    'sha256:' + 'a'.repeat(64),
  );
  db.exec("UPDATE revision_sets SET frozen=1 WHERE id='set:principal-probe'");
  const request = {
    schemaVersion: 1,
    workspaceId: 'ws:principal-probe',
    scope: { kind: 'REPOSITORY', repositoryId: 'repo:principal-probe' },
    revisionSetId: 'set:principal-probe',
    repositoryIds: ['repo:principal-probe'],
    selectedEntityRefs: [
      {
        scope: 'REPOSITORY',
        repositoryId: 'repo:principal-probe',
        entity: {
          kind: 'SOURCE_FILE',
          id: 'file:principal-probe',
          revisionId: 'rev:principal-probe',
        },
      },
    ],
    selectedDocumentRevisions: [],
    policyVersions: localCapturePolicyVersions(security, control),
  };
  operation = createLocalCaptureOperation({
    principalHandle: principal,
    workspaceStore: new ContractStore(db, 'ws:principal-probe', []),
    security,
    callerCapabilities: ['QUERY', 'READ_SOURCE'],
    request,
    budget: new HistoryReadBudget(limits),
    control,
  }).handle;
  const source = {
    path: null,
    classification: 'INTERNAL',
    form: 'DERIVED',
    secretDetected: false,
    policyBlocked: false,
    derivedAccessAllowed: true,
  };
  authorizeLocalCaptureRead(operation, {
    operation: 'QUERY',
    repositoryId: 'repo:principal-probe',
    source,
  });
  assert.throws(() =>
    authorizeLocalCaptureRead(operation, {
      operation: 'INDEX',
      repositoryId: 'repo:principal-probe',
      source,
    }),
  );
  assert.throws(() =>
    authorizeLocalCaptureRead(operation, {
      operation: 'READ_SOURCE',
      repositoryId: 'repo:principal-probe',
      source: { ...source, path: '.env', form: 'RAW' },
    }),
  );
  finishLocalCaptureOperation(operation);
  closeLocalCaptureOperation(operation);
  assert.throws(() => assertLocalCaptureOperation(operation));
  releaseCurrentWindowsPrincipal(principal);
  assert.throws(() => assertCurrentWindowsPrincipal(principal));
  console.log(
    JSON.stringify({
      kind: 'CURRENT_PROCESS_LOCAL_PRINCIPAL_PROBE',
      identityLookups: 1,
      opaquePrincipal: true,
      replyDtoRejected: true,
      scopeFacts: 'TEST_OWNED_MEMORY_METADATA_ONLY',
      fixedQueryReadSource: true,
      indexDenied: true,
      secretPathDenied: true,
      closedHandlesInvalid: true,
      userDatabasesOpened: 0,
      projectBodiesRead: 0,
      securitySettingsChanged: false,
      nativeQualification: false,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      kind: 'CURRENT_PROCESS_LOCAL_PRINCIPAL_PROBE',
      stage,
      success: false,
      code: error?.code ?? 'PROBE_FAILED',
      cleanupState: error?.cleanupState ?? 'SETTLED',
    }),
  );
  process.exitCode = 1;
} finally {
  if (operation) {
    try {
      closeLocalCaptureOperation(operation);
    } catch {}
  }
  if (db?.isOpen) db.close();
  if (principal) {
    try {
      releaseCurrentWindowsPrincipal(principal);
    } catch {}
  }
}
