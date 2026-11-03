## A-local独立评审与修复完成；本地组件退出 — 2026-10-29

同一次只读独立整包评审发现4项原契约实现缺陷：manifest/Code闭包、Unicode DELTA、失败预算续接、H1查询前行准入。原范围统一修复7源码/3测试，旧公开接口与成功成本/Fixture预期保持。IR1/3/4原4项RED及IR2私有Provider另行RED均转绿，最终12项新旧边界定向通过（10新控制含在Stage root）；修复无第二次独立评审，以作者TDD及完整适用本地批次验证。

新鲜构建/IR类型exit0；Code75/75、Syntax59/59、Stage333/333、Store288/288、原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17及范围格式通过，重叠不累计。四root仍去重55文件，registry61/Phase1 35/四ID各一次/catalog0；2369个Fixture/参考字节、依赖/迁移/注册不变。

[独立发现、修复证据及有界验收](../reviews/2026-10-29-phase1-independent-review-fixes.md)逐条链接109原显式绑定的最新PASS selector及共享资源/兼容门禁；U0～U5与原A..G在声明式Node/SQLite组件范围完成。原整体Fixture历史map/generic base不改写、不无条件签收；主任务仍4/21接受、17未关闭，P1-04/05/Phase1未完成。

真实Source重验证/资源取消、Native/profile/H5和后续B～E需具体方案及相应授权；无Native/云端CI/Git写入或第二代理。timeout仍UNKNOWN，main取消结算/R4/C2不变。全部旧文档后缀、原稿、失败及封存保留；下方pending是历史快照，不推翻本次有限结论。

## A-local统一本地门禁已通过，独立整包评审待完成 — 2026-10-27

已批准U1实际partial raw DELTA、U2 retained/删除/NO_OP及U3完整故障/只读恢复资源已顺序核验；U4仅追加两个缺失root，四root去重覆盖55文件。完整Source/原支持/opaque unit、immutable origin/current、同账本五维边界、TEMP/seal/lease、22表和恢复身份保持原契约。本轮无新产品/依赖/数值/迁移或Native资格。

新鲜本地证据：Providers→Storage→Runtime构建及IR类型exit0；四root分别75/75、59/59、323/323、288/288，原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17项目通过。重叠收据不相加，不代表全仓verify或Native门禁。补记前2347旧Fixture、374产品src/dist及109原绑定不变；registry61/Phase1 35/四ID各一次/catalog0保持，八个旧注册守卫无需改动。

[准确范围、首轮失败与作者评审](../reviews/2026-10-27-phase1-unified-local-resource-review.md)。U5独立整包评审/最终退出仍待，作者检查不代替独立评审；原Fixture整体签收0、主任务4/21接受/17未关闭，P1-04/05/Phase1未完成。原批准内不逐小步骤确认；新增代理需遵守此前单独确认边界。无Native、云端CI或Git写入，timeout仍UNKNOWN，R4/C2/main取消未结算状态不改。下方原文为保留历史与契约，不据旧pending快照推翻本次有限范围证据。

# Phase1 A-local 剩余工作统一执行包

> **For agentic workers:** 使用 superpowers:executing-plans、TDD、systematic-debugging、verification-before-completion 和 Ponytail full；本会话顺序执行。步骤使用复选框，不新增会话/工作树/代理，不执行Git写入或清理证据。

**Goal:** 将当前A-local已批准剩余DELTA/retained、失败恢复、G注册/集中验证/评审封存合为连续执行包，不再按每个资源模型或检查点等待“继续”。

**Architecture:** 既有provider-independent Canonical IR、SQLite authoritative、LLM candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow均不变。以原同库H1→owned Stage→Runtime/Provider纯规则→一次freeze/lease→锁内Store→fresh readonly outcome为唯一链路，所有阶段使用同一累计预算。

**Tech Stack:** 现有TypeScript/Node24 node:sqlite、标准库crypto/zlib和已安装工具；无新依赖、迁移、profile或数值政策。

**Spec:** [原B1b批准包](2026-10-26-phase1-b1b-local-canonical-history-closure.md)、[统一五批次](2026-10-27-phase1-consolidated-execution.md)、[Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md)、[前置校验附约](../specs/2026-10-27-phase1-stage-early-validation-proposal.md)、[清理行预留](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)、[当前准确parent FULL证据](../reviews/2026-10-27-phase1-active-full-resource-review.md)。本文件只归并已批准工作，不引入新产品设计。

## 授权与边界

Status: EXECUTION_AUTHORIZED_WITHIN_EXISTING_A_LOCAL。原A..G、其后契约澄清与本次“一并执行”已足以授权下列原范围本地工作，不再请求第二次同义确认。六个执行单元是调度单元，不是新增Phase主任务；主任务仍4/21接受、17未关闭，原109绑定不是整体Fixture签收。

