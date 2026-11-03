# Phase1 A/B原路线收敛设计

2026-11-02；DESIGN_IN_PROGRESS，未授权新增产品修改或实际运行。

用户选择继续原Phase1设计开发，不切换为Wiki优先路线。沿P1-04..09继续：Source→Code/Syntax→四框架→ExecutionGraph/RuntimeFlow→单仓/跨仓发布→原Evaluation。Canonical IR、SQLite authoritative、LLM candidate-only、AUTO事实/MANUAL知识与Wiki边界保持。

## 基线

接收者T1–T3已完成Node组件退出，四文件163/163；见2026-10-31-phase1-declared-receiver-consumption-review.md。父任务4/21、17OPEN，不能把组件通过计作父项验收。Spring原run01 RESOURCE_LIMIT_EXCEEDED，具体维度UNKNOWN；与历史Native timeout UNKNOWN分别记录。本轮只读复核，无测试/构建/采集。

## 集中收敛顺序

### 1. producer分类与Spring诊断

两个普通new责任点：java_syntax.rs Collector::lexical_scope把object_creation_expression祖先置partial；binding_sufficiency.rs augment对所有此类节点加UNSUPPORTED_BINDING_SCOPE。普通无匿名类体的构造不建立词法名称作用域，建议依锁定grammar区分匿名class_body；两个责任点须同时核验，不能只删一个限制token。

仅在现有sufficiency模式隔离修订，旧v4/v5/v6保持。匿名类、lambda、未知owner、块提升、动态目标及条件控制限制不删除；构造参数中的lambda/匿名类/条件表达式仍独立观察。先冻结普通构造/匿名类/嵌套构造/参数lambda及额外写入的独立oracle，不建通用scope引擎。

Spring writer先缓冲文件记录，无Syntax事件不能定位失败阶段。Java Code SymbolCollector、Syntax tick/emit/metadata、augment遍历/祖先计费/记录保留/汇总、writer均有同码guard。建议test-only输出固定阶段/guard及实际计数/上限，不改release错误枚举/wire/比较/计费/时序，不打印源码或环境，不建通用遥测。

诊断采集应先于producer修订。原请求复用的deadline语义、工具/构建身份、准确guard清单、测试入口、次数和新owned目录须在实际运行前冻结并获批。原cap不提高，原Source不拆小后冒称修复，不使用旧harness纠错额度自动复验。新重现即使定位guard，也须区分当前证据与旧run01未记录的根因。

### 2. 四框架角色、关系与覆盖合同统一细化

- Kafka同site/泛型消费已实现，但实际scope PARTIAL仍拒绝；先取得producer实证。
- Depends有callee/arguments/range/owner，缺明确parameter/default/annotation角色；coverage与名称不是角色证据。
- Mongo watch/forEach/handle存在，receiver/lambda仍UNKNOWN；须证明调用结果→订阅→handler关系，不能按名字接链。
- Spring路由/任务/Feign/注入规则已有组件，真实Source证据被资源失败阻断。
- 候选DOMAIN_RECORDS_ONLY/DECLARATION_ENTRIES_ONLY恒PARTIAL，需要独立必需义务和缺口判定，不能直接设COMPLETE或降低门禁。

优先复用现有字段。确需新字段时一次列明语言中立schema、版本/身份、normalizer/history/Stage/Store传播、兼容、Fixture与门禁。不预定wire8/Syntax4、不默选新分数、不引入通用数据流/CFG。原E03..E06/critical分母缺项单列，不造数值。

### 3. 真实发布链集中验证

前两段证据满足后，复用现有normalizer/history、Stage/lease、RuntimeFactStore/ContractStore和Application/Runtime组合，只修实际暴露的原范围问题。先单仓实际Source→四插件→Graph/Flow→Store，再冻结RevisionSet验证合同匹配/跨仓。当前Source/支持、CAS、last-good、未知提交只读恢复、跨库stale边界保持。

实际进程/profile/A6资格与库测试分开；原Fixture/Evaluation/失败恢复/架构/追踪全部满足才关闭父项。完整物理资格缺失时明确HOLD，不借此提前验收。

## 执行收敛

一个具体包集中审阅，批准范围内实现/修复/测试/文档连续执行，不逐字段或框架询问。开发只跑直接RED/GREEN，批末去重集成/兼容/架构；旧身份未变且适用的证据复用。不复制费用矩阵、不为设计文档重跑全量测试或全仓hash。

本会话顺序执行。逻辑独立的C文档/安全设计可另排，但当前先推进A/B；不自动编码未批C任务。保留所有旧失败、Fixture、EOL与.superpowers，不清理工作树。

## 尚须形成的可实施材料

1. 普通构造的grammar依据、独立oracle与旧版本隔离规则。
2. Spring精确guard/test-only方法/同cap操作包及停止条件，未获批不运行。
3. 角色/关系及覆盖的精确合同与逐规则输入→事实→支持→诊断→Fixture/Quality Gate映射。
4. 将已明确修改与操作合成准确实施包；依赖实际诊断才能决定的事项保持开放，不申请空白授权。

本稿为作者设计核验，不是implementation-ready或独立评审。无Rust/Native/helper/collector/模型/DB/新依赖/数值/CI/Git授权。当前正式证据仍在原B唯一results.json，本文件不改写其失败状态或CURRENT_STATUS历史。


## 第一份诊断包已执行，后续合同仍待形成 — 2026-11-02

用户批准固定Spring诊断，当前重现tick_binding共享next1001>limit1000，具体caller未定位，产品仍FAILED；新request/raw与旧字节相同，但历史guard没有原始记录，旧UNKNOWN不改写。准确[诊断作者审查](../reviews/2026-11-02-phase1-spring-resource-diagnostic-review.md)。只增加test-only探针，不授权提高cap/取消计费/修改scope或UNKNOWN覆盖；原A/B统一契约继续细化。
