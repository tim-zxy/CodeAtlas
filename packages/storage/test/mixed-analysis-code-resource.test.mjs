import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { predictCodeActivation } from '../dist/analysis/code-identity.js';
const r = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/code-identity-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const c of r.cases)
  test('independent complete Code identity resource algebra exact and one-below ' + c.id, () => {
    assert.equal(sha(c.source.path), c.source.sha256);
    const e = c.cost,
      limits = {
        maxRows: 1,
        maxSerializedBytes: e.serializedBytes,
        maxItems: e.items,
        maxDepth: e.maxDepth,
        memoryBudgetBytes: e.memoryBudgetBytes,
      },
      b = new HistoryReadBudget(limits);
    assert.deepEqual(predictCodeActivation(c.input, b), c.basis);
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
        () =>
          predictCodeActivation(
            c.input,
            new HistoryReadBudget({ ...limits, [key]: limits[key] - 1 }),
          ),
        (err) => err.code === 'HISTORY_LIMIT_EXCEEDED',
        key,
      );
    assert.equal(c.ledger.groups.length, 9);
    assert.equal(
      e.serializedBytes,
      c.ledger.domainBytes + c.ledger.encodedBytes + c.ledger.framingBytes,
    );
    assert.equal(
      e.retainedLogicalBytes,
      c.ledger.ownedWeight +
        c.ledger.domainBytes +
        2 * c.ledger.encodedBytes +
        c.ledger.framingBytes +
        c.ledger.finalDigestPin,
    );
  });
