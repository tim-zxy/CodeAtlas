import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const input = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/surface-closure/inputs.json',
      import.meta.url,
    ),
  ),
);
const api = () =>
  import('../dist/native-framework-surface-contract.js').catch((e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  });
test('wire8 pure contract requires new version/contract/extractor and preserves old7 strictness', async () => {
  const a = await api();
  assert(a.FrameworkSurfaceRequestSchema, 'missing wire8 contract');
  assert.deepEqual(a.FrameworkSurfaceRequestSchema.parse(input.request), input.request);
  const old = await import('../dist/native-binding-sufficiency-contract.js');
  assert.equal(old.BindingAwareCodeSyntaxRequestSchema.safeParse(input.request).success, false);
  for (const change of [
    (r) => (r.protocolVersion = 7),
    (r) => (r.payload.syntaxContract = 'SYNTAX_BINDING_V3'),
    (r) => (r.payload.extractorVersion = 'syntax-v1'),
  ]) {
    const r = structuredClone(input.request);
    change(r);
    assert.equal(a.FrameworkSurfaceRequestSchema.safeParse(r).success, false);
  }
});
test('wire8 raw requires callback/token fields and provider refs, never Canonical codeCallRef', async () => {
  const a = await api();
  assert(a.FrameworkSurfaceObservationSchema, 'missing wire8 raw');
  for (const r of input.raw) assert.deepEqual(a.FrameworkSurfaceObservationSchema.parse(r), r);
  const inv = input.raw.find((r) => r.syntaxKind === 'INVOCATION');
  for (const change of [
    (r) => delete r.callbackScope,
    (r) => delete r.payload.calleeRange,
    (r) => (r.payload.codeCallRef = null),
    (r) => (r.payload.calleeRange.sourceFileId = 'foreign'),
  ]) {
    const r = structuredClone(inv);
    change(r);
    assert.equal(a.FrameworkSurfaceObservationSchema.safeParse(r).success, false);
  }
  const p = structuredClone(input.raw.find((r) => r.syntaxKind === 'PARAMETER_BINDING'));
  p.payload.callableRef = { scope: 'REPOSITORY' };
  assert.equal(a.FrameworkSurfaceObservationSchema.safeParse(p).success, false);
});

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
const sha = (x) => createHash('sha256').update(x).digest('hex');
function streamSample(change = () => {}) {
  const x = structuredClone(input);
  change(x);
  const r = x.streamRequest,
    p = r.payload,
    request = Buffer.from(JSON.stringify(r) + '\n');
  const echo = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: p.ownerBinding,
    extractorVersion: p.extractorVersion,
    codeContract: p.codeContract,
    syntaxContract: p.syntaxContract,
    requestChecksum: sha(request),
  };
  const es = [
    { type: 'OBSERVATION_STARTED', payload: echo },
    ...x.raw.map((payload) => ({ type: 'SYNTAX_OBSERVATION', payload })),
    {
      type: 'SYNTAX_COVERAGE',
      payload: {
        sourceFileId: p.sourceFiles[0].id,
        sourceFingerprint: p.sourceFiles[0].contentFingerprint,
        status: 'COMPLETE',
        limitations: [],
      },
    },
  ].map((e, sequence) => ({ protocolVersion: 8, requestId: r.requestId, sequence, ...e }));
  const prefix = es.map((e) => JSON.stringify(e) + '\n').join('');
  es.push({
    protocolVersion: 8,
    requestId: r.requestId,
    sequence: es.length,
    type: 'OBSERVATION_COMPLETED',
    payload: {
      ...echo,
      codeOutcome: 'NOT_APPLICABLE',
      syntaxOutcome: 'COMPLETE',
      outcome: 'SUCCEEDED',
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
  return { request, output: Buffer.from(es.map((e) => JSON.stringify(e) + '\n').join('')) };
}
const reader = () =>
  import('../dist/native-framework-surface-stream.js').catch((e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  });
test('wire8 full bytes bind request, enforce closure and cumulatively charge same ledger', async () => {
  const a = await reader();
  assert.equal(typeof a.validateFrameworkSurfaceStreamWithBudget, 'function');
  const s = streamSample(),
    b = budget();
  const out = a.validateFrameworkSurfaceStreamWithBudget(s.request, s.output, b);
  assert.equal(out.observation.request.protocolVersion, 8);
  assert.equal(out.outputIdentity, sha(s.output));
  assert(b.budget.items > 0 && b.budget.serializedBytes > 0);
  for (const change of [
    (x) =>
      x.raw.splice(
        x.raw.findIndex((r) => r.syntaxKind === 'PARAMETER_BINDING'),
        1,
      ),
    (x) => (x.raw.find((r) => r.syntaxKind === 'PARAMETER_BINDING').payload.name = 'wrong'),
    (x) => (x.raw[0].payload.parentScopeRef = x.raw[1].payload.scopeRef),
  ]) {
    const bad = streamSample(change);
    assert.throws(() =>
      a.validateFrameworkSurfaceStreamWithBudget(bad.request, bad.output, budget()),
    );
  }
  const limits = budget();
  limits.limits.maxItems = 1;
  assert.throws(
    () => a.validateFrameworkSurfaceStreamWithBudget(s.request, s.output, limits),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  const old = await import('../dist/native-binding-sufficiency-stream.js');
  assert.throws(() =>
    old.validateBindingAwareSyntaxObservationStreamWithBudget(s.request, s.output, budget()),
  );
});
test('wire8 Readable validates chunks, cancellation and trailing bytes', async () => {
  const a = await reader();
  assert.equal(typeof a.default, 'function');
  const s = streamSample();
  assert.equal(
    (
      await a.default(
        s.request,
        Readable.from([s.output.subarray(0, 11), s.output.subarray(11)]),
        new AbortController().signal,
        undefined,
        budget(),
      )
    ).request.protocolVersion,
    8,
  );
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    a.default(s.request, Readable.from([s.output]), c.signal, undefined, budget()),
    (e) => e.code === 'CANCELLED',
  );
  assert.throws(() =>
    a.validateFrameworkSurfaceStreamWithBudget(
      s.request,
      Buffer.concat([s.output, Buffer.from('x')]),
      budget(),
    ),
  );
});

const mapper = () =>
  import('../dist/syntax-framework-surface-normalizer.js').catch((e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  });
function mapInput(raw) {
  const p = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/syntax-contract/binding-pipeline/mapper-inputs.json',
        import.meta.url,
      ),
    ),
  );
  p.raw = structuredClone(raw);
  p.raw.sourceFingerprint = p.sourceFile.contentFingerprint;
  p.extractorVersion = 'syntax-v2';
  p.selectedEdges = [];
  return p;
}
test('Syntax4 maps parameter and all old kinds with provider-independent new identity/policy', async () => {
  const a = await mapper();
  assert.equal(typeof a.default, 'function');
  for (const raw of input.raw) {
    const p = mapInput(raw),
      before = structuredClone(p),
      out = a.default(p, budget());
    assert.equal(out.syntaxKind, raw.syntaxKind);
    assert.equal(out.confidence.method, 'syntax-surface-support-v2');
    assert.equal(out.confidence.score, 0.5);
    assert.equal(out.callbackScope, null);
    assert.deepEqual(p, before);
  }
  const p = mapInput(input.raw.find((r) => r.syntaxKind === 'PARAMETER_BINDING'));
  const one = a.default(p, budget());
  assert.equal(one.payload.callableRef.entity.id, 'code:function');
  assert.equal(one.payload.name, 'value');
  function rename(x) {
    if (!x || typeof x !== 'object') return;
    for (const [k, v] of Object.entries(x)) {
      if (k === 'providerId') x[k] = 'other.provider';
      else rename(v);
    }
  }
  rename(p);
  assert.equal(a.default(p, budget()).syntaxKey, one.syntaxKey);
  p.raw.payload.ordinal = 1;
  assert.notEqual(a.default(p, budget()).syntaxKey, one.syntaxKey);
});
test('Syntax4 mapper refuses missing selectedEdges, foreign support and weak Code, preserving old3', async () => {
  const a = await mapper();
  assert.equal(typeof a.default, 'function');
  const raw = input.raw.find((r) => r.syntaxKind === 'PARAMETER_BINDING');
  for (const change of [
    (p) => delete p.selectedEdges,
    (p) => (p.extractorVersion = 'syntax-v1'),
    (p) => (p.raw.payload.callableRef.providerFactId = 'absent'),
    (p) => p.supports.pop(),
  ]) {
    const p = mapInput(raw);
    change(p);
    assert.throws(() => a.default(p, budget()));
  }
  const p = mapInput(raw),
    b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () => a.default(p, b),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
  const old = await import('../dist/syntax-binding-sufficiency-normalizer.js');
  assert.throws(() => old.default(p, budget()));
});

