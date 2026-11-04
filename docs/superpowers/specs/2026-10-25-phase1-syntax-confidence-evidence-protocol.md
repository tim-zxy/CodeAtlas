## 组件输入可携带性检查点 — 2026-10-27

已将36份封存组件输入整理为库内可携带材料：24份JSON按标准库gzip保存原payload字节，12份JSONL不变，loader校验存储/解压摘要与原byteLength。六处消费者不再读旧私有输入；未从产品生成expected、未修改.prettierignore或格式门禁。原目录与无旧私有输入复制目录四组均212/212，0fail/cancel/skip/todo，含19个真实Node退出；不同环境重复不累计为424。架构17项目通过，产品/编译产物未改。[本轮作者评审](../reviews/2026-10-27-phase1-component-reference-portability-review.md)记录Windows路径及辅助代码首轮失败、最终转绿和可复现入口。

新增材料为原Fixture根附加参考39文件，不新增Fixture ID/门槛；原2241 Fixture字节、所有历史原文/失败保留，registry61/exactPhase1 35/catalog0。原Stage66/Store43共109项已逐项映射输入/期望/基线摘要、相关组件证据及缺口，尚未执行的原case全部保持OPEN，不以组件数冒充验收。

本记录替代下方“组件必须读取旧W输入”的历史限制；.superpowers仍仅作证据/临时输出而不提交。D/E/F IN_PROGRESS、G OPEN；独立整操作预算、完整原Fixture与较宽旧快照恢复仍待，B1b/P1-04/05/Phase1未完成。原D..G顺序继续，无新增Native、校准、profile/依赖/数值、CI或Git授权；timeout仍UNKNOWN及全部既有风险不变。

## ABA 与 Store 组件新检查点 — 2026-10-27

获批ABA私有SQLite见证及实际查询记账3→5已实施，同/另连接ABA拒绝；Store锁内资格、一次lease消费、原子持久写入、未知提交只读判定和清理诊断已接入。19类实际SQL边界异常与真实Node退出38/38。[作者组件评审](../reviews/2026-10-27-phase1-stage-aba-store-component-review.md)记录全部RED→GREEN及范围限制；下方待批准/无Store/ABA仍RED等为保留快照。

最新集中本地回归15文件609/609，0fail/cancel/skip/todo；Storage/Runtime build exit0，架构17项目通过。Stage37/Store69是组件结果，不代替原Stage66/Store43逐项验收。原Fixture2241字节、registry61/Phase1 35/catalog0保持，全部历史失败/原文保留。

D/E/F IN_PROGRESS，G OPEN；独立整操作预算reference、完整66/43映射、可携带Fixture整理及较宽原始快照恢复仍待，B1b/P1-04/05/Phase1未完成。组件数据仍在私有证据目录，不可提交.superpowers或声称干净checkout/CI就绪。原D..G已批准，后续顺序推进无需逐小步骤确认；无新增Native、校准、依赖、数值、云端CI或Git写入授权。Native历史timeout仍UNKNOWN，既有风险不变。

## ABA 私有见证修订已批准 — 2026-10-27

用户明确批准 `2026-10-27-phase1-stage-aba-witness-proposal.md`：使用 SQLite total_changes/data_version 私有见证，按实际两条数字 SQL 行累计计费，构造预留3→5；不改变预算输入、默认值、公开契约或原门禁。原 D..G 继续顺序实施。下方自动审批阻断／待批准为历史，旧失败与原文保留；Stage66、Store43、整操作独立预算与恢复退出仍 OPEN，不将批准记为执行通过。无 Native、云端 CI 或 Git 写入授权。

## B1b 前置验证与 Stage 冻结组件检查点（ABA 阻断）— 2026-10-27

