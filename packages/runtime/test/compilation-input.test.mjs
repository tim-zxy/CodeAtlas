import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
test('private owned Runtime compilation input ports exist', async () => {
  const url = new URL('../dist/compilation-input.js', import.meta.url);
  assert.ok(existsSync(url));
  const api = await import(url.href);
  assert.equal(typeof api.createOwnedCompilationInputPorts, 'function');
});
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  historyFixture,
  historyLimits,
  prefixPlan,
} from '../../storage/test/helpers/r011-history-fixture.mjs';
import { applyMigrationPlan } from '../../storage/dist/migrations/runner.js';
import { loadMigrationPlan } from '../../storage/dist/migrations/manifest.js';
import { RuntimeFactStore } from '../../storage/dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../../storage/dist/runtime/contract-store.js';
import { HistoryReadBudget } from '../../storage/dist/analysis/activation-history-format.js';
import { captureCompilationInput } from '../../application/dist/capture-compilation-input.js';
import { parseCompilationInputSnapshot } from '../../application/dist/compilation-input-contract.js';
import { createOwnedCompilationInputPorts } from '../dist/compilation-input.js';

// All Source, authorization and policy ports below are explicit offline substitutes.
// Genuine SQLite/Storage ownership is tested; no actual Source, scan or production admission.
async function setup(t, fixtureId = 'syntax') {
  const f = await historyFixture(t, fixtureId);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const repository = new RuntimeFactStore(f.db, f.input.repositoryId);
  const basis = repository.readRuntimeBasis(historyLimits).identity.codeBasis;
  const directory = mkdtempSync(join(tmpdir(), 'owned-compilation-runtime-'));
  const path = join(directory, 'workspace.sqlite');
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  const plan = await loadMigrationPlan(
    new URL('../../storage/migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  applyMigrationPlan(db, plan);
  db.exec('PRAGMA journal_mode=WAL');
  db.prepare('INSERT INTO workspace VALUES(1,?,?)').run('workspace:offline', '/offline');
  const root = f.db.prepare('SELECT root_path FROM repository').get().root_path;
  db.prepare('INSERT INTO repositories VALUES(?,?,?)').run(
    basis.repositoryId,
    'workspace:offline',
    root,
  );
  db.prepare('INSERT INTO revision_sets VALUES(?,?,0,0)').run('set:offline', 'workspace:offline');
  db.prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)').run(
    'set:offline',
    basis.repositoryId,
    basis.revisionId,
    basis.contentFingerprint,
  );
  db.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run('set:offline');
  const workspaceStore = new ContractStore(db, 'workspace:offline', [repository]);
  const abort = new AbortController(),
    budget = new HistoryReadBudget(historyLimits);
  const control = {
    maxItems: 10_000_000,
    maxDepth: 100,
    deadlineEpochMs: Date.now() + 120_000,
    signal: abort.signal,
  };
  const options = {
    workspaceStore,
    repositories: new Map([[basis.repositoryId, repository]]),
    budget,
    control,
    syncCheck: () => undefined,
  };
  const owned = createOwnedCompilationInputPorts(options);
  const policy = { securityPolicyRef: 'offline-security-v1', domainPolicyRef: 'offline-domain-v1' };
  const file = f.expected.targetInventory[0];
  const request = {
    schemaVersion: 1,
    workspaceId: 'workspace:offline',
    scope: { kind: 'REPOSITORY', repositoryId: basis.repositoryId },
    revisionSetId: 'set:offline',
    repositoryIds: [basis.repositoryId],
    selectedEntityRefs: [
      {
        scope: 'REPOSITORY',
        repositoryId: basis.repositoryId,
        entity: { kind: 'SOURCE_FILE', id: file.id, revisionId: basis.revisionId },
      },
    ],
    selectedDocumentRevisions: [],
    policyVersions: policy,
  };
  const events = [],
    frames = [],
    connections = [db];
  let invalid = false;
  const ports = {
    ...owned,
    account: {
      checkpoint() {
        assert.equal(invalid, false);
      },
      own(value) {
        budget.own(value);
      },
      invalidate() {
        invalid = true;
        events.push('invalidate');
      },
    },
    allocateSnapshotId: () => 'snapshot:offline',
    now: () => '2026-11-07T00:00:00.000Z',
    currentPolicyVersions() {
      events.push('policies');
      return policy;
    },
    authorizeSelection() {
      events.push('authorize-selection-offline');
    },
    authorizeRepositoryRead() {
      events.push('authorize-repository-offline');
    },
    authorizeWorkspaceRead() {
      events.push('authorize-workspace-offline');
    },
    verifySource() {
      events.push('source-offline-substitute');
    },
    acquireRepository(id) {
      events.push('read-repository');
      const frame = owned.acquireRepository(id);
      frames.push(frame);
      return frame;
    },
    acquireWorkspace(...args) {
      events.push('read-workspace');
      const frame = owned.acquireWorkspace(...args);
      frames.push(frame);
      return frame;
    },
    releaseRepository(frame) {
      events.push('release-repository');
      return owned.releaseRepository(frame);
    },
    releaseWorkspace(frame) {
      events.push('release-workspace');
      return owned.releaseWorkspace(frame);
    },
  };
  t.after(() => {
    for (const c of connections) if (c.isOpen) c.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    f,
    db,
    path,
    connections,
    repository,
    workspaceStore,
    options,
    owned,
    budget,
    control,
    abort,
    ports,
    events,
    frames,
    request,
    basis,
    file,
  };
}
const run = (f) => captureCompilationInput(f.request, f.control, f.ports);
const changes = (db) => db.prepare('SELECT total_changes() n').get().n;
test('real owned SQLite through Runtime and Application captures exact SourceFile selection and releases', async (t) => {
  const f = await setup(t),
    before = [changes(f.f.db), changes(f.db)];
  const snapshot = await run(f);
  assert.equal(snapshot.coverage.status, 'PARTIAL');
  assert.deepEqual(snapshot.selection, {
    repositoryIds: f.request.repositoryIds,
    selectedEntityRefs: f.request.selectedEntityRefs,
    selectedDocumentRevisions: [],
  });
  assert.deepEqual(
    snapshot.repositories[0].entities.map((e) => e.valueSchemaRef),
    ['SourceFile@1'],
  );
  assert.deepEqual(snapshot.repositories[0].entities[0].value, f.file);
  assert.deepEqual(parseCompilationInputSnapshot(snapshot, f.control), snapshot);
  assert.ok(f.events.indexOf('authorize-repository-offline') < f.events.indexOf('read-repository'));
  assert.deepEqual(f.events.slice(-6), [
    'release-workspace',
    'release-repository',
    'authorize-selection-offline',
    'authorize-repository-offline',
    'authorize-workspace-offline',
    'policies',
  ]);
  assert.deepEqual([changes(f.f.db), changes(f.db)], before);
  assert.equal(f.f.db.isTransaction || f.db.isTransaction, false);
  assert.throws(() => f.owned.recheckRepository(f.frames[0]));
  assert.throws(() => f.owned.recheckWorkspace(f.frames[1]));
  assert.ok(f.budget.rows > 0 && f.budget.items > 0);
});
test('App offline permission substitute denial prevents actual repository body acquisition', async (t) => {
  const f = await setup(t),
    before = f.budget.rows;
  f.ports.authorizeRepositoryRead = () => {
    throw Object.assign(Error('private'), { code: 'PERMISSION_DENIED' });
  };
  await assert.rejects(run(f), (error) => error.code === 'PERMISSION_DENIED');
  assert.equal(f.events.includes('read-repository'), false);
  assert.equal(f.events.includes('read-workspace'), false);
  assert.ok(f.budget.rows > before); // metadata only
  assert.equal(f.f.db.isTransaction || f.db.isTransaction, false);
});
test('final actual WAL workspace movement refuses the entire Application snapshot and releases', async (t) => {
  const f = await setup(t),
    writer = new DatabaseSync(f.path, { enableForeignKeyConstraints: true });
  f.connections.push(writer);
  f.ports.verifySource = () => {
    f.events.push('source-offline-substitute');
    writer.prepare('UPDATE repositories SET root_path=?').run('/offline/moved');
  };
  await assert.rejects(run(f), (error) => error.code === 'HISTORY_CHANGED');
  assert.deepEqual(f.events.slice(-3), ['release-workspace', 'release-repository', 'invalidate']);
  assert.equal(f.f.db.isTransaction || f.db.isTransaction, false);
  assert.throws(() => f.owned.recheckRepository(f.frames[0]));
});
test('Source/policy offline substitutes retain separate refusal and cleanup boundaries', async (t) => {
  for (const where of ['source', 'policy']) {
    const f = await setup(t);
    if (where === 'source')
      f.ports.verifySource = () => {
        throw Object.assign(Error('private'), { code: 'SOURCE_CHANGED' });
      };
    else {
      let reads = 0;
      f.ports.currentPolicyVersions = () =>
        ++reads === 1
          ? f.request.policyVersions
          : { ...f.request.policyVersions, domainPolicyRef: 'revoked' };
    }
    await assert.rejects(
      run(f),
      (error) => error.code === (where === 'source' ? 'SOURCE_CHANGED' : 'CAPTURE_POLICY_CHANGED'),
    );
    assert.deepEqual(
      f.events.filter((event) => event.startsWith('release-') || event === 'invalidate'),
      ['release-workspace', 'release-repository', 'invalidate'],
    );
    if (where === 'policy')
      assert.ok(
        f.events.lastIndexOf('authorize-repository-offline') >
          f.events.indexOf('release-repository'),
      );
    assert.throws(() => f.owned.recheckRepository(f.frames[0]));
  }
});
test('Runtime handles authenticate independently of copied outer frame and reject foreign factories', async (t) => {
  const f = await setup(t),
    frame = f.owned.acquireRepository(f.basis.repositoryId);
  f.owned.recheckRepository({ handle: frame.handle, capture: structuredClone(frame.capture) });
  const other = createOwnedCompilationInputPorts(f.options);
  assert.throws(() => other.recheckRepository(frame));
  assert.throws(() =>
    f.owned.acquireWorkspace(f.request, [{ handle: {}, capture: frame.capture }], false),
  );
  f.owned.releaseRepository({ handle: frame.handle });
  assert.throws(() => f.owned.releaseRepository(frame));
});
test('document selection refuses before owned workspace body reads and supports are producer values', async (t) => {
  const f = await setup(t),
    frame = f.owned.acquireRepository(f.basis.repositoryId),
    rows = f.budget.rows;
  assert.ok(frame.capture.supports.length);
  for (const support of frame.capture.supports)
    assert.equal(support.capturedValueDigest.length, 64);
  const request = {
    ...f.request,
    selectedDocumentRevisions: [
      { documentId: 'doc:offline', documentRevisionId: 'docrev:offline' },
    ],
  };
  assert.throws(
    () => f.owned.acquireWorkspace(request, [frame], true),
    /DOCUMENT_SCAN_ADAPTER_UNAVAILABLE/,
  );
  assert.equal(f.budget.rows, rows);
  f.owned.releaseRepository(frame);
});

test('nonempty Runtime Contract and Workspace Service map exact original IR values', async (t) => {
  const f = await setup(t, 'available');
  const { createHash } = await import('node:crypto');
  const { canonicalRuntimeJson, workspaceRuntimeInputDigest } =
    await import('../../ir/dist/index.js');
  const repoApi = await import('../../storage/dist/runtime/runtime-fact-store.js');
  const initial = f.repository.readRuntimeBasis(historyLimits),
    basis = initial.identity.codeBasis;
  const node = f.f.expected.history.state.nodes[0];
  const ref = (kind, id) => ({
    scope: 'REPOSITORY',
    repositoryId: basis.repositoryId,
    entity: { kind, id, revisionId: basis.revisionId },
  });
  const support = {
    basis,
    entity: ref('CODE_NODE', node.id).entity,
    valueDigest: createHash('sha256')
      .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(node))
      .digest('hex'),
  };
  const contract = {
    id: 'contract:adapter',
    factKey: 'contract:adapter',
    repositoryId: basis.repositoryId,
    revisionId: basis.revisionId,
    basis,
    sourceRange: null,
    supportRefs: [support],
    confidence: {
      score: 0.5,
      method: 'runtime-declaration-support-v1',
      reasons: ['OFFLINE_LITERAL'],
    },
    resolution: 'HEURISTIC',
    direction: 'PROVIDER',
    protocol: 'HTTP',
    serviceRef: null,
    signature: {
      kind: 'HTTP',
      method: 'GET',
      pathSegments: [{ kind: 'LITERAL', value: 'offline' }],
      querySchemaRef: ref('CODE_NODE', node.id),
      requestSchemaRef: ref('CODE_NODE', node.id),
      responseSchemaRef: ref('CODE_NODE', node.id),
      serviceHint: 'offline',
    },
    implementationRef: ref('CODE_NODE', node.id),
  };
  const candidate = {
    facts: {
      schema: 'codeatlas.runtime-fact-set',
      version: 1,
      payload: {
        basis,
        externalRefs: [ref('CODE_NODE', node.id)],
        supportInventory: [support],
        entryPoints: [],
        tasks: [],
        dataResources: [],
        triggers: [],
        contracts: [contract],
        contexts: [],
        nodes: [],
        edges: [],
        flows: [],
      },
    },
    bindings: {
      schema: 'codeatlas.framework-binding-set',
      version: 1,
      payload: { basis, externalRefs: [], supportInventory: [], bindings: [] },
    },
    coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
    termination: 'COMPLETE',
  };
  const unsupportedRepository = structuredClone(candidate);
  unsupportedRepository.coverage.status = 'UNSUPPORTED';
  assert.throws(
    () =>
      f.repository.applyRuntimeBatch(
        { expected: initial.identity, candidate: unsupportedRepository },
        historyLimits,
      ),
    /RUNTIME_PARTIAL/,
  );
  f.repository.applyRuntimeBatch({ expected: initial.identity, candidate }, historyLimits);
  const captured = repoApi.captureRepositoryCompilationInputs(
    f.repository,
    new HistoryReadBudget(historyLimits),
    () => undefined,
  );
  const runtime = repoApi.repositoryCompilationWorkspaceSnapshot(f.repository, captured.handle);
  const workspaceBasis = {
    workspaceId: f.request.workspaceId,
    revisionSetId: f.request.revisionSetId,
    workspaceActivationDigest: '0'.repeat(64),
  };
  const service = {
    id: 'service:adapter',
    factKey: 'service:adapter',
    logicalServiceKey: 'offline-service',
    location: 'KNOWN_EXTERNAL',
    repositoryRef: null,
    supportRefs: [support],
  };
  const frozen = {
    workspaceBasis,
    repositoryBindings: [runtime.binding],
    catalog: {
      workspaceBasis,
      services: [service],
      entries: [],
      contractBindings: [
        {
          contractRef: ref('CONTRACT', contract.id),
          serviceRef: {
            scope: 'WORKSPACE',
            workspaceId: workspaceBasis.workspaceId,
            entity: { kind: 'SERVICE', id: service.id, revisionId: workspaceBasis.revisionSetId },
          },
          supportRefs: [support],
        },
      ],
    },
    contractRefs: [{ ref: ref('CONTRACT', contract.id), contract }],
  };
  workspaceBasis.workspaceActivationDigest = workspaceRuntimeInputDigest(frozen);
  const execution = {
    schema: 'codeatlas.workspace-execution',
    version: 1,
    payload: {
      workspaceBasis,
      repositoryBindings: [runtime.binding],
      nodes: [],
      edges: [],
      coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
      supportInventory: [],
    },
  };
  const unsupportedWorkspace = structuredClone(execution);
  unsupportedWorkspace.payload.coverage.status = 'UNSUPPORTED';
  assert.throws(
    () =>
      f.workspaceStore.applyWorkspaceBatch(
        { expectedOldActivationId: null, frozen, matches: [], execution: unsupportedWorkspace },
        historyLimits,
      ),
    /WORKSPACE_RUNTIME_PARTIAL/,
  );
  f.workspaceStore.applyWorkspaceBatch(
    { expectedOldActivationId: null, frozen, matches: [], execution },
    historyLimits,
  );
  repoApi.releaseRepositoryCompilationInputs(f.repository, captured.handle);
  const frame = f.owned.acquireRepository(basis.repositoryId);
  assert.deepEqual(
    frame.capture.entities.find((e) => e.valueSchemaRef === 'Contract@1').value,
    contract,
  );
  const workspace = f.owned.acquireWorkspace(f.request, [frame], true);
  assert.deepEqual(
    workspace.workspaceCapture.entities.find((e) => e.valueSchemaRef === 'Service@1').value,
    service,
  );
  assert.deepEqual(workspace.workspaceCapture.contractBindings, {
    schemaVersion: 1,
    bindings: frozen.catalog.contractBindings,
  });
  assert.deepEqual(workspace.workspaceCapture.supports, []); // Source support belongs to repository capture.
  assert.equal(workspace.workspaceCapture.coverage.status, 'PARTIAL');
  f.owned.recheckRepository(frame);
  f.owned.recheckWorkspace(workspace);
  f.owned.releaseWorkspace(workspace);
  f.owned.releaseRepository(frame);
  f.request.selectedEntityRefs = [ref('CONTRACT', contract.id)];
  const snapshot = await run(f);
  assert.deepEqual(
    snapshot.repositories[0].entities.find((e) => e.valueSchemaRef === 'Contract@1').value,
    contract,
  );
  assert.ok(
    snapshot.repositories[0].supports.some((s) => s.ref.valueDigest === support.valueDigest),
  );
});
test('mapping control failure cleans its already acquired Storage owner before refusing', async (t) => {
  const f = await setup(t);
  const low = createOwnedCompilationInputPorts({
    ...f.options,
    control: { ...f.control, maxItems: 1 },
  });
  assert.throws(
    () => low.acquireRepository(f.basis.repositoryId),
    (error) => error.code === 'COMPILATION_CAPTURE_FAILED' && error.cleanupState === 'SETTLED',
  );
  assert.equal(f.f.db.isTransaction, false);
  const frame = f.owned.acquireRepository(f.basis.repositoryId);
  f.owned.recheckRepository(frame);
  f.owned.releaseRepository(frame);
});

