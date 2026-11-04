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
  x = JSON.parse(fs.readFileSync(new URL('raw-delta-independent-context.json', root))),
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
test('bound original Store delta-complete validates actual partial raw, retained foreign/native support and full independent SQL target', async (t) => {
  for (const key of ['input', 'expected'])
    assert.equal(sha(fs.readFileSync(new URL(x.binding[key], root))), x.binding[key + 'Sha256']);
  assert.equal(sha(readComponentReference(x.provenance.logicalPath)), x.provenance.sha256);
  const raw = {
      metadata: x.raw.metadata,
      requestBytes: Buffer.from(x.raw.requestText),
      outputBytes: Buffer.from(x.raw.outputText),
    },
    rules = createMixedAnalysisRules(),
    { usage, ...control } = rules.compose({ ...x.declaredInput, rawBundle: raw }, historyLimits);
  assert.deepEqual(
    control,
    x.expected,
    'new owner/locator/wire/ledger binding must match complete independent pure result',
  );
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.input);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  assert.deepEqual(h.view.history, x.declaredInput.capture.history);
  assert.deepEqual(h.view.targetSource, x.declaredInput.target.source);
  const stage = new MixedAnalysisStage(f.db, h.handle, 'DELTA', historyLimits, rules),
    owner = stage.prepareOwner(null, x.preparation);
  assert.equal(owner.stageDigest, x.owner.stageDigest);
  assert.deepEqual(
    JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get().value_json,
    ),
    x.owner.body,
  );
  stage.acceptObservation(owner.ownerHandle, raw);
  const token = stage.freeze(),
    stored = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
  for (const key of Object.keys(x.expected)) assert.deepEqual(stored[key], x.expected[key], key);
  assert.deepEqual(allRows(f.db), before);
  const foreign = before.evidence.filter((e) => e.provider_id === 'external');
  assert.ok(foreign.length > 0);
  const target = {
      ...before,
      ...Object.fromEntries(Object.entries(x.expectedTables).map(([k, v]) => [k, ordered(v)])),
    },
    store = new MixedAnalysisStore(f.db);
  assert.equal(store.apply(token.lease, historyLimits), x.expected.activationId);
  assert.deepEqual(allRows(f.db), target);
  assert.deepEqual(allRows(f.reopen(true)), target);
  for (const row of foreign)
    assert.deepEqual(
      target.evidence.find((e) => e.id === row.id),
      row,
    );
  assert.equal(f.db.isTransaction, false);
  assert.throws(
    () => store.apply(token.lease, historyLimits),
    (e) => e.code === 'STAGE_RELEASED',
  );
  const fresh = captureActivationContext(f.db, x.input.repositoryId, historyLimits);
  assert.equal(fresh.view.status, 'AVAILABLE');
  assert.deepEqual(fresh.view.history, x.expected.manifest);
  stage.close();
});