已通过的初始FULL Java/Python/mixed、准确parent非空Python FULL、H1/Code读取、Java owner、清理及已执行故障/崩溃收据先按摘要/调用路径/输入适用性复用，不重建golden、不无依据重复长测。新行为或修正必须验证真实受影响范围；最后有一轮去重的适用集中验证，失败仅在定位修正后重验，不能自动试到绿。

仍需单独确认：新FROZEN/EVOLVABLE契约或超出原范围的产品行为、新依赖/置信分数/预算profile/校准/质量基线、真实Native/helper/collector/模型执行、破坏性操作、云端CI和可能触发CI的push/PR/merge/rerun/dispatch等云端写入。新增代理/会话/工作树不得自动视为获准。未来B..E尚未细化的方案不因本包自动实施；可整理一份完整批次方案后集中确认。

不动R4 mutable DB/C2寿命/旧Native产物，不重跑历史main CI、不查询冒充取消已结算，timeout仍UNKNOWN。所有原Fixture根、旧失败、本地文档/EOL和.superpowers证据保留；不提交.superpowers或.pnpm-store。

## 执行方案和依赖

采用单一连续队列U0→U1→U2→U3→U4→U5。按每个子模型暂停没有新增治理收益；把未来Native、CI或新设计一并泛化授权会越过原边界。因此不采用这两种方式。U1/U2可以分别准备静态输入，默认仍顺序，不增加并发或代理。各单元测试/修正/文档同包完成，不另设微步骤审批。

### U0：冻结唯一基线、缺口和验证复用清单

**Files:** 只读原109映射及旧resource seals、原完整full/raw-delta/retained contexts、package.json和四root；本任务W目录新增remaining-unified-inventory.json及校验脚本；本文件、CURRENT_STATUS和原统一计划只做调度补记，旧后缀保留。

- [x] 验证active-full-resource-verification.json所有9833项原摘要；原109输入/expected/base及执行绑定不变，整体签收仍0。
- [x] 建立完成证据/未关闭义务矩阵；只追踪原剩余责任，不按参考文件数创造主任务或穷举无依据组合。
- [x] 核验四root实际状态和原G文件清单；给出可执行的去重本地命令，不将含真实Native的verify/root误作默认命令。

**Produces:** 原文不变的source/hash/evidence/obligation清单；U1/U2消费原固定上下文，U4消费准确注册差分。

### U1：实际partial raw DELTA整链独立资源

**Files:** 原fixtures/phase1/mixed-analysis-store/raw-delta-independent-context.json仅作不可变输入；新增原Stage根下independent-delta-raw-resource-model.mjs、delta-raw-resource-reference.json及packages/storage/test/mixed-analysis-delta-raw-resource.test.mjs。按真实调用路径可拆分同目录测试参考；不得为拆分增加产品接口或再拆审批。

**Consumes/Produces:** 消费原input、declaredInput、preparation、owner、raw和完整expected/expectedTables；独立模型输入为这些字面声明，输出完整语义结果、逐段账本、累计required、TEMP/seal、22表和恢复读集。产品仍调用原prepareOwner/validateObservation/compose/freeze/Store，不新增公共接口。

- [ ] 先从原Source差分、scope、旧opaque unit、完整支持/原始候选/foreign支持、删除投影及原raw推导全部成本和目标，冻结后才调用产品；不得用usage或产品输出反填。
- [ ] 覆盖现有partial Native输入的准入/累计预算、旧unitId复用、外部与未变Native支持保留、完整Code与历史身份，逐字段比较旧完整目标。
- [ ] Runtime纯预算实际rows=0；Stage/Store五维exact/少一、unsafe/overflow按原门禁，已有消费/预留/retained不复位，拒绝后完整持久像和lease状态正确。
- [ ] 对失败按实现/Fixture/设计假设分类，原范围内最小修复＋对应RED→GREEN/相邻回归；若发现契约冲突，仅暂停相关链，合并提交真正决策点，其余工作继续。

**Done:** 原raw DELTA完整输出/原始支持/22表目标与独立成本一致；真实Node/SQLite组件证据齐全，无Native运行资格声明。

### U2：retained重投影、仅删除与NO_OP资源

**Files:** 原fixtures/phase1/mixed-analysis-stage/retained-deletion-independent-context.json、原NO_OP绑定及corpus只读；新增independent-retained-history-resource-model.mjs、retained-history-resource-reference.json、packages/storage/test/mixed-analysis-retained-resource.test.mjs。

- [ ] 冻结原始origin和所有祖先/旧当前投影；独立推导retained当前basis/支持摘要/新projection，原origin字节完全不变，退休origin不进入当前members。
- [ ] 仅删除仍保留完整Source删除清单，raw为原允许null路径；不得将FULL零unit降为免raw；NO_OP不落新history且不调用不应调用的规则。
- [ ] 同账本验证完整H1重复读、Syntax pair复核、TEMP/Stage/Store写入及相应失败负控制，不只验证normalizer子调用。
- [ ] 全部语义、身份、旧不可变行/当前members、完整SQL目标及五维边界按原契约核验；不把纯声明控制当Source/Native认证。

