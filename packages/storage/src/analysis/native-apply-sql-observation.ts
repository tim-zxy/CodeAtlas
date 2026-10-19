/** Private synchronous Native Apply diagnostics, never an admission API. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';

export type NativeSqlFamily =
  'BASELINE_READ' | 'PREPARATION' | 'COMPLETION' | 'NORMALIZE' | 'SEAL' | 'APPLY';
export type NativeSqlRole = 'MAIN' | 'COMPETITOR' | 'RETRY';
type SqlDisposition = 'OBSERVED' | 'PROVEN_NOT_REACHED' | 'PROVEN_NO_TEXT';
export interface NativeSqlRequirement {
  readonly family: NativeSqlFamily;
  readonly role: NativeSqlRole;
  readonly disposition: SqlDisposition;
}
declare const sqlDomainBrand: unique symbol;
export interface NativeSqlDomainHandle {
  readonly [sqlDomainBrand]: true;
}
export interface NativeSqlLifetimeEvidence {
  readonly scope: 'COMPLETE_SQL_SOURCE_LIFETIME_ONLY';
  readonly coverageComplete: boolean;
  readonly retainedSqlBytes: number | null;
  readonly retainedSqlStringChargeBytes: number | null;
  readonly coverage: readonly Readonly<{
    family: NativeSqlFamily;
    role: NativeSqlRole;
    disposition: SqlDisposition | 'UNKNOWN';
    cause: string | null;
  }>[];
  readonly reasons: readonly string[];
}
interface SqlCoverage {
  family: NativeSqlFamily;
  role: NativeSqlRole;
  expected: SqlDisposition;
  disposition: SqlDisposition | 'UNKNOWN';
  cause: string | null;
}
interface SqlLifetime {
  active: boolean;
  carriers: WeakMap<object, NativeSqlDomainHandle>;
  domains: Map<
    NativeSqlDomainHandle,
    { family: NativeSqlFamily; role: NativeSqlRole; bytes: number }
  >;
  coverage: Map<string, SqlCoverage>;
  current: number;
  peak: number;
  reasons: Set<string>;
  captureFailed: boolean;
  captureFailure: unknown;
}
const sqlLifetimeContext = new AsyncLocalStorage<SqlLifetime>();
const sqlRoleContext = new AsyncLocalStorage<NativeSqlRole>();
type RawSqlFamily = Exclude<NativeSqlFamily, 'BASELINE_READ' | 'PREPARATION'>;
const rawSqlFamilyContext = new AsyncLocalStorage<{
  family: RawSqlFamily;
  role: NativeSqlRole;
  lifetime: SqlLifetime | undefined;
  emptyReads: number;
  skippedReads: number;
  selected: boolean;
  targetRevisionRefused: boolean;
}>();
const emptyPatchQueries = {
  COMPLETION: ['DIAGNOSTIC', 'COMPLETION_EVENT', 'COMPLETION_REMOVAL'],
  NORMALIZE: ['SOURCE_FILE', 'REMOVE_NODE', 'REMOVE_EDGE', 'UPSERT_NODE', 'UPSERT_EDGE'],
} as const;

/** Original query reached IteratorComplete without any row, not an absent callback. */
function ownedPatchQueryScope() {
  const scope = rawSqlFamilyContext.getStore();
  if (!scope || (scope.family !== 'COMPLETION' && scope.family !== 'NORMALIZE')) return;
  if (scope.role !== nativeSqlSourceRole() || scope.lifetime !== sqlLifetimeContext.getStore()) {
    changeLifetime(() => {
      throw new Error('Foreign empty SQL query scope');
    });
    return;
  }
  return scope;
}

export function nativeSqlEmptyPatchRead(query: string): void {
  const scope = ownedPatchQueryScope();
  if (!scope || (scope.family !== 'COMPLETION' && scope.family !== 'NORMALIZE')) return;
  const index = (emptyPatchQueries[scope.family] as readonly string[]).indexOf(query);
  if (index !== -1) scope.emptyReads |= 1 << index;
}

/** Only the validated PARTIAL branch may prove its two confirmation scans uncalled. */
export function nativeSqlPartialCompletion(): void {
  const scope = ownedPatchQueryScope();
  if (!scope) return;
  if (scope.family !== 'COMPLETION') {
    changeLifetime(() => {
      throw new Error('PARTIAL proof outside Completion');
    });
    return;
  }
  scope.skippedReads |= 6;
}

