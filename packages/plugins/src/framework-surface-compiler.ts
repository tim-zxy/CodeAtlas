import {
  parseRuntimeSitePlan,
  phase1Assert,
  canonicalRuntimeJson,
  type ScopedRef,
  type RuntimeSitePlanV1,
} from '@codeatlas/ir';
import { validatePluginV5Context } from './plugin-context-v5.js';
import { compileFrameworkSurfaceBindingCandidate } from './framework-binding-candidate.js';
import { extractFrameworkDraftsFromValidatedContext } from './framework-extraction.js';
import { isDeepStrictEqual } from 'node:util';
import type { SyntaxEvidenceV4 } from '@codeatlas/ir';
import {
  createFrameworkBindingIndex,
  bindImportedName,
  bindDeclaredReceiver,
  scopeChain,
  namedDefinitions,
  combineSupport,
  syntaxSupport,
  preciseCallee,
  type FrameworkBindingIndex,
  type FrameworkSyntax,
  type Support,
} from './framework-bindings.js';
import type { Emit, Diagnose, Proposal } from './framework-rules.js';
type Invocation = Extract<SyntaxEvidenceV4, { syntaxKind: 'INVOCATION' }>;
const same = isDeepStrictEqual;
const method = (s: Invocation) => s.payload.callee.name.split('.').at(-1);
const before = (a: Invocation['sourceRange'], b: Invocation['sourceRange']) =>
  a.sourceFileId === b.sourceFileId &&
  (a.endLine < b.startLine || (a.endLine === b.startLine && a.endColumn < b.startColumn));
