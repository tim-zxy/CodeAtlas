import { DefaultConfigurationBootstrap } from './configuration.js';
import { RuntimeBuilder, type RuntimeDependencies } from './runtime-builder.js';
import { DefaultWorkspaceContextFactory } from './workspace-context.js';

export { KnowledgeRuntime } from './knowledge-runtime.js';
export * from './code-query.js';
export * from './index-command.js';
export { applyNativeFullAnalysis } from './full-analysis.js';
export { applyNativeFullBootstrap, readNativeFullBaseline } from './native-full-bootstrap.js';
export { createNativeStateValidationPort } from './native-analysis-validation.js';
export { applyNativePatchAnalysis } from './patch-analysis.js';
export type { PatchAnalysisMeasurement } from './patch-analysis.js';
export {
  NativeWorkerConfigError,
  nativeLaunchArguments,
  resolveNativeWorkerConfig,
  type EffectiveNativeIndexingConfig,
  type EffectiveNativeWorkerConfig,
  type NativeWorkerBudget,
} from './native-worker-config.js';
export { RuntimeBuilder, type RuntimeDependencies } from './runtime-builder.js';

export function createBootstrapRuntimeDependencies(): RuntimeDependencies {
  return Object.freeze({
    configurationBootstrap: new DefaultConfigurationBootstrap(),
    workspaceContextFactory: new DefaultWorkspaceContextFactory(),
  });
}

export function createBootstrapRuntimeBuilder(): RuntimeBuilder {
  return new RuntimeBuilder(createBootstrapRuntimeDependencies());
}

export {
  DefaultConfigurationBootstrap,
  type ConfigurationBootstrap,
  type EffectiveBootstrapConfig,
  type RuntimeBootstrapRequest,
  type RuntimeMode,
} from './configuration.js';
export {
  DefaultWorkspaceContextFactory,
  type WorkspaceContext,
  type WorkspaceContextFactory,
} from './workspace-context.js';

export * from './effective-config.js';

export * from './syntax-observation-profile.js';
export * from './native-syntax-admission.js';

export { inspectInstallCapabilities } from './install-capabilities.js';

export { createOwnedReadLifecycle } from './owned-read-lifecycle.js';

export { createOwnedDirectoryObserver } from './owned-directory-observer.js';
