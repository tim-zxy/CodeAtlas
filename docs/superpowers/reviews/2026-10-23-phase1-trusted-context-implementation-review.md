# Phase1 C0-byte / C1 / C2 implementation review

Author review only, 2026-10-23; no independent reviewer. User confirmed the [concrete plan](../plans/2026-10-23-phase1-trusted-context-preparation.md). Work remains in C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas, branch codex/p05-integrated-exit-audit, base cc5a8cb571986c5e56ed04053b2c96ef500fcacb. No commit, stage, push, PR, cloud CI or Native run occurred.

## Findings and disposition

- **Open validation gate:** Windows denied real file symlink creation with EPERM. The original failing run is retained; the test explicitly reports TODO, never PASS/waiver. Actual root/intermediate junction, hardlink, directory and deterministic post-open replacement controls passed. C1 implementation is present; its full task acceptance remains OPEN until the missing symlink proof and applicable integration gates exist.
- **Preparation boundary:** the loader has one export and no execution entry point. Frozen catalog identity,16 cases, original Source/probes, request/context/complete expected stream and exact reads are checked under caller-supplied bounds. Unknown/forged fields and APPROVED/SEALED values reject with fixed code/message. Even matching synthetic shapes plus all seven tool references remain NOT_READY with all seven permanent obligations.
- **Identity boundary:** raw request and complete strict parsed request bind separately. Changed removed fingerprint or resource budget changes complete request identity while owner-map stays unchanged. Source/removed/retained subidentities encode full ordered arrays; resource encodes {resourceBudget,deadlineEpochMs}. Expected self-comparison proves structure/checksum, not Source truth or independent authorship; the rehashed false-reference control retains ORACLE_PROVENANCE_REQUIRED.
- **Preservation:**506 predecessor hashes matched before edits. Independent new Fixture was formatted/authored/frozen before implementation and loader comparison. Existing Fixture/product bytes are preserved except narrowly approved .gitattributes rules and package test registration. No broad EOL normalization, dependency, schema/migration, Runtime/profile/Source behavior or old evidence rewrite.
- **Helper boundary:** exactly4 Node helper lifetimes, sequential, one per approved case, no retries. Only2 OpenProcess acquisitions, both for owned live children. Node retains pipes/kill/await-close. Collector checks image/PID/creation interval, retains the same acquired handle to final OS-exit query, and releases. Creation FILETIME is a decimal string. Cancelled positive peak remains ineligible. This proves the controlled helper question only.
- **Remaining limitations:** no actual Native/transport handshake, fast-failure qualification, measurement overhead/accounting, trusted Runtime/stage/removal capture, process restart, complete Java/mixed Code or Canonical Syntax/support/Store proof. P1-04/05 and Phase1 exits stay OPEN. Historical Native timeout remains UNKNOWN.

## Reproducible evidence

Evidence root:.superpowers/sdd/2026-10-23-phase1-trusted-context-preparation/ (preserved).

| Check                   | Result / evidence                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Git raw-byte policy     | c0-red.log then c0-green.log,1/1; three targeted -text rules; Git filter simulation, not actual fresh checkout/CI                                                                          |
| C1 test-first           | c1-red.log; initial expanded-suite setup import error in c1-contract-red.log, corrected missing-loader RED in c1-contract-red-corrected.log; no discarded failure                          |
| Independent Fixture     | c1-fixture-prefreeze.json pins5 files before loader implementation; expected generated only by retained standard-library authoring, never product output                                   |
| First C1 verification   | c1-green-attempt1.log:48 pass,1 real symlink setup EPERM failure; c1-green-with-open-symlink-gate.log:48 pass,1 explicit TODO                                                              |
| Review controls         | c1-author-review-controls.log:51 pass,1 TODO,52 total; direct status forgery and all-tools/matching-shapes controls added                                                                  |
| Matching regression     | c1-regression-command.json lists exact18 files; final c1-formatted-fixture-regression.log and exit record are controlling; 340 pass,1 explicit TODO,341 total,exit0; not full root gate    |
| Architecture            | architecture.log:17 projects pass                                                                                                                                                          |
| Fixture inventory       | fixture-inventory.json:45 total,exact19 Phase1; catalog remains0                                                                                                                           |
| Source coverage         | source-reference-index-check.log/json:16/16 strict unit references,6 original activation-shape differences; copied checker changes only output location, original checker/result untouched |
| C2 static controls      | c2-static-controls.json:2 Node syntax checks,PowerShell parser0 errors,13 text-only controls; no helper execution in that step                                                             |
| C2 one-shot raw records | probe/output/attempts.jsonl,result.json,collector-stdout.jsonl,collector-stderr.txt,pre-execution-freeze.json; c2-once.log                                                                 |
| C2 post-hoc checks      | c2-result-verification.json:4 spent slots,no retry,2 final reads/releases,all target/collector closes confirmed,script/Node hashes unchanged,measurementEligible=false                     |

