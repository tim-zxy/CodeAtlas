# B-G1：声明入口、局部执行图与RuntimeFlow集中设计

状态：APPROVED / B_G1_DECLARED_EXECUTION_LOCAL_EXIT，2026-10-31。用户在具体整包确认问题后“继续”，批准G1–G4及独立执行政策/身份/预算；已完成本地声明式有限出口。下文待批准措辞为提案历史，由本段及实施证据替代。设计使用brainstorming、Ponytail full；按用户既有授权合并准备具体方案与任务包，不逐字段询问，不派代理或创建会话/工作树。

## 1. 目的、现状与取舍

B-F3已提供strict合同/任务/资源候选；[实施评审](../reviews/2026-10-30-phase1-runtime-semantic-candidate-implementation-review.md)及[原结果](../../../.superpowers/sdd/2026-10-30-phase1-runtime-semantic-candidate/results.json)显示root121、新组件23、兼容113、注册35通过。它没有入口、context、CALL图或Flow，不能据此关闭P1-07。

实码核对：packages/execution/src/index.ts仍为空；执行包尚无IR依赖/link。RuntimeFactSet中的externalRefs只提供Code引用，不包含Canonical CALL正文，单靠B-F3 envelope不能遍历调用。CanonicalEdge v1提供CALL source/target、EXACT/HEURISTIC/AMBIGUOUS等解析信息；Runtime IR v1已有EntryPoint、ExecutionContext、ExecutionNode/Edge、RuntimeFlow及闭包parser，可直接复用，不必新增核心schema。

推荐先交付纯声明式链：当前四规则→真实已证明入口→REQUEST/EVENT/JOB分区→当前Code CALL可达图→确定性未压缩Flow。先前合并路线允许B包相依步骤集中设计，不代表所有B工作已经可实施。本文只细化这一条链；跨仓匹配和R012/R013发布仍是原Phase1 OPEN责任。

方案比较（作者推荐，非用户已选）：
- **推荐：领域候选与局部执行链。** 复用现有IR/绑定证明，能以单组Fixture验证真实入口和CALL关系；异步连接/数据操作不足明确保留，不制造占位入口。
- 先实现完整Runtime Store：当前没有可验证图/Flow意义，先建表会增加未消费的结构；待图/Flow候选和发布输入确定后再设计真实SQL。
- 一次加入消息stitch/数据操作/跨仓和全发布：还缺精确标准化边界操作绑定与服务/namespace/schema匹配，不能从同名topic/collection或Code CALL补造。

成功条件：独立字面Fixture证明入口/上下文/调用关系/循环/确定性Flow、支持闭包与预算；旧B-F3出口保持；完整图和运行/发布资格不冒称通过。

## 2. 范围与模块边界

### G1 Plugin入口适配

新增私有compileFrameworkEntryCandidate(input:unknown, framework:'spring'|'mongo'|'kafka'|'fastapi', maxItems:number)。返回既有FrameworkRuntimeCandidate形状，facts仍为RuntimeFactSet v1，provenance给新入口保留其领域来源的draftKeys/ruleIds/syntaxIds及本包policyVersion。

先验证Context4一次，复用B-F3固定规则/完整领域compiler，随后只从本次确实生成的领域实体建立入口：
- HTTP PROVIDER Contract且implementationRef非null → triggerKind HTTP、contextKind REQUEST、ownerRef为实际implementation、contractRef为该Contract、taskRef=null。
- MESSAGE CONSUMER Contract且implementationRef非null → MESSAGE/EVENT、ownerRef实际实现、contractRef该Contract。每个不同consumer合同入口独立；producer不成为入口。
- JOB TaskDefinition → SCHEDULE/JOB、ownerRef实际implementation、taskRef该Task、contractRef=null。只限当前获准Scheduled规则；不把任意TASK/BATCH当JOB。
- Mongo资源、MESSAGE PRODUCER、无输出/不适用政策、不能证明owner者不造入口。HTTP CONSUMER也不成为HTTP服务入口。