import { historyDraftDigest } from '../dist/history-transition-input.js';
test('Syntax4 links actual supported Code CALL only on unique exact site, never by containing range', async () => {
  const a = await mapper();
  assert.equal(typeof a.default, 'function');
  const p = mapInput(input.raw.find((r) => r.syntaxKind === 'INVOCATION'));
  const edge = {
    id: 'edge:surface',
    factKey: 'edge-key:surface',
    repositoryId: p.basis.repositoryId,
    revisionId: p.basis.revisionId,
    kind: 'CALL',
    source: { factType: 'NODE', id: 'code:function' },
    target: {
      state: 'UNRESOLVED',
      resolution: 'UNRESOLVED',
      originalHint: 'handler',
      candidates: [],
    },
    sourceRange: structuredClone(p.raw.payload.calleeRange),
    confidence: { score: 1, method: 'parser', reasons: [] },
  };
  const support = structuredClone(p.supports[0]);
  support.factType = 'EDGE';
  support.canonical = edge;
  support.evidence.id = 'evidence:surface-edge';
  support.evidence.providerFact = {
    factType: 'EDGE',
    providerId: 'native',
    providerFactId: 'provider:surface-edge',
  };
  support.binding.providerFact = structuredClone(support.evidence.providerFact);
  support.binding.canonicalFact = { factType: 'EDGE', id: edge.id };
  support.binding.evidenceId = support.evidence.id;
  support.factEvidence = {
    fact: structuredClone(support.binding.canonicalFact),
    evidenceId: support.evidence.id,
  };
  support.valueDigest = historyDraftDigest(
    { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: edge },
    budget().limits,
    budget().budget,
  );
  p.selectedEdges.push(edge);
  p.supports.push(support);
  p.bindings.push(structuredClone(support.binding));
  const out = a.default(p, budget());
  assert.equal(out.payload.codeCallRef.entity.id, edge.id);
  assert(out.supportRefs.some((s) => s.entity.kind === 'CODE_EDGE' && s.entity.id === edge.id));
  const beforeKey = out.syntaxKey;
  p.selectedEdges[0].sourceRange.startColumn++;
  p.supports.at(-1).canonical = structuredClone(p.selectedEdges[0]);
  p.supports.at(-1).valueDigest = historyDraftDigest(
    { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: p.selectedEdges[0] },
    budget().limits,
    budget().budget,
  );
  assert.equal(a.default(p, budget()).payload.codeCallRef, null);
  assert.notEqual(a.default(p, budget()).syntaxKey, beforeKey);
});

