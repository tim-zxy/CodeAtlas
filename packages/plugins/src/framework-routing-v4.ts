import { parseIr } from '@codeatlas/ir';
import { PluginRouteRequestSchema, type PluginRouteRequest } from './plugin-routing.js';
import { type FrameworkPluginV4 } from './plugin-spi-v4.js';
import { createSpringPluginV4 } from './spring.js';
import { createMongoPluginV4 } from './mongo.js';
import { createKafkaPluginV4 } from './kafka.js';
import { createFastApiPluginV4 } from './fastapi.js';
/** Explicit V4 route; the original strict V1 registration/selector remains unchanged. */
export function selectFrameworkPluginsV4(input: PluginRouteRequest): readonly FrameworkPluginV4[] {
  const request = parseIr(PluginRouteRequestSchema, input);
  return [
    createSpringPluginV4(),
    createMongoPluginV4(),
    createKafkaPluginV4(),
    createFastApiPluginV4(),
  ].filter((plugin) => {
    const d = plugin.describe();
    return (
      d.languages.includes(request.languageId) &&
      d.frameworks.includes(request.frameworkId) &&
      d.requiredProviderCapabilities.every((c) => request.providerCapabilities.includes(c))
    );
  });
}
