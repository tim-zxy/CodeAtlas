# P0-W0-001 Monorepo Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the CodeAtlas TypeScript/Rust monorepo so every declared module builds independently, CLI and MCP smoke entry points start safely, the native crate builds, and CI runs the complete smoke gate.

**Architecture:** Use a pnpm workspace for the TypeScript apps and packages declared by the Module Boundaries specification, plus a Cargo workspace for the native analyzer. All modules begin as dependency-free shells, so this task establishes physical boundaries without introducing domain behavior, Canonical IR, storage schemas, IPC, or deferred capabilities. Executable smoke modes are explicit; MCP and native-analyzer readiness output uses stderr so future protocol stdout remains clean.

**Tech Stack:** Node.js 24, pnpm 11.19.0, TypeScript 7.0.2, Node built-in test runner, Prettier 3.9.6, Rust 1.98.1 (edition 2024), Cargo, rustfmt, Clippy, GitHub Actions.

**Spec:** `docs/specs/MODULE_BOUNDARIES.md`

## Global Constraints

- Implement only `P0-W0-001`; add no business logic or database schema.
- Create exactly the apps, packages, native crate, and shared fixture root declared in `docs/specs/MODULE_BOUNDARIES.md`.
- Preserve provider-independent Canonical IR and every dependency direction even though the initial shells have no cross-package imports.
- `apps/daemon` is a buildable placeholder only; DAEMON behavior and local HTTP remain Phase 2 scope.
- The Rust analyzer owns no SQLite state and writes no non-protocol content to stdout.
- Evaluation evidence is required: workspace build, independent package builds, CLI/MCP smoke tests, Rust build/test, formatting, Clippy, and CI definition validation.
- Do not modify an acceptance gate or baseline to make implementation pass.
- Complete the task only after `docs/CURRENT_STATUS.md` records commands, pass counts, limitations, and the next task.

---

### Task 1: Restore handoff-pack path consistency

**Files:**
- Modify: `docs/ENGINEERING_HANDOFF.md`
- Modify: `docs/MANIFEST.md`
- Modify: `docs/CONSISTENCY_CHECK.md`
- Verify: `AGENTS.md`
- Verify: `README.md`

**Interfaces:**
- Consumes: the approved move of `docs/README.md` to repository-root `README.md`.
- Produces: valid repository-relative references from the handoff pack and an accurate inventory statement.

- [ ] **Step 1: Write the failing path check**

Create a temporary, non-versioned PowerShell assertion in the terminal that requires `README.md`, requires every path listed by `AGENTS.md`, rejects `docs/README.md`, and rejects the stale `outputs/Engineering-Handoff-Pack` prefix.

- [ ] **Step 2: Run the path check and verify it fails correctly**

Run the assertion before editing the handoff documents. Expected: failure because `docs/ENGINEERING_HANDOFF.md` and `docs/MANIFEST.md` still describe `README.md` as if it were inside the pack.

- [ ] **Step 3: Correct only the stale references and inventory**

Change the handoff reading reference to repository-root `../README.md`, change the manifest entry to `../README.md`, and update the consistency inventory to distinguish authoritative pack files from repository-root entry files. Do not change architectural language or acceptance criteria.

- [ ] **Step 4: Re-run the path check**

Expected: PASS with every declared path present and zero legacy output-directory references.

### Task 2: Establish reproducible workspace configuration

**Files:**
- Create: `.gitignore`
- Create: `.prettierignore`
- Create: `.prettierrc.json`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.base.json`
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`
- Create: `fixtures/README.md`

**Interfaces:**
- Consumes: Node 24, pnpm 11.19.0, Rust 1.98.1 installed on the development host.
- Produces: root commands `pnpm build`, `pnpm test`, `pnpm format:check`, `pnpm verify`, `cargo build --workspace`, and `cargo test --workspace`.

- [ ] **Step 1: Add root verification scripts before module shells**

Define root scripts so `pnpm verify` runs formatting check, recursive package builds, TypeScript smoke tests, Cargo formatting, Cargo build, Clippy with warnings denied, and Cargo tests. Point TypeScript tests at `apps/*/test/*.test.mjs`.