import { readSurfaceCapture } from '../../../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
test('portable recorded library inputs preserve strict raw closure and independent Source obligations', async () => {
  const { validateFrameworkSurfaceStreamWithBudget: validate } =
    await import('../dist/native-framework-surface-stream.js');
  for (const id of ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    const saved = readSurfaceCapture(id);
    assert.equal(saved.kind, 'RECORDED_LIBRARY_INPUT');
    const r = saved.syntax;
    const out = validate(r.request, r.output, budget()).observation;
    const records = out.events.filter((e) => e.type === 'SYNTAX_OBSERVATION').map((e) => e.payload);
    assert(records.length > 0);
    assert(records.every((r) => Object.hasOwn(r, 'callbackScope')));
    if (id === 'J1')
      assert(
        records.some(
          (r) => r.syntaxKind === 'ASSIGNMENT' && r.payload.targetName === 'this.repository',
        ),
      );
    if (id === 'J2')
      assert(
        records.some(
          (r) => r.syntaxKind === 'INVOCATION' && r.payload.invocationForm === 'CONSTRUCT',
        ),
      );
    if (id === 'J4' || id === 'J5')
      assert(
        records.some(
          (r) =>
            r.syntaxKind === 'CALLBACK_BINDING' &&
            r.payload.callbackForm ===
              (id === 'J4' ? 'JAVA_LAMBDA_DIRECT_CALL' : 'JAVA_METHOD_REFERENCE'),
        ),
      );
    if (id === 'P3')
      assert(
        records.some(
          (r) =>
            r.syntaxKind === 'PARAMETER_BINDING' &&
            r.payload.typeRange !== null &&
            r.payload.defaultValueRange === null,
        ),
      );
    if (id === 'J6') assert.equal(out.syntaxOutcome, 'PARTIAL');
  }
});

