import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readSurfaceCapture } from '../../../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import {
  loadCompositionCase,
  reseal,
} from '../../providers/test/fixtures/native-composition-helpers.mjs';
import { historyFixture, historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { RepositorySourceStateStore } from '../../storage/dist/index.js';
import { captureRuntimeActivationContext } from '../../storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedCodeSyntaxPreparation,
} from '../../storage/dist/analysis/mixed-analysis-stage.js';
import { computeSyntaxOwnerMapDigest } from '../../providers/dist/native-syntax-owner-binding.js';
import { withFrozenStage, workflowRequest } from './helpers/framework-surface-stage.mjs';

test('recorded Syntax4 Source enters a genuine owned Stage and freezes complete history without activation', async (t) => {
  await withFrozenStage(t, async ({ f, stage, frozen }) => {
    const api = await import('../../storage/dist/analysis/mixed-analysis-stage.js');
    assert.equal(typeof api.readFrozenFrameworkInputsV2, 'function');
    assert.throws(() => api.readFrozenFrameworkInputsV2(stage, {}, historyLimits));
    const view = api.readFrozenFrameworkInputsV2(stage, frozen.lease, historyLimits);
    assert.deepEqual(view.basis, frozen.basis);
    assert(view.syntaxEvidence.length > 0);
    assert(Object.isFrozen(view.syntaxEvidence));
    assert.match(view.syntaxMembershipDigest, /^[a-f0-9]{64}$/);
    const stored = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
    assert(stored.projections.length > 0);
    assert(stored.projections.every((x) => JSON.parse(x.envelope_json).version === 4));
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_nodes').get().n, 0);
    assert.throws(() =>
      api.readFrozenFrameworkInputsV2(stage, frozen.lease, { ...historyLimits, maxItems: 1 }),
    );
    assert.throws(() => api.readFrozenFrameworkInputsV2(stage, frozen.lease, historyLimits));
  });
});

