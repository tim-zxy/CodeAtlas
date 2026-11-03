# Phase1 A/B 本地语义与发布闭环合同

2026-11-03；APPROVED / LOCAL_COMPONENTS_VERIFIED / A_B_EXIT_HOLD。本文及 Runtime 容器最小修订已获批准；取代此前 framework-evidence-closure 草案，历史文件保留。覆盖原P1-04..09的剩余本地语义链，不替代A6/生产进程profile、E02数字基线、P1-20或云端CI。

## 1. 交付目标与已有证据

一次形成并实施：真实受控Source的库级生产→严格raw校验→Canonical Code/Syntax→版本化历史/Stage→四框架→ExecutionGraph/RuntimeFlow→授权Application/SQLite→显式冻结集跨仓匹配/串联。已保存流进入Node应用链时标RECORDED_REPLAY/实际组件执行；不能把库级采集称为完整CLI/物理资格或所有E01/E02通过。

现状：按需scope修订后Spring原cap可完成但PARTIAL，17份旧请求/raw字节不变。确定的Spring触发路径是this.repository左值field_access未记录；Mongo已有明确资源来源Source及未知参数反例。DEPENDENCY/DATA_WATCH已经存在正式IR，不新增同义Runtime实体。父项4/21、17OPEN，仅在原门禁满足后逐项签收，不按本包任务/测试数推百分比。

方案比较：推荐一个隔离新Syntax合同＋直接表达式关系和有界callback证据；继续逐字段修旧版本会反复升级/审批，建立通用AST/数据流/CFG或伪造Code lambda节点超出所需。推荐方案不依赖新第三方库，复用现有预算、序列化、映射、存储和工作流。

## 2. 固定版本及兼容

新私有wire8，OBSERVE_CODE_SYNTAX；codeContract仍PYTHON_SYNTAX_CODE_V1，syntaxContract=SYNTAX_BINDING_V4，extractorVersion=syntax-v2。Canonical envelope codeatlas.syntax-evidence/version4；Plugin contextVersion5/syntaxSchemaVersion4。Native Code仍原Java协议2/Python Code V1；Grammar版本/锁文件不变。

旧wire1..7、Syntax1..3、Context1..4、旧history/origin、旧公开入口和DESCRIBE广告严格保持。8只提供受控库级/私有准备入口，不自动发布CLI协商/生产路由或把缺profile认作可运行。新V5 factory descriptor pluginVersion2.0.0，V4仍1.0.0；旧selector不自动选新factory。无生产配置新键或默认切换。

新版本集合不能夹旧Syntax；合同/提取版本升级即使Source未变也重观察全部Native unit，不能NO_OP或将旧projection改标4。旧历史按原版本可读，当前派生仅用同版本完整集合；旧activation/last-good不删除。新增严格分派，不迁移/重写旧JSON。

## 3. Syntax4精确结构

保留v3八kind全部字段、引用和限制。公共新增必需callbackScope: SourceRange|null；它仅标识本Source内被验证的局部callback范围，不是Code ref、Canonical Code节点或新的正式实体。普通记录为null。INVOCATION.payload新增必需invocationForm: CALL|CONSTRUCT与calleeRange: SourceRange；Java new才CONSTRUCT，Python仅凭调用语法不能自称构造。calleeRange为真实callee token（构造时为type节点）范围，不从callee名称长度计算。Canonical payload额外有必需codeCallRef: CodeEdgeRef|null：normalizer仅在当前选定Code图中按CALL kind、相同owner和calleeRange精确唯一匹配，才关联该真实Code Edge并纳入支持；否则null，不猜名字/包含范围，不改Code解析等级。raw没有伪造Canonical codeCallRef。

Site = {syntaxKind: INVOCATION, sourceRange: SourceRange}。同Source/fingerprint集合中每个Site必须唯一对应实际INVOCATION；缺失、重复、跨Source/revision、相同节点自连接均拒绝，不能取第一项。

新增三个kind，均沿现有common/Source/owner/support结构，payload严格如下：

### PARAMETER_BINDING

    {callableRef: CodeRef, language: java|python, name: Text,
     ordinal: nonnegative safe integer, parameterForm: POSITIONAL|KEYWORD_ONLY,
     declaredType: Text|null, typeRange: SourceRange|null,
     defaultValueRange: SourceRange|null}