function surfaceHistorySeed(kind = 'BINDING_SCOPE') {
  const h = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/syntax-contract/binding-pipeline/history-inputs.json',
        import.meta.url,
      ),
    ),
  );
  const body = structuredClone(h.bodies.find((b) => b.envelope.payload.syntaxKind === kind));
  body.envelope.version = 4;
  body.envelope.payload.callbackScope = null;
  const { id, ...meaning } = body.envelope.payload;
  body.envelope.payload.id =
    'syntax:' + historyDraftDigest(meaning, budget().limits, budget().budget);
  // History uses its own domain-separated initial identity, independent of the product factory.
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
  body.envelope.payload.id = 'syntax:' + sha('codeatlas-syntax-initial-v4\0' + canonical(meaning));
  return { body, selectedNodes: h.selectedNodes, selectedEdges: [] };
}
test('Syntax4 history uses new domains and preserves immutable origin when reprojecting', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof a.createFrameworkSurfaceSyntaxHistoryPair, 'function');
  const seed = surfaceHistorySeed(),
    first = a.createFrameworkSurfaceSyntaxHistoryPair(seed, budget());
  assert.equal(JSON.parse(first.projection.envelope_json).version, 4);
  const basis = {
    ...seed.body.envelope.payload.supportRefs[0].basis,
    contentFingerprint: 'content:surface-retained',
  };
  const next = a.reprojectFrameworkSurfaceSyntaxHistoryPair(
    {
      body: seed.body,
      originNodes: seed.selectedNodes,
      originEdges: [],
      currentBasis: basis,
      currentNodes: seed.selectedNodes,
      currentEdges: [],
    },
    budget(),
  );
  assert.equal(next.origin.origin_json, first.origin.origin_json);
  assert.notEqual(next.projection.id, first.projection.id);
  assert(
    JSON.parse(next.projection.envelope_json).payload.supportRefs.every(
      (s) => s.basis.contentFingerprint === basis.contentFingerprint,
    ),
  );
  assert.throws(() => a.createBindingAwareSyntaxHistoryPair(seed, budget()));
});
test('Syntax4 history refuses omitted edge inventory, wrong version/domain and exhausted ledger', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof a.createFrameworkSurfaceSyntaxHistoryPair, 'function');
  for (const change of [
    (p) => delete p.selectedEdges,
    (p) => (p.body.envelope.version = 3),
    (p) => (p.body.envelope.payload.id = 'syntax:wrong'),
  ]) {
    const p = surfaceHistorySeed();
    change(p);
    assert.throws(() => a.createFrameworkSurfaceSyntaxHistoryPair(p, budget()));
  }
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () => a.createFrameworkSurfaceSyntaxHistoryPair(surfaceHistorySeed(), b),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('Syntax4 history preserves actual Code CALL support and refuses an inconsistent retained edge', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  const p = surfaceHistorySeed('INVOCATION'),
    v = p.body.envelope.payload;
  Object.assign(v.payload, {
    invocationForm: 'CALL',
    calleeRange: { ...v.sourceRange, endColumn: v.sourceRange.startColumn + 1 },
    codeCallRef: {
      scope: 'REPOSITORY',
      repositoryId: v.repositoryId,
      entity: { kind: 'CODE_EDGE', id: 'edge:history-surface', revisionId: v.revisionId },
    },
  });
  const edge = {
    id: 'edge:history-surface',
    factKey: 'edge-key:history-surface',
    repositoryId: v.repositoryId,
    revisionId: v.revisionId,
    kind: 'CALL',
    source: { factType: 'NODE', id: v.owner.entity.id },
    target: {
      state: 'UNRESOLVED',
      resolution: 'UNRESOLVED',
      originalHint: 'handler',
      candidates: [],
    },
    sourceRange: structuredClone(v.payload.calleeRange),
    confidence: { score: 1, method: 'parser', reasons: [] },
  };
  p.selectedEdges.push(edge);
  const c = (v) =>
    Array.isArray(v)
      ? '[' + v.map(c).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + c(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v);
  const digest = (d, x) => sha(d + '\0' + c(x));
  v.supportRefs.push({
    basis: structuredClone(v.supportRefs[0].basis),
    entity: structuredClone(v.payload.codeCallRef.entity),
    valueDigest: digest('codeatlas-phase1-support-value-v1', edge),
  });
  const { id, ...meaning } = v;
  v.id = 'syntax:' + digest('codeatlas-syntax-initial-v4', meaning);
  const first = a.createFrameworkSurfaceSyntaxHistoryPair(p, budget());
  const input = {
    body: p.body,
    originNodes: p.selectedNodes,
    originEdges: p.selectedEdges,
    currentBasis: { ...v.supportRefs[0].basis, contentFingerprint: 'content:edge-retained' },
    currentNodes: p.selectedNodes,
    currentEdges: structuredClone(p.selectedEdges),
  };
  const next = a.reprojectFrameworkSurfaceSyntaxHistoryPair(input, budget());
  assert.equal(next.origin.origin_json, first.origin.origin_json);
  assert(
    JSON.parse(next.projection.envelope_json).payload.supportRefs.some(
      (s) => s.entity.kind === 'CODE_EDGE',
    ),
  );
  input.currentEdges[0].sourceRange.startColumn++;
  assert.throws(() => a.reprojectFrameworkSurfaceSyntaxHistoryPair(input, budget()));
});

