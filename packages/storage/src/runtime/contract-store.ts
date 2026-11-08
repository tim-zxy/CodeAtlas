import {
  FrozenContractSetV2Schema,
  ensurePhase1Data,
  parseFrozenContractSetV2,
  workspaceRuntimeInputDigestV2,
  canonicalRuntimeJson,
  frozenContractReferenceContext,
  type FrozenContractSetV2,
} from '@codeatlas/ir';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { isDeepStrictEqual, types } from 'node:util';
import {
  FrozenContractSetSchema,
  ContractMatchSchema,
  WorkspaceExecutionSchema,
  parseFrozenContractSet,
  parseContractMatch,
  parseWorkspaceExecution,
  workspaceRuntimeInputDigest,
  supportKey,
  scopedRefKey,
  type FrozenContractSet,
} from '@codeatlas/ir';
import {
  RuntimeFactStore,
  readRuntimeBindingForWorkspace,
  repositoryCompilationWorkspaceSnapshot,
} from './runtime-fact-store.js';
import { readDocumentRowForWorkspaceCompilation } from '../documents/document-store.js';
import {
  HistoryReadBudget,
  HistoryCaptureError,
  checkedHistoryLimits,
  exact,
  record,
  array,
  text,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql, runtimeHash } from './runtime-sql.js';