/** The original numeric target-revision rejection precedes activation TEXT reads. */
export function nativeSqlTargetRevisionRefusal(): void {
  const scope = rawSqlFamilyContext.getStore();
  if (!scope || nativeSqlSourceRole() === null) return;
  if (
    (scope.family !== 'SEAL' && scope.family !== 'APPLY') ||
    scope.role !== nativeSqlSourceRole() ||
    scope.lifetime !== sqlLifetimeContext.getStore()
  ) {
    changeLifetime(() => {
      throw new Error('Foreign target-revision refusal scope');
    });
    return;
  }
  scope.targetRevisionRefused = true;
}

/** The family labels a synchronous source call, not an allocation or admission event. */
export function withNativeSqlSourceFamily<T>(family: RawSqlFamily, operation: () => T): T {
  const role = nativeSqlSourceRole();
  if (role === null) return operation();
  const scope = {
    family,
    role,
    lifetime: sqlLifetimeContext.getStore(),
    emptyReads: 0,
    skippedReads: 0,
    selected: false,
    targetRevisionRefused: false,
  };
  let completed = false;
  let failed = false;
  try {
    const value = rawSqlFamilyContext.run(scope, () => {
      if (active) {
        if (active.captureFailed)
          changeLifetime((owner) =>
            lifetimeFailure(owner, 'RAW_SOURCE_CAPTURE_FAILURE', active!.captureFailure),
          );
        return operation();
      }
      const capture = observeNativeApplySql(() => {}, operation);
      if (capture.captureFailed)
        changeLifetime((owner) =>
          lifetimeFailure(owner, 'RAW_SOURCE_CAPTURE_FAILURE', capture.captureFailure),
        );
      if (capture.threw) throw capture.error;
      return capture.value as T;
    });
    completed = !types.isPromise(value);
    return value;
  } catch (failure) {
    failed = true;
    throw failure;
  } finally {
    if (!scope.selected && failed && scope.targetRevisionRefused)
      proveNativeSqlDisposition(
        family,
        role,
        'PROVEN_NO_TEXT',
        'Numeric target-revision refusal before activation TEXT acquisition',
      );
    if (!scope.selected && (family === 'COMPLETION' || family === 'NORMALIZE')) {
      if (
        completed &&
        (scope.emptyReads | scope.skippedReads) === (1 << emptyPatchQueries[family].length) - 1
      )
        proveNativeSqlDisposition(
          family,
          role,
          'PROVEN_NO_TEXT',
          'All required patch TEXT queries empty or guarded not reached',
        );
      else
        changeLifetime((owner) => {
          const coverage = owner.coverage.get(`${family}:${role}`);
          if (coverage?.expected === 'PROVEN_NO_TEXT')
            owner.reasons.add('UNPROVEN_EMPTY_QUERY_SET');
        });
    }
  }
}

function beginRawSqlSource(bytes: number): NativeSqlDomainHandle | null {
  const role = nativeSqlSourceRole();
  if (role === null) return null;
  const scope = rawSqlFamilyContext.getStore();
  if (scope === undefined) {
    changeLifetime(() => {
      throw new Error('Unclassified raw SQL source');
    });
    return null;
  }
  scope.selected = true;
  return beginNativeSqlSourceDomain(scope.family, role, bytes);
}

/** MAIN is the selected invocation; competitor/retry callers enter explicit private scopes. */
export function nativeSqlSourceRole(): NativeSqlRole | null {
  return sqlLifetimeContext.getStore()?.active ? (sqlRoleContext.getStore() ?? 'MAIN') : null;
}

export function withNativeSqlSourceRole<T>(role: NativeSqlRole, operation: () => T): T {
  changeLifetime(() => {
    if (!sqlRoles.includes(role)) throw new Error('Unknown SQL source role');
  });
  return sqlRoleContext.run(role, operation);
}

/** Weak operation-local association only: no fields are added to application objects. */
export function bindNativeSqlSourceDomain(
  value: object,
  handle: NativeSqlDomainHandle | null,
): void {
  if (handle === null) return;
  changeLifetime((owner) => {
    sourceDomain(owner, handle);
    const previous = owner.carriers.get(value);
    if (previous !== undefined && previous !== handle)
      throw new Error('Conflicting SQL source carrier');
    owner.carriers.set(value, handle);
  });
}

export function nativeSqlSourceDomainFor(value: object): NativeSqlDomainHandle | null {
  let handle: NativeSqlDomainHandle | null = null;
  changeLifetime((owner) => {
    const candidate = owner.carriers.get(value);
    if (candidate === undefined) return;
    const domain = sourceDomain(owner, candidate);
    if (domain.role !== nativeSqlSourceRole()) throw new Error('Foreign SQL source role');
    handle = candidate;
  });
  return handle;
}

