import type { EffectiveBootstrapConfig } from './configuration.js';

export interface WorkspaceContext {
  readonly kind: 'WORKSPACE_CONTEXT_PLACEHOLDER';
  readonly workspaceRoot: string;
}

export interface WorkspaceContextFactory {
  create(config: EffectiveBootstrapConfig): Promise<WorkspaceContext>;
}

export class DefaultWorkspaceContextFactory implements WorkspaceContextFactory {
  async create(config: EffectiveBootstrapConfig): Promise<WorkspaceContext> {
    return Object.freeze({
      kind: 'WORKSPACE_CONTEXT_PLACEHOLDER',
      workspaceRoot: config.workspaceRoot,
    });
  }
}