import { exactCaptureSchema } from '../knowledge/snapshot-schema.js';
type Execution = ReturnType<typeof parseWorkspaceExecution>;
export type WorkspaceRuntimeBatch = {
  expectedOldActivationId: string | null;
  frozen: FrozenContractSet;
  matches: ReturnType<typeof parseContractMatch>[];
  execution: Execution;
};
export interface WorkspacePreparationInputs {
  expectedOldActivationId: string | null;
  frozen: FrozenContractSet;
  graphs: { repositoryBinding: Snapshot['binding']; candidate: Snapshot['candidate'] }[];
}
export type WorkspaceRuntimeOutcome = {
  status: 'NOT_COMMITTED' | 'COMMITTED' | 'COMMIT_OUTCOME_UNKNOWN';
  activationId: string | null;
  freshness: 'CURRENT' | 'AFFECTED' | 'UNKNOWN';
};
function check(v: unknown, message = 'INVALID_WORKSPACE_RUNTIME'): asserts v {
  if (!v) throw Error(message);
}
type Snapshot = ReturnType<typeof readRuntimeBindingForWorkspace>;
function contextFor(snapshots: Snapshot[]) {
  const entities = new Map<string, Execution['payload']['nodes'][number]['repositoryRuntimeRef']>();
  const supports = new Map<string, Snapshot['values'][number]['support']>();
  const add = (r: Execution['payload']['nodes'][number]['repositoryRuntimeRef']) =>
    entities.set(scopedRefKey(r), r);
  for (const s of snapshots) {
    const b = s.binding.repoBasis,
      ref = (kind: string, id: string) =>
        ({
          scope: 'REPOSITORY' as const,
          repositoryId: b.repositoryId,
          entity: { kind, id, revisionId: b.revisionId },
        }) as never;
    add(ref('REPOSITORY', b.repositoryId));
    for (const v of s.values) {
      supports.set(supportKey(v.support), v.support);
      add(ref(v.support.entity.kind, v.support.entity.id));
    }
    const f = s.candidate.facts.payload;
    for (const [kind, items] of [
      ['ENTRY_POINT', f.entryPoints],
      ['TASK_DEFINITION', f.tasks],
      ['DATA_RESOURCE', f.dataResources],
      ['DATA_CHANGE_TRIGGER', f.triggers],
      ['CONTRACT', f.contracts],
      ['EXECUTION_CONTEXT', f.contexts],
      ['EXECUTION_NODE', f.nodes],
      ['EXECUTION_EDGE', f.edges],
      ['RUNTIME_FLOW', f.flows],
    ] as const)
      for (const v of items) add(ref(kind, v.id));
  }
  return { availableEntities: [...entities.values()], availableSupports: [...supports.values()] };
}
function isDeclaredFrozen(value: FrozenContractSet): value is FrozenContractSetV2 {
  return Object.hasOwn(value, 'schemaDocuments');
}
function authenticatedFrozen(
  input: unknown,
  snapshots: Snapshot[],
  b?: HistoryReadBudget,
  maxInputBytes?: number,
) {
  const raw =
      maxInputBytes === undefined
        ? FrozenContractSetSchema.parse(input)
        : FrozenContractSetV2Schema.parse(input),
    context = contextFor(snapshots);
  if (isDeclaredFrozen(raw)) {
    for (const d of raw.schemaDocuments) {
      const current = snapshots
        .flatMap((s) => s.values)
        .find((v) => supportKey(v.support) === supportKey(d.sourceSupport));
      check(
        current && isDeepStrictEqual(current.value, d.sourceFile),
        'WORKSPACE_SCHEMA_SOURCE_CHANGED',
      );
    }
  }
  let frozen: FrozenContractSet | FrozenContractSetV2;
  if (maxInputBytes !== undefined) {
    check(
      b &&
        Number.isSafeInteger(maxInputBytes) &&
        maxInputBytes > 0 &&
        maxInputBytes <= b.limits.maxSerializedBytes,
    );
    const remaining = b.remaining();
    const decoded = parseFrozenContractSetV2(raw, context, {
      maxInputBytes: Math.min(maxInputBytes, remaining.maxSerializedBytes),
      maxItems: remaining.maxItems,
      maxDepth: remaining.maxDepth,
    });
    b.own(decoded.declarations);
    frozen = decoded.set;
  } else frozen = parseFrozenContractSet(raw, context);
  check(
    frozen.workspaceBasis.workspaceActivationDigest ===
      (isDeclaredFrozen(frozen)
        ? workspaceRuntimeInputDigestV2(frozen)
        : workspaceRuntimeInputDigest(frozen)),
  );
  check(frozen.repositoryBindings.length === snapshots.length);
  for (const binding of frozen.repositoryBindings) {
    const s = snapshots.find(
      (x) => x.binding.repoBasis.repositoryId === binding.repoBasis.repositoryId,
    );
    check(s && isDeepStrictEqual(s.binding, binding), 'WORKSPACE_INPUT_CHANGED');
    const expected = s.candidate.facts.payload.contracts;
    const supplied = frozen.contractRefs.filter(
      (c) => c.ref.scope === 'REPOSITORY' && c.ref.repositoryId === binding.repoBasis.repositoryId,
    );
    check(
      expected.length === supplied.length &&
        expected.every((v) => supplied.some((c) => isDeepStrictEqual(c.contract, v))),
    );
  }
  return { frozen, context };
}
function validated(
  input: unknown,
  snapshots: Snapshot[],
  b: HistoryReadBudget,
  maxInputBytes?: number,
) {
  b.own(input);
  const r = exact(input, ['expectedOldActivationId', 'frozen', 'matches', 'execution']);
  check(r.expectedOldActivationId === null || typeof r.expectedOldActivationId === 'string');
  const { frozen, context } = authenticatedFrozen(r.frozen, snapshots, b, maxInputBytes);
  const matchContext = {
    ...context,
    availableEntities: [
      ...context.availableEntities,
      ...frozen.catalog.services.map((s) => ({
        scope: 'WORKSPACE' as const,
        workspaceId: frozen.workspaceBasis.workspaceId,
        entity: { kind: 'SERVICE', id: s.id, revisionId: frozen.workspaceBasis.revisionSetId },
      })),
    ],
  };
  const matches = array(r.matches).map((x) => parseContractMatch(x, matchContext));
  check(new Set(matches.map((m) => m.payload.id)).size === matches.length);
  const execution = parseWorkspaceExecution(r.execution, {
    ...matchContext,
    availableEntities: [
      ...matchContext.availableEntities,
      ...matches.map((m) => ({
        scope: 'WORKSPACE' as const,
        workspaceId: frozen.workspaceBasis.workspaceId,
        entity: {
          kind: 'CONTRACT_MATCH',
          id: m.payload.id,
          revisionId: frozen.workspaceBasis.revisionSetId,
        },
      })),
    ],
  });
  check(
    isDeepStrictEqual(execution.payload.workspaceBasis, frozen.workspaceBasis) &&
      isDeepStrictEqual(execution.payload.repositoryBindings, frozen.repositoryBindings),
  );
  check(execution.payload.coverage.status === 'COMPLETE', 'WORKSPACE_RUNTIME_PARTIAL');
  for (const m of matches)
    check(isDeepStrictEqual(m.payload.workspaceBasis, frozen.workspaceBasis));
  for (const e of execution.payload.edges)
    check(
      matches.some((m) => m.payload.id === e.matchRef.entity.id && m.payload.status === 'MATCHED'),
    );
  const result = {
    expectedOldActivationId: r.expectedOldActivationId as string | null,
    frozen,
    matches,
    execution,
  };
  b.own(result);
  return result;
}
function assertWorkspaceRuntimeSchema(sql: ReturnType<typeof runtimeSql>): void {
  check(
    [6, 7, 8].includes(
      sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version as number,
    ),
  );
  check(sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1);
}
// Keep the original writer gate separate from exact new-schema reads.
function assertWorkspaceRuntimeReadSchema(sql: ReturnType<typeof runtimeSql>): void {
  const version = sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version;
  check([6, 7, 8].includes(version as number) || exactCaptureSchema(sql, version));
  check(sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1);
}
function frozenSet(
  db: DatabaseSync,
  workspace: string,
  input: Pick<WorkspaceRuntimeBatch, 'frozen' | 'expectedOldActivationId'>,
  b: HistoryReadBudget,
  current: Snapshot[],
) {
  const sql = runtimeSql(db, b),
    basis = input.frozen.workspaceBasis;
  check(basis.workspaceId === workspace);
  const sets = sql.read('revision_sets', ['id', 'workspace_id', 'frozen'], 'id=?', [
    basis.revisionSetId,
  ]);
  check(
    sets.length === 1 && sets[0]!.workspace_id === workspace && sets[0]!.frozen === 1,
    'WORKSPACE_REQUIRES_FROZEN_SET',
  );
  const items = sql.read(
    'revision_set_items',
    ['repository_id', 'revision_id', 'revision_fingerprint'],
    'revision_set_id=?',
    [basis.revisionSetId],
  );
  check(items.length === input.frozen.repositoryBindings.length, 'WORKSPACE_INPUT_CHANGED');
  for (const row of items)
    check(
      input.frozen.repositoryBindings.some(
        (x) =>
          x.repoBasis.repositoryId === row.repository_id &&
          x.repoBasis.revisionId === row.revision_id &&
          x.repoBasis.contentFingerprint === row.revision_fingerprint,
      ),
      'WORKSPACE_INPUT_CHANGED',
    );
  const roots = sql.read('repositories', ['repository_id', 'root_path'], 'workspace_id=?', [
    workspace,
  ]);
  for (const source of current)
    check(
      roots.some(
        (r) =>
          r.repository_id === source.binding.repoBasis.repositoryId &&
          r.root_path === source.rootPath,
      ),
      'WORKSPACE_REPOSITORY_MISMATCH',
    );
  const pointer = sql.read('workspace_runtime_state', ['activation_id'], 'workspace_id=?', [
    workspace,
  ]);
  check(
    pointer.length <= 1 && (pointer[0]?.activation_id ?? null) === input.expectedOldActivationId,
    'WORKSPACE_INPUT_CHANGED',
  );
}
const owners = new WeakMap<
  object,
  {
    db: DatabaseSync;
    workspace: string;
    repositories: readonly RuntimeFactStore[];
    marker: StatementSync;
  }
>();
const outcomes = new WeakMap<object, WorkspaceRuntimeOutcome>();
function snapshots(stores: readonly RuntimeFactStore[], b: HistoryReadBudget) {
  return stores.map((s) => readRuntimeBindingForWorkspace(s, b));
}
function sameBindings(actual: Snapshot[], frozen: FrozenContractSet) {
  return (
    actual.length === frozen.repositoryBindings.length &&
    frozen.repositoryBindings.every((x) => actual.some((s) => isDeepStrictEqual(s.binding, x)))
  );
}
export type WorkspaceRuntimeTrace =
  | { status: 'NOT_AVAILABLE'; activationId: null; execution: null }
  | {
      status: 'CURRENT' | 'AFFECTED';
      activationId: string;
      frozen: FrozenContractSet;
      matches: WorkspaceRuntimeBatch['matches'];
      execution: Execution;
    };
