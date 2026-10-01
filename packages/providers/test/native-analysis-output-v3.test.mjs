import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import * as api from '../dist/index.js';
import { RepositoryAnalysisStage } from '../../storage/dist/index.js';
import {
  baseCase,
  streamRecords,
  encode,
  sha,
  factDigest,
  updateDigest,
} from './helpers/native-full-v3-corpus.mjs';

const root = new URL('../../../fixtures/ipc/analysis-v3/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));
const payloads = JSON.parse(await readFile(new URL(manifest.payloadVectors, root), 'utf8'));
const limits = api.NATIVE_CLIENT_HARD_LIMITS;
async function* chunks(bytes, size = 31) {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}
async function decode(request, bytes, overrides = {}, sink = { async accept() {} }) {
  assert.equal(typeof api.decodeNativeFullAnalysisV3, 'function');
  return api.decodeNativeFullAnalysisV3(request, chunks(bytes), sink, { ...limits, ...overrides });
}

for (const entry of manifest.cases)
  test(`full-v3 byte corpus: ${entry.id}`, async () => {
    assert.match(entry.events, /^[a-z0-9-]+\.jsonl$/);
    const bytes = await readFile(new URL(entry.events, root));
    if (!entry.valid) {
      await assert.rejects(decode(entry.request, bytes), (e) =>
        ['PROTOCOL_VIOLATION', 'CHECKSUM_MISMATCH'].includes(e.code),
      );
      return;
    }
    const events = [];
    const result = await decode(
      entry.request,
      bytes,
      {},
      {
        async accept(e) {
          events.push(e);
        },
      },
    );
    assert.equal(result.terminal.type, 'ANALYSIS_COMPLETED');
    assert.deepEqual(result.terminal.payload.counts, entry.expectedCounts);
    assert.equal(result.terminal.payload.summaryRecords, entry.summaryRecords);
    assert.equal(events.filter((e) => e.type === 'ANALYSIS_SUMMARY').length, entry.summaryRecords);
    assert.ok(events.every(Object.isFrozen));
    assert.ok(Object.isFrozen(result.terminal.payload));
    assert.equal(
      result.terminal.payload.integrityChecksum,
      'sha256:' + sha(bytes.subarray(0, bytes.lastIndexOf(10, bytes.length - 2) + 1)),
    );
    if (entry.id === 'valid-partial') assert.equal(result.terminal.payload.outcome, 'PARTIAL');
  });

for (const v of payloads.vectors)
  test(`full-v3 actual staged correspondence: ${v.id}`, async (t) => {
    assert.equal(api.NativeAnalysisStateBundleV1Schema.safeParse(v.bundle).success, v.stateValid);
    const db = new DatabaseSync(':memory:');
    const budget = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 1_000_000_000 };
    const stage = new RepositoryAnalysisStage(db, budget);
    t.after(() => {
      stage.close();
      db.close();
    });
    const entries = streamRecords(v);
    let sealed = false;
    const run = async () => {
      // Fixture semantic gate uses the approved pure Provider port, not Runtime admission.
      const { terminal } = await decode(
        v.request,
        encode(entries),
        {},
        {
          async accept(e) {
            if (e.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(e.payload);
            else await stage.accept(e);
          },
        },
      );
      stage.confirmSucceeded(terminal);
      const {
        schemaVersion: _s,
        sourceFileCount: _n,
        summaryDigest: _d,
        ...expected
      } = baseCase().bundle.header;
      const result = stage.sealNativeState(
        JSON.stringify(v.bundle.header),
        expected,
        api.validateNativeStateCandidate,
        budget,
      );
      sealed = true;
      return result;
    };
    if (v.valid) {
      assert.equal((await run()).files.length, v.sources.length);
      assert.equal(stage.readSealedNativeState().summaryDigest, v.bundle.header.summaryDigest);
    } else {
      await assert.rejects(run());
      assert.equal(sealed, false);
      assert.throws(() => stage.readSealedNativeState(), /sealed/i);
    }
  });

test('full-v3 awaits sink acceptance before reading the next chunk', async () => {
  const request = baseCase('zero-file').request;
  const records = streamRecords(baseCase('zero-file'));
  let reads = 0,
    accepts = 0,
    release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  async function* source() {
    for (const record of records) {
      reads++;
      yield encode([record]);
    }
  }
  assert.equal(typeof api.decodeNativeFullAnalysisV3, 'function');
  const run = api.decodeNativeFullAnalysisV3(
    request,
    source(),
    {
      async accept() {
        accepts++;
        entered();
        await blocked;
      },
    },
    limits,
  );
  try {
    await ready;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal(accepts, 1);
  } finally {
    release();
  }
  await run;
});

test('full-v3 framing rejects BOM, CRLF, UTF-8 corruption, blank and truncated records', async () => {
  const v = baseCase('zero-file'),
    bytes = encode(streamRecords(v));
  for (const bad of [
    Buffer.concat([Buffer.from([239, 187, 191]), bytes]),
    Buffer.from(bytes.toString().replaceAll('\n', '\r\n')),
    Buffer.from([255, 10]),
    Buffer.from('\n'),
    bytes.subarray(0, -1),
    Buffer.concat([bytes, Buffer.from('x')]),
  ])
    await assert.rejects(decode(v.request, bad), (e) => e.code === 'PROTOCOL_VIOLATION');
});

test('full-v3 caller limits can lower but never raise line, total and event ceilings', async () => {
  const v = baseCase('zero-file'),
    bytes = encode(streamRecords(v));
  for (const overrides of [
    { maxLineBytes: 1 },
    { maxStdoutBytes: bytes.length - 1 },
    { maxEvents: 1 },
  ])
    await assert.rejects(
      decode(v.request, bytes, overrides),
      (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED',
    );
  for (const key of Object.keys(limits))
    await assert.rejects(
      decode(v.request, bytes, { [key]: limits[key] + 1 }),
      (e) => e.code === 'INVALID_CONFIGURATION',
    );
  const req = structuredClone(v.request);
  req.payload.resourceBudget.maxEvents = 1;
  await assert.rejects(decode(req, bytes), (e) => e.code === 'OUTPUT_LIMIT_EXCEEDED');
});

test('full-v3 failures never return a completed result and terminal remains last', async () => {
  const v = baseCase('zero-file');
  for (const type of ['REQUEST_FAILED', 'ANALYSIS_FAILED']) {
    const a = type === 'REQUEST_FAILED' ? [] : streamRecords(v).slice(0, 1);
    a.push({
      protocolVersion: 3,
      requestId: 'req',
      sequence: a.length,
      type,
      payload: {
        ...(type === 'ANALYSIS_FAILED' ? a[0].payload : {}),
        error: { code: 'CANCELLED', message: 'Cancelled', retryable: false },
      },
    });
    await assert.rejects(decode(v.request, encode(a)), (e) => e.code === 'ANALYZER_FAILED');
  }
});

test('full-v3 byte decoding feeds real staging without a second graph buffer', async (t) => {
  const v = baseCase();
  const db = new DatabaseSync(':memory:');
  const budget = {
    maxSerializedBytes: 1_000_000,
    memoryBudgetBytes: v.request.payload.resourceBudget.maxMemoryBytes,
  };
  const stage = new RepositoryAnalysisStage(db, budget);
  t.after(() => {
    stage.close();
    db.close();
  });
  const { terminal } = await decode(
    v.request,
    encode(streamRecords(v)),
    {},
    {
      async accept(e) {
        if (e.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(e.payload);
        else await stage.accept(e);
      },
    },
  );
  stage.confirmSucceeded(terminal);
  const {
    schemaVersion: _s,
    sourceFileCount: _n,
    summaryDigest: _d,
    ...expected
  } = v.bundle.header;
  const candidate = stage.sealNativeState(
    JSON.stringify(terminal.payload.analysisState),
    expected,
    api.validateNativeStateCandidate,
    budget,
  );
  assert.equal(candidate.files.length, 2);
  assert.equal([...stage.readProviderNodes()].length, 5);
});

test('full-v3 wire scalars reject negative-zero coordinates, unsafe integers and nonfinite numbers', async () => {
  const v = baseCase(),
    valid = encode(streamRecords(v)).toString();
  for (const replacement of ['-0', '9007199254740992', '1e400']) {
    const bytes = Buffer.from(valid.replace('"startLine":0', '"startLine":' + replacement));
    await assert.rejects(decode(v.request, bytes), (e) => e.code === 'PROTOCOL_VIOLATION');
  }
  await assert.rejects(
    decode(v.request, Buffer.from(valid.replace('"name":"demo"', '"name":"\\ud800"'))),
    (e) => e.code === 'PROTOCOL_VIOLATION',
  );
});

test('exported full-v3 schema rejects non-scalar Unicode and negative-zero fact coordinates', () => {
  const node = streamRecords(baseCase()).find((e) => e.type === 'NODE');
  const negative = structuredClone(node);
  negative.payload.sourceRange.startLine = -0;
  assert.equal(api.NativeFullAnalysisEventV3Schema.safeParse(negative).success, false);
  const malformed = structuredClone(node);
  malformed.payload.name = '\ud800';
  assert.equal(api.NativeFullAnalysisEventV3Schema.safeParse(malformed).success, false);
});

test('full-v3 EDGE content, graph counts and FILE ownership reach the actual stage gate', async (t) => {
  const v = baseCase();
  const edge = {
    providerId: 'native',
    providerFactId: 'edge',
    providerSnapshotId: 'snap',
    repositoryId: 'r',
    revisionId: 'rev',
    providerKind: 'java.import.normal',
    source: { factType: 'NODE', providerId: 'native', providerFactId: v.nodes[1].providerFactId },
    target: {
      state: 'RESOLVED',
      resolution: 'EXACT',
      target: { factType: 'NODE', providerId: 'native', providerFactId: 'package-1' },
    },
    sourceRange: { sourceFileId: 'f-0', startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 },
    confidence: { score: 1, method: 'parser', reasons: [] },
  };
  v.edges.push(edge);
  v.request.payload.requestedCapabilities.push('IMPORT');
  v.bundle.header.requestedCapabilities.push('IMPORT');
  for (const [i, s] of v.bundle.summaries.entries()) {
    const c = structuredClone(s.coverage[0]);
    c.capability = 'IMPORT';
    c.statistics.eligibleSites = c.statistics.coveredSites = i === 0 ? 1 : 0;
    c.statistics.resolutionCounts.EXACT = i === 0 ? 1 : 0;
    s.coverage.push(c);
  }
  v.coverage = v.bundle.summaries.flatMap((s) => s.coverage);
  v.bundle.summaries[0].emittedFacts.push({
    factType: 'EDGE',
    providerFactId: 'edge',
    ownership: 'FILE',
    contentDigest: factDigest(edge),
  });
  updateDigest(v);
  for (const wrong of [false, true]) {
    const db = new DatabaseSync(':memory:'),
      budget = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 1_000_000_000 },
      stage = new RepositoryAnalysisStage(db, budget);
    try {
      const records = streamRecords(v);
      if (wrong) {
        records.find((e) => e.type === 'EDGE').payload = {
          ...edge,
          providerKind: 'java.import.static',
        };
        const prefix = records.slice(0, -1);
        records.at(-1).payload.integrityChecksum = 'sha256:' + sha(encode(prefix));
      }
      const { terminal } = await decode(
        v.request,
        encode(records),
        {},
        {
          async accept(e) {
            if (e.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(e.payload);
            else await stage.accept(e);
          },
        },
      );
      assert.deepEqual(terminal.payload.counts, {
        sourceFiles: 2,
        nodes: 5,
        edges: 1,
        coverage: 4,
        diagnostics: 0,
      });
      stage.confirmSucceeded(terminal);
      const {
        schemaVersion: _s,
        sourceFileCount: _n,
        summaryDigest: _d,
        ...expected
      } = v.bundle.header;
      if (wrong)
        assert.throws(
          () =>
            stage.sealNativeState(
              JSON.stringify(v.bundle.header),
              expected,
              api.validateNativeStateCandidate,
              budget,
            ),
          (e) => e.nativeStateReason === 'INVALID',
        );
      else
        assert.equal(
          stage.sealNativeState(
            JSON.stringify(v.bundle.header),
            expected,
            api.validateNativeStateCandidate,
            budget,
          ).files.length,
          2,
        );
    } finally {
      stage.close();
      db.close();
    }
  }
});

test('full-v3 PARTIAL terminal remains observable but cannot complete a stage', async (t) => {
  const v = baseCase('empty'),
    db = new DatabaseSync(':memory:'),
    stage = new RepositoryAnalysisStage(db, {
      maxSerializedBytes: 1_000_000,
      memoryBudgetBytes: 1_000_000_000,
    });
  t.after(() => {
    stage.close();
    db.close();
  });
  const { terminal } = await decode(
    v.request,
    encode(streamRecords(v, 'PARTIAL')),
    {},
    {
      async accept(e) {
        if (e.type === 'ANALYSIS_SUMMARY') await stage.acceptNativeSummary(e.payload);
        else await stage.accept(e);
      },
    },
  );
  assert.throws(() => stage.confirmSucceeded(terminal), /successful/);
  assert.throws(() => stage.readSealedNativeState(), /sealed/);
});
