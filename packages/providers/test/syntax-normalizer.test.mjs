import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cases, loadCase } from '../../../fixtures/phase1/canonical-syntax-mapping/corpus.mjs';
const context = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
const api = () => import('../dist/syntax-normalizer.js');
for (const c of cases)
  test('independent Canonical Syntax ' + c.id, async () => {
    const { default: normalize } = await api(),
      { input, expected } = loadCase(c),
      before = structuredClone(input),
      b = context();
    if (expected.error)
      assert.throws(
        () => normalize(input, b),
        (e) => e.code === expected.error,
      );
    else {
      const payload = normalize(input, b);
      assert.deepEqual(
        { schema: 'codeatlas.syntax-evidence', version: 1, payload },
        expected.envelope,
      );
      assert.equal(payload.confidence.score, 0.5);
      assert.equal(payload.confidence.method, 'syntax-surface-support-v1');
      assert.ok(b.budget.items > 0 && b.budget.serializedBytes > 0);
    }
    assert.deepEqual(input, before);
  });
for (const name of ['python-only', 'java-only', 'mixed'])
  test('complete native declared target origins ' + name, async () => {
    const { default: normalize } = await api();
    const target = JSON.parse(
        readFileSync(
          new URL(
            '../../../fixtures/phase1/mixed-analysis-stage/targets/' + name + '.json',
            import.meta.url,
          ),
        ),
      ),
      old = JSON.parse(
        readFileSync(
          new URL(
            '../../../fixtures/phase1/native-composition-candidate/' + name + '/expected.json',
            import.meta.url,
          ),
        ),
      );
    for (const row of target.origins) {
      const origin = JSON.parse(row.origin_json),
        raw = old.codeSyntax.events.find(
          (e) =>
            e.type === 'SYNTAX_OBSERVATION' &&
            e.payload.providerSyntaxId === origin.providerSyntaxId,
        ).payload;
      assert.deepEqual(
        normalize(
          {
            basis: target.basis,
            sourceFile: origin.sourceFile,
            raw,
            selectedNodes: target.manifest.state.nodes,
            bindings: old.merged.bindings,
            supports: target.manifest.state.supports,
            extractorVersion: 'syntax-v1',
          },
          context(),
        ),
        origin.envelope.payload,
      );
    }
  });
for (const kind of ['getter', 'proxy', 'cycle', 'sparse'])
  test('unsafe ' + kind + ' refuses without running input code', async () => {
    const { default: normalize } = await api();
    let calls = 0;
    const base = loadCase(cases.find((c) => c.id === 'declaration-java')).input;
    let input = base;
    if (kind === 'getter')
      Object.defineProperty(input, 'score', {
        enumerable: true,
        get() {
          calls++;
          throw Error('SECRET_LITERAL');
        },
      });
    if (kind === 'proxy')
      input = new Proxy(input, {
        ownKeys() {
          calls++;
          throw Error('SECRET_LITERAL');
        },
      });
    if (kind === 'cycle') input.self = input;
    if (kind === 'sparse') input.bindings = Array(2);
    assert.throws(
      () => normalize(input, context()),
      (e) => e.code === 'INVALID_CANDIDATE' && !e.message.includes('SECRET_LITERAL'),
    );
    assert.equal(calls, 0);
  });
