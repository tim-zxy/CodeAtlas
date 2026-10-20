import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { collectMergeSupports, FactMergeError } from '../dist/fact-merger-input.js';
import { selectMergedFacts } from '../dist/fact-merger-selection.js';

const root = new URL(
  '../../../fixtures/normalization/canonical-normalization/expected/',
  import.meta.url,
);
const nodes = JSON.parse(readFileSync(new URL('nodes.json', root), 'utf8'));
const edges = JSON.parse(readFileSync(new URL('edges.json', root), 'utf8'));
const node = nodes[0];
const packageNode = nodes.find(
  (pair) => pair.canonical.kind === 'PACKAGE' && pair.canonical.sourceRange !== null,
);
const call = edges.find(
  (pair) => pair.canonical.kind === 'CALL' && pair.canonical.target.state === 'RESOLVED',
);
const ambiguous = edges.find((pair) => pair.canonical.target.resolution === 'AMBIGUOUS');
function snapshot(providerId, id) {
  return {
    id,
    repositoryId: 'repo-fixture',
    providerId,
    providerVersion: '1',
    runtimeVersion: '1',
    requestedRevisionId: 'rev-fixture',
    requestedRevisionFingerprint: 'fingerprint',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:01.000Z',
    capabilities: [],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
}
function support(pair, providerId, score = 1, changes = {}) {
  const factType = pair.provider.factType;
  const changed = {
    provider: { ...pair.provider, providerId },
    canonical: {
      ...pair.canonical,
      confidence: { score, method: providerId, reasons: [] },
      ...changes,
    },
  };
  const input = {
    repositoryId: 'repo-fixture',
    revisionId: 'rev-fixture',
    observations: [
      {
        snapshot: snapshot(providerId, `snapshot-${providerId}`),
        nodes: factType === 'NODE' ? [changed] : [],
        edges: factType === 'EDGE' ? [changed] : [],
      },
    ],
  };
  return collectMergeSupports(input)[0];
}
const allNodes = () => nodes.map((pair) => support(pair, 'gamma'));

for (const [retainedId, changedId] of [
  ['snapshot-a', 'snapshot-z'],
  ['snapshot-z', 'snapshot-a'],
]) {
  test(`retained/new package partition matches FULL regardless of snapshot labels ${retainedId}`, () => {
    const a = nodes.find((pair) => pair.provider.providerFactId === 'pkg-a');
    const b = nodes.find((pair) => pair.provider.providerFactId === 'pkg-b');
    const collect = (id, pairs) =>
      collectMergeSupports({
        repositoryId: 'repo-fixture',
        revisionId: 'rev-fixture',
        observations: [{ snapshot: snapshot('native', id), nodes: pairs, edges: [] }],
      });
    const full = selectMergedFacts(collect('snapshot-full', [a, b]));
    const active = [...collect(retainedId, [a]), ...collect(changedId, [b])];
    for (const ordered of [active, [...active].reverse()]) {
      const selected = selectMergedFacts(ordered);
      assert.deepEqual(selected.nodes, full.nodes);
      assert.equal(selected.nodes[0].sourceRange.sourceFileId, 'file-A.java');
      assert.deepEqual(selected.nodes[0].confidence, {
        score: 1,
        method: 'fact-merger-min-v1',
        reasons: ['minimum active support score'],
      });
      assert.equal(selected.explanations[0].selectedEvidenceId, active[0].evidence.id);
      assert.deepEqual(
        selected.explanations[0].supports.map((item) => item.evidenceId).sort(),
        active.map((item) => item.evidence.id).sort(),
      );
    }
  });
}

test('same-key support merges independent of ordering with conservative confidence', () => {
  const a = support(node, 'alpha', 0.8);
  const b = support(node, 'beta', 0.6);
  const forward = selectMergedFacts([b, a]);
  assert.deepEqual(selectMergedFacts([a, b]), forward);
  assert.equal(forward.nodes.length, 1);
  assert.equal(forward.nodes[0].confidence.score, 0.6);
  assert.equal(forward.nodes[0].confidence.method, 'fact-merger-min-v1');
  assert.deepEqual(forward.nodes[0].confidence.reasons, ['minimum active support score']);
  assert.deepEqual(
    forward.explanations[0].supports.map((s) => s.evidenceId),
    [a.evidence.id, b.evidence.id],
  );
  assert.deepEqual(selectMergedFacts([a]).nodes[0].confidence, a.canonical.confidence);
});

test('edge resolution and node source choose real supports without synthesizing candidates', () => {
  const exact = support(call, 'beta', 0.8);
  const heuristic = support(call, 'alpha', 0.6, {
    target: { ...call.canonical.target, resolution: 'HEURISTIC' },
  });
  assert.equal(
    selectMergedFacts([...allNodes(), exact, heuristic]).edges[0].target.resolution,
    'EXACT',
  );
  const preferred = support(ambiguous, 'beta', 0.7);
  const alternate = support(ambiguous, 'alpha', 0.8, {
    target: {
      ...ambiguous.canonical.target,
      resolution: 'UNRESOLVED',
      candidates: [ambiguous.canonical.target.candidates[0]],
    },
  });
  const chosen = selectMergedFacts([...allNodes(), alternate, preferred]);
  assert.deepEqual(chosen.edges[0].target.candidates, preferred.canonical.target.candidates);
  assert.ok(
    chosen.explanations
      .find((e) => e.fact.factType === 'EDGE')
      .conflicts.includes('CANDIDATE_VARIANT'),
  );
  const source = support(packageNode, 'beta', 0.7);
  const synthetic = support(packageNode, 'alpha', 0.8, { sourceRange: null });
  assert.deepEqual(
    selectMergedFacts([synthetic, source]).nodes[0].sourceRange,
    source.canonical.sourceRange,
  );
});

test('identity conflicts and dangling edge references fail atomically', () => {
  const good = support(node, 'alpha');
  const bad = support(node, 'beta', 1, { symbolKind: 'FIELD' });
  assert.throws(
    () => selectMergedFacts([good, bad]),
    (error) => error instanceof FactMergeError && error.code === 'FACT_CONFLICT',
  );
  const edge = support(call, 'alpha');
  assert.throws(
    () => selectMergedFacts([edge]),
    (error) => error instanceof FactMergeError && error.code === 'DANGLING_REFERENCE',
  );
  const otherKey = support(node, 'beta', 1, { factKey: 'node-fact-v1:other' });
  assert.throws(
    () => selectMergedFacts([good, otherKey]),
    (error) => error instanceof FactMergeError && error.code === 'FACT_CONFLICT',
  );
  const collidingNode = support(node, 'beta', 1, { id: edge.canonical.id });
  assert.throws(
    () => selectMergedFacts([edge, collidingNode]),
    (error) =>
      error instanceof FactMergeError &&
      error.code === 'DANGLING_REFERENCE' &&
      assert.deepEqual(error.path, [...edge.inputPath, 'canonical', 'source']) === undefined,
  );
});