已批准三方法修订已接入：Runtime 原 Java/v5/full/R0 规则复用；真实 Stage owner/观察接收、独立最终 H1/Code/原始支持/快照/coverage/pair 验证、固定 TEMP 全内容 seal及私有 lease 已实现。三组 owner/完整最终目标在相应产品前独立冻结；仅删 null 保留原文与物理 coverage。非法方法调用按原冻结矩阵保留状态，真正验证失败/重入仍撤权。[作者组件评审](../reviews/2026-10-27-phase1-early-validation-stage-freeze-review.md)为本次依据，不是整包或独立评审。

最新十文件 **476项：474通过、2项ABA失败，0cancel/skip/todo**；Storage/Runtime build和17项目架构通过。不得把旧473/473当最后绿色结果。原2241 Fixture字节、registry61/Phase1 35/catalog0保留；Stage66/Store43未执行验收。Store仅新增独立SQL目标和missingAPI RED准备，无产品实现。D/E IN_PROGRESS、F/G OPEN；整操作独立预算、完整原快照恢复及竞争/崩溃/COMMIT恢复均待，B1b/P1-04/05/Phase1未完成。

自动审批拒绝了尚未执行的 ABA 私有见证/实际查询预留3→5，认为是未批准的数值/记账变更；没有绕过或应用。[具体ABA修订](2026-10-27-phase1-stage-aba-witness-proposal.md)待明确确认，相关资格/锁内链不能验收。无真实 Native、校准、新依赖/值、云端 CI或Git写入，原风险不变；下方是保留的历史快照。

## 前置验证端口局部修订已接受 — 2026-10-27

用户明确批准 [前置验证接口修订](2026-10-27-phase1-stage-early-validation-proposal.md)。本补记替代下方关于该提案待批准／单方法接口的历史结论：固定私有端口为 prepareJavaOwner、validateObservation、compose；前两者依各自状态先校验，compose 仍仅在 OBSERVED→FROZEN 调用一次，锁内均不执行。Stage 独立验证并授 owner/lease；原 raw/Source/IR/closure/预算门禁保持。接受的是设计及原 D..G 内实施，不表示尚未执行的 Stage66/Store43、整操作预算或 Store 门禁通过。

## B1b 无 Java owner 准备与前置验证接口缺口 — 2026-10-27

原已批准 D..G 中，Stage 新增无 Java owner 准备：真实同库读集重查、自算 full/变化 Python/仅删除范围，独立完整正文/摘要3例，unsafe/篡改/时序负控制；仅内部 owner，无 acceptObservation、freeze、lease 或 Store。[作者检查点](../reviews/2026-10-27-phase1-owner-preparation-and-early-validation-review.md)及本包 owner-preparation-final-cohort 记录最终九文件420/420，0fail/cancel/skip/todo；Storage 构建和17项目架构通过。Stage11只是组件测试，Stage66/Store43未记执行通过，registry61/Phase1 35/catalog0不变，原2241 Fixture字节保留。

新发现原 §5 的“提前验证 Java/v5”与“只有一次 compose”在依赖边界下缺少连接入口；[局部接口提案](2026-10-27-phase1-stage-early-validation-proposal.md)为 PROPOSED，尚未实施。仅此契约变更相关 Java/接收连接待明确批准，原批次批准不撤回。D/E IN_PROGRESS、F/G OPEN，B1b/P1-04/05/Phase1未完成；不新增 Native、云端 CI、Git 写入、数值或依赖，全部历史失败与风险保留。

## B1b DELTA／NO_OP and owned Stage foundation checkpoint — 2026-10-27

原已批准 D..G 连续推进：固定 Runtime 的自算 scope／DELTA raw／仅删除／NO_OP、完整旧 origin／祖先／当前 Code 核验与 retained 重投影已实现；H1 私有同库有界读集保存全仓 census 和原始 snapshot／capability／physical coverage／history 行，原 capture 和每次私有读取消费累计保留，缺失 diagnostics 不补造。Stage 仅 constructor/close 所有权基础已实现，不抢占已有 TEMP、不删除普通重建或重开连接后的同名表，计费先于分配和 TEMP 创建。[本次作者评审／证据](../reviews/2026-10-27-phase1-b1b-delta-owned-stage-foundation-review.md)为当前新增进度依据。

