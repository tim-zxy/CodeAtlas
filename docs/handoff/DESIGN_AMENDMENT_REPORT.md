# Design Amendment Report — Wiki Projection and Native Analyzer Scalability

Date: 2026-09-17. Type: backward-compatible design extension, not an implementation completion record. Source: the user-supplied `Engineering-Handoff-Pack-2026-09-17.zip` and its extracted `docs/specs/` and `outputs/Engineering-Handoff-Pack/` files. The source pack was compared section by section; it was not extracted over `docs/handoff/`.

## Added design and authority

- [ADR-013](adr/ADR-013-versioned-wiki-projection.md) and [Wiki Projection](../specs/wiki-projection.md) define a policy-checked, versioned projection of published Knowledge through KnowledgeQuery/Application API. Commercial customization is `LOCKED`; internal profile, declarative, and extension policies are phase-gated. Missing Knowledge is diagnosed, not invented. A projection-only change never invokes semantic `update_knowledge`.
- [ADR-014](adr/ADR-014-multilanguage-native-analyzer.md) and [Native Analyzer Scalability](../specs/native-analyzer-scalability.md) define a future language-neutral NativeProvider with an internal `LanguageAnalyzer` boundary, Plugin-owned framework meaning, changed-file refresh, bounded parsing, protocol-only JSONL stdout, validated staging, TypeScript-owned batched SQLite activation, and measured benchmark scenarios. Java remains first; capability maturity requires Fixture/Evaluation evidence.

These additions do not alter Product Vision, provider-independent Canonical IR, Evidence -> Claim -> Knowledge, stable Knowledge identity, SQLite authority with rebuildable derived indexes, LLM candidate-only behavior, AUTO facts/MANUAL semantic publication, or `ExecutionGraph -> RuntimeFlow -> BusinessFlow`. No Phase 4 or Phase 0/0.5 task ID or numeric quality threshold was added.

## Source-to-repository conflict resolution

| Source-pack statement or issue | Repository evidence | Merge resolution |
|---|---|---|
| Source `CURRENT_STATUS.md` says implementation repository is unbootstrapped and Phase 0 is 0 percent. | Local `main` at `d08271f4c85ce3362404bfe7789ed2d0a6048b16` includes P0-W1-004 and detailed historical evidence in `CURRENT_STATUS.md`. | Never replace the status file. Append only the amendment and fresh checks; retain prior implementation records and task ordering. |
| Source `DESIGN_TRACEABILITY.md` has generic P0-W1-001..004 rows. | This repository names executable Fixture indexes, children, tests, and governing ADRs for those tasks. | Preserve those rows verbatim; add ADR-013/014 requirement rows and extend only relevant future P0/P05 mappings. |
| Imported ADR links use a path relative to the source-pack root. | ADRs now live under `docs/handoff/adr/`, while new specs live under `docs/specs/`. | Correct links to `../../specs/` from ADRs and use repository-relative Markdown links elsewhere. |
| Source says grammar/analyzer/compatibility metadata can enter ProviderSnapshot metadata/extensions. | `packages/ir/src/provider-snapshot.ts:54-68` exports a strict v1 schema with no extension field. | Keep v1 untouched. Versioned provider-side descriptor/negotiated IPC metadata is design-only; any persisted snapshot extension requires a separate compatible schema/version and storage decision. |
| Source assumes an existing WikiGenerator or Java analyzer may need a narrow adapter. | `packages/knowledge/src/index.ts:1`, `packages/providers/src/index.ts:1`, and `crates/native-analyzer/src/main.rs:3-15` show only shells. | Treat adapters as future integration constraints, not current refactoring or a present defect. |

## Current-code compatibility audit

Read-only audit of the local implementation at `d08271f4c85ce3362404bfe7789ed2d0a6048b16`. `FUTURE_PHASE` means the production capability is **未实现** at this checkpoint, not defective. `NO_CHANGE` means observed current behavior needs no code adjustment; it is not proof of an unimplemented future protocol. No `COMPATIBILITY_ADJUSTMENT` is justified by current code.

