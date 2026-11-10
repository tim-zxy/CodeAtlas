# R11 Controlled Staged PACK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, with one fresh final independent review.

**Goal:** Create exactly one reviewed R11 validation archive through fresh staging without modifying original measurement/frozen trees.
**Architecture:** Separate original semantic validation, copied-reader catalog/profile/sidecar proof, and physical archive creation. Reuse existing installer equality and ZIP primitives; no captured code change.
**Tech Stack:** Existing Node24.15.0, TypeScript compiler, Windows PowerShell ZIP/tar primitives; no dependencies.
**Spec:** docs/superpowers/specs/2026-11-10-r11-staged-pack.md

## Global Constraints
- Exact values:232337408/401006592/434798592; original C paths and recorded identities preserved.
- No worker/build/prepare/sampling/CI/publication/production profile.
- Original .d.ts and every non-exempt captured byte unchanged.
- Any failure/UNKNOWN stops; one consumed PACK latch; never overwrite.

## Review Focus
- Wrong roots, traversal, links and output overlap refuse before mutation.
- Staged extra/missing/changed files refuse except the precise two metadata differences.
- Incomplete/duplicate/wrong-candidate holdout and reused cancellation origins refuse.
- Profile identity/one-byte numeric error and unexpected compiler output refuse.
- Existing or failed/unknown PACK attempt cannot Create again.

### Task 1: approved contract, pure stage guards and test-first fixtures
Files: .github/qualification/r11-staged-pack.mjs, .github/qualification/r11-staged-pack.test.mjs; controlling handoff documents.
Interfaces: confinedPath(root,relative); assertReboundBinding(original,rebound,roots); assertPayloadInventory(original,staged,bindingEntry,holdoutEntry); assertHoldout(candidate,digest,holdout,names); claimPackAttempt(root,receipt).
- [x] Add actual positive and negative synthetic file/record tests; run before implementation (expected missing exports/features RED).
- [x] Implement the smallest strict guards; repeat targeted tests (GREEN).
- [x] Preserve old authorities by additive amendment/trace entries; no package.json/captured source edit.

### Task 2: independently pinned reader/orchestrator and prepare
Files: .github/qualification/r11-pack-reader.mjs and task1 main.
Interfaces: original-evidence role -> full semantic/report identity proof; copied-catalog role -> checked roots/binding/profile proof; copied-binding role -> actual separately loaded sidecar proof.
- [x] Test seals, member additions/removals, profile deltas, links and once-only failure cases RED, then implement.
- [x] Fresh-copy original frozen data and package links; only new copied numerical catalog TS/JS/maps may change. Compile only the catalog, preserving declaration.
- [x] Prepare payload + original holdout + dependencyRoots-only binding. Seal all before/after inventories and tool/reader/prepare identities.
- [x] No actual archive in prepare. Retain all raw failures.

### Task 3: final gate, one PACK and decoded verification
- [x] Verify all targeted new tests, existing relevant pack/layout contracts, workspace and architecture gates; fresh reviewer covers final diff and high-risk boundaries.
- [x] Fix blockers with a targeted RED/GREEN cycle before real creation.
- [x] Seal approved tool/child hashes. Prepare one fresh work root, then final original semantics and copied topology/profile/binding proofs.
- [x] Consume once-only PACK latch. Invoke unchanged ZIP Create once, verify archive, decode to a new owned inspection root and compare every byte/member.
- [x] Check original and staged/reader identities after; record actual bytes/SHA/entries/exit and cleanup scope.
- [x] Update CURRENT_STATUS/traceability with accurate results; do not publish, push a CI switch or mark A6 passed.

Verification: node --test .github/qualification/r11-staged-pack.test.mjs (all green);
existing scripts/test-native-refresh-ci-layout.mjs and scripts/test-native-refresh-ci-pack.mjs;
scripts/test-workspace-structure.mjs and existing architecture command. Run only affected gates, not old sampling.

Ruling: no additional plan confirmation: user explicitly approved implementation, scoped numeric adoption, tests/review and one PACK. Retain ledger/evidence rather than skill cleanup, per user's preservation instruction.

Completed after one failed v1 preparation (retained), explicit recovery approval, successful v2 preparation and one actual ZIP Create. Result PACKED_DECODED_VERIFIED_NOT_QUALIFIED;5423 members/245661348bytes/SHA2563ce3ef83e1e584d6a6de52150f7020f895d1f4ab8a65245451ada65521e740bd. No sampling/publication/CI switch; actual22 still required.
