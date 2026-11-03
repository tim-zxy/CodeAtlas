## B5 workspace实际组合检查点 — 2026-10-31

实际repo快照＋显式FrozenContractSet→既有matcher/stitch→原授权Store已接线，52/52最终影响范围通过。旧SQL示例边界引用已按正式Graph修正，Store补同批binding引用核验，不制造Source支持；原失败保留。完整Source/Evaluation与B6仍OPEN；下一步集中处理来源/质量缺口，不能自动启动未授权采集或添加wire/Syntax版本。下方“workspace准备仍受信”属历史；旧端口仍保留供兼容。

## B5固定V4接线续接检查点 — 2026-10-31

当前SQLite→V4 Context、固定工厂→领域候选→Graph/Flow→原授权Store边界已有局部证据，原多路由maxItems通过共享SPI计数续接；108/108最终影响范围、四包build/architecture17/范围format通过。缺框架真实Source与完整发布的限制保留。后续沿原包补workspace实际matcher/stitch准备，并集中核对B6原门禁；下方“完整V4选择缺失”仅属较早快照。

## B5双仓续接检查点 — 2026-10-31

原批准范围顺序推进；多仓Store子项已有同局部ID及正式SourceState CAS→AFFECTED/last-good证据，两项实现缺陷按原契约修复。14/14为本次影响范围，其余原输入摘要不变按收据复用。完整V4/当前Context接线和B6仍OPEN；无需逐组件再审批，下方较早检查点保留为历史。

# B5当前范围补记 — 2026-10-31

五迁移/Runtime与Workspace Store/授权/私有接线组件已实施；完整V4选择/来源整链及B6/原父门禁仍OPEN；同Code full历史恢复身份控制和最少SQL前付实证已补，不新增完整费用矩阵，不能将以下未勾选项视为已验收。准确证据见[实施审查](../reviews/2026-10-31-phase1-b-remaining-implementation-review.md)和原唯一结果索引。原范围连续推进，不逐任务确认。

# B5迁移批准补记 — 2026-10-31

用户明确批准[五迁移最小修订](../specs/2026-10-31-phase1-migration-backup-policy-proposal.md)。仅五个纯新增迁移backupRequired=false，取代下方true复用假设；旧runner拒绝、checksum与全部边界保持。B5–B6沿原整包连续实施，无微步骤审批。

# 整包批准与连续执行 — 2026-10-31

用户最新“批准”明确批准本统一设计与B1–B6本地实施包。以下PROPOSED/未授权文字保留为审批前历史；当前实施范围和限制沿原整包，无逐组件再次审批。执行账本：[执行账本](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/progress.md)；尚未完成整包验收。

# Phase1 B批剩余工作统一执行计划

> **For agentic workers:** 使用superpowers:executing-plans，本会话顺序执行；用户不授权新代理/会话/工作树、云端或Git写入。各阶段是内部依赖节点，整包获批后不再逐组件确认。

**Goal:** 原P1-06..09剩余能力按一个B批推进，完成实际本地产品链和对应证据，不再以private组件退出替代父任务。
**Architecture:** Plugins归一化声明与边界绑定；Execution/Contracts派生IR；Storage实现repo/workspace事务；Application授权/查询；Runtime接线。
**Tech Stack:** 现有TypeScript/Node/SQLite/IR/Zod，复用已锁依赖，不新增库。
**Spec:** [统一设计](../specs/2026-10-31-phase1-b-remaining-design.md)。
**Status:** 当前进入B批整体设计/集中评审；新增契约、迁移与SQLite执行尚未批准。调度确认不冒充这些新设计的批准。

## Global Constraints

既有C工作树、原A..E批次和全部门禁保持。D旧checkout/破损Git指针不修；不reset/stash/stage/换EOL/清理历史。.codegraph不存在，不索引。无真实Source/Native/Rust/helper/collector/模型/CI/Git操作；本包批准后仅普通Node与测试拥有本地SQLite。A实际资格、数值baseline和未知profile不补造。

批次收据只一份索引；历史输入/失败不改。每阶段开发只跑直接测试，末尾去重集中集成/兼容/架构检查；文档更新不重复回归，不引入无依据保护层。

## 当前可复用与需要新建

- 已具备：Context4/Syntax3、固定四规则/绑定、Runtime领域/入口、G1局部CALL图/Flow、真实Mixed Stage/Store与H1恢复原则。
- 缺失：完整V4 factory/边界绑定、ServiceIdentity/ContractMatch/WorkspaceExecution strict IR、正式图/Flow、repo12/13与workspace4/5/6、对应Store与Application接线。
- 既有输出保持：原B-F3/G1 private API、旧Code/Syntax/Runtime v1、已发布迁移和checksum，不默改旧capability。
- 任务编号：P1-06三Java Plugin；P1-07 FastAPI；P1-08图/Flow/Repository Storage；P1-09合同/基础跨仓。G1历史编号表述由本入口澄清。

