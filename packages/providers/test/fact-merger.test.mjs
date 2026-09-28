import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  CanonicalEdgeSchema,
  CanonicalNodeSchema,
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
} from '../../ir/dist/index.js';
import { mergeCanonicalObservations } from '../dist/index.js';

const fixture = new URL('../../../fixtures/normalization/two-provider-same-call/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('fixture.json', fixture), 'utf8'));
const recipe = JSON.parse(readFileSync(new URL(manifest.inputs.analysis, fixture), 'utf8'));
const original = new URL('../canonical-normalization/expected/', fixture);
const nodePairs = JSON.parse(readFileSync(new URL('nodes.json', original), 'utf8'));
const edgePairs = JSON.parse(readFileSync(new URL('edges.json', original), 'utf8'));
const input = {
  repositoryId: recipe.repositoryId,
  revisionId: recipe.revisionId,
  observations: recipe.observations.map(
    ({ snapshot, providerId, nodeFactIds, edgeFactIds, score }) => ({
      snapshot,
      nodes: nodeFactIds.map((id) => {
        const pair = nodePairs.find((value) => value.provider.providerFactId === id);
        assert.ok(pair, `missing pinned node ${id}`);
        return {
          provider: { ...pair.provider, providerId },
          canonical: { ...pair.canonical, confidence: { score, method: providerId, reasons: [] } },
        };
      }),
      edges: edgeFactIds.map((id) => {
        const pair = edgePairs.find((value) => value.provider.providerFactId === id);
        assert.ok(pair, `missing pinned edge ${id}`);
        return {
          provider: { ...pair.provider, providerId },
          canonical: { ...pair.canonical, confidence: { score, method: providerId, reasons: [] } },
        };
      }),
    }),
  ),
};
const expected = JSON.parse(readFileSync(new URL(manifest.expected.lifetimes, fixture), 'utf8'));

function ids(result) {
  return {
    nodes: result.nodes.map((value) => value.id),
    edges: result.edges.map((value) => value.id),
    evidence: result.evidence.map((value) => value.id),
    bindings: result.bindings.map((value) => value.evidenceId),
    confidence: result.edges.map((value) => value.confidence),
  };
}
function digest(result) {
  return createHash('sha256').update(JSON.stringify(result)).digest('hex');
}

test('registered two-provider CALL fixture pins full, one, and zero-support current views', () => {
  assert.equal(manifest.id, 'two-provider-same-call');
  const full = mergeCanonicalObservations(input);
  assert.deepEqual(ids(full), expected.full);
  assert.equal(digest(full), expected.fullDigest);
  const one = mergeCanonicalObservations({ ...input, observations: [input.observations[0]] });
  assert.deepEqual(ids(one), expected.one);
  assert.equal(digest(one), expected.oneDigest);
  const zero = mergeCanonicalObservations({ ...input, observations: [] });
  assert.deepEqual(ids(zero), expected.zero);
  assert.equal(digest(zero), expected.zeroDigest);
  assert.deepEqual(
    full,
    mergeCanonicalObservations({ ...input, observations: [...input.observations].reverse() }),
  );
  for (const value of full.nodes) CanonicalNodeSchema.parse(value);
  for (const value of full.edges) CanonicalEdgeSchema.parse(value);
  for (const value of full.evidence) EvidenceSchema.parse(value);
  for (const value of full.factEvidence) FactEvidenceSchema.parse(value);
  for (const value of full.bindings) ProviderFactBindingSchema.parse(value);
  assert.equal(full.edges.length, 1);
  assert.equal(
    full.explanations.find((value) => value.fact.factType === 'EDGE').supports.length,
    2,
  );
});
