# Phase1 回滚未决资源参考作者评审 — 2026-10-27

## 结果与范围

原批准A-local D..G继续顺序执行。新增12例独立参考（既有六组零事实输入 × 两个故障边界），验证COMMIT与ROLLBACK均失败、snapshot实际写入后ROLLBACK失败：失败事务完整前缀成本、未决事务INCONSISTENT的receipt-only成本，以及测试释放残留事务后的完整只读NOT_COMMITTED恢复成本。

首轮12/12通过，格式化后集中五文件57/57，0fail/cancel/skip/todo；架构17项目通过。产品源码/dist/迁移/依赖/根注册零变化，未重复构建或原19进程退出长测；前一115/115与本次57项重叠，不累计。当前原意图绑定109/109（Stage66/Store43）、原Fixture整体签收0，主任务4/21接受、17未关闭，D/E/F IN_PROGRESS、G OPEN。

本报告是作者局部核验，不是G独立整包评审；零事实两条回滚路径不替代非空Code/Syntax、DELTA/retained及其余SQL失败/不一致恢复的资源证明。

## 依据与独立性

依据已批准[Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md) §4.1、§6、§7，复用[零事实整操作](2026-10-27-phase1-zero-operation-resource-review.md)及[只读恢复参考](2026-10-27-phase1-recovery-resource-review.md)。没有新身份、错误码、预算政策或真实Native资格。

新增库内文件仅三份：

- `fixtures/phase1/mixed-analysis-stage/independent-zero-rollback-resource-model.mjs`
- 同目录 `zero-rollback-resource-reference.json`
- `packages/storage/test/mixed-analysis-rollback-resource.test.mjs`

模型仅导入既有独立模型，使用Node标准库能力，不导入产品。COMMIT前缀复用独立整操作完整成本；snapshot边界以独立before-image状态，加现有foreign-key读取、immutable预检、snapshot行/参数持有及实际INSERT交付逐项推导，所有加法结果检查安全整数。并未将全事务usage冒充部分写入成本。该边界的receipt.after为null；COMMIT边界保留完整after-image。所有预期在产品调用前冻结，实际隔离数据库路径作为已知fixture输入实例化，不读取receipt/usage回填。

事务未决时既有入口只拥有receipt后检查连接事务guard，结果INCONSISTENT；账本rows/serializedBytes均0，items/depth/memory精确及少一拒绝。rows/bytes的调用上限1仅满足既有正整数输入约束，不冒称实际交付或新profile，不能把0成本维度“少一”包装成资源边界测试。

## 真实路径与恢复核验

测试对真实SQLite COMMIT/ROLLBACK或snapshot INSERT后注入异常，分别验证确切注入次数、COMMIT_OUTCOME_UNKNOWN、永久失效lease及完整独立失败前缀。另一个只读连接看到全部旧持久表，没有半发布。连续检查不会修复或关闭未决writer事务，也不会自动重试Apply。

随后仅在该隔离测试中恢复原始SQLite方法并ROLLBACK自己的故障注入事务，复用原Store测试已有的测试清理方式；不新增生产修复/重试能力，不绕过guard发布数据。释放后通过产品新只读连接核对NOT_COMMITTED、完整成本、五维exact/少一及所有持久表；首次Stage清理消费已预留credit，不追加计费。旧Fixture和历史失败全部保留。

## 可复现证据与保留检查

证据目录 `.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/`：

- `independent-zero-rollback-resource-first.*`：首轮12/12。
- `rollback-resource-final-scope.*`：最终57/57；12新例＋30既有恢复例＋6成功整操作＋6清理＋3预算。
- `rollback-resource-architecture.*`：17项目通过。
- `rollback-resource-verification.json`：不可覆盖后继封存，前驱 `recovery-resource-verification.json`。

添加文档补记前，前驱9,502项哈希全部不变，包括旧Fixture2,319文件和产品374文件；前驱先前记录的活跃日志例外本次没有新增变化。六份状态/计划只前置新结果并保留原后缀，原109绑定、输入/期望/基线及原始失败不变。新文件格式化前原字节备份保留，没有依赖私有W输入的测试或从产品生成的golden。

继续[集中执行计划](../plans/2026-10-27-phase1-consolidated-execution.md)的原本地批准范围，下一步非空及其余失败预算参考，之后G注册/计数/独立整包评审。未执行真实Native、collector、校准、profile、新依赖/数值、云端CI或Git写入，没有新会话、工作树或agent；Native历史超时仍UNKNOWN。
