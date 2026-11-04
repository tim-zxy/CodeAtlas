import {
  RuntimeDerivationV2Schema,
  runtimeCandidateDigestV2,
  runtimeSitePlanDigest,
  parseRuntimeSitePlan,
  parseSyntaxEvidenceV4,
  validateSyntaxSurfaceClosure,
  type RuntimeDerivationV2,
  type SyntaxEvidenceV4,
} from '@codeatlas/ir';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual, types } from 'node:util';
import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  SourceFileSchema,
  parseSyntaxEvidenceV3,
  validateSyntaxBindingScopeClosure,
  type CanonicalNode,
  type CanonicalEdge,
  type SourceFile,
  type SyntaxEvidenceV3,
  type SupportRef,
  type ScopedRef,
  RepoBasisSchema,
  SupportRefSchema,
  Phase1CoverageSchema,
  RepositoryRuntimeBindingSchema,
  type RepositoryRuntimeBinding,
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  runtimeCandidateDigest,
  canonicalRuntimeJson,
  supportKey,
  entityRefKey,
  scopedRefKey,
  type RepoBasis,
} from '@codeatlas/ir';
import { readRuntimeActivationInputs } from '../analysis/activation-history.js';
import {
  HistoryReadBudget,
  encodeHistoryValue as bJson,
  checkedHistoryLimits,
  record,
  text,
  exact,
  array,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql, runtimeHash } from './runtime-sql.js';
export type RuntimeBatchCandidate = {
  facts: ReturnType<typeof parseRuntimeFactSet>;
  bindings: ReturnType<typeof parseFrameworkBindingSet>;
  coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
  termination: 'COMPLETE';
};
export type RuntimeBatchCandidateV2 = RuntimeBatchCandidate & { derivation: RuntimeDerivationV2 };
type AnyRuntimeBatchCandidate = RuntimeBatchCandidate | RuntimeBatchCandidateV2;
export interface RuntimeFrameworkInputsV2 extends Omit<RuntimeFrameworkInputs, 'syntaxEvidence'> {
  syntaxEvidence: SyntaxEvidenceV4[];
}
export type RuntimeTrace =
  | { status: 'NOT_AVAILABLE'; activationId: null; candidate: null }
  | {
      status: 'CURRENT' | 'AFFECTED';
      activationId: string;
      identity: Readonly<Record<string, unknown>>;
      candidate: RuntimeBatchCandidate;
    };
