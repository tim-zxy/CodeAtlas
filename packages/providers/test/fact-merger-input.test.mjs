import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  EvidenceSchema,
  FactEvidenceSchema,
  ProviderFactBindingSchema,
} from '../../ir/dist/index.js';
import { collectMergeSupports, FactMergeError } from '../dist/fact-merger-input.js';

const root = new URL(
  '../../../fixtures/normalization/canonical-normalization/expected/',
  import.meta.url,
);
const node = JSON.parse(readFileSync(new URL('nodes.json', root), 'utf8'))[0];
const edge = JSON.parse(readFileSync(new URL('edges.json', root), 'utf8'))[0];
const snapshot = {
  id: 'snapshot-native',
  repositoryId: 'repo-fixture',
  providerId: 'native',
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
const input = () => ({
  repositoryId: 'repo-fixture',
  revisionId: 'rev-fixture',
  observations: [{ snapshot, nodes: [node], edges: [edge] }],
});

function rejects(change, code, path) {
  const value = input();
  change(value);
  assert.throws(
    () => collectMergeSupports(value),
    (error) =>
      error instanceof FactMergeError &&
      error.code === code &&
      assert.deepEqual(error.path, path) === undefined,
  );
}

test('one observation yields validated independent support relations', () => {
  const supports = collectMergeSupports(input());
  assert.equal(supports.length, 2);
  for (const support of supports) {
    EvidenceSchema.parse(support.evidence);
    FactEvidenceSchema.parse(support.factEvidence);
    ProviderFactBindingSchema.parse(support.binding);
    assert.equal(support.evidence.status, 'ACTIVE');
    assert.equal(support.binding.evidenceId, support.evidence.id);
  }
  assert.notEqual(supports[0].evidence.id, supports[1].evidence.id);
  assert.deepEqual(
    collectMergeSupports({
      repositoryId: 'repo-fixture',
      revisionId: 'rev-fixture',
      observations: [],
    }),
    [],
  );
});

test('invalid contexts, repeated supports, and partial snapshots fail atomically', () => {
  rejects(
    (v) => {
      v.observations[0].snapshot = { ...snapshot, repositoryId: 'other' };
    },
    'INVALID_CONTEXT',
    ['observations', 0, 'snapshot', 'repositoryId'],
  );
  rejects(
    (v) => {
      v.observations[0].snapshot = { ...snapshot, requestedRevisionId: 'other' };
    },
    'INVALID_CONTEXT',
    ['observations', 0, 'snapshot', 'requestedRevisionId'],
  );
  rejects(
    (v) => {
      v.observations[0].nodes[0] = { ...node, provider: { ...node.provider, providerId: 'other' } };
    },
    'INVALID_CONTEXT',
    ['observations', 0, 'nodes', 0, 'provider', 'providerId'],
  );
  rejects(
    (v) => {
      v.observations[0].nodes[0] = { ...node, provider: { ...node.provider, factType: 'EDGE' } };
    },
    'INVALID_CONTEXT',
    ['observations', 0, 'nodes', 0, 'provider', 'factType'],
  );
  rejects(
    (v) => {
      v.observations[0].nodes.push(node);
    },
    'DUPLICATE_SUPPORT',
    ['observations', 0, 'nodes', 1, 'provider', 'providerFactId'],
  );
  rejects(
    (v) => {
      v.observations.push({ snapshot, nodes: [], edges: [] });
    },
    'DUPLICATE_SUPPORT',
    ['observations', 1, 'snapshot', 'providerId'],
  );
  rejects(
    (v) => {
      v.observations.push({ snapshot: { ...snapshot, providerId: 'other' }, nodes: [], edges: [] });
    },
    'DUPLICATE_SUPPORT',
    ['observations', 1, 'snapshot', 'id'],
  );
  rejects(
    (v) => {
      v.observations[0].snapshot = { ...snapshot, outcome: 'PARTIAL' };
    },
    'INVALID_CONTEXT',
    ['observations', 0, 'snapshot', 'outcome'],
  );
  rejects(
    (v) => {
      v.observations[0].nodes[0] = { ...node, canonical: { ...node.canonical, name: '' } };
    },
    'INVALID_INPUT',
    ['observations', 0, 'nodes', 0, 'canonical', 'name'],
  );
  rejects(
    (v) => {
      v.observations[0].snapshot = { ...snapshot, providerId: 'native-\ud800' };
      v.observations[0].nodes[0] = {
        ...node,
        provider: { ...node.provider, providerId: 'native-\ud800' },
      };
      v.observations[0].edges[0] = {
        ...edge,
        provider: { ...edge.provider, providerId: 'native-\ud800' },
      };
    },
    'IDENTITY_ENCODING_FAILED',
    ['observations', 0, 'nodes', 0, 'provider', 'providerId'],
  );
});