/** Only the actual owning finally may settle a retained read/preparation carrier. */
export function endNativeSqlSourceFor(value: object): void {
  const handle = nativeSqlSourceDomainFor(value);
  if (handle !== null) endNativeSqlSourceDomain(handle);
}
const sqlFamilies: readonly string[] = [
  'BASELINE_READ',
  'PREPARATION',
  'COMPLETION',
  'NORMALIZE',
  'SEAL',
  'APPLY',
];
const sqlRoles: readonly string[] = ['MAIN', 'COMPETITOR', 'RETRY'];
const sqlDispositions: readonly string[] = ['OBSERVED', 'PROVEN_NOT_REACHED', 'PROVEN_NO_TEXT'];

function lifetimeFailure(owner: SqlLifetime, reason: string, failure: unknown): void {
  owner.reasons.add(reason);
  if (!owner.captureFailed) {
    owner.captureFailed = true;
    owner.captureFailure = failure;
  }
}

/** Diagnostics cannot replace the original workload result, including falsy throws. */
function changeLifetime(change: (owner: SqlLifetime) => void): void {
  const owner = sqlLifetimeContext.getStore();
  if (!owner?.active) return;
  try {
    change(owner);
  } catch (failure) {
    lifetimeFailure(owner, 'INVALID_SOURCE_EVENT', failure);
  }
}

function sourceCoverage(
  owner: SqlLifetime,
  family: NativeSqlFamily,
  role: NativeSqlRole,
): SqlCoverage {
  if (!sqlFamilies.includes(family) || !sqlRoles.includes(role))
    throw new Error('Unknown SQL source family or role');
  const coverage = owner.coverage.get(`${family}:${role}`);
  if (!coverage) throw new Error('Unclassified SQL source family or role');
  return coverage;
}

function recordSqlDisposition(
  coverage: SqlCoverage,
  disposition: SqlDisposition,
  cause: string | null,
): void {
  if (
    coverage.expected !== disposition ||
    (coverage.disposition !== 'UNKNOWN' && coverage.disposition !== disposition)
  )
    throw new Error('Conflicting SQL source disposition');
  coverage.disposition = disposition;
  coverage.cause = cause;
}

function checkSqlBytes(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(2 * bytes))
    throw new Error('Unsafe SQL source census');
}

function replaceLifetimeTotal(owner: SqlLifetime, previous: number, next: number): void {
  checkSqlBytes(next);
  const total = owner.current - previous + next;
  checkSqlBytes(total);
  owner.current = total;
  owner.peak = Math.max(owner.peak, total);
}

/** Caller proves the selected source fields; equal-valued independent reads get distinct handles. */
export function beginNativeSqlSourceDomain(
  family: NativeSqlFamily,
  role: NativeSqlRole,
  bytes: number,
): NativeSqlDomainHandle | null {
  let handle: NativeSqlDomainHandle | null = null;
  changeLifetime((owner) => {
    const coverage = sourceCoverage(owner, family, role);
    checkSqlBytes(bytes);
    recordSqlDisposition(coverage, 'OBSERVED', null);
    replaceLifetimeTotal(owner, 0, bytes);
    handle = Object.freeze({}) as NativeSqlDomainHandle;
    owner.domains.set(handle, { family, role, bytes });
  });
  return handle;
}

function sourceDomain(owner: SqlLifetime, handle: NativeSqlDomainHandle | null) {
  const domain = handle === null ? undefined : owner.domains.get(handle);
  if (!domain) throw new Error('Foreign, missing or settled SQL source handle');
  return domain;
}

export function replaceNativeSqlSourceDomain(
  handle: NativeSqlDomainHandle | null,
  bytes: number,
): void {
  changeLifetime((owner) => {
    const domain = sourceDomain(owner, handle);
    replaceLifetimeTotal(owner, domain.bytes, bytes);
    domain.bytes = bytes;
  });
}

/** Transfer retains the same selected source contribution, with no donor-plus-receiver sum. */
export function transferNativeSqlSourceDomain(
  handle: NativeSqlDomainHandle | null,
  family: NativeSqlFamily,
  role: NativeSqlRole,
): void {
  changeLifetime((owner) => {
    const domain = sourceDomain(owner, handle);
    if (domain.family === family && domain.role === role)
      throw new Error('Duplicate SQL source transfer');
    const coverage = sourceCoverage(owner, family, role);
    recordSqlDisposition(coverage, 'OBSERVED', null);
    domain.family = family;
    domain.role = role;
  });
}

