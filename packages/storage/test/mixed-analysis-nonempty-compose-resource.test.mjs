import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { modelNonemptyCompose } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-compose-resource-model.mjs';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      'fixtures/phase1/mixed-analysis-stage/nonempty-compose-resource-reference.json',
    ),
  ),
  sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
for (const c of ref.cases)
  test('independent nonempty full Runtime composition exact and one-below ' + c.id, () => {
    for (const s of [
      { path: ref.sourcePath, sha256: ref.sourceSha256 },
      { path: ref.manifestPath, sha256: ref.manifestSha256 },
      { path: ref.modelPath, sha256: ref.modelSha256 },
      { path: c.source.assetPath, sha256: c.source.assetSha256 },
    ])
      assert.equal(sha(fs.readFileSync(s.path)), s.sha256);
    assert.equal(sha(read(c.source.path)), c.source.sha256);
    const old = JSON.parse(read(c.source.path)),
      v = JSON.parse(fs.readFileSync(ref.sourcePath)).cases.find((v) => v.id === c.id),
      e = c.expected;
    assert.deepEqual(c.raw, v.raw);
    assert.deepEqual(e.input.target, v.expected.input.target);
    assert.deepEqual(e.input.capture, v.expected.input.capture);
    for (const k of ['manifest', 'activationId', 'origins', 'projections', 'members', 'basis'])
      assert.deepEqual(e.result[k], old[k], k);
    assert.deepEqual(
      modelNonemptyCompose(e.input.target, e.input.capture, e.input.qualificationRef, c.raw),
      e,
    );
    const input = {
        ...e.input,
        rawBundle: {
          metadata: c.raw.metadata,
          requestBytes: Buffer.from(c.raw.requestText),
          outputBytes: Buffer.from(c.raw.outputText),
        },
      },
      before = structuredClone(e.input),
      limits = {
        maxRows: 1,
        maxSerializedBytes: e.cost.serializedBytes,
        maxItems: e.cost.items,
        maxDepth: e.cost.maxDepth,
        memoryBudgetBytes: e.cost.memoryBudgetBytes,
      },
      run = (l) => createMixedAnalysisRules().compose(input, l);
    assert.deepEqual(run(limits), e.result);
    for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (err) => ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(err.code),
        key,
      );
    for (const key of ['serializedBytes', 'items', 'retainedLogicalBytes'])
      assert.equal(
        e.ledger.reduce((n, s) => n + s[key], 0),
        e.cost[key],
      );
    assert.equal(e.cost.rows, 0);
    assert.deepEqual(e.input, before);
    assert.equal(input.rawBundle.requestBytes.toString(), c.raw.requestText);
    assert.equal(input.rawBundle.outputBytes.toString(), c.raw.outputText);
  });
