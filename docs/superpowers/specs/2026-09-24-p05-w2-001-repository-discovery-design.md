# P05-W2-001 Repository Discovery and Source Scanning Design

Date: 2026-09-24
Task: P05-W2-001
Status: written design approved by user on 2026-09-24; P05-W2-001 locally implemented and accepted, pending hosted CI/integration

## Purpose and authority

Discover one registered Git repository and produce a deterministic, policy-filtered inventory of its source files for the Phase 0.5 Java code-intelligence path. Success means the three declared Fixtures prove Git metadata discovery, inclusion and exclusion, generated/vendor/test classification, language hints, and binary detection without publishing incomplete or unsafe results.

This design implements the P05-W2-001 entry in [WORK_BREAKDOWN](../../handoff/WORK_BREAKDOWN.md), the scanning item in [PHASE_ACCEPTANCE](../../handoff/PHASE_ACCEPTANCE.md), and its [DESIGN_TRACEABILITY](../../handoff/DESIGN_TRACEABILITY.md) row. [RUNTIME_CONFIGURATION](../../handoff/specs/RUNTIME_CONFIGURATION.md), [CANONICAL_IR](../../handoff/specs/CANONICAL_IR.md), [SECURITY](../../handoff/specs/SECURITY.md), ADR-001, ADR-002, and ADR-012 remain authoritative. This task does not amend a FROZEN decision or establish a new numerical Quality Gate.

## Scope and selected approach

`@codeatlas/source` owns a filesystem scanner and a narrow Git discovery/ignore adapter. The scanner walks files and classifies them without depending on Git identity; the adapter supplies repository root, branch, HEAD, and Git ignore decisions. The public operation requires a Git repository in this task. A non-Git directory produces a typed unsupported-source error. A future separately reviewed adapter may support non-Git directories without replacing the scanner; no generic VCS plugin framework or non-Git implementation is built now.

The alternative of using `git ls-files` as the inventory source was rejected because explicit inclusion of ignored files and future non-Git support would be awkward. Reimplementing Git ignore semantics in TypeScript was rejected because nested rules would drift from Git and add unnecessary maintenance. Git is invoked with explicit arguments, without a shell, and errors are translated into safe typed failures.

## Boundary and result contract

The public request supplies a validated, stable `Repository.id`, an explicit starting directory, an explicit workspace root, and already validated immutable in-memory scan configuration containing include and exclude patterns. This task does not parse `.ekp` YAML or discover configuration files. The caller remains responsible for repository registration and ID persistence. A Git remote or filesystem location must not be used to regenerate the stable ID.

The result contains that ID; the resolved host-local Git root locator; nullable branch and HEAD commit observations; a workspace-position descriptor; and a deterministically sorted array of included file observations. The workspace position distinguishes repository-at-workspace-root, a child repository with a workspace-relative locator, and an external repository. It is metadata, not canonical repository identity. An unborn repository has no HEAD commit; a detached HEAD has no branch name. Neither case invents a value.

Each file observation has a canonical `/`-separated repository-relative path, `languageHint` or `null`, and the orthogonal `role`, `provenance`, and `contentKind` classification dimensions from Canonical IR. The output contains no file contents. P05-W2-001 does not calculate content hashes, sizes, revision fingerprints, changed-file sets, or construct Canonical `SourceFile` records, which require a fingerprint and revision. Those belong to P05-W2-002. It does not create a product CLI command; CLI integration belongs to P05-W8-001.

## Scan and selection flow

