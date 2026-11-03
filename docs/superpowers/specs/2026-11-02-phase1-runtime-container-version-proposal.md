# Runtime activation 容器版本最小修订

状态：APPROVED / IMPLEMENTED_LOCAL_COMPONENT。只修订原已批准 A/B 合同 §7.1 的存储版本位置；原 U0–U7 其余授权继续有效。

## 已证实的冲突

原合同要求 runtime_activations 的 schema_version=2，并禁止改 DDL、迁移、checksum 或历史行。实际 R012 的 packages/storage/migrations/repository/012_execution_graph.sql:13 为 CHECK(schema_version=1)。owned SQLite 联合事务首次真实写入被 SQLite errcode275 拒绝；原异常见 .superpowers/sdd/2026-10-31-phase1-b-remaining-execution/ab-local-closure/store2-diagnostic.log。原安全包装报 INVALID_CANDIDATE，不是未知提交、资源失败或 Native 超时。

原迁移未改。失败事务回滚，未切新 Canonical/Runtime 指针；失败测试保留，不记通过。诊断仅临时记录可重建 dist 的原异常，try/finally 已恢复原字节。

## 推荐：SQL 外壳仍为 1，JSON 内显式格式 2

- SQL 列 schema_name=codeatlas.runtime-activation、schema_version=1 保持原 R012 容器；不接受 SQL 版本2，不修改任何迁移或 checksum。
- 旧 payload_json 继续严格使用 {identity,candidate}，缺省格式仅代表旧格式1；旧写入 JSON、摘要域、键与历史行不变。
- 新 payload_json 精确使用 {formatVersion:2,identity,candidate}。formatVersion 只分派内部 activation JSON 格式，不是 SQL schema 升级。新 candidate 必须携带既定 RuntimeDerivationV2；旧格式拒绝 derivation，新格式不得缺 derivation，未知版本或额外字段拒绝，不自动降级。
- 保留已批准 runtime-candidate-v2、runtime-policy-v2、Syntax4/当前支持认证、完整 site-plan 与同 lease/Source/CAS、单事务、只读重开/unknown commit 恢复。value_digest 继续认证整个实际 payload_json；新旧格式不能相互覆写。
- V2 查询/收据显式标明 LOCAL_DECLARED_RUNTIME；旧查询继续只接受旧格式。SQLite authoritative、LLM candidate-only 和 AUTO/MANUAL 边界不变。

这是修改已接受的 schema_version=2 文字，不是实施者可静默决定的编码细节。依 AGENTS.md Design governance，相关写入暂停到本提案批准。无需因本字段位置修订重新审批其余已批准任务。

## 比较与排除

|方案|代价与结论|
|---|---|
|JSON 内 formatVersion=2（推荐）|复用现有 JSON 外壳，无迁移/回填/用户 DB 升级；严格区分内部格式。|
|新增迁移放宽 SQL CHECK|涉及重建旧表、外键与恢复设计，超出原不改 DDL 授权，当前不推荐。|
|改旧 R012 / 绕过 CHECK / 假装版本1候选|改变冻结迁移或隐藏格式差异，拒绝。|

## 批准后的集中实施与最小验证

1. 仅修订 runtime-fact-store.ts 的 activation 外壳写读分派；Mixed Store V2 仍复用原一次事务。完善现有 owned SQLite 联合测试，断言 SQL 列1、JSON formatVersion2、准确 membership 与候选/策略摘要、旧入口拒绝、只读重开以及一个新格式损坏拒绝；不复制全故障矩阵。
2. 同步原 A/B 合同/计划、SQLite规范相关容器说明、CURRENT_STATUS、验收/追踪准确段落及唯一 B results/progress。旧版本与原门禁不放宽。
3. 继续原 U5 的固定 Application/Runtime/跨仓组合及 U6/U7 范围匹配验证、原范围修复；不再逐框架、字段或测试询问。原未获资格/E02/生产/CI仍独立。

准确当前改动文件：packages/storage/src/runtime/runtime-fact-store.ts、packages/storage/src/analysis/mixed-analysis-store.ts、packages/runtime/test/framework-surface-publication.test.mjs。摘要共享 helper 位于 packages/ir/src/runtime-identity.ts，采用 runtime-site-plan-v1 对规范 JSON 单项 tuple 取 SHA-256，纯实现身份不增加业务数值。后续 Runtime 必须复用该 helper。

不包含新依赖、profile/阈值、Native/collector/helper、用户数据库、云端CI、Git写入、新代理或新工作树。所有失败与旧 Fixture 根继续保留。

2026-11-02用户批准Runtime容器最小修订：SQL schema_version=1，严格JSON {formatVersion:2,identity,candidate}；旧{identity,candidate}及迁移/checksum保持，未知格式/混格式拒绝。真实owned SQLite联合Code/Syntax/Runtime、准确membership/activation、旧入口拒绝、只读重开及坏格式拒绝1/1通过，见ab-local-closure/store2-approved-green-02.log。首次负向UPDATE被原R012_IMMUTABLE拒绝，已改为仅disposable Fixture新增坏子行，未禁用触发器或修改迁移；该失败保留store2-approved-green.log。原SQL版本冲突HOLD由本批准及新证据限定解除；原失败记录不删除。原U0–U7继续，完整factory/SPI、Application/Runtime与跨仓、U6/U7仍待，无新Native/CI/Git。
