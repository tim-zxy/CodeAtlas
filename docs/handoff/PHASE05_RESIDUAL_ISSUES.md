# Phase0.5 residual issues — accepted disposition 2026-10-22

## P05-FOLLOWUP-002: postmerge Native re-verification deferred by budget decision

User explicitly requests cancellation of automatic main run39708335128 at
merge433015700c7c701a6493f7f8fa5eace00e773913, and recording it for later execution.
Cancellation API accepted; final settlement is in the SAME ledger. TS/Rust had
passed; remaining Native regression/memory/exact-pack steps are not a pass claim.
No new failure or historical-cause explanation is inferred from cancellation.
Revisit after explicit cloud approval and budget availability, not automatically
and not as a new mandatory Phase1 feature. Existing premerge six-job SUCCESS /
strict original22 audit and exact merge-tree equality remain the acceptance basis.
Phase1 detailed design can proceed; coding needs approved reviewed task packages.
Future changed code still requires applicable gates; no permanent CI waiver.

Integration update: after separate explicit confirmation of possible main CI,
PR21 normally merged as433015700c7c701a6493f7f8fa5eace00e773913. Phase0.5 accepted
with the open issues below, not with a cause/fix claim. No retry or new experiment
is authorized. [Verified closeout](PHASE05_CLOSEOUT.md).

## P05-RISK-001: historical Native timeout cause unresolved

**Investigation OPEN; explicitly accepted as a non-blocking historical risk for
Phase0.5 closeout by the user on 2026-10-22. Not fixed.**

User decision: “事项1 遗留，写入相关文档，后续再解决；进行事项2 、3操作”.
This accepts retaining the issue while normally integrating PR21 and completing
the Phase0.5 acceptance record. It does not approve another CI experiment, a
timeout increase, a weakened gate or Phase1 coding. Required current-head checks
must still genuinely pass and normal server merge conditions must hold.

### Evidence and applicability

- Historical head `1dfe01a328ef5b38b401c8b31e7ab09bdd8841db`, push39561976606
  attempt2: d-overlay-retention original admitted receipt reports Native10000ms
  TIMEOUT;21 other actual rows valid. Worker exit0, transaction/TEMP closed,
  peak173522944 below394211328, failed result equals seed. This was neither an
  outer60000ms timeout nor an observed memory-limit exceedance. Deeper cause is
  UNKNOWN; original failed-window lifecycle timings are absent.
- Latest tested `cc5a8cb571986c5e56ed04053b2c96ef500fcacb`: both PR39609209947
  and push39609203817 attempt1 completed/SUCCESS, all six jobs SUCCESS. Strict
  original hosted22-receipt audit PASS; the diagnostic successful window does
  not establish why the old window failed or prove a fix.
- Earlier offline10000ms and outer60000ms failures and R3 fresh READ_SEAL
  exceedance/withdrawn paired profile remain retained, separately classified
  history. No historical failure is relabelled passing or attributed to a host,
  parser or flakiness without evidence.

Full evidence index: [PHASE05_CLOSEOUT.md](PHASE05_CLOSEOUT.md).
Local E directory (defined there) retains original success/failure artifacts,
`task8-r4-overlay-failure-triage.json`, both current Native raw logs and
`task8-r4-actual-diagnostic-hosted-audit.json`. Do not re-download or overwrite.

### Follow-up contract

Owner: project maintainer / next explicitly authorized reliability task.
No investigation deadline or automatic retry is invented. Reopen investigation
on a genuine recurrence or an explicit user request, retaining the original
case/input/identity and failure window. First classify implementation, Fixture,
environment or identity from original receipts and lifecycle evidence; propose
a bounded reproducible investigation before spending additional Actions.

Resolution requires evidence for the causal failure and a reviewed correction
with declared regression/recovery gates. If a correction changes frozen product,
helper, Native or corpus identity, follow the existing qualification, measurement,
independent holdout and separate numeric-approval rules. Changes to frozen design
need ADR/Design Change Proposal approval. No numeric/timeout/quality policy is
changed by this disposition, so no replacement architecture ADR is enacted here.

This reliability follow-up is not a DEFERRED product capability, a new mandatory
Phase1 feature, or permission to introduce future-phase scope.

## P05-ENV-001: preserved post-trial local mutable replay state

The local R4 d-overlay-retention working DB is not pristine/reusable after a
scratch restoration-control assertion failed following a successful Native
operation. Original process-local ownership has expired. Preserve DB and raw
outputs; do not forge ownership/receipt, adopt, overwrite, manually restore or
rerun for cleanup. Immutable seed/archive/catalog evidence remains unaffected;
the latest cloud acceptance used a fresh exclusive installation.

Future local replay needs a separately authorized valid fresh campaign and the
existing ownership rules; this disposition grants no new layout/root or sampling
permission. This environmental limitation is disclosed, not a proved product
rollback failure and not a new mandatory Phase1 dependency.