export function endNativeSqlSourceDomain(handle: NativeSqlDomainHandle | null): void {
  changeLifetime((owner) => {
    const domain = sourceDomain(owner, handle);
    replaceLifetimeTotal(owner, domain.bytes, 0);
    owner.domains.delete(handle!);
  });
}

export function proveNativeSqlDisposition(
  family: NativeSqlFamily,
  role: NativeSqlRole,
  disposition: Exclude<SqlDisposition, 'OBSERVED'>,
  cause: string,
): void {
  changeLifetime((owner) => {
    if (
      (disposition !== 'PROVEN_NOT_REACHED' && disposition !== 'PROVEN_NO_TEXT') ||
      typeof cause !== 'string' ||
      cause.trim().length === 0
    )
      throw new Error('Missing positive SQL source disposition proof');
    recordSqlDisposition(sourceCoverage(owner, family, role), disposition, cause);
  });
}

/** Private operation-local scalar ledger, not physical allocation or Stage admission accounting. */
export async function observeNativeSqlLifetime<T>(
  operation: () => T | Promise<T>,
  requirements: readonly NativeSqlRequirement[],
): Promise<{
  value: T | undefined;
  error: unknown;
  threw: boolean;
  captureFailed: boolean;
  captureFailure: unknown;
  evidence: NativeSqlLifetimeEvidence;
}> {
  const owner: SqlLifetime = {
    active: true,
    carriers: new WeakMap(),
    domains: new Map(),
    coverage: new Map(),
    current: 0,
    peak: 0,
    reasons: new Set(),
    captureFailed: false,
    captureFailure: undefined,
  };
  try {
    if (!Array.isArray(requirements) || requirements.length === 0 || requirements.length > 18)
      throw new Error('Missing or invalid SQL source requirements');
    for (const requirement of requirements) {
      const keys = Reflect.ownKeys(requirement);
      if (
        keys.length !== 3 ||
        !keys.every(
          (key) => typeof key === 'string' && ['family', 'role', 'disposition'].includes(key),
        )
      )
        throw new Error('Unexpected SQL source requirement property');
      const { family, role, disposition } = requirement;
      const key = `${family}:${role}`;
      if (
        !sqlFamilies.includes(family) ||
        !sqlRoles.includes(role) ||
        !sqlDispositions.includes(disposition) ||
        owner.coverage.has(key)
      )
        throw new Error('Invalid or duplicate SQL source requirement');
      owner.coverage.set(key, {
        family,
        role,
        expected: disposition,
        disposition: 'UNKNOWN',
        cause: null,
      });
    }
  } catch (failure) {
    lifetimeFailure(owner, 'INVALID_REQUIREMENTS', failure);
  }
  return sqlRoleContext.run('MAIN', () =>
    sqlLifetimeContext.run(owner, async () => {
      let value: T | undefined;
      let error: unknown;
      let threw = false;
      try {
        value = await operation();
      } catch (failure) {
        threw = true;
        error = failure;
      } finally {
        owner.active = false;
        if (owner.domains.size !== 0)
          lifetimeFailure(
            owner,
            'UNSETTLED_SOURCE_DOMAINS',
            new Error('Unsettled SQL source domains'),
          );
        owner.domains.clear();
      }
      if ([...owner.coverage.values()].some((item) => item.disposition === 'UNKNOWN'))
        owner.reasons.add('MISSING_SOURCE_COVERAGE');
      const coverageComplete = owner.reasons.size === 0;
      const evidence: NativeSqlLifetimeEvidence = Object.freeze({
        scope: 'COMPLETE_SQL_SOURCE_LIFETIME_ONLY',
        coverageComplete,
        retainedSqlBytes: coverageComplete ? owner.peak : null,
        retainedSqlStringChargeBytes: coverageComplete ? 2 * owner.peak : null,
        coverage: Object.freeze(
          [...owner.coverage.values()].map(({ family, role, disposition, cause }) =>
            Object.freeze({ family, role, disposition, cause }),
          ),
        ),
        reasons: Object.freeze([...owner.reasons]),
      });
      return {
        value,
        error,
        threw,
        captureFailed: owner.captureFailed,
        captureFailure: owner.captureFailure,
        evidence,
      };
    }),
  );
}

