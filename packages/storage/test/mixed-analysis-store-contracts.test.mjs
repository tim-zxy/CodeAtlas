import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { cases, loadCase } from '../../../fixtures/phase1/mixed-analysis-store/corpus.mjs';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { observationFixture } from './helpers/mixed-analysis-fixture.mjs';
import {
  allRows,
  frozen,
  committedPythonFixture,
} from './helpers/mixed-analysis-store-fixture.mjs';
import { historyLimits, referenceCanonical } from './helpers/r011-history-fixture.mjs';
import {
  MixedAnalysisStore,
  inspectMixedAnalysisOutcome,
} from '../dist/analysis/mixed-analysis-store.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  bindings = JSON.parse(fs.readFileSync(new URL('contract-guard-execution-bindings.json', root)));
function independentTarget(before) {
  const ref = JSON.parse(readComponentReference('store-row-independent/mixed.json'));
  const tables = Object.fromEntries(
    Object.entries(ref.tables).map(([key, rows]) => [
      key,
      rows.sort((a, b) =>
        referenceCanonical(a) < referenceCanonical(b)
          ? -1
          : referenceCanonical(a) > referenceCanonical(b)
            ? 1
            : 0,
      ),
    ]),
  );
  return { ...before, ...tables };
}
const code = (c) => (e) => e.code === c && e.message === e.code;
for (const binding of bindings.cases)
  test('bound original Store contract ' + binding.id, async (t) => {
    const c = cases.find((c) => c.id === binding.id),
      { input, expected } = loadCase(c),
      id = input.scenario;
    assert.equal(id, binding.id);
    assert.deepEqual(expected, {
      lastGoodPreservedOnRefusal: true,
      immutableHistory: true,
      noPartialVisibility: true,
    });
    for (const key of ['input', 'expected'])
      assert.equal(
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(new URL(c[key], root)))
          .digest('hex'),
        binding[key + 'Sha256'],
      );
    const f =
        binding.context === 'independent-committed-python'
          ? await committedPythonFixture(t)
          : await frozen(t),
      before = allRows(f.db),
      store = new MixedAnalysisStore(f.db),
      original = f.db.exec;
    let hits = 0,
      target = before;
    const settled = () => {
      assert.equal(f.db.isTransaction, false);
      assert.deepEqual(allRows(f.db), target);
      assert.deepEqual(allRows(f.reopen(true)), target);
    };
    const dead = () =>
      assert.throws(() => store.apply(f.token.lease, historyLimits), code('STAGE_RELEASED'));
    if (id === 'full-initial' || id === 'duplicate-apply') {
      target = independentTarget(before);
      f.db.exec = function (sql) {
        if (sql === 'COMMIT') {
          hits++;
          assert.deepEqual(allRows(f.reopen(true)), before);
        }
        return original.call(this, sql);
      };
      assert.equal(
        store.apply(f.token.lease, historyLimits),
        JSON.parse(readComponentReference('store-row-independent/mixed.json')).expected
          .activationId,
      );
      f.db.exec = original;
      assert.equal(hits, 1);
      settled();
      dead();
    } else if (id.startsWith('readonly-unknown-')) {
      const committed = id !== 'readonly-unknown-not-committed';
      f.db.exec = function (sql) {
        if (sql === 'COMMIT') {
          hits++;
          if (committed) original.call(this, sql);
          throw Error('isolated uncertain commit boundary');
        }
        return original.call(this, sql);
      };
      assert.throws(
        () => store.apply(f.token.lease, historyLimits),
        code('COMMIT_OUTCOME_UNKNOWN'),
      );
      f.db.exec = original;
      assert.equal(hits, 1);
      dead();
      target = committed ? independentTarget(before) : before;
      settled();
      if (id === 'readonly-unknown-inconsistent') {
        f.db.prepare("UPDATE source_files SET content_fingerprint='external-after-unknown'").run();
        target = allRows(f.db);
      }
      const outcome = inspectMixedAnalysisOutcome(store, historyLimits);
      assert.equal(
        outcome.status,
        id === 'readonly-unknown-inconsistent'
          ? 'INCONSISTENT'
          : committed
            ? 'COMMITTED'
            : 'NOT_COMMITTED',
      );
      settled();
    } else if (id === 'cross-db-lease') {
      const other = await observationFixture(t, 'mixed'),
        otherBefore = allRows(other.db);
      assert.throws(
        () => new MixedAnalysisStore(other.db).apply(f.token.lease, historyLimits),
        code('INVALID_STAGE'),
      );
      assert.deepEqual(allRows(other.db), otherBefore);
      assert.deepEqual(allRows(other.reopen(true)), otherBefore);
      settled();
    } else {
      if (id === 'source-drift')
        f.db.prepare("UPDATE source_files SET content_fingerprint='external-source-drift'").run();
      if (id === 'same-fingerprint-support-drift') {
        const fingerprint = f.db
          .prepare('SELECT indexed_content_fingerprint f FROM repository_state')
          .get().f;
        const row = f.db
            .prepare(
              'SELECT evidence_id,candidate_json FROM active_support_candidates ORDER BY evidence_id LIMIT 1',
            )
            .get(),
          candidate = JSON.parse(row.candidate_json);
        candidate.name += ' external support drift';
        f.db
          .prepare('UPDATE active_support_candidates SET candidate_json=? WHERE evidence_id=?')
          .run(referenceCanonical(candidate), row.evidence_id);
        assert.equal(
          f.db.prepare('SELECT indexed_content_fingerprint f FROM repository_state').get().f,
          fingerprint,
        );
      }
      if (id === 'pointer-aba') {
        const pointer = before.active_history_pointer[0];
        assert.ok(pointer);
        f.db.prepare('DELETE FROM active_history_pointer').run();
        f.db
          .prepare('INSERT INTO active_history_pointer(repository_id,activation_id)VALUES(?,?)')
          .run(pointer.repository_id, pointer.activation_id);
        assert.deepEqual(allRows(f.db), before);
      }
      if (id === 'pointer-null-drift') {
        assert.equal(before.active_history_pointer.length, 1);
        f.db.prepare('DELETE FROM active_history_pointer').run();
      }
      target = allRows(f.db);
      if (id === 'ambient-transaction') f.db.exec('BEGIN');
      if (id === 'begin-fails' || id === 'temp-locked-tamper')
        f.db.exec = function (sql) {
          if (sql === 'BEGIN IMMEDIATE') {
            hits++;
            if (id === 'begin-fails') throw Error('isolated begin fault');
            const result = original.call(this, sql);
            f.db.prepare("UPDATE mixed_stage SET value_json='{}' WHERE key='FROZEN'").run();
            return result;
          }
          return original.call(this, sql);
        };
      assert.throws(
        () => store.apply(f.token.lease, historyLimits),
        (e) =>
          [
            'STAGE_CHANGED',
            'SOURCE_CHANGED',
            'HISTORY_CHANGED',
            'INVALID_CANDIDATE',
            'INVALID_STAGE',
          ].includes(e.code) && e.message === e.code,
      );
      f.db.exec = original;
      if (id === 'ambient-transaction') {
        assert.equal(f.db.isTransaction, true);
        f.db.exec('ROLLBACK');
      }
      if (id === 'begin-fails' || id === 'temp-locked-tamper') assert.equal(hits, 1);
      settled();
      dead();
      for (const table of [
        'activation_history',
        'syntax_origins',
        'syntax_projections',
        'activation_syntax_members',
      ])
        assert.deepEqual(target[table], before[table]);
    }
    f.db.exec = original;
    f.stage.close();
    settled();
  });
