# Versioned Wiki Projection Framework

Status: backward-compatible architecture extension. Authority: [ADR-013](../handoff/adr/ADR-013-versioned-wiki-projection.md). Applies alongside the Engineering Handoff Pack; it does not change Canonical IR, Knowledge identity, or the Evidence -> Claim -> Knowledge chain.

## Boundary and audience policy

Wiki is a materialized, human-readable projection of published Canonical Knowledge. It is not a source of truth and cannot write KnowledgeItems or KnowledgeRevisions. The projection reads published knowledge through `KnowledgeQuery` or an Application API, never through direct SQLite access. Its output is a separate `WikiArtifact` with independent revisions.

For commercial Agent use, the platform exposes only its standard Wiki. `CustomizationPolicy = LOCKED`: callers may select permitted scope and output format but cannot change sections, data sources, validation rules, or extensions. An internally controlled platform profile upgrade is not customer customization and must still preserve artifact provenance.

For internal use, customization is explicitly authorized by policy:

| Policy             | Allowed change                                                                      | Boundary                                                      |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `PROFILE_CONFIG`   | Select/version a platform profile and configure declared options                    | No arbitrary query or executable code                         |
| `DECLARATIVE_SPEC` | Define ordered sections, selectors, presentation rules, and validation requirements | Only allowlisted KnowledgeQuery operations and renderers      |
| `EXTENSION`        | Register custom section providers and data adapters                                 | Trusted extension SDK, permission checks, no canonical writes |

The policy is evaluated before planning. A spec requiring a higher policy level is rejected rather than partially applied. Department-specific labels, ordering, terminology, and report semantics remain in Projection by default. If a department asserts a reusable factual claim, that claim enters the normal Evidence/Claim/Knowledge workflow with evidence and review; projection configuration cannot silently promote it to Canonical Knowledge.

## Types and identity

```ts
type CustomizationPolicy = 'LOCKED' | 'PROFILE_CONFIG' | 'DECLARATIVE_SPEC' | 'EXTENSION';

interface WikiProfile {
  profileId: string;
  profileVersion: string;
  parentProfileRef?: { profileId: string; profileVersion: string };
  allowedPolicy: CustomizationPolicy;
  defaultSpecRef: { specId: string; revisionId: string };
  parameterSchemaVersion: number;
  rendererId: string;
  validationPolicyId: string;
}

interface WikiSpec {
  specId: string;
  specRevisionId: string;
  pinnedProfileRef: { profileId: string; profileVersion: string };
  scope: { workspaceId: string; repositoryIds?: string[] };
  sections: Array<{
    sectionId: string;
    kind: string;
    selector: string;
    required: boolean;
    presentation: Record<string, unknown>;
  }>;
  options: Record<string, unknown>;
}

interface WikiArtifact {
  artifactId: string;
  specId: string;
  audience: string;
  currentRevisionId?: string;
}

interface WikiArtifactRevision {
  artifactRevisionId: string;
  artifactId: string;
  knowledgeRevisionRefs: string[];
  profileVersion: string;
  wikiSpecRevisionId: string;
  projectionEngineVersion: string;
  rendererVersion: string;
  validationStatus: WikiValidationStatus;
  validationDiagnostics: Array<{ code: string; sectionId?: string; supportRefs: string[] }>;
  contentFingerprint: string;
  createdAt: string;
}
```

The types above are projection-layer contracts, not additions to Canonical IR. `WikiArtifact` has stable identity for a spec/scope/audience; each materialization creates an immutable `WikiArtifactRevision` only when effective content or its input-version tuple changes. The new artifact revision ID is assigned after that decision, so it is not a self-triggering input. Existing revisions remain addressable. Profile inheritance in Phase 2 resolves to a concrete pinned version before planning; cycles and unknown versions fail validation.

## Projection pipeline

```text
KnowledgeRevision -> ProjectionSpec -> ProjectionPlanner
  -> SectionModel -> Validator -> Renderer -> WikiArtifact
```

`ProjectionSpec` is the effective, validated plan input produced from `WikiProfile` plus `WikiSpec` and policy. `ProjectionPlanner` requests bounded published KnowledgeRevisions through KnowledgeQuery/Application API, preserving revision and support references. `SectionModel` is structured presentation data, not new knowledge. `Validator` checks required sections, references, freshness, permissions, grounding, and renderer constraints before `Renderer` produces an artifact revision. The renderer cannot query storage or invoke an LLM to invent missing material.

The projection process is copy-on-write: validation or rendering failure retains the prior artifact revision. It may publish a marked partial artifact only when the caller's policy explicitly permits partial output; it never labels missing content complete.

## Lifecycle and version semantics

Changing a `WikiSpec` triggers only projection invalidation and an explicit wiki reprojection command. It must not call or enqueue `update_knowledge`. Knowledge changes can mark affected artifacts `STALE`, but semantic compilation and wiki publication retain the existing MANUAL policy. A profile upgrade never rewrites an existing WikiSpec or changes its pinned version automatically. Adoption requires an explicit spec revision or new spec. Version pinning is mandatory for every materialized artifact.

A Wiki version records the `KnowledgeRevision` reference set, `ProfileVersion`, `WikiSpecRevision`, `ProjectionEngineVersion`, `RendererVersion`, and resulting `ArtifactRevision`. The first five dimensions plus effective content determine whether to issue the sixth. All six dimensions appear in provenance and diff reports. A renderer-only change can produce a new artifact revision without a KnowledgeRevision change; a spec-only change must not produce a KnowledgeRevision.

## Validation

```ts
type WikiValidationStatus = 'COMPLETE' | 'PARTIAL' | 'MISSING_DATA' | 'STALE' | 'REVIEW_REQUIRED';
```

- `COMPLETE`: all required sections and references satisfy the pinned spec at the selected knowledge revisions.
- `PARTIAL`: optional content is absent or an explicitly permitted subset rendered; gaps are listed.
- `MISSING_DATA`: required Canonical Knowledge is absent. The planner reports exact selectors and missing entities; no LLM hallucination or inferred filler is allowed.
- `STALE`: selected KnowledgeRevision or source freshness no longer meets the spec's freshness policy. Existing artifact remains readable with a warning.
- `REVIEW_REQUIRED`: policy, conflicting knowledge, high-risk change, or extension result needs human review before publication.

Validation status is distinct from Knowledge SourceFreshness and CompilationCurrency. `MISSING_DATA` may suggest a separate authorized knowledge update, but projection itself never initiates one. Tests must cover status precedence, missing required data, stale sources, locked-policy rejection, pin stability, spec-only diff, and renderer-only diff.

## Phase allocation and compatibility

- Phase 1: provide the standard platform Wiki through KnowledgeQuery/Application API with minimal locked-policy, required-data, and provenance checks. Retain an existing `WikiGenerator` if one exists at integration time and add only a thin `ProjectionFacade` / `DefaultWikiProfileAdapter` around its current output. No WikiGenerator implementation exists in this repository today, so this is future integration work, not an immediate refactor. The platform default may pin its own version; user-authored declarative specs and inheritance are not required.
- Phase 2: implement Declarative WikiSpec, profile inheritance, explicit version pinning, validation, and semantic/presentation diff. Add separate artifact persistence only when the Phase 2 physical design is approved; no Phase 0/0.5 migration is implied.
- Phase 3: add Custom Section Provider, Custom Data Adapter, and Extension SDK under security and capability controls.

The standard locked profile remains available in every phase. Customization never changes Product Vision, Canonical IR, or the manual knowledge publication rule.
