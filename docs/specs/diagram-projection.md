# Grounded Diagram Projection

Status: backward-compatible future-phase design. This specification introduces no Phase 0.5 renderer, Canonical IR entity, database migration, or numeric Quality Gate.

## Authority and source boundary

Diagram is a derived view of deterministic engineering facts or published Knowledge, not a writer or an independent source of truth. Mermaid is the default output format when a diagram is supported. A language model may help phrase a label only after the node and relationship have been selected from authorized grounded inputs; it cannot create an unsupported component, edge, step, or ordering claim. Rendering failure or missing source data retains any last validated artifact and reports the gap.

The projection reads through authorized Application/KnowledgeQuery boundaries, never directly mutates canonical SQLite, and records exact repository/workspace revision or published KnowledgeRevision references. The standard Wiki remains governed by ADR-013 and reads published Knowledge only; a Diagram may separately project current engineering facts without silently widening the Wiki reader.

## Type-to-source mapping

| Diagram                        | Permitted grounding                                                                                                     | Required limitation                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component/service architecture | Canonical components or service identity and contracts; published architecture knowledge where semantic labels are used | Unresolved or external service links are labeled, not asserted as internal dependencies.                                                             |
| Runtime flow                   | `ExecutionGraph` and its supported `RuntimeFlow` compression                                                            | Preserve request/event/job/task and asynchronous boundaries.                                                                                         |
| Business flow                  | Published `BusinessFlow` and its support references                                                                     | No unpublished semantic steps.                                                                                                                       |
| Cross-repository sequence      | Ordered execution/RuntimeFlow evidence plus matched contract boundaries                                                 | CallGraph or dependency alone does not prove temporal order. Without sequence evidence, return unsupported/partial rather than inventing a sequence. |
| Data and event flow            | Contracts, `DataResource`, event/execution relations, and supported published knowledge                                 | Direction and producer/consumer roles require evidence.                                                                                              |
| Migration architecture         | Published Architecture/Migration KnowledgeRevisions and state-aware support                                             | Current, target, and transition states remain distinct.                                                                                              |

## Future DiagramModel and validation

A later lightweight projection-layer `DiagramModel` contains typed nodes and relationships, `supportRefs`, source/published revision references, state/freshness, resolution or ambiguity, diagram kind, projection/renderer versions, and validation diagnostics. It is not added to Canonical IR. A renderer consumes a validated model and does not perform a second data search. Stable model identity is independent of Mermaid syntax; source/version changes can invalidate a rendered artifact without changing canonical facts.

Validation checks authorization, grounding, support-reference existence, freshness, unresolved boundaries, type-specific completeness, and ordering evidence for sequences. A partial or unsupported result remains labeled and cannot be promoted to a complete diagram by stylistic rendering. Existing Projection/Evaluation infrastructure owns comparisons and provenance; no separate truth or metric engine is introduced.

## Phase allocation

Phase 0.5 records these boundaries only. Phase 1 may expose already-supported deterministic views through the Agent API but does not acquire a mandatory full DiagramModel or renderer exit gate from this amendment. Phase 2 details the model, Mermaid renderer, validation Fixtures, and artifact lifecycle using Phase 1 source/Knowledge evidence. Advanced visualization or customization is considered only after those baselines; no adaptive routing or new Phase 4 is implied.
