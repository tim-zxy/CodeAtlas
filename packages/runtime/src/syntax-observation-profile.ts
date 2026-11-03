import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateOperationPolicyData } from '@codeatlas/application';

type ObjectValue = Record<string, unknown>;
export class SyntaxAdmissionError extends Error {
  constructor(readonly code: 'INVALID_SYNTAX_PROFILE' | 'SYNTAX_PROFILE_NOT_ADMISSIBLE') {
    super(
      code === 'INVALID_SYNTAX_PROFILE'
        ? 'Invalid Syntax observation evidence'
        : 'No admissible reviewed Syntax observation profile',
    );
    this.name = 'SyntaxAdmissionError';
  }
}
interface Component {
  readonly observedPeakBytes: number;
  readonly fluctuationAllowanceBytes: number;
  readonly priorApprovalFloorBytes: null;
  readonly reservationBytes: number;
  readonly peakMethod: string;
  readonly peakUnits: 'bytes';
}
export interface SyntaxObservationProfile {
  readonly schemaVersion: 1;
  readonly purpose: 'SYNTAX_OBSERVATION';
  readonly status: 'PROVISIONAL_REVIEW_REQUIRED' | 'APPROVED';
  readonly policyRevision: 'p1-syntax-observation-high-water-range-v1';
  readonly environment: Readonly<Record<string, string>>;
  readonly corpus: Readonly<{
    revision: string;
    inputDigest: string;
    catalogDigest: string;
    oracleDigest: string;
    requestShapeDigest: string;
    sourceShapeDigest: string;
    resourceShapeDigest: string;
    caseIds: readonly string[];
  }>;
  readonly observations: readonly Readonly<ObjectValue>[];
  readonly components: Readonly<{ HOST: Component; NATIVE: Component }>;
  readonly reservationBytes: number;
  readonly evidence: Readonly<{
    reports: readonly EvidenceRef[];
    derivationDigest: string;
    calibrationOriginDigest: string;
    verificationRefs: readonly EvidenceRef[];
    review: Readonly<{
      decision: 'PENDING' | 'APPROVED';
      ref: string | null;
      digest: string | null;
    }>;
  }>;
}
interface EvidenceRef {
  readonly path: string;
  readonly sha256: string;
}
function check(value: unknown): asserts value {
  if (!value) throw new SyntaxAdmissionError('INVALID_SYNTAX_PROFILE');
}
function object(value: unknown, keys: readonly string[]): ObjectValue {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  const o = value as ObjectValue;
  check(Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k)));
  return o;
}
function text(value: unknown): asserts value is string {
  check(typeof value === 'string' && value.length > 0 && value.trim() === value);
}
function integer(value: unknown, positive = false): asserts value is number {
  check(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      !Object.is(value, -0) &&
      value >= (positive ? 1 : 0),
  );
}
function digest(value: unknown): void {
  check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}