owner与callableRef相同，lexicalScope为callableRef，callbackScope=null；sourceRange为真实参数语法范围。typeRange/defaultValueRange同文件并包含于参数范围；Java普通参数无default，declaredType来自真实type，PythontypeRange是annotation表达式，不能将函数return type填参数类型。ordinal是源码参数顺序，不是预算/门槛。

按callable验证PARAMETER_BINDING的name/ordinal与CALLABLE.parameterNames完整一致；不支持varargs/复杂参数时原限制保留，不能用缺少记录声称完整。新索引只消费这套已核对的参数定义，避免再把parameterNames加为第二个独立定义；旧Context4保持原路径。

参数绑定与默认值求值分开：默认值/annotation内INVOCATION沿语言真实外scope，不能强改到callable。Depends正例必须调用范围精确等于defaultValueRange，factory绑定到fastapi.Depends，provider参数为同一完整名字作用域中的唯一有支持CALLABLE；普通annotation的Depends不视为默认注入，输出明确不支持/需审查而非Dependency。

### VALUE_LINK

    {relation: RECEIVER_RESULT|ARGUMENT_RESULT,
     producer: Site, consumer: Site, argumentIndex: nonnegative integer|null}

RECEIVER_RESULT的argumentIndex必须null；ARGUMENT_RESULT必须是consumer参数合法下标。producer范围必须严格包含于consumer的对应receiver/argument表达式位置，表示直接语法结果，不表示先后运行或任意别名数据流。按AST字段证明关系，不能按range相邻或name猜。环/自连接拒绝。

跨statement的简单局部变量仅复用现有TYPED+DIRECT_VALUE唯一同site初始化及isDirectAssignmentCall：无其他write/effect，初始化在使用之前，同完整Code scope。字段/复杂别名/分支合流不做通用传播。关联的所有producer/consumer/assignment/parameter/import支持必须进入最终草稿支持。

### CALLBACK_BINDING

    {consumer: Site, argumentIndex: nonnegative integer,
     callbackForm: JAVA_LAMBDA_DIRECT_CALL|JAVA_METHOD_REFERENCE,
     parentScopeRef: CodeRef, parameterNames: Text[], body: Site|null,
     reference: {qualifier: THIS, memberName: Text}|null,
     status: COMPLETE|PARTIAL, limitations: Text[]}

本记录sourceRange等于consumer的该callback参数范围，owner为真实包围Code callable，lexicalScope=parentScopeRef，callbackScope=null。该Code scope只能说明注册表达式位于何处，不冒充lambda自身Code scope。

JAVA_LAMBDA_DIRECT_CALL：只接受表达式体直接handle(p)或this.handle(p)，仅普通参数，body为唯一真实INVOCATION，reference=null。forEach对应一个参数且body实参是该参数引用；不接受block、嵌套callback、赋值、分支、捕获别名或任意表达式运算。body记录lexicalScope=null、callbackScope等于本callback范围，controlContext保留UNKNOWN（不是已执行无条件调用）。局部参数遮蔽先判断，随后才查parentScopeRef的完整Code链；不得将body强行放进父scope。

JAVA_METHOD_REFERENCE：支持this::handle，parameterNames=[]、body=null、reference为实际语法；不按receiver值或名字猜外部对象方法。

handler必须由当前同类型/同Source的唯一有支持CALLABLE声明证明，Consumer签名对应单参数，且private/static/final方法或final所属type足以排除覆盖歧义；不满足则未验证。保持原Code调用/引用resolution，不将provider的UNRESOLVED/HEURISTIC写成EXACT。新局部证明生成的是规范声明binding，仍HEURISTIC，不宣称观测到运行派发。

COMPLETE仅指这个受限callback的语法名字空间已完整枚举，limitations为空；不支持形式保留旧PARTIAL/UNKNOWN，不因新增callback字段就通过。此结构不是第三方插件scope/通用语言lambda模型。

## 4. 集合校验、身份与预算

IR提供唯一validateSyntaxSurfaceClosure，供Plugin5和Storage调用；验证普通Code scope闭包、参数覆盖、所有Site、callback包含/归属/局部shadow、引用与Source支持。单条parse不能代替集合闭包。所有新record/range/ref、索引项、序列化、遍历/祖先及临时保留量沿原同账本准入；原maxItems独立于maxEvents，按需scope优化保留，不免除真实访问。

