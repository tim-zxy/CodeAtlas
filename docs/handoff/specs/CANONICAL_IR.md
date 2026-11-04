## 已批准 A/B V2 容器与派生域 — 2026-11-03

[获准合同 §7.1–7.3](../../superpowers/specs/2026-11-02-phase1-ab-local-closure-contract.md)及[容器位置 DCP](../../superpowers/specs/2026-11-02-phase1-runtime-container-version-proposal.md)：SQL 外壳 schema_version=1；新 JSON 严格 {formatVersion:2,identity,candidate}，旧 {identity,candidate} 保持，未知/混格式拒绝，无迁移或历史改写。V2 候选摘要绑定 derivation/site-plan；runtime-site-plan-v1 的规范序列化由唯一 IR helper 共享。Graph/Flow V2 明示 LOCAL_DECLARED_RUNTIME，未解析边和跨仓 schema 缺口不升格。未验证 site 的当前 Syntax 摘要引用仅供支持/coverage 闭包，不是新语义事实。[证据与退出边界](../../superpowers/reviews/2026-11-03-phase1-ab-local-implementation-review.md)。

## B批新增严格候选IR — 2026-10-31

[批准设计§3/4](../../superpowers/specs/2026-10-31-phase1-b-remaining-design.md)对应codeatlas.framework-binding-set / codeatlas.contract-match / codeatlas.workspace-execution独立version1。旧Runtime v1保持单repo；六match状态中仅MATCHED选择唯一provider。workspace保留repo/revision及冻结Code/Syntax/Runtime摘要，basisRefs使用现有Phase1Basis联合保留注册/schema支持的原basis，不重绑成新inputDigest。

纯parser闭包不认证SQL当前membership；[实施评审](../../superpowers/reviews/2026-10-31-phase1-b-remaining-implementation-review.md)及[准确命令/唯一结果](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)明确Source/Store/Evaluation缺口，不承诺跨DB原子时刻或部署/事件先后。

## B-G1声明执行派生适用合同（2026-10-31）

已批准[入口/局部图/Flow设计](../../superpowers/specs/2026-10-30-phase1-declared-execution-design.md)，[本地实现/作者评审](../../superpowers/reviews/2026-10-31-phase1-declared-execution-implementation-review.md)。沿用RuntimeFactSet v1：ENTRY node直接target真实owner Code，context.entryRef绑定真实入口；同context只有支持充分的EXACT Code CALL扩展，环引用已有节点。非解析/HEURISTIC不升级，candidate-only节点不进入Flow。stepKey按Flow/图节点语义键派生；ordinal仅稳定呈现，不从CALL fanout造branch。

新记录runtime-execution-declaration-v1/0.5/HEURISTIC为获准规范约定，Source无虚构分数，旧Code/Syntax/领域政策保持。身份域declared-execution-fact-v1/entity-v1及declared-runtime-step-v1无provider/Syntax原ID/ordinal；支持继承当前底层闭包，不新造Runtime-record SupportRef用途。无序事实/支持/coverage集合精确排序，signature/步骤顺序保留。局部输入只接单repo，不改通用IR workspace规则。

本私有组件必填maxItems，按设计实际重复保留单位计费（含逐Flow coverage），超限整体拒绝，不修改原通用frontier义务或物理profile。coverage恒PARTIAL；完整边界、匹配/发布及原P1-07仍OPEN，旧IR/schema版本/SQL不变。

## B-F3 Runtime声明候选支持用途（2026-10-30）

用户已批准[精确身份/支持合同§5](../../superpowers/specs/2026-10-30-phase1-runtime-semantic-candidate-design.md)，仅在私有Runtime候选中使用既有EntityRef.kind文本SYNTAX_EVIDENCE，指向当前Syntax3 payload.id及当前revision；valueDigest=SHA256(runtime-syntax-support-v1+NUL+既有canonical JSON完整Syntax3 envelope)。不能用历史origin ID或draft标签替代当前投影；现有strict形状/版本不变。

Runtime候选支持收集实际草稿Canonical支持、其Syntax的Source/Code支持及上述当前Syntax值；externalRefs/inventory只收实际闭包，同ref异digest拒绝。parser仅证明声明结构/引用一致性，未来Store必须验证当前membership。factKey/id由批准tuple域生成，provider/Syntax原ID/policy分数不混入逻辑意义；policyVersion保留在provenance与后继activation。合并不升分、同ID语义冲突拒绝，旧Code/Syntax immutable冲突规则不变。

新支持不创授权：当前仅strict合同/任务/资源候选，coverage恒PARTIAL，完整图/发布及R012/R013保持OPEN。[实现、Fixture及准确证据](../../superpowers/reviews/2026-10-30-phase1-runtime-semantic-candidate-implementation-review.md)。

## B-F2-B固定7/Syntax3管线有限本地交付 — 2026-10-30

用户已批准[完整后继设计](../../superpowers/specs/2026-10-30-phase1-binding-sufficiency-pipeline-design.md)及J1–J5。J1–J5现已达到B_F2B_BINDING_PIPELINE_LOCAL_EXIT；[范围、Fixture、失败与准确门禁](../../superpowers/reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)。新域/固定表面支持策略条件适用及持久集合闭包经本地验证；旧版/SQL11保持。库/声明式Store出口不授CLI/物理/语义发布资格，父任务/Phase1保持OPEN。

## B-F2-A精确合同有限本地交付 — 2026-10-30

