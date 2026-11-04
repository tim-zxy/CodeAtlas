import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
import { modelNonemptyValidation } from '../../../fixtures/phase1/mixed-analysis-stage/independent-nonempty-validation-resource-model.mjs';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
const ref = JSON.parse(
    fs.readFileSync(
      'fixtures/phase1/mixed-analysis-stage/nonempty-validation-resource-reference.json',
    ),
  ),
  sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
for (const c of ref.cases)
  test('independent nonempty Runtime full validation exact and one-below ' + c.id, () => {
    for (const s of [{ path: ref.sourcePath, sha256: ref.sourceSha256 }, ...ref.models])
      assert.equal(sha(fs.readFileSync(s.path)), s.sha256);
    const provider = JSON.parse(fs.readFileSync(ref.sourcePath)).cases.find((v) => v.id === c.id),
      old = JSON.parse(read(provider.sources[0].path));
    assert.deepEqual(c.raw, provider.raw);
    assert.deepEqual(c.expected.input.target, provider.target);
    assert.deepEqual(Object.keys(old.input.tables).sort(), [
      'repository',
      'repository_state',
      'revisions',
      'source_files',
    ]);
    assert.deepEqual(c.expected.input.capture, {
      parent: null,
      snapshotIds: [],
      snapshots: [],
      coverage: [],
      activeProviderIds: [],
    });
    assert.equal(c.expected.input.owner.stageDigest, old.expected.stageDigest);
    assert.deepEqual(
      modelNonemptyValidation(
        c.expected.input.target,
        c.expected.input.capture,
        c.expected.input.owner.stageDigest,
        c.raw,
      ),
      c.expected,
    );
    const e = c.expected,
      input = {
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
      run = (l) => createMixedAnalysisRules().validateObservation(input, l);
    assert.deepEqual(run(limits), e.result);
    for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
      assert.throws(
        () => run({ ...limits, [key]: limits[key] - 1 }),
        (err) => err.code === 'STAGE_LIMIT_EXCEEDED',
        key,
      );
    for (const key of ['items', 'serializedBytes', 'retainedLogicalBytes'])
      assert.equal(
        e.ledger.reduce((n, s) => n + s[key], 0),
        e.cost[key],
      );
    assert.equal(e.cost.rows, 0);
    assert.deepEqual(e.input, before);
    assert.equal(input.rawBundle.requestBytes.toString(), c.raw.requestText);
    assert.equal(input.rawBundle.outputBytes.toString(), c.raw.outputText);
  });