export type RuntimeTraceV2 = (
  | { status: 'NOT_AVAILABLE'; activationId: null; candidate: null }
  | {
      status: 'CURRENT' | 'AFFECTED';
      activationId: string;
      identity: Readonly<Record<string, unknown>>;
      candidate: RuntimeBatchCandidateV2;
    }
) & { coverageScope: 'LOCAL_DECLARED_RUNTIME' };
export type RuntimeInputIdentity = {
  codeBasis: RepoBasis;
  syntaxActivationId: string;
  syntaxMembershipDigest: string;
  runtimeActivationId: string | null;
};
export interface RuntimeFrameworkInputs {
  basis: RepoBasis;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  sourceFiles: SourceFile[];
  syntaxEvidence: SyntaxEvidenceV3[];
  supportInventory: SupportRef[];
  providerCapabilities: string[];
}
export type RuntimeBatchInput = {
  expected: RuntimeInputIdentity;
  candidate: RuntimeBatchCandidate;
};
export type RuntimeCommitOutcome = {
  status: 'NOT_COMMITTED' | 'COMMITTED' | 'COMMIT_OUTCOME_UNKNOWN';
  activationId: string | null;
};
const fail = (code: string): never => {
  throw new Error(code);
};
function check(v: unknown, code = 'INVALID_RUNTIME_CANDIDATE'): asserts v {
  if (!v) fail(code);
}
const activationColumns = [
  'id',
  'repository_id',
  'revision_id',
  'parent_id',
  'syntax_activation_id',
  'code_basis_json',
  'syntax_membership_digest',
  'policy_digest',
  'candidate_digest',
  'schema_name',
  'schema_version',
  'payload_json',
  'value_digest',
] as const;
function capture(db: DatabaseSync, repo: string, b: HistoryReadBudget) {
  const h = readRuntimeActivationInputs(db, repo, b),
    d = h.details!;
  const sql = runtimeSql(db, b),
    state = sql.read('runtime_state', ['activation_id'], 'repository_id=?', [repo]);
  check(state.length <= 1);
  const history = h.view.history;
  const identity: RuntimeInputIdentity | null =
    history &&
    h.view.activeBasis &&
    h.view.targetSource?.repositoryId === h.view.activeBasis.repositoryId &&
    h.view.targetSource.revisionId === h.view.activeBasis.revisionId &&
    h.view.targetSource.contentFingerprint === h.view.activeBasis.contentFingerprint
      ? {
          codeBasis: h.view.activeBasis,
          syntaxActivationId:
            'activation:' +
            runtimeHash('codeatlas-activation-history-v1', canonicalRuntimeJson(history)),
          syntaxMembershipDigest: runtimeHash(
            'runtime-syntax-membership-v1',
            sql.json({
              members: history.syntaxMembers,
              projections: d.projections
                .map((p) => ({ id: p.id, digest: p.projection_digest }))
                .sort((a, c) => String(a.id).localeCompare(String(c.id))),
            }),
          ),
          runtimeActivationId: state.length ? text(state[0]!.activation_id) : null,
        }
      : null;
  b.own(identity);
  return {
    identity,
    details: d,
    runtimeActivationId: state.length ? text(state[0]!.activation_id) : null,
  };
}
function validateCandidate(
  input: unknown,
  b: HistoryReadBudget,
  version: 1 | 2 = 1,
): AnyRuntimeBatchCandidate {
  b.own(input);
  const r = record(input);
  check(
    Object.keys(r).every((k) =>
      [
        ...['facts', 'bindings', 'coverage', 'termination', 'frontier'],
        ...(version === 2 ? ['derivation'] : []),
      ].includes(k),
    ),
  );
  check(
    r.termination === 'COMPLETE' && (r.frontier === undefined || array(r.frontier).length === 0),
    'RUNTIME_PARTIAL',
  );
  const facts = parseRuntimeFactSet(r.facts),
    bindings = parseFrameworkBindingSet(r.bindings, facts),
    coverage = Phase1CoverageSchema.parse(r.coverage);
  check(coverage.status === 'COMPLETE', 'RUNTIME_PARTIAL');
  const result = {
    facts,
    bindings,
    coverage,
    termination: 'COMPLETE' as const,
    ...(version === 2 ? { derivation: RuntimeDerivationV2Schema.parse(r.derivation) } : {}),
  };
  if (version === 2) {
    const d = (result as RuntimeBatchCandidateV2).derivation;
    check(d.sitePlanDigest === runtimeSitePlanDigest(d.sitePlan));
  }
  b.own(result);
  return result;
}
/** A peer-envelope reference is backed by this same immutable batch, not Source evidence. */
function internalBinding(ref: ScopedRef, candidate: RuntimeBatchCandidate): boolean {
  const basis = candidate.facts.payload.basis;
  return (
    ref.scope === 'REPOSITORY' &&
    ref.repositoryId === basis.repositoryId &&
    ref.entity.revisionId === basis.revisionId &&
    ref.entity.kind === 'FRAMEWORK_BINDING' &&
    candidate.bindings.payload.bindings.some((binding) => binding.id === ref.entity.id)
  );
}
function authenticatedSupports(
  candidate: AnyRuntimeBatchCandidate,
  c: ReturnType<typeof capture>,
  b: HistoryReadBudget,
) {
  check(c.identity, 'RUNTIME_INPUT_CHANGED');
  const basis = c.identity.codeBasis,
    values = new Map<string, unknown>(),
    refs = new Set<string>();
  for (const [tag, kind] of [
    ['NODE', 'CODE_NODE'],
    ['EDGE', 'CODE_EDGE'],
    ['SOURCE_FILE', 'SOURCE_FILE'],
  ] as const)
    for (const v of c.details.entries[tag] ?? []) {
      const r = record(v),
        entity = { kind, id: text(r.id), revisionId: basis.revisionId };
      values.set(entityRefKey(entity as never), v);
      refs.add(
        scopedRefKey({ scope: 'REPOSITORY', repositoryId: basis.repositoryId, entity } as never),
      );
    }
  for (const p of c.details.projections) {
    const env = record(b.parse(text(p.envelope_json))),
      v = record(env.payload);
    const key = entityRefKey({
      kind: 'SYNTAX_EVIDENCE',
      id: text(v.id),
      revisionId: basis.revisionId,
    } as never);
    values.set(key, env);
    refs.add(
      scopedRefKey({
        scope: 'REPOSITORY',
        repositoryId: basis.repositoryId,
        entity: { kind: 'SYNTAX_EVIDENCE', id: text(v.id), revisionId: basis.revisionId },
      } as never),
    );
  }
  check(
    isDeepStrictEqual(candidate.facts.payload.basis, basis) &&
      isDeepStrictEqual(candidate.bindings.payload.basis, basis),
    'RUNTIME_INPUT_CHANGED',
  );
  const supports = new Map<
    string,
    { support: ReturnType<typeof SupportRefSchema.parse>; value: unknown }
  >();
  for (const s of [
    ...candidate.facts.payload.supportInventory,
    ...candidate.bindings.payload.supportInventory,
  ]) {
    check(isDeepStrictEqual(s.basis, basis));
    const value = values.get(entityRefKey(s.entity));
    check(value);
    const digest = runtimeHash(
      s.entity.kind === 'SYNTAX_EVIDENCE'
        ? 'runtime-syntax-support-v1'
        : 'codeatlas-phase1-support-value-v1',
      bJson(value, b),
    );
    check(digest === s.valueDigest);
    supports.set(supportKey(s), { support: s, value });
  }
  for (const r of [
    ...candidate.facts.payload.externalRefs,
    ...candidate.bindings.payload.externalRefs,
  ]) {
    if (r.entity.kind === 'FRAMEWORK_BINDING') {
      check(internalBinding(r, candidate));
      continue;
    }
    check(refs.has(scopedRefKey(r)));
    const value = values.get(entityRefKey(r.entity));
    check(value);
    const support = SupportRefSchema.parse({
      basis,
      entity: r.entity,
      valueDigest: runtimeHash(
        r.entity.kind === 'SYNTAX_EVIDENCE'
          ? 'runtime-syntax-support-v1'
          : 'codeatlas-phase1-support-value-v1',
        bJson(value, b),
      ),
    });
    supports.set(supportKey(support), { support, value });
  }
  if ('derivation' in candidate) {
    const current = frameworkInputs(c, b, 4) as RuntimeFrameworkInputsV2,
      d = candidate.derivation;
    check(d.sitePlanDigest === runtimeSitePlanDigest(d.sitePlan));
    const availableEntities = current.supportInventory.map((s) => ({
      scope: 'REPOSITORY',
      repositoryId: basis.repositoryId,
      entity: s.entity,
    }));
    parseRuntimeSitePlan(d.sitePlan, {
      basis,
      syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
      syntaxEvidence: current.syntaxEvidence,
      syntaxContext: {
        references: { availableEntities, availableSupports: current.supportInventory },
        codeNodes: current.nodes,
        codeEdges: current.edges,
        sourceFiles: current.sourceFiles,
      },
      bindings: candidate.bindings.payload.bindings,
    });
  }
  b.own([...supports.values()]);
  return [...supports.values()];
}
function policyDigest(candidate: AnyRuntimeBatchCandidate, b: HistoryReadBudget) {
  const f = candidate.facts.payload;
  const records = [
    ...f.entryPoints,
    ...f.tasks,
    ...f.dataResources,
    ...f.triggers,
    ...f.contracts,
    ...f.contexts,
    ...f.nodes,
    ...f.edges,
    ...f.flows,
    ...candidate.bindings.payload.bindings,
  ];
  for (const r of records)
    check(
      ('derivation' in candidate
        ? ['runtime-declaration-support-v2', 'runtime-execution-declaration-v2']
        : ['runtime-declaration-support-v1', 'runtime-execution-declaration-v1']
      ).includes(r.confidence.method) && r.confidence.score === 0.5,
    );
  if ('derivation' in candidate)
    return runtimeHash(
      'runtime-policy-v2',
      bJson(
        {
          methods: [...new Set(records.map((r) => r.confidence.method))].sort(),
          rulesVersion: candidate.derivation.rulesVersion,
          coverageVersion: candidate.derivation.coverageVersion,
        },
        b,
      ),
    );
  return runtimeHash(
    'runtime-policy-v1',
    bJson([...new Set(records.map((r) => r.confidence.method))].sort(), b),
  );
}
/** Internal fixed writer, called only after locked actual Code/Syntax authentication.
 * No arbitrary callback or nested transaction is accepted.
 */
