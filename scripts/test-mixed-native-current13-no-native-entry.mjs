// Private offline no-Native current13 entry evidence; no real child process or authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createCurrent13NoNativeEntryFixture,
  noNativeEvidenceRoot,
} from './mixed-native-current13-no-native-fixture.mjs';
import { runMixedNativeHostOperation } from './mixed-native-current13-operation.mjs';
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';

const graphTables = [
  'provider_snapshots',
  'provider_capabilities',
  'canonical_nodes',
  'canonical_edges',
  'evidence',
  'provider_fact_bindings',
  'fact_evidence',
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
function inspect(f, run) {
  const db = new DatabaseSync(f.operation.database.databasePath, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  try {
    return run(db, new RuntimeFactStore(db, f.operation.repository.id));
  } finally {
    db.close();
  }
}
const rows = (db, table) =>
  db
    .prepare('SELECT * FROM ' + table)
    .all()
    .map((r) => ({ ...r }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const image = (db) => Object.fromEntries(graphTables.map((t) => [t, rows(db, t)]));
const readCurrent = (store) => {
  const live = store.readRuntimeBasis(historyLimits);
  return {
    trace: store.traceRuntimeV2(historyLimits),
    inputs: store.readFrameworkInputsV2(live.identity, historyLimits),
  };
};
const assertCurrent = (f, store) => {
  const { trace, inputs } = readCurrent(store);
  assert.equal(trace.status, 'CURRENT');
  assert.deepEqual(inputs.sourceFiles.map((s) => [s.path, s.contentFingerprint]).sort(), [
    [f.originalP5.path, f.originalP5.contentFingerprint],
  ]);
  return { trace, inputs };
};

// Characterization RED boundary: these refusals explain the old caller sequence;
// passing this case does not claim a complete no-Native business entry.
test('component old early bindAnalysis refuses pending SOURCE slots without inventing ANALYSIS', async (t) => {
  const f = await dynamicOwnerFixture(t, 'repo:owned'),
    first = f.request.slots[0];
  f.request.slots = [
    { ...first, launchId: 'initial', role: 'GIT', phase: 'SOURCE' },
    { ...first, launchId: 'final', role: 'GIT', phase: 'SOURCE' },
  ];
  const owner = await f.bind();
  assert.equal(
    owner.bootstrap().slots.every((s) => s.role === 'GIT' && s.phase === 'SOURCE'),
    true,
  );
  assert.throws(
    () => owner.bindAnalysis(null, null, historyLimits, {}),
    (e) => e.code === 'INVALID_MIXED_NATIVE_DYNAMIC_OWNER',
  );
  assert.deepEqual(f.messages, []);
});

for (const scenario of ['no-op', 'deletion'])
  test('component actual Source baseline ' + scenario, async (t) => {
    const f = await createCurrent13NoNativeEntryFixture(t, scenario, 'baseline');
    inspect(f, (db, store) => {
      const { trace, inputs } = readCurrent(store);
      assert.equal(trace.activationId, f.baseline.runtimeActivationId);
      assert.equal(trace.status, 'CURRENT');
      assert.equal(inputs.sourceFiles.length, scenario === 'no-op' ? 1 : 2);
      assert.equal(f.state.calls, f.state.closes);
      t.diagnostic(
        'BASELINE=' +
          JSON.stringify({
            scenario,
            paths: inputs.sourceFiles.map((s) => s.path),
            origins: f.baseline.origins.length,
            sourceRevision: f.baseline.sourceRevision,
            gitHead: f.baseline.gitHead,
          }),
      );
    });
  });

for (const delivery of ['direct', 'closedgraph'])
  for (const scenario of ['no-op', 'deletion'])
    test(
      delivery +
        ' ' +
        (scenario === 'no-op'
          ? 'unchanged NO_OP actual entry retains current ids and all graph tables without Native'
          : 'deletion only actual entry removes P1 and retains P5 without Native'),
      async (t) => {
        const f = await createCurrent13NoNativeEntryFixture(t, scenario, delivery);
        const before = inspect(f, (db, store) => ({ image: image(db), ...readCurrent(store) }));
        let outcome;
        try {
          outcome =
            delivery === 'direct'
              ? {
                  value: await runMixedNativeHostOperation(
                    { ownerInput: f.ownerInput },
                    { incoming: f.incoming, outgoing: f.outgoing },
                  ),
                }
              : await runFixedMixedNativeHostBootstrap(f.argv, f.env, {
                  incoming: f.incoming,
                  outgoing: f.outgoing,
                });
        } catch (e) {
          t.diagnostic(
            'BOUNDARY=' + JSON.stringify({ code: e.code, step: e.step, effects: e.effects }),
          );
          throw e;
        }
        assert.equal(outcome.value.kind, f.expected.scenarios[scenario].expectedKind);
        assert.equal(outcome.value.effects.sourceCommit, 'COMMITTED');
        assert.equal(outcome.value.effects.cleanupFailed, false);
        assert.equal(f.nativeCalls(), 0);
        assert.equal(f.state.calls, 16);
        assert.equal(f.state.closes, 16);
        const registers = f.messages.filter((m) => m.type === 'REGISTER');
        for (const type of ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'])
          assert.equal(f.messages.filter((m) => m.type === type).length, 16);
        for (const type of ['BOUND', 'READY', 'ACQUIRED', 'RELEASED'])
          assert.equal(f.replies.filter((m) => m.type === type).length, 16);
        assert.equal(
          f.messages.some((m) => m.type === 'ABANDON'),
          false,
        );
        assert.deepEqual(
          registers.map((m) => [m.role, m.phase, m.contextDigest]),
          Array.from({ length: 16 }, () => ['GIT', 'SOURCE', f.sourceContextDigest]),
        );
        assert.deepEqual(
          f.replies
            .filter((m) => m.type === 'RELEASED')
            .map((m) => m.launchId)
            .sort(),
          registers.map((m) => m.launchId).sort(),
        );
        let details;
        inspect(f, (db, store) => {
          const { trace, inputs } = assertCurrent(f, store);
          assert.equal(trace.activationId, outcome.value.runtimeActivationId);
          assert.equal(trace.identity.syntaxActivationId, outcome.value.syntaxActivationId);
          assert.deepEqual(trace.identity.codeBasis, outcome.value.basis);
          if (scenario === 'no-op') {
            assert.deepEqual(image(db), before.image);
            assert.equal(trace.activationId, before.trace.activationId);
            assert.equal(
              trace.identity.syntaxActivationId,
              before.trace.identity.syntaxActivationId,
            );
            assert.deepEqual(trace.candidate, before.trace.candidate);
            assert.equal(outcome.value.effects.graphCommit, 'NOT_ATTEMPTED');
          } else {
            assert.equal(outcome.value.effects.graphCommit, 'COMMITTED');
            assert.notEqual(trace.activationId, before.trace.activationId);
            const origins = rows(db, 'syntax_origins'),
              projections = rows(db, 'syntax_projections');
            assert.deepEqual(origins, before.image.syntax_origins);
            for (const old of before.image.syntax_projections)
              assert.ok(projections.some((row) => JSON.stringify(row) === JSON.stringify(old)));
            const members = db
              .prepare('SELECT origin_id FROM activation_syntax_members WHERE activation_id=?')
              .all(trace.identity.syntaxActivationId)
              .map((m) => m.origin_id);
            const oldInputs = before.inputs,
              p1 = oldInputs.sourceFiles.find((s) => s.path === f.originalP1.path),
              p5 = oldInputs.sourceFiles.find((s) => s.path === f.originalP5.path);
            assert.ok(p1 && p5);
            const p1Origins = oldInputs.syntaxEvidence
              .filter((s) => s.sourceRange.sourceFileId === p1.id)
              .map((s) => s.id);
            const p5Origins = oldInputs.syntaxEvidence
              .filter((s) => s.sourceRange.sourceFileId === p5.id)
              .map((s) => s.id);
            assert.ok(p1Origins.length > 0);
            assert.ok(p5Origins.length > 0);
            // Current Syntax ids are projection identities; match immutable origins by their actual source anchor.
            const originSources = origins.map((o) => ({
              id: o.id,
              value: JSON.parse(o.origin_json),
            }));
            const sourceId = (o) => o.value.sourceFile.id;
            const oldP1 = originSources.filter((o) => sourceId(o) === p1.id),
              oldP5 = originSources.filter((o) => sourceId(o) === p5.id);
            assert.ok(oldP1.length > 0, 'original P1 origins have exact Source anchor');
            assert.ok(oldP5.length > 0, 'original P5 origins have exact Source anchor');
            assert.ok(oldP1.every((o) => !members.includes(o.id)));
            assert.ok(oldP5.every((o) => members.includes(o.id)));
            assert.equal(
              inputs.nodes.some((n) => n.sourceRange?.sourceFileId === p1.id),
              false,
            );
            details = {
              removedP1Origins: oldP1.length,
              retainedP5Origins: oldP5.length,
              currentMembers: members.length,
            };
          }
          details = {
            ...details,
            runtimeStatus: trace.status,
            runtimeActivationId: trace.activationId,
            sourcePaths: inputs.sourceFiles.map((s) => s.path),
          };
        });
        for (const flag of f.expected.flagsFalse) assert.equal(outcome.value[flag], false);
        const summary = {
          kind: 'CURRENT13_NO_NATIVE_OFFLINE_ENTRY',
          scenario,
          delivery,
          ...details,
          audit: {
            registers: 16,
            released: 16,
            gitCalls: 16,
            gitCloses: 16,
            nativeCalls: 0,
            phases: ['SOURCE'],
            sourceDigestNotAnalysisAuthority: true,
          },
          graph: {
            modules: f.graph.hostModuleArtifactIds.length,
            edges: f.graph.edges.length,
            artifacts: f.graph.artifacts.length,
            sourceInputs: f.graph.sourceFiles.length,
          },
          flags: Object.fromEntries(f.expected.flagsFalse.map((k) => [k, outcome.value[k]])),
        };
        fs.writeFileSync(
          path.join(noNativeEvidenceRoot, delivery + '-' + scenario + '-entry-summary.json'),
          JSON.stringify(summary, null, 2) + '\n',
          { flag: 'wx' },
        );
        t.diagnostic('RESULT=' + JSON.stringify(summary));
      },
    );

for (const variant of [
  'requires-native',
  'route-change',
  'head-drift',
  'source-drift',
  'ignored-config',
  'ignored-drift',
  'cancel-final',
  'unexpected-command',
  'unsettled-cleanup',
])
  test('direct boundary ' + variant, async (t) => {
    const f = await createCurrent13NoNativeEntryFixture(t, 'no-op', 'direct', variant);
    const before = inspect(f, (db, store) => ({
      image: image(db),
      trace: store.traceRuntimeV2(historyLimits),
      source: { revisions: rows(db, 'revisions'), files: rows(db, 'source_files') },
    }));
    let outcome, error;
    try {
      outcome = await runMixedNativeHostOperation(
        { ownerInput: f.ownerInput },
        { incoming: f.incoming, outgoing: f.outgoing },
      );
    } catch (e) {
      error = e;
    }
    assert.equal(f.nativeCalls(), 0);
    if (variant === 'ignored-config') {
      assert.ifError(error);
      assert.equal(outcome.kind, 'NO_OP');
      assert.equal(outcome.runtimeActivationId, before.trace.activationId);
    } else {
      assert.equal(error?.code, 'CURRENT13_OPERATION_FAILED');
      assert.equal(error.effects.graphCommit, 'NOT_ATTEMPTED');
      assert.equal(
        error.effects.cleanupFailed,
        ['cancel-final', 'unsettled-cleanup'].includes(variant),
      );
      if (variant === 'requires-native') assert.equal(f.state.calls, 8);
      if (['head-drift', 'source-drift', 'ignored-drift'].includes(variant))
        assert.equal(f.driftInjected(), true);
    }
    inspect(f, (db, store) => {
      assert.deepEqual(image(db), before.image);
      if (['route-change', 'ignored-config'].includes(variant))
        assert.deepEqual(
          { revisions: rows(db, 'revisions'), files: rows(db, 'source_files') },
          before.source,
          'Runtime route/config comparison uses unchanged actual Source rows',
        );
      assert.equal(store.traceRuntimeV2(historyLimits).activationId, before.trace.activationId);
    });
    assert.equal(f.state.calls, f.state.closes);
    const summary = {
      variant,
      result: error ? 'REFUSED' : 'NO_OP',
      step: error?.step ?? null,
      nativeCalls: f.nativeCalls(),
      gitCalls: f.state.calls,
      gitCloses: f.state.closes,
      graphImageUnchanged: true,
      driftInjected: f.driftInjected(),
      historicalConfigIdentity: 'NOT_CLAIMED',
    };
    fs.writeFileSync(
      path.join(noNativeEvidenceRoot, 'direct-' + variant + '-summary.json'),
      JSON.stringify(summary, null, 2) + '\n',
      { flag: 'wx' },
    );
    t.diagnostic('BOUNDARY=' + JSON.stringify(summary));
  });
