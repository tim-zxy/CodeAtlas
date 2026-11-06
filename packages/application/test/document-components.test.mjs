import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setup, makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import { openR010FixtureDatabase } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { loadMigrationPlan } from '../../storage/dist/migrations/manifest.js';
import { applyMigrationPlan } from '../../storage/dist/migrations/runner.js';
import { DocumentStore } from '../../storage/dist/documents/document-store.js';
import { assembleDocumentDraft } from '../../documents/dist/document-draft.js';
import prepareSource from '../dist/mixed-source-workflow.js';
import { authorizeOperation } from '../dist/operation-policy.js';
const vector = JSON.parse(
  await fs.readFile(
    new URL('../../documents/test/fixtures/source-draft.json', import.meta.url),
    'utf8',
  ),
);
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2000000,
  maxItems: 200000,
  maxDepth: 80,
  memoryBudgetBytes: 20000000,
};
// Component integration with literal IR and trusted test checks. NOT an actual parser,
// secret-scan, Document publication workflow or immutable CompilationInputSnapshot.
test('offline selected Source to literal Draft and SQLite Store preserves raw binding and last-good', async (t) => {
  const f = await setup(t);
  await fs.writeFile(path.join(f.root, 'note.md'), vector.source);
  const repository = await openR010FixtureDatabase(
    path.join(f.root, 'source.sqlite'),
    'repo:a2',
    f.root,
  );
  f.state.closeOwnedDatabase = () => repository.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const shared = makeAccount(f.control.signal);
  const policy = {
    operation: 'INDEX',
    phase: 'PRIMARY',
    scope: { workspaceId: 'workspace:a2', repositoryId: 'repo:a2' },
    callerCapabilities: ['INDEX', 'READ_SOURCE'],
    permissionContext: {
      workspaceId: 'workspace:a2',
      repositoryIds: ['repo:a2'],
      allowedOperations: ['INDEX', 'READ_SOURCE'],
    },
    source: {
      path: null,
      classification: 'INTERNAL',
      form: 'DERIVED',
      secretDetected: false,
      policyBlocked: false,
      derivedAccessAllowed: true,
    },
    destination: 'LOCAL',
    settings: {
      localOnly: true,
      remoteLlmEnabled: false,
      remoteEmbeddingEnabled: false,
      allowRemoteFallback: false,
      allowSensitiveRemote: false,
      allowRawSourceRemote: false,
    },
  };
  const prepared = await prepareSource({
    request: f.request,
    policy,
    account: shared.account,
    control: f.control,
    sourceState: repository.sourceState,
  });
  const raw = await prepared.readDocumentBytes('note.md');
  const envelope = structuredClone(vector.envelope);
  Object.assign(envelope.payload.document, {
    workspaceId: 'workspace:a2',
    repositoryId: 'repo:a2',
    logicalPath: 'note.md',
  });
  envelope.payload.revision.sourceBasis = {
    documentId: envelope.payload.document.id,
    documentRevisionId: envelope.payload.revision.id,
    contentFingerprint: vector.fingerprint,
  };
  const draft = assembleDocumentDraft(raw.bytes, envelope, shared.account);
  await prepared.verifySelection();
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON');
  applyMigrationPlan(
    db,
    await loadMigrationPlan(
      new URL('../../storage/migrations/workspace/manifest.json', import.meta.url),
      'WORKSPACE',
    ),
  );
  db.prepare('INSERT INTO workspace VALUES(1,?,?)').run('workspace:a2', f.root);
  db.prepare('INSERT INTO repositories VALUES(?,?,?)').run('repo:a2', 'workspace:a2', f.root);
  const store = new DocumentStore(db, 'workspace:a2');
  const receipt = store.applyDocuments(
    { bundle: draft, expectedCurrentRevisionId: null },
    limits,
    () => {
      shared.account.checkpoint();
      assert.deepEqual(repository.sourceState.load('repo:a2'), prepared.state);
      assert.equal(
        authorizeOperation({
          ...policy,
          operation: 'READ_SOURCE',
          source: { ...policy.source, path: 'note.md', form: 'RAW' },
        }).allowed,
        true,
      );
    },
  );
  assert.equal(receipt.status, 'COMMITTED');
  const current = store.readCurrent('doc:one', limits);
  assert.equal(current.bundle.payload.revision.sourceFingerprint, raw.contentFingerprint);
  assert.deepEqual(current.bundle.payload.blocks, draft.payload.blocks);
  assert.equal(db.prepare('SELECT count(*) n FROM claims').get().n, 0);
  raw.bytes.fill(0);
  assert.throws(() => assembleDocumentDraft(raw.bytes, envelope, makeAccount().account), {
    code: 'DOCUMENT_SOURCE_MISMATCH',
  });
  assert.equal(store.readCurrent('doc:one', limits).revisionId, receipt.revisionId);
  assert.equal(db.prepare('SELECT count(*) n FROM document_revisions').get().n, 1);
});
