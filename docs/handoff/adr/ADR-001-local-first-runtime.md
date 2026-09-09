# ADR 001 Local First Runtime

Status: Accepted

Decision: Core indexing, graph queries, FTS search, and status run locally without a cloud service, LLM, embedding model, or daemon. Phase 1 defaults to one-shot CLI and MCP stdio; daemon/local HTTP are optional Phase 2 capabilities.

Consequences: startup reconciliation provides correctness when no watcher is alive; remote operations require explicit policy; packaging includes the runtime and native analyzer but no mandatory model.

