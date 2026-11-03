import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadCompositionCase } from '../../providers/test/fixtures/native-composition-helpers.mjs';
import { historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { createMixedAnalysisRules } from '../dist/mixed-analysis.js';
const w = 'fixtures/phase1/mixed-analysis-stage/component-references',
  read = (p) =>
    JSON.parse(
      p.startsWith(w + '/') && !p.endsWith('/provenance.json')
        ? readComponentReference(p)
        : fs.readFileSync(p),
    ),
  canon = (v) =>
    Array.isArray(v)
      ? '[' + v.map(canon).join(',') + ']'
      : v && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + canon(v[k]))
            .join(',') +
          '}'
        : JSON.stringify(v),
  ref = (id) => read(w + '/early-java-independent-v2/' + id + '.json');
const api = () => {
  const p = createMixedAnalysisRules();
  assert.deepEqual(Object.keys(p), ['prepareJavaOwner', 'validateObservation', 'compose']);
  assert.ok(Object.isFrozen(p));
  return p;
};
for (const id of ['java-only', 'mixed'])
  test('early Java validation matches frozen complete original/normalized nodes ' + id, () => {
    const x = ref(id),
      before = structuredClone(x.input),
      r = api().prepareJavaOwner(x.input, historyLimits);
    assert.deepEqual(r.metadata, x.expected.metadata);
    assert.deepEqual(r.nodes, x.expected.nodes);
    assert.equal(
      createHash('sha256')
        .update(canon({ snapshot: r.metadata.snapshot, java: r.metadata.java, nodes: r.nodes }))
        .digest('hex'),
      x.expected.javaRowsDigest,
    );
    assert.deepEqual(x.input, before);
    assert.ok(!Object.isFrozen(x.input.javaRows));
    assert.ok(Object.isFrozen(r));
    assert.equal(r.usage.rows, 0);
  });
for (const kind of [
  'missing-java',
  'source',
  'locator',
  'inventory',
  'scope',
  'terminal',
  'coverage',
  'node',
  'extra',
  'getter',
  'proxy',
])
  test('early Java refuses ' + kind + ' without readiness shortcut', () => {
    const x = ref('mixed').input;
    let calls = 0;
    if (kind === 'missing-java') x.javaRows.java = null;
    if (kind === 'source') x.javaRows.targetSource.contentFingerprint = 'other';
    if (kind === 'locator') x.javaRows.java.request.payload.repository.rootPath = '/wrong/root';
    if (kind === 'inventory') x.javaRows.inventory.pop();
    if (kind === 'scope') x.scope.units = x.scope.units.filter((u) => u.kind !== 'JAVA_GROUP');
    if (kind === 'terminal') x.javaRows.java.terminal.payload.outcome = 'FAILED';
    if (kind === 'coverage')
      x.javaRows.java.events = x.javaRows.java.events.filter((e) => e.type !== 'COVERAGE');
    if (kind === 'node')
      x.javaRows.java.events.find((e) => e.type === 'NODE').payload.sourceRange = {
        sourceFileId: 'missing',
        startLine: 0,
        startColumn: 0,
        endLine: 1,
        endColumn: 0,
      };
    if (kind === 'extra') x.prepared = true;
    if (kind === 'getter')
      Object.defineProperty(x, 'javaRows', {
        enumerable: true,
        get() {
          calls++;
          return {};
        },
      });
    const input =
      kind === 'proxy'
        ? new Proxy(x, {
            get() {
              calls++;
              throw Error('trap');
            },
            getPrototypeOf() {
              calls++;
              throw Error('trap');
            },
          })
        : x;
    assert.throws(() => api().prepareJavaOwner(input, historyLimits));
    assert.equal(calls, 0);
  });