export interface NativeStageBudgetComponents {
  readonly scope: 'STAGE_BUDGET_COMPONENTS_ONLY';
  readonly source:
    | 'ROW_PREFLIGHT'
    | 'ROW_INSERT_ADMISSION'
    | 'COMPLETION_ADMISSION'
    | 'TOKEN_ADMISSION'
    | 'SEAL_ACTIVE_ADMISSION'
    | 'APPLY_ACTIVE_ADMISSION'
    | 'RETAINED_CANDIDATE_ADMISSION'
    | 'SEAL_RESULT_ADMISSION';
  readonly stageSqlBytes: number;
  readonly additionalSqlAllowanceBytes: number;
  /** Existing pending/context/scalar budget, not measured workspace or heap. */
  readonly otherBudgetChargeBytes: number;
  readonly resultCopyChargeBytes: number;
}

/** Shared private validation for checkpoint delivery and offline artifact consumption. */
export function validateNativeStageBudgetComponents(
  parts: NativeStageBudgetComponents | null,
  sqlBytes: number,
  stringChargeBytes: number,
): Readonly<NativeStageBudgetComponents> | null {
  if (parts === null) return null;
  const sources = [
    'ROW_PREFLIGHT',
    'ROW_INSERT_ADMISSION',
    'COMPLETION_ADMISSION',
    'TOKEN_ADMISSION',
    'SEAL_ACTIVE_ADMISSION',
    'APPLY_ACTIVE_ADMISSION',
    'RETAINED_CANDIDATE_ADMISSION',
    'SEAL_RESULT_ADMISSION',
  ];
  const sql = parts.stageSqlBytes + parts.additionalSqlAllowanceBytes;
  const mixed = 2 * sql + parts.otherBudgetChargeBytes + parts.resultCopyChargeBytes;
  if (
    parts.scope !== 'STAGE_BUDGET_COMPONENTS_ONLY' ||
    !sources.includes(parts.source) ||
    ![
      parts.stageSqlBytes,
      parts.additionalSqlAllowanceBytes,
      parts.otherBudgetChargeBytes,
      parts.resultCopyChargeBytes,
      sql,
      2 * sql,
      mixed,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    sql !== sqlBytes ||
    mixed !== stringChargeBytes ||
    (parts.source !== 'SEAL_RESULT_ADMISSION' && parts.resultCopyChargeBytes !== 0) ||
    parts.resultCopyChargeBytes % 3 !== 0 ||
    (['ROW_PREFLIGHT', 'ROW_INSERT_ADMISSION', 'COMPLETION_ADMISSION'].includes(parts.source) &&
      parts.additionalSqlAllowanceBytes !== 0)
  )
    throw new Error('Unsafe or incoherent Stage budget components');
  return Object.freeze({
    scope: parts.scope,
    source: parts.source,
    stageSqlBytes: parts.stageSqlBytes,
    additionalSqlAllowanceBytes: parts.additionalSqlAllowanceBytes,
    otherBudgetChargeBytes: parts.otherBudgetChargeBytes,
    resultCopyChargeBytes: parts.resultCopyChargeBytes,
  });
}

interface StageAccountingCheckpoint {
  readonly scope: 'STAGE_ACCOUNTING_CHECKPOINT_ONLY';
  readonly stageId: number;
  readonly retainedSqlBytes: number;
  readonly retainedStringChargeBytes: number;
  readonly budgetComponents: Readonly<NativeStageBudgetComponents> | null;
  /** Current synchronous owner only; overlaps Stage accounting and is never additive. */
  readonly rawSql: Readonly<{
    scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY';
    ownerId: number;
    retainedSqlBytes: number;
    retainedSqlStringChargeBytes: number;
  }> | null;
  /** Nearest enclosing synchronous owners first; never additive or unique allocations. */
  readonly enclosingRawSql:
    | readonly Readonly<{
        scope: 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY';
        ownerId: number;
        retainedSqlBytes: number;
        retainedSqlStringChargeBytes: number;
      }>[]
    | null;
}

const stageAccountingContext = new AsyncLocalStorage<{
  accept: (record: StageAccountingCheckpoint) => void;
  stages: WeakMap<object, number>;
  stageCount: number;
  rawOwners: WeakMap<object, number>;
  rawOwnerCount: number;
  active: boolean;
  captureFailed: boolean;
  captureFailure: unknown;
}>();

/** Private offline checkpoint capture, deliberately absent from the package index. */
export async function observeNativeStageAccounting<T>(
  operation: () => T | Promise<T>,
  accept: (record: StageAccountingCheckpoint) => void,
) {
  const owner = {
    accept,
    stages: new WeakMap<object, number>(),
    stageCount: 0,
    rawOwners: new WeakMap<object, number>(),
    rawOwnerCount: 0,
    active: true,
    captureFailed: false,
    captureFailure: undefined as unknown,
  };
  return stageAccountingContext.run(owner, async () => {
    let value: T | undefined;
    let error: unknown;
    let threw = false;
    try {
      value = await operation();
    } catch (failure) {
      threw = true;
      error = failure;
    } finally {
      owner.active = false;
    }
    return {
      value,
      error,
      threw,
      captureFailed: owner.captureFailed,
      captureFailure: owner.captureFailure,
    };
  });
}

/** Values from the existing accounting call, not historical maxima or release gauges. */
export function nativeStageAccountingCheckpoint(
  stage: object,
  retainedSqlBytes: number,
  retainedStringChargeBytes: number,
  budgetComponents: NativeStageBudgetComponents | null = null,
): void {
  const owner = stageAccountingContext.getStore();
  if (!owner?.active || owner.captureFailed) return;
  try {
    if (
      ![retainedSqlBytes, 2 * retainedSqlBytes, retainedStringChargeBytes].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) ||
      retainedStringChargeBytes < 2 * retainedSqlBytes
    )
      throw new Error('Unsafe Stage accounting checkpoint');
    const parts = validateNativeStageBudgetComponents(
      budgetComponents,
      retainedSqlBytes,
      retainedStringChargeBytes,
    );
    let stageId = owner.stages.get(stage);
    if (stageId === undefined) {
      stageId = ++owner.stageCount;
      owner.stages.set(stage, stageId);
    }
    let rawSql: StageAccountingCheckpoint['rawSql'] = null;
    let enclosingRawSql: StageAccountingCheckpoint['enclosingRawSql'] = null;
    if (active?.open) {
      const scalars = (raw: Owner) => {
        if (raw.captureFailed) throw raw.captureFailure;
        if (
          !raw.open ||
          ![raw.bytes, 2 * raw.bytes].every((value) => Number.isSafeInteger(value) && value >= 0)
        )
          throw new Error('Unsafe current or enclosing raw SQL checkpoint');
        let ownerId = owner.rawOwners.get(raw);
        if (ownerId === undefined) {
          ownerId = ++owner.rawOwnerCount;
          owner.rawOwners.set(raw, ownerId);
        }
        return {
          ownerId,
          retainedSqlBytes: raw.bytes,
          retainedSqlStringChargeBytes: 2 * raw.bytes,
        };
      };
      rawSql = Object.freeze({
        scope: 'CURRENT_RAW_SQL_OWNER_CHECKPOINT_ONLY',
        ...scalars(active),
      });
      const enclosing: Array<NonNullable<StageAccountingCheckpoint['enclosingRawSql']>[number]> =
        [];
      for (let parent = active.parent; parent !== undefined; parent = parent.parent)
        enclosing.push(
          Object.freeze({ scope: 'ENCLOSING_RAW_SQL_OWNER_CHECKPOINT_ONLY', ...scalars(parent) }),
        );
      enclosingRawSql = Object.freeze(enclosing);
    }
    owner.accept(
      Object.freeze({
        scope: 'STAGE_ACCOUNTING_CHECKPOINT_ONLY',
        stageId,
        retainedSqlBytes,
        retainedStringChargeBytes,
        budgetComponents: parts,
        rawSql,
        enclosingRawSql,
      }),
    );
  } catch (failure) {
    owner.captureFailed = true;
    owner.captureFailure = failure;
  }
}

