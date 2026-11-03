# Evaluation Code投影与当前SQL版本兼容修订

日期：2026-11-03。状态：APPROVED / IMPLEMENTING，用户批准后顺序实施。

## 实证与原因

集成准备完整普通root发现六条真实录制流→Application Apply→SQLite发布/重开用例失败。原工作树单项复现也失败，见原B证据 integration-preparation/evaluation-current-schema-red.log；不是源码投影特有问题。正式 openRepositoryIndexSession 加载已批准R013完整计划，创建SQL13库；私有 readStateRows 却硬编码只接SQL10，readPhase05PublishedState 将该拒绝传播为 Evaluation stored state unavailable or invalid。

此前五项历史reader单测明确固定R010测试库，只能证明原10契约，不解决正式IndexSession当前13库的读取。不得把这六项改为预期失败、手工降级PRAGMA、替换真实Apply、改写旧迁移/expected或跳过门禁。

## 推荐最小方案

仅扩展私有 Evaluation Code事实投影的准确SQL准入集合为 **10或13**。复用同一既有实现，无新公开函数、版本包装器、配置、SQL迁移或数据回填；10的行为保持。11、12及未知/未来版本继续拒绝，不使用 >=10 的宽范围规则。

13沿已批准R011/R012/R013的纯新增结构。reader只读原明确列出的repository/Source/Code/support/coverage/native-pointer列，不新增Syntax/Runtime解释，不声称完整Phase1 Evaluation通过。原只读query_only、Source/事实/支持校验、同snapshot/外层事务所有权、累计行/字节/时间预算、失败与取消、Native READ_SEAL独立准入原样保留。Native pointer仍仅PRESENT_UNVERIFIED；profile不匹配仍拒绝Native实读。

这属于私有EVOLVABLE兼容修订，不变更provider-independent Canonical IR、SQLite authoritative、AUTO/MANUAL或任何FROZEN核心模型；但扩大原精确schema准入，超出本次明确的输入迁移/总数集中/54项格式治理，实施前须用户集中批准。

另一方案是保留旧入口并新增13专用reader与helper分派；同一投影会多一组私有端口和维护点，没有新的语义需求，故不推荐。保持只接10则正式当前Store的六项原门禁持续失败，不能作为集成就绪。

## 验证及追踪

- 既有六项 pinned-sqlite 真实Apply/失败回滚/readonly重开用例继续使用当前正式IndexSession与旧独立golden，全部必须通过。
- 在现有evaluation-retained-state测试与既有Phase05 Evaluation Fixture登记准确schema矩阵：10保持、13成功；11/12/未来14拒绝，非query_only仍拒绝。版本值来自已存在迁移序号，不是新profile数值或Quality Gate阈值。
- 原R010 reader的预算、外层事务、Source并发、损坏/引用拒绝控制继续执行；不删case，不降低门槛。正式13成功的Code投影不得授Syntax/Runtime或Native资格。
- 只修改 packages/storage/src/analysis/evaluation-state.ts 这一产品文件；测试、既有Fixture输入注册与 docs/handoff/specs/EVALUATION.md、SQLITE_SCHEMA.md、DESIGN_TRACEABILITY.md、CURRENT_STATUS.md 同步。无新Fixture ID、依赖、SQL版本或公开export。
- 按已批准最小验证策略：定向RED→GREEN、受影响Storage/Runtime构建及IR类型/架构/具名格式；复用首轮已通过且未受影响的完整root证据，原失败保留，不机械重跑全部资源矩阵。必要范围修复与复验统一处理。

## 集中执行边界

批准后直接衔接原集成准备整包：schema兼容修复、原scope修复复验、完成尚未运行root组、文档和作者整包评审、逐路径暂存与既有工作树本地候选提交连续完成，不逐任务询问。

不含Native/Rust/collector/helper实际资格运行、校准/profile数值、新依赖、用户数据库升级、云端CI/push/PR/merge或新代理。当前编译身份没有匹配profile的云端前置缺口独立保留，不以本修订关闭A6/E02或Phase1。
