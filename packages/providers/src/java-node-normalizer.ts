import {
  CanonicalNodeSchema,
  ProviderNodeSchema,
  type CanonicalNode,
  type ProviderNode,
  type SourceFile,
  type SourceRange,
} from '@codeatlas/ir';

import {
  CanonicalIdentityEncodingError,
  canonicalFactId,
  nodeFactKey,
} from './canonical-fact-identity.js';

export type CanonicalNormalizationErrorCode =
  'UNSUPPORTED_KIND' | 'INVALID_FACT' | 'INVALID_CONTEXT' | 'MISSING_REFERENCE';

export interface SourceFileLookup {
  get(id: string): SourceFile | null | undefined;
  getByPath?(path: string): SourceFile | null | undefined;
  values?(): IterableIterator<SourceFile>;
}

export class CanonicalNormalizationError extends Error {
  constructor(
    readonly code: CanonicalNormalizationErrorCode,
    readonly path: readonly (string | number)[],
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalNormalizationError';
  }
}

function fail(
  code: CanonicalNormalizationErrorCode,
  path: readonly (string | number)[],
  message: string,
): never {
  throw new CanonicalNormalizationError(code, path, message);
}

function sourceFileFor(
  node: ProviderNode,
  range: SourceRange,
  sourceFiles: SourceFileLookup,
): SourceFile {
  const file = sourceFiles.get(range.sourceFileId);
  if (!file) {
    fail('MISSING_REFERENCE', ['sourceRange', 'sourceFileId'], 'Source file is absent');
  }
  if (file.repositoryId !== node.repositoryId || file.revisionId !== node.revisionId) {
    fail('INVALID_CONTEXT', ['sourceRange', 'sourceFileId'], 'Source file context differs');
  }
  return file;
}

export function normalizeJavaNode(
  input: ProviderNode,
  sourceFiles: SourceFileLookup,
): CanonicalNode {
  const parsed = ProviderNodeSchema.safeParse(input);
  if (!parsed.success) {
    fail(
      'INVALID_FACT',
      parsed.error.issues[0]?.path.map(String) ?? [],
      'Provider node is invalid',
    );
  }
  const node = parsed.data;
  const name = node.name;
  const qualifiedName = node.qualifiedName;
  if (qualifiedName === null) {
    fail('INVALID_FACT', ['qualifiedName'], 'Qualified name is required');
  }

  const base = {
    repositoryId: node.repositoryId,
    revisionId: node.revisionId,
    name,
    qualifiedName,
    sourceRange: node.sourceRange,
    confidence: node.confidence,
  };
  let canonical: Record<string, unknown>;
  let fields: (string | number)[];
  let fieldPaths: (string | number)[][];

  switch (node.providerKind) {
    case 'java.package':
    case 'java.package_container': {
      if (node.providerKind === 'java.package' && node.sourceRange === null) {
        fail('INVALID_FACT', ['sourceRange'], 'Package declaration requires a source range');
      }
      if (node.providerKind === 'java.package_container' && node.sourceRange !== null) {
        fail('INVALID_FACT', ['sourceRange'], 'Synthetic package container cannot have a range');
      }
      if (node.sourceRange !== null) sourceFileFor(node, node.sourceRange, sourceFiles);
      canonical = { ...base, kind: 'PACKAGE' };
      fields = [node.repositoryId, node.revisionId, 'PACKAGE', qualifiedName];
      fieldPaths = [['repositoryId'], ['revisionId'], ['providerKind'], ['qualifiedName']];
      break;
    }
    case 'java.compilation_unit': {
      if (node.sourceRange !== null || String(name) !== String(qualifiedName)) {
        fail('INVALID_FACT', ['sourceRange'], 'Compilation unit must be path-only');
      }
      const file =
        sourceFiles.getByPath?.(String(qualifiedName)) ??
        (sourceFiles.values === undefined
          ? undefined
          : [...sourceFiles.values()].find(
              (candidate) => String(candidate.path) === String(qualifiedName),
            ));
      if (!file) fail('MISSING_REFERENCE', ['qualifiedName'], 'Compilation unit path is absent');
      if (file.repositoryId !== node.repositoryId || file.revisionId !== node.revisionId) {
        fail('INVALID_CONTEXT', ['qualifiedName'], 'Compilation unit source context differs');
      }
      canonical = { ...base, kind: 'MODULE', sourceRange: null };
      fields = [node.repositoryId, node.revisionId, 'MODULE', file.path];
      fieldPaths = [['repositoryId'], ['revisionId'], ['providerKind'], ['qualifiedName']];
      break;
    }
    case 'java.class':
    case 'java.interface':
    case 'java.method':
    case 'java.constructor':
    case 'java.field': {
      const range = node.sourceRange;
      if (range === null) {
        fail('INVALID_FACT', ['sourceRange'], 'Source-backed declaration requires a range');
      }
      sourceFileFor(node, range, sourceFiles);
      const typeKind = node.providerKind === 'java.class' ? 'CLASS' : 'INTERFACE';
      const symbolKind =
        node.providerKind === 'java.method'
          ? 'METHOD'
          : node.providerKind === 'java.constructor'
            ? 'CONSTRUCTOR'
            : 'FIELD';
      const isType = node.providerKind === 'java.class' || node.providerKind === 'java.interface';
      canonical = isType
        ? { ...base, kind: 'TYPE', typeKind }
        : { ...base, kind: 'SYMBOL', symbolKind };
      fields = [
        node.repositoryId,
        node.revisionId,
        isType ? 'TYPE' : 'SYMBOL',
        isType ? typeKind : symbolKind,
        qualifiedName,
        range.sourceFileId,
        range.startLine,
        range.startColumn,
        range.endLine,
        range.endColumn,
      ];
      fieldPaths = [
        ['repositoryId'],
        ['revisionId'],
        ['providerKind'],
        ['providerKind'],
        ['qualifiedName'],
        ['sourceRange', 'sourceFileId'],
        ['sourceRange', 'startLine'],
        ['sourceRange', 'startColumn'],
        ['sourceRange', 'endLine'],
        ['sourceRange', 'endColumn'],
      ];
      break;
    }
    default:
      fail('UNSUPPORTED_KIND', ['providerKind'], 'Provider node kind is unsupported');
  }

  let factKey;
  try {
    factKey = nodeFactKey(fields);
  } catch (error) {
    if (error instanceof CanonicalIdentityEncodingError) {
      fail('INVALID_FACT', fieldPaths[error.fieldIndex] ?? [], error.message);
    }
    throw error;
  }
  return CanonicalNodeSchema.parse({ ...canonical, factKey, id: canonicalFactId('NODE', factKey) });
}