最终九文件415/415，0 fail/cancel/skip/todo；Storage／Runtime 构建和架构17项目通过，registry61／Phase1 35／catalog0，旧 Fixture／证据保留。独立参考的首稿 H0 域纠正和后续 transport basis／owner-map／回显适配均保留原字节及失败；不冒充原 Source/Native 资格或全部最终字节预先冻结。动态 receipt exact／少一为一致性控制，不是独立整操作／RSS 资格。

D/E 仍 IN_PROGRESS：真实 Java 临时 owner／完整 scope、acceptObservation、一次 freeze／TEMP seal／opaque lease、原 snapshot registry 恢复与整链独立 budget 证明待连接。F Store／锁内 CAS／竞争／崩溃／COMMIT 未知恢复和 G 整包门禁 OPEN；Stage66/Store43 未算执行通过，新增 Stage 单元文件未提前增加根注册。P1-04/05、B1b、Phase1 未完成；继续原批准范围，无新批准请求、Native、云端 CI、Git 写入、新依赖／数值，原风险保留。

## B1b fixed Runtime FULL component checkpoint — 2026-10-26

原已批准 D..G 内，固定同步 Runtime 端口的 FULL 分支已连接严格原 raw、全部支持／候选、未来九组 Code 身份、固定 Syntax mapper、完整 manifest／origin-current，并实际调用原 H1 manifest/pair 校验。[本次作者评审与证据](../reviews/2026-10-26-phase1-b1b-runtime-full-component-review.md)为新增进度依据。FULL 保留准确 parent、完整旧 snapshot／诊断和 physical coverage multiplicity；全库 census 独立于当前 revision，snapshot ID 已存在即拒绝，foreign active Provider 无本次重验证则拒绝。未增加公共出口或生产路由；输入声明先经受预算 H1 编解码独立拥有，输出冻结不影响调用者。

最终六文件365/365（0 fail/cancel/skip/todo），Storage／Runtime 构建通过，架构17项目通过。旧 Fixture 与原证据不改。Provider 各段接收总已用计数，并在执行前以剩余内存限制表示预算；实际用量累计并保留，精确／少一 receipt 为动态一致性控制，不冒充独立全链算术或 RSS 资格。

D 仍 IN_PROGRESS：DELTA／NO_OP 尚未实现并明确拒绝；owned capture/census、真实 Java 临时 owner/raw 绑定、祖先重投影／退休及 Stage 可核验整链 receipt OPEN。当前输入均为声明式读集，端口不能认证 Source/run/owner，也不能授 lease 或发布。E/F 的真实 Stage／Store／磁盘故障和 G 全包门禁仍 OPEN；Stage66/Store43 不记为执行通过。P1-04/05、B1b、Phase1 未完成。无真实 Native、云端 CI、Git 写入、新依赖或数值；原已接受风险保留。

## B1b full manifest / Code identity component checkpoint — 2026-10-26

在原已批准 D..G 内继续实施。未来完整九组 Code 身份（含全库 snapshot census 与 coverage multiplicity）、完整九字段 manifest／准确 parent／transition／origin-current 身份、full raw 到全部原支持／单位／coverage 的桥已实现并局部核验；私有 full 的 v5 解码现在计入共享账本，旧公开结果和原 R1 预算不变。[本次作者评审与精确证据](../reviews/2026-10-26-phase1-b1b-full-manifest-component-review.md)为当前进度依据。

集中37文件1429/1429，后续 Unicode 清单适配修正后相关207/207；分组重叠、不相加，1429不是最后窄修正后的全范围重跑。Providers/Storage/Runtime 构建、IR types、17项目架构检查通过。独立 Source/Fixture／旧收据不改，registry61/Phase1 35/catalog0，剩余 Stage/Store 根尚未注册。新 full 桥只在各自顺序独立通过后，按 Source ID 比较全部字段；Native UTF8、H1 UTF16 与旧 R0/R1 门禁都保持。

