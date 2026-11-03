import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('physical Runtime observation stays unavailable without qualification', async () => {
  const url = new URL('../dist/runtime-fact-composition.js', import.meta.url);
  assert.ok(fs.existsSync(url), 'Runtime composition must exist');
  const { requirePhysicalRuntimeObservation } = await import(url.href);
  assert.throws(() => requirePhysicalRuntimeObservation(), /RUNTIME_OBSERVATION_NOT_READY/);
});

test('private Runtime composition publishes through authorized Application and preserves query-only access', async (t) => {
  const { composeRuntimeFacts } = await import('../dist/runtime-fact-composition.js');
  const { historyFixture, historyLimits, prefixPlan } =
    await import('../../storage/test/helpers/r011-history-fixture.mjs');
  const { applyMigrationPlan } = await import('../../storage/dist/migrations/runner.js');
  const { RuntimeFactStore } = await import('../../storage/dist/index.js');
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId);
  let derived = 0;
  const compose = composeRuntimeFacts({
    workspaceId: 'workspace:owned',
    repositoryId: f.input.repositoryId,
    store,
    limits: historyLimits,
    derive: async ({ codeBasis: basis }) => {
      derived++;
      return {
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
      };
    },
  });
  const request = (operation) => localRequest(f.input.repositoryId, operation);
  const out = await compose.refresh(request('INDEX'));
  assert.equal(out.status, 'COMMITTED');
  assert.equal(derived, 1);
  const view = compose.trace(request('QUERY'));
  assert.equal(view.status, 'CURRENT');
  assert.equal(view.activationId, out.activationId);
  assert.equal(derived, 1);
});

for (const framework of ['spring', 'mongo', 'kafka', 'fastapi'])
  test(
    'fixed V4 selection to Graph/Flow preserves ' + framework + ' declaration limitations',
    async () => {
      const api = await import('../dist/framework-runtime-composition.js');
      assert.equal(typeof api.prepareFrameworkRuntime, 'function');
      const { readFileSync } = await import('node:fs');
      const fixture = JSON.parse(
        readFileSync(
          new URL('../../../fixtures/phase1/' + framework + '/inputs.json', import.meta.url),
        ),
      );
      const item = fixture.cases[0],
        { context } = item;
      const expected = JSON.parse(
        readFileSync(
          new URL('../../../fixtures/phase1/' + framework + '/expected.json', import.meta.url),
        ),
      ).cases.find((x) => x.name === item.name);
      const control = () => ({
        maxItems: 10000,
        maxDepth: 20,
        deadlineEpochMs: Date.now() + 60000,
        signal: new AbortController().signal,
      });
      const route = {
        frameworkId: framework,
        languageId: framework === 'fastapi' ? 'python' : 'java',
        configuration: context.configuration,
      };
      const inputs = {
        basis: context.basis,
        nodes: context.nodes,
        edges: context.edges,
        sourceFiles: context.sourceFiles,
        syntaxEvidence: context.syntaxEvidence,
        supportInventory: context.supportInventory,
        providerCapabilities: ['SYMBOL'],
      };
      const candidate = await api.prepareFrameworkRuntime(inputs, [route], control());
      assert.equal(candidate.coverage.status, 'PARTIAL');
      assert.equal(candidate.termination, 'COMPLETE');
      assert(candidate.coverage.limitations.length > 0);
      assert(
        candidate.facts.payload.contracts.length +
          candidate.facts.payload.tasks.length +
          candidate.facts.payload.dataResources.length >
          0,
      );
      assert.equal(candidate.bindings.payload.bindings.length, expected.bindings.length);
      assert.deepEqual(
        [
          ...candidate.facts.payload.contracts,
          ...candidate.facts.payload.tasks,
          ...candidate.facts.payload.dataResources,
        ]
          .map((r) => r.id)
          .sort(),
        expected.domainIds,
      );
      assert.equal(candidate.facts.payload.entryPoints.length, expected.entries);
      if (expected.entries) {
        assert(candidate.facts.payload.nodes.length > 0);
        assert(candidate.facts.payload.flows.length > 0);
      }
      const noCapability = await api.prepareFrameworkRuntime(
        { ...inputs, providerCapabilities: [] },
        [route],
        control(),
      );
      assert.equal(noCapability.coverage.status, 'PARTIAL');
      assert.equal(noCapability.facts.payload.contracts.length, 0);
      await assert.rejects(() =>
        api.prepareFrameworkRuntime(inputs, [route], { ...control(), maxItems: 1 }),
      );
    },
  );

