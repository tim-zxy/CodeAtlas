import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../dist/index.js';
const base = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-sufficiency/inputs.json',
      import.meta.url,
    ),
  ),
);
const clone = structuredClone;
const range = (line, start, end) => ({
  sourceFileId: 'file:one',
  startLine: line,
  startColumn: start,
  endLine: line,
  endColumn: end,
});
const ref = base.envelopes[2].payload.owner;
function fixture() {
  const context = { ...clone(base.context), codeEdges: [] };
  const envelopes = clone(base.envelopes).map((e) => ({
    ...e,
    version: 4,
    payload: { ...e.payload, callbackScope: null },
  }));
  for (const e of envelopes)
    if (e.payload.syntaxKind === 'INVOCATION')
      Object.assign(e.payload.payload, {
        invocationForm: 'CALL',
        calleeRange: range(5, 0, 4),
        codeCallRef: null,
      });
  const template = clone(envelopes.find((e) => e.payload.syntaxKind === 'INVOCATION').payload);
  function record(kind, id, r, payload) {
    return {
      schema: 'codeatlas.syntax-evidence',
      version: 4,
      payload: { ...clone(template), id, syntaxKey: id, syntaxKind: kind, sourceRange: r, payload },
    };
  }
  const callable = record(
    'DECLARATION',
    'syntax:callable',
    { ...range(4, 0, 12), endLine: 10 },
    {
      declarationForm: 'CALLABLE',
      declaredName: 'handler',
      declaredType: null,
      parameterNames: ['value'],
      modifiers: ['private'],
    },
  );
  const param = record('PARAMETER_BINDING', 'syntax:param', range(4, 4, 11), {
    callableRef: clone(ref),
    language: 'java',
    name: 'value',
    ordinal: 0,
    parameterForm: 'POSITIONAL',
    declaredType: 'Object',
    typeRange: range(4, 4, 7),
    defaultValueRange: null,
  });
  envelopes.push(callable, param);
  return { context, envelopes, record };
}
function parse(e, c) {
  assert.equal(typeof api.parseSyntaxEvidenceV4, 'function');
  return api.parseSyntaxEvidenceV4(e, c);
}
function closure(es, c) {
  assert.equal(typeof api.validateSyntaxSurfaceClosure, 'function');
  return api.validateSyntaxSurfaceClosure(
    es.map((e) => parse(e, c).payload),
    c,
  );
}
test('Syntax4 accepts old eight kinds plus explicit parameter and closes real callable names', () => {
  const f = fixture();
  for (const e of f.envelopes) assert.deepEqual(parse(e, f.context), e);
  closure(f.envelopes, f.context);
});
test('Syntax4 rejects missing new fields and old parser never accepts new envelopes', () => {
  const f = fixture();
  for (const e of f.envelopes) assert.throws(() => api.parseSyntaxEvidenceV3(e, base.context));
  for (const change of [
    (e) => delete e.payload.callbackScope,
    (e) => delete e.payload.payload.calleeRange,
    (e) => (e.payload.payload.invocationForm = 'DYNAMIC'),
  ]) {
    const e = clone(f.envelopes.find((e) => e.payload.syntaxKind === 'INVOCATION'));
    change(e);
    assert.throws(() => parse(e, f.context));
  }
});
test('parameter rejects type/default outside parameter, foreign owner, unsafe ordinal and missing definitions', () => {
  const f = fixture(),
    p = f.envelopes.at(-1);
  for (const change of [
    (e) => (e.payload.payload.typeRange = range(5, 0, 2)),
    (e) => (e.payload.payload.ordinal = -0),
    (e) => (e.payload.payload.callableRef = clone(base.envelopes[0].payload.owner)),
    (e) => (e.payload.payload.defaultValueRange = range(5, 0, 2)),
  ]) {
    const e = clone(p);
    change(e);
    assert.throws(() => parse(e, f.context));
  }
  assert.throws(() => closure(f.envelopes.slice(0, -1), f.context));
  const bad = clone(f.envelopes);
  bad.at(-1).payload.payload.name = 'other';
  assert.throws(() => closure(bad, f.context));
});
test('INVOCATION requires actual matching Code CALL edge with support, owner and exact token range', () => {
  const f = fixture(),
    e = clone(f.envelopes.find((e) => e.payload.syntaxKind === 'INVOCATION'));
  const edge = {
    id: 'edge:call',
    factKey: 'edge-key:call',
    repositoryId: 'repo:one',
    revisionId: 'revision:one',
    kind: 'CALL',
    source: { factType: 'NODE', id: 'code:function' },
    target: { state: 'UNRESOLVED', resolution: 'UNRESOLVED', originalHint: 'call', candidates: [] },
    sourceRange: range(5, 0, 4),
    confidence: { score: 1, method: 'parser', reasons: [] },
  };
  // A known ref alone cannot replace a selected Canonical edge.
  const er = {
    scope: 'REPOSITORY',
    repositoryId: 'repo:one',
    entity: { kind: 'CODE_EDGE', id: edge.id, revisionId: 'revision:one' },
  };
  const support = {
    ...clone(e.payload.supportRefs[0]),
    entity: er.entity,
    valueDigest: 'd'.repeat(64),
  };
  f.context.references.availableEntities.push(er);
  f.context.references.availableSupports.push(support);
  e.payload.supportRefs.push(support);
  e.payload.payload.codeCallRef = er;
  assert.throws(() => parse(e, f.context));
  f.context.codeEdges.push(edge);
  assert.deepEqual(parse(e, f.context), e);
  f.context.codeEdges[0].sourceRange = range(5, 1, 4);
  assert.throws(() => parse(e, f.context));
});
test('VALUE_LINK closes exact argument producer/consumer and rejects missing site or self relation', () => {
  const f = fixture(),
    outer = f.envelopes.find((e) => e.payload.syntaxKind === 'INVOCATION');
  outer.payload.sourceRange = range(5, 0, 30);
  outer.payload.payload.arguments = [
    { name: null, value: { kind: 'UNKNOWN', reason: 'CALL_RESULT' }, sourceRange: range(5, 8, 15) },
  ];
  const inner = clone(outer);
  inner.payload.id = 'syntax:inner';
  inner.payload.syntaxKey = 'key:inner';
  inner.payload.sourceRange = range(5, 8, 15);
  inner.payload.payload.arguments = [];
  inner.payload.payload.calleeRange = range(5, 8, 12);
  const site = (e) => ({ syntaxKind: 'INVOCATION', sourceRange: clone(e.payload.sourceRange) });
  const link = f.record('VALUE_LINK', 'syntax:link', range(5, 0, 30), {
    relation: 'ARGUMENT_RESULT',
    producer: site(inner),
    consumer: site(outer),
    argumentIndex: 0,
  });
  const es = [...f.envelopes, inner, link];
  closure(es, f.context);
  const keywordWrapper = clone(es);
  keywordWrapper.find(
    (e) => e.payload.id === outer.payload.id,
  ).payload.payload.arguments[0].sourceRange.startColumn = 7;
  closure(keywordWrapper, f.context);
  assert.throws(() =>
    closure(
      es.filter((e) => e !== inner),
      f.context,
    ),
  );
  const bad = clone(es);
  bad.at(-1).payload.payload.producer = site(outer);
  assert.throws(() => closure(bad, f.context));
});
test('callback fence is local, never claims outer unconditional body execution', () => {
  const f = fixture(),
    outer = f.envelopes.find((e) => e.payload.syntaxKind === 'INVOCATION');
  outer.payload.sourceRange = range(5, 0, 40);
  outer.payload.payload.arguments = [
    {
      name: null,
      value: { kind: 'UNKNOWN', reason: 'CALLBACK_VALUE' },
      sourceRange: range(5, 8, 39),
    },
  ];
  const body = clone(outer);
  body.payload.id = 'syntax:body';
  body.payload.syntaxKey = 'key:body';
  body.payload.sourceRange = range(5, 20, 38);
  body.payload.lexicalScope = null;
  body.payload.callbackScope = range(5, 8, 39);
  body.payload.controlContext = 'UNKNOWN';
  body.payload.payload.calleeRange = range(5, 20, 26);
  body.payload.payload.arguments = [
    {
      name: null,
      value: { kind: 'REFERENCE', name: 'p', resolution: 'UNRESOLVED', candidates: [] },
      sourceRange: range(5, 27, 28),
    },
  ];
  const cb = f.record('CALLBACK_BINDING', 'syntax:callback', range(5, 8, 39), {
    consumer: { syntaxKind: 'INVOCATION', sourceRange: clone(outer.payload.sourceRange) },
    argumentIndex: 0,
    callbackForm: 'JAVA_LAMBDA_DIRECT_CALL',
    parentScopeRef: clone(ref),
    parameterNames: ['p'],
    body: { syntaxKind: 'INVOCATION', sourceRange: clone(body.payload.sourceRange) },
    reference: null,
    status: 'COMPLETE',
    limitations: [],
  });
  const es = [...f.envelopes, body, cb];
  closure(es, f.context);
  for (const change of [
    (e) => (e.payload.lexicalScope = clone(ref)),
    (e) => (e.payload.controlContext = 'UNCONDITIONAL'),
    (e) => (e.payload.callbackScope = range(5, 9, 39)),
  ]) {
    const bad = clone(es);
    change(bad.at(-2));
    assert.throws(() => closure(bad, f.context));
  }
  assert.throws(() =>
    closure(
      es.filter((e) => e !== cb),
      f.context,
    ),
  );
});

