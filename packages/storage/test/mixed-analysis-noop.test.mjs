import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import readCapture, {
  captureActivationContext,
  recheckActivationContext,
} from '../dist/analysis/activation-history.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const root = new URL('../../../fixtures/phase1/mixed-analysis-store/', import.meta.url),
  x = JSON.parse(fs.readFileSync(new URL('noop-independent-context.json', root))),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
test('bound original Stage/Store NO_OP preserves actual validated history without creating Stage', async (t) => {
  for (const b of x.bindings) {
    const r = new URL('../mixed-analysis-' + b.domain + '/', root);
    for (const k of ['input', 'expected'])
      assert.equal(sha(fs.readFileSync(new URL(b[k], r))), b[k + 'Sha256']);
  }
  for (const prefix of ['runtime', 'sql', 'source'])
    assert.equal(sha(read(x.provenance[prefix + 'LogicalPath'])), x.provenance[prefix + 'Sha256']);
  const original = JSON.parse(read(x.provenance.runtimeLogicalPath));
  assert.deepEqual(x.declared, original);
  assert.equal(x.declared.input.rawCase, null);
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.source);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, x.source.repositoryId, historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  assert.deepEqual(h.view.history, x.declared.input.capture.history);
  assert.deepEqual(h.view.targetSource, x.declared.input.target.source);
  assert.deepEqual(h.view.targetInventory, x.declared.input.target.inventory);
  const actual = readCapture(f.db, h.handle, historyLimits);
  const byId = (rows) => rows.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assert.deepEqual(
    byId(actual.data.origins.map((row) => ({ ...row }))),
    byId(x.declared.input.capture.origins),
  );
  assert.deepEqual(
    byId(actual.data.projections.map((row) => ({ ...row }))),
    byId(x.declared.input.capture.projections),
  );
  const { rawCase, ...input } = structuredClone(x.declared.input);
  input.rawBundle = null;
  const { usage, ...result } = createMixedAnalysisRules().compose(input, historyLimits);
  assert.deepEqual(result, x.declared.expected);
  assert.equal(result.kind, 'NO_OP');
  assert.equal(result.activationId, x.declared.input.capture.parent.activationId);
  recheckActivationContext(f.db, h.handle, historyLimits);
  assert.deepEqual(allRows(f.db), before);
  assert.deepEqual(allRows(f.reopen(true)), before);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM sqlite_temp_schema WHERE name='mixed_stage'").get().n,
    0,
  );
  assert.equal(f.db.isTransaction, false);
});
