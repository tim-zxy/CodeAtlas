# Phase1 非空 raw / Provider / Runtime 准入资源作者评审 — 2026-10-27

## 结果与边界

沿原批准 A-local D..G 顺序继续。新增三个输入驱动 BigInt 模型、三份冻结参考及三个测试文件：每层三组 Java-only、mixed、Python-only，共9项新检查。各层首次3/3；格式化后八文件集中67/67，0fail/cancel/skip/todo；架构17项目通过，重叠不累计。产品源码/dist、依赖、迁移与根注册未变，不重复构建或完整长回归。

本报告为 AUTHOR_LOCAL_NOT_INDEPENDENT_WHOLE_BRANCH，仅作者局部评审。原意图109/109绑定、原Fixture整体签收0，主任务4/21接受、17未关闭；D/E/F IN_PROGRESS、G OPEN。非空 Stage OBSERVED/FROZEN、完整 Runtime compose / Store 事务、DELTA/retained 和其余失败资源调度仍待；不能据本轮关闭整链、Native、RSS或生产资格。

## 依据与输入

沿用[连续执行计划](../plans/2026-10-27-phase1-consolidated-execution.md)、[原Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md)、[前置验证接口](../specs/2026-10-27-phase1-stage-early-validation-proposal.md)和[清理预留附约](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)，不新增契约或数值政策。复用[Java owner独立模型](2026-10-27-phase1-java-owner-stage-resource-review.md)、既有独立Code/history基础和库内可携带corpus。

三组输入取原 stage-observation-independent 的 JSON/原始请求和输出 JSONL；逐项验证manifest、资产、解压payload与旧摘要。原Fixture、旧失败与root不变，测试不读私有W输入。所有参考先于对应产品调用冻结，独立模型没有产品导入、不读usage填golden。格式化只更新模型/source摘要，全部输入、预期结果、成本及逐项ledger保持不变。

新增文件位于原Stage Fixture根：independent-nonempty-raw-decoder-resource-model.mjs、nonempty-raw-decoder-resource-reference.json；independent-nonempty-provider-resource-model.mjs、nonempty-provider-resource-reference.json；independent-nonempty-validation-resource-model.mjs、nonempty-validation-resource-reference.json。对应Storage测试名为 mixed-analysis-nonempty-{raw-decoder,provider,validation}-resource.test.mjs。没有新增Fixture ID、registry或门槛。

## 逐层核验

解码模型覆盖完整原始字节复制/UTF8解码、JSON预遍历、解码/严格schema形状、v4共同请求视图、完整events/correspondence、Provider引用递归、Python module及未解析import/reference的独立tuple身份、规范化、coverage和Syntax occurrence匹配及最终输出。闭合语料每种语言最多一个文件，不泛化任意Python符号/歧义排序或失败前缀。验证完整结果、全部bytes/items/depth精确上限和各自少一；按原始输入字节及来源记录数计算已有消费，再验证同账本续接及少一拒绝，不能重置预算。

完整FULL Provider模型复用独立decoder、Java class/compilation_unit normalizer原语账本和Python规范化片段，剔除owner专属Runtime成本。独立计算Java整体stream/lookup/pair顺序、snapshot/diagnostics、全部Evidence tuple/支持/唯一支持选择、merged结果、raw/provenance、fresh unitId、原Provider事实依赖、完整coverage、history candidate摘要及最终候选。每个Canonical事实在闭合语料恰有一个支持，Java EDGE及多支持冲突/选择不在此资格范围。比较完整结果、完整资源账本、bytes/items/depth exact/少一及累计续接，unitId另与旧独立Stage owner匹配。

Runtime准入模型计算完整packet own/encode/parse、metadata/target/Source inventory及scope、原始字节拥有、Java owner再次核验的完整子账本、Provider累计delta和retained pin、完整provisional binding、结果/四字段usage。整个结果和rows=0、bytes/items/逻辑retained/depth全部相等；四个非零限制维度exact/少一。maxRows=1仅是既有正整数接口的零SQL准入见证，不记作实际行数、profile或新默认值。三组capture来自只有四张Source初始表的固定上下文，没有已有snapshot/activation。owner digest仍为原独立Stage正文派生值，未冒充授予真实owner或lease。

## 失败、复现及保留

首次Provider参考准备脚本错读 preparation.repositoryLocatorDigest（该对象实际只有contracts/qualificationRef），在独立Java编码拒绝undefined时停止，尚未调用产品或落reference。已改读原冻结expected.body中的准确locator；原脚本与失败记录保留。首次Runtime准备脚本直接读取稀疏输入省略的空表.length，产品前停止；已核对实际四表并修正准备处理，测试另严格断言表名集合。原稿/失败保留；删除本次引入的无用crypto表达式前也保留新模型原稿。没有产品RED→GREEN，不把准备错误说成产品缺陷或Native失败。

证据位于 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/：

- nonempty-raw-decoder-resource-first._、nonempty-full-provider-resource-first._、nonempty-validation-resource-first.*：各3/3。
- nonempty-raw-resource-final-scope.*：八文件67/67，含新9、旧Java owner2/Stage6、Runtime validation32、旧零事实Provider6/Runtime12。
- nonempty-raw-resource-architecture.*：17项目。
- before-nonempty-raw-resource-format/：九份格式化前原字节；before-nonempty-raw-checkpoint/：六份状态/计划完整原后缀。
- nonempty-raw-resource-verification.json：不可覆盖后继封存，前驱 java-owner-stage-resource-verification.json。

补记前前驱9,638项哈希全相同，旧Fixture2,331及产品374文件保留。六份状态/计划只前置新结果并保留旧原文；全部历史证据、109绑定及原失败不动。未启动Native/helper/collector、校准/profile、新依赖/数值、云端CI、Git写入、新会话/工作树或agent，历史Native timeout仍UNKNOWN。

## 后续

继续原批准：非空 Runtime compose / Stage完整重复核验、raw持有和TEMP观察/封存、Store锁内续接/全表目标，再覆盖DELTA/retained和其余失败/不一致恢复调度；最后统一G根注册、精确计数与独立整包评审。无需再为这些已批准微步骤确认。
