## A-local独立评审与修复完成；本地组件退出 — 2026-10-29

同一次只读独立整包评审发现4项原契约实现缺陷：manifest/Code闭包、Unicode DELTA、失败预算续接、H1查询前行准入。原范围统一修复7源码/3测试，旧公开接口与成功成本/Fixture预期保持。IR1/3/4原4项RED及IR2私有Provider另行RED均转绿，最终12项新旧边界定向通过（10新控制含在Stage root）；修复无第二次独立评审，以作者TDD及完整适用本地批次验证。

新鲜构建/IR类型exit0；Code75/75、Syntax59/59、Stage333/333、Store288/288、原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17及范围格式通过，重叠不累计。四root仍去重55文件，registry61/Phase1 35/四ID各一次/catalog0；2369个Fixture/参考字节、依赖/迁移/注册不变。

[独立发现、修复证据及有界验收](../superpowers/reviews/2026-10-29-phase1-independent-review-fixes.md)逐条链接109原显式绑定的最新PASS selector及共享资源/兼容门禁；U0～U5与原A..G在声明式Node/SQLite组件范围完成。原整体Fixture历史map/generic base不改写、不无条件签收；主任务仍4/21接受、17未关闭，P1-04/05/Phase1未完成。

真实Source重验证/资源取消、Native/profile/H5和后续B～E需具体方案及相应授权；无Native/云端CI/Git写入或第二代理。timeout仍UNKNOWN，main取消结算/R4/C2不变。全部旧文档后缀、原稿、失败及封存保留；下方pending是历史快照，不推翻本次有限结论。

## A-local统一本地门禁已通过，独立整包评审待完成 — 2026-10-27

已批准U1实际partial raw DELTA、U2 retained/删除/NO_OP及U3完整故障/只读恢复资源已顺序核验；U4仅追加两个缺失root，四root去重覆盖55文件。完整Source/原支持/opaque unit、immutable origin/current、同账本五维边界、TEMP/seal/lease、22表和恢复身份保持原契约。本轮无新产品/依赖/数值/迁移或Native资格。

新鲜本地证据：Providers→Storage→Runtime构建及IR类型exit0；四root分别75/75、59/59、323/323、288/288，原34文件兼容1270/1270，均0fail/cancel/skip/todo；架构17项目通过。重叠收据不相加，不代表全仓verify或Native门禁。补记前2347旧Fixture、374产品src/dist及109原绑定不变；registry61/Phase1 35/四ID各一次/catalog0保持，八个旧注册守卫无需改动。

[准确范围、首轮失败与作者评审](../superpowers/reviews/2026-10-27-phase1-unified-local-resource-review.md)。U5独立整包评审/最终退出仍待，作者检查不代替独立评审；原Fixture整体签收0、主任务4/21接受/17未关闭，P1-04/05/Phase1未完成。原批准内不逐小步骤确认；新增代理需遵守此前单独确认边界。无Native、云端CI或Git写入，timeout仍UNKNOWN，R4/C2/main取消未结算状态不改。下方原文为保留历史与契约，不据旧pending快照推翻本次有限范围证据。

## 清理行预留附约已批准 — 2026-10-27

用户明确批准清理行预留修订及集中实施包，继续原本地D..G。首次必要清理读取在TEMP分配前预留1行，加原构造5行共占用6行；占用为已花费＋仍有效预留，实际交付与预留证据分开。首次清理消费credit不重复扣行，额外close重试先付1行；预算错误不能吞成已关闭。未执行预留不伪称SQL已执行，不退款供已终止Stage复用。Stage到Store与更紧caller上限续接保留预留；COMMIT后cleanup失败保留真实提交身份、撤销lease并标cleanupFailed，不能重复Apply。credit私有，不进入owner、IR、history、wire、schema或公开预算receipt。该计数来自既有SQL步骤，不是新profile或数值门槛。

批准的是契约与原本地包实施，尚未声明测试/资源/Fixture/G完成。原始文档和失败如下保留；真实Native、校准/profile、新依赖、云端CI与Git写入等边界不变。

# Implementation Protocol

## Starting a task

1. Read `CURRENT_STATUS.md`, the task entry, its referenced specs, ADRs, and acceptance gates.
2. Confirm predecessors are complete and the task belongs to the active phase.
3. Write or select the fixture that proves the behavior before implementation.
4. Implement the smallest contract-complete change without deferred features.
5. Run unit, contract, fixture, architecture-boundary, and relevant integration checks.
6. Update specs when implementation clarifies behavior; use an ADR for frozen decisions.
7. Update `CURRENT_STATUS.md` with evidence and the next task.

