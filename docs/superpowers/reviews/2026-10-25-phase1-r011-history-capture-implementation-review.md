# H1 R011 final local implementation review — 2026-10-25

Verdict: **LOCAL_R011_HISTORY_STORAGE_CAPTURE accepted locally**. T1–T4 are complete within the user-approved component envelope and accepted full/transition clarification. This is an author review, not an independent review; no merge, production routing or Phase1 acceptance is claimed. The intermediate HOLD review below is retained as history; its open H1 findings are closed by this section and the fresh evidence.

## Fresh final evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Storage build | h1c-final-storage-build | exit0 |
| Exact approved59-file sequential Node cohort | h1c-final-scoped-regression |1467PASS/0FAIL/0SKIP/0TODO/0cancelled;86482.6788ms |
| Architecture dependency gate | h1c-final-architecture |17projects PASS |
| Independent Fixture/registry/provenance | New oracle included in finalcohort |31cases/12families/65files;registry53/exactPhase1 27/newID once/catalog0 |
| Protected old data/contracts | Final scope verification and receipt |636 predecessor Fixture files and released migration prefix unchanged; four root tests appended exactly |

Exact commands, actual exit codes, logs, prior failures, snapshots and final hashes are in .superpowers/sdd/2026-10-25-phase1-r011-history-capture/. The final1467 run includes all latest fixes, the full/delta clarification, real-four-writer controls and genuine R010 Native fixture setup. Earlier1446/264 results are historical subsets, not the final proof.

## Contract and scope

R011 adds exactly five STRICT tables, four indexes and41triggers. Existing R001..R010/W001..W003 are unchanged. SQL is unreleased local work and has only run on new owned component databases, not a user repository or R4. There is no backfill/down migration, production history writer, Stage/Store/Runtime route, raw mapper, public package-index export or actual-run authentication. Existing SQL writers retain their application validation and transaction behavior; R011 invalidation is additive and explicitly approved.

transitions=null now declares FULL establishment, including complete re-establishment with optional exact committed parent. DELTA requires TRANSITION_DRAFT, exact parent activation and loaded oldBasis, same repository/revision, and current-state Source triple. NO_OP_DRAFT cannot persist as a new activation. These are storage declarations: no field, digest, COMPONENT_FIXTURE_ONLY label or returned handle authenticates an analysis run or full-provider revalidation. Those remain H4/H5 duties.

## Acceptance and traceability

| Fixture family | Implemented check and reproducible verification |
| --- | --- |
| R01 migration | Actual original migration runner;fresh10→11,repeat,all50DDL failure boundaries,too-new and lock refusal;disk reopen preserves pre-upgrade data/version |
| R02 constraints | Five STRICT tables/four indexes;8immutable UPDATE/DELETE refusals;FK/unique/digest/JSON checks without disabling guards |
| R03 legacy writers |33valid SQL event commit/rollback controls plus8actual validated Store tests:generic full/patch and Native full/patch each with AVAILABLE component history and a real capture handle;commit clears pointer;injected failure observes zero pointer inside transaction then restores full persistent image/handle |
| R04 old reader | Genuine verified R001..10 fixtures;original R010 public views/readplans/minima/errors preserved;version11 still refused by old API;private schema11 mode returns data only |
| R05 encoding | Existing historyCompare UTF16 ordering and integer-key/non-BMP literal vectors;Code SQL binary encoding unchanged;duplicate-key/noncanonical/hash/id failures retained |
| R06 manifests | Exact selected Code/each original support+candidate/full snapshot registry/coverage;first-full/re-establishment/delta positives and parent/basis/target/NO_OP negatives;Native zero-fact unit census |
| R07 Syntax | Original/current identities,source/selected-node supports,retained earlier basis and exact ancestor context;members/projection/origin drift rejects |
| R08 handles | Owner database/incarnation/private identity;clone/proxy/getter/cycle/wrong-db/ambient transaction/release/close-reopen;own recheck failure permanently revokes while foreign failures preserve genuine owner |
| R09 admission | One cumulative explicit budget;numeric admission beforeTEXT;independent SQL-row observation and literal encoder bounds;depth/overflow/unsafe controls;legacy and R011 raw/decode UTF8 byte mismatch refuses |
| R10 target versus active | Validated Source CAS preserves immutable history/pointer but changes target and invalidates old capture;legacy Code mutation/restoration cannot revive pointer/handle |
| R11 recovery | Readonly before/after persistent images;actual disk close/reopen;generic Store commit/rollback images after reopen;no claim of H4 process crash or unknown-commit recovery |
| R12 integration | One strict Fixture manifest;all64payload/provenance checks plus65-file freeze;exact registry and root suffix;old IDs/catalog0/architecture boundaries retained |

