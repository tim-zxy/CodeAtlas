import {
  createFrameworkBindingIndex,
  scopeChain,
  type FrameworkContext,
  type FrameworkSyntax,
} from './framework-bindings.js';
import { createHash } from 'node:crypto';
import {
  parseRuntimeFactSet,
  phase1Assert,
  entityRefKey,
  Phase1CoverageSchema,
  EntityIdSchema,
  type SourceRange,
  type SupportRef,
} from '@codeatlas/ir';
import { validatePluginV4Context } from './plugin-context-v4.js';
import { extractFrameworkDraftsFromValidatedContext } from './framework-extraction.js';
import { canonical, type FrameworkDraft } from './framework-draft.js';
import { MAX_PLUGIN_CONTEXT_FACTS } from './plugin-spi.js';

type Framework = 'spring' | 'mongo' | 'kafka' | 'fastapi';
export type FrameworkRuntimeCandidate = {
  facts: ReturnType<typeof parseRuntimeFactSet>;
  coverage: ReturnType<typeof Phase1CoverageSchema.parse>;
  provenance: {
    entityId: string;
    draftKeys: string[];
    ruleIds: string[];
    syntaxIds: string[];
    policyVersion: string;
  }[];
};
type Retained = {
  kind: 'CONTRACT' | 'TASK_DEFINITION' | 'DATA_RESOURCE';
  id: string;
  factKey: string;
  core: string;
  fields: Record<string, unknown>;
  sourceRange: SourceRange;
  supports: Map<string, SupportRef>;
  draftKeys: Set<string>;
  ruleIds: Set<string>;
  syntaxIds: Set<string>;
  reasons: string[];
};
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function freeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
/** Private pure declaration candidate. No Store membership or publication authority. */
export function compileFrameworkRuntimeCandidate(
  input: unknown,
  framework: Framework,
): FrameworkRuntimeCandidate {
  return compileFrameworkRuntimeCandidateFromValidatedContext(
    validatePluginV4Context(input),
    framework,
  );
}
/** Private shared compiler; Context4 must already be validated. */
export function compileFrameworkRuntimeCandidateFromValidatedContext(
  c: FrameworkContext,
  framework: Framework,
  includeFeign = false,
): FrameworkRuntimeCandidate {
  const policy =
    c.contextVersion === 5 ? 'runtime-declaration-support-v2' : 'runtime-declaration-support-v1';
  const extracted = extractFrameworkDraftsFromValidatedContext(c, framework, includeFeign);
  let units = 0;
  const charge = (n = 1) => {
    phase1Assert(units + n <= MAX_PLUGIN_CONTEXT_FACTS);
    units += n;
  };
  const limitations = new Set<string>();
  const limit = (s: string) => {
    if (!limitations.has(s)) {
      charge();
      limitations.add(s);
    }
  };
  limit('DOMAIN_RECORDS_ONLY');
  for (const d of extracted.diagnostics) limit(d.code);
  const syntaxById = new Map(c.syntaxEvidence.map((s) => [String(s.id), s]));
  const nodes = new Map(c.nodes.map((n) => [String(n.id), n]));
  const code = new Map<string, number>([
    ...c.nodes.map(
      (n) =>
        [
          entityRefKey({
            kind: 'CODE_NODE',
            id: EntityIdSchema.parse(n.id),
            revisionId: c.basis.revisionId,
          }),
          n.confidence.score,
        ] as const,
    ),
    ...c.edges.map(
      (n) =>
        [
          entityRefKey({
            kind: 'CODE_EDGE',
            id: EntityIdSchema.parse(n.id),
            revisionId: c.basis.revisionId,
          }),
          n.confidence.score,
        ] as const,
    ),
  ]);
  const inventory = new Map(c.supportInventory.map((s) => [entityRefKey(s.entity), s]));
  const retained = new Map<string, Retained>();
  const supports = new Map<string, SupportRef>();
  const addSupport = (r: Retained, s: SupportRef) => {
    const key = entityRefKey(s.entity);
    const old = supports.get(key);
    phase1Assert(!old || canonical(old) === canonical(s));
    if (!old) {
      charge(2); // One external reference and one inventory membership.
      supports.set(key, s);
    }
    if (!r.supports.has(key)) {
      charge();
      r.supports.set(key, s);
    }
  };
  const addProvenance = (set: Set<string>, value: string) => {
    if (!set.has(value)) {
      charge();
      set.add(value);
    }
  };
  for (const draft of extracted.drafts) {
    const p = draft.value.payload,
      proposal = p.proposal;
    if (proposal.kind === 'DATA_OPERATION') {
      limit('DATA_OPERATION_REQUIRES_CONTEXT');
      continue;
    }
    if (proposal.kind === 'DEPENDENCY' && c.contextVersion !== 5) {
      limit('DEPENDENCY_REPRESENTATION_PENDING');
      continue;
    }
    const used: FrameworkSyntax[] = [];
    let applicable = true;
    const checkSupport = (s: SupportRef) => {
      const current = inventory.get(entityRefKey(s.entity));
      phase1Assert(current && canonical(current) === canonical(s));
      const fact = code.get(entityRefKey(s.entity));
      if (fact !== undefined && fact < 0.5) applicable = false;
    };
    for (const support of draft.support) {
      if (support.kind === 'SYNTAX') {
        const s = syntaxById.get(String(support.id));
        phase1Assert(s);
        used.push(s!);
        if (
          s!.confidence.method !==
            (c.contextVersion === 5 ? 'syntax-surface-support-v2' : 'syntax-surface-support-v1') ||
          s!.confidence.score !== 0.5
        )
          applicable = false;
        for (const ref of s!.supportRefs) checkSupport(ref);
      } else {
        const kind = support.ref.factType === 'NODE' ? 'CODE_NODE' : 'CODE_EDGE';
        const s = inventory.get(
          entityRefKey({
            kind,
            id: EntityIdSchema.parse(support.ref.id),
            revisionId: c.basis.revisionId,
          }),
        );
        phase1Assert(s);
        checkSupport(s!);
      }
    }
    if (!applicable) {
      limit('DECLARATION_SUPPORT_POLICY_INAPPLICABLE');
      continue;
    }
    if (proposal.kind === 'DEPENDENCY') {
      const evidence: SupportRef[] = [];
      for (const u of used) {
        evidence.push(...u.supportRefs, {
          basis: c.basis,
          entity: { kind: 'SYNTAX_EVIDENCE', id: u.id, revisionId: c.basis.revisionId },
          valueDigest: digest(
            'runtime-syntax-support-v1\0' +
              canonical({ schema: 'codeatlas.syntax-evidence', version: 4, payload: u }),
          ) as SupportRef['valueDigest'],
        });
      }
      for (const support of draft.support)
        if (support.kind === 'CANONICAL') {
          const current = inventory.get(
            entityRefKey({
              kind: support.ref.factType === 'NODE' ? 'CODE_NODE' : 'CODE_EDGE',
              id: EntityIdSchema.parse(support.ref.id),
              revisionId: c.basis.revisionId,
            }),
          );
          phase1Assert(current);
          evidence.push(current!);
        }
      for (const ref of [proposal.ownerRef, proposal.dependencyRef])
        phase1Assert(
          evidence.some((s) => s.entity.kind === 'CODE_NODE' && s.entity.id === ref.entity.id),
        );
      for (const ref of evidence) {
        const key = entityRefKey(ref.entity),
          old = supports.get(key);
        phase1Assert(!old || canonical(old) === canonical(ref));
        if (!old) {
          charge(2);
          supports.set(key, ref);
        }
      }
      limit('DEPENDENCY_REPRESENTATION_PENDING');
      continue;
    }
    const implementation =
      'implementationRef' in proposal
        ? nodes.get(String(proposal.implementationRef.entity.id))
        : undefined;
    const scope = declarationScope(c, draft, used);
    if (!scope || ('implementationRef' in proposal && !implementation)) {
      limit('DECLARATION_SCOPE_UNPROVEN');
      continue;
    }
    let kind: Retained['kind'], semantic: unknown[], fields: Record<string, unknown>;
    const reasons = ['CURRENT_INPUT_BASIS', 'FRAMEWORK_DECLARATION_BOUND', 'RULE_FIELDS_VALIDATED'];
    if (proposal.kind === 'DATA_RESOURCE') {
      kind = 'DATA_RESOURCE';
      const { kind: _kind, ...resource } = proposal;
      fields = resource;
      semantic = [
        proposal.resourceKind,
        proposal.logicalName,
        proposal.namespace,
        proposal.schemaRef,
      ];
      reasons.push('RESOURCE_SCOPE_PROVED');
      if (proposal.namespace === null) reasons.push('NAMESPACE_UNKNOWN');
      if (proposal.schemaRef === null) reasons.push('SCHEMA_UNKNOWN');
    } else if (proposal.kind === 'TASK') {
      kind = 'TASK_DEFINITION';
      fields = {
        taskKind: proposal.taskKind,
        implementationRef: proposal.implementationRef,
        triggerRef: null,
      };
      semantic = [proposal.taskKind, implementation!.factKey];
      reasons.push('IMPLEMENTATION_DECLARED');
    } else {
      kind = 'CONTRACT';
      const s = proposal.signature;
      const direction =
        proposal.kind === 'HTTP'
          ? proposal.direction
          : s.kind === 'MESSAGE' && s.role === 'PRODUCER'
            ? 'PROVIDER'
            : 'CONSUMER';
      fields = {
        direction,
        protocol: s.kind,
        serviceRef: null,
        signature: s,
        implementationRef: proposal.implementationRef,
      };
      const signature =
        s.kind === 'HTTP'
          ? [
              s.method,
              s.pathSegments.map((p) => [p.kind, p.kind === 'LITERAL' ? p.value : p.name]),
              s.querySchemaRef,
              s.requestSchemaRef,
              s.responseSchemaRef,
              s.serviceHint,
            ]
          : [s.transport, s.namespace, s.channel, s.role, s.payloadSchemaRef, s.keySchemaRef];
      semantic = [direction, s.kind, signature, implementation!.factKey];
      reasons.push('IMPLEMENTATION_DECLARED');
      if (s.kind === 'MESSAGE' && s.namespace === null) reasons.push('NAMESPACE_UNKNOWN');
      if (
        s.kind === 'HTTP'
          ? [s.querySchemaRef, s.requestSchemaRef, s.responseSchemaRef].some((v) => v === null)
          : [s.payloadSchemaRef, s.keySchemaRef].some((v) => v === null)
      )
        reasons.push('SCHEMA_UNKNOWN');
    }
    const factKey =
      'runtime-fact:' +
      digest(
        'runtime-semantic-fact-v1\0' +
          JSON.stringify([c.basis.repositoryId, kind, scope, semantic]),
      );
    const id =
      'runtime:' +
      digest(
        'runtime-semantic-entity-v1\0' +
          JSON.stringify([c.basis.repositoryId, c.basis.revisionId, kind, factKey]),
      );
    const core = canonical({ kind, fields, scope, semantic });
    let record = retained.get(id);
    if (record) phase1Assert(record.core === core);
    else {
      charge();
      record = {
        kind,
        id,
        factKey,
        core,
        fields,
        sourceRange: p.sourceRange,
        supports: new Map(),
        draftKeys: new Set(),
        ruleIds: new Set(),
        syntaxIds: new Set(),
        reasons,
      };
      retained.set(id, record);
    }
    if (anchorKey(c, p.sourceRange) < anchorKey(c, record.sourceRange))
      record.sourceRange = p.sourceRange;
    addProvenance(record.draftKeys, p.draftKey);
    addProvenance(record.ruleIds, p.ruleId);
    for (const support of draft.support) {
      if (support.kind !== 'CANONICAL') continue;
      const s = inventory.get(
        entityRefKey({
          kind: support.ref.factType === 'NODE' ? 'CODE_NODE' : 'CODE_EDGE',
          id: EntityIdSchema.parse(support.ref.id),
          revisionId: c.basis.revisionId,
        }),
      );
      phase1Assert(s);
      addSupport(record, s!);
    }
    for (const s of used) {
      addProvenance(record.syntaxIds, String(s.id));
      for (const ref of s.supportRefs) addSupport(record, ref);
      addSupport(record, {
        basis: c.basis,
        entity: { kind: 'SYNTAX_EVIDENCE', id: s.id, revisionId: c.basis.revisionId },
        valueDigest: digest(
          'runtime-syntax-support-v1\0' +
            canonical({
              schema: 'codeatlas.syntax-evidence',
              version: c.contextVersion === 5 ? 4 : 3,
              payload: s,
            }),
        ) as SupportRef['valueDigest'],
      });
    }
  }
  const ordered = [...retained.values()].sort((a, b) => order(a.id, b.id));
  const values = (kind: Retained['kind']) =>
    ordered
      .filter((r) => r.kind === kind)
      .map((r) => ({
        ...r.fields,
        id: r.id,
        factKey: r.factKey,
        repositoryId: c.basis.repositoryId,
        revisionId: c.basis.revisionId,
        basis: c.basis,
        sourceRange: r.sourceRange,
        supportRefs: [...r.supports.values()].sort((a, b) =>
          order(canonical(a.entity), canonical(b.entity)),
        ),
        confidence: { score: 0.5, method: policy, reasons: r.reasons },
        resolution: 'HEURISTIC',
      }));
  const inventoryValues = [...supports.values()].sort((a, b) =>
    order(canonical(a.entity), canonical(b.entity)),
  );
  const facts = parseRuntimeFactSet({
    schema: 'codeatlas.runtime-fact-set',
    version: 1,
    payload: {
      basis: c.basis,
      externalRefs: inventoryValues.map((s) => ({
        scope: 'REPOSITORY',
        repositoryId: c.basis.repositoryId,
        entity: s.entity,
      })),
      supportInventory: inventoryValues,
      entryPoints: [],
      tasks: values('TASK_DEFINITION'),
      dataResources: values('DATA_RESOURCE'),
      triggers: [],
      contracts: values('CONTRACT'),
      contexts: [],
      nodes: [],
      edges: [],
      flows: [],
    },
  });
  return freeze({
    facts,
    coverage: { status: 'PARTIAL', limitations: [...limitations].sort(), unverifiedRefs: [] },
    provenance: ordered.map((r) => ({
      entityId: r.id,
      draftKeys: [...r.draftKeys].sort(),
      ruleIds: [...r.ruleIds].sort(),
      syntaxIds: [...r.syntaxIds].sort(),
      policyVersion: policy,
    })),
  });
}
function anchorKey(c: FrameworkContext, r: SourceRange): string {
  const file = c.sourceFiles.find((f) => f.id === r.sourceFileId);
  phase1Assert(file);
  // Numeric coordinates retain their numerical ordering after the path.
  return JSON.stringify([
    file!.path,
    ...[r.startLine, r.startColumn, r.endLine, r.endColumn].map((v) => String(v).padStart(16, '0')),
  ]);
}
function declarationScope(
  c: FrameworkContext,
  draft: FrameworkDraft,
  used: FrameworkSyntax[],
): unknown[] | null {
  const p = draft.value.payload,
    proposal = p.proposal;
  const file = c.sourceFiles.find((f) => f.id === p.sourceRange.sourceFileId);
  if (!file) return null;
  const node = (id: string | undefined) => c.nodes.find((n) => String(n.id) === id);
  const impl =
    'implementationRef' in proposal
      ? node(String(proposal.implementationRef.entity.id))
      : undefined;
  const sites = used.filter(
    (s) =>
      (s.syntaxKind === 'INVOCATION' || s.syntaxKind === 'DECORATION') &&
      canonical(s.sourceRange) === canonical(p.sourceRange) &&
      (!impl || String(s.owner?.entity.id) === String(impl.id)),
  );
  if (sites.length !== 1) return null;
  const site = sites[0]!;
  if (p.framework === 'fastapi' && site.syntaxKind === 'DECORATION') {
    const receiver = site.payload.callee.name.split('.').slice(0, -1).join('.');
    const assignments = used.filter(
      (s) =>
        s.syntaxKind === 'ASSIGNMENT' &&
        s.payload.assignmentForm === 'DIRECT_VALUE' &&
        s.payload.targetName === receiver &&
        node(String(s.lexicalScope?.entity.id))?.kind === 'MODULE',
    );
    if (assignments.length !== 1) return null;
    return [
      file.path,
      node(String(assignments[0]!.lexicalScope!.entity.id))!.factKey,
      receiver,
      impl?.factKey ?? null,
    ];
  }
  if ((p.framework === 'mongo' || p.framework === 'kafka') && site.syntaxKind === 'INVOCATION') {
    const receiver = site.payload.receiver;
    if (receiver?.kind !== 'REFERENCE') return null;
    const name = receiver.name.startsWith('this.') ? receiver.name.slice(5) : receiver.name;
    const declarations = used.filter(
      (s) =>
        s.syntaxKind === 'DECLARATION' &&
        s.payload.declarationForm === 'TYPED_BINDING' &&
        s.payload.declaredName === name &&
        s.lexicalScope,
    );
    if (declarations.length !== 1) return null;
    const scope = node(String(declarations[0]!.lexicalScope!.entity.id));
    return scope
      ? [
          file.path,
          scope.factKey,
          name,
          proposal.kind === 'DATA_RESOURCE' ? null : (impl?.factKey ?? null),
        ]
      : null;
  }
  if (p.framework === 'kafka' && site.syntaxKind === 'DECORATION' && impl)
    return [file.path, impl.factKey, null, impl.factKey];
  if (p.framework === 'spring' && impl) {
    if (c.contextVersion === 5) {
      const chain = scopeChain(createFrameworkBindingIndex(c), site),
        type = chain?.find((s) => node(String(s.payload.scopeRef.entity.id))?.kind === 'TYPE');
      if (!type) return null;
      return [
        file.path,
        node(String(type.payload.scopeRef.entity.id))!.factKey,
        null,
        impl.factKey,
      ];
    }
    const types = used.filter(
      (s) =>
        s.syntaxKind === 'BINDING_SCOPE' &&
        node(String(s.payload.scopeRef.entity.id))?.kind === 'TYPE',
    );
    if (types.length !== 1) return null;
    const scope = types[0]!;
    if (scope.syntaxKind === 'BINDING_SCOPE')
      return [
        file.path,
        node(String(scope.payload.scopeRef.entity.id))!.factKey,
        null,
        impl.factKey,
      ];
  }
  return null;
}
