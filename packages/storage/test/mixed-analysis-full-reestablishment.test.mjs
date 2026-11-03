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
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const root = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  x = JSON.parse(fs.readFileSync(new URL('full-reestablishment-independent-context.json', root))),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  ordered = (rows) =>
    rows
      .map((r) => ({ ...r }))
      .sort((a, b) =>
        referenceCanonical(a) < referenceCanonical(b)
          ? -1
          : referenceCanonical(a) > referenceCanonical(b)
            ? 1
            : 0,
      );
test('bound original accurate-parent full and provider revalidation match complete independent immutable history and SQL target', async (t) => {
  for (const b of x.bindings)
    for (const key of ['input', 'expected'])
      assert.equal(sha(fs.readFileSync(new URL(b[key], root))), b[key + 'Sha256']);
  for (const key of ['stage', 'sql'])
    assert.equal(sha(readComponentReference(x.provenance[key])), x.provenance[key + 'Sha256']);
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.input);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, x.input.repositoryId, historyLimits),
    stage = new MixedAnalysisStage(
      f.db,
      h.handle,
      'FULL',
      historyLimits,
      createMixedAnalysisRules(),
    );
  assert.equal(h.view.status, 'AVAILABLE');
  const owner = stage.prepareOwner(null, x.preparation);
  assert.equal(owner.stageDigest, x.owner.stageDigest);
  assert.deepEqual(
    JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get().value_json,
    ),
    x.owner.body,
  );
  stage.acceptObservation(owner.ownerHandle, {
    metadata: x.raw.metadata,
    requestBytes: Buffer.from(x.raw.requestText),
    outputBytes: Buffer.from(x.raw.outputText),
  });
  const token = stage.freeze(),
    stored = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
  for (const key of Object.keys(x.expected)) {
    const actual =
        key === 'projections'
          ? stored[key].toSorted((a, b) => (a.id < b.id ? -1 : 1))
          : stored[key],
      expected =
        key === 'projections'
          ? x.expected[key].toSorted((a, b) => (a.id < b.id ? -1 : 1))
          : x.expected[key];
    assert.deepEqual(actual, expected, key);
  }
  assert.deepEqual(allRows(f.db), before);
  const target = {
      ...before,
      ...Object.fromEntries(Object.entries(x.expectedTables).map(([k, v]) => [k, ordered(v)])),
    },
    store = new MixedAnalysisStore(f.db);
  assert.equal(store.apply(token.lease, historyLimits), x.expected.activationId);
  assert.deepEqual(allRows(f.db), target);
  assert.deepEqual(allRows(f.reopen(true)), target);
  assert.equal(f.db.isTransaction, false);
  assert.throws(
    () => store.apply(token.lease, historyLimits),
    (e) => e.code === 'STAGE_RELEASED',
  );
  const fresh = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
  assert.equal(fresh.view.status, 'AVAILABLE');
  assert.deepEqual(fresh.view.history, x.expected.manifest);
  assert.equal(
    fresh.view.history.parent.activationId,
    before.active_history_pointer[0].activation_id,
  );
  for (const table of [
    'syntax_origins',
    'syntax_projections',
    'activation_history',
    'activation_syntax_members',
  ])
    for (const row of before[table])
      assert.ok(
        allRows(f.db)[table].some((after) => referenceCanonical(after) === referenceCanonical(row)),
        table + ' old immutable row must survive',
      );
  stage.close();
});
