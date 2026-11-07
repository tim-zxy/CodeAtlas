// Reuses the reviewed owned-declaration fixture in contract-store.test.mjs.
// Real R013/Workspace Store and matcher/stitch composition; no actual Source,
// Native producer, policy issuer, model, qualification or publication evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { historyFixture, historyLimits, prefixPlan } from './r011-history-fixture.mjs';
import { loadMigrationPlan } from '../../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../../dist/migrations/runner.js';
import { RuntimeFactStore } from '../../dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../../dist/runtime/contract-store.js';
import { workspaceRuntimeInputDigest } from '@codeatlas/ir';
import { deriveWorkspaceRuntime } from '../../../application/dist/index.js';

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

export async function nonemptyWorkspaceRuntimeFixture(t) {
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
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
      new URL('../../migrations/workspace/manifest.json', import.meta.url),
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
  const store = new ContractStore(db, wb.workspaceId, [repo]);
  const control = () => ({
    maxItems: 10000,
    maxDepth: 20,
    deadlineEpochMs: Date.now() + 60000,
    signal: new AbortController().signal,
  });
  const firstBatch = deriveWorkspaceRuntime(
    store.readWorkspaceInputs(frozen, historyLimits),
    control(),
  );
  assert.equal(firstBatch.matches.length, 1);
  assert.equal(firstBatch.matches[0].payload.status, 'MATCHED');
  assert.equal(firstBatch.execution.payload.nodes.length, 2);
  assert.equal(firstBatch.execution.payload.edges.length, 1);
  const first = store.applyWorkspaceBatch(firstBatch, historyLimits);
  assert.equal(first.status, 'COMMITTED');
  // A second real activation retains the first immutable activation and children.
  const nextBatch = deriveWorkspaceRuntime(
    store.readWorkspaceInputs(frozen, historyLimits),
    control(),
  );
  const next = store.applyWorkspaceBatch(nextBatch, historyLimits);
  assert.equal(next.status, 'COMMITTED');
  assert.notEqual(first.activationId, next.activationId);
  assert.equal(store.traceWorkspaceRuntime(historyLimits).activationId, next.activationId);
  assert.equal(
    db
      .prepare('SELECT parent_id FROM workspace_runtime_activations WHERE id=?')
      .get(next.activationId).parent_id,
    first.activationId,
  );
  for (const [table, count] of [
    ['services', 2],
    ['service_identities', 2],
    ['contracts', 4],
    ['contract_matches', 2],
    ['match_candidates', 2],
    ['workspace_execution_nodes', 4],
    ['workspace_execution_edges', 2],
  ])
    assert.equal(db.prepare('SELECT count(*) n FROM ' + table).get().n, count);
  assert.equal(f.db.prepare('SELECT count(*) n FROM execution_nodes').get().n, 2);
  assert.equal(f.db.prepare('SELECT count(*) n FROM execution_edges').get().n, 1);
  assert.ok(f.db.prepare('SELECT count(*) n FROM runtime_support_membership').get().n > 0);
  return {
    ...f,
    repositoryDb: f.db,
    repositoryDatabasePath: f.databasePath,
    db,
    workspaceDatabasePath: db.location('main'),
    workspaceId: wb.workspaceId,
    revisionSetId: wb.revisionSetId,
    repo,
    store,
    firstActivationId: first.activationId,
    activationId: next.activationId,
  };
}
