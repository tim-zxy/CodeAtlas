import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as contract from '../dist/compilation-input-contract.js';
const inspection = await import('../dist/compilation-secret-candidate.js').catch(() => ({}));
const { makeAccount } = await import('../../source/test/fixtures/mixed-source-git-double.mjs');

test('private DTO declarations do not leak a direct Zod package dependency', () => {
  const declaration = readFileSync(
    new URL('../dist/compilation-input-contract.d.ts', import.meta.url),
    'utf8',
  );
  assert.equal(/import\(["']zod(?:[\/"'])/.test(declaration), false);
});

const zero = '0'.repeat(64);
const coverage = () => ({ status: 'COMPLETE', limitations: [], unverifiedRefs: [] });
const control = (changes = {}) => ({
  maxItems: 100000,
  maxDepth: 100,
  deadlineEpochMs: Date.now() + 60000,
  signal: new AbortController().signal,
  ...changes,
});
const basis = () => ({
  repositoryId: 'r',
  revisionId: 'v',
  contentFingerprint: `sha256:${zero}`,
  codeActivationDigest: zero,
});
const ref = (kind, id) => ({
  scope: 'REPOSITORY',
  repositoryId: 'r',
  entity: { kind, id, revisionId: 'v' },
});
const source = () => ({
  id: 'f',
  repositoryId: 'r',
  revisionId: 'v',
  path: 'src/A.java',
  contentFingerprint: `sha256:${zero}`,
  classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
  languageHint: 'java',
  sensitivity: 'INTERNAL',
});
const request = () => ({
  schemaVersion: 1,
  workspaceId: 'w',
  scope: { kind: 'REPOSITORY', repositoryId: 'r' },
  revisionSetId: 'rs',
  repositoryIds: ['r'],
  selectedEntityRefs: [],
  selectedDocumentRevisions: [],
  policyVersions: { securityPolicyRef: 'security-v1', domainPolicyRef: 'domain-v1' },
});
const snapshot = () => ({
  schemaVersion: 1,
  snapshotId: 'opaque-1',
  workspaceId: 'w',
  scope: { kind: 'REPOSITORY', repositoryId: 'r' },
  revisionSetId: 'rs',
  selection: { repositoryIds: ['r'], selectedEntityRefs: [], selectedDocumentRevisions: [] },
  workspaceCapture: null,
  repositories: [
    {
      repoBasis: basis(),
      runtimeActivationDigest: null,
      entities: [],
      supports: [],
      coverage: coverage(),
    },
  ],
  documents: [],
  policyVersions: { securityPolicyRef: 'security-v1', domainPolicyRef: 'domain-v1' },
  captureWindow: { startedAt: '2026-11-06T00:00:00.000Z', completedAt: '2026-11-06T00:00:01.000Z' },
  coverage: coverage(),
});

// Handwritten canonical bytes. Literal hashes frozen with PowerShell/.NET SHA256,
// independently of this module and its encoder. No product-generated oracle.
const sourceCanonical =
  '{"value":{"classification":{"contentKind":"TEXT","provenance":"AUTHORED","role":"SOURCE"},"contentFingerprint":"sha256:' +
  zero +
  '","id":"f","languageHint":"java","path":"src/A.java","repositoryId":"r","revisionId":"v","sensitivity":"INTERNAL"},"valueSchemaRef":"SourceFile@1"}';
const emptyCanonical =
  '{"coverage":{"limitations":[],"status":"COMPLETE","unverifiedRefs":[]},"documents":[],"policyVersions":{"domainPolicyRef":"domain-v1","securityPolicyRef":"security-v1"},"repositories":[{"coverage":{"limitations":[],"status":"COMPLETE","unverifiedRefs":[]},"entities":[],"repoBasis":{"codeActivationDigest":"' +
  zero +
  '","contentFingerprint":"sha256:' +
  zero +
  '","repositoryId":"r","revisionId":"v"},"runtimeActivationDigest":null,"supports":[]}],"revisionSetId":"rs","schemaVersion":1,"scope":{"kind":"REPOSITORY","repositoryId":"r"},"selection":{"repositoryIds":["r"],"selectedDocumentRevisions":[],"selectedEntityRefs":[]},"workspaceCapture":null,"workspaceId":"w"}';
const sourceHash = '94973574233c8a067e0a6628553570f4b0829f63a1dcd7232b9cc4a1001931ae';
const emptyHash = '13bf816d9f4588dde253cfbe0475cae04ef2daf3e167d7936f1d784f21f9da4a';
const create = (v = snapshot(), c = control()) => contract.createCompilationInputSnapshot(v, c);
function originalFixture(bytes = Buffer.from('password=synthetic-only')) {
  const input = withSource();
  input.repositories[0].entities[0].value.contentFingerprint =
    'sha256:' + createHash('sha256').update(bytes).digest('hex');
  return {
    snapshot: create(input),
    bytes,
    key: JSON.stringify(['SOURCE_FILE', 'w', 'r', 'v', 'f']),
  };
}

test('candidate original manifest enumerates exact source and document bindings without authority', () => {
  const f = originalFixture();
  const plan = inspection.planCompilationOriginals(f.snapshot, control(), makeAccount().account);
  assert.deepEqual(plan.required, [
    {
      key: f.key,
      kind: 'SOURCE_FILE',
      workspaceId: 'w',
      repositoryId: 'r',
      revisionId: 'v',
      entityId: 'f',
      path: 'src/A.java',
      contentFingerprint: 'sha256:' + createHash('sha256').update(f.bytes).digest('hex'),
    },
  ]);
  assert.equal(plan.scope, 'CAPTURED_SUPPORT_CLOSURE_ONLY');
  assert.equal(plan.originalSource, 'NOT_INSPECTED');
  assert.equal(plan.authorization, 'NOT_ESTABLISHED');
  assert.equal(plan.clearance, false);
  const docs = inspection.planCompilationOriginals(
    create(documentCapture()),
    control(),
    makeAccount().account,
  );
  assert.equal(docs.required.length, 1);
  assert.equal(docs.required[0].kind, 'DOCUMENT_REVISION');
  assert.equal(docs.required[0].repositoryId, null);
  assert.equal(docs.required[0].path, 'note.md');
});

test('supplied-original evaluation detects a raw-only secret without granting consumption', () => {
  const f = originalFixture();
  const result = inspection.inspectSuppliedCompilationOriginals(
    f.snapshot,
    new Map([[f.key, f.bytes]]),
    control(),
    makeAccount().account,
  );
  assert.equal(result.detected, true);
  assert.equal(result.originalSource, 'SUPPLIED_BYTES_ONLY');
  assert.equal(result.inputsChecked, 1);
  assert.equal(result.authorization, 'NOT_ESTABLISHED');
  assert.equal(result.status, 'PROPOSED');
  assert.equal(result.coverage, 'LIMITED');
  assert.equal(result.clearance, false);
  assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
});

test('supplied-original evaluation refuses missing, extra, wrong-hash and invalid UTF8 input', () => {
  const f = originalFixture();
  for (const originals of [
    new Map(),
    new Map([
      [f.key, f.bytes],
      ['foreign', f.bytes],
    ]),
    new Map([[f.key, Buffer.from('changed')]]),
    new Map([[f.key, Buffer.from([255])]]),
  ]) {
    const owner = makeAccount();
    assert.throws(() =>
      inspection.inspectSuppliedCompilationOriginals(
        f.snapshot,
        originals,
        control(),
        owner.account,
      ),
    );
    assert.equal(owner.usage.invalid, true);
  }
});

test('uninspectable required binary input refuses instead of disappearing from manifest', () => {
  const input = withSource();
  input.repositories[0].entities[0].value.classification.contentKind = 'BINARY';
  const owner = makeAccount();
  assert.throws(() => inspection.planCompilationOriginals(create(input), control(), owner.account));
  assert.equal(owner.usage.invalid, true);
});

test('empty captured closure never claims original inspection or clearance', () => {
  const result = inspection.inspectSuppliedCompilationOriginals(
    create(),
    new Map(),
    control(),
    makeAccount().account,
  );
  assert.equal(result.inputsChecked, 0);
  assert.equal(result.originalSource, 'NOT_INSPECTED');
  assert.equal(result.clearance, false);
});

test('original manifest includes support-only files and deduplicates identical captured bindings', () => {
  const input = addSourceSupport(codeCapture());
  input.repositories[0].entities.shift();
  const plan = inspection.planCompilationOriginals(create(input), control(), makeAccount().account);
  assert.equal(plan.required.length, 1);
  assert.equal(plan.required[0].entityId, 'f');
  const duplicate = inspection.planCompilationOriginals(
    create(addSourceSupport(withSource())),
    control(),
    makeAccount().account,
  );
  assert.equal(duplicate.required.length, 1);
});

test('supplied-original evaluation rejects proxy maps without hooks and shared byte backing', () => {
  const f = originalFixture();
  let hooks = 0;
  const proxy = new Proxy(new Map(), {
    getPrototypeOf() {
      hooks++;
      return Map.prototype;
    },
  });
  for (const originals of [proxy, new Map([[f.key, new Uint8Array(new SharedArrayBuffer(4))]])]) {
    const owner = makeAccount();
    assert.throws(() =>
      inspection.inspectSuppliedCompilationOriginals(
        f.snapshot,
        originals,
        control(),
        owner.account,
      ),
    );
    assert.equal(owner.usage.invalid, true);
  }
  assert.equal(hooks, 0);
});

test('cancellation during original byte accounting survives caller signal replacement', () => {
  const f = originalFixture(),
    controller = new AbortController();
  const requestControl = control({ signal: controller.signal }),
    owner = makeAccount();
  owner.account.reserveBuffer = (size) => {
    if (size === f.bytes.length) {
      controller.abort();
      requestControl.signal = new AbortController().signal;
    }
  };
  assert.throws(() =>
    inspection.inspectSuppliedCompilationOriginals(
      f.snapshot,
      new Map([[f.key, f.bytes]]),
      requestControl,
      owner.account,
    ),
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(owner.usage.invalid, true);
});
const bad = (f, code) =>
  assert.throws(f, (e) => e.name === 'CompilationInputContractError' && (!code || e.code === code));
function withSource() {
  const v = snapshot(),
    value = source(),
    entity = { ref: ref('SOURCE_FILE', 'f'), valueSchemaRef: 'SourceFile@1', value };
  v.repositories[0].entities.push(entity);
  v.selection.selectedEntityRefs.push(entity.ref);
  return v;
}
function addSourceSupport(v) {
  const entity = v.repositories[0].entities[0];
  const valueBytes = sourceCanonical.slice(
    '{"value":'.length,
    -',"valueSchemaRef":"SourceFile@1"}'.length,
  );
  v.repositories[0].supports.push({
    ref: {
      basis: basis(),
      entity: entity.ref.entity,
      valueDigest: createHash('sha256')
        .update('codeatlas-phase1-support-value-v1\0' + valueBytes)
        .digest('hex'),
    },
    valueSchemaRef: 'SourceFile@1',
    value: source(),
    capturedValueDigest: sourceHash,
  });
  return v;
}

test('offline captured-value inspection includes support-only values and never claims original Source inspection', () => {
  const input = addSourceSupport(codeCapture());
  input.repositories[0].entities.shift();
  const support = input.repositories[0].supports[0];
  support.value.languageHint = 'https://user:synthetic-only@example.invalid';
  support.ref.valueDigest = createHash('sha256')
    .update(
      'codeatlas-phase1-support-value-v1\0' +
        contract.canonicalCompilationJson(support.value, control()),
    )
    .digest('hex');
  support.capturedValueDigest = contract.compilationCaptureValueDigest(
    support.valueSchemaRef,
    support.value,
    control(),
  );
  const result = inspection.inspectCapturedCompilationValues(
    create(input),
    control(),
    makeAccount().account,
  );
  assert.equal(result.inputKind, 'CAPTURED_VALUES_ONLY');
  assert.equal(result.originalSource, 'NOT_INSPECTED');
  assert.equal(result.scan.detected, true);
  assert.ok(result.scan.rules.includes('URI_PASSWORD'));
  assert.equal(result.scan.status, 'PROPOSED');
  assert.equal(result.scan.clearance, false);
});

test('offline captured-value inspection refuses broken support digests and cancelled control', () => {
  const input = structuredClone(create(addSourceSupport(withSource())));
  input.repositories[0].supports[0].capturedValueDigest = zero;
  const owner = makeAccount();
  assert.throws(() => inspection.inspectCapturedCompilationValues(input, control(), owner.account));
  assert.equal(owner.usage.invalid, true);
  const controller = new AbortController();
  controller.abort();
  const stopped = makeAccount();
  assert.throws(() =>
    inspection.inspectCapturedCompilationValues(
      create(),
      control({ signal: controller.signal }),
      stopped.account,
    ),
  );
  assert.equal(stopped.usage.invalid, true);
});

test('offline captured-value inspection retains original cancellation and deadline through scanning', (t) => {
  for (const failure of ['cancel', 'deadline']) {
    const controller = new AbortController();
    const requestControl = control({ signal: controller.signal });
    const owner = makeAccount();
    let owns = 0;
    owner.account.own = () => {
      if (++owns !== 2) return;
      if (failure === 'cancel') {
        controller.abort();
        requestControl.signal = new AbortController().signal;
      } else {
        const expiredAt = requestControl.deadlineEpochMs + 1;
        t.mock.method(Date, 'now', () => expiredAt);
        requestControl.deadlineEpochMs = expiredAt + 60000;
      }
    };
    assert.throws(() =>
      inspection.inspectCapturedCompilationValues(create(), requestControl, owner.account),
    );
    assert.equal(owner.usage.invalid, true);
    t.mock.restoreAll();
  }
});

test('independent handwritten canonical bytes and literal SHA256 vectors', () => {
  assert.equal(
    contract.canonicalCompilationJson(
      { valueSchemaRef: 'SourceFile@1', value: source() },
      control(),
    ),
    sourceCanonical,
  );
  assert.equal(
    contract.compilationCaptureValueDigest('SourceFile@1', source(), control()),
    sourceHash,
  );
  const result = create();
  assert.equal(result.inputDigest, emptyHash);
  const { snapshotId, captureWindow, inputDigest, ...content } = result;
  assert.equal(contract.canonicalCompilationJson(content, control()), emptyCanonical);
  assert.equal(contract.parseCompilationInputSnapshot(result, control()).inputDigest, emptyHash);
});

test('opaque allocation and audit time do not change semantic input digest', () => {
  const v = snapshot();
  v.snapshotId = 'new-opaque';
  v.captureWindow = {
    startedAt: '2026-11-07T01:00:00.000Z',
    completedAt: '2026-11-07T02:00:00.000Z',
  };
  assert.equal(create(v).inputDigest, emptyHash);
  v.policyVersions.domainPolicyRef = 'domain-v2';
  assert.notEqual(create(v).inputDigest, emptyHash);
});

test('strict request owns its data and normalizes declared sets', () => {
  const v = request(),
    parsed = contract.parseCompilationCaptureRequest(v, control());
  v.repositoryIds[0] = 'foreign';
  assert.deepEqual(parsed.repositoryIds, ['r']);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.repositoryIds));
  for (const mutate of [
    (v) => (v.authorized = true),
    (v) => (v.scope.extra = true),
    (v) => v.repositoryIds.push('r'),
    (v) => (v.scope.repositoryId = 'foreign'),
    (v) =>
      v.selectedEntityRefs.push({
        ...ref('SOURCE_FILE', 'f'),
        entity: { kind: 'SOURCE_FILE', id: 'f' },
      }),
    (v) =>
      v.selectedDocumentRevisions.push(
        { documentId: 'd', documentRevisionId: 'd1' },
        { documentId: 'd', documentRevisionId: 'd2' },
      ),
  ]) {
    const value = request();
    mutate(value);
    bad(() => contract.parseCompilationCaptureRequest(value, control()));
  }
});

test('strict snapshots reject unknown wrappers, types, fields, versions and unmatched SHA', () => {
  for (const mutate of [
    (v) => (v.authorized = true),
    (v) => (v.repositories[0].coverage.extra = 1),
    (v) => (v.repositories[0].entities[0].value.extra = 1),
    (v) => (v.repositories[0].entities[0].valueSchemaRef = 'SourceFile@2'),
    (v) => (v.repositories[0].entities[0].ref.entity.kind = 'CLAIM'),
    (v) => (v.repositories[0].entities[0].value.classification.extra = 1),
    (v) => (v.captureWindow.completedAt = '2026-11-05T00:00:00.000Z'),
  ]) {
    const v = withSource();
    mutate(v);
    bad(() => create(v));
  }
  const result = structuredClone(create());
  result.inputDigest = zero;
  bad(() => contract.parseCompilationInputSnapshot(result, control()), 'INPUT_DIGEST_MISMATCH');
  bad(() => create({ ...snapshot(), inputDigest: zero }));
});

test('selected facts must be present with exact repository/revision/basis ownership', () => {
  for (const mutate of [
    (v) => (v.repositories[0].entities = []),
    (v) => (v.repositories[0].repoBasis.revisionId = 'other'),
    (v) => (v.repositories[0].entities[0].value.repositoryId = 'foreign'),
    (v) => (v.repositories[0].entities[0].ref.entity.id = 'wrong'),
    (v) => v.repositories.push(structuredClone(v.repositories[0])),
    (v) => (v.selection.repositoryIds = []),
    (v) => v.repositories[0].entities.push(structuredClone(v.repositories[0].entities[0])),
  ]) {
    const v = withSource();
    mutate(v);
    bad(() => create(v));
  }
  assert.equal(create(withSource()).repositories[0].entities.length, 1);
});

test('support original producer digest and new capture digest are independently verified', () => {
  assert.equal(
    create(addSourceSupport(withSource())).repositories[0].supports[0].capturedValueDigest,
    sourceHash,
  );
  for (const mutate of [
    (s) => (s.ref.valueDigest = zero),
    (s) => (s.capturedValueDigest = zero),
    (s) => (s.ref.basis.codeActivationDigest = 'a'.repeat(64)),
    (s) => (s.ref.entity.revisionId = 'wrong'),
    (s) => (s.value.path = 'other.java'),
    (s) => (s.valueSchemaRef = 'Evidence@1'),
  ]) {
    const v = addSourceSupport(withSource());
    mutate(v.repositories[0].supports[0]);
    bad(() => create(v));
  }
  const v = addSourceSupport(withSource());
  v.repositories[0].supports.push(structuredClone(v.repositories[0].supports[0]));
  bad(() => create(v));
});

test('canonical UTF-16 ordering preserves integer-looking keys and sequences', () => {
  assert.equal(
    contract.canonicalCompilationJson({ 2: 2, 10: 1, z: [2, 1], a: 'é' }, control()),
    '{"10":1,"2":2,"a":"é","z":[2,1]}',
  );
  assert.notEqual(
    contract.canonicalCompilationJson(['é'], control()),
    contract.canonicalCompilationJson(['e\u0301'], control()),
  );
});

test('data hazards refuse before getters/proxy traps and never normalize malformed Unicode', () => {
  let calls = 0;
  const getter = Object.defineProperty({}, 'x', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  const proxy = new Proxy(
    {},
    {
      ownKeys() {
        calls++;
        throw Error('trap');
      },
    },
  );
  const hidden = Object.defineProperty({}, 'x', { value: 1 });
  const sparse = Array(2),
    extra = [];
  extra.x = 1;
  const cycle = {};
  cycle.x = cycle;
  for (const value of [
    getter,
    proxy,
    hidden,
    sparse,
    extra,
    cycle,
    new Date(),
    undefined,
    1n,
    NaN,
    Infinity,
    -Infinity,
    -0,
    '\ud800',
    { '\udfff': 1 },
    { x: undefined },
    () => 1,
    { [Symbol('x')]: 1 },
  ])
    bad(() => contract.canonicalCompilationJson(value, control()));
  assert.equal(calls, 0);
  const shared = { x: 1 };
  assert.equal(contract.canonicalCompilationJson([shared, shared], control()), '[{"x":1},{"x":1}]');
});

test('explicit cooperative traversal budgets, depth, deadline and cancellation', () => {
  bad(() => create(snapshot(), control({ maxItems: 1 })), 'BUDGET_EXCEEDED');
  bad(() => create(snapshot(), control({ maxDepth: 1 })), 'BUDGET_EXCEEDED');
  bad(() => create(snapshot(), control({ deadlineEpochMs: 0 })), 'DEADLINE');
  const aborted = new AbortController();
  aborted.abort();
  bad(() => create(snapshot(), control({ signal: aborted.signal })), 'CANCELLED');
  for (const maxItems of [0, -1, -0, NaN, 1.5])
    bad(() => create(snapshot(), control({ maxItems })));
});

test('wrapper coverage sets normalize while embedded IR sequences remain significant', () => {
  const a = withSource(),
    b = withSource();
  a.coverage = { status: 'PARTIAL', limitations: ['z', 'a'], unverifiedRefs: [] };
  b.coverage = { status: 'PARTIAL', limitations: ['a', 'z'], unverifiedRefs: [] };
  assert.equal(create(a).inputDigest, create(b).inputDigest);
  b.coverage.limitations = ['a', 'a'];
  bad(() => create(b));
});

const confidence = () => ({ score: 1, method: 'fixture', reasons: ['literal'] });
const range = () => ({ sourceFileId: 'f', startLine: 0, startColumn: 0, endLine: 1, endColumn: 0 });
function syntaxCapture(version) {
  const v = addSourceSupport(withSource());
  const payload = {
    id: 'syntax',
    syntaxKey: 'syntax-key',
    repositoryId: 'r',
    revisionId: 'v',
    sourceFingerprint: source().contentFingerprint,
    sourceRange: range(),
    owner: null,
    supportRefs: [structuredClone(v.repositories[0].supports[0].ref)],
    confidence: confidence(),
    extractionVersion: 'fixture-v1',
    syntaxKind: 'ARTIFACT',
    payload: {
      mediaType: 'application/json',
      logicalPath: 'schema.json',
      contentDigest: 'digest',
      declaredValues: [
        { name: 'first', value: { kind: 'STRING', value: 'one' } },
        { name: 'second', value: { kind: 'STRING', value: 'two' } },
      ],
    },
  };
  if (version >= 2) payload.lexicalScope = null;
  if (version >= 3) payload.controlContext = 'UNKNOWN';
  if (version >= 4) payload.callbackScope = null;
  const item = {
    ref: ref('SYNTAX_EVIDENCE', 'syntax'),
    valueSchemaRef: `SyntaxEvidence@${version}`,
    value: { schema: 'codeatlas.syntax-evidence', version, payload },
  };
  v.repositories[0].entities.push(item);
  v.selection.selectedEntityRefs = [item.ref];
  return v;
}
for (const version of [1, 2, 3, 4])
  test(`Syntax${version} exact envelope, support closure and version isolation`, () => {
    const v = syntaxCapture(version);
    assert.equal(create(v).repositories[0].entities.length, 2);
    for (const mutate of [
      (v) => (v.repositories[0].supports = []),
      (v) => (v.repositories[0].entities[1].value.version = version + 1),
      (v) => (v.repositories[0].entities[1].value.extra = 1),
      (v) => (v.repositories[0].entities[1].value.payload.payload.extra = 1),
      (v) => (v.repositories[0].entities[1].value.payload.sourceRange.sourceFileId = 'missing'),
    ]) {
      const value = structuredClone(v);
      mutate(value);
      bad(() => create(value));
    }
  });

test('nested Syntax sequence permutations change digest while wrapper permutations do not', () => {
  const a = syntaxCapture(4),
    b = syntaxCapture(4);
  b.repositories[0].entities.reverse();
  assert.equal(create(a).inputDigest, create(b).inputDigest);
  b.repositories[0].entities[0].value.payload.payload.declaredValues.reverse();
  assert.notEqual(create(a).inputDigest, create(b).inputDigest);
});

function documentCapture() {
  const v = snapshot(),
    documentBasis = {
      documentId: 'd',
      documentRevisionId: 'd1',
      contentFingerprint: `sha256:${zero}`,
    };
  const docRef = (kind, id) => ({
    scope: 'WORKSPACE',
    workspaceId: 'w',
    entity: { kind, id, revisionId: 'd1' },
  });
  const blockRef = { kind: 'DOCUMENT_BLOCK', id: 'block', revisionId: 'd1' };
  const d = {
    documentBasis,
    parserVersion: 'parser-v1',
    policyVersion: 'document-policy-v1',
    supports: [],
    coverage: coverage(),
    entities: [
      {
        ref: docRef('DOCUMENT', 'd'),
        valueSchemaRef: 'Document@1',
        value: {
          id: 'd',
          workspaceId: 'w',
          repositoryId: null,
          logicalPath: 'note.md',
          mediaType: 'text/markdown',
          sourceKind: 'MARKDOWN',
          currentRevisionId: null,
        },
      },
      {
        ref: docRef('DOCUMENT_REVISION', 'd1'),
        valueSchemaRef: 'DocumentRevision@1',
        value: {
          id: 'd1',
          documentId: 'd',
          sourceFingerprint: documentBasis.contentFingerprint,
          parserVersion: 'parser-v1',
          policyVersion: 'document-policy-v1',
          sourceBasis: documentBasis,
          blockRefs: [blockRef],
          diagnostics: [],
          completeness: 'COMPLETE',
        },
      },
      {
        ref: docRef('DOCUMENT_BLOCK', 'block'),
        valueSchemaRef: 'DocumentBlock@1',
        value: {
          id: 'block',
          documentRevisionId: 'd1',
          sectionId: null,
          ordinal: 0,
          sourceRange: {
            documentRevisionId: 'd1',
            startLine: 0,
            startColumn: 0,
            endLine: 1,
            endColumn: 0,
          },
          kind: 'PARAGRAPH',
          payload: { text: 'pure fixture; no permission claim' },
        },
      },
    ],
  };
  v.documents.push(d);
  v.selection.selectedDocumentRevisions.push({ documentId: 'd', documentRevisionId: 'd1' });
  return v;
}

test('DocumentCapture keeps exact immutable revision, complete structural closure and no Runtime prerequisite', () => {
  const v = documentCapture();
  assert.equal(create(v).documents[0].entities.length, 3);
  assert.equal(create(v).workspaceCapture, null);
  for (const mutate of [
    (v) => v.documents[0].entities.pop(),
    (v) => (v.documents[0].parserVersion = 'wrong'),
    (v) => (v.documents[0].documentBasis.contentFingerprint = 'different'),
    (v) => (v.documents[0].entities[2].value.documentRevisionId = 'wrong'),
    (v) => (v.documents[0].entities[1].value.completeness = 'PARTIAL'),
    (v) => (v.documents[0].entities[0].value.workspaceId = 'foreign'),
    (v) => (v.documents[0].entities[0].value.currentRevisionId = 'new-head'),
  ]) {
    const value = structuredClone(v);
    mutate(value);
    bad(() => create(value));
  }
});

test('closed workspace Service uses structural repository owner metadata without admitting new entity kinds', () => {
  const v = addSourceSupport(withSource()),
    supportRef = structuredClone(v.repositories[0].supports[0].ref);
  const serviceRef = {
    scope: 'WORKSPACE',
    workspaceId: 'w',
    entity: { kind: 'SERVICE', id: 'svc', revisionId: 'rs' },
  };
  v.selection.selectedEntityRefs = [serviceRef];
  v.workspaceCapture = {
    workspaceBasis: { workspaceId: 'w', revisionSetId: 'rs', workspaceActivationDigest: zero },
    coverage: coverage(),
    supports: [],
    entities: [
      {
        ref: serviceRef,
        valueSchemaRef: 'Service@1',
        value: {
          id: 'svc',
          factKey: 'svc-key',
          logicalServiceKey: 'service',
          location: 'WORKSPACE',
          repositoryRef: { ...ref('REPOSITORY', 'r') },
          supportRefs: [supportRef],
        },
      },
    ],
  };
  assert.equal(create(v).workspaceCapture.entities.length, 1);
  for (const mutate of [
    (v) => (v.workspaceCapture = null),
    (v) => (v.workspaceCapture.workspaceBasis.revisionSetId = 'wrong'),
    (v) => (v.workspaceCapture.entities[0].value.repositoryRef.entity.id = 'foreign'),
    (v) => (v.workspaceCapture.entities[0].value.repositoryRef.entity.revisionId = 'wrong'),
    (v) => v.selection.selectedEntityRefs.push(ref('REPOSITORY', 'r')),
  ]) {
    const value = structuredClone(v);
    mutate(value);
    bad(() => create(value));
  }
});

test('selection closure helper removes unrelated inventory and retains exact explicit selection', () => {
  const v = withSource();
  v.repositories[0].entities.push({
    ref: ref('SOURCE_FILE', 'extra'),
    valueSchemaRef: 'SourceFile@1',
    value: { ...source(), id: 'extra', path: 'extra.java' },
  });
  bad(() => create(v), 'UNSELECTED_CAPTURE_VALUE');
  const selected = contract.selectCompilationCaptureClosure(v, control());
  assert.deepEqual(selected.selection, v.selection);
  assert.deepEqual(
    selected.repositories[0].entities.map((e) => e.ref.entity.id),
    ['f'],
  );
  assert.equal(selected.inputDigest, create(withSource()).inputDigest);
  assert.equal(v.repositories[0].entities.length, 2);
  assert.equal(
    contract.selectCompilationCaptureClosure(syntaxCapture(4), control()).repositories[0].entities
      .length,
    2,
  );
  const doc = documentCapture();
  doc.selection.selectedDocumentRevisions = [];
  doc.selection.selectedEntityRefs = [structuredClone(doc.documents[0].entities[2].ref)];
  assert.equal(
    contract.selectCompilationCaptureClosure(doc, control()).documents[0].entities.length,
    3,
  );
});

test('retained unsupported owner recipe is explicitly unavailable; a capture digest never substitutes', () => {
  const v = documentCapture(),
    entity = v.documents[0].entities[2];
  v.documents[0].supports.push({
    ref: { basis: v.documents[0].documentBasis, entity: entity.ref.entity, valueDigest: zero },
    valueSchemaRef: entity.valueSchemaRef,
    value: entity.value,
    capturedValueDigest: contract.compilationCaptureValueDigest(
      entity.valueSchemaRef,
      entity.value,
      control(),
    ),
  });
  bad(() => create(v), 'SUPPORT_RECIPE_UNAVAILABLE');
});

function codeCapture() {
  const v = withSource();
  const n = {
    id: 'node',
    factKey: 'node-key',
    repositoryId: 'r',
    revisionId: 'v',
    name: 'run',
    qualifiedName: 'A.run',
    sourceRange: range(),
    confidence: confidence(),
    kind: 'SYMBOL',
    symbolKind: 'METHOD',
  };
  const edge = {
    id: 'edge',
    factKey: 'edge-key',
    repositoryId: 'r',
    revisionId: 'v',
    kind: 'CALL',
    source: { factType: 'NODE', id: 'node' },
    target: { state: 'RESOLVED', resolution: 'EXACT', target: { factType: 'NODE', id: 'node' } },
    sourceRange: range(),
    confidence: confidence(),
  };
  v.repositories[0].entities.push(
    { ref: ref('CODE_NODE', 'node'), valueSchemaRef: 'CanonicalNode@1', value: n },
    { ref: ref('CODE_EDGE', 'edge'), valueSchemaRef: 'CanonicalEdge@1', value: edge },
  );
  v.selection.selectedEntityRefs = [ref('CODE_EDGE', 'edge')];
  return v;
}

test('Code resolved and candidate targets and SourceRange form exact closure', () => {
  assert.equal(create(codeCapture()).repositories[0].entities.length, 3);
  for (const mutate of [
    (v) => v.repositories[0].entities.splice(1, 1),
    (v) => (v.repositories[0].entities[2].value.target.target.id = 'missing'),
    (v) => (v.repositories[0].entities[2].value.source.id = 'missing'),
    (v) => (v.repositories[0].entities[1].value.sourceRange.sourceFileId = 'missing'),
  ]) {
    const v = codeCapture();
    mutate(v);
    bad(() => create(v));
  }
});

test('conflicting support digest or duplicate fact identity cannot hide in support-only inventory', () => {
  const v = addSourceSupport(withSource()),
    s = structuredClone(v.repositories[0].supports[0]);
  s.ref.valueDigest = 'a'.repeat(64);
  v.repositories[0].supports.push(s);
  bad(() => create(v));
  const c = codeCapture(),
    second = structuredClone(c.repositories[0].entities[1]);
  second.ref.entity.id = 'node-two';
  second.value.id = 'node-two';
  c.repositories[0].entities.push(second);
  bad(() => create(c));
});

test('schema literal whitelist covers each declared entity adapter, rejecting extra fields and unsupported kinds', () => {
  const sourceRef = addSourceSupport(withSource()).repositories[0].supports[0].ref;
  const base = {
    id: 'entity',
    factKey: 'fact-key',
    repositoryId: 'r',
    revisionId: 'v',
    basis: basis(),
    sourceRange: range(),
    supportRefs: [sourceRef],
    confidence: confidence(),
    resolution: 'EXACT',
  };
  const workspaceBasis = { workspaceId: 'w', revisionSetId: 'rs', workspaceActivationDigest: zero };
  const wsref = (kind, id = 'entity') => ({
    scope: 'WORKSPACE',
    workspaceId: 'w',
    entity: { kind, id, revisionId: 'rs' },
  });
  const drange = {
    documentRevisionId: 'd1',
    startLine: 0,
    startColumn: 0,
    endLine: 1,
    endColumn: 0,
  };
  const linked = {
    id: 'entity',
    documentRevisionId: 'd1',
    blockRef: { kind: 'DOCUMENT_BLOCK', id: 'b', revisionId: 'd1' },
    sourceRange: drange,
  };
  const cases = {
    'SourceFile@1': source(),
    'CanonicalNode@1': codeCapture().repositories[0].entities[1].value,
    'CanonicalEdge@1': codeCapture().repositories[0].entities[2].value,
    'Evidence@1': {
      id: 'evidence',
      repositoryId: 'r',
      revisionId: 'v',
      providerSnapshotId: 'ps',
      providerFact: { factType: 'NODE', providerId: 'native', providerFactId: 'pf' },
      status: 'ACTIVE',
    },
    'EntryPoint@1': {
      ...base,
      triggerKind: 'HTTP',
      ownerRef: ref('CODE_NODE', 'node'),
      contextKind: 'REQUEST',
      contractRef: null,
      taskRef: null,
    },
    'TaskDefinition@1': {
      ...base,
      taskKind: 'TASK',
      implementationRef: ref('CODE_NODE', 'node'),
      triggerRef: null,
    },
    'DataResource@1': {
      ...base,
      resourceKind: 'database',
      logicalName: null,
      namespace: null,
      schemaRef: null,
    },
    'DataChangeTrigger@1': {
      ...base,
      resourceRef: ref('DATA_RESOURCE', 'resource'),
      operation: 'INSERT',
      handlerRef: ref('CODE_NODE', 'node'),
    },
    'Contract@1': {
      ...base,
      direction: 'PROVIDER',
      protocol: 'HTTP',
      serviceRef: null,
      signature: {
        kind: 'HTTP',
        method: 'GET',
        pathSegments: [],
        querySchemaRef: null,
        requestSchemaRef: null,
        responseSchemaRef: null,
        serviceHint: null,
      },
      implementationRef: null,
    },
    'ExecutionContext@1': {
      ...base,
      kind: 'REQUEST',
      entryRef: ref('ENTRY_POINT', 'entry'),
      parentContextRef: null,
    },
    'ExecutionNode@1': {
      ...base,
      contextRef: ref('EXECUTION_CONTEXT', 'context'),
      kind: 'ENTRY',
      targetRef: ref('CODE_NODE', 'node'),
    },
    'ExecutionEdge@1': {
      ...base,
      contextRef: ref('EXECUTION_CONTEXT', 'context'),
      sourceRef: ref('EXECUTION_NODE', 'node'),
      target: { state: 'NON_RESOLVED', resolution: 'UNRESOLVED', hint: null, candidates: [] },
      transitionKind: 'CALL',
      guard: null,
      boundaryRef: null,
    },
    'RuntimeFlow@1': {
      ...base,
      entryRef: ref('ENTRY_POINT', 'entry'),
      derivationVersion: 'v1',
      contexts: [ref('EXECUTION_CONTEXT', 'context')],
      steps: [
        {
          stepKey: 's',
          ordinal: 0,
          contextRef: ref('EXECUTION_CONTEXT', 'context'),
          executionNodeRefs: [ref('EXECUTION_NODE', 'n')],
          incomingEdgeRefs: [],
          outgoingStepKeys: [],
          supportRefs: [sourceRef],
        },
      ],
      branches: [],
      boundaries: [],
      coverage: coverage(),
    },
    'FrameworkBinding@1': {
      ...base,
      ownerRef: ref('CODE_NODE', 'node'),
      kind: 'DEPENDENCY',
      dependencyRef: ref('CODE_NODE', 'other'),
    },
    'Service@1': {
      id: 'entity',
      factKey: 'fact-key',
      logicalServiceKey: 'svc',
      location: 'KNOWN_EXTERNAL',
      repositoryRef: null,
      supportRefs: [sourceRef],
    },
    'ServiceIdentity@1': {
      id: 'entity',
      factKey: 'fact-key',
      serviceRef: wsref('SERVICE'),
      sourceBasis: basis(),
      identityKind: 'LOGICAL_SERVICE',
      namespace: 'ns',
      key: 'key',
      supportRefs: [sourceRef],
    },
    'ContractMatch@1': {
      id: 'entity',
      factKey: 'fact-key',
      workspaceBasis,
      consumerRef: ref('CONTRACT', 'c'),
      status: 'UNRESOLVED',
      candidateProviderRefs: [],
      selectedProviderRef: null,
      reasons: ['unresolved'],
      supportRefs: [sourceRef],
      basisRefs: [basis()],
      confidence: confidence(),
    },
    'WorkspaceExecutionNode@1': {
      id: 'entity',
      factKey: 'fact-key',
      repositoryRuntimeRef: ref('EXECUTION_NODE', 'n'),
    },
    'WorkspaceExecutionEdge@1': {
      id: 'entity',
      factKey: 'fact-key',
      sourceRef: wsref('WORKSPACE_EXECUTION_NODE', 'a'),
      targetRef: wsref('WORKSPACE_EXECUTION_NODE', 'b'),
      matchRef: wsref('CONTRACT_MATCH'),
      transitionKind: 'HTTP',
      supportRefs: [sourceRef],
      confidence: confidence(),
    },
    'Document@1': documentCapture().documents[0].entities[0].value,
    'DocumentRevision@1': documentCapture().documents[0].entities[1].value,
    'DocumentSection@1': {
      id: 'entity',
      documentRevisionId: 'd1',
      parentSectionId: null,
      headingLevel: 1,
      title: 'Heading',
      ordinal: 0,
      sourceRange: drange,
    },
    'DocumentBlock@1': documentCapture().documents[0].entities[2].value,
    'DocumentTable@1': { ...linked, typedContent: { headers: ['one'], rows: [['two']] } },
    'DocumentLink@1': {
      ...linked,
      typedContent: {
        label: 'label',
        target: 'target',
        resolution: 'EXTERNAL',
        targetRef: null,
        candidates: [],
      },
    },
    'DocumentCodeSnippet@1': { ...linked, typedContent: { language: null, textDigest: zero } },
    'DocumentEntityMention@1': {
      id: 'entity',
      documentRevisionId: 'd1',
      blockRef: linked.blockRef,
      textRange: drange,
      resolution: 'UNRESOLVED',
      candidateRefs: [],
    },
    'DocumentChunk@1': {
      id: 'entity',
      documentRevisionId: 'd1',
      blockRefs: [linked.blockRef],
      contentDigest: zero,
      ordinal: 0,
    },
  };
  for (const version of [1, 2, 3, 4])
    cases[`SyntaxEvidence@${version}`] = syntaxCapture(version).repositories[0].entities[1].value;
  assert.equal(Object.keys(cases).length, 32);
  for (const [tag, value] of Object.entries(cases)) {
    assert.match(
      contract.compilationCaptureValueDigest(tag, value, control()),
      /^[0-9a-f]{64}$/,
      tag,
    );
    bad(() =>
      contract.compilationCaptureValueDigest(tag, { ...value, unexpected: true }, control()),
    );
  }
  for (const tag of [
    'Claim@1',
    'KnowledgeRevision@1',
    'SourceBytes@1',
    'SourceSchemaDocument@1',
    'RuntimeDerivation@2',
    '__proto__',
  ])
    bad(() => contract.compilationCaptureValueDigest(tag, {}, control()));
});

function runtimeCapture() {
  const v = addSourceSupport(codeCapture());
  v.repositories[0].entities.pop();
  const base = {
    repositoryId: 'r',
    revisionId: 'v',
    basis: basis(),
    sourceRange: range(),
    supportRefs: [structuredClone(v.repositories[0].supports[0].ref)],
    confidence: confidence(),
    resolution: 'EXACT',
  };
  const add = (tag, kind, id, extra) =>
    v.repositories[0].entities.push({
      ref: ref(kind, id),
      valueSchemaRef: tag,
      value: { ...base, id, factKey: `${id}-key`, ...extra },
    });
  add('EntryPoint@1', 'ENTRY_POINT', 'entry', {
    triggerKind: 'HTTP',
    ownerRef: ref('CODE_NODE', 'node'),
    contextKind: 'REQUEST',
    contractRef: null,
    taskRef: null,
  });
  add('ExecutionContext@1', 'EXECUTION_CONTEXT', 'context', {
    kind: 'REQUEST',
    entryRef: ref('ENTRY_POINT', 'entry'),
    parentContextRef: null,
  });
  add('ExecutionNode@1', 'EXECUTION_NODE', 'exec-node', {
    kind: 'ENTRY',
    contextRef: ref('EXECUTION_CONTEXT', 'context'),
    targetRef: ref('CODE_NODE', 'node'),
  });
  add('RuntimeFlow@1', 'RUNTIME_FLOW', 'flow', {
    entryRef: ref('ENTRY_POINT', 'entry'),
    derivationVersion: 'fixture-v1',
    contexts: [ref('EXECUTION_CONTEXT', 'context')],
    steps: [
      {
        stepKey: 'first',
        ordinal: 0,
        contextRef: ref('EXECUTION_CONTEXT', 'context'),
        executionNodeRefs: [ref('EXECUTION_NODE', 'exec-node')],
        incomingEdgeRefs: [],
        outgoingStepKeys: [],
        supportRefs: base.supportRefs,
      },
    ],
    branches: [],
    boundaries: [],
    coverage: coverage(),
  });
  v.repositories[0].runtimeActivationDigest = zero;
  v.selection.selectedEntityRefs = [ref('RUNTIME_FLOW', 'flow')];
  return v;
}

test('Runtime collection closure requires exact basis, activation digest, context and step membership', () => {
  const v = runtimeCapture();
  assert.equal(create(v).repositories[0].entities.length, 6);
  for (const mutate of [
    (v) => (v.repositories[0].runtimeActivationDigest = null),
    (v) =>
      (v.repositories[0].entities.find(
        (e) => e.ref.entity.kind === 'ENTRY_POINT',
      ).value.basis.codeActivationDigest = 'b'.repeat(64)),
    (v) =>
      (v.repositories[0].entities.find(
        (e) => e.ref.entity.kind === 'RUNTIME_FLOW',
      ).value.steps[0].outgoingStepKeys = ['missing']),
    (v) =>
      (v.repositories[0].entities.find(
        (e) => e.ref.entity.kind === 'EXECUTION_CONTEXT',
      ).value.entryRef.entity.kind = 'CONTRACT'),
  ]) {
    const value = structuredClone(v);
    mutate(value);
    bad(() => create(value));
  }
});

test('every Syntax version binds sourceFingerprint to its captured file value', () => {
  for (const version of [1, 2, 3, 4]) {
    const v = syntaxCapture(version);
    v.repositories[0].entities[1].value.payload.sourceFingerprint = 'different';
    bad(() => create(v));
  }
});

test('support-only Canonical facts keep collection identity uniqueness', () => {
  const v = codeCapture(),
    node = v.repositories[0].entities.splice(1, 1)[0];
  function sup(id) {
    const value = { ...node.value, id };
    const bytes =
      '{"confidence":{"method":"fixture","reasons":["literal"],"score":1},"factKey":"node-key","id":"' +
      id +
      '","kind":"SYMBOL","name":"run","qualifiedName":"A.run","repositoryId":"r","revisionId":"v","sourceRange":{"endColumn":0,"endLine":1,"sourceFileId":"f","startColumn":0,"startLine":0},"symbolKind":"METHOD"}';
    return {
      ref: {
        basis: basis(),
        entity: ref('CODE_NODE', id).entity,
        valueDigest: createHash('sha256')
          .update('codeatlas-phase1-support-value-v1\0' + bytes)
          .digest('hex'),
      },
      valueSchemaRef: 'CanonicalNode@1',
      value,
      capturedValueDigest: contract.compilationCaptureValueDigest(
        'CanonicalNode@1',
        value,
        control(),
      ),
    };
  }
  v.repositories[0].supports.push(sup('node'));
  assert.equal(create(v).repositories[0].supports.length, 1);
  v.repositories[0].supports.push(sup('other-node'));
  v.repositories[0].entities[1].value.target.target.id = 'other-node';
  bad(() => create(v));
});

test('Runtime Contract can retain a workspace Service in the structural reference context', () => {
  const v = runtimeCapture(),
    entry = v.repositories[0].entities.find((e) => e.ref.entity.kind === 'ENTRY_POINT');
  const serviceRef = {
    scope: 'WORKSPACE',
    workspaceId: 'w',
    entity: { kind: 'SERVICE', id: 'svc', revisionId: 'rs' },
  };
  const sourceSupport = structuredClone(v.repositories[0].supports[0].ref);
  v.workspaceCapture = {
    workspaceBasis: { workspaceId: 'w', revisionSetId: 'rs', workspaceActivationDigest: zero },
    supports: [],
    coverage: coverage(),
    entities: [
      {
        ref: serviceRef,
        valueSchemaRef: 'Service@1',
        value: {
          id: 'svc',
          factKey: 'svc-key',
          logicalServiceKey: 'service',
          location: 'KNOWN_EXTERNAL',
          repositoryRef: null,
          supportRefs: [sourceSupport],
        },
      },
    ],
  };
  v.repositories[0].entities.push({
    ref: ref('CONTRACT', 'contract'),
    valueSchemaRef: 'Contract@1',
    value: {
      ...entry.value,
      id: 'contract',
      factKey: 'contract-key',
      direction: 'PROVIDER',
      protocol: 'HTTP',
      serviceRef,
      signature: {
        kind: 'HTTP',
        method: 'GET',
        pathSegments: [],
        querySchemaRef: null,
        requestSchemaRef: null,
        responseSchemaRef: null,
        serviceHint: null,
      },
      implementationRef: ref('CODE_NODE', 'node'),
    },
  });
  const c = v.repositories[0].entities.at(-1).value;
  for (const k of ['triggerKind', 'ownerRef', 'contextKind', 'contractRef', 'taskRef']) delete c[k];
  entry.value.contractRef = ref('CONTRACT', 'contract');
  assert.equal(create(v).workspaceCapture.entities.length, 1);
});

test('control snapshot refuses accessors/proxies and intrinsic cancellation cannot be shadowed', () => {
  let calls = 0;
  const accessor = control();
  Object.defineProperty(accessor, 'maxItems', {
    enumerable: true,
    get() {
      calls++;
      return 100000;
    },
  });
  bad(() => create(snapshot(), accessor), 'INVALID_REQUEST_CONTROL');
  const proxy = new Proxy(control(), {
    get() {
      calls++;
      throw Error('trap');
    },
  });
  bad(() => create(snapshot(), proxy), 'INVALID_REQUEST_CONTROL');
  const signal = new Proxy(new AbortController().signal, {
    get() {
      calls++;
      throw Error('trap');
    },
  });
  bad(() => create(snapshot(), control({ signal })), 'INVALID_REQUEST_CONTROL');
  const aborted = new AbortController();
  aborted.abort();
  Object.defineProperty(aborted.signal, 'aborted', {
    get() {
      calls++;
      return false;
    },
  });
  bad(() => create(snapshot(), control({ signal: aborted.signal })), 'CANCELLED');
  assert.equal(calls, 0);
});

test('logical budgets charge long scalar/key text and are not physical RSS reservations', () => {
  bad(
    () => contract.canonicalCompilationJson('a'.repeat(1000), control({ maxItems: 50 })),
    'BUDGET_EXCEEDED',
  );
  bad(
    () => contract.canonicalCompilationJson({ ['a'.repeat(1000)]: 1 }, control({ maxItems: 50 })),
    'BUDGET_EXCEEDED',
  );
});
