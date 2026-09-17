# ADR 013 Versioned Projection Framework for Wiki Customization

Status: Accepted as a backward-compatible architecture extension on 2026-09-17.

## Context

Wiki is already a projection of Canonical Knowledge, but the handoff does not define how internal teams customize structure without changing Knowledge identity or triggering semantic recompilation. Commercial Agent users need a stable standard Wiki; internal users need controlled configuration and later extensions.

## Decision

Introduce the projection-layer `WikiProfile`, `WikiSpec`, `WikiArtifact`, and `WikiArtifactRevision` contracts defined in [`docs/specs/wiki-projection.md`](../../specs/wiki-projection.md). The pipeline is `KnowledgeRevision -> ProjectionSpec -> ProjectionPlanner -> SectionModel -> Validator -> Renderer -> WikiArtifact`. Projection reads published Knowledge through KnowledgeQuery/Application API. Commercial customization is `LOCKED`; internal policies are `PROFILE_CONFIG`, `DECLARATIVE_SPEC`, and `EXTENSION` by authorization level.

WikiSpec changes and profile upgrades never invoke `update_knowledge`; existing specs pin a profile version and change only through explicit revision. Missing required Knowledge produces validation diagnostics, not LLM-generated filler. Department-specific presentation semantics remain in Projection unless independently admitted as supported Claims through the existing knowledge workflow.

## Compatibility and phase effect

No Canonical IR, Evidence/Claim/Knowledge, update policy, SQLite authority, or LLM write path changes. Phase 1 supplies the standard projection through a KnowledgeQuery/Application read boundary; if a WikiGenerator exists at integration time, a thin facade/default-profile adapter preserves it. No WikiGenerator exists in this repository today. Phase 2 adds declarative specs, inheritance, versioning, validation, and diff; Phase 3 adds section/data extensions and SDK. No Phase 0 or 0.5 task is added.

## Consequences

Wiki artifacts have independent, traceable revisions across KnowledgeRevision, ProfileVersion, WikiSpecRevision, ProjectionEngineVersion, RendererVersion, and ArtifactRevision. Projection validation can report `COMPLETE`, `PARTIAL`, `MISSING_DATA`, `STALE`, or `REVIEW_REQUIRED` without changing canonical facts. Future persistence and migration details require phase-specific review.
