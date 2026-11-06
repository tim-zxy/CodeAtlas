import {
  readHistoricalInput,
  historicalPath,
  historicalEntries,
} from '../fixtures/phase1/syntax-contract/ci-portability/historical-inputs.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  NATIVE_CLIENT_HARD_LIMITS as hard,
  validateCodeSyntaxObservationStream,
} from '../packages/providers/dist/index.js';
import { consumeCodeSyntaxObservationStream } from '../packages/providers/dist/native-code-syntax-stream.js';
import { instantiateProducerCase } from '../packages/providers/test/fixtures/code-syntax-producer-helpers.mjs';
const inventoryPath =
  'docs/superpowers/specs/2026-10-25-phase1-syntax-evidence-reuse-inventory.json';
const annotationsPath =
  'docs/superpowers/specs/2026-10-25-phase1-syntax-evidence-source-annotations.json';
const workspace = '.superpowers/sdd/2026-10-25-phase1-syntax-evidence-reuse';
const repo = fileURLToPath(new URL('../', import.meta.url));
const capture =
  '.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/library-output/b0b2-depth-R3xgxs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const copy = structuredClone;
function registerTests() {
  test('pinned historical layout and sources remain immutable', () => {
    const d = loadInputs();
    assert.equal(verifyArtifacts(d), true);
    assert.equal(d.inventory.cases.length, 18);
    for (const kind of ['byte', 'snapshot', 'hash', 'foreign', 'missing']) {
      const x = copy(d);
      if (kind === 'byte') {
        const p = capture + '/mixed/events.jsonl';
        x.files.set(p, Buffer.from('changed'));
      }
      if (kind === 'snapshot')
        x.files.set('scripts/check-code-syntax-library-output.mjs', Buffer.from('changed'));
      if (kind === 'hash') x.inventory.cases[0].captureHashes['events.jsonl'] = 'a'.repeat(64);
      if (kind === 'foreign') x.inventory.cases[0].caseId = 'foreign';
      if (kind === 'missing') x.inventory.cases.pop();
      assert.throws(() => verifyArtifacts(x), undefined, kind);
    }
  });
  test('independent annotations match exact source byte ranges', () => {
    const d = loadInputs();
    assert.equal(verifyAnnotations(d), true);
    for (const kind of ['range', 'literal', 'case']) {
      const x = copy(d);
      if (kind === 'range') x.annotations.cases[2].sources[0].anchors[0].range.startLine = 1;
      if (kind === 'literal') x.annotations.cases[2].sources[0].anchors[0].literal = 'wrong';
      if (kind === 'case') x.annotations.cases[0].caseId = 'foreign';
      assert.throws(() => verifyAnnotations(x), undefined, kind);
    }
  });
  test('retained templates and pure bounded consumers agree', async () => {
    const d = loadInputs(),
      r = await audit(d);
    assert.equal(r.kind, 'HISTORICAL_LIBRARY_EVIDENCE_REUSE_ONLY');
    assert.equal(r.cases.length, 18);
    assert.equal(r.recordInventory.syntaxObservationCount, 30);
    validateReport(r, d);
  });
  test('partial outcomes and missing strata remain explicit', async () => {
    const d = loadInputs(),
      r = await audit(d);
    assert.equal(r.cases.filter((c) => c.historicalOutcome === 'PARTIAL').length, 7);
    assert.ok(r.coverageGaps.includes('ARTIFACT'));
    assert.ok(r.coverageGaps.includes('EXACT_HEURISTIC_AMBIGUOUS_UNSUPPORTED_TARGETS'));
    const x = copy(r);
    x.cases.find((c) => c.historicalOutcome === 'PARTIAL').historicalOutcome = 'SUCCEEDED';
    assert.throws(() => validateReport(x, d));
  });
  test('historical evidence cannot confer policy or run authority', async () => {
    const before = fs.existsSync(path.resolve(repo, workspace, 'reuse-report.json'))
      ? hash(fs.readFileSync(path.resolve(repo, workspace, 'reuse-report.json')))
      : null;
    const d = loadInputs(),
      r = await audit(d);
    for (const key of [
      'measurementEligible',
      'sourceOrHistoryAuthenticated',
      'numericalPolicy',
      'thresholds',
      'newMeasurements',
      'runtimeAdmission',
    ]) {
      const x = copy(r);
      x[key] =
        key.endsWith('Eligible') || key.endsWith('Authenticated') || key === 'runtimeAdmission'
          ? true
          : {};
      assert.throws(() => validateReport(x, d), undefined, key);
    }
    const after = fs.existsSync(path.resolve(repo, workspace, 'reuse-report.json'))
      ? hash(fs.readFileSync(path.resolve(repo, workspace, 'reuse-report.json')))
      : null;
    assert.equal(after, before, 'test/import mode must not write report');
  });
  test('one new root test and no new fixture', async () => {
    const p = JSON.parse(fs.readFileSync(path.resolve(repo, 'package.json')));
    assert.equal(
      p.scripts.test.split(/\s+/).filter((x) => x === 'scripts/test-syntax-evidence-reuse.mjs')
        .length,
      1,
    );
    const { nativeSyntaxObservationProfiles } =
      await import('../packages/runtime/dist/native-metadata-profiles.js');
    assert.equal(nativeSyntaxObservationProfiles.length, 0);
  });
}
const check = (condition, code) => assert.ok(condition, code);
const same = (a, b, code) => check(JSON.stringify(a) === JSON.stringify(b), code);
function exactKeys(v, fields, code) {
  check(v !== null && typeof v === 'object' && !Array.isArray(v), code);
  same(Object.keys(v).sort(), fields.split(' ').sort(), code);
}
function regular(relative, cap) {
  check(
    typeof relative === 'string' &&
      relative === path.posix.normalize(relative) &&
      !relative.startsWith('../') &&
      !path.isAbsolute(relative),
    'UNSAFE_PIN_PATH',
  );
  if (relative.startsWith('.superpowers/')) {
    const physical = path.relative(repo, historicalPath(relative)).split(path.sep).join('/');
    regular(physical, hard.maxStdoutBytes); // Archive bytes use the existing whole-output cap.
    const bytes = readHistoricalInput(relative);
    check(bytes.length <= cap, 'EXISTING_BYTE_CAP');
    return bytes;
  }
  const full = path.resolve(repo, relative);
  check(full.startsWith(path.resolve(repo) + path.sep), 'OUTSIDE_REPO');
  let parent = path.resolve(repo);
  for (const component of relative.split('/').slice(0, -1)) {
    parent = path.join(parent, component);
    const s = fs.lstatSync(parent);
    check(
      s.isDirectory() && !s.isSymbolicLink() && fs.realpathSync(parent) === parent,
      'INDIRECT_PARENT',
    );
  }
  const s = fs.lstatSync(full);
  check(s.isFile() && !s.isSymbolicLink() && fs.realpathSync(full) === full, 'INDIRECT_FILE');
  check(s.size <= cap, 'EXISTING_BYTE_CAP');
  const bytes = fs.readFileSync(full);
  check(bytes.length === s.size, 'FILE_SIZE_CHANGED');
  return bytes;
}
function loadInputs() {
  const inventoryBytes = regular(inventoryPath, hard.maxStdoutBytes),
    annotationBytes = regular(annotationsPath, hard.maxStdoutBytes),
    inventory = JSON.parse(inventoryBytes),
    annotations = JSON.parse(annotationBytes);
  const baselinePath =
      '.superpowers/design/2026-10-25-phase1-syntax-evidence-reuse/review-verification.json',
    baseline = JSON.parse(regular(baselinePath, hard.maxStdoutBytes));
  check(hash(inventoryBytes) === baseline.sha256[inventoryPath], 'INVENTORY_PIN');
  const freeze = JSON.parse(
    regular(workspace + '/source-annotation-freeze.json', hard.maxLineBytes),
  );
  check(hash(annotationBytes) === freeze.sha256[annotationsPath], 'ANNOTATION_FREEZE');
  check(inventory.captureRoot === capture, 'FIXED_CAPTURE_ROOT');
  const expectedRootEntries = [
    ...inventory.cases.map((c) => c.caseId),
    'cross-consumer-result.json',
  ].sort();
  same(historicalEntries(capture), expectedRootEntries, 'ROOT_LAYOUT');
  for (const c of inventory.cases) {
    check(/^[a-z0-9-]+$/.test(c.caseId), 'CASE_ID');
    same(
      historicalEntries(capture + '/' + c.caseId),
      ['events.jsonl', 'expected.jsonl', 'manifest.json', 'request.jsonl'],
      'CASE_LAYOUT',
    );
  }
  const files = new Map();
  const historicalSources = {
    'scripts/check-code-syntax-library-output.mjs':
      'fixtures/phase1/syntax-contract/ci-portability/historical-library-output-before.mjs.txt',
  };
  for (const p of Object.keys(inventory.hashPins))
    files.set(p, regular(historicalSources[p] ?? p, hard.maxStdoutBytes));
  const originalCases = JSON.parse(
    files.get('fixtures/phase1/code-syntax-producer-oracle/cases.json'),
  );
  for (const c of originalCases)
    for (const suffix of [c.request, c.events]) {
      const p = 'fixtures/phase1/code-syntax-producer-oracle/' + suffix,
        b = regular(p, hard.maxStdinBytes);
      check(hash(b) === baseline.sha256[p], 'PREPRODUCT_TEMPLATE_PIN');
      files.set(p, b);
    }
  const mapping = 'fixtures/phase1/syntax-mapping-preparation/provenance.json';
  files.set(mapping, regular(mapping, hard.maxStdoutBytes));
  check(hash(files.get(mapping)) === baseline.sha256[mapping], 'MAPPING_PIN');
  return { inventory, annotations, inventoryBytes, annotationBytes, files, originalCases };
}
const dataBytes = (d, p) => {
  check(d.files.has(p), 'PIN_MISSING');
  return Buffer.from(d.files.get(p));
};
function recordInventory(i) {
  return {
    caseCount: i.caseCount,
    syntaxObservationCount: i.syntaxObservationCount,
    kinds: i.kinds,
    nestedValueOccurrences: i.nestedValueOccurrences,
    nestedTargetOccurrences: i.nestedTargetOccurrences,
    nullOwnerObservations: i.nullOwnerObservations,
    terminalOutcomes: i.terminalOutcomes,
    coverageRecordCounts: i.coverageRecordCounts,
  };
}
function verifyArtifacts(d) {
  const i = d.inventory;
  check(
    i.status === 'HISTORICAL_LIBRARY_ARTIFACT_INVENTORY_ONLY' && i.captureRoot === capture,
    'HISTORICAL_SCOPE',
  );
  check(
    i.measurementEligible === false &&
      i.sourceOrHistoryAuthenticated === false &&
      i.executionKind === 'RUST_LIBRARY_TEST_ONLY',
    'NO_RUN_AUTHORITY',
  );
  check(
    i.numericalPolicy === null && i.thresholds === null && i.newMeasurements === null,
    'NO_POLICY',
  );
  same(
    i.cases.map((c) => c.caseId),
    d.originalCases.map((c) => c.id),
    'EXACT_CASES',
  );
  for (const [p, h] of Object.entries(i.hashPins)) check(hash(dataBytes(d, p)) === h, 'PIN_HASH');
  const cross = JSON.parse(dataBytes(d, capture + '/cross-consumer-result.json'));
  exactKeys(cross, 'kind measurementEligible sourceOrHistoryAuthenticated cases', 'CROSS_KEYS');
  check(
    cross.kind === 'RUST_LIBRARY_TEST_CROSS_CONSUMER_CONFORMANCE_ONLY' &&
      cross.measurementEligible === false &&
      cross.sourceOrHistoryAuthenticated === false,
    'CROSS_SCOPE',
  );
  const counts = {
    caseCount: i.cases.length,
    syntaxObservationCount: 0,
    kinds: {},
    nestedValueOccurrences: {},
    nestedTargetOccurrences: {},
    nullOwnerObservations: 0,
    terminalOutcomes: {},
    coverageRecordCounts: { CODE_COVERAGE: {}, SYNTAX_COVERAGE: {} },
  };
  const tally = (o, k) => {
    o[k] = (o[k] ?? 0) + 1;
  };
  for (const c of i.cases) {
    const dir = capture + '/' + c.caseId,
      m = JSON.parse(dataBytes(d, dir + '/manifest.json'));
    exactKeys(
      m,
      'caseId eventsFile eventsSha256 executionKind expectedFile expectedSha256 measurementEligible requestFile requestSha256 schemaVersion',
      'MANIFEST_KEYS',
    );
    check(
      m.caseId === c.caseId &&
        m.schemaVersion === 1 &&
        m.measurementEligible === false &&
        m.executionKind === 'RUST_LIBRARY_TEST_ONLY',
      'MANIFEST_SCOPE',
    );
    for (const n of ['manifest.json', 'request.jsonl', 'events.jsonl', 'expected.jsonl'])
      check(hash(dataBytes(d, dir + '/' + n)) === c.captureHashes[n], 'CASE_HASH');
    for (const n of ['request', 'events', 'expected']) {
      check(m[n + 'File'] === n + '.jsonl', 'MANIFEST_FILE');
      check(m[n + 'Sha256'] === hash(dataBytes(d, dir + '/' + n + '.jsonl')), 'MANIFEST_HASH');
    }
    check(
      dataBytes(d, dir + '/events.jsonl').equals(dataBytes(d, dir + '/expected.jsonl')),
      'RETAINED_EXPECTED_BYTES',
    );
    check(dataBytes(d, dir + '/request.jsonl').length <= hard.maxStdinBytes, 'REQUEST_CAP');
    check(dataBytes(d, dir + '/events.jsonl').length <= hard.maxStdoutBytes, 'EVENTS_CAP');
    const events = dataBytes(d, dir + '/events.jsonl')
        .toString('utf8')
        .trimEnd()
        .split('\n')
        .map((s) => JSON.parse(s)),
      terminal = events.at(-1);
    check(terminal.type === 'OBSERVATION_COMPLETED', 'TERMINAL');
    const result = cross.cases.find((x) => x.id === c.caseId);
    check(
      result && result.outcome === terminal.payload.outcome && c.terminalOutcome === result.outcome,
      'HISTORICAL_OUTCOME',
    );
    check(
      result.eventsSha256 === c.captureHashes['events.jsonl'] &&
        result.requestSha256 === c.captureHashes['request.jsonl'],
      'CROSS_HASH',
    );
    tally(counts.terminalOutcomes, result.outcome);
    const request = JSON.parse(dataBytes(d, dir + '/request.jsonl'));
    for (const s of c.sources) {
      check(hash(dataBytes(d, s.fixturePath)) === s.sha256, 'SOURCE_HASH');
      const f = request.payload.sourceFiles.find((f) => f.id === s.sourceFileId);
      check(
        f &&
          f.contentFingerprint === s.sourceFingerprint &&
          s.sourceFingerprint === 'sha256:' + s.sha256,
        'SOURCE_REQUEST_BINDING',
      );
    }
    for (const e of events) {
      if (e.type === 'SYNTAX_OBSERVATION') {
        counts.syntaxObservationCount++;
        tally(counts.kinds, e.payload.syntaxKind);
        if (e.payload.owner === null) counts.nullOwnerObservations++;
        function scan(v) {
          if (!v || typeof v !== 'object') return;
          if (typeof v.kind === 'string') tally(counts.nestedValueOccurrences, v.kind);
          if (v.state === 'RESOLVED' || v.state === 'UNRESOLVED')
            tally(counts.nestedTargetOccurrences, v.resolution);
          for (const x of Object.values(v))
            if (Array.isArray(x)) x.forEach(scan);
            else scan(x);
        }
        scan(e.payload.payload);
      }
      if (counts.coverageRecordCounts[e.type])
        tally(counts.coverageRecordCounts[e.type], e.payload.status);
    }
  }
  same(counts, recordInventory(i), 'INVENTORY_UNITS');
  return true;
}
function offsets(bytes, r) {
  exactKeys(r, 'startLine startColumn endLine endColumn', 'RANGE_KEYS');
  for (const n of Object.values(r))
    check(Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0), 'ZERO_BASED_BYTE_COORDINATE');
  const starts = [0];
  for (let n = 0; n < bytes.length; n++) if (bytes[n] === 10) starts.push(n + 1);
  const index = (line, col) => {
    check(line < starts.length, 'LINE_BOUNDS');
    const end = line + 1 < starts.length ? starts[line + 1] - 1 : bytes.length;
    check(col <= end - starts[line], 'BYTE_COLUMN_BOUNDS');
    return starts[line] + col;
  };
  const a = index(r.startLine, r.startColumn),
    b = index(r.endLine, r.endColumn);
  check(b >= a, 'RANGE_ORDER');
  return [a, b];
}
function verifyAnnotations(d) {
  const a = d.annotations;
  exactKeys(
    a,
    'schemaVersion status basis cases numericalPolicy newMeasurements',
    'ANNOTATION_KEYS',
  );
  check(
    a.schemaVersion === 1 &&
      a.status === 'SOURCE_ANNOTATIONS_ONLY' &&
      a.numericalPolicy === null &&
      a.newMeasurements === null,
    'ANNOTATION_SCOPE',
  );
  exactKeys(a.basis, 'inventorySha256 mappingProvenanceSha256', 'ANNOTATION_BASIS');
  check(
    a.basis.inventorySha256 === hash(d.inventoryBytes) &&
      a.basis.mappingProvenanceSha256 ===
        hash(dataBytes(d, 'fixtures/phase1/syntax-mapping-preparation/provenance.json')),
    'ANNOTATION_BASIS_PIN',
  );
  same(
    a.cases.map((c) => c.caseId),
    d.inventory.cases.map((c) => c.caseId),
    'ANNOTATION_CASES',
  );
  for (let n = 0; n < a.cases.length; n++) {
    const c = a.cases[n],
      actual = d.inventory.cases[n];
    exactKeys(c, 'caseId sources claims limitations', 'ANNOTATION_CASE_KEYS');
    check(
      Array.isArray(c.claims) &&
        c.claims.every((x) => typeof x === 'string') &&
        Array.isArray(c.limitations) &&
        c.limitations.length > 0,
      'SURFACE_ONLY_CLAIMS',
    );
    same(
      c.sources.map((s) => s.fixturePath),
      actual.sources.map((s) => s.fixturePath),
      'ANNOTATION_SOURCES',
    );
    for (let k = 0; k < c.sources.length; k++) {
      const s = c.sources[k],
        pin = actual.sources[k],
        bytes = dataBytes(d, s.fixturePath);
      exactKeys(s, 'fixturePath sha256 anchors', 'ANNOTATION_SOURCE_KEYS');
      check(s.sha256 === pin.sha256 && hash(bytes) === s.sha256, 'ANNOTATION_SOURCE_PIN');
      check(s.anchors.length === (bytes.length ? 1 : 0), 'EXPLICIT_SOURCE_ANCHOR');
      for (const anchor of s.anchors) {
        exactKeys(anchor, 'range literal interpretation limitations', 'ANCHOR_KEYS');
        const [lo, hi] = offsets(bytes, anchor.range);
        check(lo === 0 && hi === bytes.length, 'WHOLE_SOURCE_ANCHOR');
        check(
          typeof anchor.literal === 'string' &&
            bytes.subarray(lo, hi).equals(Buffer.from(anchor.literal, 'utf8')),
          'EXACT_SOURCE_LITERAL',
        );
        check(
          typeof anchor.interpretation === 'string' &&
            anchor.interpretation.length > 0 &&
            Array.isArray(anchor.limitations) &&
            anchor.limitations.length > 0,
          'ANCHOR_LIMITATIONS',
        );
      }
    }
    if (c.caseId === 'no-files' || c.caseId === 'empty-python')
      check(c.claims.length === 0, 'EMPTY_CLAIMS');
  }
  return true;
}
const gaps = [
  'ARTIFACT',
  'NUMBER_BOOLEAN_NULL_VALUES',
  'EXACT_HEURISTIC_AMBIGUOUS_UNSUPPORTED_TARGETS',
  'DUPLICATE_OBJECT_ENTRY_PRODUCER_SUPPORT',
  'REPRESENTATIVE_INDEPENDENT_DYNAMIC_TRUTH',
  'FAILURE_CANCELLATION_QUALIFICATION',
  'SOURCE_HISTORY_STAGE_RUN_QUALIFICATION',
  'CONFIDENCE_POLICY_AND_CALIBRATION',
];
function caseResult(c) {
  return {
    caseId: c.caseId,
    historicalOutcome: c.terminalOutcome,
    checks: {
      templateBytes: 'MATCH',
      pureBounded: 'MATCH',
      sourceRanges: 'GROUNDED_BYTE_RANGES_ONLY',
      sourceClaims: c.sources.some((s) => s.anchors.length)
        ? 'SURFACE_ANNOTATIONS_ONLY'
        : 'NO_CLAIMS',
    },
  };
}
function expectedReport(d) {
  return {
    kind: 'HISTORICAL_LIBRARY_EVIDENCE_REUSE_ONLY',
    basis: {
      inventorySha256: hash(d.inventoryBytes),
      annotationsSha256: hash(d.annotationBytes),
      captureRoot: capture,
    },
    cases: d.annotations.cases.map((c, n) =>
      caseResult({ ...c, terminalOutcome: d.inventory.cases[n].terminalOutcome }),
    ),
    recordInventory: recordInventory(d.inventory),
    coverageGaps: gaps,
    measurementEligible: false,
    sourceOrHistoryAuthenticated: false,
    numericalPolicy: null,
    thresholds: null,
    newMeasurements: null,
  };
}
function validateReport(r, d) {
  exactKeys(
    r,
    'kind basis cases recordInventory coverageGaps measurementEligible sourceOrHistoryAuthenticated numericalPolicy thresholds newMeasurements',
    'REPORT_KEYS',
  );
  same(r, expectedReport(d), 'HISTORICAL_REPORT_SCOPE');
  return true;
}
async function audit(d) {
  verifyArtifacts(d);
  verifyAnnotations(d);
  for (let n = 0; n < d.inventory.cases.length; n++) {
    const c = d.inventory.cases[n],
      dir = capture + '/' + c.caseId,
      requestBytes = dataBytes(d, dir + '/request.jsonl'),
      eventBytes = dataBytes(d, dir + '/events.jsonl'),
      request = JSON.parse(requestBytes);
    const expected = await instantiateProducerCase(c.caseId, request.payload.repository.rootPath);
    check(
      requestBytes.equals(expected.requestBytes) && eventBytes.equals(expected.expectedOutputBytes),
      'PREPRODUCT_TEMPLATE_AGREEMENT',
    );
    const pure = validateCodeSyntaxObservationStream(requestBytes, eventBytes),
      bounded = await consumeCodeSyntaxObservationStream(
        requestBytes,
        Readable.from([eventBytes]),
        new AbortController().signal,
      );
    same(pure, bounded, 'PURE_BOUNDED_AGREEMENT');
    check(pure.outcome === c.terminalOutcome, 'STRICT_TERMINAL_OUTCOME');
    for (const e of pure.events.filter((e) => e.type === 'SYNTAX_OBSERVATION')) {
      const source = c.sources.find((s) => s.sourceFileId === e.payload.sourceFileId);
      check(
        source && source.sourceFingerprint === e.payload.sourceFingerprint,
        'OBSERVATION_SOURCE',
      );
      const bytes = dataBytes(d, source.fixturePath),
        annotated = d.annotations.cases[n].sources.find(
          (s) => s.fixturePath === source.fixturePath,
        );
      check(annotated.anchors.length > 0, 'OBSERVATION_ANCHORED');
      function ranges(v) {
        if (!v || typeof v !== 'object') return;
        if (Object.hasOwn(v, 'startLine')) {
          check(v.sourceFileId === source.sourceFileId, 'RANGE_SOURCE_ID');
          const { startLine, startColumn, endLine, endColumn } = v;
          offsets(bytes, { startLine, startColumn, endLine, endColumn });
        }
        for (const x of Object.values(v))
          if (Array.isArray(x)) x.forEach(ranges);
          else ranges(x);
      }
      ranges(e.payload);
    }
  }
  const report = expectedReport(d);
  validateReport(report, d);
  return report;
}
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!direct || process.env.NODE_TEST_CONTEXT) {
  registerTests();
} else {
  try {
    check(process.argv.length === 2, 'NO_ARGUMENT_OVERRIDE');
    const report = await audit(loadInputs());
    const output = path.resolve(repo, workspace, 'reuse-report.json');
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(
      'Historical offline report created; 18 retained cases, no run qualification or numerical policy.',
    );
  } catch {
    console.error('HISTORICAL_REUSE_FAILED');
    process.exitCode = 1;
  }
}
