import path from 'node:path';

export type RuntimeMode = 'ONE_SHOT' | 'MCP_STDIO';

export interface RuntimeBootstrapRequest {
  readonly configVersion: number;
  readonly mode: RuntimeMode;
  readonly workspaceRoot: string;
}

export interface EffectiveBootstrapConfig {
  readonly configVersion: 1;
  readonly mode: RuntimeMode;
  readonly workspaceRoot: string;
}

export interface ConfigurationBootstrap {
  load(request: RuntimeBootstrapRequest): Promise<EffectiveBootstrapConfig>;
}

const supportedModes: ReadonlySet<string> = new Set(['ONE_SHOT', 'MCP_STDIO']);

export class DefaultConfigurationBootstrap implements ConfigurationBootstrap {
  async load(request: RuntimeBootstrapRequest): Promise<EffectiveBootstrapConfig> {
    if (request.configVersion !== 1) {
      throw new RangeError('UNSUPPORTED_CONFIG_VERSION: expected 1');
    }
    if (!supportedModes.has(request.mode)) {
      throw new RangeError(`UNSUPPORTED_RUNTIME_MODE: ${String(request.mode)}`);
    }
    if (request.workspaceRoot.trim().length === 0) {
      throw new TypeError('INVALID_WORKSPACE_ROOT: expected a non-empty path');
    }

    return Object.freeze({
      configVersion: 1,
      mode: request.mode,
      workspaceRoot: path.resolve(request.workspaceRoot.trim()),
    });
  }
}