**Done:** 原retained/retire/deletion/NO_OP义务各有明确适用输入、独立完整预期和真实执行收据；未适用维度如rows0单列，不伪造少一值。

### U3：剩余失败、不一致与只读恢复资源

**Files:** 原fault/crash矩阵和zero-recovery/rollback参考只读；新增independent-mixed-failure-resource-model.mjs、mixed-failure-resource-reference.json、packages/storage/test/mixed-analysis-failure-resource.test.mjs；必要故障注入只在隔离测试helper/worker。

- [ ] 以原19类SQL/真实Node退出和COMMIT outcome路径为责任集合，逐项映射可复用证据及缺失完整资源前缀，不增设无依据故障类别。
- [ ] 独立覆盖剩余非空失败/回滚不确定、COMMIT前后异常、cleanup失败、fresh readonly COMMITTED/NOT_COMMITTED/INCONSISTENT判定；没有新的自动重试或修复DB。
- [ ] 辨别进程崩溃、SQL异常、预算拒绝；guard在预算支付前不执行未付SQL；不确定状态只读检查，保持真实提交身份及lease永久撤销。
- [ ] 对已封存、身份相同且适用的19个进程退出复用；仅真实受影响的类别及原G明确要求的最终范围重验，失败和取消原样保留。

**Done:** 每项剩余恢复义务有完整输入、独立前缀/恢复账本与持久像/错误状态证据；未知Native timeout仍不受影响。

### U4：一次完成G入口、注册、构建与集中验证

**Files:** 已存在scripts/test-mixed-code-identity.mjs、scripts/test-canonical-syntax-mapping.mjs只扩展必要分组；新增scripts/test-mixed-analysis-stage.mjs、scripts/test-mixed-analysis-store.mjs；package.json仅追加尚缺的两个root一次。原允许的八个注册守卫脚本见原B1b§2；只有确实受root字符串变化影响的精确断言才改，不重改61/35或全局替换数值。

- [ ] 冻结old→new精确注册清单，各测试文件只分配一个root；防跨root重复启动同一DB/cohort。
- [ ] registry保持61/Phase1 35/catalog0/既有四ID各一次，原109必须逐项有证据，缺资源义务时不签收整体Fixture。
- [ ] 按原G§10顺序运行已安装Providers→Storage→Runtime构建、IR类型、四root和去重旧兼容清单；runner限定隔离根，任何会实际启动Native/helper的路径先排除并记录未授权，不能借此豁免原需另批的资格门禁。
- [ ] 架构17、scoped格式/链接、旧Fixture/文档后缀和全部历史证据摘要核验。稳定产品后才做最终集中回归；后续仅重跑实际受影响项，并准确区分各次收据。

**Done:** 原A-local门禁有新鲜可复现证据，注册无重复/漏项/降低原阈值；不得据此宣布A-runtime/P1-04/05/Phase1完成。

### U5：集中评审、修复和证据封存

**Files:** 原CURRENT_STATUS/WBS/Acceptance/Traceability、ADR-020及原B1b要求的spec实现追踪；新增本批最终评审和不可覆盖W seal；原文/失败保留。

- [ ] 对照原设计/Fixture/安全/恢复/架构逐项评审；作者评审与独立整包评审明确分开，不用前者代替G。
- [ ] 发现问题在原批准范围内最小修复并针对性验证；真正新契约/范围/数值集中一次提案，明确依据与影响，不能默改。
- [ ] 独立评审若需新增代理/会话，先集中说明并取得该操作确认；没有独立评审则该项保持OPEN，不能伪称完成。
- [ ] 只在原完整本地退出条件全部满足后记录B1b A-local退出；更新完整证据范围、未执行项和下一批前置。不自行提交、推送或启用生产路由。

**Done:** 最终一致性/独立评审/原109整体资源义务均完成才签收；否则集中报告实际剩余，不以“代码写完”或部分测试绿结案。

## 统一报告和后续审批

执行到本包退出或真实阻塞，不再以“下一小步是否继续”结束检查点。中途提供简短进展和可验证结果，不重复询问已批准范围。确需批准时一次列明契约/依赖/数值/外部操作及准确文件/提交/次数/作业和替代方案。

A-runtime在具体操作包完成后集中确认；B框架流程、C文档/语义/发布、D查询/Wiki/Agent、E集成验收按原五批次整理完整设计/任务包再评审。审批减少不意味着提前引入DEFERRED、忽略依赖或预先批准未审设计。

## 首次执行记录

2026-10-27：U0实际核验通过，9,833项前驱摘要、原109绑定及真实Fixture discovery61/35/四ID各一次不变；已冻结U1/U2三个原输入和十文件调用链、九组可复用资源证据。四root实态为两已注册/两待创建，U4仅补两项。U1/U2完整资源模型及U3～U5仍OPEN，不将输入绑定记作完成。证据：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/remaining-unified-inventory.run.json及remaining-unified-inventory.json。没有产品/Fixture/CI/Native/Git写入。
