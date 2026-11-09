import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  EntityIdSchema,
  RuntimeEntityIdSchema,
  RepoBasisSchema,
  Phase1CoverageSchema,
  Phase1ExactStringSchema,
  RuntimeDerivationV2Schema,
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  runtimeCandidateDigest,
  runtimeCandidateDigestV2,
  runtimeSitePlanDigest,
  canonicalRuntimeJson,
  type RuntimeRequestControl,
  type RepoBasis,
  type ScopedRef,
  type RuntimeFlow,
  type RuntimeFactSet,
} from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../ir/dist/compilation-input-contract.js';
export type OwnedStructureTraceBudget = {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  maxMetadataRows: number;
  maxOutputBytes: number;
};
export type OwnedStructureStartRef =
  { kind: 'EXECUTION_NODE'; id: string } | { kind: 'RUNTIME_FLOW'; id: string; stepKey: string };
export type OwnedStructureTraceRequest = {
  repositoryId: string;
  expectedActivationId: string;
  expectedRevisionId: string;
  direction: 'FORWARD';
  budget: OwnedStructureTraceBudget;
} & (
  | { kind: 'EXECUTION'; startRef: { kind: 'EXECUTION_NODE'; id: string } }
  | { kind: 'RUNTIME'; startRef: { kind: 'RUNTIME_FLOW'; id: string; stepKey: string } }
);
export type OwnedStructureReadSession = {
  read(): unknown | Promise<unknown>;
  close(): void | Promise<void>;
};
export type OwnedStructureTraceReason = 'MAX_DEPTH' | 'MAX_NODES' | 'MAX_EDGES';
export type OwnedStructureFrontier = {
  fromRef: OwnedStructureStartRef;
  targetRef: OwnedStructureStartRef | null;
  edgeRef: ScopedRef | null;
  reason: OwnedStructureTraceReason;
};
type CommonResult = {
  repositoryId: string;
  activationId: string;
  revisionId: string;
  codeBasis: RepoBasis;
  status: 'CURRENT' | 'AFFECTED';
  viewVersion: 1 | 2;
  coverageScope: 'LOCAL_DECLARED_RUNTIME';
  relationshipSemantics: 'STORED_DERIVED_NOT_OBSERVED_EXECUTION';
  coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
  root: OwnedStructureStartRef;
  truncation: {
    truncated: boolean;
    reasons: OwnedStructureTraceReason[];
    frontier: OwnedStructureFrontier[];
  };
};
export type OwnedStructureTraceResult = CommonResult &
  (
    | {
        kind: 'EXECUTION';
        nodes: { node: RuntimeFactSet['nodes'][number]; depth: number }[];
        edges: RuntimeFactSet['edges'];
      }
    | {
        kind: 'RUNTIME';
        flowHeader: Omit<RuntimeFlow, 'steps' | 'branches'>;
        steps: { step: RuntimeFlow['steps'][number]; depth: number }[];
        links: { fromStepKey: string; toStepKey: string }[];
        branches: RuntimeFlow['branches'];
      }
  );
export type OwnedStructureTraceErrorCode =
  | 'INVALID_INPUT'
  | 'DATA_INVALID'
  | 'NOT_AVAILABLE'
  | 'ACTIVATION_MISMATCH'
  | 'REVISION_MISMATCH'
  | 'STRUCTURE_NOT_FOUND'
  | 'BUDGET_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'CANCELLED'
  | 'DEADLINE';
