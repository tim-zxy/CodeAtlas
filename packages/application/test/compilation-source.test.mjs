import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setup, makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import { openR010FixtureDatabase } from '../../storage/test/helpers/r011-history-fixture.mjs';
const api = await import('../dist/compilation-source.js').catch(() => ({}));
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
async function context(t, documentText) {
  const f = await setup(t);
  if (documentText !== undefined) await fs.writeFile(path.join(f.root, 'note.md'), documentText);
  const db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const account = makeAccount(f.control.signal).account;
  const prepared = await api.prepareCompilationSource({
    request: f.request,
    policy: policy(),
    sourceState: db.sourceState,
    account,
    control: f.control,
  });
  const state = db.sourceState.load('repo:a2');
  const identity = {
    rootPath: f.root,
    repoBasis: {
      repositoryId: state.revision.repositoryId,
      revisionId: state.revision.id,
      contentFingerprint: state.revision.contentFingerprint,
      codeActivationDigest: '0'.repeat(64),
    },
    targetSource: {
      repositoryId: state.revision.repositoryId,
      revisionId: state.revision.id,
      contentFingerprint: state.revision.contentFingerprint,
    },
    targetInventory: state.files,
  };
  return { ...f, db, prepared, identity };
}
async function documentInput(f, allocateId) {
  const vector = JSON.parse(
    await fs.readFile(
      new URL('../../documents/test/fixtures/source-draft.json', import.meta.url),
      'utf8',
    ),
  );
  const document = {
    ...vector.envelope.payload.document,
    workspaceId: 'workspace:a2',
    repositoryId: 'repo:a2',
    logicalPath: 'note.md',
    currentRevisionId: null,
  };
  const fingerprint = f.identity.targetInventory.find(
    (file) => file.path === 'note.md',
  ).contentFingerprint;
  let next = 0;
  return {
    path: 'note.md',
    metadata: {
      document,
      revision: {
        id: 'revision:owned',
        documentId: document.id,
        sourceFingerprint: fingerprint,
        policyVersion: 'policy:offline',
        sourceBasis: {
          documentId: document.id,
          documentRevisionId: 'revision:owned',
          contentFingerprint: fingerprint,
        },
      },
      allocateId: allocateId ?? ((kind) => `owned:${kind}:${++next}`),
    },
  };
}

test('owned selected-document preflight binds real Source bytes and always refuses commitment', async (t) => {
  const f = await context(t, '# Owned\n\npassword=synthetic-only\n');
  const before = f.db.sourceState.load('repo:a2');
  const result = await api.checkOwnedCompilationDocument(f.prepared.handle, await documentInput(f));
  assert.equal(result.status, 'NOT_COMMITTED');
  assert.equal(result.reason, 'SECRET_DETECTED');
  assert.equal(result.originalSource, 'SELECTED_DOCUMENT_ONLY');
  assert.equal(result.scan.clearance, false);
  assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  api.releaseCompilationSource(f.prepared.handle);
});

test('owned document preflight rejects copied handles and foreign workspace before Source reads', async (t) => {
  const f = await context(t, '# Owned\n');
  const input = await documentInput(f),
    calls = f.state.calls;
  await assert.rejects(api.checkOwnedCompilationDocument({}, input));
  input.metadata.document.workspaceId = 'foreign';
  await assert.rejects(api.checkOwnedCompilationDocument(f.prepared.handle, input));
  assert.equal(f.state.calls, calls);
  api.releaseCompilationSource(f.prepared.handle);
});

test('owned document consumption refuses if Source handle is released during mapping', async (t) => {
  const f = await context(t, '# Owned\n');
  let once = false;
  const input = await documentInput(f, () => {
    if (!once) {
      once = true;
      api.releaseCompilationSource(f.prepared.handle);
    }
    return 'section:closed';
  });
  await assert.rejects(api.checkOwnedCompilationDocument(f.prepared.handle, input));
  assert.equal(once, true);
});

test('owned clean document is still NOT_COMMITTED with incomplete scan coverage', async (t) => {
  const f = await context(t, '# Owned\n');
  const result = await api.checkOwnedCompilationDocument(f.prepared.handle, await documentInput(f));
  assert.equal(result.status, 'NOT_COMMITTED');
  assert.equal(result.reason, 'SECRET_COVERAGE_INCOMPLETE');
  assert.equal(result.scan.clearance, false);
  assert.equal(result.originalSource, 'SELECTED_DOCUMENT_ONLY');
  api.releaseCompilationSource(f.prepared.handle);
});

