import { createHash } from 'node:crypto';
import { SupportRefSchema, canonicalRuntimeJson } from '@codeatlas/ir';
import {
  parseRuntimeSitePlan,
  RuntimeDerivationV2Schema,
  runtimeSitePlanDigest,
  type SyntaxEvidenceV4,
  type RuntimeSitePlanV1,
  type RuntimeDerivationV2,
} from '@codeatlas/ir';
import { deriveExecutionGraphV2, deriveRuntimeFlowsV2 } from '@codeatlas/execution';
import { isDeepStrictEqual } from 'node:util';
import {
  parseRuntimeFactSet,
  parseFrameworkBindingSet,
  Phase1CoverageSchema,
  phase1Assert,
  scopedRefKey,
  supportKey,
  basisKey,
  type CanonicalNode,
  type CanonicalEdge,
  type SourceFile,
  type SupportRef,
  type RepoBasis,
  type RuntimeRequestControl,
} from '@codeatlas/ir';
import {
  deriveExecutionGraph,
  deriveRuntimeFlows,
  type FormalGraphCandidate,
} from '@codeatlas/execution';
export interface FrameworkRuntimeInputs {
  basis: RepoBasis;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  sourceFiles: SourceFile[];
  supportInventory: SupportRef[];
}
export interface FrameworkRuntimeCandidate {
  facts: unknown;
  bindings: unknown;
  coverage: unknown;
}
/** Domain assembly consumes validated plugin output, retaining every limitation and support. */
export interface FrameworkRuntimeInputsV2 extends FrameworkRuntimeInputs {
  syntaxEvidence: SyntaxEvidenceV4[];
  syntaxMembershipDigest: string;
}
export interface FrameworkRuntimeCandidateV2 extends FrameworkRuntimeCandidate {
  sitePlan: RuntimeSitePlanV1;
}
export type DerivedFrameworkRuntimeV2 = FormalGraphCandidate & {
  coverageScope: 'LOCAL_DECLARED_RUNTIME';
  derivation: RuntimeDerivationV2;
};
export function deriveFrameworkRuntime(
  inputs: FrameworkRuntimeInputs,
  outputs: readonly FrameworkRuntimeCandidate[],
  control: RuntimeRequestControl,
): FormalGraphCandidate {
  return derive(inputs, outputs, control) as FormalGraphCandidate;
}
export function deriveFrameworkRuntimeV2(
  inputs: FrameworkRuntimeInputsV2,
  outputs: readonly FrameworkRuntimeCandidateV2[],
  control: RuntimeRequestControl,
): DerivedFrameworkRuntimeV2 {
  return derive(inputs, outputs, control, { inputs, outputs }) as DerivedFrameworkRuntimeV2;
}
function derive(
  inputs: FrameworkRuntimeInputs,
  outputs: readonly FrameworkRuntimeCandidate[],
  control: RuntimeRequestControl,
  surface?: { inputs: FrameworkRuntimeInputsV2; outputs: readonly FrameworkRuntimeCandidateV2[] },
): FormalGraphCandidate | DerivedFrameworkRuntimeV2 {
  const sets = outputs.map((v) => {
    const facts = parseRuntimeFactSet(v.facts);
    phase1Assert(basisKey(facts.payload.basis) === basisKey(inputs.basis));
    return {
      facts,
      bindings: parseFrameworkBindingSet(v.bindings, facts),
      coverage: Phase1CoverageSchema.parse(v.coverage),
    };
  });
  const merge = <T>(groups: readonly (readonly T[])[], key: (v: T) => string): T[] => {
    const map = new Map<string, T>();
    for (const group of groups)
      for (const value of group) {
        const k = key(value),
          old = map.get(k);
        phase1Assert(!old || isDeepStrictEqual(old, value));
        map.set(k, value);
      }
    return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, value]) => value);
  };
  const payload: Record<string, unknown> = { basis: inputs.basis };
  for (const field of [
    'entryPoints',
    'tasks',
    'dataResources',
    'triggers',
    'contracts',
    'contexts',
    'nodes',
    'edges',
    'flows',
  ] as const)
    payload[field] = merge<{ id: string }>(
      sets.map((s) => s.facts.payload[field]),
      (v) => v.id,
    );
  payload.externalRefs = merge(
    sets.map((s) => s.facts.payload.externalRefs),
    scopedRefKey,
  );
  payload.supportInventory = merge(
    sets.map((s) => s.facts.payload.supportInventory),
    supportKey,
  );
  const facts = parseRuntimeFactSet({ schema: 'codeatlas.runtime-fact-set', version: 1, payload });
  const bindings = parseFrameworkBindingSet(
    {
      schema: 'codeatlas.framework-binding-set',
      version: 1,
      payload: {
        basis: inputs.basis,
        externalRefs: merge(
          sets.map((s) => s.bindings.payload.externalRefs),
          scopedRefKey,
        ),
        supportInventory: merge(
          sets.map((s) => s.bindings.payload.supportInventory),
          supportKey,
        ),
        bindings: merge(
          sets.map((s) => s.bindings.payload.bindings),
          (v) => v.id,
        ),
      },
    },
    facts,
  );
  const coverage = Phase1CoverageSchema.parse({
    status:
      sets.length && sets.every((s) => s.coverage.status === 'COMPLETE') ? 'COMPLETE' : 'PARTIAL',
    limitations: sets.length
      ? [...new Set(sets.flatMap((s) => s.coverage.limitations))].sort()
      : ['FRAMEWORK_OBSERVATION_UNPROVEN'],
    unverifiedRefs: merge(
      sets.map((s) => s.coverage.unverifiedRefs),
      scopedRefKey,
    ),
  });
  if (surface) {
    const byId = new Map(surface.inputs.syntaxEvidence.map((s) => [String(s.id), s]));
    const covered = (
      ref: ReturnType<typeof Phase1CoverageSchema.parse>['unverifiedRefs'][number],
    ) => {
      if (ref.entity.kind !== 'SYNTAX_EVIDENCE') return false;
      const site = byId.get(String(ref.entity.id));
      if (!site) return false;
      if (
        sets.some((s) =>
          s.facts.payload.supportInventory.some(
            (r) => r.entity.kind === 'SYNTAX_EVIDENCE' && r.entity.id === ref.entity.id,
          ),
        )
      )
        return true;
      return (
        ['INVOCATION', 'DECORATION'].includes(site.syntaxKind) &&
        sets.some(
          (s) => !s.coverage.unverifiedRefs.some((r) => scopedRefKey(r) === scopedRefKey(ref)),
        )
      );
    };
    coverage.unverifiedRefs = coverage.unverifiedRefs.filter((r) => !covered(r));
    coverage.limitations = [
      ...new Set(
        sets.flatMap((s) => {
          const hasOpen = s.coverage.unverifiedRefs.some((r) => !covered(r));
          return s.coverage.limitations.filter(
            (l) =>
              !(
                s.coverage.unverifiedRefs.length > 0 &&
                !hasOpen &&
                (l.startsWith('FRAMEWORK_') || l.startsWith('UNVERIFIED_FRAMEWORK_'))
              ),
          );
        }),
      ),
    ].sort();
    coverage.status =
      sets.length > 0 && coverage.unverifiedRefs.length === 0 && coverage.limitations.length === 0
        ? 'COMPLETE'
        : 'PARTIAL';

    for (const ref of coverage.unverifiedRefs)
      if (ref.entity.kind === 'SYNTAX_EVIDENCE') {
        const value = byId.get(String(ref.entity.id));
        phase1Assert(value);
        const support = SupportRefSchema.parse({
          basis: inputs.basis,
          entity: ref.entity,
          valueDigest: createHash('sha256')
            .update(
              'runtime-syntax-support-v1\0' +
                canonicalRuntimeJson({
                  schema: 'codeatlas.syntax-evidence',
                  version: 4,
                  payload: value,
                }),
            )
            .digest('hex'),
        });
        facts.payload.externalRefs = merge([facts.payload.externalRefs, [ref]], scopedRefKey);
        facts.payload.supportInventory = merge(
          [facts.payload.supportInventory, [support]],
          supportKey,
        );
      }
    phase1Assert(surface.outputs.length > 0);
    const byKey = new Map<string, RuntimeSitePlanV1['entries']>();
    for (const out of surface.outputs)
      for (const entry of out.sitePlan.entries) {
        const list = byKey.get(entry.siteKey) ?? [];
        list.push(entry);
        byKey.set(entry.siteKey, list);
      }
    const entries = [...byKey.values()]
      .map((list) => {
        const proved = list.filter((e) => e.role !== 'ORDINARY_CALL'),
          selected = proved.length ? proved : list;
        phase1Assert(new Set(selected.map((e) => e.role)).size === 1);
        const first = selected[0]!;
        for (const e of list)
          phase1Assert(
            isDeepStrictEqual(e.sourceRange, first.sourceRange) &&
              isDeepStrictEqual(e.ownerRef, first.ownerRef) &&
              isDeepStrictEqual(e.codeCallRef, first.codeCallRef),
          );
        return {
          ...first,
          bindingIds: [...new Set(selected.flatMap((e) => e.bindingIds))].sort(),
          proofSyntaxKeys: [...new Set(selected.flatMap((e) => e.proofSyntaxKeys))].sort(),
        };
      })
      .sort((a, b) => a.siteKey.localeCompare(b.siteKey));
    const availableEntities = inputs.supportInventory.map((s) => ({
        scope: 'REPOSITORY',
        repositoryId: inputs.basis.repositoryId,
        entity: s.entity,
      })),
      sitePlan = parseRuntimeSitePlan(
        {
          basis: inputs.basis,
          syntaxMembershipDigest: surface.inputs.syntaxMembershipDigest,
          entries,
        },
        {
          basis: inputs.basis,
          syntaxMembershipDigest: surface.inputs.syntaxMembershipDigest,
          syntaxEvidence: surface.inputs.syntaxEvidence,
          syntaxContext: {
            references: { availableEntities, availableSupports: inputs.supportInventory },
            codeNodes: inputs.nodes,
            codeEdges: inputs.edges,
            sourceFiles: inputs.sourceFiles,
          },
          bindings: bindings.payload.bindings,
        },
      );
    const graph = deriveExecutionGraphV2(
        {
          ...inputs,
          entryFacts: facts,
          bindingFacts: bindings,
          coverage,
          sitePlan,
          syntaxEvidence: surface.inputs.syntaxEvidence,
          syntaxMembershipDigest: surface.inputs.syntaxMembershipDigest,
        },
        control,
      ),
      out = deriveRuntimeFlowsV2(graph, control),
      derivation = RuntimeDerivationV2Schema.parse({
        syntaxContract: 'SYNTAX_BINDING_V4',
        rulesVersion: 'framework-rules-v2',
        coverageVersion: 'framework-coverage-v2',
        graphPolicy: 'LOCAL_DECLARED_RUNTIME_V2',
        sitePlan,
        sitePlanDigest: runtimeSitePlanDigest(sitePlan),
      });
    return { ...out, derivation };
  }
  return deriveRuntimeFlows(
    deriveExecutionGraph(
      {
        basis: inputs.basis,
        nodes: inputs.nodes,
        edges: inputs.edges,
        sourceFiles: inputs.sourceFiles,
        supportInventory: inputs.supportInventory,
        entryFacts: facts,
        bindingFacts: bindings,
        coverage,
      },
      control,
    ),
    control,
  );
}