Full-reader dynamic budget minima are compatibility observations, not independent goldens or profile numbers. Encoder bounds derive from independent literal values; SQL row counts derive from actual deliveries. Logical memory accounting does not qualify heap/RSS/deadline or true Runtime admission.

## Review findings and rulings

All known Critical/Important H1 findings are fixed; no deferred minor finding. Retained RED→GREEN evidence covers parent/draft errors, persistedNO_OP, zero-fact census, full unused snapshot omission, duplicate Source path/selected FactKey, and UTF8 accounting. Existing IR clock validation is reused. The earlier UTF8/scalar-order assumption was an author error, corrected to the accepted existing UTF16 comparator; all earlier raw fixtures/diagnoses remain available.

Ruling: user-selected sequential existing session/no agents/no Git writes/no cleanup overrides skill defaults;author review is weaker than a separate reviewer. No independent review or integration is claimed.

Ruling: genuine R010 legacy tests require verified migration prefixes and real independent connections, not latest schema relabeled10. Additional two Native fixture setup sites were corrected when R03 exposed them;their original snapshots and failed test are retained. This is a version-target test repair,no production Store/session/IR/migration-runner change. Cost if wrong would be unrepresentative legacy compatibility;the final original suites and explicit genuine10→11 controls pass.

Ruling: mode11-only owned decoded entries/full snapshot metadata avoid a second SQL decoder. They confer no authority, are privately returned and cumulatively charged;mode10/public interface is unchanged. Cost if wrong would be membership/admission error;original literal/readplan/budget and full-registry tests pass.

The Native-full test initially used the permissive history-test allowance, which the existing Native metadata validator correctly rejected. It now reuses the exact existing Native component allowance;no new profile/default/threshold was invented. The failed setup log and incidental UTF8 editing/locator errors are retained,not counted as product RED or successful evidence.

## Remaining work outside H1

H2/H3 raw-to-Canonical Syntax mapping/confidence annex remains DESIGN_BLOCKED and must be designed before implementation. H4 production writer/Stage/Store/crash/unknown-commit and H5 authentic execution/profile qualification are not implemented or authorized here. B1-B2/C/D/P1-04/05 and Phase1 exits remain OPEN. No Deferred scope or Canonical publication was added.

Provider-independent IR,SQLite authoritative,LLM candidate-only,AUTO/MANUAL and ExecutionGraph→RuntimeFlow→BusinessFlow remain unchanged. No actual Native binary/acquisition helper/Rust/measurement/calibration/cloud CI/cloud write/Git mutation/new dependency/numerical gate/user orR4 DB action. C1symlinkEPERM OPEN;fourC2lifetimes spent;Native timeout UNKNOWN;main39708335128 cancellation unqueried. Existing local changes/EOL and all evidence are preserved.

---

# H1 R011 history storage/capture — intermediate implementation review

Date: 2026-10-25. Verdict: DESIGN_HOLD / NOT_ACCEPTED. This is an author review in the user-selected sequential session, not an independent review. No merge or production-readiness claim.

## Implemented scope

The approved T1–T4 package has local R011 additive five-table/four-index/41-trigger migration, a private shared R010-compatible read kernel, a private bounded R011 history/Syntax reader and connection/incarnation-bound handles. Exactly four local test registrations and one independent component Fixture were added. There is no production history writer, Stage/Store/Runtime route, raw Syntax mapper, public package-index export or run qualification.

The old R010 public capture retains its schema10-only behavior. Genuine R010 test databases use verified migrations1..10 rather than spoofed user_version; real validated Apply/Source workflows remain. Latest-schema structural test expectations now include11; a too-new12 fixture is structural, not a release or numerical Quality Gate. Released migrations1..10 and all636 predecessor Fixture files remain unchanged. New independent Fixture:31 cases/12 families/65 files; all65 match the latest freeze.

