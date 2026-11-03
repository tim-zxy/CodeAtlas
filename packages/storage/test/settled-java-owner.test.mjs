import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { observationFixture } from './helpers/mixed-analysis-fixture.mjs';
import { historyLimits } from './helpers/r011-history-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { beginMixedSourceAccount } from '../dist/analysis/mixed-source-account.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { reseal } from '../../providers/test/fixtures/native-composition-helpers.mjs';
import { computeSyntaxOwnerMapDigest } from '../../providers/dist/native-syntax-owner-binding.js';
const root = new URL(
  '../../../fixtures/phase1/mixed-runtime-readiness/java-owner-timing/',
  import.meta.url,
);
const expected = JSON.parse(fs.readFileSync(new URL('expected.json', root))),
  cases = JSON.parse(fs.readFileSync(new URL('cases.json', root)));
for (const id of cases.ids)
  test('settled Stage independent owner digest and final observation ' + id, async (t) => {
    const f = await observationFixture(t, id),
      capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
    const prelude = beginMixedSourceAccount(historyLimits, {
      signal: new AbortController().signal,
      deadlineEpochMs: Date.now() + 60000,
      maxInputBytes: Number.MAX_SAFE_INTEGER,
    });
    prelude.account.own({ prior: 'already spent' });
    const stage = new MixedAnalysisStage(
      f.db,
      capture.handle,
      'FULL',
      historyLimits,
      createMixedAnalysisRules(),
      prelude.budget,
    );
    const before = prelude.budget.serializedBytes,
      o = stage.prepareOwner(expected[id].preparation, f.preparation);
    assert.equal(o.stageDigest, expected[id].stageDigest);
    assert.deepEqual(
      JSON.parse(
        f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get().value_json,
      ),
      expected[id].body,
    );
    const request = JSON.parse(f.raw.requestBytes),
      p = request.payload,
      old = p.ownerBinding;
    p.ownerBinding = {
      kind: 'PROVISIONAL_CODE',
      stageDigest: o.stageDigest,
      ownerMapDigest: old.ownerMapDigest,
    };
    p.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest({
      expectedActivationBasis: p.expectedActivationBasis,
      targetSource: p.targetSource,
      ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: o.stageDigest },
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: p.sourceFiles,
      owners: p.owners,
    });
    const events = f.raw.outputBytes.toString().trim().split('\n').map(JSON.parse);
    const rewrite = (v) =>
      typeof v === 'string'
        ? v === old.ownerMapDigest
          ? p.ownerBinding.ownerMapDigest
          : v === old.stageDigest
            ? o.stageDigest
            : v
        : Array.isArray(v)
          ? v.map(rewrite)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrite(x)]))
            : v;
    const raw = reseal(request, rewrite(events));
    f.metadata.codeSyntax.startedAt = cases.finalCodeSyntaxStartedAt;
    f.metadata.codeSyntax.settledAt = cases.finalCodeSyntaxSettledAt;
    f.metadata.snapshot.completedAt = cases.finalCompletedAt;
    stage.acceptObservation(o.ownerHandle, { metadata: f.metadata, ...raw });
    const frozen = stage.freeze();
    assert.match(frozen.basis.codeActivationDigest, /^[a-f0-9]{64}$/);
    assert.ok(prelude.budget.serializedBytes > before);
    stage.close();
  });

test('settled Stage digest prefix fails before OWNER write and keeps cumulative spend', async (t) => {
  const f = await observationFixture(t, 'mixed'),
    h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const p = beginMixedSourceAccount(historyLimits, {
    signal: new AbortController().signal,
    deadlineEpochMs: Date.now() + 60000,
    maxInputBytes: Number.MAX_SAFE_INTEGER,
  });
  const stage = new MixedAnalysisStage(
    f.db,
    h.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
    p.budget,
  );
  const initial = p.budget.serializedBytes,
    add = p.budget.add,
    prefixBytes = Buffer.byteLength('codeatlas-settled-java-owner-v1\0');
  let reached = false;
  p.budget.add = function (key, n) {
    if (
      key === 'serializedBytes' &&
      n === prefixBytes &&
      new Error().stack.includes('javaDigest')
    ) {
      reached = true;
      Object.defineProperty(this, 'limits', {
        value: { ...historyLimits, maxSerializedBytes: this.serializedBytes + prefixBytes - 1 },
      });
    }
    return add.call(this, key, n);
  };
  assert.throws(
    () => stage.prepareOwner(expected.mixed.preparation, f.preparation),
    (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
  );
  assert.ok(reached);
  assert.ok(p.budget.serializedBytes > initial);
  assert.equal(f.db.prepare("SELECT count(*) n FROM mixed_stage WHERE key='OWNER'").get().n, 0);
  assert.throws(
    () => p.account.checkpoint(),
    (e) => e.code === 'STAGE_RELEASED',
  );
  stage.close();
});

test('Syntax4 Stage owner projection includes the real null-range compilation MODULE by exact file path', async (t) => {
  const f = await observationFixture(t, 'java-only');
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const stage = new MixedAnalysisStage(
    f.db,
    capture.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
  );
  t.after(() => stage.close());
  const scope = structuredClone(f.preparation);
  for (const c of scope.contracts)
    if (c.providerId === 'native')
      Object.assign(c, {
        extractor: 'syntax-v2',
        normalizer: 'syntax-canonical-mapper-v4',
        contract: 'SYNTAX_BINDING_V4',
        policy: 'syntax-surface-support-v2',
      });
  const module = f.javaRows.java.events.find(
    (e) => e.type === 'NODE' && e.payload.providerKind === 'java.compilation_unit',
  );
  assert(module, 'independent actual-shape module seed');
  assert.equal(module.payload.sourceRange, null);
  const owner = stage.prepareOwner(f.javaRows, scope);
  const { readMixedCodeSyntaxPreparation } =
    await import('../dist/analysis/mixed-analysis-stage.js');
  const projection = readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
  const mapping = projection.owners.find(
    (o) => o.providerNodeRef.providerFactId === module.payload.providerFactId,
  );
  assert(mapping, 'Syntax4 requires the real compilation module owner');
  assert.equal(mapping.sourceFileId, projection.sourceFiles[0].id);
  assert.notEqual(mapping.canonicalRef.entity.id, 'code:' + module.payload.providerFactId);
});
