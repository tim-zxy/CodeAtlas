# A/B收敛：按实际消费者求scope的最小修订

2026-11-02；PROPOSED / IMPLEMENTATION_NOT_AUTHORIZED。原P1-04..09范围，非新增Phase。用户批准的是此前诊断，不包含本产品修订/运行。

## 依据与目标

[同cap诊断](../reviews/2026-11-02-phase1-spring-resource-diagnostic-review.md)证明当前tick_binding共享next1001>limit1000拒绝，具体caller未定位；旧run01仍无guard记录。静态完整追踪augment第二轮后确认：当前循环对所有named AST node先scope()，随后绝大多数节点不发TYPE/IMPORT_BINDING/BINDING_EFFECT，lex结果被丢弃。该事实可由控制流直接核验，不需要推定它是唯一超限来源。

目标只消除这些未使用的祖先查询；不提高cap、不把相同工作改称免费、不跳过真实范围/控制验证。旧完成输出的记录/字段/身份/coverage/支持必须等价；实际work_items可因真实工作减少而下降。不能保证Spring一定完成，实际结果仍以同cap观察为准。

备选缓存scope/control会新增保留量和失效/预算复杂度；先增加maxItems没有工作量适用性依据；直接删tick违反原门禁。推荐只把现有scope求值移到消费者分支，既有函数/标准库足够，无新依赖、wire或IR。

## 精确变更

唯一产品源码crates/native-analyzer/src/binding_sufficiency.rs::augment；该函数只用于已有BindingV3/wire7路径，不改v4/v5/v6 producer。

保持第一次AST遍历、旧观察定位/rekey/control/scope核验、Source/owner映射、预算/deadline/cancel、全部原限制、最终scope父链/coverage与BINDING_SCOPE输出。第二轮仅调整如下求值顺序：

1. 仍先逐节点check取消/deadline、记录Java block保守限制；unsupported scope种类仍原样加限制并continue。
2. 复用原kind→effect的完整match，计算该节点是否会进入TYPE声明、Java/Python import或effect处理；这里的AST枚举/target选择沿原代码，不建第二份语法白名单。
3. 只有这些消费者存在时才调用现有scope一次，并沿原owner/lex值执行原emit。不能把None替换成外scope。无消费者时不计算无用lex，但原节点的检查/AST访问不省略。
4. 真正调用scope/control/tick_binding的全部访问继续原样计费；新增记录/保留bytes以及最终scope输出仍先准入。禁止对已执行遍历退款或批量抹去成本。

不变：普通new仍触发原scope限制，unknown(DYNAMIC_EXPRESSION)仍PARTIAL，参数/返回关系不扩展。现有19个test-only guard探针保留。新程序结果不自动获得运行资源profile或物理准入。

## 必需测试修订

原binding_sufficiency_ancestor_walks_use_same_item_budget使用if True: x=1 Source，但手工out.observations为空；在真实producer该assignment应存在。原测试可能依赖无消费者也做scope这一偶然实现。不得删除/降阈值：保留原Source/maxItems10，补独立字面ASSIGNMENT种子（range零基1:4..9、x=NUMBER1、合法module owner）使真实旧观察核验确实消费scope/control，然后仍必须ResourceLimit；预期和错误含义不变，原版本封存。

补一个默认ignored的binding_scope_demand_spring测试：读原Spring request原字节/原Source，同cap，保存raw后期望OBSERVATION_COMPLETED；COMPLETE/PARTIAL均如实保留，不要求语义发布。RED应重现已知拒绝。修改后若仍资源失败，不调cap/跳过测试，不宣称已修；保留HOLD，不能把这当作纠错额度自动重跑。

原17 Source oracle及保留前超bytes、祖先预算两测试一并GREEN；旧17份完成记录与已存library-output/r5比较，先核对request/source/工具和旧输入适用性，无法逐字匹配的路径/封装字段单列，不删除不一致。record内容/coverage/支持变化即阻断。work_items是内部实际计数，不进入wire，不作为旧raw相同的豁免理由。

## 治理、追踪与退出

这是执行顺序/实际工作量的EVOLVABLE提案，以真实guard证据、未使用数据流和独立Fixture支持；原每个已执行祖先访问计费合同保持。须用户一次批准后实施。原ancestor测试补齐输入明确记录，不能静默改变。

映射：P1-04/05语法观察与预算→原binding-pipeline17 Source/ancestor/oversized tests＋同Spring request→严格wire7 reader；P1-06..09只受来源可用性影响，本包不签收框架/图/跨仓。格式/架构与只读身份检查按改动范围执行，不重跑Node163/全仓/校准。

退出条件：新Spring回归完成、旧17 oracle与两原预算控制通过、严格reader一致、旧完成事实不变、文档同步；即便满足，只接受有界遍历改进，不宣称实际四框架发布。未满足明确HOLD，不提高cap。原父项4/21和17OPEN不自动改变。

## 后续统一契约还需覆盖的实码缺口

- 普通构造涉及lexical_scope、augment限制和unknown置PARTIAL三处；不能只修一处后宣布Kafka ready。
- Depends默认参数与注解调用须不同角色，provider身份须有真实声明/引用证明；现规则对Depends仅输出FRAMEWORK_API_UNSUPPORTED。
- Mongo原Source的collection只是方法参数，watch/forEach/handle关联即使补齐也没有数据库/集合身份；不得借read/write中的events赋给它。保留旧Source作未知资源控制，未来需独立、确有来源身份的正例。
- 当前mongoRules只实现find/findOne/findAll/insert/save，没有watch规则；springRules没有Autowired规则。framework-binding IR已包含DEPENDENCY/DATA_WATCH，因此不能一概声称需要新Runtime IR；先补必要Syntax证据/严格草稿消费。
- Runtime基础跳过DEPENDENCY，最终binding-candidate尚无DEPENDENCY/DATA_WATCH处理。完整发布还需补消费者与支持闭包，不能仅改变恒PARTIAL。
- 四框架Fixture的criticalFacts/qualityGates目前为空，现有字面向量不能充当原E03..E06 critical分母或新数值baseline；须回连原验收清单，缺口单列。

以上作为一个后续角色/覆盖合同包输入，未精确确定的新字段/版本/数值不能用本提案授权。


## 用户已批准并完成局部实施 — 2026-11-02

本设计与T1–T3已获明确批准，[实际结果/作者审查](../reviews/2026-11-02-phase1-demand-driven-scope-implementation-review.md)。上方未授权/未来时态为批准前基线。RED1fail→GREEN4/4，17旧请求/输出字节不变，reader18/18；Spring原cap完成但PARTIAL，不能视为框架验收。原祖先门禁/阈值保持，条件复验0次。本补充不扩展到末节尚未批准的角色/覆盖/发布合同。
