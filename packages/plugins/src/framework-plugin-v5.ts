import { phase1Assert } from '@codeatlas/ir';
import { frameworkDependencyRules } from './framework-detection.js';
import { detectBuiltInFramework } from './framework-plugin-v4.js';
import { validatePluginV5Context, type PluginV5Context } from './plugin-context-v5.js';
import {
  validatePluginDescriptorV5,
  validatePluginV5Detection,
  validatePluginV5ExtractionContext,
  validatePluginV5Candidate,
  type FrameworkPluginV5,
  type PluginV5ExtractionContext,
} from './plugin-spi-v5.js';
import { compileFrameworkSurfaceCandidate } from './framework-surface-compiler.js';
export function createFrameworkPluginV5(
  framework: keyof typeof frameworkDependencyRules,
): FrameworkPluginV5 {
  phase1Assert(Object.hasOwn(frameworkDependencyRules, framework));
  const rule = frameworkDependencyRules[framework],
    descriptor = validatePluginDescriptorV5({
      pluginId: framework,
      pluginVersion: '2.0.0',
      languages: [rule.language],
      frameworks: [framework],
      requiredProviderCapabilities: [
        'FRAMEWORK_SYNTAX_OBSERVATION_V1',
        rule.language === 'java' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
      ],
      producedSemanticCapabilities: ['RUNTIME_FACT_SET', 'FRAMEWORK_BINDING_SET'],
      configurationSchema: { schema: 'codeatlas.plugin.' + framework, version: 1 },
      trustClass: 'BUILT_IN',
      contextVersion: 5,
      syntaxSchemaVersion: 4,
    });
  return Object.freeze({
    describe: () => descriptor,
    async detect(input: PluginV5Context) {
      const c = validatePluginV5Context(input);
      return validatePluginV5Detection(c, detectBuiltInFramework(c, framework));
    },
    async *extract(input: PluginV5ExtractionContext) {
      const c = validatePluginV5ExtractionContext(input),
        { detection, maxItems, syntaxMembershipDigest, ...context } = c,
        out = compileFrameworkSurfaceCandidate(
          context,
          framework,
          syntaxMembershipDigest,
          maxItems,
        );
      for (const [capability, value] of [
        ['RUNTIME_FACT_SET', out.facts],
        ['FRAMEWORK_BINDING_SET', out.bindings],
      ] as const)
        yield validatePluginV5Candidate(
          c,
          descriptor,
          {
            capability,
            value,
            support: detection.support,
            coverage: out.coverage,
            sitePlan: out.sitePlan,
          },
          out.facts,
          out.bindings,
        );
    },
  });
}
