# Phase 0.5 local closeout — 2026-10-22

## Postmerge CI conservation decision — 2026-10-22

User explicitly requests cancellation of automatic main workflow39708335128
and retention as follow-up work, not an immediate rerun. Exact mergeSHA4330157
and eventpush verified; normal cancel API accepted. Cancellation settlement is
recorded in the SAME ledger. TypeScript/Rust had completed SUCCESS; remaining
Native work must not be called passed. No workflow/gate/timeout is modified.

Future full postmerge Native verification is pending explicit cloud execution
approval and available budget; no schedule or automatic retry is created.
This does not invalidate the two successful premerge exact-head workflows or
verified tested/merge-tree equality. Phase0.5 acceptance with retained risks
stands; Phase1 detailed design may proceed. Phase1 implementation still requires
reviewed implementation-ready tasks and explicit user approval, and eventual
release/merge must satisfy the then-applicable checks. Cancellation is not a
standing waiver for future code changes or permission to bypass required CI.

## Final disposition: accepted with retained risks / normally integrated

User accepted the recorded historical risk, requested items2/3, then explicitly
confirmed normal PR21 merge including possible automatic main CI, without reruns.
PR21 was normally merged at **2026-10-22T01:54:03Z**:
`433015700c7c701a6493f7f8fa5eace00e773913` on main. Fresh REST verification
confirms CLOSED/merged=true, tested head
`cc5a8cb571986c5e56ed04053b2c96ef500fcacb`, first parent
`ee0a9199c02ed51f54521bf87489439a5e54e491`, and second parent equal to that head.
The merge tree and tested head tree both equal
`4b35ef9eddc49edfc410b0c6deb49eaea932915c`; no untested source delta was introduced
by integration. Evidence: `E/task8-r4-normal-merge-verified.json`.

**Phase0.5 closeout is accepted with P05-RISK-001/P05-ENV-001 retained.**
Original21 exit checks/ADR applicability,18 local gates,31-row Evaluation and
exact-head PR+push six required jobs/original22 hosted receipts remain the
acceptance basis below. No gate or timeout is waived. The four final parents
P05-W3-020/P05-W5-001/P05-W8-001/P05-W9-001 and total14 product tasks are integrated;
SAME Tasks7/8 acceptance/integration bookkeeping is complete in this local record.
Historical timeout root cause remains UNKNOWN, not resolved by this acceptance.

Merge automatically created main push workflow39708335128 at the merge SHA.
Last read: in_progress/conclusion=null, **not claimed successful**. This is the
confirmed merge side effect, not an agent-requested extra run or rerun. Existing
premerge mandatory checks are verified SUCCESS; no new postmerge numerical or
phase gate is invented. Any actual new failure must be recorded and assessed,
not automatically retried or concealed.

Phase1 may proceed to detailed design/task decomposition/review only. It remains
DESIGN-READY, not IMPLEMENTATION-READY; implementation needs the user's explicit
approval after review. No Phase1 code is changed. Final status/issue/review files
are local, uncommitted/unpushed; remote main contains the verified PR21 tree,
not these later bookkeeping edits. No state-only follow-up PR/push is created.

## Earlier local reconciliation and approval history

The following dated HOLD/proposal paragraphs record the sequence before the
explicit confirmation and successful merge above; they are not current blockers.

## Decision boundary

### Latest user disposition and integration check — 2026-10-22

User explicitly accepts [P05-RISK-001](PHASE05_RESIDUAL_ISSUES.md) as retained
historical risk, to be investigated later, and requests items2/3 (normal PR21
integration and formal closeout). The proposal below is therefore accepted as
that bounded risk disposition, not a timeout fix or numerical gate waiver.

Fresh Actions REST verification confirms exact head
`cc5a8cb571986c5e56ed04053b2c96ef500fcacb`, both workflows completed/SUCCESS,
all six jobs completed/SUCCESS; PR21 OPEN/unmerged, base
`ee0a9199c02ed51f54521bf87489439a5e54e491` on main, draft=false,
mergeable=true/mergeable_state=clean. A normal exact-head merge was requested
but execution was rejected by safety approval before the command ran, requiring
specific confirmation of the main-branch CI side effect. No merge occurred.
**Integration and final Phase acceptance remain HOLD on that execution approval;
historical-risk disposition is no longer awaiting a user decision.**
No cloud test was started or rerun by these read-only checks. Local documentation
is uncommitted/unpushed; final accepted Phase status must not precede verified
merge success. Older pending-risk language below records the pre-decision state.

