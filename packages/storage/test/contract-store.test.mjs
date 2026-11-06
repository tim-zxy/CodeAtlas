import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { historyFixture, historyLimits, prefixPlan } from './helpers/r011-history-fixture.mjs';
import { loadMigrationPlan } from '../dist/index.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { RuntimeFactStore } from '../dist/runtime/runtime-fact-store.js';
import { workspaceRuntimeInputDigest } from '../../contracts/dist/index.js';
const api = async () => {
  const u = new URL('../dist/runtime/contract-store.js', import.meta.url);
  assert.ok(fs.existsSync(u), 'Workspace Contract Store must exist');
  return import(u.href);
};
const empty = (basis) => ({
  facts: {
    schema: 'codeatlas.runtime-fact-set',
    version: 1,
    payload: {
      basis,
      externalRefs: [],
      supportInventory: [],
      entryPoints: [],
      tasks: [],
      dataResources: [],
      triggers: [],
      contracts: [],
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
});
for (const workspaceSchema of [6, 7, 8])
  test(
    'Workspace authenticates frozen RevisionSet and actual repo binding on schema ' +
      workspaceSchema,
    async (t) => {
      const { ContractStore } = await api(),
        f = await historyFixture(t);
      applyMigrationPlan(f.db, await prefixPlan(13));
      const repo = new RuntimeFactStore(f.db, f.input.repositoryId),
        c = repo.readRuntimeBasis(historyLimits),
        r = repo.applyRuntimeBatch(
          { expected: c.identity, candidate: empty(c.identity.codeBasis) },
          historyLimits,
        ),
        v = repo.traceRuntime(historyLimits);
      const db = new DatabaseSync(f.directory + '/workspace.sqlite', {
        enableForeignKeyConstraints: true,
      });
      f.connections.push(db);
      const plan = await loadMigrationPlan(
        new URL('../migrations/workspace/manifest.json', import.meta.url),
        'WORKSPACE',
      );
      applyMigrationPlan(db, {
        ...plan,
        latestVersion: workspaceSchema,
        migrations: plan.migrations.slice(0, workspaceSchema),
      });
      db.prepare('INSERT INTO workspace(slot,id,root_path)VALUES(1,?,?)').run(
        'workspace:owned',
        'owned',
      );
      db.prepare('INSERT INTO repositories(repository_id,workspace_id,root_path)VALUES(?,?,?)').run(
        f.input.repositoryId,
        'workspace:owned',
        f.input.tables.repository[0].root_path,
      );
      db.prepare(
        "INSERT INTO revision_sets(id,workspace_id,created_at,frozen)VALUES('set:owned','workspace:owned',0,0)",
      ).run();
      db.prepare(
        "INSERT INTO revision_set_items(revision_set_id,repository_id,revision_id,revision_fingerprint)VALUES('set:owned',?,?,?)",
      ).run(
        c.identity.codeBasis.repositoryId,
        c.identity.codeBasis.revisionId,
        c.identity.codeBasis.contentFingerprint,
      );
      const binding = {
        repoBasis: c.identity.codeBasis,
        syntaxActivationId: c.identity.syntaxActivationId,
        syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
        runtimeActivationId: r.activationId,
        runtimeCandidateDigest: v.identity.candidateDigest,
      };
      const wb = {
        workspaceId: 'workspace:owned',
        revisionSetId: 'set:owned',
        workspaceActivationDigest: '0'.repeat(64),
      };
      const frozen = {
        workspaceBasis: wb,
        repositoryBindings: [binding],
        catalog: { workspaceBasis: wb, services: [], entries: [], contractBindings: [] },
        contractRefs: [],
      };
      wb.workspaceActivationDigest = workspaceRuntimeInputDigest(frozen);
      const execution = {
        schema: 'codeatlas.workspace-execution',
        version: 1,
        payload: {
          workspaceBasis: wb,
          repositoryBindings: [binding],
          nodes: [],
          edges: [],
          coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
          supportInventory: [],
        },
      };
      const input = { expectedOldActivationId: null, frozen, matches: [], execution };
      const store = new ContractStore(db, 'workspace:owned', [repo]);
      assert.equal(typeof store.readWorkspaceInputs, 'function');
      assert.throws(() => store.readWorkspaceInputs(frozen, historyLimits), /FROZEN/);
      assert.throws(() => store.applyWorkspaceBatch(input, historyLimits), /FROZEN/);
      db.prepare("UPDATE revision_sets SET frozen=1 WHERE id='set:owned'").run();
      const forged = structuredClone(input);
      forged.frozen.repositoryBindings[0].syntaxMembershipDigest = '0'.repeat(64);
      assert.throws(() => store.applyWorkspaceBatch(forged, historyLimits));
      db.prepare('UPDATE repositories SET root_path=? WHERE repository_id=?').run(
        'different-root',
        f.input.repositoryId,
      );
      assert.throws(
        () => store.applyWorkspaceBatch(input, historyLimits),
        /WORKSPACE_REPOSITORY_MISMATCH/,
      );
      db.prepare('UPDATE repositories SET root_path=? WHERE repository_id=?').run(
        f.input.tables.repository[0].root_path,
        f.input.repositoryId,
      );
      const prepared = store.readWorkspaceInputs(frozen, historyLimits);
      assert.equal(prepared.expectedOldActivationId, null);
      assert.deepEqual(prepared.frozen, frozen);
      assert.equal(prepared.graphs.length, 1);
      assert.deepEqual(prepared.graphs[0].candidate, empty(c.identity.codeBasis));
      db.exec('PRAGMA user_version=9');
      assert.throws(
        () => store.readWorkspaceInputs(frozen, historyLimits),
        /INVALID_WORKSPACE_RUNTIME/,
      );
      db.exec('PRAGMA user_version=' + workspaceSchema);
      assert.throws(() => store.readWorkspaceInputs(frozen, { ...historyLimits, maxRows: 1 }));
      const out = store.applyWorkspaceBatch(input, historyLimits);
      assert.equal(out.status, 'COMMITTED');
      assert.equal(out.freshness, 'CURRENT');
      const view = store.traceWorkspaceRuntime(historyLimits);
      assert.equal(view.status, 'CURRENT');
      assert.deepEqual(view.execution, execution);
      assert.throws(
        () => store.applyWorkspaceBatch(input, historyLimits),
        /WORKSPACE_INPUT_CHANGED/,
      );
      const next = { ...input, expectedOldActivationId: out.activationId },
        exec = db.exec.bind(db);
      db.exec = (sql) => {
        exec(sql);
        if (sql === 'COMMIT') throw Error('WORKSPACE_POST_COMMIT');
      };
      try {
        assert.throws(
          () => store.applyWorkspaceBatch(next, historyLimits),
          /WORKSPACE_POST_COMMIT/,
        );
      } finally {
        db.exec = exec;
      }
      const uncertain = store.settlement();
      assert.equal(uncertain.status, 'COMMIT_OUTCOME_UNKNOWN');
      assert.ok(uncertain.activationId);
      assert.equal(typeof store.inspectOutcome, 'function');
      const recovered = store.inspectOutcome(historyLimits);
      assert.equal(recovered.status, 'COMMITTED');
      assert.equal(recovered.activationId, uncertain.activationId);
      const changed = { ...input, expectedOldActivationId: uncertain.activationId };
      db.exec = (sql) => {
        exec(sql);
        if (sql === 'COMMIT')
          f.db
            .prepare('DELETE FROM active_history_pointer WHERE repository_id=?')
            .run(f.input.repositoryId);
      };
      let committed;
      try {
        committed = store.applyWorkspaceBatch(changed, historyLimits);
      } finally {
        db.exec = exec;
      }
      assert.equal(committed.status, 'COMMITTED');
      assert.equal(committed.freshness, 'AFFECTED');

      const stale = store.traceWorkspaceRuntime(historyLimits);
      assert.equal(stale.status, 'AFFECTED');
      assert.deepEqual(stale.execution, execution);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    },
  );

test('nonempty owned Runtime contracts publish catalog and matches through Application workspace workflow', async (t) => {
  const { ContractStore } = await api(),
    f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const { createHash } = await import('node:crypto'),
    { matchContracts } = await import('../../contracts/dist/index.js');
  const { composeWorkspaceRuntime } =
    await import('../../runtime/dist/runtime-fact-composition.js');
  const repo = new RuntimeFactStore(f.db, f.input.repositoryId),
    c = repo.readRuntimeBasis(historyLimits),
    basis = c.identity.codeBasis,
    x = empty(basis),
    p = x.facts.payload;
  const canon = (v) =>
    Array.isArray(v)
      ? '[' + v.map(canon).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + canon(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v);
  const owner = f.expected.history.state.nodes[0],
    ref = (kind, id) => ({
      scope: 'REPOSITORY',
      repositoryId: basis.repositoryId,
      entity: { kind, id, revisionId: basis.revisionId },
    });
  const support = {
    basis,
    entity: ref('CODE_NODE', owner.id).entity,
    valueDigest: createHash('sha256')
      .update('codeatlas-phase1-support-value-v1\0' + canon(owner))
      .digest('hex'),
  };
  p.supportInventory = [support];
  p.externalRefs = [ref('CODE_NODE', owner.id)];
  p.contracts = ['PROVIDER', 'CONSUMER'].map((direction) => ({
    id: 'contract:' + direction,
    factKey: 'contract-key:' + direction,
    repositoryId: basis.repositoryId,
    revisionId: basis.revisionId,
    basis,
    sourceRange: null,
    supportRefs: [support],
    confidence: {
      score: 0.5,
      method: 'runtime-declaration-support-v1',
      reasons: ['OWNED_DECLARATION'],
    },
    resolution: 'HEURISTIC',
    direction,
    protocol: 'HTTP',
    serviceRef: null,
    signature: {
      kind: 'HTTP',
      method: 'GET',
      pathSegments: [{ kind: 'LITERAL', value: 'owned' }],
      querySchemaRef: ref('CODE_NODE', owner.id),
      requestSchemaRef: ref('CODE_NODE', owner.id),
      responseSchemaRef: ref('CODE_NODE', owner.id),
      serviceHint: 'owned',
    },
    implementationRef: ref('CODE_NODE', owner.id),
  }));

  const source = f.expected.targetInventory[0];
  p.externalRefs.push(ref('SOURCE_FILE', source.id));
  const common = (id, method = 'runtime-execution-declaration-v1') => ({
    id,
    factKey: id + '-key',
    repositoryId: basis.repositoryId,
    revisionId: basis.revisionId,
    basis,
    sourceRange: owner.sourceRange,
    supportRefs: [support],
    confidence: { score: 0.5, method, reasons: ['OWNED_DECLARATION'] },
    resolution: 'HEURISTIC',
  });
  x.bindings.payload.externalRefs = [...p.externalRefs];
  x.bindings.payload.supportInventory = [support];
  x.bindings.payload.bindings = [
    {
      ...common('binding:owned', 'runtime-declaration-support-v1'),
      kind: 'HTTP_CALL',
      ownerRef: ref('CODE_NODE', owner.id),
      contractRef: ref('CONTRACT', 'contract:CONSUMER'),
    },
  ];
  p.entryPoints = [
    {
      ...common('entry:owned'),
      triggerKind: 'HTTP',
      ownerRef: ref('CODE_NODE', owner.id),
      contextKind: 'REQUEST',
      contractRef: ref('CONTRACT', 'contract:PROVIDER'),
      taskRef: null,
    },
  ];
  p.contexts = [
    {
      ...common('context:owned'),
      kind: 'REQUEST',
      entryRef: ref('ENTRY_POINT', 'entry:owned'),
      parentContextRef: null,
    },
  ];
  p.nodes = [
    {
      ...common('node:entry'),
      contextRef: ref('EXECUTION_CONTEXT', 'context:owned'),
      kind: 'ENTRY',
      targetRef: ref('ENTRY_POINT', 'entry:owned'),
    },
    {
      ...common('node:boundary'),
      contextRef: ref('EXECUTION_CONTEXT', 'context:owned'),
      kind: 'BOUNDARY',
      targetRef: ref('CONTRACT', 'contract:CONSUMER'),
    },
  ];
  p.externalRefs.push(ref('FRAMEWORK_BINDING', 'binding:owned'));
  p.edges = [
    {
      ...common('edge:owned'),
      contextRef: ref('EXECUTION_CONTEXT', 'context:owned'),
      sourceRef: ref('EXECUTION_NODE', 'node:boundary'),
      target: { state: 'NON_RESOLVED', resolution: 'UNRESOLVED', hint: 'owned', candidates: [] },
      transitionKind: 'HTTP',
      guard: null,
      boundaryRef: ref('FRAMEWORK_BINDING', 'binding:owned'),
    },
  ];
  const dangling = structuredClone(x);
  dangling.facts.payload.externalRefs.push(ref('FRAMEWORK_BINDING', 'binding:absent'));
  assert.throws(() =>
    repo.applyRuntimeBatch({ expected: c.identity, candidate: dangling }, historyLimits),
  );
  const commit = repo.applyRuntimeBatch({ expected: c.identity, candidate: x }, historyLimits),
    view = repo.traceRuntime(historyLimits);
  assert(
    f.db
      .prepare('SELECT support_ref_json FROM runtime_support_membership')
      .all()
      .every((row) => JSON.parse(row.support_ref_json).entity.kind !== 'FRAMEWORK_BINDING'),
  );
  const binding = {
    repoBasis: basis,
    syntaxActivationId: c.identity.syntaxActivationId,
    syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
    runtimeActivationId: commit.activationId,
    runtimeCandidateDigest: view.identity.candidateDigest,
  };
  const db = new DatabaseSync(f.directory + '/workspace-nonempty.sqlite', {
    enableForeignKeyConstraints: true,
  });
  f.connections.push(db);
  applyMigrationPlan(
    db,
    await loadMigrationPlan(
      new URL('../migrations/workspace/manifest.json', import.meta.url),
      'WORKSPACE',
    ),
  );
  db.exec(
    "INSERT INTO workspace(slot,id,root_path)VALUES(1,'workspace:owned','owned'); INSERT INTO revision_sets(id,workspace_id,created_at,frozen)VALUES('set:owned','workspace:owned',0,0);",
  );
  db.prepare(
    "INSERT INTO repositories(repository_id,workspace_id,root_path)VALUES(?,'workspace:owned',?)",
  ).run(basis.repositoryId, f.input.tables.repository[0].root_path);
  db.prepare(
    "INSERT INTO revision_set_items(revision_set_id,repository_id,revision_id,revision_fingerprint)VALUES('set:owned',?,?,?)",
  ).run(basis.repositoryId, basis.revisionId, basis.contentFingerprint);
  db.exec("UPDATE revision_sets SET frozen=1 WHERE id='set:owned'");
  const wb = {
    workspaceId: 'workspace:owned',
    revisionSetId: 'set:owned',
    workspaceActivationDigest: '0'.repeat(64),
  };
  const serviceRef = {
    scope: 'WORKSPACE',
    workspaceId: wb.workspaceId,
    entity: { kind: 'SERVICE', id: 'service:owned', revisionId: wb.revisionSetId },
  };
  const frozen = {
    workspaceBasis: wb,
    repositoryBindings: [binding],
    catalog: {
      workspaceBasis: wb,
      services: [
        {
          id: 'service:owned',
          factKey: 'service-key:owned',
          logicalServiceKey: 'owned',
          location: 'WORKSPACE',
          repositoryRef: ref('REPOSITORY', basis.repositoryId),
          supportRefs: [support],
        },
      ],
      entries: [
        {
          id: 'identity:owned',
          factKey: 'identity-key:owned',
          serviceRef,
          sourceBasis: basis,
          identityKind: 'LOGICAL_SERVICE',
          namespace: 'service',
          key: 'owned',
          supportRefs: [support],
        },
      ],
      contractBindings: p.contracts.map((contract) => ({
        contractRef: ref('CONTRACT', contract.id),
        serviceRef,
        supportRefs: [support],
      })),
    },
    contractRefs: p.contracts.map((contract) => ({ ref: ref('CONTRACT', contract.id), contract })),
  };
  wb.workspaceActivationDigest = workspaceRuntimeInputDigest(frozen);
  const control = () => ({
    maxItems: 10000,
    maxDepth: 20,
    deadlineEpochMs: Date.now() + 60000,
    signal: new AbortController().signal,
  });
  const matches = matchContracts(frozen, control()).matches;
  assert.equal(matches.length, 1);
  assert.equal(matches[0].payload.status, 'MATCHED');
  const execution = {
    schema: 'codeatlas.workspace-execution',
    version: 1,
    payload: {
      workspaceBasis: wb,
      repositoryBindings: [binding],
      nodes: [],
      edges: [],
      coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
      supportInventory: [support],
    },
  };

  const wsref = (kind, id) => ({
    scope: 'WORKSPACE',
    workspaceId: wb.workspaceId,
    entity: { kind, id, revisionId: wb.revisionSetId },
  });
  execution.payload.nodes = p.nodes.map((n) => ({
    id: 'workspace-node:' + n.id,
    factKey: 'workspace-node-key:' + n.factKey,
    repositoryRuntimeRef: ref('EXECUTION_NODE', n.id),
  }));
  execution.payload.edges = [
    {
      id: 'workspace-edge:owned',
      factKey: 'workspace-edge-key:owned',
      sourceRef: wsref('WORKSPACE_EXECUTION_NODE', 'workspace-node:node:boundary'),
      targetRef: wsref('WORKSPACE_EXECUTION_NODE', 'workspace-node:node:entry'),
      matchRef: wsref('CONTRACT_MATCH', matches[0].payload.id),
      transitionKind: 'HTTP',
      supportRefs: [support],
      confidence: {
        score: 0.5,
        method: 'contract-support-bound-v1',
        reasons: ['OWNED_DECLARATION'],
      },
    },
  ];
  const batch = { expectedOldActivationId: null, frozen, matches, execution },
    store = new ContractStore(db, wb.workspaceId, [repo]);
  const { composeMatchedWorkspaceRuntime } =
    await import('../../runtime/dist/runtime-fact-composition.js');
  assert.equal(typeof composeMatchedWorkspaceRuntime, 'function');

  const runtime = composeWorkspaceRuntime({
    workspaceId: wb.workspaceId,
    store,
    limits: historyLimits,
    prepare: async () => batch,
  });
  const request = (operation) => ({
    control: control(),
    policy: {
      operation,
      phase: 'PRIMARY',
      scope: { workspaceId: wb.workspaceId, repositoryId: null },
      callerCapabilities: [operation],
      permissionContext: {
        workspaceId: wb.workspaceId,
        repositoryIds: null,
        allowedOperations: [operation],
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
    },
  });
  assert.equal((await runtime.refresh(request('INDEX'))).status, 'COMMITTED');
  const stored = runtime.trace(request('QUERY'));
  assert.equal(stored.status, 'CURRENT');
  assert.deepEqual(stored.matches, matches);
  assert.deepEqual(stored.frozen, frozen);
  for (const [table, n] of [
    ['services', 1],
    ['service_identities', 1],
    ['contracts', 2],
    ['contract_matches', 1],
    ['match_candidates', 1],
    ['workspace_execution_nodes', 2],
    ['workspace_execution_edges', 1],
  ])
    assert.equal(db.prepare('SELECT count(*) n FROM ' + table).get().n, n);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_bindings').get().n, 1);
  assert.deepEqual(stored.execution, execution);
  const { deriveWorkspaceRuntime } = await import('../../application/dist/index.js');
  const prepared = store.readWorkspaceInputs(frozen, historyLimits);
  const actual = deriveWorkspaceRuntime(prepared, control());
  assert.deepEqual(actual.matches, matches);
  assert.equal(actual.execution.payload.nodes.length, 2);
  assert.equal(actual.execution.payload.edges.length, 1);
  assert.equal(actual.execution.payload.coverage.status, 'COMPLETE');
  const matched = composeMatchedWorkspaceRuntime({
    workspaceId: wb.workspaceId,
    store,
    limits: historyLimits,
    frozen,
  });
  const denied = request('INDEX');
  denied.policy.permissionContext.allowedOperations = [];
  let reads = 0;
  const read = store.readWorkspaceInputs.bind(store);
  store.readWorkspaceInputs = (...args) => {
    reads++;
    return read(...args);
  };
  await assert.rejects(() => matched.refresh(denied));
  assert.equal(reads, 0);
  const refreshed = await matched.refresh(request('INDEX'));
  assert.equal(refreshed.status, 'COMMITTED');
  assert.equal(reads, 1);
  assert.deepEqual(matched.trace(request('QUERY')).execution, actual.execution);
  assert.equal(reads, 1);
  const unresolved = structuredClone(frozen);
  unresolved.catalog.entries = [];
  unresolved.workspaceBasis.workspaceActivationDigest = workspaceRuntimeInputDigest(unresolved);
  const partial = composeMatchedWorkspaceRuntime({
    workspaceId: wb.workspaceId,
    store,
    limits: historyLimits,
    frozen: unresolved,
  });
  const beforePointer = db
    .prepare('SELECT activation_id FROM workspace_runtime_state')
    .get().activation_id;
  const beforeCount = db.prepare('SELECT count(*) n FROM workspace_runtime_activations').get().n;
  assert.deepEqual(await partial.refresh(request('INDEX')), {
    status: 'NOT_PUBLISHED',
    reason: 'PARTIAL',
  });
  assert.equal(
    db.prepare('SELECT activation_id FROM workspace_runtime_state').get().activation_id,
    beforePointer,
  );
  assert.equal(
    db.prepare('SELECT count(*) n FROM workspace_runtime_activations').get().n,
    beforeCount,
  );

  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

// Owned declaration integration: identical local IDs deliberately belong to distinct repositories.
// This is not a producer/Source qualification or a new Source-derived COMPLETE claim.
test('two repository databases preserve colliding contract IDs and reject stale frozen inputs', async (t) => {
  const { createHash } = await import('node:crypto');
  const { cases, reference } =
    await import('../../../fixtures/phase1/code-context-capture/authoring.mjs');
  const { seedLiteral, referenceCanonical, resealManifest } =
    await import('./helpers/r011-history-fixture.mjs');
  const fixtures = [];
  for (const repositoryId of ['runtime-repo:left', 'runtime-repo:right']) {
    const f = await historyFixture(t, 'empty-code-complete', { seed: false, version: 13 });
    const replace = (v) => {
      if (v === 'capture-repo') return repositoryId;
      if (v === 'C:/capture-fixture') return f.directory;
      if (Array.isArray(v)) return v.map(replace);
      if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x)]));
      return v;
    };
    const sample = replace(cases.find((c) => c.id === 'empty-code-with-coverage'));
    sample.runs[0].coverage[0].coverage = 'COMPLETE';
    f.input = replace(f.input);
    const manifest = replace(JSON.parse(f.input.tables.activation_history[0].manifest_json));
    const expected = reference(sample);
    manifest.state.basis = expected.view.activeBasis;
    manifest.state.repositoryLocatorDigest = expected.view.repositoryLocatorDigest;
    manifest.codeIdentity = manifest.state.basis.codeActivationDigest;
    const hash = (domain, value) =>
      createHash('sha256')
        .update(domain + '\0' + referenceCanonical(value))
        .digest('hex');
    manifest.sourceIdentity = hash('codeatlas-activation-source-v1', manifest.state.inventory);
    manifest.originRegistryDigest = hash(
      'codeatlas-activation-origins-v1',
      manifest.state.snapshots,
    );
    f.input.tables.activation_history[0].manifest_json = referenceCanonical(manifest);
    await resealManifest(f.input, () => {});
    seedLiteral(f.db, f.input);
    const repo = new RuntimeFactStore(f.db, repositoryId);
    const captured = repo.readRuntimeBasis(historyLimits);
    const basis = captured.identity.codeBasis;
    const source = manifest.state.inventory[0];
    const ref = (kind, id) => ({
      scope: 'REPOSITORY',
      repositoryId,
      entity: { kind, id, revisionId: basis.revisionId },
    });
    const support = {
      basis,
      entity: ref('SOURCE_FILE', source.id).entity,
      valueDigest: hash('codeatlas-phase1-support-value-v1', source),
    };
    const candidate = empty(basis);
    candidate.facts.payload.externalRefs = [ref('SOURCE_FILE', source.id)];
    candidate.facts.payload.supportInventory = [support];
    candidate.facts.payload.contracts = [
      {
        id: 'contract:shared-local-id',
        factKey: 'contract-key:shared-local-id',
        repositoryId,
        revisionId: basis.revisionId,
        basis,
        sourceRange: null,
        supportRefs: [support],
        confidence: {
          score: 0.5,
          method: 'runtime-declaration-support-v1',
          reasons: ['OWNED_DECLARATION'],
        },
        resolution: 'HEURISTIC',
        direction: 'PROVIDER',
        protocol: 'HTTP',
        serviceRef: null,
        signature: {
          kind: 'HTTP',
          method: 'GET',
          pathSegments: [{ kind: 'LITERAL', value: 'owned' }],
          querySchemaRef: null,
          requestSchemaRef: null,
          responseSchemaRef: null,
          serviceHint: null,
        },
        implementationRef: null,
      },
    ];
    const commit = repo.applyRuntimeBatch(
      { expected: captured.identity, candidate },
      historyLimits,
    );
    const current = repo.traceRuntime(historyLimits);
    assert.equal(current.status, 'CURRENT');
    fixtures.push({
      f,
      repo,
      candidate,
      binding: {
        repoBasis: basis,
        syntaxActivationId: captured.identity.syntaxActivationId,
        syntaxMembershipDigest: captured.identity.syntaxMembershipDigest,
        runtimeActivationId: commit.activationId,
        runtimeCandidateDigest: current.identity.candidateDigest,
      },
      ref,
    });
  }
  const [left, right] = fixtures;
  assert.equal(left.binding.repoBasis.revisionId, right.binding.repoBasis.revisionId);
  assert.notEqual(left.binding.runtimeActivationId, right.binding.runtimeActivationId);
  const db = new DatabaseSync(left.f.directory + '/workspace-two-repositories.sqlite', {
    enableForeignKeyConstraints: true,
  });
  left.f.connections.push(db);
  applyMigrationPlan(
    db,
    await loadMigrationPlan(
      new URL('../migrations/workspace/manifest.json', import.meta.url),
      'WORKSPACE',
    ),
  );
  db.prepare('INSERT INTO workspace(slot,id,root_path)VALUES(1,?,?)').run('workspace:two', 'owned');
  db.prepare('INSERT INTO revision_sets(id,workspace_id,created_at,frozen)VALUES(?,?,0,0)').run(
    'set:two',
    'workspace:two',
  );
  for (const { f, binding } of fixtures) {
    const b = binding.repoBasis;
    db.prepare('INSERT INTO repositories(repository_id,workspace_id,root_path)VALUES(?,?,?)').run(
      b.repositoryId,
      'workspace:two',
      f.directory,
    );
    db.prepare(
      'INSERT INTO revision_set_items(revision_set_id,repository_id,revision_id,revision_fingerprint)VALUES(?,?,?,?)',
    ).run('set:two', b.repositoryId, b.revisionId, b.contentFingerprint);
  }
  db.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run('set:two');
  const wb = {
    workspaceId: 'workspace:two',
    revisionSetId: 'set:two',
    workspaceActivationDigest: '0'.repeat(64),
  };
  const bindings = fixtures.map((x) => x.binding);
  const frozen = {
    workspaceBasis: wb,
    repositoryBindings: bindings,
    catalog: { workspaceBasis: wb, services: [], entries: [], contractBindings: [] },
    contractRefs: fixtures.flatMap((x) =>
      x.candidate.facts.payload.contracts.map((contract) => ({
        ref: x.ref('CONTRACT', contract.id),
        contract,
      })),
    ),
  };
  wb.workspaceActivationDigest = workspaceRuntimeInputDigest(frozen);
  const execution = {
    schema: 'codeatlas.workspace-execution',
    version: 1,
    payload: {
      workspaceBasis: wb,
      repositoryBindings: bindings,
      nodes: [],
      edges: [],
      coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
      supportInventory: [],
    },
  };
  const input = { expectedOldActivationId: null, frozen, matches: [], execution };
  const { ContractStore } = await api();
  const store = new ContractStore(
    db,
    wb.workspaceId,
    fixtures.map((x) => x.repo),
  );
  const { deriveWorkspaceRuntime } = await import('../../application/dist/index.js');
  const prepared = store.readWorkspaceInputs(
    { ...frozen, repositoryBindings: [...bindings].reverse() },
    historyLimits,
  );
  const derived = deriveWorkspaceRuntime(prepared, {
    maxItems: 10000,
    maxDepth: 20,
    deadlineEpochMs: Date.now() + 60000,
    signal: new AbortController().signal,
  });
  assert.deepEqual(derived.frozen, frozen);
  const expectedExecution = structuredClone(execution);
  expectedExecution.payload.supportInventory = fixtures.flatMap(
    (x) => x.candidate.facts.payload.supportInventory,
  );
  assert.deepEqual(derived.execution, expectedExecution);
  const committed = store.applyWorkspaceBatch(derived, historyLimits);
  assert.equal(committed.status, 'COMMITTED');
  assert.equal(committed.freshness, 'CURRENT');
  const rows = db
    .prepare('SELECT repository_id,entity_id FROM contracts ORDER BY repository_id')
    .all();
  assert.deepEqual(
    rows.map((x) => [x.repository_id, x.entity_id]),
    [
      ['runtime-repo:left', 'contract:shared-local-id'],
      ['runtime-repo:right', 'contract:shared-local-id'],
    ],
  );
  assert.deepEqual(store.traceWorkspaceRuntime(historyLimits).frozen, frozen);
  assert.equal(store.inspectOutcome(historyLimits).status, 'COMMITTED');
  // Change only the second database. Reading must not refresh or erase last-good.
  const { RepositorySourceStateStore } = await import('../dist/index.js');
  const sourceStore = new RepositorySourceStateStore(right.f.db);
  const before = sourceStore.load(right.binding.repoBasis.repositoryId);
  sourceStore.replace(before, {
    revision: { ...before.revision, contentFingerprint: 'source:advanced' },
    files: before.files.map((file) => ({ ...file, contentFingerprint: 'changed-source' })),
  });
  assert.equal(left.repo.traceRuntime(historyLimits).status, 'CURRENT');
  assert.equal(right.repo.traceRuntime(historyLimits).status, 'AFFECTED');
  assert.equal(right.repo.readRuntimeBasis(historyLimits).status, 'UNAVAILABLE');
  const stale = store.traceWorkspaceRuntime(historyLimits);
  assert.equal(stale.status, 'AFFECTED');
  assert.equal(stale.activationId, committed.activationId);
  assert.deepEqual(stale.frozen, frozen);
  assert.deepEqual(stale.execution, expectedExecution);
  assert.throws(
    () =>
      store.applyWorkspaceBatch(
        { ...input, expectedOldActivationId: committed.activationId },
        historyLimits,
      ),
    /RUNTIME_NOT_CURRENT/,
  );
  assert.equal(db.prepare('SELECT count(*) n FROM workspace_runtime_activations').get().n, 1);
  assert.equal(
    db.prepare('SELECT activation_id FROM workspace_runtime_state').get().activation_id,
    committed.activationId,
  );
  assert.throws(() => store.readWorkspaceInputs(frozen, historyLimits), /RUNTIME_NOT_CURRENT/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
