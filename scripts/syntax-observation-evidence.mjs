import { lstat, realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual, types } from 'node:util';
import {
  parseSyntaxObservationRequest,
  validateSyntaxObservationStream,
  NATIVE_CLIENT_HARD_LIMITS,
} from '../packages/providers/dist/index.js';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
const fail = (code) => {
  const e = new Error(code);
  e.code = code;
  throw e;
};
const check = (v, code) => {
  if (!v) fail(code);
};
const object = (v, keys, code) => {
  check(v && typeof v === 'object' && !Array.isArray(v), code);
  check(Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)), code);
  return v;
};
const integer = (v, positive, code) =>
  check(Number.isSafeInteger(v) && !Object.is(v, -0) && v >= (positive ? 1 : 0), code);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const freeze = (v) => {
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
};
/** Validates supplied OS-counter transcript, never authenticates acquisition or a process. */
export function validateSyntaxPeakTranscript(value) {
  const code = 'INVALID_SYNTAX_PEAK_TRANSCRIPT';
  try {
    validateOperationPolicyData(value);
    const p = object(
      value,
      [
        'schemaVersion',
        'component',
        'processId',
        'startedEpochMs',
        'finishedEpochMs',
        'peakMethod',
        'peakUnits',
        'completeLifetime',
        'samples',
      ],
      code,
    );
    check(
      p.schemaVersion === 1 &&
        ['HOST', 'NATIVE'].includes(p.component) &&
        p.peakUnits === 'bytes' &&
        p.completeLifetime === true,
      code,
    );
    check(
      p.peakMethod ===
        (p.component === 'HOST'
          ? 'resourceUsage.maxRSS'
          : 'PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize'),
      code,
    );
    integer(p.processId, true, code);
    integer(p.startedEpochMs, false, code);
    integer(p.finishedEpochMs, false, code);
    check(
      p.finishedEpochMs >= p.startedEpochMs && Array.isArray(p.samples) && p.samples.length > 0,
      code,
    );
    let peak = 0,
      epoch = p.startedEpochMs;
    for (let i = 0; i < p.samples.length; i++) {
      const s = object(p.samples[i], ['processId', 'epochMs', 'peakBytes', 'phase'], code);
      integer(s.epochMs, false, code);
      integer(s.peakBytes, true, code);
      check(
        s.processId === p.processId &&
          s.epochMs >= epoch &&
          s.epochMs <= p.finishedEpochMs &&
          s.peakBytes >= peak,
        code,
      );
      check(s.phase === (i === p.samples.length - 1 ? 'FINAL' : 'RUNNING'), code);
      if (s.phase === 'FINAL') check(s.epochMs === p.finishedEpochMs, code);
      peak = s.peakBytes;
      epoch = s.epochMs;
    }
    return freeze({
      component: p.component,
      processId: p.processId,
      peakBytes: peak,
      peakMethod: p.peakMethod,
      peakUnits: 'bytes',
      completeLifetime: true,
    });
  } catch {
    fail(code);
  }
}
const classes = [
  'python-static',
  'java-owner',
  'mixed-provisional',
  'dynamic-malformed',
  'nested-source',
  'bounded-output',
  'changed-only-restart',
  'initial-absent',
];
/** Loads owned offline data only. No spawn, parser, calibration or profile installation. */
export async function loadSyntaxObservationCorpus(rootValue, limits) {
  const code = 'INVALID_SYNTAX_CORPUS';
  try {
    validateOperationPolicyData(limits);
    object(limits, ['maxCatalogBytes', 'maxFileBytes', 'maxFiles'], code);
    Object.values(limits).forEach((v) => integer(v, true, code));
    const root = await realpath(rootValue);
    check(!(await lstat(rootValue)).isSymbolicLink(), code);
    let fileCount = 0;
    const sources = [],
      oracles = [];
    const identities = new Set();
    async function bytes(relative, max) {
      check(
        typeof relative === 'string' &&
          !relative.includes('\\') &&
          !relative.includes(':') &&
          !relative.includes('\0') &&
          !relative.startsWith('/') &&
          !relative.split('/').some((c) => !c || c === '.' || c === '..'),
        code,
      );
      let current = root;
      for (const c of relative.split('/')) {
        current = path.join(current, c);
        check(!(await lstat(current)).isSymbolicLink(), code);
      }
      check((await realpath(current)) === current, code);
      const f = await open(current, 'r');
      try {
        const before = await f.stat();
        check(before.isFile() && before.size <= max, code);
        const b = Buffer.alloc(before.size + 1);
        let n = 0;
        while (n < b.length) {
          const r = await f.read(b, n, b.length - n, null);
          if (!r.bytesRead) break;
          n += r.bytesRead;
        }
        const after = await f.stat();
        check(
          n === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs,
          code,
        );
        return b.subarray(0, n);
      } finally {
        await f.close();
      }
    }
    const raw = await bytes('catalog.json', limits.maxCatalogBytes),
      catalog = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    validateOperationPolicyData(catalog);
    object(catalog, ['schemaVersion', 'kind', 'revision', 'calibration', 'holdout'], code);
    check(
      catalog.schemaVersion === 1 &&
        catalog.kind === 'OFFLINE_UNEXECUTED' &&
        catalog.revision === 'p1-native-syntax-observation-v1',
      code,
    );
    for (const mode of ['calibration', 'holdout']) {
      const cases = catalog[mode];
      check(Array.isArray(cases) && cases.length === classes.length, code);
      const seen = new Set();
      for (const item of cases) {
        object(item, ['id', 'classId', 'sources', 'oracle', 'requestShape', 'resourceShape'], code);
        check(
          item.id === mode + ':' + item.classId &&
            classes.includes(item.classId) &&
            !seen.has(item.classId),
          code,
        );
        seen.add(item.classId);
        check(Array.isArray(item.sources) && item.sources.length > 0, code);
        object(
          item.requestShape,
          ['ownerBinding', 'expectedActivation', 'changedSourceFiles', 'removedSourceFiles'],
          code,
        );
        object(item.resourceShape, ['kind', 'productionDefaults', 'qualification'], code);
        check(
          item.requestShape.ownerBinding === 'PROVISIONAL_CODE' &&
            ['ABSENT', 'PRESENT'].includes(item.requestShape.expectedActivation) &&
            item.resourceShape.kind === 'EXPLICIT_CALLER_LIMITS_REQUIRED' &&
            item.resourceShape.productionDefaults === false &&
            item.resourceShape.qualification === 'NOT_EXECUTED',
          code,
        );
        let oracle;
        for (const [ref, collection] of [
          ...item.sources.map((ref) => [ref, sources]),
          [item.oracle, oracles],
        ]) {
          object(ref, ['path', 'sha256'], code);
          check(
            typeof ref.sha256 === 'string' &&
              /^[a-f0-9]{64}$/.test(ref.sha256) &&
              !identities.has(ref.path) &&
              ref.path.startsWith(mode + '/' + item.classId + '/'),
            code,
          );
          identities.add(ref.path);
          check(++fileCount <= limits.maxFiles, code);
          const b = await bytes(ref.path, limits.maxFileBytes);
          check(sha(b) === ref.sha256, code);
          collection.push({ path: ref.path, sha256: ref.sha256, bytes: b.length });
          if (collection === oracles)
            oracle = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
        }
        check(
          JSON.stringify(item.requestShape.changedSourceFiles) ===
            JSON.stringify(item.sources.map((s) => s.path)),
          code,
        );
        check(
          Array.isArray(item.requestShape.removedSourceFiles) &&
            item.requestShape.removedSourceFiles.every(
              (s) =>
                typeof s === 'string' &&
                !s.includes('..') &&
                !s.includes('\\') &&
                !s.includes(':') &&
                !s.startsWith('/'),
            ),
          code,
        );

        check(
          oracle.kind === 'INDEPENDENT_LITERAL_PROBES_UNEXECUTED' &&
            Array.isArray(oracle.probes) &&
            oracle.probes.length > 0,
          code,
        );
      }
    }
    const calibrationHashes = new Set(
      sources.filter((s) => s.path.startsWith('calibration/')).map((s) => s.sha256),
    );
    check(
      !sources.some((s) => s.path.startsWith('holdout/') && calibrationHashes.has(s.sha256)),
      code,
    );
    sources.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    oracles.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    const all = [...catalog.calibration, ...catalog.holdout];
    const identity = {
      revision: catalog.revision,
      inputDigest: sha(Buffer.from(JSON.stringify(sources))),
      catalogDigest: sha(raw),
      oracleDigest: sha(Buffer.from(JSON.stringify(oracles))),
      requestShapeDigest: sha(
        Buffer.from(JSON.stringify(all.map((x) => ({ id: x.id, ...x.requestShape })))),
      ),
      sourceShapeDigest: sha(
        Buffer.from(JSON.stringify(sources.map((x) => ({ path: x.path, bytes: x.bytes })))),
      ),
      resourceShapeDigest: sha(
        Buffer.from(JSON.stringify(all.map((x) => ({ id: x.id, ...x.resourceShape })))),
      ),
      caseIds: catalog.calibration.map((x) => x.id),
    };
    return freeze({ catalog, identity });
  } catch {
    fail(code);
  }
}