test('owned document bytes changed after preparation refuse without Source state writes', async (t) => {
  const f = await context(t, '# Owned\n');
  const input = await documentInput(f),
    before = f.db.sourceState.load('repo:a2');
  await fs.writeFile(path.join(f.root, 'note.md'), '# Changed\n');
  await assert.rejects(api.checkOwnedCompilationDocument(f.prepared.handle, input));
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  api.releaseCompilationSource(f.prepared.handle);
});
test('private genuine Source context API exists', () => {
  for (const name of [
    'prepareCompilationSource',
    'verifyCompilationSource',
    'releaseCompilationSource',
  ])
    assert.equal(typeof api[name], 'function');
});
test('genuine Source issuer and SQLite state verify through controlled Git substitute without further DB writes', async (t) => {
  const f = await context(t),
    before = f.db.sourceState.load('repo:a2');
  assert.equal(f.prepared.effects.sourceCommit, 'COMMITTED');
  assert.equal(
    'state' in f.prepared || 'observation' in f.prepared || 'permission' in f.prepared,
    false,
  );
  await api.verifyCompilationSource(f.prepared.handle, f.identity, 'workspace:a2');
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  api.releaseCompilationSource(f.prepared.handle);
  await assert.rejects(
    api.verifyCompilationSource(f.prepared.handle, f.identity, 'workspace:a2'),
    /SOURCE_CONTEXT_UNAVAILABLE/,
  );
  assert.throws(
    () => api.releaseCompilationSource(f.prepared.handle),
    /SOURCE_CONTEXT_UNAVAILABLE/,
  );
});
test('JSON clones, arbitrary tokens, foreign scope and mismatched SQL identity never authenticate Source', async (t) => {
  const f = await context(t);
  for (const handle of [{}, JSON.parse(JSON.stringify(f.prepared.handle))])
    await assert.rejects(
      api.verifyCompilationSource(handle, f.identity, 'workspace:a2'),
      /SOURCE_CONTEXT_UNAVAILABLE/,
    );
  await assert.rejects(
    api.verifyCompilationSource(f.prepared.handle, f.identity, 'foreign'),
    /SOURCE_CHANGED/,
  );
  api.releaseCompilationSource(f.prepared.handle);
});
test('same revision label with different fingerprint or inventory refuses before Git verification', async (t) => {
  for (const change of ['root', 'fingerprint', 'inventory']) {
    const f = await context(t),
      identity = structuredClone(f.identity),
      calls = f.state.calls;
    if (change === 'root') identity.rootPath += '-foreign';
    if (change === 'fingerprint')
      identity.targetSource.contentFingerprint = 'sha256:' + 'f'.repeat(64);
    if (change === 'inventory') identity.targetInventory[0].path += '-foreign';
    await assert.rejects(
      api.verifyCompilationSource(f.prepared.handle, identity, 'workspace:a2'),
      /SOURCE_CHANGED/,
    );
    assert.equal(f.state.calls, calls);
    api.releaseCompilationSource(f.prepared.handle);
  }
});
test('actual bytes changing under same WORKTREE identity are rejected and old SQL state retained', async (t) => {
  const f = await context(t),
    before = f.db.sourceState.load('repo:a2');
  await fs.writeFile(path.join(f.root, 'app.py'), 'pass\n');
  await assert.rejects(
    api.verifyCompilationSource(f.prepared.handle, f.identity, 'workspace:a2'),
    /SOURCE_CHANGED/,
  );
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  api.releaseCompilationSource(f.prepared.handle);
});
test('Source context verification cannot start after account cancellation', async (t) => {
  const f = await context(t);
  f.controller.abort();
  await assert.rejects(api.verifyCompilationSource(f.prepared.handle, f.identity, 'workspace:a2'));
  api.releaseCompilationSource(f.prepared.handle);
});
test('snapshot allocation failure after preparation retains actual committed Source effects', async (t) => {
  const f = await setup(t),
    db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const account = makeAccount().account;
  let committed = false;
  const own = account.own.bind(account);
  account.own = (value) => {
    if (committed && value && typeof value === 'object' && 'revision' in value && 'files' in value)
      throw Object.assign(new Error('private raw payload'), { code: 'STAGE_LIMIT_EXCEEDED' });
    own(value);
  };
  await assert.rejects(
    api.prepareCompilationSource({
      request: f.request,
      policy: policy(),
      account,
      control: f.control,
      sourceState: {
        load: (id) => db.sourceState.load(id),
        findCommitRevisionId: (id, commit) => db.sourceState.findCommitRevisionId(id, commit),
        replace(expected, next) {
          db.sourceState.replace(expected, next);
          committed = true;
        },
      },
    }),
    (e) =>
      e.effects?.sourceCommit === 'COMMITTED' &&
      e.code === 'STAGE_LIMIT_EXCEEDED' &&
      !e.message.includes('private'),
  );
  assert.ok(db.sourceState.load('repo:a2'));
});
test('releasing a Source owner during asynchronous verification prevents success', async (t) => {
  const f = await context(t);
  f.state.beforeReply = () => {
    f.state.beforeReply = null;
    api.releaseCompilationSource(f.prepared.handle);
  };
  await assert.rejects(
    api.verifyCompilationSource(f.prepared.handle, f.identity, 'workspace:a2'),
    /SOURCE_CONTEXT_UNAVAILABLE/,
  );
});
test('frozen typed primary plus account invalidation failure preserves effects and UNKNOWN', async (t) => {
  const f = await setup(t),
    db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  const account = makeAccount().account;
  let committed = false;
  const own = account.own.bind(account);
  const effects = Object.freeze({ sourceCommit: 'COMMITTED', sourceReconciled: true });
  const primary = Object.freeze(new api.CompilationSourceError('SOURCE_CHANGED', effects));
  account.own = (value) => {
    if (committed && value && typeof value === 'object' && 'revision' in value && 'files' in value)
      throw primary;
    own(value);
  };
  account.invalidate = () => {
    throw Error('private invalidation failure');
  };
  await assert.rejects(
    api.prepareCompilationSource({
      request: f.request,
      policy: policy(),
      account,
      control: f.control,
      sourceState: {
        load: (id) => db.sourceState.load(id),
        findCommitRevisionId: (id, commit) => db.sourceState.findCommitRevisionId(id, commit),
        replace(expected, next) {
          db.sourceState.replace(expected, next);
          committed = true;
        },
      },
    }),
    (e) =>
      e !== primary &&
      e.code === 'SOURCE_CHANGED' &&
      e.effects?.sourceCommit === 'COMMITTED' &&
      e.cleanupState === 'UNKNOWN',
  );
  assert.equal(Object.hasOwn(primary, 'cleanupState'), false);
});
