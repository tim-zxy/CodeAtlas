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

## SC-02 numerical candidate drafted; acceptance pending — 2026-10-26

User explicitly authorized drafting numerical candidates only. The [complete candidate](2026-10-26-phase1-syntax-confidence-candidate-design.md) and [author review](../reviews/2026-10-26-phase1-syntax-confidence-candidate-review.md) propose one conditional score0.5,method/policy syntax-surface-support-v1,a precise extractor/mapper/IR combination and7 fixed reason tokens. These are normative design suggestions,not measured accuracy or accepted defaults. Policy remains NOT_SELECTED;no actual implementation or activation. Earlier permission-to-draft-pending wording below is historical for that permission only.

The proposal preserves all hard refusals,oldIR/wire/SQL,original confidence/origin/history and budgets. It adds no fine ranking;existing weakest-support upper bounds remain unchanged and may constrain derived values if this score enters their support chain. No gate is lowered to accommodate0.5. Accepting design would permit preciseB1b task refinement,not automatic code/Fixture/Native/DB/model/calibration/dependency/cloud/Git action.

6583 predecessor hashes matched. This turn changes only candidate/review/five notices and local evidence,no source/build/test/Fixture/measurement. FullH2/H3 DESIGN_BLOCKED,B1/P1-04/05/Phase1 OPEN,main tasks4/21 complete/17open. All original suffixes/failures/qualification and C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss/root-dependency provenance limits persist. Receipt: .superpowers/design/2026-10-26-phase1-syntax-confidence-candidate/design-verification.json.

# SC-02 Syntax 置信策略集中评审材料

2026-10-26。状态：SC02_REVIEW_PREPARATION / NUMERICAL_DECISION_REQUIRED。不是完整策略、数值接受或实施许可。用户要求继续下一步，本轮仅整理可评审策略边界和必须集中决定的数值提案范围。没有新分数、分档数量、权重、阈值或可启用版本。

## 1. 当前进度与本次交付

B1a/SC-01已完成LOCAL_RULE_EVIDENCE_CROSSWALK_ONLY。开始本轮时其6575项封存摘要匹配；32项audit结果是上一轮本地元数据证据，本轮不重跑或说成产品验收。原始根依赖快照遗漏、R1三份详细报告丢失、历史Native timeout UNKNOWN等限制均保留。

[既有支持度设计](2026-10-26-phase1-syntax-support-confidence-design.md)接受的是固定规则下的证据支持程度；[SC-01对应表](2026-10-26-phase1-syntax-support-confidence-crosswalk.json)连接9条要求、31个声明行和18个历史记录，并保留10个OPEN缺口。它们没有选择数值、适配版本表或安全解释词汇；也不能决定哪些现实输入有资格进入当前运行。

本材料给出下一完整策略包的准入顺序、规则输入/输出约束、现有证据可用性、不可推导项、所需决策与一体化后续边界。它不再新增一轮语料/分类准备任务；缺口对应原门禁，直接交给完整策略评审解决或提出有目的的独立证据操作。

## 2. 必须分开的三个问题

| 问题                   | 当前可明确的内容                                                                 | 当前不可声称                              |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| 输入与引用是否合法     | 严格raw/Source/完整原支持/selected引用闭包、合法值与歧义规则、完整性、权限和预算 | 违法输入可以低分通过                      |
| 获准规则怎样解释支持度 | 固定适用域内的证据支持，非正确概率；UNKNOWN/UNRESOLVED保持语义，不能自动排名     | 现有测试或计数唯一决定某个数值            |
| 当前操作是否有资格发布 | 仍由真实capture/final basis/Stage/Store/run及MANUAL边界决定                      | 纯函数输出分数或版本文本认证实际执行/发布 |

不得为了绕过第二项，把第一项布尔结果直接当作0/1分数；也不得把第三项资格位编码进分数。未通过各自门禁就拒绝相关操作，保留旧图/旧历史。

## 3. 已核实的契约标识与适用边界

