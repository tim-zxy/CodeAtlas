## Syntax3表面支持策略条件适用已批准并验证 — 2026-10-30

[B-F2-B附约§5](2026-10-30-phase1-binding-sufficiency-pipeline-design.md)将既有syntax-surface-support-v1的表面支持含义条件适用于八kind，仍固定0.5/method/原reason条件，不选择Runtime语义分数。新引用必须有当前Code/Evidence/Source支撑，任一所需Code低于原固定值即拒绝；PARTIAL/control/UNKNOWN保留，不获得完整发布资格。独立mapper/policy-crosswalk向量及实际Python库到V4已通过，见[结果与限制](../reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)；不是概率测量/校准或Semantic Gate。旧policy、数值、旧版本及历史保持。

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

# Phase1 Syntax 固定规则证据支持度设计

2026-10-26。DCP 补充提案：DESIGN_REVIEW_PENDING / NOT_ACCEPTED。用户已选择推荐路线，只授权本轮非数值设计细化；本设计、数值策略、实施和真实采集尚未获准。不是新的 IR、wire、数据库或 Runtime 策略接口。

## 1. 目标、依据与非目标

为 Syntax 的既有 confidence.score/method/reasons 明确一个可评审的解释：**在获准的固定版本规则和适用范围内，某条表面 Syntax 观察获得了哪些证据支持，以及这些支持如何对应获准取值**。它不是事实正确概率、动态执行成功率、框架业务判断、质量门禁通过率或发布许可。

本轮只确定非数值契约、输入证据维度、拒绝规则和后续证据工作。所有候选分数、权重、阈值、分档数量、method/reason 的具体标识及可启用版本表均留待有独立依据的后续方案。本设计不以未填写的表格或 null 字段创建合法 Canonical Syntax。

依据：[缺口审查](../reviews/2026-10-26-phase1-syntax-confidence-gap-review.md)、[已接受映射方向](2026-10-25-phase1-syntax-mapping-confidence-design.md)、[M-02 协议](2026-10-25-phase1-syntax-confidence-evidence-protocol.md)、[H1 history/Stage 契约](2026-10-25-phase1-r011-history-stage-contract.md)、[R1 局部实现评审](../reviews/2026-10-26-phase1-declared-raw-history-candidate-implementation-review.md)。当历史快照与当前状态不同时，以后续明确范围的补记为准；不把状态文字当作证据。

开始本轮时，前一审查封存的6456项文件哈希匹配。R1 的988项通过是历史封存结果，本轮未重跑；三个本轮原始详细报告丢失限制仍在，重建件仍为 NOT_ORIGINAL。已有局部 Code/history 候选不等于 final Code basis 或可信 Stage/run。

不包含：选择数值/概率校准、产品映射器/策略执行器、离线脚本或新 Fixture 实施、Native/DB/LLM/云端执行、新依赖/profile/迁移、框架语义、Wiki/Knowledge 发布或任何 DEFERRED 能力。缺失一种材料并不使该能力自动成为本阶段必做。

## 2. 已讨论路线与用户选择

A：固定规则下的证据支持度，先审查适用/拒绝/证据契约，随后单独审查数值。B：先设计可校准概率的独立真值、留出和评估方案，再申请必要执行。用户选择 A，原因是当前需要解释表面 Syntax 的支持，而现有材料没有概率校准资格。两条路线都不能把 Library 通过率变成分数。

本设计不建立一套“弱/中/强”等新等级，也不自动规定 EXACT 比 UNRESOLVED 更高、owner-present 比 owner-null 更高。后续若确需某种比较关系，必须给出限定域、独立依据与显式批准。跨策略或不同适用域的分数不自动可比，不增加排序或新的聚合规则。

## 3. 当前实码边界与职责

| 现有位置                                                       | 复用职责                                               | 本设计禁止推断                                       |
| -------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| packages/ir/src/confidence.ts                                  | 既有数值合法范围、method/reasons 严格形状              | 结构合法就可默认赋分                                 |
| packages/ir/src/syntax-evidence.ts                             | 五类 Syntax、Source/support/ref 形状与严格上下文       | 缺 confidence 的对象也是 SyntaxEvidence              |
| packages/providers/src/native-syntax-ipc.ts                    | raw/request/coverage/输入安全校验                      | 摘要或声明相符就认证实际观察                         |
| packages/providers/src/native-syntax-owner-binding.ts          | ACTIVE/PROVISIONAL owner 结构绑定和摘要                | caller ownerMap 或 availableEntities 获得 Stage 权限 |
| packages/providers/src/declared-delta-raw-support-candidate.ts | R0→Code normalize→完整原支持/history candidate，同账本 | 给出 final basis、Syntax origin 或评分依据           |
| H1 capture/Stage / Runtime                                     | 既有真实捕获、生命周期、固定装配与最终资格门禁         | 纯 Providers 结果等于运行/存储授权                   |