## Fresh evidence and limits

- Storage build exit0 after the latest fixes: t4-review-fix-build.
- Approved59-file sequential local regression:1446PASS/0FAIL/0SKIP/0TODO/0cancelled, t4-predecision-scoped-regression. This run predates the final Source-path/FactKey uniqueness fixes and does not alone prove the newest revision.
- After those fixes: four affected Storage files264PASS/0FAIL/0SKIP/0TODO/0cancelled, t4-review-fix-storage; architecture17PASS, t4-review-fix-architecture.
- New independent oracle plus the two adjusted predecessor oracles95PASS; registry53/exactPhase1 27, all named old history/candidate fixtures retained, Syntax profile catalog0. Only old structural totals/titles changed.
- Earlier R010 compatibility gate207PASS; final focused264 includes the original R010 capture, new kernel, migration and new history suites. No changed old literal/budget golden.

Exact commands/exit codes/logs are retained under .superpowers/sdd/2026-10-25-phase1-r011-history-capture/. Whole-capture rows are independently checked against SQLite deliveries. Encoder byte/item exact-one-below values come from independent literal values. Whole-reader dynamic minima are compatibility observations, not independent goldens or new profiles. These tests do not qualify RSS/heap/deadline, real Native execution, authentic observations, all-provider full establishment or production Stage/Store recovery.

## Findings and dispositions

Important, fixed with retained RED→GREEN evidence: parent revision mismatch; shallow transition nested validation; missing Native zero-fact census; SQL malformed UTF8 decoded byte census mismatch in schema11 only; subset-only full snapshot registry check; duplicate historical Source path and selected FactKey. Existing IR already rejects reversed snapshot clocks and is reused.

Important, corrected implementation/author error: the DCP requires existing historyCompare, which is UTF16, not UTF8/scalar order. The earlier scalar-order diagnosis was wrong. Non-BMP key literal first failed, then passed after restoring existing comparison; the original independent Unicode node order was restored and historical support ordering corrected. SQL Code identity retains its original binary order; membership comparisons normalize history data separately. All prior65-file versions and failed diagnostics remain preserved. Latest fixture-existing-order-complete-freeze.json is controlling; older freezes are historical, not discarded.

Important, OPEN: DCP3.2 first-full-only transitions=null conflicts with legacy pointer invalidation/full re-establishment and optional audit ancestry in sections2.1/7. The [local clarification proposal](../specs/2026-10-25-phase1-history-full-transition-clarification.md) is PROPOSED, not implemented or accepted. Parent/draft establishment-kind semantics and persisted-NO_OP refusal cannot be signed off until this is resolved. Current components remain declarations, not authenticated establishment proof. Do not fabricate a transition or claim a schema-valid fixture establishes actual qualification.

Important, remaining acceptance work: after the decision, complete the linked full/delta/no-op relation cases, review the R03 real-four-writer plus qualified-pointer combination coverage (33 actual SQL event commit/rollback controls and old writer regressions alone are not that combined qualification), rerun the declared affected/final scope as justified, and seal a final verification receipt. T3/T4 and the aggregate H1 Exit are OPEN. This intermediate checkpoint is not that receipt.

## Rulings and deferred work

User-selected existing session/worktree, sequential execution, preserved evidence and no Git writes override skill defaults for new worktrees, agents, commit helpers and workspace deletion. Author review is weaker than a fresh independent reviewer; no independent review is claimed.

The private mode11 receipt includes the same guarded decoded records/full snapshot metadata, rather than duplicating a SQL decoder. It remains data-only, has no handle/transaction authority, is charged in the cumulative allowance and is not exported from the package index. Cost if wrong: logical-memory admission or persisted membership comparisons could be inaccurate; explicit limits, full-registry and compatibility tests address that risk.

No minor correctness finding was set aside as a polish task. Deferred phase work remains H2/H3 mapping/confidence, H4 production Stage/Store/crash recovery and H5 authentic execution/profile qualification, all separately governed. No new dependency, threshold, profile, Native/Rust/helper/measurement/calibration/cloud CI/cloud write/Git mutation or user/R4 DB operation. C1 symlink EPERM OPEN; four C2 lifetimes spent; Native timeout UNKNOWN; main39708335128 cancellation unqueried. All Phase1 parent/exit gates remain OPEN.