入口的存在只证明声明绑定，不证明Controller bean、部署、调度器或listener已启用。新出口移除仅描述旧范围的DOMAIN_RECORDS_ONLY，改为DECLARATION_ENTRIES_ONLY；其他实际限制保留。B-F3原API/结果不变。

为避免全Context重复解析，只在framework-runtime-candidate.ts提取私有compileFrameworkRuntimeCandidateFromValidatedContext(c,framework)；旧unknown入口继续验证并委托。canonical纯函数仍由原framework-draft提供。不得重写binder或接收caller任意草稿/policy。

### G2 Execution局部图

新增私有deriveDeclaredExecutionGraph(input:unknown, maxItems:number)，严格input对象只有：
{basis,nodes,edges,sourceFiles,supportInventory,entryFacts,coverage}。

前五项复用RepoBasis、CanonicalNode/Edge、SourceFile、SupportRef的现有schema；entryFacts是G1返回的facts envelope，coverage是G1的Phase1Coverage，不接收框架标签或Syntax raw。Execution只依赖IR和既有Zod，不导入Plugins。输入为声明式边界，不能认证生产Store。

输出DeclaredExecutionCandidate={facts:ReturnType<typeof parseRuntimeFactSet>,coverage:Phase1Coverage}。输入entryFacts已有contexts/nodes/edges/flows必须均为空；其entryPoints/tasks/resources/triggers/contracts原样保留。当前包不允许caller带预造图覆盖推导。字段版本、basis、重复ID/key、Code引用、支持inventory与Source anchor在此未知输入边界校验一次；内部传递不逐条重复验证整个输入。入口必须声明本包method/0.5/HEURISTIC，owner是当前METHOD/FUNCTION；contractRef/taskRef必须指向本entryFacts内真实记录，不接受外部虚指根。HTTP只对应PROVIDER HTTP合同，MESSAGE只对应CONSUMER MESSAGE合同，SCHEDULE只对应JOB任务；实现必须精确等于owner，contract/task两者不可同时设置。对应领域记录仍须B-F3原method/0.5/HEURISTIC。此检查证明本地声明的一致性，不鉴证输入确来自G1或Store。

每个入口产生一个独立ExecutionContext：
- kind=entry.contextKind；entryRef指向真实入口；parentContextRef=null。
- root ExecutionNode.kind=ENTRY、targetRef=entry.ownerRef；contextRef指向本入口context。ENTRY直接代表该入口所绑定的Code实现，不额外制造一条ENTRY→handler的CALL。
- 从owner按同repo/revision的Code CALL遍历。每个(context,Code factKey)只保留一个节点；root为ENTRY，其余为CODE，targetRef指向实际Code节点。
- 仅EXACT RESOLVED、目标为实际METHOD/FUNCTION/CONSTRUCTOR且支持满足§3时沿target扩展。不能用TYPE猜出隐式constructor；非callable目标保留NON_RESOLVED/UNSUPPORTED及固定hint NON_CALLABLE_CODE_TARGET。保留原Code CALL为ExecutionEdge CALL及其支持；环用已有节点引用回连，不展开递归栈，不创建路径实例。
- 同一个handler从多个入口可达时在各context有各自图节点。直接Code CALL仍是当前context内调用；目标即便也有listener声明，也不凭这一点生成EVENT子context。

UNRESOLVED/AMBIGUOUS/UNSUPPORTED均保留为NON_RESOLVED target及原resolution/hint；已知候选可映射成本context的潜在CODE节点，不沿候选扩展。候选节点存在不证明被执行；Flow只遍历RESOLVED边。Code中RESOLVED/HEURISTIC不升级为EXACT：输出NON_RESOLVED/UNRESOLVED，hint固定HEURISTIC_CODE_TARGET，原CodeEdge支持保留其原解析信息；具备足够支持的已知目标仅列candidate。不得按名称、数组第一项或最近位置选胜者。

