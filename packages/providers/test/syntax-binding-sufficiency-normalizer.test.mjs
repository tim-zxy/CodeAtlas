import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../../../fixtures/phase1/syntax-contract/binding-pipeline/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('mapper-inputs.json', root))),
  expected = JSON.parse(readFileSync(new URL('mapper-expected.json', root)));
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
const api = () => import('../dist/syntax-binding-sufficiency-normalizer.js');
const per = (raw) => ({ ...structuredClone(input), raw });
test('v3 eight-kind mapper agrees with independent payload/key/policy', async () => {
  const { default: map } = await api();
  for (let i = 0; i < input.raw.length; i++) {
    const p = per(input.raw[i]),
      before = structuredClone(p);
    const got = map(p, budget());
    assert.deepEqual(got, expected[i]);
    assert.deepEqual(p, before);
  }
});
test('v3 mapper closes every new reference, preserves precision and refuses old entry', async () => {
  const { default: map } = await api(),
    { default: old } = await import('../dist/syntax-binding-normalizer.js');
  for (const raw of input.raw) assert.throws(() => old(per(raw), budget()));
  for (const alter of [
    (p) => (p.raw.payload.parentScopeRef.providerFactId = 'missing'),
    (p) => p.supports.pop(),
    (p) => (p.raw.controlContext = 'INVALID'),
  ]) {
    const p = per(structuredClone(input.raw[1]));
    alter(p);
    assert.throws(() => map(p, budget()));
  }
  const p = per(structuredClone(input.raw.find((x) => x.syntaxKind === 'INVOCATION'))),
    one = map(p, budget());
  assert.equal(one.payload.callee.resolution, 'HEURISTIC');
  p.raw.controlContext = 'CONDITIONAL';
  assert.notEqual(map(p, budget()).syntaxKey, one.syntaxKey);
});
test('v3 fixed support policy refuses low Code support and keeps PARTIAL diagnostic', async () => {
  const { default: map } = await api();
  const p = per(structuredClone(input.raw[0]));
  p.selectedNodes[0].confidence.score = 0.4;
  p.supports[0].canonical.confidence.score = 0.4;
  const canonical = (v) =>
    Array.isArray(v)
      ? '[' + v.map(canonical).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v);
  p.supports[0].valueDigest = createHash('sha256')
    .update(
      canonical({ kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: p.supports[0].canonical }),
    )
    .digest('hex');
  assert.throws(() => map(p, budget()));
  const q = per(structuredClone(input.raw[0]));
  q.raw.payload.status = 'PARTIAL';
  q.raw.payload.limitations = ['DECLARED_PARTIAL'];
  const got = map(q, budget());
  assert.equal(got.payload.status, 'PARTIAL');
  assert.equal(got.confidence.score, 0.5);
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () => map(q, b),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});
test('v3 syntaxKey ignores provider labels with equal Canonical identities', async () => {
  const { default: map } = await api();
  const p = per(structuredClone(input.raw[0])),
    one = map(p, budget());
  const rename = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v))
      if (k === 'providerId') v[k] = 'other.provider';
      else rename(x);
  };
  rename(p);
  assert.equal(map(p, budget()).syntaxKey, one.syntaxKey);
});
import { join } from 'node:path';
test(
  'actual Python library bytes map to Syntax3 and V4 without semantic scores',
  { skip: !process.env.CODEATLAS_BINDING_SUFFICIENCY_OUTPUT },
  async () => {
    const dir = process.env.CODEATLAS_BINDING_SUFFICIENCY_OUTPUT;
    const { validateBindingAwareSyntaxObservationStreamWithBudget: validate } =
        await import('../dist/native-binding-sufficiency-stream.js'),
      { default: code } = await import('../dist/python-normalizer.js'),
      { default: collect } = await import('../dist/fact-merger-input.js'),
      { default: map } = await api(),
      { validatePluginV4Context } = await import('../../plugins/dist/plugin-context-v4.js'),
      { historyDraftDigest } = await import('../dist/history-transition-input.js');
    for (const name of ['direct.py', 'scope.py', 'defaults.py', 'no-binding.py']) {
      const b = budget(),
        r = validate(
          readFileSync(join(dir, name + '.request.jsonl')),
          readFileSync(join(dir, name + '.output.jsonl')),
          b,
        ).observation,
        p = r.request.payload;
      assert.equal(r.outcome, 'SUCCEEDED', name);
      const nodes = r.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges = r.events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
        normalized = code(
          {
            targetSource: p.targetSource,
            providerId: p.providerId,
            providerSnapshotId: p.providerSnapshotId,
            sourceFiles: p.sourceFiles,
            nodes,
            edges,
          },
          b,
        );
      const snapshot = JSON.parse(
        readFileSync(
          new URL(
            '../../../fixtures/phase1/native-composition-candidate/python-only/expected.json',
            import.meta.url,
          ),
        ),
      ).snapshot;
      const original = collect(
          {
            repositoryId: p.targetSource.repositoryId,
            revisionId: p.targetSource.revisionId,
            observations: [{ snapshot, nodes: normalized.nodePairs, edges: normalized.edgePairs }],
          },
          b,
        ),
        supports = original.map((s) => ({
          factType: s.factType,
          canonical: s.canonical,
          evidence: s.evidence,
          binding: s.binding,
          factEvidence: s.factEvidence,
          dependencyUnitIds: null,
          valueDigest: historyDraftDigest(
            { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: s.canonical },
            b.limits,
            b.budget,
          ),
        }));
      const basis = { ...p.targetSource, codeActivationDigest: 'b'.repeat(64) },
        selectedNodes = normalized.nodePairs.map((n) => n.canonical);
      const syntax = r.events
        .filter((e) => e.type === 'SYNTAX_OBSERVATION')
        .map((e) =>
          map(
            {
              basis,
              sourceFile: p.sourceFiles[0],
              raw: e.payload,
              selectedNodes,
              bindings: original.map((s) => s.binding),
              supports,
              extractorVersion: 'syntax-v1',
            },
            b,
          ),
        );
      assert.ok(syntax.every((s) => s.confidence.score === 0.5));
      const supportInventory = [
        ...new Map(
          syntax.flatMap((s) => s.supportRefs).map((s) => [s.entity.kind + ':' + s.entity.id, s]),
        ).values(),
      ];
      const context = {
        contextVersion: 4,
        syntaxSchemaVersion: 3,
        basis,
        nodes: selectedNodes,
        edges: normalized.edgePairs.map((e) => e.canonical),
        sourceFiles: p.sourceFiles,
        syntaxEvidence: syntax,
        supportInventory,
        configuration: {},
      };
      assert.deepEqual(validatePluginV4Context(context), context);
    }
  },
);