test('V2 frozen Source to Graph/Flow commits Code Syntax Runtime together and reopens exact membership and local scope', async (t) => {
  const { MixedAnalysisStore } =
      await import('../../storage/dist/analysis/mixed-analysis-store.js'),
    { RuntimeFactStore } = await import('../../storage/dist/runtime/runtime-fact-store.js');
  assert.equal(typeof MixedAnalysisStore.prototype.applyWithRuntimeV2, 'function');
  assert.equal(typeof RuntimeFactStore.prototype.readFrameworkInputsV2, 'function');
  assert.equal(typeof RuntimeFactStore.prototype.traceRuntimeV2, 'function');
  await withFrozenStage(t, async ({ f, stage, frozen, repositoryId }) => {
    const { readFrozenFrameworkInputsV2 } =
        await import('../../storage/dist/analysis/mixed-analysis-stage.js'),
      view = readFrozenFrameworkInputsV2(stage, frozen.lease, historyLimits),
      { syntaxMembershipDigest, syntaxActivationId, providerCapabilities, ...facts } = view;
    const { compileFrameworkSurfaceCandidate } =
        await import('../../plugins/dist/framework-surface-compiler.js'),
      context = { ...facts, contextVersion: 5, syntaxSchemaVersion: 4, configuration: {} },
      compiled = compileFrameworkSurfaceCandidate(
        context,
        'fastapi',
        syntaxMembershipDigest,
        10000,
      ),
      { deriveExecutionGraphV2 } = await import('../../execution/dist/derive-execution.js'),
      { deriveRuntimeFlowsV2 } = await import('../../execution/dist/derive-runtime-flow.js'),
      control = () => ({
        maxItems: 10000,
        maxDepth: 10,
        deadlineEpochMs: Date.now() + 60000,
        signal: new AbortController().signal,
      });
    const { syntaxEvidence, ...code } = facts,
      g = deriveExecutionGraphV2(
        {
          ...code,
          entryFacts: compiled.facts,
          bindingFacts: compiled.bindings,
          coverage: compiled.coverage,
          syntaxEvidence,
          syntaxMembershipDigest,
          sitePlan: compiled.sitePlan,
        },
        control(),
      ),
      { coverageScope, frontier, ...flow } = deriveRuntimeFlowsV2(g, control());
    assert.equal(flow.coverage.status, 'COMPLETE');
    assert.equal(frontier.length, 0);
    const { runtimeSitePlanDigest } = await import('../../ir/dist/index.js'),
      candidate = {
        ...flow,
        derivation: {
          syntaxContract: 'SYNTAX_BINDING_V4',
          rulesVersion: 'framework-rules-v2',
          coverageVersion: 'framework-coverage-v2',
          graphPolicy: 'LOCAL_DECLARED_RUNTIME_V2',
          sitePlan: compiled.sitePlan,
          sitePlanDigest: runtimeSitePlanDigest(compiled.sitePlan),
        },
      };
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_nodes').get().n, 0);
    const mixed = new MixedAnalysisStore(f.db);
    let out;
    try {
      out = mixed.applyWithRuntimeV2(frozen.lease, historyLimits, candidate, null);
    } catch (error) {
      const rows = Object.fromEntries(
        ['canonical_nodes', 'active_history_pointer', 'runtime_activations', 'runtime_state'].map(
          (table) => [table, f.db.prepare('SELECT count(*) n FROM ' + table).get().n],
        ),
      );
      assert.deepEqual(rows, {
        canonical_nodes: 0,
        active_history_pointer: 0,
        runtime_activations: 0,
        runtime_state: 0,
      });
      t.diagnostic('JOINT_ROLLBACK_VERIFIED ' + JSON.stringify(rows));
      throw error;
    }
    assert(out.runtimeActivationId);
    const store = new RuntimeFactStore(f.db, repositoryId),
      capture = store.readRuntimeBasis(historyLimits);
    assert.equal(capture.identity.syntaxMembershipDigest, syntaxMembershipDigest);
    assert.equal(capture.identity.syntaxActivationId, syntaxActivationId);
    const current = store.readFrameworkInputsV2(capture.identity, historyLimits);
    assert.deepEqual(current.syntaxEvidence, view.syntaxEvidence);
    assert.throws(() => store.readFrameworkInputs(capture.identity, historyLimits));
    const trace = store.traceRuntimeV2(historyLimits);
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.coverageScope, 'LOCAL_DECLARED_RUNTIME');
    assert.deepEqual(trace.candidate, candidate);
    assert.equal(
      f.db.prepare('SELECT schema_version FROM runtime_activations').get().schema_version,
      1,
    );
    assert.deepEqual(
      new RuntimeFactStore(f.reopen(true), repositoryId).traceRuntimeV2(historyLimits),
      trace,
    );
    const activation = f.db.prepare('SELECT payload_json FROM runtime_activations').get();
    assert.equal(JSON.parse(activation.payload_json).formatVersion, 2);
    assert.throws(() => store.traceRuntime(historyLimits));
    // Insert an invalid child activation only in this disposable test fixture; immutable guards stay enabled.
    const { createHash } = await import('node:crypto'),
      { canonicalRuntimeJson } = await import('../../ir/dist/index.js'),
      hash = (d, v) =>
        createHash('sha256')
          .update(d + '\0' + v)
          .digest('hex'),
      broken = JSON.parse(activation.payload_json);
    broken.formatVersion = 99;
    broken.identity.parentId = trace.activationId;
    const invalidId =
        'runtime-activation:' +
        hash('runtime-activation-v1', canonicalRuntimeJson(broken.identity)),
      raw = JSON.stringify(broken),
      row = {
        ...f.db.prepare('SELECT * FROM runtime_activations').get(),
        id: invalidId,
        parent_id: trace.activationId,
        payload_json: raw,
        value_digest: hash('runtime-storage-value-v1', raw),
      },
      columns = Object.keys(row);
    f.db
      .prepare(
        'INSERT INTO runtime_activations(' +
          columns.join(',') +
          ')VALUES(' +
          columns.map(() => '?').join(',') +
          ')',
      )
      .run(...columns.map((k) => row[k]));
    f.db
      .prepare('UPDATE runtime_state SET activation_id=? WHERE repository_id=?')
      .run(invalidId, repositoryId);
    assert.throws(() => store.traceRuntimeV2(historyLimits), /INVALID_RUNTIME_CANDIDATE/);
  });
});

