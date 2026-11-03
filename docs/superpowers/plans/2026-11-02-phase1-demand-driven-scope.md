# Demand-driven scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans，当前会话顺序执行；不新增代理/工作树、Git写入或清理证据。

**Goal:** 消除augment中没有消费者的scope查询，在原cap下验证Spring及既有Source/预算控制。
**Architecture:** 唯一产品/测试文件binding_sufficiency.rs，复用原effect match后按需调用scope；无缓存、新协议或依赖。
**Tech Stack:** 已锁定Rust1.98.1、现有grammar/serde_json/sha2、原Node严格reader。
**Spec:** [精确修订合同](../specs/2026-11-02-phase1-demand-driven-scope-design.md)。PROPOSED，待一次产品修改与定向Rust批次批准。

## Global Constraints

不改cap/profile/数值、scope/UNKNOWN/coverage意义、Source、wire/IR/history/SQL或公开路由。Source只读；固定原Spring request，deadlineEpochMs=null，按原maxDurationMs建立新调用deadline。原工具身份、Source/request/lock/旧raw先核对，不下载安装。

## Review Focus

未使用scope查询必须确无消费者；unsupported/block限制不能因continue漏掉；真实scope/control访问仍计费；ancestor测试必须证明真实消费者；Spring仍失败则保留并停止，不能改成预期失败来转绿。

## T1 — 独立回归和RED

- [ ] 封存binding_sufficiency.rs、原Spring请求/Source/17 oracle输入和现有r5原raw身份；复用原B唯一账本，新子目录scope-demand，不全仓封存。
- [ ] 在原cfg(test) tests内补默认ignored的binding_scope_demand_spring。原request按字节读取不重建，真实decode/writer，用原cap；新输出通过CODEATLAS_SCOPE_DEMAND_OUTPUT绑定新owned目录并要求为空/create_new。
- [ ] 祖先预算测试保持原Source/阈值，补合同规定的独立assignment种子；原件保留，不改其ResourceLimit预期。
- [ ] RED固定命令：cargo test --locked --offline -p codeatlas-native-analyzer --lib binding_sufficiency::tests::binding_scope_demand_spring -- --exact --ignored --test-threads=1。保存失败raw，预期原RESOURCE_LIMIT_EXCEEDED；若失败是准备错误，定位修正不伪称行为RED。

## T2 — 唯一产品改动和集中GREEN

- [ ] 依合同在第二轮移动scope求值，复用原effect match，不复制kind分类逻辑、不改原scope/control/tick函数。保留所有限制与实际计费。
- [ ] 格式化单文件、冻结最终身份。主GREEN固定命令：cargo test --locked --offline -p codeatlas-native-analyzer --lib binding_sufficiency::tests:: -- --include-ignored --test-threads=1。
- [ ] 此filter仅原3个测试＋新Spring ignored测试，共4测试；原oracle读17份Source，另有两个小型库级预算控制，Spring1份。准确数量执行前按当前注册再次核对，不扩为全库。
- [ ] RED与GREEN使用不同空owned目录。GREEN显式设置CODEATLAS_BINDING_SUFFICIENCY_OUTPUT为新的compatibility目录保存17份raw；清除旧FRAMEWORK_SOURCE_OUTPUT等采集环境，不能写r5或诊断目录。
- [ ] 默认两次Rust库命令：RED定向1次、GREEN集中1次。允许最多一次仅修已定位的新实现/测试准备缺陷后的定向或原GREEN复验，必要时用另一个新owned目录；原cap仍拒绝/未明失败不具纠错资格，不自动重试到绿。此条件额度一并列入批准，不逐微步骤再问。

## T3 — 离线桥与文档收尾

- [ ] 用现有严格wire7 reader重放新Spring/17 raw，逐事实与coverage对照原独立oracle/r5完成输出。只读解码不调用Source/Native；差异不删除或伪造。
- [ ] rustfmt --check单文件、node scripts/check-architecture.mjs、必要离线reader/Fixture检查；不重跑Node163/52、全仓/collector/CLI/模型/用户DB/校准。
- [ ] 作者审查唯一diff；CURRENT_STATUS先备份旧字节再追加，单一results/progress、受影响预算设计/追踪/验收补记同步。原失败原件保留，组件退出与父项验收区分。

## 批内连续执行与停止

批准后T1–T3及必要范围内修复连续执行，不逐步骤询问。新字段/分数/依赖/预算值、真实CLI/helper/collector/模型或云端/Git仍不在本包内。源码与结果冲突先判实现/Fixture/设计；无法证明scope结果未使用就停止该改动，不牺牲检查。

若Spring仍失败或旧事实不一致，保留HOLD与准确原因，不提高预算、不弱化断言。即使全通过也不关闭四框架发布/原Evaluation/物理资格或Phase1父项；4/21、17OPEN保持。


## T1/T2/T3 已完成（局部范围） — 2026-11-02

用户明确批准后顺序完成全部任务；上方checkbox保留原执行前清单。红绿/原件/准确命令见[实施作者审查](../reviews/2026-11-02-phase1-demand-driven-scope-implementation-review.md)及原B唯一索引scopeDemand。RED原限额拒绝，GREEN4/4/26filtered，17 Source字节一致，reader18/18，格式/架构通过；两次主Rust、条件复验0。Spring完成观察但PARTIAL，预算回归退出而框架/Phase父项仍OPEN，不提高cap、不弱化断言。
