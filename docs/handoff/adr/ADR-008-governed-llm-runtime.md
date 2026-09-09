# ADR 008 Governed LLM Runtime

Status: Accepted

Decision: Knowledge workflows invoke versioned SemanticTasks through an LLM runtime with bounded context, access filtering, prompt registry, model policy, structured output, validation, retry/budget controls, and provenance. LLM work occurs outside database transactions and never mutates canonical knowledge directly.

Consequences: invalid output is rejected; prompt/model changes affect compilation currency; raw payloads and hidden reasoning are not stored by default.