test('fixed V5 Runtime authorizes before frozen capture and publishes through Application and same lease', async (t) => {
  const a = await import('../dist/framework-runtime-composition.js');
  assert.equal(typeof a.composeFrozenFrameworkRuntimeV2, 'function');
  assert.equal(typeof a.composeFrameworkRuntimeV2, 'function');
  await withFrozenStage(t, async ({ f, stage, frozen, repositoryId }) => {
    const { MixedAnalysisStore } =
        await import('../../storage/dist/analysis/mixed-analysis-store.js'),
      { RuntimeFactStore } = await import('../../storage/dist/runtime/runtime-fact-store.js'),
      routes = [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
      compose = a.composeFrozenFrameworkRuntimeV2({
        workspaceId: 'workspace:owned',
        repositoryId,
        stage,
        lease: frozen.lease,
        store: new MixedAnalysisStore(f.db),
        expectedOldRuntime: null,
        limits: historyLimits,
        routes,
      });
    const denied = workflowRequest(repositoryId, 'INDEX');
    denied.policy.callerCapabilities = [];
    await assert.rejects(() => compose.publish(denied));
    assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_nodes').get().n, 0);
    const result = await compose.publish(workflowRequest(repositoryId, 'INDEX'));
    assert(result.runtimeActivationId);
    const store = new RuntimeFactStore(f.db, repositoryId),
      current = a.composeFrameworkRuntimeV2({
        workspaceId: 'workspace:owned',
        repositoryId,
        store,
        limits: historyLimits,
        routes,
      }),
      trace = current.trace(workflowRequest(repositoryId, 'QUERY'));
    assert.equal(trace.status, 'CURRENT');
    assert.equal(trace.coverageScope, 'LOCAL_DECLARED_RUNTIME');
    assert.equal(trace.candidate.facts.payload.flows.length, 1);
    assert(trace.candidate.derivation);
    const refreshed = await current.refresh(workflowRequest(repositoryId, 'INDEX'));
    assert.equal(refreshed.status, 'COMMITTED');
    const latest = current.trace(workflowRequest(repositoryId, 'QUERY'));
    assert.equal(latest.status, 'CURRENT');
    assert.notEqual(latest.activationId, trace.activationId);
    assert.equal(latest.identity.syntaxActivationId, trace.identity.syntaxActivationId);
    assert.deepEqual(latest.candidate.facts, trace.candidate.facts);
  });
});

test('recorded Java caller and Python provider retain unknown schema compatibility through actual matcher', async (t) => {
  const { composeFrozenFrameworkRuntimeV2 } =
      await import('../dist/framework-runtime-composition.js'),
    { MixedAnalysisStore } = await import('../../storage/dist/analysis/mixed-analysis-store.js'),
    { RuntimeFactStore } = await import('../../storage/dist/runtime/runtime-fact-store.js');
  await withFrozenStage(t, async (py) => {
    await withFrozenStage(
      t,
      async (java) => {
        const snapshots = [];
        for (const [x, language, framework] of [
          [py, 'python', 'fastapi'],
          [java, 'java', 'spring'],
        ]) {
          await composeFrozenFrameworkRuntimeV2({
            workspaceId: 'workspace:owned',
            repositoryId: x.repositoryId,
            stage: x.stage,
            lease: x.frozen.lease,
            store: new MixedAnalysisStore(x.f.db),
            expectedOldRuntime: null,
            limits: historyLimits,
            routes: [{ languageId: language, frameworkId: framework, configuration: {} }],
          }).publish(workflowRequest(x.repositoryId, 'INDEX'));
          const store = new RuntimeFactStore(x.f.db, x.repositoryId),
            c = store.readRuntimeBasis(historyLimits),
            trace = store.traceRuntimeV2(historyLimits);
          snapshots.push({
            x,
            store,
            c,
            trace,
            binding: {
              repoBasis: c.identity.codeBasis,
              syntaxActivationId: c.identity.syntaxActivationId,
              syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
              runtimeActivationId: c.identity.runtimeActivationId,
              runtimeCandidateDigest: trace.identity.candidateDigest,
            },
          });
        }
        const [provider, caller] = snapshots,
          wb = {
            workspaceId: 'workspace:owned',
            revisionSetId: 'set:source',
            workspaceActivationDigest: '0'.repeat(64),
          },
          ref = (snapshot, kind, id) => ({
            scope: 'REPOSITORY',
            repositoryId: snapshot.binding.repoBasis.repositoryId,
            entity: { kind, id, revisionId: snapshot.binding.repoBasis.revisionId },
          }),
          serviceRef = {
            scope: 'WORKSPACE',
            workspaceId: wb.workspaceId,
            entity: { kind: 'SERVICE', id: 'service:inventory', revisionId: wb.revisionSetId },
          },
          support = provider.trace.candidate.facts.payload.supportInventory.filter(
            (s) => s.entity.kind === 'SOURCE_FILE',
          );
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
                repositoryRef: ref(provider, 'REPOSITORY', provider.binding.repoBasis.repositoryId),
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
              contractRef: ref(provider, 'CONTRACT', c.id),
              serviceRef,
              supportRefs: c.supportRefs,
            })),
          },
          contractRefs: snapshots.flatMap((s) =>
            s.trace.candidate.facts.payload.contracts.map((contract) => ({
              ref: ref(s, 'CONTRACT', contract.id),
              contract,
            })),
          ),
        };
        const { workspaceRuntimeInputDigest, matchContracts } =
          await import('../../contracts/dist/index.js');
        wb.workspaceActivationDigest = workspaceRuntimeInputDigest(frozen);
        const matches = matchContracts(frozen, workflowRequest(null, 'QUERY').control);
        assert.equal(matches.termination, 'COMPLETE');
        assert.equal(matches.matches.length, 2);
        assert(matches.matches.every((m) => m.payload.status === 'UNRESOLVED'));
        assert(
          matches.matches.every((m) => m.payload.reasons.includes('SCHEMA_COMPATIBILITY_UNPROVEN')),
        );
        assert(
          caller.trace.candidate.facts.payload.contracts.some(
            (c) =>
              c.direction === 'CONSUMER' &&
              caller.trace.candidate.facts.payload.supportInventory.some(
                (s) =>
                  s.entity.kind === 'CODE_NODE' && s.entity.id === c.implementationRef.entity.id,
              ),
          ),
        );
        const { deriveWorkspaceRuntimeV2 } = await import('../../application/dist/index.js');
        assert.equal(typeof deriveWorkspaceRuntimeV2, 'function');
        const stitched = deriveWorkspaceRuntimeV2(
          {
            expectedOldActivationId: null,
            frozen,
            graphs: snapshots.map((s) => ({
              repositoryBinding: s.binding,
              candidate: s.trace.candidate,
            })),
          },
          workflowRequest(null, 'QUERY').control,
        );
        assert.equal(stitched.execution.payload.coverage.status, 'PARTIAL');
        assert.equal(
          stitched.execution.payload.edges.filter((e) => e.transitionKind === 'HTTP').length,
          0,
        );
        const { DatabaseSync } = await import('node:sqlite'),
          { loadMigrationPlan } = await import('../../storage/dist/index.js'),
          { applyMigrationPlan } = await import('../../storage/dist/migrations/runner.js'),
          { ContractStore } = await import('../../storage/dist/runtime/contract-store.js'),
          db = new DatabaseSync(path.join(py.f.directory, 'workspace-source.sqlite'), {
            enableForeignKeyConstraints: true,
          });
        py.f.connections.push(db);
        applyMigrationPlan(
          db,
          await loadMigrationPlan(
            new URL('../../storage/migrations/workspace/manifest.json', import.meta.url),
            'WORKSPACE',
          ),
        );
        db.prepare('INSERT INTO workspace(slot,id,root_path)VALUES(1,?,?)').run(
          wb.workspaceId,
          py.f.directory,
        );
        db.prepare(
          'INSERT INTO revision_sets(id,workspace_id,created_at,frozen)VALUES(?,?,0,0)',
        ).run(wb.revisionSetId, wb.workspaceId);
        for (const snapshot of snapshots) {
          const basis = snapshot.binding.repoBasis,
            root = snapshot.x.f.db.prepare('SELECT root_path FROM repository').get().root_path;
          db.prepare(
            'INSERT INTO repositories(repository_id,workspace_id,root_path)VALUES(?,?,?)',
          ).run(basis.repositoryId, wb.workspaceId, root);
          db.prepare(
            'INSERT INTO revision_set_items(revision_set_id,repository_id,revision_id,revision_fingerprint)VALUES(?,?,?,?)',
          ).run(wb.revisionSetId, basis.repositoryId, basis.revisionId, basis.contentFingerprint);
        }
        db.prepare('UPDATE revision_sets SET frozen=1 WHERE id=?').run(wb.revisionSetId);
        const workspace = new ContractStore(
            db,
            wb.workspaceId,
            snapshots.map((s) => s.store),
          ),
          prepared = workspace.readWorkspaceInputs(frozen, historyLimits),
          actual = deriveWorkspaceRuntimeV2(prepared, workflowRequest(null, 'QUERY').control);
        assert.equal(actual.execution.payload.coverage.status, 'PARTIAL');
        assert.throws(
          () => workspace.applyWorkspaceBatch(actual, historyLimits),
          /WORKSPACE_RUNTIME_PARTIAL/,
        );
        assert.equal(db.prepare('SELECT count(*) n FROM workspace_runtime_activations').get().n, 0);
        t.diagnostic(
          'SOURCE_CROSS_REPO_SCHEMA_HOLD: method/path/service are explicit; request/response schemas remain null; no MATCHED or workspace publication claimed.',
        );
      },
      'J7',
    );
  });
});

