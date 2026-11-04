import type { FrameworkSyntax } from './framework-bindings.js';
import { isDeepStrictEqual } from 'node:util';
import { phase1Assert, type SyntaxEvidenceV3, type SyntaxValue } from '@codeatlas/ir';
import type { FrameworkDraft } from './framework-draft.js';
import { isDirectAssignmentCall } from './plugin-context-v3.js';
import {
  bindImportedName,
  bindDeclaredReceiver,
  namedDefinitions,
  scopeChain,
  preciseCallee,
  syntaxSupport,
  combineSupport,
  type FrameworkBindingIndex,
  type Support,
} from './framework-bindings.js';
type Site = Extract<SyntaxEvidenceV3, { syntaxKind: 'INVOCATION' | 'DECORATION' }>;
export type Proposal = FrameworkDraft['value']['payload']['proposal'];
export type Emit = (
  rule: string,
  site: FrameworkSyntax,
  proposal: Proposal,
  support: Support[],
) => void;
export type Diagnose = (site: FrameworkSyntax, code?: string) => void;
const text = (v: SyntaxValue | undefined): string | null =>
  v?.kind === 'STRING' && v.value.length > 0 && !v.value.includes('\${') && !v.value.includes('#{')
    ? v.value
    : null;
const node = (i: FrameworkBindingIndex, id: string | undefined) =>
  i.context.nodes.find((n) => String(n.id) === id);
