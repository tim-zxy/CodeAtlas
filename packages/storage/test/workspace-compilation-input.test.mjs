import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../dist/runtime/contract-store.js');
test('private owned workspace compilation capture API exists', () => {
  for (const name of [
    'captureWorkspaceCompilationInputs',
    'recheckWorkspaceCompilationInputs',
    'releaseWorkspaceCompilationInputs',
  ])
    assert.equal(typeof api[name], 'function', name);
});
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { DocumentStore } from '../dist/documents/document-store.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2_000_000,
  maxItems: 200000,
  maxDepth: 80,
  memoryBudgetBytes: 20_000_000,
};
const budget = () => new HistoryReadBudget(limits);
const control = () => {};
const selection = [{ documentId: 'doc:one', documentRevisionId: 'rev:one' }];
const plan = await loadMigrationPlan(
  new URL('../migrations/workspace/manifest.json', import.meta.url),
  'WORKSPACE',
);
function bundle(id = 'rev:one', fingerprint = 'a') {
  return {
    schema: 'codeatlas.document-bundle',
    version: 1,
    payload: {
      document: {
        id: 'doc:one',
        workspaceId: 'ws:one',
        repositoryId: null,
        logicalPath: 'note.md',
        mediaType: 'text/markdown',
        sourceKind: 'MARKDOWN',
        currentRevisionId: null,
      },
      revision: {
        id,
        documentId: 'doc:one',
        sourceFingerprint: 'sha256:' + fingerprint.repeat(64),
        parserVersion: 'literal-v1',
        policyVersion: 'test-policy-v1',
        sourceBasis: {
          documentId: 'doc:one',
          documentRevisionId: id,
          contentFingerprint: 'sha256:' + fingerprint.repeat(64),
        },
        blockRefs: [],
        diagnostics: [],
        completeness: 'COMPLETE',
      },
      externalRefs: [],
      supportInventory: [],
      sections: [],
      blocks: [],
      tables: [],
      links: [],
      codeSnippets: [],
      mentions: [],
      chunks: [],
      claims: [],
    },
  };
}
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'workspace-compilation-'));
  const path = join(directory, 'workspace.sqlite');
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  applyMigrationPlan(db, plan);
  db.exec(
    "PRAGMA journal_mode=WAL; INSERT INTO workspace VALUES(1,'ws:one','/owned'); INSERT INTO revision_sets VALUES('set:one','ws:one',0,0); UPDATE revision_sets SET frozen=1 WHERE id='set:one'",
  );
  const docs = new DocumentStore(db, 'ws:one');
  docs.applyDocuments({ bundle: bundle(), expectedCurrentRevisionId: null }, limits, control);
  const store = new api.ContractStore(db, 'ws:one', []);
  const connections = [db];
  t.after(() => {
    for (const c of connections) if (c.isOpen) c.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { db, docs, store, path, connections };
}
const capture = (f, selected = selection, b = budget(), c = control) =>
  api.captureWorkspaceCompilationInputs(f.store, 'set:one', selected, [], true, b, c);
test('workspace captures exact immutable history and old readers remain unchanged', async (t) => {
  const f = await setup(t);
  f.docs.applyDocuments(
    { bundle: bundle('rev:two', 'b'), expectedCurrentRevisionId: 'rev:one' },
    limits,
    control,
  );
  const got = capture(f);
  assert.equal(got.view.workspaceId, 'ws:one');
  assert.equal(got.view.workspaceRuntime, null);
  assert.deepEqual(got.view.registeredRepositories, []);
  assert.deepEqual(got.view.revisionSetEntries, []);
  assert.equal(got.view.documents[0].revisionId, 'rev:one');
  assert.equal(got.view.documents[0].bundle.payload.document.currentRevisionId, null);
  assert.ok(Object.isFrozen(got.view.documents[0].bundle));
  assert.equal(f.docs.readCurrent('doc:one', limits).revisionId, 'rev:two');
  assert.equal(f.docs.readRevision('doc:one', 'rev:one', limits, control).revisionId, 'rev:one');
  api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control);
  api.releaseWorkspaceCompilationInputs(f.store, got.handle);
  assert.throws(() =>
    api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control),
  );
  assert.equal(f.db.isTransaction, false);
});
test('workspace refuses missing/foreign revisions, unknown schema, external transaction and async control', async (t) => {
  const f = await setup(t);
  for (const chosen of [
    [{ documentId: 'doc:one', documentRevisionId: 'missing' }],
    [{ documentId: 'foreign', documentRevisionId: 'rev:one' }],
    [...selection, ...selection],
  ]) {
    assert.throws(() => capture(f, chosen));
    assert.equal(f.db.isTransaction, false);
  }
  assert.throws(() => capture(f, selection, budget(), async () => {}));
  assert.throws(() => capture(f, selection, budget(), () => Promise.resolve()));
  assert.throws(() => capture(f, selection, new HistoryReadBudget({ ...limits, maxRows: 1 })));
  f.db.exec('BEGIN');
  assert.throws(() => capture(f));
  assert.equal(f.db.isTransaction, true);
  f.db.exec('ROLLBACK');
  f.db.exec('PRAGMA user_version=9');
  assert.throws(() => capture(f));
  assert.equal(f.db.isTransaction, false);
  f.db.exec('PRAGMA user_version=8; PRAGMA foreign_keys=OFF');
  assert.throws(() => capture(f));
});
test('workspace recheck rejects document head movement and wrong handle owner', async (t) => {
  const f = await setup(t),
    got = capture(f);
  assert.throws(() =>
    api.recheckWorkspaceCompilationInputs(
      new api.ContractStore(f.db, 'ws:one', []),
      got.handle,
      [],
      budget(),
      control,
    ),
  );
  f.docs.applyDocuments(
    { bundle: bundle('rev:two', 'b'), expectedCurrentRevisionId: 'rev:one' },
    limits,
    control,
  );
  assert.throws(
    () => api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control),
    /CHANGED/,
  );
  assert.equal(f.db.isTransaction, false);
});
test('workspace read owns one WAL snapshot while document head changes between component reads', async (t) => {
  const f = await setup(t),
    writer = new DatabaseSync(f.path, { enableForeignKeyConstraints: true });
  f.connections.push(writer);
  const writerDocs = new DocumentStore(writer, 'ws:one');
  let moved = false;
  const got = capture(f, selection, budget(), () => {
    if (
      f.db.isTransaction &&
      !moved &&
      f.db.prepare('SELECT count(*) n FROM revision_sets').get().n === 1
    ) {
      moved = true;
      writerDocs.applyDocuments(
        { bundle: bundle('rev:two', 'b'), expectedCurrentRevisionId: 'rev:one' },
        limits,
        control,
      );
    }
  });
  assert.equal(moved, true);
  assert.equal(got.view.documents[0].revisionId, 'rev:one');
  assert.throws(
    () => api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control),
    /CHANGED/,
  );
});
test('workspace close/reopen invalidates original connection incarnation and control failure rolls back', async (t) => {
  const f = await setup(t),
    got = capture(f);
  f.db.close();
  f.db.open();
  assert.throws(() =>
    api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control),
  );
  assert.throws(() => capture(f));
  f.store = new api.ContractStore(f.db, 'ws:one', []);
  assert.throws(
    () =>
      capture(f, selection, budget(), () => {
        if (f.db.isTransaction) throw Error('CANCELLED');
      }),
    /INVALID_HISTORY/,
  );
  assert.equal(f.db.isTransaction, false);
});
test('metadata selector reads no body and refuses missing/nonfrozen sets', async (t) => {
  const f = await setup(t);
  assert.deepEqual(api.readWorkspaceCompilationSelection(f.store, 'set:one', budget(), control), {
    workspaceId: 'ws:one',
    revisionSetId: 'set:one',
    registeredRepositories: [],
    revisionSetEntries: [],
  });
  assert.throws(() =>
    api.readWorkspaceCompilationSelection(f.store, 'set:missing', budget(), control),
  );
  f.db.exec("INSERT INTO revision_sets VALUES('set:mutable','ws:one',0,0)");
  assert.throws(() =>
    api.readWorkspaceCompilationSelection(f.store, 'set:mutable', budget(), control),
  );
  f.db.exec('DROP TABLE document_links');
  assert.equal(
    api.readWorkspaceCompilationSelection(f.store, 'set:one', budget(), control).revisionSetId,
    'set:one',
  );
});
test('workspace owns selected revision before a callback changes caller selection', async (t) => {
  const f = await setup(t),
    selected = structuredClone(selection);
  const got = capture(f, selected, budget(), () => {
    selected[0].documentRevisionId = 'missing';
  });
  assert.equal(got.view.documents[0].revisionId, 'rev:one');
  api.releaseWorkspaceCompilationInputs(f.store, got.handle);
  let evaluated = false;
  const getters = [
    {
      get documentId() {
        evaluated = true;
        return 'doc:one';
      },
      documentRevisionId: 'rev:one',
    },
  ];
  assert.throws(() => capture(f, getters));
  assert.equal(evaluated, false);
});
test('explicit unrequested workspace runtime does not read its body and keeps selection bound at recheck', async (t) => {
  const f = await setup(t);
  f.db.exec('DROP TABLE workspace_runtime_state');
  const got = api.captureWorkspaceCompilationInputs(
    f.store,
    'set:one',
    selection,
    [],
    false,
    budget(),
    control,
  );
  assert.equal(got.view.workspaceRuntimeRead, 'NOT_REQUESTED');
  assert.equal(got.view.workspaceRuntime, null);
  api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control);
  assert.throws(() => capture(f));
});
test('missing document fails whole combined view and cleanup failure is explicit', async (t) => {
  const f = await setup(t);
  const exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    if (sql === 'ROLLBACK') throw Error('private-sql-details');
    return exec(sql);
  };
  try {
    assert.throws(
      () => capture(f, [{ documentId: 'missing', documentRevisionId: 'rev:one' }]),
      /CONTEXT_UNAVAILABLE/,
    );
  } finally {
    f.db.exec = exec;
    if (f.db.isTransaction) f.db.exec('ROLLBACK');
  }
  assert.equal(f.db.isTransaction, false);
});
import { HistoryCaptureError } from '../dist/analysis/activation-history-format.js';
test('corrupt SQL failures use the existing safe typed error channel', async (t) => {
  const f = await setup(t);
  f.db.exec('DROP TABLE document_links');
  assert.throws(
    () => capture(f),
    (error) => error instanceof HistoryCaptureError && error.code === 'INVALID_HISTORY',
  );
  assert.equal(f.db.isTransaction, false);
});
import { historyFixture, historyLimits, prefixPlan } from './helpers/r011-history-fixture.mjs';
import * as repoApi from '../dist/runtime/runtime-fact-store.js';
import {
  workspaceRuntimeInputDigest,
  workspaceRuntimeInputDigestV2,
  canonicalRuntimeJson,
} from '@codeatlas/ir';
import { createHash } from 'node:crypto';
async function runtimeFixture(t, format = 1) {
  const f = await setup(t),
    r = await historyFixture(t);
  applyMigrationPlan(r.db, await prefixPlan(13));
  const repo = new repoApi.RuntimeFactStore(r.db, r.input.repositoryId),
    initial = repo.readRuntimeBasis(historyLimits);
  const basis = initial.identity.codeBasis,
    node = r.expected.history.state.nodes[0];
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
    id: 'contract:provider',
    factKey: 'contract:provider-key',
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
    direction: 'PROVIDER',
    protocol: 'HTTP',
    serviceRef: null,
    signature: {
      kind: 'HTTP',
      method: 'GET',
      pathSegments: [{ kind: 'LITERAL', value: 'owned' }],
      querySchemaRef: ref('CODE_NODE', node.id),
      requestSchemaRef: ref('CODE_NODE', node.id),
      responseSchemaRef: ref('CODE_NODE', node.id),
      serviceHint: 'owned',
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
  repo.applyRuntimeBatch({ expected: initial.identity, candidate }, historyLimits);
  const captured = repoApi.captureRepositoryCompilationInputs(
    repo,
    new HistoryReadBudget(historyLimits),
    control,
  );
  t.after(() => repoApi.releaseRepositoryCompilationInputs(repo, captured.handle));
  const snapshot = repoApi.repositoryCompilationWorkspaceSnapshot(repo, captured.handle);
  f.db
    .prepare("INSERT INTO repositories VALUES(?,'ws:one',?)")
    .run(basis.repositoryId, snapshot.rootPath);
  f.db.exec("INSERT INTO revision_sets VALUES('set:runtime','ws:one',0,0)");
  f.db
    .prepare("INSERT INTO revision_set_items VALUES('set:runtime',?,?,?)")
    .run(basis.repositoryId, basis.revisionId, basis.contentFingerprint);
  f.db.exec("UPDATE revision_sets SET frozen=1 WHERE id='set:runtime'");
  const workspaceBasis = {
    workspaceId: 'ws:one',
    revisionSetId: 'set:runtime',
    workspaceActivationDigest: '0'.repeat(64),
  };
  const frozen = {
    workspaceBasis,
    repositoryBindings: [snapshot.binding],
    catalog: { workspaceBasis, services: [], entries: [], contractBindings: [] },
    contractRefs: [{ ref: ref('CONTRACT', contract.id), contract }],
  };
  if (format === 2) {
    frozen.matchingPolicyVersion = 'declared-http-schema-v1';
    frozen.schemaDocuments = [];
  }
  workspaceBasis.workspaceActivationDigest =
    format === 2 ? workspaceRuntimeInputDigestV2(frozen) : workspaceRuntimeInputDigest(frozen);
  const execution = {
    schema: 'codeatlas.workspace-execution',
    version: 1,
    payload: {
      workspaceBasis,
      repositoryBindings: [snapshot.binding],
      nodes: [],
      edges: [],
      coverage: { status: 'COMPLETE', limitations: [], unverifiedRefs: [] },
      supportInventory: [],
    },
  };
  const batch = { expectedOldActivationId: null, frozen, matches: [], execution };
  f.store = new api.ContractStore(f.db, 'ws:one', [repo]);
  const applied =
    format === 2
      ? f.store.applyWorkspaceBatchV2(batch, historyLimits, historyLimits.maxSerializedBytes)
      : f.store.applyWorkspaceBatch(batch, historyLimits);
  assert.equal(applied.status, 'COMMITTED');
  return {
    ...f,
    repo,
    r,
    batch,
    captured,
    repositories: [{ store: repo, handle: captured.handle }],
    applied,
  };
}
test('combined workspace reads fully validated nonempty Contract activation and exact document history', async (t) => {
  const f = await runtimeFixture(t);
  const got = api.captureWorkspaceCompilationInputs(
    f.store,
    'set:runtime',
    selection,
    f.repositories,
    true,
    new HistoryReadBudget(historyLimits),
    control,
  );
  assert.equal(got.view.workspaceRuntimeRead, 'REQUESTED');
  assert.equal(got.view.workspaceRuntime.activationId, f.applied.activationId);
  assert.equal(got.view.workspaceRuntime.frozen.contractRefs.length, 1);
  assert.deepEqual(got.view.workspaceRuntime.execution, f.batch.execution);
  assert.equal(got.view.documents[0].revisionId, 'rev:one');
  api.recheckWorkspaceCompilationInputs(
    f.store,
    got.handle,
    f.repositories,
    new HistoryReadBudget(historyLimits),
    control,
  );
  assert.throws(() =>
    api.captureWorkspaceCompilationInputs(
      f.store,
      'set:runtime',
      selection,
      [],
      true,
      new HistoryReadBudget(historyLimits),
      control,
    ),
  );
  assert.throws(() =>
    api.captureWorkspaceCompilationInputs(
      f.store,
      'set:runtime',
      selection,
      [{ store: f.repo, handle: {} }],
      true,
      new HistoryReadBudget(historyLimits),
      control,
    ),
  );
  api.releaseWorkspaceCompilationInputs(f.store, got.handle);
});
test('workspace rejects activation movement, and explicit unrequested runtime needs no unrelated repo handles', async (t) => {
  const f = await runtimeFixture(t);
  const got = api.captureWorkspaceCompilationInputs(
    f.store,
    'set:runtime',
    selection,
    f.repositories,
    true,
    new HistoryReadBudget(historyLimits),
    control,
  );
  const next = f.store.applyWorkspaceBatch(
    { ...f.batch, expectedOldActivationId: f.applied.activationId },
    historyLimits,
  );
  assert.equal(next.status, 'COMMITTED');
  assert.throws(
    () =>
      api.recheckWorkspaceCompilationInputs(
        f.store,
        got.handle,
        f.repositories,
        new HistoryReadBudget(historyLimits),
        control,
      ),
    /CHANGED/,
  );
  const onlyDocs = api.captureWorkspaceCompilationInputs(
    f.store,
    'set:runtime',
    selection,
    [],
    false,
    new HistoryReadBudget(historyLimits),
    control,
  );
  assert.equal(onlyDocs.view.workspaceRuntimeRead, 'NOT_REQUESTED');
  assert.equal(onlyDocs.view.workspaceRuntime, null);
  api.releaseWorkspaceCompilationInputs(f.store, onlyDocs.handle);
});
test('combined workspace retains original format2 activation and declared-schema checks', async (t) => {
  const f = await runtimeFixture(t, 2);
  const got = api.captureWorkspaceCompilationInputs(
    f.store,
    'set:runtime',
    selection,
    f.repositories,
    true,
    new HistoryReadBudget(historyLimits),
    control,
  );
  assert.equal(got.view.workspaceRuntime.formatVersion, 2);
  assert.deepEqual(got.view.workspaceRuntime.frozen, f.batch.frozen);
  api.recheckWorkspaceCompilationInputs(
    f.store,
    got.handle,
    f.repositories,
    new HistoryReadBudget(historyLimits),
    control,
  );
  api.releaseWorkspaceCompilationInputs(f.store, got.handle);
});
test('combined workspace refuses extra SQL membership even with an intact activation digest', async (t) => {
  const f = await runtimeFixture(t);
  const digest = f.db
    .prepare('SELECT value_digest FROM workspace_runtime_activations')
    .get().value_digest;
  f.db
    .prepare(
      "INSERT INTO services VALUES(?,'set:runtime','service:extra','service:extra-key','extra','KNOWN_EXTERNAL',NULL,'codeatlas.frozen-service-catalog',1,'{}',?)",
    )
    .run(f.applied.activationId, '0'.repeat(64));
  assert.equal(
    f.db.prepare('SELECT value_digest FROM workspace_runtime_activations').get().value_digest,
    digest,
  );
  assert.throws(() =>
    api.captureWorkspaceCompilationInputs(
      f.store,
      'set:runtime',
      selection,
      f.repositories,
      true,
      new HistoryReadBudget(historyLimits),
      control,
    ),
  );
  assert.equal(f.db.isTransaction, false);
});
test('one workspace WAL view binds activation and document despite a writer between both components', async (t) => {
  const f = await runtimeFixture(t),
    writer = new DatabaseSync(f.path, { enableForeignKeyConstraints: true });
  f.connections.push(writer);
  const writerStore = new api.ContractStore(writer, 'ws:one', [f.repo]),
    writerDocs = new DocumentStore(writer, 'ws:one');
  const prepare = f.db.prepare.bind(f.db);
  let changed = false;
  f.db.prepare = (sql) => {
    if (!changed && sql.includes('FROM "documents"')) {
      changed = true;
      assert.equal(
        writerStore.applyWorkspaceBatch(
          { ...f.batch, expectedOldActivationId: f.applied.activationId },
          historyLimits,
        ).status,
        'COMMITTED',
      );
      writerDocs.applyDocuments(
        { bundle: bundle('rev:two', 'b'), expectedCurrentRevisionId: 'rev:one' },
        limits,
        control,
      );
    }
    return prepare(sql);
  };
  let got;
  try {
    got = api.captureWorkspaceCompilationInputs(
      f.store,
      'set:runtime',
      selection,
      f.repositories,
      true,
      new HistoryReadBudget(historyLimits),
      control,
    );
  } finally {
    f.db.prepare = prepare;
  }
  assert.equal(changed, true);
  assert.equal(got.view.workspaceRuntime.activationId, f.applied.activationId);
  assert.equal(got.view.documents[0].revisionId, 'rev:one');
  assert.throws(
    () =>
      api.recheckWorkspaceCompilationInputs(
        f.store,
        got.handle,
        f.repositories,
        new HistoryReadBudget(historyLimits),
        control,
      ),
    /CHANGED/,
  );
  assert.equal(f.db.isTransaction, false);
});
test('COMMIT acknowledgement cannot transfer a capture to a reopened connection', async (t) => {
  const f = await setup(t),
    exec = f.db.exec.bind(f.db);
  f.db.exec = (sql) => {
    exec(sql);
    if (sql === 'COMMIT') {
      f.db.close();
      f.db.open();
    }
  };
  try {
    assert.throws(() => capture(f), HistoryCaptureError);
  } finally {
    f.db.exec = exec;
  }
  assert.equal(f.db.isTransaction, false);
});
import { readFileSync } from 'node:fs';
test('private workspace declarations preserve IR named types without undeclared zod imports', () => {
  const declaration = readFileSync(
    new URL('../dist/runtime/contract-store.d.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(declaration, /import\(['"]zod['"]\)/);
});

import { readFile } from 'node:fs/promises';
import { prepareSnapshotSchemas } from '../dist/knowledge/snapshot-schema.js';
for (const version of [9, 10])
  test(
    'exact workspace schema' + version + ' retains full compilation capture validation',
    async (t) => {
      const f = await setup(t);
      await prepareSnapshotSchemas();
      for (let v = 9; v <= version; v++) {
        f.db.exec(
          await readFile(
            new URL(
              '../migrations/workspace-proposed/' +
                (v === 9 ? '009_knowledge.sql' : '010_lifecycle.sql'),
              import.meta.url,
            ),
            'utf8',
          ),
        );
        f.db.exec('PRAGMA user_version=' + v);
      }
      f.db.exec('PRAGMA query_only=ON');
      const got = capture(f);
      assert.equal(got.view.documents[0].revisionId, 'rev:one');
      api.recheckWorkspaceCompilationInputs(f.store, got.handle, [], budget(), control);
      api.releaseWorkspaceCompilationInputs(f.store, got.handle);
      f.db.exec('PRAGMA query_only=OFF; DROP TRIGGER proposed_knowledge_revisions_no_update');
      assert.throws(() => capture(f));
      assert.equal(f.db.isTransaction, false);
    },
  );