**Technical evidence verified; formal integration and Phase acceptance HOLD.**
This is a local evidence/document reconciliation, not a new test run, a waiver,
merge authorization, or Phase1 implementation approval. It supersedes stale
current-status wording in older dated notes, not their original results.
No product, Fixture, profile, budget, timeout or acceptance threshold changes.
No cloud operation, new build, calibration or long test is part of this work.

Evidence base: `cc5a8cb571986c5e56ed04053b2c96ef500fcacb` on
`codex/p05-integrated-exit-audit`. Documentation edits made after this base are
local and uncommitted; they are not covered by a claim of hosted testing.
PR21 was OPEN/unmerged at the last recorded check; no fresh server read is
claimed by this local closeout.

## Completed evidence and traceability

`E` below means `.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/`
at the repository root. These are local retained evidence, not tracked assets or
portable links guaranteed to exist in a fresh clone. Keep them with the handoff.

| Obligation | Retained evidence | Result / limit |
| --- | --- | --- |
| Original 21 exit checks and four final product parents | [Exit-to-code/Fixture map](PHASE05_EXIT_AUDIT.md), [task ledger](WORK_BREAKDOWN.md), [acceptance](PHASE_ACCEPTANCE.md) | Original product integration PR20/`ee0a919`; this does not integrate PR21 |
| R4 complete local gates | `E/task8-r4-final-gates-summary.json`, `E/task8-r4-local-gates-audit.json`, individual original logs | 18 exits zero; root 1595/1594 pass/0 fail/1 existing Windows skip; registered REFRESH 707/707; Native114; memory27 |
| Persisted Evaluation | `E/task8-r4-actual-evaluation/report/report.json`, `E/phase1-startup-evidence-2026-10-22.json` | 31 rows, 21 incremental obligations; gates 1/1/1/1/0; deterministic report re-evaluation equal |
| Layer honesty and concurrency | Same original Evaluation and local audit | 28 Native-index + 2 recorded Provider/SQLite + 1 declared-source Native; workers1/2 semantic equality with observed different completion orders; not 31 public Native-index rows |
| Latest exact-head CI | [PR39609209947](https://github.com/tim-zxy/CodeAtlas/actions/runs/39609209947), [push39609203817](https://github.com/tim-zxy/CodeAtlas/actions/runs/39609203817); `E/task8-r4-actual-diagnostic-{pr,push}-native-raw.log` | Both attempt1 completed/SUCCESS; all six jobs SUCCESS, per completed-round record; no new CI requested |
| Latest clean-host original receipts | `E/task8-r4-actual-diagnostic-hosted-audit.json`, original `E/task8-r4-actual-diagnostic-pr-evidence/` | 22 admitted/0 fail; transaction/TEMP closed; 199 original exports checked; 17 scalar sidecars; peak347144192 <= approved394211328 |
| Exact artifact and approval | `E/task8-r4-actual-diagnostic-pr-artifact.zip`, `fixtures/ipc/refresh-v3/approved-transport.json`, v2 byte backup | Artifact12358281078 complete,293798148bytes; exact Release419263735/asset661693932; no reused partial download |
| Frozen identity and resource approval | `E/task8-r4-frozen-inputs.json`, `E/task8-r4-post-profile.json`, `E/task8-r4-record-preflight.json` | Product/Native/full2329 catalog and approved values retained; original qualification22/calibration320/holdout64 not rerun |
| Phase1 readiness boundary | [Startup review](../superpowers/reviews/2026-10-22-phase1-startup-review.md) | DESIGN-READY, not an approved implementation-ready task package; no Phase1 coding |

Four valid quiet gate logs (pack/build/IR-types/Rust-format) may be empty;
their recorded successful process exits, not nonempty output, are the evidence.
Node peak excludes the Native child; no combined-process or universal latency
guarantee is inferred.

## Reproducible local checks

From the repository root, the following inspect retained evidence without
running CI, Native replay, build or calibration:

```powershell
$evidence = '.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout'
Get-Content "$evidence/phase1-startup-evidence-2026-10-22.json"
Get-Content "$evidence/task8-r4-local-gates-audit.json"
Get-Content "$evidence/task8-r4-actual-diagnostic-hosted-audit.json"
Get-FileHash "$evidence/task8-r4-actual-evaluation/report/report.json" -Algorithm SHA256
Get-FileHash "$evidence/task8-r4-actual-diagnostic-pr-artifact.zip" -Algorithm SHA256
```

Expected Evaluation report SHA256:
`77f8dab1b2ca3dfcd627de767767951bd1c7e4413a4b89e650db3d47b569bf67`.
Expected hosted artifact SHA256:
`afa115175499922a62e98d18ceac04476f5c8e5f94353da867e3241c72c6a0bb`.
Latest hosted actual report SHA256 recorded by the strict original-receipt audit:
`775733b9c3b6f76eaaf9005f7ee194009092d415e8f7f47815616655acf66c1e`.

Additional audit-file hashes rechecked during this local document reconciliation:

| Local file in E | SHA256 |
| --- | --- |
| `task8-r4-actual-diagnostic-hosted-audit.json` | `6b4ca87b50dd7308040b0df1e8812afce62fd34c860d56bcad34ea1f344d05d4` |
| `task8-r4-local-gates-audit.json` | `27224f28c048228fa6d7fe3999f7233d86a5b1b3232e57f53fb94ca53dfd7eb9` |
| `phase1-startup-evidence-2026-10-22.json` | `4111c3253b540f27dc5e2cc35b002beb3f9e498cc612007a83f0104ea90d1d17` |

The startup evidence explicitly distinguishes current read-only revalidation
from historical test execution. No fresh whole-suite pass is claimed here.

## Remaining items — not automatically authorized

| Item | Can be completed locally? | Required next decision / action |
| --- | --- | --- |
| Current evidence index and consistent handoff status | Yes; this reconciliation supplies it | Review local documentation diff; do not push just to refresh status |
| Historical timeout disposition | Prepare proposal locally; cannot declare root cause or accept risk for the user | User decides whether to keep the reliability investigation open as an acceptance blocker or request a governed residual-risk disposition for review |
| PR21 normal integration and server conditions | No; explicit confirmation required | A merge may trigger additional Actions. Confirm cloud scope/cost before any merge, push, rerun or dispatch |
| Formal Phase0.5 acceptance and four-parent/Phase ledger final state | Not yet | After approved risk disposition and normal integration, verify exact merge/base/head and synchronize acceptance; do not pre-mark complete |
| Phase1 detailed design/task review | Local design only, separate from promotion | Use startup review's gaps and existing specs; obtain approval of implementation-ready package before coding |

### Residual-risk proposal, not an accepted waiver

Keep the original `1dfe01a` push Native10000ms d-overlay-retention TIMEOUT as an
unexplained historical failure. Preserve its original receipts, triage, logs and
failed artifact alongside the later successful run. The successful ~2079ms
Native close in the latest diagnostic window did not capture the failure window
and cannot prove a fix, host cause or flakiness. Earlier offline10000ms and
outer60000ms failures, and R3 valid fresh READ_SEAL exceedance/withdrawn paired
profile, also remain historical evidence, not overwritten by new green results.

Recommended next step is review of this bounded evidence/risk statement, with
**zero additional CI now**. If accepting residual uncertainty would change an
existing mandatory exit obligation, first submit and approve the corresponding
Design Change Proposal/ADR and synchronize acceptance/traceability. This document
does not lower any gate or silently convert an unresolved blocker to acceptance.

The local R4 d-overlay-retention working DB is post-trial, not pristine or
reusable: a scratch restoration-control assertion failed after a successful
Native operation. Expired process-local ownership must not be recreated or
bypassed. Preserve DB/raw outputs; immutable seed/archive/catalog remain valid.
Do not manually restore/adopt/overwrite it or rerun for cleanup.

No Phase1 feature, Deferred scope, new numeric threshold, automatic retry or
cloud budget change is introduced. Local document completion is not Phase
completion. Phase promotion remains HOLD pending the decisions above.
