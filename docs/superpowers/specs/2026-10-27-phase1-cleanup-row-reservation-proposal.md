## 清理行预留附约已批准 — 2026-10-27

用户明确批准清理行预留修订及集中实施包，继续原本地D..G。首次必要清理读取在TEMP分配前预留1行，加原构造5行共占用6行；占用为已花费＋仍有效预留，实际交付与预留证据分开。首次清理消费credit不重复扣行，额外close重试先付1行；预算错误不能吞成已关闭。未执行预留不伪称SQL已执行，不退款供已终止Stage复用。Stage到Store与更紧caller上限续接保留预留；COMMIT后cleanup失败保留真实提交身份、撤销lease并标cleanupFailed，不能重复Apply。credit私有，不进入owner、IR、history、wire、schema或公开预算receipt。该计数来自既有SQL步骤，不是新profile或数值门槛。

批准的是契约与原本地包实施，尚未声明测试/资源/Fixture/G完成。原始文档和失败如下保留；真实Native、校准/profile、新依赖、云端CI与Git写入等边界不变。

# Phase1 Stage 清理行预留修订提案

Status: PROPOSED / NOT_ACCEPTED / NOT_IMPLEMENTED。仅资源生命周期链暂停，原已批准本地功能/兼容检查继续。

## 依据与真实证据

[原Stage契约§4.1/§6](2026-10-25-phase1-r011-history-stage-contract.md)要求所有SQL交付行计入maxRows、保持同账本，并要求COMMIT后关闭失败仍返回已提交身份、撤销lease。原计划A1要求整操作exact/one-below，A2要求完整错误/恢复。现有契约没有明确清理预留与后续close重试的占用/消费时序，不能默认为免费，也不能改成提交后越额。

[独立审计测试](../../../packages/storage/test/mixed-analysis-cleanup-accounting.test.mjs)对实际Statement返回行与实际计费作差，预期来自SQLite交付和既有程序步骤，不从candidate usage生成golden。正常close及构造在两次epoch查询后失败，两组各证明：构造实际5行、构造预付5行、剩余预付0；清理PRAGMA temp.schema_version实际1行，新增计费0。两条真实RED保留，完整持久行不变。收据在原W目录cleanup-row-accounting-independent-red.*，首次观测cleanup-row-first-observed-close.json与constructor-failure.json。没有实际Native、RSS测量、校准或CI。

## 推荐规则

1. 保留maxRows总上限及所有原门禁。创建TEMP前，为首次必要清理读取预留1行；已有构造5行加首次清理1行，共占用6行。1/6是现有固定SQL步骤的派生计费，不是新默认值、profile、性能阈值或质量门槛。
2. 私有Stage账本按“已花费+仍有效预留”的占用量约束准入；独立观测区分实际交付与预留，不能把尚未执行的SQL记成已执行证据。既有H1公开/私有读取receipt语义、纯Runtime rows=0及四字段结构不改。Stage内部只多一个首次清理credit状态，不入owner正文、wire、Canonical IR、history或SQLite schema。
3. 预付在constructor原预留位置统一占用，读集剩余额度、所有preflight、Stage→Store续接与caller更紧额度都必须保留它。不能在COMMIT后才从已花完的额度追缴首次清理行。成功完整生命周期的独立精确行数包含这1行。
4. 首次实际清理读取消耗预留，不重复扣行；构造失败的拥有权核验/清理也使用同一规则。marker或连接已失效而不执行SQL时不伪造交付，预付不转为可复用的已花费退款；该Stage终止后无后续授权。
5. 首次关闭失败后，每次额外实际close读取都须先从剩余额度另付1行。不能复用已经消耗的credit，不自动重试；额度不足不执行未付费SQL，不伪称清理成功。预算错误必须传播，不能被liveTable的“无法证明仍是本表”catch吞掉并标记CLOSED。
6. COMMIT后close因SQL/资源关闭失败仍保留真实activationId、永久撤销lease并保留cleanupFailed诊断，禁止重复Apply。第一次清理额度先行保障不改变此结果契约；不把已提交图说成回滚。close只处理本实例TEMP和statement incarnation，不DROP他人的表。

仅动态给close扣行、没有先行预留，会让末尾额度不足直到提交后才显现，无法按原整操作准入计划证明固定清理完成。忽略清理行会违反所有SQL计费，均不采用。

## 同步与兼容

接受后同步原§4.1/§5/§6、ADR-020实现追踪、IMPLEMENTATION_PROTOCOL相关证据、WBS/Acceptance/Traceability/CURRENT_STATUS与原B1b计划。无迁移、依赖、Native/profile/校准、置信数值或公共API变化。原Fixture/历史失败全保留；旧纯函数/读取预算收据不重写，当前owner/manifest/Code/Syntax IDs必须保持。

[集中实施与验证包](../plans/2026-10-27-phase1-cleanup-row-reservation.md)随本提案一次评审。批准后直接继续原D..G，无需再拆微步骤；真实运行、CI/云端/Git等原边界不扩大。