本版不构造PUBLISH/CONSUME、HTTP/RPC跨边界、DATA/任务创建、BRANCH/JOIN/RETRY/FAILURE/COMPENSATION；多个CALL出边不是if分支或执行先后。没有真实入口的Mongo资源保持领域事实，不将它升级为独立context。

### G3 RuntimeFlow

新增私有deriveDeclaredRuntimeFlows(input:unknown,maxItems:number)，input严格为G2的DeclaredExecutionCandidate；校验RuntimeFactSet/coverage一次，要求flows为空，再派生并返回同形状（flows填充）。同时检查本局部图适用域：每entry恰一根context/root ENTRY、同context下Code目标唯一、只有ENTRY/CODE节点和context内CALL边、boundaryRef=null、context parent=null；拒绝输入其他尚未实现的图语义，不静默丢弃其边界。所有Runtime新增记录须本包method/0.5/HEURISTIC，原领域记录不重标。

每个入口一个Flow。仅访问其context根ENTRY和沿RESOLVED CALL真正可达节点；不把仅在NON_RESOLVED.candidates中出现的节点视为已执行。每个可达节点对应一个step，不引入压缩器/权重/通用策略。按entry factKey、context factKey与出边transitionKind、target factKey、edge factKey精确字典序做有visited集合的确定性广度遍历；禁止localeCompare。

step.contextRef为当前context，executionNodeRefs恰一节点，incomingEdgeRefs为该节点实际可达源的所有入边（含未解出边不作入边），outgoingStepKeys仅由RESOLVED实际边生成，可包含环的back-reference。ordinal从零连续，**只是呈现次序**，不证明相邻steps有先后关系。entryRef/context列表准确引用，branches=[]、boundaries=[]；无证据不得从CALL扇出推导branch、从producer/consumer同名topic推导boundary。

Flow支持为实际包含节点/边/入口的底层支持并集；每step保留其节点与实际关联边支持。derivationVersion固定declared-runtime-flow-v1。loop不得无限展开；反序输入/删除支持后的重新推导必须稳定并消除旧贡献。

## 3. 拟议独立执行声明支持政策（本次需明确批准）

method固定runtime-execution-declaration-v1、score=0.5、resolution=HEURISTIC。此为新用途的规范支持约定，**B-F3已批准数值不自动授权入口/图/Flow**，也不是观测概率/质量门槛。

适用条件：
- 入口仅由G1本次固定compiler的有效领域实体建立，领域confidence必须原runtime-declaration-support-v1/0.5且原HEURISTIC，Source/Code/Syntax支持闭包不变；owner必须真实Code callable，支持score不少于0.5。
- context/root使用该入口的当前支持；节点/边/Flow用到的Code/Runtime支持均不得低于0.5。Source无score，不捏造。未知方法/不足支持不降分凑schema，记实际limitation并不生成相关记录。
- 正常CALL边至少有当前source Code、CodeEdge与对应Source支持；RESOLVED时还必须有当前target Code支持。低支持target不扩展，保留受支持的source/edge为NON_RESOLVED/UNRESOLVED，固定hint LOW_SUPPORT_TARGET；不把低支持target纳入已解析事实或支持。
- 不改原Code/Syntax confidence或callee等级，不把多个支持合并成更高分。

reasons固定顺序CURRENT_INPUT_BASIS、DECLARATION_EXECUTION_DERIVED，再按实体职责取ENTRY_BINDING（EntryPoint/Context/root）、CODE_CALL_SUPPORTED（非root CODE/Edge）、GRAPH_PROJECTION（Flow）。所有新记录同一独立值；旧合同/任务/资源沿用B-F3政策，不重赋分。不设registry、配置或caller分值。

本次提请批准的是明确的0.5规范约定及条件，不是请用户认可一项未执行的测量。后继变更仍须Fixture/Evaluation依据与治理。

## 4. 精确身份与支持闭包

定义H(domain,tuple)=SHA256(UTF8(domain+NUL+JSON.stringify(tuple)))；只用string/array/null，不做Unicode/path含义归一化，不含provider/plugin/Syntax原ID、置信、basis digest或遍历ordinal。

