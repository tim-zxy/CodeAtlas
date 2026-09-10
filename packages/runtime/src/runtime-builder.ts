import type { ConfigurationBootstrap, RuntimeBootstrapRequest } from './configuration.js';
import { KnowledgeRuntime } from './knowledge-runtime.js';
import type { WorkspaceContextFactory } from './workspace-context.js';

export interface RuntimeDependencies {
  readonly configurationBootstrap: ConfigurationBootstrap;
  readonly workspaceContextFactory: WorkspaceContextFactory;
}

export class RuntimeBuilder {
  constructor(private readonly dependencies: RuntimeDependencies) {}

  async build(request: RuntimeBootstrapRequest): Promise<KnowledgeRuntime> {
    const config = await this.dependencies.configurationBootstrap.load(request);
    const workspace = await this.dependencies.workspaceContextFactory.create(config);
    return new KnowledgeRuntime(config, workspace);
  }
}