未来获准实现仍放在既有私有 Syntax normalizer 的固定纯规则路径，尽可能一个局部函数/固定表实现。精确文件、函数签名、内部测试入口和资源计费点在设计接受后的 writing-plans 中固定。现在不增加 policy registry、Plugin callback、通用 classifier 框架、用户配置、数据库策略表或公共 DTO。

## 4. 策略适用与完整性契约

一份可实施的后续策略必须同时具备：明确 score 含义；获准的 extractor/mapper/IR/policy 契约组合；全部适用输入分类；固定取值及其证据；method/reasons 规则；拒绝分类；独立 Fixture/Evaluation 记录；显式批准。不能只批准版本字符串，再由 caller 配置取值。版本/摘要标识契约，不证明当前代码、来源或运行可信。

产品路径只使用应用固定装配的已接受规则；不从 IPC、Plugin、LLM、请求或外部文件接受 caller-selected policy/callback/score。纯 Providers 仍校验其所需上下文，真实权限、Source freshness、capture/Stage/运行资格继续由既有拥有者检查；不把“应用固定装配”当成绕过后续资格的捷径。

一条完整 Syntax 必须在同一获准适用域内获得完整决策。分类没有被获准规则覆盖、契约不适配、证据不足以支持该策略或没有已接受数值策略，都保持 INCOMPATIBLE_CONTRACT 门禁。不得混用多版取值、回填未知分数、截断 payload 或输出“部分 Canonical Syntax”。保留已验证 raw/旧历史不等于接受新的 Syntax。

## 5. 证据维度与投影来源

下表是设计/证据审查维度，不是新 wire 字段，也不允许 caller 直接提交“已验证”特征来跳过原始上下文校验。后续规则必须从固定验证路径获得事实，保留原解析状态，不能从文本猜测。

| 维度              | 固定依据                                                                              | 不允许的替代依据                                                  |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Source 对应       | 原 sourceFileId、指纹、范围与目标 Source 一致；独立语料中的字节/范围注释              | 单凭路径、当前工作目录同名文件、摘要相符就声称实际捕获            |
| Syntax 类别与字段 | raw syntaxKind、原字段/序列与既有映射契约                                             | 从框架名称补语义或执行表达式                                      |
| owner             | 原 typed Provider ref→完整原映射→最终 selected CODE_NODE，同 Source；允许的 null 原样 | 借 owner confidence；从 winner-only 映射丢失原支持；null 自动低分 |
| callee/嵌套引用   | 原 resolution/targets、既有候选折叠与最终支持闭包                                     | 靠名字猜 resolved；把合法 UNKNOWN 转 resolved                     |
| 递归值            | 原值种类、顺序、重复项、UNKNOWN 原因与 Source 注释                                    | UNKNOWN 自由文本/文件名代表动态真值                               |
| 抽取/映射契约     | 明确版本、完整性/coverage 与既有 provenance                                           | method 字符串认证运行、忽略 PARTIAL/unsupported 记录              |
| 支持闭包          | Source 必有；所有 owner/callee/receiver/参数/嵌套 CODE_NODE 的真实支持值              | 少一个引用便降分通过；只检查 selected 表面结果                    |

合法 UNKNOWN、UNRESOLVED、HEURISTIC、AMBIGUOUS、UNSUPPORTED 等状态先按已接受字段/候选规则判断能否表达；可表达不等于已获评分。UNSUPPORTED 引用状态与不支持的抽取范围/策略契约是不同事实，不能因名称相同而一律拒绝或一律接受。

owner-null 的既有允许形状保留；ARTIFACT 仍需自身 Source/内容支持和专门策略证据，不能借“没有 owner”回避证据。是否生产器能发出它，是单独能力事实。没有该分层的真实产物时，不得宣称真实生产支持或擅改阶段范围。

## 6. 规则顺序、输出及错误

保持已接受调用依赖：不安全输入/资源检查 → 既有 raw/scope/Code/全部原支持与上下文校验 → 固定契约适配和适用类别核验 → 字段/引用映射及策略所需事实核验 → 获准固定置信决策 → 完整 Syntax parser 校验 → H1 origin/current projection 与后续 H3/H4/H5。

这个顺序表示依赖，不要求无策略时先构建整棵递归映射。缺固定策略/版本可在所需安全和既有准入检查后尽早拒绝；剩余中间表示同样要计费。具体错误优先级必须与旧入口保持一致，并在实施任务包用冲突输入的负例固定，不能由本设计改变旧公开错误集合。