export type WorkspaceRuntimeBatchV2 = Omit<WorkspaceRuntimeBatch, 'frozen'> & {
  frozen: FrozenContractSetV2;
};
export type WorkspacePreparationInputsV2 = Omit<WorkspacePreparationInputs, 'frozen'> & {
  frozen: FrozenContractSetV2;
};
export type WorkspaceRuntimeTraceV2 = (
  | { status: 'NOT_AVAILABLE'; activationId: null; execution: null }
  | {
      status: 'CURRENT' | 'AFFECTED';
      activationId: string;
      frozen: FrozenContractSetV2;
      matches: WorkspaceRuntimeBatch['matches'];
      execution: Execution;
    }
) & { evidenceScope: 'EXPLICIT_DECLARED_HTTP_SCHEMA' };
export class ContractStore {
  constructor(db: DatabaseSync, workspaceId: string, repositories: readonly RuntimeFactStore[]) {
    check(!types.isProxy(db) && db instanceof DatabaseSync && db.isOpen);
    check(
      Array.isArray(repositories) &&
        !types.isProxy(repositories) &&
        repositories.every((s) => s instanceof RuntimeFactStore),
    );
    owners.set(this, {
      db,
      workspace: text(workspaceId),
      repositories: [...repositories],
      marker: db.prepare('SELECT 1 WHERE 0'),
    });
  }
  /** Authenticate an explicit frozen set against owned repository snapshots and W003.
   * Per-database snapshots are not a cross-database atomic moment. No writes or repair. */
  readWorkspaceInputs(
    input: FrozenContractSet,
    limits: HistoryReadLimits,
  ): WorkspacePreparationInputs {
    return this.readInputs(input, limits);
  }
  readWorkspaceInputsV2(
    input: FrozenContractSetV2,
    limits: HistoryReadLimits,
    maxInputBytes: number,
  ): WorkspacePreparationInputsV2 {
    return this.readInputs(input, limits, maxInputBytes) as WorkspacePreparationInputsV2;
  }
  private readInputs(
    input: FrozenContractSet,
    limits: HistoryReadLimits,
    maxInputBytes?: number,
  ): WorkspacePreparationInputs {
    const { db, workspace, repositories } = owners.get(this)!;
    const b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    b.own(input);
    const current = snapshots(repositories, b);
    const { frozen } = authenticatedFrozen(input, current, b, maxInputBytes);
    db.exec('BEGIN');
    try {
      assertWorkspaceRuntimeReadSchema(runtimeSql(db, b));
      const pointer = runtimeSql(db, b).read(
        'workspace_runtime_state',
        ['activation_id'],
        'workspace_id=?',
        [workspace],
      );
      check(pointer.length <= 1);
      const expectedOldActivationId = pointer.length ? text(pointer[0]!.activation_id) : null;
      frozenSet(db, workspace, { frozen, expectedOldActivationId }, b, current);
      const result = {
        expectedOldActivationId,
        frozen,
        graphs: current.map((s) => ({ repositoryBinding: s.binding, candidate: s.candidate })),
      };
      b.own(result);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }
  applyWorkspaceBatch(
    input: WorkspaceRuntimeBatch,
    limits: HistoryReadLimits,
  ): WorkspaceRuntimeOutcome {
    return this.applyBatch(input, limits);
  }
  applyWorkspaceBatchV2(
    input: WorkspaceRuntimeBatchV2,
    limits: HistoryReadLimits,
    maxInputBytes: number,
  ): WorkspaceRuntimeOutcome {
    return this.applyBatch(input, limits, maxInputBytes);
  }
  private applyBatch(
    input: WorkspaceRuntimeBatch,
    limits: HistoryReadLimits,
    maxInputBytes?: number,
  ): WorkspaceRuntimeOutcome {
    const { db, workspace, repositories } = owners.get(this)!,
      b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    outcomes.set(this, { status: 'NOT_COMMITTED', activationId: null, freshness: 'UNKNOWN' });
    const prepared = validated(input, snapshots(repositories, b), b, maxInputBytes);
    let id: string | null = null,
      committing = false;
    try {
      db.exec('BEGIN IMMEDIATE');
      assertWorkspaceRuntimeSchema(runtimeSql(db, b));
      const current = snapshots(repositories, b);
      frozenSet(db, workspace, prepared, b, current);
      check(sameBindings(current, prepared.frozen), 'WORKSPACE_INPUT_CHANGED');
      if (maxInputBytes !== undefined)
        authenticatedFrozen(prepared.frozen, current, b, maxInputBytes);
      const sql = runtimeSql(db, b),
        wb = prepared.frozen.workspaceBasis;
      const digest = runtimeHash(
        maxInputBytes === undefined
          ? 'workspace-runtime-candidate-v1'
          : 'workspace-runtime-candidate-v2',
        maxInputBytes === undefined
          ? sql.json({
              frozen: prepared.frozen,
              matches: prepared.matches,
              execution: prepared.execution,
            })
          : canonicalRuntimeJson({
              frozen: prepared.frozen,
              matches: prepared.matches,
              execution: prepared.execution,
            }),
      );
      const identity = {
        workspaceId: workspace,
        revisionSetId: wb.revisionSetId,
        parentId: prepared.expectedOldActivationId,
        inputDigest: wb.workspaceActivationDigest,
        candidateDigest: digest,
      };
      id =
        'workspace-runtime-activation:' +
        runtimeHash(
          maxInputBytes === undefined
            ? 'workspace-runtime-activation-v1'
            : 'workspace-runtime-activation-v2',
          maxInputBytes === undefined ? sql.json(identity) : canonicalRuntimeJson(identity),
        );
      sql.insert('workspace_runtime_activations', {
        id,
        workspace_id: workspace,
        revision_set_id: wb.revisionSetId,
        parent_id: prepared.expectedOldActivationId,
        input_digest: wb.workspaceActivationDigest,
        candidate_digest: digest,
        ...sql.payload(
          'codeatlas.workspace-runtime-activation',
          maxInputBytes === undefined
            ? { identity, ...prepared }
            : { formatVersion: 2, identity, ...prepared },
        ),
      });
      const common = { activation_id: id, revision_set_id: wb.revisionSetId };
      for (const s of prepared.frozen.catalog.services)
        sql.insert('services', {
          ...common,
          entity_id: s.id,
          fact_key: s.factKey,
          logical_service_key: s.logicalServiceKey,
          location: s.location,
          repository_id:
            s.repositoryRef?.scope === 'REPOSITORY' ? s.repositoryRef.repositoryId : null,
          ...sql.payload('codeatlas.frozen-service-catalog', s),
        });
      for (const s of prepared.frozen.catalog.entries)
        sql.insert('service_identities', {
          ...common,
          entity_id: s.id,
          fact_key: s.factKey,
          service_id: s.serviceRef.entity.id,
          identity_kind: s.identityKind,
          namespace: s.namespace,
          identity_key: s.key,
          ...sql.payload('codeatlas.frozen-service-catalog', s),
        });
      for (const c of prepared.frozen.contractRefs) {
        check(c.ref.scope === 'REPOSITORY');
        const service =
          prepared.frozen.catalog.contractBindings.find(
            (x) => scopedRefKey(x.contractRef) === scopedRefKey(c.ref),
          )?.serviceRef.entity.id ?? null;
        sql.insert('contracts', {
          ...common,
          repository_id: c.ref.repositoryId,
          entity_id: c.contract.id,
          fact_key: c.contract.factKey,
          service_id: service,
          ...sql.payload('codeatlas.runtime-fact-set', c.contract),
        });
      }
      for (const m of prepared.matches) {
        const v = m.payload;
        check(v.consumerRef.scope === 'REPOSITORY');
        const selected = v.selectedProviderRef;
        check(!selected || selected.scope === 'REPOSITORY');
        sql.insert('contract_matches', {
          ...common,
          entity_id: v.id,
          fact_key: v.factKey,
          consumer_repository_id: v.consumerRef.repositoryId,
          consumer_id: v.consumerRef.entity.id,
          status: v.status,
          selected_repository_id: selected?.scope === 'REPOSITORY' ? selected.repositoryId : null,
          selected_id: selected?.entity.id ?? null,
          ...sql.payload('codeatlas.contract-match', v),
        });
        for (const p of v.candidateProviderRefs) {
          check(p.scope === 'REPOSITORY');
          sql.insert('match_candidates', {
            ...common,
            match_id: v.id,
            provider_repository_id: p.repositoryId,
            provider_id: p.entity.id,
          });
        }
      }
      for (const n of prepared.execution.payload.nodes) {
        check(n.repositoryRuntimeRef.scope === 'REPOSITORY');
        sql.insert('workspace_execution_nodes', {
          ...common,
          entity_id: n.id,
          fact_key: n.factKey,
          repository_id: n.repositoryRuntimeRef.repositoryId,
          runtime_node_id: n.repositoryRuntimeRef.entity.id,
          ...sql.payload('codeatlas.workspace-execution', n),
        });
      }
      for (const e of prepared.execution.payload.edges)
        sql.insert('workspace_execution_edges', {
          ...common,
          entity_id: e.id,
          fact_key: e.factKey,
          source_id: e.sourceRef.entity.id,
          target_id: e.targetRef.entity.id,
          match_id: e.matchRef.entity.id,
          ...sql.payload('codeatlas.workspace-execution', e),
        });
      sql.run('DELETE FROM workspace_runtime_state WHERE workspace_id=?', [workspace]);
      sql.insert('workspace_runtime_state', {
        workspace_id: workspace,
        activation_id: id,
        revision_set_id: wb.revisionSetId,
      });
      committing = true;
      outcomes.set(this, {
        status: 'COMMIT_OUTCOME_UNKNOWN',
        activationId: id,
        freshness: 'UNKNOWN',
      });
      db.exec('COMMIT');
      // Commit is already real. A later source/budget/output failure cannot turn it into a rollback.
      const result: WorkspaceRuntimeOutcome = {
        status: 'COMMITTED',
        activationId: id,
        freshness: 'UNKNOWN',
      };
      outcomes.set(this, result);
      try {
        result.freshness = sameBindings(snapshots(repositories, b), prepared.frozen)
          ? 'CURRENT'
          : 'AFFECTED';
      } catch (e) {
        if (e instanceof Error && e.message === 'RUNTIME_NOT_CURRENT')
          result.freshness = 'AFFECTED';
      }
      return Object.freeze({ ...result });
    } catch (e) {
      if (db.isOpen && db.isTransaction) {
        try {
          db.exec('ROLLBACK');
          outcomes.set(this, { status: 'NOT_COMMITTED', activationId: id, freshness: 'UNKNOWN' });
        } catch {
          outcomes.set(this, {
            status: 'COMMIT_OUTCOME_UNKNOWN',
            activationId: id,
            freshness: 'UNKNOWN',
          });
        }
      } else if (!committing)
        outcomes.set(this, { status: 'NOT_COMMITTED', activationId: id, freshness: 'UNKNOWN' });
      throw e;
    }
  }
  settlement(): WorkspaceRuntimeOutcome {
    return Object.freeze({
      ...(outcomes.get(this) ?? {
        status: 'NOT_COMMITTED',
        activationId: null,
        freshness: 'UNKNOWN',
      }),
    });
  }

  /** Fresh read-only recovery; repository changes affect freshness, never the commit fact. */
  inspectOutcome(limits: HistoryReadLimits): WorkspaceRuntimeOutcome {
    const outcome = this.settlement(),
      owner = owners.get(this)!;
    if (outcome.activationId === null) return outcome;
    const path = owner.db.location('main');
    check(path && !owner.db.isTransaction);
    const b = new HistoryReadBudget(checkedHistoryLimits(limits)),
      db = new DatabaseSync(path, { readOnly: true, enableForeignKeyConstraints: true });
    try {
      db.exec('BEGIN');
      assertWorkspaceRuntimeReadSchema(runtimeSql(db, b));
      const rows = runtimeSql(db, b).read(
        'workspace_runtime_activations',
        ['id'],
        'workspace_id=? AND id=?',
        [owner.workspace, outcome.activationId],
      );
      if (rows.length === 1) {
        readWorkspaceActivation(db, owner.workspace, outcome.activationId, b);
        db.exec('COMMIT');
        return { status: 'COMMITTED', activationId: outcome.activationId, freshness: 'UNKNOWN' };
      }
      check(rows.length === 0);
      db.exec('COMMIT');
      return {
        status: outcome.status === 'NOT_COMMITTED' ? 'NOT_COMMITTED' : 'COMMIT_OUTCOME_UNKNOWN',
        activationId: outcome.activationId,
        freshness: 'UNKNOWN',
      };
    } finally {
      try {
        if (db.isTransaction) db.exec('ROLLBACK');
      } finally {
        db.close();
      }
    }
  }

  traceWorkspaceRuntime(limits: HistoryReadLimits): WorkspaceRuntimeTrace {
    return this.traceRuntime(limits, 1);
  }
  traceWorkspaceRuntimeV2(limits: HistoryReadLimits): WorkspaceRuntimeTraceV2 {
    return {
      ...this.traceRuntime(limits, 2),
      evidenceScope: 'EXPLICIT_DECLARED_HTTP_SCHEMA',
    } as WorkspaceRuntimeTraceV2;
  }
  private traceRuntime(limits: HistoryReadLimits, format: 1 | 2): WorkspaceRuntimeTrace {
    const { db, workspace, repositories } = owners.get(this)!,
      b = new HistoryReadBudget(checkedHistoryLimits(limits));
    check(!db.isTransaction);
    db.exec('BEGIN');
    let stored: ReturnType<typeof readWorkspaceActivation> | null = null;
    try {
      const sql = runtimeSql(db, b);
      assertWorkspaceRuntimeReadSchema(sql);
      const state = sql.read('workspace_runtime_state', ['activation_id'], 'workspace_id=?', [
        workspace,
      ]);
      check(state.length <= 1);
      if (state.length)
        stored = readWorkspaceActivation(db, workspace, text(state[0]!.activation_id), b);
      db.exec('COMMIT');
    } catch (e) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw e;
    }
    if (!stored) return { status: 'NOT_AVAILABLE' as const, activationId: null, execution: null };
    check((stored.formatVersion ?? 1) === format, 'UNSUPPORTED_WORKSPACE_RUNTIME_FORMAT');
    let current = false;
    try {
      current = sameBindings(snapshots(repositories, b), stored.frozen);
    } catch (e) {
      if (!(e instanceof Error && e.message === 'RUNTIME_NOT_CURRENT')) throw e;
    }
    return { status: current ? ('CURRENT' as const) : ('AFFECTED' as const), ...stored };
  }
}
function readWorkspaceActivation(
  db: DatabaseSync,
  workspace: string,
  id: string,
  b: HistoryReadBudget,
): WorkspaceCompilationRuntime {
  const sql = runtimeSql(db, b),
    rows = sql.read(
      'workspace_runtime_activations',
      [
        'id',
        'workspace_id',
        'revision_set_id',
        'parent_id',
        'input_digest',
        'candidate_digest',
        'schema_name',
        'schema_version',
        'payload_json',
        'value_digest',
      ],
      'id=? AND workspace_id=?',
      [id, workspace],
    );
  check(rows.length === 1);
  const row = rows[0]!,
    raw = text(row.payload_json);
  check(
    row.schema_name === 'codeatlas.workspace-runtime-activation' &&
      row.schema_version === 1 &&
      row.value_digest === runtimeHash('runtime-storage-value-v1', raw),
  );
  const value = record(b.parse(raw));
  const format = Object.hasOwn(value, 'formatVersion') ? 2 : 1;
  if (format === 2) {
    check(value.formatVersion === 2);
    exact(value, [
      'formatVersion',
      'identity',
      'expectedOldActivationId',
      'frozen',
      'matches',
      'execution',
    ]);
  }
  const identity = record(value.identity),
    frozen =
      format === 2
        ? FrozenContractSetV2Schema.parse(value.frozen)
        : FrozenContractSetSchema.parse(value.frozen);
  if (isDeclaredFrozen(frozen)) {
    const remaining = b.remaining();
    const decoded = parseFrozenContractSetV2(
      frozen,
      frozenContractReferenceContext(
        frozen,
        frozen.schemaDocuments.map((d) => d.sourceSupport),
      ),
      {
        maxInputBytes: remaining.maxSerializedBytes,
        maxItems: remaining.maxItems,
        maxDepth: remaining.maxDepth,
      },
    );
    b.own(decoded.declarations);
  }
  const matches: WorkspaceRuntimeBatch['matches'] = array(value.matches).map((m) => {
    const v = exact(m, ['schema', 'version', 'payload']);
    check(v.schema === 'codeatlas.contract-match' && v.version === 1);
    return {
      schema: 'codeatlas.contract-match',
      version: 1,
      payload: ContractMatchSchema.parse(v.payload),
    };
  });
  const env = exact(value.execution, ['schema', 'version', 'payload']);
  check(env.schema === 'codeatlas.workspace-execution' && env.version === 1);
  const execution: Execution = {
    schema: 'codeatlas.workspace-execution',
    version: 1,
    payload: WorkspaceExecutionSchema.parse(env.payload),
  };
  check(
    id ===
      'workspace-runtime-activation:' +
        runtimeHash(
          format === 1 ? 'workspace-runtime-activation-v1' : 'workspace-runtime-activation-v2',
          format === 1 ? sql.json(identity) : canonicalRuntimeJson(identity),
        ),
  );
  check(
    identity.workspaceId === row.workspace_id &&
      identity.revisionSetId === row.revision_set_id &&
      identity.parentId === row.parent_id &&
      identity.inputDigest === row.input_digest &&
      identity.candidateDigest === row.candidate_digest,
  );
  check(
    frozen.workspaceBasis.workspaceActivationDigest ===
      (isDeclaredFrozen(frozen)
        ? workspaceRuntimeInputDigestV2(frozen)
        : workspaceRuntimeInputDigest(frozen)) &&
      identity.inputDigest === frozen.workspaceBasis.workspaceActivationDigest,
  );
  check(
    row.candidate_digest ===
      runtimeHash(
        format === 1 ? 'workspace-runtime-candidate-v1' : 'workspace-runtime-candidate-v2',
        format === 1
          ? sql.json({ frozen, matches, execution })
          : canonicalRuntimeJson({ frozen, matches, execution }),
      ),
  );
  const groups = [
    ['services', frozen.catalog.services, 'codeatlas.frozen-service-catalog'],
    ['service_identities', frozen.catalog.entries, 'codeatlas.frozen-service-catalog'],
    ['contracts', frozen.contractRefs.map((c) => c.contract), 'codeatlas.runtime-fact-set'],
    ['contract_matches', matches.map((m) => record(record(m).payload)), 'codeatlas.contract-match'],
    ['workspace_execution_nodes', execution.payload.nodes, 'codeatlas.workspace-execution'],
    ['workspace_execution_edges', execution.payload.edges, 'codeatlas.workspace-execution'],
  ] as const;
  for (const [table, items, schema] of groups) {
    const data = sql.read(
      table,
      [
        'entity_id',
        'schema_name',
        'schema_version',
        'payload_json',
        'value_digest',
        ...(table === 'contracts' ? ['repository_id'] : []),
      ],
      'activation_id=? AND revision_set_id=?',
      [id, text(row.revision_set_id)],
    );
    check(data.length === items.length);
    for (const r of data) {
      const item = items.find(
        (v) =>
          v.id === r.entity_id &&
          (table !== 'contracts' || ('repositoryId' in v && v.repositoryId === r.repository_id)),
      );
      check(item);
      check(
        r.schema_name === schema &&
          r.schema_version === 1 &&
          r.payload_json === sql.json(item) &&
          r.value_digest === runtimeHash('runtime-storage-value-v1', text(r.payload_json)),
      );
    }
  }
  const providers = sql.read(
    'match_candidates',
    ['match_id', 'provider_repository_id', 'provider_id'],
    'activation_id=? AND revision_set_id=?',
    [id, text(row.revision_set_id)],
  );
  const expected = matches.flatMap((m) => {
    const p = record(record(m).payload);
    return array(p.candidateProviderRefs).map((r) => ({
      match_id: p.id,
      provider_repository_id: record(r).repositoryId,
      provider_id: record(record(r).entity).id,
    }));
  });
  check(
    providers.length === expected.length &&
      providers.every((p) =>
        expected.some(
          (e) =>
            p.match_id === e.match_id &&
            p.provider_repository_id === e.provider_repository_id &&
            p.provider_id === e.provider_id,
        ),
      ),
  );
  return {
    activationId: id,
    frozen,
    matches,
    execution,
    ...(format === 2 ? { formatVersion: 2 as const } : {}),
  };
}