test('Syntax4 actual OTHER removal delta retains immutable origins and atomically advances current Runtime, then reports NO_OP', async (t) => {
  const { composeFrozenFrameworkRuntimeV2 } =
      await import('../dist/framework-runtime-composition.js'),
    { MixedAnalysisStore } = await import('../../storage/dist/analysis/mixed-analysis-store.js'),
    { RuntimeFactStore } = await import('../../storage/dist/runtime/runtime-fact-store.js'),
    stageAPI = await import('../../storage/dist/analysis/mixed-analysis-stage.js'),
    { createFrameworkSurfaceMixedAnalysisRules } = await import('../dist/mixed-analysis.js');
  await withFrozenStage(
    t,
    async ({ f, stage, frozen, repositoryId }) => {
      const routes = [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
        publish = (target, lease, previous) =>
          composeFrozenFrameworkRuntimeV2({
            workspaceId: 'workspace:owned',
            repositoryId,
            stage: target,
            lease,
            store: new MixedAnalysisStore(f.db),
            expectedOldRuntime: previous,
            limits: historyLimits,
            routes,
          }).publish(workflowRequest(repositoryId, 'INDEX'));
      await publish(stage, frozen.lease, null);
      const runtime = new RuntimeFactStore(f.db, repositoryId),
        before = runtime.traceRuntimeV2(historyLimits),
        origins = f.db.prepare('SELECT id,origin_json FROM syntax_origins ORDER BY id').all(),
        source = new RepositorySourceStateStore(f.db),
        old = source.load(repositoryId),
        root = f.db.prepare('SELECT root_path FROM repository').get().root_path;
      const files = old.files.filter((file) => file.path !== 'notes.md');
      fs.unlinkSync(path.join(root, 'notes.md'));
      const { fingerprintInventory } = await import('../../source/dist/fingerprint.js'),
        contentFingerprint = fingerprintInventory(
          files.map((file) => ({
            ...file,
            sizeBytes: fs.statSync(path.join(root, file.path)).size,
          })),
        );
      source.replace(old, { revision: { ...old.revision, contentFingerprint }, files });
      assert.equal(runtime.traceRuntimeV2(historyLimits).status, 'AFFECTED');
      const contracts = [
          {
            providerId: 'native',
            extractor: 'syntax-v2',
            normalizer: 'syntax-canonical-mapper-v4',
            contract: 'SYNTAX_BINDING_V4',
            policy: 'syntax-surface-support-v2',
          },
        ],
        capture = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
        delta = new MixedAnalysisStage(
          f.db,
          capture.handle,
          'DELTA',
          historyLimits,
          createFrameworkSurfaceMixedAnalysisRules(),
        );
      try {
        const owner = delta.prepareOwner(null, {
          contracts,
          qualificationRef: 'RECORDED_REPLAY_COMPONENT_NOT_PHYSICAL',
        });
        assert.equal(
          stageAPI.readMixedCodeSyntaxPreparation(delta, owner.ownerHandle).sourceFiles.length,
          0,
        );
        delta.acceptObservation(owner.ownerHandle, null);
        const next = delta.freeze();
        await publish(delta, next.lease, before.activationId);
      } finally {
        delta.close();
      }
      const after = runtime.traceRuntimeV2(historyLimits);
      assert.equal(after.status, 'CURRENT');
      assert.notEqual(after.activationId, before.activationId);
      assert.notEqual(after.identity.syntaxActivationId, before.identity.syntaxActivationId);
      assert.deepEqual(
        f.db.prepare('SELECT id,origin_json FROM syntax_origins ORDER BY id').all(),
        origins,
      );
      assert(
        after.candidate.derivation.sitePlan.entries.every(
          (e) => e.ownerRef.repositoryId === repositoryId,
        ),
      );
      const unchanged = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
        noop = new MixedAnalysisStage(
          f.db,
          unchanged.handle,
          'DELTA',
          historyLimits,
          createFrameworkSurfaceMixedAnalysisRules(),
        );
      try {
        assert.equal(
          stageAPI.readMixedNoOpBasis(noop, contracts).activationId,
          after.identity.syntaxActivationId,
        );
      } finally {
        noop.close();
      }
    },
    'P5',
    true,
  );
});

test('recorded RAW_V8 changed Python unit and native removal pass genuine delta Stage and joint Store', async (t) => {
  const { composeFrozenFrameworkRuntimeV2 } =
      await import('../dist/framework-runtime-composition.js'),
    { MixedAnalysisStore } = await import('../../storage/dist/analysis/mixed-analysis-store.js'),
    { RuntimeFactStore } = await import('../../storage/dist/runtime/runtime-fact-store.js'),
    { createFrameworkSurfaceMixedAnalysisRules } = await import('../dist/mixed-analysis.js');
  await withFrozenStage(t, async ({ f, stage, frozen, repositoryId }) => {
    const routes = [{ languageId: 'python', frameworkId: 'fastapi', configuration: {} }],
      publish = (s, lease, previous) =>
        composeFrozenFrameworkRuntimeV2({
          workspaceId: 'workspace:owned',
          repositoryId,
          stage: s,
          lease,
          store: new MixedAnalysisStore(f.db),
          expectedOldRuntime: previous,
          limits: historyLimits,
          routes,
        }).publish(workflowRequest(repositoryId, 'INDEX'));
    await publish(stage, frozen.lease, null);
    const store = new RuntimeFactStore(f.db, repositoryId),
      before = store.traceRuntimeV2(historyLimits),
      origins = f.db.prepare('SELECT id,origin_json FROM syntax_origins ORDER BY id').all(),
      source = new RepositorySourceStateStore(f.db),
      old = source.load(repositoryId),
      root = f.db.prepare('SELECT root_path FROM repository').get().root_path,
      saved = readSurfaceCapture('P2'),
      request = JSON.parse(saved.syntax.request),
      events = saved.syntax.output.toString().trim().split('\n').map(JSON.parse),
      oldRepo = request.payload.targetSource.repositoryId,
      oldRev = request.payload.targetSource.revisionId;
    const rebind = (v) => {
      if (!v || typeof v !== 'object') return;
      for (const [key, value] of Object.entries(v)) {
        if (key === 'repositoryId' && value === oldRepo) v[key] = repositoryId;
        else if (key === 'revisionId' && value === oldRev) v[key] = old.revision.id;
        else rebind(value);
      }
    };
    rebind(request);
    rebind(events);
    const p = request.payload,
      file = p.sourceFiles[0],
      target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(new URL('../../../fixtures/phase1/' + file.path, import.meta.url), target);
    for (const oldFile of old.files) fs.unlinkSync(path.join(root, oldFile.path));
    const { fingerprintInventory } = await import('../../source/dist/fingerprint.js'),
      contentFingerprint = fingerprintInventory([{ ...file, sizeBytes: fs.statSync(target).size }]);
    source.replace(old, {
      revision: { ...old.revision, contentFingerprint },
      files: p.sourceFiles,
    });
    const capture = captureRuntimeActivationContext(f.db, repositoryId, historyLimits),
      delta = new MixedAnalysisStage(
        f.db,
        capture.handle,
        'DELTA',
        historyLimits,
        createFrameworkSurfaceMixedAnalysisRules(),
      );
    try {
      const contracts = [
          {
            providerId: 'native',
            extractor: 'syntax-v2',
            normalizer: 'syntax-canonical-mapper-v4',
            contract: 'SYNTAX_BINDING_V4',
            policy: 'syntax-surface-support-v2',
          },
        ],
        owner = delta.prepareOwner(null, {
          contracts,
          qualificationRef: 'RECORDED_REPLAY_COMPONENT_NOT_PHYSICAL',
        }),
        preparation = readMixedCodeSyntaxPreparation(delta, owner.ownerHandle);
      p.repository = { id: repositoryId, rootPath: root.replaceAll('\\', '/') };
      p.targetSource = preparation.targetSource;
      p.expectedActivationBasis = preparation.expectedActivationBasis;
      p.sourceFiles = preparation.sourceFiles;
      p.removedSourceFiles = preparation.removedSourceFiles;
      p.owners = preparation.owners;
      p.ownerBinding = {
        kind: 'PROVISIONAL_CODE',
        stageDigest: owner.stageDigest,
        ownerMapDigest: '0'.repeat(64),
      };
      p.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest({
        expectedActivationBasis: p.expectedActivationBasis,
        targetSource: p.targetSource,
        ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: owner.stageDigest },
        providerId: p.providerId,
        providerSnapshotId: p.providerSnapshotId,
        sourceFiles: p.sourceFiles,
        owners: p.owners,
      });
      for (const e of events)
        if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED') {
          e.payload.ownerBinding = structuredClone(p.ownerBinding);
          e.payload.expectedActivationBasis = structuredClone(p.expectedActivationBasis);
          e.payload.targetSource = structuredClone(p.targetSource);
        }
      const raw = reseal(request, events),
        metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
      metadata.targetSource = p.targetSource;
      metadata.inventory = p.sourceFiles;
      metadata.java = null;
      metadata.snapshot.id = p.providerSnapshotId;
      metadata.snapshot.providerId = p.providerId;
      metadata.snapshot.providerVersion = p.providerVersion;
      metadata.codeSyntax.providerVersion = p.providerVersion;
      delta.acceptObservation(owner.ownerHandle, { metadata, ...raw });
      const next = delta.freeze();
      await publish(delta, next.lease, before.activationId);
    } finally {
      delta.close();
    }
    const after = store.traceRuntimeV2(historyLimits);
    assert.equal(after.status, 'CURRENT');
    assert(after.candidate.bindings.payload.bindings.some((b) => b.kind === 'DEPENDENCY'));
    assert(
      after.candidate.facts.payload.contracts.some(
        (c) =>
          c.signature.kind === 'HTTP' &&
          c.signature.pathSegments.some((s) => s.kind === 'LITERAL' && s.value === 'x'),
      ),
    );
    for (const row of origins)
      assert.deepEqual(
        f.db.prepare('SELECT id,origin_json FROM syntax_origins WHERE id=?').get(row.id),
        row,
      );
    assert.notEqual(after.identity.syntaxActivationId, before.identity.syntaxActivationId);
  });
});