function localRequest(repositoryId, operation) {
  return {
    control: {
      maxItems: 10000,
      maxDepth: 20,
      deadlineEpochMs: Date.now() + 60000,
      signal: new AbortController().signal,
    },
    policy: {
      operation,
      phase: 'PRIMARY',
      scope: { workspaceId: 'workspace:owned', repositoryId: repositoryId },
      callerCapabilities: [operation],
      permissionContext: {
        workspaceId: 'workspace:owned',
        repositoryIds: [repositoryId],
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
  };
}

test('fixed stored-framework refresh refuses empty coverage and authorizes before acquisition', async (t) => {
  const { composeFrameworkRuntime } = await import('../dist/framework-runtime-composition.js');
  const { historyFixture, historyLimits, prefixPlan } =
    await import('../../storage/test/helpers/r011-history-fixture.mjs');
  const { RuntimeFactStore } = await import('../../storage/dist/index.js');
  const { applyMigrationPlan } = await import('../../storage/dist/migrations/runner.js');
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const store = new RuntimeFactStore(f.db, f.input.repositoryId);
  let reads = 0;
  const read = store.readFrameworkInputs.bind(store);
  store.readFrameworkInputs = (...args) => {
    reads++;
    return read(...args);
  };
  const composition = composeFrameworkRuntime({
    workspaceId: 'workspace:owned',
    repositoryId: f.input.repositoryId,
    store,
    limits: historyLimits,
    routes: [{ languageId: 'java', frameworkId: 'spring', configuration: {} }],
  });
  const denied = localRequest(f.input.repositoryId, 'INDEX');
  denied.policy.permissionContext.allowedOperations = [];
  await assert.rejects(() => composition.refresh(denied));
  assert.equal(reads, 0);
  const out = await composition.refresh(localRequest(f.input.repositoryId, 'INDEX'));
  assert.deepEqual(out, { status: 'NOT_PUBLISHED', reason: 'PARTIAL' });
  assert.equal(reads, 1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM runtime_activations').get().n, 0);
  assert.equal(
    composition.trace(localRequest(f.input.repositoryId, 'QUERY')).status,
    'NOT_AVAILABLE',
  );
  assert.equal(reads, 1);
});

test('multiple routes share the existing candidate-unit request cap', async () => {
  const { prepareFrameworkRuntime } = await import('../dist/framework-runtime-composition.js');
  const { readFileSync } = await import('node:fs');
  const { createSpringPluginV4 } = await import('../../plugins/dist/index.js');
  const { context } = JSON.parse(
    readFileSync(new URL('../../../fixtures/phase1/spring/inputs.json', import.meta.url)),
  ).cases[0];
  const plugin = createSpringPluginV4(),
    detection = await plugin.detect(context);
  let units = 0;
  for await (const c of plugin.extract({ ...context, detection, maxItems: 10000 })) {
    const p = c.value.payload;
    const records =
      c.capability === 'FRAMEWORK_BINDING_SET'
        ? p.bindings
        : [
            ...p.entryPoints,
            ...p.tasks,
            ...p.dataResources,
            ...p.triggers,
            ...p.contracts,
            ...p.contexts,
            ...p.nodes,
            ...p.edges,
            ...p.flows,
          ];
    units +=
      records.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
      p.externalRefs.length +
      p.supportInventory.length +
      c.support.length +
      c.coverage.limitations.length +
      c.coverage.unverifiedRefs.length;
  }
  const input = {
    basis: context.basis,
    nodes: context.nodes,
    edges: context.edges,
    sourceFiles: context.sourceFiles,
    syntaxEvidence: context.syntaxEvidence,
    supportInventory: context.supportInventory,
    providerCapabilities: ['SYMBOL'],
  };
  const route = { frameworkId: 'spring', languageId: 'java', configuration: context.configuration };
  const control = () => ({
    maxItems: 2 * units - 1,
    maxDepth: 20,
    deadlineEpochMs: Date.now() + 60000,
    signal: new AbortController().signal,
  });
  await prepareFrameworkRuntime(input, [route], control());
  await assert.rejects(
    () => prepareFrameworkRuntime(input, [route, route], control()),
    /RUNTIME_LIMIT_EXCEEDED/,
  );
});
