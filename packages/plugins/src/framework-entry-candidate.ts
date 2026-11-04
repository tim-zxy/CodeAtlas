import type { FrameworkContext } from './framework-bindings.js';
import { createHash } from 'node:crypto';
import { parseRuntimeFactSet, phase1Assert, type ScopedRef } from '@codeatlas/ir';
import { validatePluginV4Context } from './plugin-context-v4.js';
import {
  compileFrameworkRuntimeCandidateFromValidatedContext,
  type FrameworkRuntimeCandidate,
} from './framework-runtime-candidate.js';
import { MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';
type Framework = 'spring' | 'mongo' | 'kafka' | 'fastapi';
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
export function compileFrameworkEntryCandidate(
  input: unknown,
  framework: Framework,
  maxItems: number,
): FrameworkRuntimeCandidate {
  phase1Assert(
    Number.isSafeInteger(maxItems) && maxItems > 0 && maxItems <= MAX_PLUGIN_CONTEXT_FACTS,
  );
  return compileFrameworkEntryCandidateFromValidatedContext(
    validatePluginV4Context(input),
    framework,
    maxItems,
  );
}
/** Private V4 factory continuation; legacy public entry keeps its old fixed rules. */
export function compileFrameworkEntryCandidateFromValidatedContext(
  c: FrameworkContext,
  framework: Framework,
  maxItems: number,
  includeFeign = false,
): FrameworkRuntimeCandidate {
  phase1Assert(
    Number.isSafeInteger(maxItems) && maxItems > 0 && maxItems <= MAX_PLUGIN_CONTEXT_FACTS,
  );
  const method =
    c.contextVersion === 5
      ? 'runtime-execution-declaration-v2'
      : 'runtime-execution-declaration-v1';
  const base = compileFrameworkRuntimeCandidateFromValidatedContext(c, framework, includeFeign),
    p = base.facts.payload;
  const limitations = [
    ...base.coverage.limitations.filter((s) => s !== 'DOMAIN_RECORDS_ONLY'),
    'DECLARATION_ENTRIES_ONLY',
  ].sort();
  const entries: unknown[] = [],
    provenance = [...base.provenance];
  let units =
    [
      ...p.entryPoints,
      ...p.tasks,
      ...p.dataResources,
      ...p.triggers,
      ...p.contracts,
      ...p.contexts,
      ...p.nodes,
      ...p.edges,
      ...p.flows,
    ].reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    p.externalRefs.length +
    p.supportInventory.length +
    limitations.length +
    base.coverage.unverifiedRefs.length +
    provenance.reduce((n, r) => n + r.draftKeys.length + r.ruleIds.length + r.syntaxIds.length, 0);
  phase1Assert(units <= maxItems);
  const scoped = (kind: string, id: string): ScopedRef => ({
    scope: 'REPOSITORY',
    repositoryId: c.basis.repositoryId,
    entity: { kind, id: id as ScopedRef['entity']['id'], revisionId: c.basis.revisionId },
  });
  for (const r of [...p.contracts, ...p.tasks]) {
    const contract = 'protocol' in r ? r : undefined,
      task = 'taskKind' in r ? r : undefined;
    const triggerKind =
      contract?.protocol === 'HTTP' && contract.direction === 'PROVIDER'
        ? 'HTTP'
        : contract?.protocol === 'MESSAGE' && contract.direction === 'CONSUMER'
          ? 'MESSAGE'
          : task?.taskKind === 'JOB'
            ? 'SCHEDULE'
            : null;
    if (!triggerKind || !r.implementationRef) continue;
    const owner = c.nodes.find((n) => String(n.id) === String(r.implementationRef!.entity.id));
    if (
      !owner ||
      owner.kind !== 'SYMBOL' ||
      !['METHOD', 'FUNCTION'].includes(owner.symbolKind) ||
      owner.confidence.score < 0.5
    )
      continue;
    phase1Assert(
      r.confidence.method ===
        (c.contextVersion === 5
          ? 'runtime-declaration-support-v2'
          : 'runtime-declaration-support-v1') &&
        r.confidence.score === 0.5 &&
        r.resolution === 'HEURISTIC',
    );
    const contextKind =
      triggerKind === 'HTTP' ? 'REQUEST' : triggerKind === 'MESSAGE' ? 'EVENT' : 'JOB';
    const meaning = [
      triggerKind,
      contextKind,
      owner.factKey,
      contract?.factKey ?? null,
      task?.factKey ?? null,
    ];
    const sha = (s: string) => createHash('sha256').update(s).digest('hex');
    const factKey =
      'execution-fact:' +
      sha(
        'declared-execution-fact-v1\0' +
          JSON.stringify([c.basis.repositoryId, 'ENTRY_POINT', meaning]),
      );
    const id =
      'execution:' +
      sha(
        'declared-execution-entity-v1\0' +
          JSON.stringify([c.basis.repositoryId, c.basis.revisionId, 'ENTRY_POINT', factKey]),
      );
    const origin = base.provenance.find((v) => v.entityId === r.id);
    phase1Assert(origin);
    units +=
      1 +
      r.supportRefs.length +
      origin!.draftKeys.length +
      origin!.ruleIds.length +
      origin!.syntaxIds.length;
    phase1Assert(units <= maxItems);
    entries.push({
      id,
      factKey,
      repositoryId: c.basis.repositoryId,
      revisionId: c.basis.revisionId,
      basis: c.basis,
      sourceRange: r.sourceRange,
      supportRefs: r.supportRefs,
      confidence: {
        score: 0.5,
        method,
        reasons: ['CURRENT_INPUT_BASIS', 'DECLARATION_EXECUTION_DERIVED', 'ENTRY_BINDING'],
      },
      resolution: 'HEURISTIC',
      triggerKind,
      contextKind,
      ownerRef: r.implementationRef,
      contractRef: contract ? scoped('CONTRACT', contract.id) : null,
      taskRef: task ? scoped('TASK_DEFINITION', task.id) : null,
    });
    provenance.push({ ...origin!, entityId: id, policyVersion: method });
  }
  entries.sort((a, b) =>
    String((a as { id: string }).id) < String((b as { id: string }).id) ? -1 : 1,
  );
  return freeze({
    facts: parseRuntimeFactSet({ ...base.facts, payload: { ...p, entryPoints: entries } }),
    coverage: { ...base.coverage, limitations },
    provenance: provenance.sort((a, b) =>
      a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0,
    ),
  });
}