export interface NativeApplySqlObservation {
  readonly scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY';
  readonly phase: string;
  readonly boundary: 'ENTER' | 'EXIT';
  readonly retainedSqlBytes: number;
  readonly retainedSqlStringChargeBytes: number;
}

interface Owner {
  readonly parent: Owner | undefined;
  observe: (record: NativeApplySqlObservation) => void;
  bytes: number;
  frames: number;
  open: boolean;
  captureFailed: boolean;
  captureFailure: unknown;
}
let active: Owner | undefined;
interface Gauge {
  owner: Owner;
  readonly bytes: number;
  report: (phase: string, bytes: number) => void;
}
let activeToken: Gauge | undefined;
let activeSupports: Gauge | undefined;
let activeSummaries: Gauge | undefined;

/** Holds the streamed token gauge through its caller's synchronous comparison. */
export function withNativeApplySqlToken<T>(operation: () => T): T {
  return withGauge('TOKEN', operation);
}

/** Holds returned SQL-origin support scalars through synchronous validation. */
export function withNativeApplySqlSupports<T>(operation: () => T): T {
  return withGauge('ACTIVE_SUPPORT', operation);
}

/** Keeps fetched summary scalars through Provider validation and result detachment. */
export function withNativeApplySqlSummaries<T>(operation: () => T): T {
  return withGauge('STAGE_SUMMARY', operation);
}

