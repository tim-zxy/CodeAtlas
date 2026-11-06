import { readHistoricalInputOrLocal } from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prepareCurrent13WorkspaceRepo } from './mixed-native-current13-workspace-repo-fixture.mjs';
import { composeCurrent13Workspace } from './mixed-native-current13-workspace-publish-fixture.mjs';
import { bindMixedNativeDynamicOwner } from './mixed-native-dynamic-owner.mjs';
import { runFixedMixedNativeHostBootstrap } from './mixed-native-host-bootstrap.mjs';
import { RuntimeFactStore } from '../packages/storage/dist/runtime/runtime-fact-store.js';
import { historyLimits } from '../packages/storage/test/helpers/r011-history-fixture.mjs';
let createEntry;
try {
  ({ createCurrent13WorkspaceEntryFixture: createEntry } =
    await import('./mixed-native-current13-workspace-entry-fixture.mjs'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const evidenceRoot = new URL(
  '../.superpowers/sdd/2026-11-05-current13-workspace-entry/',
  import.meta.url,
);
const manual = JSON.parse(
  readHistoricalInputOrLocal(
    '.superpowers/sdd/2026-11-05-current13-workspace-entry/entry-manual-expectations.json',
    'utf8',
    path.resolve(import.meta.dirname, '..'),
  ),
);
const hash = (b) => createHash('sha256').update(b).digest('hex');

test('compact two-repo Source prepare and strict replay/control constructors need no new core', async (t) => {
  assert.equal(
    typeof createEntry,
    'function',
    'independent normal-FULL workspace entry fixture required',
  );
  for (const expected of manual.repos) {
    const prepared = await prepareCurrent13WorkspaceRepo(t, expected.caseId);
    const f = await createEntry(t, prepared, 'compact');
    try {
      const owner = await bindMixedNativeDynamicOwner(f.ownerInput, f.incoming, f.outgoing);
      try {
        assert.deepEqual(
          owner.bootstrap().slots.map((s) => s.role),
          [...Array(8).fill('GIT'), ...expected.nativeRoles, ...Array(8).fill('GIT')],
        );
        assert.equal(owner.bootstrap().slots.length, expected.roles);
      } finally {
        owner.dispose();
      }
      assert.equal(f.originalValidation.strictBeforeRebind, true);
      assert.equal(f.operation.database.initialize, false);
      assert.equal(f.operation.kind, 'MIXED_NATIVE_CURRENT13_FULL_OPERATION');
      assert.equal(f.state.calls, 0);
      assert.equal(f.nativeRequests.length, 0);
      t.diagnostic(
        'COMPACT=' +
          JSON.stringify({
            caseId: expected.caseId,
            sourceOperations: 2,
            keys: prepared.schemaDocument.contractFactKeys.length,
            roles: expected.roles,
            originalValidation: f.originalValidation,
          }),
      );
    } finally {
      f.restoreMemory();
    }
  }
});

test('complete genuine Source current13 FULL repositories publish declared workspace 2MATCHED and one HTTP call', async (t) => {
  assert.equal(typeof createEntry, 'function');
  const repos = [];
  for (const expected of manual.repos)
    repos.push(await prepareCurrent13WorkspaceRepo(t, expected.caseId));
  const details = [];
  for (const prepared of repos) {
    const expected = manual.repos.find((r) => r.caseId === prepared.caseId),
      started = performance.now();
    const f = await createEntry(t, prepared, 'closedgraph');
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
        'BOUNDARY=' +
          JSON.stringify({
            caseId: prepared.caseId,
            code: e.code,
            step: e.step,
            effects: e.effects,
          }),
      );
      throw e;
    } finally {
      f.restoreMemory();
    }
    assert.equal(outcome.value.kind, 'COMMITTED');
    assert.equal(outcome.value.effects.sourceCommit, 'COMMITTED');
    assert.equal(outcome.value.effects.graphCommit, 'COMMITTED');
    assert.equal(outcome.value.effects.cleanupFailed, false);
    assert.deepEqual(
      f.nativeRequests.map((r) => r.protocolVersion),
      expected.caseId === 'J7' ? [2, 8] : [8],
    );
    const snapshotIds = f.nativeRequests.map((r) => r.payload.providerSnapshotId);
    assert.equal(new Set(snapshotIds).size, 1);
    const registers = f.messages.filter((m) => m.type === 'REGISTER');
    for (const type of ['REGISTER', 'INTENT', 'SPAWNED', 'CLOSED'])
      assert.equal(f.messages.filter((m) => m.type === type).length, expected.roles);
    for (const type of ['BOUND', 'READY', 'ACQUIRED', 'RELEASED'])
      assert.equal(f.replies.filter((m) => m.type === type).length, expected.roles);
    assert.equal(
      f.messages.some((m) => m.type === 'ABANDON'),
      false,
    );
    assert.deepEqual(
      registers.map((m) => [m.role, m.phase]),
      [
        ...Array.from({ length: 8 }, () => ['GIT', 'SOURCE']),
        ...expected.nativeRoles.map((r) => [r, 'ANALYSIS']),
        ...Array.from({ length: 8 }, () => ['GIT', 'ANALYSIS']),
      ],
    );
    assert.ok(registers.every((m) => /^[a-f0-9]{64}$/.test(m.contextDigest)));
    assert.ok(registers.slice(8).every((m) => m.contextDigest === registers[8].contextDigest));
    assert.deepEqual(
      f.replies
        .filter((m) => m.type === 'RELEASED')
        .map((m) => m.launchId)
        .sort(),
      registers.map((m) => m.launchId).sort(),
    );
    assert.equal(f.state.calls, 16);
    assert.equal(f.state.closes, 16);
    const db = new DatabaseSync(prepared.databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    let readback;
    try {
      const store = new RuntimeFactStore(db, prepared.repositoryId),
        live = store.readRuntimeBasis(historyLimits),
        trace = store.traceRuntimeV2(historyLimits),
        inputs = store.readFrameworkInputsV2(live.identity, historyLimits);
      assert.equal(trace.status, 'CURRENT');
      assert.equal(trace.activationId, outcome.value.runtimeActivationId);
      assert.equal(trace.identity.syntaxActivationId, outcome.value.syntaxActivationId);
      assert.deepEqual(trace.identity.codeBasis, outcome.value.basis);
      assert.deepEqual(
        inputs.sourceFiles.map((s) => [s.path, s.id, s.contentFingerprint]).sort(),
        prepared.sourcePreparation.withSchema.files
          .map((s) => [s.path, s.id, s.contentFingerprint])
          .sort(),
      );
      assert.equal(
        trace.identity.codeBasis.revisionId,
        prepared.sourcePreparation.withSchema.revision.id,
      );
      assert.equal(
        trace.identity.codeBasis.contentFingerprint,
        prepared.sourcePreparation.withSchema.revision.contentFingerprint,
      );
      const contracts = trace.candidate.facts.payload.contracts.filter(
        (c) => c.protocol === 'HTTP' && c.direction === expected.httpDirection,
      );
      assert.equal(contracts.length, expected.contractCount);
      assert.deepEqual(
        contracts.map((c) => c.factKey).sort(),
        prepared.schemaDocument.contractFactKeys,
      );
      for (const source of inputs.sourceFiles)
        assert.equal(
          'sha256:' + hash(fs.readFileSync(path.join(prepared.sourceRoot, source.path))),
          source.contentFingerprint,
        );
      assert.equal(
        hash(fs.readFileSync(path.join(prepared.sourceRoot, prepared.schemaDocument.path))),
        prepared.schemaDocument.sha256,
      );
      readback = {
        status: trace.status,
        runtimeActivationId: trace.activationId,
        syntaxActivationId: trace.identity.syntaxActivationId,
        basis: trace.identity.codeBasis,
        sourceFiles: inputs.sourceFiles,
        contractFactKeys: contracts.map((c) => c.factKey).sort(),
      };
    } finally {
      db.close();
    }
    for (const flag of [
      'executionAuthorized',
      'productionAdmission',
      'measurementEligible',
      'moduleClosureAuthenticated',
      'contextAuthenticated',
      'liveTransportConnected',
    ])
      assert.equal(outcome.value[flag], false);
    const detail = {
      caseId: prepared.caseId,
      durationMs: performance.now() - started,
      preparatorySourceOperations: 2,
      readback,
      originalValidation: f.originalValidation,
      rawPins: prepared.rawPins,
      rootBounds: {
        sourceRoot: prepared.sourceRoot,
        databasePath: prepared.databasePath,
        ownedBundle: f.root,
      },
      audit: {
        registers: expected.roles,
        released: expected.roles,
        nativeRoles: expected.nativeRoles,
        nativeCalls: f.nativeRequests.length,
        gitCalls: 16,
        gitCloses: 16,
        noNativeAfterFinalGit: true,
      },
      graph: {
        modules: f.graph.hostModuleArtifactIds.length,
        edges: f.graph.edges.length,
        artifacts: f.graph.artifacts.length,
        sourceInputs: f.graph.sourceFiles.length,
      },
      snapshotId: snapshotIds[0],
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
    };
    details.push(detail);
    t.diagnostic('REPOSITORY=' + JSON.stringify(detail));
  }
  const workspace = await composeCurrent13Workspace(t, repos);
  assert.equal(workspace.matches, 2);
  assert.equal(workspace.httpInvocationEdges, 1);
  assert.equal(workspace.status, 'CURRENT');
  assert.equal(workspace.readonlyReopenEqual, true);
  const summary = {
    kind: 'CURRENT13_PREPARED_SOURCE_FULL_TO_WORKSPACE_OFFLINE_SUCCESS',
    sourceScope: manual.sourceScope,
    repositories: details,
    workspace,
    actualPreparatorySourceOperations: 4,
    pristineFirstSource: false,
    executionAuthorized: false,
    productionAdmission: false,
    measurementEligible: false,
  };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(
    new URL('entry-summary.json', evidenceRoot),
    JSON.stringify(summary, null, 2) + '\n',
    { flag: 'wx' },
  );
  t.diagnostic('RESULT=' + JSON.stringify(summary));
});