function fail(code: OwnedStructureTraceErrorCode): never {
  throw Object.assign(Error(code), { code });
}
const cmp = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value))
    fail('DATA_INVALID');
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).some(
      (k) => typeof k !== 'string' || !Object.hasOwn(d[k]!, 'value') || !d[k]!.enumerable,
    )
  )
    fail('DATA_INVALID');
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string[]) {
  const r = record(value);
  if (Object.keys(r).length !== keys.length || keys.some((k) => !Object.hasOwn(r, k)))
    fail('DATA_INVALID');
  return r;
}
function check(value: unknown): asserts value {
  if (!value) fail('DATA_INVALID');
}
function stopCode(error: unknown) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return '';
  const d = Object.getOwnPropertyDescriptors(error);
  const code = d.code?.value;
  if (code === 'HISTORY_LIMIT_EXCEEDED') return 'BUDGET_EXCEEDED';
  if (typeof code === 'string') return code;
  return (
    (
      {
        CONTROL_CANCELLED: 'CANCELLED',
        CONTROL_DEADLINE: 'DEADLINE',
        CONTROL_BUDGET: 'BUDGET_EXCEEDED',
        CONTROL_DEPTH: 'BUDGET_EXCEEDED',
      } as Record<string, string>
    )[String(d.message?.value)] ?? ''
  );
}
function checkpoint(control: RuntimeRequestControl) {
  try {
    canonicalCompilationJson(null, control);
  } catch (e) {
    const code = stopCode(e);
    if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(code))
      fail(code as OwnedStructureTraceErrorCode);
    throw e;
  }
}
function request(value: unknown, control: RuntimeRequestControl): OwnedStructureTraceRequest {
  try {
    const r = exact(JSON.parse(canonicalCompilationJson(value, control)), [
      'kind',
      'repositoryId',
      'expectedActivationId',
      'expectedRevisionId',
      'startRef',
      'direction',
      'budget',
    ]);
    check(r.kind === 'EXECUTION' || r.kind === 'RUNTIME');
    check(r.direction === 'FORWARD');
    EntityIdSchema.parse(r.repositoryId);
    EntityIdSchema.parse(r.expectedActivationId);
    EntityIdSchema.parse(r.expectedRevisionId);
    const b = exact(r.budget, [
      'maxDepth',
      'maxNodes',
      'maxEdges',
      'maxMetadataRows',
      'maxOutputBytes',
    ]);
    for (const [key, v] of Object.entries(b))
      check(
        typeof v === 'number' &&
          Number.isSafeInteger(v) &&
          !Object.is(v, -0) &&
          v >= (key === 'maxDepth' ? 0 : 1),
      );
    const s = exact(
      r.startRef,
      r.kind === 'EXECUTION' ? ['kind', 'id'] : ['kind', 'id', 'stepKey'],
    );
    check(s.kind === (r.kind === 'EXECUTION' ? 'EXECUTION_NODE' : 'RUNTIME_FLOW'));
    RuntimeEntityIdSchema.parse(s.id);
    if (r.kind === 'RUNTIME') Phase1ExactStringSchema.parse(s.stepKey);
    return r as OwnedStructureTraceRequest;
  } catch (e) {
    const code = stopCode(e);
    if (['CANCELLED', 'DEADLINE', 'BUDGET_EXCEEDED'].includes(code))
      fail(code as OwnedStructureTraceErrorCode);
    fail('INVALID_INPUT');
  }
}
function snapshot(raw: unknown, r: OwnedStructureTraceRequest, control: RuntimeRequestControl) {
  const value = JSON.parse(canonicalCompilationJson(raw, control));
  // Full-read providers enforce SQL rows; also cap every structured metadata record before IR parsing.
  let rows = 0;
  const pending: unknown[] = [value];
  while (pending.length) {
    checkpoint(control);
    const v = pending.pop();
    if (v && typeof v === 'object') {
      if (!Array.isArray(v) && ++rows > r.budget.maxMetadataRows) fail('BUDGET_EXCEEDED');
      for (const child of Object.values(v)) pending.push(child);
    }
  }
  const v = record(value),
    v2 = Object.hasOwn(v, 'coverageScope');
  exact(v, [
    ...(v.status === 'NOT_AVAILABLE'
      ? ['status', 'activationId', 'candidate']
      : ['status', 'activationId', 'identity', 'candidate']),
    ...(v2 ? ['coverageScope'] : []),
  ]);
  if (v2) check(v.coverageScope === 'LOCAL_DECLARED_RUNTIME');
  if (v.status === 'NOT_AVAILABLE') {
    check(v.activationId === null && v.candidate === null);
    fail('NOT_AVAILABLE');
  }
  check(v.status === 'CURRENT' || v.status === 'AFFECTED');
  EntityIdSchema.parse(v.activationId);
  if (v.activationId !== r.expectedActivationId) fail('ACTIVATION_MISMATCH');
  const identity = exact(v.identity, [
    'repositoryId',
    'revisionId',
    'parentId',
    'codeBasis',
    'syntaxActivationId',
    'syntaxMembershipDigest',
    'policyDigest',
    'candidateDigest',
  ]);
  EntityIdSchema.parse(identity.repositoryId);
  EntityIdSchema.parse(identity.revisionId);
  if (identity.parentId !== null) EntityIdSchema.parse(identity.parentId);
  EntityIdSchema.parse(identity.syntaxActivationId);
  for (const key of ['syntaxMembershipDigest', 'policyDigest', 'candidateDigest'])
    check(typeof identity[key] === 'string' && /^[a-f0-9]{64}$/.test(identity[key] as string));
  const basis = RepoBasisSchema.parse(identity.codeBasis);
  check(identity.repositoryId === r.repositoryId && basis.repositoryId === r.repositoryId);
  check(identity.revisionId === basis.revisionId);
  if (basis.revisionId !== r.expectedRevisionId) fail('REVISION_MISMATCH');
  const c = exact(v.candidate, [
    'facts',
    'bindings',
    'coverage',
    'termination',
    ...(v2 ? ['derivation'] : []),
  ]);
  check(c.termination === 'COMPLETE');
  const facts = parseRuntimeFactSet(c.facts),
    bindings = parseFrameworkBindingSet(c.bindings, facts),
    coverage = Phase1CoverageSchema.parse(c.coverage);
  check(canonicalRuntimeJson(facts.payload.basis) === canonicalRuntimeJson(basis));
  check(coverage.status === 'COMPLETE');
  const base = { facts, bindings, coverage, termination: 'COMPLETE' as const };
  const candidate = v2
    ? { ...base, derivation: RuntimeDerivationV2Schema.parse(c.derivation) }
    : base;
  if ('derivation' in candidate) {
    check(
      candidate.derivation.sitePlanDigest === runtimeSitePlanDigest(candidate.derivation.sitePlan),
    );
    check(
      canonicalRuntimeJson(candidate.derivation.sitePlan.basis) === canonicalRuntimeJson(basis),
    );
    check(candidate.derivation.sitePlan.syntaxMembershipDigest === identity.syntaxMembershipDigest);
  }
  const digest =
    'derivation' in candidate
      ? runtimeCandidateDigestV2(candidate)
      : runtimeCandidateDigest(candidate);
  check(digest === identity.candidateDigest);
  check(
    v.activationId ===
      'runtime-activation:' +
        createHash('sha256')
          .update('runtime-activation-v1\0' + canonicalRuntimeJson(identity))
          .digest('hex'),
  );
  return {
    facts: facts.payload,
    coverage,
    basis,
    status: v.status as 'CURRENT' | 'AFFECTED',
    activationId: v.activationId as string,
    viewVersion: v2 ? (2 as const) : (1 as const),
  };
}
/** One exact host-owned readonly snapshot; original stored derivation is never observed execution. */
export async function readOwnedStructureTrace(
  input: OwnedStructureTraceRequest,
  open: (
    budget: OwnedStructureTraceBudget,
    control: RuntimeRequestControl,
  ) => Promise<OwnedStructureReadSession>,
  control: RuntimeRequestControl,
): Promise<OwnedStructureTraceResult> {
  checkpoint(control);
  const r = request(input, control);
  let session: OwnedStructureReadSession | undefined;
  try {
    try {
      session = await open(r.budget, control);
    } catch (e) {
      checkpoint(control);
      if (stopCode(e) === 'BUDGET_EXCEEDED') fail('BUDGET_EXCEEDED');
      fail('PROVIDER_UNAVAILABLE');
    }
    checkpoint(control);
    let raw: unknown;
    try {
      raw = await session.read();
    } catch (e) {
      checkpoint(control);
      if (stopCode(e) === 'BUDGET_EXCEEDED') fail('BUDGET_EXCEEDED');
      fail('PROVIDER_UNAVAILABLE');
    }
    checkpoint(control);
    let s: ReturnType<typeof snapshot>;
    try {
      s = snapshot(raw, r, control);
    } catch (e) {
      const code = stopCode(e);
      if (
        [
          'NOT_AVAILABLE',
          'ACTIVATION_MISMATCH',
          'REVISION_MISMATCH',
          'BUDGET_EXCEEDED',
          'CANCELLED',
          'DEADLINE',
        ].includes(code)
      )
        fail(code as OwnedStructureTraceErrorCode);
      fail('DATA_INVALID');
    }
    const frontier: OwnedStructureFrontier[] = [],
      reasons = new Set<OwnedStructureTraceReason>();
    const omit = (
      fromRef: OwnedStructureStartRef,
      targetRef: OwnedStructureStartRef | null,
      edgeRef: ScopedRef | null,
      reason: OwnedStructureTraceReason,
    ) => {
      reasons.add(reason);
      frontier.push({ fromRef, targetRef, edgeRef, reason });
    };
    const common: CommonResult = {
      repositoryId: r.repositoryId,
      activationId: s.activationId,
      revisionId: s.basis.revisionId,
      codeBasis: s.basis,
      status: s.status,
      viewVersion: s.viewVersion,
      coverageScope: 'LOCAL_DECLARED_RUNTIME',
      relationshipSemantics: 'STORED_DERIVED_NOT_OBSERVED_EXECUTION',
      coverage: s.coverage,
      root: r.startRef,
      truncation: { truncated: false, reasons: [], frontier },
    };
    let result: OwnedStructureTraceResult;
    if (r.kind === 'EXECUTION') {
      const byId = new Map<string, RuntimeFactSet['nodes'][number]>(
          s.facts.nodes.map((n) => [n.id, n]),
        ),
        root = byId.get(r.startRef.id);
      if (!root) fail('STRUCTURE_NOT_FOUND');
      const nodes = [{ node: root, depth: 0 }],
        included = new Set<string>([root.id]),
        edges: RuntimeFactSet['edges'] = [];
      const adjacency = new Map<string, RuntimeFactSet['edges']>();
      for (const edge of s.facts.edges) {
        const id = edge.sourceRef.entity.id;
        const list = adjacency.get(id) ?? [];
        list.push(edge);
        adjacency.set(id, list);
      }
      for (const list of adjacency.values()) list.sort((a, b) => cmp(a.id, b.id));
      for (let i = 0; i < nodes.length; i++) {
        checkpoint(control);
        const current = nodes[i]!,
          fromRef = { kind: 'EXECUTION_NODE' as const, id: current.node.id };
        for (const edge of adjacency.get(current.node.id) ?? []) {
          checkpoint(control);
          const targetId = edge.target.state === 'RESOLVED' ? edge.target.target.entity.id : null,
            targetRef =
              targetId === null ? null : { kind: 'EXECUTION_NODE' as const, id: targetId },
            edgeRef: ScopedRef = {
              scope: 'REPOSITORY',
              repositoryId: EntityIdSchema.parse(r.repositoryId),
              entity: {
                kind: 'EXECUTION_EDGE',
                id: EntityIdSchema.parse(edge.id),
                revisionId: s.basis.revisionId,
              },
            };
          if (current.depth === r.budget.maxDepth) {
            omit(fromRef, targetRef, edgeRef, 'MAX_DEPTH');
            continue;
          }
          if (edges.length === r.budget.maxEdges) {
            omit(fromRef, targetRef, edgeRef, 'MAX_EDGES');
            continue;
          }
          if (targetId !== null && !included.has(targetId)) {
            if (nodes.length === r.budget.maxNodes) {
              omit(fromRef, targetRef, edgeRef, 'MAX_NODES');
              continue;
            }
            const node = byId.get(targetId);
            if (!node) fail('DATA_INVALID');
            nodes.push({ node, depth: current.depth + 1 });
            included.add(targetId);
          }
          edges.push(edge);
        }
      }
      result = { ...common, kind: 'EXECUTION', nodes, edges };
    } else {
      const flow = s.facts.flows.find((f) => f.id === r.startRef.id);
      if (!flow) fail('STRUCTURE_NOT_FOUND');
      const byKey = new Map<string, RuntimeFlow['steps'][number]>(
          flow.steps.map((step) => [step.stepKey, step]),
        ),
        root = byKey.get(r.startRef.stepKey);
      if (!root) fail('STRUCTURE_NOT_FOUND');
      const steps = [{ step: root, depth: 0 }],
        included = new Set<string>([root.stepKey]),
        links: { fromStepKey: string; toStepKey: string }[] = [];
      for (let i = 0; i < steps.length; i++) {
        checkpoint(control);
        const current = steps[i]!,
          fromRef = { kind: 'RUNTIME_FLOW' as const, id: flow.id, stepKey: current.step.stepKey };
        for (const key of [...current.step.outgoingStepKeys].sort(cmp)) {
          checkpoint(control);
          const targetRef = { kind: 'RUNTIME_FLOW' as const, id: flow.id, stepKey: key };
          if (current.depth === r.budget.maxDepth) {
            omit(fromRef, targetRef, null, 'MAX_DEPTH');
            continue;
          }
          if (links.length === r.budget.maxEdges) {
            omit(fromRef, targetRef, null, 'MAX_EDGES');
            continue;
          }
          if (!included.has(key)) {
            if (steps.length === r.budget.maxNodes) {
              omit(fromRef, targetRef, null, 'MAX_NODES');
              continue;
            }
            const step = byKey.get(key);
            if (!step) fail('DATA_INVALID');
            steps.push({ step, depth: current.depth + 1 });
            included.add(key);
          }
          links.push({ fromStepKey: current.step.stepKey, toStepKey: key });
        }
      }
      const { steps: allSteps, branches: allBranches, ...flowHeader } = flow;
      void allSteps;
      result = {
        ...common,
        kind: 'RUNTIME',
        flowHeader,
        steps,
        links,
        branches: allBranches.filter((branch) => included.has(branch.fromStepKey)),
      };
    }
    result.truncation = { truncated: frontier.length > 0, reasons: [...reasons].sort(), frontier };
    const text = canonicalCompilationJson(result, control);
    if (Buffer.byteLength(text, 'utf8') > r.budget.maxOutputBytes) fail('BUDGET_EXCEEDED');
    checkpoint(control);
    return result;
  } finally {
    if (session)
      try {
        await session.close();
      } catch {
        throw Object.assign(Error('Stored structure cleanup is unknown.'), {
          code: 'QUERY_CLEANUP_FAILED',
          cleanupState: 'UNKNOWN',
        });
      }
  }
}