normalizer4输入明确包含selectedNodes和selectedEdges；仍使用ProviderFactBinding/Evidence/FactEvidence及当前selected Code认证owner/callable/parent ref、真实codeCallRef；Code支持不足或引用缺失拒绝。Site/range为Canonical SourceFile ID范围，不把providerSyntaxId当跨record身份。

providerSyntaxId新域java-syntax-v4/python-syntax-v4，沿原长度前缀tuple(path,kind,startByte,endByte,canonical payload及公共meaning区分值)，同site不同角色不碰撞。Canonical syntax-key-v4 tuple沿v3的repo、Source ID、fingerprint、range、kind、meaningDigest；meaning={owner,lexicalScope,callbackScope,controlContext,payload}，Code ref压为kind/id、不含provider/revision。extraction域syntax-extraction-v4，tuple=[syntax-v2,syntax-canonical-mapper-v4,syntax-surface-support-v2,SYNTAX_BINDING_V4]。provider变化等价输入key不变；版本/角色/关联变化改变key，origin不可覆写。

syntax-surface-support-v2沿已批准规范score0.5及弱Code支持上界，仅扩展上述同类表面证据适用性；不是新经验概率或调分。必要Code支持低于既有值继续拒绝。旧v1 policy不改。完整性与规范支持度分开，不以更多字段/多插件一致提高置信。

## 5. 生产器覆盖及成员写

仅新mode8适用以下修订，旧版本结果严格保留：

- 简单identifier与this.identifier的=赋值产生现有ASSIGNMENT，精确target/valueRange/control；成员写参与现有memberWrites拒绝，不可删记录转绿。数组、动态/复合左值继续限制。
- 普通无匿名class_body的Java构造不创建词法scope，发CONSTRUCT观察并完整遍历参数；匿名类/未知绑定仍限制。
- CALL_RESULT、CONSTRUCTION_RESULT、CALLBACK_VALUE只在对应AST和所需调用/链接/有界callback记录齐全时作为值UNKNOWN保留而不单独令表面枚举PARTIAL。其他DYNAMIC_EXPRESSION、未建模绑定、错误/遗漏仍PARTIAL。不是对旧Java/Python版本的全局例外。
- this值可表示未解析REFERENCE(this)，但不生成虚构self Code节点；仅有界callback规则能使用这一语法限定。
- 记录真实参数及callback所需角色。受限callback体的lexicalScope仍null，由callbackScope和有界frame验证，control仍UNKNOWN；未识别lambda不适用例外。

COMPLETE仅说明声明式表面枚举，不说明部署/动态值/运行时可达性。Source/code coverage各自保留，不用Syntax结果替Code缺口签收。

## 6. 四框架规则和静态声明边界

共用一个Context5名称/类型/局部来源索引；不在四框架重复解析或读Source。参数/已支持typed初始化、local callable/type/import来自真实Canonical支持，shadow/effect/条件/模糊仍拒绝。

Spring：原路由、prefix、Scheduled和Feign接口声明规则复用。Autowired仅产生“所需声明类型”的DEPENDENCY，dependencyRef为真实TYPE，不选bean实例/实现类，不推断已部署注入。类型不在当前Code、歧义、未支持qualifier仍未验证；不能将多个实现选第一项。给Feign调用增加callsite规则：已证明的receiver类型指向当前@FeignClient接口、唯一方法/arity及mapping声明，生成以调用点owner为implementation的HTTP消费contract/binding；接口声明本身保留，不假造Code CALL解析。

Kafka：复用已批准same-site/简单泛型与send/listener规则，topic动态或receiver有write/shadow仍拒绝。没有实际入口的producer方法不造EntryPoint；入口/上下文来自真实声明。

FastAPI：保留app/router/include_router及静态prefix；新增上述PARAMETER_BINDING限定的Depends默认注入，dependencyRef为有支持provider CALLABLE。annotation/shadow/动态provider或无精确默认角色不绑定。

Mongo：保留MongoTemplate读写。支持已证明MongoClient.getDatabase(静态名)→MongoDatabase.getCollection(静态名)→collection.watch()→forEach(CALLBACK_BINDING)的直接/唯一局部初始化链。DataResource为MONGODB_COLLECTION，namespace=数据库名，logicalName=集合名；handle是真实已证明Code callable。旧仅MongoCollection参数且无来源的watch不借其他方法常量补齐。

