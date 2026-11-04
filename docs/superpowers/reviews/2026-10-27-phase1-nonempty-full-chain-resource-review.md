# Phase1 初始非空 FULL 整链独立资源作者评审 — 2026-10-27

## 结果与范围

沿原批准A-local D..G连续执行：三组Java-only/mixed/Python-only的完整Runtime组合3、Stage观察/封存6和整链Store3，共12项新检查。Runtime首次3/3、Stage首次6/6；Store首轮3RED是本次独立模型漏算SQLite REAL物理文本，经静态DDL/平台原语定位后同三组3/3。最终七文件59/59，0fail/cancel/skip/todo；架构17项目通过，各次重叠不累计。产品源码/dist、依赖、迁移与根注册未变，不重复构建、真实Native或完整长回归。

本报告是AUTHOR_LOCAL_NOT_INDEPENDENT_WHOLE_BRANCH；独立整包评审/G仍待。原意图109/109绑定、原Fixture整体签收0、主任务4/21接受/17未关闭，D/E/F IN_PROGRESS、G OPEN。这里只证明三组初始未索引Source上下文的成功FULL非空整链和全预算拒绝；不能泛化已有非空Code/history基线的full重建、DELTA/retained、其余失败/不一致恢复前缀、Native/RSS或生产资格。

## 依据、复用与先冻结

沿用[连续计划](../plans/2026-10-27-phase1-consolidated-execution.md)、[Stage/Store契约](../specs/2026-10-25-phase1-r011-history-stage-contract.md)、[三方法前置校验附约](../specs/2026-10-27-phase1-stage-early-validation-proposal.md)及[清理行预留](../specs/2026-10-27-phase1-cleanup-row-reservation-proposal.md)。复用[上轮raw/Provider/Runtime准入独立参考](2026-10-27-phase1-nonempty-raw-resource-review.md)、Java owner、Code九组身份、H1 manifest/Syntax pair与旧零事实Store的独立SQL调度；没有新契约、阈值、默认值或profile。

原Stage Fixture根新增三模型（independent-nonempty-compose-resource-model.mjs、independent-nonempty-frozen-stage-resource-model.mjs、independent-nonempty-store-resource-model.mjs）、对应三份nonempty-_-resource-reference.json及Storage三份mixed-analysis-nonempty-_-resource.test.mjs。没有新Fixture ID/registry或根测试注册。模型仅导入Node标准库与同目录独立模型，测试不读私有W输入，全部来源manifest/资产/解压payload摘要固定。

Runtime组合的全部manifest/activationId/origin/projection/member/basis在产品调用前与原stage-freeze-independent三组完整目标一致；Stage owner正文和digest另与原stage-observation-independent一致；Store所有受影响行在调用产品前与原store-row-independent一致，并叠加原Source行/静态DDL空表组成完整22表期望。不是从usage、SQL实测或候选输出回填golden。

## 完整资源调度

Runtime模型包括声明own/encode/parse和原始字节拥有、完整Provider增量、各Canonical集合UTF8排序键/保留量、未来Code身份、完整history state、Syntax mapper的全部selected node/binding/support closure、tuple/支持摘要/初始Syntax身份、不可变origin与projection、完整manifest、最终H1 manifest和所有Syntax pair复核及完整usage结果。Syntax限闭合DECLARATION与含无候选未解析REFERENCE的ASSIGNMENT；复用既有批准0.5规则，不新增置信政策。Java限原class/compilation_unit，Python限原module/import/reference；多支持/其他语法不是本模型资格。

