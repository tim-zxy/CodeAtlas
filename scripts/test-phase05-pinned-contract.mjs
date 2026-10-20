import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';

const pinnedInputs = await helper.capturePhase05PinnedInputs({
  repositoryRoot: fileURLToPath(new URL('../', import.meta.url)),
});

// These checks execute the real pure Provider contracts, not a Native process
// or persisted support lifecycle. Literal old goldens are the independent oracle.
test('normalization receipt checks all ordered pairs, including duplicate Package support', () => {
  assert.equal(typeof helper.runPhase05PinnedContract, 'function');
  const receipt = helper.runPhase05PinnedContract({
    pinnedInputs,
    fixtureId: 'canonical-normalization',
  });
  assert.equal(receipt.evidenceScope, 'PURE_PROVIDER_CONTRACT_ONLY');
  assert.equal(receipt.matches, true);
  assert.deepEqual(receipt.checks, { nodes: true, edges: true });
  assert.deepEqual(receipt.observedCounts, { nodes: 10, edges: 5 });
  assert.match(receipt.actualDigest, /^[a-f0-9]{64}$/);
});

test('merge receipt checks two, one and zero support digests and reverse Provider order', () => {
  assert.equal(typeof helper.runPhase05PinnedContract, 'function');
  const receipt = helper.runPhase05PinnedContract({
    pinnedInputs,
    fixtureId: 'two-provider-same-call',
  });
  assert.equal(receipt.matches, true);
  assert.deepEqual(receipt.checks, { full: true, one: true, zero: true, reverse: true });
  assert.deepEqual(receipt.observedCounts, {
    full: { nodes: 2, edges: 1, evidence: 6, bindings: 6 },
    one: { nodes: 2, edges: 1, evidence: 3, bindings: 3 },
    zero: { nodes: 0, edges: 0, evidence: 0, bindings: 0 },
  });
});

test('normalization comparison detects missing support and wrong relation payload without changing goldens', () => {
  assert.equal(typeof helper.comparePhase05PinnedContractResult, 'function');
  const fixtureId = 'canonical-normalization';
  const nodes = JSON.parse(pinnedInputs.readFile(fixtureId, 'expected/nodes.json'));
  const edges = JSON.parse(pinnedInputs.readFile(fixtureId, 'expected/edges.json'));
  assert.equal(
    helper.comparePhase05PinnedContractResult({ pinnedInputs, fixtureId, actual: { nodes, edges } })
      .matches,
    true,
  );
  nodes.splice(
    nodes.findIndex((pair) => pair.provider.providerFactId === 'pkg-b'),
    1,
  );
  const missing = helper.comparePhase05PinnedContractResult({
    pinnedInputs,
    fixtureId,
    actual: { nodes, edges },
  });
  assert.deepEqual(missing.checks, { nodes: false, edges: true });
  assert.equal(missing.matches, false);
  edges.find((pair) => pair.provider.providerFactId === 'call-ctor').canonical.target.target.id =
    'wrong-target';
  assert.deepEqual(
    helper.comparePhase05PinnedContractResult({ pinnedInputs, fixtureId, actual: { nodes, edges } })
      .checks,
    { nodes: false, edges: false },
  );
});

test('pinned contract execution refuses copied readers and unrelated Fixture IDs', () => {
  assert.equal(typeof helper.runPhase05PinnedContract, 'function');
  assert.throws(() =>
    helper.runPhase05PinnedContract({
      pinnedInputs: { ...pinnedInputs },
      fixtureId: 'canonical-normalization',
    }),
  );
  assert.throws(() =>
    helper.runPhase05PinnedContract({ pinnedInputs, fixtureId: 'java-basic-symbol' }),
  );
});