type CompilationDocumentSelection = Readonly<{ documentId: string; documentRevisionId: string }>;
type CompilationRepository = Readonly<{ store: RuntimeFactStore; handle: object }>;
interface WorkspaceCompilationSelection {
  workspaceId: string;
  revisionSetId: string;
  registeredRepositories: { repositoryId: string; rootPath: string }[];
  revisionSetEntries: { repositoryId: string; revisionId: string; revisionFingerprint: string }[];
}
interface WorkspaceCompilationRuntime {
  activationId: string;
  frozen: FrozenContractSet | FrozenContractSetV2;
  matches: WorkspaceRuntimeBatch['matches'];
  execution: Execution;
  formatVersion?: 2;
}
interface WorkspaceCompilationView extends WorkspaceCompilationSelection {
  workspaceRuntimeRead: 'REQUESTED' | 'NOT_REQUESTED';
  workspaceRuntime: WorkspaceCompilationRuntime | null;
  documents: NonNullable<ReturnType<typeof readDocumentRowForWorkspaceCompilation>>[];
}
interface WorkspaceCompilationFrame {
  view: WorkspaceCompilationView;
  documentHeads: { documentId: string; rows: ReturnType<ReturnType<typeof runtimeSql>['read']> }[];
}
interface WorkspaceCompilationCapture {
  readonly handle: object;
  readonly view: WorkspaceCompilationView;
}