实码 [ConfidenceSchema](../../../packages/ir/src/confidence.ts)只限制score合法范围和method/reasons形状，没有给Syntax任何推荐值。现有 [SyntaxEvidence](../../../packages/ir/src/syntax-evidence.ts)要求完整confidence；不能先输出缺失值的Canonical对象。

只读核对显示，M-01 decoration-java输入的extractorVersion=fixture-extractor、mapperVersion=mapping-design-v1，是测试声明。历史mixed输出OBSERVATION_STARTED的extractorVersion=syntax-v1、codeContract=PYTHON_SYNTAX_CODE_V1，是已保留Library协议标识。R1输入metadata分为targetSource/inventory/snapshot/tool/java/codeSyntax等上下文，不能从metadata顶层缺少同名字段推断“没有版本”。

因此完整策略的适配表需要明确哪些extractor/mapper/IR/policy组合被固定实现及批准，并区分离线声明验证与真实Runtime装配。不能直接将fixture-extractor写成生产allowlist；也不能将syntax-v1字符串相等当成构建/Source/运行认证。最终构建身份与运行资格仍归各自门禁，策略版本只标识规则契约。具体可启用组合尚未确定。

在获准完整组合出现之前，缺策略或不适配仍为INCOMPATIBLE_CONTRACT；原raw安全/coverage/上下文错误保留原层分类，不能全吞并为此错误。现有公共API和错误集合不因本材料改变。

## 4. 完整策略应固定的规则形态

推荐延续已接受方向：未来私有Syntax映射路径中的确定性纯规则，从验证后的原始事实取得所需特征，按固定且已批准的适用表输出既有Confidence形状。只增加最小局部函数/表，不创建policy registry、callback、用户配置或通用评分框架。

规则的逻辑输入包括：适配契约组合；Syntax种类和合法递归值；原Source标识/指纹/范围及必需支持；owner允许的null或完整原typed ref映射；callee及嵌套引用的原resolution与折叠结果；原支持到最终selected事实的闭包；coverage/settlement及不确定性。它们不是新的wire字段，也不能由caller提交“已验证特征”替代检查。

所有硬条件先按原契约校验：Source缺失/漂移/外来范围、owner跨版本、悬空/未selected引用、不可表达的值歧义、超预算、不完整观察等，不靠降分掩盖。合法但不在获准规则适用域，也拒绝，不能使用fallback数值。UNSUPPORTED引用状态与不支持的范围/契约必须区分。

在已适配组合与同一已验证特征下，Provider id、providerSyntaxId或遍历顺序不影响决策；不同extractor/mapper/policy组合不自动等价。UNKNOWN、owner-null、UNRESOLVED不预置高低关系。是否需要任何相对比较，必须由完整数值提案说明，不从分类名称推导。

将来的成功输出只含既有score/method/reasons。method精确对应获准规则；reasons使用固定安全词汇和确定顺序，说明支持及保留的不确定性，不回显literal、路径、SQL或自由异常。它们的具体标识和数值必须在同一个完整策略包里审阅，不先随意落实到代码。

## 5. 为什么当前不能计算出分数

31个声明行提供字段/引用/拒绝的独立期望，18个历史记录提供有限的表面一致性；没有独立的数值标签、概率样本或获准的规范性刻度。计数、通过率和Source范围一致都不能推出一个唯一的confidence值。Code confidence也不是Syntax分数的来源。

所选支持度不是概率，因此完整方案可以明确提议一种**规范性支持度刻度**：它是一项需说明理由并批准的设计选择，而非从数据计算出来的准确率。独立Source/注释/expected用于说明它针对什么主张，后续Fixture验证规则是否遵循获准解释；不能反过来用规则生成预期，再声称这些预期证明数值正确。

这也不意味着可以任意打分。完整提案必须说明：每个取值适用的有限条件；该取值解释与局限；所引用的独立证据；任何比较关系为何成立；未覆盖类别为何拒绝；实际能力和运行资格还缺什么。精确值、分档数和相对关系都尚未批准，本轮不先填写；0/1默认、按owner分数继承或任意加权均不允许。