function list(value: unknown): unknown[] {
  check(Array.isArray(value));
  return value;
}
function distinct(values: readonly unknown[]): void {
  check(new Set(values).size === values.length);
}
function relative(value: unknown): asserts value is string {
  text(value);
  check(
    !value.includes('\\') &&
      !value.includes(':') &&
      !value.includes('\0') &&
      !value.startsWith('/') &&
      !value.split('/').some((v) => !v || v === '.' || v === '..'),
  );
}
function refs(value: unknown): void {
  const items = list(value);
  for (const v of items) {
    const r = object(v, ['path', 'sha256']);
    relative(r.path);
    digest(r.sha256);
  }
  distinct(items.map((v) => (v as ObjectValue).path));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
export function parseSyntaxObservationProfile(value: unknown): SyntaxObservationProfile {
  try {
    validateOperationPolicyData(value);
    const p = object(value, [
      'schemaVersion',
      'purpose',
      'status',
      'policyRevision',
      'environment',
      'corpus',
      'observations',
      'components',
      'reservationBytes',
      'evidence',
    ]);
    check(
      p.schemaVersion === 1 &&
        p.purpose === 'SYNTAX_OBSERVATION' &&
        ['PROVISIONAL_REVIEW_REQUIRED', 'APPROVED'].includes(p.status as string) &&
        p.policyRevision === 'p1-syntax-observation-high-water-range-v1',
    );
    const env = object(p.environment, [
      'node',
      'v8',
      'platform',
      'arch',
      'zodVersion',
      'implementationDigest',
      'corpusRevision',
      'nativeBinaryDigest',
      'rustTarget',
      'rustToolchain',
      'cargoLockDigest',
      'javaGrammarVersion',
      'pythonGrammarVersion',
      'treeSitterVersion',
      'extractorVersion',
      'compatibilityVersion',
    ]);
    for (const v of Object.values(env)) text(v);
    for (const k of ['implementationDigest', 'nativeBinaryDigest', 'cargoLockDigest'])
      digest(env[k]);
    check(
      env.javaGrammarVersion === '0.23.5' &&
        env.pythonGrammarVersion === '0.25.0' &&
        env.treeSitterVersion === '0.27.0',
    );
    const corpus = object(p.corpus, [
      'revision',
      'inputDigest',
      'catalogDigest',
      'oracleDigest',
      'requestShapeDigest',
      'sourceShapeDigest',
      'resourceShapeDigest',
      'caseIds',
    ]);
    text(corpus.revision);
    check(corpus.revision === env.corpusRevision);
    for (const k of [
      'inputDigest',
      'catalogDigest',
      'oracleDigest',
      'requestShapeDigest',
      'sourceShapeDigest',
      'resourceShapeDigest',
    ])
      digest(corpus[k]);
    const cases = list(corpus.caseIds);
    check(cases.length > 0);
    cases.forEach(text);
    distinct(cases);
    const observations = list(p.observations);
    const components = object(p.components, ['HOST', 'NATIVE']);
    let total = 0;
    for (const component of ['HOST', 'NATIVE']) {
      const method =
        component === 'HOST'
          ? 'resourceUsage.maxRSS'
          : 'PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize';
      const c = object(components[component], [
        'observedPeakBytes',
        'fluctuationAllowanceBytes',
        'priorApprovalFloorBytes',
        'reservationBytes',
        'peakMethod',
        'peakUnits',
      ]);
      integer(c.observedPeakBytes, true);
      integer(c.fluctuationAllowanceBytes);
      integer(c.reservationBytes, true);
      check(
        c.priorApprovalFloorBytes === null && c.peakMethod === method && c.peakUnits === 'bytes',
      );
      const groups = new Map<string, Map<number, number>>();
      for (const caseId of cases as string[]) groups.set(caseId, new Map());
      for (const raw of observations) {
        const o = object(raw, [
          'caseId',
          'repetition',
          'component',
          'processId',
          'startedEpochMs',
          'finishedEpochMs',
          'peakBytes',
          'peakMethod',
          'peakUnits',
          'completeLifetime',
          'exitCode',
          'terminal',
          'checksum',
          'counts',
          'outcome',
          'expectedMatched',
          'command',
          'collectionConditions',
        ]);
        check(o.component === 'HOST' || o.component === 'NATIVE');
        if (o.component !== component) continue;
        text(o.caseId);
        integer(o.repetition, true);
        integer(o.processId, true);
        integer(o.startedEpochMs);
        integer(o.finishedEpochMs);
        integer(o.peakBytes, true);
        check(
          o.finishedEpochMs >= o.startedEpochMs &&
            o.repetition <= 5 &&
            o.peakMethod === method &&
            o.peakUnits === 'bytes' &&
            o.completeLifetime === true &&
            o.exitCode === 0 &&
            o.terminal === 'SYNTAX_COMPLETED' &&
            o.expectedMatched === true &&
            ['SUCCEEDED', 'PARTIAL'].includes(o.outcome as string),
        );
        digest(o.checksum);
        text(o.command);
        text(o.collectionConditions);
        const counts = object(o.counts, ['nodes', 'edges', 'syntax', 'coverage', 'diagnostics']);
        Object.values(counts).forEach((v) => integer(v));
        const group = groups.get(o.caseId);
        check(group && !group.has(o.repetition));
        group.set(o.repetition, o.peakBytes);
      }
      let peak = 0,
        allowance = 0;
      for (const group of groups.values()) {
        check(group.size === 5);
        const values = [...group.values()],
          high = Math.max(...values),
          low = Math.min(...values);
        peak = Math.max(peak, high);
        allowance = Math.max(allowance, high - low);
      }
      const reservation = peak + allowance;
      integer(reservation, true);
      check(
        c.observedPeakBytes === peak &&
          c.fluctuationAllowanceBytes === allowance &&
          c.reservationBytes === reservation,
      );
      total += reservation;
      integer(total, true);
    }
    integer(p.reservationBytes, true);
    check(p.reservationBytes === total);
    const e = object(p.evidence, [
      'reports',
      'derivationDigest',
      'calibrationOriginDigest',
      'verificationRefs',
      'review',
    ]);
    refs(e.reports);
    refs(e.verificationRefs);
    check(list(e.reports).length > 0);
    for (const k of ['derivationDigest', 'calibrationOriginDigest']) digest(e[k]);
    const review = object(e.review, ['decision', 'ref', 'digest']);
    if (p.status === 'APPROVED') {
      check(review.decision === 'APPROVED' && list(e.verificationRefs).length > 0);
      text(review.ref);
      digest(review.digest);
    } else
      check(
        review.decision === 'PENDING' &&
          review.ref === null &&
          review.digest === null &&
          list(e.verificationRefs).length === 0,
      );
    const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
    check(e.calibrationOriginDigest === sha(e.reports));
    check(
      e.derivationDigest ===
        sha({
          policyRevision: p.policyRevision,
          environment: p.environment,
          corpus: p.corpus,
          observations: p.observations,
          components: p.components,
          reservationBytes: p.reservationBytes,
          calibrationOriginDigest: e.calibrationOriginDigest,
        }),
    );
    const all = [...list(e.reports), ...list(e.verificationRefs)] as ObjectValue[];
    distinct(all.map((r) => r.path));
    distinct(all.map((r) => r.sha256));
    return freeze(JSON.parse(JSON.stringify(p)) as SyntaxObservationProfile);
  } catch {
    throw new SyntaxAdmissionError('INVALID_SYNTAX_PROFILE');
  }
}
/** Pure matching of supplied evidence, not installation or authentication of a profile. */
export function matchSyntaxObservationProfile(
  value: unknown,
  environment: unknown,
  corpus: unknown,
  memoryBudgetBytes: number,
): number {
  try {
    const p = parseSyntaxObservationProfile(value);
    integer(memoryBudgetBytes, true);
    check(
      p.status === 'APPROVED' &&
        isDeepStrictEqual(p.environment, environment) &&
        isDeepStrictEqual(p.corpus, corpus) &&
        memoryBudgetBytes >= p.reservationBytes,
    );
    return p.reservationBytes;
  } catch {
    throw new SyntaxAdmissionError('SYNTAX_PROFILE_NOT_ADMISSIBLE');
  }
}
export interface SyntaxProfileLoadLimits {
  readonly maxInputBytes: number;
  readonly maxReportBytes: number;
  readonly maxReports: number;
}
async function boundedFile(root: string, name: string, limit: number): Promise<Buffer> {
  relative(name);
  const full = path.join(root, ...name.split('/'));
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    check(!(await lstat(current)).isSymbolicLink());
  }
  check((await realpath(full)) === full);
  const file = await open(full, 'r');
  try {
    const before = await file.stat();
    check(before.isFile() && before.size <= limit);
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const r = await file.read(bytes, length, bytes.length - length, null);
      if (r.bytesRead === 0) break;
      length += r.bytesRead;
    }
    const after = await file.stat(),
      named = await lstat(full);
    check(
      length === before.size &&
        length <= limit &&
        !named.isSymbolicLink() &&
        before.ino === named.ino &&
        before.dev === named.dev &&
        before.mtimeMs === named.mtimeMs &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        (await realpath(full)) === full,
    );
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}
/** Verifies confined raw evidence bytes; an approved-looking external file is not a catalog entry. */
export async function loadSyntaxObservationProfile(
  filePath: string,
  limits: SyntaxProfileLoadLimits,
): Promise<SyntaxObservationProfile> {
  try {
    validateOperationPolicyData(limits);
    object(limits, ['maxInputBytes', 'maxReportBytes', 'maxReports']);
    for (const n of Object.values(limits)) integer(n, true);
    const originalRoot = path.dirname(path.resolve(filePath));
    check(!(await lstat(originalRoot)).isSymbolicLink());
    const root = await realpath(originalRoot);
    const bytes = await boundedFile(root, path.basename(filePath), limits.maxInputBytes);
    const profile = parseSyntaxObservationProfile(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    const refs = [...profile.evidence.reports, ...profile.evidence.verificationRefs];
    check(refs.length <= limits.maxReports);
    const calibration: unknown[] = [],
      verifiedCases = new Set<string>();
    for (const ref of refs) {
      const b = await boundedFile(root, ref.path, limits.maxReportBytes);
      check(createHash('sha256').update(b).digest('hex') === ref.sha256);
      const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b));
      validateOperationPolicyData(raw);
      if (profile.evidence.reports.some((r) => r.path === ref.path)) {
        const report = object(raw, [
          'schemaVersion',
          'purpose',
          'environment',
          'corpus',
          'observations',
        ]);
        check(
          report.schemaVersion === 1 &&
            report.purpose === 'SYNTAX_OBSERVATION_CALIBRATION' &&
            isDeepStrictEqual(report.environment, profile.environment) &&
            isDeepStrictEqual(report.corpus, profile.corpus),
        );
        calibration.push(...list(report.observations));
      } else {
        const report = object(raw, [
          'schemaVersion',
          'purpose',
          'calibrationOriginDigest',
          'environment',
          'corpus',
          'observations',
        ]);
        check(
          report.schemaVersion === 1 &&
            report.purpose === 'SYNTAX_OBSERVATION_VERIFICATION' &&
            report.calibrationOriginDigest === profile.evidence.calibrationOriginDigest &&
            isDeepStrictEqual(report.environment, profile.environment) &&
            isDeepStrictEqual(report.corpus, profile.corpus),
        );
        for (const item of list(report.observations)) {
          const v = object(item, [
            'caseId',
            'expectedMatched',
            'terminal',
            'sourceDigest',
            'oracleDigest',
            'outputDigest',
            'peakTranscriptDigest',
            'components',
          ]);
          text(v.caseId);
          check(
            v.expectedMatched === true &&
              v.terminal === 'SYNTAX_COMPLETED' &&
              !verifiedCases.has(v.caseId),
          );
          for (const k of ['sourceDigest', 'oracleDigest', 'outputDigest', 'peakTranscriptDigest'])
            digest(v[k]);
          const measured = object(v.components, ['HOST', 'NATIVE']);
          for (const kind of ['HOST', 'NATIVE'] as const) {
            const peak = object(measured[kind], [
              'peakBytes',
              'peakMethod',
              'peakUnits',
              'completeLifetime',
              'processId',
              'startedEpochMs',
              'finishedEpochMs',
            ]);
            integer(peak.peakBytes, true);
            integer(peak.processId, true);
            integer(peak.startedEpochMs);
            integer(peak.finishedEpochMs);
            check(
              peak.finishedEpochMs >= peak.startedEpochMs &&
                peak.completeLifetime === true &&
                peak.peakUnits === 'bytes' &&
                peak.peakMethod === profile.components[kind].peakMethod &&
                peak.peakBytes <= profile.components[kind].reservationBytes,
            );
          }
          verifiedCases.add(v.caseId);
        }
      }
    }
    check(isDeepStrictEqual(calibration, profile.observations));
    if (profile.status === 'APPROVED') {
      const expected = profile.corpus.caseIds.map(
        (id) => 'holdout:' + id.replace(/^calibration:/, ''),
      );
      check(
        expected.length === verifiedCases.size && expected.every((id) => verifiedCases.has(id)),
      );
    }
    return profile;
  } catch {
    throw new SyntaxAdmissionError('INVALID_SYNTAX_PROFILE');
  }
}
