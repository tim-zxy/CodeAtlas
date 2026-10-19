# ADR 019 D5 Feasible Inputs and Exact-layout CI Replay

Status: Accepted2026-10-18 by the subsequent user “确认” after written-spec review.
This accepts the exact D test input/layout/pinned synthetic-pack contract. The
existing plan is revised for previously authorized Native/batch execution with
routine revised-plan reconfirmation waived. New numerical reservation and remote
artifact publication/integration still require their separate material decisions.

## Context and evidence

2026-10-19 PR20 follow-up: the original hosted run completes FAILURE; original
artifact12165652221 confirms INSTALL failed before ACTUAL. Clean-build experiments
show the catalog binds16 compiler build-info caches, including a historically
nonreproducible MCP cache. The [narrow cache/layout proposal](../../superpowers/specs/2026-10-19-p05-ci-build-cache-compatibility-proposal.md)
awaits design review. This ADR's accepted three-exception rule is NOT amended
by that proposal; old evidence and Release remain unchanged and Phase held.

The current approved transport reservation378400768 exceeds every original
frozen D invocation's268435456-byte C-recipe input. Independent22/22 refusals,
0 accepted actual samples/11 retained failures and final batch16/17PASS/overall
FAIL are retained in the existing closeout workspace. Production correctly
refuses before opener. A new CI-generated physical corpus cannot match the old
approved digest. Offline qualification and ordinary actual31 do not fill either
gap. See CURRENT_STATUS for original hashes, commands and scope.

## Decision

Adopt the [combined written design](../../superpowers/specs/2026-10-18-p05-d5-input-and-ci-design.md):
explicit1_000_000_000-byte D-only caller test input, unchanged C defaults and
hardcaps; new generation at a dedicated exact Windows layout; reviewed immutable
synthetic pack with original physical corpus, evidence and pinned Native binary;
confined exact-layout installation and original mandatory actual22 collector in
Native CI. Keep exact matching and fail on drift. Do not add logical-equivalence
matching or transplant old evidence into a new physical identity.

The pack is an explicitly authorized, hash-pinned same-repository Release asset,
not an automatic production download or remote source fallback. Independently
build/test source in existing CI; exact-pack D coverage is scoped to its pinned
binary/source provenance. Missing/unreviewed evidence keeps the phase blocked.

## Authority and alternatives

This is a material EVOLVABLE private Fixture/Evaluation/CI contract under ADR-012,
014 and016; those accepted ADRs and all FROZEN architecture remain unchanged.
It explicitly corrects infeasible D recipe reuse and defines the previously
missing CI packaging operation. Exact physical corpus identity, R2 oracle and
closure rules, SQL charges, static admission,22/110/22 plus actual22 and all
original gates remain authoritative.

Alternatives: logical portable identity needs a larger unproved comparability
contract; a persistent self-hosted runner adds unapproved external operations.
Neither is required by the recommended bounded fixture-pack approach.

## Compatibility, security, migration and phases

No public config/API, Canonical/Provider/IPC schema, SQLite migration or Rust
writer change. C remains256MiB; D test input is not a reservation/default. No
worker/SQL/timeout/cap policy or deferred capability changes. Only existing
P05-W3-020 D5/D6/closeout Tasks7/8 change, at10/14 integrated. Keep Phase1 held.
Archive/path/inventory/alias/ownership checks and read-only exact hash/provenance
verification precede execution. Never overwrite an existing dedicated root,
rewrite database roots, omit a class, relax native identity or auto-calibrate.

## Evidence, affected documents and rollback

2026-10-19 operational evidence refinement: Cargo's trusted target/debug input
has two hard links. Permit that build-source shape only with checked streaming
hash/identity and before/after-copy verification; owned Native and every pack
member remain independent single-link files. The first preparation refused
before creating the dedicated root. Real hard-link test-first correction and
125/125 scoped regression support this EVOLVABLE compatibility refinement, not
a pack hard-link exception, new numerical approval or Phase acceptance.

Require the design's C/D propagation/boundary/SQL-specific regressions, installer
attacks, exact dependency/profile checks, new22/110/22, separate exact numerical
approval, actual22 on a clean Windows runner and unchanged original phase audit.
Synchronize Architecture, Design Authority, Runtime Configuration, Evaluation,
composition detail/plan, Phase Acceptance, Traceability, Roadmap, Work Breakdown,
Deferred Decisions and Current Status. No migration/golden changes are proposed;
new physical fixture assets and review records remain separately versioned.

Rollback disables the new reference/installer and holds acceptance. Preserve
old raw/candidate/holdout/failure bytes and good graph state; do not lower gates,
reuse old profiles or remove evidence. Actual outside-workspace setup retains
the host permission boundary; no upload, commit, push or merge is implicit.