function implementation(i: FrameworkBindingIndex, s: SyntaxEvidenceV3) {
  const n = node(i, s.owner ? String(s.owner.entity.id) : undefined);
  return n?.kind === 'SYMBOL' && ['METHOD', 'FUNCTION', 'CONSTRUCTOR'].includes(n.symbolKind)
    ? s.owner!
    : null;
}
function javaMethod(i: FrameworkBindingIndex, s: SyntaxEvidenceV3): boolean {
  const n = node(i, String(s.owner?.entity.id));
  return n?.kind === 'SYMBOL' && n.symbolKind === 'METHOD';
}
function args(
  s: Site,
  positional: string[],
  allowed = positional,
): Map<string, SyntaxValue> | null {
  const result = new Map<string, SyntaxValue>();
  let position = 0;
  for (const a of s.payload.arguments) {
    const name = a.name ?? positional[position++];
    if (!name || !allowed.includes(name) || result.has(name)) return null;
    result.set(name, a.value);
  }
  return result;
}
function single(s: Site, name: string): SyntaxValue | undefined {
  const a = args(s, [name]);
  return a?.size === 1 ? a.get(name) : undefined;
}
function pathParts(
  path: string,
): ({ kind: 'LITERAL'; value: string } | { kind: 'PARAMETER'; name: string })[] | null {
  if (path === '/') return [];
  if (
    !path.startsWith('/') ||
    path.endsWith('/') ||
    ['?', '#', '%', '\\', '*', '(', ')', '[', ']', ':'].some((c) => path.includes(c)) ||
    /\s/u.test(path)
  )
    return null;
  const result: ({ kind: 'LITERAL'; value: string } | { kind: 'PARAMETER'; name: string })[] = [];
  for (const p of path.slice(1).split('/')) {
    if (!p) return null;
    if (/^\{[\p{ID_Start}_][\p{ID_Continue}]*\}$/u.test(p))
      result.push({ kind: 'PARAMETER', name: p.slice(1, -1) });
    else if (/[{}]/u.test(p)) return null;
    else result.push({ kind: 'LITERAL', value: p });
  }
  return result;
}
function http(
  i: FrameworkBindingIndex,
  s: Site,
  method: string,
  path: string,
  prefixes: string[],
): Proposal | null {
  const owner = implementation(i, s);
  if (!owner || (path === '/' && prefixes.some((p) => p !== '' && p !== '/'))) return null;
  const parts = [...prefixes.filter((p) => p !== ''), path].map(pathParts);
  if (parts.some((p) => p === null)) return null;
  return {
    kind: 'HTTP',
    direction: 'PROVIDER',
    implementationRef: owner,
    signature: {
      kind: 'HTTP',
      method,
      pathSegments: parts.flatMap((p) => p!),
      querySchemaRef: null,
      requestSchemaRef: null,
      responseSchemaRef: null,
      serviceHint: null,
    },
  };
}
function javaTypeImport(
  i: FrameworkBindingIndex,
  support: Support[],
  qualifiedName: string,
): boolean {
  return support.some(
    (r) =>
      r.kind === 'SYNTAX' &&
      i.context.syntaxEvidence.some(
        (s) =>
          s.id === r.id &&
          s.syntaxKind === 'IMPORT_BINDING' &&
          s.payload.importKind === 'JAVA_TYPE' &&
          s.payload.qualifiedName === qualifiedName,
      ),
  );
}
const springNamespace = 'org.springframework.web.bind.annotation.';
const methods: Record<string, string> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
};
export function springRules(
  i: FrameworkBindingIndex,
  emit: Emit,
  diagnose: Diagnose,
  includeFeign = false,
): void {
  const decorations = i.context.syntaxEvidence.filter((s) => s.syntaxKind === 'DECORATION');
  for (const s of decorations) {
    const proof = bindImportedName(i, s, s.payload.callee.name);
    if (proof.state !== 'BOUND') {
      diagnose(s, proof.code);
      continue;
    }
    const name = proof.qualifiedName;
    if (
      includeFeign &&
      name === 'org.springframework.cloud.openfeign.FeignClient' &&
      node(i, String(s.owner?.entity.id))?.kind === 'TYPE'
    )
      continue;
    if (!javaTypeImport(i, proof.support, name)) {
      diagnose(s);
      continue;
    }
    if (name === 'org.springframework.scheduling.annotation.Scheduled') {
      const cron = text(args(s, [], ['cron'])?.get('cron')),
        owner = implementation(i, s);
      if (!cron || !owner || !javaMethod(i, s)) {
        diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
        continue;
      }
      emit(
        'spring-cron:v1',
        s,
        {
          kind: 'TASK',
          taskKind: 'JOB',
          implementationRef: owner,
          schedule: {
            kind: 'OBJECT',
            entries: [{ name: 'cron', value: { kind: 'STRING', value: cron } }],
          },
        },
        proof.support,
      );
      continue;
    }
    if (!name.startsWith(springNamespace)) {
      diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
      continue;
    }
    const short = name.slice(springNamespace.length),
      method = Object.hasOwn(methods, short) ? methods[short] : undefined;
    if (
      name === springNamespace + 'RequestMapping' &&
      node(i, String(s.owner?.entity.id))?.kind === 'TYPE'
    )
      continue;
    if (!method || !javaMethod(i, s)) {
      diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
      continue;
    }
    const ownMappings = decorations.filter(
      (d) => d.owner?.entity.id === s.owner?.entity.id && /Mapping$/.test(d.payload.callee.name),
    );
    const a = args(s, ['value'], ['value', 'path']),
      path = a?.size === 1 ? text(a.get('value') ?? a.get('path')) : null;
    if (!path || ownMappings.length !== 1) {
      diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
      continue;
    }
    let support = proof.support;
    const chain = scopeChain(i, s),
      type = chain?.find((c) => node(i, String(c.payload.scopeRef.entity.id))?.kind === 'TYPE');
    if (!type) {
      diagnose(s);
      continue;
    }
    const typeNode = node(i, String(type.payload.scopeRef.entity.id));
    let serviceHint: string | null = null;
    if (typeNode?.kind === 'TYPE' && typeNode.typeKind === 'INTERFACE') {
      if (!includeFeign) {
        diagnose(s);
        continue;
      }
      const clients = decorations.filter(
        (d) =>
          String(d.owner?.entity.id) === String(typeNode.id) &&
          /(?:^|\.)FeignClient$/.test(d.payload.callee.name),
      );
      if (clients.length !== 1) {
        diagnose(s, 'FRAMEWORK_CLIENT_UNPROVEN');
        continue;
      }
      const client = clients[0]!,
        bound = bindImportedName(i, client, client.payload.callee.name);
      const values = args(client, [], ['name', 'value']);
      serviceHint = values?.size === 1 ? text(values.get('name') ?? values.get('value')) : null;
      if (
        bound.state !== 'BOUND' ||
        bound.qualifiedName !== 'org.springframework.cloud.openfeign.FeignClient' ||
        !javaTypeImport(i, bound.support, bound.qualifiedName) ||
        serviceHint === null
      ) {
        diagnose(s, 'FRAMEWORK_CLIENT_UNPROVEN');
        continue;
      }
      support = combineSupport(support, bound.support, [syntaxSupport(client)]);
    }
    const classMappings = decorations.filter(
      (d) =>
        d.owner?.entity.id === type.payload.scopeRef.entity.id &&
        /Mapping$/.test(d.payload.callee.name),
    );
    const prefixes: string[] = [];
    if (classMappings.length) {
      const p = classMappings[0]!,
        bound = bindImportedName(i, p, p.payload.callee.name),
        values = args(p, ['value'], ['value', 'path']);
      const prefix = values?.size === 1 ? text(values.get('value') ?? values.get('path')) : null;
      if (
        classMappings.length !== 1 ||
        bound.state !== 'BOUND' ||
        bound.qualifiedName !== springNamespace + 'RequestMapping' ||
        !javaTypeImport(i, bound.support, bound.qualifiedName) ||
        prefix === null
      ) {
        diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
        continue;
      }
      prefixes.push(prefix);
      support = combineSupport(support, bound.support, [syntaxSupport(p)]);
    }
    const proposal = http(i, s, method, path, prefixes);
    if (!proposal) {
      diagnose(s, 'FRAMEWORK_SIGNATURE_UNREPRESENTABLE');
      continue;
    }
    if (serviceHint !== null && proposal.kind === 'HTTP')
      emit(
        'spring-feign:v1',
        s,
        { ...proposal, direction: 'CONSUMER', signature: { ...proposal.signature, serviceHint } },
        support,
      );
    else emit('spring-http:v1', s, proposal, support);
  }
}
export function mongoRules(i: FrameworkBindingIndex, emit: Emit, diagnose: Diagnose): void {
  for (const s of i.context.syntaxEvidence) {
    if (s.syntaxKind !== 'INVOCATION') continue;
    const p = bindDeclaredReceiver(i, s);
    if (p.state !== 'BOUND') {
      diagnose(s, p.code);
      continue;
    }
    if (p.qualifiedName !== 'org.springframework.data.mongodb.core.MongoTemplate') {
      diagnose(s);
      continue;
    }
    const method = s.payload.callee.name.split('.').at(-1)!;
    const count: Record<string, number> = { find: 3, findOne: 3, findAll: 2, insert: 2, save: 2 };
    if (!Object.hasOwn(count, method)) {
      diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
      continue;
    }
    const a = s.payload.arguments,
      collection = text(a.at(-1)?.value),
      owner = implementation(i, s);
    if (a.length !== count[method] || a.some((v) => v.name !== null) || !collection || !owner) {
      diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
      continue;
    }
    const resource = {
      resourceKind: 'MONGODB_COLLECTION',
      logicalName: collection,
      namespace: null,
    };
    const write = method === 'insert' || method === 'save',
      rule = write ? 'mongo-template-write:v1' : 'mongo-template-read:v1';
    emit(
      rule,
      s,
      {
        kind: 'DATA_OPERATION',
        ...resource,
        implementationRef: owner,
        operation: write ? 'WRITE' : 'READ',
        handlerRef: null,
      },
      p.support,
    );
    emit(rule, s, { kind: 'DATA_RESOURCE', ...resource, schemaRef: null }, p.support);
  }
}
function message(
  i: FrameworkBindingIndex,
  s: Site,
  channel: string,
  role: 'PRODUCER' | 'CONSUMER',
): Proposal | null {
  const owner = implementation(i, s);
  return owner
    ? {
        kind: 'MESSAGE',
        implementationRef: owner,
        signature: {
          kind: 'MESSAGE',
          transport: 'KAFKA',
          namespace: null,
          channel,
          role,
          payloadSchemaRef: null,
          keySchemaRef: null,
        },
      }
    : null;
}
export function kafkaRules(i: FrameworkBindingIndex, emit: Emit, diagnose: Diagnose): void {
  for (const s of i.context.syntaxEvidence) {
    if (s.syntaxKind === 'DECORATION') {
      const p = bindImportedName(i, s, s.payload.callee.name);
      if (p.state !== 'BOUND') {
        diagnose(s, p.code);
        continue;
      }
      if (
        !javaMethod(i, s) ||
        p.qualifiedName !== 'org.springframework.kafka.annotation.KafkaListener' ||
        !javaTypeImport(i, p.support, p.qualifiedName)
      ) {
        diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
        continue;
      }
      const v = args(s, [], ['topics'])?.get('topics'),
        values = v?.kind === 'ARRAY' ? v.items : [v],
        topics = values.map((v) => text(v));
      if (
        !topics.length ||
        topics.some((t) => t === null) ||
        new Set(topics).size !== topics.length
      ) {
        diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
        continue;
      }
      for (const topic of topics) {
        const proposal = message(i, s, topic!, 'CONSUMER');
        if (!proposal) {
          diagnose(s);
          break;
        }
        emit('kafka-listener:v1', s, proposal, p.support);
      }
    } else if (s.syntaxKind === 'INVOCATION') {
      const p = bindDeclaredReceiver(i, s);
      if (p.state !== 'BOUND') {
        diagnose(s, p.code);
        continue;
      }
      if (
        p.qualifiedName !== 'org.springframework.kafka.core.KafkaTemplate' ||
        s.payload.callee.name.split('.').at(-1) !== 'send'
      ) {
        diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
        continue;
      }
      const a = s.payload.arguments,
        topic = text(a[0]?.value);
      if (![2, 3, 4, 5].includes(a.length) || a.some((v) => v.name !== null) || !topic) {
        diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
        continue;
      }
      const proposal = message(i, s, topic, 'PRODUCER');
      if (!proposal) {
        diagnose(s);
        continue;
      }
      emit('kafka-send:v1', s, proposal, p.support);
    }
  }
}
type FastObject = { kind: 'FastAPI' | 'APIRouter'; prefix: string; support: Support[] };
function fastObject(i: FrameworkBindingIndex, site: Site, name: string): FastObject | null {
  const chain = scopeChain(i, site);
  if (
    site.controlContext !== 'UNCONDITIONAL' ||
    !chain ||
    chain.length !== 1 ||
    node(i, String(chain[0]!.payload.scopeRef.entity.id))?.kind !== 'MODULE'
  )
    return null;
  if (i.memberWrites.get(name)?.has(String(site.sourceRange.sourceFileId))) return null;
  const definitions = namedDefinitions(i, String(chain[0]!.payload.scopeRef.entity.id), name);
  if (definitions.length !== 1) return null;
  const a = definitions[0]!.syntax;
  if (
    a.syntaxKind !== 'ASSIGNMENT' ||
    a.controlContext !== 'UNCONDITIONAL' ||
    a.payload.assignmentForm !== 'DIRECT_VALUE'
  )
    return null;
  if (
    a.sourceRange.endLine > site.sourceRange.startLine ||
    (a.sourceRange.endLine === site.sourceRange.startLine &&
      a.sourceRange.endColumn >= site.sourceRange.startColumn)
  )
    return null;
  const calls = i.context.syntaxEvidence.filter(
    (s) => s.syntaxKind === 'INVOCATION' && isDirectAssignmentCall(a, s),
  );
  if (calls.length !== 1) return null;
  const c = calls[0]!;
  phase1Assert(c.syntaxKind === 'INVOCATION');
  const p = bindImportedName(i, c, c.payload.callee.name);
  if (p.state !== 'BOUND' || !['fastapi.FastAPI', 'fastapi.APIRouter'].includes(p.qualifiedName))
    return null;
  let prefix = '';
  if (p.qualifiedName === 'fastapi.FastAPI') {
    if (c.payload.arguments.length) return null;
  } else {
    const values = args(c, [], ['prefix']);
    if (!values) return null;
    if (values.has('prefix')) {
      const v = values.get('prefix');
      if (v?.kind !== 'STRING' || (v.value !== '' && !pathParts(v.value))) return null;
      prefix = v.value;
    }
  }
  return {
    kind: p.qualifiedName === 'fastapi.FastAPI' ? 'FastAPI' : 'APIRouter',
    prefix,
    support: combineSupport(p.support, chain.map(syntaxSupport), [
      syntaxSupport(a),
      syntaxSupport(c),
    ]),
  };
}
export function fastapiRules(i: FrameworkBindingIndex, emit: Emit, diagnose: Diagnose): void {
  const decorations = i.context.syntaxEvidence.filter((s) => s.syntaxKind === 'DECORATION');
  for (const s of decorations) {
    const parts = s.payload.callee.name.split('.'),
      method = parts.pop()!,
      receiver = parts.join('.');
    if (!['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
      diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
      continue;
    }
    const object = fastObject(i, s, receiver);
    if (!object || !preciseCallee(i, s, 'fastapi.' + object.kind + '.' + method)) {
      diagnose(s);
      continue;
    }
    if (decorations.filter((d) => d.owner?.entity.id === s.owner?.entity.id).length !== 1) {
      diagnose(s, 'FRAMEWORK_REGISTRATION_UNPROVEN');
      continue;
    }
    const path = text(single(s, 'path'));
    if (!path) {
      diagnose(s, 'FRAMEWORK_VALUE_UNSUPPORTED');
      continue;
    }
    let support = object.support;
    const prefixes: string[] = [];
    if (object.kind === 'APIRouter') {
      prefixes.push(object.prefix);
      const includes = i.context.syntaxEvidence.filter(
        (v): v is Extract<SyntaxEvidenceV3, { syntaxKind: 'INVOCATION' }> =>
          v.syntaxKind === 'INVOCATION' &&
          v.sourceRange.sourceFileId === s.sourceRange.sourceFileId &&
          v.payload.callee.name.endsWith('.include_router'),
      );
      const matching = includes.filter((v) => {
        const a = args(v, ['router'], ['router', 'prefix']),
          r = a?.get('router');
        return r?.kind === 'REFERENCE' && r.name === receiver;
      });
      if (matching.length !== 1) {
        diagnose(s, 'FRAMEWORK_REGISTRATION_UNPROVEN');
        continue;
      }
      const inc = matching[0]!,
        a = args(inc, ['router'], ['router', 'prefix']),
        r = a?.get('router');
      const parentName = inc.payload.callee.name.slice(0, -'.include_router'.length),
        parent = fastObject(i, inc, parentName),
        v = a?.get('prefix'),
        prefix = v === undefined ? '' : v.kind === 'STRING' ? v.value : null;
      if (
        !a ||
        r?.kind !== 'REFERENCE' ||
        r.resolution !== 'UNRESOLVED' ||
        r.candidates.length ||
        !parent ||
        parent.kind !== 'FastAPI' ||
        !preciseCallee(i, inc, 'fastapi.FastAPI.include_router') ||
        prefix === null ||
        (prefix !== '' && !pathParts(prefix)) ||
        inc.sourceRange.startLine <= s.sourceRange.endLine ||
        includes.some((v) => {
          if (v === inc) return false;
          const a = args(v, ['router'], ['router', 'prefix']),
            r = a?.get('router');
          return (
            !a ||
            r?.kind !== 'REFERENCE' ||
            r.resolution !== 'UNRESOLVED' ||
            r.candidates.length > 0
          );
        })
      ) {
        diagnose(s, 'FRAMEWORK_REGISTRATION_UNPROVEN');
        continue;
      }
      prefixes.unshift(prefix);
      support = combineSupport(support, parent.support, [syntaxSupport(inc)]);
    }
    const proposal = http(i, s, method.toUpperCase(), path, prefixes);
    if (!proposal) {
      diagnose(s, 'FRAMEWORK_SIGNATURE_UNREPRESENTABLE');
      continue;
    }
    emit('fastapi-route:v1', s, proposal, support);
  }
  for (const s of i.context.syntaxEvidence)
    if (s.syntaxKind === 'INVOCATION' && /(?:^|\.)Depends$/.test(s.payload.callee.name)) {
      if (i.context.contextVersion !== 5) {
        diagnose(s, 'FRAMEWORK_API_UNSUPPORTED');
        continue;
      }
      const proof = bindImportedName(i, s, s.payload.callee.name),
        parameters = i.context.syntaxEvidence.filter(
          (p) =>
            p.syntaxKind === 'PARAMETER_BINDING' &&
            p.payload.language === 'python' &&
            isDeepStrictEqual(p.payload.defaultValueRange, s.sourceRange),
        );
      if (
        proof.state !== 'BOUND' ||
        proof.qualifiedName !== 'fastapi.Depends' ||
        parameters.length !== 1 ||
        s.payload.arguments.length !== 1 ||
        s.payload.arguments[0]!.name !== null
      ) {
        diagnose(s, 'FRAMEWORK_DEPENDENCY_UNPROVEN');
        continue;
      }
      const parameter = parameters[0]!;
      phase1Assert(parameter.syntaxKind === 'PARAMETER_BINDING');
      const arg = s.payload.arguments[0]!.value,
        chain = scopeChain(i, s);
      if (
        arg.kind !== 'REFERENCE' ||
        arg.resolution !== 'UNRESOLVED' ||
        arg.candidates.length ||
        !chain
      ) {
        diagnose(s, 'FRAMEWORK_DEPENDENCY_UNPROVEN');
        continue;
      }
      let definitions: ReturnType<typeof namedDefinitions> = [];
      for (const scope of chain) {
        definitions = namedDefinitions(i, String(scope.payload.scopeRef.entity.id), arg.name);
        if (definitions.length) break;
      }
      const target = definitions[0]?.syntax;
      if (
        definitions.length !== 1 ||
        !target ||
        target.syntaxKind !== 'DECLARATION' ||
        target.payload.declarationForm !== 'CALLABLE' ||
        !target.owner ||
        target.controlContext !== 'UNCONDITIONAL' ||
        !implementation(i, target)
      ) {
        diagnose(s, 'FRAMEWORK_DEPENDENCY_UNPROVEN');
        continue;
      }
      emit(
        'fastapi-default-dependency:v2',
        s,
        {
          kind: 'DEPENDENCY',
          ownerRef: parameter.payload.callableRef,
          dependencyRef: target.owner,
        },
        combineSupport(
          proof.support,
          [syntaxSupport(parameter), syntaxSupport(target)],
          chain.map(syntaxSupport),
        ),
      );
    }
}