D 仍 IN_PROGRESS：固定 Runtime 规则、owned capture/census 连线、原 owner/祖先与整链预算 receipt 未完成；E/F 的真实 Stage/Store／竞争／崩溃／COMMIT 未知恢复和 G 全包门禁 OPEN。当前均为声明式组件，不授 Source/Native/发布资格，Stage66/Store43 未算通过。B1b、P1-04/05、Phase1 不宣称完成；无新依赖／数值、真实 Native、云端 CI 或 Git 写入。原风险与历史失败保留。

## B1b D component checkpoint — 2026-10-26

按已批准原批次继续：diagnostics 的 H1 修正与严格 raw 对照已通过，D 的 full/R1 同 ledger 续接和新／保留 origin-current pair 已实现并局部验证。详见[本次实施与证据检查点](../reviews/2026-10-26-phase1-b1b-d-component-checkpoint-review.md)，其 remaining 为当前状态依据。集中 37 文件 1373/1373；后补 H1 全字段控制 90/90，最终解析表示计费后受影响 pair/mapper 81/81；Providers/Storage/Runtime 构建和 17 项目架构检查通过。证据根与准确运行范围见评审，不合并这些重叠测试数，不称最后全包重跑。

D 仍 IN_PROGRESS：未来完整 Code 身份、manifest/parent/transition、固定 Runtime RulesPort 和 owned receipt 尚待；E/F/G 的真实 Stage、原子 Store、竞争／崩溃／COMMIT 未知恢复及整批门禁 OPEN。当前组件不是 Source/Native 或发布资格证明。P1-04/05、B1b、Phase1 均未完成；原 Stage/Store 声明语料不记为执行通过。无真实 Native、新数值／依赖、云端 CI 或 Git 写入。下方历史 pending/hold 已由先前批准补记替代，原文／失败／风险不删。

## Snapshot diagnostics clarification accepted; original B1b D..G resumed — 2026-10-26

用户已明确批准[兼容澄清](2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md)并继续原批次，无需重新拆包确认。H1 旧 SQL 比较投影 P 精确包含 id、repositoryId、providerId、providerVersion、runtimeVersion、requestedRevisionId、requestedRevisionFingerprint、startedAt、completedAt、capabilities、outcome；仅 diagnostics 不属于旧表可重建字段。完整 diagnostics 原序保留在不可变 history/origin 和其身份中，不能从旧 SQL 的缺失字段推断原观察为空；origin/registry 完整比较、新 snapshot freshness 和同 ID 异内容拒绝不变。无迁移／IR／wire／Code 身份／数值变更。

H1 永久回归先 RED（79 项中 2 项预期失败），窄修正后连同严格 raw 对照共 81/81 通过，含 INFO/WARNING 完整保留、只读磁盘重开及两时间字段漂移拒绝；Storage build 通过。证据：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/diagnostics-permanent-red._、diagnostics-compatibility-green._、diagnostics-storage-build.*。这只是当前局部证据；D/E/F、完整预算／故障恢复／Store/raw 同诊断核验及 G 全包门禁仍待执行，B1b/P1-04/05 和 Phase1 均未完成。生产资格路由保持关闭，无真实 Native／新依赖／校准／云端 CI／Git 写入。下方旧状态是保留快照，其 pending/hold 结论由本补记替代，旧失败不改为通过。

## B1b approved: local B/C implementation verified; dependent closure held on Snapshot diagnostics — 2026-10-26

User “批准” authorizes the complete A..G local package, including its isolated DB/Node recovery tests; earlier EXECUTION_NOT_AUTHORIZED snapshots below are historical for that package. Current [implementation checkpoint](../reviews/2026-10-26-phase1-b1b-bc-implementation-checkpoint-review.md) records A corpus preparation and B/C local implementations, not full B1b/H2/H3/H4/Phase1 completion. Fixed score0.5/method/policy syntax-surface-support-v1 now has a tested private mapper; Runtime routing/profile catalog remains disabled/empty, not production-ready or measured probability. Existing weakest-support upper bounds and all gates stand.

