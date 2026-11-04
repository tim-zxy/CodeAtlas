import {
  FrozenContractSetV2Schema,
  parseFrozenContractSetV2,
  workspaceRuntimeInputDigestV2,
  canonicalRuntimeJson,
  frozenContractReferenceContext,
  type FrozenContractSetV2,
} from '@codeatlas/ir';
import { DatabaseSync } from 'node:sqlite';
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
import { RuntimeFactStore, readRuntimeBindingForWorkspace } from './runtime-fact-store.js';
import {
  HistoryReadBudget,
  checkedHistoryLimits,
  exact,
  record,
  array,
  text,
  type HistoryReadLimits,
} from '../analysis/activation-history-format.js';
import { runtimeSql, runtimeHash } from './runtime-sql.js';
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
  check(sql.read('pragma_user_version', ['user_version'], '1', [])[0]?.user_version === 6);
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
  { db: DatabaseSync; workspace: string; repositories: readonly RuntimeFactStore[] }
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
    owners.set(this, { db, workspace: text(workspaceId), repositories: [...repositories] });
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
      const sql = runtimeSql(db, b),
        state = sql.read('workspace_runtime_state', ['activation_id'], 'workspace_id=?', [
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
) {
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
