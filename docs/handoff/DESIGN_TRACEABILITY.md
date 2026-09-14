# Design Traceability

| Requirement or decision | Authority | Specification | Acceptance | Initial tasks |
|---|---|---|---|---|
| Local-first, model-free core | Product Vision; ADR-001 | Runtime and Configuration; Security | P0/P1 runtime and security gates | P0-W0-003, P05-W8-001 |
| Provider-independent Canonical IR | Architecture; ADR-002 | Canonical IR; Provider SPI | P0 schema and P0.5 normalization gates | P0-W1-001..004, P05-W4-001 |
| SQLite authoritative, vector derived | ADR-003 | SQLite Schema; Evaluation | Migration gates; Phase 2 vector rebuild gate | P0-W1-005..007 |
| Automatic facts, manual knowledge | ADR-004 | Knowledge Workflow; Runtime | Phase 1 lifecycle gates | Phase 1 planning package |
| ExecutionGraph to RuntimeFlow to BusinessFlow | Architecture; ADR-005 | Canonical IR; Knowledge Workflow | Phase 1 flow/grounding gates | Phase 1 execution tasks |
| Evidence, claims, candidates, knowledge separated | ADR-006 | Canonical IR; Knowledge Workflow | P0 evidence and Phase 1 publication gates | P0-W1-004; Phase 1 knowledge tasks |
| Stable knowledge identity and conservative reconciliation | ADR-007 | Reconciliation | Phase 1 rename/revision gates | Phase 1 reconciliation tasks |
| LLM candidate only, structured output first | ADR-008 | Knowledge Workflow; Security | Phase 1 schema/grounding/security gates | Phase 1 LLM tasks |
| No automatic remote fallback | ADR-009 | Security; Runtime | Phase 1 local-only/security fixtures | Phase 1 security tasks |
| Rust analyzer streams JSONL and owns no DB | ADR-010 | Native IPC; Module Boundaries | P0 handshake/protocol and P0.5 activation gates | P0-W3-001..004 |
| Separate repo/workspace databases | ADR-011 | SQLite Schema; Module Boundaries | Migration isolation gate | P0-W1-006..007 |
| Evaluation is a first-class gate | ADR-012 | Evaluation | Every phase acceptance section | P0-W9-001..003, P05-W9-001 |
| Framework semantics below canonical layer | Architecture | Plugin SPI; Canonical IR | Phase 1 plugin fixtures | Phase 1 framework tasks |
| Cross-repo through contracts and service identity | Architecture | Provider SPI; Agent API | Phase 1 boundary and trace gates | Phase 1 crossrepo tasks |
| Freshness separate from compilation currency | Knowledge Workflow | Agent API; Reconciliation | Phase 1 status gate | Phase 1 lifecycle tasks |
| FTS5 required, embedding optional | Product Vision | SQLite Schema; Runtime | Phase 1 no-embedding gate | Phase 1 search tasks |
| No Phase 4 | Roadmap; Design Authority | None | Roadmap consistency check | Governance only |

Every future task must add or update a row when it introduces a public capability, schema, phase gate, or architectural decision.

## Phase 0 task fixture acceptance map

