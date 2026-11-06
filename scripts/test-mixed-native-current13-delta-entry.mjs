import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
let createFixture;
try {
  ({ createCurrent13DeltaEntryFixture: createFixture } =
    await import('./mixed-native-current13-product-fixture.mjs'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
test('fixed bootstrap actual additive DELTA observes P1 only and atomically retains P5 through final Git', async (t) => {
  assert.equal(typeof createFixture, 'function');
  const f = await createFixture(t);
  const outcome = await runFixedMixedNativeHostBootstrap(f.argv, f.env, {
    incoming: f.incoming,
    outgoing: f.outgoing,
  });
  assert.equal(outcome.value.kind, 'COMMITTED');
  assert.equal(outcome.value.effects.graphCommit, 'COMMITTED');
  assert.equal(outcome.value.effects.sourceCommit, 'COMMITTED');
  assert.equal(outcome.value.effects.cleanupFailed, false);
  assert.equal(f.nativeCalls(), 1);
  assert.equal(f.state.calls, f.state.closes);
  const registers = f.messages.filter((m) => m.type === 'REGISTER');
  assert.equal(registers.length, 17);
  assert.ok(registers.every((m) => /^[a-f0-9]{64}$/.test(m.contextDigest)));
  for (const type of ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'])
    assert.equal(f.messages.filter((m) => m.type === type).length, 17);
  for (const type of ['BOUND', 'READY', 'ACQUIRED', 'RELEASED'])
    assert.equal(f.replies.filter((m) => m.type === type).length, 17);
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
  assert.deepEqual(
    registers.map((m) => [m.role, m.phase]),
    [
      ...Array.from({ length: 8 }, () => ['GIT', 'SOURCE']),
      ['SURFACE_V8', 'ANALYSIS'],
      ...Array.from({ length: 8 }, () => ['GIT', 'ANALYSIS']),
    ],
  );
  assert.ok(registers.slice(9).every((m) => m.contextDigest === registers[8].contextDigest));
  const db = new DatabaseSync(f.operation.database.databasePath, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  try {
    const trace = new RuntimeFactStore(db, f.operation.repository.id).traceRuntimeV2(historyLimits);
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.activationId, outcome.value.runtimeActivationId);
    assert.notEqual(trace.activationId, f.baseline.runtimeActivationId);
    assert.equal(trace.identity.syntaxActivationId, outcome.value.syntaxActivationId);
    assert.deepEqual(trace.identity.codeBasis, outcome.value.basis);
    const rows = (table) =>
      db
        .prepare('SELECT * FROM ' + table + ' ORDER BY id')
        .all()
        .map((x) => ({ ...x }));
    for (const [table, before] of [
      ['syntax_origins', f.baseline.origins],
      ['syntax_projections', f.baseline.projections],
    ])
      assert.ok(
        before.every((old) =>
          rows(table).some((row) => JSON.stringify(row) === JSON.stringify(old)),
        ),
      );
    const members = db
      .prepare('SELECT origin_id FROM activation_syntax_members WHERE activation_id=?')
      .all(outcome.value.syntaxActivationId);
    assert.ok(f.baseline.origins.every((old) => members.some((m) => m.origin_id === old.id)));
    assert.ok(members.length > f.baseline.origins.length);
    const inputs = new RuntimeFactStore(db, f.operation.repository.id).readFrameworkInputsV2(
      new RuntimeFactStore(db, f.operation.repository.id).readRuntimeBasis(historyLimits).identity,
      historyLimits,
    );
    assert.deepEqual(
      inputs.sourceFiles.map((f) => f.path).sort(),
      [f.originalP1.path, f.originalP5.path].sort(),
    );
    assert.ok(f.baseline.nodeIds.every((id) => inputs.nodes.some((node) => node.id === id)));
    assert.ok(inputs.nodes.length > f.baseline.nodeIds.length);
  } finally {
    db.close();
  }
  for (const key of ['executionAuthorized', 'productionAdmission', 'measurementEligible'])
    assert.equal(outcome.value[key], false);
  t.diagnostic(
    'AUDIT=' +
      JSON.stringify({
        registers: registers.length,
        released: f.replies.filter((m) => m.type === 'RELEASED').length,
        native: f.nativeCalls(),
        gitCalls: f.state.calls,
        gitCloses: f.state.closes,
        modules: f.graph.hostModuleArtifactIds.length,
        edges: f.graph.edges.length,
        artifacts: f.graph.artifacts.length,
      }),
  );
  t.diagnostic(
    'ACTUAL_CURRENT13_ADDITIVE_DELTA_ENTRY;Source/Stage/Runtime/Store real;Git/Native/observer memory;original P1/P5 bytes;no FULL product-bootstrap/no same-file modification qualification',
  );
});