- [ ] **Step 2: Run `pnpm verify` and verify RED**

Expected: failure because declared workspace packages, application entry points, and the Rust crate do not exist yet. Confirm the failure names missing deliverables rather than a syntax error in the root configuration.

- [ ] **Step 3: Add deterministic root configuration**

Set `packageManager` to `pnpm@11.19.0`, require Node `>=24 <25`, pin TypeScript `7.0.2`, `@types/node` `26.5.0`, and Prettier `3.9.6` in the lockfile, use strict ESM TypeScript settings with declaration output, and pin Rust channel `1.98.1` with `rustfmt` and `clippy` components. The Cargo workspace uses resolver `3` and contains only `crates/native-analyzer`.

- [ ] **Step 4: Install and validate configuration**

Run `pnpm install`, `pnpm format:check`, `cargo metadata --no-deps`, and `cargo fmt --all --check`. Expected: configuration parses; the full gate remains red until module shells are present.

### Task 3: Add TypeScript package boundary shells

**Files:**
- Create for each of `runtime`, `application`, `agent-api`, `ir`, `storage`, `source`, `providers`, `plugins`, `contracts`, `execution`, `documents`, `knowledge`, and `evaluation`: `packages/<name>/package.json`
- Create for each package: `packages/<name>/tsconfig.json`
- Create for each package: `packages/<name>/src/index.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` and pnpm workspace discovery.
- Produces: buildable packages named `@codeatlas/<name>` with no cross-package dependencies and no public domain APIs.

- [ ] **Step 1: Add a workspace-structure test**

Add `scripts/test-workspace-structure.mjs` using `node:test`. It enumerates the 13 package names above, asserts each manifest and source entry exists, asserts each manifest exposes only `dist/index.js` and `dist/index.d.ts`, and asserts there are no project-package dependencies.

- [ ] **Step 2: Run the structure test and verify RED**

Run `node --test scripts/test-workspace-structure.mjs`. Expected: FAIL naming the first missing package manifest.

- [ ] **Step 3: Add minimal package shells**

Each manifest is private, ESM, side-effect free, and defines `build` as `tsc -p tsconfig.json`. Each source entry contains only `export {};`; do not introduce placeholder domain types or dependencies.

- [ ] **Step 4: Verify package boundaries and independent builds**

Run `node --test scripts/test-workspace-structure.mjs` and `pnpm -r --workspace-concurrency=1 run build`. Expected: 13 structure cases pass and all 13 packages build independently.

