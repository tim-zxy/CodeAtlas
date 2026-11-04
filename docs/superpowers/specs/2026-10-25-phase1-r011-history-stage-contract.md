## Syntax3兼容扩展已批准并有限交付 — 2026-10-30

沿[B-F2-B设计](2026-10-30-phase1-binding-sufficiency-pipeline-design.md)接入envelope3及codeatlas-syntax-{initial,origin,projection}-v3三域，旧1/2仍按自身版本读取、origin不可变；body/manifest1与SQL11不变。Stage和H1在每个pair验证后复用IR集合闭包，缺scope/父环/当前混版拒绝；返回已验证envelope避免再读SQL/解码，新增集合按原账本记账。适用测试与回滚/重开见[有限实施结果](../reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)，不修改Store恢复算法或原门禁。

## B-F1-C版本化历史本地交付 — 2026-10-30

Stage依精确owner合约核对request6/selector及新origin envelope2；复用同一Store事务写Code/Evidence/Syntax/history/pointer。SQL11、body/manifest1和codeatlas-activation-history-v1域不变，v1不可变祖先保留。 具体批准、Fixture、最小门禁和限制见[实施结果](../plans/2026-10-30-phase1-binding-history.md#实施结果与作者审查--2026-10-30)。旧pending快照仅为历史。

## A5固定混合执行链本地交付完成 — 2026-10-29

获批T1–T4已完成，A5_FIXED_EXECUTION_LOCAL_EXIT：[A5实施结果与作者审查](../plans/2026-10-29-phase1-mixed-execution-closure.md#实施结果与作者审查2026-10-29)；[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-execution/results.json)。显式Native配置v2、Stage内NO_OP、既有空FULL、固定私有Source→v2/v5→Stage→Store及真实本地结算已接入。最终271 PASS/1原C1 TODO，注册35/35，Storage/Runtime构建、17项目架构及范围格式通过。原Stage/Store方法体、公开路由、IR/wire/SQL schema与原Fixture参考保持。

完整物理资格/采集/profile与公开混合路由仍NOT_READY；qualificationRef仅candidate引用，无真实Git/Native/helper/collector、数值/依赖、CI或Git写入。父任务4/21、P1-04/05/Phase1及原风险保持OPEN。下方设计待审/未实施文字为历史快照，由本补记限定范围替代。

## A2混合Source/前置账本整包已批准 — 2026-10-29

用户已批准[A2契约及其合并实施包](2026-10-29-phase1-mixed-source-runtime-integration.md)：私有Python/Java Source观察与全集重查、同对象前置预算接管、Application授权/CAS与Runtime准备。已完成声明式本地组件交付，验证/作者审查/范围限制集中见[实施包结果](../plans/2026-10-29-phase1-mixed-source-runtime-integration.md#实施结果与作者审查2026-10-29)。旧公开Java/IR/SQL/生产catalog不变，实际Git/Native/collector/profile/云端及Git写入不在授权内。

## A-runtime 本地实施更新；protocol 最终门禁 OPEN — 2026-10-29

用户已明确批准 D1–D4/T1–T6 本会话顺序实施。Source受控核验、Stage累计账本、v5分发代码/原始流和私有进程屏障已实现；当前 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**，不是全包验收通过。最新本地组件107 PASS/1 TODO、注册360/360、纯IPC176/176、Stage333/333、Rust指定库29/29、架构17项目、构建/类型/精确格式通过。文件symlink因EPERM为TODO/C1 OPEN。

Rust protocol内部测试最终复验在link.exe LNK1104失败，未执行；一次独立构建目录对照在依赖链接LNK1105/1224失败。准确根因UNKNOWN，不自动重试、不称已修复/flaky；旧T4的18项GREEN不冒称最终门禁。详见[作者实施评审](../reviews/2026-10-29-phase1-runtime-local-readiness-review.md)，准确证据根 `.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。未新增独立评审。

实施细节以评审及实际源码为准：native-client私有aliases是default对象成员，避免既有export-star将named aliases公开；lifecycle类型模块内，public index/options保持。私有raw consumer可接既有caller limits；Source parsed副本解析前预付；Stage account拒绝ambient事务。这些是获准私有边界的缺陷修正，不增加公开契约或数值。实际protocol筛选为`protocol::`（包含新增mixed_v5_tests），旧计划`protocol::tests`仅能选旧模块；Source旧控制的准确命令见attempt3 receipt。

无真实Native、额外acquisition helper/collector/model、新目的schema/profile值/依赖、云端CI或Git写入。既有G13 Node模块隔离进程如实记录。全Source选择/Python扫描、实际归因/运行资源与H5仍OPEN，主任务4/21接受、17未关闭；空catalog继续拒绝。历史timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。原前任10315摘要未覆盖Source，本包单独保留Source原字节并补入继任封存；不声称原摘要覆盖整仓。下方旧“未实施/REVIEW_PENDING”保留为历史，由本补记限定范围替代。

## A-runtime D1–D4 / T1–T6 已批准 — 2026-10-29

用户明确批准Source核验/Stage累计记账、v5分发及原始流、私有进程输入屏障及配套本地组件实施包，本会话顺序实施，不逐任务确认。状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION，尚无实现/新测试通过声明。无真实Native/额外Node helper/collector/model、profile/新目的schema/数值/依赖、云端CI/Git写入授权。全Source选择范围/Python扫描/实际归因与H5仍OPEN，主任务4/21接受、17未关闭。下方REVIEW_PENDING为保留历史；本补记只提升本次明确范围，不接受§8未知目的或完整运行资格。

## A-local独立评审与修复完成；本地组件退出 — 2026-10-29

同一次只读独立整包评审发现4项原契约实现缺陷：manifest/Code闭包、Unicode DELTA、失败预算续接、H1查询前行准入。原范围统一修复7源码/3测试，旧公开接口与成功成本/Fixture预期保持。IR1/3/4原4项RED及IR2私有Provider另行RED均转绿，最终12项新旧边界定向通过（10新控制含在Stage root）；修复无第二次独立评审，以作者TDD及完整适用本地批次验证。

新鲜构建/IR类型exit0；Code75/75、Syntax59/59、Stage333/333、Store288/288、原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17及范围格式通过，重叠不累计。四root仍去重55文件，registry61/Phase1 35/四ID各一次/catalog0；2369个Fixture/参考字节、依赖/迁移/注册不变。

[独立发现、修复证据及有界验收](../reviews/2026-10-29-phase1-independent-review-fixes.md)逐条链接109原显式绑定的最新PASS selector及共享资源/兼容门禁；U0～U5与原A..G在声明式Node/SQLite组件范围完成。原整体Fixture历史map/generic base不改写、不无条件签收；主任务仍4/21接受、17未关闭，P1-04/05/Phase1未完成。

真实Source重验证/资源取消、Native/profile/H5和后续B～E需具体方案及相应授权；无Native/云端CI/Git写入或第二代理。timeout仍UNKNOWN，main取消结算/R4/C2不变。全部旧文档后缀、原稿、失败及封存保留；下方pending是历史快照，不推翻本次有限结论。

## A-local统一本地门禁已通过，独立整包评审待完成 — 2026-10-27

已批准U1实际partial raw DELTA、U2 retained/删除/NO_OP及U3完整故障/只读恢复资源已顺序核验；U4仅追加两个缺失root，四root去重覆盖55文件。完整Source/原支持/opaque unit、immutable origin/current、同账本五维边界、TEMP/seal/lease、22表和恢复身份保持原契约。本轮无新产品/依赖/数值/迁移或Native资格。

新鲜本地证据：Providers→Storage→Runtime构建及IR类型exit0；四root分别75/75、59/59、323/323、288/288，原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17项目通过。重叠收据不相加，不代表全仓verify或Native门禁。补记前2347旧Fixture、374产品src/dist及109原绑定不变；registry61/Phase1 35/四ID各一次/catalog0保持，八个旧注册守卫无需改动。

[准确范围、首轮失败与作者评审](../reviews/2026-10-27-phase1-unified-local-resource-review.md)。U5独立整包评审/最终退出仍待，作者检查不代替独立评审；原Fixture整体签收0、主任务4/21接受/17未关闭，P1-04/05/Phase1未完成。原批准内不逐小步骤确认；新增代理需遵守此前单独确认边界。无Native、云端CI或Git写入，timeout仍UNKNOWN，R4/C2/main取消未结算状态不改。下方原文为保留历史与契约，不据旧pending快照推翻本次有限范围证据。

## 清理行预留附约已批准 — 2026-10-27

用户明确批准清理行预留修订及集中实施包，继续原本地D..G。首次必要清理读取在TEMP分配前预留1行，加原构造5行共占用6行；占用为已花费＋仍有效预留，实际交付与预留证据分开。首次清理消费credit不重复扣行，额外close重试先付1行；预算错误不能吞成已关闭。未执行预留不伪称SQL已执行，不退款供已终止Stage复用。Stage到Store与更紧caller上限续接保留预留；COMMIT后cleanup失败保留真实提交身份、撤销lease并标cleanupFailed，不能重复Apply。credit私有，不进入owner、IR、history、wire、schema或公开预算receipt。该计数来自既有SQL步骤，不是新profile或数值门槛。

批准的是契约与原本地包实施，尚未声明测试/资源/Fixture/G完成。原始文档和失败如下保留；真实Native、校准/profile、新依赖、云端CI与Git写入等边界不变。

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

## H2-R1 component implemented and locally verified — 2026-10-26

Tasks A..D are complete within **LOCAL_DECLARED_RAW_HISTORY_CANDIDATE_ONLY**, as recorded in the [author implementation review](../reviews/2026-10-26-phase1-declared-raw-history-candidate-implementation-review.md). This supersedes earlier in-progress/not-started wording below; original snapshots/checklists remain historical. Nine Providers sources implement private raw-to-declared-history candidate composition using the original R0 ledger, preserved legacy/new tuple identities, one snapshot and complete unit support/coverage. No Canonical Syntax, final basis, real run/owner, Stage/Store or publication authority is granted.

Actual local final33: **988/988 passed**; focused12: **394/394 passed** (overlap, not summed); architecture17 projects passed; Providers build exit0. Scoped formatter preserved JSON values/raw wire;18 executable/declaration hashes match the tested bytes, rebuild exit0 and affected root82/82 passed. Registry57/exactPhase1 31/catalog0;326 new Fixture files,1511 old Fixture bytes unchanged; one root suffix and21 exact structural substitutions. Independent64-case/ten-family corpus,18 controls and original RED/failed attempts are traceable in the review and .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/.

Evidence limitation: the task-local logger overwrote three original detailed JSON reports with run metadata; original terminal logs/inputs/seals and all predecessor evidence survive. Replays are explicitly NOT_ORIGINAL; the review discloses loss and the corrected immutable recorder. Do not claim complete original report preservation. This is author-only component acceptance, not independent/merge/full-phase acceptance.

Full H2/H3 DESIGN_BLOCKED; confidence policy NOT_SELECTED; H4/H5/P1-04/05/Phase1 OPEN. DB/Stage tests, actual Native/helper/collector/resource qualification and cloud CI remain unexecuted, never waived/passed. No new dependency, numeric/profile policy, DB, Native, calibration, cloud/Git write, worktree/session or agent. C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable restrictions persist. Existing contracts and gates remain. Final reproducible seal: .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/implementation-verification.json.

## H2-R1 exact package approved; execution in progress — 2026-10-26

User explicitly approved [Tasks A..D](../plans/2026-10-26-phase1-declared-raw-history-candidate.md) for sequential same-session implementation. This accepts nine Providers source files,326-file independent corpus,one root test,21 exact structural replacements and the declared local builds/focused12/final33/architecture. It supersedes pending execution wording below only; no completion result is implied. Task A snapshots and199 pre-product old cases have been verified against original goldens and old receipts;B/C/D remain NOT_STARTED. All4891 plan-seal entries matched at execution start.

No Syntax confidence value or Canonical Syntax/finalbasis/Stage/Store/run authority is granted. No DB,Native/helper/calibration,dependency/profile/cloud/Git action or new worktree/session/agent. FullH2/H3 DESIGN_BLOCKED;H4/H5/P1-04/05/Phase1 OPEN. Prior risks and original byte/EOL/evidence suffixes remain intact. Execution ledger: .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/progress.md.
## H2-R1 written design accepted; concrete task package pending — 2026-10-26

The user explicitly approved the [R1 written design](2026-10-26-phase1-declared-raw-history-candidate-design.md), including legacy unit-id preservation/new-unit tuple identity, one Native snapshot with exact observed-unit dual coverage, and fixed self-validating continuation on the original R0 ledger. That supersedes earlier design-PROPOSED wording only. The [A..D concrete plan](../plans/2026-10-26-phase1-declared-raw-history-candidate.md) and [author plan review](../reviews/2026-10-26-phase1-declared-raw-history-candidate-plan-review.md) are REVIEW_PENDING; all tasks NOT_STARTED and implementation NOT_AUTHORIZED.

The package fixes nine Providers sources,326 independent Fixture files/64 cases/ten families,one root test,21 exact structural replacements in seven old scripts,Providers-only builds and focused12/final33/architecture. Existing registry56/exactPhase1 30/catalog0 and all1511 Fixture bytes remain unchanged;57/31 is prospective only. Plan-start4871 predecessor hashes matched. No product/Fixture/test/registration/build/DB/Native/helper/calibration/profile/dependency/numerical policy/cloud/Git action or new session/worktree/agent this turn.

This is only LOCAL_DECLARED_RAW_HISTORY_CANDIDATE_ONLY planning. Full H2/H3 DESIGN_BLOCKED,confidence policy NOT_SELECTED;final Code/Syntax/Stage/Store/run and H4/H5/P1-04/05/Phase1 gates remain OPEN. Old Stage tests using DatabaseSync are excluded and not marked passed. Original documents/evidence/EOL and C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable restrictions persist. Exact planning evidence: .superpowers/sdd/2026-10-26-phase1-declared-raw-history-candidate/plan-review.json.
## H2-R0 declared delta raw admission complete locally — 2026-10-26

User approved the exact R0 package. R0-1..3 complete as LOCAL_DECLARED_DELTA_RAW_ADMISSION_ONLY; [author implementation review](../reviews/2026-10-26-phase1-declared-delta-raw-admission-implementation-review.md) and [independent Fixture](../../../fixtures/phase1/declared-delta-raw-admission/README.md) record proof and limits. Six Providers files bind S0-derived complete Source scope to strict partial v5/full-required-Java input with one cumulative budget. Old full/public APIs and original owner refs remain exact. This supersedes pending/not-started wording below; original plans/checklists remain preserved history.

Fresh final27-file local cohort **876 passed,0 failed/cancelled/skipped/todo**, architecture **17 projects passed**, Providers build exit0. Focused7 **343/343** overlaps final and is not summed. New48-case/nine-family/245-file corpus froze before loader/product; first/raw/corrected/format successors and failed attempts retained. Old12 v5/18 producer/12 full/46 history/35 delta/28 S0 receipts and old budgets stay exact; new budget path also matches old30 raw streams. All4010 predecessor hashes matched at start;1266 old Fixtures unchanged. Registry56/exactPhase1 30/catalog0; one root suffix/16 exact structural replacements only.

R04 reuses an existing Fixture allowance only; Python internal entry uses default export to avoid index leakage; exact existing budget kernel moved within the approved files to fix request-first initialization. No new profile/value/dependency/IR/SQL/public API or genuine owner/Stage/run authority. No Native/helper/DB/calibration/cloud/Git mutation or new worktree/session/agent. Full H2/H3 DESIGN_BLOCKED, confidence policy NOT_SELECTED; H4/H5/P1-04/05/Phase1 OPEN. C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 restrictions persist. Fresh sealed evidence: .superpowers/sdd/2026-10-26-phase1-declared-delta-raw-admission/implementation-verification.json.

## H2-R0 direction accepted; exact package awaiting execution approval — 2026-10-26

User approved the declared delta raw-admission direction for task refinement only. The [R0-1..3 concrete plan](../plans/2026-10-26-phase1-declared-delta-raw-admission.md) and [author plan review](../reviews/2026-10-26-phase1-declared-delta-raw-admission-plan-review.md) fix six Providers source files, one independent48-case/nine-family/245-file Fixture, one root test,16 exact structural replacements, same-ledger pre-retention charge points and unchanged old public/full parity. Status REVIEW_PENDING; all R0-1..3 NOT_STARTED. This supersedes earlier direction-PROPOSED wording only and grants no product execution authority.

All3982 predecessor hashes matched at planning start. Existing registry55/exactPhase1 29/catalog0 and all1266 current Fixture files remain unchanged;56/30 are prospective registration values only. New APIs/Fixture/test/build outputs remain absent. Only planning/review/status/evidence documents change; no product/Fixture/registration/build/test/DB/Native/helper/calibration/profile/dependency/cloud/Git action or new session/worktree/agent. Fresh plan evidence: .superpowers/sdd/2026-10-26-phase1-declared-delta-raw-admission/plan-review.json. Original suffixes/raw failures remain preserved.

Accepted direction includes native-only wire removals with all Source removals retained, PROVISIONAL_CODE structural binding and cumulative admission accounting. No history unit allocation, final Code/Syntax, actual owner/Stage/run authority or confidence value. Full H2/H3 DESIGN_BLOCKED, numerical policy NOT_SELECTED; H4/H5/Phase1/P1-04/05 OPEN. C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 restrictions persist. Concrete package execution requires explicit user approval; numerical/Native/DB/cloud/Git remain separate.

## H2-S0 declared observation scope complete locally — 2026-10-26

User approved the exact implementation package. S0-1..3 complete only as LOCAL_DECLARED_OBSERVATION_SCOPE_ONLY; [implementation review](../reviews/2026-10-26-phase1-declared-observation-scope-implementation-review.md) and [independent Fixture](../../../fixtures/phase1/declared-observation-scope/README.md) record the result and limits. One private Providers module now shares H0's Source diff/requirements kernel with a declared pre-observation entry. No Canonical Syntax, owner/Stage/run authority or raw bridge is generated. This supersedes pending/not-started snapshots below; original plan/checklist is preserved history.

Fresh final18-file local cohort: **598 passed,0 failed/cancelled/skipped**; architecture **17 projects passed**. Focused4-file168PASS and two Providers-only builds also passed; overlapping counts are not summed. Before product work, old46 history results/errors/budgets and35 delta candidates/errors were frozen against original goldens; after extraction they remain exact. New28-case/seven-family Fixture froze before loader/product. Registry **55 total / 29 Phase1 / catalog0**, new ID once;13 exact structural substitutions and one root suffix only. All3413 predecessor hashes matched at start; all780 old Fixtures, compiled dependencies and previous M-01/M-02/R-01 raw reports remain protected.

Current evidence: `.superpowers/sdd/2026-10-26-phase1-declared-observation-scope/implementation-verification.json`, exact logs, independent semantic freeze, before-execution snapshots, old-behavior receipt and author review. No Runtime/Storage/schema/SQL/wire/profile/dependency/DB/Native/calibration/cloud/Git mutation or new worktree/session/agent. New internal scope is owned/frozen DECLARED_INPUT with one cumulative logical budget; real capture/owner/authentication remains unimplemented. Old full-only refusal and OTHER-only fallback preserved. Full H2/H3 DESIGN_BLOCKED, confidence policy NOT_SELECTED; H4/H5/Phase1/P1-04/05 OPEN. C1EPERM/C2spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 restrictions persist. No new score/threshold/default or run eligibility is implied.

## H2-S0 direction accepted; concrete package pending — 2026-10-26

User approved the declared Source observation-scope design and task refinement only. The [S0-1..3 implementation plan](../plans/2026-10-26-phase1-declared-observation-scope.md) and [author plan review](../reviews/2026-10-26-phase1-declared-observation-scope-plan-review.md) now specify one product file/private shared kernel, independent28-case corpus, immutable old46 history/35 delta behavior receipts, one test registration, exact13 structural counter substitutions and future Providers-only build/focused4/final18/architecture checks. Concrete package REVIEW_PENDING; S0-1..3 NOT_STARTED. This supersedes older design-PROPOSED wording only; it grants no coding/build/test/Fixture authority.

All3391 predecessor hashes matched; current registry54/exact28/catalog0 and all780 Fixture bytes unchanged. New55/exact29 would follow one planned manifest, not a new Quality threshold or a passed result. New corpus/test/loader/API remain absent; planned identifiers/commands are metadata only. No product/Fixture/test/registration/build/DB/Native/calibration/profile/dependency/cloud/Git mutation or new session/worktree/agent this turn. Exact planning evidence: `.superpowers/sdd/2026-10-26-phase1-declared-observation-scope/plan-review.json`. Original document suffixes and all historical seals/failures remain preserved.

The accepted scope direction preserves current H0 bytes/errors/budgets, OTHER-only fallback, old full-only refusal and DECLARED_INPUT boundaries. It does not generate Canonical Syntax, owner handles or Stage/run authority. Full H2/H3 DESIGN_BLOCKED, confidence policy NOT_SELECTED, H4/H5/Phase1/P1-04/05 OPEN. C1EPERM/C2spent/timeoutUNKNOWN/main cancellation settlement unqueried/R4 restrictions persist. Next requested confirmation is execution of the exact concrete package; numerical/Native/DB/cloud/Git and later stages remain separate.

## M-01/M-02 offline preparation accepted locally — 2026-10-25

User explicitly approved both offline preparation packages. M-01 T1–T3 and M-02 D1–D2 are complete only as LOCAL_MAPPING_ORACLE_PREPARATION / LOCAL_CONFIDENCE_EVIDENCE_PLAN. [Corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [evidence protocol](2026-10-25-phase1-syntax-confidence-evidence-protocol.md) and [author implementation review](../reviews/2026-10-25-phase1-syntax-mapping-preparation-implementation-review.md) record the exact scope and gaps. This current entry supersedes the historical planning-pending/not-started entries preserved below; it does not authorize product H2–H5 or a numerical confidence policy.

Fresh exact 16-file local closure: **488 passed, no failed/cancelled/skipped**, architecture **17 projects passed**. Registry **54 total / 28 Phase1 / catalog0**. All 3096 predecessor hashes matched at start; 3072 protected files including all 701 old Fixture files and existing compiled artifacts remain unchanged. Two root tests and one Fixture were added; three old oracles have only three structural substitutions each. The 34 cases/31 classification rows are declarations, not measured observations or sample-sufficiency gates. All measurements, thresholds and numericalPolicy remain null.

Evidence: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/implementation-verification.json`, exact logs, original document snapshots and freezes. An authoring coordinate defect was diagnosed with retained producer examples, proved RED and corrected under an explicit successor freeze; the first raw corpus/freeze remains preserved. No product source/schema/migration/dependency/profile/build/DB/Native/calibration/cloud/Git mutation occurred. Review was author-only under the sequential constraint. H1 local acceptance stands; full H2/H3 DESIGN_BLOCKED, H4/H5/Phase1/P1-04/05 gates OPEN, confidence policy NOT_SELECTED. C1 EPERM/C2 lifetimes spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable DB restrictions persist. Next: review the evidence protocol before separately approving any actual evidence operation or numerical strategy.

## Mapping direction accepted; M-01/M-02 preparation plans pending — 2026-10-25

User approved the nonnumeric Syntax mapping direction (field/ref closure,syntaxKey/extractionVersion,ambiguity handling and missing-policy refusal) and task-package refinement. The [M-01 preparation plan](../plans/2026-10-25-phase1-syntax-mapping-preparation.md),[M-02 evidence plan](../plans/2026-10-25-phase1-syntax-confidence-evidence.md) and [author plan review](../reviews/2026-10-25-phase1-syntax-mapping-preparation-plan-review.md) define exact Fixture/loader/offline oracle,classification/protocol,registration diffs and future15/16-file local checks. Concrete plans REVIEW_PENDING;T1–T3/D1–D2 NOT_STARTED. This supersedes earlier direction-PROPOSED wording only;no score/policy value or product mapper is approved.

FullH2/H3 remains DESIGN_BLOCKED;H1LocalExit stands,H4/H5/Phase1 gates remainOPEN.3068predecessor hashes matched at start;actualregistry53/exact27/current701Fixture bytes unchanged. Future54/28 follows a single plannedmanifest,not a passed result or numericalgate. This turn only writes plans/review/status: no product/Fixture/test/registration/build/DB/Native/Rust/helper/calibration/profile/number/dependency/cloud/Git mutation or newworktree/session/agent. ExistingIR/SQLite/LLM/AUTO-MANUAL/flow/Deferred and C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4 restrictions remain. Originalbytes/EOL and raw failures follow intact.

## H2/H3 Syntax mapping proposal; no numerical policy selected — 2026-10-25

The [mapping/confidence annex](2026-10-25-phase1-syntax-mapping-confidence-design.md) and [author design review](../reviews/2026-10-25-phase1-syntax-mapping-confidence-review.md) are PROPOSED,not accepted implementation authority. They specify raw→Canonical field/reference closure,provider-independent syntaxKey/extractionVersion,original/current separation and explicit missing-policy refusal. No score/default/threshold is chosen;Code confidence and structuralFixture values do not qualify a newSyntax policy. Full H2/H3 remains DESIGN_BLOCKED pending this direction review and separate numerical-policy evidence/approval. H4/H5 remain outside authorization. Next requested scope is M-01 nonnumeric mapping/independentcorpus task-package and M-02 classification/evidence-plan refinement,not coding.

H1 LOCAL_R011_HISTORY_STORAGE_CAPTURE remains accepted;3045 sealed predecessor files matched at design start. Its1467Node/build/architecture17 evidence is historical,not rerun. This turn changes documentation only:no product/Fixture/registration/build/test/DB/Nativebinary/acquisitionhelper/Rust/profile/number/dependency/cloud/Git changes. ExistingIR/SQLite/LLM candidate-only/AUTO-MANUAL/flow and Deferred gates remain controlling;P1-04/05/Phase1 exits OPEN,C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4untouched. Originalbytes/EOL and raw failures follow intact.

## H1 local storage/capture accepted; Phase1 exits still open — 2026-10-25

T1–T4 are locally complete as LOCAL_R011_HISTORY_STORAGE_CAPTURE,including the explicitly approved full/transition clarification. Fresh exact59-file sequential Node regression1467PASS/0FAIL/0SKIP/0TODO/0cancelled;Storage build exit0;architecture17PASS. [Final author review](../reviews/2026-10-25-phase1-r011-history-capture-implementation-review.md) maps R01..R12 to real migration/rollback/readonly/reopen/SourceCAS/encoding/handle/budget/actual-four-writer evidence and records limitations. Independent31-case/12-family/65-file Fixture;registry53/exactPhase1 27/newID once/catalog0. Finalreceipt:.superpowers/sdd/2026-10-25-phase1-r011-history-capture/implementation-verification.json. EarlierHOLD/NOT_STARTED/1446/264 sections below are historical;original bytes and failed evidence remain preserved.

R011 five-table/four-index/41-trigger migration and private history reader are local,unreleased work. Old R010 capture remains schema10-only with original views/readplans/bounds. Existing released migrations and636 predecessor Fixture files are unchanged. FULL=null may retain an exact committed parent;DELTA must be TRANSITION_DRAFT with exact loaded parent/basis and current-state Source;NO_OP creates no history. This grants no actual-run/full-provider authentication or publication. Provider-independent IR/SQLite authority/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow remain controlling. H2/H3 mapping/confidence DESIGN_BLOCKED;H4/H5 not implemented/authorized;B1-B2/C/D/P1-04/05/Phase1 exits OPEN. No Native binary/acquisition helper/Rust/calibration/profile/new numbers/dependencies/cloud/Git/userDB/R4 action. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried unchanged.

## Approved H1 full/transition clarification — 2026-10-25

User accepted the local full/transition clarification. In R011, transitions=null declares FULL establishment, including complete re-establishment after legacy pointer invalidation, with optional exact committed parent. Non-null must be TRANSITION_DRAFT referencing the actual parent's activationId and complete oldBasis; targetSource equals the current state's Source triple. NO_OP_DRAFT is not persisted as a new activation. These are storage declarations, not authentic-run/full-observation authority; H4/H5 qualification remains separately governed. This supersedes the first-full-only/nullability HOLD wording, not any validation or Phase gate. Implementation/remaining conformance and final acceptance are still OPEN.

## H1 implementation checkpoint; establishment semantics on hold — 2026-10-25

The user approved the concrete T1–T4 local package. R011 migration/private read kernel/history capture and four test registrations are locally implemented, with independent31-case/12-family/65-file component Fixture; this supersedes earlier NOT_STARTED/plan-pending status only. [Intermediate author review](../reviews/2026-10-25-phase1-r011-history-capture-implementation-review.md) records1446PASS in the approved59-file scope before final uniqueness fixes; after those fixes, fresh Storage build, affected264PASS and architecture17PASS. Registry53/exactPhase1 27/catalog0;636 predecessor Fixture files unchanged. These are scoped component results, not H1/Phase1 acceptance.

T3/T4 and LOCAL_R011_HISTORY_STORAGE_CAPTURE remain OPEN. The [full/transition clarification](2026-10-25-phase1-history-full-transition-clarification.md) is PROPOSED: DCP3.2 first-full-only null conflicts with legacy invalidation/full recovery and audit ancestry. No changed nullability/establishment semantics or new authority is applied pending explicit approval. Remaining relation and real-writer/qualified-pointer conformance must finish before final acceptance. H2/H3 mapping/confidence BLOCKED; H4/H5 not authorized. Existing provider-independent IR/SQLite/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow and all gates remain controlling. No Native/helper/Rust/calibration/profile/new numbers/dependencies/cloud/Git/user DB/R4 operation; C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried unchanged. Raw evidence and original document bytes follow intact.

## H1 storage/capture design accepted; concrete plan pending — 2026-10-25

User confirmation accepts H1-specific R011 history storage/capture choices: additive five-table/41-trigger schema, conservative legacy pointer invalidation, backupRequired=false/no-backfill/no-down, and independent bounded schema11 capture while original C3-A remains R010-only. The [T1–T4 implementation plan](../plans/2026-10-25-phase1-r011-history-capture.md) and [author plan review](../reviews/2026-10-25-phase1-r011-history-capture-plan-review.md) define exact files/interfaces/independent Fixture, real R010 legacy test setup, compatible private read-kernel extraction, connection-bound history handles and local SQLite component tests. Concrete plan REVIEW_PENDING; all implementation NOT_STARTED. H2/H3 mapping/confidence annex remains DESIGN_BLOCKED; H4/H5 Stage/Store/actual run not authorized. Earlier detailed-design-pending wording is historical only for the accepted H1 scope.

Plan requests one isolated local test envelope: newly owned memory/temp disk DBs for migration/rollback/readonly/disk close-reopen, explicit component-only literal seed, no user DB or R4; final59 named Node files + Storage build + architecture. No product/SQL/Fixture/test/build/cache/DB/Native/helper/Rust/profile/numeric/dependency/cloud/Git mutation this turn. Targetregistry53/exactPhase1 27 follows one planned manifest, not newpassed evidence or numericalgate; actualcurrentregistry52/26/catalog0 unchanged.

2321 predecessor hashes matched at planning start;15 original document snapshots retained. Evidence:.superpowers/sdd/2026-10-25-phase1-r011-history-capture/plan-review.json. Prior810Node/build/architecture17 historical,not rerun. Only future LOCAL_R011_HISTORY_STORAGE_CAPTURE acceptance is requested; B1-B2/C/D/P1-04/05/Phase1 OPEN. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4untouched. Original bytes/EOL follow unchanged.

# Phase1 R011 历史、增量桥接与冻结契约 DCP

日期：2026-10-25。状态：**联合方向已接受；本详细契约 PROPOSED，等待书面评审，不授权实施**。

依据：[联合方向](2026-10-25-phase1-history-stage-boundary-design.md)、[历史支持契约](2026-10-24-phase1-history-support-design.md)、[候选组装](2026-10-25-phase1-delta-composition-design.md)、[ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md)。保持 provider-independent Canonical IR、SQLite authoritative、LLM candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow；没有Deferred能力或Phase4。

## 1. 范围、兼容策略和实码发现

用户确认的是联合设计方向。本DCP具体提出物理存储、内部接口、预算和状态/恢复协议；接受后才写精确实施计划，再整包确认。没有SQL文件、产品代码、Fixture产物、迁移/DB/Native运行、profile数值、依赖或云端写入。

本轮2298个前序receipt hash匹配。810测试、build、architecture17与registry52/Phase1精确26/catalog0是前序结果，不是本轮新验证。C1 symlink EPERM、四个C2生命周期已用完、历史timeout UNKNOWN、main39708335128取消结算未查询、mutable R4未碰。

实码边界：

- C3-A [code-context-capture](../../../packages/storage/src/analysis/code-context-capture.ts)不仅historicalSourceProof=UNAVAILABLE，还硬拒绝user_version≠10。**不能把R011库传入旧入口期待工作**。新capture只接R011；旧入口保持R010行为。可提取旧Code身份编码/受控数值读工具，但旧公开语义、全部旧Fixture和消耗边界不变。
- [完整组合输入](../../../packages/providers/src/native-composition-input.ts)要求完整projection且removed为空。新增delta入口，不放宽旧full入口。
- [迁移器](../../../packages/storage/src/migrations/runner.ts)对backupRequired=true直接返回MIGRATION_BACKUP_REQUIRED，当前没有备份编排。推荐R011为**纯新增、事务性、无backfill、backupRequired=false**；不修改已有备份拒绝机制。应用前可按现有外部冷备流程自行备份，但本设计不新增自动拷贝/WAL恢复工具。若评审要求强制备份，本DCP必须补独立编排设计，不能填true后绕过拒绝。
- R009只保存当前规范化原candidate。历史不能FK到会被删除/改写的当前R004/R009/Source行；不可变历史保存已验证的完整副本，活动资格由新pointer+锁内重查授予。SQLite仍是唯一权威。

比较后采用**小型关系外壳+严格、规范化JSON历史记录**：无需为每个IR字段建第二套表，同时保留父链、Syntax原观察/投影及活动指针的SQL关系。逐字段全规范化会复制IR结构/迁移成本；只保留一个无pointer的文件blob又不能承担事务激活或来源关系。JSON不是绕过应用校验，所有语义/嵌套引用仍由validated writer及capture验证。

## 2. R011 精确物理布局

迁移文件拟名`011_framework_syntax.sql`，version11/name framework_syntax/backupRequired=false。checksum仅在实际SQL文件冻结后由现有归一化算法计算，本文不伪造。R001..R010、W001..W003字节/checksum不变，不增加R014或提前依赖R012/R013。

以下是拟议DDL的完整表/索引定义，**只存在本Markdown，不得本轮执行**。所有id使用既有EntityId文本约束；digest均为64位lowercase hex，writer/capture也重复校验。

```sql
CREATE TABLE activation_history (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  parent_id TEXT,
  manifest_digest TEXT NOT NULL CHECK(length(manifest_digest)=64 AND manifest_digest NOT GLOB '*[^0-9a-f]*'),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json) AND json_type(manifest_json)='object'),
  UNIQUE(repository_id,id),
  CHECK(parent_id IS NULL OR parent_id<>id),
  FOREIGN KEY(repository_id,revision_id) REFERENCES revisions(repository_id,id),
  FOREIGN KEY(repository_id,parent_id) REFERENCES activation_history(repository_id,id)
) STRICT;
CREATE INDEX idx_activation_history_parent ON activation_history(repository_id,parent_id);

CREATE TABLE syntax_origins (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  origin_snapshot_id TEXT NOT NULL CHECK(length(origin_snapshot_id)>0),
  origin_digest TEXT NOT NULL CHECK(length(origin_digest)=64 AND origin_digest NOT GLOB '*[^0-9a-f]*'),
  origin_json TEXT NOT NULL CHECK(json_valid(origin_json) AND json_type(origin_json)='object'),
  UNIQUE(repository_id,id),
  FOREIGN KEY(repository_id,revision_id) REFERENCES revisions(repository_id,id)
) STRICT;
CREATE INDEX idx_syntax_origins_snapshot ON syntax_origins(repository_id,origin_snapshot_id);

CREATE TABLE syntax_projections (
  id TEXT PRIMARY KEY CHECK(length(id)>0),
  repository_id TEXT NOT NULL,
  origin_id TEXT NOT NULL,
  projection_digest TEXT NOT NULL CHECK(length(projection_digest)=64 AND projection_digest NOT GLOB '*[^0-9a-f]*'),
  envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json) AND json_type(envelope_json)='object'),
  UNIQUE(repository_id,id),
  FOREIGN KEY(repository_id,origin_id) REFERENCES syntax_origins(repository_id,id)
) STRICT;
CREATE INDEX idx_syntax_projections_origin ON syntax_projections(repository_id,origin_id);

CREATE TABLE activation_syntax_members (
  activation_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  origin_id TEXT NOT NULL,
  projection_id TEXT NOT NULL,
  PRIMARY KEY(activation_id,origin_id),
  UNIQUE(activation_id,projection_id),
  FOREIGN KEY(repository_id,activation_id) REFERENCES activation_history(repository_id,id),
  FOREIGN KEY(repository_id,origin_id) REFERENCES syntax_origins(repository_id,id),
  FOREIGN KEY(repository_id,projection_id) REFERENCES syntax_projections(repository_id,id)
) STRICT;
CREATE INDEX idx_activation_syntax_projection ON activation_syntax_members(projection_id);

CREATE TABLE active_history_pointer (
  repository_id TEXT PRIMARY KEY REFERENCES repository(id),
  activation_id TEXT NOT NULL,
  FOREIGN KEY(repository_id,activation_id) REFERENCES activation_history(repository_id,id)
) STRICT;
```

`syntax_origins.origin_snapshot_id`特意不FK到mutable provider_snapshots；writer/capture验证其精确快照副本及对应关系。Syntax source/node也不FK到当前Source/Code表：旧manifest引用历史副本，当前投影在最终basis上验证。projection origin与member origin相等由应用做精确关系检查，不能只凭三个FK就接受。

### 2.1 不可变性与legacy失效触发器

对activation_history、syntax_origins、syntax_projections、activation_syntax_members四表，各生成BEFORE UPDATE和BEFORE DELETE触发器，名字`r011_immutable_<table>_<update|delete>`，body统一`SELECT RAISE(ABORT,'R011_IMMUTABLE');`，无WHEN条件。INSERT只由validated writer产生；进程内任意恶意SQL不是此权限模型承诺防御的边界。现有工程无repository删除入口；本包不新增历史清理或静默CASCADE删除。如未来设计删除仓库/历史，另案治理。

对以下**精确十一表**，各生成AFTER INSERT/UPDATE/DELETE触发器：canonical_nodes、canonical_edges、unresolved_targets、evidence、provider_fact_bindings、fact_evidence、active_support_candidates、provider_snapshots、provider_capabilities、analysis_coverage、repository_state。名字`r011_invalidate_<table>_<insert|update|delete>`；body均`DELETE FROM active_history_pointer;`。仓库DB只有一个repository，保守全表失效避免遗漏旧/新revision及相同fingerprint变更；不做猜测row归属。

不对source_files/revisions/root_path建立此失效触发器，Source service可独立推进；capture另查locator/目标Source。R010 derived summary不是历史真值，不加summary触发器；旧summary兼容另见§7。更新四个不可变表的拒绝触发器不会删除pointer；拒绝语句没有提交。

这是R011新增触发器，不修改旧SQL/checksum，但**会改变R011库内legacy writer之后的增量可用性**，属于本DCP必须明确接受的兼容调整。旧writer成功提交后，原图仍可读、旧history仍可审计、active pointer消失，changed-only需要full；其失败/回滚则pointer删除也回滚，保留last-good。联合writer在全部旧表写完后最后重新建立pointer。没有禁用trigger或设置bypass标志。

### 2.2 迁移与升级/失败

新表初始全空，无历史推测backfill；已存在R010 Code不动。使用原迁移器BEGIN IMMEDIATE/version-CAS/authorizer/COMMIT，禁止迁移SQL自启事务或修改user_version。R011任一步DDL/trigger失败，事务回滚到完整R010；并发迁移沿用现有锁内版本处理；重复执行不改数据；旧manifest打开11返回DATABASE_TOO_NEW。不提供down migration：回退程序使用升级前独立冷备，不对已提交R011库就地删表。SQLite物理备份/恢复执行另需范围授权，不操作R4。

## 3. 历史与Syntax序列化、身份、关系

### 3.1 编码

沿用现有historyDraftDigest的严格数据域：plain owned数据、well-formed Unicode、拒getter/proxy/cycle/非finite/-0；对象key按existing historyCompare排序，数组顺序按下列约定。编码`C(x)`为与该helper一致的排序后紧凑JSON UTF-8；存储TEXT须等于`C(decoded)`，拒绝重复key、额外key、非规范化编码。**不得借对象属性重排改变旧helper的字节**。

新增域摘要`H(domain,x)=SHA256(UTF8(domain+'\0') || UTF8(C(x)))`，返回64hex。domain是版本化契约标签，不是数值Quality Gate。完整计划必须给独立编码goldens，禁止用新writer生成expected。

### 3.2 manifest正文（恰好九字段）

`{schemaVersion:1, parent, state, observation, transitions, syntaxMembers, codeIdentity, sourceIdentity, originRegistryDigest}`。

- parent：null或既有DeclaredHistoryRecord.parent，SQL parent_id对应activationId；父记录先已提交、同库，允许不同revision显式祖先，但其支持不跨revision保留。通过现存父链+不可变插入避免环；不单凭id字符串判断。
- state：现有DeclaredActivationState完整shape及排序，含历史完整Source/OTHER/零事实、全部原支持/candidate/快照/coverage、当前syntaxOrigins，不增加字段；原Evidence历史副本status记录该次激活时状态，当前R005可合法终态转换，不回写副本。
- observation：null或`{snapshotId,requestIdentity,outputIdentity,javaProvenance,scope,qualificationRef}`；scope是完整排序单位ID及removed Source ID，javaProvenance=null或已有PARSED_V2身份，不冒充raw；qualificationRef为将来真实Runtime资格记录的稳定引用，测试使用显式组件来源，不授予生产权限。完整Runtime资格账本是H5，未设计/合格前生产路由关闭。
- transitions：现有HistoryTransitionDraft或null；null仅用于首次full建立。NO_OP不产生新记录，不创建snapshot、不改pointer；同内容重提交不得制造新activation。
- syntaxMembers：按originId排序的`{originId,projectionId,unitId}`，与activation_syntax_members完全一致。
- codeIdentity：等于state.basis.codeActivationDigest，使用原C3-A `codeatlas-code-activation-v1` HEADER/NODE/EDGE/EVIDENCE/BINDING/FACT_EVIDENCE/SUPPORT_CANDIDATE/SNAPSHOT/COVERAGE编码及排序/multiplicity，完整committedSnapshotCount，不减掉历史snapshot，不加入Syntax或manifest。
- sourceIdentity：`H('codeatlas-activation-source-v1',state.inventory)`；历史副本摘要，不替代现有current Source digest。
- originRegistryDigest：`H('codeatlas-activation-origins-v1',state.snapshots)`，完整原snapshot；不能裁掉unused旧origin。排序均沿用B1-B2。

manifest_digest=`H('codeatlas-activation-history-v1',正文)`，id=`'activation:'+manifest_digest`。id/digest不含id自身；state.basis须先存在。manifest本身不能证明由validated writer提交，只有pointer+真实capture重查授予当前资格。

### 3.3 Syntax original与current projection

origin正文：`{schemaVersion:1,providerSyntaxId,originSnapshot,sourceFile,unitId,envelope}`；envelope是**首次真实观察映射后、已按当次最终basis验证的Canonical SyntaxEvidence envelope**，不是原Provider AST/传输payload。origin_digest=`H('codeatlas-syntax-origin-v1',正文)`，origin id=`'syntax-origin:'+origin_digest`。origin Snapshot/Source/time/原Canonical envelope此后不改。

当前projection：复用同一语义payload、extractionVersion、sourceFingerprint、confidence和sourceRange；对完整最终Code/source、owner和嵌套引用闭包重验证；supportRefs重新对最终basis和实际支持值构造。重验证不是新采集，不改origin。语义/Source/契约变动必须重新观察或退休，不能改旧origin填充。

projection identity计算先排除SyntaxEvidence.id：`P={originId,payload:SyntaxEvidence省略id后的全部字段}`，projection_digest=`H('codeatlas-syntax-projection-v1',P)`；Canonical SyntaxEvidence.id与SQL projection id均为`'syntax:'+projection_digest`。保存已有codeatlas.syntax-evidence envelope，通过现有parseSyntaxEvidence，保留syntaxKey，允许同syntaxKey的历史不同id。初次origin envelope的id同样按`H('codeatlas-syntax-initial-v1',初次payload省略id)`加`syntax:`构造，避免origin/projection身份循环。实际current projection始终由projection规则产生；初次origin不是自动current。

supportRefs至少包含本Syntax的SOURCE_FILE（SourceFile完整值），并包含owner及payload中所有CODE_NODE引用对应的selected Canonical值；同一entity去重按既有supportKey排序。valueDigest=`H('codeatlas-phase1-support-value-v1',该entity的完整Canonical/SourceFile值)`。每个support basis均为最终RepoBasis，当前Phase1 reference context由真实最终完整候选构造，不能使用caller availableEntities。非owner配置也必须具备Source支持。HistorySyntaxOrigin.id指向origin id，valueDigest=origin_digest，basis为origin envelope的原basis；当前投影basis来自syntaxMembers指向的projection，不覆写历史origin basis。

无跨revisionSyntax复用；null owner不放宽Source/嵌套引用。全量建立时未被本次有效Provider观察覆盖的旧Syntax不自动保留；增量通过现有syntaxRequirements明确retire/revalidate。供业务Plugin消费的仅是active pointer成员的current projection，未获MANUAL批准的语义知识不得由此发布。

## 4. 模块、接口与有界读取

架构guard规定Storage只依赖IR，Providers只依赖IR/Source，Runtime负责组装。不得从Storage import Providers，或把数据库能力放入IR。保留现有NativeStateValidationPort模式：Runtime提供固定的纯规则port，Storage自身拥有SQL/connection/lease/事务权限；规则port永远不能授予历史来源、伪造handle或替换Store写入。生产端口不从IPC、配置、LLM或Plugin结果选取；组件测试替身不开放生产路由。

推荐文件边界（精确实施文件图在计划复核，不新增通用框架）：Storage `analysis/activation-history.ts`负责R011读取/handle，`analysis/mixed-analysis-stage.ts`负责固定TEMP表/lease，`analysis/mixed-analysis-store.ts`负责事务；已有code-context-capture只提取内部身份编码，不改旧入口；Providers `delta-observation.ts`负责raw映射并复用B1-B2，Runtime `mixed-analysis.ts`提供固定组合，生产路由暂闭。

内部API合同如下；history/manifest/rows都是本文§3的Storage-owned严格数据结构，TypeScript声明只引用IR或本Storage私有类型，不把Providers类型跨包import。Providers独立结构类型由Runtime严格适配。

```ts
interface HistoryReadLimits {
  maxRows: number;
  maxSerializedBytes: number;
  maxItems: number;
  maxDepth: number;
  memoryBudgetBytes: number;
}
// 全部positive safe integer，无default；三种状态均由真实SQL得出。
// 无history仍返回拥有expected-null pointer/当前Code/Source的handle，以支持full建立CAS。
function captureActivationContext(
  db: DatabaseSync,
  repositoryId: string,
  limits: HistoryReadLimits,
): {
  handle: object;
  view: Readonly<{
    status: 'AVAILABLE' | 'UNAVAILABLE';
    history: Readonly<HistoryManifest> | null;
    targetSource: Readonly<SourceTarget>;
    targetInventory: readonly SourceFile[];
    activeBasis: Readonly<RepoBasis> | null;
  }>;
};
function recheckActivationContext(
  db: DatabaseSync,
  handle: object,
  limits: HistoryReadLimits,
): void;
function releaseActivationContext(db: DatabaseSync, handle: object): void;
```

AVAILABLE只在pointer/manifest关系、原支持/所有当前表Code身份、Syntax成员、历史Source及来源全一致时返回。pointer缺失返回UNAVAILABLE；pointer存在但JSON/关系/摘要坏是INVALID_HISTORY，不伪装正常缺历史。未索引空库允许activeBasis=null；Source target不存在或非法则CONTEXT_UNAVAILABLE。view没有ready/applicable/run成功声明。无history不能调用delta；full必须覆核全部Provider范围，详见§7。

读取流程：短BEGIN读取schema11/UTF8和repository身份 → numeric row/TEXT UTF8长度预检 → pointer/header → 有界manifest/projection/origin解码及语义关系 → 现有Code身份编码的R011受控行视图 → Source/locator → COMMIT → 私有statement incarnation marker。public recheck禁止ambient transaction；发生读取/比较失败后handle永久失效，不保留上次成功资格。release幂等，同db要求；close/reopen、跨连接、伪造/克隆handle拒绝。公开API固定错误：INVALID_HISTORY、HISTORY_UNAVAILABLE、HISTORY_CHANGED、HISTORY_LIMIT_EXCEEDED、HISTORY_RELEASED、CONTEXT_UNAVAILABLE；message等于code，无SQL/path/payload。

锁内recheck是同模块私有函数，只由Store真实BEGIN IMMEDIATE路径调用，不能导出inTransaction=true选项。比较完整pointer（含null）、manifest digest/CanonicalCode/support/coverage/snapshot、历史成员、locator、目标Source身份；只比较contentFingerprint不充分。C3-A旧Code encoder factoring先证明旧R010输出/错误/逻辑边界一致，R011路径使用历史清单验证旧引用，不放松旧入口。

### 4.1 预算与内存边界

maxRows限制所有SQL交付行数累计；每条TEXT读取前先查询UTF8 byte length并合计，任何SQL值为负/非safe integer/溢出先拒绝，不交付部分TEXT。maxSerializedBytes累计SQL原TEXT、规范化编码片段及跨阶段owned JSON输出；maxItems/maxDepth复用原历史/组合规则的逻辑计数与深度定义。

memoryBudgetBytes沿用既有受控读的保守表示账：原SQL UTF8按既有双表示收费，owned已解码结构按原weight计，编码临时buffer及重复表示各记一次。所有加/乘先安全检查；尚未设计的真实HOST/NATIVE reservation不能当零填补。数字是调用方经审核EffectiveConfig/准入派生的显式参数，本文没有新增默认值、阈值或profile。

Runtime每次操作维护一份总逻辑账本。bridge→history→candidate→Stage传递已花费计数/剩余额度，旧公开纯函数仍各自兼容；新增内部self-validating续接点禁止接受caller trusted-prepared shortcut。SQL、raw bytes、decoded、normalized、selected、最终DTO的重叠表示明确分别计，不能只计最终JSON。现有historyDraftDigest自身两次表示收费保持。

capture长期pin住的view/Stage retained内容不能因函数返回就在账本清零。何时release/detach/drop由生命周期控制；数据库/Stage组件预算测试不等于V8 heap/RSS或实际Native资源合格。整个操作exact/one-below与计数溢出由独立reference逐段断言，不从新composer输出反造expected。

## 5. owner、raw桥接与最终Stage精确生命周期

Storage内部Stage创建与原始封存是两个接口；事件输出的completed不触发冻结。固定TEMP名字前缀`mixed_`，只允许该Stage在同一connection拥有这些表；同连接第二实例在第一实例close前拒绝，不DROP/抢占已有表。不得动态SQL表名或依靠caller表清单。

```ts
class MixedAnalysisStage {
  constructor(
    db: DatabaseSync,
    captureHandle: object,
    mode: 'FULL' | 'DELTA',
    limits: HistoryReadLimits,
    rules: MixedAnalysisRulesPort,
  );
  prepareOwner(
    javaRows: unknown,
    scope: unknown,
  ): {
    ownerHandle: object;
    stageDigest: string;
  };
  acceptObservation(ownerHandle: object, rawBundle: unknown): void;
  freeze(): { lease: object; basis: Readonly<RepoBasis> };
  close(): void;
}
class MixedAnalysisStore {
  constructor(db: DatabaseSync);
  apply(stageLease: object, limits: HistoryReadLimits): string; // activationId
}
```

`MixedAnalysisRulesPort`是固定Runtime模块实现的同步纯规则，接口`compose(input: unknown, limits: HistoryReadLimits): unknown`；内部调用既有raw校验/normalizer/B1-B2、最终identity/现有Syntax parser，返回§3完整manifest/Code rows/Syntax rows。Storage再校验IR/schema、来源、成员、digest、closure、budget和固定Stage内容，port结果本身不授予Apply权限。port不得访问DB/进程、授予run资格或接受外部替换selector；调用一次，异常使Stage失效。只在freeze前调用；锁内不执行外部回调。规则port与测试接口不得从package index、IPC或用户配置暴露。

| 状态               | 可调用                         | 状态转移/后置条件                                                                                                  |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| PREPARING          | prepareOwner或close            | 校验capture/目标scope、java原事实与Source身份、契约；成功→OWNER_FROZEN，否则→INVALID                               |
| OWNER_FROZEN       | acceptObservation一次，或close | 仅本实例ownerHandle；拥有raw副本，校验Java/v5及scope；成功→OBSERVED，否则→INVALID                                  |
| OBSERVED           | freeze一次，或close            | complete Code→finalbasis→Syntax→完整history/rows/预算；封存固定TEMP全内容与内部内容摘要；成功→FROZEN，否则→INVALID |
| FROZEN             | Store.apply一次或close         | 不再接受任何mutation；Store试图消费时先置APPLYING                                                                  |
| APPLYING           | 只有Store拥有事务              | 成功→CONSUMED；任何失败→INVALID，禁止同lease重试                                                                   |
| CONSUMED / INVALID | close                          | 所有读资格、owner/lease永久撤销，close幂等                                                                         |
| CLOSED             | close                          | 幂等；其他调用全部拒绝                                                                                             |

只删除、无raw观察：acceptObservation接受**null**且仅在自算scope确实无本次观察时成功。NO_OP在Runtime先自算并recheck，直接返回旧activationId，不建Stage、不改数据库；一致DTO不能制造新run。

owner-stage正文=`{schemaVersion:1,repositoryLocatorDigest,expectedActivationId,expectedOldBasis,targetSource,inventoryDigest,contracts,scope,javaRowsDigest}`，其中scope恰为`{unitIds,removedSourceFileIds,ownerSourceFileIds}`，排序去重；javaRowsDigest是已有raw/normalized受控Java节点事实的摘要，无Java时为null；不含本次尚未产生Python Code或Syntax。stageDigest=`H('codeatlas-provisional-owner-stage-v1',正文)`；同db的私有ownerHandle才能使用该digest。原computeSyntaxOwnerMapDigest不改编码，使用PROVISIONAL_CODE stageDigest及真实Java/合法retained owner映射构造请求。

scope必须由历史完整Source差分/契约重算：changed Python文件、任一Java变化则整个Java组、removed独立；OTHER/零事实也进入完整目标manifest。Java请求保持原v2完整Java组，不自动改v3增量协议；Python raw沿用v5严格完整性契约，局部request不能被当全仓coverage。Python NODE在严格stream中建立本次owner，不能从事后selected winner反推Provider ref依赖。最终owner/source/所有节点候选引用都对完整Code集合验证，仍复用既有selector。

freeze生成最终Code身份时，固定Stage行视图模拟**将要提交后的**R004/R005/R009/snapshot/coverage状态，并使用C3-A原编码与committedSnapshotCount。Store写入旧表后重新计算实际身份，必须等于Stage basis，再写Syntax/history/pointer；这一步阻断序列化/写入偏差。snapshot/coverage历史记录不能被省略以便让digest“匹配”。所有raw正常/partial/取消/failed及Java PARSED_V2来源严格保留；actual settlement资格由H5控制，不以declared SUCCEEDED替代。

lease是WeakMap私有opaque object，绑定db/statement incarnation marker、Stage实例、capture读集、frozen TEMP内容摘要及basis。克隆/JSON/重开/重建不能复原。锁内重读TEMP与frozen摘要相等；直接SQL篡改也不能越过freeze比较。close只drop本实例拥有的TEMP表/释放自己资源，不清理别人的Stage或历史。

## 6. 原子提交与恢复矩阵

Store不接受expectedBasis/succeeded等caller bool。根据lease内部capture expected读集消费。ambient transaction拒绝并失效lease；BEGIN失败也失效，是否重新prepare由上层显式决定，不自动重试到绿。

锁顺序与写入顺序固定：

1. 校验lease/connection/incarnation；置APPLYING，BEGIN IMMEDIATE。
2. 锁内完整重查expected pointer或null、Code/support/coverage、历史、目标Source/locator/契约和冻结TEMP；比较后才写。
3. 按既有validated事务模式写snapshot/capabilities；原Evidence终态转换及relations；新Evidence/binding/R009原candidate；selected Code；coverage。R011失效trigger此时删除旧pointer，仍在本事务内。
4. 重查实际Code身份==frozen basis；关闭所有不兼容R010 derived state（沿用旧clearNativeState模式，本包不伪造mixed-v3 summary），所有删除属于本事务。
5. INSERT OR严格比对复用相同origin/projection；内容与同id不一致拒绝，禁止ON CONFLICT UPDATE；写不可变activation_history与成员（parent必须已提交/精确符合capture）；最后建立active_history_pointer。
6. COMMIT成功后返回activationId，lease→CONSUMED；关闭/释放本实例资源。close失败不能把已commit结果说成回滚，须返回已提交身份并独立记录资源关闭失败，禁止再次Apply。

| 注入/竞争点                                                                                  | 预期结果与独立验收                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source目标/locator/Code/support/coverage/history pointer在capture后变化，包括相同fingerprint | §2触发器或完整recheck拒绝；无任何新graph/Syntax/history/pointer；Source自己的合法变更保留                                                                                                              |
| 取得锁失败 / 外部事务 / 跨db / 重开 / owner或lease伪造                                       | 固定拒绝；不创建Store事务或写入；lease失效，不自动重试                                                                                                                                                 |
| 每一步snapshot、Evidence退休/新增、candidate、node、edge、coverage写入后抛错                 | ROLLBACK；磁盘重开后与pre-Apply完整图/支持/Syntax/history/pointer相等，不只比较counts                                                                                                                  |
| 实际Code digest与stage不同 / Syntax nested ref或成员origin不一致                             | 回滚包含所有前序旧表写入和pointer删除；固定契约错误                                                                                                                                                    |
| origin/projection/history/任一member写入后故障                                               | 同上；没有孤儿新历史或可见半成品；旧Source不被回退                                                                                                                                                     |
| pointer写入后、COMMIT前故障                                                                  | 同上；旧pointer仍在，旧history原文不变                                                                                                                                                                 |
| COMMIT返回失败或连接丢失、无法确定是否提交                                                   | 不盲称回滚；返回COMMIT_OUTCOME_UNKNOWN，lease永失效；新连接只读比较预期activationId+manifest+pointer与完整Code/Syntax决定COMMITTED/NOT_COMMITTED/INCONSISTENT，后者停写留last-good诊断；不自动再次提交 |
| 真实进程在各写入边界/commit边界退出                                                          | 后续受权磁盘组件测试启动新进程/连接验证SQLite完整状态；本轮不执行，不用同对象重建冒充restart                                                                                                           |
| COMMIT后close失败 / 重复Apply                                                                | 已提交身份仍有效，重复lease拒绝；不得生成第二snapshot/activation或重写immutable历史                                                                                                                    |

所有重开检查走validated readonly workflow，不直接改库“修复”、伪造owner或复用mutable R4。没有新数值超时或重试次数。

## 7. Full建立、legacy readers/writers与新入口错误

full建立只支持本任务的WORKTREE目标。初始history unavailable是预期状态，不从旧表猜source manifest。模式FULL要求**所有拟激活Provider支持**来自本次有效完整重验证；旧foreign支持存在且本次未重验证时，OTHER_PROVIDER_REVALIDATION_REQUIRED。没有授权的Provider重验证/撤销能力时，明确拒绝，保留旧图。Native-only首次建立仅用于不存在foreign支持或已通过既有授权撤销workflow的状态，不能把“用户允许full”解释为允许清除foreign。纯B1-A projection仍不授予full Store权限。

不同revisionID不保留旧支持：full来自新观察，parent可同库显式旧activation；delta必须同一WORKTREE/revision且满足历史契约。EMPTY全量Code仍须完整Source、每单位零事实coverage及Syntax（或明确空集）证据。无snapshot观察的空库首次建立如何获得可信全量资格由受权真实Runtime提供；组件可以验证空结构，不把空输入等同真实分析成功。

| 旧路径                                                    | R010库 | R011库行为 / 新历史资格                                                                                                                                                 |
| --------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C3-A capture/recheck/release                              | 原样   | 保持CODE_CAPTURE_UNAVAILABLE，不改version10门禁；新ActivationContext提供R011能力                                                                                        |
| Store applyAnalysisBatch / applyAnalysisPatch             | 原样   | 旧事务本身保持；成功修改受监控旧表则pointer自动失效；失败rollback保留pointer和last-good                                                                                 |
| Store applyNativeAnalysisBatch / applyNativeAnalysisPatch | 原样   | 同上；不能维护/生成mixed历史；旧v3 summary可按原规则写入，但不授予R011增量资格                                                                                          |
| 原Native baseline/full/refresh reader和旧summary          | 原样   | 旧流程可按已有R010表契约工作，但新mixed入口显式不把R010summary当mixed baseline；联合Store清除不兼容derived state后旧reader返回既有bootstrap-required，不冒充已可refresh |
| 普通Code查询                                              | 原样   | 仍读当前Canonical Code，历史不可用不删除last-good图；不返回未完成Syntax                                                                                                 |
| 新Syntax/query消费者                                      | 不可用 | 只读当前pointer成员并完整检查basis/manifest；pointer无则SYNTAX_BASELINE_UNAVAILABLE，无旧/新拼接fallback                                                                |
| Source validated CAS                                      | 原样   | 仍独立修改current Source；不失效旧immutable manifest；新capture/Store比较新target，已有Code可显式stale                                                                  |
| schema较旧程序/旧manifest                                 | 原样   | migration版本保护DATABASE_TOO_NEW；不得偷偷downgrade                                                                                                                    |

新增Stage/Store错误集合：INVALID_STAGE、STAGE_LIMIT_EXCEEDED、STAGE_RELEASED、STAGE_CHANGED、INVALID_CANDIDATE、FULL_ANALYSIS_REQUIRED、OTHER_PROVIDER_REVALIDATION_REQUIRED、HISTORY_CHANGED、SOURCE_CHANGED、INCOMPATIBLE_CONTRACT、COMMIT_OUTCOME_UNKNOWN。pure规则既有错误（含DANGLING_REFERENCE、FACT_CONFLICT、RESOURCE_LIMIT_EXCEEDED）以原code作为内部cause分类，不回显input/SQL/path；外层INVALID_CANDIDATE诊断可保留安全causeCode。上游unsafe/资源拒绝优先于候选闭包与selection；Stage失效后统一STAGE_RELEASED。

## 8. 独立Fixture、任务追踪与本地验证计划

以下Fixture是**待计划冻结的设计族**，不是已创建/已注册/已通过的清单；具体Fixture-ID、manifest数量和root注册目标由实施计划按实际新增项计算，不提前造数值。每个semantic family需literal完整expected，不从新writer/selector产出golden；错误控制应隔离真实拒绝层。

| 设计族      | 设计来源                                | 独立验证与完成条件                                                                                                                                               | 包       |
| ----------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| HS-MIG      | §2、ADR-020/SQLITE_SCHEMA               | fresh/10→11、每个DDL/trigger故障、user_version/旧数据原文保留、reapply、too-new、并发version-CAS、无backfill；旧迁移checksum逐项一致                             | H1       |
| HS-HISTORY  | §3/4、历史支持契约                      | 独立manifest/Source/原candidate/coverage/parent+Syntax关系；numeric先于TEXT；坏UTF8/JSON重复key/超限/溢出；跨库/跨revision/断链/ID内容冲突拒绝                   | H1       |
| HS-LEGACY   | §2.1/7                                  | 十一表每种mutation均失效pointer；失败rollback恢复；同指纹支持变化、ABA写回仍不复活pointer；Source独立CAS不误删历史；旧四writer/recheck/Native reader兼容         | H1/H4    |
| HS-IDENTITY | §3                                      | 独立域编码、空/Unicode/数值key/数组顺序、无自身hash循环；旧C3-A完整编码与byte/item边界不变；Stage预测与实际commit状态Code digest精确相等                         | H1/H3/H4 |
| HS-RAW      | §5、Native IPC/Provider SPI             | changed-only、Java整组、Python局部、OTHER/零事实、仅删除/NO_OP、raw正常与篡改、parsed Java身份、所有active非winner闭包、原full入口仍拒局部/removed               | H2       |
| HS-OWNER    | §5                                      | Java预备owner与Python输出owner正反对照；冒用摘要、缺Source、错误快照/typed ref、Stage时序循环控制；准备阶段不能授最终basis                                       | H2       |
| HS-SYNTAX   | §3.3/5、CANONICAL_IR                    | 初次origin及current projection身份独立literal、finalbasis/Source/owner/嵌套support；配置null owner正/负例、retained重验证/退休、原origin不改、无MANUAL语义发布   | H3       |
| HS-STAGE    | §5                                      | 每个状态×每个mutation/read/apply/close；相同连接第二Stage拒绝；JSON/跨实例/重开/rollback/重建/consume拒绝；TEMP实物篡改锁内检测                                  | H3       |
| HS-BUDGET   | §4.1/5、Security/scalability            | 独立逐段计费exact/one-below、合计不足、原/新表示重复、release后账目、rows/bytes/items/depth/安全算术、错误优先级；不声称RSS/实际run                              | H1–H3    |
| HS-STORE    | §6/7、IMPLEMENTATION_PROTOCOL           | 每个写入边界、commit未知、close失败、真实disk reopen/process退出；完整Code/Evidence/R009/Syntax/manifest/pointer last-good相等；foreign full拒绝与有效重验证对照 | H4       |
| HS-RUNTIME  | H5、原P1-04/05准入/资源/进程/Evaluation | 真实Source/child/settlement、资格与purpose/profile、失败/取消/完整参考/资源恢复；只有另行批准的真实证据可开放路由                                                | H5，另案 |

真正可独立的仅是H1迁移/捕获组件验证、H2部分纯规则测试；它们共享H0契约，不能同时各自发明字段。H3必须消费完整H2输出，H4需H1–H3闭环。H5生产集成不能因组件PASS提前开启。

实施时分层本地验证：TDD缺API RED与可调用断言RED分开留存 → 当前任务unit/Fixture → 旧范围回归与TypeScript范围build → architecture17、manifest/root注册、格式/文档追踪/hash → 受权的隔离磁盘迁移/事务/重启测试 → 另批真实Native/资源/CI。数据库组件测试仍须在整包实施范围中明确批准，禁用现有R4；本轮无任何数据库测试。原Quality Gate阈值不删不降；旧未执行/取消结果不记PASS；不重跑Phase0.5完整回归/校准。

### 8.1 设计自审修订

- 新capture在没有历史时可以捕获旧Code身份读集以进行full CAS，但不能验证未知历史Source或授retained资格。该路径校验Code/支持/关系和身份，不以当前Source解释旧range；full覆盖全部支持后，目标引用闭包仍强制验证。旧C3-A检查不变。
- 验证port只能参与pure规则；所有handle/锁/固定TEMP/来源关系检查属于Storage，不能用测试port返回“验证成功”跳过。这是既有端口式分层的具体应用，不创建可插拔安全框架。
- 最终Syntax使用既有Canonical shape与reference parser；新增支持值摘要是本DCP拟议持久身份契约，需独立Fixture和显式接受，不声称已有统一全项目valueDigest实现或不受影响的全消费者。
- trigger故意保守：历史之外的旧表诊断写入如果改变C3-A identity也可使pointer不可用，但不会删除最后图或不可变历史；不能自动重写manifest弥补。失败事务不会产生此后果。后续优化触发scope需Fixture/Evaluation依据与治理，不是实施者自由调优。

## 9. 设计决策、实施前门禁与下一步

需要集中审阅的新增决策：

1. 接受R011五表JSON关系外壳、不可变历史/投影及十一表legacy失效trigger；保留所有旧SQL和C3-A公开R010行为。兼容代价是旧writer提交后必须重新完整建立新历史，而不是透明延续增量。
2. 接受纯新增/无backfill/backupRequired=false与无down migration；迁移失败保留R010，正式回退走独立升级前备份，既有backupRequired=true拒绝不绕过。
3. 接受本文domain编码、origin/current Syntax身份、source/node support值摘要，以及新私有capture/owner/Stage/Store契约。新数字只为迁移/记录版本，不是新性能或质量阈值。
4. 接受首次full必须覆盖所有拟激活Provider来源、无旧foreign自动继承；实际Runtime资格和profile仍由H5独立设计/批准，生产路由保持关闭。

本DCP对现有FROZEN模型不做静默替换；如评审发现与不可变历史/Canonical身份/Source CAS等FROZEN要求冲突，暂停相关后续实现并修订DCP，不能降低Fixture/Gate。不引入Diagram、adaptive routing、AST持久化或其他Deferred能力。

本轮方向接受的记录需同步ADR-020、设计authority、WBS/acceptance/trace/status及Provider/IR/SQLite/Native/Security/Evaluation/scalability；记录必须明确：**方向ACCEPTED、本文详细设计REVIEW_PENDING、H1–H5未开始，不是契约已生效**。只有本文被接受后才把这些拟议字段/存储机制提升为实施依据。

下一步建议先为**H1：R011迁移及真实有界历史capture**写精确任务包，列清SQL/trigger模板展开、独立Fixture、旧C3-A提取兼容、TEMP/disk测试授权范围和命令；H2–H5不由H1计划自动授权。H1完成标签只为LOCAL_R011_HISTORY_STORAGE_CAPTURE，不能记B1-C、B1-B2或Phase1完成。

完整设计Exit：本文物理布局、编码、API/预算、生命周期、事务顺序、legacy矩阵和Fixture映射经过作者评审；新机制全部显式标待接受；无实际运行或质量数字被暗批。接受后writing-plans；整包计划再确认后才TDD/实施。独立review/SQL实际执行/迁移/资源/真实Native资格均未完成，不能引用本设计报告代替它们。

## 10. 自审发现的后续范围阻断：不得补造Syntax confidence

实际检索Providers/Runtime没有已实现的Canonical Syntax normalizer；NativeSyntaxObservation没有confidence、Canonical SyntaxEvidence却要求confidence.score/method/reasons和syntaxKey。本文§3.3规定的是**已经完成合法映射之后**的存储/投影身份，不能被解释为存在现成完整映射器。

因此H2/H3转精确实施计划前还需单独完成Native→Canonical Syntax映射附约：所有ProviderTarget/嵌套REFERENCE到ScopedRef的规则、syntaxKey独立于Provider的编码、原观察身份映射，以及confidence策略的Fixture/Evaluation依据。不得将ProviderSyntaxId直接当provider-independent syntaxKey；不得默认打满分、随意给零分或偷偷引入新的置信数值。现有Code fact confidence也不能在无依据时充当无owner配置Syntax的置信度。缺策略时新入口拒绝INCOMPATIBLE_CONTRACT，不发布残缺Canonical Syntax；本文没有授权新的confidence数值。

这不阻塞H1的独立R011迁移/严格历史读取：该包读取已按现有SyntaxEvidence IR验证的独立Fixture数据，不做raw映射、不生成生产历史。**H1可进入计划设计；H2/H3映射附约仍DESIGN_BLOCKED，整个联合路径不宣称IMPLEMENTATION-READY。** H4/H5保持前述依赖，不能凭空schema或声明Fixture解锁实际发布。作者评审必须保留此缺失项，用户只需先审H1相关存储/capture设计，不因本文篇幅完整就默认接受尚不存在的映射策略。

## A3私有请求衔接整包已批准（2026-10-29）

用户已批准[A3附约及T1–T3实施范围](2026-10-29-phase1-mixed-request-preparation-design.md)：Stage文件级范围/owner投影、Runtime固定v2/v5构造、同账本和局部Source→Store验证；不经public index导出。最终局部结果见实施包文末及其单一results入口。投影不是持续权威/lease/资源资格，原acceptObservation/freeze/Store最终校验保留。未改wire/owner-map算法、SQL/迁移、Canonical IR、生产catalog或DESCRIBE；实际Native/Git/collector、完整资源目的/数值和P1-04/05/Phase1仍OPEN。

## 已批准：已结算Java owner时序附约（2026-10-29）

用户已整体批准[时序修订及S1–S3](2026-10-29-phase1-settled-java-owner-design.md)。新SETTLED_JAVA_OWNER准备仅含完整已结算Java和snapshot已知身份；没有codeSyntax/snapshot.completedAt。最终完整metadata经已知字段精确投影及原完整组合门禁关联。新javaRowsDigest使用codeatlas-settled-java-owner-v1＋NUL的独立输入域；旧完整metadata分支、摘要/费用和最终SQL时间/diagnostics比较保持。Stage外层正文/摘要域、owner-map、IR/SQL/wire/public index不变；准备不作为完成snapshot发布。结果与作者审查集中于实施包，不能据此认定完整Runtime或实际资源资格通过。
