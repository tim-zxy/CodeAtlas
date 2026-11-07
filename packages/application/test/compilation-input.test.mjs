import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCompilationInput } from '../dist/capture-compilation-input.js';
import { parseCompilationInputSnapshot } from '../dist/compilation-input-contract.js';
const zero = '0'.repeat(64);
const policy = { securityPolicyRef: 'security-v1', domainPolicyRef: 'domain-v1' };
const coverage = {
  status: 'PARTIAL',
  limitations: ['OFFLINE_SOURCE_AUTHENTICITY_NOT_PROVED'],
  unverifiedRefs: [],
};
const request = () => ({
  schemaVersion: 1,
  workspaceId: 'w',
  scope: { kind: 'REPOSITORY', repositoryId: 'r' },
  revisionSetId: 'rs',
  repositoryIds: ['r'],
  selectedEntityRefs: [
    {
      scope: 'REPOSITORY',
      repositoryId: 'r',
      entity: { kind: 'SOURCE_FILE', id: 'f', revisionId: 'v' },
    },
  ],
  selectedDocumentRevisions: [],
  policyVersions: { ...policy },
});
const selection = () => ({
  workspaceId: 'w',
  revisionSetId: 'rs',
  registeredRepositories: [
    { repositoryId: 'r', rootPath: '/owned/r' },
    { repositoryId: 'other', rootPath: '/owned/other' },
  ],
  revisionSetEntries: [
    { repositoryId: 'r', revisionId: 'v', revisionFingerprint: 'sha256:' + zero },
    { repositoryId: 'other', revisionId: 'v2', revisionFingerprint: 'sha256:' + zero },
  ],
});
const capture = () => ({
  repoBasis: {
    repositoryId: 'r',
    revisionId: 'v',
    contentFingerprint: 'sha256:' + zero,
    codeActivationDigest: zero,
  },
  runtimeActivationDigest: null,
  entities: [
    {
      ref: request().selectedEntityRefs[0],
      valueSchemaRef: 'SourceFile@1',
      value: {
        id: 'f',
        repositoryId: 'r',
        revisionId: 'v',
        path: 'src/A.java',
        contentFingerprint: 'sha256:' + zero,
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: 'java',
        sensitivity: 'INTERNAL',
      },
    },
  ],
  supports: [],
  coverage: structuredClone(coverage),
});
function fixture() {
  const events = [],
    abort = new AbortController();
  const control = {
    maxItems: 1_000_000,
    maxDepth: 100,
    deadlineEpochMs: Date.now() + 60_000,
    signal: abort.signal,
  };
  let bytes = 'before',
    observed = bytes,
    policies = { ...policy };
  const repository = { handle: Object.freeze({}), capture: capture() };
  const workspace = {
    handle: Object.freeze({}),
    selection: selection(),
    workspaceCapture: null,
    documents: [],
  };
  const event = (name) => {
    events.push(name);
  };
  const ports = {
    account: {
      checkpoint() {},
      own() {},
      invalidate() {
        event('invalidate');
      },
    },
    allocateSnapshotId: () => 'opaque-capture',
    now: () => '2026-11-07T00:00:00.000Z',
    currentPolicyVersions() {
      event('policy');
      return policies;
    },
    authorizeSelection() {
      event('authorize-selection');
    },
    authorizeRepositoryRead() {
      event('authorize-repository');
    },
    authorizeWorkspaceRead(_r, include) {
      event('authorize-workspace');
      assert.equal(include, false);
    },
    readSelection() {
      event('read-selection');
      return selection();
    },
    acquireRepository() {
      event('read-repository');
      return repository;
    },
    acquireWorkspace() {
      event('read-workspace');
      return workspace;
    },
    verifySource() {
      event('source');
      if (bytes !== observed)
        throw Object.assign(new Error('private source text'), { code: 'SOURCE_CHANGED' });
    },
    recheckRepository() {
      event('recheck-repository');
    },
    recheckWorkspace() {
      event('recheck-workspace');
    },
    releaseRepository() {
      event('release-repository');
    },
    releaseWorkspace() {
      event('release-workspace');
    },
  };
  return {
    ports,
    control,
    events,
    abort,
    repository,
    workspace,
    moveSource() {
      bytes = 'after';
    },
    revoke() {
      policies = { ...policy, securityPolicyRef: 'revoked' };
    },
  };
}
const run = (f, value = request()) => captureCompilationInput(value, f.control, f.ports);
const refuses = async (f, code, value) =>
  assert.rejects(run(f, value), (e) => {
    assert.equal(e.name, 'CompilationCaptureError');
    if (code) assert.equal(e.code, code);
    assert.equal(e.message.includes('private source text'), false);
    return true;
  });