async function fullInput(id) {
  const raw = await loadCompositionCase(id),
    t = read('fixtures/phase1/mixed-analysis-stage/targets/' + id + '.json'),
    s = t.manifest.state,
    request = JSON.parse(raw.requestBytes),
    java = raw.metadata.java ? ref(id).expected : null;
  return {
    mode: 'FULL',
    target: java
      ? ref(id).input.target
      : {
          source: raw.metadata.targetSource,
          repositoryLocatorDigest: s.repositoryLocatorDigest,
          inventory: s.inventory,
          contracts: s.contracts,
        },
    capture: { parent: null, snapshotIds: [], snapshots: [], coverage: [], activeProviderIds: [] },
    scope: java ? ref(id).input.scope : { units: s.units, removedSourceFileIds: [] },
    owner: {
      stageDigest: request.payload.ownerBinding.stageDigest,
      java: java ? { metadata: java.metadata, nodes: java.nodes } : null,
    },
    rawBundle: {
      metadata: raw.metadata,
      requestBytes: raw.requestBytes,
      outputBytes: raw.outputBytes,
    },
  };
}
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test('early observation validates complete original full ' + id, async () => {
    const x = await fullInput(id),
      before = structuredClone(x),
      r = api().validateObservation(x, historyLimits);
    assert.deepEqual(r.raw.metadata, x.rawBundle.metadata);
    assert.deepEqual(r.raw.codeSyntax.request, JSON.parse(x.rawBundle.requestBytes));
    assert.equal(r.raw.provenance.kind, 'DECLARED_INPUT');
    assert.deepEqual(structuredClone(x), before);
    assert.equal(r.usage.rows, 0);
    assert.ok(Object.isFrozen(r));
  });
for (const kind of ['stage', 'java', 'scope', 'null', 'checksum', 'byte-getter', 'owner-extra'])
  test('early observation rejects ' + kind, async () => {
    const x = await fullInput('mixed');
    let calls = 0;
    if (kind === 'stage') x.owner.stageDigest = '0'.repeat(64);
    if (kind === 'java') x.owner.java.metadata.java.events.pop();
    if (kind === 'scope') x.scope.units.pop();
    if (kind === 'null') x.rawBundle = null;
    if (kind === 'checksum') x.rawBundle.outputBytes[0] ^= 1;
    if (kind === 'byte-getter') {
      const b = Buffer.from(x.rawBundle.outputBytes);
      Object.defineProperty(b, 'byteLength', {
        get() {
          calls++;
          return 1;
        },
      });
      x.rawBundle.outputBytes = b;
    }
    if (kind === 'owner-extra') x.owner.ready = true;
    assert.throws(() => api().validateObservation(x, historyLimits));
    assert.equal(calls, 0);
  });
test('early Java receipts conserve limits with exact and one-below consistency controls', () => {
  const x = ref('mixed').input,
    p = api(),
    r = p.prepareJavaOwner(x, historyLimits),
    u = r.usage,
    limits = {
      ...historyLimits,
      maxRows: 1,
      maxSerializedBytes: u.serializedBytes,
      maxItems: u.items,
      memoryBudgetBytes: 2 * u.retainedLogicalBytes,
    };
  assert.deepEqual(p.prepareJavaOwner(x, limits), r);
  for (const key of ['maxSerializedBytes', 'maxItems', 'memoryBudgetBytes'])
    assert.throws(() => p.prepareJavaOwner(x, { ...limits, [key]: limits[key] - 1 }));
});

test('early Java preserves Native metadata inventory byte-order gate', () => {
  const x = ref('mixed').input;
  x.javaRows.inventory.reverse();
  assert.throws(() => api().prepareJavaOwner(x, historyLimits));
});
test('early validation failures return safe actual cumulative receipts', () => {
  const x = ref('mixed').input;
  x.javaRows.java.events = x.javaRows.java.events.filter((e) => e.type !== 'COVERAGE');
  assert.throws(
    () => api().prepareJavaOwner(x, historyLimits),
    (e) =>
      e.code === 'INVALID_CANDIDATE' &&
      e.message === e.code &&
      Object.isFrozen(e.usage) &&
      e.usage.items > 0 &&
      e.usage.retainedLogicalBytes > 0,
  );
  assert.throws(
    () => api().prepareJavaOwner(ref('mixed').input, { ...historyLimits, maxItems: 1 }),
    (e) => e.code === 'STAGE_LIMIT_EXCEEDED' && e.usage.items === 1,
  );
});

