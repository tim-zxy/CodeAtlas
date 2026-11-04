# B0-a Source-target normalization implementation review

Date:2026-10-23. Review kind:AUTHOR_SELF_REVIEW under the user-confirmed sequential plan;not independent or whole-branch integration review.

[Accepted DCP](../specs/2026-10-23-phase1-b0-source-target-dcp.md);[confirmed plan](../plans/2026-10-23-phase1-python-source-normalization.md). BASE/HEAD remains cc5a8cb571986c5e56ed04053b2c96ef500fcacb;work is local/uncommitted in original C worktree.

## Result and evidence

Added normalizePythonSourceObservation(value:unknown):NormalizedPythonObservation. It accepts the exact strict Source-target shape,uses ensurePhase1Data and new-only scalar Unicode validation,and returns recursively frozen provisional nodePairs/edgePairs. The old RepoBasis entry/version/schema/error behavior remains;both wrappers share one private existing mapper. No production route,IR/wire/SQL,Source classification,profile/number,dependency or publication change.

Independent p1-python-source-normalization-v1:four files formatted/frozen before product edits;golden copied from independently frozen old expected bytes SHA256 e78f4e8e39c1654e815ad42953b4cb2d07f57b7d12e8bfc31bd748bdb29447e9. No product function authored expected output. Raw freeze: .superpowers/sdd/2026-10-23-phase1-python-source-normalization/B0a-1-fixture-before-product-freeze.json.

| Check                  | Fresh evidence                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry RED              | One missing-export assertion:'undefined' versus 'function';baseline Providers build exit0                                                                                       |
| Contract RED/GREEN     | Corrected full new contract68RED before implementation;new68+old25=93PASS after implementation                                                                                  |
| Registration           | Missing registration RED0≠1;then exact one root registration                                                                                                                    |
| Final local regression | 20 files,302PASS/0FAIL/0SKIP/0TODO;69 new tests including registration                                                                                                          |
| Providers build        | pnpm --filter @codeatlas/providers build exit0                                                                                                                                  |
| Architecture           | 17 projects pass                                                                                                                                                                |
| Registry               | 47 total/exact21Phase1;only additional ID p1-python-source-normalization-v1;Syntax profile catalog0                                                                             |
| Preservation           | Initial four-file freeze unchanged;271 covered original Fixture paths unchanged;old InputSchema exact;new/old mapper bodies exactly equal after formatting in identical context |
| Product boundaries     | Root script only one registration;existing index export/assertions unchanged;no production caller added                                                                         |
| Final receipt          | .superpowers/sdd/2026-10-23-phase1-python-source-normalization/implementation-verification.json                                                                                 |

Full commands/exit logs remain in the same workspace. Historical C3-A422PASS/1TODO is not added to these totals. No root verify,Rust,actual Native,acquisition helper,DB/R4,cloud write/CI,staging/commit or cleanup ran.

## Review against requirements

- Exact new input and authority-key refusal,missing/null/nested shapes,Proxy/getter without invocation,sparse/symbol/cycle/undefined/prototype refusals pass.
- Lone surrogates in opaque strings/reasons/keys reject on new entry;well-formed astral values accepted. Old unused opaque fingerprint can still contain a lone surrogate;no historical acceptance tightening.
- Repo fingerprint is only a declaration and may differ from every per-file fingerprint. No disk/SQLite/C3 proof or complete-inventory claim.
- Context,Source classification for referenced facts,unique IDs/paths,range and edge closure/errors preserved. MODULE/FUNCTION,IMPORT/REFERENCE,IDs/FactKeys,confidence,sort and Provider neutrality match independent expected.
- Deep frozen output and unmodified input verified. Empty arrays yield empty candidates without outcome or publishing authority.
- Existing maxEvents exact boundaries tested for Source count and fact count,including maxEvents nodes plus one edge. No new numeric gate/default.
- Strict legacy IPC/corpora/owner-map and six existing Python caller references pass;no PARTIAL relabelling or Code-only publication.
- Storage/support/history/removal/CAS remains outside this pure function;architecture and no deferred capability checks pass.

No Critical/Important implementation finding found in this bounded author pass. No deferred minor finding. This is weaker than independent review;no merge-readiness claim.

## Errors and rulings retained

New test helper initially expected generic path/message for dangling endpoints. Existing helper plus actual legacy characterization established exact source/target paths and absent-node message;only new test expectation corrected before implementation. Old tests/Fixture unchanged.

Additional preservation script failures were evidence-tool defects:ordinary versus null-prototype dictionary expectation;TS6 scanner signature/EOF against installed TS7 (owned session stopped);then optional Prettier trailing comma differing after indentation. Initial scripts,logs and interrupted attempt remain. Final check uses existing Prettier in identical function context,not raw lexical identity;no product or gate was weakened. A read-only scanner probe was once rejected because automatic-review usage limit prevented approval,not for safety;after user continue,normal approval retry succeeded.

Rulings,with costs:

1. Keep manual task/receipt bookkeeping instead of commit-coupled helper scripts;user-confirmed plan forbids staging/commit/cleanup. Cost:no helper-generated committed review range.
2. Keep scoped20-file checks and author review,as the confirmed plan requires no subagent/root/Native/helper run. Cost:no independent or complete integration proof;those gates remain open.
3. Compare full mapper bodies formatted in identical function context using existing Prettier rather than version-sensitive custom scanner. Cost:format-normalized equivalence,not byte/token identity;old source preserved.

## Boundaries and next work

B0-a is a local pure-contract checkpoint only. B0-b complete Code/Syntax outcome/wire proof,B1 stage/history/removed/CAS atomic Apply,C actual Native/barrier/accounting and all P1-04/05/Phase1 exits remain OPEN. C1 real-file-symlink EPERM remains TODO/OPEN;C2's four acquisition lifetimes are spent. Historical Native timeout root cause UNKNOWN. Main39708335128 cancellation settlement not re-queried;no rerun or new run.

Next required design is B0-b's independently grounded complete-Code scope/coverage proof and compatible terminal/wire contract;this API does not select that contract or authorize implementation of it.