test('offline owner ports produce immutable exact selected input after checks and cleanup; no cross-DB instant claim', async () => {
  const f = fixture(),
    got = await run(f);
  assert.equal(got.snapshotId, 'opaque-capture');
  assert.equal(got.repositories[0].entities[0].value.id, 'f');
  assert.equal(got.coverage.status, 'PARTIAL');
  assert.deepEqual(parseCompilationInputSnapshot(got, f.control), got);
  assert.ok(Object.isFrozen(got.repositories[0].entities[0].value));
  assert.deepEqual(f.events, [
    'policy',
    'authorize-selection',
    'read-selection',
    'authorize-repository',
    'read-repository',
    'authorize-workspace',
    'read-workspace',
    'source',
    'recheck-repository',
    'recheck-workspace',
    'authorize-selection',
    'authorize-repository',
    'authorize-workspace',
    'policy',
    'release-workspace',
    'release-repository',
  ]);
  assert.equal('publication' in got || 'scanClearance' in got, false);
});
test('authority denies selection before metadata and transitive inventory before body reads', async () => {
  for (const where of ['authorizeSelection', 'authorizeRepositoryRead', 'authorizeWorkspaceRead']) {
    const f = fixture();
    f.ports[where] = () => {
      throw Object.assign(new Error('private source text'), { code: 'PERMISSION_DENIED' });
    };
    await refuses(f, 'PERMISSION_DENIED');
    const prevented = {
      authorizeSelection: 'read-selection',
      authorizeRepositoryRead: 'read-repository',
      authorizeWorkspaceRead: 'read-workspace',
    }[where];
    assert.equal(f.events.includes(prevented), false);
    assert.equal(
      f.events.filter((v) => v === 'release-repository').length,
      where === 'authorizeWorkspaceRead' ? 1 : 0,
    );
  }
});
test('deny-only clean scanning cannot authorize selected document body or document refs', async () => {
  for (const root of [false, true]) {
    const f = fixture(),
      value = request();
    if (root)
      value.selectedEntityRefs = [
        {
          scope: 'WORKSPACE',
          workspaceId: 'w',
          entity: { kind: 'DOCUMENT_BLOCK', id: 'block', revisionId: 'docrev' },
        },
      ];
    else value.selectedDocumentRevisions = [{ documentId: 'doc', documentRevisionId: 'docrev' }];
    await refuses(f, 'CAPTURE_SCAN_UNAVAILABLE', value);
    assert.equal(
      f.events.includes('read-repository') || f.events.includes('read-workspace'),
      false,
    );
  }
});
test('foreign/unfrozen selection and same revision label with wrong fingerprint refuse', async () => {
  for (const alter of [
    (s) => {
      s.workspaceId = 'foreign';
    },
    (s) => {
      s.revisionSetEntries = s.revisionSetEntries.slice(1);
    },
    (s) => {
      s.registeredRepositories = s.registeredRepositories.slice(1);
    },
    (s) => {
      s.revisionSetEntries[0].revisionFingerprint = 'sha256:' + '1'.repeat(64);
    },
  ]) {
    const f = fixture(),
      value = selection();
    alter(value);
    f.ports.readSelection = () => value;
    await refuses(f, 'CAPTURE_SCOPE_MISMATCH');
    assert.equal(f.events.includes('read-workspace'), false);
  }
});
test('repository subset of larger RevisionSet allowed but WORKSPACE missing repository denied', async () => {
  const f = fixture(),
    value = request();
  value.scope = { kind: 'WORKSPACE', workspaceId: 'w' };
  await refuses(f, 'CAPTURE_SCOPE_MISMATCH', value);
  assert.equal(f.events.includes('read-repository'), false);
});
test('Source byte movement under same WORKTREE label refuses and settles both owners', async () => {
  const f = fixture(),
    acquire = f.ports.acquireWorkspace;
  f.ports.acquireWorkspace = () => {
    const result = acquire();
    f.moveSource();
    return result;
  };
  await refuses(f, 'SOURCE_CHANGED');
  assert.deepEqual(f.events.slice(-3), ['release-workspace', 'release-repository', 'invalidate']);
});
test('effective policy revocation and workspace membership movement refuse', async () => {
  for (const change of ['policy', 'workspace']) {
    const f = fixture(),
      acquire = f.ports.acquireWorkspace;
    f.ports.acquireWorkspace = () => {
      const result = acquire();
      if (change === 'policy') f.revoke();
      else result.selection.registeredRepositories[0].rootPath = '/moved';
      return result;
    };
    await refuses(f, change === 'policy' ? 'CAPTURE_POLICY_CHANGED' : 'HISTORY_CHANGED');
    assert.equal(f.events.filter((e) => e === 'release-repository').length, 1);
    assert.equal(f.events.filter((e) => e === 'release-workspace').length, 1);
  }
});
test('abort after acquisition still releases all handles and emits no snapshot', async () => {
  const f = fixture(),
    acquire = f.ports.acquireWorkspace;
  f.ports.acquireWorkspace = () => {
    const result = acquire();
    f.abort.abort();
    return result;
  };
  await refuses(f, 'CANCELLED');
  assert.deepEqual(f.events.slice(-3), ['release-workspace', 'release-repository', 'invalidate']);
});
test('Source unknown cleanup and release faults refuse; every owner cleanup is attempted', async () => {
  for (const fault of ['source', 'release']) {
    const f = fixture();
    if (fault === 'source')
      f.ports.verifySource = () => {
        throw Object.assign(new Error('private source text'), {
          code: 'SOURCE_CHANGED',
          cleanupState: 'UNKNOWN',
        });
      };
    else
      f.ports.releaseWorkspace = () => {
        f.events.push('release-workspace');
        throw new Error('private source text');
      };
    await assert.rejects(
      run(f),
      (e) => e.cleanupState === 'UNKNOWN' && !e.message.includes('private'),
    );
    assert.equal(f.events.filter((e) => e === 'release-repository').length, 1);
  }
});
test('request and materialized values are owned before later callbacks mutate their sources', async () => {
  const f = fixture(),
    value = request(),
    acquire = f.ports.acquireWorkspace;
  f.ports.authorizeSelection = () => {
    value.repositoryIds[0] = 'foreign';
    value.policyVersions.securityPolicyRef = 'foreign';
  };
  f.ports.acquireWorkspace = () => {
    f.repository.capture.entities[0].value.path = 'mutated.java';
    return acquire();
  };
  const got = await run(f, value);
  assert.equal(got.selection.repositoryIds[0], 'r');
  assert.equal(got.repositories[0].entities[0].value.path, 'src/A.java');
});
test('backwards clock after owner cleanup refuses without inventing capture time', async () => {
  const f = fixture();
  let calls = 0;
  f.ports.now = () => (calls++ ? '2026-11-06T00:00:00.000Z' : '2026-11-07T00:00:00.000Z');
  await refuses(f, 'CAPTURE_FAILED');
  assert.ok(f.events.includes('release-repository'));
});
test('every thrown value after materialization refuses, including falsy failures', async () => {
  for (const hook of [
    'verifySource',
    'recheckRepository',
    'recheckWorkspace',
    'currentPolicyVersions',
  ]) {
    for (const thrown of [undefined, null, false, 0, '']) {
      const f = fixture();
      let calls = 0;
      f.ports[hook] = () => {
        if (hook === 'currentPolicyVersions' && calls++ === 0) return { ...policy };
        throw thrown;
      };
      await refuses(f, 'CAPTURE_FAILED');
      assert.equal(f.events.filter((e) => e === 'release-repository').length, 1);
      assert.equal(f.events.filter((e) => e === 'release-workspace').length, 1);
    }
  }
});
test('owner tokens are bound once even when later callbacks mutate returned frame containers', async () => {
  const f = fixture(),
    repositoryToken = f.repository.handle,
    workspaceToken = f.workspace.handle;
  const acquire = f.ports.acquireWorkspace;
  f.ports.acquireWorkspace = () => {
    f.repository.handle = {};
    return acquire();
  };
  f.ports.verifySource = () => {
    f.workspace.handle = {};
  };
  f.ports.recheckRepository = (frame) => {
    assert.equal(frame.handle, repositoryToken);
  };
  f.ports.recheckWorkspace = (frame) => {
    assert.equal(frame.handle, workspaceToken);
  };
  f.ports.releaseRepository = (frame) => {
    f.events.push('release-repository');
    assert.equal(frame.handle, repositoryToken);
  };
  f.ports.releaseWorkspace = (frame) => {
    f.events.push('release-workspace');
    assert.equal(frame.handle, workspaceToken);
  };
  assert.equal((await run(f)).repositories[0].repoBasis.repositoryId, 'r');
});

test('actual read permissions are rechecked after materialization even when policy versions stay unchanged', async () => {
  for (const hook of ['authorizeSelection', 'authorizeRepositoryRead', 'authorizeWorkspaceRead']) {
    const f = fixture();
    let calls = 0;
    f.ports[hook] = () => {
      if (++calls > 1)
        throw Object.assign(new Error('private source text'), { code: 'PERMISSION_DENIED' });
    };
    await refuses(f, 'PERMISSION_DENIED');
    assert.equal(calls, 2);
    assert.equal(f.events.filter((e) => e === 'release-repository').length, 1);
    assert.equal(f.events.filter((e) => e === 'release-workspace').length, 1);
  }
});