test('Runtime site plan enumerates every invocation with exact owner/ref/proof closure', () => {
  assert.equal(typeof api.parseRuntimeSitePlan, 'function');
  const f = fixture(),
    inv = f.envelopes.find((e) => e.payload.syntaxKind === 'INVOCATION').payload;
  const basis = clone(inv.supportRefs[0].basis),
    membership = 'a'.repeat(64);
  const plan = {
    basis,
    syntaxMembershipDigest: membership,
    entries: [
      {
        siteKey: inv.syntaxKey,
        sourceRange: clone(inv.sourceRange),
        ownerRef: clone(inv.owner),
        codeCallRef: null,
        role: 'ORDINARY_CALL',
        bindingIds: [],
        proofSyntaxKeys: [inv.syntaxKey],
      },
    ],
  };
  const c = {
    basis,
    syntaxMembershipDigest: membership,
    syntaxEvidence: f.envelopes.map((e) => e.payload),
    syntaxContext: f.context,
    bindings: [],
  };
  assert.deepEqual(api.parseRuntimeSitePlan(plan, c), plan);
  for (const change of [
    (p) => (p.entries = []),
    (p) => (p.entries[0].proofSyntaxKeys = ['unknown']),
    (p) => (p.entries[0].role = 'FRAMEWORK_BOUNDARY'),
    (p) => (p.entries[0].ownerRef = clone(base.envelopes[0].payload.owner)),
    (p) => (p.syntaxMembershipDigest = 'b'.repeat(64)),
    (p) => p.entries.push(clone(p.entries[0])),
  ]) {
    const bad = clone(plan);
    change(bad);
    assert.throws(() => api.parseRuntimeSitePlan(bad, c));
  }
});
test('V2 candidate digest binds derivation without changing old digest recipe', () => {
  assert.equal(typeof api.runtimeCandidateDigestV2, 'function');
  const c = {
    facts: {},
    bindings: {},
    coverage: { status: 'PARTIAL' },
    derivation: { sitePlanDigest: 'a'.repeat(64) },
  };
  const old = api.runtimeCandidateDigest(c),
    v2 = api.runtimeCandidateDigestV2(c);
  assert.notEqual(old, v2);
  assert.equal(api.runtimeCandidateDigestV2({ ...c, derivation: { ...c.derivation } }), v2);
  const changed = { ...c, derivation: { sitePlanDigest: 'b'.repeat(64) } };
  assert.notEqual(api.runtimeCandidateDigestV2(changed), v2);
  assert.equal(api.runtimeCandidateDigest(changed), old);
});
