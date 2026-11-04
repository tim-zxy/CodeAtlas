import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  cases,
  loadMappingCase,
  sha,
} from '../fixtures/phase1/syntax-mapping-preparation/corpus.mjs';
import {
  SourceFileSchema,
  ProviderNodeRefSchema,
  ScopedRefSchema,
  SyntaxEvidenceSchema,
} from '../packages/ir/dist/index.js';
import { NativeSyntaxObservationSchema } from '../packages/providers/dist/native-syntax-ipc.js';
import { historyDraftDigest } from '../packages/providers/dist/history-transition-input.js';
import { digestIdentityTuple } from '../packages/providers/dist/identity-tuple.js';
import { limits } from '../packages/providers/test/fixtures/history-transition-helpers.mjs';
import { discoverFixtures, parseFixtureManifest } from '../packages/evaluation/dist/index.js';
const root = new URL('../fixtures/phase1/syntax-mapping-preparation/', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const equal = assert.deepEqual;
const compactRef = (r) => ({ kind: 'CODE_NODE', id: r.entity.id });
const digest = (v) => historyDraftDigest(v, limits, { items: 0, serializedBytes: 0 });
function verify({ metadata: m, input: i, expected: e }) {
  if (i.kind === 'IDENTITY_ENCODING_INPUT') return;
  equal(
    Object.keys(i).sort(),
    [
      'kind',
      'repositoryId',
      'revisionId',
      'providerId',
      'sourceFile',
      'raw',
      'selectedNodes',
      'bindings',
      'extractorVersion',
      'mapperVersion',
      'annotation',
    ].sort(),
  );
  SourceFileSchema.parse(i.sourceFile);
  NativeSyntaxObservationSchema.parse(i.raw);
  const failures = [];
  const record = (ok, c) => {
    if (!ok) failures.push(c);
  };
  record(i.raw.sourceFileId === i.sourceFile.id, 'SOURCE_ID_MISMATCH');
  record(
    i.raw.sourceFingerprint === i.sourceFile.contentFingerprint,
    'SOURCE_FINGERPRINT_MISMATCH',
  );
  record(i.raw.sourceRange.sourceFileId === i.sourceFile.id, 'SOURCE_RANGE_MISMATCH');
  assert.equal(i.sourceFile.repositoryId, i.repositoryId);
  assert.equal(i.sourceFile.revisionId, i.revisionId);
  assert.equal(
    sha(readFileSync(new URL(i.sourceFile.path, root))),
    i.sourceFile.contentFingerprint,
  );
  assert.equal(i.annotation.sourcePath, i.sourceFile.path);
  assert.equal(
    readFileSync(new URL(i.annotation.sourcePath, root), 'utf8').split(/\r?\n/)[i.annotation.line],
    i.annotation.literal,
  );
  assert.match(i.annotation.coordinateConvention, /^0-based lines, 0-based UTF8 byte columns/);
  for (const r of i.annotation.ranges) {
    if (r.status === 'INTENTIONALLY_FOREIGN') {
      assert.notEqual(r.sourceRange.sourceFileId, i.sourceFile.id);
      assert.equal(r.slice, null);
      continue;
    }
    const lines = readFileSync(new URL(i.annotation.sourcePath, root), 'utf8').split(/\r?\n/),
      sr = r.sourceRange;
    assert.equal(sr.startLine, sr.endLine);
    const line = Buffer.from(lines[sr.startLine]);
    assert.ok(sr.endColumn <= line.length);
    assert.equal(line.subarray(sr.startColumn, sr.endColumn).toString('utf8'), r.slice);
  }
  const selected = new Map(
    i.selectedNodes.map((n) => {
      ScopedRefSchema.parse(n.ref);
      return [n.ref.entity.id, n.ref];
    }),
  );
  const bindings = new Map(
    i.bindings.map((b) => {
      ProviderNodeRefSchema.parse(b.providerNodeRef);
      ScopedRefSchema.parse(b.canonicalRef);
      return [JSON.stringify(b.providerNodeRef), b.canonicalRef];
    }),
  );
  const required = new Map([
    [JSON.stringify({ kind: 'SOURCE_FILE', id: i.sourceFile.id, revisionId: i.revisionId }), true],
  ]);
  function ref(r, owner = false) {
    ProviderNodeRefSchema.parse(r);
    assert.equal(r.providerId, i.providerId);
    const c = bindings.get(JSON.stringify(r));
    record(!!c, 'MISSING_BINDING');
    if (!c) return null;
    record(
      c.repositoryId === i.repositoryId && c.entity.revisionId === i.revisionId,
      owner ? 'OWNER_SCOPE_MISMATCH' : 'REFERENCE_SCOPE_MISMATCH',
    );
    record(selected.has(c.entity.id), owner ? 'OWNER_NOT_SELECTED' : 'REFERENCE_NOT_SELECTED');
    required.set(JSON.stringify(c.entity), true);
    return c;
  }
  const owner = i.raw.owner ? ref(i.raw.owner, true) : null;
  const rawTargets = [];
  function scan(v) {
    if (!v || typeof v !== 'object') return;
    if (v.state === 'RESOLVED' && v.target?.factType === 'NODE') rawTargets.push(v);
    else if (v.state === 'UNRESOLVED' && v.originalHint !== undefined) rawTargets.push(v);
    else
      for (const x of Object.values(v))
        if (Array.isArray(x)) x.forEach(scan);
        else scan(x);
  }
  scan(i.raw.payload);
  for (const t of rawTargets)
    for (const r of t.state === 'RESOLVED' ? [t.target] : t.candidates) ref(r);
  function candidates(t) {
    const rs = (t.state === 'RESOLVED' ? [t.target] : t.candidates)
      .map((r) => bindings.get(JSON.stringify(r)))
      .filter(Boolean);
    return [...new Map(rs.map((r) => [JSON.stringify(r), r])).values()].sort((a, b) =>
      a.entity.id < b.entity.id ? -1 : a.entity.id > b.entity.id ? 1 : 0,
    );
  }
  // Only REFERENCE values (not Callee) require at least two after coalescing.
  function valueAmbiguity(v) {
    if (!v || typeof v !== 'object') return;
    if (v.kind === 'REFERENCE' && v.target.resolution === 'AMBIGUOUS')
      record(candidates(v.target).length >= 2, 'INCOMPATIBLE_CONTRACT');
    for (const x of Object.values(v))
      if (Array.isArray(x)) x.forEach(valueAmbiguity);
      else valueAmbiguity(x);
  }
  valueAmbiguity(i.raw.payload);
  equal(
    Object.keys(e).sort(),
    (e.kind === 'MAPPING_REJECTION_EXPECTATION'
      ? ['kind', 'semanticDisposition', 'causeCode', 'canonicalEnvelope']
      : [
          'kind',
          'semanticDisposition',
          'projection',
          'requiredEntities',
          'keyMeaning',
          'admission',
          'canonicalEnvelope',
          'keyCanonicalText',
          'payloadDigest',
          'syntaxKey',
        ]
    ).sort(),
  );
  assert.equal(e.canonicalEnvelope, null);
  if (e.kind === 'MAPPING_REJECTION_EXPECTATION') {
    equal(failures, [e.causeCode]);
    assert.equal(e.semanticDisposition, 'REJECTED');
    return;
  }
  equal(failures, []);
  assert.equal(e.kind, 'MAPPING_PROJECTION_EXPECTATION');
  assert.equal(e.admission, 'BLOCKED_POLICY');
  assert.equal(e.semanticDisposition, 'PROJECTABLE_WITHOUT_POLICY');
  const p = e.projection,
    k = e.keyMeaning;
  equal(
    Object.keys(p).sort(),
    [
      'repositoryId',
      'revisionId',
      'sourceFileId',
      'sourceFingerprint',
      'sourceRange',
      'syntaxKind',
      'owner',
      'payload',
    ].sort(),
  );
  for (const f of ['repositoryId', 'revisionId']) assert.equal(p[f], i[f]);
  for (const f of ['sourceFileId', 'sourceFingerprint', 'sourceRange', 'syntaxKind'])
    equal(p[f], i.raw[f]);
  equal(p.owner, owner);
  equal(k.owner, owner ? compactRef(owner) : null);
  const member = SyntaxEvidenceSchema.options.find(
    (s) => s.shape.syntaxKind.value === p.syntaxKind,
  );
  member.shape.payload.parse(p.payload);
  equal(e.requiredEntities.map((x) => JSON.stringify(x)).sort(), [...required.keys()].sort());
  function target(t, actual, meaning, callee = false) {
    const refs = candidates(t);
    if (callee) {
      assert.equal(actual.state, t.state === 'RESOLVED' ? 'RESOLVED' : 'NON_RESOLVED');
      equal(actual.target, t.state === 'RESOLVED' ? refs[0] : null);
      equal(actual.candidates, t.state === 'RESOLVED' ? [] : refs);
      equal(meaning, {
        ...actual,
        target: actual.target ? compactRef(actual.target) : null,
        candidates: actual.candidates.map(compactRef),
      });
    } else {
      assert.equal(actual.resolution, t.resolution);
      equal(actual.candidates, refs);
      equal(meaning, { ...actual, candidates: refs.map(compactRef) });
    }
  }
  function value(raw, actual, meaning) {
    assert.equal(actual.kind, raw.kind);
    if (raw.kind === 'REFERENCE') {
      assert.equal(actual.name, raw.name);
      target(raw.target, actual, meaning);
    } else if (raw.kind === 'ARRAY') {
      assert.equal(actual.items.length, raw.items.length);
      assert.equal(meaning.items.length, raw.items.length);
      for (let n = 0; n < raw.items.length; n++)
        value(raw.items[n], actual.items[n], meaning.items[n]);
    } else if (raw.kind === 'OBJECT') {
      assert.equal(actual.entries.length, raw.entries.length);
      assert.equal(meaning.entries.length, raw.entries.length);
      raw.entries.forEach((x, n) => {
        assert.equal(actual.entries[n].name, x.name);
        assert.equal(meaning.entries[n].name, x.name);
        value(x.value, actual.entries[n].value, meaning.entries[n].value);
      });
    } else {
      equal(actual, raw);
      equal(meaning, raw);
    }
  }
  const r = i.raw.payload,
    a = p.payload,
    b = k.payload;
  if (r.callee) {
    assert.equal(a.callee.name, r.callee.name);
    target(r.callee.target, a.callee, b.callee, true);
    assert.equal(a.arguments.length, r.arguments.length);
    assert.equal(b.arguments.length, r.arguments.length);
    r.arguments.forEach((x, n) => {
      assert.equal(a.arguments[n].name, x.name);
      assert.equal(b.arguments[n].name, x.name);
      equal(a.arguments[n].sourceRange, x.sourceRange);
      equal(b.arguments[n].sourceRange, x.sourceRange);
      value(x.value, a.arguments[n].value, b.arguments[n].value);
    });
    if (i.raw.syntaxKind === 'INVOCATION') {
      if (r.receiver === null) {
        equal(a.receiver, null);
        equal(b.receiver, null);
      } else value(r.receiver, a.receiver, b.receiver);
    }
  } else if (i.raw.syntaxKind === 'DECLARATION') {
    equal(a, r);
    equal(b, r);
  } else if (i.raw.syntaxKind === 'ASSIGNMENT') {
    assert.equal(a.targetName, r.targetName);
    assert.equal(b.targetName, r.targetName);
    value(r.value, a.value, b.value);
  } else {
    for (const f of ['mediaType', 'logicalPath', 'contentDigest']) {
      equal(a[f], r[f]);
      equal(b[f], r[f]);
    }
    assert.equal(a.declaredValues.length, r.declaredValues.length);
    r.declaredValues.forEach((x, n) => {
      assert.equal(a.declaredValues[n].name, x.name);
      assert.equal(b.declaredValues[n].name, x.name);
      value(x.value, a.declaredValues[n].value, b.declaredValues[n].value);
    });
  }
  assert.equal(sha(e.keyCanonicalText), e.payloadDigest);
  assert.equal(digest(k), e.payloadDigest);
  const s = i.raw.sourceRange;
  assert.equal(
    digestIdentityTuple('syntax-key-v1', [
      i.repositoryId,
      i.raw.sourceFileId,
      i.raw.sourceFingerprint,
      s.startLine,
      s.startColumn,
      s.endLine,
      s.endColumn,
      i.raw.syntaxKind,
      e.payloadDigest,
    ]),
    e.syntaxKey,
  );
}
test('manifest and provenance cover exact independent payloads', () => {
  assert.equal(cases.length, 34);
  assert.equal(new Set(cases.map((c) => c.id)).size, 34);
  assert.equal(new Set(cases.map((c) => c.family)).size, 6);
  for (const c of cases) assert.equal(loadMappingCase(c.id).metadata.id, c.id);
  assert.equal(
    sha(Buffer.from('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  const p = json('provenance.json');
  for (const [path, h] of Object.entries(p.sha256))
    assert.equal(sha(readFileSync(new URL(path, root))), h, path);
  for (const o of p.sourceOrigins) {
    assert.equal(sha(readFileSync(new URL(o.path, root))), o.sha256);
    if (o.original) assert.equal(sha(readFileSync(o.original)), o.sha256);
  }
  assert.equal(
    parseFixtureManifest(json('fixture.json'), 'fixture.json').id,
    'p1-syntax-mapping-preparation-v1',
  );
});
test('all nonnumeric projections obey declared field/ref semantics', () => {
  for (const c of cases) verify(loadMappingCase(c.id));
  for (const field of ['source', 'ref', 'key', 'policy', 'numeric']) {
    const c = structuredClone(loadMappingCase('assignment-python'));
    if (field === 'source') c.input.sourceFile.contentFingerprint = 'a'.repeat(64);
    if (field === 'ref') c.expected.projection.payload.value.candidates[0].entity.id = 'foreign';
    if (field === 'key') c.expected.syntaxKey = 'foreign';
    if (field === 'policy') c.expected.admission = 'READY';
    if (field === 'numeric') c.expected.confidence = {};
    assert.throws(() => verify(c), undefined, field);
  }
});
test('unrepresentable value ambiguity refuses without callee upgrade', () => {
  assert.equal(
    loadMappingCase('value-collapse-reject').expected.causeCode,
    'INCOMPATIBLE_CONTRACT',
  );
  const e = loadMappingCase('callee-collapse-one').expected;
  assert.equal(e.projection.payload.callee.state, 'NON_RESOLVED');
  assert.equal(e.projection.payload.callee.candidates.length, 1);
});
test('identity literals preserve provider independence and encoding', () => {
  const base = loadMappingCase('assignment-python').expected.syntaxKey;
  for (const id of ['provider-renamed-key-stable', 'revision-rebound-key-stable'])
    assert.equal(loadMappingCase(id).expected.syntaxKey, base);
  assert.notEqual(loadMappingCase('payload-changed-key').expected.syntaxKey, base);
  for (const id of ['unicode-key-order', 'integer-key-order']) {
    const { input: i, expected: e } = loadMappingCase(id);
    assert.equal(digest(i.value), e.digest);
    assert.equal(sha(e.canonicalText), e.digest);
  }
  const { input: i, expected: e } = loadMappingCase('extraction-version-encoding');
  assert.equal(i.policyVersion, 'UNAPPROVED_ENCODING_ONLY');
  assert.equal(digestIdentityTuple(i.domain, i.fields), e.digest);
  assert.equal(sha(Buffer.from(e.framedHex, 'hex')), e.digest.split(':')[1]);
});
test('no numerical policy or Canonical envelope is manufactured', () => {
  for (const c of cases) {
    const { input: i, expected: e } = loadMappingCase(c.id);
    if (i.kind === 'IDENTITY_ENCODING_INPUT') continue;
    assert.equal(e.canonicalEnvelope, null);
    if (e.projection) {
      assert.equal(Object.hasOwn(e.projection, 'confidence'), false);
      assert.equal(Object.hasOwn(e.projection, 'extractionVersion'), false);
      assert.equal(e.admission, 'BLOCKED_POLICY');
    }
  }
  assert.equal(
    loadMappingCase('artifact-ownerless').metadata.provenanceClass,
    'SCHEMA_CONTRACT_ONLY',
  );
  assert.equal(
    loadMappingCase('value-object-duplicates').metadata.provenanceClass,
    'SCHEMA_CONTRACT_ONLY',
  );
});
test('one root test and one Fixture registration', async () => {
  const command = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url)),
  ).scripts.test.split(/\s+/);
  assert.equal(
    command.filter((x) => x === 'scripts/test-syntax-mapping-preparation.mjs').length,
    1,
  );
  const fixtures = await discoverFixtures('fixtures');
  assert.equal(
    fixtures.filter((x) => x.manifest.id === 'p1-syntax-mapping-preparation-v1').length,
    1,
  );
  const { nativeSyntaxObservationProfiles } =
    await import('../packages/runtime/dist/native-metadata-profiles.js');
  assert.equal(nativeSyntaxObservationProfiles.length, 0);
});