| C2 case                  | Actual answer                                                                                               | Qualification                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| held-ready               | HELPER_FEASIBLE:positive final OS peak after Node close,owned identity and retained handle                  | Controlled helper only         |
| closed-before-attach     | ACQUISITION_UNAVAILABLE / CHILD_CLOSED_BEFORE_ACQUIRE; no OpenProcess on old PID,no peak                    | Ineligible                     |
| injected-acquire-failure | ACQUISITION_UNAVAILABLE / INJECTED_ACQUIRE_FAILURE; no OS acquire,no business input,owner termination/close | Explicit injected control only |
| cancel-after-attach      | CANCELLED; final peak retained but rejected as observation; owner kill and close confirmed                  | Ineligible                     |

No fresh Rust run was needed for unchanged Rust. Historical725 Node/83 Rust are not this round's evidence. No actual Native CLI/calibration/profile number or cloud operation. Full root/integration gates remain outstanding; empty legacy qualityGates is not a waiver.

## Next design and rulings

[Next-design brief](../specs/2026-10-23-phase1-trusted-capture-next-design-brief.md) carries capture/stage/removal,actual child barrier and accounting questions into C3 preparation only. No speculative lease/hook implementation.

Ruling:resource subidentity includes resourceBudget and deadlineEpochMs,ordered full arrays for source/removed/retained;cost if wrong:preparation contract clarification,not wire/owner-map change.

Ruling:real symlink EPERM stays TODO/open acceptance;independent C2 proceeds sequentially with that limitation;cost:no file symlink refusal proof in this environment.

Ruling:author review follows the user's sequential/no-agent constraint;cost:no independent review guarantee. Original plan rulings also remain:byte protection is exact and fresh-checkout/CI still pending;all experimental evidence is retained under the user's preservation requirement. No deferred minors are claimed resolved.

## Final Fixture presentation correction

The final format check found new expected/report.json differs from project array wrapping. Preserved original five-file snapshot and first prefreeze/failed-format evidence; formatted only this new report. Parsed JSON is independently deep-equal before/after. c1-fixture-formatted-prefreeze.json freezes the final five files before renewed comparison; all source/request/context/stream/identity facts unchanged. The retained authoring recipe is:standard-library authoring,project-format expected JSON,freeze,then loader comparison. This is a new-Fixture presentation correction,not a rewrite of any predecessor Fixture or expected generation from observed output. Final c1-formatted-fixture-regression.log/exit supersede the prior matching regression;fresh result340 PASS/1 TODO,341 total,exit0;not a full root pass.

Explicit non-ignored Markdown formatting also changed only the new Fixture README presentation. c1-fixture-final-prefreeze.json pins all final five files before c1-final-baseline-comparison.json;all loader-read bytes unchanged from final18-file regression. Original snapshot retained. Existing document-format commands that used default ignores are not standalone Markdown proof;final-explicit-format.log is controlling. Watchdog/owner-EOF/EPIPE paths were inspected,not extra OS experiments;no claim of production failure qualification.
