import { parseIr } from '@codeatlas/ir';
import { PluginRouteRequestSchema, type PluginRouteRequest } from './plugin-routing.js';
import { createFrameworkPluginV5 } from './framework-plugin-v5.js';
import type { FrameworkPluginV5 } from './plugin-spi-v5.js';
/** Explicit private V5 route; old selectors never upgrade themselves. */
export function selectFrameworkPluginsV5(input: PluginRouteRequest): readonly FrameworkPluginV5[] {
  const r = parseIr(PluginRouteRequestSchema, input);
  return (['spring', 'mongo', 'kafka', 'fastapi'] as const)
    .map(createFrameworkPluginV5)
    .filter((p) => {
      const d = p.describe();
      return (
        d.languages.includes(r.languageId) &&
        d.frameworks.includes(r.frameworkId) &&
        d.requiredProviderCapabilities.every((c) => r.providerCapabilities.includes(c))
      );
    });
}
