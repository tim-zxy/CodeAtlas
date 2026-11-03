import { IrValidationError } from '@codeatlas/ir';
import {
  validatePluginV2Context,
  validatePluginV2Detection,
  type PluginV2Detection,
} from './plugin-spi-v2.js';

export const frameworkDependencyRules = {
  spring: { language: 'java', namespaces: ['org.springframework'] },
  mongo: { language: 'java', namespaces: ['com.mongodb', 'org.springframework.data.mongodb'] },
  kafka: { language: 'java', namespaces: ['org.apache.kafka', 'org.springframework.kafka'] },
  fastapi: { language: 'python', namespaces: ['fastapi'] },
} as const;
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Detects declared imports only; it does not bind framework usage or publish facts. */
export default function detectFrameworkDependency(
  input: unknown,
  framework: keyof typeof frameworkDependencyRules,
): PluginV2Detection {
  if (!Object.hasOwn(frameworkDependencyRules, framework)) {
    throw new IrValidationError([{ path: [], message: 'Invalid framework selector' }]);
  }
  const context = validatePluginV2Context(input);
  const rule = frameworkDependencyRules[framework];
  const files = new Map(context.sourceFiles.map((file) => [file.id, file]));
  const nodes = new Map(context.nodes.map((node) => [node.id, node]));
  const imports = [];
  const diagnostics = new Map<string, PluginV2Detection['diagnostics'][number]>();
  for (const edge of context.edges) {
    const range = edge.sourceRange;
    if (edge.kind !== 'IMPORT' || range === null) continue;
    const file = files.get(range.sourceFileId);
    if (file?.languageHint !== rule.language) continue;
    const target = edge.target;
    const name =
      target.state === 'RESOLVED'
        ? nodes.get(target.target.id)?.qualifiedName
        : target.originalHint;
    if (!name || !rule.namespaces.some((ns) => name === ns || name.startsWith(ns + '.'))) continue;
    const identifier =
      rule.language === 'java'
        ? /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u
        : /^[\p{ID_Start}_][\p{ID_Continue}]*$/u;
    const verified =
      name.split('.').every((segment) => identifier.test(segment)) &&
      (target.state === 'RESOLVED'
        ? target.resolution === 'EXACT'
        : target.resolution === 'UNRESOLVED' && target.candidates.length === 0);
    if (verified) {
      imports.push(edge);
    } else {
      const diagnostic = {
        code: 'FRAMEWORK_IMPORT_UNVERIFIED',
        severity: 'WARNING' as const,
        message: 'Framework import is not verified',
        sourceRange: range,
      };
      diagnostics.set(
        JSON.stringify([
          file.path,
          range.startLine,
          range.startColumn,
          range.endLine,
          range.endColumn,
          diagnostic.code,
        ]),
        diagnostic,
      );
    }
  }
  imports.sort((a, b) => compare(a.factKey, b.factKey) || compare(a.id, b.id));
  const orderedDiagnostics = [...diagnostics.values()].sort((a, b) => {
    const x = a.sourceRange!,
      y = b.sourceRange!;
    return (
      compare(files.get(x.sourceFileId)!.path, files.get(y.sourceFileId)!.path) ||
      x.startLine - y.startLine ||
      x.startColumn - y.startColumn ||
      x.endLine - y.endLine ||
      x.endColumn - y.endColumn ||
      compare(a.code, b.code)
    );
  });
  return validatePluginV2Detection(context, {
    matched: imports.length > 0,
    support: imports.map((edge) => ({
      kind: 'CANONICAL',
      ref: { factType: 'EDGE', id: edge.id },
    })),
    diagnostics: orderedDiagnostics,
  });
}