Fresh applicable36-file local cohort **1337PASS/0fail/cancel/skip/todo**; Providers/Storage/Runtime builds and IR types exit0; architecture17 passes. Independent new data184cases/404files; registry61/exactPhase1 35/catalog0; only B/C roots registered now. Old1837 Fixture bytes and original evidence remain protected. Test groups overlap and are not summed. Full Stage/Store/disk recovery and HS-RUNTIME remain unexecuted.

A preserved local control proves accepted SUCCEEDED+WARNING diagnostics cannot currently survive H1 full SQL-object comparison: control1PASS,warning1RED INVALID_HISTORY. Old SQL does not store diagnostics but the reader invents[]; full raw/manifest contracts preserve them. [Concrete compatibility proposal](2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md) is PROPOSED/NOT_ACCEPTED/NOT_IMPLEMENTED. D/E/F dependent work is held; no comparison was relaxed. Accepting that clarification would resume already approved D..G without another task-package approval.

No real Native/helper/collector/model/calibration/profile/dependency/cloud CI/push/commit/PR/merge, new agent/session/worktree or user DB/R4 operation occurred. Source/IR/wire/SQL checksums/normalizer Code confidence/public index remain unchanged; package test registration only changes as declared. P1-04/05/Phase1 OPEN,main tasks4/21complete/17open. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss/root-dependency chronology limits remain. Evidence: .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/implementation-checkpoint-verification.json.

## SC-02 numerical contract accepted; B1b precise plan awaiting execution approval — 2026-10-26

User “接受，继续” accepts the [complete numerical contract](2026-10-26-phase1-syntax-confidence-candidate-design.md) and authorizes B1b task refinement only. Policy is **ACCEPTED_NOT_IMPLEMENTED**, not NOT_SELECTED: one conditional score=0.5; method/policyVersion=syntax-surface-support-v1; mapperVersion=syntax-canonical-mapper-v1; extractorVersion=syntax-v1; codeatlas.syntax-evidence v1; seven fixed reason tokens/conditions/order in that contract §6. This is normative evidential support, not measured probability; no fallback/ranking/new aggregate rule. Existing weakest-support upper bounds and all hard refusals/gates remain. Previous PROPOSED/NOT_ACCEPTED/NOT_SELECTED snapshots below are historical for this exact contract; old audit/crosswalk nulls are preserved historical records, not rewritten as measurements.

The [B1b local closure plan](../plans/2026-10-26-phase1-b1b-local-canonical-history-closure.md) and its author review are PLAN_REVIEW_READY / EXECUTION_NOT_AUTHORIZED. Tasks A..G cover independent corpus, unchanged C3-A identity factoring, fixed Canonical mapping, complete origin/current candidate, actual Stage/lease and atomic Store/recovery. It explicitly proposes new isolated node:sqlite and Node crash-worker tests; no such test, product change or Fixture has run this turn. H2/H3 no longer lack a selected numerical design, but complete implementation/final basis/Stage/Store/runtime gates remain OPEN; no readiness or parent acceptance follows. Full H5/real Native/profile/Source qualification remains separately gated.

6594 predecessor hashes matched at planning start. All18 original document byte sequences are retained as exact suffixes and separate snapshots. No product/Fixture/test/build/DB/Native/helper/model/calibration/profile/dependency/cloud/Git mutation, new agent/session/worktree or full regression occurred. P1-04/05/Phase1 OPEN; main-task count remains4/21 complete,17open. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1 detailed-report loss/root-dependency chronology limits persist. Evidence: .superpowers/design/2026-10-26-phase1-b1b-local-closure-plan/plan-verification.json.

## B1a / SC-01 differential rule-evidence crosswalk verified locally — 2026-10-26

