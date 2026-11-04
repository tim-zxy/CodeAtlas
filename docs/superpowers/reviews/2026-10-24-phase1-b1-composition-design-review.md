# B1 Native 组合候选：作者设计评审

日期：2026-10-24。类型：**AUTHOR DESIGN SELF-REVIEW**；沿用本会话顺序方式，无独立 reviewer、产品实施或完整集成验证。

[被审设计](../specs/2026-10-24-phase1-b1-composition-design.md)；[上一库实现评审](2026-10-24-phase1-code-syntax-producer-implementation-review.md)。

结论：**B1-A 的书面方向可提交用户审阅；尚未接受，也没有具体实施计划。B1-B/C/D 不具备实施条件。** 本轮确认上一回执 1406 个文件哈希匹配；既有 500 Node / 105 Rust / 18 库输出 / 架构 17 仅为上一批证据，本轮未重跑。

## 实码与契约评审

| 检查项 | 结论和证据 | 剩余限制 |
| --- | --- | --- |
| 一 Provider 一 snapshot | fact-merger-input.ts 明确拒绝相同 Provider 第二份 snapshot；拟在请求前分配同一 ID，组合后只进入一次 merger | 共享 ID 不证明一次真实运行 |
| 完整性和 outcome | Java/v5 成功条件分别验证；任一 PARTIAL 不产出成功组合候选 | class/wildcard 等原 PARTIAL 仍可能阻止候选；不能把该限制消掉 |
| scope 的诚实表达 | ProviderSnapshotSchema capability name 可表达精确限定字符串；提议三个 scoped 名称，无旧 descriptor 变更 | 新名称及消费语义待用户接受；生产调用者需另审 |
| Java v2 与旧 v3 | 使用原 Java v2 parsed request/events strict schema；不伪称新 Java 字节验证；旧 v3 全清单路径保持 | 原始执行身份、settlement 和真实 build 仍未认证 |
| Python owner 闭包 | v5 validator 确实把输出 Python 节点加入局部 owner map；不存在必须事先填写所有 Python owner 的结论 | Java provisional owner-stage 权限与最终完整候选仍需后续冻结证明 |
| normalizer / merger 复用 | normalizeNativeAnalysis、normalizePythonSourceObservation、原 merger 构造支持；不另造 FactKey/Evidence 编码 | 本单元仅 Native 投影；其他 Provider 支持属于完整仓库候选 |
| 输入与 mutation | 指定真实 byte 长度、strict data、重验 typed result、前置预算及中间表示重叠 | 精确对象/输入预算接口及复制时点在 writing-plans 固定；没有经验内存或 profile 声明 |
| 最终 basis 循环 | 纯组合不计算完整仓库 RepoBasis，也不提前建 Canonical SyntaxEvidence | 必须待完整 Code/support 与 source/history/stage 契约齐备 |
| 临时完成 vs 冻结 | temp-stage.ts 的 completed 后仍可归一化/合并；旧 seal 不是 mixed lease | 新 stage 冻结全部 mutator、close/rebuild/rollback 失效须 B1-C 独立测试 |
| 锁内 CAS | C3-A 公开 recheck 拒绝 ambient transaction；Store 拥有 BEGIN IMMEDIATE | 未来须 Storage 内部事务 owner 复用读集，无 caller 布尔旁路 |
| retained / removed | C3-A 永远 historicalSourceProof UNAVAILABLE；当前 Source 表不认证旧清单 | B1-B 独立契约；不复制旧 Evidence 假装新采集，不把初始全量当完整增量 |
| 迁移 | 实际 manifest 最高 R010，R011 未发布 reservation 是 framework_syntax | 无 SQL/新版本/checksum、无运行 DB；R011 完整物理设计另审 |
| 回退/恢复 | 本单元无持久副作用，失败无部分候选/自动重试；后续 Store 要 last-good/重启/完整回滚 | 旧 v3 与 R4 不改，迁移不能用回退数据库替代恢复设计 |
| 原证据/门禁 | 新设计不修改旧 Fixture、协议或已接受条款；只新增 proposed 入口 | C1 EPERM、C2 已用尽、历史 timeout UNKNOWN、B0b-3/B1/C/Phase1 均 OPEN |

## 作者决定与代价

- 推荐先完成全量声明 Native 投影的纯组合，保留 changed-only 为后续 B1 必需工作。代价：这一批本身不会使产品可用或完成增量，但能独立验证 snapshot/scope/支持构造。
- Java 复用现有 parsed v2 验证，不新增第二套原始流 decoder。代价：本单元不提供 Java 原始 request checksum 或真实传输证明。
- 三个 scoped capability 名称是待批准设计，只有明确 scope 下的结构成功含义。代价：后续生产消费者需明确识别；不能借 schema 接受任意字符串广告泛化能力。
- 两阶段 owner/最终 basis 保留，Canonical Syntax 建立留给完整仓库候选。代价：第一单元只保存 wire Syntax 与来源，不能对外称为已发布 Canonical Syntax。
- 不写没有完整 retained/retirement 与 Syntax-support 契约的 R011 SQL。代价：持久化实施仍阻塞；这不是降低原验收条件。
- 沿用作者自评与手工证据收据，不建新会话/工作树、不提交。代价：没有独立审查或 committed diff 范围；合并前仍需适用的评审。

未发现本书面 B1-A 内尚未分类的 Critical/Important 设计冲突；精确 API、输入记账和 Fixture/命令仍需接受方向后形成具体计划。该判断不覆盖 B1-B/C/D，也不替代任何产品测试。

## 决策与后续

只请接受或调整设计 §3/4 的推荐 B1-A 方向及 scoped capability 语义，然后进入 writing-plans。尚未创建实施计划、Fixture 或产品代码；不申请迁移、真实 Native/helper、校准/profile 数值/新依赖、生产接入或云端操作。进一步实现必须以已接受的具体计划为依据。