function withGauge<T>(kind: 'TOKEN' | 'ACTIVE_SUPPORT' | 'STAGE_SUMMARY', operation: () => T): T {
  const owner = active;
  if (!owner) {
    changeLifetime(() => {
      throw new Error('Unclassified raw SQL gauge owner');
    });
    return operation();
  }
  const current = () =>
    kind === 'TOKEN' ? activeToken : kind === 'ACTIVE_SUPPORT' ? activeSupports : activeSummaries;
  const set = (value: Gauge | undefined) => {
    if (kind === 'TOKEN') activeToken = value;
    else if (kind === 'ACTIVE_SUPPORT') activeSupports = value;
    else activeSummaries = value;
  };
  const parent = current();
  let bytes = 0;
  let observed = false;
  let open = true;
  let source: NativeSqlDomainHandle | null = null;
  const scope = {
    owner,
    get bytes() {
      return bytes;
    },
    report: (phase: string, next: number): void => {
      if (!open || current() !== scope || active !== owner) return;
      if (!Number.isSafeInteger(next) || next < 0 || !Number.isSafeInteger(2 * next)) {
        failed(owner, new Error('Unsafe Apply SQL gauge ownership'));
        return;
      }
      owner.bytes += next - bytes;
      bytes = next;
      observed = true;
      if (source === null) source = beginRawSqlSource(next);
      else replaceNativeSqlSourceDomain(source, next);
      emit(owner, `STORE_${phase}`, 'ENTER');
    },
  };
  set(scope);
  owner.frames++;
  try {
    return operation();
  } finally {
    open = false;
    owner.bytes -= bytes;
    owner.frames--;
    set(parent);
    if (source !== null) endNativeSqlSourceDomain(source);
    if (observed) emit(owner, `STORE_${kind}_SCOPE`, 'EXIT');
  }
}

/** No public token-reader argument; silent outside the matching private owner. */
export function nativeApplySqlTokenObserver():
  ((phase: string, bytes: number) => void) | undefined {
  return activeToken?.owner === active ? activeToken?.report : undefined;
}

export function nativeApplySqlSupportsObserver():
  ((phase: string, bytes: number) => void) | undefined {
  return activeSupports?.owner === active ? activeSupports?.report : undefined;
}

export function observeNativeApplySql<T>(
  observe: Owner['observe'],
  operation: () => T,
): Readonly<{
  threw: boolean;
  value: T | undefined;
  error: unknown;
  captureFailed: boolean;
  captureFailure: unknown;
}> {
  const parent = active;
  const owner: Owner = {
    parent,
    observe,
    bytes: 0,
    frames: 0,
    open: true,
    captureFailed: false,
    captureFailure: undefined,
  };
  active = owner;
  let value: T | undefined;
  let error: unknown;
  let threw = false;
  try {
    value = operation();
  } catch (failure) {
    threw = true;
    error = failure;
  } finally {
    if (owner.frames !== 0) failed(owner, new Error('Unsettled Apply SQL ownership'));
    owner.open = false;
    active = parent;
  }
  return Object.freeze({
    threw,
    value,
    error,
    captureFailed: owner.captureFailed,
    captureFailure: owner.captureFailure,
  });
}

function failed(owner: Owner, failure: unknown): void {
  changeLifetime((lifetime) => lifetimeFailure(lifetime, 'RAW_SOURCE_CAPTURE_FAILURE', failure));
  if (!owner.captureFailed) {
    owner.captureFailed = true;
    owner.captureFailure = failure;
  }
}
function emit(owner: Owner, phase: string, boundary: NativeApplySqlObservation['boundary']): void {
  if (!owner.open || owner.captureFailed) return;
  try {
    if (
      !Number.isSafeInteger(owner.bytes) ||
      owner.bytes < 0 ||
      !Number.isSafeInteger(2 * owner.bytes)
    )
      throw new Error('Unsafe Apply SQL ownership');
    owner.observe(
      Object.freeze({
        scope: 'APPLY_RAW_SQL_OWNERSHIP_ONLY',
        phase,
        boundary,
        retainedSqlBytes: owner.bytes,
        retainedSqlStringChargeBytes: 2 * owner.bytes,
      }),
    );
  } catch (failure) {
    failed(owner, failure);
  }
}