| Task | Required Fixture or check | Acceptance gate | Governing spec |
|---|---|---|---|
| P0-W0-001 | workspace build and TypeScript/Rust CI smoke | Monorepo packages and crate build/test | Module Boundaries |
| P0-W0-002 | injected forbidden-import and cycle cases | Dependency guardrails reject forbidden edges | Module Boundaries |
| P0-W0-003 | CLI/MCP shared runtime-construction smoke | Same KnowledgeRuntime without inversion | Runtime and Configuration |
| P0-W1-001 | `p0-common-ir-v1` valid/invalid round-trip fixtures, including negative-zero boundaries; Common IR regressions for cycles, payload transformations, explicit undefined revisions, and bounded typed errors | Canonical primitives and envelopes round-trip | Canonical IR |
| P0-W1-002 | COMMIT/WORKTREE/SNAPSHOT identity cases | Mutable and immutable revision semantics differ | Canonical IR |
| P0-W1-003 | resolved, ambiguous, and unresolved graph facts | Provider/canonical identity remains separate | Canonical IR |
| P0-W1-004 | multi-provider evidence lifecycle | One canonical fact retains independent supports | Canonical IR; SQLite Schema |
| P0-W1-005 | migration-empty, upgrade, failure, too-new | Sequential, rollback, rerun, lock, checksum gates | SQLite Schema |
| P0-W1-006 | fresh and sequential repository DB migration | R001-R007 and critical indexes exist | SQLite Schema |
| P0-W1-007 | fresh and sequential workspace DB migration | W001-W003; frozen RevisionSet immutable | SQLite Schema |
| P0-W3-001 | request/event schema validation | IPC v1 contract frozen | Native IPC |
| P0-W3-002 | shared valid/invalid protocol byte fixtures | TypeScript and Rust consume identical fixtures | Native IPC |
| P0-W3-003 | describe-v1 and incompatible versions | Rust/TypeScript handshake and rejection | Native IPC; Provider SPI |
| P0-W3-004 | malformed/out-of-order/oversize/timeout/cancel | Corruption never partially applies state | Native IPC; Security |
| P0-W4-001 | fake provider/plugin contract suite | Descriptors, capabilities, analysis contracts | Provider SPI; Plugin SPI |
| P0-W9-001 | valid and invalid fixture manifests | Registry discovery/schema/version behavior | Evaluation |
| P0-W9-002 | missing/extra/semantic/resolution diffs | Stable canonical comparator classifications | Evaluation |
| P0-W9-003 | metric golden cases and eval CLI | Precision/recall/critical-fact calculation | Evaluation |

## Phase 0.5 task fixture acceptance map

| Task | Required Fixture or check | Acceptance gate | Governing spec |
|---|---|---|---|
| P05-W2-001 | basic-java-repo, gitignore, generated-vendor | Correct discovery, inclusion, exclusion, classification | Runtime and Configuration; Canonical IR |
| P05-W2-002 | restart and worktree fingerprint cases | Stable change set and startup reconciliation | Canonical IR; Runtime and Configuration |
| P05-W3-001 | java-basic-symbol, java-nested-types | Critical Symbol Recall at least 95 percent | Provider SPI; Native IPC; Evaluation |
| P05-W3-002 | java-call-basic, overload, inheritance, unresolved-call | Call precision at least 95 and recall at least 90 percent | Canonical IR; Evaluation |
| P05-W3-003 | partial/unsupported coverage fixtures | Coverage and resolution warnings are visible | Provider SPI; Agent API |
| P05-W4-001 | canonical normalization golden files | Language-neutral keys and unresolved preservation | Canonical IR; Provider SPI |
| P05-W4-002 | two-provider-same-call | Support removal obeys canonical fact lifetime | Provider SPI; SQLite Schema |
| P05-W1-010 | full-analysis failure injection | Previous active graph remains available | SQLite Schema; Native IPC |
| P05-W1-011 | patch add/remove and stale-binding cases | Atomic patch and zero stale provider bindings | SQLite Schema |
| P05-W2-010 | added/modified/deleted/rename-as-add-delete | Deterministic change detection across restart | Runtime and Configuration |
| P05-W3-020 | modify-call-target, delete/add method/class, change-import | Declared incremental correctness equals 100 percent | Native IPC; Evaluation |
| P05-W5-001 | bounded graph-query and traversal cases | Confidence, coverage, freshness, and refs returned | Agent API |
| P05-W8-001 | index/understand/trace CLI E2E | Code trace is available and correctly labeled | Agent API; Runtime and Configuration |
| P05-W9-001 | complete Phase 0.5 suite | All quantitative Phase 0.5 gates pass | Evaluation; Phase Acceptance |

The task ID, Fixture ID, governing spec, and acceptance gate must all appear in the completion record in `CURRENT_STATUS.md`. This table is the canonical cross-document trace for Phase 0 and Phase 0.5.
