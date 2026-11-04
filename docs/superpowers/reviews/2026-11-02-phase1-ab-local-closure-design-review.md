# Phase1 A/B 合并包作者设计审查

2026-11-02；REVIEW_READY，未获实施批准；作者审查，不冒充独立评审。

审查入口：[精确合同](../specs/2026-11-02-phase1-ab-local-closure-contract.md)、[U0–U7实施计划](../plans/2026-11-02-phase1-ab-local-closure.md)。本轮只修改文档和本地设计索引，未运行产品测试、Source解析、Rust、SQLite或云端CI。

## 交叉检查

- 兼容：wire8/Syntax4/context5隔离；旧版本拒绝新字段、原17流兼容、强制全量重观察分别由U1/U2/U3验证。不是修改旧版本来吞新字段。
- 语义：参数求值scope、直接值连接和callback fence有明确规则，Unsupported/shadow/复杂写/未知资源保留负控制；U0独立oracle，U2真实producer，U4统一绑定。
- 图：RuntimeSitePlan绑定真实Code CALL精确引用，原Code图不变；本仓声明覆盖目的和跨仓解析状态明确分开。U4负责未配对CALL和callback，U5负责实际跨仓。
- 存储：同Stage/live lease预提交视图→Application派生→一次联合事务，候选V2摘要绑定derivation；现有JSON容器版本2，不改DDL。U3/U5检查旧历史、CAS、原子性、重开和last-good。
- 策略：既有规范0.5的新增用途明确列为待审批合同，未冒充已获准或经验校准。E02缺批准critical baseline仍NOT_EVALUABLE，P1-20和A6不由本包代验收。
- 操作：固定12Source（7Java/5Python、5新Source待批准后创建）；2批离线编译、4个默认定向测试入口及必要的有原因范围内复验一次审批，无自动重跑到绿。Java请求maxEvents选择10000明确披露，不伪称沿用20-event小样本。
- 效率：共享索引/一次注册/集中验证、复用旧证据；没有逐字段批准、完整故障矩阵扩张或新代理。本包止于A/B，不自动授权C/D编码。

## 审查修正与限制

已修正§7旧candidate摘要表述，使V1兼容与V2派生计划绑定一致。已把Graph恒PARTIAL、回调同步CALL重复和提交前读取未提交Syntax问题纳入同包，没有留到实施后再拆审批。

当前无已知阻止提交用户评审的设计缺口；这不证明未来实现和实际运行必然通过。源码owner真实性、有限请求cap、负控制与Source oracle均为实施停止条件。新证据揭示FROZEN冲突时停止相关链并集中治理，不能降门禁。

## 可审批结论

一次批准精确合同、U0–U7、计划列明的本地Node/owned SQLite/库级Rust操作和同范围必要纠错复验后，沿本会话顺序执行，不逐任务询问。生产CLI、collector、物理profile/校准、模型、新依赖、用户DB、CI/Git写入、新代理均不在授权中。父项仍4/21接受、17 OPEN。
