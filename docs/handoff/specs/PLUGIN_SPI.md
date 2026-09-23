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

## Phase 0 executable contract

`@codeatlas/plugins` exports strict descriptor, context, detection-result, extraction-context, and semantic-candidate schemas. A descriptor declares duplicate-free languages/frameworks/capabilities, a `{ schema, version }` configuration reference, and `BUILT_IN` trust. Context contains only canonical nodes/edges, source-file metadata, JSON-safe configuration, repository/revision IDs, and bounded arrays: at most 10,000 facts total and 10,000 source files. Cross-revision inputs are rejected; validated context values are deeply frozen before plugin invocation.

`validateDetectionResult` requires support references to facts in the supplied context when `matched` is true and no support when false. Extraction requires positive evidence-backed detection. `validateSemanticFact` requires a declared semantic capability, a versioned JSON-safe payload envelope, and unique canonical support references present in the context. These outputs remain candidates; Phase 1 canonical runtime/contract schemas validate their semantic payload before application publication.

`PluginRegistrationSchema` adds a safe-integer priority. `selectPluginCandidates` rejects duplicate IDs, filters by language, framework, and all required provider capabilities, then orders by descending priority and exact plugin ID. It performs no plugin execution or authority assignment.

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

