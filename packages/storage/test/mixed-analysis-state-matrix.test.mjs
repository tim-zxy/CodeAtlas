import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { cases, loadCase } from '../../../fixtures/phase1/mixed-analysis-stage/corpus.mjs';
import { observationFixture } from './helpers/mixed-analysis-fixture.mjs';
import {
  historyLimits,
  referenceCanonical,
  historyFixture,
  seedLiteral,
} from './helpers/r011-history-fixture.mjs';
import { allRows, stageOnConnection } from './helpers/mixed-analysis-store-fixture.mjs';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-stage/', import.meta.url);
const binding = JSON.parse(fs.readFileSync(new URL('state-matrix-execution-bindings.json', root)));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonicalRows = (rows) =>
  rows
    .map((r) => JSON.parse(JSON.stringify(r)))
    .sort((a, b) =>
      referenceCanonical(a) < referenceCanonical(b)
        ? -1
        : referenceCanonical(a) > referenceCanonical(b)
          ? 1
          : 0,
    );
function expectedTarget(before) {
  const ref = JSON.parse(readComponentReference('store-row-independent/mixed.json'));
  return {
    ...before,
    ...Object.fromEntries(Object.entries(ref.tables).map(([k, v]) => [k, canonicalRows(v)])),
  };
}
function released(f, token) {
  for (const method of ['prepareOwner', 'acceptObservation', 'freeze'])
    assert.throws(
      () => f.stage[method](null, null),
      (e) => e.code === 'STAGE_RELEASED',
    );
  if (token)
    assert.throws(
      () => new MixedAnalysisStore(f.db).apply(token.lease, historyLimits),
      (e) => e.code === 'STAGE_RELEASED',
    );
}
test('matrix binding integrity and original alpha base remains a refusal control', async (t) => {
  assert.equal(binding.cases.length, 40);
  assert.deepEqual(
    binding.cases.map((c) => c.id),
    cases.filter((c) => c.family === 'STATE_MATRIX').map((c) => c.id),
  );
  for (const c of binding.cases) {
    assert.equal(sha(fs.readFileSync(new URL(c.input, root))), c.inputSha256);
    assert.equal(sha(fs.readFileSync(new URL(c.expected, root))), c.expectedSha256);
    assert.equal(
      sha(fs.readFileSync(new URL(c.originalBaseControl.path, root))),
      c.originalBaseControl.sha256,
    );
  }
  for (const c of binding.contexts) {
    const bytes = readComponentReference(c.logicalPath);
    assert.equal(sha(bytes), c.sha256);
    assert.equal(bytes.length, c.byteLength);
  }
  const literal = JSON.parse(fs.readFileSync(new URL('base-input.json', root))),
    f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, literal);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, literal.repositoryId, historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  const s = new MixedAnalysisStage(
    f.db,
    h.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
  );
  assert.throws(
    () =>
      s.prepareOwner(
        null,
        JSON.parse(readComponentReference('owner-scope-independent/full-python.json')).preparation,
      ),
    (e) => e.code === 'FULL_ANALYSIS_REQUIRED',
  );
  assert.deepEqual(allRows(f.db), before);
  s.close();
  assert.deepEqual(allRows(f.reopen(true)), before);
});
for (const c of cases.filter((c) => c.family === 'STATE_MATRIX'))
  test('bound original matrix ' + c.id, async (t) => {
    const { input, expected } = loadCase(c),
      f = await observationFixture(t, 'mixed'),
      ctx = stageOnConnection(f.db),
      s = ctx.stage;
    f.stage = s;
    const before = allRows(f.db),
      target = expectedTarget(before),
      store = new MixedAnalysisStore(f.db);
    let owner, token;
    const prepare = () => (owner = s.prepareOwner(ctx.javaRows, ctx.preparation));
    const accept = () => s.acceptObservation(owner.ownerHandle, ctx.observationForOwner(owner));
    const freeze = () => (token = s.freeze());
    const apply = () => store.apply(token?.lease ?? {}, historyLimits);
    const invoke = () =>
      ({
        prepareOwner: prepare,
        acceptObservation: () =>
          s.acceptObservation(
            owner?.ownerHandle ?? {},
            owner ? ctx.observationForOwner(owner) : null,
          ),
        freeze,
        apply,
        close: () => s.close(),
      })[input.method]();
    const committed = () => {
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(allRows(f.reopen(true)), target);
      released(f, token);
    };
    if (input.state !== 'PREPARING') prepare();
    if (!['PREPARING', 'OWNER_FROZEN'].includes(input.state)) accept();
    if (['FROZEN', 'APPLYING', 'CONSUMED', 'INVALID', 'CLOSED'].includes(input.state)) freeze();
    if (input.state === 'CONSUMED') {
      // Keep the genuine CONSUMED state observable by failing only post-commit TEMP cleanup.
      const original = f.db.exec;
      let cleanupAttempts = 0;
      f.db.exec = function (sql) {
        if (sql === 'DROP TABLE temp.mixed_stage') {
          cleanupAttempts++;
          throw Error('matrix preserves genuine consumed state before cleanup');
        }
        return original.call(this, sql);
      };
      apply();
      f.db.exec = original;
      assert.equal(cleanupAttempts, 1);
      assert.equal(
        f.db.prepare("SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get().n,
        1,
      );
      committed();
    }
    if (input.state === 'CLOSED') s.close();
    if (input.state === 'INVALID') {
      const original = f.db.exec;
      f.db.exec = function (sql) {
        if (sql === 'BEGIN IMMEDIATE') throw Error('matrix invalidation before writes');
        return original.call(this, sql);
      };
      assert.throws(apply);
      f.db.exec = original;
      assert.deepEqual(allRows(f.db), before);
      released(f, token);
    }
    const beforeCall = allRows(f.db);
    function checkCall() {
      if (expected.allowed) {
        const result = invoke();
        if (input.method === 'apply')
          assert.equal(
            result,
            JSON.parse(readComponentReference('store-row-independent/mixed.json')).expected
              .activationId,
          );
      } else assert.throws(invoke, (e) => e.code === expected.error && e.message === e.code);
      if (input.method !== 'apply' || !expected.allowed)
        assert.deepEqual(allRows(f.db), beforeCall);
    }
    if (input.state === 'APPLYING') {
      const original = f.db.exec;
      let seen = 0;
      f.db.exec = function (sql) {
        if (sql === 'BEGIN IMMEDIATE') {
          seen++;
          checkCall();
        }
        return original.call(this, sql);
      };
      apply();
      f.db.exec = original;
      assert.equal(seen, 1);
      committed();
    } else {
      checkCall();
      if (expected.next === 'OWNER_FROZEN') {
        accept();
        freeze();
        apply();
        committed();
      } else if (expected.next === 'OBSERVED') {
        freeze();
        apply();
        committed();
      } else if (expected.next === 'FROZEN') {
        apply();
        committed();
      } else if (expected.next === 'PREPARING') {
        prepare();
        accept();
        freeze();
        apply();
        committed();
      } else if (expected.next === 'CONSUMED') committed();
      else if (expected.next === 'INVALID' || expected.next === 'CLOSED') {
        released(f, token);
        assert.deepEqual(allRows(f.db), beforeCall);
        assert.deepEqual(allRows(f.reopen(true)), beforeCall);
      } else assert.fail('unverified successor ' + expected.next);
    }
    s.close();
    assert.equal(f.db.isTransaction, false);
  });
