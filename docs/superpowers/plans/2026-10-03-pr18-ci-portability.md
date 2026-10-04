# PR 18 CI Portability Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Preserve the user's existing native execution preference. Review this plan before implementation.

**Goal:** Repair the two reproducible PR #18 CI failures without weakening production validation or regenerating historical evidence.

**Architecture:** Only synthetic collector test inputs and Git checkout policy need adjustment. Production collector/admission, raw source fingerprinting, Native IPC, Canonical IR, SQLite and approved memory reservations stay unchanged.

**Tech Stack:** Node test runner, existing TypeScript/Rust binaries, Git attributes and existing GitHub Actions jobs; no dependency additions.

**Spec:** `../../handoff/specs/EVALUATION.md`; ADR-012, ADR-015 and ADR-016; existing packet B and memory-stability specifications.

## Global Constraints

- Keep approved reservation280,453,120 bytes plus twice actual retained SQL UTF-8 bytes, exact environment/build matching and all fresh peak gates unchanged.
- Never rewrite immutable calibration/candidate/holdout evidence or expected Java fact/checksum goldens.
- Synthetic test data is not calibration or approval for Linux bootstrap. Preserve refusal for foreign candidates and observations.
- Preserve existing Ubuntu TypeScript and Windows Rust/Native jobs and all registered tests; no platform skips or relaxed assertions.
- Keep Phase0.5 at10/14 integrated with real REFRESH, queries, CLI and phase Evaluation open; no remote main merge without authority.

## Root Cause Evidence

On head0f42027, `node --input-type=module -e "Object.defineProperty(process,'platform',{value:'linux'}); await import('./scripts/test-native-memory-observations.mjs')"` gives3 pass/7 fail, matching PR run37032223494. Test setup reads captured Windows environments; the actual collector compares them with the current environment and correctly refuses before worker execution.

`git -c core.autocrlf=true checkout-index --prefix=<temporary-directory>/ fixtures/native/java-coverage-mixed/source/src/Case.java` produces CRLF bytes. With the existing real production client/binary and unchanged v2 fixture request, terminal fingerprint becomes `sha256:a1258d3c1f50d48e18f697caef972e1d93c6381610bf1a3c668b7e59a00f4d26`, exactly the hosted failure, instead of golden `sha256:180d88d83c74208dfb3c4a32a7bb9c00b2f5a328eb2ef8a518e3ce8a12539a20`. Fact counts remain9 nodes/6 edges/4 coverage/0 diagnostics. Checkout policy, not analyzer hashing, needs repair.

## Review Focus

- Different host platform/version: synthetic fixtures must use current complete identity; no Windows-only test assumption.
- Foreign candidate identity: refuse before invoking workers and preserve CANDIDATE_INVALID artifact.
- Foreign observation identity: preserve OBSERVATION_INVALID without recording it as valid evidence.
- Git autocrlf true/false: fresh native Java checkout must match committed LF bytes and existing golden results.
- Historical evidence: no tracked raw report/profile/golden byte changes; actual required memory corpus still executes separately.

## Task 1: Portable Synthetic Collector Tests

**Files:** `scripts/test-native-memory-observations.mjs` only.

**Interfaces:** Existing `nativeMetadataEnvironment()` and `collectNativeMemoryObservations(options, runWorker)`; no new production API.

- [x] Extend test setup to support deliberately foreign synthetic identity and add behavioral candidate/observation refusal tests. Retain the platform-variation reproduction as a regression test independent of actual Linux support.
- [x] Record failing platform-variation test before repair; existing equality/excess/error/input-change assertions remain mandatory.
- [x] Construct only temporary synthetic reports/rows with the current complete environment, recompute their own temporary raw hashes/manifests/candidate, and keep all tracked historical bytes untouched. Label the temporary collection conditions synthetic/not calibration.
- [x] Run `node --test scripts/test-native-memory-profile.mjs scripts/test-native-memory-observations.mjs`; rerun platform-variation regression. All must pass, with candidate/row mismatch still refused.

## Task 2: Stable Java Fixture Checkout

**Files:** `.gitattributes`; `packages/providers/test/native-coverage-v2.test.mjs`.

**Interfaces:** Existing registered Java fixtures and Git temporary checkout; unchanged `executeNativeRequest` and golden comparison.

- [x] Add a regression using isolated temporary Git checkout under autocrlf true and false; compare all tracked native Java fixture source bytes with committed LF bytes. Record RED before changing attributes.
- [x] Add narrowly scoped `fixtures/native/**/*.java text eol=lf`; do not normalize arbitrary user sources or regenerate goldens.
- [x] Run the checkout regression and complete registered real-binary native-analysis runner after building Rust. Verify unchanged fact/terminal goldens and worker consistency.

## Task 3: Evidence, Publication and Next Design Boundary

**Files:** `docs/handoff/CURRENT_STATUS.md`, `docs/handoff/DESIGN_TRACEABILITY.md`, `docs/handoff/specs/EVALUATION.md`; this plan.

- [x] Run complete root tests, IR types,16-project build, architecture17, format/diff, Rust fmt/build/Clippy/workspace tests, real Native suites, required memory corpus and approved collector with retained failure-inclusive artifacts. Confirm unchanged exact Native build identity and approved profile.
- [x] Record fresh commands/counts and portability regressions against existing task/fixture authorities. Disclose any wrapper failure separately; do not claim hosted success from local tests.
- [x] Commit only named changed files, update existing PR #18 and inspect exact-head Ubuntu TypeScript/Windows Rust/Native CI including required memory steps. No retry-until-green or remote main merge.
- [ ] Only after CI repair verification, prepare the subsequent P05-W3-020 REFRESH producer/composition packet's detailed design and taskization. Obtain the required design/plan approval before new feature code; do not advance Phase1.

## Self-Review and Handoff

Both observed failures map to one narrowly scoped repair each. Five review conditions map to Task1/2/3 checks. No production algorithm, memory threshold, schema, migration or frozen decision changes, so no new ADR is proposed. User confirmed native execution. Tasks1/2, all local gates and one independent narrow repair review pass. Commit ff3f731 is pushed to PR #18; exact PR/push CI both succeed including required memory steps/upload. Subsequent REFRESH packet starts with design-direction review, not feature implementation. Latest hosted-evidence/checklist follow-up is local and not another tested pushed SHA. See CURRENT_STATUS and the plan-local ledger for evidence and Windows helper adaptation.
