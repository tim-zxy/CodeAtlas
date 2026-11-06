// Local current13-to-workspace integration helper; consumes only published repository facts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { ContractStore } from '../packages/storage/dist/runtime/contract-store.js';
import { loadMigrationPlan } from '../packages/storage/dist/index.js';
import { applyMigrationPlan } from '../packages/storage/dist/migrations/runner.js';
import { composeMatchedWorkspaceRuntimeV2 } from '../packages/runtime/dist/runtime-fact-composition.js';
import { canonicalRuntimeJson, workspaceRuntimeInputDigestV2 } from '../packages/ir/dist/index.js';
import { workflowRequest } from '../packages/runtime/test/helpers/framework-surface-stage.mjs';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expected = Object.freeze({ matches: 2, httpEdges: 1, method: 'GET', path: '/items' });
function request(operation) {
  const value = workflowRequest(null, operation);
  value.workspaceId = 'workspace:owned';
  value.repositoryId = null;
  value.policy.permissionContext.repositoryIds = null;
  return value;
}
function repositoryRef(snapshot, kind, id) {
  const basis = snapshot.binding.repoBasis;
  return {
    scope: 'REPOSITORY',
    repositoryId: basis.repositoryId,
    entity: { kind, id, revisionId: basis.revisionId },
  };
}
async function snapshot(repo, connections) {
  const db = new DatabaseSync(repo.databasePath, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  connections.push(db);
  const stored = db.prepare('SELECT id,root_path FROM repository').get();
  assert.equal(stored.id, repo.repositoryId);
  assert.equal(path.resolve(stored.root_path), path.resolve(repo.sourceRoot));
  const store = new RuntimeFactStore(db, repo.repositoryId);
  const live = store.readRuntimeBasis(historyLimits);
  const trace = store.traceRuntimeV2(historyLimits);
  assert.equal(trace.status, 'CURRENT', 'FULL entry must publish before workspace capture');
  assert.ok(trace.activationId);
  assert.equal(trace.activationId, live.runtimeActivationId);
  const view = store.readFrameworkInputsV2(live.identity, historyLimits);
  const codeSource = view.sourceFiles.find((f) => f.path === repo.expectedSource.path);
  assert.ok(codeSource, 'original code Source must remain captured');
  const codeBytes = await fs.readFile(path.join(repo.sourceRoot, repo.expectedSource.path));
  assert.equal(hash(codeBytes), repo.expectedSource.sha256);
  assert.equal(codeSource.contentFingerprint, 'sha256:' + repo.expectedSource.sha256);
  assert.equal(codeSource.revisionId, live.identity.codeBasis.revisionId);
  const doc = repo.schemaDocument;
  assert.ok(!path.isAbsolute(doc.path));
  const documentPath = path.resolve(repo.sourceRoot, doc.path);
  assert.ok(documentPath.startsWith(path.resolve(repo.sourceRoot) + path.sep));
  const bytes = await fs.readFile(documentPath);
  assert.equal(hash(bytes), doc.sha256);
  assert.equal(bytes.toString('utf8'), doc.contentUtf8);
  const sourceFile = view.sourceFiles.find((f) => f.path === doc.path);
  assert.ok(sourceFile, 'schema must be an actual current Source file');
  assert.equal(sourceFile.contentFingerprint, 'sha256:' + doc.sha256);
  assert.deepEqual(sourceFile.classification, {
    role: 'OTHER',
    provenance: 'AUTHORED',
    contentKind: 'TEXT',
  });
  const schema = JSON.parse(doc.contentUtf8);
  assert.equal(schema.schema, 'codeatlas.declared-http-schema');
  assert.equal(schema.version, 1);
  assert.deepEqual(
    schema.bindings.map((b) => b.contractFactKey).sort(),
    [...doc.contractFactKeys].sort(),
  );
  for (const binding of schema.bindings) {
    assert.deepEqual(binding.query, { kind: 'ABSENT' });
    assert.deepEqual(binding.request, { kind: 'ABSENT' });
    assert.deepEqual(binding.response, { kind: 'JSON_STRING', mediaType: 'application/json' });
  }
  const selected = trace.candidate.facts.payload.contracts.filter((c) =>
    doc.contractFactKeys.includes(c.factKey),
  );
  assert.equal(selected.length, doc.contractFactKeys.length);
  for (const contract of selected) {
    assert.equal(contract.protocol, 'HTTP');
    assert.equal(contract.signature.method, expected.method);
    assert.deepEqual(contract.signature.pathSegments, [{ kind: 'LITERAL', value: 'items' }]);
    assert.equal(contract.signature.querySchemaRef, null);
    assert.equal(contract.signature.requestSchemaRef, null);
    assert.equal(contract.signature.responseSchemaRef, null);
  }
  const sourceSupport = {
    basis: live.identity.codeBasis,
    entity: { kind: 'SOURCE_FILE', id: sourceFile.id, revisionId: sourceFile.revisionId },
    valueDigest: hash('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(sourceFile)),
  };
  return {
    repo,
    store,
    trace,
    selected,
    proof: { sourceFile, sourceSupport, contentUtf8: doc.contentUtf8 },
    binding: {
      repoBasis: live.identity.codeBasis,
      syntaxActivationId: live.identity.syntaxActivationId,
      syntaxMembershipDigest: live.identity.syntaxMembershipDigest,
      runtimeActivationId: live.identity.runtimeActivationId,
      runtimeCandidateDigest: trace.identity.candidateDigest,
    },
  };
}

export async function composeCurrent13Workspace(t, repos) {
  assert.equal(repos.length, 2);
  assert.notEqual(repos[0].repositoryId, repos[1].repositoryId);
  const temp = path.resolve(tmpdir());
  const root = await fs.mkdtemp(path.join(temp, 'codeatlas-current13-workspace-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), temp);
    assert.ok(path.basename(root).startsWith('codeatlas-current13-workspace-'));
    await fs.rm(root, { recursive: true });
  });
  const connections = [];
  let workspace;
  try {
    const snapshots = [];
    for (const repo of repos) snapshots.push(await snapshot(repo, connections));
    const caller = snapshots.find((s) => s.selected.length === 2);
    const provider = snapshots.find((s) => s.selected.length === 1);
    assert.ok(caller && provider && caller !== provider);
    assert.ok(caller.selected.every((c) => c.direction === 'CONSUMER'));
    assert.equal(provider.selected[0].direction, 'PROVIDER');
    const wb = {
      workspaceId: 'workspace:owned',
      revisionSetId: 'set:current13-entry',
      workspaceActivationDigest: '0'.repeat(64),
    };
    const serviceRef = {
      scope: 'WORKSPACE',
      workspaceId: wb.workspaceId,
      entity: { kind: 'SERVICE', id: 'service:inventory', revisionId: wb.revisionSetId },
    };
    const support = provider.trace.candidate.facts.payload.supportInventory.filter(
      (s) => s.entity.kind === 'SOURCE_FILE',
    );
    assert.ok(support.length);
    // Explicit fixture service identity mapping, as in T4; matching is computed by Application.
    const frozen = {
      workspaceBasis: wb,
      repositoryBindings: snapshots.map((s) => s.binding),
      catalog: {
        workspaceBasis: wb,
        services: [
          {
            id: 'service:inventory',
            factKey: 'service:inventory',
            logicalServiceKey: 'inventory',
            location: 'WORKSPACE',
            repositoryRef: repositoryRef(provider, 'REPOSITORY', provider.repo.repositoryId),
            supportRefs: support,
          },
        ],
        entries: [
          {
            id: 'identity:inventory',
            factKey: 'identity:inventory',
            serviceRef,
            sourceBasis: provider.binding.repoBasis,
            identityKind: 'LOGICAL_SERVICE',
            namespace: 'service',
            key: 'inventory',
            supportRefs: support,
          },
        ],
        contractBindings: provider.trace.candidate.facts.payload.contracts.map((c) => ({
          contractRef: repositoryRef(provider, 'CONTRACT', c.id),
          serviceRef,
          supportRefs: c.supportRefs,
        })),
      },
      contractRefs: snapshots.flatMap((s) =>
        s.trace.candidate.facts.payload.contracts.map((contract) => ({
          ref: repositoryRef(s, 'CONTRACT', contract.id),
          contract,
        })),
      ),
      matchingPolicyVersion: 'declared-http-schema-v1',
      schemaDocuments: snapshots.map((s) => s.proof),
    };
    wb.workspaceActivationDigest = workspaceRuntimeInputDigestV2(frozen);
    const databasePath = path.join(root, 'workspace.sqlite');
    const file = await fs.open(databasePath, 'wx');
    await file.close();
    workspace = new DatabaseSync(databasePath, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    applyMigrationPlan(
      workspace,
      await loadMigrationPlan(
        new URL('../packages/storage/migrations/workspace/manifest.json', import.meta.url),
        'WORKSPACE',
      ),
    );
    // Owned workspace topology only: no canonical Runtime or MATCHED SQL seed.
    workspace
      .prepare('INSERT INTO workspace(slot,id,root_path)VALUES(1,?,?)')
      .run(wb.workspaceId, root);
    workspace
      .prepare('INSERT INTO revision_sets(id,workspace_id,created_at,frozen)VALUES(?,?,0,0)')
      .run(wb.revisionSetId, wb.workspaceId);
    for (const s of snapshots) {
      workspace
        .prepare('INSERT INTO repositories(repository_id,workspace_id,root_path)VALUES(?,?,?)')
        .run(s.repo.repositoryId, wb.workspaceId, s.repo.sourceRoot);
      workspace
        .prepare(
          'INSERT INTO revision_set_items(revision_set_id,repository_id,revision_id,revision_fingerprint)VALUES(?,?,?,?)',
        )
        .run(
          wb.revisionSetId,
          s.repo.repositoryId,
          s.binding.repoBasis.revisionId,
          s.binding.repoBasis.contentFingerprint,
        );
    }
    workspace.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run(wb.revisionSetId);
    const stores = snapshots.map((s) => s.store);
    const store = new ContractStore(workspace, wb.workspaceId, stores);
    const composition = composeMatchedWorkspaceRuntimeV2({
      workspaceId: wb.workspaceId,
      store,
      limits: historyLimits,
      frozen,
      maxInputBytes: historyLimits.maxSerializedBytes,
    });
    const outcome = await composition.refresh(request('INDEX'));
    assert.equal(outcome.status, 'COMMITTED');
    const actual = composition.trace(request('QUERY'));
    assert.equal(actual.status, 'CURRENT');
    assert.equal(actual.matches.length, expected.matches);
    assert.ok(actual.matches.every((m) => m.payload.status === 'MATCHED'));
    assert.equal(actual.execution.payload.coverage.status, 'COMPLETE');
    const httpEdges = actual.execution.payload.edges.filter((e) => e.transitionKind === 'HTTP');
    assert.equal(httpEdges.length, expected.httpEdges);
    assert.ok(httpEdges[0].supportRefs.length > 0);
    assert.equal(actual.evidenceScope, 'EXPLICIT_DECLARED_HTTP_SCHEMA');
    assert.deepEqual(actual.frozen.repositoryBindings, frozen.repositoryBindings);
    assert.equal(actual.frozen.schemaDocuments.length, 2);
    assert.ok(actual.frozen.schemaDocuments.every((d) => d.contentUtf8.length > 0));
    workspace.close();
    workspace = null;
    const reopened = new DatabaseSync(databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    try {
      const fresh = new ContractStore(reopened, wb.workspaceId, stores).traceWorkspaceRuntimeV2(
        historyLimits,
      );
      assert.deepEqual(fresh, actual);
    } finally {
      reopened.close();
    }
    return {
      kind: 'CURRENT13_TWO_REPOSITORY_WORKSPACE_PUBLICATION',
      status: 'CURRENT',
      activationId: outcome.activationId,
      matches: actual.matches.length,
      matchResults: actual.matches.map((m) => m.payload),
      httpInvocationEdges: httpEdges.length,
      httpEdge: httpEdges[0],
      repositoryBindings: actual.frozen.repositoryBindings,
      schemaDocuments: snapshots.map((s) => ({
        repositoryId: s.repo.repositoryId,
        path: s.repo.schemaDocument.path,
        sha256: s.repo.schemaDocument.sha256,
        sourceFileId: s.proof.sourceFile.id,
      })),
      readonlyReopenEqual: true,
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
    };
  } finally {
    try {
      workspace?.close();
    } finally {
      for (const db of connections.reverse()) db.close();
    }
  }
}