watch产生既有DATA_WATCH和DataChangeTrigger，未指定change operation沿现有UNKNOWN，不伪造INSERT；已有Execution派生EVENT/DATA_CHANGE入口，保持事件语义边界，不变成注册表达式直接执行一次handler的普通CALL；Java Sync Driver的forEach可阻塞当前线程，EVENT不证明独立线程或异步调度。DEPENDENCY只表达依赖，不自动变执行CALL。

## 7. 覆盖、置信、候选与持久化

新V5 compiler内部建立framework相关site清单。每site必须HANDLED（含所需事实/支持）或有规则支持的NOT_APPLICABLE，否则UNVERIFIED/UNSUPPORTED使PARTIAL。imports、class/route marker、资源来源步骤可作为实际消费过的证明，不要求每条都生独立实体。未知receiver与框架API相关且无非框架证明时保留缺口；不能仅因为没有成功draft就忽略。

所有相关site处理、Source/Code/Syntax支持与scope成立、无缺失规则/关系且任务完成，才输出COMPLETE且limitations/unverifiedRefs均空。否则保持PARTIAL/UNSUPPORTED，不动last-good。旧V4恒PARTIAL及其方法完全保持；新V5不会简单删除两个历史常量来声称完成。

runtime-declaration-support-v2/runtime-execution-declaration-v2沿已批准规范score0.5、HEURISTIC及支持门槛，明确适用新声明事实和派生；不表达运行成功或bean选择。旧v1仍按原方法解析。新集合不混用两套policy；Graph/Flow新入口沿v2，老入口仍v1。Code低支持不被新策略抬高。

既有Runtime/FrameworkBinding envelope仍1，不新增Runtime实体/SQL迁移。DEPENDENCY目标使用Code.factKey；DATA_WATCH沿已有binding tuple的最后关联槽加入handler.factKey，普通binding原tuple不变。声明意义相同的既有Runtime factKey不因provider/版本换名；activation的候选/支持/策略身份改变，旧内容不可覆写。

policyDigest新分支runtime-policy-v2绑定方法集合与framework-rules-v2/framework-coverage-v2；旧分支摘要字节保持。旧runtimeCandidateDigest保持facts/bindings/coverage原算法；新V2候选使用§7.1的新域并绑定derivation，不以旧摘要遗漏site-plan。真实Store认证全部Code/Source/Syntax支持及peer binding；callback/parameter/site闭包复用IR校验，不导入Plugins。

新增readFrameworkInputsV2严格读取全Syntax4集合，原readFrameworkInputs仍全Syntax3。新增固定Runtime V5准备/组合入口，Application继续授权、合并和Graph/Flow，Storage不读Source或调用模型。Source/Code/Syntax/旧指针CAS、同lease、联合事务、unknown commit只读恢复、last-good和workspace跨库stale语义不变。新合同用现有JSON版本分派，不改R001..R013/W001..W006/checksum或历史行。

联合提交必须在写事务前派生。新增私有readFrozenFrameworkInputsV2(stage, lease, limits)，仅接受真实FROZEN Stage及其同实例live lease，沿原累计账本读取最终Code/Syntax4/Source/support视图和预计syntaxMembershipDigest；不从尚未提交的SQL指针读，不先提交Syntax再凑Runtime。该只读投影不授新lease、不允许任意callback，Source/根/上下文变化按原Stage失败语义撤权。固定Runtime编译器消费此视图，Store.applyWithRuntimeV2仍在原一次事务写Code/Syntax/Runtime并核对实际最终身份。分开的Runtime refresh仍用readFrameworkInputsV2读取已提交当前集合，两种路径同一编译器，不复制规则。

## 7.1 图派生闭包与调用点计划（本包必做）

实码deriveExecutionGraph也无条件加入DECLARATION_ONLY/PARTIAL，且将Code CALL逐条展开；因此仅修Plugin不能发布，必须同包治理，旧入口保持原行为。新增deriveExecutionGraphV2/deriveRuntimeFlowsV2只接受下列当前输入验证过的私有计划，不给旧入口增加可跳过验证的布尔值。