test('stored Syntax4 collection validates scopes instead of silently bypassing the v3-only guard', async () => {
  const { validateSyntaxProjectionClosure, HistoryReadBudget } =
    await import('../../storage/dist/analysis/activation-history-format.js');
  const { historyLimits } = await import('../../storage/test/helpers/r011-history-fixture.mjs');
  const h = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/syntax-contract/binding-pipeline/history-inputs.json',
        import.meta.url,
      ),
    ),
  );
  const es = h.bodies.map((b) => {
    const e = structuredClone(b.envelope);
    e.version = 4;
    e.payload.callbackScope = null;
    if (e.payload.syntaxKind === 'INVOCATION')
      Object.assign(e.payload.payload, {
        invocationForm: 'CALL',
        calleeRange: { ...e.payload.sourceRange, endColumn: e.payload.sourceRange.startColumn + 1 },
        codeCallRef: null,
      });
    return e;
  });
  const state = {
    basis: h.basis,
    nodes: h.selectedNodes,
    edges: [],
    inventory: [h.bodies[0].sourceFile],
  };
  assert.doesNotThrow(() =>
    validateSyntaxProjectionClosure(es, state, new HistoryReadBudget(historyLimits)),
  );
  assert.throws(() =>
    validateSyntaxProjectionClosure(es.slice(1), state, new HistoryReadBudget(historyLimits)),
  );
  assert.throws(() =>
    validateSyntaxProjectionClosure(
      [h.bodies[0].envelope, ...es.slice(1)],
      state,
      new HistoryReadBudget(historyLimits),
    ),
  );
});

function surfaceManifestSeed() {
  const pair = surfaceHistorySeed(),
    s = JSON.parse(
      readFileSync(
        new URL(
          '../../../fixtures/phase1/syntax-contract/binding-history/inputs.json',
          import.meta.url,
        ),
      ),
    ).state;
  Object.assign(s, {
    basis: pair.body.envelope.payload.supportRefs[0].basis,
    inventory: [pair.body.sourceFile],
    nodes: pair.selectedNodes,
    edges: [],
    snapshots: [pair.body.originSnapshot],
    units: [
      {
        id: pair.body.unitId,
        providerId: 'native',
        kind: 'JAVA_GROUP',
        sourceFileIds: [pair.body.sourceFile.id],
      },
    ],
    supports: [],
    coverage: [],
    syntaxOrigins: [],
  });
  s.contracts = [
    {
      providerId: 'native',
      extractor: 'syntax-v2',
      normalizer: 'syntax-canonical-mapper-v4',
      contract: 'SYNTAX_BINDING_V4',
      policy: 'syntax-surface-support-v2',
    },
  ];
  delete s.syntaxOrigins;
  return {
    mode: 'FULL',
    state: s,
    parent: null,
    observation: null,
    transitions: null,
    syntax: [{ kind: 'NEW', body: pair.body }],
  };
}
test('Syntax4 isolated manifest composes new pairs without admitting v4 to old entry', async () => {
  const a = await import('../dist/syntax-history-candidate.js');
  assert.equal(typeof a.createFrameworkSurfaceSyntaxHistoryManifest, 'function');
  const p = surfaceManifestSeed();
  const out = a.createFrameworkSurfaceSyntaxHistoryManifest(p, budget());
  assert.equal(out.origins.length, 1);
  assert.equal(JSON.parse(out.projections[0].envelope_json).version, 4);
  assert.equal(out.manifest.state.syntaxOrigins.length, 1);
  assert.throws(() => a.createVersionedSyntaxHistoryManifest(p, budget()));
  const mixed = structuredClone(p);
  mixed.syntax[0].body.envelope.version = 3;
  assert.throws(() => a.createFrameworkSurfaceSyntaxHistoryManifest(mixed, budget()));
});

