import { isDeepStrictEqual } from 'node:util';
import type { SyntaxEvidenceV3, SyntaxEvidenceV4 } from '@codeatlas/ir';
import type { PluginV5Context } from './plugin-context-v5.js';
export type FrameworkSyntax = SyntaxEvidenceV3 | SyntaxEvidenceV4;
export type FrameworkContext = PluginV4Context | PluginV5Context;
import type { z } from 'zod';
import type { PluginV2SupportSchema } from './plugin-spi-v2.js';
import type { PluginV4Context } from './plugin-context-v4.js';

export type Support = z.infer<typeof PluginV2SupportSchema>;
type Scope = Extract<FrameworkSyntax, { syntaxKind: 'BINDING_SCOPE' }>;
type Definition = {
  syntax: FrameworkSyntax;
  kind: 'IMPORT' | 'TYPED' | 'WRITE' | 'DECL' | 'PARAM' | 'EFFECT';
};
export type BindingProof =
  | { state: 'BOUND'; qualifiedName: string; support: Support[] }
  | { state: 'UNPROVEN'; code: string };
export type FrameworkBindingIndex = {
  context: FrameworkContext;
  scopes: Map<string, Scope>;
  definitions: Map<string, Map<string, Definition[]>>;
  memberWrites: Map<string, Set<string>>;
};
export const unproven = (code = 'FRAMEWORK_BINDING_UNPROVEN'): BindingProof => ({
  state: 'UNPROVEN',
  code,
});
export const syntaxSupport = (s: FrameworkSyntax): Support => ({ kind: 'SYNTAX', id: s.id });
export function combineSupport(...groups: Support[][]): Support[] {
  const key = (s: Support) =>
    s.kind === 'SYNTAX' ? 'S:' + s.id : 'C:' + s.ref.factType + ':' + s.ref.id;
  return [...new Map(groups.flat().map((s) => [key(s), s])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, s]) => s);
}
const id = (s: FrameworkSyntax) => (s.lexicalScope ? String(s.lexicalScope.entity.id) : null);
const identifier = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;
export function createFrameworkBindingIndex(context: FrameworkContext): FrameworkBindingIndex {
  const scopes = new Map<string, Scope>();
  for (const s of context.syntaxEvidence)
    if (s.syntaxKind === 'BINDING_SCOPE') scopes.set(String(s.payload.scopeRef.entity.id), s);
  const definitions = new Map<string, Map<string, Definition[]>>();
  const memberWrites = new Map<string, Set<string>>();
  const add = (
    scope: string | null,
    name: string | null,
    syntax: FrameworkSyntax,
    kind: Definition['kind'],
  ) => {
    if (!scope || !name) return;
    let names = definitions.get(scope);
    if (!names) definitions.set(scope, (names = new Map()));
    const values = names.get(name) ?? [];
    values.push({ syntax, kind });
    names.set(name, values);
  };
  for (const s of context.syntaxEvidence) {
    const scope = id(s);
    if (s.syntaxKind === 'IMPORT_BINDING') add(scope, s.payload.boundName, s, 'IMPORT');
    if (s.syntaxKind === 'ASSIGNMENT') {
      const name = s.payload.targetName;
      add(scope, name, s, 'WRITE');
      if (name.includes('.')) {
        const root = name.startsWith('this.') ? name.split('.')[1]! : name.split('.')[0]!;
        const files = memberWrites.get(root) ?? new Set<string>();
        files.add(String(s.sourceRange.sourceFileId));
        memberWrites.set(root, files);
      }
    }
    if (s.syntaxKind === 'BINDING_EFFECT') {
      add(scope, s.payload.name, s, 'EFFECT');
      const target = s.payload.targetScopeRef?.entity.id;
      if (target && target !== scope) add(String(target), s.payload.name, s, 'EFFECT');
    }
    if (context.contextVersion === 5 && s.syntaxKind === 'PARAMETER_BINDING')
      add(String(s.payload.callableRef.entity.id), s.payload.name, s, 'PARAM');
    if (s.syntaxKind === 'DECLARATION') {
      const p = s.payload;
      let bindingScope = scope;
      if (['TYPE', 'CALLABLE'].includes(p.declarationForm) && s.owner?.entity.id === scope)
        bindingScope = scopes.get(scope!)?.payload.parentScopeRef?.entity.id ?? null;
      add(
        bindingScope,
        p.declaredName,
        s,
        p.declarationForm === 'TYPED_BINDING' ? 'TYPED' : 'DECL',
      );
      if (context.contextVersion === 4 && p.declarationForm === 'CALLABLE')
        for (const name of p.parameterNames)
          add(s.owner ? String(s.owner.entity.id) : scope, name, s, 'PARAM');
    }
  }
  return { context, scopes, definitions, memberWrites };
}
export function scopeChain(index: FrameworkBindingIndex, site: FrameworkSyntax): Scope[] | null {
  let cursor = id(site);
  const result: Scope[] = [];
  while (cursor) {
    const s = index.scopes.get(cursor);
    if (!s || s.payload.status !== 'COMPLETE') return null;
    result.push(s);
    cursor = s.payload.parentScopeRef ? String(s.payload.parentScopeRef.entity.id) : null;
  }
  return result.length ? result : null;
}
export function namedDefinitions(
  index: FrameworkBindingIndex,
  scope: string,
  name: string,
): Definition[] {
  return index.definitions.get(scope)?.get(name) ?? [];
}
function safeChain(index: FrameworkBindingIndex, site: FrameworkSyntax): Scope[] | BindingProof {
  if (site.controlContext !== 'UNCONDITIONAL') return unproven('FRAMEWORK_CONTROL_UNPROVEN');
  const chain = scopeChain(index, site);
  if (!chain) return unproven('FRAMEWORK_SCOPE_PARTIAL');
  for (const scope of chain)
    for (const d of index.context.syntaxEvidence)
      if (
        id(d) === scope.payload.scopeRef.entity.id &&
        d.syntaxKind === 'IMPORT_BINDING' &&
        [
          'UNKNOWN',
          'PYTHON_RELATIVE',
          'PYTHON_WILDCARD',
          'JAVA_WILDCARD',
          'JAVA_STATIC_WILDCARD',
        ].includes(d.payload.importKind)
      )
        return unproven();
  return chain;
}
export function preciseCallee(
  index: FrameworkBindingIndex,
  site: FrameworkSyntax,
  qualifiedName: string,
): boolean {
  if (site.syntaxKind !== 'DECORATION' && site.syntaxKind !== 'INVOCATION') return true;
  const c = site.payload.callee;
  if (c.state === 'RESOLVED')
    return (
      c.resolution === 'EXACT' &&
      index.context.nodes.some(
        (n) => String(n.id) === String(c.target?.entity.id) && n.qualifiedName === qualifiedName,
      )
    );
  return c.resolution === 'UNRESOLVED' && c.candidates.length === 0;
}
function importProof(
  index: FrameworkBindingIndex,
  site: FrameworkSyntax,
  name: string,
  checkCallee: boolean,
): BindingProof {
  const checked = safeChain(index, site);
  if (!Array.isArray(checked)) return checked;
  const chain = checked;
  const parts = name.split('.');
  if (!parts.every((p) => identifier.test(p))) return unproven();
  const root = parts[0]!;
  if (index.memberWrites.get(root)?.has(String(site.sourceRange.sourceFileId)))
    return unproven('FRAMEWORK_NAME_CONFLICT');
  let found: Definition[] = [];
  for (const scope of chain) {
    found = namedDefinitions(index, String(scope.payload.scopeRef.entity.id), root);
    if (found.length) break;
  }
  // Explicit imported fully-qualified Java spelling still requires a clean root.
  if (!found.length)
    found = chain
      .flatMap((scope) =>
        [
          ...(index.definitions.get(String(scope.payload.scopeRef.entity.id))?.values() ?? []),
        ].flat(),
      )
      .filter(
        (d) =>
          d.syntax.syntaxKind === 'IMPORT_BINDING' &&
          d.syntax.payload.language === 'java' &&
          d.syntax.payload.qualifiedName === name,
      );
  const imports = found.filter((d) => d.kind === 'IMPORT');
  if (imports.length !== 1) return unproven('FRAMEWORK_NAME_CONFLICT');
  const s = imports[0]!.syntax;
  if (
    s.syntaxKind !== 'IMPORT_BINDING' ||
    s.controlContext !== 'UNCONDITIONAL' ||
    !s.payload.qualifiedName
  )
    return unproven();
  const p = s.payload,
    support = [syntaxSupport(s), ...chain.map(syntaxSupport)];
  for (const d of found) {
    if (d === imports[0]) continue;
    const a = d.syntax;
    if (
      d.kind !== 'WRITE' ||
      a.syntaxKind !== 'ASSIGNMENT' ||
      a.payload.assignmentForm !== 'IMPORT_ALIAS' ||
      a.payload.targetName !== p.boundName ||
      a.payload.value.kind !== 'REFERENCE' ||
      a.payload.value.name !== p.qualifiedName ||
      JSON.stringify(a.sourceRange) !== JSON.stringify(s.sourceRange) ||
      a.controlContext !== 'UNCONDITIONAL'
    )
      return unproven('FRAMEWORK_NAME_CONFLICT');
    support.push(syntaxSupport(a));
  }
  let q: string;
  if (p.importKind === 'PYTHON_MODULE') {
    // Same-root alias form is not represented; keep this ambiguous slice closed.
    if (p.qualifiedName!.includes('.') && p.boundName === p.qualifiedName!.split('.')[0])
      return unproven();
    const prefix = p.boundName === p.qualifiedName!.split('.')[0] ? p.qualifiedName! : p.boundName!;
    if (name !== prefix && !name.startsWith(prefix + '.')) return unproven();
    q = p.qualifiedName + name.slice(prefix.length);
  } else if (['JAVA_TYPE', 'JAVA_STATIC_MEMBER', 'PYTHON_SYMBOL'].includes(p.importKind)) {
    q = name === p.qualifiedName ? name : p.qualifiedName + name.slice(p.boundName!.length);
  } else return unproven();
  if (checkCallee && !preciseCallee(index, site, q)) return unproven();
  return { state: 'BOUND', qualifiedName: q, support: combineSupport(support) };
}
export function bindImportedName(
  index: FrameworkBindingIndex,
  site: FrameworkSyntax,
  name: string,
): BindingProof {
  return importProof(index, site, name, true);
}
function declaredReceiverType(text: string): string | null {
  const qualified = (name: string) =>
    name !== 'var' &&
    name.split('.').every((part) => part === part.trim() && identifier.test(part));
  const open = text.indexOf('<');
  if (open < 0) return qualified(text) ? text : null;
  if (!text.endsWith('>')) return null;
  const name = text.slice(0, open);
  const parameters = text.slice(open + 1, -1).split(',');
  return qualified(name) && parameters.every((part) => qualified(part.trim())) ? name : null;
}

