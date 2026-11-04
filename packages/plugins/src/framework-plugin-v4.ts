import type { FrameworkContext } from './framework-bindings.js';
import { phase1Assert } from '@codeatlas/ir';
import { validatePluginV4Context, type PluginV4Context } from './plugin-context-v4.js';
import {
  validatePluginDescriptorV4,
  validatePluginV4Detection,
  validatePluginV4ExtractionContext,
  validatePluginV4Candidate,
  type FrameworkPluginV4,
  type PluginV4ExtractionContext,
} from './plugin-spi-v4.js';
import detectFrameworkDependency, { frameworkDependencyRules } from './framework-detection.js';
import { compileFrameworkBindingCandidate } from './framework-binding-candidate.js';
type Framework = keyof typeof frameworkDependencyRules;
export function createFrameworkPluginV4(framework: Framework): FrameworkPluginV4 {
  phase1Assert(Object.hasOwn(frameworkDependencyRules, framework));
  const rule = frameworkDependencyRules[framework];
  const descriptor = validatePluginDescriptorV4({
    pluginId: framework,
    pluginVersion: '1.0.0',
    languages: [rule.language],
    frameworks: [framework],
    requiredProviderCapabilities: ['SYMBOL'],
    producedSemanticCapabilities: ['RUNTIME_FACT_SET', 'FRAMEWORK_BINDING_SET'],
    configurationSchema: { schema: 'codeatlas.plugin.' + framework, version: 1 },
    trustClass: 'BUILT_IN',
    contextVersion: 4,
    syntaxSchemaVersion: 3,
  });
  return Object.freeze({
    describe: () => descriptor,
    async detect(input: PluginV4Context) {
      const c = validatePluginV4Context(input);
      return validatePluginV4Detection(c, detectBuiltInFramework(c, framework));
    },
    async *extract(input: PluginV4ExtractionContext) {
      const c = validatePluginV4ExtractionContext(input),
        { detection, maxItems, ...context } = c;
      const out = compileFrameworkBindingCandidate(context, framework, maxItems);
      for (const [capability, value] of [
        ['RUNTIME_FACT_SET', out.facts],
        ['FRAMEWORK_BINDING_SET', out.bindings],
      ] as const)
        yield validatePluginV4Candidate(
          c,
          descriptor,
          { capability, value, support: detection.support, coverage: out.coverage },
          out.facts,
        );
    },
  });
}

/** Shared import detection only, not framework operation proof. */
export function detectBuiltInFramework(c: FrameworkContext, framework: Framework) {
  const rule = frameworkDependencyRules[framework];
  const { syntaxSchemaVersion, ...legacy } = c;
  const old = detectFrameworkDependency(
    { ...legacy, contextVersion: 2, syntaxEvidence: [] },
    framework,
  );
  const syntax = c.syntaxEvidence.filter(
    (s) =>
      s.syntaxKind === 'IMPORT_BINDING' &&
      ![
        'UNKNOWN',
        'PYTHON_RELATIVE',
        'PYTHON_WILDCARD',
        'JAVA_WILDCARD',
        'JAVA_STATIC_WILDCARD',
      ].includes(s.payload.importKind) &&
      s.payload.qualifiedName &&
      rule.namespaces.some(
        (ns) => s.payload.qualifiedName === ns || s.payload.qualifiedName!.startsWith(ns + '.'),
      ) &&
      c.sourceFiles.some(
        (f) => f.id === s.sourceRange.sourceFileId && f.languageHint === rule.language,
      ),
  );
  const support = [...old.support, ...syntax.map((s) => ({ kind: 'SYNTAX' as const, id: s.id }))];
  return {
    matched: support.length > 0,
    support,
    diagnostics: old.diagnostics,
  };
}