1. Resolve and validate the caller's paths, discover the containing Git repository, and observe root, branch, and HEAD. A starting path inside a repository resolves to that repository's root. Reject a non-Git path rather than treating it as an empty repository.
2. Enumerate filesystem entries below the Git root without following file or directory symbolic links. Do not descend into repository metadata, security-denied paths, or explicitly excluded directories. For ignored directories, traversal remains possible when an explicit include pattern may target a descendant.
3. Convert candidate file paths to Canonical IR-compatible repository-relative `/` paths before matching or returning them. Reject escapes, invalid path segments, and collisions after path normalization rather than silently rewriting identity.
4. Apply selection in this order: repository metadata and security-policy denials; explicit `exclude`; explicit `include`; then `.gitignore` and default exclusions. Thus `include` may re-admit a Git-ignored or ordinarily default-excluded generated/vendor file, but an ordinary include cannot override security policy or explicit exclusion. Git supplies `.gitignore` semantics, including nested rules. Include/exclude use rooted repository-relative `/` globs: literal characters, `?` for one non-separator character, `*` for zero or more non-separator characters, and `**` for zero or more complete path segments. A directory subtree is expressed as `directory/**`; negation, absolute paths, backslashes, empty segments, and `.`/`..` segments are invalid. These patterns have the same meaning on every host platform.
5. Assign a Java language hint for recognized `.java` source paths and `null` when there is no supported hint. Assign `role` from test-path conventions, `provenance` from generated/vendor conventions, and `contentKind` from bounded content inspection. These dimensions are independent: a generated test file can be `TEST`, `GENERATED`, and `TEXT`. Classification is deterministic and cannot silently change inclusion policy. Vendor takes precedence over generated when a path matches both provenance conventions; explicit exclusion still removes it.
6. Sort included file observations by canonical repository-relative path before returning the immutable result.

This scanner does not make a remote-access decision. Index inclusion, remote LLM access, and remote embedding access remain separate policies. Common secret paths such as `.env*`, private keys, credentials, and secret directories are denied at this scanner boundary; no raw contents or matching secret text are included in diagnostics.

## Failures and recovery

Distinct typed failures cover non-Git input, invalid configuration or path, Git execution failure, permission/read failure, and a filesystem entry that disappears or changes during observation. A failed scan returns no partial inventory. The caller may retry after the underlying state is stable; this operation performs no persistence or graph activation to roll back. Diagnostic messages identify the operation and safe path where appropriate, but never file contents, secret matches, unrestricted environment values, or Git command output that may contain protected data.

Symbolic links are not followed even when an include pattern names them. This prevents directory cycles and scanning outside the discovered root. The scan does not claim an atomic filesystem snapshot; P05-W2-002 owns revision fingerprints and startup reconciliation. A detected race is an error rather than a successful incomplete observation.

## Fixtures, checks, and task acceptance

Create version-1 Fixture Manifests for `basic-java-repo`, `gitignore`, and `generated-vendor` under `fixtures/source/`, with pinned input repositories and expected inventory/metadata artifacts. Keep `qualityGates` empty unless a governing acceptance document has approved a numerical gate. The Fixture harness compares declared observations deterministically; it does not invoke a Provider, SQLite, remote service, or product CLI.

- `basic-java-repo`: root/branch/HEAD, repository-relative paths, Java hint, sorted result, and an external-workspace repository locator. Focused tests cover unborn and detached Git states.
- `gitignore`: nested ignore rules, an ignored directory with an explicitly included descendant, explicit exclusion winning over inclusion, default exclusions, and security denial winning over ordinary inclusion.
- `generated-vendor`: orthogonal source/test/other, authored/generated/vendor, and text/binary classification, including an explicitly included ordinarily excluded file.

Focused unit tests also cover non-Git input, invalid paths and patterns, symbolic links, unreadable or disappearing entries, and failure atomicity. Register the suite in the root test command. Run the Fixture checks, build, formatting, architecture guardrail, and other applicable `pnpm verify` checks before claiming task completion. Record exact commands, pass counts, Fixture IDs, known limitations, commit, and next unblocked task in `CURRENT_STATUS.md`; synchronize the P05-W2-001 traceability row with executable paths. No Phase 0 evaluation threshold is imported into Phase 0.5.

## Explicit exclusions and change control

This task does not implement YAML loading, `.ekp` initialization, repository registration/persistence, file hashing, `WORKTREE` revisions, change detection, startup reconciliation, Java parsing, canonical fact normalization, SQLite writes, product CLI integration, semantic knowledge, or non-Git scanning. Any implementation result requiring a Canonical IR contract change or a weaker security default stops for the applicable ADR or Design Change Proposal. Any EVOLVABLE adjustment requires Fixture/Evaluation evidence and synchronized governing documents before completion.
