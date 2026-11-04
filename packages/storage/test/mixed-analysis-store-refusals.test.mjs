import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyFixture,
  seedLiteral,
  historyLimits,
  referenceCanonical,
} from './helpers/r011-history-fixture.mjs';
import { allRows, frozen } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const root = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  binding = JSON.parse(fs.readFileSync(new URL('refusal-execution-bindings.json', root)));
function original(id) {
  const b = binding.cases.find((c) => c.id === id);
  for (const key of ['input', 'expected'])
    assert.equal(
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(new URL(b[key], root)))
        .digest('hex'),
      b[key + 'Sha256'],
    );
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL(b.expected, root))), {
    lastGoodPreservedOnRefusal: true,
    immutableHistory: true,
    noPartialVisibility: true,
  });
}
test('bound original Store foreign-unobserved refuses before owner or lease and preserves complete foreign graph', async (t) => {
  original('foreign-unobserved');
  const input = JSON.parse(
    fs.readFileSync(new URL('../mixed-analysis-stage/base-input.json', root)),
  );
  for (const f of input.tables.source_files) f.language_hint = 'python';
  input.tables.active_history_pointer = [];
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, input);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, input.repositoryId, historyLimits),
    stage = new MixedAnalysisStage(
      f.db,
      h.handle,
      'FULL',
      historyLimits,
      createMixedAnalysisRules(),
    );
  assert.equal(h.view.status, 'UNAVAILABLE');
  assert.ok(before.evidence.some((e) => e.provider_id === 'alpha' && e.status === 'ACTIVE'));
  assert.throws(
    () =>
      stage.prepareOwner(
        null,
        JSON.parse(read('owner-scope-independent/full-python.json')).preparation,
      ),
    (e) => e.code === 'OTHER_PROVIDER_REVALIDATION_REQUIRED',
  );
  assert.throws(
    () => new MixedAnalysisStore(f.db).apply({}, historyLimits),
    (e) => e.code === 'INVALID_STAGE',
  );
  assert.deepEqual(allRows(f.db), before);
  stage.close();
  assert.deepEqual(allRows(f.reopen(true)), before);
  assert.equal(f.db.isTransaction, false);
});
test('bound original Store same-id-content-conflict reaches actual immutable row comparison and rolls back complete graph', async (t) => {
  original('same-id-content-conflict');
  const f = await frozen(t),
    before = allRows(f.db),
    origin = JSON.parse(read('store-row-independent/mixed.json')).tables.syntax_origins[0],
    body = JSON.parse(origin.origin_json);
  body.providerSyntaxId += '-conflict';
  const poison = { ...origin, origin_json: referenceCanonical(body) },
    prepare = f.db.prepare;
  let injected = 0,
    compared = 0;
  f.db.prepare = function (sql) {
    const stmt = prepare.call(this, sql),
      run = stmt.run,
      get = stmt.get;
    if (/^INSERT INTO evidence\(/.test(sql))
      stmt.run = function (...args) {
        const result = run.apply(this, args);
        if (!injected) {
          injected++;
          prepare
            .call(
              f.db,
              'INSERT INTO syntax_origins(id,repository_id,revision_id,origin_snapshot_id,origin_digest,origin_json)VALUES(?,?,?,?,?,?)',
            )
            .run(
              ...[
                'id',
                'repository_id',
                'revision_id',
                'origin_snapshot_id',
                'origin_digest',
                'origin_json',
              ].map((k) => poison[k]),
            );
          assert.equal(f.db.isTransaction, true);
          assert.deepEqual(allRows(f.reopen(true)), before);
        }
        return result;
      };
    if (/^SELECT id,.* FROM syntax_origins WHERE id=\?$/.test(sql))
      stmt.get = function (...args) {
        if (injected && args[0] === poison.id) compared++;
        return get.apply(this, args);
      };
    return stmt;
  };
  const store = new MixedAnalysisStore(f.db);
  assert.throws(
    () => store.apply(f.token.lease, historyLimits),
    (e) => e.code === 'INVALID_CANDIDATE' && e.message === e.code,
  );
  f.db.prepare = prepare;
  assert.equal(injected, 1);
  assert.equal(compared, 1);
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(allRows(f.db), before);
  assert.deepEqual(allRows(f.reopen(true)), before);
  assert.throws(
    () => store.apply(f.token.lease, historyLimits),
    (e) => e.code === 'STAGE_RELEASED',
  );
  f.stage.close();
});
