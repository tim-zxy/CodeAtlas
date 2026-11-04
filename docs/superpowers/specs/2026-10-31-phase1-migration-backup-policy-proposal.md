# 已批准补记 — 2026-10-31

用户明确“批准最小修订，继续原 B5–B6”。五个未发布迁移仅新增结构、backupRequired=false，无旧行转换/回填/down；原true拒绝保留。下方PROPOSED是审批前原文，不再是当前授权。批准不等于实施验收。

# B5 迁移备份标记修订提案
2026-10-31；PROPOSED，等待用户一次确认。本提案不自行修改迁移或原runner。

## 实码核验与问题
已批准B批设计§5要求R012/R013/W004/W005/W006的backupRequired=true，并“复用现有runner”。实际 `packages/storage/src/migrations/runner.ts` 的applyMigrationPlan在任何pending迁移要求备份时立即抛MIGRATION_BACKUP_REQUIRED；并无备份编排。SQLITE_SCHEMA的Executable migration runner明确规定该行为。

本轮原测试 `backup-required migration is refused before mutation` 单项1/1，证实version仍0且backup_probe表不存在。原守卫、旧SQL/manifest/checksum均未修改；尚未创建这五个迁移或执行它们。不是迁移已通过。证据：`.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/backup-guard-proof.log`。

## 推荐：仅修订五个尚未发布的标记
将本包五个迁移明确限定为**只新增表、索引、触发器和关系，不改写既有行，不做猜测回填、不down、不删除或替换旧对象**，backupRequired改为false。沿用R011的新增结构策略与原runner逐版本事务；失败只回滚当前版本，已经成功的前序版本仍保留，不能宣称整批回滚。

准确范围：
- repository 012_execution_graph.sql、013_runtime_flow.sql及其两条manifest；
- workspace 004_services.sql、005_contracts.sql、006_workspace_execution.sql及其三条manifest；
- 同步统一设计§5、SQLITE_SCHEMA/ADR-020实施补记、验收/追踪和B5任务包。
- 现有backupRequired=true的拒绝门禁不改，不加allowBackup、假receipt、手工user_version或异常后fallback。
- 若准确SQL需要改写/重建旧表或旧行，则本推荐的条件不成立，暂停该迁移重新治理，不能擅自沿用false。
- Store正常受授权的后续事务与本节“迁移不能回填旧行”是不同操作；既有lease/Source/CAS与last-good继续保持。

选择理由：本包原定即为新增schema，原计划没有数据转换；当前为它另建备份、保留、竞争、恢复与文件权限系统会增加尚未批准的产品面。这里明确申请调整刚批准的设计标记，不能由实现者以“最小化”为理由自行取消。

## 另一条路线
保留true，先另行设计Node内置SQLite备份编排。现有Node具备backup导出，但没有现成生产工作流；覆盖目标文件、WAL一致性、并发变化、备份资格、错误/取消与只读恢复均需明确。不能只复制主.db、绕过runner或自动恢复用户库。本提案不把该路线当已获空白编码许可。

## 审批后的合并实施计划
使用executing-plans在原B5→B6连续执行，无逐表/步骤审批：
1. 先冻结新空库和R011/W003升级的独立预期，包含旧行/旧checksum保留、原事务失败和重开。
2. 写准确的五个纯新增SQL，审查无旧行转换；通过原runner迁移测试拥有DB。
3. 同原已批准包完成同连接Syntax+Runtime/Flow原子写、workspace冻结binding、Application/Runtime接线；必要原范围修复统一处理。
4. 一次去重集成/构建/架构/注册检查与整包作者评审。无法满足原Source/Evaluation/物理资格的项目仍HOLD，不能因标记调整验收父任务。

原B1–B6批准继续有效；本次仅审批上述五标记和新增限定，不授权用户数据库升级、真实Source/Git/Native/Rust/helper/collector、模型、profile/数值/依赖、CI或Git写入。不要重跑已经完整保存且未受影响的回归。

依据：[统一设计](2026-10-31-phase1-b-remaining-design.md)、[原任务包](../plans/2026-10-31-phase1-b-remaining-execution.md)、[SQLite规范](../../handoff/specs/SQLITE_SCHEMA.md)。
