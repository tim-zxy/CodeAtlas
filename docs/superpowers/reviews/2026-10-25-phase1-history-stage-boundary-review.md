# 历史捕获与 Stage 联合设计提案：作者启动评审

日期：2026-10-25。评审对象：[联合设计提案](../specs/2026-10-25-phase1-history-stage-boundary-design.md)。结论：**可审阅设计方向；尚不能转实施计划**。本次是作者自审，无独立评审或运行资格证明。

## 已确认的关键边界

- 前序验收receipt全部2288个hash匹配；810项测试、architecture17及registry52/26/catalog0仅引用前序结果，本轮未重跑。
- 旧full投影入口要求完整projection且拒绝removed；不应为增量桥接放宽。新路径复用validator/normalizer/selector，避免复制Canonical算法。
- C3-A真实capture仍明确UNAVAILABLE历史；不可将其handle视作已捕获历史。新历史读取要能验证待退休旧Source引用，并保持旧C3-A拒绝ambient transaction的公共契约。
- 临时stageDigest与最终Code digest必须分离。Java请求owner来源与Python严格stream自带节点的owner来源不同；若预先要求全部最终Python owner，会制造时序循环。
- 原观察/Evidence历史与当前membership/投影分离，Source service仍独立CAS。SQLite/R011不得成为未经联合提交的第二真值源。
- 分包的本地测试可以先实现，但生产Store/Runtime路由必须在历史/Stage/原子提交及真实准入齐备后开放；H4的组件测试不授予H5的真实Native权限。

## 转实施前的阻断项

| 缺口                                                               | 关闭方式                                                                                           | 归属     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| R011目前只有reservation，未有完整DDL/版本/备份/升级失败与FK设计    | 独立物理设计、migration兼容与故障Fixture，保持R001..R010字节；不能把未发布当作可随意改范围         | H0       |
| 从纯声明到真实capture/owner/lease没有精确API与预算/错误契约        | 明确私有connection/incarnation所有权、完整读计划、数值预检、状态转移、消费/失效和可重现边界        | H0/H1/H3 |
| 无历史时现有纯增量入口拒绝；不能用它做首次bootstrap                | 单列经过验证的full建立路径；foreign支持需其Provider有效重验证/已授权撤销，不能Native-only代认证    | H0/H4    |
| 最终Code身份的构造、Syntax投影ID/FK和retained Syntax重验证尚未冻结 | 在不改变旧Code/owner-map编码的前提下定义计算与持久投影，旧观察不可变，独立literal身份/引用Fixture  | H0/H3    |
| scope与raw→normalized→单位/coverage、累计预算尚未精确到字段        | 明确局部scope来源、请求/输出owned快照、parsed-only provenance、所有表示收费和旧边界兼容            | H0/H2    |
| 所有旧writers/readers的兼容矩阵和事务故障点尚未逐项枚举            | 找到每条调用路径，同指纹支持变更、Source race、rollback、实际重开和legacy summary不兼容全有Fixture | H0/H4    |

这些是下一份完整设计的阻断项，不是本轮代码缺陷，也不是已通过门禁。提案明确单列，不以“待实现者决定”绕过。当前不存在可批准后直接编码的精确计划。

## 工作方式与验证

使用brainstorming和Ponytail full做设计核验；writing-plans已读取，但依据其“have a spec”前置和brainstorming审批门禁，本轮未产生实施计划。用户要求原会话顺序推进，覆盖技能的subagent/commit默认流程；因此无subagent/commit/new worktree。

本轮仅新增本提案/本评审、CURRENT_STATUS设计登记和本地证据。完整性、相对链接、两份新文档格式、状态原文后缀和范围差异检查见.superpowers/design/2026-10-25-phase1-history-stage-boundary/design-verification.json。未运行build/测试/DB/Native/helper/CI，不下载产物。C1EPERM、C2生命周期、timeoutUNKNOWN、main取消结算和R4状态不变。
