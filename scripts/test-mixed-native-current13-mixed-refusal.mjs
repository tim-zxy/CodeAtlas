import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCurrent13MixedRefusalFixture } from './mixed-native-current13-mixed-fixture.mjs';
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';

const evidenceRoot = new URL(
  '../.superpowers/sdd/2026-11-05-current13-mixed-refusal/',
  import.meta.url,
);
const emptyTables = [
  'canonical_nodes',
  'canonical_edges',
  'evidence',
  'provider_fact_bindings',
  'fact_evidence',
  'provider_snapshots',
  'provider_capabilities',
  'syntax_origins',
  'syntax_projections',
  'activation_syntax_members',
  'activation_history',
  'active_history_pointer',
  'runtime_activations',
  'runtime_state',
  'runtime_domain_facts',
  'runtime_bindings',
  'runtime_support_membership',
  'execution_contexts',
  'execution_nodes',
  'execution_edges',
  'runtime_flows',
  'runtime_flow_steps',
];
test('complete mixed entry settles Java then refuses empty Surface response without graph publication', async (t) => {
  const f = await createCurrent13MixedRefusalFixture(t);
  let failure;
  try {
    await runFixedMixedNativeHostBootstrap(f.argv, f.env, {
      incoming: f.incoming,
      outgoing: f.outgoing,
    });
  } catch (error) {
    failure = error;
  }
  f.assertMemoryHealthy();
  assert.ok(failure, 'injected empty Surface must refuse');
  assert.equal(failure.code, 'CURRENT13_OPERATION_FAILED');
  assert.equal(failure.step, 'OWNED_SURFACE_V8');
  assert.deepEqual(failure.effects, {
    sourceCommit: 'COMMITTED',
    graphCommit: 'NOT_ATTEMPTED',
    activationId: null,
    cleanupFailed: false,
  });
  assert.deepEqual(
    f.nativeRequests.map((r) => r.protocolVersion),
    [2, 8],
  );
  assert.equal(f.nativeRequests[1].payload.owners.length, 10);
  assert.equal(
    f.nativeRequests[0].payload.providerSnapshotId,
    f.nativeRequests[1].payload.providerSnapshotId,
  );
  const registers = f.messages.filter((m) => m.type === 'REGISTER');
  assert.deepEqual(
    registers.map((m) => [m.role, m.phase]),
    [
      ...Array.from({ length: 8 }, () => ['GIT', 'SOURCE']),
      ['V2', 'ANALYSIS'],
      ['SURFACE_V8', 'ANALYSIS'],
    ],
  );
  for (const type of ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'])
    assert.equal(f.messages.filter((m) => m.type === type).length, 10);
  for (const type of ['BOUND', 'READY', 'ACQUIRED', 'RELEASED'])
    assert.equal(f.replies.filter((m) => m.type === type).length, 10);
  assert.equal(
    f.messages.some((m) => m.type === 'ABANDON'),
    false,
  );
  assert.deepEqual(
    f.replies
      .filter((m) => m.type === 'RELEASED')
      .map((m) => m.launchId)
      .sort(),
    registers.map((m) => m.launchId).sort(),
  );
  assert.equal(f.state.calls, 8);
  assert.equal(f.state.closes, 8);
  const db = new DatabaseSync(f.operation.database.databasePath, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  let counts, sourceFiles;
  try {
    counts = Object.fromEntries(
      emptyTables.map((table) => [table, db.prepare('SELECT count(*) AS n FROM ' + table).get().n]),
    );
    assert.ok(
      Object.values(counts).every((n) => n === 0),
      JSON.stringify(counts),
    );
    sourceFiles = db
      .prepare('SELECT path, content_fingerprint FROM source_files ORDER BY path')
      .all();
    assert.deepEqual(
      sourceFiles.map((s) => [s.path, s.content_fingerprint]).sort(),
      f.expected.sources.map((s) => [s.path, 'sha256:' + s.fileSha256]).sort(),
    );
  } finally {
    db.close();
  }
  const summary = {
    kind: 'CURRENT13_MIXED_SETTLED_JAVA_SURFACE_REFUSAL',
    failure: { code: failure.code, step: failure.step, effects: failure.effects },
    nativeProtocols: [2, 8],
    javaOwners: 10,
    rolesReleased: 10,
    gitCalls: 8,
    gitCloses: 8,
    finalGitNotEntered: true,
    sourceFiles,
    graphTableCounts: counts,
    injection:
      'Normally closed empty memory Surface stdout after original recorded streams strictly validate; artificial protocol truncation, not producer defect or killed-process proof',
    originalJavaValidation: f.originalJavaValidation,
    originalCombinedValidation: f.originalCombinedValidation,
    graph: {
      modules: f.graph.hostModuleArtifactIds.length,
      edges: f.graph.edges.length,
      artifacts: f.graph.artifacts.length,
      sourceInputs: f.graph.sourceFiles.length,
    },
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
    ownedPaths: [f.root, path.dirname(f.argv[0])],
  };
  fs.writeFileSync(
    new URL('entry-summary.json', evidenceRoot),
    JSON.stringify(summary, null, 2) + '\n',
    { flag: 'wx' },
  );
  t.diagnostic('RESULT=' + JSON.stringify(summary));
});