RuntimeSitePlanV1为瞬态派生元数据，不是新核心实体：

    {basis: RepoBasis, syntaxMembershipDigest: Digest,
     entries: [{siteKey: SyntaxKey, sourceRange: SourceRange,
       ownerRef: CodeRef, codeCallRef: CodeEdgeRef|null,
       role: FRAMEWORK_BOUNDARY|FRAMEWORK_ORIGIN|CALLBACK_BODY|ORDINARY_CALL|DECLARATION_ONLY,
       bindingIds: EntityId[], proofSyntaxKeys: SyntaxKey[]}]}

按当前Syntax4 INVOCATION全量建立，不是只收成功draft。siteKey/Code边/owner/range/proof必须属于同一完整当前集合，图合并前覆盖所有相关Source sites；无匹配Code能力也保留site，不生成Canonical Code边。FRAMEWORK_BOUNDARY必须有同site的严格binding，FRAMEWORK_ORIGIN必须被完整资源/构造来源证明消费；CALLBACK_BODY必须有上述有界callback与handler证明。不能让任意用户plan删边；计划只经固定V5编译器/受控Runtime组合进入授权发布，IR负责结构/引用闭包，Plugins负责框架意义，不在Storage复制绑定算法。

所有实际Code CALL默认仍走原规则。只有精确codeCallRef和完整角色证明时，才在新Runtime图中将该边作为已表示的framework边界/资源来源/事件callback处理，避免重复同步CALL；Code图本身绝不删除、重写或升解析等级。无法配对或未被角色覆盖的Code CALL仍原样保留，未解析/低支持/缺Code能力导致必要路径未知时PARTIAL。不以SourceRange包含关系批量吞掉嵌套调用。body的Code CALL不能被画成注册方法同步执行handler；DATA_WATCH沿原EVENT入口/资源触发边派生。

新图覆盖的固定目的为LOCAL_DECLARED_RUNTIME_V2：全部适用本仓声明/边界/受支持调用均已表示。已证明HTTP/消息边界的目标在其他仓库时，局部边保持NON_RESOLVED并明确CROSS_REPO_RESOLUTION_PENDING，不把已声明边界枚举缺失与尚未运行的跨仓匹配混为一项。这个目的不声称端到端目标已解析；E05/E06仍必须用冻结workspace实际匹配/串联验证，关键目标未命中不能通过对应probe。普通未知调用、缺失binding/支持、预算/深度frontier仍PARTIAL，不能套此例外。

coverageScope必须在v2查询/收据中明示LOCAL_DECLARED_RUNTIME，不能向用户仅显示COMPLETE而隐藏目的。原V1图/Flow及query语义不变；新Flow沿原不跨异步/branch/join的确定遍历，不推断执行时序，NON_RESOLVED目标在step中可见。

RuntimeBatchCandidateV2严格增加derivation：

    {syntaxContract: SYNTAX_BINDING_V4, rulesVersion: framework-rules-v2,
     coverageVersion: framework-coverage-v2, graphPolicy: LOCAL_DECLARED_RUNTIME_V2,
     sitePlan: RuntimeSitePlanV1, sitePlanDigest: Digest}

新runtimeCandidateDigestV2使用runtime-candidate-v2域，把原facts/bindings/coverage与derivation一同绑定；原v1摘要函数/tuple不改。R012 activation的SQL外壳保持schema_version=1，payload_json使用严格{formatVersion:2,identity,candidate}保存该derivation；旧{identity,candidate}格式及version1读写不变，未知/混合格式拒绝；RuntimeFactSet/FrameworkBindingSet仍各为envelope1。不改DDL、表/行key、migration/checksum，不回填旧行。只读重开按版本验证full plan/digest及历史Syntax/Code支持，不移植当前Code给旧activation。

联合Syntax4+Runtime事务仍只一次commit；新metadata计入原JSON/SQL预算。ContractStore读取与FrozenContractSet继续用已有binding身份，v2候选/策略摘要提供新身份；workspace查询保留本仓覆盖范围与实际match状态，不将OUTSIDE_WORKSPACE/UNRESOLVED伪装MATCHED。

## 8. 原门禁与本包退出

E01：12份独立Source oracle与真实库producer、Canonical映射、固定Plugin/Application/Store组件结果逐条支持；重放与完整ACTUAL_PRODUCT资格分列，不能替换生产Runtime进程要求。E02：原批准critical baseline缺失时NOT_EVALUABLE，不从新Source case数造分母/阈值。

