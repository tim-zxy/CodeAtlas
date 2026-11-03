import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { historyFixture, historyLimits, prefixPlan } from './helpers/r011-history-fixture.mjs';
import { loadMigrationPlan } from '../dist/index.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { RuntimeFactStore } from '../dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../dist/runtime/contract-store.js';
import { workspaceRuntimeInputDigestV2 } from '@codeatlas/ir';
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

test('workspace declared-schema Store authenticates Source before decode, keeps SQL1 JSON2 and reopens immutable evidence', async (t) => {
  assert.equal(typeof ContractStore.prototype.applyWorkspaceBatchV2, 'function');
  const f = await historyFixture(t);
  applyMigrationPlan(f.db, await prefixPlan(13));
  const repo = new RuntimeFactStore(f.db, f.input.repositoryId),
    basis = repo.readRuntimeBasis(historyLimits).identity;
  repo.applyRuntimeBatch({ expected: basis, candidate: empty(basis.codeBasis) }, historyLimits);
  const c = repo.readRuntimeBasis(historyLimits),
    trace = repo.traceRuntime(historyLimits),
    binding = {
      repoBasis: c.identity.codeBasis,
      syntaxActivationId: c.identity.syntaxActivationId,
      syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
      runtimeActivationId: c.identity.runtimeActivationId,
      runtimeCandidateDigest: trace.identity.candidateDigest,
    };
  const dbPath = f.directory + '/schema-workspace.sqlite',
    db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  f.connections.push(db);
  applyMigrationPlan(
    db,
    await loadMigrationPlan(
      new URL('../migrations/workspace/manifest.json', import.meta.url),
      'WORKSPACE',
    ),
  );
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
    binding.repoBasis.repositoryId,
    binding.repoBasis.revisionId,
    binding.repoBasis.contentFingerprint,
  );
  db.prepare("UPDATE revision_sets SET frozen=1 WHERE id='set:owned'").run();
  const wb = {
      workspaceId: 'workspace:owned',
      revisionSetId: 'set:owned',
      workspaceActivationDigest: '0'.repeat(64),
    },
    frozen = {
      workspaceBasis: wb,
      repositoryBindings: [binding],
      catalog: { workspaceBasis: wb, services: [], entries: [], contractBindings: [] },
      contractRefs: [],
      matchingPolicyVersion: 'declared-http-schema-v1',
      schemaDocuments: [],
    };
  wb.workspaceActivationDigest = workspaceRuntimeInputDigestV2(frozen);
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
    },
    batch = { expectedOldActivationId: null, frozen, matches: [], execution },
    store = new ContractStore(db, 'workspace:owned', [repo]);
  assert.equal(
    store.readWorkspaceInputsV2(frozen, historyLimits, historyLimits.maxSerializedBytes).graphs
      .length,
    1,
  );
  const forged = structuredClone(frozen);
  forged.schemaDocuments = JSON.parse(
    (await import('node:fs')).readFileSync(
      new URL(
        '../../../fixtures/phase1/contract-matching/declared-schema-inputs.json',
        import.meta.url,
      ),
    ),
  ).input.schemaDocuments;
  assert.throws(
    () => store.readWorkspaceInputsV2(forged, historyLimits, historyLimits.maxSerializedBytes),
    /WORKSPACE_SCHEMA_SOURCE_CHANGED/,
  );
  assert.throws(() => store.applyWorkspaceBatch(batch, historyLimits));
  const result = store.applyWorkspaceBatchV2(
    batch,
    historyLimits,
    historyLimits.maxSerializedBytes,
  );
  assert.equal(result.status, 'COMMITTED');
  const row = db
    .prepare('SELECT schema_version,payload_json FROM workspace_runtime_activations')
    .get();
  assert.equal(row.schema_version, 1);
  assert.equal(JSON.parse(row.payload_json).formatVersion, 2);
  assert.throws(() => store.traceWorkspaceRuntime(historyLimits));
  const ro = new DatabaseSync(dbPath, { readOnly: true, enableForeignKeyConstraints: true });
  try {
    const opened = new ContractStore(ro, 'workspace:owned', [repo]).traceWorkspaceRuntimeV2(
      historyLimits,
    );
    assert.equal(opened.status, 'CURRENT');
    assert.equal(opened.evidenceScope, 'EXPLICIT_DECLARED_HTTP_SCHEMA');
    assert.deepEqual(opened.frozen, frozen);
  } finally {
    ro.close();
  }
  assert.equal(store.inspectOutcome(historyLimits).status, 'COMMITTED');
  const original = db
    .prepare('SELECT * FROM workspace_runtime_activations WHERE id=?')
    .get(result.activationId);
  for (const [index, change] of [
    (v) => (v.formatVersion = 99),
    (v) => (v.unapproved = true),
  ].entries()) {
    const payload = JSON.parse(original.payload_json);
    change(payload);
    const raw = JSON.stringify(payload),
      row = {
        ...original,
        id: 'workspace-runtime-activation:invalid:' + index,
        parent_id: result.activationId,
        payload_json: raw,
        value_digest: 'PLACEHOLDER',
      };
    const { createHash } = await import('node:crypto');
    row.value_digest = createHash('sha256')
      .update('runtime-storage-value-v1\0' + raw)
      .digest('hex');
    const keys = Object.keys(row);
    db.prepare(
      'INSERT INTO workspace_runtime_activations(' +
        keys.join(',') +
        ')VALUES(' +
        keys.map(() => '?').join(',') +
        ')',
    ).run(...keys.map((k) => row[k]));
    db.prepare('UPDATE workspace_runtime_state SET activation_id=? WHERE workspace_id=?').run(
      row.id,
      'workspace:owned',
    );
    try {
      assert.throws(() => store.traceWorkspaceRuntimeV2(historyLimits));
    } finally {
      db.prepare('UPDATE workspace_runtime_state SET activation_id=? WHERE workspace_id=?').run(
        result.activationId,
        'workspace:owned',
      );
    }
  }
});