function localInitializer(
  i: FrameworkBindingIndex,
  site: Invocation,
): { call: Invocation; support: Support[] } | null {
  const receiver = site.payload.receiver,
    chain = scopeChain(i, site);
  if (
    !chain ||
    receiver?.kind !== 'REFERENCE' ||
    !/^[$\p{ID_Start}_][$\p{ID_Continue}]*$/u.test(receiver.name)
  )
    return null;
  let ds: ReturnType<typeof namedDefinitions> = [];
  for (const scope of chain) {
    ds = namedDefinitions(i, String(scope.payload.scopeRef.entity.id), receiver.name);
    if (ds.length) break;
  }
  if (ds.length !== 2 || !ds.some((d) => d.kind === 'TYPED')) return null;
  const a = ds.find((d) => d.kind === 'WRITE')?.syntax;
  if (
    !a ||
    a.syntaxKind !== 'ASSIGNMENT' ||
    a.payload.assignmentForm !== 'DIRECT_VALUE' ||
    a.controlContext !== 'UNCONDITIONAL' ||
    !before(a.sourceRange, site.sourceRange)
  )
    return null;
  const calls = i.context.syntaxEvidence.filter(
    (s): s is Invocation =>
      s.syntaxKind === 'INVOCATION' &&
      'invocationForm' in s.payload &&
      same(s.sourceRange, a.payload.valueRange) &&
      same(s.owner, a.owner) &&
      same(s.lexicalScope, a.lexicalScope) &&
      s.controlContext === 'UNCONDITIONAL' &&
      s.sourceFingerprint === a.sourceFingerprint,
  );
  return calls.length === 1
    ? {
        call: calls[0]!,
        support: combineSupport(
          [syntaxSupport(a)],
          ds.map((d) => syntaxSupport(d.syntax)),
        ),
      }
    : null;
}
function literal(call: Invocation): string | null {
  const a = call.payload.arguments;
  return a.length === 1 &&
    a[0]!.name === null &&
    a[0]!.value.kind === 'STRING' &&
    a[0]!.value.value.length > 0
    ? a[0]!.value.value
    : null;
}
function handler(
  i: FrameworkBindingIndex,
  callback: Extract<SyntaxEvidenceV4, { syntaxKind: 'CALLBACK_BINDING' }>,
): { ref: NonNullable<SyntaxEvidenceV4['owner']>; support: Support[] } | null {
  if (callback.payload.status !== 'COMPLETE' || callback.payload.limitations.length) return null;
  const chain = scopeChain(i, callback),
    type = chain?.find((s) =>
      i.context.nodes.some(
        (n) => String(n.id) === String(s.payload.scopeRef.entity.id) && n.kind === 'TYPE',
      ),
    );
  if (!type) return null;
  let name: string, body: Invocation | undefined;
  if (callback.payload.callbackForm === 'JAVA_METHOD_REFERENCE') {
    if (!callback.payload.reference) return null;
    name = callback.payload.reference.memberName;
  } else {
    const found = i.context.syntaxEvidence.filter(
      (s): s is Invocation =>
        s.syntaxKind === 'INVOCATION' &&
        'invocationForm' in s.payload &&
        same(s.sourceRange, callback.payload.body?.sourceRange),
    );
    if (found.length !== 1) return null;
    body = found[0]!;
    name = body.payload.callee.name.replace(/^this\./, '');
    if (
      !/^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(name) ||
      body.payload.arguments.length !== callback.payload.parameterNames.length ||
      body.payload.arguments.some(
        (a, n) =>
          a.name !== null ||
          a.value.kind !== 'REFERENCE' ||
          a.value.name !== callback.payload.parameterNames[n] ||
          a.value.resolution !== 'UNRESOLVED' ||
          a.value.candidates.length,
      )
    )
      return null;
  }
  const definitions = namedDefinitions(i, String(type.payload.scopeRef.entity.id), name),
    d = definitions[0]?.syntax;
  if (
    definitions.length !== 1 ||
    !d ||
    d.syntaxKind !== 'DECLARATION' ||
    d.payload.declarationForm !== 'CALLABLE' ||
    !d.owner ||
    d.controlContext !== 'UNCONDITIONAL' ||
    d.sourceRange.sourceFileId !== callback.sourceRange.sourceFileId
  )
    return null;
  const n = i.context.nodes.find((n) => String(n.id) === String(d.owner!.entity.id));
  if (n?.kind !== 'SYMBOL' || n.symbolKind !== 'METHOD') return null;
  const finalType = i.context.syntaxEvidence.find(
    (s) =>
      s.syntaxKind === 'DECLARATION' &&
      s.payload.declarationForm === 'TYPE' &&
      s.owner?.entity.id === type.payload.scopeRef.entity.id,
  );
  if (
    !d.payload.modifiers.some((m) => ['private', 'static', 'final'].includes(m)) &&
    !(finalType?.syntaxKind === 'DECLARATION' && finalType.payload.modifiers.includes('final'))
  )
    return null;
  if (body && (!n.qualifiedName || !preciseCallee(i, body, n.qualifiedName))) return null;
  return {
    ref: d.owner,
    support: combineSupport(
      [syntaxSupport(callback), syntaxSupport(d)],
      body ? [syntaxSupport(body)] : [],
      chain!.map(syntaxSupport),
      finalType ? [syntaxSupport(finalType)] : [],
    ),
  };
}
/** Context5-only fixed Mongo origin proof. Does not infer general data flow or threads. */
export function mongoSurfaceRules(i: FrameworkBindingIndex, emit: Emit, diagnose: Diagnose): void {
  if (i.context.contextVersion !== 5) return;
  for (const cb of i.context.syntaxEvidence) {
    if (cb.syntaxKind !== 'CALLBACK_BINDING') continue;
    const consumer = i.context.syntaxEvidence.find(
      (s): s is Invocation =>
        s.syntaxKind === 'INVOCATION' && same(s.sourceRange, cb.payload.consumer.sourceRange),
    );
    const links = i.context.syntaxEvidence.filter(
      (s) =>
        s.syntaxKind === 'VALUE_LINK' &&
        s.payload.relation === 'RECEIVER_RESULT' &&
        same(s.payload.consumer.sourceRange, cb.payload.consumer.sourceRange),
    );
    const link = links[0];
    if (
      !consumer ||
      method(consumer) !== 'forEach' ||
      consumer.payload.arguments.length !== 1 ||
      cb.payload.argumentIndex !== 0 ||
      links.length !== 1 ||
      link?.syntaxKind !== 'VALUE_LINK'
    ) {
      diagnose(cb, 'FRAMEWORK_RESOURCE_UNPROVEN');
      continue;
    }
    const watch = i.context.syntaxEvidence.find(
      (s): s is Invocation =>
        s.syntaxKind === 'INVOCATION' && same(s.sourceRange, link.payload.producer.sourceRange),
    );
    if (!watch || method(watch) !== 'watch' || watch.payload.arguments.length) {
      diagnose(cb, 'FRAMEWORK_RESOURCE_UNPROVEN');
      continue;
    }
    const collectionType = bindDeclaredReceiver(i, watch),
      collection = localInitializer(i, watch);
    if (
      collectionType.state !== 'BOUND' ||
      collectionType.qualifiedName !== 'com.mongodb.client.MongoCollection' ||
      !collection ||
      method(collection.call) !== 'getCollection'
    ) {
      diagnose(watch, 'FRAMEWORK_RESOURCE_UNPROVEN');
      continue;
    }
    const databaseType = bindDeclaredReceiver(i, collection.call),
      database = localInitializer(i, collection.call);
    if (
      databaseType.state !== 'BOUND' ||
      databaseType.qualifiedName !== 'com.mongodb.client.MongoDatabase' ||
      !database ||
      method(database.call) !== 'getDatabase'
    ) {
      diagnose(watch, 'FRAMEWORK_RESOURCE_UNPROVEN');
      continue;
    }
    const clientType = bindDeclaredReceiver(i, database.call),
      namespace = literal(database.call),
      logicalName = literal(collection.call),
      h = handler(i, cb);
    if (
      clientType.state !== 'BOUND' ||
      clientType.qualifiedName !== 'com.mongodb.client.MongoClient' ||
      !namespace ||
      !logicalName ||
      !h ||
      !watch.owner ||
      consumer.controlContext !== 'UNCONDITIONAL' ||
      !same(watch.owner, consumer.owner) ||
      !same(cb.payload.parentScopeRef, watch.owner)
    ) {
      diagnose(watch, 'FRAMEWORK_RESOURCE_UNPROVEN');
      continue;
    }
    const support = combineSupport(
        collectionType.support,
        databaseType.support,
        clientType.support,
        collection.support,
        database.support,
        h.support,
        [
          syntaxSupport(link),
          syntaxSupport(consumer),
          syntaxSupport(collection.call),
          syntaxSupport(database.call),
        ],
      ),
      resource = { resourceKind: 'MONGODB_COLLECTION', namespace, logicalName };
    emit(
      'mongo-change-stream:v2',
      watch,
      { kind: 'DATA_RESOURCE', ...resource, schemaRef: null },
      support,
    );
    emit(
      'mongo-change-stream:v2',
      watch,
      {
        kind: 'DATA_OPERATION',
        ...resource,
        implementationRef: watch.owner,
        operation: 'WATCH',
        handlerRef: h.ref,
      },
      support,
    );
  }
}

