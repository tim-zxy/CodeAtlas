# Phase1 Stage ABA 与 Store 组件作者评审 — 2026-10-27

结论：已批准 ABA 修订实施，Store 真实事务、恢复和磁盘崩溃基础接入。AUTHOR_COMPONENT_REVIEW / PARTIAL_LOCAL_ONLY，不是独立整分支评审、原 Stage66/Store43 验收、G 退出或 Phase1 完成。原 D..G 批准保持，不再逐小步骤确认。

## 依据与实现

用户明确批准 [ABA提案](../specs/2026-10-27-phase1-stage-aba-witness-proposal.md)，解决此前自动审批所指缺失授权。修改前8653个前序hash全部核对；旧拒绝、RED、首轮编译/行为失败、全部独立目标和文档原文均保留。原C工作树HEAD cc5a8cb，无Git写入，D目录旧状态未用于实施。

Stage私有total_changes/data_version在构造及每次复核按实际两条数字SQL行计费，构造预留3→5；自己的TEMP真实INSERT成功才推进预期写数。不进入IR/wire/owner/hash/用户配置，不改变阈值、默认值或profile。Stage37含同/另连接pointer ABA；Store锁内同/另连接完整行往返也拒绝。

H1私有读取复用同一核心，Store私有锁内入口要求真实事务，旧public读取仍拒ambient。WeakMap lease先APPLYING再BEGIN IMMEDIATE；锁内完整TEMP seal、Source/Code/support/snapshot/coverage/history和见证均再核验，Providers不在锁内调用。固定SQL写旧关系后重算实际Code身份等于冻结basis，清R010派生状态，再写严格不可变Syntax/history/member，pointer最后写；同ID只精确复用，旧四writer源码不改。

原操作预算续接Stage花费/保留量，不复位。完整有界before/after持久行图像及实际SQL/编码均计费。私有恢复自己打开新readOnly连接，在同一只读事务验证H1和全部行图像，只判COMMITTED/NOT_COMMITTED/INCONSISTENT，不修库、不重试。已提交后清理失败仍返回提交身份，并记录私有cleanupFailed；lease永久失效。

## TDD、作者发现与修复

1. Store前已有missingAPI RED10及三组独立完整SQL目标。首轮SQL字面量转义和EntityId品牌类型构建失败保留；复用RepoBasisSchema修正。首次可调用10/10。
2. 边界RED5证明BEGIN实际成功后抛错泄漏事务及缺失恢复/清理收据。入口已拒ambient，故在实际BEGIN前标记自己的所有权意图；回滚不碰caller事务。五项转绿，随后15/15。
3. 真full重建RED发现EVIDENCE DTO的providerId位于providerFact内，修正两个共享访问，foreign/零事实拒绝保持。新辅助误给非null full wire basis被旧解码正确拒绝；更正为原full-null后，Storage错误等同wire basis与owner旧basis再次RED。仅修正新Storage为FULL-null/DELTA-actual，owner正文仍绑定真实旧basis及parent，经stageDigest与Store CAS；不改原wire/hash/parent/旧full门禁。full准确parent、旧支持SUPERSEDED、旧coverage保留及仅删delta转绿。
4. 19类实际SQL/提交/清理边界分别异常和真实Node退出38/38；新只读重开逐行比较全部持久表。提交后两类与产品前独立目标一致。退休使用独立已提交Python目标的非空旧支持；native-state-clear目前是实际DELETE语句边界，尚未代替带有效旧R010状态验收。
5. 作者生命周期RED4发现closed lease误作伪造、APPLYING.apply过早tombstone、清理失败后CONSUMED错误分类及ROLLBACK失败错误确定化。只修正私有生命周期：APPLYING保留entry但禁止再消费，settlement/close永久tombstone；CONSUMED读资格STAGE_RELEASED；回滚失败沿用COMMIT_OUTCOME_UNKNOWN，原writer事务仍开时只读判定INCONSISTENT。原Fixture状态矩阵不改。4/4转绿。
6. 真实APPLYING四种非法方法、Store ABA和极小整账本预算拒绝10/10。只证明不复位/不发布，不代替独立exact/one-below参考。

## 新鲜验证

本包run.mjs：store-component-final-cohort，15文件 **609/609，0fail/cancel/skip/todo，128070.6081ms**。包含Stage37、Store69（19个真实Node退出）、Runtime新验证/原组合、H1/Code读、原raw/history、四个旧Store相邻回归。组间重叠，不累计历史通过数。

store-author-lifetime-build及store-component-runtime-build exit0；store-component-architecture为17项目通过。新检查点另核原2241 Fixture字节、registry61/exactPhase1 35/catalog0。不能把组件数当根注册或原Fixture签收。

## 剩余与范围限制

- 原Stage66/Store43须逐项映射验收，包括更完整delta、真实竞争、有效旧R010状态清理和legacy指针组合；当前69个Store组件测试不替代43项签收。
- 独立整操作预算reference/exact/one-below/unsafe预检OPEN；不得以实现usage或动态成功边界回填expected。
- 当前组件仍引用.superpowers中的独立输入/目标。G前须按原Fixture范围整理可携带材料并核来源；不能提交.superpowers或声称干净checkout/CI已就绪。旧证据全保留。
- 较宽legacy/orphan快照完整原文恢复OPEN；缺可信diagnostics仍FULL_ANALYSIS_REQUIRED，不伪造空数组。生产路由、真实Native/采集器、profile/运行资格关闭。
- D/E/F IN_PROGRESS，G OPEN；B1b/P1-04/05/Phase1未完成。当前无新增待批准数值/依赖/CI，原D..G可继续顺序推进。本次仅作者组件评审。

历史Native timeout根因仍UNKNOWN，不称fixed/flaky。C1 EPERM、C2 spent生命周期、R4 mutable非pristine、R1丢报告/依赖时序证据缺口及main取消结算未查询保留。无Native、校准、依赖安装、云端CI、Git写入或用户DB操作。