E03/E04：复用原execution-flow五context/异步/完整step支持与重排等价；Source主链证明REQUEST/EVENT/JOB/DATA_CHANGE关联，TASK/BATCH按原明确Fixture输入验证，不为凑数虚构框架API。E05/E06：六种匹配结果原Fixture保持，新增Feign调用→FastAPI真实路径对应Source的明确跨仓场景；service身份/FrozenContractSet显式提供，不猜服务。

本包本地退出须：新合同/独立oracle、旧兼容、12Source库流、真实validated组件存储/跨仓、失败保留、文档追踪全部满足；必须缺口继续HOLD。A6/精确构建profile与生产Source进程/CLI、E02量化批准、P1-20/两系统E2E与CI另保留，不因本包通过自动给Phase1盖章。可按原门禁逐项确认父项，不能固定组件数冒充完成率。

完成后C/D可基于稳定Application/IR接口继续其准确包，物理资格单独跟踪；不让无依赖工作无限等待，也不宣称未执行门禁已过。

## 8.1 框架语义主依据

核对官方[FastAPI依赖](https://fastapi.tiangolo.com/tutorial/dependencies/)、[Spring Autowired](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html)、[Mongo Java同步驱动change stream](https://www.mongodb.com/docs/drivers/java/sync/current/logging-monitoring/change-streams/)。仅采用本文明确的API语法子集，不承诺所有框架版本/注解形式。Mongo的阻塞迭代尤其说明：事件上下文并不等价于新线程或实际异步调度，本包不据回调语法推断时间/线程。

## 9. 审批范围

一次审批本文、实施计划、独立Fixture、Node本地/owned SQLite、明确库级Rust/Code producer测试批次及其范围内必要修复复验。预算/运行来源与停止条件见计划。不含生产Native CLI、A6 helper/collector、模型/联网、用户DB升级、校准或新profile/质量数值、依赖、CI/Git写入、新代理/工作树。

本次只是精确设计交付，不实施。完整字段/身份/规则/边界已在本文选定为推荐；批准后不再逐字段、框架或层申请。新证据若证明FROZEN冲突，集中提出准确差异，保留失败而不静默改契约。

## 实施发现：容器版本冲突（待治理，非静默修订）

2026-11-02真实owned SQLite联合写入证实§7.1的SQL schema_version=2被R012 CHECK(schema_version=1)拒绝。该支路HOLD；原迁移/门禁不改。准确最小修订与续接包见[待审DCP](2026-11-02-phase1-runtime-container-version-proposal.md)。未经批准不采用替代格式；其他原批准项继续有效。四表回滚读证据及准确167PASS/1FAIL见唯一B results/progress，不能签收联合事务或整包。

2026-11-02用户批准Runtime容器最小修订：SQL schema_version=1，严格JSON {formatVersion:2,identity,candidate}；旧{identity,candidate}及迁移/checksum保持，未知格式/混格式拒绝。真实owned SQLite联合Code/Syntax/Runtime、准确membership/activation、旧入口拒绝、只读重开及坏格式拒绝1/1通过，见ab-local-closure/store2-approved-green-02.log。首次负向UPDATE被原R012_IMMUTABLE拒绝，已改为仅disposable Fixture新增坏子行，未禁用触发器或修改迁移；该失败保留store2-approved-green.log。原SQL版本冲突HOLD由本批准及新证据限定解除；原失败记录不删除。原U0–U7继续，完整factory/SPI、Application/Runtime与跨仓、U6/U7仍待，无新Native/CI/Git。


## 2026-11-03 实施澄清与当前出口

私有 V5 extraction continuation 传递既有 syntaxMembershipDigest（基础 Context5 不变），两候选共享同一 plan；descriptor 只声明实际已有观察及语言 Code facet。共享上下文按 site 合并固定规则的证明，硬限制与真正未知保留。Autowired 必须完整证明该 site 的所有必需类型；部分参数有证明不能关闭未证明的参数。

SQL1/JSON2 已按获准 DCP 实施；下面旧“待批准/仍待”是历史快照。当前 U0–U4 本地组件和 U6 范围验证已有结果，U5 正向跨仓因缺 schema 兼容证据 HOLD；[准确评审与原门禁映射](../reviews/2026-11-03-phase1-ab-local-implementation-review.md)。不以负向拒绝 PASS 替代整包退出。