function compilationControl(syncCheck: () => undefined): void {
  check(
    typeof syncCheck === 'function' &&
      !types.isProxy(syncCheck) &&
      !types.isAsyncFunction(syncCheck),
    'WORKSPACE_SYNC_CHECK_REQUIRED',
  );
  const result: unknown = syncCheck();
  if (types.isPromise(result)) Promise.prototype.then.call(result, undefined, () => {});
  check(result === undefined, 'WORKSPACE_SYNC_CHECK_REQUIRED');
}
function compilationFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) compilationFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function compilationWorkspaceOwner(store: ContractStore) {
  check(store !== null && typeof store === 'object' && !types.isProxy(store));
  const owner = owners.get(store);
  check(owner && owner.db.isOpen && !owner.db.isTransaction, 'WORKSPACE_CAPTURE_UNAVAILABLE');
  try {
    owner.marker.setReadBigInts(false);
  } catch {
    throw Error('WORKSPACE_CAPTURE_UNAVAILABLE');
  }
  return owner;
}
function compilationSql(db: DatabaseSync, b: HistoryReadBudget, syncCheck: () => undefined) {
  check(b instanceof HistoryReadBudget && !types.isProxy(b), 'INVALID_WORKSPACE_BUDGET');
  const base = runtimeSql(db, b);
  return {
    ...base,
    read(...args: Parameters<typeof base.read>) {
      compilationControl(syncCheck);
      const result = base.read(...args);
      compilationControl(syncCheck);
      return result;
    },
  };
}
function compilationSelection(
  sql: ReturnType<typeof runtimeSql>,
  workspaceId: string,
  revisionSetId: string,
): WorkspaceCompilationSelection {
  const version = sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version;
  check(
    version === 6 || version === 7 || version === 8 || exactCaptureSchema(sql, version),
    'WORKSPACE_SCHEMA_UNSUPPORTED',
  );
  check(
    sql.read('pragma_foreign_keys', ['foreign_keys'], '1', [])[0]?.foreign_keys === 1,
    'WORKSPACE_FOREIGN_KEYS_REQUIRED',
  );
  check(
    sql.read('workspace', ['id'], 'id=?', [workspaceId]).length === 1,
    'WORKSPACE_SCOPE_CHANGED',
  );
  const registeredRepositories = sql
    .read('repositories', ['repository_id', 'root_path'], 'workspace_id=?', [workspaceId])
    .map((row) => ({ repositoryId: text(row.repository_id), rootPath: text(row.root_path) }))
    .sort((a, b) =>
      a.repositoryId < b.repositoryId ? -1 : a.repositoryId > b.repositoryId ? 1 : 0,
    );
  const sets = sql.read('revision_sets', ['id', 'workspace_id', 'frozen'], 'id=?', [revisionSetId]);
  check(
    sets.length === 1 && sets[0]!.workspace_id === workspaceId && sets[0]!.frozen === 1,
    'WORKSPACE_REQUIRES_FROZEN_SET',
  );
  const revisionSetEntries = sql
    .read(
      'revision_set_items',
      ['repository_id', 'revision_id', 'revision_fingerprint'],
      'revision_set_id=?',
      [revisionSetId],
    )
    .map((row) => ({
      repositoryId: text(row.repository_id),
      revisionId: text(row.revision_id),
      revisionFingerprint: text(row.revision_fingerprint),
    }))
    .sort((a, b) =>
      a.repositoryId < b.repositoryId ? -1 : a.repositoryId > b.repositoryId ? 1 : 0,
    );
  check(
    new Set(registeredRepositories.map((x) => x.repositoryId)).size ===
      registeredRepositories.length,
  );
  check(new Set(revisionSetEntries.map((x) => x.repositoryId)).size === revisionSetEntries.length);
  for (const entry of revisionSetEntries)
    check(
      registeredRepositories.some((x) => x.repositoryId === entry.repositoryId),
      'WORKSPACE_REPOSITORY_MISMATCH',
    );
  return { workspaceId, revisionSetId, registeredRepositories, revisionSetEntries };
}
function compilationTransaction<T>(
  store: ContractStore,
  budget: HistoryReadBudget,
  syncCheck: () => undefined,
  read: (
    sql: ReturnType<typeof runtimeSql>,
    owner: ReturnType<typeof compilationWorkspaceOwner>,
  ) => T,
): T {
  const owner = compilationWorkspaceOwner(store),
    { db } = owner;
  const sql = compilationSql(db, budget, syncCheck);
  compilationControl(syncCheck);
  compilationWorkspaceOwner(store);
  check(!db.isTransaction, 'WORKSPACE_TRANSACTION_ACTIVE');
  db.exec('BEGIN');
  let transaction = true;
  try {
    const result = read(sql, owner);
    compilationControl(syncCheck);
    try {
      owner.marker.setReadBigInts(false);
    } catch {
      throw Error('WORKSPACE_CAPTURE_UNAVAILABLE');
    }
    check(db.isOpen && db.isTransaction, 'WORKSPACE_CAPTURE_UNAVAILABLE');
    db.exec('COMMIT');
    transaction = false;
    compilationWorkspaceOwner(store);
    return compilationFreeze(result);
  } catch (error) {
    try {
      // Never adopt a new transaction on a reopened connection.
      owner.marker.setReadBigInts(false);
      if (transaction && db.isOpen && db.isTransaction) db.exec('ROLLBACK');
    } catch {
      throw Object.assign(new HistoryCaptureError('CONTEXT_UNAVAILABLE'), {
        cleanupState: 'UNKNOWN' as const,
      });
    }
    throw error;
  }
}
/** Metadata only: trusted Application authorizes selection before any body read. */
export function readWorkspaceCompilationSelection(
  store: ContractStore,
  revisionSetId: string,
  budget: HistoryReadBudget,
  syncCheck: () => undefined,
): WorkspaceCompilationSelection {
  try {
    const id = text(revisionSetId);
    return compilationTransaction(store, budget, syncCheck, (sql, owner) => {
      const result = compilationSelection(sql, owner.workspace, id);
      budget.own(result);
      return result;
    });
  } catch (error) {
    if (error instanceof HistoryCaptureError) throw error;
    throw new HistoryCaptureError('INVALID_HISTORY');
  }
}
function compilationRepositories(
  input: readonly CompilationRepository[],
  budget: HistoryReadBudget,
): CompilationRepository[] {
  check(Array.isArray(input) && !types.isProxy(input), 'WORKSPACE_REPOSITORY_MISMATCH');
  // Prepay the owned descriptor/index collection with the shared logical account.
  budget.add('items', input.length);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  check(Reflect.ownKeys(descriptors).length === input.length + 1, 'WORKSPACE_REPOSITORY_MISMATCH');
  const result: CompilationRepository[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = descriptors[String(index)];
    check(
      descriptor && 'value' in descriptor && descriptor.enumerable,
      'WORKSPACE_REPOSITORY_MISMATCH',
    );
    const item: unknown = descriptor.value;
    check(
      item &&
        typeof item === 'object' &&
        !types.isProxy(item) &&
        Object.getPrototypeOf(item) === Object.prototype,
      'WORKSPACE_REPOSITORY_MISMATCH',
    );
    const fields = Object.getOwnPropertyDescriptors(item);
    check(
      Reflect.ownKeys(fields).length === 2 &&
        fields.store &&
        fields.handle &&
        'value' in fields.store &&
        'value' in fields.handle &&
        fields.store.enumerable &&
        fields.handle.enumerable,
      'WORKSPACE_REPOSITORY_MISMATCH',
    );
    const store: unknown = fields.store.value,
      handle: unknown = fields.handle.value;
    check(
      !types.isProxy(store) &&
        store instanceof RuntimeFactStore &&
        handle &&
        typeof handle === 'object' &&
        !types.isProxy(handle),
      'WORKSPACE_REPOSITORY_MISMATCH',
    );
    result.push({ store, handle });
  }
  return result;
}
function readCompilationWorkspace(
  store: ContractStore,
  revisionSetId: string,
  selected: readonly CompilationDocumentSelection[],
  repositories: readonly CompilationRepository[],
  includeWorkspaceRuntime: boolean,
  budget: HistoryReadBudget,
  syncCheck: () => undefined,
): WorkspaceCompilationFrame {
  return compilationTransaction(store, budget, syncCheck, (sql, owner) => {
    const selection = compilationSelection(sql, owner.workspace, revisionSetId);
    const current: Snapshot[] = [];
    const seen = new Set<RuntimeFactStore>();
    for (const repository of repositories) {
      check(
        owner.repositories.includes(repository.store) && !seen.has(repository.store),
        'WORKSPACE_REPOSITORY_MISMATCH',
      );
      seen.add(repository.store);
      const snapshot = repositoryCompilationWorkspaceSnapshot(repository.store, repository.handle);
      if (snapshot) current.push(snapshot);
    }
    const state = includeWorkspaceRuntime
      ? sql.read(
          'workspace_runtime_state',
          ['activation_id', 'revision_set_id'],
          'workspace_id=?',
          [owner.workspace],
        )
      : [];
    check(state.length <= 1);
    let workspaceRuntime: ReturnType<typeof readWorkspaceActivation> | null = null;
    if (state.length) {
      check(state[0]!.revision_set_id === revisionSetId, 'WORKSPACE_INPUT_CHANGED');
      workspaceRuntime = readWorkspaceActivation(
        owner.db,
        owner.workspace,
        text(state[0]!.activation_id),
        budget,
      );
      // Reuse original full candidate/reference checks after storage integrity validation.
      validated(
        {
          expectedOldActivationId: workspaceRuntime.activationId,
          frozen: workspaceRuntime.frozen,
          matches: workspaceRuntime.matches,
          execution: workspaceRuntime.execution,
        },
        current,
        budget,
        workspaceRuntime.formatVersion === 2 ? budget.remaining().maxSerializedBytes : undefined,
      );
      frozenSet(
        owner.db,
        owner.workspace,
        { frozen: workspaceRuntime.frozen, expectedOldActivationId: workspaceRuntime.activationId },
        budget,
        current,
      );
    }
    compilationControl(syncCheck);
    const documents = selected.map((item) => {
      const row = readDocumentRowForWorkspaceCompilation(
        owner.workspace,
        sql,
        budget,
        item.documentId,
        item.documentRevisionId,
        () => compilationControl(syncCheck),
      );
      check(row, 'DOCUMENT_REQUIRED_DOCUMENT_MISSING');
      const repo = row.bundle.payload.document.repositoryId;
      check(
        repo === null || selection.registeredRepositories.some((x) => x.repositoryId === repo),
        'WORKSPACE_REPOSITORY_MISMATCH',
      );
      return row;
    });
    // Head changes invalidate a capture without rewriting immutable historical bundles.
    const documentHeads = selected.map((item) => ({
      documentId: item.documentId,
      rows: sql.read('documents', ['current_revision_id'], 'id=? AND workspace_id=?', [
        item.documentId,
        owner.workspace,
      ]),
    }));
    const result = {
      view: {
        ...selection,
        workspaceRuntimeRead: includeWorkspaceRuntime
          ? ('REQUESTED' as const)
          : ('NOT_REQUESTED' as const),
        workspaceRuntime,
        documents,
      },
      documentHeads,
    };
    budget.own(result);
    return result;
  });
}
const compilationOwners = new WeakMap<
  object,
  {
    store: ContractStore;
    db: DatabaseSync;
    marker: StatementSync;
    selected: readonly CompilationDocumentSelection[];
    includeWorkspaceRuntime: boolean;
    captured: ReturnType<typeof readCompilationWorkspace> | null;
  }
