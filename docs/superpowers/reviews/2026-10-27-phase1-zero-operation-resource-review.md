# Phase1 零事实整操作资源参考作者评审 — 2026-10-27

## 结论与边界

原批准 A-local D..G 顺序继续。本次新增独立输入驱动 BigInt 资源参考，贯通 FULL 零投影单元的 H1 捕获、Stage owner/观察/封存、真实 Runtime/Provider、Store 锁内续接、完整持久像与首次预付清理。六个关闭语料场景均逐字段匹配真实逻辑账本与完整 SQL 结果，精确预算通过，每个预算维度少一拒绝且持久化不变。不是从产品输出或 usage 倒填预期。

这是作者局部评审，不是 G 要求的独立整包评审；零事实成功路径不能代替非空 Code/Syntax、DELTA/retained、失败与恢复的整操作资源证明。原意图绑定109/109（Stage66/Store43），原 Fixture 整体签收0，主任务4/21接受、17未关闭，D/E/F IN_PROGRESS、G OPEN。逻辑内存记账不是 OS/RSS 保证，也没有取得真实 Native/profile 运行资格。

## 依据及可复现验证

依据既有 [Stage/Store 契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md)、已批准 [清理预留修订](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)和[集中执行计划](../plans/2026-10-27-phase1-consolidated-execution.md)。本次没有改变身份、发布、安全、预算数值或迁移契约，没有产品源码、dist、依赖、迁移、根测试注册修改。

参考模型与 JSON 均位于 `fixtures/phase1/mixed-analysis-stage/`；测试位于 `packages/storage/test/`，不依赖旧私有 W 输入。资源测试直接调用真实产品，但预期生成器只导入 Node 标准库和独立同目录模型。

| 新测试文件（mixed-analysis- 前缀、-resource.test.mjs 后缀） | 数量 | 核验内容                                             |
| ----------------------------------------------------------- | ---: | ---------------------------------------------------- |
| code-read                                                   |    6 | 完整 Code SQL 读、数值预检、14类读集及摘要、记忆峰值 |
| history-read                                                |    6 | H1 公开读、私有详细读、重复锁内读的累计账本          |
| stage                                                       |    6 | 构造6行预留、owner、TEMP及首次清理零追加             |
| provider                                                    |    6 | 完整零投影 raw→声明式候选，含累计续接                |
| runtime                                                     |   12 | 真实 Runtime validation/composition 与 Provider 组合 |
| frozen-stage                                                |    6 | 完整观察、重复核验、封存与不可变完整结果             |
| store                                                       |    6 | 整操作真实提交、22表前后持久像、五维少一回滚         |

共48个新测试；与原相关66项集中运行14文件114/114，0 fail/cancel/skip/todo，不与先前运行累计。新鲜架构17项目通过。源码与构建产物未变，因此没有重复构建、完整长回归或校准。

证据目录：`.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/`。

- 最终测试：`independent-zero-operation-final-scope.run.json` 及完整 `.log`、`.stderr.log`。
- 架构：`independent-zero-operation-architecture.run.json`。
- 不可覆盖封存：`independent-zero-operation-verification.json`，前驱 `independent-resource-components-verification.json` 的9,355项全部核对；旧 Fixture 2,302文件、产品源码/dist 374文件零变化。
- 所有原意图的 input/expected/base、执行绑定和通过 selector 保持原哈希。

六场景为 OTHER-only未索引、空未索引、已有零事实历史可用、失效指针且完整不可变载体保留、其他revision全库snapshot census、当前revision双snapshot。所谓 legacy-empty 仅为已有零事实 Canonical/history 上下文，不伪称本测试建立了真实 R010 Native header；真实 R010 writer 的兼容证据沿用此前独立测试。本次 Store 的 Native派生表为空，不能声称验证了非空 summary 删除。

22表 schema 参考来自逐文件静态 DDL 文本，并保存迁移哈希；没有通过数据库 introspection 或产品输出生成 golden。Store 测试在全新隔离库上逐次执行，正例比较全部表、独立 SQL 目标和新只读连接，负例允许在整操作任意正确边界拒绝并验证回滚。资源模型只涵盖这些关闭输入，拒绝非空事实，不能泛化为任意数据库参考实现。

## 真实失败和修正

保留所有首次日志与修改前字节，没有重写失败结果。

1. Runtime 首轮 validation6通过，composition6失败；独立成本与输出已相符，测试误把纯组合的深度错误一律当作 validation 的错误码。依既有产品契约与旧测试修正断言，不改成本/输出/产品，12/12。
2. Stage 首轮6失败；模型漏记 START/COMPLETED 事件在 `validateFrozenResult` 的遍历。读取既有调用路径后补齐实际事件数组，重新从输入推导，6/6；没有读取实际计数填 golden。
3. Store 首轮6失败；精确提交及成本已符合参考，少一深度可在构造/观察阶段正确拒绝，但测试仅包裹了 Store.apply。将拒绝断言覆盖整个操作，保留每次全新数据库及持久化不变检查；6/6。没有降低门禁或强制延迟拒绝。

所有新文件格式化前有原字节备份；仅调整新增参考之间的来源哈希，使其对应格式化后的真实输入。受保护旧 Fixture 不变。

## 接续与未关闭项

继续沿用批准，无新增微步骤审批。首先将独立成本调度扩展到非空 Code/Syntax、DELTA/retained 与失败/恢复，保留已有独立身份/manifest/Syntax pair 子模型。随后完成 G 的根注册、精确计数、完整包独立评审和所有原退出条件；在此之前不签收整个 A-local 或 P1-04/05。

未启动真实 Native/helper/collector、校准、profile、云端 CI 或 Git 写入；未重跑旧 Native 产物，历史 Native timeout 仍 UNKNOWN。所有原证据、失败及宿主管理工作树保留。