若用户希望取值具有经验概率或概率校准含义，那是改变已选路线，需要另立真值/留出/校准证据方案，不能在当前提案中偷偷声称已有。

## 6. 一次集中审查的完整材料清单

下一份SC-02完整提案应把下列内容作为同一包交付，而非逐个零碎询问或另开无关准备包：

- 固定score含义、有限适用域、精确契约组合与版本不匹配行为。
- 全部候选取值及逐项理由/独立证据/局限；如需分档或比较关系，明确是拟议设计，不标为测量结果。不能覆盖缺证据分层后再补理由。
- 精确method/reasons、安全词汇与确定顺序；没有调用方callback或默认策略。
- 独立Source/annotation/expected到规则行的映射；对owner-null、UNKNOWN、各resolution、歧义折叠与partial/refusal的限定。
- 具体Fixture及TDD计划：真值先冻结；同特征更换Provider/顺序、规则错配、缺策略/Source/原ref、loser引用、解释注入、同账本精确额度/少一项/字节、历史origin不可重评分。
- Evaluation/现有Quality Gate适用性、失败/取消/未执行保留、未证明的实际观察/资源资格；不降低门禁、不拿通过数充当质量基线。
- 一份后续B1b精确实施批次的接口/文件/依赖/迁移与安全恢复边界；只有必要前置和具体实施批准齐备才实施。真实Native/模型/DB或云端操作仍单独明确范围。

本清单可以在获准起草候选数值后一起完成设计与作者评审；不是现在就实施Fixture/评分器，也不承诺未定的具体函数签名已准备好。

## 7. 缺口怎样进入完整提案

R06缺少精确契约适配和获准完整策略；R09缺少实际规则确定性、安全解释和origin演进验证。这两项是进入SC-02需要直接设计/验证的关键，不需要再重复旧31行分类。

ARTIFACT、标量、其他resolution、重复OBJECT与独立动态真值缺口，先逐项区分“纯映射的独立契约控制”“已有阶段要求的生产能力”“实际观察/运行资格”，不能一律新增为本阶段必做，也不能以支持度非概率为由一律免除证据。Source/history/Stage/run和真实失败取消仍属于后续原门禁，不从声明性规则包中闭合。

若完整提案无法对某个候选取值或适用类给出明确依据，应保持该项未解决/不可启用，并集中列出最小必要证据操作：目的、准确构建、冻结输入、预计次数、jobs/范围、产物和替代方案。用户批准前不进行任何新采集，不重新跑旧18组来补表面数量。

## 8. 治理、恢复与本轮退出

不改IR/wire/SQL、现有数值、公共错误或tuple域。policyVersion参与extractionVersion仍按已接受附约；origin confidence/extractionVersion/payload不可覆盖，current projection不重评分。策略变更走已有新origin/retire治理，不自动迁移、回填或写DB。累计账本、安全、权限与candidate-only/手动语义发布边界保持。

本轮只有文档设计/审查和本地哈希、链接、格式核验。FullH2/H3仍DESIGN_BLOCKED、policy NOT_SELECTED；B1/P1-04/05/Phase1 OPEN，主任务仍4/21完成、17项未关闭。未新增产品、Fixture、脚本、构建、测试、依赖、运行、CI或Git操作。已有原文/失败/证据及C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1详细报告丢失和根依赖基线时序限制继续保留。

## 9. 本次集中请求

**推荐允许起草一份规范性支持度量表的完整候选提案**：在现有语义和全部原门禁内，提交具体候选值、解释与独立依据、精确适用组合和method/reasons、Fixture/Evaluation及B1b实施边界，供一次集中审阅。所有候选仍标PROPOSED，policy保持NOT_SELECTED；不启用、不编码、不采集、不执行云端。

这是首次跨入具体数值提案范围，需要用户明确确认；“继续”不解释为允许自行定值。本请求不是请用户自己补分数，也不是批准任何尚未写出的数值。候选材料完成后仍需对其具体值和实施范围明确批准。
