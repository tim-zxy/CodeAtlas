import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeDeclaredFullRawSupportCandidate } from '../../providers/dist/declared-delta-raw-support-candidate.js';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/zero-provider-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const c of ref.cases)
  test('independent real full zero projected Provider resource exact and one-below ' + c.id, () => {
    assert.equal(sha(c.source.path), c.source.sha256);
    const limits = {
        maxSerializedBytes: c.expected.cost.serializedBytes,
        maxItems: c.expected.cost.items,
        maxDepth: c.expected.cost.maxDepth,
      },
      run = (l, initial = { serializedBytes: 0, items: 0 }) => {
        const context = { limits: l, budget: { ...initial } },
          result = composeDeclaredFullRawSupportCandidate(
            c.target,
            c.raw.metadata,
            Buffer.from(c.raw.requestText),
            Buffer.from(c.raw.outputText),
            context,
          );
        return { result, budget: context.budget };
      };
    const x = run(limits);
    assert.deepEqual(x.result, c.expected.result);
    assert.deepEqual(x.budget, {
      serializedBytes: limits.maxSerializedBytes,
      items: limits.maxItems,
    });
    for (const key of Object.keys(limits))
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        key,
      );
    assert.equal(
      c.expected.ledger.reduce((n, s) => n + s.items, 0),
      limits.maxItems,
    );
    assert.equal(
      c.expected.ledger.reduce((n, s) => n + s.serializedBytes, 0),
      limits.maxSerializedBytes,
    );
    const prior = { serializedBytes: 17, items: 11 },
      again = run(
        {
          ...limits,
          maxSerializedBytes: limits.maxSerializedBytes + prior.serializedBytes,
          maxItems: limits.maxItems + prior.items,
        },
        prior,
      );
    assert.deepEqual(again.result, c.expected.result);
    assert.deepEqual(again.budget, {
      serializedBytes: limits.maxSerializedBytes + prior.serializedBytes,
      items: limits.maxItems + prior.items,
    });
  });