>();
function compilationHandle(store: ContractStore, handle: object) {
  check(
    handle !== null && typeof handle === 'object' && !types.isProxy(handle),
    'WORKSPACE_CAPTURE_UNAVAILABLE',
  );
  const entry = compilationOwners.get(handle);
  check(
    entry &&
      entry.store === store &&
      entry.captured &&
      entry.db.isOpen &&
      owners.get(store)?.db === entry.db,
    'WORKSPACE_CAPTURE_UNAVAILABLE',
  );
  try {
    entry.marker.setReadBigInts(false);
  } catch {
    throw Error('WORKSPACE_CAPTURE_UNAVAILABLE');
  }
  return entry;
}
/** Private owned composition. Payload validation does not grant Source/scan permission. */
export function captureWorkspaceCompilationInputs(
  store: ContractStore,
  revisionSetId: string,
  documents: readonly CompilationDocumentSelection[],
  repositories: readonly CompilationRepository[],
  includeWorkspaceRuntime: boolean,
  budget: HistoryReadBudget,
  syncCheck: () => undefined,
): WorkspaceCompilationCapture {
  try {
    check(
      budget instanceof HistoryReadBudget && !types.isProxy(budget),
      'INVALID_WORKSPACE_BUDGET',
    );
    const ownedRepositories = compilationRepositories(repositories, budget);
    check(typeof includeWorkspaceRuntime === 'boolean');
    budget.own(documents);
    ensurePhase1Data(documents);
    const selected = array(documents).map((value) => {
      const row = exact(value, ['documentId', 'documentRevisionId']);
      return { documentId: text(row.documentId), documentRevisionId: text(row.documentRevisionId) };
    });
    check(
      new Set(selected.map((x) => x.documentId)).size === selected.length,
      'DOCUMENT_DUPLICATE_SELECTION',
    );
    budget.own(selected);
    const id = text(revisionSetId);
    const captured = readCompilationWorkspace(
      store,
      id,
      selected,
      ownedRepositories,
      includeWorkspaceRuntime,
      budget,
      syncCheck,
    );
    const db = owners.get(store)!.db,
      handle = Object.freeze({});
    compilationOwners.set(handle, {
      store,
      db,
      marker: db.prepare('SELECT 1 WHERE 0'),
      selected,
      includeWorkspaceRuntime,
      captured,
    });
    return Object.freeze({ handle, view: captured.view });
  } catch (error) {
    if (error instanceof HistoryCaptureError) throw error;
    throw new HistoryCaptureError('INVALID_HISTORY');
  }
}
export function recheckWorkspaceCompilationInputs(
  store: ContractStore,
  handle: object,
  repositories: readonly CompilationRepository[],
  budget: HistoryReadBudget,
  syncCheck: () => undefined,
): void {
  try {
    const entry = compilationHandle(store, handle);
    const ownedRepositories = compilationRepositories(repositories, budget);
    const fresh = readCompilationWorkspace(
      store,
      entry.captured!.view.revisionSetId,
      entry.selected,
      ownedRepositories,
      entry.includeWorkspaceRuntime,
      budget,
      syncCheck,
    );
    compilationHandle(store, handle);
    if (!isDeepStrictEqual(entry.captured, fresh)) throw new HistoryCaptureError('HISTORY_CHANGED');
  } catch (error) {
    if (error instanceof HistoryCaptureError) throw error;
    throw new HistoryCaptureError('INVALID_HISTORY');
  }
}
export function releaseWorkspaceCompilationInputs(store: ContractStore, handle: object): void {
  try {
    check(
      handle !== null && typeof handle === 'object' && !types.isProxy(handle),
      'WORKSPACE_CAPTURE_UNAVAILABLE',
    );
    const entry = compilationOwners.get(handle);
    check(entry && entry.store === store && entry.captured, 'WORKSPACE_CAPTURE_UNAVAILABLE');
    entry.captured = null;
    compilationOwners.delete(handle);
  } catch (error) {
    if (error instanceof HistoryCaptureError) throw error;
    throw new HistoryCaptureError('INVALID_HISTORY');
  }
}