### Task 4: Add CLI and MCP executable smoke shells

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/cli/src/main.ts`
- Create: `apps/cli/test/smoke.test.mjs`
- Create: `apps/mcp/package.json`
- Create: `apps/mcp/tsconfig.json`
- Create: `apps/mcp/src/main.ts`
- Create: `apps/mcp/test/smoke.test.mjs`

**Interfaces:**
- Consumes: Node process arguments and the root TypeScript configuration.
- Produces: `codeatlas --smoke` exiting zero with `codeatlas-cli:ready` on stdout; `codeatlas-mcp --smoke` exiting zero with empty stdout and `codeatlas-mcp:ready` on stderr.

- [ ] **Step 1: Write CLI and MCP process smoke tests**

Use `node:test`, `node:assert/strict`, and `spawnSync` against each compiled `dist/main.js`. Assert exit code, stdout, and stderr exactly; the MCP test must assert stdout is empty.

- [ ] **Step 2: Build and run the tests to verify RED**

Run `pnpm --filter @codeatlas/cli build`, `pnpm --filter @codeatlas/mcp build`, then `node --test apps/cli/test/smoke.test.mjs apps/mcp/test/smoke.test.mjs`. Expected: failure because the entry points are missing.

- [ ] **Step 3: Implement the minimal explicit smoke modes**

Each entry point accepts only `--smoke` for this task. CLI writes its readiness marker to stdout; MCP writes its marker to stderr to preserve protocol stdout. Any other invocation exits nonzero with a concise “not implemented in P0-W0-001” diagnostic.

- [ ] **Step 4: Rebuild and verify GREEN**

Run the same build and test commands. Expected: 2 smoke tests pass with exact stream behavior.

### Task 5: Add the daemon placeholder and native analyzer crate

**Files:**
- Create: `apps/daemon/package.json`
- Create: `apps/daemon/tsconfig.json`
- Create: `apps/daemon/src/index.ts`
- Create: `crates/native-analyzer/Cargo.toml`
- Create: `crates/native-analyzer/src/main.rs`
- Create: `crates/native-analyzer/tests/smoke.rs`

**Interfaces:**
- Consumes: root TypeScript and Cargo workspaces.
- Produces: a buildable daemon placeholder with no executable behavior and a `codeatlas-native-analyzer --smoke` process that exits zero, leaves stdout empty, and writes `codeatlas-native-analyzer:ready` to stderr.

- [ ] **Step 1: Write the Rust process smoke test**

Use `std::process::Command` with Cargo’s `CARGO_BIN_EXE_codeatlas-native-analyzer` test environment variable. Assert success, empty stdout, and the exact stderr marker.

- [ ] **Step 2: Run `cargo test --workspace` and verify RED**

Expected: failure because the binary entry point does not exist.

- [ ] **Step 3: Implement only the native smoke entry point**

Parse `std::env::args_os()` for the exact `--smoke` argument. Write readiness only to stderr. For any other invocation, write a not-implemented diagnostic to stderr and exit with code 2. Do not add JSONL envelopes, parser dependencies, SQLite access, or analysis behavior.

- [ ] **Step 4: Add the daemon placeholder**

Make `@codeatlas/daemon` independently buildable with `export {};` only. Do not add start scripts, watchers, sockets, HTTP, persistence, or background execution.

- [ ] **Step 5: Verify GREEN**

Run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and `pnpm --filter @codeatlas/daemon build`. Expected: all pass with one Rust smoke test.

### Task 6: Add continuous-integration gates

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: lockfiles, root scripts, Node/Rust toolchain declarations.
- Produces: separate deterministic TypeScript and Rust CI jobs for pushes and pull requests.

- [ ] **Step 1: Add a CI structure assertion**

Extend `scripts/test-workspace-structure.mjs` to assert that CI installs with `pnpm install --frozen-lockfile`, runs the TypeScript format/build/test gates, and runs Rust fmt/build/Clippy/test gates.

- [ ] **Step 2: Run the assertion and verify RED**

Expected: FAIL because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Add the minimal CI workflow**

Use Node 24 with pnpm 11.19.0 and the committed lockfile in the TypeScript job. Use the pinned Rust toolchain and required components in the Rust job. Do not add deployment, release, database, LLM, network-provider, or daemon-service jobs.

- [ ] **Step 4: Re-run the structure assertion**

Expected: PASS for CI command coverage and workspace structure.

### Task 7: Run the declared gate and record evidence

**Files:**
- Modify: `docs/CURRENT_STATUS.md`
- Verify: `docs/PHASE_ACCEPTANCE.md`
- Verify: `docs/DESIGN_TRACEABILITY.md`

**Interfaces:**
- Consumes: every deliverable and check from Tasks 1–6.
- Produces: a reproducible completion record for `P0-W0-001` and identifies `P0-W0-002` as the next dependency-ordered task.

- [ ] **Step 1: Run the complete local gate from a clean install**

Run `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm -r --workspace-concurrency=1 run build`, `pnpm test`, `cargo fmt --all --check`, `cargo build --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace`.

- [ ] **Step 2: Run architecture and scope checks**

Run the workspace-structure test, search production files for SQLite/database/LLM/embedding/Zvec/Java-parser/HTTP-server implementations, and inspect package manifests for cross-package dependencies. Expected: no forbidden or deferred implementation and no dependency edges yet.

- [ ] **Step 3: Update current status with fresh evidence**

Record task ID `P0-W0-001`, the exact commands, observed pass counts, the Git revision from `git rev-parse HEAD`, fixture/check name `workspace build and TypeScript/Rust CI smoke`, unchanged contracts/schemas/migrations, known limitations, and next task `P0-W0-002`.

- [ ] **Step 4: Re-run the full gate after documentation changes**

Expected: all commands pass without warnings or skipped mandatory checks.