import { loadRawHistoryCase } from '../../../fixtures/phase1/declared-raw-history-candidate/corpus.mjs';
for (const id of ['I01', 'I03'])
  test('early observation preserves strict original delta raw ' + id, () => {
    const dir = w + '/runtime-delta-independent-v4',
      x = read(dir + '/raw-' + id + '.json'),
      raw = loadRawHistoryCase(id),
      input = x.input,
      m = x.expected.manifest,
      units = m.state.units.filter((u) => m.observation.scope.unitIds.includes(u.id)),
      requestBytes = readComponentReference(dir + '/' + id + '-request.jsonl'),
      outputBytes = readComponentReference(dir + '/' + id + '-output.jsonl'),
      request = JSON.parse(requestBytes),
      r = api().validateObservation(
        {
          mode: 'DELTA',
          target: input.target,
          capture: input.capture,
          scope: { units, removedSourceFileIds: m.observation.scope.removedSourceFileIds },
          owner: { stageDigest: request.payload.ownerBinding.stageDigest, java: null },
          rawBundle: { metadata: raw.metadata, requestBytes, outputBytes },
        },
        historyLimits,
      );
    assert.deepEqual(r.raw.metadata, raw.metadata);
    assert.deepEqual(r.raw.codeSyntax.request, request);
  });

test('final compose preserves original errors and records private cumulative failure usage', async () => {
  const x = await fullInput('mixed'),
    state = await import('../../storage/dist/analysis/mixed-analysis-state.js');
  assert.equal(typeof state.mixedAnalysisFailureUsage, 'function');
  const input = {
    mode: x.mode,
    target: x.target,
    capture: x.capture,
    rawBundle: x.rawBundle,
    qualificationRef: 'component-fixture:not-runtime-qualified',
  };
  input.rawBundle.metadata.java.events.pop();
  assert.throws(
    () => api().compose(input, historyLimits),
    (e) => {
      const u = state.mixedAnalysisFailureUsage(e);
      return (
        e.code !== 'INVALID_CANDIDATE' &&
        e.message === e.code &&
        u.items > 0 &&
        u.retainedLogicalBytes > 0 &&
        Object.isFrozen(u)
      );
    },
  );
});

test('portable component references preserve the frozen complete input bytes', () => {
  const root = 'fixtures/phase1/mixed-analysis-stage/component-references/';
  const manifest = read(root + 'provenance.json');
  assert.equal(manifest.kind, 'SEALED_COMPONENT_REFERENCE_TRANSFER');
  assert.equal(manifest.qualification, 'DECLARED_COMPONENT_ONLY');
  const seen = new Set();
  for (const entry of manifest.files) {
    assert.equal(seen.has(entry.path), false);
    seen.add(entry.path);
    assert.ok(!entry.path.startsWith('/') && !entry.path.split('/').includes('..'));
    const bytes = readComponentReference(entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(entry.sha256, entry.sourceEvidence.sha256);
    if (entry.path.endsWith('.json')) assert.doesNotThrow(() => JSON.parse(bytes));
    if (entry.path.endsWith('.jsonl'))
      for (const line of bytes.toString('utf8').trimEnd().split('\n'))
        assert.doesNotThrow(() => JSON.parse(line));
  }
  assert.ok(seen.size > 0);
});

test('component reference loader refuses undeclared paths', () => {
  assert.throws(() => readComponentReference('../base-input.json'), /Unknown component reference/);
});
