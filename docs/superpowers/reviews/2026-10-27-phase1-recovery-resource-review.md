# Phase1 零事实失败前缀与只读恢复资源作者评审 — 2026-10-27

## 结论

原批准 A-local D..G 范围内新增30例独立资源参考，覆盖六组既有零事实输入的成功提交、BEGIN取得锁后抛错、COMMIT执行前抛错、实际COMMIT后抛错、提交后首次清理失败。每例从输入和静态SQL步骤推导事务前缀完整账本、持久化目标，以及全新只读恢复的完整成本和结果；五维精确上限与少一、receipt入口items/depth/memory早期拒绝通过。

真实测试发现并修正一个既有契约实现缺陷：`inspectMixedAnalysisOutcome` 在try外执行 `b.own(receipt)`，使早期深度拒绝泄漏内部 `HISTORY_LIMIT_EXCEEDED`。仅将此一步移入既有try/catch，使其沿既有转换返回 `STAGE_LIMIT_EXCEEDED`。没有改变成本、限额、发布流程、恢复结果或任何设计契约，无须新增DCP。原源码和JS保存在证据目录，首次真实失败保留。

新鲜受影响回归六文件115/115、0fail/cancel/skip/todo，含19个真实Node进程退出；Storage构建0、架构17项目通过。独立30例单跑与集中115重叠，不累计。P1-04/05、A-local整包和Phase1仍未签收，主任务4/21接受、17未关闭，原意图109/109绑定、原Fixture整体签收0。

## 依据与复现入口

依据原 [Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md) §4.1、§6、§7，已批准[清理预留](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)以及[连续执行计划](../plans/2026-10-27-phase1-consolidated-execution.md)。模型复用[零事实整操作参考](2026-10-27-phase1-zero-operation-resource-review.md)，不是新数值门槛或真实Native资格。

新增可携带材料：

- `fixtures/phase1/mixed-analysis-stage/independent-zero-recovery-resource-model.mjs`：仅Node标准库与已验证的独立模型，无产品导入。
- 同目录 `zero-recovery-resource-reference.json`：30例固定路径输入的完整预期；来源SHA锁定原成功事务参考与22表静态DDL。
- `packages/storage/test/mixed-analysis-recovery-resource.test.mjs`：先按固定输入复算参考，再把测试隔离库路径作为已知输入实例化；在任何Stage/Store调用前完成预期计算，绝不读取Store receipt或observed usage生成预期。

证据目录 `.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/`：

- `independent-zero-recovery-resource-first.*`：五例首跑3通过、2失败，失败为BEGIN/COMMIT-before恢复深度少一漏转换。未更改预期或放宽断言。
- `independent-zero-recovery-resource-error-normalized.*`：同五例修复后5/5。
- `independent-zero-recovery-resource-all.*`：格式化及补齐三个早期拒绝后30/30。
- `recovery-resource-store-affected-final.*`：六文件115/115，包含原Store全部故障/进程退出、成功整操作、清理/预算、真实旧R010 writer兼容。
- `recovery-error-normalization-storage-build.*`、`recovery-resource-architecture.*`：新鲜构建及架构结果。
- `recovery-resource-verification.json`：本批不可覆盖封存；前驱 `independent-zero-operation-verification.json`。

事务前缀的数值逐字段匹配真实Store账本，重复Apply永久STAGE_RELEASED；BEGIN/COMMIT-before保持旧全表，COMMIT-after按新全表只读判定COMMITTED，清理失败仍保留真实提交身份及cleanupFailed。检查精确计数与五维少一时每次恢复都走产品的新只读连接，拒绝后再次比较全部持久表和磁盘重开。入口三个早期拒绝还验证rows与serializedBytes均0。首次失败清理的TEMP保持可见，不无预算自动重试或伪称CLOSED；隔离测试连接由原生命周期结束。

## 证据完整性说明

前驱封存中误包含了其自身尚在写入的 `independent-zero-operation-checkpoint-final.log`，当时记录的是空文件SHA。现日志仅有封存完成后的一个JSON输出行；核对空前缀SHA与原封存一致，且解析后的输出逐字段等于该封存的完整摘要。保留原封存和日志，不重写历史哈希；后继封存记录最终日志哈希及这项精确例外，并排除自身仍在写入的所有checkpoint日志。此项是原封存脚本的活跃日志排除缺陷，不可宣称原9,463项均字节不变。

旧Fixture2,317文件全部原字节保留。产品变动限Store源码、对应JS及source map三文件；源码/JS仅上述一行位置移动，构建产物映射同步。其余产品、迁移、依赖、根注册、原109意图输入/期望/基线及执行绑定不变。六份状态/计划只前置本补记并保留原后缀；所有旧失败与原始证据保留。

## 仍需完成

这30例证明关闭零事实语料的五个事务边界及一致只读判定成本；不是所有SQL故障、未决ROLLBACK/INCONSISTENT路径或真实进程退出的独立预算证明。19个真实退出是既有恢复语义回归，不冒充新资源参考。仍须补齐非空Code/Syntax、DELTA/retained、其他失败/不一致恢复的完整资源参考，随后完成G根注册/精确计数及独立整包评审。本报告是作者局部评审，不是独立整包评审。

沿用既有批准继续；未运行真实Native/helper/collector、校准、profile、云端CI或Git写入，无新依赖、数值、会话、工作树或agent。历史Native超时仍UNKNOWN，全部既有风险保留。
