import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const ref = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../fixtures/phase1/mixed-analysis-stage/zero-runtime-resource-reference.json',
        import.meta.url,
      ),
    ),
  ),
  sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const c of ref.cases)
  for (const phase of ['validation', 'composition'])
    test(
      'independent real Runtime zero projected ' + phase + ' exact and one-below ' + c.id,
      () => {
        assert.equal(sha(c.source.path), c.source.sha256);
        assert.equal(sha(c.stageSource.path), c.stageSource.sha256);
        const e = c[phase],
          limits = {
            maxRows: 1,
            maxItems: e.cost.items,
            maxSerializedBytes: e.cost.serializedBytes,
            maxDepth: e.cost.maxDepth,
            memoryBudgetBytes: e.cost.memoryBudgetBytes,
          },
          run = (l) =>
            createMixedAnalysisRules()[phase === 'validation' ? 'validateObservation' : 'compose'](
              {
                ...e.input,
                rawBundle: {
                  metadata: c.raw.metadata,
                  requestBytes: Buffer.from(c.raw.requestText),
                  outputBytes: Buffer.from(c.raw.outputText),
                },
              },
              l,
            );
        assert.deepEqual(run(limits), e.result);
        for (const key of ['maxItems', 'maxSerializedBytes', 'maxDepth', 'memoryBudgetBytes'])
          assert.throws(
            () => run({ ...limits, [key]: limits[key] - 1 }),
            (err) =>
              phase === 'validation'
                ? err.code === 'STAGE_LIMIT_EXCEEDED'
                : ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(err.code),
            key,
          );
        for (const key of ['items', 'serializedBytes', 'retainedLogicalBytes'])
          assert.equal(
            e.cost[key],
            e.ledger.reduce((n, s) => n + s[key], 0),
          );
      },
    );
