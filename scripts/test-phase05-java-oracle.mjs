import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { mergeCanonicalObservations } from '../packages/providers/dist/index.js';
import { normalizeJavaNode } from '../packages/providers/dist/java-node-normalizer.js';
import { normalizeJavaEdge } from '../packages/providers/dist/canonical-normalizer.js';
import * as helper from './helpers/phase05-evaluation-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const pins = await helper.capturePhase05PinnedInputs({ repositoryRoot });
const ids = [
  'java-basic-symbol',
  'java-call-basic',
  'java-overload',
  'java-inheritance',
  'java-unresolved-call',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Synthetic candidate images only: no Native success or physical publication
// claim. The existing normalizer/merger is a dependency, not the oracle under test.
function input(fixtureId) {
  const names = pins.filePaths(fixtureId).filter((name) => name.startsWith('source/'));
  const state = {
    revision: {
      id: 'independent-revision',
      repositoryId: 'independent-repository',
      kind: 'WORKTREE',
      contentFingerprint: 'sha256:independent-source',
      baseRevisionId: null,
    },
    files: names.map((name, index) => ({
      id: `prepared-file-${index}`,
      repositoryId: 'independent-repository',
      revisionId: 'independent-revision',
      path: name.slice('source/'.length),
      contentFingerprint: `sha256:${sha(pins.readFile(fixtureId, name))}`,
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'INTERNAL',
    })),
  };
  const rawNodes = JSON.parse(pins.readFile(fixtureId, 'expected/nodes.json'));
  const manifest = JSON.parse(pins.readFile(fixtureId, 'fixture.json'));
  const rawEdges = manifest.expected.edges
    ? JSON.parse(pins.readFile(fixtureId, manifest.expected.edges))
    : [];
  return { fixtureId, state, rawNodes, rawEdges, manifest };
}

function image(input, mutate = () => {}) {
  const nodes = structuredClone(input.rawNodes),
    edges = structuredClone(input.rawEdges);
  mutate(nodes, edges);
  const files = new Map(input.state.files.map((file) => [file.id, file]));
  const idsByOriginal = new Map(
    input.state.files.map((file) => [
      input.fixtureId === 'java-basic-symbol'
        ? 'file-basic'
        : `file-${file.path.split('/').at(-1)}`,
      file.id,
    ]),
  );
  const parameterize = (fact) => ({
    ...fact,
    repositoryId: input.state.revision.repositoryId,
    revisionId: input.state.revision.id,
    sourceRange: fact.sourceRange
      ? { ...fact.sourceRange, sourceFileId: idsByOriginal.get(fact.sourceRange.sourceFileId) }
      : null,
  });
  const normalizedNodes = nodes.map((node) => ({
    provider: { factType: 'NODE', providerId: 'native', providerFactId: node.providerFactId },
    canonical: normalizeJavaNode(parameterize(node), files),
  }));
  const lookup = new Map(
    normalizedNodes.map((pair) => [pair.provider.providerFactId, pair.canonical]),
  );
  const normalizedEdges = edges.map((edge) => ({
    provider: { factType: 'EDGE', providerId: 'native', providerFactId: edge.providerFactId },
    canonical: normalizeJavaEdge(parameterize(edge), lookup, files),
  }));
  const merged = mergeCanonicalObservations({
    repositoryId: input.state.revision.repositoryId,
    revisionId: input.state.revision.id,
    observations: [
      {
        snapshot: {
          id: 'snapshot-fixture',
          repositoryId: input.state.revision.repositoryId,
          providerId: 'native',
          providerVersion: '0.0.0',
          runtimeVersion: 'fixture-v1',
          requestedRevisionId: input.state.revision.id,
          requestedRevisionFingerprint: input.state.revision.contentFingerprint,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:00.000Z',
          outcome: 'SUCCEEDED',
          capabilities: input.manifest.capabilities.map((name) => ({
            name,
            support: 'SUPPORTED',
            coverage: 'COMPLETE',
          })),
          diagnostics: [],
        },
        nodes: normalizedNodes,
        edges: normalizedEdges,
      },
    ],
  });
  const pairs = [...normalizedNodes, ...normalizedEdges];
  return {
    sourceFiles: structuredClone(input.state.files),
    facts: { nodes: merged.nodes, edges: merged.edges },
    snapshots: [
      {
        id: 'snapshot-fixture',
        repositoryId: input.state.revision.repositoryId,
        providerId: 'native',
        providerVersion: '0.0.0',
        runtimeVersion: 'fixture-v1',
        requestedRevisionId: input.state.revision.id,
        requestedRevisionFingerprint: input.state.revision.contentFingerprint,
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:00.000Z',
        outcome: 'SUCCEEDED',
        capabilities: input.manifest.capabilities.map((name) => ({
          name,
          support: 'SUPPORTED',
          coverage: 'COMPLETE',
        })),
        diagnostics: [],
      },
    ],
    evidence: merged.evidence,
    bindings: merged.bindings,
    factEvidence: merged.factEvidence,
    candidates: merged.bindings.map((binding) => ({
      fact: binding.canonicalFact,
      evidenceId: binding.evidenceId,
      candidate: pairs.find(
        (pair) => pair.provider.providerFactId === binding.providerFact.providerFactId,
      ).canonical,
    })),
  };
}

for (const fixtureId of ids)
  test(`original Java oracle binds ${fixtureId} before results and retains declared critical scopes`, async () => {
    assert.equal(typeof helper.preparePhase05JavaOracle, 'function');
    const data = input(fixtureId);
    const oracle = await helper.preparePhase05JavaOracle({
      pinnedInputs: pins,
      fixtureId,
      sourceState: data.state,
    });
    const result = oracle.evaluate(image(data));
    assert.equal(result.matches, true);
    const want = {
      'java-basic-symbol': [4, 0],
      'java-call-basic': [0, 5],
      'java-overload': [0, 0],
      'java-inheritance': [0, 2],
      'java-unresolved-call': [0, 0],
    }[fixtureId];
    assert.equal(result.facts.symbol.tp, want[0]);
    assert.equal(result.facts.directCall.tp, want[1]);
    assert.equal(result.facts.symbol.fn, 0);
    assert.equal(result.facts.directCall.fp, 0);
    assert.equal(result.facts.directCall.fn, 0);
  });

test('original Java oracle counts missing critical symbol without redefining the scope', async () => {
  assert.equal(typeof helper.preparePhase05JavaOracle, 'function');
  const data = input('java-basic-symbol');
  const oracle = await helper.preparePhase05JavaOracle({
    pinnedInputs: pins,
    fixtureId: data.fixtureId,
    sourceState: data.state,
  });
  const result = oracle.evaluate(
    image(data, (nodes) =>
      nodes.splice(
        nodes.findIndex((node) => node.qualifiedName === 'sample.basic.Basic.greet'),
        1,
      ),
    ),
  );
  assert.equal(result.matches, false);
  assert.deepEqual(result.facts.symbol, { tp: 3, fp: 0, fn: 1, recall: 0.75 });
});

test('original Java oracle counts a wrong target as FP and FN and an extra direct prediction as FP', async () => {
  assert.equal(typeof helper.preparePhase05JavaOracle, 'function');
  const data = input('java-call-basic');
  const oracle = await helper.preparePhase05JavaOracle({
    pinnedInputs: pins,
    fixtureId: data.fixtureId,
    sourceState: data.state,
  });
  const wrong = oracle.evaluate(
    image(data, (nodes, edges) => {
      const call = edges.find(
        (edge) => edge.providerKind === 'java.call' && edge.target.state === 'RESOLVED',
      );
      const other = nodes.find(
        (node) =>
          node.providerKind === 'java.method' &&
          node.providerFactId !== call.target.target.providerFactId,
      );
      call.target.target.providerFactId = other.providerFactId;
    }),
  );
  assert.equal(wrong.matches, false);
  assert.deepEqual(wrong.facts.directCall, { tp: 4, fp: 1, fn: 1, precision: 0.8, recall: 0.8 });
  const extra = oracle.evaluate(
    image(data, (_nodes, edges) => {
      const call = structuredClone(
        edges.find((edge) => edge.providerKind === 'java.call' && edge.target.state === 'RESOLVED'),
      );
      call.providerFactId = 'independent-extra-call';
      call.sourceRange.startColumn++;
      call.sourceRange.endColumn++;
      edges.push(call);
    }),
  );
  assert.equal(extra.matches, false);
  assert.deepEqual(extra.facts.directCall, { tp: 5, fp: 1, fn: 0, precision: 5 / 6, recall: 1 });
});

test('original Java oracle refuses changed source inventory and does not align actual revision or IDs', async () => {
  assert.equal(typeof helper.preparePhase05JavaOracle, 'function');
  const data = input('java-basic-symbol');
  for (const change of ['fingerprint', 'path', 'duplicate', 'revision']) {
    const state = structuredClone(data.state);
    if (change === 'fingerprint') state.files[0].contentFingerprint = 'sha256:changed';
    if (change === 'path') state.files[0].path = 'src/Other.java';
    if (change === 'duplicate') state.files.push(structuredClone(state.files[0]));
    if (change === 'revision') state.files[0].revisionId = 'different-revision';
    await assert.rejects(
      helper.preparePhase05JavaOracle({
        pinnedInputs: pins,
        fixtureId: data.fixtureId,
        sourceState: state,
      }),
    );
  }
  const oracle = await helper.preparePhase05JavaOracle({
    pinnedInputs: pins,
    fixtureId: data.fixtureId,
    sourceState: data.state,
  });
  for (const field of ['revisionId', 'id', 'sensitivity']) {
    const actual = image(data);
    actual.sourceFiles[0][field] = field === 'sensitivity' ? 'PUBLIC' : 'foreign-identity';
    assert.throws(() => oracle.evaluate(actual));
  }
});

test('original Java oracle rejects changed namespace support even when critical symbols agree', async () => {
  const data = input('java-basic-symbol');
  const oracle = await helper.preparePhase05JavaOracle({
    pinnedInputs: pins,
    fixtureId: data.fixtureId,
    sourceState: data.state,
  });
  const result = oracle.evaluate(
    image(data, (nodes) => {
      nodes.find((node) => node.providerKind === 'java.package').confidence.score = 0.9;
    }),
  );
  assert.equal(result.facts.symbol.tp, 4);
  assert.equal(result.facts.symbol.fn, 0);
  assert.equal(result.matches, false);
});

test('original Java oracle refuses forged pins and hostile seed data without executing getters', async () => {
  const data = input('java-basic-symbol');
  await assert.rejects(
    helper.preparePhase05JavaOracle({
      pinnedInputs: { ...pins },
      fixtureId: data.fixtureId,
      sourceState: data.state,
    }),
  );
  let accesses = 0;
  const hostile = {
    files: data.state.files,
    get revision() {
      accesses++;
      return data.state.revision;
    },
  };
  await assert.rejects(
    helper.preparePhase05JavaOracle({
      pinnedInputs: pins,
      fixtureId: data.fixtureId,
      sourceState: hostile,
    }),
  );
  assert.equal(accesses, 0);
});