User-approved SC-01-1 has completed its document/audit work as **LOCAL_RULE_EVIDENCE_CROSSWALK_ONLY**;[author implementation review](../reviews/2026-10-26-phase1-syntax-support-confidence-preparation-implementation-review.md) and [crosswalk](2026-10-26-phase1-syntax-support-confidence-crosswalk.json) record boundaries and concentrated next decisions. Earlier NOT_STARTED/execution-pending notes below are historical for this exact package only. Batch execution rules are accepted for approved scopes;no later batch or policy execution follows automatically.

One document binds6 immutable basis sources,9 rule relations,31 existing declaration IDs,18 historical records and10 OPEN gaps. All scores/thresholds/measurements remain absent/null. Local callable RED32:27PASS5FAIL preceded GREEN32/32,0fail/cancel/skip/todo;26 copied-metadata refusal controls. Final closure reruns only this audit to recheck immutable-design suffix/basis,with actual receipt retained. No new product capability or Phase1 parent is accepted by this metadata result.

1837 Fixture and1155 product files/package/registration remain unchanged;registry57/exactPhase1 31/catalog0. No new Fixture/root entry/build/actual observation/Native/helper/DB/model/calibration/dependency/profile/cloud/Git action or agent/session/worktree. Product suites/architecture not rerun under document-only applicability;old results remain historical,not waived. Original18 document suffixes,all first freezes/failures and old Library/Source qualification persist.

Next is a separately reviewed SC-02 complete-policy evidence/approval decision,not default scores or another automatic preparation package. FullH2/H3 DESIGN_BLOCKED,policy NOT_SELECTED;H4/H5/P1-04/05/Phase1 OPEN,main-task closure remains4/21. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss limits persist. Final seal: .superpowers/sdd/2026-10-26-phase1-syntax-support-confidence-preparation/implementation-verification.json.

## B1a / SC-01 exact preparation package approved; execution in progress — 2026-10-26

User explicitly approved the batch rules and the complete [B1a/SC-01 package](../plans/2026-10-26-phase1-syntax-support-confidence-preparation.md). Only the differential document,task-local audit,listed local checks and18-document closure are authorized. One atomic dependent task is IN_PROGRESS;no completion result is implied. FutureB1b/c/B2..8,score/method/reason values,product/Fixture/root registration,Native/helper/DB/calibration/dependency/profile/cloud/Git actions remain unapproved.

All6506 predecessor hashes matched at start;18 raw document snapshots,1837 Fixture paths/hashes and1155 product paths/hashes are pinned. Six immutable basis copies preserve the current design even when status notices are added. Expected missing-document RED was observed and retained. FullH2/H3 DESIGN_BLOCKED,policy NOT_SELECTED;H4/H5/P1-04/05/Phase1 OPEN. Old Source/Library qualification and all original evidence/suffixes/EOL remain;C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss limits persist. Ledger: .superpowers/sdd/2026-10-26-phase1-syntax-support-confidence-preparation/progress.md.

## Syntax support-confidence nonnumeric design accepted; SC-01 concrete package pending — 2026-10-26

User explicitly approved the [written nonnumeric DCP supplement](2026-10-26-phase1-syntax-support-confidence-design.md). Only its fixed-rule evidential-support meaning, applicability/refusal/evidence boundaries and SC-01 task refinement are accepted. Earlier written-design NOT_ACCEPTED wording below is historical; **numerical policy remains NOT_SELECTED**. This is not a new score, grade ordering, calibrated probability, runtime policy or product implementation.

The existing IR/wire/SQL shapes, Code confidence and Quality Gates remain unchanged. Source/reference defects are hard refusals; legal unknown/resolution states preserve their meaning and receive no default ranking. Fixed application rules cannot come from caller JSON/Plugin/LLM. Original origin confidence/extractionVersion remains immutable; same-ledger budgets and separate real capture/Stage/Store/run authority stand. No FROZEN shape or EVOLVABLE threshold is changed.

