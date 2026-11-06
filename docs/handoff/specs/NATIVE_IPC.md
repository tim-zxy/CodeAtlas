## Approved dynamic-binding V2 offline implementation - 2026-11-05

User explicitly approved the independent-coordinator/fixed-HOST-attester proposal
for offline implementation/substitutes. [Exact private contract](../../superpowers/specs/2026-11-05-dynamic-binding-offline-contract.md)
adds a separate bounded V2 REGISTER/BOUND then strict INTENT/READY lane and distinct
SURFACE_V8 role, preserving V1/V5. Application retains operation authorization.
Independent expected artifacts, genuine issuer origin and lifecycle are required;
JSON/hash receipt is not authority. Live module/OS/channel admission, real runs,
rights, physical formulas/values and Phase1 acceptance remain unapproved/open.

## B-F2-B固定7/Syntax3管线有限本地交付 — 2026-10-30

用户已批准[完整后继设计](../../superpowers/specs/2026-10-30-phase1-binding-sufficiency-pipeline-design.md)及J1–J5。J1–J5现已达到B_F2B_BINDING_PIPELINE_LOCAL_EXIT；[范围、Fixture、失败与准确门禁](../../superpowers/reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)。新域/固定表面支持策略条件适用及持久集合闭包经本地验证；旧版/SQL11保持。库/声明式Store出口不授CLI/物理/语义发布资格，父任务/Phase1保持OPEN。

## B-F2-A精确合同有限本地交付 — 2026-10-30