Stage模型从独立累计H1开始，覆盖constructor实际setup5＋首次cleanup预留1、CAPTURE、FULL scope/unit身份、真实Java owner callback/controlled Java/owner完整正文、观察前后完整TEMP/epoch/H1核验、raw拥有/前置Runtime准入/重新解析与hash绑定/base64/OBSERVATION，之后真实compose、完整独立Code/manifest/原事实支持/快照/coverage多重集/各Syntax pair及原始origin复核、再次context重查、FROZEN完整字节与TEMP seal。三组分别比较constructor/owner/OBSERVED/FROZEN全部资源和原字节，观察/封存各五维exact/少一。真实规则回调次数精确：Java owner依输入0或1、前置验证1、仅freeze时compose1；首次close消费预付credit，不额外计费。

Store模型复用同账本，覆盖lease own、锁内同库重查和TEMP seal、事务前后完整22表物理像、FK检查、完整snapshot/capability/Code/未解析target/Evidence/binding/候选/coverage/diagnostic写入及回读Code身份、Native派生状态清除、全部不可变Syntax/history/member和指针原子更新。五维exact时全部累计账本、完整SQL目标及新只读连接一致；每维少一拒绝且无残留事务、持久22表回滚不变。成功后TEMP已清理，第二次close不重复计费。Stage与Store的限制是整个生命周期总占用，未给后续阶段重置新预算。

## 定位、修正与保留

首个Store独立freeze把完整22表与旧只列受影响表的目标直接比较而失败。diff仅为原Source三表和两张空Native表；已按静态schema及原input overlay生成完整预期，旧目标不改。原脚本/失败保留。

Store实际首轮三项均在最终persistentImage编码拒绝。诊断定位到独立模型payload用JS String(v)，而原SQL按length(CAST(column AS BLOB))计费；004_code_graph.sql规定confidence_score REAL，当前固定输入值1的物理文本是1.0。隔离Node SQLite标准库原语确认该转换为3字节；Code reader按设计排除数字，不受影响。新模型明确闭合confidence_score=1并按DDL推导1.0物理字节，不根据实测差额加常数、不放宽产品或门槛。独立重算预期后原三组GREEN。原模型/reference、三项RED、诊断日志与平台characterization都保留。这是测试参考缺陷，未发现需要产品修正的冲突。

作者检查另将本次新Stage测试里仅验hash长度的弱断言加强为真实TEMP规范字节SHA与独立seal完全相等；初稿已保存，最终集中回归覆盖强断言。格式化前三模型/三参考/三测试全部备份，格式化后只同步模型/来源摘要，输入/全部预期语义/成本和旧参考不变。

## 可复现证据

证据根 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/：

- nonempty-compose-reference-freeze._、nonempty-stage-chain-reference-freeze._：产品前独立完整语义比对；nonempty-compose-resource-first.* 3/3、nonempty-stage-chain-resource-first.* 6/6。
- nonempty-store-reference-freeze._：旧部分表/完整表比较失败；nonempty-store-reference-overlay._：纠正输入范围后冻结。
- nonempty-store-resource-first._、nonempty-store-resource-diagnostic._：原三项RED和具体最后编码失败现场；nonempty-store-sqlite-real-cast._：隔离平台原语；nonempty-store-resource-real-cast-green._：相同三组GREEN。
- nonempty-full-chain-resource-final-scope.*：七文件59/59，包括新12、旧Runtime准入3、零事实Store6、cleanup6和原Runtime validation32。
- nonempty-full-chain-resource-architecture.*：17项目；nonempty-full-chain-resource-verification.json：后继不可覆盖封存。

前驱nonempty-raw-resource-verification.json补记前9,693项摘要全相同，旧Fixture2,337和产品374文件保留；六份控制文档只加前缀，旧后缀/全部历史失败/原109绑定完整保留。没有Native/helper/collector、校准、profile/依赖/新数值、云端CI、Git写入、新会话/工作树或代理；历史Native timeout仍UNKNOWN。

## 剩余

继续已批准本地包：已有非空基线FULL重建、DELTA/retained与其余失败/不一致恢复的完整独立资源调度，随后G根注册、精确计数、适用集中验证及独立整包评审。当前初始FULL三组闭环不关闭原整体门禁或P1-04/05，不增加微步骤批准请求。
