# ADR 005 Flow Hierarchy and Naming

Status: Accepted

Decision: Use `ExecutionGraph -> RuntimeFlow -> BusinessFlow`. `ExecutionGraph` is detailed automatic runtime fact; `RuntimeFlow` is deterministic technical compression; `BusinessFlow` is grounded semantic knowledge. The earlier alternative name is retired and must not appear as an active model.

Consequences: APIs state trace kind; code-level trace cannot claim business semantics; each derived step retains support references.