用户已批准[wire7/Syntax3/context4与严格领域草稿合同](../../superpowers/specs/2026-10-30-phase1-binding-sufficiency-contract.md)及C1–C4本地实施；旧版本/历史保持，不授权producer/四规则/分数/发布或真实运行。已完成B_F2A_BINDING_CONTRACT_LOCAL_EXIT；[范围、Fixture、准确门禁与作者审查](../../superpowers/plans/2026-10-30-phase1-binding-sufficiency-contract.md#实施结果与作者整包审查--2026-10-30)。有限出口不关闭父任务4/21及Phase1。

## B-F1-D已批准：仅Python v6 CALL_RESULT例外 — 2026-10-30

用户已批准[局部DCP](../../superpowers/specs/2026-10-30-phase1-call-result-coverage-design.md)：只有binding v6的UNKNOWN(CALL_RESULT)不单独令Syntax PARTIAL；其他unknown/遗漏/失败、v4/v5及Java保持，完整发布门禁不降低。B0b§4.2动态值规则的此例外仅适用新v6，旧r1不能重标；不改IR/SQL/分数/profile或生产资格。D1–D3已完成有限库组件出口；[准确结果/原失败及作者审查](../../superpowers/plans/2026-10-30-phase1-call-result-coverage.md)。实际direct完整、nested仍拒绝；Rust集中15/16后获批矩阵定向1/1，不冒称整批重跑；父任务4/21及Phase1 OPEN。

## B-F1-C版本化历史本地交付 — 2026-10-30

新增固定私有v6→History组合；Binding工厂精确要求native / syntax-v1 / syntax-canonical-mapper-v2 / SYNTAX_BINDING_V2 / syntax-surface-support-v1，含raw-free分支。旧v5入口与生产请求路由不变；PARTIAL拒绝。 具体批准、Fixture、最小门禁和限制见[实施结果](../../superpowers/plans/2026-10-30-phase1-binding-history.md#实施结果与作者审查--2026-10-30)。旧pending快照仅为历史。

## B-F1-B库级绑定观察已交付 — 2026-10-30

用户已批准S1–S4与MODULE兼容澄清；[实施结果/准确证据/作者审查](../../superpowers/plans/2026-10-30-phase1-binding-observation.md)为本次范围依据。固定Rust v6库AST→原始字节流→TS完整校验→Canonical v2/Evidence支持→Plugin V3两条实际桥已通过；MODULE null范围仅凭显式同basis文件/path/fingerprint证明，owner/scope均保持。原v4/v5/V1/V2严格行为及History/SQLite/生产边界不变。

最终组件437/437、Rust库14/14及protocol内存18/18、注册35/35、架构17项目、三包构建/IR类型和命名格式通过；只接受B_F1B_BINDING_OBSERVATION_LIBRARY_EXIT。作者审查不是独立评审；无CLI、独立harness/helper/collector、CI、Git写入或新数值/依赖。父任务仍4/21，完整History/框架语义/生产资格/E01/E02与Phase1 OPEN，A6 NOT_QUALIFIED及原风险保留。旧pending文字仅为历史快照，不能据本段替代逐项证据。

## A-runtime 本地实施更新；protocol 最终门禁 OPEN — 2026-10-29

用户已明确批准 D1–D4/T1–T6 本会话顺序实施。Source受控核验、Stage累计账本、v5分发代码/原始流和私有进程屏障已实现；当前 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**，不是全包验收通过。最新本地组件107 PASS/1 TODO、注册360/360、纯IPC176/176、Stage333/333、Rust指定库29/29、架构17项目、构建/类型/精确格式通过。文件symlink因EPERM为TODO/C1 OPEN。

Rust protocol内部测试最终复验在link.exe LNK1104失败，未执行；一次独立构建目录对照在依赖链接LNK1105/1224失败。准确根因UNKNOWN，不自动重试、不称已修复/flaky；旧T4的18项GREEN不冒称最终门禁。详见[作者实施评审](../../superpowers/reviews/2026-10-29-phase1-runtime-local-readiness-review.md)，准确证据根 `.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。未新增独立评审。

实施细节以评审及实际源码为准：native-client私有aliases是default对象成员，避免既有export-star将named aliases公开；lifecycle类型模块内，public index/options保持。私有raw consumer可接既有caller limits；Source parsed副本解析前预付；Stage account拒绝ambient事务。这些是获准私有边界的缺陷修正，不增加公开契约或数值。实际protocol筛选为`protocol::`（包含新增mixed_v5_tests），旧计划`protocol::tests`仅能选旧模块；Source旧控制的准确命令见attempt3 receipt。

无真实Native、额外acquisition helper/collector/model、新目的schema/profile值/依赖、云端CI或Git写入。既有G13 Node模块隔离进程如实记录。全Source选择/Python扫描、实际归因/运行资源与H5仍OPEN，主任务4/21接受、17未关闭；空catalog继续拒绝。历史timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。原前任10315摘要未覆盖Source，本包单独保留Source原字节并补入继任封存；不声称原摘要覆盖整仓。下方旧“未实施/REVIEW_PENDING”保留为历史，由本补记限定范围替代。

## A-runtime D1–D4 / T1–T6 已批准 — 2026-10-29

用户明确批准Source核验/Stage累计记账、v5分发及原始流、私有进程输入屏障及配套本地组件实施包，本会话顺序实施，不逐任务确认。状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION，尚无实现/新测试通过声明。无真实Native/额外Node helper/collector/model、profile/新目的schema/数值/依赖、云端CI/Git写入授权。全Source选择范围/Python扫描/实际归因与H5仍OPEN，主任务4/21接受、17未关闭。下方REVIEW_PENDING为保留历史；本补记只提升本次明确范围，不接受§8未知目的或完整运行资格。

## M-01/M-02 offline preparation accepted locally — 2026-10-25

User explicitly approved both offline preparation packages. M-01 T1–T3 and M-02 D1–D2 are complete only as LOCAL_MAPPING_ORACLE_PREPARATION / LOCAL_CONFIDENCE_EVIDENCE_PLAN. [Corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [evidence protocol](../../superpowers/specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md) and [author implementation review](../../superpowers/reviews/2026-10-25-phase1-syntax-mapping-preparation-implementation-review.md) record the exact scope and gaps. This current entry supersedes the historical planning-pending/not-started entries preserved below; it does not authorize product H2–H5 or a numerical confidence policy.

Fresh exact 16-file local closure: **488 passed, no failed/cancelled/skipped**, architecture **17 projects passed**. Registry **54 total / 28 Phase1 / catalog0**. All 3096 predecessor hashes matched at start; 3072 protected files including all 701 old Fixture files and existing compiled artifacts remain unchanged. Two root tests and one Fixture were added; three old oracles have only three structural substitutions each. The 34 cases/31 classification rows are declarations, not measured observations or sample-sufficiency gates. All measurements, thresholds and numericalPolicy remain null.

Evidence: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/implementation-verification.json`, exact logs, original document snapshots and freezes. An authoring coordinate defect was diagnosed with retained producer examples, proved RED and corrected under an explicit successor freeze; the first raw corpus/freeze remains preserved. No product source/schema/migration/dependency/profile/build/DB/Native/calibration/cloud/Git mutation occurred. Review was author-only under the sequential constraint. H1 local acceptance stands; full H2/H3 DESIGN_BLOCKED, H4/H5/Phase1/P1-04/05 gates OPEN, confidence policy NOT_SELECTED. C1 EPERM/C2 lifetimes spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable DB restrictions persist. Next: review the evidence protocol before separately approving any actual evidence operation or numerical strategy.

## Mapping direction accepted; M-01/M-02 preparation plans pending — 2026-10-25

User approved the nonnumeric Syntax mapping direction (field/ref closure,syntaxKey/extractionVersion,ambiguity handling and missing-policy refusal) and task-package refinement. The [M-01 preparation plan](../../superpowers/plans/2026-10-25-phase1-syntax-mapping-preparation.md),[M-02 evidence plan](../../superpowers/plans/2026-10-25-phase1-syntax-confidence-evidence.md) and [author plan review](../../superpowers/reviews/2026-10-25-phase1-syntax-mapping-preparation-plan-review.md) define exact Fixture/loader/offline oracle,classification/protocol,registration diffs and future15/16-file local checks. Concrete plans REVIEW_PENDING;T1–T3/D1–D2 NOT_STARTED. This supersedes earlier direction-PROPOSED wording only;no score/policy value or product mapper is approved.

FullH2/H3 remains DESIGN_BLOCKED;H1LocalExit stands,H4/H5/Phase1 gates remainOPEN.3068predecessor hashes matched at start;actualregistry53/exact27/current701Fixture bytes unchanged. Future54/28 follows a single plannedmanifest,not a passed result or numericalgate. This turn only writes plans/review/status: no product/Fixture/test/registration/build/DB/Native/Rust/helper/calibration/profile/number/dependency/cloud/Git mutation or newworktree/session/agent. ExistingIR/SQLite/LLM/AUTO-MANUAL/flow/Deferred and C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4 restrictions remain. Originalbytes/EOL and raw failures follow intact.

## H2/H3 Syntax mapping proposal; no numerical policy selected — 2026-10-25

The [mapping/confidence annex](../../superpowers/specs/2026-10-25-phase1-syntax-mapping-confidence-design.md) and [author design review](../../superpowers/reviews/2026-10-25-phase1-syntax-mapping-confidence-review.md) are PROPOSED,not accepted implementation authority. They specify raw→Canonical field/reference closure,provider-independent syntaxKey/extractionVersion,original/current separation and explicit missing-policy refusal. No score/default/threshold is chosen;Code confidence and structuralFixture values do not qualify a newSyntax policy. Full H2/H3 remains DESIGN_BLOCKED pending this direction review and separate numerical-policy evidence/approval. H4/H5 remain outside authorization. Next requested scope is M-01 nonnumeric mapping/independentcorpus task-package and M-02 classification/evidence-plan refinement,not coding.

H1 LOCAL_R011_HISTORY_STORAGE_CAPTURE remains accepted;3045 sealed predecessor files matched at design start. Its1467Node/build/architecture17 evidence is historical,not rerun. This turn changes documentation only:no product/Fixture/registration/build/test/DB/Nativebinary/acquisitionhelper/Rust/profile/number/dependency/cloud/Git changes. ExistingIR/SQLite/LLM candidate-only/AUTO-MANUAL/flow and Deferred gates remain controlling;P1-04/05/Phase1 exits OPEN,C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4untouched. Originalbytes/EOL and raw failures follow intact.

## H1 local storage/capture accepted; Phase1 exits still open — 2026-10-25

T1–T4 are locally complete as LOCAL_R011_HISTORY_STORAGE_CAPTURE,including the explicitly approved full/transition clarification. Fresh exact59-file sequential Node regression1467PASS/0FAIL/0SKIP/0TODO/0cancelled;Storage build exit0;architecture17PASS. [Final author review](../../superpowers/reviews/2026-10-25-phase1-r011-history-capture-implementation-review.md) maps R01..R12 to real migration/rollback/readonly/reopen/SourceCAS/encoding/handle/budget/actual-four-writer evidence and records limitations. Independent31-case/12-family/65-file Fixture;registry53/exactPhase1 27/newID once/catalog0. Finalreceipt:.superpowers/sdd/2026-10-25-phase1-r011-history-capture/implementation-verification.json. EarlierHOLD/NOT_STARTED/1446/264 sections below are historical;original bytes and failed evidence remain preserved.

R011 five-table/four-index/41-trigger migration and private history reader are local,unreleased work. Old R010 capture remains schema10-only with original views/readplans/bounds. Existing released migrations and636 predecessor Fixture files are unchanged. FULL=null may retain an exact committed parent;DELTA must be TRANSITION_DRAFT with exact loaded parent/basis and current-state Source;NO_OP creates no history. This grants no actual-run/full-provider authentication or publication. Provider-independent IR/SQLite authority/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow remain controlling. H2/H3 mapping/confidence DESIGN_BLOCKED;H4/H5 not implemented/authorized;B1-B2/C/D/P1-04/05/Phase1 exits OPEN. No Native binary/acquisition helper/Rust/calibration/profile/new numbers/dependencies/cloud/Git/userDB/R4 action. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried unchanged.

## Approved H1 full/transition clarification — 2026-10-25

User accepted the local full/transition clarification. In R011, transitions=null declares FULL establishment, including complete re-establishment after legacy pointer invalidation, with optional exact committed parent. Non-null must be TRANSITION_DRAFT referencing the actual parent's activationId and complete oldBasis; targetSource equals the current state's Source triple. NO_OP_DRAFT is not persisted as a new activation. These are storage declarations, not authentic-run/full-observation authority; H4/H5 qualification remains separately governed. This supersedes the first-full-only/nullability HOLD wording, not any validation or Phase gate. Implementation/remaining conformance and final acceptance are still OPEN.

## H1 implementation checkpoint; establishment semantics on hold — 2026-10-25

The user approved the concrete T1–T4 local package. R011 migration/private read kernel/history capture and four test registrations are locally implemented, with independent31-case/12-family/65-file component Fixture; this supersedes earlier NOT_STARTED/plan-pending status only. [Intermediate author review](../../superpowers/reviews/2026-10-25-phase1-r011-history-capture-implementation-review.md) records1446PASS in the approved59-file scope before final uniqueness fixes; after those fixes, fresh Storage build, affected264PASS and architecture17PASS. Registry53/exactPhase1 27/catalog0;636 predecessor Fixture files unchanged. These are scoped component results, not H1/Phase1 acceptance.

T3/T4 and LOCAL_R011_HISTORY_STORAGE_CAPTURE remain OPEN. The [full/transition clarification](../../superpowers/specs/2026-10-25-phase1-history-full-transition-clarification.md) is PROPOSED: DCP3.2 first-full-only null conflicts with legacy invalidation/full recovery and audit ancestry. No changed nullability/establishment semantics or new authority is applied pending explicit approval. Remaining relation and real-writer/qualified-pointer conformance must finish before final acceptance. H2/H3 mapping/confidence BLOCKED; H4/H5 not authorized. Existing provider-independent IR/SQLite/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow and all gates remain controlling. No Native/helper/Rust/calibration/profile/new numbers/dependencies/cloud/Git/user DB/R4 operation; C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried unchanged. Raw evidence and original document bytes follow intact.

## H1 storage/capture design accepted; concrete plan pending — 2026-10-25

User confirmation accepts H1-specific R011 history storage/capture choices: additive five-table/41-trigger schema, conservative legacy pointer invalidation, backupRequired=false/no-backfill/no-down, and independent bounded schema11 capture while original C3-A remains R010-only. The [T1–T4 implementation plan](../../superpowers/plans/2026-10-25-phase1-r011-history-capture.md) and [author plan review](../../superpowers/reviews/2026-10-25-phase1-r011-history-capture-plan-review.md) define exact files/interfaces/independent Fixture, real R010 legacy test setup, compatible private read-kernel extraction, connection-bound history handles and local SQLite component tests. Concrete plan REVIEW_PENDING; all implementation NOT_STARTED. H2/H3 mapping/confidence annex remains DESIGN_BLOCKED; H4/H5 Stage/Store/actual run not authorized. Earlier detailed-design-pending wording is historical only for the accepted H1 scope.

Plan requests one isolated local test envelope: newly owned memory/temp disk DBs for migration/rollback/readonly/disk close-reopen, explicit component-only literal seed, no user DB or R4; final59 named Node files + Storage build + architecture. No product/SQL/Fixture/test/build/cache/DB/Native/helper/Rust/profile/numeric/dependency/cloud/Git mutation this turn. Targetregistry53/exactPhase1 27 follows one planned manifest, not newpassed evidence or numericalgate; actualcurrentregistry52/26/catalog0 unchanged.

2321 predecessor hashes matched at planning start;15 original document snapshots retained. Evidence:.superpowers/sdd/2026-10-25-phase1-r011-history-capture/plan-review.json. Prior810Node/build/architecture17 historical,not rerun. Only future LOCAL_R011_HISTORY_STORAGE_CAPTURE acceptance is requested; B1-B2/C/D/P1-04/05/Phase1 OPEN. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4untouched. Original bytes/EOL follow unchanged.

## Joint direction accepted; detailed R011 contract proposed — 2026-10-25

User confirmation accepts joint history/raw/Stage design with sequential implementation packages. The [detailed DCP](../../superpowers/specs/2026-10-25-phase1-r011-history-stage-contract.md) and [author review](../../superpowers/reviews/2026-10-25-phase1-r011-history-stage-contract-review.md) now specify proposed R011 five-table history/Syntax layout, immutable and legacy-invalidation triggers, encoding, schema11 capture, owner/final-stage lifecycle, lock-internal CAS, full establishment, compatibility and recovery/Fixture matrices. These detailed mechanisms are REVIEW_PENDING, not accepted implementation authority. No released SQL/checksum or existing C3-A R010 public contract is changed.

Important remaining gap: no existing complete raw-to-Canonical Syntax normalizer/confidence policy. H2/H3 implementation planning is blocked on that separate mapping annex; no invented confidence numbers. H1 migration/bounded-history-capture design can be reviewed independently, then writing-plans only after DCP acceptance; no H1 implementation or DB run is authorized. R011 backupRequired=false/no-backfill/no-down and conservative legacy pointer invalidation are explicit proposed choices requiring review. Actual Runtime/Native/profile qualification stays H5; production route closed.

2298 predecessor hashes matched;prior810Node/build/architecture17/registry52-exact26/catalog0 historical,not rerun. Documentation only;no product/Fixture/registration/build/cache/test/SQL/DB/Native/helper/Rust/profile/numeric/dependency/cloud/Git mutation. Evidence:.superpowers/design/2026-10-25-phase1-r011-history-stage-contract/design-verification.json. B1-B2/C/D/P1-04/05/Phase1 OPEN;C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4untouched. Original bytes/EOL follow unchanged;older proposed-direction text is historical.

## B1-B2 first package local acceptance — 2026-10-25

User confirmation approved T1–T3. All three are locally accepted as LOCAL_DECLARED_DELTA_CANDIDATE_CONTRACT: compatible self-validating history pipeline exit, complete retained+fresh declared support candidate, every-original reference closure and existing selection, plus independent Fixture/registration/evidence. [Implementation author review](../../superpowers/reviews/2026-10-25-phase1-delta-support-candidate-implementation-review.md) records the exact contract and limitations. Earlier plan-pending/proposed wording below is historical.

Fresh evidence: Providers build exit0;30 named Node files810PASS/0FAIL/0SKIP/0TODO/0cancelled; architecture17PASS; registry52/exactPhase1 26/newID once/Runtime Syntax catalog0. Independent12-family35-case73-file Fixture froze before product;563 predecessor Fixture bytes remain protected. Evidence and exact commands: .superpowers/sdd/2026-10-25-phase1-delta-support-candidate/implementation-verification.json. Old public outputs/errors/digests/byte-item boundaries remain compatible; one cumulative logical budget continues through the candidate. This does not qualify heap/RSS/deadline or actual execution.

Only DECLARED_INPUT consistency is accepted. Raw bridge, authentic history/Source/run/provisional owner, final RepoBasis/Canonical Syntax, Stage/Store and B1-B2 overall remain OPEN, as do B1-C/D, P1-04/05 and Phase1 exits. R011 adds no physical schema; provider-independent IR/SQLite authoritative/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow and Deferred boundaries are preserved. Next: separately design raw bridge with C capture/Stage boundaries.

No actual Native/helper/Rust/DB/R4/measurement/calibration/profile/numeric/dependency/cloud/stage/commit/push/cleanup/new worktree/session/subagent. C1EPERM OPEN; fourC2 lifetimes spent; historical timeoutUNKNOWN; main39708335128 cancellation unqueried; mutable R4 untouched. Scoped local gates do not replace unexecuted global gates. Original document bytes/EOL follow unchanged.

## B1-B2 written direction accepted; candidate plan pending — 2026-10-25

User “确认” accepts the [B1-B2 written direction](../../superpowers/specs/2026-10-25-phase1-delta-composition-design.md). The [three-task first-package plan](../../superpowers/plans/2026-10-25-phase1-delta-support-candidate.md) and [author plan review](../../superpowers/reviews/2026-10-25-phase1-delta-support-candidate-plan-review.md) specify compatible self-validating budget composition, complete retained+fresh declared supports, every-original candidate Source/node closure via the existing selector, exact registry/root changes and30 named local Node files. Concrete plan REVIEW_PENDING; T1..T3 NOT_STARTED. Earlier proposed/pending-direction wording is historical.

This is a private DECLARED_INPUT candidate only, not authenticated history/run, raw delta normalization, finalRepoBasis/CanonicalSyntax,Stage/Store or B1-B2 completion. Old B1-B1 public outputs/errors/digests/bounds and B1-A/IR/wire/SourceCAS/selector/SQLite remain controlling; R011 has no new physical schema. All-original closure applies to the new entry, not a silent stronger old public contract.

2094 predecessor hashes matched;17 original document snapshots preserved. Planning evidence:.superpowers/sdd/2026-10-25-phase1-delta-support-candidate/plan-review.json. Product/Fixture/registration/build/cache/tests/DB/Rust/Native/helper/profile/numeric/dependency/cloud/stage/commit/cleanup unchanged this turn;prior662Node/architecture17/registry51-exact25/catalog0 remain historical. Future52/exact26 are structural targets from one planned manifest, not passed/new quantitative gates. C1EPERM OPEN,fourC2 lifetimes spent,timeoutUNKNOWN,maincancelunqueried,R4untouched;B1-B2/C/D,P1-04/05/Phase1 exits OPEN.

## B1-B1 local declared-history transition checkpoint — 2026-10-24

User “批准” approved the [T1–T3 plan](../../superpowers/plans/2026-10-24-phase1-history-transition.md). All three are locally complete only as LOCAL_DECLARED_HISTORY_TRANSITION_CONTRACT: two private Providers modules, owned strict declarations, full Source diff, Python file-local/Java projection-group reuse, original support lifecycle, foreign revalidation refusal, declared coverage and final-basis Syntax obligations. [Implementation author review](../../superpowers/reviews/2026-10-24-phase1-history-transition-implementation-review.md) records contracts/REDs/corrections/remaining gaps. Earlier plan-pending entries below are historical snapshots, not current task status.

Fresh27-file cohort662PASS/0FAIL/0SKIP/0TODO (136new+526existing),Providersbuild0,architecture17;registry51/exact25Phase1/one newID/catalog0. Independent18-family46-case95-file Fixture predates product; formatting successor preserves all expected bytes and JSON meaning, original freeze/bytes retained. Receipt:.superpowers/sdd/2026-10-24-phase1-history-transition/implementation-verification.json. Original468 coveredFixture paths and old product/IR/SQL/wire/index/Runtime/Storage/locks/profiles remain unchanged; root gains exactly3 test paths, Providers incremental build cache changes as generated metadata.

Pure consistency/drafts do not authenticate history/Source/run, assemble final Canonical candidate, map Syntax to finalbasis, freeze a lease or call Store. B1-B2/C/D and B0b-3/C,P1-04/05/Phase1 remain OPEN. No DB/R4,Rust,NativeCLI/helper,measurement/calibration/profile/numeric/dependency,cloudCI,stage/commit/push/cleanup. C1EPERM OPEN,fourC2 lifetimes spent,timeoutUNKNOWN,maincancelunqueried,R4untouched. Provider-independentIR/SQLiteauthoritative/LLMcandidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow and Deferred boundaries preserved.

## B1-B direction accepted; B1-B1 plan review pending — 2026-10-24

User “确定” accepts the [history/support direction](../../superpowers/specs/2026-10-24-phase1-history-support-design.md). The [B1-B1 implementation plan](../../superpowers/plans/2026-10-24-phase1-history-transition.md) and [author plan review](../../superpowers/reviews/2026-10-24-phase1-history-transition-plan-review.md) define pure declared-history/current-state/target/observation consistency and bounded transition drafts only. Concrete plan REVIEW_PENDING; T1..T3 NOT_STARTED. Prior proposed-direction snapshots are superseded only for written acceptance.

Immutable Evidence origin and current membership stay separate; Python file-local and conservative Java projection-group dependencies, explicit foreign-Provider revalidation, complete Source/zero-fact coverage and original R009 candidates are required. No existing IR shape, codeActivationDigest/owner-map, one-new-snapshot rule, B1-A full-projection gate or Source independent CAS is changed. R011 remains logical/unpublished: physical schema, authenticated history capture/ancestry, current Syntax projection, delta full candidate, stage/CAS/atomic Apply/readers/recovery still require B1-B2/C/D contracts.

1760 predecessor hashes matched; planning-only evidence: .superpowers/sdd/2026-10-24-phase1-history-transition/plan-review.json. Product/Fixture/registration/build/test/DB/Rust/Native/helper/profile/numbers/dependency/cloud/stage/commit/cleanup unchanged this turn. Prior526Node/architecture17 historical, not rerun. C1EPERM OPEN;fourC2 lifetimes spent;timeoutUNKNOWN;maincancelunqueried;R4untouched. B0b-3/C,P1-04/05/Phase1 exits remain OPEN.

## B1-A local Native projection contract checkpoint — 2026-10-24

User confirmed the [three-task plan](../../superpowers/plans/2026-10-24-phase1-native-composition.md). A1..A3 are complete only as LOCAL_NATIVE_PROJECTION_CONTRACT:two private Providers modules,strict owned inputs,one native snapshot,scoped capabilities,reused normalizers/merger and a seven-field frozen candidate. No finalRepoBasis,CanonicalSyntax publication,stage lease,Source/run/settlement authority or Store route. History/retained/removed and otherProvider support,B1-B/C/D,B0b-3/C,P1-04/05/Phase1 remain OPEN;changed-only still required.

Fresh approved24-file local cohort526PASS/0FAIL/0SKIP/0TODO,architecture17,Providersbuild0;registry50/exact24Phase1/one newID/catalog0. Independent12-family69-file correctedfreeze precedes product,originalfreeze/failures preserved. [Implementation author review](../../superpowers/reviews/2026-10-24-phase1-native-composition-implementation-review.md) records exactinputs/fullresults/limits/corrections;receipt:.superpowers/sdd/2026-10-24-phase1-native-composition/implementation-verification.json. Only three root test registrations;oldproduct/index/normalizers/merger/protocol/IR/Storage/Runtime/profile and coveredoldFixture bytes preserved.

No Rust,NativeCLI/helper,DB/R4,calibration/profile/numeric/dependency,cloudCI,Gitstage/commit/push/cleanup this batch. PreviousRust105/18Native-library cases are historical,not newqualification. Logicalserializedbudget isnot internalallocation/RSS evidence;parsedJava checksum isnot rawtransport;authorreview isnot independentintegrationproof. C1EPERM OPEN,fourC2 lifetimes spent,timeoutUNKNOWN,maincancelunqueried,R4untouched. Earlierplan-pending snapshots are superseded only for this localbatch;originalevidence retained.

## B1-A written direction accepted; concrete plan review pending — 2026-10-24

User confirms the recommended [B1-A written direction](../../superpowers/specs/2026-10-24-phase1-b1-composition-design.md): one scoped Native projection candidate from complete declared Java/Python children, retaining one snapshot per Provider, original SUCCEEDED gates and three explicit scoped capability names. The [three-task plan](../../superpowers/plans/2026-10-24-phase1-native-composition.md) and [author plan review](../../superpowers/reviews/2026-10-24-phase1-native-composition-plan-review.md) specify private modules, independent pre-product Fixture, exact inputs/output/error/budget contracts and 24 named local test files. Concrete plan REVIEW_PENDING; A1..A3 NOT_STARTED. Earlier proposed-direction snapshots are superseded only for written B1-A acceptance.

Plan-entry verification matched all1421 predecessor hashes. This turn changes documentation only; prior500Node/105Rust/18library cases/architecture17 remain historical, not rerun. No product/Fixture/registration/build/test/Rust/Native/helper/DB/R4/profile/dependency/numeric gate/cloud/stage/commit/cleanup change. Evidence: .superpowers/sdd/2026-10-24-phase1-native-composition/plan-review.json.

Pure projection does not authenticate Source/run/settlement, freeze a stage, compute final repository basis, publish Canonical Syntax or call Store. B1-B history/retained/removed, B1-C stage/R011 and B1-D atomic Apply remain separately governed; changed-only goals remain required. B0b-3/C and allP1-04/05/Phase1 exits stay OPEN. C1 file-symlink EPERM OPEN; fourC2 lifetimes spent; Native timeout UNKNOWN; main cancellation unqueried; R4 untouched. Original IR/storage/LLM/AUTO-MANUAL/flow and Deferred boundaries remain.

## 2026-10-22 accepted Phase1 first-batch authority

Reserve independently negotiated v4 syntax observation with Python normalized owner facts per accepted proposal A. No v4 message implementation or capability advertisement is authorized in P1-00..02; strict v1/v2/v3 remain unchanged.

Authority: ADR-020 and the user confirmation; architecture acceptance is not implementation evidence.

# Native IPC Wire Specification

2026-10-15 accepted ADR-018/§9 rollout checkpoint: v3 analysis emits private bounded
hashed diagnostics after admission begins. Stdout/schema/checksum/limits and
legacy v1/v2 diagnostics remain unchanged. Development capture uses the existing
stderr reader only; no Provider/resource/publication authority comes from these
records. Current Status tracks incomplete rollout/qualification; no phase exit.

2026-10-15 review update: original written ADR-018/design accepted; revised plan
and proposed FULL count correction remain unapproved. No producer/consumer code
or stdout/stderr production behavior changed. The accepted Evaluation-only
diagnostic distinction does not give stderr Provider/publication authority.

2026-10-15 review notice, not a wire-contract change: proposed
[ADR-018](../adr/ADR-018-native-evaluation-observations.md) and
[bounded observation design](../../superpowers/specs/2026-10-15-p05-native-parse-observation-design.md)
describe private v3 parser diagnostics for development Evaluation. Only the
direction/detail-writing is approved; written review and the revised plan precede
implementation. Stdout v1/v2/v3, checksums, hard caps and production stderr-only
diagnostic treatment remain authoritative. No parsed stderr has publication or
Provider authority. Do not implement a second protocol under this pending notice.

D2 provisional implementation update (2026-10-04): the accepted [composition plan/spec](../../superpowers/plans/2026-10-04-p05-w3-020-native-refresh-composition.md) now adds separate `encodeNativeRefreshRequestV3`/`streamNativeRefreshV3` in Providers. Bounded owned header/ordered baseline/completion LF/checksum input is packet-A validated before spawn; C validates the same byte snapshot with the independent trusted budget. Reused process lifecycle waits for writes, stdout/checksum, bounded stderr and acceptable exit; late exit/post-terminal/cancel/truncation cannot return success. Typed v1/v2 unions, error precedence and all hard caps remain unchanged. The returned terminal is observation only (including honest PARTIAL), never Apply authority. New process Fixture/gates and exact-build memory holds are recorded in CURRENT_STATUS; D3/D4/D5/D6/E remain open, with no incremental advertisement or phase acceptance. Earlier plan-pending statements are historical.

Packet D written-spec acceptance (2026-10-04): the latest user “确认” accepts the [composition specification](../../superpowers/specs/2026-10-04-p05-w3-020-native-refresh-composition-design.md). Its [D1–D6 executable plan](../../superpowers/plans/2026-10-04-p05-w3-020-native-refresh-composition.md) is written and awaiting separate review/native execution confirmation. No code, Fixture registration, memory calibration/profile installation, gate passage or phase promotion follows. Final-build exact-purpose measurement and separate numeric approval precede production acceptance; E and original phase exits remain open. Earlier direction-only/pending-spec/missing-plan notes below are historical.

Packet C real v3 REFRESH is integrated through PR #19; packet D's [proposed process composition](../../superpowers/specs/2026-10-04-p05-w3-020-native-refresh-composition-design.md) awaits written review. A distinct v3 observer would reuse C's strict decoder, awaited sink and existing process lifecycle, validate owned header/baseline/completion bytes before spawn and withhold success until all process streams/exit settle. Legacy v1/v2, all hard caps and incremental advertisement remain unchanged; D transport is not implemented by this note.

2026-10-04 bounded ordering conformance verified after user “确认” (base b7b55da): deduplicated changed upserts are admitted under checked payload/capacity-growth/metadata/output-overlap accounting, sorted by type/ID and emitted; existing sorted removals, TS decoder and budgets are unchanged. New cross-file C2 raw-wire regression has genuine old-code RED→fresh-binary GREEN; all17 prior transitions and nine frozen reports are preserved. Fresh required memory75/75, collector27/27, Native/registry136/136, Cargo125/125,16-project build/type/architecture17/client2/handshake4 and root991total/990pass/0fail/1existing Windows skip pass, with unchanged approved Node453a41… identity. CURRENT_STATUS records exact commands, peaks and final consistency evidence. The ordering finding and C local Task4B/5/6 acceptance close; remote integration/hosted CI remain unobserved. Earlier ordering/numeric-hold wording is historical. No new ADR/FROZEN decision, protocol/IR/migration/threshold, second review, recalibration or D/E authority. Phase0.5 remains10/14 integrated; parent and original phase Exit Criteria stay open.

2026-10-04 corrected numeric checkpoint verified: approved READ_SEAL283,324,416/FULL_TRANSPORT283,324,416/REFRESH_VERIFY422,879,232 entries preserve453a41… and frozen evidence. Fresh boundary38/38, required memory75/75 (all42classes), collector27/27, real Native/registry135/135, Cargo122/122,16build/type/architecture17/client2/handshake4 and required root991total/990pass/0fail/1skip pass. Exact verification constituents passed; pnpm wrapper still fails its no-TTY pre-gate guard, hosted CI unobserved. CURRENT_STATUS records commands/artifacts/peaks. This supersedes prior numeric hold/in-progress/42-failure states only. C final design-conformance/Task6 remains open for normative fact-identity ordering; no silent waiver or Phase0.5/parent closure. Save only a local verified checkpoint; no ordering implementation, second review, remeasurement, remote/main or D/E authority.

2026-10-04 renewed numeric approval: the user's explicit “批准” after risk disclosure approves corrected453a41… READ_SEAL283,324,416/FULL_TRANSPORT283,324,416/REFRESH_VERIFY422,879,232 bytes for the frozen nine review evidence files. Matching static entries are installed; fresh16-project build preserves exact identity, and boundary/provenance38/38 passes after genuine missing-profile RED. Complete actual memory/collector/Native/root and consistency gates remain in progress; CURRENT_STATUS records fresh results. This supersedes older numeric-HOLD/not-installed wording only, not acceptance or phase exits. The Minor deterministic-traversal versus specified fact-identity ordering remains unresolved before related acceptance closes, not a spec waiver. No second review, recalibration, remote/main/D/E authority or FROZEN/threshold change.

2026-10-03 corrected-build numeric HOLD: single review's two Important fixes have four RED→GREEN regressions (focused96/96), provisional real Native/registry191/191 and Cargo122/122; current required root989/946pass/42 missing-profile failures/1skip is not green. Frozen453a41… build yields paired135 observations + independent27/27 holdout, candidate READ_SEAL283,324,416/FULL_TRANSPORT283,324,416; separate75 +15/15 holdout gives REFRESH_VERIFY422,879,232. Both candidates reproduce after holdouts, floors absent; hashes/M/J/commands are in CURRENT_STATUS. Renewed explicit purpose/value approval and actual required gates remain mandatory; no new profile/acceptance commit/second review/remote integration. Older649173b approval/green evidence is historical. Minor deterministic operation traversal versus specified identity ordering is disclosed/deferred, not a silent spec waiver; architecture/phase/D/E boundaries stay unchanged.

2026-10-03 single whole-branch review of649173b found two Important C verifier defects: contradictory SUCCEEDED/PARTIAL observation and Uint8Array.valueOf/shadowed-length snapshot bypass. Four genuine RED regressions now pass within96/96 after intrinsic actual-length/bounded native copy and partial-outcome validation; existing raw bytes/worker/corpus/profile/hash exclusion remain unchanged.16-project rebuild yields453a41edf654df5e1ded7ea6983637544cc7681d6e9ca64290acaca8de095d8a; all approvedf51a239… profiles correctly refuse this new build. Task6 remains incomplete pending full corrected regression, separate immutable memory-refresh-c-review-* measurements/holdouts, renewed exact numeric approval and actual gates. Prior649173b acceptance is historical, not current admission. One Minor operation-order/spec discrepancy is deferred and disclosed in CURRENT_STATUS; no schema/phase threshold/architecture or D/E scope change, no re-review/remote integration.

2026-10-03 post-approval gates: actual profile provenance/budget36/36, required original+verification corpus75/75 (all42 fresh actual classes), approved original collector27/27, real Native/registry135/135, Cargo122/122,16-project build/IR types/architecture17/fmt/Clippy/client2/handshake4 pass. Required root985total/984pass/0fail/1 existing Windows skip,363153.5125ms. Task1B/4B and Task5 acceptance are verified; Task6's one whole-branch review remains pending. Three exact approved profiles/finite-sampling scope and frozen hashes below are unchanged. Wrapper `pnpm verify` fails before gates at its no-TTY dependency-purge protection; exact registered constituents ran separately, not wrapper success. No hosted CI, persisted E, D publication or parent/phase promotion. This supersedes earlier in-progress/approval-hold/empty-profile records.

2026-10-03 numeric approval: the user's explicit “批准” approves READ_SEAL286,760,960, FULL_TRANSPORT286,760,960 and REFRESH_VERIFY422,711,296 bytes for the frozen Task5 evidence/exact implementationf51a239ca3f95c8d44a4dd858e569f614bd5767c491916789d8fc9731dac74f5. Separate static entries are installed;16-project rebuild preserves that identity. Original paired paths retain twice actual retained SQL UTF-8; verifier owns no SQL. Absent-profile RED and actual provenance/equality/one-byte-below gates pass36/36; four obsolete production-test budgets now use their matching installed reservation, retaining historical evidence assertions. Full required corpus/collector/C2/Cargo/root/final-review gates remain in progress;1B/4B/5/6 are not complete. Frozen evidence is unchanged and finite empirical maxRSS, not an OS bound. This supersedes prior numeric-HOLD/empty-profile wording only; phase10/14, original thresholds and D/E boundaries remain unchanged.

2026-10-03 Task4A: registered C2 drives real fresh-process full/REFRESH/full-target/restart with exact parser sets and complete Provider/task-local Canonical comparison. PARTIAL is observation-only at the activation-shaped test boundary. Private completion-order/writer/panic and real source/resource/cancellation tests supplement unchanged C1 raw framing/limit gates. Verification corpus/tooling/required actual-port runner is registered; no reviewed profile or production transport/publication follows. Incomplete-input cancellation/cooperative checks are not a hard blocking-I/O deadline. See CURRENT_STATUS; wire/IR ceilings/incremental advertisement remain unchanged.

2026-10-03 C core: validated v3 REFRESH now reaches the retained-summary producer; same WORKTREE/context and exact per-file semantic ledgers precede parsing. Changed-only parsing/complete metadata/digest operations pass Cargo116 and real Native+C1114. No incremental advertisement, Runtime transport/publication or phase exit. Immutable10MB schema-only request now precisely refuses insufficient16MiB worker admission with RESOURCE_LIMIT_EXCEEDED. Task4 full C2/resource/worker and5/1B/4B memory acceptance remain open; earlier producer-absent wording is historical.

2026-10-03 Task1A execution under approved revision8fb12a6: C helper now requires the fifth trusted budget, owns bounded input snapshot and validates lowered input-line ceilings/wire equality before output; private Runtime refuses missing verification profile before preparation. Strict v1/v2/full-v3 and all raw C1 expectations remain unchanged. Contract/private-port90 and combined198 checks pass; required root27 profile failures remain open. No real Rust REFRESH, actual positive admission, transport or publication is claimed. Earlier plan-pending/interface-proposed wording is historical for1A only.

2026-10-03 C1 written detail accepted after25e7797: private Runtime trusted budget precedes lazy preparation; unreleased `decodeNativeRefreshV3` requires fifth `expectedMemoryBudgetBytes`, bounded owned snapshot and exact embedded-budget equality before output access. Invalid scalar uses INVALID_CONFIGURATION, mismatch INVALID_REQUEST; missing/below measured profile is Runtime RESOURCE_LIMIT_EXCEEDED. No wire field/version/cap/error-enum change. The revised native plan awaits review; C1 remains incomplete and real Rust REFRESH unavailable. Separate verification profile is not process transport/publication. Earlier direction-only wording is historical.

2026-10-03 C1 preflight direction approval permits review of the [written detail](../../superpowers/specs/2026-10-03-p05-w3-020-c1-memory-preflight-proposal.md): private Runtime trusted budget before lazy preparation and a mandatory expected-budget argument on the unreleased C decoder. Wire budget would match, not grant admission; no wire field/version/cap/error change. Contract/native-plan review precedes implementation; C1 remains incomplete and real Rust REFRESH unavailable.

2026-10-03 design boundary: [packet C's accepted real REFRESH design](../../superpowers/specs/2026-10-03-p05-w3-020-native-refresh-producer-design.md) specifies a separate future v3 patch-output union with complete target summaries/coverage and exact changed-source events. Its [native plan](../../superpowers/plans/2026-10-03-p05-w3-020-native-refresh-producer.md) awaits review; this does not claim an executable contract. The current binary still refuses v3 REFRESH. Existing closed errors, v1/v2/full-v3 shapes, hard caps and advertisement remain unchanged; D publication/admission and E Evaluation remain subsequent packets.

Packet B review closure (2026-10-02): shared Provider framing caps now run before Runtime schema copies/database observation; existing line/aggregate/header+completion byte limits and cancellation semantics are retained. Full-only v3/actual DESCRIBE real gates pass with reviewed exact static admission; v1/v2 and Canonical IR v1 stay unchanged and real REFRESH remains rejected. Required fresh corpus/collector and uploaded failure-inclusive CI configuration are present; complete local gate evidence is in CURRENT_STATUS, not a hosted pass or phase promotion.

Packet B execution update (2026-10-02): Task 6 is locally committed as `0b2af73`, with 24 real bootstrap/lifecycle cases, 98/98 expanded focused tests and root 796 pass/0 fail/one existing Windows skip. Task 7 now advertises full v3 `[1,2,3]` after observed RED→GREEN descriptor tests; strict v1/v2, IR v1, capability list and explicit v3 REFRESH refusal are unchanged. The required bootstrap runner obtains the actual descriptor through the production client rather than using a future descriptor. Native integration CI selects Windows/x64 Node 24.15.0 because only that exact environment has reviewed full-transport admission; Ubuntu TypeScript and Windows Rust gates remain. This is configured coverage, not observed hosted CI or Linux bootstrap evidence. Final Task 7 gates/review remain pending; earlier unimplemented/profile-review-blocked wording is historical. Parent REFRESH and original Phase 0.5 exits stay open at 10/14 integrated, with no new milestone or deferred scope.

## Ownership and version 1 boundary

`@codeatlas/providers` owns the strict TypeScript request, event, descriptor, and complete-stream schemas. Native output remains Provider Facts and is not Canonical IR until the TypeScript Runtime validates, canonicalizes, merges, and stores it. The Rust analyzer owns no SQLite connection and cannot publish Canonical Knowledge.

Protocol version 1 and IR schema version 1 are the only accepted values in P0-W3-001. The schemas are implemented in `packages/providers/src/native-ipc.ts`; the object-schema Fixture index is `fixtures/ipc/schema-v1/cases.json`, and `packages/providers/test/native-ipc.test.mjs` is a mandatory root-test input. P0-W3-002 adds the shared raw-byte corpus described below. P0-W3-003 implements the one-request Rust `DESCRIBE` boundary and a test-only TypeScript real-binary verifier. P0-W3-004 implements the production TypeScript process lifecycle, streaming decoder, timeout/cancellation, corruption handling, and checksum verification. Validated SQLite state application remains later work.

## Transport

One JSON object per UTF-8 line. TypeScript writes requests to stdin; Rust writes protocol events only to stdout and logs only to stderr. No shell. The client enforces maximum line/event/count/total-byte limits, backpressure, timeout, cancellation, and process termination.

P0-W3-003 enforces the Rust side of a single `DESCRIBE` request per process: one UTF-8 JSON object, exactly one final LF, no BOM/CR/second record, and a 1,000,000-byte total request limit including the LF. It writes exactly one terminal protocol event to stdout for recoverable requests; malformed framing, UTF-8, JSON, or an untrustworthy request ID leaves stdout empty, writes a safe diagnostic to stderr, and exits `2`.

P0-W3-004 adds `executeNativeRequest` as the production TypeScript client boundary. It spawns one absolute executable directly with `shell: false`, writes exactly one bounded request record with backpressure, and incrementally decodes stdout as strict UTF-8 JSONL. The client rejects BOM, CR, blank lines, malformed UTF-8/JSON, incomplete final records, post-terminal bytes, request-ID or sequence drift, illegal event types, oversize lines, excess events, and excess total output. Default limits are 1,000,000 bytes for the request and each output line, 10,000,000 total stdout bytes, 10,000 events, and 1,000,000 captured stderr bytes. Callers may lower, but not raise, these protocol ceilings.

Timeout and `AbortSignal` cancellation terminate the one-shot child, wait through a bounded grace period, and discard every decoded event; they do not write a protocol `CANCEL` request to stdin. Failed terminal events map to typed client failures without exposing their event buffer. Successful results are deeply frozen only after complete-stream and checksum validation. Stderr remains diagnostic-only and is surfaced only as bounded metadata on typed client failures; it is not parsed as protocol data or included in default error serialization.

## Envelope

```ts
interface NativeRequestEnvelope<T> {
  protocolVersion: 1;
  requestId: string;
  type: 'DESCRIBE' | 'ANALYZE' | 'REFRESH' | 'CANCEL';
  payload: T;
}
interface NativeEventEnvelope<T> {
  protocolVersion: 1;
  requestId: string;
  sequence: number;
  type: string;
  payload: T;
}
```

Sequence starts at zero and strictly increases per request. Exactly one terminal event is required. Unknown required versions, duplicate/out-of-order sequence, malformed JSON, oversize payload, post-terminal data, or premature EOF are protocol errors.

All envelopes and payloads are strict: unknown fields are rejected. Request IDs are exact non-blank strings with a maximum of 128 characters. Sequence and count fields are non-negative safe integers; declared budgets and limits are positive safe integers.

## Requests

- `DESCRIBE` declares the client-supported protocol and IR schema version lists. Both lists are non-empty and contain unique positive integers.
- `ANALYZE` supplies IR schema version 1, a ProviderSnapshot ID, Repository, Revision, SourceFiles, unique requested capabilities, optional deadline, and resource budget. Repository and Revision identities must agree; every SourceFile must belong to that Repository and Revision, with no duplicate SourceFile ID.
- `REFRESH` supplies the same execution context plus the exact base revision ID/fingerprint, target Revision, and normalized added/modified/deleted file changes. Added and modified SourceFiles belong to the target Revision. A SourceFile ID may occur only once across the complete change set.
- `CANCEL` identifies the target request ID. A successful cancellation acknowledgement must echo that target exactly.

## DESCRIBE

Returns analyzer version, supported protocol and IR schema versions, languages, capabilities, limits, and build/platform metadata. The runtime selects a mutually supported protocol/IR pair before analysis and rejects incompatibility explicitly.

The version 1 language-neutral descriptor contains Provider, Provider version, Runtime version, unique protocol and IR version lists, unique capabilities, per-language grammar/analyzer/compatibility versions, positive line/event/total-byte limits, and build target/profile. Language IDs must be unique. This metadata is handshake data; it is not silently added to strict Canonical IR or ProviderSnapshot v1. See [ADR-014](../adr/ADR-014-multilanguage-native-analyzer.md) and the [Native Analyzer Scalability specification](../../specs/native-analyzer-scalability.md).

P0-W3-003 emits Provider `native`; package-derived Provider and Runtime versions; protocol/IR lists `[1]`; capability `protocol-handshake`; Java language metadata with grammar/analyzer version `0.0.0` and compatibility version `1`; limits of 1,000,000 line bytes, 10,000 events, and 10,000,000 total bytes; and the compile target/profile. Negotiation checks protocol compatibility before IR compatibility. Incompatibility and other recoverable validation failures emit `REQUEST_FAILED` with a closed error code, fixed bounded message, and `retryable: false`.

P05-W3-001 retains that DESCRIBE framing and negotiation behavior, and after the `java-basic-symbol` and `java-nested-types` Fixtures pass it additionally advertises `SYMBOL`. Java `grammarVersion` is the pinned `tree-sitter-java` crate version `0.23.5`; `analyzerVersion` remains package-derived `0.0.0` and compatibility version remains `1`. `ANALYZE` accepts only Java SYMBOL source files for this task, emits source-grounded ProviderNode facts with complete or partial coverage, and has no REFRESH, relation extraction, framework semantics, or state-application authority. The effective parse-worker count is a private process argument validated against the request budget, not a version-1 IPC field.

P05-W3-002 adds evaluated Java `IMPORT`, `CALL`, `INHERITANCE`, and `REFERENCE` capabilities to DESCRIBE after the four registered relation Fixtures and task-local direct-call gates pass. A relation request uses a bounded two-pass declaration index and emits deterministic ProviderEdge facts with source range, resolved target or honest unresolved/ambiguous candidate state, and per-capability coverage. The existing version-1 event framing, JSONL terminal integrity, and TypeScript client validation remain unchanged. SYMBOL-only requests retain their previous path. This task does not implement REFRESH, Canonical SQLite application, framework semantics, or later-phase knowledge projections.

### Accepted Phase 0.5 protocol v2 extension (P05-W3-003)

ADR-015 accepts protocol v2 for `ANALYZE` only. A protocol-v1 `DESCRIBE` request remains the bootstrap and advertises supported protocol versions `[1, 2]` with IR schema `[1]`. An `ANALYZE` request selects version 1 or 2; every event in its response uses the selected version. A v1 request receives exactly the existing strict v1 event payloads. Protocol-v2 `REFRESH` is not introduced here and must fail explicitly rather than be treated as v1. The advertised version-list change is a reviewed handshake-Fixture baseline change; the existing v1 raw-byte corpus and client behavior remain valid.

Version 2 adds only a required `statistics` object to each `ANALYZE` `COVERAGE` payload. The original `capability`, `sourceFileId`, `support`, and `coverage` fields remain. Statistics contain non-negative safe integers `eligibleSites`, `coveredSites`, `unsupportedSites`, `partialSites`, and `resolutionCounts` with exact keys `EXACT`, `HEURISTIC`, `AMBIGUOUS`, `UNRESOLVED`, and `UNSUPPORTED`. Require `eligibleSites = coveredSites + unsupportedSites + partialSites`; for a relation capability, resolution counts sum to `coveredSites`, and Java `SYMBOL` emits zero resolution counts. The language-neutral v2 stream validator enforces the numeric equations, exact shape, one coverage record per requested file/capability, and no duplicates; Java Fixtures compare statistics with source-grounded facts. Terminal NODE/EDGE counts remain event counts, not site counts. Synthetic compilation-unit and package-container nodes do not increment site counts. A resolved, ambiguous, unresolved, or unsupported-target relation counts as covered when its honest edge was emitted; the separate resolution counter records its target level. Unknown syntax-error regions are not assigned invented counts; partial coverage and diagnostics disclose that limit.

The current checksum, terminal, context, ordering, byte/event ceilings, timeout, cancellation, and no-partial-result rules apply to v2 unchanged. The version-specific TypeScript client validates the complete stream before exposing a result. A v1 result has no numeric site statistics and downstream summaries must report them as unavailable, never zero. P05-W3-003 adds no ProviderSnapshot v1 field, Canonical IR change, SQLite migration, or `REFRESH` implementation; see the [accepted design](../../superpowers/specs/2026-09-28-p05-w3-003-coverage-outcomes-design.md).

The first relation pass retains declaration, inheritance, and per-file import context; the second pass re-verifies source and resolves sites. A sole call candidate with positive arity and no argument-type proof is `HEURISTIC`, not `EXACT`. Indexed superclass lookup can supply an inherited candidate, also `HEURISTIC`; distinct same-arity ancestor/child signatures remain competing candidates (`AMBIGUOUS`) without argument-type proof, while identical signatures preserve the child override. Java package declarations are file-scoped; an indexed normal wildcard import targets one deterministic `java.package_container` ProviderNode (a derived source-grounded container with nullable range), not an arbitrary file declaration. Absent containers remain `UNRESOLVED`, and uses of an indexed wildcard can yield heuristic type candidates. These are resolution semantics within the existing ProviderTarget v1 shape, not new IPC fields.

## ANALYZE events

`ANALYSIS_STARTED`, `SOURCE_FILE`, `NODE`, `EDGE`, `COVERAGE`, `DIAGNOSTIC`, `ANALYSIS_COMPLETED`, and `ANALYSIS_FAILED`. A completed payload includes counts, coverage summary, content fingerprint, and integrity checksum. Failed streams are never applied.

A successful stream starts with `ANALYSIS_STARTED`, uses contiguous sequence numbers from zero, and ends with one `ANALYSIS_COMPLETED`. A pre-start `REQUEST_FAILED` is also a complete terminal stream. Started, failed, and completed context must match the request ProviderSnapshot, Repository, Revision, and fingerprint. ProviderNode and ProviderEdge events retain Provider identity and must match the request snapshot/repository/revision. Terminal counts must equal the emitted source-file, node, edge, coverage, and diagnostic event counts. Successful outcomes are `SUCCEEDED` or `PARTIAL`.

## REFRESH events

Refresh input contains base revision/fingerprint and normalized added/modified/deleted files. Patch events are `UPSERT_NODE`, `REMOVE_NODE`, `UPSERT_EDGE`, and `REMOVE_EDGE`, plus source/coverage/diagnostic and terminal events. The base must match the active graph; otherwise return `BASE_REVISION_MISMATCH` and request full analysis.

A successful stream starts with `REFRESH_STARTED` and ends with one `REFRESH_COMPLETED`; failure uses `REFRESH_FAILED`, and a pre-start validation failure may use `REQUEST_FAILED`. Patch upserts reuse strict ProviderNode and ProviderEdge contracts. Removals use typed Provider NODE/EDGE references rather than Canonical IDs. Terminal counts must equal every emitted patch/source/coverage/diagnostic event category. P0-W3-001 validates the patch protocol only; file-level incremental analysis and atomic validated application remain later tasks.

## Complete-stream validation

For every request, event request IDs match, sequence is exactly zero-based and contiguous, only request-legal event types occur, and exactly one terminal event is last. `ANALYZE` and `REFRESH` also enforce the request `maxEvents` budget, start-event ordering, context agreement, and terminal emitted-count agreement. `DESCRIBE_COMPLETED`, analysis/refresh completed or failed, `CANCEL_ACCEPTED`, and `REQUEST_FAILED` are terminal.

The object-level complete-stream validator intentionally does not compute or verify integrity checksums by itself. The P0-W3-004 byte-stream client computes SHA-256 over the exact raw JSONL bytes of every pre-terminal event, including each LF, and compares the lowercase 64-character checksum in a successful `ANALYSIS_COMPLETED` or `REFRESH_COMPLETED` terminal. A mismatch is protocol corruption and discards the complete result. Failed terminal streams and request forms without a success checksum still receive complete-stream validation.

### Accepted v3 architecture; isolated input contract implementation

[ADR-016](../adr/ADR-016-native-refresh-derived-analysis-state.md) accepts separate v3 ANALYZE/REFRESH and bounded JSONL request metadata/completion records. Existing single-record v1/v2 framing and strict payloads stay intact; v2 REFRESH remains unavailable. v1 DESCRIBE remains bootstrap. Do not advertise v3 until real producer/client compatibility tests pass or incremental capability until real REFRESH/Evaluation passes. Current executable advertisement remains unchanged.

The [P05-W3-020-A contract design](../../superpowers/specs/2026-09-30-p05-w3-020-v3-contract-design.md) specifies summaries, compatibility context, exact input record/count/digest rules, complete baseline-to-target delta validation and shared byte Fixtures; it was approved for native execution and is locally implemented in `packages/providers/src/native-analysis-state.ts`, `native-ipc-v3.ts`, `native-ipc-v3-bytes.ts` and `crates/native-analyzer/src/{analysis_state,request_v3}.rs`. Required root/package Node and Cargo runners consume `fixtures/ipc/protocol-v3/cases.json` (`p05-native-v3-request-contract-v1`) and independent summary vectors. One independent review's findings are repaired; integration is open; serve_once, native-client lifecycle and DESCRIBE are not connected to v3. Keep aggregate stdin/line 1,000,000 bytes, stdout 10,000,000 bytes, output events 10,000 and stderr 1,000,000 bytes including metadata. No IR or ProviderSnapshot v1 field is added. Output producer/state publication and cancellation/backpressure integration are separate reviewed packets; contract-only tests cannot claim runtime support.

The subsequent [accepted packet B design](../../superpowers/specs/2026-10-01-p05-w3-020-state-bootstrap-design.md) details full-only v3 output: strict `ANALYSIS_SUMMARY`, separate metadata count/header on success, summary/fact correspondence, and unchanged byte/event integrity limits. Its [implementation plan](../../superpowers/plans/2026-10-01-p05-w3-020-state-bootstrap.md) is approved for native execution; Tasks 1–2 locally implement R010, bounded read/staging/correspondence and reviewed exact-match Windows admission, not this output extension. Task 3 now adds isolated full-v3 output schemas and a byte decoder plus actual-stage correspondence corpus. Its terminal is observational, not an applicable candidate: mandatory stage sealing still precedes publication. Task 4 adds a separate bounded full-v3 process observer with exact header/completion input and awaited stdout delivery; its terminal remains observational and Runtime full-transport admission has an explicitly approved exact-match Windows profile; Task 6 still owns pre-spawn checking and mandatory seal/atomic Apply. Task 5 real Rust full-only producer/dispatch is now locally committed as 4901d97 with unchanged [1,2] advertisement. Task 6 bootstrap is provisional and blocked by required exact-build profile review; real atomic activation remains unverified. REFRESH and v3 handshake advertisement remain unavailable; packet A integrated through PR #17.

## Error model

Errors include incompatible protocol/IR, invalid request, unsupported language/capability, source changed during analysis, resource/budget exceeded, cancelled, internal analyzer failure, protocol corruption, and base mismatch. Diagnostics may be non-fatal; only the terminal event determines stream success.

Errors use a closed code enum, an exact non-blank message of at most 128 characters, and an explicit retryable flag. Unknown codes are rejected.

## Shared fixtures

P0-W3-002 defines `p0-native-ipc-protocol-bytes-v1` at `fixtures/ipc/protocol-v1/cases.json`. Its raw JSONL covers describe, analyze, refresh modify/delete, partial analysis, cancellation, malformed JSON, invalid event, incompatible protocol, oversize line, out-of-order sequence, and premature EOF. `packages/providers/test/native-ipc-bytes.test.mjs` and `crates/native-analyzer/tests/protocol_fixtures.rs` consume the same request and event files, require manifest paths to be relative with only normal components, reject POSIX absolute, Windows drive-prefixed, and backslash paths, and verify the declared byte lengths and classifications. URL-looking component text such as `%2e%2e` remains a literal filename component in both consumers; the TypeScript test resolver encodes each validated component before URL resolution so it cannot be normalized into traversal.

The closed classification names are `VALID`, `MALFORMED_JSON`, `INVALID_EVENT`, `INCOMPATIBLE_PROTOCOL`, `OVERSIZE_LINE`, `OUT_OF_ORDER`, and `PREMATURE_EOF`. Classification is deterministic: raw framing is checked before JSON parsing; line byte limits are checked before UTF-8/JSON decoding; malformed JSON precedes protocol and schema checks; incompatible protocol precedes closed-envelope validation; request-ID mismatch precedes sequence checks; sequence gaps precede request-specific legality and terminal completeness; and a legal request-allowed non-terminal prefix produces premature EOF. Request-ID mismatch, illegal event types, invalid envelope shape, or invalid terminal placement produce `INVALID_EVENT`.

Raw Fixture bytes are protected by `fixtures/ipc/protocol-v1/**/*.jsonl -text` in `.gitattributes`; consumers reject BOM, invalid UTF-8, CRLF, and blank lines rather than relying on checkout conversion. The maximum line size is measured in UTF-8 bytes, not characters.

Both P0-W3-002 classifiers are deliberately test-only. P0-W3-003 moves `serde_json` into Rust production dependencies for the real protocol module and adds `p0-native-ipc-handshake-v1` at `fixtures/ipc/handshake-v1/cases.json`. `crates/native-analyzer/tests/handshake.rs` and the test-only `packages/providers/test/native-handshake.test.mjs` spawn the real no-argument executable, verify the five compatible/incompatible/invalid/malformed outcomes, enforce stdout/stderr separation and bounded capture, and validate recoverable output with the existing TypeScript schemas. The verifier is ordered after `cargo build --workspace` and is not production provider code.

P0-W3-001 contributes the TypeScript object-schema Fixture for the request/event matrix, version and limit declarations, complete-stream ordering/terminal/count/context rules, and cancellation. P0-W3-002 proves cross-language agreement on the shared raw corpus. P0-W3-003 implements Rust `DESCRIBE` request decoding and emission. P0-W3-004 adds `p0-native-client-v1` at `fixtures/ipc/client-v1/cases.json`; `packages/providers/test/native-client.test.mjs` exercises malformed, out-of-order, oversize, timeout, cancellation, process-exit, checksum, and immutable-result behavior with a deterministic helper, while `packages/providers/test/native-client-binary.test.mjs` verifies the same production client against the real Rust binary. Atomic validated state application, Java/file-level incremental analysis, and native multi-event analysis emission remain later tasks.


## P1-03 local continuation — 2026-10-22

The user authorizes the next design/development step, P1-03, within ADR-020. The [Syntax/Plugin contract detail](../../superpowers/specs/2026-10-22-phase1-syntax-plugin-contracts.md) defines explicit v4 raw-byte validation and Plugin V2, retaining every old strict schema and evaluated capability advertisement. Contract fixtures do not qualify Native observation, a language grammar, a profile or actual framework behavior.


## Accepted mixed Native owner binding — 2026-10-22

User approves ADR-020 mixed amendment and continued implementation. [Exact unpublished v4 owner binding](../../superpowers/specs/2026-10-22-phase1-syntax-owner-binding.md) separates expected active basis, Source target, provisional owner stage and later final candidate. Preserve strict IPC1..3/R010/last-good and all actual/profile/atomic-Apply gates. Acceptance of the design is not evidence those workflows passed.


## Mixed Syntax contract/library candidate evidence — 2026-10-22

See [candidate review](../../superpowers/reviews/2026-10-22-phase1-mixed-native-candidate-review.md) and [exact owner binding](../../superpowers/specs/2026-10-22-phase1-syntax-owner-binding.md). Registry33/exact7 Phase1 includes the new contract-only owner fixture; original raw corpus hashes stay unchanged. Bounded literal/library/fake-child evidence does not close actual observer/profile/Runtime/Store/Evaluation gates. Aggregate input counts original request JSONL plus verified Source bytes; explicit controls do not qualify a memory reservation. Separate [admission purpose/accounting proposal](../../superpowers/specs/2026-10-22-phase1-syntax-admission-proposal.md) remains unapproved; no old profile, required check or numeric gate is transplanted or weakened.


## Accepted Syntax admission preparation — 2026-10-22

The user separately approves [purpose/record/accounting preparation](../../superpowers/specs/2026-10-22-phase1-syntax-admission-proposal.md). [Fresh review](../../superpowers/reviews/2026-10-22-phase1-syntax-admission-preparation-review.md) records632 scoped tests/3 builds/architecture17, strict raw-evidence/holdout/component-budget validation and Runtime refusal before lazy preparation. The internal Syntax catalog is empty. New Fixtures are contract-only; OS acquisition conformance uses only Node helpers. Actual Native candidate/harness/full oracles, measurement approval, numeric installation and joint P1-04/05 acceptance remain open. All old profile entries/selectors, strict IPC1..3/R010 and semantic publication boundaries remain; no new dependency/number/cloud authority.


## Accepted Syntax traversal budget — 2026-10-22

User explicitly approves [traversal refinement](../../superpowers/specs/2026-10-22-phase1-syntax-traversal-budget-proposal.md): unpublished v4 requires explicit maxItems, reusing EffectiveConfig, with aggregate Syntax visitor accounting independent of maxEvents. New budget-contract root replaces current request consumers; both earlier roots stay byte-identical history. No numeric default/profile/run authority; old IPC1..3/IR/SQLite/guards unchanged. Native4 dispatch remains unadvertised until actual evaluated evidence.


## Explicit4 candidate settlement evidence — 2026-10-22

Strict maxItems current corpus is fixtures/phase1/syntax-budget-contract; old roots remain history. Syntax dispatch validates before observation; recoverable bounded identity gets direct REQUEST_FAILED payload, malformed/untrusted identity fails closed without fabricated ID. Native selection precedes old ANALYZE/DESCRIBE; --parse-workers refuses Syntax instead of silently changing policy. Descriptor is unchanged. [Bounded review](../../superpowers/reviews/2026-10-22-phase1-syntax-dispatch-budget-review.md) distinguishes library/in-memory tests from actual qualification.


## Java exact-owner evidence boundary — 2026-10-22

The unchanged v4 Java path emits Syntax/coverage only,using exact existing Code declaration owners. [Full library reference](../../superpowers/reviews/2026-10-22-phase1-java-owner-oracle-review.md) verifies0 Code nodes/edges,normal COMPLETE extraction and ownerless PARTIAL with no fallback to a containing class. A foreign declaration ID refuses after source validation. These are independent Source/unit-context expectations and controlled library bytes,not Native CLI/profile/capability advertisement or whole Code candidate acceptance.


## Mixed reference ordering and failed batch evidence — 2026-10-22

The existing unpublished v4 writer sorts verified Source paths independently of request inventory order. The mixed library reference deliberately lists Python before Java and verifies Java events/coverage before Python Code/Syntax/coverage. If Python changes after Java output,the full batch ends SOURCE_CHANGED without SYNTAX_COMPLETED;already emitted Java events cannot be treated as an applicable completed batch. This verifies existing behavior and changes no wire contract or capability advertisement. [Review](../../superpowers/reviews/2026-10-22-phase1-mixed-provisional-oracle-review.md).


## Malformed Source evidence boundary — 2026-10-22

The existing Python library may recover declarations/calls from malformed verified bytes. The dynamic/malformed reference retains UNKNOWN DYNAMIC_EXPRESSION,unresolved callee,whole-Source SYNTAX_ERROR warning and PARTIAL coverage/terminal. A completed PARTIAL stream is not SUCCEEDED or valid Source;consumer comparison must include diagnostics and honest unknowns. Pure Code normalization does not publish Canonical Syntax or semantic knowledge. Wire and descriptor remain unchanged. [Review](../../superpowers/reviews/2026-10-22-phase1-dynamic-malformed-oracle-review.md).


## Output-boundary reference evidence — 2026-10-23

Existing v4 reserves a terminal event slot. Controlled library evidence with a complete68-record reference verifies exact-event success versus one-below failure before coverage,and exact raw-byte success versus one-below failure after coverage. Failures retain typed RESOURCE_LIMIT_EXCEEDED and never SYNTAX_COMPLETED;already emitted facts do not form an applicable batch. This checks existing writer/consumer behavior,not a wire/schema/default/profile change or OS memory guarantee. [Review](../../superpowers/reviews/2026-10-23-phase1-bounded-output-oracle-review.md).


## Changed-only library reference boundary — 2026-10-23

Current writer consumes the explicit Source inventory,not a repository rescan. Controlled request includes changed app.py plus strict removed.py metadata;retained.py is unrequested. Poison directories at those unrequested paths preserve complete output. Removed metadata is not echoed as a Source fact and not included in the accepted owner-map context/digest;actual authenticated request/run and removal Apply remain separate duties. Fresh library construction is same-process determinism only,not Native process restart/lifecycle proof. No wire or descriptor change. [Review](../../superpowers/reviews/2026-10-23-phase1-changed-only-oracle-review.md).


## Proposed B0-a Source-target boundary — 2026-10-23

B0-a Source-target normalizer design is PROPOSED,not accepted or implemented. Recommended additive normalizePythonSourceObservation reuses the existing strict Source triple and one private mapping core;old RepoBasis API/identity/errors/limits/goldens remain. Pure mapped facts carry no authenticated Source,Code completeness or publication authority. A read-only in-memory negative control confirms that a resealed zero-fact stream with COMPLETE Syntax coverage can satisfy the old structural SUCCEEDED contract;this is not actual Native extraction or full-oracle success. PARTIAL never becomes SUCCEEDED;old SUCCEEDED alone cannot supply the missing complete Code proof. No wire/IR/SQLite/Source/Runtime/Store/owner-map/profile/dependency/number change. B0-b outcome/wire proof,B1 and C remain separately designed;all original gates stay OPEN. PriorC3-A422PASS/1TODO is historical;no product regression,new Fixture registration,DB,Native,acquisition-helper or cloud run;the existing-API pure control is recorded separately.

[Proposed DCP](../../superpowers/specs/2026-10-23-phase1-b0-source-target-dcp.md) is pending review. No old schema/strict message is widened. Proposed Fixture p1-python-source-normalization-v1 is contract-only and not registered;full Code/Syntax completeness must be independently specified,not inferred from counts/checksum or a pure normalized array.

## B0-a written contract accepted; concrete plan pending — 2026-10-23

User explicitly approves the B0-a Source-target written contract. The [concrete plan](../../superpowers/plans/2026-10-23-phase1-python-source-normalization.md) and [author plan review](../../superpowers/reviews/2026-10-23-phase1-python-source-normalization-plan-review.md) define independent pre-product Fixture freeze/API-absence RED, strict additive wrapper/shared core,20-file local regression and traceability. Existing C worktree/session/sequential method retained. Plan REVIEW_PENDING;B0a-1..3 NOT_STARTED. This supersedes only the earlier B0-a proposed/unaccepted status,not historical evidence.

Acceptance is limited to the pure API:old RepoBasis contract/version/errors/goldens/limits unchanged,new-only scalar Unicode rejection,no Source authentication/completeness/outcome/publication. B0-b wire/Code proof,B1 stage/history/atomicApply,C actual Native/accounting and all P1-04/05/Phase1 exits remain OPEN. C1 symlink EPERM remains TODO;four C2 acquisition lifetimes remain spent;timeout root cause UNKNOWN. No product/Fixture/registration/build/test/DB/helper/Native/cloud change.681/681 predecessor hashes matched;old regression totals remain historical. Receipt:.superpowers/sdd/2026-10-23-phase1-python-source-normalization/plan-review.json.

## B0-a local pure-normalization checkpoint — 2026-10-23

User confirmed the concrete plan;B0a-1..3 implemented sequentially in original C worktree. New normalizePythonSourceObservation accepts strict Source target without final Code digest;old RepoBasis API/version/schema/errors/limits/goldens preserved with one private mapper. New-only Unicode checking,no Source authentication/completeness/outcome or publication. Independent Fixture p1-python-source-normalization-v1 frozen before product edits;all four bytesets remain matched. No Source classification,production caller,IR/wire/Store/SQL/profile/default/number/dependency change.

Fresh20-file local regression302PASS/0FAIL/0SKIP/0TODO (69 new tests);Providers build0;architecture17;registry47/exact21Phase1/catalog0. All271 covered original Fixture paths unchanged. [Implementation author review](../../superpowers/reviews/2026-10-23-phase1-python-source-normalization-implementation-review.md);receipt:.superpowers/sdd/2026-10-23-phase1-python-source-normalization/implementation-verification.json. Independent review/root/integration/actual Native/cloud CI NOT_RUN;no acquisition helper,DB/R4,staging/commit/cleanup. Evidence-script failures and corrections retained;prior measurements not promoted.

This supersedes B0-a plan-pending/not-implemented snapshots only. B0-b complete Code/Syntax proof and wire,B1 stage/history/removed/CAS atomic Apply,C actual Native/accounting and all P1-04/05/Phase1 exits remain OPEN. C1 file-symlink EPERM remains TODO;four C2 lifetimes spent;historical Native timeout UNKNOWN. Main CI cancellation not re-queried,no rerun. Next:B0-b separate detailed design,without invented complete-proof flag or early publication.

## B0-b proposed completeness and isolated protocol direction — 2026-10-23

B0-b [written DCP](../../superpowers/specs/2026-10-23-phase1-b0b-completeness-proposal.md) and [author design review](../../superpowers/reviews/2026-10-23-phase1-b0b-completeness-design-review.md) are PROPOSED,not approved or implemented. Recommend fixed minimalPythonCode scope,separateCode/Syntax coverage/outcomes and an isolatedcandidatev5 retainingstrictv4. Newstatistics/rawrequestchecksum provide structure/binding,not truthful extraction,authenticatedSource orStoreauthority;independentSourceoracles/currentbuildqualification remain necessary. FactMerger's one-snapshot-per-Provider restriction stays;no fabricatedProvider orpartialsuccessadapter. B1snapshot/history/support/atomicApply remains separately governed.

Only next suggested planning scope isB0b-1 purestrictvalidator/independentFixture. No product/Fixture/registry/descriptor/wire/Source/IR/SQL/profile/numeric/dependency change this turn.737/737 predecessor hashes matched;B0-a302PASS is historical,not rerun. No new probe/build/test/Rust/Native/helper/DB/cloud/Git-stage/commit/cleanup. All P1-04/05/Phase1 exits,B0-b/B1/C,C1symlinkEPERM OPEN;C2four lifetimes spent;timeoutUNKNOWN. Receipt:.superpowers/design/2026-10-23-phase1-b0b-completeness/design-verification.json. Approval is requested only for written direction→B0b-1 plan review,not producer/actualrun/production assembly.

## B0b-1 offline contract implementation — 2026-10-24

User confirmed the concrete [plan](../../superpowers/plans/2026-10-24-phase1-code-syntax-contract.md). The isolated protocol5 pure byte validator, exact eight-field frozen result and independent p1-code-syntax-completeness-v1 Fixture are implemented locally. Twelve Source/request/full-output/decision seeds and a separate Java v2 reference were frozen as 44 files before product changes. No producer output was used to generate expected results. Old IPC1..4 and all old Source/Fixture bytes are preserved.

Validation and task disposition: [implementation author review](../../superpowers/reviews/2026-10-24-phase1-code-syntax-contract-implementation-review.md), with reproducible commands/raw logs in .superpowers/sdd/2026-10-24-phase1-code-syntax-contract/implementation-verification.json. Fresh local evidence: Providers build exit0, 25 named Node test files436PASS/0fail/0skip/0TODO (including107 new contract tests), architecture17 and registry48/exact22Phase1/catalog0 with exactly one new ID; closure is limited to these offline contract obligations. No production admission or Phase1 exit is inferred. The first build type-inference failure and first scoped stale-document failure remain recorded.

B0b-2 producer/transport is the next design task, requiring its concrete reviewed plan; B0b-3 qualification, B1 one-Native-snapshot/history/support/atomic Apply and C actual Native/accounting remain OPEN. Structural success cannot authenticate Source/history or observe Native work/time/memory/cancellation. Runtime Syntax catalog remains empty. C1 file-symlink EPERM stays TODO; four C2 lifetimes spent; historical Native timeout UNKNOWN; main cancellation not re-queried. No Source classifier, Runtime route, IR/SQL migration, dependency, profile/numeric gate, Native/helper run, cloud write/CI, stage/commit or cleanup is included. Historical planning snapshots are superseded only for B0b-1 and retained in the evidence workspace.

## B0b-2 library producer/consumer design proposal — 2026-10-24

The next [written design](../../superpowers/specs/2026-10-24-phase1-code-syntax-producer-design.md) and [author design review](../../superpowers/reviews/2026-10-24-phase1-code-syntax-producer-design-review.md) are PROPOSED, not implementation approval. Recommendation: isolated strictv5 library producer plus no-spawn bounded TS reader, private common payload/request reuse, Source-enumerated dual coverage and independently frozen producer oracles. B0b-1 Java unit identities/JS raw formatting are contract references, not actual producer goldens; its44 files remain immutable. Old v4 outer gates/bytes/errors/work and IPC1..3 remain unchanged.

Six dependent design units are B2-01 independent oracle,02 strictrequest,03 Python/Java collection,04 librarywriter,05 boundedreader,06 cross-consumer/compatibility evidence. Exact executable plan/commands follow written-design approval; none are run now.884/884 predecessor hashes matched;previous436PASS/architecture17/registry48/exact22/catalog0 is historical,not rerun. Design-only receipt:.superpowers/design/2026-10-24-phase1-code-syntax-producer/design-verification.json. No product/Fixture/registry/build/test/Rust/Native/helper/DB/R4/cloud/stage/commit/cleanup change.

No CLI route/capability advertisement/profile/production Source or Runtime/one-Native-snapshot/history/retainedsupport/atomicApply/migration/dependency/newnumber is included. B0b-2 implementation/3qualification,B1/C,P1-04/05/Phase1 remain OPEN. C1file-symlinkEPERM OPEN;fourC2lifetimes spent;timeoutUNKNOWN;maincancel not re-queried. Proposed private refactors must preserve old evidence;any conflicting Source oracle returns to governance rather than weakening the contract. Author review only;no independent/full integration proof.

## B0b-2 local library contract checkpoint — 2026-10-24

User confirmed the [six-task plan](../../superpowers/plans/2026-10-24-phase1-code-syntax-producer.md);B2-01..06 complete for LOCAL_LIBRARY_CONTRACT only. Isolated strictv5 Rust producer and package-private boundedTSreader reuseprivatecommonrequest/analyzer logic;oldv4 APIs/raw/error/work,oldwriter/CLI,publicindex,IR/SQL/Sourcepolicy/Runtimeprofilecatalog remain unchanged. Source-enumeratedCodecoverage and v5-only discardedvalueatomicity never turn structure into publicationauthority.

Fresh evidence:Providersbuild0,28Nodefiles500PASS/0fail/0skip/0TODO,105uniqueRusttests,18actualownedSource-library rawoutputs checked byindependenttemplates/Canonical/pure+reader,architecture17,registry49/exact23Phase1/one newID/catalog0. [Implementation author review](../../superpowers/reviews/2026-10-24-phase1-code-syntax-producer-implementation-review.md);receipt:.superpowers/sdd/2026-10-24-phase1-code-syntax-producer/implementation-verification.json. Old319Fixturepaths and80newpreproductfrozenfiles unchanged. Existinglinktest printsOSpermissionSKIP;C1parent/filelinkbranches remainunproved,not waived. RustPASSdoesnotclose thatgate.

Two build attempts stopped before tests/capture (LNK1104, later LNK1105/Windows1224). Subsequent scoped batches passed; linker root causes remain UNDETERMINED. Three actual 18-case captures were retained across successive reviewed code revisions; latest depth-capture-root.json binds the final revision. Review fixed late-flush cancellation settlement and full-envelope JSON depth, each with actual RED→GREEN tests. No numerical threshold changed; historicalNative timeoutstillUNKNOWN,neitherfixednorflaky. Cargo.lock wasnotinthestartreceipt;currenthash/oldmtime/lockedcommandsare recorded honestly,not a priorhashmatchclaim. No actualNativeCLI/acquisitionhelper/calibration/profilevalues/newdependency/cloud/stage/commit/cleanup. Incidentalbinarycompilation isnot qualification.

B0b-3/B1/C,productionrouting/trustedhistory/retainedsupport/oneNativeSnapshot/atomicApplyandallP1-04/05/Phase1exitsOPEN. C1EPERM OPEN,fourC2lifetimes spent,maincancelunqueried,R4mutableDB untouched. Authorreviewonly;no independent/fullintegrationproof. Supersedes plan-pending snapshots only;originaldocuments/failures remain retained.

## A3私有请求衔接整包已批准（2026-10-29）

用户已批准[A3附约及T1–T3实施范围](../../superpowers/specs/2026-10-29-phase1-mixed-request-preparation-design.md)：Stage文件级范围/owner投影、Runtime固定v2/v5构造、同账本和局部Source→Store验证；不经public index导出。最终局部结果见实施包文末及其单一results入口。投影不是持续权威/lease/资源资格，原acceptObservation/freeze/Store最终校验保留。未改wire/owner-map算法、SQL/迁移、Canonical IR、生产catalog或DESCRIBE；实际Native/Git/collector、完整资源目的/数值和P1-04/05/Phase1仍OPEN。

## 仅结构合同：mixed协议6预留（2026-10-30）

用户批准并交付[B-F1-A集中包](../../superpowers/plans/2026-10-29-phase1-binding-contract.md#实施结果与作者审查2026-10-30)。私有BindingCodeSyntaxRequestSchema以protocolVersion6、OBSERVE_CODE_SYNTAX及syntaxContract=SYNTAX_BINDING_V2区分新请求，Code contract仍PYTHON_SYNTAX_CODE_V1。BindingSyntaxObservationSchema只定义新增scope/assignment/declaration字段和范围结构。

无v6 raw byte framing/terminal/checksum/owner鉴证consumer、producer、CLI分发、DESCRIBE广告或profile资格。协议1..5未改，旧严格对象仍拒绝新字段；结构schema通过不能启动实际Native或视作完整wire准入。


## A/B本地闭环合同已批准 — 2026-11-02

用户明确批准[精确合同](../../superpowers/specs/2026-11-02-phase1-ab-local-closure-contract.md)及U0–U7整包，状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION；wire8/Syntax4/context5、最小语言表面证据、框架覆盖/site-plan、V2候选摘要/activation JSON及同lease联合提交按该合同执行。旧入口/历史/门禁不改，新增用途沿原规范0.5不代表概率校准。仅计划列明的本地库级运行/owned SQLite及范围内修复复验；生产CLI、profile、用户DB、云端CI/Git写入仍未授权。实施结果尚未验收，父项4/21、17OPEN不变。