用户已批准[wire7/Syntax3/context4与严格领域草稿合同](../../superpowers/specs/2026-10-30-phase1-binding-sufficiency-contract.md)及C1–C4本地实施；旧版本/历史保持，不授权producer/四规则/分数/发布或真实运行。已完成B_F2A_BINDING_CONTRACT_LOCAL_EXIT；[范围、Fixture、准确门禁与作者审查](../../superpowers/plans/2026-10-30-phase1-binding-sufficiency-contract.md#实施结果与作者整包审查--2026-10-30)。有限出口不关闭父任务4/21及Phase1。

## B-F1-C版本化历史本地交付 — 2026-10-30

Syntax v2历史保存完整lexicalScope/支持与原meaning，retained仅换当前支持和projection；初始、origin、projection固定使用codeatlas-syntax-{initial,origin,projection}-v2，v1仍用原v1域。 具体批准、Fixture、最小门禁和限制见[实施结果](../../superpowers/plans/2026-10-30-phase1-binding-history.md#实施结果与作者审查--2026-10-30)。旧pending快照仅为历史。

## B-F1-B库级绑定观察已交付 — 2026-10-30

用户已批准S1–S4与MODULE兼容澄清；[实施结果/准确证据/作者审查](../../superpowers/plans/2026-10-30-phase1-binding-observation.md)为本次范围依据。固定Rust v6库AST→原始字节流→TS完整校验→Canonical v2/Evidence支持→Plugin V3两条实际桥已通过；MODULE null范围仅凭显式同basis文件/path/fingerprint证明，owner/scope均保持。原v4/v5/V1/V2严格行为及History/SQLite/生产边界不变。

最终组件437/437、Rust库14/14及protocol内存18/18、注册35/35、架构17项目、三包构建/IR类型和命名格式通过；只接受B_F1B_BINDING_OBSERVATION_LIBRARY_EXIT。作者审查不是独立评审；无CLI、独立harness/helper/collector、CI、Git写入或新数值/依赖。父任务仍4/21，完整History/框架语义/生产资格/E01/E02与Phase1 OPEN，A6 NOT_QUALIFIED及原风险保留。旧pending文字仅为历史快照，不能据本段替代逐项证据。

## A-local独立评审与修复完成；本地组件退出 — 2026-10-29

同一次只读独立整包评审发现4项原契约实现缺陷：manifest/Code闭包、Unicode DELTA、失败预算续接、H1查询前行准入。原范围统一修复7源码/3测试，旧公开接口与成功成本/Fixture预期保持。IR1/3/4原4项RED及IR2私有Provider另行RED均转绿，最终12项新旧边界定向通过（10新控制含在Stage root）；修复无第二次独立评审，以作者TDD及完整适用本地批次验证。

新鲜构建/IR类型exit0；Code75/75、Syntax59/59、Stage333/333、Store288/288、原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17及范围格式通过，重叠不累计。四root仍去重55文件，registry61/Phase1 35/四ID各一次/catalog0；2369个Fixture/参考字节、依赖/迁移/注册不变。

[独立发现、修复证据及有界验收](../../superpowers/reviews/2026-10-29-phase1-independent-review-fixes.md)逐条链接109原显式绑定的最新PASS selector及共享资源/兼容门禁；U0～U5与原A..G在声明式Node/SQLite组件范围完成。原整体Fixture历史map/generic base不改写、不无条件签收；主任务仍4/21接受、17未关闭，P1-04/05/Phase1未完成。

真实Source重验证/资源取消、Native/profile/H5和后续B～E需具体方案及相应授权；无Native/云端CI/Git写入或第二代理。timeout仍UNKNOWN，main取消结算/R4/C2不变。全部旧文档后缀、原稿、失败及封存保留；下方pending是历史快照，不推翻本次有限结论。

## A-local统一本地门禁已通过，独立整包评审待完成 — 2026-10-27

已批准U1实际partial raw DELTA、U2 retained/删除/NO_OP及U3完整故障/只读恢复资源已顺序核验；U4仅追加两个缺失root，四root去重覆盖55文件。完整Source/原支持/opaque unit、immutable origin/current、同账本五维边界、TEMP/seal/lease、22表和恢复身份保持原契约。本轮无新产品/依赖/数值/迁移或Native资格。

新鲜本地证据：Providers→Storage→Runtime构建及IR类型exit0；四root分别75/75、59/59、323/323、288/288，原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17项目通过。重叠收据不相加，不代表全仓verify或Native门禁。补记前2347旧Fixture、374产品src/dist及109原绑定不变；registry61/Phase1 35/四ID各一次/catalog0保持，八个旧注册守卫无需改动。

[准确范围、首轮失败与作者评审](../../superpowers/reviews/2026-10-27-phase1-unified-local-resource-review.md)。U5独立整包评审/最终退出仍待，作者检查不代替独立评审；原Fixture整体签收0、主任务4/21接受/17未关闭，P1-04/05/Phase1未完成。原批准内不逐小步骤确认；新增代理需遵守此前单独确认边界。无Native、云端CI或Git写入，timeout仍UNKNOWN，R4/C2/main取消未结算状态不改。下方原文为保留历史与契约，不据旧pending快照推翻本次有限范围证据。

## 组件输入可携带性检查点 — 2026-10-27

已将36份封存组件输入整理为库内可携带材料：24份JSON按标准库gzip保存原payload字节，12份JSONL不变，loader校验存储/解压摘要与原byteLength。六处消费者不再读旧私有输入；未从产品生成expected、未修改.prettierignore或格式门禁。原目录与无旧私有输入复制目录四组均212/212，0fail/cancel/skip/todo，含19个真实Node退出；不同环境重复不累计为424。架构17项目通过，产品/编译产物未改。[本轮作者评审](../../superpowers/reviews/2026-10-27-phase1-component-reference-portability-review.md)记录Windows路径及辅助代码首轮失败、最终转绿和可复现入口。

新增材料为原Fixture根附加参考39文件，不新增Fixture ID/门槛；原2241 Fixture字节、所有历史原文/失败保留，registry61/exactPhase1 35/catalog0。原Stage66/Store43共109项已逐项映射输入/期望/基线摘要、相关组件证据及缺口，尚未执行的原case全部保持OPEN，不以组件数冒充验收。

本记录替代下方“组件必须读取旧W输入”的历史限制；.superpowers仍仅作证据/临时输出而不提交。D/E/F IN_PROGRESS、G OPEN；独立整操作预算、完整原Fixture与较宽旧快照恢复仍待，B1b/P1-04/05/Phase1未完成。原D..G顺序继续，无新增Native、校准、profile/依赖/数值、CI或Git授权；timeout仍UNKNOWN及全部既有风险不变。

## ABA 与 Store 组件新检查点 — 2026-10-27

获批ABA私有SQLite见证及实际查询记账3→5已实施，同/另连接ABA拒绝；Store锁内资格、一次lease消费、原子持久写入、未知提交只读判定和清理诊断已接入。19类实际SQL边界异常与真实Node退出38/38。[作者组件评审](../../superpowers/reviews/2026-10-27-phase1-stage-aba-store-component-review.md)记录全部RED→GREEN及范围限制；下方待批准/无Store/ABA仍RED等为保留快照。

最新集中本地回归15文件609/609，0fail/cancel/skip/todo；Storage/Runtime build exit0，架构17项目通过。Stage37/Store69是组件结果，不代替原Stage66/Store43逐项验收。原Fixture2241字节、registry61/Phase1 35/catalog0保持，全部历史失败/原文保留。

D/E/F IN_PROGRESS，G OPEN；独立整操作预算reference、完整66/43映射、可携带Fixture整理及较宽原始快照恢复仍待，B1b/P1-04/05/Phase1未完成。组件数据仍在私有证据目录，不可提交.superpowers或声称干净checkout/CI就绪。原D..G已批准，后续顺序推进无需逐小步骤确认；无新增Native、校准、依赖、数值、云端CI或Git写入授权。Native历史timeout仍UNKNOWN，既有风险不变。

## ABA 私有见证修订已批准 — 2026-10-27

用户明确批准 `2026-10-27-phase1-stage-aba-witness-proposal.md`：使用 SQLite total_changes/data_version 私有见证，按实际两条数字 SQL 行累计计费，构造预留3→5；不改变预算输入、默认值、公开契约或原门禁。原 D..G 继续顺序实施。下方自动审批阻断／待批准为历史，旧失败与原文保留；Stage66、Store43、整操作独立预算与恢复退出仍 OPEN，不将批准记为执行通过。无 Native、云端 CI 或 Git 写入授权。

## B1b 前置验证与 Stage 冻结组件检查点（ABA 阻断）— 2026-10-27

已批准三方法修订已接入：Runtime 原 Java/v5/full/R0 规则复用；真实 Stage owner/观察接收、独立最终 H1/Code/原始支持/快照/coverage/pair 验证、固定 TEMP 全内容 seal及私有 lease 已实现。三组 owner/完整最终目标在相应产品前独立冻结；仅删 null 保留原文与物理 coverage。非法方法调用按原冻结矩阵保留状态，真正验证失败/重入仍撤权。[作者组件评审](../../superpowers/reviews/2026-10-27-phase1-early-validation-stage-freeze-review.md)为本次依据，不是整包或独立评审。

最新十文件 **476项：474通过、2项ABA失败，0cancel/skip/todo**；Storage/Runtime build和17项目架构通过。不得把旧473/473当最后绿色结果。原2241 Fixture字节、registry61/Phase1 35/catalog0保留；Stage66/Store43未执行验收。Store仅新增独立SQL目标和missingAPI RED准备，无产品实现。D/E IN_PROGRESS、F/G OPEN；整操作独立预算、完整原快照恢复及竞争/崩溃/COMMIT恢复均待，B1b/P1-04/05/Phase1未完成。

自动审批拒绝了尚未执行的 ABA 私有见证/实际查询预留3→5，认为是未批准的数值/记账变更；没有绕过或应用。[具体ABA修订](../../superpowers/specs/2026-10-27-phase1-stage-aba-witness-proposal.md)待明确确认，相关资格/锁内链不能验收。无真实 Native、校准、新依赖/值、云端 CI或Git写入，原风险不变；下方是保留的历史快照。

## 前置验证端口局部修订已接受 — 2026-10-27

用户明确批准 [前置验证接口修订](../../superpowers/specs/2026-10-27-phase1-stage-early-validation-proposal.md)。本补记替代下方关于该提案待批准／单方法接口的历史结论：固定私有端口为 prepareJavaOwner、validateObservation、compose；前两者依各自状态先校验，compose 仍仅在 OBSERVED→FROZEN 调用一次，锁内均不执行。Stage 独立验证并授 owner/lease；原 raw/Source/IR/closure/预算门禁保持。接受的是设计及原 D..G 内实施，不表示尚未执行的 Stage66/Store43、整操作预算或 Store 门禁通过。

## B1b 无 Java owner 准备与前置验证接口缺口 — 2026-10-27

原已批准 D..G 中，Stage 新增无 Java owner 准备：真实同库读集重查、自算 full/变化 Python/仅删除范围，独立完整正文/摘要3例，unsafe/篡改/时序负控制；仅内部 owner，无 acceptObservation、freeze、lease 或 Store。[作者检查点](../../superpowers/reviews/2026-10-27-phase1-owner-preparation-and-early-validation-review.md)及本包 owner-preparation-final-cohort 记录最终九文件420/420，0fail/cancel/skip/todo；Storage 构建和17项目架构通过。Stage11只是组件测试，Stage66/Store43未记执行通过，registry61/Phase1 35/catalog0不变，原2241 Fixture字节保留。

新发现原 §5 的“提前验证 Java/v5”与“只有一次 compose”在依赖边界下缺少连接入口；[局部接口提案](../../superpowers/specs/2026-10-27-phase1-stage-early-validation-proposal.md)为 PROPOSED，尚未实施。仅此契约变更相关 Java/接收连接待明确批准，原批次批准不撤回。D/E IN_PROGRESS、F/G OPEN，B1b/P1-04/05/Phase1未完成；不新增 Native、云端 CI、Git 写入、数值或依赖，全部历史失败与风险保留。

## B1b DELTA／NO_OP and owned Stage foundation checkpoint — 2026-10-27

原已批准 D..G 连续推进：固定 Runtime 的自算 scope／DELTA raw／仅删除／NO_OP、完整旧 origin／祖先／当前 Code 核验与 retained 重投影已实现；H1 私有同库有界读集保存全仓 census 和原始 snapshot／capability／physical coverage／history 行，原 capture 和每次私有读取消费累计保留，缺失 diagnostics 不补造。Stage 仅 constructor/close 所有权基础已实现，不抢占已有 TEMP、不删除普通重建或重开连接后的同名表，计费先于分配和 TEMP 创建。[本次作者评审／证据](../../superpowers/reviews/2026-10-27-phase1-b1b-delta-owned-stage-foundation-review.md)为当前新增进度依据。

最终九文件415/415，0 fail/cancel/skip/todo；Storage／Runtime 构建和架构17项目通过，registry61／Phase1 35／catalog0，旧 Fixture／证据保留。独立参考的首稿 H0 域纠正和后续 transport basis／owner-map／回显适配均保留原字节及失败；不冒充原 Source/Native 资格或全部最终字节预先冻结。动态 receipt exact／少一为一致性控制，不是独立整操作／RSS 资格。

D/E 仍 IN_PROGRESS：真实 Java 临时 owner／完整 scope、acceptObservation、一次 freeze／TEMP seal／opaque lease、原 snapshot registry 恢复与整链独立 budget 证明待连接。F Store／锁内 CAS／竞争／崩溃／COMMIT 未知恢复和 G 整包门禁 OPEN；Stage66/Store43 未算执行通过，新增 Stage 单元文件未提前增加根注册。P1-04/05、B1b、Phase1 未完成；继续原批准范围，无新批准请求、Native、云端 CI、Git 写入、新依赖／数值，原风险保留。

## B1b fixed Runtime FULL component checkpoint — 2026-10-26

原已批准 D..G 内，固定同步 Runtime 端口的 FULL 分支已连接严格原 raw、全部支持／候选、未来九组 Code 身份、固定 Syntax mapper、完整 manifest／origin-current，并实际调用原 H1 manifest/pair 校验。[本次作者评审与证据](../../superpowers/reviews/2026-10-26-phase1-b1b-runtime-full-component-review.md)为新增进度依据。FULL 保留准确 parent、完整旧 snapshot／诊断和 physical coverage multiplicity；全库 census 独立于当前 revision，snapshot ID 已存在即拒绝，foreign active Provider 无本次重验证则拒绝。未增加公共出口或生产路由；输入声明先经受预算 H1 编解码独立拥有，输出冻结不影响调用者。

最终六文件365/365（0 fail/cancel/skip/todo），Storage／Runtime 构建通过，架构17项目通过。旧 Fixture 与原证据不改。Provider 各段接收总已用计数，并在执行前以剩余内存限制表示预算；实际用量累计并保留，精确／少一 receipt 为动态一致性控制，不冒充独立全链算术或 RSS 资格。

D 仍 IN_PROGRESS：DELTA／NO_OP 尚未实现并明确拒绝；owned capture/census、真实 Java 临时 owner/raw 绑定、祖先重投影／退休及 Stage 可核验整链 receipt OPEN。当前输入均为声明式读集，端口不能认证 Source/run/owner，也不能授 lease 或发布。E/F 的真实 Stage／Store／磁盘故障和 G 全包门禁仍 OPEN；Stage66/Store43 不记为执行通过。P1-04/05、B1b、Phase1 未完成。无真实 Native、云端 CI、Git 写入、新依赖或数值；原已接受风险保留。

## B1b full manifest / Code identity component checkpoint — 2026-10-26

在原已批准 D..G 内继续实施。未来完整九组 Code 身份（含全库 snapshot census 与 coverage multiplicity）、完整九字段 manifest／准确 parent／transition／origin-current 身份、full raw 到全部原支持／单位／coverage 的桥已实现并局部核验；私有 full 的 v5 解码现在计入共享账本，旧公开结果和原 R1 预算不变。[本次作者评审与精确证据](../../superpowers/reviews/2026-10-26-phase1-b1b-full-manifest-component-review.md)为当前进度依据。

集中37文件1429/1429，后续 Unicode 清单适配修正后相关207/207；分组重叠、不相加，1429不是最后窄修正后的全范围重跑。Providers/Storage/Runtime 构建、IR types、17项目架构检查通过。独立 Source/Fixture／旧收据不改，registry61/Phase1 35/catalog0，剩余 Stage/Store 根尚未注册。新 full 桥只在各自顺序独立通过后，按 Source ID 比较全部字段；Native UTF8、H1 UTF16 与旧 R0/R1 门禁都保持。

D 仍 IN_PROGRESS：固定 Runtime 规则、owned capture/census 连线、原 owner/祖先与整链预算 receipt 未完成；E/F 的真实 Stage/Store／竞争／崩溃／COMMIT 未知恢复和 G 全包门禁 OPEN。当前均为声明式组件，不授 Source/Native/发布资格，Stage66/Store43 未算通过。B1b、P1-04/05、Phase1 不宣称完成；无新依赖／数值、真实 Native、云端 CI 或 Git 写入。原风险与历史失败保留。

## B1b D component checkpoint — 2026-10-26

按已批准原批次继续：diagnostics 的 H1 修正与严格 raw 对照已通过，D 的 full/R1 同 ledger 续接和新／保留 origin-current pair 已实现并局部验证。详见[本次实施与证据检查点](../../superpowers/reviews/2026-10-26-phase1-b1b-d-component-checkpoint-review.md)，其 remaining 为当前状态依据。集中 37 文件 1373/1373；后补 H1 全字段控制 90/90，最终解析表示计费后受影响 pair/mapper 81/81；Providers/Storage/Runtime 构建和 17 项目架构检查通过。证据根与准确运行范围见评审，不合并这些重叠测试数，不称最后全包重跑。

D 仍 IN_PROGRESS：未来完整 Code 身份、manifest/parent/transition、固定 Runtime RulesPort 和 owned receipt 尚待；E/F/G 的真实 Stage、原子 Store、竞争／崩溃／COMMIT 未知恢复及整批门禁 OPEN。当前组件不是 Source/Native 或发布资格证明。P1-04/05、B1b、Phase1 均未完成；原 Stage/Store 声明语料不记为执行通过。无真实 Native、新数值／依赖、云端 CI 或 Git 写入。下方历史 pending/hold 已由先前批准补记替代，原文／失败／风险不删。

## Snapshot diagnostics clarification accepted; original B1b D..G resumed — 2026-10-26

用户已明确批准[兼容澄清](../../superpowers/specs/2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md)并继续原批次，无需重新拆包确认。H1 旧 SQL 比较投影 P 精确包含 id、repositoryId、providerId、providerVersion、runtimeVersion、requestedRevisionId、requestedRevisionFingerprint、startedAt、completedAt、capabilities、outcome；仅 diagnostics 不属于旧表可重建字段。完整 diagnostics 原序保留在不可变 history/origin 和其身份中，不能从旧 SQL 的缺失字段推断原观察为空；origin/registry 完整比较、新 snapshot freshness 和同 ID 异内容拒绝不变。无迁移／IR／wire／Code 身份／数值变更。

H1 永久回归先 RED（79 项中 2 项预期失败），窄修正后连同严格 raw 对照共 81/81 通过，含 INFO/WARNING 完整保留、只读磁盘重开及两时间字段漂移拒绝；Storage build 通过。证据：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/diagnostics-permanent-red._、diagnostics-compatibility-green._、diagnostics-storage-build.*。这只是当前局部证据；D/E/F、完整预算／故障恢复／Store/raw 同诊断核验及 G 全包门禁仍待执行，B1b/P1-04/05 和 Phase1 均未完成。生产资格路由保持关闭，无真实 Native／新依赖／校准／云端 CI／Git 写入。下方旧状态是保留快照，其 pending/hold 结论由本补记替代，旧失败不改为通过。

## B1b approved: local B/C implementation verified; dependent closure held on Snapshot diagnostics — 2026-10-26

User “批准” authorizes the complete A..G local package, including its isolated DB/Node recovery tests; earlier EXECUTION_NOT_AUTHORIZED snapshots below are historical for that package. Current [implementation checkpoint](../../superpowers/reviews/2026-10-26-phase1-b1b-bc-implementation-checkpoint-review.md) records A corpus preparation and B/C local implementations, not full B1b/H2/H3/H4/Phase1 completion. Fixed score0.5/method/policy syntax-surface-support-v1 now has a tested private mapper; Runtime routing/profile catalog remains disabled/empty, not production-ready or measured probability. Existing weakest-support upper bounds and all gates stand.

Fresh applicable36-file local cohort **1337PASS/0fail/cancel/skip/todo**; Providers/Storage/Runtime builds and IR types exit0; architecture17 passes. Independent new data184cases/404files; registry61/exactPhase1 35/catalog0; only B/C roots registered now. Old1837 Fixture bytes and original evidence remain protected. Test groups overlap and are not summed. Full Stage/Store/disk recovery and HS-RUNTIME remain unexecuted.

A preserved local control proves accepted SUCCEEDED+WARNING diagnostics cannot currently survive H1 full SQL-object comparison: control1PASS,warning1RED INVALID_HISTORY. Old SQL does not store diagnostics but the reader invents[]; full raw/manifest contracts preserve them. [Concrete compatibility proposal](../../superpowers/specs/2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md) is PROPOSED/NOT_ACCEPTED/NOT_IMPLEMENTED. D/E/F dependent work is held; no comparison was relaxed. Accepting that clarification would resume already approved D..G without another task-package approval.

No real Native/helper/collector/model/calibration/profile/dependency/cloud CI/push/commit/PR/merge, new agent/session/worktree or user DB/R4 operation occurred. Source/IR/wire/SQL checksums/normalizer Code confidence/public index remain unchanged; package test registration only changes as declared. P1-04/05/Phase1 OPEN,main tasks4/21complete/17open. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss/root-dependency chronology limits remain. Evidence: .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/implementation-checkpoint-verification.json.

## SC-02 numerical contract accepted; B1b precise plan awaiting execution approval — 2026-10-26

User “接受，继续” accepts the [complete numerical contract](../../superpowers/specs/2026-10-26-phase1-syntax-confidence-candidate-design.md) and authorizes B1b task refinement only. Policy is **ACCEPTED_NOT_IMPLEMENTED**, not NOT_SELECTED: one conditional score=0.5; method/policyVersion=syntax-surface-support-v1; mapperVersion=syntax-canonical-mapper-v1; extractorVersion=syntax-v1; codeatlas.syntax-evidence v1; seven fixed reason tokens/conditions/order in that contract §6. This is normative evidential support, not measured probability; no fallback/ranking/new aggregate rule. Existing weakest-support upper bounds and all hard refusals/gates remain. Previous PROPOSED/NOT_ACCEPTED/NOT_SELECTED snapshots below are historical for this exact contract; old audit/crosswalk nulls are preserved historical records, not rewritten as measurements.

The [B1b local closure plan](../../superpowers/plans/2026-10-26-phase1-b1b-local-canonical-history-closure.md) and its author review are PLAN_REVIEW_READY / EXECUTION_NOT_AUTHORIZED. Tasks A..G cover independent corpus, unchanged C3-A identity factoring, fixed Canonical mapping, complete origin/current candidate, actual Stage/lease and atomic Store/recovery. It explicitly proposes new isolated node:sqlite and Node crash-worker tests; no such test, product change or Fixture has run this turn. H2/H3 no longer lack a selected numerical design, but complete implementation/final basis/Stage/Store/runtime gates remain OPEN; no readiness or parent acceptance follows. Full H5/real Native/profile/Source qualification remains separately gated.

6594 predecessor hashes matched at planning start. All18 original document byte sequences are retained as exact suffixes and separate snapshots. No product/Fixture/test/build/DB/Native/helper/model/calibration/profile/dependency/cloud/Git mutation, new agent/session/worktree or full regression occurred. P1-04/05/Phase1 OPEN; main-task count remains4/21 complete,17open. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1 detailed-report loss/root-dependency chronology limits persist. Evidence: .superpowers/design/2026-10-26-phase1-b1b-local-closure-plan/plan-verification.json.

## B1a / SC-01 differential rule-evidence crosswalk verified locally — 2026-10-26

User-approved SC-01-1 has completed its document/audit work as **LOCAL_RULE_EVIDENCE_CROSSWALK_ONLY**;[author implementation review](../../superpowers/reviews/2026-10-26-phase1-syntax-support-confidence-preparation-implementation-review.md) and [crosswalk](../../superpowers/specs/2026-10-26-phase1-syntax-support-confidence-crosswalk.json) record boundaries and concentrated next decisions. Earlier NOT_STARTED/execution-pending notes below are historical for this exact package only. Batch execution rules are accepted for approved scopes;no later batch or policy execution follows automatically.

One document binds6 immutable basis sources,9 rule relations,31 existing declaration IDs,18 historical records and10 OPEN gaps. All scores/thresholds/measurements remain absent/null. Local callable RED32:27PASS5FAIL preceded GREEN32/32,0fail/cancel/skip/todo;26 copied-metadata refusal controls. Final closure reruns only this audit to recheck immutable-design suffix/basis,with actual receipt retained. No new product capability or Phase1 parent is accepted by this metadata result.

1837 Fixture and1155 product files/package/registration remain unchanged;registry57/exactPhase1 31/catalog0. No new Fixture/root entry/build/actual observation/Native/helper/DB/model/calibration/dependency/profile/cloud/Git action or agent/session/worktree. Product suites/architecture not rerun under document-only applicability;old results remain historical,not waived. Original18 document suffixes,all first freezes/failures and old Library/Source qualification persist.

Next is a separately reviewed SC-02 complete-policy evidence/approval decision,not default scores or another automatic preparation package. FullH2/H3 DESIGN_BLOCKED,policy NOT_SELECTED;H4/H5/P1-04/05/Phase1 OPEN,main-task closure remains4/21. C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss limits persist. Final seal: .superpowers/sdd/2026-10-26-phase1-syntax-support-confidence-preparation/implementation-verification.json.

## B1a / SC-01 exact preparation package approved; execution in progress — 2026-10-26

User explicitly approved the batch rules and the complete [B1a/SC-01 package](../../superpowers/plans/2026-10-26-phase1-syntax-support-confidence-preparation.md). Only the differential document,task-local audit,listed local checks and18-document closure are authorized. One atomic dependent task is IN_PROGRESS;no completion result is implied. FutureB1b/c/B2..8,score/method/reason values,product/Fixture/root registration,Native/helper/DB/calibration/dependency/profile/cloud/Git actions remain unapproved.

All6506 predecessor hashes matched at start;18 raw document snapshots,1837 Fixture paths/hashes and1155 product paths/hashes are pinned. Six immutable basis copies preserve the current design even when status notices are added. Expected missing-document RED was observed and retained. FullH2/H3 DESIGN_BLOCKED,policy NOT_SELECTED;H4/H5/P1-04/05/Phase1 OPEN. Old Source/Library qualification and all original evidence/suffixes/EOL remain;C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4mutable/R1report-loss limits persist. Ledger: .superpowers/sdd/2026-10-26-phase1-syntax-support-confidence-preparation/progress.md.

## Syntax support-confidence nonnumeric design accepted; SC-01 concrete package pending — 2026-10-26

User explicitly approved the [written nonnumeric DCP supplement](../../superpowers/specs/2026-10-26-phase1-syntax-support-confidence-design.md). Only its fixed-rule evidential-support meaning, applicability/refusal/evidence boundaries and SC-01 task refinement are accepted. Earlier written-design NOT_ACCEPTED wording below is historical; **numerical policy remains NOT_SELECTED**. This is not a new score, grade ordering, calibrated probability, runtime policy or product implementation.

The existing IR/wire/SQL shapes, Code confidence and Quality Gates remain unchanged. Source/reference defects are hard refusals; legal unknown/resolution states preserve their meaning and receive no default ranking. Fixed application rules cannot come from caller JSON/Plugin/LLM. Original origin confidence/extractionVersion remains immutable; same-ledger budgets and separate real capture/Stage/Store/run authority stand. No FROZEN shape or EVOLVABLE threshold is changed.

The [SC-01 concrete preparation plan](../../superpowers/plans/2026-10-26-phase1-syntax-support-confidence-preparation.md) is REVIEW_READY / EXECUTION_NOT_AUTHORIZED. It adds only a differential rule/evidence/gap document using existing31 mapping rows and18 historical cases; no repeated M-01/M-02/R-01, new Fixture/root test or registration. A minimal task-local audit is proposed because existing validators do not cover that new document; it requires concrete package approval. Scores,complete policy,product/Fixture/scripts/actual collection/Native/DB/profile/calibration/dependency/cloud/Git actions remain unapproved.

Fresh planning baseline matched6465 predecessor hashes. No product/Fixture/test/build or actual measurement ran. Old document bytes remain suffixes;R1 detailed-report loss and all historical failures remain disclosed. FullH2/H3 DESIGN_BLOCKED,H4/H5/P1-04/05/Phase1 OPEN;C1EPERM/C2spent/timeoutUNKNOWN/maincancelunqueried/R4 restrictions persist. Receipt: .superpowers/sdd/2026-10-26-phase1-syntax-support-confidence-preparation/plan-review.json.

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

P1-01 adds separate Runtime/Syntax/Document/Claim/Knowledge schema envelopes and qualified support/basis types defined by the accepted Phase1 detailed specs. Old Common/Code/Evidence/ProviderSnapshot v1 remain strict and unchanged.

Authority: ADR-020 and the user confirmation; architecture acceptance is not implementation evidence.

# Canonical IR Specification

## Contract

Canonical IR is the versioned, provider-independent interchange and persistence contract. Provider-native payloads may retain extra properties but cannot leak into public APIs without normalization. All entities use opaque stable IDs, explicit references, source revision context, evidence, confidence, and resolution.

## Common primitives

The Zod schemas exported by `@codeatlas/ir` are the executable contracts. The
exported TypeScript types are inferred from those schemas and are not separate
wire definitions. The schema-specific Common IR schemas and
`parseSchemaEnvelope` validate JSON-compatible values. `parseIr` is a generic
typed validation adapter whose output follows the supplied schema; JSON safety
comes from using the exported Canonical IR schemas with it, not from arbitrary
caller-supplied schemas.

`EntityId` and `CanonicalId` are distinct TypeScript-branded forms of the same
opaque, non-empty string representation. Whitespace-only values and values with
leading or trailing whitespace are rejected. Accepted IDs retain their string
JSON representation; validation does not trim, rewrite, or infer meaning from
UUID shape, prefixes, provider identity, names, or source text.

`EntityRef` is a strict object with a non-blank, trimmed-string `kind`, a
validated `id`, and an optional validated `revisionId`. An absent revision must
omit `revisionId`; an explicit `undefined` is rejected rather than removed.
Unknown object keys are rejected. The `kind` value remains open in P0-W1-001; later task-specific
schemas may narrow it.

`SourceRange` is a strict object containing `sourceFileId`, `startLine`,
`startColumn`, `endLine`, and `endColumn`. Coordinates are zero-based,
start-inclusive, end-exclusive, non-negative safe integers. Columns are UTF-8
byte offsets within a line. The end position must not precede the start
position when ordered by line and then column; empty and multi-line ranges are
valid.

`ResolutionLevel` is exactly `EXACT | HEURISTIC | AMBIGUOUS | UNRESOLVED |
UNSUPPORTED`. `Confidence` is a strict object with a finite `score` in the
inclusive range `0..1`, a non-blank trimmed `method`, and an array of non-blank
trimmed `reasons`. Confidence and resolution are independent dimensions: one
is never derived from or substituted for the other.

Public timestamps use the exact UTC millisecond form
`YYYY-MM-DDTHH:mm:ss.sssZ`. Offsets, invalid calendar values, and other
precision are rejected rather than normalized. SQLite boundaries use finite,
safe integer epoch milliseconds. Explicit `utcInstantToEpochMilliseconds` and
`epochMillisecondsToUtcInstant` helpers validate both directions; no implicit
date or timezone conversion is performed.

Negative zero (`-0`) is rejected by confidence scores, source coordinates,
epoch milliseconds, and the generic JSON boundary. Positive zero remains valid.
This preserves the validated value across JSON serialization without implicit
normalization, including JSON bytes containing the numeric literal `-0`.

## Source IR

P0-W1-002 exports strict Zod schemas and schema-inferred TypeScript types for
Repository, Revision, SourceFile, and ProviderSnapshot. These contracts accept
already-observed values; they do not discover repositories or files, calculate
fingerprints, run Providers, persist state, or activate a revision.

### Source identity scalars

The following exported scalars are separately TypeScript-branded opaque
strings. Each must be non-empty, non-blank, and free of leading or trailing
whitespace. Parsing preserves the exact string and rejects rather than trims,
normalizes, or interprets it.

- `RepositoryRootPath` is a host-local repository locator. Its syntax is opaque
  in this contract and it is not repository identity.
- `RepositoryRelativePath` is a canonical `/`-separated logical path. It
  rejects a leading or trailing `/`, a drive-absolute prefix, `\`, NUL, empty
  segments, and `.` or `..` segments. It performs no rewriting.
- `ContentFingerprint` is an opaque, precomputed content or revision
  fingerprint. This contract specifies no hash algorithm or encoding.
- `CommitIdentity` is an opaque source-control commit identity. This contract
  assumes no hash algorithm or length.
- `ProviderId` is an opaque Provider identity and is branded separately from
  `EntityId` and `CanonicalId`.
- `ProviderVersion` and `RuntimeVersion` are opaque exact versions. No semantic
  version parsing or coercion occurs.

### Repository

`Repository` is a strict object with `id: EntityId` and
`rootPath: RepositoryRootPath`. The ID is the stable repository identity;
`rootPath` is a relocatable local locator independent from any workspace root.
Moving a repository root does not authorize regenerating its ID. Workspace
membership, display names, and source-control discovery metadata are outside
this contract.

### Revision

`RevisionKind` is exactly `COMMIT | WORKTREE | SNAPSHOT`. `Revision` is a strict
discriminated union. Every variant has `id: EntityId`,
`repositoryId: EntityId`, `kind`, and
`contentFingerprint: ContentFingerprint`. The variant-specific fields are:

- `CommitRevision`: `kind: COMMIT` and `commitIdentity: CommitIdentity`;
- `WorktreeRevision`: `kind: WORKTREE` and
  `baseRevisionId: EntityId | null`;
- `SnapshotRevision`: `kind: SNAPSHOT` and
  `sourceRevisionId: EntityId | null`.

`null` records an unknown base or source revision in the current repository
context. The nullable fields are required: explicit `undefined` is invalid, and
a field belonging to another variant is an unknown key and is rejected.

`validateRevisionTransition(previous, next)` parses both inputs and validates
an update of one revision identity. Repository ID, revision ID, and kind must
remain equal. A `WORKTREE` may change `contentFingerprint` and
`baseRevisionId` under that stable identity. A `COMMIT` or `SNAPSHOT` permits an
idempotent observation only: its fingerprint and `commitIdentity` or
`sourceRevisionId` cannot change. A different repository, ID, or kind denotes a
different revision identity rather than a valid transition. This validator is
pure and performs no persistence or concurrency control.

### SourceFile

`SourceFile` is a strict, revision-scoped object with `id: EntityId`,
`repositoryId: EntityId`, `revisionId: EntityId`,
`path: RepositoryRelativePath`,
`contentFingerprint: ContentFingerprint`, `classification`,
`languageHint: LanguageHint | null`, and `sensitivity: SourceSensitivity`.
The ID represents stable logical-path identity within one repository. The same
logical SourceFile ID may appear at different revisions while `revisionId` and
the path-scoped fingerprint change.

`SourceFileClassification` is a strict object whose dimensions are
orthogonal:

- `role: SOURCE | TEST | OTHER`;
- `provenance: AUTHORED | GENERATED | VENDOR`;
- `contentKind: TEXT | BINARY`.

`LanguageHint` is an open exact, non-blank string rather than a Provider enum;
`null` means no hint is declared. `SourceSensitivity` is exactly
`PUBLIC | INTERNAL | SENSITIVE | SECRET` and follows the Security
specification. P0-W1-002 validates declared values only. It does not scan or
classify files, infer language, or access their contents. Rename identity is
not inferred; Phase 0.5 represents rename as delete plus add.

### ProviderSnapshot

`ProviderSnapshot` is a strict record of one Provider observation attempt. It
contains:

- `id: EntityId`, `repositoryId: EntityId`, `providerId: ProviderId`,
  `providerVersion: ProviderVersion`, and `runtimeVersion: RuntimeVersion`;
- `requestedRevisionId: EntityId` and
  `requestedRevisionFingerprint: ContentFingerprint`;
- `startedAt: UtcInstant` and `completedAt: UtcInstant`;
- `capabilities: ProviderCapabilityObservation[]`;
- `diagnostics: ProviderSnapshotDiagnostic[]`;
- `outcome: SUCCEEDED | PARTIAL | FAILED | CANCELLED`.

Completion cannot precede start; both fields retain the Common IR exact UTC
millisecond representation. Capability names are open exact, non-blank strings
and must be unique within one snapshot. Each capability observation is a strict
object with `name`, `support: SUPPORTED | UNSUPPORTED`, and
`coverage: COMPLETE | PARTIAL | NONE | UNKNOWN`.

Each diagnostic is a strict object with an exact, non-blank `code`,
`severity: INFO | WARNING | ERROR`, an exact, non-blank `message` of at most 128
characters, and `sourceRange: SourceRange | null`. This bounded shape has no
field for Provider-native objects, source text, stack traces, or unrestricted
prose; producers must not place secrets in diagnostic strings. Diagnostic array
order is preserved, and the schema does not derive `outcome` from severity.

`validateProviderSnapshotRevision(snapshot, revision)` parses both inputs and
requires equal repository ID, requested revision ID, and requested revision
fingerprint. The fingerprint check prevents an observation for an earlier
state of a stable `WORKTREE` identity from matching a newer state. The helper
returns the validated snapshot or raises `IR_VALIDATION_FAILED` with a
structured mismatch path. It does not activate Canonical State, apply facts,
or write storage.

### Source IR boundaries

ProviderSnapshot is observation metadata, not proof of canonical truth or an
activation decision. Provider-native data must still be normalized before it
can enter provider-independent Canonical IR. Evidence remains separate from
claims, candidates, and published Knowledge, and LLM output remains
candidate-only. P0-W1-002 introduces no SQLite schema or write path; SQLite
remains the authority when later storage tasks persist canonical state, while
search and vector indexes remain derived and rebuildable.

Workspace and RevisionSet remain outside the P0-W1-002 executable contract, as
do repository/file discovery, fingerprint calculation, Provider execution,
FactMerger behavior, persistence, graph activation, native IPC, and later-phase
Knowledge or Runtime behavior.

## Code IR

P0-W1-003 defines strict, JSON-safe Provider Fact and Canonical Code Fact
contracts. They validate already-observed fact values only; they do not
normalize, merge, persist, activate, or otherwise publish facts. Provider and
Canonical facts are deliberately separate shapes: a Provider fact never
substitutes for a Canonical fact, and no public fact carries an arbitrary
attributes or Provider-payload bag.

### Code Fact identity and references

The following exported schemas and schema-inferred types are separately
branded, exact, non-empty, non-blank strings without surrounding whitespace:
`ProviderFactIdSchema` / `ProviderFactId`, `NodeFactKeySchema` / `NodeFactKey`,
`EdgeFactKeySchema` / `EdgeFactKey`, `CodeFactNameSchema` / `CodeFactName`,
`QualifiedCodeFactNameSchema` / `QualifiedCodeFactName`,
`ProviderFactKindSchema` / `ProviderFactKind`, and
`UnresolvedTargetHintSchema` / `UnresolvedTargetHint`. Parsing preserves each
accepted string exactly: it does not trim, normalize, interpret a prefix,
derive identity, or compute a FactKey.

`ProviderFactId`, `NodeFactKey`, `EdgeFactKey`, `EntityId`, `CanonicalId`, and
`ProviderId` are non-interchangeable identity families. `FactTypeSchema` /
`FactType` is exactly `NODE | EDGE`. `ProviderFactRefSchema` /
`ProviderFactRef` contains `factType`, `providerId: ProviderId`, and
`providerFactId: ProviderFactId`; `CanonicalFactRefSchema` /
`CanonicalFactRef` contains `factType` and `id: CanonicalId`.
`ProviderNodeRefSchema` / `ProviderNodeRef` and `CanonicalNodeRefSchema` /
`CanonicalNodeRef` narrow `factType` to `NODE`. Edge sources, resolved targets,
and target candidates use only the corresponding Node reference; an edge
reference cannot be a graph endpoint.

`providerSnapshotId: EntityId` is observation provenance on a Provider fact.
It is not part of Provider Fact identity or `ProviderFactRef`. References do
not assert that a referenced fact exists, belongs to a repository or revision,
or is graph-consistent; those checks require graph or storage context.

### Target resolution

`ProviderTargetSchema` / `ProviderTarget` and `CanonicalTargetSchema` /
`CanonicalTarget` are parallel strict discriminated unions with their respective
Node references. A resolved target is exactly
`{ state: 'RESOLVED', resolution: 'EXACT' | 'HEURISTIC', target }`; it carries
no hint or candidates. A non-resolved target is exactly
`{ state: 'UNRESOLVED', resolution: 'AMBIGUOUS' | 'UNRESOLVED' |
'UNSUPPORTED', originalHint, candidates }`.

`AMBIGUOUS` requires at least two unique candidates, `UNRESOLVED` permits zero
or more unique candidates, and `UNSUPPORTED` requires exactly zero candidates.
Provider candidates are unique by `(providerId, providerFactId)`; Canonical
candidates are unique by `CanonicalId`. Candidate array order is preserved.
Validation neither sorts nor deduplicates candidates, infers a resolution from
candidate count, nor auto-selects or promotes a candidate. No normalizer may
invent a target to satisfy a non-null constraint.

### Provider facts

`ProviderNodeSchema` / `ProviderNode` is a strict record containing
`providerId`, `providerFactId`, `providerSnapshotId`, `repositoryId`,
`revisionId`, `providerKind`, `name`, `qualifiedName`, `sourceRange`, and
`confidence`. `ProviderEdgeSchema` / `ProviderEdge` is a strict record
containing `providerId`, `providerFactId`, `providerSnapshotId`, `repositoryId`,
`revisionId`, `providerKind`, `source`, `target`, `sourceRange`, and
`confidence`. `qualifiedName` and `sourceRange` are required nullable fields:
they must contain a valid value or `null`, and explicit `undefined` is rejected.

Provider facts retain opaque Provider-native `providerKind` but contain no
`CanonicalId`, `NodeFactKey`, or `EdgeFactKey`. For a `ProviderEdge`, its
source, resolved target, and every non-resolved candidate must have the same
`providerId` as the edge. A mismatch is rejected at the nested reference's
`providerId` path; validation performs no Provider lookup or Provider-ID-format
interpretation.

### Canonical facts

`CodeNodeKindSchema` / `CodeNodeKind` is exactly `REPOSITORY | MODULE | PACKAGE
| TYPE | SYMBOL`. Every Canonical node has `id: CanonicalId`,
`factKey: NodeFactKey`, `repositoryId`, `revisionId`, `name`, `qualifiedName`,
`sourceRange`, and required `confidence`. `CanonicalNodeSchema` /
`CanonicalNode` is a strict discriminated union: `REPOSITORY`, `MODULE`, and
`PACKAGE` have no subkind; `TYPE` requires `typeKind` and rejects `symbolKind`;
and `SYMBOL` requires `symbolKind` and rejects `typeKind`.

Canonical-node `qualifiedName` and the Canonical node and edge `sourceRange`
fields are required nullable fields: each must contain a valid value or `null`,
and explicit `undefined` is rejected.

`CodeTypeKindSchema` / `CodeTypeKind` is exactly `CLASS | INTERFACE | ENUM |
RECORD | ANNOTATION | TRAIT | STRUCT | UNION | OTHER`.
`CodeSymbolKindSchema` / `CodeSymbolKind` is exactly `METHOD | CONSTRUCTOR |
FUNCTION | FIELD | PROPERTY | VARIABLE | PARAMETER | CONSTANT | OTHER`.
Unknown, cross-kind, missing, and forbidden subkind fields are invalid. These
are language-neutral Canonical categories; Provider-specific kinds remain on
Provider facts until normalization.

`CodeEdgeKindSchema` / `CodeEdgeKind` is exactly `IMPORT | REFERENCE | CALL |
INHERITANCE | OVERRIDE`. `CanonicalEdgeSchema` / `CanonicalEdge` is a strict
record containing `id: CanonicalId`, `factKey: EdgeFactKey`, `repositoryId`,
`revisionId`, `kind`, `source: CanonicalNodeRef`, `target: CanonicalTarget`,
`sourceRange`, and required `confidence`. Canonical facts contain no
`ProviderId`, `ProviderFactId`, `providerSnapshotId`, or Provider-native kind.
FactKey uniqueness and target existence are graph-level responsibilities, not
single-object parsing rules.

Every Provider and Canonical fact requires Common IR `Confidence`; this task
validates only the supplied value. Resolution belongs solely to an edge target,
and nodes carry no artificial resolution.

### Validation, errors, and phase boundary

All public Code Fact objects are strict and JSON-safe. Unknown fields, invalid
brands or enums, target cardinality or uniqueness failures, and cross-field
Provider-edge failures use `IR_VALIDATION_FAILED`; envelope schema disagreement
uses `SCHEMA_MISMATCH`; and envelope version disagreement uses
`UNSUPPORTED_SCHEMA_VERSION`. Structured paths identify the relevant field;
messages are controlled and at most 128 characters, do not copy rejected values
or source text, and failed parsing returns no partial fact or mutated state.

This task explicitly excludes FactKey computation, hashing, canonicalization,
normalization, graph-wide uniqueness, referential integrity, Evidence,
`FactEvidence`, `ProviderFactBinding`, merge or aggregation, storage,
activation, SQLite, migrations, Native IPC, parsing, scanning, Provider or
plugin execution, graph queries, `ExecutionGraph`, `RuntimeFlow`,
`BusinessFlow`, Knowledge, LLM, embedding, network, watcher, and daemon
behavior. Evidence belongs to P0-W1-004. P05-W4-001 performs normalization and
FactKey generation; P05-W4-002 performs merge and Confidence aggregation.

### Phase 0.5 Java normalization profile

P05-W4-001 adds a pure `@codeatlas/providers` normalizer for complete v1/v2
Native `ANALYZE` results with `ANALYSIS_COMPLETED` outcome `SUCCEEDED` or
`PARTIAL`. A partial observation can yield Canonical candidate facts but does
not authorize graph publication. The accepted
[`P05-W4-001 design`](../../superpowers/specs/2026-09-28-p05-w4-001-canonical-normalization-design.md)
defines the exact version-1 identity tuples and SHA-256 encoding; the registered
`canonical-normalization` Fixture pins their resulting opaque keys and IDs.
Unpaired UTF-16 surrogates in identity fields are rejected before UTF-8
encoding to prevent replacement-character identity collisions; valid tuple
vectors and the Canonical IR schema are unchanged.

`java.package` and synthetic `java.package_container` map to one `PACKAGE`
identity by qualified name while retaining separate Provider support and
nullable display ranges. `java.compilation_unit` maps to a file-scoped `MODULE`,
not a language/build module. Java class/interface map to `TYPE`; method,
constructor, and field map to `SYMBOL`. Imports, calls, inheritance, and
references map to their existing Canonical edge kinds. Resolution state,
original hints, ordered unique Canonical candidates, confidence, and callsite
are preserved. Unknown kinds, detached source locations, missing references,
and contradictory ambiguity fail as controlled all-or-nothing normalization
errors; no inferred target is added.

Current ProviderNode v1 has no signature field, so source name position
distinguishes same-qualified-name overloads. Pure line movement may therefore
change a FactKey. This limitation is not a claim of cross-revision semantic
identity; changing it requires reviewed compatibility, Fixture, and migration
analysis. No Code IR schema, ProviderSnapshot, Native IPC, Evidence, or SQLite
contract is changed by P05-W4-001.

## Evidence IR

P0-W1-004 defines provider-origin Evidence v1 as a pure, JSON-safe wire
contract. The exported schema/type pairs are `EvidenceIdSchema` / `EvidenceId`,
`EvidenceStatusSchema` / `EvidenceStatus`, `EvidenceSchema` / `Evidence`,
`FactEvidenceSchema` / `FactEvidence`, and `ProviderFactBindingSchema` /
`ProviderFactBinding`. Types are inferred from the schemas. Evidence is an
independently identified observation, separate from a Claim, KnowledgeCandidate,
or published KnowledgeRevision. Only Provider Fact Evidence is accepted in v1;
source, document, and human Evidence variants require an explicit compatible
contract or a new schema version.

### Evidence identity, status, and records

`EvidenceId` is a separately branded opaque string, non-empty, non-blank, and
without surrounding whitespace. It is not interchangeable with `EntityId`,
`CanonicalId`, or `ProviderFactId`. Parsing preserves its exact value and never
trims, derives, or interprets identity from Provider identity or source content.

`EvidenceStatus` is exactly `ACTIVE | SUPERSEDED | INVALIDATED`. `ACTIVE`
means the observation is available as support. `SUPERSEDED` means a later
observation replaced it without asserting that the older observation was false.
`INVALIDATED` means it must not be treated as reliable support. Both non-active
states retain provenance; neither state deletes a record or determines a
Canonical Fact's existence or Confidence.

The strict records contain exactly these required fields:

```ts
interface Evidence {
  id: EvidenceId;
  repositoryId: EntityId;
  revisionId: EntityId;
  providerSnapshotId: EntityId;
  providerFact: ProviderFactRef;
  status: EvidenceStatus;
}

interface FactEvidence {
  fact: CanonicalFactRef;
  evidenceId: EvidenceId;
}

interface ProviderFactBinding {
  providerFact: ProviderFactRef;
  providerSnapshotId: EntityId;
  canonicalFact: CanonicalFactRef;
  evidenceId: EvidenceId;
}
```

Unknown keys, missing fields, explicit `undefined`, and `null` are invalid.
The existing strict `ProviderFactRef` and `CanonicalFactRef` contracts preserve
their distinct identity families and accept both `NODE` and `EDGE` references.
`ProviderFactBinding.providerFact.factType` must equal
`canonicalFact.factType`; a mismatch is rejected at
`['canonicalFact', 'factType']`.

`FactEvidence` and `ProviderFactBinding` remain separate relations.
`FactEvidence` connects a Canonical Fact to an Evidence ID without introducing
Provider identity into the Canonical Fact. `ProviderFactBinding` records the
Provider-to-Canonical mapping together with its Evidence ID and observation
snapshot. Two Providers may support one Canonical Fact through distinct
Evidence records and separate relation rows. One support may be non-active
while another remains `ACTIVE`; neither relation embeds a support array in the
Canonical Fact or selects a Provider as canonical authority.

Evidence does not duplicate Provider Fact Confidence or SourceRange, or
ProviderSnapshot timestamps. It has no raw Provider payload, source text,
diagnostic prose, arbitrary metadata, or generic `EntityRef` source escape hatch.

### Pure lifecycle transition

`validateEvidenceTransition(previous: unknown, next: unknown): Evidence`
parses both inputs and returns the validated next Evidence or throws
`IrValidationError`. It performs no I/O, mutation, clock read, or persistence.
After both records parse, `id`, `repositoryId`, `revisionId`,
`providerSnapshotId`, and the exact `providerFact` tuple
`(factType, providerId, providerFactId)` must remain equal, in that check order.
Identity and source checks precede status checks. Transition violations have
paths rooted at `['next', ...]`; malformed input records retain their schema
validation paths.

| Previous status | Allowed next statuses |
|---|---|
| `ACTIVE` | `ACTIVE`, `SUPERSEDED`, `INVALIDATED` |
| `SUPERSEDED` | `SUPERSEDED` |
| `INVALIDATED` | `INVALIDATED` |

Same-status transitions are idempotent only when identity and provenance are
unchanged. Both non-active statuses are terminal: reactivation and transitions
between terminal statuses are rejected. A new observation uses a new Evidence
ID rather than recycling a terminal record. Validation of the declared
transition does not prove that replacement Evidence exists or a ProviderSnapshot
succeeded, and failure returns no partially accepted Evidence.

### Validation, versioning, and later responsibilities

The schemas preserve exact JSON values without coercion, unknown-key stripping,
status promotion, or relationship repair. Through `parseIr` and the transition
helper, invalid IDs, enums, record fields, fact-type mismatches, and illegal
transitions raise `IR_VALIDATION_FAILED` with structured paths and controlled
messages of at most 128 characters that do not echo rejected values. Direct Zod
schema composition retains Zod's own error interface, as specified under
Compatibility.

The three record payloads use the Common IR exact-version envelope contract.
Version-1 Fixture descriptors exercise both `parseSchemaEnvelope` and
`createSchemaEnvelopeSchema`, including JSON round-trips, structured-payload
rejection, and schema-before-version-before-payload precedence.
`SCHEMA_MISMATCH` and `UNSUPPORTED_SCHEMA_VERSION` retain their existing
meaning. These descriptors are test-local; this task introduces no production
schema registry, IPC schema name, or version adapter.

Relation-row uniqueness, referenced-record existence, consistency between
Evidence and binding source tuples, and repository/revision/snapshot integrity
across records require later application/storage context. P0-W1-006 owns
repository Evidence persistence under the SQLite Schema specification; SQLite
remains the authoritative store when implemented, and P0-W1-004 implements no
tables, migrations, transactions, or writes. P05-W4-002 owns support
recomputation, FactMerger behavior, Confidence aggregation, and support-based
Canonical Fact lifetime. This task neither derives IDs nor creates, normalizes,
merges, activates, or publishes facts or Knowledge.

The `p0-evidence-ir-v1` Fixture and its runtime and brand tests are mapped in
`DESIGN_TRACEABILITY.md`. Its acceptance is
`One canonical fact retains independent supports`. This proves representation
and independent lifecycle, not the later storage or FactMerger lifetime decision.

## Runtime IR

`EntryPoint` represents HTTP, RPC, message, schedule, task, data-change, batch, CLI, and manual triggers. `TaskDefinition`, `DataResource`, `DataChangeTrigger`, `Contract`, and `ExecutionContext` are explicit entities.

`ExecutionGraph` contains detailed runtime nodes and transitions. Transition kinds include `CALL`, `HTTP`, `RPC`, `PUBLISH`, `CONSUME`, `CREATE_TASK`, `EXECUTE_TASK`, `DATA_CHANGE`, `BRANCH`, `JOIN`, `RETRY`, `FAILURE`, and `COMPENSATION`. Context kinds include `REQUEST`, `EVENT`, `JOB`, `TASK`, and `BATCH`.

`RuntimeFlow` is a deterministic projection with ordered steps, branches, boundaries, and support references. `BusinessFlow` is knowledge and is never stored as an execution fact.

## Document and claim IR

Document IR includes Document, DocumentRevision, Section, Block, Table, Link, CodeSnippet, EntityMention, and retrievable Chunk. Structural blocks remain authoritative; chunks are derived retrieval units.

Claims carry subject, predicate, value/object, scope, evidence, confidence, authority, and claim kind `OBSERVED | DECLARED | INFERRED | CURATED`. State intent is `CURRENT | TARGET | HISTORICAL | TRANSITION | DESIRED`.

## Knowledge IR

KnowledgeItem has a stable opaque ID, type, scope, importance, lifecycle state, source freshness, compilation currency, and revision list. Phase 1 types are Component, Capability, RuntimeFlow reference, BusinessFlow, and Integration. Phase 2 adds ArchitectureRule, Decision, and Migration.

Each KnowledgeRevision stores structured content, semantic and presentation fingerprints, support references, compilation provenance, evaluation result, and publication state. Human and agent projections are generated from the same revision.

## Compatibility

P05-W4-002 leaves the Canonical and Evidence schemas unchanged. The Provider
package derives an opaque `provider-evidence-v1` ID from repository, revision,
snapshot, fact type, Provider ID, and Provider Fact ID using the existing
length-delimited UTF-8 identity recipe. Canonical FactKey is excluded from
that Evidence identity; FactEvidence and ProviderFactBinding relate each
observation to its Canonical fact. The pure merger emits only `ACTIVE`
current-view Evidence and does not mutate persisted history or infer
unresolved targets.

Every payload is carried in a strict envelope containing only a non-empty schema
name, a positive safe-integer version, and a JSON-compatible payload validated
by a caller-supplied Zod schema. A reader declares one exact schema name and
version. Envelope parsing is ordered and deterministic: validate the outer
shape, compare the schema name, compare the version, then validate the payload.
This means malformed shape wins over schema/version checks, schema mismatch wins
over version checks, and version mismatch wins over payload validation.

The JSON boundary rejects circular references with the path of the circular
edge; shared acyclic children are allowed. JSON safety is checked before and
after the supplied payload schema in both `createSchemaEnvelopeSchema` and
`parseSchemaEnvelope`. Payload schemas must preserve the input's JSON value:
changes in type, value, or object fields are rejected, including stripping or
in-place mutation. A new object with the same fields and values is allowed;
object key order is immaterial. No payload transform runs before the helper's
schema-name and version checks pass.

The public typed failures are `IR_VALIDATION_FAILED` for primitive, envelope,
or payload violations, `SCHEMA_MISMATCH` for an unexpected schema name, and
`UNSUPPORTED_SCHEMA_VERSION` for an unsupported version. Validation failures
retain structured field paths and controlled messages of at most 128 characters
per issue. Typed parsing helpers select fixed messages by issue category rather
than copying arbitrary Zod or custom-refinement prose, including rejected key
names or values. They do not retain raw rejected payloads. Direct Zod schemas
remain available for composition; this typed-error policy does not replace
Zod's own error interface.

P0-W1-001 supports exact version matching only. It adds no implicit adapter,
downgrade, upgrade, provider-extension coercion, or best-effort normalization.
Unknown enum values and unknown strict-object keys are rejected at the public
boundary. Breaking changes require an ADR, migration path, fixture updates, and
a major schema version.

## P1-01 first-publication support-basis clarification

The first-batch Fixture demonstrates that workspace ContractMatch/Execution facts cannot truthfully use RepoBasis or DocumentBasis. Complete the as-yet-unpublished Phase1 SupportRef union with WorkspaceBasis { workspaceId, revisionSetId, workspaceActivationDigest }; its entity revision must equal revisionSetId and its qualified reference must belong to that workspace. This is a compatible implementation clarification under ADR-020, not a change to old Code/Evidence/Snapshot v1, a new truth store, a new phase capability or an approved numeric gate. The independent workspace-provenance test fails before this addition; negative cross-workspace support remains required. Frozen RevisionSet and actual storage authentication stay Application/Storage duties.


## P1-00..02 implemented contract record — 2026-10-22

New version-1 schema names, support basis, reference validation and boundaries are recorded in [first-batch contracts](../../superpowers/specs/2026-10-22-phase1-first-batch-contracts.md), under accepted ADR-020. Only the three declared contract Fixtures are in scope; later product/model/E2E acceptance remains open.


## Accepted mixed Native owner binding — 2026-10-22

User approves ADR-020 mixed amendment and continued implementation. [Exact unpublished v4 owner binding](../../superpowers/specs/2026-10-22-phase1-syntax-owner-binding.md) separates expected active basis, Source target, provisional owner stage and later final candidate. Preserve strict IPC1..3/R010/last-good and all actual/profile/atomic-Apply gates. Acceptance of the design is not evidence those workflows passed.


## C3-A proposed identity/capture detail — 2026-10-23

[C3 DCP](../../superpowers/specs/2026-10-23-phase1-code-context-capture-dcp.md) is pending written review,not accepted authority or implementation. It proposes read-only real SQLite Code/support/coverage/Source capture and private connection identity;coverage remains mandatory under the existing shared contract. A creates noSQL or migration and does not authenticate historical Source. FutureB must separately design R011 activation-bound historicalmanifest/Stage/atomicApply and normalizer/outcome contracts;C separately designs actual child/accounting. Published schemas/IR/IPC and gates unchanged. No new product test/Fixture/Native/helper/profile/cloud evidence this turn. C1symlinkgate and P1-04/05/phase exits remainOPEN.


## Accepted C3-A capture contract;implementation plan review — 2026-10-23

User accepts [C3-A written detail](../../superpowers/specs/2026-10-23-phase1-code-context-capture-dcp.md):SQLite-owned boundedCode/support/mandatorycoverage/Source identities,private connection-bound handle,recheck/release and explicit unavailable history. [Concrete plan](../../superpowers/plans/2026-10-23-phase1-code-context-capture.md) is pending review;no implementation,Fixture registration or tests. Domain-separated Code identity includes allCanonical content,allACTIVEsupports/R009candidates,conservative same-indexed-revision snapshot/coverage set and actual committed-count/indexed fields;coverage multiplicities retained,physicalrowid/root/observationtime excluded from Code semantics. Rootlocator/Source identities are separate.

Current R010/UTF-8 only capture contract;no R001..R010 SQL/checksum change,no new schema/IR/wire/profile/default/threshold. No history/removal,stage/atomicStore or realNative grant. B/C/normalizer/outcome/R011/accounting require their own contracts. A implementation still awaits plan review. C1symlinkgate and all P1-04/05/phase gates remainOPEN;oldC2slots spent,no new run or cloud authority.


## C3-A implemented contract checkpoint — 2026-10-23

C3-A concrete plan is explicitly confirmed and implemented inline in the original C worktree. Storage adds bounded real R010/UTF-8 Code/support/candidate/coverage/Source capture,private connection/incarnation-bound handles,recheck and release. Fixture p1-code-context-capture-v1 retains its seven-file before-product freeze;actual SQL row/TEXT deliveries match independent read plans. No production Runtime/Apply route,history/removal proof,stage lease,Source policy,normalizer,outcome,migration,dependency,profile/default or numeric Quality Gate changes. B/C,actual Native/accounting,root/integration/CI and all P1-04/05/Phase1 exits remain OPEN. C1 real-file-symlink EPERM stays TODO/OPEN;four old C2 acquisition slots remain spent and timeout root cause UNKNOWN. No Native/acquisition-helper/cloud/Git-stage/commit/worktree-or-legacy-evidence cleanup operation. Fresh verification is recorded in the linked implementation review and final receipt;historical measurements are not transferred.

[Implementation review](../../superpowers/reviews/2026-10-23-phase1-code-context-capture-implementation-review.md);receipt:.superpowers/sdd/2026-10-23-phase1-code-context-capture/implementation-verification.json. Read controls are logical UTF-8 retention accounting,not V8/SQLite RSS or a production reservation. SQLite window counts preserve every raw coverage row charge and exact multiset identity;physical coverage id is schema-checked but excluded from semantic hashes. A private never-executed statement detects same-object close/open without SQL delivery or new persistent state.


Final local32-file regression:422PASS/0FAIL/1explicitTODO (423 total;new capture suite100PASS);Storage TypeScript build and architecture17 pass;Fixture registry46/exact20Phase1,Syntax catalog0. The TODO is the existing C1 real-file-symlink EPERM gate,not an A failure or a waived Phase gate. Evidence:.superpowers/sdd/2026-10-23-phase1-code-context-capture/A4-final-schema-matching-regression.log;implementation-verification.json.


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

## SyntaxEvidence v2绑定契约（2026-10-30）

用户批准并交付[B-F1-A集中包](../../superpowers/plans/2026-10-29-phase1-binding-contract.md#实施结果与作者审查2026-10-30)。新envelope version2携带独立lexicalScope；ASSIGNMENT增加assignmentForm/valueRange；DECLARATION增加declarationForm/declaredName。parseSyntaxEvidenceV2校验原共同约束、scope的当前Code节点/同文件及右值range包含。旧v1形状、拒绝行为与身份不改，不生成新confidence/ID/extractor版本；值仍是显式输入。右值精确关系不等于实际AST或框架绑定证明。

没有producer/normalizer/history支持的自动升级；v2不得传入当前v1历史激活。旧origin和SQL不修改。


## A/B本地闭环合同已批准 — 2026-11-02

用户明确批准[精确合同](../../superpowers/specs/2026-11-02-phase1-ab-local-closure-contract.md)及U0–U7整包，状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION；wire8/Syntax4/context5、最小语言表面证据、框架覆盖/site-plan、V2候选摘要/activation JSON及同lease联合提交按该合同执行。旧入口/历史/门禁不改，新增用途沿原规范0.5不代表概率校准。仅计划列明的本地库级运行/owned SQLite及范围内修复复验；生产CLI、profile、用户DB、云端CI/Git写入仍未授权。实施结果尚未验收，父项4/21、17OPEN不变。


## 显式HTTP声明证据当前边界 — 2026-11-03

[已批准合同](../../superpowers/specs/2026-11-03-phase1-declared-http-schema-design.md)及[实施检查点](../../superpowers/plans/2026-11-03-phase1-declared-http-schema-crossrepo.md)：FrozenContractSetV2在workspace层保存与实际SourceFile/support/fingerprint相同的有限声明正文；不改repo Contract或将null变absence、不新增Canonical Schema实体。新input/candidate/activation摘要域及SQL1/严格JSON2归档已实施，旧入口严格拒绝新版。Source不虚构confidence，原contract-support-bound-v1保持。当前两consumer MATCHED但接口无执行点使原stitch仍PARTIAL；执行适用性澄清未获准，不静默改覆盖或签收整包。


## 已批准适用性与本地退出 — 2026-11-03

[获准澄清](../../superpowers/specs/2026-11-03-phase1-contract-execution-applicability-clarification.md)仅V3使用完整current site-plan证明合同无调用site时不造执行边，已有site缺boundary仍PARTIAL，旧V1/V2/null未知保持。实际Source声明两MATCHED/一HTTP边、owned发布/非空归档重开/Source CAS与last-good均通过；root/兼容8入口120/120。 [准确种类、命令、Fixture及作者评审](../../superpowers/plans/2026-11-03-phase1-declared-http-schema-crossrepo.md)明确仅本地退出，无新的Native/生产/完整Phase1/Evaluation签收或分母/数值/迁移变更。
