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
import { injectWriteBoundary, writePoints } from './helpers/mixed-analysis-faults.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../dist/analysis/mixed-analysis-store.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { modelInitialWritePrefixes } from '../../../fixtures/phase1/mixed-analysis-stage/independent-initial-write-prefix-resource-model.mjs';
import { modelActiveWritePrefixes } from '../../../fixtures/phase1/mixed-analysis-stage/independent-active-write-prefix-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync('fixtures/phase1/mixed-analysis-stage/write-prefix-resource-reference.json'),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
  values = (b) => ({
    rows: b.rows,
    serializedBytes: b.serializedBytes,
    items: b.items,
    retainedLogicalBytes: b.retainedLogicalBytes,
  }),
  sort = (rows) =>
    rows.toSorted((a, b) =>
      referenceCanonical(a) < referenceCanonical(b)
        ? -1
        : referenceCanonical(a) > referenceCanonical(b)
          ? 1
          : 0,
    );
assert.deepEqual(
  ref.cases.map((c) => c.point),
  writePoints,
);
for (const c of ref.cases)
  test('independent original SQL write-boundary complete resource prefix ' + c.point, async (t) => {
    for (const p of [c.source, ref.schemaSource, ...ref.models])
      assert.equal(sha(p.path), p.sha256, p.path);
    const source = JSON.parse(fs.readFileSync(c.source.path)),
      x = c.active ? source : source.cases.find((x) => x.id === 'mixed'),
      schema = JSON.parse(fs.readFileSync(ref.schemaSource.path)),
      model = c.active
        ? modelActiveWritePrefixes(x.input, x.semantic, x.preparation, x.raw, schema)
        : modelInitialWritePrefixes(x.input, x.preparation, x.javaRows, x.raw, schema);
    for (const p of schema.sources) assert.equal(sha(p.path), p.sha256);
    assert.deepEqual(model.prefixes[c.point], c.expected);
    const f = await historyFixture(t, 'available', { seed: false });
    seedLiteral(f.db, x.input);
    const before = allRows(f.db),
      cap = captureActivationContext(f.db, x.input.repositoryId, historyLimits),
      limits = c.expected.required,
      stage = new MixedAnalysisStage(f.db, cap.handle, 'FULL', limits, createMixedAnalysisRules()),
      owner = stage.prepareOwner(x.javaRows || null, x.preparation);
    stage.acceptObservation(owner.ownerHandle, {
      metadata: x.raw.metadata,
      requestBytes: Buffer.from(x.raw.requestText),
      outputBytes: Buffer.from(x.raw.outputText),
    });
    const token = stage.freeze(),
      store = new MixedAnalysisStore(f.db),
      add = HistoryReadBudget.prototype.add;
    let budget;
    HistoryReadBudget.prototype.add = function (...args) {
      if ((new Error().stack.split('\n')[2] || '').includes('at acquireMixedAnalysisLease'))
        budget = this;
      return add.apply(this, args);
    };
    const fault = injectWriteBoundary(f.db, c.point, () => {
      throw Error('independent-frozen-prefix-boundary');
    });
    try {
      if (c.point === 'post-commit-close')
        assert.equal(store.apply(token.lease, limits), model.activationId);
      else
        assert.throws(
          () => store.apply(token.lease, limits),
          (e) =>
            e.code ===
            (['pre-commit', 'commit-unknown'].includes(c.point)
              ? 'COMMIT_OUTCOME_UNKNOWN'
              : 'INVALID_CANDIDATE'),
        );
      assert.equal(fault.hits(), 1);
      assert.deepEqual(values(budget), c.expected.state);
    } finally {
      fault.restore();
      HistoryReadBudget.prototype.add = add;
    }
    assert.equal(f.db.isTransaction, false);
    assert.throws(
      () => store.apply(token.lease, limits),
      (e) => e.code === 'STAGE_RELEASED',
    );
    const target = c.committed
      ? Object.fromEntries(Object.entries(model.tables).map(([k, v]) => [k, sort(v)]))
      : before;
    assert.deepEqual(allRows(f.db), target);
    assert.deepEqual(allRows(f.reopen(true)), target);
    if (c.point !== 'post-commit-close') {
      const spent = values(budget);
      stage.close();
      assert.deepEqual(values(budget), spent);
    }
  });