export function writeRuntimeBatchLocked(
  db: DatabaseSync,
  repo: string,
  input: RuntimeBatchInput,
  b: HistoryReadBudget,
  version: 1 | 2 = 1,
): string {
  check(db.isTransaction);
  const r = exact(input, ['expected', 'candidate']),
    expected = record(r.expected);
  exact(expected, [
    'codeBasis',
    'syntaxActivationId',
    'syntaxMembershipDigest',
    'runtimeActivationId',
  ]);
  const actual = capture(db, repo, b);
  check(actual.identity && isDeepStrictEqual(actual.identity, expected), 'RUNTIME_INPUT_CHANGED');
  const candidate = validateCandidate(r.candidate, b, version),
    supports = authenticatedSupports(candidate, actual, b);
  const basis = RepoBasisSchema.parse(expected.codeBasis),
    sql = runtimeSql(db, b);
  const policy = policyDigest(candidate, b),
    digest = candidateDigest(candidate);
  const identity = {
    repositoryId: repo,
    revisionId: basis.revisionId,
    parentId: actual.identity.runtimeActivationId,
    codeBasis: basis,
    syntaxActivationId: actual.identity.syntaxActivationId,
    syntaxMembershipDigest: actual.identity.syntaxMembershipDigest,
    policyDigest: policy,
    candidateDigest: digest,
  };
  const id = 'runtime-activation:' + runtimeHash('runtime-activation-v1', sql.json(identity));
  sql.insert('runtime_activations', {
    id,
    repository_id: repo,
    revision_id: basis.revisionId,
    parent_id: identity.parentId,
    syntax_activation_id: identity.syntaxActivationId,
    code_basis_json: sql.json(basis),
    syntax_membership_digest: identity.syntaxMembershipDigest,
    policy_digest: policy,
    candidate_digest: digest,
    ...sql.payload(
      'codeatlas.runtime-activation',
      version === 2 ? { formatVersion: 2, identity, candidate } : { identity, candidate },
    ),
  });
  const f = candidate.facts.payload;
  const row = (v: { id: string; factKey: string }) => ({
    activation_id: id,
    entity_id: v.id,
    fact_key: v.factKey,
  });
  for (const [kind, items] of [
    ['ENTRY_POINT', f.entryPoints],
    ['TASK_DEFINITION', f.tasks],
    ['DATA_RESOURCE', f.dataResources],
    ['DATA_CHANGE_TRIGGER', f.triggers],
    ['CONTRACT', f.contracts],
  ] as const)
    for (const v of items)
      sql.insert('runtime_domain_facts', {
        ...row(v),
        kind,
        ...sql.payload('codeatlas.runtime-fact-set', v),
      });
  for (const v of candidate.bindings.payload.bindings) {
    const target =
      'contractRef' in v
        ? v.contractRef
        : 'resourceRef' in v
          ? v.resourceRef
          : 'taskRef' in v
            ? v.taskRef
            : null;
    sql.insert('runtime_bindings', {
      ...row(v),
      kind: v.kind,
      owner_ref_json: sql.json(v.ownerRef),
      target_kind: target?.entity.kind ?? null,
      target_id: target?.entity.id ?? null,
      dependency_ref_json: 'dependencyRef' in v ? sql.json(v.dependencyRef) : null,
      handler_ref_json: 'handlerRef' in v ? sql.json(v.handlerRef) : null,
      ...sql.payload('codeatlas.framework-binding-set', v),
    });
  }
  for (const s of supports)
    sql.insert('runtime_support_membership', {
      activation_id: id,
      support_key: supportKey(s.support),
      original_basis_json: sql.json(s.support.basis),
      support_ref_json: sql.json(s.support),
      ...sql.payload('codeatlas.runtime-support', s.value),
    });
  for (const v of f.contexts)
    sql.insert('execution_contexts', {
      ...row(v),
      entry_id: v.entryRef.entity.id,
      ...sql.payload('codeatlas.runtime-fact-set', v),
    });
  for (const v of f.nodes)
    sql.insert('execution_nodes', {
      ...row(v),
      context_id: v.contextRef.entity.id,
      ...sql.payload('codeatlas.runtime-fact-set', v),
    });
  for (const v of f.edges)
    sql.insert('execution_edges', {
      ...row(v),
      context_id: v.contextRef.entity.id,
      source_id: v.sourceRef.entity.id,
      target_id: v.target.state === 'RESOLVED' ? v.target.target.entity.id : null,
      target_resolution: v.target.state,
      ...sql.payload('codeatlas.runtime-fact-set', v),
    });
  for (const v of f.flows) {
    sql.insert('runtime_flows', {
      ...row(v),
      entry_id: v.entryRef.entity.id,
      ...sql.payload('codeatlas.runtime-fact-set', v),
    });
    for (const s of v.steps)
      sql.insert('runtime_flow_steps', {
        activation_id: id,
        flow_id: v.id,
        step_key: s.stepKey,
        ordinal: s.ordinal,
        context_id: s.contextRef.entity.id,
        ...sql.payload('codeatlas.runtime-fact-set', s),
      });
  }
  sql.run('DELETE FROM runtime_state WHERE repository_id=?', [repo]);
  sql.insert('runtime_state', { repository_id: repo, activation_id: id });
  return id;
}
const connections = new WeakMap<object, { db: DatabaseSync; repo: string }>();
const receipts = new WeakMap<object, RuntimeCommitOutcome>();
export class RuntimeFactStore {
  constructor(db: DatabaseSync, repositoryId: string) {
    check(!types.isProxy(db) && db instanceof DatabaseSync && db.isOpen);
    connections.set(this, { db, repo: text(repositoryId) });
  }
  readRuntimeBasis(limits: HistoryReadLimits) {
    const { db, repo } = connections.get(this)!,
      b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    db.exec('BEGIN');
    try {
      const c = capture(db, repo, b);
      db.exec('COMMIT');
      return {
        status: c.identity ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
        identity: c.identity,
        runtimeActivationId: c.runtimeActivationId,
      };
    } catch (e) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw e;
    }
  }
  /** Current stored facts only. This neither scans Source nor upgrades legacy Syntax. */
  readFrameworkInputs(
    expected: RuntimeInputIdentity,
    limits: HistoryReadLimits,
  ): RuntimeFrameworkInputs {
    return this.readFrameworkInputsForVersion(expected, limits, 3) as RuntimeFrameworkInputs;
  }
  readFrameworkInputsV2(
    expected: RuntimeInputIdentity,
    limits: HistoryReadLimits,
  ): RuntimeFrameworkInputsV2 {
    return this.readFrameworkInputsForVersion(expected, limits, 4) as RuntimeFrameworkInputsV2;
  }
  private readFrameworkInputsForVersion(
    expected: RuntimeInputIdentity,
    limits: HistoryReadLimits,
    version: 3 | 4,
  ): RuntimeFrameworkInputs | RuntimeFrameworkInputsV2 {
    const { db, repo } = connections.get(this)!;
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    db.exec('BEGIN');
    try {
      const c = capture(db, repo, b);
      check(c.identity && isDeepStrictEqual(c.identity, expected), 'RUNTIME_INPUT_CHANGED');
      const inputs = frameworkInputs(c, b, version);
      db.exec('COMMIT');
      return inputs;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
  applyRuntimeBatch(input: RuntimeBatchInput, limits: HistoryReadLimits): RuntimeCommitOutcome {
    return this.applyRuntimeBatchForVersion(input, limits, 1);
  }
  applyRuntimeBatchV2(
    input: { expected: RuntimeInputIdentity; candidate: RuntimeBatchCandidateV2 },
    limits: HistoryReadLimits,
  ): RuntimeCommitOutcome {
    return this.applyRuntimeBatchForVersion(input, limits, 2);
  }
  private applyRuntimeBatchForVersion(
    input: RuntimeBatchInput,
    limits: HistoryReadLimits,
    version: 1 | 2,
  ): RuntimeCommitOutcome {
    const { db, repo } = connections.get(this)!,
      b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    let id: string | null = null,
      committing = false;
    receipts.set(this, { status: 'NOT_COMMITTED', activationId: null });
    // Preparation is outside the write lock. The writer independently validates again.
    b.own(input);
    validateCandidate(input.candidate, b, version);
    try {
      db.exec('BEGIN IMMEDIATE');
      id = writeRuntimeBatchLocked(db, repo, input, b, version);
      committing = true;
      receipts.set(this, { status: 'COMMIT_OUTCOME_UNKNOWN', activationId: id });
      db.exec('COMMIT');
      const result = { status: 'COMMITTED' as const, activationId: id };
      receipts.set(this, result);
      return Object.freeze(result);
    } catch (e) {
      if (db.isOpen && db.isTransaction) {
        try {
          db.exec('ROLLBACK');
          receipts.set(this, { status: 'NOT_COMMITTED', activationId: id });
        } catch {
          receipts.set(this, { status: 'COMMIT_OUTCOME_UNKNOWN', activationId: id });
        }
      } else if (!committing) receipts.set(this, { status: 'NOT_COMMITTED', activationId: id });
      throw e;
    }
  }
  settlement(): RuntimeCommitOutcome {
    return Object.freeze({
      ...(receipts.get(this) ?? { status: 'NOT_COMMITTED', activationId: null }),
    });
  }

  /** Fresh read-only recovery of this Store's actual attempted identity. No retry or repair. */
  inspectOutcome(limits: HistoryReadLimits): RuntimeCommitOutcome {
    const receipt = this.settlement(),
      { db: owner, repo } = connections.get(this)!;
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    if (receipt.activationId === null) return receipt;
    const path = owner.location('main');
    check(path && !owner.isTransaction);
    const db = new DatabaseSync(path, { readOnly: true, enableForeignKeyConstraints: true });
    try {
      db.exec('BEGIN');
      const sql = runtimeSql(db, b),
        rows = sql.read('runtime_activations', ['id'], 'repository_id=? AND id=?', [
          repo,
          receipt.activationId,
        ]);
      if (rows.length === 1) {
        readRuntimeActivation(db, repo, receipt.activationId, b);
        db.exec('COMMIT');
        return { status: 'COMMITTED', activationId: receipt.activationId };
      }
      check(rows.length === 0);
      db.exec('COMMIT');
      return {
        status: receipt.status === 'NOT_COMMITTED' ? 'NOT_COMMITTED' : 'COMMIT_OUTCOME_UNKNOWN',
        activationId: receipt.activationId,
      };
    } finally {
      try {
        if (db.isTransaction) db.exec('ROLLBACK');
      } finally {
        db.close();
      }
    }
  }

  traceRuntime(limits: HistoryReadLimits): RuntimeTrace {
    return this.traceRuntimeForVersion(limits, 1);
  }
  traceRuntimeV2(limits: HistoryReadLimits): RuntimeTraceV2 {
    return {
      ...this.traceRuntimeForVersion(limits, 2),
      coverageScope: 'LOCAL_DECLARED_RUNTIME',
    } as RuntimeTraceV2;
  }
  private traceRuntimeForVersion(limits: HistoryReadLimits, version: 1 | 2): RuntimeTrace {
    const { db, repo } = connections.get(this)!,
      b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    db.exec('BEGIN');
    try {
      const sql = runtimeSql(db, b),
        state = sql.read('runtime_state', ['activation_id'], 'repository_id=?', [repo]);
      check(state.length <= 1);
      if (!state.length) {
        db.exec('COMMIT');
        return { status: 'NOT_AVAILABLE' as const, activationId: null, candidate: null };
      }
      const id = text(state[0]!.activation_id),
        { identity, candidate } = readRuntimeActivation(db, repo, id, b);
      check('derivation' in candidate === (version === 2), 'RUNTIME_VERSION_NOT_SUPPORTED');
      const live = capture(db, repo, b);
      const current =
        live.identity &&
        isDeepStrictEqual(live.identity.codeBasis, identity.codeBasis) &&
        live.identity.syntaxActivationId === identity.syntaxActivationId &&
        live.identity.syntaxMembershipDigest === identity.syntaxMembershipDigest;
      db.exec('COMMIT');
      return {
        status: current ? ('CURRENT' as const) : ('AFFECTED' as const),
        activationId: id,
        identity,
        candidate,
      };
    } catch (e) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Fixed Mixed Store bridge. New Syntax is already authenticated by the genuine Stage in this transaction. */
export function writeMixedRuntimeBatchLocked(
  db: DatabaseSync,
  repo: string,
  candidate: RuntimeBatchCandidate,
  codeBasis: RepoBasis,
  syntaxActivationId: string,
  expectedOldRuntime: string | null,
  b: HistoryReadBudget,
  version: 1 | 2 = 1,
): string {
  const current = capture(db, repo, b);
  check(
    current.identity &&
      isDeepStrictEqual(current.identity.codeBasis, codeBasis) &&
      current.identity.syntaxActivationId === syntaxActivationId &&
      current.identity.runtimeActivationId === expectedOldRuntime,
    'RUNTIME_INPUT_CHANGED',
  );
  return writeRuntimeBatchLocked(db, repo, { expected: current.identity, candidate }, b, version);
}

/** Read the same immutable activation in one WAL snapshot; never repair partial rows. */
function verifyRuntimeRows(
  db: DatabaseSync,
  id: string,
  candidate: RuntimeBatchCandidate,
  b: HistoryReadBudget,
) {
  const sql = runtimeSql(db, b),
    f = candidate.facts.payload;
  const groups = [
    [
      'runtime_domain_facts',
      [...f.entryPoints, ...f.tasks, ...f.dataResources, ...f.triggers, ...f.contracts],
      'codeatlas.runtime-fact-set',
    ],
    ['runtime_bindings', candidate.bindings.payload.bindings, 'codeatlas.framework-binding-set'],
    ['execution_contexts', f.contexts, 'codeatlas.runtime-fact-set'],
    ['execution_nodes', f.nodes, 'codeatlas.runtime-fact-set'],
    ['execution_edges', f.edges, 'codeatlas.runtime-fact-set'],
    ['runtime_flows', f.flows, 'codeatlas.runtime-fact-set'],
  ] as const;
  for (const [table, items, schema] of groups) {
    const rows = sql.read(
      table,
      ['entity_id', 'schema_name', 'schema_version', 'payload_json', 'value_digest'],
      'activation_id=?',
      [id],
    );
    check(rows.length === items.length);
    const expected = new Map(items.map((v) => [String(v.id), v]));
    for (const r of rows) {
      const value = expected.get(text(r.entity_id));
      check(value);
      check(
        r.schema_name === schema &&
          r.schema_version === 1 &&
          r.payload_json === bJson(value, b) &&
          r.value_digest === runtimeHash('runtime-storage-value-v1', text(r.payload_json)),
      );
    }
  }
  const steps = sql.read(
    'runtime_flow_steps',
    [
      'flow_id',
      'step_key',
      'ordinal',
      'context_id',
      'schema_name',
      'schema_version',
      'payload_json',
      'value_digest',
    ],
    'activation_id=?',
    [id],
  );
  const expectedSteps = f.flows.flatMap((flow) => flow.steps.map((step) => ({ flow, step })));
  check(steps.length === expectedSteps.length);
  for (const row of steps) {
    const found = expectedSteps.find(
      (v) => v.flow.id === row.flow_id && v.step.stepKey === row.step_key,
    );
    check(found);
    check(
      row.ordinal === found.step.ordinal &&
        row.context_id === found.step.contextRef.entity.id &&
        row.schema_name === 'codeatlas.runtime-fact-set' &&
        row.schema_version === 1 &&
        row.payload_json === bJson(found.step, b) &&
        row.value_digest === runtimeHash('runtime-storage-value-v1', text(row.payload_json)),
    );
  }
  const supportRows = sql.read(
    'runtime_support_membership',
    [
      'support_key',
      'original_basis_json',
      'support_ref_json',
      'schema_name',
      'schema_version',
      'payload_json',
      'value_digest',
    ],
    'activation_id=?',
    [id],
  );
  const known = new Map<string, unknown>();
  for (const row of supportRows) {
    const support = SupportRefSchema.parse(b.parse(text(row.support_ref_json))),
      value = b.parse(text(row.payload_json));
    check(
      row.support_key === supportKey(support) &&
        isDeepStrictEqual(support.basis, f.basis) &&
        row.original_basis_json === bJson(support.basis, b) &&
        row.schema_name === 'codeatlas.runtime-support' &&
        row.schema_version === 1 &&
        row.value_digest === runtimeHash('runtime-storage-value-v1', text(row.payload_json)),
    );
    check(
      support.valueDigest ===
        runtimeHash(
          support.entity.kind === 'SYNTAX_EVIDENCE'
            ? 'runtime-syntax-support-v1'
            : 'codeatlas-phase1-support-value-v1',
          bJson(value, b),
        ),
    );
    known.set(supportKey(support), value);
  }
  for (const s of [...f.supportInventory, ...candidate.bindings.payload.supportInventory])
    check(known.has(supportKey(s)));
  for (const ref of [...f.externalRefs, ...candidate.bindings.payload.externalRefs]) {
    if (ref.entity.kind === 'FRAMEWORK_BINDING') {
      check(internalBinding(ref, candidate));
      continue;
    }
    check(
      supportRows.some((row) => {
        const s = SupportRefSchema.parse(b.parse(text(row.support_ref_json)));
        return entityRefKey(s.entity) === entityRefKey(ref.entity);
      }),
    );
  }
}

function readRuntimeActivation(db: DatabaseSync, repo: string, id: string, b: HistoryReadBudget) {
  const sql = runtimeSql(db, b),
    rows = sql.read('runtime_activations', activationColumns, 'repository_id=? AND id=?', [
      repo,
      id,
    ]);
  check(rows.length === 1);
  const r = rows[0]!,
    raw = text(r.payload_json);
  check(
    r.schema_name === 'codeatlas.runtime-activation' &&
      r.schema_version === 1 &&
      runtimeHash('runtime-storage-value-v1', raw) === r.value_digest,
  );
  const v = record(b.parse(raw)),
    formatVersion = Object.hasOwn(v, 'formatVersion') ? v.formatVersion : 1;
  check((formatVersion === 1 && !Object.hasOwn(v, 'formatVersion')) || formatVersion === 2);
  exact(
    v,
    formatVersion === 2 ? ['formatVersion', 'identity', 'candidate'] : ['identity', 'candidate'],
  );
  const identity = record(v.identity),
    candidate = validateCandidate(v.candidate, b, formatVersion === 2 ? 2 : 1);
  check(
    candidateDigest(candidate) === r.candidate_digest &&
      policyDigest(candidate, b) === r.policy_digest,
  );
  check('runtime-activation:' + runtimeHash('runtime-activation-v1', bJson(identity, b)) === id);
  check(
    identity.repositoryId === r.repository_id &&
      identity.revisionId === r.revision_id &&
      identity.parentId === r.parent_id &&
      identity.syntaxActivationId === r.syntax_activation_id &&
      identity.syntaxMembershipDigest === r.syntax_membership_digest &&
      isDeepStrictEqual(identity.codeBasis, b.parse(text(r.code_basis_json))),
  );
  check(
    identity.policyDigest === r.policy_digest && identity.candidateDigest === r.candidate_digest,
  );
  verifyRuntimeRows(db, id, candidate, b);

  return { identity, candidate };
}

/** Internal workspace adapter. Every repository read uses the same caller budget,
 * but each DB has its own snapshot; no cross-database atomicity is claimed. */
export interface RuntimeWorkspaceSnapshot {
  binding: RepositoryRuntimeBinding;
  rootPath: string;
  candidate: RuntimeBatchCandidate;
  values: { support: ReturnType<typeof SupportRefSchema.parse>; value: unknown }[];
}
export function readRuntimeBindingForWorkspace(
  store: RuntimeFactStore,
  b: HistoryReadBudget,
): RuntimeWorkspaceSnapshot {
  const owner = connections.get(store);
  check(owner && !owner.db.isTransaction);
  const { db, repo } = owner;
  db.exec('BEGIN');
  try {
    const c = capture(db, repo, b);
    check(c.identity && c.runtimeActivationId, 'RUNTIME_NOT_CURRENT');
    const { candidate, identity } = readRuntimeActivation(db, repo, c.runtimeActivationId, b);
    check(
      isDeepStrictEqual(c.identity.codeBasis, identity.codeBasis) &&
        c.identity.syntaxActivationId === identity.syntaxActivationId &&
        c.identity.syntaxMembershipDigest === identity.syntaxMembershipDigest,
      'RUNTIME_NOT_CURRENT',
    );
    const values: { support: ReturnType<typeof SupportRefSchema.parse>; value: unknown }[] = [];
    for (const [tag, kind] of [
      ['NODE', 'CODE_NODE'],
      ['EDGE', 'CODE_EDGE'],
      ['SOURCE_FILE', 'SOURCE_FILE'],
    ] as const)
      for (const value of c.details.entries[tag] ?? []) {
        const r = record(value);
        values.push({
          support: SupportRefSchema.parse({
            basis: c.identity.codeBasis,
            entity: { kind, id: text(r.id), revisionId: c.identity.codeBasis.revisionId },
            valueDigest: runtimeHash('codeatlas-phase1-support-value-v1', bJson(value, b)),
          }),
          value,
        });
      }
    for (const p of c.details.projections) {
      const value = record(b.parse(text(p.envelope_json))),
        v = record(value.payload);
      values.push({
        support: SupportRefSchema.parse({
          basis: c.identity.codeBasis,
          entity: {
            kind: 'SYNTAX_EVIDENCE',
            id: text(v.id),
            revisionId: c.identity.codeBasis.revisionId,
          },
          valueDigest: runtimeHash('runtime-syntax-support-v1', bJson(value, b)),
        }),
        value,
      });
    }
    const binding = RepositoryRuntimeBindingSchema.parse({
      repoBasis: c.identity.codeBasis,
      syntaxActivationId: c.identity.syntaxActivationId,
      syntaxMembershipDigest: c.identity.syntaxMembershipDigest,
      runtimeActivationId: c.runtimeActivationId,
      runtimeCandidateDigest: text(identity.candidateDigest),
    });
    b.own({ binding, values });
    const roots = runtimeSql(db, b).read('repository', ['id', 'root_path'], 'id=?', [repo]);
    check(roots.length === 1);
    const rootPath = text(roots[0]!.root_path);
    db.exec('COMMIT');
    return { binding, rootPath, candidate, values };
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw e;
  }
}

function frameworkInputs(
  c: ReturnType<typeof capture>,
  b: HistoryReadBudget,
  version: 3 | 4,
): RuntimeFrameworkInputs | RuntimeFrameworkInputsV2 {
  check(c.identity, 'RUNTIME_INPUT_CHANGED');
  const basis = c.identity.codeBasis;
  const nodes = (c.details.entries.NODE ?? []).map((v) => CanonicalNodeSchema.parse(v));
  const edges = (c.details.entries.EDGE ?? []).map((v) => CanonicalEdgeSchema.parse(v));
  const sourceFiles = (c.details.entries.SOURCE_FILE ?? []).map((v) => SourceFileSchema.parse(v));
  const supportInventory: SupportRef[] = [];
  for (const [kind, items] of [
    ['CODE_NODE', nodes],
    ['CODE_EDGE', edges],
    ['SOURCE_FILE', sourceFiles],
  ] as const)
    for (const value of items)
      supportInventory.push(
        SupportRefSchema.parse({
          basis,
          entity: { kind, id: value.id, revisionId: basis.revisionId },
          valueDigest: runtimeHash('codeatlas-phase1-support-value-v1', bJson(value, b)),
        }),
      );
  const references = {
    availableEntities: supportInventory.map((s) => ({
      scope: 'REPOSITORY' as const,
      repositoryId: basis.repositoryId,
      entity: s.entity,
    })),
    availableSupports: supportInventory,
  };
  const context = {
    references,
    codeNodes: nodes,
    sourceFiles,
    ...(version === 4 ? { codeEdges: edges } : {}),
  };
  const syntaxEvidence = c.details.projections.map((p) => {
    const envelope = record(b.parse(text(p.envelope_json)));
    check(
      envelope.schema === 'codeatlas.syntax-evidence' && envelope.version === version,
      'RUNTIME_SYNTAX_VERSION_NOT_SUPPORTED',
    );
    return version === 4
      ? parseSyntaxEvidenceV4(envelope, context).payload
      : parseSyntaxEvidenceV3(envelope, context).payload;
  });
  if (version === 4) validateSyntaxSurfaceClosure(syntaxEvidence as SyntaxEvidenceV4[], context);
  else validateSyntaxBindingScopeClosure(syntaxEvidence as SyntaxEvidenceV3[], context);
  const providerCapabilities = [
    ...new Set(
      (c.details.entries.PROVIDER_SNAPSHOT ?? []).flatMap((v) =>
        array(record(v).capabilities)
          .filter((x) => record(x).support === 'SUPPORTED')
          .map((x) => text(record(x).name)),
      ),
    ),
  ].sort();
  const inputs = {
    basis,
    nodes,
    edges,
    sourceFiles,
    syntaxEvidence,
    supportInventory,
    providerCapabilities,
  };
  b.own(inputs);

  return inputs as RuntimeFrameworkInputs | RuntimeFrameworkInputsV2;
}

function candidateDigest(candidate: AnyRuntimeBatchCandidate) {
  return 'derivation' in candidate
    ? runtimeCandidateDigestV2(candidate)
    : runtimeCandidateDigest(candidate);
}