export function bindDeclaredReceiver(
  index: FrameworkBindingIndex,
  site: FrameworkSyntax,
): BindingProof {
  if (site.syntaxKind !== 'INVOCATION' || site.payload.receiver?.kind !== 'REFERENCE')
    return unproven();
  const checked = safeChain(index, site);
  if (!Array.isArray(checked)) return checked;
  const receiver = site.payload.receiver;
  if (receiver.resolution !== 'UNRESOLVED' || receiver.candidates.length !== 0) return unproven();
  const raw = receiver.name,
    explicit = raw.startsWith('this.');
  const tail = site.payload.callee.name.slice(raw.length + 1);
  if (!site.payload.callee.name.startsWith(raw + '.') || !identifier.test(tail)) return unproven();
  const name = explicit ? raw.slice(5) : raw;
  if (
    !identifier.test(name) ||
    index.memberWrites.get(name)?.has(String(site.sourceRange.sourceFileId))
  )
    return unproven('FRAMEWORK_NAME_CONFLICT');
  let definitions: Definition[] = [];
  for (const scope of checked) {
    if (
      explicit &&
      !index.context.nodes.some(
        (n) => String(n.id) === String(scope.payload.scopeRef.entity.id) && n.kind === 'TYPE',
      )
    )
      continue;
    definitions = namedDefinitions(index, String(scope.payload.scopeRef.entity.id), name);
    if (definitions.length) break;
    if (explicit) return unproven();
  }
  let d = definitions[0];
  let initializer: FrameworkSyntax | undefined;
  if (definitions.length !== 1) {
    d = definitions.find((v) => v.kind === 'TYPED');
    const write = definitions.find((v) => v.kind === 'WRITE')?.syntax;
    const declaration = d?.syntax;
    if (
      definitions.length !== 2 ||
      !declaration ||
      declaration.syntaxKind !== 'DECLARATION' ||
      declaration.payload.declarationForm !== 'TYPED_BINDING' ||
      !write ||
      write.syntaxKind !== 'ASSIGNMENT' ||
      write.payload.assignmentForm !== 'DIRECT_VALUE' ||
      write.payload.targetName !== declaration.payload.declaredName ||
      !declaration.owner ||
      !declaration.lexicalScope ||
      write.controlContext !== 'UNCONDITIONAL' ||
      declaration.sourceFingerprint !== write.sourceFingerprint ||
      !isDeepStrictEqual(declaration.sourceRange, write.sourceRange) ||
      !isDeepStrictEqual(declaration.owner, write.owner) ||
      !isDeepStrictEqual(declaration.lexicalScope, write.lexicalScope) ||
      !index.context.sourceFiles.some(
        (f) => f.id === declaration.sourceRange.sourceFileId && f.languageHint === 'java',
      )
    )
      return unproven('FRAMEWORK_NAME_CONFLICT');
    initializer = write;
  }
  if (!d) return unproven('FRAMEWORK_NAME_CONFLICT');
  if (
    !(
      (d.kind === 'TYPED' && d.syntax.syntaxKind === 'DECLARATION') ||
      (index.context.contextVersion === 5 &&
        d.kind === 'PARAM' &&
        d.syntax.syntaxKind === 'PARAMETER_BINDING')
    ) ||
    !('declaredType' in d.syntax.payload) ||
    d.syntax.controlContext !== 'UNCONDITIONAL' ||
    !d.syntax.payload.declaredType
  )
    return unproven();
  const java = index.context.sourceFiles.some(
    (file) => file.id === d.syntax.sourceRange.sourceFileId && file.languageHint === 'java',
  );
  const declaredType = java
    ? declaredReceiverType(d.syntax.payload.declaredType)
    : d.syntax.payload.declaredType;
  if (!declaredType) return unproven();
  const proof = importProof(index, site, declaredType, false);
  if (proof.state !== 'BOUND') return proof;
  const typeImports = proof.support
    .filter((s) => s.kind === 'SYNTAX')
    .map((s) => index.context.syntaxEvidence.find((v) => v.id === s.id));
  if (
    !typeImports.some(
      (s) => s?.syntaxKind === 'IMPORT_BINDING' && s.payload.importKind === 'JAVA_TYPE',
    )
  )
    return unproven();
  const method = site.payload.callee.name.split('.').at(-1)!;
  if (!preciseCallee(index, site, proof.qualifiedName + '.' + method)) return unproven();
  return {
    ...proof,
    support: combineSupport(
      proof.support,
      [syntaxSupport(d.syntax)],
      initializer ? [syntaxSupport(initializer)] : [],
      checked.map(syntaxSupport),
    ),
  };
}