factKey前缀execution-fact:、域declared-execution-fact-v1，tuple=[repositoryId,kind,meaning]：
- ENTRY_POINT meaning=[triggerKind,contextKind,ownerCode.factKey,contract.factKey|null,task.factKey|null]。
- EXECUTION_CONTEXT meaning=[entry.factKey]。
- EXECUTION_NODE meaning=[context.factKey,nodeKind,targetCode.factKey]。
- EXECUTION_EDGE meaning=[context.factKey,sourceNode.factKey,codeEdge.factKey]。target解析状态/候选变化由当前CodeEdge事实与激活payload承载，不把Runtime原ID混进意义。
- RUNTIME_FLOW meaning=[entry.factKey,derivationVersion]。

id前缀execution:、域declared-execution-entity-v1，tuple=[repositoryId,revisionId,kind,factKey]。stepKey前缀step:、域declared-runtime-step-v1，tuple=[flow.factKey,executionNode.factKey]。同context下Code唯一，source作为ENTRY与CODE不双建；同id出现不同语义核心时拒绝，不覆盖。Flow重算可以保持逻辑id，未来immutable记录必须绑定activation，不授权改旧行。

Entry支持继承对应领域记录的完整Source/Code/current Syntax支持与provenance；不以draft标签当SupportRef。G2仅追加真正使用的Code/Edge/Source支持，从声明input inventory取值，需与entryFacts相同ref的digest/basis完全一致；冲突拒绝。当前Code/Syntax摘要认证仍是未来Store责任。不新增Runtime-record假schema或假SupportRef用途。

externalRefs在G2/G3补齐实际外部Code/Source/Syntax闭包，已作为RuntimeFactSet内部记录的引用不重复列外部身份。graph/context/Flow关系使用现有ScopedRef；Flow支持并集保留原底层支持，不给图本身伪造独立来源。每记录sourceRange取其实际来源anchor（入口/上下文取领域声明、CALL边取CodeEdge sourceRange；可为空的Code记录保持null），归并按同path数值坐标最小代表。最后整个RuntimeFactSet解析并深冻结。

## 5. 错误、资源与重算

纯同步局部组件，不读Source/DB/网络/模型，不引入生命周期stage、lease或持久缓存。结构/basis/支持/身份冲突抛现有IR_VALIDATION_FAILED；原B-F3错误保持。没有Store写入，失败不产生半包或修改last-good。

maxItems为本包私有API的必填正safe integer，无新默认值/物理profile。G1不得超过既有MAX_PLUGIN_CONTEXT_FACTS；Execution不导入该Plugin常量，调用方显式续传同一个已授权数值。未来生产调用方还必须用EffectiveConfig准入，当前测试数值是Fixture参数，不是产品默认/质量阈值。

一个完整结果的逻辑计费：每Runtime实体、externalRef、inventory项、每record supportRef、coverage limitation/unverifiedRef、provenance引用项（仅G1）、每Flow contextRef/step/step中nodeRef/incomingEdgeRef/outgoingStepKey/supportRef各一单位；不同容器中的重复引用分别计，容器内部去重。已有保留领域输入也纳入输出总量。输入Code集合、支持inventory及入边/候选列表同时受该显式上限约束，按实际保留数拒绝膨胀；插入/保留前记账。不生成全部路径或Code×context笛卡尔积，只遍历真实入口可达部分。

本包采用**严格有限候选出口**：超限整体拒绝，不提供可被误当完整图的截断半包。原2026-10-22设计通用RequestControl下的frontier/PARTIAL截断接口仍未实现；本私有API不冒充该完整通用接口、不削减原公开验收责任。此新的局部预算适用/失败语义列入本次审查，未经批准不落实。

正常成功的coverage仍PARTIAL，固定DECLARATION_ONLY、NO_EXECUTION_ORDER_PROOF。未解调用进入unverifiedRefs（实际Code target/candidates存在才引用）；未知文本仅作固定limitation/hint，不造ref。保留G1实际限制，并以实际输入添加MESSAGE_BOUNDARIES_UNCONNECTED、DATA_OPERATIONS_UNASSEMBLED等。不得以空数组声称完整异步图，不能将空候选当删除命令。

