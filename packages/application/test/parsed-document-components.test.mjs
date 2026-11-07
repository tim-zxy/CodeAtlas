import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setup, makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import { openR010FixtureDatabase } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { loadMigrationPlan } from '../../storage/dist/migrations/manifest.js';
import { applyMigrationPlan } from '../../storage/dist/migrations/runner.js';
import { DocumentStore } from '../../storage/dist/documents/document-store.js';
import prepareSource from '../dist/mixed-source-workflow.js';
import { assembleDocumentDraft } from '../../documents/dist/document-draft.js';
const api = await import('../dist/document-write-preflight.js');
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
function policy() {
  return {
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
}
// Genuine Source implementation, filesystem and two owned SQLite DBs. Git and
// initial policy are explicit offline substitutes; no production authority claim.
async function base(t, text) {
  const f = await setup(t);
  await fs.writeFile(path.join(f.root, 'note.md'), text);
  const source = await openR010FixtureDatabase(
    path.join(f.root, 'source.sqlite'),
    'repo:a2',
    f.root,
  );
  f.state.closeOwnedDatabase = () => source.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const shared = makeAccount(f.control.signal);
  const prepared = await prepareSource({
    request: f.request,
    policy: policy(),
    account: shared.account,
    control: f.control,
    sourceState: source.sourceState,
  });
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => db.close());
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
  const old = structuredClone(vector.envelope);
  Object.assign(old.payload.document, {
    workspaceId: 'workspace:a2',
    repositoryId: 'repo:a2',
    logicalPath: 'note.md',
  });
  old.payload.revision.sourceBasis = {
    documentId: old.payload.document.id,
    documentRevisionId: old.payload.revision.id,
    contentFingerprint: vector.fingerprint,
  };
  // Seed last-good through the original validated Store, never raw SQL snapshots.
  store.applyDocuments(
    {
      bundle: assembleDocumentDraft(Buffer.from(vector.source), old, shared.account),
      expectedCurrentRevisionId: null,
    },
    limits,
    () => undefined,
  );
  const before = store.readCurrent(old.payload.document.id, limits);
  const rawHash = 'sha256:' + createHash('sha256').update(text).digest('hex');
  const revision = {
    id: 'revision:next',
    documentId: old.payload.document.id,
    sourceFingerprint: rawHash,
    policyVersion: old.payload.revision.policyVersion,
    sourceBasis: {
      documentId: old.payload.document.id,
      documentRevisionId: 'revision:next',
      contentFingerprint: rawHash,
    },
  };
  const allocated = [];
  let reads = 0,
    checks = 0;
  const input = {
    source: {
      observation: prepared.observation,
      effects: prepared.effects,
      readDocumentBytes: async (...args) => {
        reads++;
        return prepared.readDocumentBytes(...args);
      },
      verifySelection: async () => {
        checks++;
        await prepared.verifySelection();
      },
    },
    path: 'note.md',
    metadata: {
      document: old.payload.document,
      revision,
      allocateId: (kind) => {
        allocated.push(kind);
        return `new:${kind}:${allocated.length}`;
      },
    },
    account: shared.account,
  };
  return {
    ...f,
    source,
    db,
    store,
    before,
    input,
    allocated,
    get reads() {
      return reads;
    },
    get checks() {
      return checks;
    },
    assertLastGood() {
      assert.deepEqual(store.readCurrent(old.payload.document.id, limits), before);
      assert.equal(db.prepare('SELECT count(*) n FROM claims').get().n, 0);
    },
  };
}
for (const [kind, text, reason] of [
  [
    'complete',
    '\ufeff# Heading\r\n\r\n中文😀\r\n\r\n```js\r\nthrow new Error("must not execute");\r\n```\r\n',
    'SECRET_COVERAGE_INCOMPLETE',
  ],
  ['secret', '# Heading\n\npassword=synthetic-private-only\n', 'SECRET_DETECTED'],
  ['partial', '# Heading\n\n| A | B |\n| --- | --- |\n| short |\n', 'SECRET_COVERAGE_INCOMPLETE'],
])
  test(
    'actual Source bytes to pinned AST to deny-only preflight preserves last-good ' + kind,
    async (t) => {
      const f = await base(t, text);
      assert.equal(typeof api.checkParsedDocumentWrite, 'function');
      const result = await api.checkParsedDocumentWrite(f.input);
      assert.equal(result.status, 'NOT_COMMITTED');
      assert.equal(result.reason, reason);
      assert.equal(result.scan.clearance, false);
      assert.equal(f.reads, 1);
      assert.equal(f.checks, 1);
      assert.ok(f.allocated.includes('DOCUMENT_BLOCK'));
      assert.equal('draft' in result || 'bytes' in result, false);
      assert.equal(JSON.stringify(result).includes('synthetic-private-only'), false);
      assert.deepEqual(result.sourceEffects, f.input.source.effects);
      f.assertLastGood();
    },
  );
test('parser allocator Source movement is caught by original final verification without document writes', async (t) => {
  const f = await base(t, '# Original\n');
  const allocate = f.input.metadata.allocateId;
  let changed = false;
  f.input.metadata.allocateId = (kind) => {
    if (!changed) {
      changed = true;
      writeFileSync(path.join(f.root, 'note.md'), '# Changed\n');
    }
    return allocate(kind);
  };
  await assert.rejects(api.checkParsedDocumentWrite(f.input), { code: 'SOURCE_CHANGED' });
  assert.equal(f.reads, 1);
  f.assertLastGood();
});
test('parsed metadata mismatch refuses before Source body read and retains existing document head', async (t) => {
  const f = await base(t, '# Original\n');
  f.input.metadata.document.logicalPath = 'different.md';
  await assert.rejects(api.checkParsedDocumentWrite(f.input), { code: 'INVALID_DOCUMENT_INPUT' });
  assert.equal(f.reads, 0);
  f.assertLastGood();
});
