# Framework Plugin SPI

## Responsibility

Plugins translate canonical language facts and framework artifacts into canonical runtime and contract semantics. Plugins do not parse source independently when facts are already available, write databases directly, or expose framework-specific types above the canonical layer.

```ts
interface FrameworkPlugin {
  describe(): PluginDescriptor;
  detect(input: DetectionContext): Promise<DetectionResult>;
  extract(input: SemanticExtractionContext): AsyncIterable<SemanticFact>;
}
```

Descriptors declare plugin/version, supported languages/frameworks, required provider capabilities, produced semantic capabilities, configuration schema, and trust class. Detection is side-effect free and evidence-backed.

## Initial mappings

- Spring: routes, entry points, scheduled jobs, dependency bindings, Feign/HTTP consumer contracts.
- Mongo: data resources, reads/writes, and data-change triggers.
- Kafka: producers, consumers, topics, message contracts, and event execution boundaries.
- FastAPI: routes, router prefixes, dependencies, and provider contracts.

All outputs reference input facts/artifacts. Unknown dynamic framework behavior remains partial/unresolved and contributes to coverage.

## Execution and security

Phase 1 ships trusted built-in plugins only. Plugins receive a bounded immutable context and typed configuration. They have no raw environment, shell, network, or arbitrary filesystem authority through the SPI. Third-party sandboxing is deferred to Phase 3.

## Tests

Each plugin provides detection-positive/negative, extraction, composition, ambiguity, coverage, and incremental invalidation fixtures. Cross-plugin composition must preserve execution contexts rather than flatten HTTP, event, task, and data-change boundaries.