type TypeProof = { ref: NonNullable<SyntaxEvidenceV4['owner']>; support: Support[] };
function localType(
  i: FrameworkBindingIndex,
  site: FrameworkSyntax,
  name: string,
): TypeProof | null {
  const chain = scopeChain(i, site);
  if (!chain || !/^[$\p{ID_Start}_][$\p{ID_Continue}]*$/u.test(name)) return null;
  for (const scope of chain) {
    const definitions = namedDefinitions(i, String(scope.payload.scopeRef.entity.id), name);
    if (!definitions.length) continue;
    const d = definitions[0]?.syntax;
    if (
      definitions.length !== 1 ||
      !d ||
      d.syntaxKind !== 'DECLARATION' ||
      d.payload.declarationForm !== 'TYPE' ||
      d.controlContext !== 'UNCONDITIONAL' ||
      !d.owner ||
      d.sourceRange.sourceFileId !== site.sourceRange.sourceFileId ||
      !i.context.nodes.some((n) => String(n.id) === String(d.owner!.entity.id) && n.kind === 'TYPE')
    )
      return null;
    return { ref: d.owner, support: combineSupport([syntaxSupport(d)], chain.map(syntaxSupport)) };
  }
  return null;
}
function receiverLocalType(i: FrameworkBindingIndex, site: Invocation): TypeProof | null {
  const receiver = site.payload.receiver,
    chain = scopeChain(i, site);
  if (
    !chain ||
    receiver?.kind !== 'REFERENCE' ||
    receiver.resolution !== 'UNRESOLVED' ||
    receiver.candidates.length
  )
    return null;
  const name = receiver.name.replace(/^this\./, '');
  if (
    !/^[$\p{ID_Start}_][$\p{ID_Continue}]*$/u.test(name) ||
    !site.payload.callee.name.startsWith(receiver.name + '.')
  )
    return null;
  let definitions: ReturnType<typeof namedDefinitions> = [];
  for (const scope of chain) {
    if (
      receiver.name.startsWith('this.') &&
      !i.context.nodes.some(
        (n) => String(n.id) === String(scope.payload.scopeRef.entity.id) && n.kind === 'TYPE',
      )
    )
      continue;
    definitions = namedDefinitions(i, String(scope.payload.scopeRef.entity.id), name);
    if (definitions.length) break;
  }
  const d = definitions[0]?.syntax;
  if (
    definitions.length !== 1 ||
    !d ||
    !(
      d.syntaxKind === 'PARAMETER_BINDING' ||
      (d.syntaxKind === 'DECLARATION' && d.payload.declarationForm === 'TYPED_BINDING')
    ) ||
    !d.payload.declaredType ||
    d.controlContext !== 'UNCONDITIONAL'
  )
    return null;
  const proof = localType(i, d, d.payload.declaredType);
  if (!proof) return null;
  let support = combineSupport(proof.support, [syntaxSupport(d)]);
  const writes = i.context.syntaxEvidence.filter(
    (s) =>
      s.syntaxKind === 'ASSIGNMENT' &&
      s.sourceRange.sourceFileId === site.sourceRange.sourceFileId &&
      [name, 'this.' + name].includes(s.payload.targetName),
  );
  for (const w of writes) {
    if (
      w.syntaxKind !== 'ASSIGNMENT' ||
      d.syntaxKind !== 'DECLARATION' ||
      w.payload.targetName !== 'this.' + name ||
      w.payload.assignmentForm !== 'DIRECT_VALUE' ||
      w.payload.value.kind !== 'REFERENCE' ||
      w.payload.value.resolution !== 'UNRESOLVED' ||
      w.payload.value.candidates.length ||
      w.controlContext !== 'UNCONDITIONAL' ||
      !i.context.nodes.some(
        (n) =>
          String(n.id) === String(w.owner?.entity.id) &&
          n.kind === 'SYMBOL' &&
          n.symbolKind === 'CONSTRUCTOR',
      ) ||
      !scopeChain(i, w)?.some((s) => same(s.payload.scopeRef, d.lexicalScope))
    )
      return null;
    const parameters = i.context.syntaxEvidence.filter(
      (s) =>
        s.syntaxKind === 'PARAMETER_BINDING' &&
        s.payload.callableRef.entity.id === w.owner?.entity.id &&
        s.payload.name === (w.payload.value.kind === 'REFERENCE' ? w.payload.value.name : '') &&
        s.payload.declaredType === d.payload.declaredType,
    );
    if (parameters.length !== 1) return null;
    support = combineSupport(support, [syntaxSupport(w), syntaxSupport(parameters[0]!)]);
  }
  if (writes.length > 1) return null;
  return { ...proof, support };
}
export type SurfaceHttpDeclaration = {
  site: FrameworkSyntax;
  proposal: Proposal;
  support: Support[];
};
/** Required types are declarations, never selected bean instances. */
export function springSurfaceRules(
  i: FrameworkBindingIndex,
  emit: Emit,
  diagnose: Diagnose,
  declarations: SurfaceHttpDeclaration[],
): void {
  if (i.context.contextVersion !== 5) return;
  for (const site of i.context.syntaxEvidence) {
    if (site.syntaxKind === 'DECORATION' && /(?:^|\.)Autowired$/.test(site.payload.callee.name)) {
      const imported = bindImportedName(i, site, site.payload.callee.name),
        node = i.context.nodes.find((n) => String(n.id) === String(site.owner?.entity.id));
      if (
        imported.state !== 'BOUND' ||
        imported.qualifiedName !== 'org.springframework.beans.factory.annotation.Autowired' ||
        site.payload.arguments.length ||
        !site.owner ||
        !node ||
        i.context.syntaxEvidence.some(
          (s) =>
            s.syntaxKind === 'DECORATION' &&
            s.owner?.entity.id === site.owner?.entity.id &&
            /(?:^|\.)Qualifier$/.test(s.payload.callee.name),
        )
      ) {
        diagnose(site, 'FRAMEWORK_DEPENDENCY_UNPROVEN');
        continue;
      }
      const parameters = i.context.syntaxEvidence.filter(
          (s) =>
            s.syntaxKind === 'PARAMETER_BINDING' &&
            s.payload.callableRef.entity.id === site.owner?.entity.id,
        ),
        fields = i.context.syntaxEvidence.filter(
          (s) =>
            s.syntaxKind === 'DECLARATION' &&
            s.payload.declarationForm === 'TYPED_BINDING' &&
            s.owner?.entity.id === site.owner?.entity.id,
        ),
        required =
          node.kind === 'SYMBOL' && node.symbolKind === 'CONSTRUCTOR' ? parameters : fields;
      const proofs = required.map((d) =>
        'declaredType' in d.payload && d.payload.declaredType
          ? localType(i, d, d.payload.declaredType)
          : null,
      );
      // A partially proved constructor must not close the whole Autowired site.
      if (!required.length || proofs.some((proof) => !proof)) {
        diagnose(site, 'FRAMEWORK_DEPENDENCY_UNPROVEN');
        continue;
      }
      for (const [index, d] of required.entries()) {
        const proof = proofs[index]!;
        emit(
          'spring-required-type:v2',
          site,
          { kind: 'DEPENDENCY', ownerRef: site.owner, dependencyRef: proof.ref },
          combineSupport(imported.support, proof.support, [syntaxSupport(d)]),
        );
      }
    } else if (site.syntaxKind === 'INVOCATION') {
      const proof = receiverLocalType(i, site);
      if (!proof) continue;
      const matches = declarations.filter(
        (d) =>
          d.proposal.kind === 'HTTP' &&
          d.proposal.direction === 'CONSUMER' &&
          scopeChain(i, d.site)?.some(
            (s) => s.payload.scopeRef.entity.id === proof.ref.entity.id,
          ) &&
          i.context.nodes.some(
            (n) =>
              String(n.id) ===
                String(d.proposal.kind === 'HTTP' ? d.proposal.implementationRef.entity.id : '') &&
              n.name === method(site),
          ),
      );
      const d = matches[0];
      if (matches.length !== 1 || !d || d.proposal.kind !== 'HTTP') continue;
      const implementationId = d.proposal.implementationRef.entity.id;
      const declaration = i.context.syntaxEvidence.find(
          (s) =>
            s.syntaxKind === 'DECLARATION' &&
            s.payload.declarationForm === 'CALLABLE' &&
            s.owner?.entity.id === implementationId,
        ),
        owner = i.context.nodes.find((n) => String(n.id) === String(site.owner?.entity.id)),
        target = i.context.nodes.find(
          (n) =>
            String(n.id) ===
            String(d.proposal.kind === 'HTTP' ? d.proposal.implementationRef.entity.id : ''),
        );
      if (
        declaration?.syntaxKind !== 'DECLARATION' ||
        declaration.payload.parameterNames.length !== site.payload.arguments.length ||
        site.payload.arguments.some((a) => a.name !== null) ||
        owner?.kind !== 'SYMBOL' ||
        !['METHOD', 'CONSTRUCTOR'].includes(owner.symbolKind) ||
        !site.owner ||
        !target?.qualifiedName ||
        !preciseCallee(i, site, target.qualifiedName)
      ) {
        diagnose(site, 'FRAMEWORK_CLIENT_UNPROVEN');
        continue;
      }
      emit(
        'spring-feign-callsite:v2',
        site,
        { ...d.proposal, implementationRef: site.owner },
        combineSupport(proof.support, d.support, [
          syntaxSupport(d.site),
          syntaxSupport(declaration),
        ]),
      );
    }
  }
}