The [SC-01 concrete preparation plan](../plans/2026-10-26-phase1-syntax-support-confidence-preparation.md) is REVIEW_READY / EXECUTION_NOT_AUTHORIZED. It adds only a differential rule/evidence/gap document using existing31 mapping rows and18 historical cases; no repeated M-01/M-02/R-01, new Fixture/root test or registration. A minimal task-local audit is proposed because existing validators do not cover that new document; it requires concrete package approval. Scores,complete policy,product/Fixture/scripts/actual collection/Native/DB/profile/calibration/dependency/cloud/Git actions remain unapproved.

Fresh planning baseline matched6465 predecessor hashes. No product/Fixture/test/build or actual measurement ran. Old document bytes remain suffixes;R1 detailed-report loss and all historical failures remain disclosed. FullH2/H3 DESIGN_BLOCKED,H4/H5/P1-04/05/Phase1 OPEN;C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4 restrictions persist. Receipt: .superpowers/sdd/2026-10-26-phase1-syntax-support-confidence-preparation/plan-review.json.

# Phase1 Syntax confidence evidence protocol

Status: EVIDENCE_PLAN_ONLY / LOCAL_CONFIDENCE_EVIDENCE_PLAN after the linked local checks. No observations have been collected and no numerical policy is selected.

Authority: [accepted nonnumeric mapping design](2026-10-25-phase1-syntax-mapping-confidence-design.md), [M-01 preparation](../plans/2026-10-25-phase1-syntax-mapping-preparation.md), [M-02 plan](../plans/2026-10-25-phase1-syntax-confidence-evidence.md). The [machine-readable matrix](2026-10-25-phase1-syntax-confidence-evidence-plan.json) binds the frozen [independent corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md). This protocol does not authorize collection or product implementation.

## What a future confidence policy would describe

A future versioned score/method/reasons would describe the evidential support for a surface Syntax observation under named Source, extractor and mapper contracts. It must state whether it is a categorical support measure or an empirically calibrated probability, with corresponding independent evidence. This plan chooses neither interpretation nor numerical values. A score cannot establish framework behavior, business meaning, execution behavior or publication authority.

Missing Source, stale fingerprint, cross-revision owner, unsupported binding and unrepresentable value ambiguity are rejection conditions, never low-score successes. A selected Code node's confidence cannot be borrowed as Syntax confidence; ownerless ARTIFACT needs its own evidence. Missing approved policy continues to block Canonical Syntax. The offline positive projections are incomplete nonnumeric expectations, not Canonical envelopes or an implementation of this Runtime refusal.

## Current classification and independent truth

The matrix includes every 31 declared mapping case in cases.json order and excludes exactly the three IDENTITY_ENCODING_ONLY probes. The 31 rows are declarations, including rejection controls, not measured observations, independent samples or evidence of sufficient sample size. Provider/revision identity mapping cases remain rows. Each row pins source paths and SHA256 bytes and records owner state, raw resolution labels, UNKNOWN presence, Source annotation grounding and expected disposition. Observed disposition, measurements, numericalPolicy and thresholds remain null.

Independent literal expectations were authored before the oracle and frozen with provenance. Five sources are byte-identical copies from retained existing roots; the new YAML source and unsupported declarations are schema-only. A Source line annotation supports only the surface syntax explicitly visible on that line. Reference resolution in the component declarations is supplied test context, not proof that a Native producer emitted it or that a symbol really resolves. Original raw resolution/originalHint must remain provenance where Canonical fields cannot express them.

No UNKNOWN reason, method name or filename implies dynamic behavior. The current UNKNOWN declaration is UNDETERMINED. The copied dynamic.py filename contains surface framework syntax and is classified STATIC_SYNTAX_ONLY, not an observed dynamic trace. There is no SOURCE_ANNOTATED_DYNAMIC observation in this preparation. All source coordinate claims use the retained Native convention: zero-based line, zero-based UTF8 byte columns, exclusive end; the Unicode identity probes are not coordinate goldens.