- 不安全/超预算：沿用已有安全与 RESOURCE_LIMIT_EXCEEDED 分类，不吞并成普通缺策略。
- request/wire/coverage/上下文不一致：沿用对应层既有拒绝；完整观察要求仍由原门禁决定。
- Source/ref 缺失、跨版本、悬空，或 AMBIGUOUS 值折叠后不可表达：硬拒绝；其中不可表达映射沿用 INCOMPATIBLE_CONTRACT；其他安全 causeCode 和外层 INVALID_CANDIDATE 等包装沿已接受约定，不新增公共错误码。
- 合法但没有适配规则、没有获准数值策略：INCOMPATIBLE_CONTRACT，不输出缺字段的 Syntax。
- PARTIAL、FAILED、CANCELLED、未执行：记录实际状态；不能用某条成功子观察或低分满足全包 COMPLETE。历史 Library 的逐条只读报告能力不扩大为完整候选权限。

将来的成功结果只使用既有 score/method/reasons。method 绑定获准规则版本，reasons 是固定顺序、固定安全词汇的确定性说明，区分已核验支持和仍保留的不确定性；不携带 literal、Source 路径、SQL、任意异常文本或动态原因转写。具体标识在后续完整策略包精确化，本轮不预置一组可被误用的默认规则。

没有策略时不返回临时 Confidence/null score 供上游发布，也不通过附加 ready/policyAccepted/ownerAuthenticated 字段授予权限。拒绝保持输入、原观察、旧图和历史 pointer 不变；不执行回退采集、补读磁盘、DB、网络、shell 或 LLM。

## 7. 独立证据、数值批准与现有材料用途

每个后续候选取值必须有可审查的依据：在什么明确适用分类下，哪些独立 Source/注释/预期支持什么表面主张；有哪些拒绝与不确定对照；为何该值适合作为规则支持度，以及解释局限。不是正确概率就不声称校准，但也不免除 Fixture/Evaluation、现有 Quality Gate 和显式数值批准。不能从一次测试通过、样本计数或结构合法直接推导取值。

M-01/M-02 的31分类行和 R-01 的18历史例仍按原资格使用：前者是独立声明/拒绝期望，后者是历史 Library 一致性，measurementEligible=false、sourceOrHistoryAuthenticated=false。两者不自动拼成独立概率样本。矩阵 PROJECTABLE_WITHOUT_POLICY 只是无数值字段投影的测试期望，不是产品准入。

首先逐个将分类规则链接到既有独立 Source、expected、注释和历史记录；缺的明确列出。ARTIFACT、标量、其他 resolution、重复 OBJECT、代表性独立动态真值、失败取消与真实 Source/history/Stage/run 资格不能从材料计数补齐。对每项缺口先判定是可复用的契约反例、需新增离线声明控制，还是需要真实观察/阶段能力；后两项分别设计和审批，绝不为了填表提前扩充 DEFERRED。

默认先复用已保存材料，不重下载、不重跑完整回归。任何新实际采集都先提交目的、准确代码/构建、不可变输入、预计次数、作业范围、失败保留方式和可行本地/离线替代，并获得单独确认。选择本路线不授权任何 Native、校准、profile 数值或 CI。

## 8. 身份、存储、演进与恢复

不改 ConfidenceSchema、SyntaxEvidenceSchema、原有 SQLite 迁移或 provider-independent identity。policyVersion 仍按既有附约参与 extractionVersion；具体可启用值和契约组合在获准策略中固定，不新增本轮域标签。

origin 的 confidence/extractionVersion/payload 仍不可变；current projection 只按 H1 规则重绑定最终 basis/supportRefs，不能重新给旧 origin 评分。策略、extractor 或 mapper 契约变化，按已接受治理重新观察/创建新 origin 或显式 retire；即使输出 score 巧合相同，也不偷偷覆写原始记录。未批准的新策略不触发自动升级、历史回填或数据库写入。

失败不创建部分 Canonical、更改最后好图或旧 pointer；H3 freeze/H4 事务/未知提交恢复仍沿原 DCP，不能由纯规则函数替代。Code 的现有 fact-merger-min-v1 只维持既有语义，本设计不将其套用到 Syntax，也不新增跨策略 min/mean/投票。

安全继续按 Source 敏感性、权限和本地策略边界执行；reasons 及诊断不得把 SECRET 信息派生到输出。评分不执行 Source，不远程调用 LLM，不把候选变为知识。资源复用现有 maxSerializedBytes/maxItems/maxDepth 与同一累计账本；特征视图、查表键、解释数组、递归原/新表示与 parser 副本均须计入，无重新初始化、退款、截断或新默认额度。逻辑计费不等于 RSS/堆/时限或真实 Native 内存合格。