test('factory owns original control before callbacks can replace signal or extend deadline', async (t) => {
  const f = await setup(t);
  const original = new AbortController(),
    replacement = new AbortController();
  const source = { ...f.control, signal: original.signal };
  const options = {
    ...f.options,
    control: source,
    syncCheck: () => {
      source.signal = replacement.signal;
      source.deadlineEpochMs = Number.MAX_SAFE_INTEGER;
      source.maxItems = Number.MAX_SAFE_INTEGER;
      return undefined;
    },
  };
  const ports = createOwnedCompilationInputPorts(options);
  original.abort();
  assert.throws(() => ports.readSelection(f.request), /CANCELLED/);
  const expired = { ...f.control, deadlineEpochMs: 0 };
  assert.throws(
    () =>
      createOwnedCompilationInputPorts({
        ...f.options,
        control: expired,
        syncCheck: () => {
          expired.deadlineEpochMs = Number.MAX_SAFE_INTEGER;
          return undefined;
        },
      }),
    /DEADLINE/,
  );
});
test('workspace frame handle getters are never evaluated', async (t) => {
  const f = await setup(t);
  let invoked = false;
  const frame = {
    get handle() {
      invoked = true;
      throw Error('private');
    },
  };
  assert.throws(() => f.owned.recheckWorkspace(frame));
  assert.throws(() => f.owned.releaseWorkspace(frame));
  assert.equal(invoked, false);
});

