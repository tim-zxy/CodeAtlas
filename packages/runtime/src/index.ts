import { DefaultConfigurationBootstrap } from './configuration.js';
import { RuntimeBuilder, type RuntimeDependencies } from './runtime-builder.js';
import { DefaultWorkspaceContextFactory } from './workspace-context.js';

export { KnowledgeRuntime } from './knowledge-runtime.js';
export { applyNativeFullAnalysis } from './full-analysis.js';
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
