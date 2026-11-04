# Phase1 已有非空历史 FULL 重建资源作者评审 — 2026-10-27

## 结果和边界

沿原批准A-local D..G顺序执行，复用原准确parent完整重建语料，新增Runtime准入/组合2、真实Stage观察/封存2和整链Store1，共5项独立资源检查。首轮5/5，格式化后五文件集中47/47；随后作者检查删除本次新模型的无用Java导入和被后续实际行数覆盖的冗余预留下界，证明全部冻结输出/成本/ledger不变，只更新源摘要；最终受影响5/5。两组重叠不相加，不把47/47说成最后简化后的完整集中重跑。架构17项目通过。

产品源码/dist、依赖、迁移、根注册均未改，不重复构建、Native或旧完整长回归。本报告为AUTHOR_LOCAL_NOT_INDEPENDENT_WHOLE_BRANCH，不替代G独立整包评审。原意图109/109绑定、原Fixture整体签收0，主任务4/21接受、17未关闭；D/E/F IN_PROGRESS、G OPEN。

本轮闭合固定native Python FULL重建：原Code/history非空、旧Syntax2条、原snapshot1个。该输入有完整旧Canonical、支持候选、物理coverage、准确parent和完整旧快照。不是任意已有基线/语言、孤立历史恢复、DELTA/retained、其他失败前缀、Native/RSS或生产资格。

## 依据、来源和独立预期

沿用[统一执行计划](../plans/2026-10-27-phase1-consolidated-execution.md)、[Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md)、[full/transition澄清](../specs/2026-10-25-phase1-history-full-transition-clarification.md)及[清理预留附约](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)。复用[前轮初始非空FULL整链独立参考](2026-10-27-phase1-nonempty-full-chain-resource-review.md)、已有非空Code/H1读取及FULL Python owner调度，不修改旧Fixture或数值规则。

原来源 fixtures/phase1/mixed-analysis-store/full-reestablishment-independent-context.json 的input/preparation/owner/raw/完整expected/expectedTables均未改。semantic Code配对只从其原不可变manifest完整state和原物理coverage派生；输入target、准确parent、旧snapshot registry和capture均来自同一固定基线。在第一次产品调用前，独立Runtime的manifest/activation/origin/projection/member/basis、Stage owner正文/digest和Store全部22表已与原目标一致。Runtime新候选仍按origin排序，仅旧物理projection行比较按原已有测试做完整record排序；不改其字节、身份或模型输出顺序。

原Stage Fixture根新增三份独立模型 independent-active-full-{compose,stage,store}-resource-model.mjs、一份active-full-resource-reference.json，以及Storage测试mixed-analysis-active-full-resource.test.mjs。没有新增Fixture ID或registry。模型只导入标准库和既有独立模型，不导入产品、不读取usage回填golden、运行时测试不依赖私有W输入。旧模型保持不可变，新增模型复用其已验证调度并只连接本任务必需的旧状态/准确parent/支持替换。

## 已核验行为

Runtime完整组合的声明拥有、raw/Provider、future Code九组身份、Canonical集合字节排序、全旧snapshot registry和物理coverage、完整Syntax mapper/pair/manifest及H1终检全部计入。FULL expectedActivationBasis仍为null，history parent仍准确指向旧activation；不会因为full而抹掉parent。纯Runtime两方法完整结果/全部计数与独立参考相等，四个非零维度exact/少一；实际rows=0，上限1仅是既有正整数接口见证。

Stage复用独立已验证非空H1/owner阶段，再累计所有重复context/TEMP/epoch/完整H1读取、旧snapshot的原始metadata与SQL投影核验、parent摘要、前置准入/结果roundtrip、raw重新解析/绑定、真实compose、完整Code/manifest/原始支持/保留快照和物理coverage多重集、所有新Syntax pair、TEMP封存和seal。constructor/owner/OBSERVED/FROZEN全部计数与原字节一致；观察/封存各五维exact/少一，回调计数严格为Java0、validation1、compose按阶段0/1。首次cleanup仍消费原预付credit，不重复加行。

Store完整同账本续接包括锁内H1和TEMP seal、事务前后22表物理像、旧支持的binding/factEvidence删除、候选按原FK cascade清除、旧evidence明确SUPERSEDED、新支持/Code完整重建、旧快照及coverage保留、所有新immutable Syntax/history/member及原子指针。22表与独立完整目标一致，新只读连接相同；更紧五维上限各少一即拒绝、无残留事务、持久像不变。成功后lease永久失效、TEMP已清理；新H1 capture AVAILABLE，完整manifest和准确parent正确；逐行确认原history/origin/projection/member不可变行仍存在。没有将失败或未执行检查记成通过。

## 失败和最终作者修正

首轮独立reference freeze在projections数组位置比较失败，其他manifest/activation/origin身份已一致。原准确parent测试本就对物理projection按身份排序；完整行排序后与原目标逐字一致。保留原脚本、失败与纠正说明，不重写原Fixture，不把此准备比较错误当作产品缺陷。

作者检查移除本次Stage参考从初始模型继承的无用Java导入，以及已在owner中计入却又用于初始required下界的重复6行。后续实际累计行数高于该下界，故全部constructor/owner/observed/frozen/Store结果、成本、逐阶段ledger及最终上限均与原冻结值deep-equal；不是调低真实成本或门槛。原模型和reference均保留，最终五项以修改后字节重新运行通过。

## 可复现证据

根 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/：

- active-full-resource-reference-freeze._：产品前旧projection排序比较失败；active-full-resource-reference-order._：原完整目标比对后冻结。
- active-full-resource-first._：首轮五层5/5；active-full-resource-final-scope._：五文件47/47，包括新5、前轮初始非空Store3、原准确parent1、cleanup6、原Runtime validation32。
- active-full-reference-equivalence._：删除新参考冗余后全部输出/成本/ledger不变；active-full-resource-final-reference._：最终受影响5/5，不与47重叠相加。
- active-full-resource-architecture.*：17项目；active-full-resource-verification.json：不可覆盖后继封存。
- before-active-full-resource-format/及before-active-full-checkpoint/：五份新材料格式化前和六份控制文档旧后缀；冗余删除前原稿/reference和所有失败另保留。

前驱nonempty-full-chain-resource-verification.json补记前9,779项摘要全相同，旧Fixture2,343及产品374文件保留。六份控制文档只前置新结果，所有旧文/109绑定/历史失败保持。无Native/helper/collector、校准/profile、新依赖/数值、云端CI、Git写入、新会话/工作树或代理；历史Native timeout仍UNKNOWN。

## 后续

继续原批准的DELTA实际raw、retained重投影与删除及其余失败/不一致恢复的完整独立资源调度，再统一G根注册、精确计数、适用集中核验与独立整包评审。当前原准确parent FULL资源路径可复用，不用重复完整回归或申请微步骤批准；不关闭B1b/P1-04/05/Phase1整体门禁。