test('Source identity comes exclusively from the genuine captured Store handle', async (t) => {
  const f = await setup(t),
    frame = f.owned.acquireRepository(f.basis.repositoryId);
  const identity = f.owned.repositorySourceIdentity({ handle: frame.handle });
  assert.deepEqual(identity.repoBasis, f.basis);
  assert.deepEqual(identity.targetSource, {
    repositoryId: f.basis.repositoryId,
    revisionId: f.basis.revisionId,
    contentFingerprint: f.basis.contentFingerprint,
  });
  assert.deepEqual(identity.targetInventory, f.f.expected.targetInventory);
  assert.equal(
    identity.rootPath,
    f.f.db.prepare('SELECT root_path FROM repository').get().root_path,
  );
  assert.ok(Object.isFrozen(identity) && Object.isFrozen(identity.targetInventory));
  const fabricated = structuredClone(frame.capture);
  fabricated.repoBasis.contentFingerprint = 'caller-cannot-replace-original';
  assert.deepEqual(
    f.owned.repositorySourceIdentity({ handle: frame.handle, capture: fabricated }),
    identity,
  );
  const other = createOwnedCompilationInputPorts(f.options);
  assert.throws(() => other.repositorySourceIdentity({ handle: frame.handle }));
  assert.throws(() => f.owned.repositorySourceIdentity({ handle: {} }));
  f.owned.releaseRepository(frame);
  assert.throws(() => f.owned.repositorySourceIdentity({ handle: frame.handle }));
});

