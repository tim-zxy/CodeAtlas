import { validatePluginV5Context } from './plugin-context-v5.js';
import type { FrameworkContext } from './framework-bindings.js';
import { createHash } from 'node:crypto';
import {
  parseFrameworkBindingSet,
  parseRuntimeFactSet,
  phase1Assert,
  scopedRefKey,
  entityRefKey,
  type SupportRef,
  type FrameworkBinding,
} from '@codeatlas/ir';
import { validatePluginV4Context } from './plugin-context-v4.js';
import { compileFrameworkEntryCandidateFromValidatedContext } from './framework-entry-candidate.js';
import { extractFrameworkDraftsFromValidatedContext } from './framework-extraction.js';
import { canonical } from './framework-draft.js';
type Framework = 'spring' | 'mongo' | 'kafka' | 'fastapi';
const H = (domain: string, tuple: unknown[]) =>
  createHash('sha256')
    .update(domain + '\0' + JSON.stringify(tuple))
    .digest('hex');
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
/** Emits only bindings whose target and site have been proved by this same candidate. */
export function compileFrameworkBindingCandidate(
  input: unknown,
  framework: Framework,
  maxItems: number,
) {
  return compileFromContext(validatePluginV4Context(input), framework, maxItems);
}
export function compileFrameworkSurfaceBindingCandidate(
  input: unknown,
  framework: Framework,
  maxItems: number,
) {
  return compileFromContext(validatePluginV5Context(input), framework, maxItems);
}
function compileFromContext(c: FrameworkContext, framework: Framework, maxItems: number) {
  const base = compileFrameworkEntryCandidateFromValidatedContext(c, framework, maxItems, true);
  const p = base.facts.payload,
    extracted = extractFrameworkDraftsFromValidatedContext(c, framework, true);
  const bindings: unknown[] = [];
  const ref = (kind: string, id: string) => ({
    scope: 'REPOSITORY',
    repositoryId: c.basis.repositoryId,
    entity: { kind, id, revisionId: c.basis.revisionId },
  });
  const limitations = new Set(base.coverage.limitations);
  let handledData = 0,
    handledDependencies = 0;
  const dataOperations = extracted.drafts.filter(
    (d) => d.value.payload.proposal.kind === 'DATA_OPERATION',
  ).length;
  for (const draft of extracted.drafts) {
    const d = draft.value.payload,
      q = d.proposal;
    const ownerRef =
      'implementationRef' in q ? q.implementationRef : q.kind === 'DEPENDENCY' ? q.ownerRef : null;
    if (!ownerRef) continue;
    const owner = c.nodes.find((n) => String(n.id) === String(ownerRef.entity.id));
    if (!owner || owner.confidence.score < 0.5) continue;
    let kind: FrameworkBinding['kind'] | null = null,
      target: (typeof p.contracts)[number] | (typeof p.dataResources)[number] | undefined;
    let field: string | null = null;
    if (c.contextVersion === 5 && q.kind === 'DEPENDENCY') {
      const used = draft.support
        .filter((s) => s.kind === 'SYNTAX')
        .map((s) => c.syntaxEvidence.find((u) => u.id === s.id));
      if (
        used.some(
          (s) =>
            !s ||
            s.confidence.method !== 'syntax-surface-support-v2' ||
            s.confidence.score !== 0.5 ||
            s.supportRefs.some((ref) => {
              const fact = (
                ref.entity.kind === 'CODE_NODE'
                  ? c.nodes
                  : ref.entity.kind === 'CODE_EDGE'
                    ? c.edges
                    : []
              ).find((n) => String(n.id) === String(ref.entity.id));
              return fact !== undefined && fact.confidence.score < 0.5;
            }),
        )
      )
        continue;
      const target = c.nodes.find((n) => String(n.id) === String(q.dependencyRef.entity.id));
      if (!target || target.confidence.score < 0.5) continue;
      const wanted = new Set(
          used.flatMap((s) => s?.supportRefs.map((r) => entityRefKey(r.entity)) ?? []),
        ),
        syntaxIds = new Set(used.map((s) => s?.id));
      if (
        used.some(
          (s) =>
            !s ||
            !p.supportInventory.some(
              (r) => r.entity.kind === 'SYNTAX_EVIDENCE' && r.entity.id === s.id,
            ),
        ) ||
        [...wanted].some((k) => !p.supportInventory.some((r) => entityRefKey(r.entity) === k))
      )
        continue;
      const supportRefs = p.supportInventory.filter(
        (s) =>
          wanted.has(entityRefKey(s.entity)) ||
          (s.entity.kind === 'SYNTAX_EVIDENCE' && syntaxIds.has(s.entity.id)),
      );
      if (
        !supportRefs.some(
          (s) => s.entity.kind === 'CODE_NODE' && String(s.entity.id) === String(owner.id),
        ) ||
        !supportRefs.some(
          (s) => s.entity.kind === 'CODE_NODE' && String(s.entity.id) === String(target.id),
        )
      )
        continue;
      const file = c.sourceFiles.find((f) => f.id === d.sourceRange.sourceFileId);
      phase1Assert(file);
      const r = d.sourceRange,
        factKey =
          'framework-binding:' +
          H('framework-binding-fact-v1', [
            c.basis.repositoryId,
            'DEPENDENCY',
            owner.factKey,
            target.factKey,
            [file!.path, r.startLine, r.startColumn, r.endLine, r.endColumn],
            null,
          ]),
        id =
          'binding:' +
          H('framework-binding-entity-v1', [
            c.basis.repositoryId,
            c.basis.revisionId,
            'DEPENDENCY',
            factKey,
          ]);
      bindings.push({
        id,
        factKey,
        repositoryId: c.basis.repositoryId,
        revisionId: c.basis.revisionId,
        basis: c.basis,
        sourceRange: d.sourceRange,
        supportRefs,
        confidence: {
          score: 0.5,
          method: 'runtime-declaration-support-v2',
          reasons: [
            'CURRENT_INPUT_BASIS',
            'FRAMEWORK_DECLARATION_BOUND',
            'DECLARED_TYPE_OR_PROVIDER_REQUIRED',
          ],
        },
        resolution: 'HEURISTIC',
        kind: 'DEPENDENCY',
        ownerRef,
        dependencyRef: q.dependencyRef,
      });
      handledDependencies++;
      continue;
    }
    if (q.kind === 'MESSAGE') {
      kind = q.signature.role === 'PRODUCER' ? 'MESSAGE_PUBLISH' : 'MESSAGE_CONSUME';
      field = 'contractRef';
      target = p.contracts.find((r) =>
        base.provenance.some((o) => o.entityId === r.id && o.draftKeys.includes(d.draftKey)),
      );
    } else if (q.kind === 'HTTP' && q.direction === 'CONSUMER') {
      kind = 'HTTP_CALL';
      field = 'contractRef';
      target = p.contracts.find((r) =>
        base.provenance.some((o) => o.entityId === r.id && o.draftKeys.includes(d.draftKey)),
      );
    } else if (q.kind === 'DATA_OPERATION' && (q.operation !== 'WATCH' || c.contextVersion === 5)) {
      kind =
        q.operation === 'WATCH'
          ? 'DATA_WATCH'
          : q.operation === 'READ'
            ? 'DATA_READ'
            : 'DATA_WRITE';
      field = 'resourceRef';
      const sites = c.syntaxEvidence.filter(
        (s) =>
          s.syntaxKind === 'INVOCATION' &&
          canonical(s.sourceRange) === canonical(d.sourceRange) &&
          s.owner &&
          scopedRefKey(s.owner) === scopedRefKey(ownerRef),
      );
      if (sites.length !== 1) continue;
      const matches = p.dataResources.filter(
        (r) =>
          r.resourceKind === q.resourceKind &&
          r.logicalName === q.logicalName &&
          r.namespace === q.namespace &&
          base.provenance.some((o) => o.entityId === r.id && o.syntaxIds.includes(sites[0]!.id)),
      );
      if (matches.length === 1) target = matches[0];
    }
    if (!kind || !target || !field) continue;
    const origin = base.provenance.find((o) => o.entityId === target!.id);
    if (
      !origin ||
      draft.support.some((s) => s.kind === 'SYNTAX' && !origin.syntaxIds.includes(s.id))
    )
      continue;
    if (
      !target.supportRefs.some(
        (s) => s.entity.kind === 'CODE_NODE' && String(s.entity.id) === String(owner.id),
      )
    ) {
      limitations.add('BINDING_OWNER_SUPPORT_UNPROVEN');
      continue;
    }
    const file = c.sourceFiles.find((f) => f.id === d.sourceRange.sourceFileId);
    phase1Assert(file);
    const r = d.sourceRange;
    const factKey =
      'framework-binding:' +
      H('framework-binding-fact-v1', [
        c.basis.repositoryId,
        kind,
        owner.factKey,
        target.factKey,
        [file.path, r.startLine, r.startColumn, r.endLine, r.endColumn],
        q.kind === 'DATA_OPERATION' && q.operation === 'WATCH'
          ? (c.nodes.find((n) => String(n.id) === String(q.handlerRef?.entity.id))?.factKey ?? null)
          : null,
      ]);
    const id =
      'binding:' +
      H('framework-binding-entity-v1', [c.basis.repositoryId, c.basis.revisionId, kind, factKey]);
    bindings.push({
      id,
      factKey,
      repositoryId: c.basis.repositoryId,
      revisionId: c.basis.revisionId,
      basis: c.basis,
      sourceRange: d.sourceRange,
      supportRefs: target.supportRefs,
      confidence: {
        score: 0.5,
        method:
          c.contextVersion === 5
            ? 'runtime-declaration-support-v2'
            : 'runtime-declaration-support-v1',
        reasons: ['CURRENT_INPUT_BASIS', 'FRAMEWORK_DECLARATION_BOUND', 'BOUNDARY_RELATION_PROVED'],
      },
      resolution: 'HEURISTIC',
      kind,
      ownerRef,
      [field]: ref(field === 'contractRef' ? 'CONTRACT' : 'DATA_RESOURCE', target.id),
      ...(q.kind === 'DATA_OPERATION' && q.operation === 'WATCH'
        ? { handlerRef: q.handlerRef }
        : {}),
    });
    if (q.kind === 'DATA_OPERATION') handledData++;
  }
  if (
    c.contextVersion === 5 &&
    handledDependencies > 0 &&
    handledDependencies ===
      extracted.drafts.filter((d) => d.value.payload.proposal.kind === 'DEPENDENCY').length
  )
    limitations.delete('DEPENDENCY_REPRESENTATION_PENDING');
  if (handledData > 0 && handledData === dataOperations)
    limitations.delete('DATA_OPERATION_REQUIRES_CONTEXT');
  const ordered = bindings.toSorted((a, b) =>
    canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0,
  );
  const unique = new Map<string, unknown>();
  for (const binding of ordered) {
    const b = binding as { id: string };
    const old = unique.get(b.id);
    phase1Assert(!old || canonical(old) === canonical(b));
    unique.set(b.id, b);
  }
  const bindingSet = parseFrameworkBindingSet(
    {
      schema: 'codeatlas.framework-binding-set',
      version: 1,
      payload: {
        basis: p.basis,
        externalRefs: p.externalRefs,
        supportInventory: p.supportInventory,
        bindings: [...unique.values()].sort((a, b) =>
          String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)),
        ),
      },
    },
    base.facts,
  );
  const records = [...p.entryPoints, ...p.tasks, ...p.dataResources, ...p.triggers, ...p.contracts];
  const units =
    records.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    p.externalRefs.length +
    p.supportInventory.length +
    bindingSet.payload.bindings.reduce((n, r) => n + 1 + r.supportRefs.length, 0) +
    limitations.size;
  phase1Assert(units <= maxItems);
  // One runtime inventory is shared by both candidates; no new Store authority.
  const facts = parseRuntimeFactSet(base.facts);
  return freeze({
    facts,
    bindings: bindingSet,
    coverage: { ...base.coverage, limitations: [...limitations].sort() },
    provenance: base.provenance,
  });
}
