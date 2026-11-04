# Phase1 Java owner 真实规则与 Stage 资源作者评审 — 2026-10-27

## 结果与边界

沿原批准A-local D..G继续。新增真实Runtime Java owner回调两项资源参考，以及三组Stage上下文的构造/owner六项，共8项新检查。首次回调2/2、初始Stage4/4、已有非空基线Stage2/2；最终五文件集中51/51，0fail/cancel/skip/todo，架构17项目通过。产品源码/dist、依赖、迁移和根注册未变，不重复构建、Native或完整长回归，各次重叠不累计。

原意图109/109绑定、原Fixture整体签收0，主任务4/21接受、17未关闭，D/E/F IN_PROGRESS、G OPEN。这是完整Java owner回调及对应Stage owner阶段的资源证明，不是非空观察/封存/Store整操作、OS/RSS或真实Native资格。本报告为作者局部评审，不替代独立整包评审。

## 依据、输入与模型

依据[Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md)、已批准[清理预留](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)及[连续执行计划](../plans/2026-10-27-phase1-consolidated-execution.md)。复用冻结[非空Code/H1模型](2026-10-27-phase1-nonempty-read-resource-review.md)、既有原始Java/Canonical配对及Stage调度；没有新契约、身份方案或数值政策。

新增六份库内材料：`independent-java-owner-resource-model.mjs`、`java-owner-resource-reference.json`、`independent-java-stage-resource-model.mjs`、`java-stage-resource-reference.json`（均在原Stage Fixture根），以及对应Storage测试两份。独立模型仅导入Node标准库及同目录独立模型；测试通过已封存corpus loader读取库内gzip资产，核对manifest、资产及原payload摘要，不依赖私有W输入。

闭合语料的Provider节点种类为 `java.class` 与 `java.compilation_unit`；模型不冒充任意Java节点类型参考。Canonical字段、factKey与ID使用既有tuple域和长度前缀独立推导，并在产品调用前与原端口实现前冻结的完整节点一致，不调用新产品或读取usage生成预期。

Runtime模型逐项计算完整callback input own/encode/parse、metadata/target/Source清单、path/id字节键、完整scope、locator帧、Java request/events硬序列化、parsed stream、Java查找、normalizer中间形状、两个identity tuple与完整结果/usage的全部逻辑成本。两个纯Runtime回调逐字段比较完整结果及四个非零预算维度exact/少一；rows实际0，调用上限1只是既有正整数接口见证，不记为交付或profile。

## Stage接续

初始Java-only与混合Java/Python两组复用原stage-observation独立输入；构造时尚无Canonical Code激活，不能称初始库已含非空Code。第三组复用retained Java/Syntax的已有非空Canonical/history基线，Source/Code/不可变历史原字节不变；只在新测试元数据中声明fresh snapshot并匹配该冻结目标、清单与repository locator，纯声明式适配在任何产品调用前完成，不构成实际Native观察或运行资格。

Stage独立账本覆盖累计H1、setup5＋首次清理预留1、CAPTURE全字节、scope/native unit身份、Java metadata roundtrip、真实callback完整receipt导入、结果own/encode/parse、controlledJava逐Source/节点二次检查、第二次完整context重查、Java行摘要以及完整owner身份/TEMP写入。初始两组owner正文和stageDigest另与原冻结Stage预期一致；已有基线核对原准确activation parent及旧basis。真实规则端口每次成功owner恰调用prepareJavaOwner一次，validateObservation/compose不调用。

构造和owner各自五维exact/少一、完整账本/TEMP/owner原字节、首次预付清理通过；全部持久表及新只读连接不变。清理零追加不是零SQL，测试没有自动重试、修复库或绕过guard。

## 证据及保留

证据目录 `.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/`：

- `independent-java-owner-resource-first.*`：真实Runtime两项2/2。
- `independent-java-stage-resource-first.*`：初始Stage四项4/4。
- `independent-java-stage-active-first.*`：已有非空基线两项2/2。
- `java-owner-stage-resource-final-scope.*`：最终五文件51/51，含新8、原Runtime validation32、非空H1 5及清理6，不与前轮相加。
- `java-owner-stage-resource-architecture.*`：17项目通过。
- `java-owner-stage-resource-verification.json`：不可覆盖后继封存，前驱 `nonempty-stage-resource-verification.json`。

补记前前驱9,597项哈希全相同，旧Fixture2,327及产品374文件原字节保留。已有基线扩充前、全部新文件格式化前字节均有备份；六份状态/计划只前置结果并保留原后缀，所有旧失败和109绑定不变。

## 后续

接续非空raw观察/真实Runtime+Provider组合、Stage封存和Store锁内提交的完整资源调度，覆盖DELTA/retained及其他失败/不一致恢复，最后完成G根注册、精确计数与独立整包评审。沿用原本地批准，无新增微步骤审批。

没有真实Native/helper/collector、校准、profile、新数值/依赖、云端CI、Git写入、新会话/工作树或agent。历史Native超时仍UNKNOWN，既有风险全部保留。