test('original cumulative ledger and tiny item/byte/depth limits are enforced', async () => {
  const { default: normalize } = await api(),
    input = loadCase(cases.find((c) => c.id === 'declaration-java')).input;
  for (const key of ['maxItems', 'maxSerializedBytes', 'maxDepth']) {
    const b = context();
    b.limits[key] = 1;
    assert.throws(
      () => normalize(input, b),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
  const b = context();
  b.limits.maxItems = 100;
  b.budget.items = 100;
  assert.throws(
    () => normalize(input, b),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  assert.equal(b.budget.items, 100);
});

function cost(v) {
  return {
    items:
      1 +
      (v !== null && typeof v === 'object'
        ? Object.values(v).reduce((n, x) => n + cost(x).items, 0)
        : 0),
    serializedBytes: Buffer.byteLength(JSON.stringify(v)),
  };
}
test('independent exact and one-below decode-copy boundary precedes contract refusal', async () => {
  const { default: normalize } = await api(),
    input = loadCase(cases.find((c) => c.id === 'wrong-extractor')).input,
    one = cost(input);
  for (const key of ['items', 'serializedBytes']) {
    const b = context(),
      limit = key === 'items' ? 'maxItems' : 'maxSerializedBytes';
    b.limits[limit] = 3 * one[key];
    assert.throws(
      () => normalize(input, b),
      (e) => e.code === 'INCOMPATIBLE_CONTRACT',
    );
    assert.equal(b.budget[key], 3 * one[key]);
    const below = context();
    below.limits[limit] = 3 * one[key] - 1;
    assert.throws(
      () => normalize(input, below),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
});
test('H1 support digest independently budgeted exact and one-below in same ledger', async () => {
  const { syntaxHistoryDigest } = await import('../dist/syntax-history-candidate.js'),
    { input, expected } = loadCase(cases.find((c) => c.id === 'declaration-java')),
    domain = 'codeatlas-phase1-support-value-v1',
    one = cost(input.sourceFile),
    target = expected.envelope.payload.supportRefs.find(
      (s) => s.entity.kind === 'SOURCE_FILE',
    ).valueDigest;
  const b = context();
  b.limits.maxItems = 2 * one.items;
  b.limits.maxSerializedBytes = 2 * one.serializedBytes + Buffer.byteLength(domain) + 1;
  assert.equal(syntaxHistoryDigest(domain, input.sourceFile, b), target);
  assert.deepEqual(b.budget, {
    items: 2 * one.items,
    serializedBytes: b.limits.maxSerializedBytes,
  });
  for (const k of ['maxItems', 'maxSerializedBytes']) {
    const t = context();
    t.limits = { ...b.limits, [k]: b.limits[k] - 1 };
    assert.throws(
      () => syntaxHistoryDigest(domain, input.sourceFile, t),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
    );
  }
  const spent = context();
  spent.limits.maxItems = 2 * one.items;
  spent.budget.items = 1;
  assert.throws(
    () => syntaxHistoryDigest(domain, input.sourceFile, spent),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('combined raw flags keep all seven tokens once in fixed order without free text', async () => {
  const { default: normalize } = await api(),
    input = loadCase(cases.find((c) => c.id === 'invocation-python')).input;
  input.raw.owner = null;
  const a = input.bindings.find((b) => b.providerFact.providerFactId === 'a').providerFact;
  input.raw.payload.callee.target = { state: 'RESOLVED', resolution: 'HEURISTIC', target: a };
  const item = {
    kind: 'ARRAY',
    items: [
      { kind: 'UNKNOWN', reason: 'PRIVATE_RAW_TEXT' },
      {
        kind: 'REFERENCE',
        name: 'p',
        target: { state: 'RESOLVED', resolution: 'HEURISTIC', target: a },
      },
      { kind: 'UNKNOWN', reason: 'PRIVATE_RAW_TEXT' },
    ],
  };
  input.raw.payload.arguments = [
    { name: null, value: item, sourceRange: input.raw.sourceRange },
    { name: null, value: structuredClone(item), sourceRange: input.raw.sourceRange },
  ];
  const out = normalize(input, context());
  assert.deepEqual(out.confidence, {
    score: 0.5,
    method: 'syntax-surface-support-v1',
    reasons: [
      'DECLARED_SOURCE_CONTEXT_MATCHED',
      'SYNTAX_PAYLOAD_VALIDATED',
      'REQUIRED_SUPPORTS_CLOSED',
      'OWNER_NULL_PRESERVED',
      'NON_EXACT_CALLEE_RESOLUTION_PRESERVED',
      'NON_EXACT_VALUE_REFERENCE_PRESERVED',
      'UNKNOWN_VALUE_PRESERVED',
    ],
  });
  assert.equal(JSON.stringify(out.confidence).includes('PRIVATE_RAW_TEXT'), false);
  input.raw.payload.arguments.reverse();
  assert.deepEqual(normalize(input, context()).confidence, out.confidence);
});
test('loser original typed ref cannot be silently mapped through a winner name', async () => {
  const { default: normalize } = await api(),
    input = loadCase(cases.find((c) => c.id === 'reference-loser-binding')).input;
  input.bindings = input.bindings.filter((b) => b.providerFact.providerFactId !== 'loser');
  input.supports = input.supports.filter((s) => s.binding.providerFact.providerFactId !== 'loser');
  assert.throws(
    () => normalize(input, context()),
    (e) => e.code === 'INVALID_CANDIDATE' && e.causeCode === 'DANGLING_REFERENCE',
  );
});

test('original support cannot label a Canonical node as an EDGE', async () => {
  const { default: normalize } = await api(),
    input = loadCase(cases.find((c) => c.id === 'declaration-java')).input;
  input.raw.owner = null;
  const s = input.supports[0],
    bind = input.bindings.find((b) => b.evidenceId === s.evidence.id);
  s.factType = 'EDGE';
  s.binding.providerFact.factType = 'EDGE';
  s.binding.canonicalFact.factType = 'EDGE';
  s.evidence.providerFact.factType = 'EDGE';
  s.factEvidence.fact.factType = 'EDGE';
  bind.providerFact.factType = 'EDGE';
  bind.canonicalFact.factType = 'EDGE';
  assert.throws(
    () => normalize(input, context()),
    (e) => e.code === 'INVALID_CANDIDATE',
  );
});
