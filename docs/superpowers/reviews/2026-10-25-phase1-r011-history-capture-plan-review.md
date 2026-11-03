# H1 R011 History Capture 计划作者评审

日期：2026-10-25。评审对象：[T1–T4具体计划](../plans/2026-10-25-phase1-r011-history-capture.md)。结论：**可整包审批，尚未批准实施**。用户本轮确认H1存储/capture设计及进入writing-plans；不将其解释为编码/DB运行批准。作者自审，无独立review。

## 五项自审结果

1. **设计覆盖**：接受DCP中H1所需五表/四索引/41触发器、无backfill/false/no-down、真实R011只读capture、原Code编码/旧R010行为、来源/成员/历史Source、句柄/重开、所有预算以及Fixture/Evaluation/architecture/文档追踪，均映射T1–T4和R01–R12。H2/H3映射/confidence、H4Stage/writer、H5实际资格明确不在计划内。
2. **步骤可执行性**：migration缺失行为RED先于SQL；API不存在RED与可调用shell断言RED分开；独立语料格式/冻结在产品前；原capture预提取消耗另作兼容观察，不能当独立golden。每任务有精确接口、文件和运行命令，最终命令已冻结为59文件。
3. **类型/架构**：Storage仅IR依赖；共享read kernel无handle/事务权限，旧wrapper固定schema10；新history capture固定schema11；opaque句柄只由真实SQL读取owner产生。新内部API不加package index导出，Providers/Runtime/IR核心模型不改。
4. **Review Focus**：真实R010测试环境、旧origin ancestry、legacy同指纹ABA、累计预算与TEXT前拒绝、两种JSON排序差别均有具体测试任务。新增原basis匹配必须同时匹配历史Source/support context，不能只取第一个同basis记录。
5. **比例/范围**：四任务顺序依赖同一Fixture/kernel/registry，不安排并发。计划包含少量必要签名，没有产品函数体。默认同会话执行已保留，不另问执行方法；不commit或分支收尾。实施只能在整包确认后开始。

## 实码发现及计划落实

| 发现                                                                           | 计划处理                                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| default index session initializer总迁到最新schema，且不能以可写方式打开旧版本  | 不改产品session API；旧C3-A helper通过原checksummed10-prefix迁移建立真实R010 fixture，仍使用原Source CAS/Apply及原read plan；新session测试另验11 |
| native-analysis-state.test是R010专项，很多last-entry/upgrade/failure断言依赖10 | 使用真实10-prefix manifest保留所有R010专项行为/原Fixture；独立R011测试证明新latest，不放松旧内容约束                                             |
| active-support/activation-state/index-session中存在latest版本/升级序列断言     | 只把latest结构结果增加11；不改变图/来源/回滚等语义断言                                                                                           |
| 两份old oracle严格registry52/exact26                                           | 新manifest恰好1个，目标53/27；只改标题/结构总数，保留旧Fixture-ID与catalog0                                                                      |
| history ordinal JSON与C3-A普通排序对象的数字key编码不同                        | 两套既有语义各自保留；新history encoder用独立literal vectors，不能偷用C3-A排序实现                                                               |
| immutable历史不能靠事后修改制造负例                                            | 无效记录由隔离fixture在初始INSERT阶段明确构造；有效mutation触发器测试必须真实成功，不能disable FK/trigger或人工恢复旧库                          |

## 请求整包批准的本地测试权限

仅H1测试：内存/新建临时磁盘数据库、原迁移器升级/失败回滚、test-only literal历史seed、独立只读连接、实际close/reopen、现有25Storage测试及前序30纯Node文件。所有目录由测试新建并验证所有权后清理，关闭连接；不触碰现有用户库、R4或宿主管理worktree。没有进程spawn/crash、实际Native/helper/Rust/资源/校准/云端CI。H4真正生产事务/crash恢复、H5资格另案。

组件Fixture的历史seed不构成产品writer，不声称真实性或运行资格。无history/新空表不代表生产历史可用。H1 Exit仅LOCAL_R011_HISTORY_STORAGE_CAPTURE，B1-B2/C/D及P1-04/05/Phase1仍OPEN。

## 本轮证据

2321前序hash在计划开始匹配；15份原治理/设计文档完整快照保留。未创建产品/SQL/Fixture/test或运行build/DB；历史810测试/architecture17/registry52-26/catalog0未重跑。计划检查为新文档格式、链接、命令文件清单/重复路径、原文后缀和非文档哈希；最终receipt:.superpowers/sdd/2026-10-25-phase1-r011-history-capture/plan-review.json。

C1EPERM、四C2生命周期已用完、Native timeout UNKNOWN、main取消结算未查询、R4未触碰均保留。无需云端CI或重新下载产物，不操作预算/费用设置。
