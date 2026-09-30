# ADR 016 Native REFRESH Derived Analysis State

Status: Accepted on 2026-09-30 by the user's confirmation of the P05-W3-020 proposal. Architecture approval only; detailed task packets require review before implementation.

## Decision and authority

Accept the [P05-W3-020 Design Change Proposal](../../superpowers/specs/2026-09-30-p05-w3-020-native-refresh-design-change-proposal.md): separately negotiated Native IPC v3 for ANALYZE and REFRESH, and versioned derived per-file extraction/resolution summaries persisted by TypeScript. ADR-010's JSONL/no-Rust-SQLite boundary, ADR-014's language/framework separation and ADR-015's strict v1/v2 contracts remain in force. v2 REFRESH remains unavailable. IR and ProviderSnapshot stay at v1.

Reserve additive repository R010 for derived Native analysis state. Move the unpublished Phase 1 execution_graph/runtime_flow reservations to R011/R012. Published R001-R009 SQL/checksums are immutable. Approval creates no SQL or runtime capability.

## Evidence and alternatives

At merged predecessor commit `84975b7`, Rust serves one request per process and has no REFRESH producer. DeclarationIndex requires signatures, static flags, imports/inheritance and unresolved relation sites that current strict Provider/Canonical nodes do not retain. Process-local caching fails restart requirements; reconstructing from only merged Canonical rows loses required input. The accepted proposal records exact code references and predecessor tests/CI. Derived summaries are the smallest complete retained input without AST persistence or Rust database ownership.

## Compatibility and limits

Keep v1 DESCRIBE bootstrap and existing v1/v2 payloads/byte Fixtures. Advertise v3 only after real producer/client compatibility tests pass; advertise incremental capability only after real REFRESH integration/Evaluation passes. Use the current ceilings: aggregate stdin and individual lines 1,000,000 bytes, stdout 10,000,000 bytes, output events 10,000, stderr 1,000,000 bytes. Callers may lower but not raise them. Metadata consumes these budgets too. Oversize input fails closed; this approval neither raises caps nor claims large-repository scalability.

Full ANALYZE establishes compatible summaries. REFRESH parses changed files, reconstructs the target index from summaries, re-resolves bounded dependent sites including unresolved/ambiguous cases, and emits a validated patch. Initial bounded summary scanning is allowed; default full-source reparse and incomplete dependent handling are not. Summaries and active graph/support/Evidence/coverage/fingerprint commit through the same TypeScript Store transaction. No separate summary activation or source-reconciliation overwrite is permitted.

Missing/incompatible legacy state requires an explicit full bootstrap with the old graph intact. Resource exhaustion is not an instruction to silently full-reparse. Keep the accepted same-mutable-WORKTREE-ID boundary; different IDs and immutable targets return FULL_ANALYSIS_REQUIRED. An empty latest source delta cannot prove the graph current after a failed Apply.

## Security, rollback and phases

Local derived data is untrusted: validate strict schemas, paths, source-policy scope, fingerprints, provenance and size before reuse. Persist no raw source, AST, secrets, unrestricted environment or prompts. Rust receives versioned records, never SQLite or an unvalidated side-channel filename. Existing shell-free spawn, allowlisted environment, bounded JSONL, stderr logs and cancellation remain mandatory.

Rollback disables v3 availability; v1/v2 full analysis remains available and the last good graph is retained. Derived additive tables may remain unused. Do not delete released migrations/history or fabricate summaries for legacy graphs. A full write without compatible summaries makes the summary baseline unavailable until explicit bootstrap.

This belongs to existing Phase 0.5 P05-W3-020; no new language, framework, Wiki, Knowledge, daemon, adaptive scheduler or Phase 1 capability is required. Original Exit Criteria and numerical quality gates are unchanged.

Synchronize Architecture, Design Authority, Native IPC, Provider SPI, SQLite Schema, Runtime Configuration, Evaluation, scalability specification, Roadmap, Work Breakdown, Phase Acceptance, Traceability, Deferred Decisions and Current Status. Review exact contract/storage/producer/composition/Evaluation packets in that order. Shared raw-byte/handshake and migration baselines change only alongside their reviewed implementation, not by this acceptance record.
