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
import { mergeCanonicalObservations, normalizeNativeAnalysis } from '../dist/index.js';

const fixture = new URL('../../../fixtures/normalization/two-provider-same-call/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('fixture.json', fixture), 'utf8'));
const recipe = JSON.parse(readFileSync(new URL(manifest.inputs.analysis, fixture), 'utf8'));
assert.equal(recipe.sourceFixture, 'canonical-normalization');
const original = new URL('../canonical-normalization/inputs/result.json', fixture);
const nativeResult = JSON.parse(readFileSync(original, 'utf8'));

function normalizedObservation({
  snapshot,
  providerId,
  nodeFactIds,
  edgeFactIds,
  score,
  eventOrder,
}) {
  const stream = structuredClone(nativeResult);
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.forEach(rewrite);
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'providerId') value[key] = providerId;
      else if (key === 'providerSnapshotId') value[key] = snapshot.id;
      else if (key === 'requestId') value[key] = `merge-${providerId}`;
      else rewrite(nested);
    }
  };
  rewrite(stream);
  const facts = stream.events.filter((event) => event.type === 'NODE' || event.type === 'EDGE');
  assert.ok(eventOrder === 'FORWARD' || eventOrder === 'REVERSE');
  if (eventOrder === 'REVERSE') facts.reverse();
  let cursor = 0;
  stream.events = stream.events.map((event) =>
    event.type === 'NODE' || event.type === 'EDGE' ? facts[cursor++] : event,
  );
  stream.events.forEach((event, sequence) => {
    event.sequence = sequence;
  });
  const terminal = stream.events.at(-1);
  const checksum = createHash('sha256')
    .update(
      stream.events
        .slice(0, -1)
        .map((event) => `${JSON.stringify(event)}\n`)
        .join(''),
    )
    .digest('hex');
  terminal.payload.integrityChecksum = `sha256:${checksum}`;
  stream.terminal = structuredClone(terminal);
  const normalized = normalizeNativeAnalysis(stream);
  const nodes = normalized.nodes.filter((pair) =>
    nodeFactIds.includes(pair.provider.providerFactId),
  );
  const edges = normalized.edges.filter((pair) =>
    edgeFactIds.includes(pair.provider.providerFactId),
  );
  assert.equal(nodes.length, nodeFactIds.length);
  assert.equal(edges.length, edgeFactIds.length);
  return {
    snapshot,
    nodes: nodes.map((pair) => ({
      ...pair,
      canonical: { ...pair.canonical, confidence: { score, method: providerId, reasons: [] } },
    })),
    edges: edges.map((pair) => ({
      ...pair,
      canonical: { ...pair.canonical, confidence: { score, method: providerId, reasons: [] } },
    })),
  };
}
const input = {
  repositoryId: recipe.repositoryId,
  revisionId: recipe.revisionId,
  observations: recipe.observations.map(normalizedObservation),
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