/** Fixed V5 rules build both candidate and plan; caller-supplied roles are never accepted. */
export function compileFrameworkSurfaceCandidate(
  input: unknown,
  framework: 'spring' | 'mongo' | 'kafka' | 'fastapi',
  syntaxMembershipDigest: string,
  maxItems: number,
) {
  const c = validatePluginV5Context(input),
    base = compileFrameworkSurfaceBindingCandidate(c, framework, maxItems),
    index = createFrameworkBindingIndex(c),
    byId = new Map(c.syntaxEvidence.map((s) => [String(s.id), s]));
  const extracted = extractFrameworkDraftsFromValidatedContext(c, framework, true),
    bindings = base.bindings.payload.bindings,
    consumed = new Set<string>(),
    limitations = new Set<string>();
  for (const p of base.provenance) for (const id of p.syntaxIds) consumed.add(id);
  for (const b of bindings)
    for (const r of b.supportRefs)
      if (r.entity.kind === 'SYNTAX_EVIDENCE') consumed.add(String(r.entity.id));
  const unverified = new Map<string, ScopedRef>(),
    mark = (site: SyntaxEvidenceV4) => {
      unverified.set(String(site.id), {
        scope: 'REPOSITORY',
        repositoryId: c.basis.repositoryId,
        entity: { kind: 'SYNTAX_EVIDENCE', id: site.id, revisionId: c.basis.revisionId },
      });
    };
  const handled = new Set<string>(),
    entries: RuntimeSitePlanV1['entries'] = [];
  const key = (r: SyntaxEvidenceV4['sourceRange']) => canonicalRuntimeJson(r);
  const supportKeys = (b: (typeof bindings)[number]) =>
    b.supportRefs
      .filter((s) => s.entity.kind === 'SYNTAX_EVIDENCE')
      .map((s) => byId.get(String(s.entity.id))?.syntaxKey)
      .filter((s): s is string => s !== undefined);
  for (const site of c.syntaxEvidence) {
    if (site.syntaxKind === 'DECORATION') {
      if (consumed.has(String(site.id))) {
        handled.add(key(site.sourceRange));
        continue;
      }
      const proof = bindImportedName(index, site, site.payload.callee.name);
      if (
        framework === 'spring' &&
        proof.state === 'BOUND' &&
        proof.qualifiedName === 'org.springframework.web.bind.annotation.RestController' &&
        site.payload.arguments.length === 0 &&
        c.nodes.some((n) => String(n.id) === String(site.owner?.entity.id) && n.kind === 'TYPE')
      )
        handled.add(key(site.sourceRange));
      else {
        limitations.add('UNVERIFIED_FRAMEWORK_DECLARATION');
        mark(site);
      }
      continue;
    }
    if (site.syntaxKind !== 'INVOCATION') continue;
    phase1Assert(site.owner);
    let role: RuntimeSitePlanV1['entries'][number]['role'] = 'ORDINARY_CALL',
      bindingIds: RuntimeSitePlanV1['entries'][number]['bindingIds'] = [],
      proofSyntaxKeys = [site.syntaxKey],
      proved = false;
    const direct = bindings.filter(
      (b) => same(b.sourceRange, site.sourceRange) && same(b.ownerRef, site.owner),
    );
    if (direct.length) {
      role = 'FRAMEWORK_BOUNDARY';
      bindingIds = direct.map((b) => b.id);
      proofSyntaxKeys.push(...direct.flatMap(supportKeys));
      proved = true;
    }
    if (!proved && site.callbackScope) {
      const callback = c.syntaxEvidence.find(
          (s) =>
            s.syntaxKind === 'CALLBACK_BINDING' &&
            s.payload.status === 'COMPLETE' &&
            same(s.payload.body?.sourceRange, site.sourceRange),
        ),
        watch =
          callback &&
          bindings.find(
            (b) =>
              b.kind === 'DATA_WATCH' &&
              b.supportRefs.some(
                (r) => r.entity.kind === 'SYNTAX_EVIDENCE' && r.entity.id === callback.id,
              ),
          );
      if (callback && !watch && callback.syntaxKind === 'CALLBACK_BINDING') {
        const h = handler(index, callback);
        if (
          h &&
          h.support.every(
            (r) =>
              r.kind !== 'SYNTAX' ||
              c.syntaxEvidence.some(
                (s) =>
                  s.id === r.id &&
                  s.confidence.method === 'syntax-surface-support-v2' &&
                  s.confidence.score === 0.5 &&
                  s.supportRefs.every((ref) => {
                    const value = (
                      ref.entity.kind === 'CODE_NODE'
                        ? c.nodes
                        : ref.entity.kind === 'CODE_EDGE'
                          ? c.edges
                          : []
                    ).find((v) => String(v.id) === String(ref.entity.id));
                    return !value || value.confidence.score >= 0.5;
                  }),
              ),
          )
        ) {
          role = 'CALLBACK_BODY';
          proofSyntaxKeys.push(
            ...h.support
              .filter((r) => r.kind === 'SYNTAX')
              .map((r) => byId.get(String(r.id))!.syntaxKey),
          );
          proved = true;
        }
      }
      if (callback && watch) {
        role = 'CALLBACK_BODY';
        bindingIds = [watch.id];
        proofSyntaxKeys.push(...supportKeys(watch));
        proved = true;
      }
    }
    if (!proved) {
      const watch = bindings.find(
        (b) =>
          b.kind === 'DATA_WATCH' &&
          b.supportRefs.some((r) => r.entity.kind === 'SYNTAX_EVIDENCE' && r.entity.id === site.id),
      );
      if (watch && ['getDatabase', 'getCollection', 'forEach'].includes(method(site)!)) {
        role = 'FRAMEWORK_ORIGIN';
        bindingIds = [watch.id];
        proofSyntaxKeys.push(...supportKeys(watch));
        proved = true;
      }
    }
    if (!proved && framework === 'fastapi' && consumed.has(String(site.id))) {
      const proof = bindImportedName(index, site, site.payload.callee.name),
        related = bindings.filter(
          (b) =>
            b.kind === 'DEPENDENCY' &&
            b.supportRefs.some(
              (r) => r.entity.kind === 'SYNTAX_EVIDENCE' && r.entity.id === site.id,
            ),
        );
      if (
        (proof.state === 'BOUND' &&
          ['fastapi.FastAPI', 'fastapi.APIRouter', 'fastapi.Depends'].includes(
            proof.qualifiedName,
          )) ||
        (site.payload.callee.name.endsWith('.include_router') &&
          base.provenance.some((p) => p.syntaxIds.includes(site.id)))
      ) {
        role = 'FRAMEWORK_ORIGIN';
        bindingIds = related.map((b) => b.id);
        proofSyntaxKeys.push(...related.flatMap(supportKeys));
        proved = true;
      }
    }
    if (!proved && framework === 'kafka' && site.payload.invocationForm === 'CONSTRUCT') {
      const proof = bindImportedName(index, site, site.payload.callee.name),
        assignments = c.syntaxEvidence.filter(
          (s) =>
            s.syntaxKind === 'ASSIGNMENT' &&
            s.payload.assignmentForm === 'DIRECT_VALUE' &&
            same(s.payload.valueRange, site.sourceRange) &&
            same(s.owner, site.owner) &&
            same(s.lexicalScope, site.lexicalScope),
        );
      const publish =
        assignments.length === 1 &&
        bindings.find(
          (b) =>
            b.kind === 'MESSAGE_PUBLISH' &&
            b.supportRefs.some(
              (r) => r.entity.kind === 'SYNTAX_EVIDENCE' && r.entity.id === assignments[0]!.id,
            ),
        );
      if (
        proof.state === 'BOUND' &&
        proof.qualifiedName === 'org.springframework.kafka.core.KafkaTemplate' &&
        publish
      ) {
        role = 'FRAMEWORK_ORIGIN';
        bindingIds = [publish.id];
        proofSyntaxKeys.push(
          ...supportKeys(publish),
          ...proof.support
            .filter((s) => s.kind === 'SYNTAX')
            .map((s) => byId.get(String(s.id))!.syntaxKey),
        );
        proved = true;
      }
    }
    if (!proved) {
      const edge =
        site.payload.codeCallRef &&
        c.edges.find((e) => String(e.id) === String(site.payload.codeCallRef!.entity.id));
      if (
        edge?.kind === 'CALL' &&
        edge.target.state === 'RESOLVED' &&
        edge.target.resolution === 'EXACT'
      )
        proved = true;
      else {
        limitations.add('UNVERIFIED_FRAMEWORK_SITE');
        mark(site);
      }
    }
    if (proved) handled.add(key(site.sourceRange));
    entries.push({
      siteKey: site.syntaxKey,
      sourceRange: site.sourceRange,
      ownerRef: site.owner!,
      codeCallRef: site.payload.codeCallRef,
      role,
      bindingIds,
      proofSyntaxKeys: [...new Set(proofSyntaxKeys)].sort(),
    });
  }
  const diagnosticCodes = new Set(extracted.diagnostics.map((d) => d.code));
  for (const l of base.coverage.limitations)
    if (!['DOMAIN_RECORDS_ONLY', 'DECLARATION_ENTRIES_ONLY'].includes(l) && !diagnosticCodes.has(l))
      limitations.add(l);
  for (const d of extracted.diagnostics)
    if (!d.sourceRange || !handled.has(key(d.sourceRange))) {
      limitations.add(d.code);
      for (const site of c.syntaxEvidence)
        if (d.sourceRange && same(site.sourceRange, d.sourceRange)) mark(site);
    }
  for (const r of [...base.facts.payload.contracts, ...base.facts.payload.tasks]) {
    const contract = 'protocol' in r ? r : null,
      task = 'taskKind' in r ? r : null;
    if (
      (contract &&
        ((contract.protocol === 'HTTP' && contract.direction === 'PROVIDER') ||
          (contract.protocol === 'MESSAGE' && contract.direction === 'CONSUMER'))) ||
      task?.taskKind === 'JOB'
    )
      if (
        !base.facts.payload.entryPoints.some((e) =>
          contract
            ? e.contractRef?.entity.id === contract.id
            : task
              ? e.taskRef?.entity.id === task.id
              : false,
        )
      )
        limitations.add('DECLARED_ENTRY_UNVERIFIED');
  }
  const unverifiedRefs = [
    ...new Map(
      [...base.coverage.unverifiedRefs, ...unverified.values()].map((r) => [
        canonicalRuntimeJson(r),
        r,
      ]),
    ).entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, r]) => r);
  const p = base.facts.payload,
    baseUnits =
      [...p.entryPoints, ...p.tasks, ...p.dataResources, ...p.triggers, ...p.contracts].reduce(
        (n, r) => n + 1 + r.supportRefs.length,
        0,
      ) +
      p.externalRefs.length +
      p.supportInventory.length +
      bindings.reduce((n, b) => n + 1 + b.supportRefs.length, 0) +
      limitations.size +
      unverifiedRefs.length;
  phase1Assert(
    baseUnits +
      entries.reduce((n, e) => n + 1 + e.proofSyntaxKeys.length + e.bindingIds.length, 0) <=
      maxItems,
  );
  const availableEntities = c.supportInventory.map((s) => ({
      scope: 'REPOSITORY',
      repositoryId: c.basis.repositoryId,
      entity: s.entity,
    })),
    syntaxContext = {
      references: { availableEntities, availableSupports: c.supportInventory },
      codeNodes: c.nodes,
      codeEdges: c.edges,
      sourceFiles: c.sourceFiles,
    };
  const sitePlan = parseRuntimeSitePlan(
    {
      basis: c.basis,
      syntaxMembershipDigest,
      entries: entries.sort((a, b) => a.siteKey.localeCompare(b.siteKey)),
    },
    {
      basis: c.basis,
      syntaxMembershipDigest,
      syntaxEvidence: c.syntaxEvidence,
      syntaxContext,
      bindings,
    },
  );
  const coverage = {
    status:
      limitations.size || unverifiedRefs.length ? ('PARTIAL' as const) : ('COMPLETE' as const),
    limitations: [...limitations].sort(),
    unverifiedRefs,
  };
  const out = { ...base, coverage, sitePlan };
  const freeze = (v: unknown): void => {
    if (v !== null && typeof v === 'object') {
      for (const x of Object.values(v)) freeze(x);
      Object.freeze(v);
    }
  };
  freeze(out);
  return out;
}