import { loadCompositionCase, reseal } from './fixtures/native-composition-helpers.mjs';
async function surfaceCompositionSeed() {
  const saved = readSurfaceCapture('P5'),
    request = JSON.parse(saved.syntax.request),
    p = request.payload,
    metadata = structuredClone((await loadCompositionCase('python-only')).metadata);
  metadata.targetSource = p.targetSource;
  metadata.inventory = p.sourceFiles;
  metadata.java = null;
  metadata.snapshot.id = p.providerSnapshotId;
  metadata.snapshot.providerId = p.providerId;
  metadata.snapshot.providerVersion = p.providerVersion;
  metadata.codeSyntax.providerVersion = p.providerVersion;
  return {
    kind: 'DECLARED_RECORDED_REPLAY_TIMING_NOT_ACTUAL_PROCESS_MEASUREMENT',
    metadata,
    requestBytes: saved.syntax.request,
    outputBytes: saved.syntax.output,
  };
}
test('RAW_V8 complete recorded Python composes through canonical normalization and FactMerger', async () => {
  const a = await import('../dist/native-composition.js');
  assert.equal(typeof a.composeFrameworkSurfaceProjectionForHistory, 'function');
  const s = await surfaceCompositionSeed();
  const out = a.composeFrameworkSurfaceProjectionForHistory(
    s.metadata,
    s.requestBytes,
    s.outputBytes,
    budget(),
  );
  assert.equal(out.candidate.provenance.codeSyntax.kind, 'RAW_V8');
  assert.equal(out.candidate.codeSyntax.request.protocolVersion, 8);
  assert(out.candidate.merged.nodes.length > 0);
  const old = await import('../dist/native-composition-input.js');
  assert.throws(() =>
    old.readBindingAwareCompositionInputsWithBudget(
      s.metadata,
      s.requestBytes,
      s.outputBytes,
      budget(),
    ),
  );
});
test('RAW_V8 composition refuses honest partial and retains cumulative budget refusal', async () => {
  const a = await import('../dist/native-composition.js');
  assert.equal(typeof a.composeFrameworkSurfaceProjectionForHistory, 'function');
  const s = await surfaceCompositionSeed();
  const es = s.outputBytes.toString().trim().split('\n').map(JSON.parse);
  const coverage = es.find((e) => e.type === 'SYNTAX_COVERAGE');
  coverage.payload.status = 'PARTIAL';
  coverage.payload.limitations = ['DECLARED_NEGATIVE_CONTROL'];
  es.at(-1).payload.syntaxOutcome = 'PARTIAL';
  es.at(-1).payload.outcome = 'PARTIAL';
  const negative = reseal(JSON.parse(s.requestBytes), es);
  assert.throws(
    () =>
      a.composeFrameworkSurfaceProjectionForHistory(
        s.metadata,
        negative.requestBytes,
        negative.outputBytes,
        budget(),
      ),
    (e) => e.code === 'INCOMPLETE_OBSERVATION',
  );
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () =>
      a.composeFrameworkSurfaceProjectionForHistory(s.metadata, s.requestBytes, s.outputBytes, b),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

test('RAW_V8 full support candidate requires the exact v4 mapper/policy contract', async () => {
  const a = await import('../dist/declared-delta-raw-support-candidate.js');
  assert.equal(typeof a.composeDeclaredFrameworkSurfaceFullRawSupportCandidate, 'function');
  const s = await surfaceCompositionSeed();
  const target = {
    source: s.metadata.targetSource,
    repositoryLocatorDigest: 'a'.repeat(64),
    inventory: s.metadata.inventory,
    contracts: [
      {
        providerId: 'native',
        extractor: 'syntax-v2',
        normalizer: 'syntax-canonical-mapper-v4',
        contract: 'SYNTAX_BINDING_V4',
        policy: 'syntax-surface-support-v2',
      },
    ],
  };
  const out = a.composeDeclaredFrameworkSurfaceFullRawSupportCandidate(
    target,
    s.metadata,
    s.requestBytes,
    s.outputBytes,
    budget(),
  );
  assert.equal(out.raw.codeSyntax.request.protocolVersion, 8);
  assert(out.activeSupports.length > 0);
  for (const [key, value] of [
    ['extractor', 'syntax-v1'],
    ['normalizer', 'syntax-canonical-mapper-v3'],
    ['policy', 'syntax-surface-support-v1'],
  ]) {
    const bad = structuredClone(target);
    bad.contracts[0][key] = value;
    assert.throws(() =>
      a.composeDeclaredFrameworkSurfaceFullRawSupportCandidate(
        bad,
        s.metadata,
        s.requestBytes,
        s.outputBytes,
        budget(),
      ),
    );
  }
});

import { loadRawHistoryCase } from '../../../fixtures/phase1/declared-raw-history-candidate/corpus.mjs';
async function surfaceDeltaSeed() {
  const s = loadRawHistoryCase('I01'),
    request = JSON.parse(s.requestBytes),
    events = s.outputBytes.toString().trim().split('\n').map(JSON.parse);
  const contract = {
    providerId: 'native',
    extractor: 'syntax-v2',
    normalizer: 'syntax-canonical-mapper-v4',
    contract: 'SYNTAX_BINDING_V4',
    policy: 'syntax-surface-support-v2',
  };
  for (const t of [s.input.history.state, s.input.current, s.input.target])
    t.contracts = t.contracts.map((c) =>
      c.providerId === 'native' ? structuredClone(contract) : c,
    );
  request.protocolVersion = 8;
  request.payload.syntaxContract = 'SYNTAX_BINDING_V4';
  request.payload.extractorVersion = 'syntax-v2';
  for (const l of request.payload.languages) l.compatibilityVersion = 'syntax-v2';
  for (const e of events) {
    e.protocolVersion = 8;
    if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED') {
      e.payload.syntaxContract = 'SYNTAX_BINDING_V4';
      e.payload.extractorVersion = 'syntax-v2';
    }
  }
  return { ...s, ...reseal(request, events) };
}
test('RAW_V8 delta uses v4 admission and shared support ledger, rejects version drift and narrow upgrade', async () => {
  const a = await import('../dist/declared-delta-raw-support-candidate.js');
  assert.equal(
    typeof a.composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget,
    'function',
  );
  const s = await surfaceDeltaSeed();
  const out = a.composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget(
    s.input,
    s.metadata,
    s.requestBytes,
    s.outputBytes,
    budget(),
  );
  assert.equal(out.raw.codeSyntax.request.protocolVersion, 8);
  assert.equal(out.candidate.mode, 'TRANSITION');
  assert(out.candidate.activeSupports.length > 0);
  const old = await import('../dist/declared-delta-raw-observation.js');
  assert.throws(() =>
    old.prepareDeclaredBindingAwareDeltaRawObservationWithBudget(
      s.input,
      s.metadata,
      s.requestBytes,
      s.outputBytes,
      budget(),
    ),
  );
  const upgrade = structuredClone(s.input);
  upgrade.history.state.contracts.find((c) => c.providerId === 'native').contract =
    'SYNTAX_BINDING_V3';
  upgrade.current = structuredClone(upgrade.history.state);
  const { prepareDeclaredNativeObservationScope } = await import('../dist/history-transition.js'),
    scope = prepareDeclaredNativeObservationScope(upgrade, budget().limits).scope;
  assert.deepEqual([...new Set(scope.requiredUnits.flatMap((u) => u.sourceFileIds))].sort(), [
    'a',
    'b',
    'j',
    'k',
  ]);
  assert.throws(() =>
    a.composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget(
      upgrade,
      s.metadata,
      s.requestBytes,
      s.outputBytes,
      budget(),
    ),
  );
  const b = budget();
  b.limits.maxItems = 1;
  assert.throws(
    () =>
      a.composeDeclaredFrameworkSurfaceDeltaRawSupportCandidateWithBudget(
        s.input,
        s.metadata,
        s.requestBytes,
        s.outputBytes,
        b,
      ),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});
