import {
  prepareFrozenContractsV2,
  matchContractsV2,
  type DeclaredContractControl,
} from '@codeatlas/contracts';
import {
  RuntimeDerivationV2Schema,
  runtimeSitePlanDigest,
  runtimeCandidateDigestV2,
} from '@codeatlas/ir';
import { z } from 'zod';
import {
  RepositoryRuntimeBindingSchema,
  Phase1CoverageSchema,
  ScopedRefSchema,
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  parseWorkspaceExecution,
  parseIr,
  ensurePhase1Data,
  phase1Assert,
  canonicalRuntimeJson,
  runtimeCandidateDigest,
  scopedRefKey,
  supportKey,
  basisKey,
  assertRuntimeRequestControl,
  runtimeStopReason,
  type RuntimeRequestControl,
  type ScopedRef,
  type SupportRef,
} from '@codeatlas/ir';
import {
  prepareFrozenContracts,
  matchContracts,
  workspaceEntityIdentity,
  contractSupportPolicy,
} from '@codeatlas/contracts';
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const snapshotSchema = z.strictObject({
  facts: z.unknown(),
  bindings: z.unknown(),
  coverage: Phase1CoverageSchema,
  frontier: z.array(ScopedRefSchema).optional(),
  termination: z.enum(['COMPLETE', 'BUDGET', 'DEPTH', 'CANCELLED', 'DEADLINE']).optional(),
});
export function stitchWorkspaceExecution(input: unknown, control: RuntimeRequestControl) {
  return stitch(input, control);
}
export function stitchWorkspaceExecutionV2(input: unknown, control: RuntimeRequestControl) {
  return stitch(input, control, true);
}
export function stitchWorkspaceExecutionV3(input: unknown, control: DeclaredContractControl) {
  return stitch(input, control, true, true);
}
function stitch(input: unknown, control: RuntimeRequestControl, surface = false, declared = false) {
  assertRuntimeRequestControl(control);
  ensurePhase1Data(input);
  const c = parseIr(
    z.strictObject({
      frozenBindings: z.unknown(),
      graphs: z.array(
        z.strictObject({
          repositoryBinding: RepositoryRuntimeBindingSchema,
          candidate: surface
            ? snapshotSchema.extend({
                derivation: RuntimeDerivationV2Schema,
                termination: z.literal('COMPLETE'),
              })
            : snapshotSchema,
        }),
      ),
      matches: z.array(z.unknown()),
    }),
    input,
  );
  const prepared = declared
    ? prepareFrozenContractsV2(c.frozenBindings, control as DeclaredContractControl)
    : undefined;
  const { set, context } = prepared ?? prepareFrozenContracts(c.frozenBindings);
  const declaredMatch = prepared
    ? matchContractsV2(set, {
        ...control,
        maxItems: control.maxItems - prepared.consumed.items,
        maxInputBytes:
          (control as DeclaredContractControl).maxInputBytes - prepared.consumed.inputBytes,
      })
    : undefined;
  const recomputed = declaredMatch ?? matchContracts(set, control);
  const spent =
    prepared && declaredMatch
      ? {
          items: prepared.consumed.items + declaredMatch.consumed.items,
          inputBytes: prepared.consumed.inputBytes + declaredMatch.consumed.inputBytes,
        }
      : { items: 0, inputBytes: 0 };
  if (declared) control = { ...control, maxItems: control.maxItems - spent.items };
  if (recomputed.termination !== 'COMPLETE') {
    const execution = parseWorkspaceExecution(
      {
        schema: 'codeatlas.workspace-execution',
        version: 1,
        payload: {
          workspaceBasis: set.workspaceBasis,
          repositoryBindings: set.repositoryBindings,
          nodes: [],
          edges: [],
          coverage: recomputed.coverage,
          supportInventory: [],
        },
      },
      context,
    );
    return {
      execution,
      matches: recomputed.matches,
      frontier: recomputed.frontier,
      termination: recomputed.termination,
      ...(declared ? { consumed: spent } : {}),
    };
  }
  phase1Assert(canonicalRuntimeJson(c.matches) === canonicalRuntimeJson(recomputed.matches));
  phase1Assert(c.graphs.length === set.repositoryBindings.length);
  const seen = new Set<string>();
  const graphs = c.graphs.map((g) => {
    const binding = set.repositoryBindings.find(
      (b) => b.repoBasis.repositoryId === g.repositoryBinding.repoBasis.repositoryId,
    );
    phase1Assert(
      binding &&
        !seen.has(binding.repoBasis.repositoryId) &&
        canonicalRuntimeJson(binding) === canonicalRuntimeJson(g.repositoryBinding),
    );
    seen.add(binding.repoBasis.repositoryId);
    let sitePlan: ReturnType<typeof RuntimeDerivationV2Schema.parse>['sitePlan'] | undefined;
    if (surface) {
      phase1Assert('derivation' in g.candidate);
      const d = RuntimeDerivationV2Schema.parse(g.candidate.derivation);
      sitePlan = d.sitePlan;
      phase1Assert(
        runtimeSitePlanDigest(d.sitePlan) === d.sitePlanDigest &&
          basisKey(d.sitePlan.basis) === basisKey(binding.repoBasis) &&
          d.sitePlan.syntaxMembershipDigest === binding.syntaxMembershipDigest,
      );
      phase1Assert(
        runtimeCandidateDigestV2({ ...g.candidate, derivation: d }) ===
          binding.runtimeCandidateDigest,
      );
    } else phase1Assert(runtimeCandidateDigest(g.candidate) === binding.runtimeCandidateDigest);
    const facts = parseRuntimeFactSet(g.candidate.facts),
      bindings = parseFrameworkBindingSet(g.candidate.bindings, facts);
    phase1Assert(basisKey(facts.payload.basis) === basisKey(binding.repoBasis));
    for (const row of set.contractRefs.filter(
      (r) => r.ref.scope === 'REPOSITORY' && r.ref.repositoryId === binding.repoBasis.repositoryId,
    ))
      phase1Assert(
        facts.payload.contracts.some(
          (contract) => canonicalRuntimeJson(contract) === canonicalRuntimeJson(row.contract),
        ),
      );
    return {
      binding,
      facts,
      bindings,
      coverage: g.candidate.coverage,
      sitePlan,
      termination: g.candidate.termination,
    };
  });
  graphs.sort((a, b) => cmp(a.binding.repoBasis.repositoryId, b.binding.repoBasis.repositoryId));
  const supportInventory = [
    ...new Map(
      [
        ...context.availableSupports,
        ...graphs.flatMap((g) => g.facts.payload.supportInventory),
      ].map((s) => [supportKey(s), s]),
    ).values(),
  ].sort((a, b) => cmp(supportKey(a), supportKey(b)));
  const limitations = new Set(recomputed.coverage.limitations);
  for (const g of graphs) for (const l of g.coverage.limitations) limitations.add(l);
  let used = supportInventory.length + limitations.size,
    termination: 'COMPLETE' | 'BUDGET' | 'CANCELLED' | 'DEADLINE' = 'COMPLETE';
  phase1Assert(used + 2 <= control.maxItems);
  const nodes: unknown[] = [],
    edges: unknown[] = [],
    frontier: ScopedRef[] = [];
  const byRef = new Map<
    string,
    {
      id: string;
      factKey: string;
      repositoryRuntimeRef: ScopedRef;
      runtimeFactKey: string;
      score: number;
    }
  >();
  const wb = set.workspaceBasis;
  const localRef = (kind: string, id: string) => ({
    scope: 'WORKSPACE',
    workspaceId: wb.workspaceId,
    entity: { kind, id, revisionId: wb.revisionSetId },
  });
  const stop = (reason: typeof termination, anchor: ScopedRef) => {
    termination = reason;
    frontier.push(anchor);
    limitations.add('WORKSPACE_TERMINATED_' + reason);
  };
  for (const graph of graphs)
    for (const n of [...graph.facts.payload.nodes].sort((a, b) => cmp(a.id, b.id))) {
      if (termination !== 'COMPLETE') break;
      const ref: ScopedRef = {
        scope: 'REPOSITORY',
        repositoryId: graph.binding.repoBasis.repositoryId,
        entity: {
          kind: 'EXECUTION_NODE',
          id: n.id,
          revisionId: graph.binding.repoBasis.revisionId,
        },
      };
      const why = runtimeStopReason(control);
      if (why) {
        stop(why, ref);
        break;
      }
      if (used + 1 + 2 > control.maxItems) {
        stop('BUDGET', ref);
        break;
      }
      used++;
      const identity = workspaceEntityIdentity(
        wb,
        'WORKSPACE_EXECUTION_NODE',
        'workspace-execution:',
        [
          wb.workspaceId,
          wb.revisionSetId,
          graph.binding.repoBasis.repositoryId,
          'EXECUTION_NODE',
          n.factKey,
        ],
      );
      nodes.push({ ...identity, repositoryRuntimeRef: ref });
      byRef.set(scopedRefKey(ref), {
        ...identity,
        repositoryRuntimeRef: ref,
        runtimeFactKey: n.factKey,
        score: n.confidence.score,
      });
    }
  const getGraph = (ref: ScopedRef) =>
    graphs.find(
      (g) => ref.scope === 'REPOSITORY' && g.binding.repoBasis.repositoryId === ref.repositoryId,
    );
  const boundaryNodes = (ref: ScopedRef, kind: string) => {
    const g = getGraph(ref);
    phase1Assert(g);
    const bs = g.bindings.payload.bindings.filter(
      (b) =>
        b.kind === kind && 'contractRef' in b && scopedRefKey(b.contractRef) === scopedRefKey(ref),
    );
    return g.facts.payload.nodes.filter(
      (n) =>
        n.kind === 'BOUNDARY' &&
        scopedRefKey(n.targetRef) === scopedRefKey(ref) &&
        g.facts.payload.edges.some(
          (e) =>
            bs.some((b) => b.id === e.boundaryRef?.entity.id) &&
            (e.sourceRef.entity.id === n.id ||
              (e.target.state === 'RESOLVED' && e.target.target.entity.id === n.id)),
        ),
    );
  };
  for (const match of recomputed.matches) {
    if (termination !== 'COMPLETE') break;
    const m = match.payload;
    if (m.status !== 'MATCHED') continue;
    const consumer = set.contractRefs.find(
      (r) => scopedRefKey(r.ref) === scopedRefKey(m.consumerRef),
    )!;
    const provider = set.contractRefs.find(
      (r) => scopedRefKey(r.ref) === scopedRefKey(m.selectedProviderRef!),
    )!;
    const message = consumer.contract.protocol === 'MESSAGE';
    const source = message ? provider.ref : consumer.ref,
      target = message ? consumer.ref : provider.ref;
    const sourceNodes = boundaryNodes(source, message ? 'MESSAGE_PUBLISH' : 'HTTP_CALL');
    const tg = getGraph(target)!;
    const entries = new Set(
      tg.facts.payload.entryPoints
        .filter((e) => e.contractRef && scopedRefKey(e.contractRef) === scopedRefKey(target))
        .map((e) => String(e.id)),
    );
    const contexts = new Set(
      tg.facts.payload.contexts
        .filter((c) => entries.has(String(c.entryRef.entity.id)))
        .map((c) => String(c.id)),
    );
    const targetNodes = message
      ? boundaryNodes(target, 'MESSAGE_CONSUME')
      : tg.facts.payload.nodes.filter(
          (n) => n.kind === 'ENTRY' && contexts.has(String(n.contextRef.entity.id)),
        );
    // Only V3 can prove a matched declaration has no invocation in its complete current plan.
    if (
      declared &&
      !message &&
      !sourceNodes.length &&
      targetNodes.length === 1 &&
      m.reasons.includes('DECLARED_HTTP_SCHEMA_EXACT_V1')
    ) {
      const sg = getGraph(source)!;
      if (sg.sitePlan && sg.coverage.status === 'COMPLETE' && sg.termination === 'COMPLETE') {
        const ids = new Set<string>();
        let exhausted = false;
        for (const binding of sg.bindings.payload.bindings) {
          if (used + 1 + 2 > control.maxItems) {
            stop('BUDGET', source);
            exhausted = true;
            break;
          }
          used++;
          if (
            binding.kind === 'HTTP_CALL' &&
            scopedRefKey(binding.contractRef) === scopedRefKey(source)
          )
            ids.add(String(binding.id));
        }
        let hasSite = false;
        if (!exhausted)
          for (const entry of sg.sitePlan.entries) {
            if (used + 1 + entry.bindingIds.length + 2 > control.maxItems) {
              stop('BUDGET', source);
              exhausted = true;
              break;
            }
            used += 1 + entry.bindingIds.length;
            if (entry.bindingIds.some((id) => ids.has(String(id)))) {
              hasSite = true;
              break;
            }
          }
        if (!exhausted && ids.size && !hasSite) continue;
      }
    }
    if (!sourceNodes.length || targetNodes.length !== 1) {
      limitations.add('WORKSPACE_BOUNDARY_UNPROVEN');
      continue;
    }
    for (const sn of sourceNodes) {
      const tn = targetNodes[0]!,
        src = byRef.get(
          scopedRefKey({
            scope: 'REPOSITORY',
            repositoryId: getGraph(source)!.binding.repoBasis.repositoryId,
            entity: {
              kind: 'EXECUTION_NODE',
              id: sn.id,
              revisionId: getGraph(source)!.binding.repoBasis.revisionId,
            },
          }),
        );
      const dst = byRef.get(
        scopedRefKey({
          scope: 'REPOSITORY',
          repositoryId: tg.binding.repoBasis.repositoryId,
          entity: {
            kind: 'EXECUTION_NODE',
            id: tn.id,
            revisionId: tg.binding.repoBasis.revisionId,
          },
        }),
      );
      if (!src || !dst) {
        limitations.add('WORKSPACE_FRONTIER_UNSTITCHED');
        continue;
      }
      const why = runtimeStopReason(control);
      if (why) {
        stop(why, source);
        break;
      }
      const refs = [
        ...new Map(
          [...m.supportRefs, ...sn.supportRefs, ...tn.supportRefs].map((s) => [supportKey(s), s]),
        ).values(),
      ].sort((a, b) => cmp(supportKey(a), supportKey(b)));
      if (used + 1 + refs.length + 2 > control.maxItems) {
        stop('BUDGET', source);
        break;
      }
      used += 1 + refs.length;
      const semantic = (n: typeof src) => [
        n.repositoryRuntimeRef.scope === 'REPOSITORY' ? n.repositoryRuntimeRef.repositoryId : null,
        'EXECUTION_NODE',
        n.runtimeFactKey,
      ];
      const transitionKind = message ? 'PUBLISH' : 'HTTP';
      edges.push({
        ...workspaceEntityIdentity(wb, 'WORKSPACE_EXECUTION_EDGE', 'workspace-execution:', [
          wb.workspaceId,
          wb.revisionSetId,
          semantic(src),
          semantic(dst),
          m.factKey,
          transitionKind,
        ]),
        sourceRef: localRef('WORKSPACE_EXECUTION_NODE', src.id),
        targetRef: localRef('WORKSPACE_EXECUTION_NODE', dst.id),
        matchRef: localRef('CONTRACT_MATCH', m.id),
        transitionKind,
        supportRefs: refs,
        confidence: {
          score: Math.min(m.confidence.score, src.score, dst.score),
          method: contractSupportPolicy,
          reasons: ['SUPPORTED_INPUT_BOUND'],
        },
      });
    }
  }
  const refs: ScopedRef[] = [
    ...context.availableEntities,
    ...graphs.flatMap((g) =>
      g.facts.payload.nodes.map((n) => ({
        scope: 'REPOSITORY' as const,
        repositoryId: g.binding.repoBasis.repositoryId,
        entity: { kind: 'EXECUTION_NODE', id: n.id, revisionId: g.binding.repoBasis.revisionId },
      })),
    ),
  ];
  for (const s of supportInventory) {
    if ('repositoryId' in s.basis)
      refs.push({ scope: 'REPOSITORY', repositoryId: s.basis.repositoryId, entity: s.entity });
    else if ('workspaceId' in s.basis)
      refs.push({ scope: 'WORKSPACE', workspaceId: s.basis.workspaceId, entity: s.entity });
  }
  for (const m of recomputed.matches)
    refs.push(localRef('CONTRACT_MATCH', m.payload.id) as ScopedRef);
  const coverage = {
    status:
      limitations.size || graphs.some((g) => g.coverage.status !== 'COMPLETE')
        ? 'PARTIAL'
        : 'COMPLETE',
    limitations: [...limitations].sort(),
    unverifiedRefs: frontier,
  };
  const execution = parseWorkspaceExecution(
    {
      schema: 'codeatlas.workspace-execution',
      version: 1,
      payload: {
        workspaceBasis: wb,
        repositoryBindings: [...set.repositoryBindings].sort((a, b) =>
          cmp(a.repoBasis.repositoryId, b.repoBasis.repositoryId),
        ),
        nodes,
        edges,
        coverage,
        supportInventory,
      },
    },
    {
      availableEntities: [...new Map(refs.map((r) => [scopedRefKey(r), r])).values()],
      availableSupports: supportInventory,
    },
  );
  return {
    execution,
    matches: recomputed.matches,
    frontier,
    termination,
    ...(declared ? { consumed: { items: spent.items + used, inputBytes: spent.inputBytes } } : {}),
  };
}