test('V5 shared Java context combines Spring and Mongo proofs without suppressing an unhandled site', async () => {
  const { composedSurfaceContext } =
      await import('../../plugins/test/fixtures/framework-surface-context.mjs'),
    { prepareFrameworkRuntimeV2 } = await import('../dist/framework-runtime-composition.js'),
    c = await composedSurfaceContext(['J7', 'J4']),
    inputs = {
      basis: c.basis,
      nodes: c.nodes,
      edges: c.edges,
      sourceFiles: c.sourceFiles,
      syntaxEvidence: c.syntaxEvidence,
      supportInventory: c.supportInventory,
      providerCapabilities: ['JAVA_CODE_V2', 'FRAMEWORK_SYNTAX_OBSERVATION_V1'],
      syntaxMembershipDigest: 'c'.repeat(64),
    },
    routes = [
      { languageId: 'java', frameworkId: 'spring', configuration: {} },
      { languageId: 'java', frameworkId: 'mongo', configuration: {} },
    ],
    control = () => workflowRequest(c.basis.repositoryId, 'INDEX').control;
  const out = await prepareFrameworkRuntimeV2(inputs, routes, control());
  assert.equal(out.coverage.status, 'COMPLETE');
  assert(out.bindings.payload.bindings.some((b) => b.kind === 'DATA_WATCH'));
  assert(out.bindings.payload.bindings.some((b) => b.kind === 'HTTP_CALL'));
  const bad = structuredClone(inputs);
  bad.syntaxEvidence.find(
    (s) => s.syntaxKind === 'INVOCATION' && s.payload.callee.name === 'client.items',
  ).payload.callee.name = 'client.unsupported';
  const partial = await prepareFrameworkRuntimeV2(bad, routes, control());
  assert.equal(partial.coverage.status, 'PARTIAL');
  assert(partial.coverage.unverifiedRefs.length > 0);
});
