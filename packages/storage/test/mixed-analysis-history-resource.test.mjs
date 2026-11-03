import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HistoryReadBudget,
  validateHistoryManifest,
  validateSyntaxPair,
} from '../dist/analysis/activation-history-format.js';
const r = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/history-format-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const c of r.cases)
  test('independent complete history format resource ledger exact and one-below ' + c.id, () => {
    assert.equal(sha(c.source.path), c.source.sha256);
    const e = c.cost,
      limits = {
        maxRows: 1,
        maxSerializedBytes: e.serializedBytes,
        maxItems: e.items,
        maxDepth: e.maxDepth,
        memoryBudgetBytes: e.memoryBudgetBytes,
      },
      run = (b) =>
        c.kind === 'manifest'
          ? validateHistoryManifest(c.input, b)
          : validateSyntaxPair(
              c.input.origin,
              c.input.projection,
              c.input.metadata,
              c.input.unitId,
              c.input.current,
              c.input.ancestors,
              b,
            ),
      b = new HistoryReadBudget(limits);
    const result = run(b);
    if (c.kind === 'manifest') assert.deepEqual(result, c.input);
    assert.deepEqual(
      {
        rows: b.rows,
        serializedBytes: b.serializedBytes,
        items: b.items,
        retainedLogicalBytes: b.retainedLogicalBytes,
      },
      {
        rows: e.rows,
        serializedBytes: e.serializedBytes,
        items: e.items,
        retainedLogicalBytes: e.retainedLogicalBytes,
      },
    );
    for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
      assert.throws(
        () => run(new HistoryReadBudget({ ...limits, [key]: limits[key] - 1 })),
        (err) => err.code === 'HISTORY_LIMIT_EXCEEDED',
        key,
      );
    for (const key of ['items', 'serializedBytes', 'retainedLogicalBytes'])
      assert.equal(
        e[key],
        c.ledger.reduce((n, s) => n + s[key], 0),
      );
  });