| Requested boundary | Disposition | File evidence and reason |
|---|---|---|
| WikiGenerator reads through KnowledgeQuery/Application API rather than SQLite | `FUTURE_PHASE` | `packages/knowledge/src/index.ts:1` and `packages/application/src/index.ts:1` are empty shells; WikiGenerator and KnowledgeQuery are **未实现**. Phase 1 must enforce the read port; no direct-DB code exists to change. |
| Wiki section/order/presentation structure stays out of the Knowledge Model | `FUTURE_PHASE` | `packages/knowledge/src/index.ts:1` has no Knowledge Model or Wiki structure; both are **未实现**. `docs/handoff/specs/CANONICAL_IR.md` defines Knowledge as structured factual revisions, while the new Wiki spec owns presentation. |
| NativeProvider contains a language-specific `LanguageAnalyzer` boundary | `FUTURE_PHASE` | `packages/providers/src/index.ts:1` is empty and `crates/native-analyzer/src/main.rs:3-15` is a smoke shell; NativeProvider, Java parser, and LanguageAnalyzer are **未实现**. The boundary belongs to P05-W3-001, not this design-only change. |
| Framework meaning belongs to Plugins, not a language parser | `FUTURE_PHASE` | `packages/plugins/src/index.ts:1` is empty and the Rust shell has no parser; Spring/FastAPI interpretation is **未实现**. `specs/PLUGIN_SPI.md` remains the future owner. |
| SQLite applies staged analysis in batches rather than per fact | `FUTURE_PHASE` | `packages/storage/src/index.ts:1` is empty; analysis persistence and transactions are **未实现**. P05-W1-010 and `specs/SQLITE_SCHEMA.md` already require atomic activation; no per-node transaction exists to repair. |
| File-level incremental path avoids default whole-repository reparse | `FUTURE_PHASE` | `packages/source/src/index.ts:1` and `crates/native-analyzer/src/main.rs:3-15` contain no scanner, parser, or REFRESH; the path is **未实现**. P05-W2-010/P05-W3-020 remain its owners. |
| JSONL stdout is protocol-only; logs use stderr | `NO_CHANGE` | The current Rust smoke shell writes diagnostics with `eprintln!` in `crates/native-analyzer/src/main.rs:8-14`; `crates/native-analyzer/tests/smoke.rs:3-26` asserts empty stdout in both tested modes and exact stderr. JSONL DESCRIBE/ANALYZE/REFRESH are **未实现** and remain P0-W3 work; this result does not claim future protocol compliance. |

## Phase and acceptance impact

- Phase 0 remains active. P0-W1-004 is locally merged/verified; its exact final SHA has no hosted CI. P0-W1-005 Migration runner remains next. Existing P0/P05 Task–Fixture–Acceptance entries and quantitative thresholds stay in force.
- Phase 0 gets only the already planned language-neutral DESCRIBE/stdout boundary. Phase 0.5 Java tasks adopt the internal language boundary, file-level refresh, batch apply, and measured telemetry without adding another language or invented latency gate.
- Phase 1 remains design-ready. The standard Wiki projection is taskized only after Phase 0.5 acceptance; no existing WikiGenerator is present to adapt today. User-authored declarative specs belong to Phase 2, section/data extensions to Phase 3. Further analyzer languages need their own Fixtures and Evaluation.
- No production code, Fixture, schema, migration, or Quality Gate threshold was changed by this amendment.

## Verification record

At the pre-edit checkpoint, the new documentation worktree at `d08271f` passed `pnpm verify`: 318/318 Node tests, 17-project architecture check, Rust format/build/Clippy/tests and 2/2 native smoke. Latest hosted CI observed through authenticated `gh run list --repo tim-zxy/CodeAtlas --limit 5` was success run `35074479854` for predecessor SHA `27226c68d67fc78be49486a5f75b1bc93bc51ffc`; no P0-W1-004 final-SHA run appeared. Post-edit document-link, traceability, diff, and Quality Gate results must be recorded in `CURRENT_STATUS.md` after they actually run. This report does not treat the source pack's unaudited code dispositions as implementation evidence.
