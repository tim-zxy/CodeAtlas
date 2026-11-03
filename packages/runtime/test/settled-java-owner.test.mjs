import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createMixedAnalysisRules } from '../dist/mixed-analysis.js';
import { historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { readComponentReference as read } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { modelJavaOwner } from '../../../fixtures/phase1/mixed-analysis-stage/independent-java-owner-resource-model.mjs';
import { loadCompositionCase } from '../../providers/test/fixtures/native-composition-helpers.mjs';
const root = new URL(
  '../../../fixtures/phase1/mixed-runtime-readiness/java-owner-timing/',
  import.meta.url,
);
const expected = JSON.parse(fs.readFileSync(new URL('expected.json', root))),
  cases = JSON.parse(fs.readFileSync(new URL('cases.json', root)));
function early(id) {
  return JSON.parse(read('early-java-independent-v2/' + id + '.json'));
}
for (const id of cases.ids)
  test('settled Runtime exact independent owner budget ' + id, () => {
    const x = early(id).input;
    x.javaRows = expected[id].preparation;
    const model = modelJavaOwner(x),
      r = createMixedAnalysisRules().prepareJavaOwner(x, historyLimits);
    assert.deepEqual(r, model.result);
    const cost = model.cost,
      l = {
        maxRows: 1,
        maxSerializedBytes: cost.serializedBytes,
        maxItems: cost.items,
        maxDepth: cost.maxDepth,
        memoryBudgetBytes: cost.memoryBudgetBytes,
      };
    assert.deepEqual(createMixedAnalysisRules().prepareJavaOwner(x, l), model.result);
    for (const key of ['maxSerializedBytes', 'maxItems', 'maxDepth', 'memoryBudgetBytes'])
      assert.throws(
        () => createMixedAnalysisRules().prepareJavaOwner(x, { ...l, [key]: l[key] - 1 }),
        (e) => e.code === 'STAGE_LIMIT_EXCEEDED',
      );
  });
async function observation(id, legacy = false) {
  const raw = await loadCompositionCase(id),
    e = early(id),
    request = JSON.parse(raw.requestBytes);
  const java = {
    metadata: legacy ? e.expected.metadata : expected[id].preparation,
    nodes: e.expected.nodes,
  };
  raw.metadata.codeSyntax.startedAt = cases.finalCodeSyntaxStartedAt;
  raw.metadata.codeSyntax.settledAt = cases.finalCodeSyntaxSettledAt;
  raw.metadata.snapshot.completedAt = cases.finalCompletedAt;
  return {
    mode: 'FULL',
    target: e.input.target,
    capture: { parent: null, snapshotIds: [], snapshots: [], coverage: [], activeProviderIds: [] },
    scope: e.input.scope,
    owner: { stageDigest: request.payload.ownerBinding.stageDigest, java },
    rawBundle: {
      metadata: raw.metadata,
      requestBytes: raw.requestBytes,
      outputBytes: raw.outputBytes,
    },
  };
}
for (const id of cases.ids)
  test('settled Runtime accepts final metadata after owner ' + id, async () => {
    const x = await observation(id),
      r = createMixedAnalysisRules().validateObservation(x, historyLimits);
    assert.equal(r.raw.metadata.snapshot.completedAt, cases.finalCompletedAt);
    x.rawBundle.metadata.snapshot.completedAt = cases.lateCompletedAt;
    assert.equal(
      createMixedAnalysisRules().validateObservation(x, historyLimits).raw.metadata.snapshot
        .completedAt,
      cases.lateCompletedAt,
    );
  });
for (const kind of [
  'snapshot',
  'request',
  'event',
  'terminal',
  'tool',
  'version',
  'inventory',
  'target',
  'locator',
  'reverse-time',
  'overlap',
  'legacy-drift',
])
  test('settled Runtime rejects correlated drift ' + kind, async () => {
    const x = await observation('mixed', kind === 'legacy-drift'),
      m = x.rawBundle.metadata;
    if (kind === 'snapshot') m.snapshot.id = 'snapshot:foreign';
    if (kind === 'request') m.java.request.requestId = 'different';
    if (kind === 'event') m.java.events[0].requestId = 'different';
    if (kind === 'terminal') m.java.terminal.payload.outcome = 'FAILED';
    if (kind === 'tool') m.tool.profile = 'other';
    if (kind === 'version') m.snapshot.runtimeVersion = 'different';
    if (kind === 'inventory') m.inventory.pop();
    if (kind === 'target') m.targetSource.contentFingerprint = 'different';
    if (kind === 'locator') m.java.request.payload.repository.rootPath = '/different';
    if (kind === 'reverse-time') m.codeSyntax.startedAt = cases.invalidEarlyV5At;
    if (kind === 'overlap') m.codeSyntax.startedAt = expected.mixed.preparation.java.startedAt;
    assert.throws(
      () => createMixedAnalysisRules().validateObservation(x, historyLimits),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
  });
