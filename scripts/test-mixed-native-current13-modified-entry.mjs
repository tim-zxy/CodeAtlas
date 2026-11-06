import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';
import * as fixtures from './mixed-native-current13-product-fixture.mjs';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
const evidenceRoot = path.resolve('.superpowers/sdd/2026-11-05-current13-modified-entry');
const expected = JSON.parse(
  readHistoricalInputOrLocal(
    '.superpowers/sdd/2026-11-05-current13-modified-entry/manual-expectations.json',
    'utf8',
    path.resolve(import.meta.dirname, '..'),
  ),
);
test('actual current13 modified same-source entry publishes POST and retires GET active origins after final Git', async (t) => {
  assert.equal(typeof fixtures.createCurrent13ModifiedEntryFixture, 'function');
  const f = await fixtures.createCurrent13ModifiedEntryFixture(t);
  assert.deepEqual(f.baseline.beforeRuntime, {
    status: 'CURRENT',
    method: expected.beforeMethod,
    path: expected.runtimePath,
  });
  assert.equal(f.originalP1.path, expected.sourcePath);
  assert.equal(f.originalP1.contentFingerprint, 'sha256:' + expected.beforeSourceSha256);
  assert.equal(f.expectedObservedSource.contentFingerprint, 'sha256:' + expected.afterSourceSha256);
  assert.equal(f.libraryValidation.requestSha256, expected.libraryAfterRequestSha256);
  assert.equal(f.libraryValidation.outputSha256, expected.libraryAfterOutputSha256);
  assert.equal(f.libraryValidation.strictBeforeRebind, true);
  const outcome = await runFixedMixedNativeHostBootstrap(f.argv, f.env, {
    incoming: f.incoming,
    outgoing: f.outgoing,
  });
  assert.equal(outcome.value.kind, 'COMMITTED');
  assert.equal(outcome.value.effects.sourceCommit, 'COMMITTED');
  assert.equal(outcome.value.effects.graphCommit, 'COMMITTED');
  assert.equal(outcome.value.effects.cleanupFailed, false);
  assert.equal(f.operation.database.initialize, false);
  assert.equal(f.nativeCalls(), expected.expectedNativeCalls);
  assert.equal(f.state.calls, expected.expectedGitCalls);
  assert.equal(f.state.closes, expected.expectedGitCalls);
  assert.equal(f.state.head, f.baseline.gitHead);
  assert.equal(f.state.branch, f.baseline.gitBranch);
  assert.deepEqual(f.operation.sourceRequest.config, f.baseline.sourceConfig);
  assert.equal(f.nativeRequests.length, 1);
  const actual = f.nativeRequests[0];
  assert.deepEqual(actual.payload.expectedActivationBasis, f.baseline.basis);
  assert.deepEqual(
    actual.payload.sourceFiles.map((x) => [x.id, x.path, x.contentFingerprint]),
    [[f.baseline.sourceFiles[0].id, expected.sourcePath, 'sha256:' + expected.afterSourceSha256]],
  );
  assert.equal(actual.payload.targetSource.revisionId, f.baseline.sourceRevision.id);
  const registers = f.messages.filter((m) => m.type === 'REGISTER');
  assert.equal(registers.length, expected.expectedRegistrations);
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
  let summary;
  try {
    const runtime = new RuntimeFactStore(db, f.operation.repository.id),
      trace = runtime.traceRuntimeV2(historyLimits);
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.activationId, outcome.value.runtimeActivationId);
    assert.notEqual(trace.activationId, f.baseline.runtimeActivationId);
    assert.equal(trace.identity.syntaxActivationId, outcome.value.syntaxActivationId);
    assert.deepEqual(trace.identity.codeBasis, outcome.value.basis);
    const http = trace.candidate.facts.payload.contracts.filter(
      (c) => c.protocol === 'HTTP' && c.direction === 'PROVIDER',
    );
    assert.equal(http.length, 1);
    assert.equal(http[0].signature.method, expected.afterMethod);
    assert.equal(
      '/' +
        http[0].signature.pathSegments
          .map((s) => {
            assert.equal(s.kind, 'LITERAL');
            return s.value;
          })
          .join('/'),
      expected.runtimePath,
    );
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
      .all(outcome.value.syntaxActivationId)
      .map((m) => m.origin_id);
    assert.equal(f.baseline.origins.length, 19);
    assert.equal(members.length, 19);
    assert.ok(f.baseline.origins.every((old) => !members.includes(old.id)));
    const live = runtime.readRuntimeBasis(historyLimits);
    assert.ok(live.identity);
    const inputs = runtime.readFrameworkInputsV2(live.identity, historyLimits);
    assert.deepEqual(
      inputs.sourceFiles.map((x) => [x.id, x.path, x.contentFingerprint]),
      [[f.baseline.sourceFiles[0].id, expected.sourcePath, 'sha256:' + expected.afterSourceSha256]],
    );
    summary = {
      kind: 'ACTUAL_CURRENT13_MODIFIED_ENTRY_OFFLINE_SUCCESS',
      runtimeStatus: trace.status,
      method: http[0].signature.method,
      path: expected.runtimePath,
      oldOrigins: f.baseline.origins.length,
      oldOriginsActive: 0,
      newActiveOrigins: members.length,
      immutableHistoryRetained: true,
      sourceId: inputs.sourceFiles[0].id,
      originalLibraryValidation: f.libraryValidation,
      audit: {
        registers: registers.length,
        released: f.replies.filter((m) => m.type === 'RELEASED').length,
        native: f.nativeCalls(),
        gitCalls: f.state.calls,
        gitCloses: f.state.closes,
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
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceRoot, 'result.json'),
    JSON.stringify(summary, null, 2) + '\n',
    { flag: 'wx' },
  );
  t.diagnostic('RESULT=' + JSON.stringify(summary));
});
