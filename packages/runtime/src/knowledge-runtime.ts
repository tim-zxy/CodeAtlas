import type { EffectiveBootstrapConfig } from './configuration.js';
import type { WorkspaceContext } from './workspace-context.js';

export class KnowledgeRuntime {
  readonly kind = 'KnowledgeRuntime' as const;

  constructor(
    readonly config: EffectiveBootstrapConfig,
    readonly workspace: WorkspaceContext,
  ) {
    Object.freeze(this);
  }
}
