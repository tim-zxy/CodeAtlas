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
import readCapture, { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const root = new URL('../../../fixtures/phase1/mixed-analysis-stage/', import.meta.url),
  x = JSON.parse(fs.readFileSync(new URL('retained-deletion-independent-context.json', root))),
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
test('bound original immutable retained and retired origins survive real Stage and committed delta exactly', async (t) => {
  for (const b of x.bindings)
    for (const key of ['input', 'expected'])
      assert.equal(sha(fs.readFileSync(new URL(b[key], root))), b[key + 'Sha256']);
  assert.equal(sha(readComponentReference(x.provenance.logicalPath)), x.provenance.sha256);
  assert.equal(sha(fs.readFileSync(x.provenance.qualifiedBase)), x.provenance.qualifiedBaseSha256);
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.input);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  const witness = readCapture(f.db, h.handle, historyLimits).data.origins.find(
    (o) => o.id === x.expected.origins[0].id,
  );
  assert.equal(Object.getPrototypeOf(witness), null);
  assert.deepEqual({ ...witness }, x.expected.origins[0]);
  const stage = new MixedAnalysisStage(
      f.db,
      h.handle,
      'DELTA',
      historyLimits,
      createMixedAnalysisRules(),
    ),
    owner = stage.prepareOwner(null, x.preparation);
  assert.equal(owner.stageDigest, x.owner.stageDigest);
  stage.acceptObservation(owner.ownerHandle, null);
  const token = stage.freeze(),
    stored = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
  for (const key of ['manifest', 'activationId', 'origins', 'projections', 'members', 'basis'])
    assert.deepEqual(
      key === 'projections' ? ordered(stored[key]) : stored[key],
      key === 'projections' ? ordered(x.expected[key]) : x.expected[key],
      key,
    );
  assert.deepEqual(allRows(f.db), before);
  const retired = stored.manifest.transitions.syntaxRequirements.filter(
      (r) => r.action === 'RETIRE_ORIGIN',
    ),
    retained = stored.manifest.transitions.syntaxRequirements.filter(
      (r) => r.action === 'REVALIDATE_FINAL_BASIS',
    );
  assert.equal(retired.length, 2);
  assert.equal(retained.length, 1);
  for (const o of stored.origins)
    assert.deepEqual(
      o,
      before.syntax_origins.find((r) => r.id === o.id),
    );
  const target = {
      ...before,
      ...Object.fromEntries(Object.entries(x.expectedTables).map(([k, v]) => [k, ordered(v)])),
    },
    store = new MixedAnalysisStore(f.db);
  assert.equal(store.apply(token.lease, historyLimits), x.expected.activationId);
  assert.deepEqual(allRows(f.db), target);
  assert.deepEqual(allRows(f.reopen(true)), target);
  assert.deepEqual(target.syntax_origins, before.syntax_origins);
  const fresh = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
  assert.equal(fresh.view.status, 'AVAILABLE');
  assert.deepEqual(fresh.view.history, x.expected.manifest);
  stage.close();
});
