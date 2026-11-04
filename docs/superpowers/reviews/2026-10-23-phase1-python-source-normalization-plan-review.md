# B0-a Python Source-target implementation-plan author review

Date:2026-10-23. Review kind:AUTHOR_SELF_REVIEW,not independent approval. [Plan](../plans/2026-10-23-phase1-python-source-normalization.md);[accepted B0-a](../specs/2026-10-23-phase1-b0-source-target-dcp.md). User accepted written contract;concrete plan remains REVIEW_PENDING. Execution method already selected:inline/sequential in original C worktree.

## Evidence and scope

681/681 predecessor SHA256 entries match before edits. HEAD/branch match cc5a8cb571986c5e56ed04053b2c96ef500fcacb / codex/p05-integrated-exit-audit. Dirty product/docs and unrelated EOL changes retained. .codegraph absent;no index created. Read old mapper/tests/golden/manifest/build/export registration,Source-target schema and actual ensurePhase1Data/scalar-check implementations. New API/test/Fixture remain absent.

Static caller inspection covers the six Source-reference scripts and their pure output-checker imports. They import the existing normalizer;no actual Native/acquisition-helper invocation is introduced by the planned20-file command. Existing registry tests own temp directories/junctions;plan explicitly requires checked temp cleanup. No product tests/build/pure counterexample rerun in this planning turn.

## writing-plans self-review

| Check                    | Result                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec coverage            | DCP§1/4/5/8/9 mapped to B0a-1..3 and trace table. B0-b§7 is explicitly excluded,not silently treated as implemented                                                                    |
| Step clarity             | Exact files,public/private signatures,fixture metadata,golden SHA,RED assertion,negative cases,commands and expected exits fixed. No placeholder framework/dependency                  |
| Type consistency         | Two public unknown→NormalizedPythonObservation wrappers;shared private PythonSourceInput with targetSource only;old basis explicitly projected. No extra exported IR or authority type |
| Five Review Focus inputs | Each has a named B0a-2 test;Source fingerprint mismatch remains legal without authentication;hostile input/Unicode/empty authority/identity-limit regressions pinned                   |
| Proportion               | Three sequential reviewable deliverables;tests and boundaries,not implementation bodies. No parallel work or extra production module                                                   |
| Governance               | Written acceptance recorded separately from pending plan;prior PROPOSED snapshot copied verbatim before edit. Original design ledger/review/probe remain immutable                     |
| Verification             | 20 named files,Providers build,architecture,exact registry difference/catalog0 and scoped formatting/hash checks;root/actual Native/CI not claimed                                     |
| Ponytail full            | Reuse SyntaxTargetSourceSchema,existing Zod schemas/mapper/error/identity and String.isWellFormed. No new index export,dependency,option,generalized normalizer or adjacent cleanup    |

Review corrections incorporated before handoff:keep new-only Unicode guard rather than strengthening old schema;use repo/file fingerprint distinction rather than false equality;separate structural SUCCEEDED from complete-Code proof;exclude peak-collector and subprocess architecture-rule suites;retain exact existing export assertion;do not treat no-digest Fixture as a real captured manifest.

No unresolved B0-a design blocker found in this bounded author review. No implementation or independent review claim. Receipt coverage is limited to pinned paths,not whole-repo proof.

## Acceptance still open

B0a-1..3 NOT_STARTED;user concrete-plan review pending. B0-b/B1/C,real-file-symlink EPERM,complete Code/Syntax support and history/removal/atomic Store,actual Native/resource/profile,root/integration/CI and P1-04/05/Phase1 remain OPEN. Historical Native timeout UNKNOWN;C2 four lifetimes spent. No approval for new numeric gates,calibration,dependency,migration or cloud writes follows.
