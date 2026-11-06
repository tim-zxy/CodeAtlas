import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  setup,
  makeAccount,
  expected,
} from '../../source/test/fixtures/mixed-source-git-double.mjs';
import { openR010FixtureDatabase } from '../../storage/test/helpers/r011-history-fixture.mjs';
let api;
try {
  api = (await import('../dist/mixed-source-workflow.js')).default;
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
export function policy(repositoryId = 'repo:a2') {
  return {
    operation: 'INDEX',
    phase: 'PRIMARY',
    scope: { workspaceId: 'workspace:a2', repositoryId },
    callerCapabilities: ['INDEX', 'READ_SOURCE'],
    permissionContext: {
      workspaceId: 'workspace:a2',
      repositoryIds: [repositoryId],
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
async function base(t) {
  const f = await setup(t),
    db = await openR010FixtureDatabase(path.join(f.root, 'source.sqlite'), 'repo:a2', f.root);
  f.state.closeOwnedDatabase = () => db.close();
  // Owned DB files must not become repository Source.
  f.request.config.exclude = ['source.sqlite', 'source.sqlite-*'];
  return { ...f, db, account: makeAccount(f.control.signal).account };
}
test('A2 Application private workflow exists', async () => {
  assert.equal(typeof api, 'function');
  assert.equal((await import('../dist/index.js')).prepareMixedSource, undefined);
});
for (const kind of ['missing-read', 'wrong-repo', 'secret', 'remote'])
  test('A2 Application ' + kind + ' refuses before Source and DB', async (t) => {
    const f = await setup(t),
      p = policy();
    if (kind === 'missing-read') p.callerCapabilities = ['INDEX'];
    if (kind === 'wrong-repo') p.scope.repositoryId = 'repo:foreign';
    if (kind === 'secret') p.source.secretDetected = true;
    if (kind === 'remote') p.destination = 'REMOTE';
    let reads = 0;
    const state = {
      load() {
        reads++;
        throw Error('UNEXPECTED_DB');
      },
    };
    await assert.rejects(
      api({
        request: f.request,
        policy: p,
        account: makeAccount().account,
        control: f.control,
        sourceState: state,
      }),
      (e) =>
        e.code ===
        {
          'missing-read': 'PERMISSION_DENIED',
          'wrong-repo': 'PERMISSION_DENIED',
          secret: 'SECRET_DETECTED',
          remote: 'PERMISSION_DENIED',
        }[kind],
    );
    assert.equal(reads, 0);
    assert.equal(f.state.calls, 0);
  });
test('A2 Application commits real Source with original validated CAS and verifies it', async (t) => {
  const f = await base(t),
    p = await api({
      request: f.request,
      policy: policy(),
      account: f.account,
      control: f.control,
      sourceState: f.db.sourceState,
    });
  assert.equal(p.effects.sourceCommit, 'COMMITTED');
  assert.deepEqual(f.db.sourceState.load('repo:a2'), p.state);
  assert.deepEqual(
    p.state.files.map((x) => x.path),
    expected.files.map((x) => x.path),
  );
  await p.verifySelection();
});
test('A2 Source CAS conflict is safe and cannot report a successful commit', async (t) => {
  const f = await setup(t);
  let writes = 0;
  const store = {
    load() {
      return null;
    },
    findCommitRevisionId() {
      return null;
    },
    replace() {
      writes++;
      throw Object.assign(Error('private database payload'), { code: 'SOURCE_STATE_CONFLICT' });
    },
  };
  await assert.rejects(
    api({
      request: f.request,
      policy: policy(),
      account: makeAccount().account,
      control: f.control,
      sourceState: store,
    }),
    (e) => {
      assert.equal(e.code, 'SOURCE_STATE_CONFLICT');
      assert.equal(e.effects.sourceCommit, 'UNKNOWN');
      assert.equal(e.effects.sourceReconciled, null);
      assert.ok(!e.message.includes('private'));
      return true;
    },
  );
  assert.equal(writes, 1);
});
test('A2 changes after Source commit preserve committed Source and report stale failure', async (t) => {
  const f = await base(t),
    p = await api({
      request: f.request,
      policy: policy(),
      account: f.account,
      control: f.control,
      sourceState: f.db.sourceState,
    });
  const committed = f.db.sourceState.load('repo:a2');
  await fs.writeFile(path.join(f.root, 'app.py'), 'pass\n');
  await assert.rejects(
    p.verifySelection(),
    (e) => e.code === 'SOURCE_CHANGED' && e.effects.sourceCommit === 'COMMITTED',
  );
  assert.deepEqual(f.db.sourceState.load('repo:a2'), committed);
});

test('A2 repository permission does not authorize RAW secret-classified files', async (t) => {
  const f = await setup(t),
    p = policy();
  p.source.classification = 'SECRET';
  let writes = 0;
  const sourceState = {
    load() {
      return null;
    },
    findCommitRevisionId() {
      return null;
    },
    replace() {
      writes++;
    },
  };
  await assert.rejects(
    api({
      request: f.request,
      policy: p,
      account: makeAccount().account,
      control: f.control,
      sourceState,
    }),
    (e) => e.code === 'SECURITY_POLICY_BLOCKED' && e.effects.sourceCommit === 'NOT_ATTEMPTED',
  );
  assert.equal(writes, 0);
});

test('A4 expected observed root refuses before Source CAS', async (t) => {
  const f = await setup(t);
  let writes = 0;
  await assert.rejects(
    api({
      request: f.request,
      policy: policy(),
      account: makeAccount().account,
      control: f.control,
      expectedRepository: { id: 'repo:a2', rootPath: path.join(f.root, 'foreign') },
      sourceState: {
        load() {
          return null;
        },
        findCommitRevisionId() {
          return null;
        },
        replace() {
          writes++;
        },
      },
    }),
    (e) => e.code === 'SOURCE_CHANGED' && e.effects.sourceCommit === 'NOT_ATTEMPTED',
  );
  assert.equal(writes, 0);
});
test('A4 expected repository ID refuses before Source and DB', async (t) => {
  const f = await setup(t);
  let reads = 0;
  await assert.rejects(
    api({
      request: f.request,
      policy: policy(),
      account: makeAccount().account,
      control: f.control,
      expectedRepository: { id: 'repo:foreign', rootPath: f.root },
      sourceState: {
        load() {
          reads++;
          return null;
        },
      },
    }),
    (e) => e.code === 'INVALID_INPUT' && e.effects.sourceCommit === 'NOT_ATTEMPTED',
  );
  assert.equal(reads, 0);
  assert.equal(f.state.calls, 0);
});

async function documentPreparation(t) {
  const f = await base(t);
  const bytes = Buffer.from('\ufeff# \u6587\u6863 \ud83d\ude00\r\nbody\n');
  await fs.writeFile(path.join(f.root, 'note.md'), bytes);
  const permissions = policy();
  const prepared = await api({
    request: f.request,
    policy: permissions,
    account: f.account,
    control: f.control,
    sourceState: f.db.sourceState,
  });
  return { ...f, bytes, permissions, prepared };
}
test('document read composes minted selection, canonical Source and RAW policy without further writes', async (t) => {
  const f = await documentPreparation(t);
  const before = f.db.sourceState.load('repo:a2');
  const result = await f.prepared.readDocumentBytes('note.md');
  assert.deepEqual(result.bytes, f.bytes);
  assert.equal(
    result.contentFingerprint,
    before.files.find((x) => x.path === 'note.md').contentFingerprint,
  );
  assert.deepEqual(f.db.sourceState.load('repo:a2'), before);
  assert.equal(f.prepared.effects.sourceCommit, 'COMMITTED');
});
test('document read rejects non-selected and secret paths instead of accepting supplied bytes or roots', async (t) => {
  for (const requested of ['.env', 'not-selected.md', '../note.md']) {
    const f = await documentPreparation(t);
    await assert.rejects(
      f.prepared.readDocumentBytes(requested),
      (e) =>
        ['INVALID_INPUT', 'PERMISSION_DENIED', 'SECURITY_POLICY_BLOCKED'].includes(e.code) &&
        e.effects.sourceCommit === 'COMMITTED',
    );
  }
});
test('document read rechecks revoked permission before any Source re-read', async (t) => {
  const f = await documentPreparation(t);
  const calls = f.state.calls;
  f.permissions.callerCapabilities = ['INDEX'];
  await assert.rejects(
    f.prepared.readDocumentBytes('note.md'),
    (e) => e.code === 'PERMISSION_DENIED' && e.effects.sourceCommit === 'COMMITTED',
  );
  assert.equal(f.state.calls, calls);
});
test('document read refuses changed selection and tampered Source rows', async (t) => {
  for (const mode of ['selection', 'state']) {
    const f = await documentPreparation(t);
    if (mode === 'selection') f.request.config.exclude.push('note.md');
    else
      f.prepared.state.files.find((x) => x.path === 'note.md').contentFingerprint =
        'sha256:' + '0'.repeat(64);
    await assert.rejects(
      f.prepared.readDocumentBytes('note.md'),
      (e) => e.code === 'SOURCE_CHANGED' && e.effects.sourceCommit === 'COMMITTED',
    );
  }
});

test('document read refuses a canonical sensitivity change during raw consumption', async (t) => {
  const f = await documentPreparation(t);
  const before = f.db.sourceState.load('repo:a2');
  const { syncBuiltinESMExports } = await import('node:module');
  const originalOpen = fs.open;
  let opened = 0,
    changed = false;
  fs.open = async (...args) => {
    opened++;
    return originalOpen(...args);
  };
  syncBuiltinESMExports();
  const read = f.account.readBytes.bind(f.account);
  f.account.readBytes = (n) => {
    if (opened > f.prepared.observation.files.length && !changed) {
      changed = true;
      f.db.sourceState.replace(before, {
        ...before,
        files: before.files.map((file) =>
          file.path === 'note.md' ? { ...file, sensitivity: 'SECRET' } : file,
        ),
      });
    }
    read(n);
  };
  try {
    await assert.rejects(
      f.prepared.readDocumentBytes('note.md'),
      (e) => e.code === 'SOURCE_CHANGED' && e.effects.sourceCommit === 'COMMITTED',
    );
    assert.equal(changed, true);
  } finally {
    fs.open = originalOpen;
    syncBuiltinESMExports();
  }
});

test('document read rejects a changed canonical classification before reopening Source', async (t) => {
  const f = await documentPreparation(t);
  const before = f.db.sourceState.load('repo:a2');
  f.db.sourceState.replace(before, {
    ...before,
    files: before.files.map((file) =>
      file.path === 'note.md' ? { ...file, sensitivity: 'SECRET' } : file,
    ),
  });
  const calls = f.state.calls;
  await assert.rejects(f.prepared.readDocumentBytes('note.md'), (e) => e.code === 'SOURCE_CHANGED');
  assert.equal(f.state.calls, calls);
});
