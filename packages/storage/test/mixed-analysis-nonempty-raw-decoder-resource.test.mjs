import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCodeSyntaxObservationStreamWithBudget } from '../../providers/dist/native-code-syntax-ipc.js';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { modelNonemptyRawDecoder } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-raw-decoder-resource-model.mjs';
const path = 'fixtures/phase1/mixed-analysis-stage/nonempty-raw-decoder-resource-reference.json',
  ref = JSON.parse(fs.readFileSync(path)),
  sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
for (const c of ref.cases)
  test('independent nonempty raw decoder complete exact and one-below ' + c.id, () => {
    assert.equal(sha(fs.readFileSync(ref.manifestPath)), ref.manifestSha256);
    assert.equal(sha(fs.readFileSync(ref.modelPath)), ref.modelSha256);
    for (const [s, k] of c.sources.map((s, i) => [s, i === 0 ? 'requestText' : 'outputText'])) {
      assert.equal(sha(fs.readFileSync(s.assetPath)), s.assetSha256);
      assert.equal(sha(readComponentReference(s.path)), s.sha256);
      assert.equal(readComponentReference(s.path).toString(), c.raw[k]);
    }
    assert.deepEqual(modelNonemptyRawDecoder(c.raw), c.expected);
    const request = Buffer.from(c.raw.requestText),
      output = Buffer.from(c.raw.outputText),
      requestBefore = Buffer.from(request),
      outputBefore = Buffer.from(output),
      limits = {
        maxSerializedBytes: c.expected.cost.serializedBytes,
        maxItems: c.expected.cost.items,
        maxDepth: c.expected.cost.maxDepth,
      };
    const run = (l, prior = { serializedBytes: 0, items: 0 }) => {
      const context = { limits: l, budget: { ...prior } },
        result = validateCodeSyntaxObservationStreamWithBudget(request, output, context);
      return { result, budget: context.budget };
    };
    const exact = run(limits);
    assert.deepEqual(exact.result, c.expected.result);
    assert.deepEqual(exact.budget, {
      serializedBytes: limits.maxSerializedBytes,
      items: limits.maxItems,
    });
    for (const key of Object.keys(limits))
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        key,
      );
    // Cumulative baseline comes from independent already-owned raw copies, never an observed callback receipt.
    const prior = {
        serializedBytes: Buffer.byteLength(c.raw.requestText) + Buffer.byteLength(c.raw.outputText),
        items: c.sources.length,
      },
      continued = run(
        {
          ...limits,
          maxSerializedBytes: limits.maxSerializedBytes + prior.serializedBytes,
          maxItems: limits.maxItems + prior.items,
        },
        prior,
      );
    assert.deepEqual(continued.result, c.expected.result);
    assert.deepEqual(continued.budget, {
      serializedBytes: limits.maxSerializedBytes + prior.serializedBytes,
      items: limits.maxItems + prior.items,
    });
    for (const key of ['maxSerializedBytes', 'maxItems'])
      assert.throws(
        () =>
          run(
            {
              ...limits,
              maxSerializedBytes: limits.maxSerializedBytes + prior.serializedBytes,
              maxItems: limits.maxItems + prior.items,
              [key]: limits[key] + (key === 'maxItems' ? prior.items : prior.serializedBytes) - 1,
            },
            prior,
          ),
        (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
        key + ' continued',
      );
    assert.deepEqual(request, requestBefore);
    assert.deepEqual(output, outputBefore);
    assert.equal(
      c.expected.ledger.reduce((n, s) => n + s.serializedBytes, 0),
      limits.maxSerializedBytes,
    );
    assert.equal(
      c.expected.ledger.reduce((n, s) => n + s.items, 0),
      limits.maxItems,
    );
  });
