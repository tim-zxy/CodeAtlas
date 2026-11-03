# P1-04 foundation and compatibility review — 2026-10-22

Disposition: independent grammar/normalizer foundation verified; P1-04 remains IN PROGRESS, not complete. The user approves continuing P1-04 and separately approves exact tree-sitter-python0.25.0. Related Runtime/Source/activation implementation pauses for the [mixed compatibility proposal](../specs/2026-10-22-phase1-mixed-native-compatibility-proposal.md); no decision is fabricated. [Concrete design](../specs/2026-10-22-phase1-native-syntax-design.md) and [subplan](../plans/2026-10-22-phase1-native-syntax.md).

## Implemented and verified

- Native manifest pins exact Python grammar0.25.0. Cargo lock semantic audit confirms one added package; every pre-existing version/checksum/dependency is preserved except the Native package adding that grammar. Dependencies cc/tree-sitter-language reuse existing locked packages. No Tree-sitter runtime, Java grammar or compiler upgrade.
- One pure Rust grammar compatibility test loads the actual pinned grammar in existing Tree-sitter0.27.0 and parses literal async/decorator Python without syntax errors. This is grammar compatibility only, not an observer/binary admission/profile or Python language maturity claim.
- normalizePythonObservation validates strict basis/provider/snapshot/file/Node/Edge inputs, produces immutable sorted Canonical pairs, maps module and source-grounded function identities through existing field encoding, and preserves IMPORT/REFERENCE uncertainty. It refuses unsupported types/calls, duplicates, dangling and foreign references, non-Python sources and hostile inputs. Provider and Provider fact IDs do not define Canonical identity. The current raw python.symbol convention is FUNCTION only; class TYPE/other symbols are not invented.
- Canonical edge identity/closure body is shared unchanged behind normalizeCanonicalCodeEdge. Existing Java wrapper maps its own original providerKinds; Python maps its own, without relabeling raw Python facts as Java. Old Java golden/identity/FactMerger tests remain passing.
- Independent literal p1-python-normalization-v1 is registered as a contract-only Fixture; raw expected Canonical identities are generated with independent literal SHA256 tuple encoding, not the product implementation. Actual p1-syntax-observer-v1 is intentionally absent and no observer or language maturity is registered.

## Evidence and review corrections

Retained evidence root .superpowers/sdd/2026-10-22-phase1-foundation-and-runtime/:

- task-04-python-dependency.log: exact approved install/lock operation; no cloud CI.
- task-04-normalizer-red.log:23 missing-API failures,0 pass before implementation.
- task-04-normalizer-build.log/task-04-normalizer-first.log: original brand comparison compiler error and22pass/1 negative-oracle failure retained. String conversion follows existing Java module comparison. ProviderEdgeSchema already rejects a foreign Provider target structurally, so that vector expects INVALID_FACT rather than INVALID_CONTEXT; rejection is not weakened. These are build/test-oracle corrections, not a claimed product fix.
- task-04-foundation-build-final.log: Providers installed TypeScript build exit0.
- task-04-foundation-command.json/task-04-foundation-regression-final.log: exact12 scope-matching Node test files;173 tests/173pass/0fail/cancel/skip, including25 Python normalization tests and148 existing Java identity/FactMerger/v4/Plugin V2/registry/workspace/architecture tests.
- task-04-foundation-rust-final.log: offline locked grammar/shared-byte/legacy protocol Fixture tests8/8 (1 grammar,2 syntax shared,5 legacy protocol). No actual Native observation/client invoked; Cargo compiles/links its ordinary test targets. This is not cargo test --workspace or actual language evaluation.
- task-04-foundation-architecture.log plus final17-project dependency check pass; named-file formatting and targeted Rustfmt checks pass.
- task-04-foundation-verification.json: exact commands/source+Fixture hashes;32 valid manifests/6 Phase1, no actual observer Fixture; approved dependency semantic audit result.

No unresolved task-local normalization defect is known from author review, but this is not independent review. No deferred minor was recorded. Source classify, existing Runtime bootstrap and Native production dispatch have no semantic diff; no Source policy, R010, profile, old Fixture root or guard is weakened. All original local EOL/document/evidence work remains. No commit/stage/push/cloud CI, calibration/new profile/model, R4 DB operation or actual Native observation occurred. Historical timeout cause remains UNKNOWN and cancellation settlement remains a separate follow-up.

## Required governed decision

Read-only call-path inspection confirms that Java v3 bootstrap requires the complete Source inventory while its Rust parser rejects non-Java files. It is not an executed actual Native failure; we deliberately did not bypass profile admission to produce one. The proposed separate mixed candidate workflow uses existing explicit full-v1/v2 Java capability provisionally, then v4 Python/syntax, validates one complete combined candidate and commits Code+Syntax through P1-05. Old v3 inventory checks remain intact; missing compatible summaries are reported explicitly under ADR-016, not forged.

The proposal must also amend the unpublished v4 owner contract: expected active activation basis, authorized provisional owner-map binding and final combined candidate basis are different states. The current single RepoBasis cannot authenticate all three. Exact strict fields and shared bytes must be reviewed/pinned before changing P1-03 contracts or implementing that real path. This is material compatibility/contract governance under AGENTS.md, not a request to re-approve the already approved grammar or tiny code steps.

No calibration run, purpose entry or scalar profile is approved by accepting this direction. Exact-current layout/accounting/corpus/holdout and concrete values remain separate reviewed gates. Actual observer, Source/routing/summary compatibility, failures/recovery, profile admission and joint P1-04/05 support lifetime are open. P1-04/P1-05 and every Phase1 exit remain incomplete.

## Rulings and their costs

- Join P1-04 persistent mixed lifetime acceptance with P1-05 while allowing verified candidate contracts to unblock preparation. Cost: task completion spans both boundaries; no required gate is dropped.
- Reuse the unchanged Canonical edge body through a narrow helper instead of renaming Python facts or duplicating the algorithm. Cost if wrong: old Java identity/target regressions would fail; those tests ran and passed.
