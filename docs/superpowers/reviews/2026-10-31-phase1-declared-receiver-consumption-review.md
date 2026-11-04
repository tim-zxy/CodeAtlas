# 声明接收者消费修订 — 本地实施与作者审查

2026-10-31；DECLARED_RECEIVER_LOCAL_EXIT。用户明确批准设计与 T1–T3；本报告是作者审查，不是独立整分支评审。未新增代理/工作树/Git 操作。

## 行为与范围

唯一产品源码为 packages/plugins/src/framework-bindings.ts。同 site 的 TYPED_BINDING 与 DIRECT_VALUE 只有在两项唯一、Java、完整相同 Source/range/owner/scope、无条件且原 safeChain 成立时共同消费；索引不删事实，UNKNOWN 不升级，support 保留 decl+init+原 import/scope。额外写入/声明、scope 不同、条件或 PARTIAL 仍拒绝。

同一消费点接受简单 QualifiedName<QualifiedName, ...> 的名义类型，原 declaredType 不变；嵌套/wildcard/数组/注解/不完整文本拒绝。原 importProof 的绑定、JAVA_TYPE 和 callee 精度继续执行，不让 bindImportedName 接受新语法。标准库 node:util 的 isDeepStrictEqual 比较完整引用/range，没有新增依赖或抽象层。

## 独立向量与治理裁定

原 binding-extraction 38 条 binding 输入与全部其他旧输入未改；追加 25 个独立向量，总计 63。旧 expected 仅 generic-type 一项按已批准新合同由 UNPROVEN 改 BOUND（MongoTemplate<X>），原预期完整快照保存在 before-expected.json。设计此前“保留所有旧预期”与该新规则直接矛盾；采用已批准明确泛型子集，保留其余旧预期，不能为旧测试造特例或静默跳过。

原 helper、test 入口、lock 文件不变；沿原已注册数据驱动测试，没有新 Fixture ID、注册修改、critical 分母或分数。原 Source/template/Rust/raw 43 项摘要匹配。此处泛型支持说明静态名义接收者，不证明初始化实际类型或运行时派发。

## 新鲜验证

准确命令、开始/结束与退出状态在 [唯一 B 索引](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json) 的 declaredReceiverConsumption，完整日志在其 declared-receiver-consumption 子目录。

|阶段|实际结果|
|---|---|
|T1 RED|49 测试，46 pass/3 fail：两个目标正例 UNPROVEN；一个新 Python 反例的 import 语言元数据不合法|
|T1 修正/实现后|49/49，0 fail；Python 反例只修 import 为 PYTHON_SYMBOL，未放宽 IR 校验|
|T2 RED|63 测试，60 pass/3 fail：旧受影响 generic-type 与两个新正例|
|T2 实现后|63/63，0 fail|
|最终四文件集中检查|163/163，0 fail/cancel/skip/todo；与 T1/T2 及历史范围不累加|
|Plugins 构建|现有 package build 脚本等价直接 tsc -p packages/plugins/tsconfig.json，exit0；未安装/全仓构建|
|架构|17 项目，exit0|
|范围格式|唯一源码与两个 JSON prettier --check，exit0|

T1 首次构建为终端直接执行同一 tsc 命令，工具 exit0；T2/最终构建的准确时间/命令日志单独记录。最终构建在格式化后执行，不冒称 wrapper/pnpm verify 成功。未修改测试 helper/入口，旧断言继续负责结果与 support 精确比较。

## 作者审查结论

逐项核对计划 Review Focus：不同位置/额外写入不折叠；相同名字不能跨作用域拼接；泛型全串检查而非直接截断；原 import/scope/callee gate 保留；初始化支持不能遗漏。完整原 Context 校验继续负责 Source/引用真实性，内部不新增重复校验层。未发现本包未解决的阻断实现缺陷。

未评价为通过的项：真实 Kafka scope PARTIAL、普通 new 的 producer 分类、Spring 资源维度 UNKNOWN、Depends 参数角色、Mongo fluent/handler 关联、Runtime 覆盖/发布充分性和完整实际 Source→Store/跨仓/原 Evaluation；它们超出本批准包且没有本轮执行证据。未来 Rust/真实诊断不能借本报告作为运行授权。新普通库行为不会令当前实际 PARTIAL 具备发布资格。

## 有限退出与下一步

T1–T3 在 Node 消费组件范围完成；CURRENT_STATUS/PLUGIN_SPI/设计/追踪/Evaluation 同步。父任务仍 4/21 接受、17 OPEN；原 Source run01 的 1 个 Rust 测试失败、Spring RESOURCE_LIMIT_EXCEEDED、旧 main 取消/Native timeout/R4/A6 等风险原样保留。无真实 Source 重采、Rust/Native/helper/collector/模型/DB、CI、Git 写入、新数值/profile/依赖。

后续可并行理解但本会话顺序推进的设计依赖：普通 new 非匿名类的两个 scope 限制来源、Spring 精确失败 guard 的最小诊断，以及角色/关系与覆盖合同。实施或真实运行仍需相应准确设计与授权，不把绑定组件退出记为 B6/Phase1 完成。
