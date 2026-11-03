import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { modelJavaOwner } from '../../../fixtures/phase1/mixed-analysis-stage/independent-java-owner-resource-model.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/java-owner-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
for (const c of ref.cases)
  test('independent real Runtime Java owner callback exact and one-below ' + c.id, () => {
    assert.equal(sha(fs.readFileSync(c.source.manifestPath)), c.source.manifestSha256);
    assert.equal(sha(fs.readFileSync(c.source.assetPath)), c.source.assetSha256);
    const original = JSON.parse(readComponentReference(c.source.path));
    assert.deepEqual(c.input, original.input);
    assert.deepEqual(modelJavaOwner(c.input), c.expected);
    const before = structuredClone(c.input),
      limits = {
        maxRows: 1,
        maxSerializedBytes: c.expected.cost.serializedBytes,
        maxItems: c.expected.cost.items,
        maxDepth: c.expected.cost.maxDepth,
        memoryBudgetBytes: c.expected.cost.memoryBudgetBytes,
      },
      run = (l) => createMixedAnalysisRules().prepareJavaOwner(c.input, l);
    assert.deepEqual(run(limits), c.expected.result);
    for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
        key,
      );
    assert.deepEqual(c.input, before);
    assert.equal(c.expected.cost.rows, 0);
  });