删除/改名/绑定变化从完整当前输入重算，原图/Flow贡献消失；多支持来源仍合法则保留。没有跨basis复用指令或原地DB恢复。

## 6. 持久化、安全、兼容与后继

本包不改IR版本、旧Code/Syntax/Runtime strict形状、SQL11或已发布迁移，不新增公开index/descriptor/路由。execution依赖现有IR及已安装Zod4.6.1：属于现有允许方向和已有库的工作区接线，需在精确文件计划中显示，不下载新库/升级。Runtime/Storage不导入插件私有类型；仅测试组合模块观察整个链。

R012/R013真实表、immutable activation/membership、Code/Syntax/policy/expected旧Runtime指针共同CAS、同repo syntax/graph/flow原子激活、失败last-good/AFFECTED与提交UNKNOWN另包设计；不建立空表或假Store。完整HTTP/MESSAGE匹配/跨仓仍OPEN，未知namespace/schema不等价。AUTO工程事实/MANUAL语义知识及LLM candidate-only不变。

TASK/BATCH原context语义、真实异步PUBLISH/CONSUME和DATA操作、handler/Feign/Depends/跨文件router、完整生产资格和E01/E02仍必须补齐，未转DEFERRED。CFG/PDG、完整DiagramModel/renderer、通用调度/缓存等不进入本包。

## 7. Fixture、门禁及出口

沿用既有p1-ir-contract-v1，新增declared-execution/inputs.json、expected.json两路径，不增Fixture ID/全局库存计数/capability成熟度。预期在产品前写入完整字面Entry/graph/Flow字段、tuple/键、支持与loop/back-reference，不由compiler生成expected。

覆盖责任：
- HTTP（Spring/FastAPI）、Kafka consumer、Scheduled真实声明入口；producer/Mongo/低支持/缺owner无入口；相同handler不同入口独立context。
- direct/chain/diamond/cycle、重复source支持、同context节点唯一；EXACT只沿真实CALL扩展；HEURISTIC/AMBIGUOUS/UNSUPPORTED原不确定性保留；候选节点不进入Flow。
- 多CALL出边不是branches；无异步证据不接topic；无CODE CALL的Python仍可输出有支持的入口单节点Flow并标限制。
- 精确hash、输入置换、删除一个/全部贡献、Foreign basis、同ref异digest、source anchor、空入口、maxItems等于所需单位/少一单位拒绝。
- 预算参数为测试输入；不以Case数推precision/recall，不跑Native、DB或校准。

[集中实施任务包](../plans/2026-10-30-phase1-declared-execution.md)列文件/接口/顺序和最小命令；[作者评审](../reviews/2026-10-30-phase1-declared-execution-review.md)列边界。出口仅B_G1_DECLARED_EXECUTION_LOCAL_EXIT，尚未实施。原P1-07完整验收/Phase1父任务4/21、17OPEN不改变。

一次待确认：本文的入口及局部图/Flow含义、独立0.5政策、身份/支持/预算语义与G1–G4整包。批准后顺序实施、范围修复/必要复验集中处理，不逐步骤问；不包含真实Native/Rust/Source/helper/collector/DB/模型、profile/新库、云端CI或Git写入。

## 批准后实施结算 — 2026-10-31

G1–G4已完成，[作者实施评审](../reviews/2026-10-31-phase1-declared-execution-implementation-review.md)记录实际Fixture/命令/原失败及三项审查修复。单仓边界显式拒绝workspace refs；共享helper仅规范无序事实/支持/coverage集合，不排序signature或Flow steps。政策为获准规范约定，不是测得概率。已有包offline install拒绝既有modules清理后，保留原树，只对核实身份的两个既有库做execution局部平台junction；不声称pnpm安装通过/完整分发资格。局部hard budget拒绝仍不替代原通用frontier义务。
