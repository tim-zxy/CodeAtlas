# C3-A Code Capture 实施计划作者审查

2026-10-23；用户已接受C3-A书面契约，当前[实施计划](../plans/2026-10-23-phase1-code-context-capture.md)待审。作者审查，无独立reviewer；沿用同会话、原工作树、inline顺序。本文不声称代码完成或门禁通过。

## 审查结论

计划完整覆盖A的三个接口、输入/读取控制、真实Code/support/coverage/Source身份、连接生命周期和复核；首个任务为availability/基线RED与独立Fixture。A1→A2→A3→A4紧密依赖，不派并发任务。建议用户审阅计划后，在其范围连续执行。

## Spec→任务映射

| 书面契约                                                | 任务及证据目标                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| §4单模块/同连接opaque handle/纯Storage边界              | A2模块和导出；A3伪/跨连接/关闭/release；A4架构审查                                                 |
| §5完整只读readset/numeric preflight/反向census          | A2十四域固定查询、先数字再payload、全部活动支持/candidate与S；坏BLOB/超大TEXT必须先拒绝            |
| §6完整Canonical、support、coverage与UTF-8 framing       | A1独立transcripts/views；A2同HEADER差异、空Code但有coverage、重复多重性/插入顺序/Unicode/typedID   |
| §7短事务、recheck、失效、固定错误                       | A3真实两连接、ambient旧snapshot、关闭重开、变化/错误永久失效及caller事务保留                       |
| §8/9历史manifest、stage/outcome、实际barrier/accounting | 明确不实施；A始终historicalSourceProof=UNAVAILABLE，不添加生产prepare/Apply                        |
| §10/11Fixture/门禁/文档/回退                            | A4 registry旧ID保全、明确32文件/build/architecture/格式、旧字节哈希、同步文档与未执行root/联合门禁 |

## 重要细化与自审修正

- maxRows具体到schema/census/locator/payload每次返回行，重复lookup重复计数，原coverage重复逐行处理。maxSerializedBytes累计raw SQL UTF-8及全部framed hash输出；memoryBudget仅既有逻辑字符串charge及暂存保留集合，不声称物理内存profile。独立read-plan推导边界，反例减一；实现输出不编写expected或limits。
- 不直接复用旧Source.load的all或支持读取器的全量数组；只局部复用已验证模式。Schema核验用数字计数，不读取任意DDL/列名TEXT；rowid只定位单行，永不选择“最新”或参与身份。
- 正例经session登记、Source.replace和Application/Store正常full/patch流程。Losing-provider candidate用两独立DB保持HEADER和计数相同，winner相同；检查真正的候选内容绑定。SQL破坏仅在明确拥有的测试DB作NEGATIVE_ONLY拒绝控制，不允许拼一个成功图/指针绕过guard，更不碰R4。
- 动态临时root只影响locator：由已知session输入独立计算该locator向量，首个capture前冻结；Code/Source预期不随root改写。避免从capture结果抄hash或固化开发机绝对路径。
- 当前A不持久化旧Source，不能对比当前fingerprint相等便认证历史。不能用C1报告、复制的handle或新摘要安装profile/执行Native。
- 状态表区分跨连接失败不伤原handle、valid recheck失败失效、关闭后的首次release与已released幂等。release从不发SQL；ambient失败不rollback caller事务。
- 部分source/raw stream的PARTIAL仍不能包装为Code成功。新测试Provider自有schema-valid Code向量不能冒称实际Native/Python/完整混合产品证据。
- 无依赖/SQL/构建配置/旧token/normalizer/Source/Runtime/Store改动，根级必须门禁未删。32文件范围不等于全局退出；旧C1 symlink TODO明确OPEN，旧4个C2target生命周期不再执行。

## 计划证据与限制

本轮计划审查只验证路径、调用模式、当前源文件、文档链接/格式和583项前置哈希；没有新产品测试/Fixture/DB/OS探针/云端操作。31个已存在回归文件先静态检查存在性和直接进程调用；新增第1文件在A1创建。执行前还须复核所列文件及import路径，禁止transitive实际Native/helper越界。命令JSON固定并存于计划workspace，未执行。

作者审查不能替代独立代码review；本计划验证的是A自己的只读捕获合同，不是产品/Model/E2E、实际Native/profile、historicalmanifest/atomicStore/restart或Phase1验收。CI仍在后续可集成点另行申请，准确head/job/批次/次数要求不变。

确认计划后用executing-plans/TDD/必要systematic-debugging/verification-before-completion顺序实施。保留全部原始失败和workspace，不自动commit或清理；不再询问每个小步骤或执行方式。

## 静态核对补记

32个文件中31个已存在，唯一缺失是A1将创建的新测试；未执行命令JSON已保留。直接进程引用仅两处用途：既有Git只读filter和process.execPath调用固定架构checker，两者都不是C2采集helper/Native。执行前仍复核transitive import行为。文档同步时更正了Runtime实际路径RUNTIME_CONFIGURATION.md，未重复追加已完成部分；列表审查器也更正CRLF及scripts/test-*.mjs命名假设，两次工具失败分别留证。均无产品/Fixture/DB/测试执行变化。
