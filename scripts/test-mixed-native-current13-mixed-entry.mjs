import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareCurrent13MixedLibraryInput,
  createCurrent13MixedEntryFixture,
  mixedEvidenceRoot,
} from './mixed-native-current13-mixed-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
const phase = process.argv[2];
assert.ok(['prepare', 'entry'].includes(phase), 'explicit prepare/entry phase required');
if (phase === 'prepare')
  test('prepare actual mixed Source/Java response shared ledger/Stage owners/combined V8 request', async (t) => {
    const summary = await prepareCurrent13MixedLibraryInput(t);
    assert.equal(summary.sourceFiles.length, 2);
    assert.ok(summary.owners.length > 0);
    assert.equal(summary.javaSnapshot, summary.surfaceSnapshot);
    t.diagnostic(
      'PREPARE=' +
        JSON.stringify({
          sourceFiles: summary.sourceFiles.length,
          javaOwners: summary.owners.length,
          sharedSourceHistory: summary.sharedSourceHistory,
        }),
    );
  });

if (phase === 'entry')
  test('actual FULL current13 mixed Java+Python shared-ledger entry publishes both frameworks after final Git', async (t) => {
    const f = await createCurrent13MixedEntryFixture(t);
    let outcome;
    try {
      outcome = await runFixedMixedNativeHostBootstrap(f.argv, f.env, {
        incoming: f.incoming,
        outgoing: f.outgoing,
      });
      f.assertMemoryHealthy();
    } catch (e) {
      f.assertMemoryHealthy();
      t.diagnostic(
        'BOUNDARY=' + JSON.stringify({ code: e.code, step: e.step, effects: e.effects }),
      );
      throw e;
    }
    assert.equal(outcome.value.kind, 'COMMITTED');
    assert.equal(outcome.value.effects.sourceCommit, 'COMMITTED');
    assert.equal(outcome.value.effects.graphCommit, 'COMMITTED');
    assert.equal(outcome.value.effects.cleanupFailed, false);
    assert.deepEqual(
      f.nativeRequests.map((r) => r.protocolVersion),
      [2, 8],
    );
    const [java, surface] = f.nativeRequests;
    assert.equal(java.payload.sourceFiles.length, 1);
    assert.equal(java.payload.sourceFiles[0].languageHint, 'java');
    assert.equal(surface.payload.sourceFiles.length, 2);
    assert.equal(surface.payload.owners.length, 10);
    assert.equal(java.payload.providerSnapshotId, surface.payload.providerSnapshotId);
    assert.equal(
      java.payload.revision.contentFingerprint,
      surface.payload.targetSource.contentFingerprint,
    );
    const registers = f.messages.filter((m) => m.type === 'REGISTER');
    assert.equal(registers.length, 18);
    for (const type of ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'])
      assert.equal(f.messages.filter((m) => m.type === type).length, 18);
    for (const type of ['BOUND', 'READY', 'ACQUIRED', 'RELEASED'])
      assert.equal(f.replies.filter((m) => m.type === type).length, 18);
    assert.deepEqual(
      registers.map((m) => [m.role, m.phase]),
      [
        ...Array.from({ length: 8 }, () => ['GIT', 'SOURCE']),
        ['V2', 'ANALYSIS'],
        ['SURFACE_V8', 'ANALYSIS'],
        ...Array.from({ length: 8 }, () => ['GIT', 'ANALYSIS']),
      ],
    );
    assert.ok(registers.every((m) => /^[a-f0-9]{64}$/.test(m.contextDigest)));
    assert.ok(registers.slice(9).every((m) => m.contextDigest === registers[8].contextDigest));
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
    assert.equal(f.state.calls, 16);
    assert.equal(f.state.closes, 16);
    const db = new DatabaseSync(f.operation.database.databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    let summary;
    try {
      const store = new RuntimeFactStore(db, f.operation.repository.id),
        trace = store.traceRuntimeV2(historyLimits);
      assert.equal(trace.status, 'CURRENT');
      assert.equal(trace.activationId, outcome.value.runtimeActivationId);
      assert.equal(trace.identity.syntaxActivationId, outcome.value.syntaxActivationId);
      assert.deepEqual(trace.identity.codeBasis, outcome.value.basis);
      const http = trace.candidate.facts.payload.contracts.filter(
        (c) => c.protocol === 'HTTP' && c.direction === 'PROVIDER',
      );
      const signatures = http.map((c) => ({
        method: c.signature.method,
        path:
          '/' +
          c.signature.pathSegments
            .map((p) => {
              assert.equal(p.kind, 'LITERAL');
              return p.value;
            })
            .join('/'),
      }));
      const sortedSignatures = (values) => values.map((s) => [s.method, s.path]).sort();
      assert.deepEqual(
        sortedSignatures(signatures),
        sortedSignatures(f.expected.runtimeExpectations.http),
      );
      const jobs = trace.candidate.facts.payload.tasks.filter((t) => t.taskKind === 'JOB');
      const live = store.readRuntimeBasis(historyLimits),
        inputs = store.readFrameworkInputsV2(live.identity, historyLimits);
      assert.deepEqual(
        inputs.sourceFiles.map((s) => [s.path, s.contentFingerprint]).sort(),
        f.expected.sources.map((s) => [s.path, 'sha256:' + s.fileSha256]).sort(),
      );
      const javaJobNames = jobs
        .map((job) => {
          assert.equal(job.implementationRef.entity.kind, 'CODE_NODE');
          const node = inputs.nodes.find((n) => n.id === job.implementationRef.entity.id);
          assert.ok(node, 'JOB implementation must resolve to current canonical Code node');
          return node.name;
        })
        .sort();
      assert.deepEqual(javaJobNames, [f.expected.runtimeExpectations.javaJob]);
      assert.ok(inputs.nodes.some((n) => n.qualifiedName === 'sourceproof.SpringSource'));
      assert.ok(inputs.nodes.some((n) => n.qualifiedName?.includes('handler')));
      const h = f.prepareSummary.sharedSourceHistory;
      assert.ok(h.afterJava.serializedBytes > h.beforeJava.serializedBytes);
      assert.ok(h.afterJava.items > h.beforeJava.items);
      assert.ok(h.afterStage.serializedBytes > h.afterJava.serializedBytes);
      summary = {
        kind: 'FULL_CURRENT13_MIXED_OFFLINE_ENTRY_SUCCESS',
        runtimeStatus: trace.status,
        httpProviders: signatures,
        javaJobNames,
        crossLanguageInvocationNegative: 'NOT_MEASURED',
        sourceFiles: inputs.sourceFiles.map((s) => ({
          id: s.id,
          path: s.path,
          contentFingerprint: s.contentFingerprint,
        })),
        javaOwners: surface.payload.owners.length,
        sharedSnapshot: surface.payload.providerSnapshotId,
        originalJavaValidation: f.originalJavaValidation,
        originalCombinedValidation: f.originalCombinedValidation,
        sharedHistoryEvidence: {
          scope:
            'Measured preparation ledger, full-entry internal values not exposed; actual entry original shared wiring executed for both roles',
          prepare: h,
        },
        audit: {
          registers: 18,
          released: 18,
          nativeRoles: ['V2', 'SURFACE_V8'],
          nativeCalls: 2,
          gitCalls: f.state.calls,
          gitCloses: f.state.closes,
          noNativeAfterFinalGit: true,
        },
        graph: {
          modules: f.graph.hostModuleArtifactIds.length,
          edges: f.graph.edges.length,
          artifacts: f.graph.artifacts.length,
          sourceInputs: f.graph.sourceFiles.length,
        },
        executionAuthorized: false,
        productionAdmission: false,
        measurementEligible: false,
      };
    } finally {
      db.close();
    }
    for (const k of [
      'executionAuthorized',
      'productionAdmission',
      'measurementEligible',
      'moduleClosureAuthenticated',
      'contextAuthenticated',
      'liveTransportConnected',
    ])
      assert.equal(outcome.value[k], false);
    fs.writeFileSync(
      path.join(mixedEvidenceRoot, 'entry-summary.json'),
      JSON.stringify(summary, null, 2) + '\n',
      { flag: 'wx' },
    );
    t.diagnostic('RESULT=' + JSON.stringify(summary));
  });