## Future collection and comparison protocol — not executed

1. First review purpose, exact immutable inputs and source permissions. Separately authorize any real observation, Native/helper invocation, calibration, profiles, new dependencies or cloud work. Specify exact operation/commit, run count, job scope and local/offline alternatives before that approval. Read-only reuse of existing complete artifacts should precede new capture. No downloads or remeasurement are authorized here.
2. Bind the chosen Source bytes/paths/fingerprints/revision, observation IDs and coverage to extractor build/version, mapper contract/version, policy contract/version when approved, IR contract, selected Code and original typed binding provenance. A digest/version is an identity, not an authorization credential. Permission/local-only/secret checks and freshness must precede any processing; no remote processing or LLM call is implied.
3. Keep source annotation and expected truth independent of candidate output. Review annotation completeness and ambiguous truth explicitly; retain holdout separation if reused, without presenting directory names as new calibration eligibility. Never regenerate expected results from the candidate mapper. Preserve baseline/failure/cancellation receipts and any governed corrected successor.
4. Compare field values and meaningful order, Source literal/range/fingerprint agreement, owner and nested reference closure, expected refusal versus actual refusal, omitted observations and per-kind/coverage/parse-state results. Callee ambiguity coalescing may remain NON_RESOLVED with one candidate; value ambiguity coalescing below two must reject. Neither is a confidence upgrade.
5. Report owner-null, static, independently annotated dynamic, UNKNOWN/UNDETERMINED, AMBIGUOUS, UNRESOLVED, UNSUPPORTED and partial/failure strata separately. Do not treat schema-only ARTIFACT or duplicate OBJECT values as supported Native capabilities. Unsupported/partial coverage and omitted facts remain visible; cancelled/failed/not-run cases do not enter a passing or successful denominator. Preserve exact dispositions, completeness reasons and denominators before any later metric calculation.
6. Review the report and remaining coverage gaps. Only then propose a fixed versioned numerical policy with its intended applicability, score meaning, method/reasons, limitations and supporting evidence. Obtain separate explicit approval before implementing/enabling the policy or full H2/H3. Do not choose fallback values for an unapproved stratum.

## Prospective report fields

Every result below is NOT_COLLECTED; no pass threshold is introduced.

| Proposed field | Required context | Current result |
| --- | --- | --- |
| Surface field/value and sequence agreement | Independent literal expectations, kind and source provenance | NOT_COLLECTED |
| Source grounding | Bytes/fingerprint/range convention and literal slice | NOT_COLLECTED |
| Owner and nested reference closure | Selected canonical IDs, original typed bindings, resolution class | NOT_COLLECTED |
| Omission and expected refusal agreement | Complete input inventory, raw coverage, reasons and rejected cases | NOT_COLLECTED |
| Per-kind/parse-state outcomes | Static/dynamic/UNKNOWN, owner-null, partial/unsupported, failure/not-run strata | NOT_COLLECTED |
| Policy behavior and any claimed calibration | Explicit approved policy meaning/version and independent evidence | NOT_COLLECTED |

## Gaps and next decision

The present corpus proves offline declaration consistency only. Actual Native extraction agreement, representative Source-annotated dynamic behavior, actual partial/unsupported coverage and cancellation outcomes, full Canonical Syntax with approved confidence, resource/run qualification and end-to-end H2/H3–H5 remain unmeasured or unimplemented. The 31 rows cannot resolve these gaps by their number. No sample sufficiency, new score, threshold or job count is invented.

Next decision: REVIEW_EVIDENCE_PROTOCOL_BEFORE_ANY_EXECUTION. Review this protocol and choose the exact separately bounded evidence operation and inputs, including whether existing artifacts suffice. This is a review request, not permission to run. H1 local acceptance remains historical; full Phase1 exit and P1-04/05 parent gates remain open. Existing C1 symlink EPERM, spent C2 lifetimes, Native timeout UNKNOWN, unqueried main cancellation settlement and R4 mutable-database restrictions persist.