/** Full contract comparison only; neither oracle provenance nor run/profile authority. */
export function compareSyntaxObservationOutput(requestValue, actualBytes, oracleBytes) {
  let request;
  try {
    request = parseSyntaxObservationRequest(requestValue);
  } catch {
    fail('INVALID_SYNTAX_OUTPUT_REQUEST');
  }
  const byteLimit = Math.min(
    request.payload.resourceBudget.maxOutputBytes,
    NATIVE_CLIENT_HARD_LIMITS.maxStdoutBytes,
  );
  const eventLimit = Math.min(
    request.payload.resourceBudget.maxEvents,
    NATIVE_CLIENT_HARD_LIMITS.maxEvents,
  );
  function validate(bytes, code) {
    try {
      check(
        !types.isProxy(bytes) &&
          Buffer.isBuffer(bytes) &&
          Object.getPrototypeOf(bytes) === Buffer.prototype,
        code,
      );
      check(bytes.byteLength > 0 && bytes.byteLength <= byteLimit, code);
      const lines = [];
      let start = 0;
      while (start < bytes.byteLength) {
        const lf = bytes.indexOf(10, start);
        check(
          lf >= 0 &&
            lf + 1 - start <= NATIVE_CLIENT_HARD_LIMITS.maxLineBytes &&
            lines.length < eventLimit,
          code,
        );
        lines.push(bytes.subarray(start, lf + 1));
        start = lf + 1;
      }
      return validateSyntaxObservationStream(request, lines);
    } catch {
      fail(code);
    }
  }
  const oracle = validate(oracleBytes, 'INVALID_SYNTAX_OUTPUT_ORACLE');
  const actual = validate(actualBytes, 'INVALID_SYNTAX_OUTPUT');
  // Checksums bind different valid JSON byte serializations. Both were verified above;
  // every other field and the order of events/arrays must match exactly.
  const semantic = (events) =>
    events.map((event) => {
      if (event.type !== 'SYNTAX_COMPLETED') return event;
      const { checksum: _, ...payload } = event.payload;
      return { ...event, payload };
    });
  check(
    isDeepStrictEqual(semantic(actual.events), semantic(oracle.events)),
    'SYNTAX_OUTPUT_MISMATCH',
  );
  return freeze({
    kind: 'CONTRACT_ORACLE_MATCH_ONLY',
    actualSha256: sha(actualBytes),
    oracleSha256: sha(oracleBytes),
    outcome: actual.outcome,
    counts: actual.counts,
  });
}