export function withNativeApplySqlFields<T>(
  phase: string,
  fields: Iterable<string | null | undefined>,
  operation: () => T,
): T {
  const frame = openFields(phase, fields);
  try {
    return operation();
  } finally {
    frame?.close();
  }
}

/** Keeps the actual raw row frame alive while its parsed value is yielded. */
export function* yieldNativeApplySqlFields<T>(
  phase: string,
  fields: Iterable<string | null | undefined>,
  operation: () => T,
): Generator<T, void, unknown> {
  const summaries = phase === 'STAGE_SUMMARY_ROW' ? activeSummaries : undefined;
  if (summaries && summaries.owner === active) {
    // Provider's shallow row copies retain these original SQL strings. Count
    // each selected field once, including a failing current row; advancing or
    // closing this iterator cannot release earlier handed-off aliases.
    try {
      let bytes = summaries.bytes;
      for (const field of fields) {
        if (field !== null && field !== undefined) {
          if (typeof field !== 'string') throw new Error('Invalid Apply SQL field');
          bytes += Buffer.byteLength(field);
        }
      }
      summaries.report('STAGE_SUMMARY_ROW', bytes);
    } catch (failure) {
      failed(summaries.owner, failure);
    }
    yield operation();
    return;
  }
  const frame = openFields(phase, fields);
  try {
    yield operation();
  } finally {
    frame?.close();
  }
}

/** Transfers the one accepted retirement ID, not a second copy of its row alias. */
export function withNativeApplySqlRetirementRows<T>(
  fields: Iterable<string>,
  operation: (keep: (id: string) => () => void) => T,
): T {
  const owner = active;
  const frame = openFields('STORE_RETIRE_ROW', fields);
  if (!frame) return operation(() => () => {});
  let requested = false;
  let released = false;
  let bytes = 0;
  let settle = () => {};
  try {
    return operation((id) => {
      try {
        if (requested) throw new Error('Multiple retirement ID handoffs');
        requested = true;
        bytes = Buffer.byteLength(id);
      } catch (failure) {
        failed(owner!, failure);
      }
      return () => {
        if (released) return;
        released = true;
        settle();
      };
    });
  } finally {
    if (requested && !released) {
      settle = frame.handoff(bytes);
      if (released) settle();
    }
    frame.close();
  }
}

function openFields(
  phase: string,
  fields: Iterable<string | null | undefined>,
): { close: () => void; handoff: (bytes: number) => () => void } | undefined {
  const owner = active;
  if (!owner) {
    changeLifetime(() => {
      throw new Error('Unclassified raw SQL field owner');
    });
    return undefined;
  }
  const previous = owner.bytes;
  let source: NativeSqlDomainHandle | null = null;
  owner.frames++;
  try {
    for (const field of fields) {
      if (field !== null && field !== undefined) {
        if (typeof field !== 'string') throw new Error('Invalid Apply SQL field');
        owner.bytes += Buffer.byteLength(field);
      }
    }
    source = beginRawSqlSource(owner.bytes - previous);
    emit(owner, phase, 'ENTER');
  } catch (failure) {
    failed(owner, failure);
  }
  let bytes = owner.bytes - previous;
  return {
    close: () => {
      owner.bytes -= bytes;
      owner.frames--;
      if (source !== null) endNativeSqlSourceDomain(source);
      emit(owner, phase, 'EXIT');
    },
    handoff: (retainedBytes) => {
      if (!Number.isSafeInteger(retainedBytes) || retainedBytes < 0 || retainedBytes > bytes) {
        failed(owner, new Error('Invalid retirement ID handoff'));
        return () => {};
      }
      bytes -= retainedBytes;
      if (source !== null) replaceNativeSqlSourceDomain(source, bytes);
      const retainedSource = source === null ? null : beginRawSqlSource(retainedBytes);
      owner.frames++;
      emit(owner, 'STORE_AFFECTED_ID', 'ENTER');
      return () => {
        owner.bytes -= retainedBytes;
        owner.frames--;
        if (retainedSource !== null) endNativeSqlSourceDomain(retainedSource);
        emit(owner, 'STORE_AFFECTED_ID', 'EXIT');
      };
    },
  };
}
