# B-F1-D：Python v6 CALL_RESULT 与观察完整性局部修订

状态：用户已批准DCP及D1–D3整包（含两次Rust库测试和固定新捕获）；B_F1D_CALL_RESULT_COVERAGE_LIBRARY_EXIT；[实施结果与作者审查](../plans/2026-10-30-phase1-call-result-coverage.md)记录额外一次定向复验批准和准确门禁。下文设计时态以本批准及最终实施结果限定。
依据：[B-F1-C](2026-10-30-phase1-binding-history-design.md)、[B0b完整性§4.2](2026-10-23-phase1-b0b-completeness-proposal.md)、[F1-A直接右值](2026-10-29-phase1-binding-contract-detail.md)、[F1-B](2026-10-30-phase1-binding-observation-design.md)、[收敛策略](../../handoff/IMPLEMENTATION_PROTOCOL.md#用户批准的收敛执行策略2026-10-29)。

## 1. 实码与证据

PythonSyntaxAnalyzer.observe_payload → Collector.value(call) → unknown(CALL_RESULT) 无条件置 partial=true；之后同一walk仍枚举该call，产生INVOCATION或DECORATION及scope/参数。producer只按最终Code/Syntax coverage汇总terminal；组合层严格要求SUCCEEDED + Syntax COMPLETE + Code COMPLETE/NOT_APPLICABLE。

已保存r1 direct/nested原始流均Code COMPLETE、Syntax PARTIAL，C包正确拒绝它们。direct源中app=FastAPI()和router=APIRouter(prefix="/api")已有精确RHS/独立调用/scope，但调用结果保持UNKNOWN即触发全文件PARTIAL。本轮只读统计/输入身份见[设计核验](../../../.superpowers/design/2026-10-30-phase1-call-result-coverage/evidence.json)，不是新的实际提取结果。

这不是可直接当普通bug修复的边界：已接受B0b§4.2写明“非Code的动态值无法静态解释时Syntax PARTIAL”。F1-B也承诺保留旧PARTIAL行为。因此先提交本局部修订，批准前不改生产逻辑、Fixture或测试。未知值与观察覆盖不是同一个维度，但不能据此把所有UNKNOWN统一改为完整。

## 2. 方案与推荐

|方案|结果与代价|
|---|---|
|维持现状|原门禁正确；普通FastAPI构造赋值仍无法走完整观察发布链，需保留此功能缺口|
|推荐：只修Python BINDING_V6的CALL_RESULT|调用结果仍未知；已完整枚举的调用本身不单独使Syntax PARTIAL。复用现有binding模式、walker和终端聚合|
|将所有UNKNOWN当完整或新建任意值求解器|会掩盖不支持的表达式/遗漏，或引入未获批解释器；不采用|

本包不重写四框架必需目标；只先解除其一个真实输入阻塞。四框架语义仍合成一个后继包，避免逐框架审批。

## 3. 精确变更合同

仅在Python Collector.binding=true且value遇到真实tree-sitter call节点时，UNKNOWN(CALL_RESULT)的创建不再单独设置partial。复用当前value→call→walk，不做文本/name白名单，不只对FastAPI特判，不增加通用策略注册器。

以下义务同时保持：
- UNKNOWN.kind/reason、ASSIGNMENT.valueRange、直接调用范围相等规则、scope/owner、callee原解析级别和所有字段不变；不填返回类型，不执行调用、不提高confidence。
- CALL_RESULT只是未知返回值，不是已知框架对象。wrap(FastAPI())即使表面观察完整，app的直接调用仍只能是wrap；Plugin不得把内层FastAPI当构造赋值。
- 同一文件其他来源置partial后不清零：语法错误、class/lambda/comprehension或无合法scope、复杂赋值、通配导入、动态callee、无法支持的参数/字符串/数字/字典/表达式仍保留原PARTIAL/失败。
- 只存在完整可表示call的文件可以Syntax COMPLETE；该call的每个参数、callee和scope仍经过现有walk。预算、取消或deadline中断必须是原失败终端，不能发完整成功。
- v4/v5的binding=false分支及全部Java模式保持原行为。其他UNKNOWN原因不变；PYTHON_SYNTAX_CODE_V1四facet义务与Code统计不变。
- producer继续由所有文件最终coverage汇总；不修改terminal派生公式、不放宽TS完整流加载器或Stage/Store门禁。

此修订仅改变未公开生产v6的上述覆盖规则，不增加wire字段/新协议、Canonical IR版本或SQL迁移。保留SYNTAX_BINDING_V2及现有v2身份域：UNKNOWN内容不变，不需要重造Syntax键。新的实际输出与build/source身份另存本包目录；旧r1和不可变历史原位保留。旧PARTIAL绝不按新规则重标或重新解释为成功。后续真实运行资格必须绑定新build，不能继承旧profile/采集资格。

## 4. 独立Fixture / 完成条件

复用p1-syntax-contract-v1，新call-result-coverage子目录，独立输入/expected先于产品冻结；不新增Fixture ID/质量数字或全局计数守卫。

|输入类别|v6预期|其他保证|
|---|---|---|
|普通直接call赋值、同范围直接关系|满足其余义务时Code/Syntax COMPLETE，terminal SUCCEEDED|值仍UNKNOWN(CALL_RESULT)，不推断FastAPI绑定|
|包裹调用wrap(FastAPI())|所有其他义务满足时允许观察COMPLETE|只锚定wrap，内层不得直接绑定app|
|call作为可支持参数/列表项|调用遍历完整时不会仅因返回值未知变PARTIAL|外层所有其他未知/支持限制仍有效|
|call与条件/括号动态表达式共存|PARTIAL|证明不在末尾清除已存在partial|
|class、通配导入、语法错误、动态callee/不支持参数|原PARTIAL或受控失败|无完整发布；保持Code独立coverage|
|同一普通call经v4/v5|保持旧PARTIAL|旧字节/计数/终端含义不变|
|取消/耗尽items或结果预算|原失败及预算边界|不产生可发布候选|

真实Rust库输出只捕获现有direct/nested两条：新direct预期完整；nested因原条件/括号仍PARTIAL。旧r1两条均继续PARTIAL拒绝；四份旧raw绝不覆写。Rust测试读现有受控Source，不新增analyzer CLI/harness/collector/helper。

TS一条新局部测试文件读取新原始bytes：完整direct经现有composeBindingProjectionForHistory准入，nested仍INCOMPLETE_OBSERVATION；缺产物/坏checksum/版本混用拒绝。组合metadata明确为已有测试声明，不冒称真实Runtime计时/OS资格。复用现有normalizer→V3桥对新两条输出核验UNKNOWN、支持/ID和直接关系；该纯映射允许PARTIAL，但不能当完整组合发布。

出口B_F1D_CALL_RESULT_COVERAGE_LIBRARY_EXIT：新鲜实际direct库流完整并通过纯组合/归一化；拒绝控制与旧模式保持。没有真实Source/capture/owner/Stage鉴证的端到端实际Store发布，不关闭物理资格、框架语义、E01/E02或Phase1。

## 5. 错误、安全与恢复

不增文件读取权限或产品输入，无调用执行、网络、模型、持久化或公开路由；预算仍沿同一账本。实际捕获以create_new写入本包固定owned目录；测试保存器复用现有目录约束，旧保存入口的owner边界保持。Source错误/取消/预算错误沿原失败，无自动重试或产物补造。

历史Native timeout仍UNKNOWN，A6 NOT_QUALIFIED、C1 EPERM/旧链接失败/main取消未查/R4 mutable约束保持。本包Rust库测试不使用/恢复任何旧测量slot，不等于Native进程准入。

## 6. 集中实施与后继

具体文件、RED/GREEN命令和一次性捕获边界见[集中实施包](../plans/2026-10-30-phase1-call-result-coverage.md)。若批准整包，D1–D3本会话顺序实施，范围修复与验证统一处理；不逐用例询问。

后继统一四框架包仍需基于已支持Syntax确定：静态import/alias与作用域shadow/重赋值绑定、Spring/Mongo/Kafka/FastAPI规则、Runtime领域候选的provider-independent身份/支持/置信及删除策略、对应独立Fixture和Evaluation。Java动态值覆盖不被本Python修订顺带修改；Java源阻塞应以实码/Fixture另行举证集中处理。真实生产资格与派生图/跨仓是不同依赖，不被D包隐式授权。

## 作者设计审查

已发现并处理三处容易扩大范围的风险：旧动态值合同冲突须显式批准；不能把所有UNKNOWN判完整；现有捕获保存器绑定B-F1-B目录，不可直接将env换成新owner路径绕过guard。最小方案复用binding flag/unknown责任点和旧聚合器，仅修Python call原因；不建新完整性平台。父任务仍4/21；C包16/428/35仅为前轮证据，本轮未重跑。