## Review Focus

1. 有Syntax声明不等于可证明边界；缺字段必须保留UNKNOWN，不能按名字或同topic补连接。
2. 单repo RuntimeFactSet不能冒充workspace图；每跳必须冻结repo/revision/Code/Syntax/Runtime输入。
3. schema/namespace为null不构成合同兼容；MESSAGE串联方向与HTTP不同。
4. 同CodeBasis但Syntax/policy改变要拒绝旧候选；partial/失败/commit后输出错保持last-good及真实提交身份。
5. 公开factory/组件PASS不能升级实际Native资格/原critical baseline或父任务完成。

## B1：统一IR、SPI与独立Fixture

准确新增产品：packages/ir/src/framework-binding-ir.ts、contract-ir.ts、workspace-execution-ir.ts；packages/plugins/src/plugin-spi-v4.ts。修改IR/index及必要显式exports，旧strict reader不放宽。
测试：对应三个IR test、packages/plugins/test/plugin-spi-v4.test.mjs。
输入输出：设计§3的四类strict envelope、V4 factories所用describe/detect/extract合同；引用闭包、tuple/digest、政策和预算有明确预期。

- [ ] 原P1-06..09 Fixture先冻结：p1-spring-v1/p1-mongo-v1/p1-kafka-v1/p1-fastapi-v1、p1-execution-flow-v1、p1-contract-matching-v1/p1-cross-repo-v1；p1-runtime-storage-v1若已存在复用并补对应路径，避免重复ID。
- [ ] 用独立字面输入/预期观察缺API/行为RED，再实现strict IR/SPI；六match状态、候选唯一与foreign引用、old-version拒绝、同ID冲突/预算。
- [ ] Source输入充分性审查在此开始，明确哪些正例有当前Source/库证据、哪些仅手写Context。缺原始证据不伪造。

完成条件：合同与新输入边界可被准确解析，旧IR/SPI兼容；设计中缺证据能力列HOLD并不阻塞无依赖项。B1不是独立审批门。

## B2：四Plugin与标准化边界绑定

新增products按原计划：packages/plugins/src/spring.ts、mongo.ts、kafka.ts、fastapi.ts及framework-binding-candidate.ts；对应四Plugin tests与binding-candidate test。复用framework-bindings/rules/extraction/runtime-candidate/entry-candidate，仅改涉及规则，必要按真实责任拆文件，不全仓重构。

- [ ] 精确Source/owner/receiver/target支持、同名伪框架、typed初始化/遮蔽、静态与动态字段、删除/重排先RED。
- [ ] 四factory实际输出经过新SPI及IR校验的Runtime/绑定候选；Dependencies只保留声明，不能CALL。
- [ ] Feign/Depends/handler正例若当前Syntax不足，记录具体反例与未满足critical obligation，不开放任意draft或重解析后宣称实现。
- [ ] 一起完成注册、public exports和必要包内接线，不逐框架询问。

验收依据：设计§3.1，四独立Fixture，原SPI/B-F3兼容；不以四个demo或相同库存计数证明完整Plugin。

## B3：正式图/Flow与边界

新增packages/execution/src/derive-execution.ts、derive-runtime-flow.ts；测试derive-execution.test.mjs、derive-runtime-flow.test.mjs。
接口：deriveExecutionGraph(strictRuntimeAndBindings,RequestControl)、deriveRuntimeFlows(graph,RequestControl)。继续支持CALL，但不改变旧deriveDeclared*适用域。

- [ ] async-boundary/context隔离、DATA读写/WATCH、任务、branch/cycle、supported frontier/取消/deadline、ordinal非时间先RED。
- [ ] 用真实B2输出组合验证新图，而不是向产品直接注入golden；只对证明充分关系扩展，未MATCHED边保留。
- [ ] 预算截断PARTIAL不可进入完整激活；正例/未知/失败都保留支持。
- [ ] 新任务支持不能顺手引入CFG/PDG或模型推断。

验收：设计§4及p1-execution-flow-v1；REQUEST/EVENT/JOB/TASK/BATCH模型与消息/数据边界不压平，原G1 root兼容。

## B4：合同匹配与workspace串联

新增packages/contracts/src/match-contracts.ts、packages/execution/src/stitch-workspace.ts及对应tests。
接口：matchContracts(FrozenContractSet,RequestControl)、stitchWorkspaceExecution({frozenBindings,graphs,matches},control)。