## Definition of done for every task

- implementation and tests are complete;
- relevant fixtures pass;
- no architecture dependency rule is violated;
- public schemas and errors are validated at boundaries;
- documentation reflects behavior changes;
- `CURRENT_STATUS.md` records evidence;
- no unrelated or deferred capability was introduced;
- changes to canonical contracts have an ADR or compatible schema amendment.

## Phase protocol

Phase 0 and 0.5 follow `WORK_BREAKDOWN.md` directly. After Phase 0.5 acceptance, the Engineering Agent expands Phase 1 into task-sized work items using the Phase 1 specs, end-to-end fixtures, and acceptance gates, then obtains design review before implementation. Phase 2 and Phase 3 are refined only after the preceding phase produces measurement evidence.

## Change control

- FROZEN: open an ADR or Design Change Proposal, state compatibility, migration, security, and phase impact, update all affected documents, and do not implement until accepted.
- EVOLVABLE: change behind tests and Fixtures, update baselines deliberately, record the Evaluation evidence, and synchronize the controlling design documents.
- DEFERRED: keep out of Phase 0, Phase 0.5, and Phase 1 scope; document evidence that may trigger design in the assigned phase.

## Safety rules

- Never delete the last good graph or knowledge revision before replacement validation.
- Never log raw secrets, full prompts, or unrestricted environment variables.
- Never pass a shell to native providers or inherit the full process environment.
- Never silently turn an unresolved or ambiguous relation into a resolved one.
- Never publish partial semantic output as complete knowledge.

## Evidence record

For each completed task record: task ID, commit/revision, commands run, fixture IDs, pass counts, schema or migration version changes, known limitations, and the next unblocked task.

## 用户批准的收敛执行策略（2026-10-29）

适用于后续设计、开发和验证。以最小、可交付的行为闭环推进；本节调整工作方式，不修改产品契约、既有数值或必需验收门禁。

- **设计与保护按实际风险取舍。** 复用已有实现、类型、标准库和信任边界；新增抽象、配置、包装层、防御检查或测试须说明它防止的具体失败及现有覆盖缺口。对已验证的内部数据不逐层重复复制/校验，不为假设中的扩展提前建设机制；现行安全/预算/错误恢复契约继续执行。
- **按影响范围验证。** 开发时运行直接相关的行为、Fixture和失败控制；批次结束集中运行受影响的集成、兼容及架构门禁。仅在相关变更、失败或未解决风险要求时扩大/重复检查，不为状态同步、文档更新或收据更新机械重跑完整回归。阶段退出仍执行适用的既定完整门禁。
- **有依据地复用证据。** 复用时记录原命令/结果及代码、输入、依赖、配置和环境的适用性；相关身份变化或契约明确要求fresh时重新执行。准确构建绑定的资源资格不得移植；取消、未运行、TODO与失败不能计为通过。
- **一个责任点检查一类结构。** 全局注册/发现/唯一性集中在注册测试；功能测试关注自己的Fixture及行为。后续触及重复计数、自重建测试或重叠断言时，先列原覆盖与等价替代，再作聚焦合并；本策略不直接删除或豁免已有必需门禁，也不另起全仓测试重构。
- **精简记录。** 每批复用一份命令/结果索引和简短状态，引用已有日志；只更新受影响的权威文档。历史证据保留原位，当前规则/计划保持明确入口，不再复制整段历史或仅为新增收据层层重建全仓hash封存。契约要求的Fixture冻结、身份和原始产物继续保留。
- **已批准范围连续执行。** 合并相依步骤，范围内修复与必要验证统一处理，不因任务细化、普通实现选择或技能流程重复询问。新增范围、治理冲突、新数值/依赖、破坏性动作、真实运行及云端/Git写入仍按现有授权边界处理。
- **失败有界处理。** 先定位再做有假设的最小诊断；保留失败，无法定位则标明缺口并推进不受影响的工作，不重试到绿，不新增保护层掩盖根因。只有真实用户行为、数据完整性、安全、恢复和正式验收需要的阻断才作为阻断依据。

本次只落地执行规则；不改产品/测试/Fixture/阈值，也不签收尚未通过的Rust protocol、C1或Phase1。
