## B-F2-C有限交付完成 — 2026-10-30

用户批准同根导入保守澄清后，C1–C3完整98/98并有限验收；[实施评审/证据/缺口](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)。共享绑定和四框架首组草稿不替代完整Plugin/语义置信/Canonical Runtime/生产资格。下一步集中设计有依据的语义候选策略及发布衔接；新范围未授权前不编码。下方原阻塞为历史。

## B-F2-C实施续接 — 2026-10-30

[集中实施评审](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)：用户已批准首组共享绑定/四规则草稿并实施，新root97/98，因[同根dotted-module澄清](../specs/2026-10-30-phase1-dotted-module-binding-clarification.md)未签收。未完成原全能力或语义发布；所有§原目标/后继缺口继续OPEN。审批只针对这一实际合同冲突，不重新拆微任务。

# 四框架语义设计收敛与合并路线

> 使用brainstorming与writing-plans，沿用Ponytail full；本会话顺序，无新代理/会话/工作树。此为设计任务包，不是可执行产品实施计划。

**Goal:** 一次解决框架绑定输入充分性、严格领域草稿和候选到Runtime边界，避免逐框架反复审批。
**Architecture:** 复用现有Code/Syntax/Plugin与版本化历史；只补实码证明缺失的绑定证据，统一共用绑定器/支持规则。
**Tech Stack:** 现有Rust/TypeScript/SQLite设计；本轮不运行这些产品组件，无依赖/数值/迁移。
**Spec:** [B-F2统一修订提案](../specs/2026-10-30-phase1-framework-binding-sufficiency-proposal.md)。
**Status:** 方向已批准，B-F2-A精确合同及C1–C4已获批准并完成有限本地出口；[准确实施与限制](2026-10-30-phase1-binding-sufficiency-contract.md#实施结果与作者整包审查--2026-10-30)。S4的producer/reader/mapper/历史子包随后获批并完成[B-F2-B有限出口](2026-10-30-phase1-binding-sufficiency-pipeline.md)；共用绑定器/四规则仍待实施；Rust/Native/DB/云端/Git边界保持。

## 已完成的设计核验

- [x] F1-D前置交付与当前实际接口核对，前轮数值只作历史。
- [x] 识别Python漏表达名称效果/条件、Java import variant丢失、callee精度丢失、Runtime置信缺口；静态反例不冒称实测失败。
- [x] 比较最小证据补齐与名称猜测/重解析/Artifact偷渡，明确推荐方案。
- [x] 分清草稿、Canonical候选、Application鉴证及实际发布，保持原必需能力OPEN。

## 设计任务与依赖

|任务|准确输入/输出|可核验完成条件|
|---|---|---|
|S1 绑定证据具体合同|输入：提案§2/4与原raw/IR/context/history；输出：逐字段strict schema、版本分配、源码AST枚举表、支持/摘要/兼容规则及准确文件清单|同一语义责任只记录一次；四类缺口都有独立Source oracle；旧版本/旧origin不重写；不留下TBD接口给实施者自行定契约|
|S2 四框架领域草稿合同|输入：S1及现有Runtime schemas；输出：严格草稿payload、provider-independent去重键、输入支持闭包、拒绝/诊断与版本化SPI调用合同|草稿不能通过Runtime parser；无任意JSON、无虚构分数；四框架目标逐项对应规则/Fixture，未知默认不猜|
|S3 一份集中实施包|输入：S1/S2定稿；输出：最小文件/模块、接口签名、任务依赖、RED/GREEN与适用回归、治理同步和运行批准边界|可以照计划实施而无需另选新字段/身份/默认值；普通实现修复不再拆审批；独立只读/离线与真实运行清楚区分|
|S4 实施及集中验收（届时须批准）|输入：用户批准的具体包及相应运行许可；输出：绑定证据与四规则/严格草稿组件出口|各项unit/Fixture/Evaluation/架构/文档证据齐备，只关闭准确范围；不称E01/E02或Phase1通过|

S1→S2→S3→S4按依赖顺序。S2规则Fixture可部分独立设计，但不能假定S1未知字段；不自行开代理/并发。S1–S3只是把新契约变得具体可审查，S4不能由本文件的方向确认自动启动。

## 正式能力与当前缺口追踪

|正式目标|设计责任|现有可复用|仍缺证据/门禁|
|---|---|---|---|
|Spring HTTP/Scheduled/consumer/依赖|S1导入/精度，S2绑定及领域规则|JavaCode、typed声明、V3 context、Runtime schema|类/方法/重载规则与独立框架Fixture、语义置信/实际完整路径|
|Mongo资源/读写/变更|S1 receiver绑定，S2资源/操作/handler草稿|typed声明、INVOCATION/支持闭包|receiver精确证明、collection/namespace/监听规则与Fixture|
|Kafka producer/consumer/事件边界|S1精确类型/annotation，S2消息合同草稿|Runtime Message signature、已有Syntax|topic/namespace/role/handler规则、未知schema保留、Fixture|
|FastAPI route/router/prefix/Depends|S1完整绑定枚举/控制，S2注册关系草稿|RHS关系、scope、F1-D实际完整direct|for/delete/条件/alias和重赋值反例、prefix/include/Depends规则与Fixture|
|Canonical Runtime组装及AUTO发布|后继获准语义置信策略+Application/Store合同|RuntimeFactSet/既有发布不变量|有依据的置信策略、领域身份/重算与持久化、真实产品资格/E01/E02|

这些是原Phase1必需工作，不转为DEFERRED。框架组件产出草稿后，最后一行仍必须完成才具备完整领域发布能力；不能用本路线的局部出口替代正式验收。

## 最小验证与审批策略

本设计回合只做代码/文档/原收据的只读核验与新增文档链接检查；没有产品测试或新执行计数。准确身份只覆盖本次相关输入，不扫描整仓或重建多层收据。

S3固定实际文件后才列准确测试命令/运行次数，不先申请未知Rust/Native额度。独立Fixture冻结、旧版本/负例、支持/身份和排序/删除重算共用门禁；不复制已证明且未变的Store事务或全资源矩阵。原恢复/安全/Fixture/Evaluation/Quality Gate不减弱。

只集中确认新契约方向及最终具体实施包；不按四框架分四次，不按微任务审批。新增范围/数值/依赖/破坏性操作/真实运行与云端/Git仍遵循原用户边界。没有具体完整合同的实施批准会留下不可核验的自行选择，本路线不请求这种空白授权。

## 作者审查

本轮没有为了绕过缺置信而定义第二套可发布Runtime IR，也不将resolved状态误当EXACT。拟议语言中立绑定信息是满足静态框架规则的输入，不是通用解释器/符号执行/数据流平台。S1精确覆盖表仍待方向确认后完成；因此本文不能标IMPLEMENTATION_READY。原F1-D结果和风险完整保留。