- [ ] 六状态、服务身份歧义、未知schema/namespace、已知外部显式登记、consumer单一选择规则先RED。
- [ ] 匹配/串联只用Frozen RevisionSet+严格binding；跨repo Source/Code支持变更的旧候选不能复用。
- [ ] HTTP consumer→provider、MESSAGE producer→consumer分别golden；未MATCHED不连接，不提升最弱支持分数。
- [ ] 只验证本地纯函数，不访问网络或模型。

验收：设计§3.2/3.3与p1-contract-matching-v1/p1-cross-repo-v1，既有Runtime v1仍单repo。

## B5：Repo/Workspace Store与Application/Runtime接线

新增R012/R013和W004/W005/W006 SQL（准确预留文件名沿原P1计划）；修改各自manifest，不改旧checksum。
新增packages/storage/src/runtime/runtime-fact-store.ts、contract-store.ts；packages/application/src/refresh-runtime-facts.ts、refresh-workspace-runtime.ts、trace-runtime.ts及对应tests；Runtime新增对应composition模块，仅接线。必要修改Mixed Store私有锁内kernel，旧接口/lease/Source/CAS和恢复门禁保留。

- [ ] 先写新空库/逐版本升级、partial失败/竞争/相同Code但Syntax变化、commit未知/后输出错、last-good/AFFECTED、只读重开独立预期。
- [ ] 实现设计§5五个迁移及严格关系/不可变activation/预算读计划；不建无消费占位表/索引。
- [ ] 同repo Syntax+graph+flow同事务；workspace自身事务与冻结binding，来源跨库变更准确标stale，无虚假跨库原子承诺。
- [ ] Application权限、读不触发refresh、Runtime actual-profile缺失拒绝；不在B内启动观察。
- [ ] 针对真实新SQL路径保留必要错误/恢复控制；既有不变的故障矩阵按适用性复用，不机械倍增。

验收：设计§5/6，p1-runtime-storage-v1与cross-repo存储部分；测试仅新owned DB，不使用R4/user DB。新migration备份/错误/重开和actual logical accounting有真实证据。

## B6：一轮去重集成、整包评审与父任务验收

- [ ] 完整本地Source/Syntax证据→Plugin→IR→Graph/Flow→matcher/stitch→Store/Application组合，区分历史库捕获/声明输入/真实Native证据。
- [ ] 所有新tests归并一个B批root；旧G1/B-F3、受影响Mixed Store及迁移/配置/导出测试按最终变化去重，重叠不相加。
- [ ] 新API与SQL涉及的包按IR→Plugins/Contracts/Execution→Storage→Application→Runtime构建；架构/注册/范围格式集中一次。仅变化或失败要求时复验。
- [ ] 作者整链审查和原范围修复统一完成；不新增代理。更新CURRENT_STATUS、WBS/acceptance/trace和受影响ADR/specs，只一份结果索引。
- [ ] 逐项核对原P1-06..09的实际来源/质量baseline/原门禁。全满足才关对应父任务；A实际资格/critical Source/Evaluation不足明确HOLD，不能以批量执行为由豁免。

首个可执行步骤：B1冻结独立oracle、解析契约/Source充分性检查；产品实施须统一设计/包获批。批次内B2/B3顺序，B4可逻辑独立仍在本会话顺序做，B5消费B1..B4，B6统一验收。没有每阶段再次授权流程。

## 一次审批与原五批后继

当前统一设计和任务包待一次审阅，包含新IR/SPI/政策适用、现有库内部接线、五个migration/owned Node SQLite、四Plugin/图/匹配/Store/Application/Runtime及必要修复与检查。不包含Rust/实际Native/Git/helper/collector/模型、校准/profile数字/新第三方库/云端CI或Git写入。

批准后按B1→B6连续执行，不问是否跑已批准本地检查/更新文档；真实FROZEN冲突、新协议/数值/依赖和准确真实运行包再集中确认，暂停只影响相关链。

原后继C=P1-10..14（文档/知识MANUAL发布）、D=P1-15..19（查询/Wiki/Agent/MCP/交付）、E=P1-20（真实E2E/原门禁/评估一次CI）不变。B完成后按依赖进入C，不把尚未详细设计的C..E当空白实施许可。

## 当前执行检查点 — 2026-10-31

[实施评审](../reviews/2026-10-31-phase1-b-remaining-implementation-review.md)及[准确命令/唯一结果](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)：400/400范围通过，完整Source/Evaluation/B2缺口及B5/B6仍OPEN。[五迁移标记冲突修订](../specs/2026-10-31-phase1-migration-backup-policy-proposal.md)待一次集中决策；未实施新SQL/manifest/Store变更，原整包其余授权持续有效，不逐组件重新审批。
