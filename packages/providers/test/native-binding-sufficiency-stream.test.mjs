import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
const load = () =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/syntax-contract/binding-pipeline/stream-inputs.json',
        import.meta.url,
      ),
    ),
  );
const expected = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-pipeline/stream-expected.json',
      import.meta.url,
    ),
  ),
);
export const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
const sha = (b) => createHash('sha256').update(b).digest('hex'),
  line = (x) => JSON.stringify(x) + '\n';
export function sample(mutate = () => {}) {
  const x = load();
  mutate(x);
  const r = x.request,
    p = r.payload,
    request = Buffer.from(line(r));
  const echo = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: p.ownerBinding,
    extractorVersion: p.extractorVersion,
    codeContract: p.codeContract,
    syntaxContract: p.syntaxContract,
    requestChecksum: sha(request),
  };
  let events = [
    { type: 'OBSERVATION_STARTED', payload: echo },
    ...x.raw.map((payload) => ({ type: 'SYNTAX_OBSERVATION', payload })),
    {
      type: 'SYNTAX_COVERAGE',
      payload: {
        sourceFileId: p.sourceFiles[0].id,
        sourceFingerprint: p.sourceFiles[0].contentFingerprint,
        status: x.partial ? 'PARTIAL' : 'COMPLETE',
        limitations: x.partial ? ['DECLARED_PARTIAL'] : [],
      },
    },
  ];
  events = events.map((e, sequence) => ({
    protocolVersion: 7,
    requestId: r.requestId,
    sequence,
    ...e,
  }));
  const prefix = events.map(line).join('');
  events.push({
    protocolVersion: 7,
    requestId: r.requestId,
    sequence: events.length,
    type: 'OBSERVATION_COMPLETED',
    payload: {
      ...echo,
      codeOutcome: 'NOT_APPLICABLE',
      syntaxOutcome: x.partial ? 'PARTIAL' : 'COMPLETE',
      outcome: x.partial ? 'PARTIAL' : 'SUCCEEDED',
      counts: {
        nodes: 0,
        edges: 0,
        syntax: x.raw.length,
        codeCoverage: 0,
        syntaxCoverage: 1,
        diagnostics: 0,
      },
      checksum: sha(prefix),
    },
  });
  return { request, output: Buffer.from(events.map(line).join('')), events };
}
const api = () => import('../dist/native-binding-sufficiency-stream.js');
test('v7 full bytes and old versions stay strict', async () => {
  const a = await api(),
    s = sample(),
    b = budget();
  const r = a.validateBindingAwareSyntaxObservationStreamWithBudget(s.request, s.output, b);
  assert.equal(r.observation.request.protocolVersion, expected.protocolVersion);
  assert.equal(r.observation.outcome, expected.outcome);
  assert.equal(r.outputIdentity, sha(s.output));
  assert.ok(b.budget.items > 0);
  const old = await import('../dist/native-binding-stream.js');
  assert.throws(() =>
    old.validateBindingSyntaxObservationStreamWithBudget(s.request, s.output, budget()),
  );
  for (const output of [
    s.output.subarray(0, s.output.length - 2),
    Buffer.from(s.output.toString().replace('SYNTAX_BINDING_V3', 'SYNTAX_BINDING_V2')),
  ])
    assert.throws(() =>
      a.validateBindingAwareSyntaxObservationStreamWithBudget(s.request, output, budget()),
    );
});
test('v7 scope closure and PARTIAL cannot claim success', async () => {
  const a = await api();
  for (const mutate of [
    (x) => x.raw.shift(),
    (x) => x.raw.push(structuredClone(x.raw[0])),
    (x) => (x.raw[0].payload.parentScopeRef = x.raw[1].payload.scopeRef),
    (x) => {
      x.raw[0].payload.status = 'PARTIAL';
      x.raw[0].payload.limitations = ['DECLARED_PARTIAL'];
    },
  ]) {
    const s = sample(mutate);
    assert.throws(
      () => a.validateBindingAwareSyntaxObservationStreamWithBudget(s.request, s.output, budget()),
      (e) => e.code === expected.missingScope,
    );
  }
  const s = sample((x) => {
    x.partial = true;
    x.raw[0].payload.status = 'PARTIAL';
    x.raw[0].payload.limitations = ['DECLARED_PARTIAL'];
  });
  assert.equal(
    a.validateBindingAwareSyntaxObservationStreamWithBudget(s.request, s.output, budget())
      .observation.outcome,
    'PARTIAL',
  );
});
test('v7 Readable, cancellation and cumulative limits', async () => {
  const a = await api(),
    s = sample();
  assert.equal(
    (
      await a.default(
        s.request,
        Readable.from([s.output.subarray(0, 7), s.output.subarray(7)]),
        new AbortController().signal,
        undefined,
        budget(),
      )
    ).request.protocolVersion,
    7,
  );
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    a.default(s.request, Readable.from([s.output]), c.signal, undefined, budget()),
    (e) => e.code === 'CANCELLED',
  );
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () => a.validateBindingAwareSyntaxObservationStreamWithBudget(s.request, s.output, b),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  await assert.rejects(
    a.default(
      s.request,
      Readable.from([s.output]),
      new AbortController().signal,
      undefined,
      undefined,
    ),
  );
});
import { join } from 'node:path';
test(
  'v7 actual library Source oracle bytes cross reader',
  { skip: !process.env.CODEATLAS_BINDING_SUFFICIENCY_OUTPUT },
  async () => {
    const dir = process.env.CODEATLAS_BINDING_SUFFICIENCY_OUTPUT;
    const a = await api();
    const cases = JSON.parse(
      readFileSync(
        new URL(
          '../../../fixtures/phase1/syntax-contract/binding-pipeline/inputs.json',
          import.meta.url,
        ),
      ),
    ).cases;
    for (const c of cases) {
      const request = readFileSync(join(dir, c.file + '.request.jsonl')),
        output = readFileSync(join(dir, c.file + '.output.jsonl'));
      const r = a.validateBindingAwareSyntaxObservationStreamWithBudget(request, output, budget());
      assert.equal(r.observation.syntaxOutcome, c.complete ? 'COMPLETE' : 'PARTIAL', c.file);
      assert.equal(r.outputIdentity, sha(output));
    }
  },
);