## 9. 后续依赖和验收追踪（非执行任务包）

| 设计单元                     | 依赖与可验证完成条件                                                                                   | Fixture / Gate / 验收边界                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| SC-01 规则证据准备包         | 本设计接受后用 writing-plans 固定逐分类证据矩阵、复用来源、缺失项及必要的离线检查；无取值、无产品评分  | M-01/M-02/R-01；逐引用/Source/类别可追溯；HS-RAW/HS-OWNER/HS-SYNTAX 的局部依据，不能声称完整通过  |
| SC-02 完整数值策略评审包     | SC-01 证据审查完成；固定适用契约、每个取值及依据、method/reasons、反例与局限，获得单独数值批准         | 独立正反 Fixture、Evaluation 适用性和已有 Quality Gates；不从支持度名称免除任何门禁               |
| SC-03 完整 Syntax 映射任务包 | 数值策略接受、全部原 Provider→Canonical 映射与完整最终 Code/Source/basis 前置满足；再写具体 TDD 任务包 | 五类/递归值/歧义/loser引用/owner-null/身份/无策略拒绝/原子性；HS-RAW/OWNER/SYNTAX/IDENTITY/BUDGET |
| H3/H4/H5 与 Phase1 exit      | 各自前置及独立批准；不被 SC 单元替代                                                                   | freeze/Store/真实运行/故障恢复/资源及完整阶段门禁继续 OPEN                                        |

SC-01 分类规则阅读与 Source 资料阅读可各自进行，但交付物依赖同一冻结矩阵与证据审核，不是独立并发实施任务。SC-02 依赖证据；SC-03 还依赖后续完整 basis/Stage 等原前置，不宣称 R1 已满足。默认本会话顺序推进，不新建工作树、会话或代理。

SC-01 必须只补新增决策需要的“规则—证据—缺口”对应关系，复用既有31分类行、18例历史报告、加载器和注释；不另造 M-01/M-02/R-01，不默认新增 Fixture 根、测试入口或 root 注册。如果任务化发现现有检查不能证明一个明确的新规则，先在具体包说明缺口和最小新增检查，再请求相应实施批准。

同一获准契约组合和同一已验证事实特征，不能仅因 Provider id、providerSyntaxId 或遍历顺序不同而得到不同结果；不同 extractor/mapper/policy 组合则不能借该等价性跳过适配核验。此性质不授予不同 Provider 真实提取能力等价或跨策略数值可比。

推荐本地验证分层：本轮只校验文档链接、格式、前置哈希和原文保留；以后离线准备包才可安排独立语料、恶意输入/不匹配版本/UNKNOWN与UNSUPPORTED对照、reasons安全/确定性/同特征换Provider/策略适配、精确额度/少一项/少一字节和旧API兼容检查。产品改变后按范围选择单元/Fixture/架构检查；涉及真实运行/资源/DB/CI 的命令分别批准。具体文件、命令和真实结果在各包确定，本轮不制造预计通过数。

## 10. 文档治理、设计退出与待确认事项

本提案只补充映射附约 §6 和 M-02 的“score 含义”未决点，不把它们改成已接受数值策略。接受后需同步 ADR-020、映射附约/M-02 协议、Provider SPI、Evaluation/Security、WBS/验收/追踪；Canonical IR 文档说明解释边界但不改 schema，迁移和产品 Fixture 暂无变更。精确清单在 SC-01 任务包核定。FROZEN 冲突停止相关范围；EVOLVABLE 变更仍需独立 Fixture/Evaluation 依据和同步基线。

本轮设计 Exit：用户选择已记录；当前实码/证据缺口可定位；适用/拒绝/输出/版本/预算/历史恢复边界明确；逐单元验收追踪与缺失门禁列出；作者审查完成且哈希/链接/格式可复核。这是设计包 REVIEW_READY，不是 accepted 或 implementation-ready。

请求确认本书面设计及 SC-01 任务包细化方向。接受仅允许制定具体准备计划；不批准分数、完整策略、Fixture/脚本/产品实施、Native/DB/校准/依赖/profile/云端/Git动作。Full H2/H3 DESIGN_BLOCKED，policy NOT_SELECTED；H4/H5/P1-04/05/Phase1 OPEN。C1 EPERM、C2 spent、Native timeout UNKNOWN、main取消结算未查询、R4 mutable DB与R1详细报告丢失限制继续保留。