for (const kind of ['repository', 'workspace'])
  test(`failed SQLite rollback during ${kind} acquisition remains UNKNOWN before any frame escapes`, async (t) => {
    const { constants } = await import('node:sqlite');
    const f = await setup(t);
    const target = kind === 'repository' ? f.f.db : f.db;
    let injected = false,
      rollbackDenied = 0,
      repositoryFrame,
      repositoryReleases = 0;
    const owned = createOwnedCompilationInputPorts({
      ...f.options,
      syncCheck: () => {
        if (!injected && target.isTransaction) {
          injected = true;
          target.setAuthorizer((action, detail) => {
            if (action === constants.SQLITE_TRANSACTION && detail === 'ROLLBACK') {
              rollbackDenied++;
              return constants.SQLITE_DENY;
            }
            return constants.SQLITE_OK;
          });
          throw Error('TEST_OWNED_READ_FAILURE');
        }
        return undefined;
      },
    });
    f.ports.acquireRepository = (id) => {
      repositoryFrame = owned.acquireRepository(id);
      return repositoryFrame;
    };
    f.ports.acquireWorkspace = (...args) => owned.acquireWorkspace(...args);
    f.ports.releaseRepository = (frame) => {
      repositoryReleases++;
      return owned.releaseRepository(frame);
    };
    try {
      await assert.rejects(run(f), (error) => {
        assert.equal(error.code, 'CONTEXT_UNAVAILABLE');
        assert.equal(error.cleanupState, 'UNKNOWN');
        return true;
      });
      assert.equal(injected, true);
      assert.equal(rollbackDenied, 1);
      assert.equal(target.isTransaction, true); // Real SQLite refusal, not a fake Error.
      assert.equal(repositoryReleases, kind === 'workspace' ? 1 : 0);
      if (repositoryFrame) assert.throws(() => owned.recheckRepository(repositoryFrame));
      assert.equal(f.events.includes('source-offline-substitute'), false);
    } finally {
      // Only the test-owned connection is repaired after the refusal is asserted.
      target.setAuthorizer(null);
      if (target.isTransaction) target.exec('ROLLBACK');
    }
  });
