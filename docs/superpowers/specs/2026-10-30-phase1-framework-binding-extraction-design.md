# B-F2-C：共享绑定与四框架声明草稿设计

状态：用户已批准C1–C3本地实施，2026-10-30；当前B_F2C_DECLARATION_DRAFT_LOCAL_EXIT；同根导入澄清已获批准并验证。使用 brainstorming、writing-plans、Ponytail full；按用户要求集中设计、顺序实施、最小验证，不创建代理或 Git 写入。

## 1. 目标、基线与选择

以已交付 B-F2-B 的私有 wire7 → Syntax3 → Context4 为输入，建立一个共享保守绑定器及四框架的首组静态规则，输出现有 FrameworkDraft v1。成功是可复现的声明意图草稿与覆盖限制，不是已运行的端点、完整 Plugin、Canonical Runtime 或 Phase1 验收。

前置证据：[B-F2-B实施评审](../reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)及其 results.json；19/19新Node、3/3Rust及76/76旧兼容是前包收据，本轮未重跑。作者已核对实际 syntax-evidence-v3.ts、plugin-context-v4.ts、framework-draft.ts、framework-detection.ts 及旧 isDirectAssignmentCall。现有 Schema 不提供部署/bean 注册、Mongo handler 注册、跨文件 Python module 导出求值或参数默认表达式到参数的显式关联。不得以草稿补造这些事实。

方案比较：
- 推荐：一份 Context4 索引，共用保守名称证明，薄的四框架规则，仅生成现有严格草稿。复用所有已批准 IR、支持及键，不再新增 wire/IR/history 版本。
- 各框架分别写绑定：重复遮蔽/失效逻辑，拒绝。
- 增加通用 CFG、跨文件解释器或让 Plugin 重解析：扩大成本和权限，拒绝。

用户已批准本推荐及C1–C3整包；实施中新发现的同根dotted-module歧义随后另获明确澄清批准。完整四框架目标继续有效；本包的有限规则和后续缺口见§4/§8，不将缺口改为 DEFERRED。

## 2. 模块、接口与错误

新建 packages/plugins/src/framework-bindings.ts，共享 Context4 的文件、Code、Syntax、scope 和按作用域/名字分组的索引。只接已验证 PluginV4Context；内部类型 FrameworkBindingIndex。导出私有模块函数：
- createFrameworkBindingIndex(context: PluginV4Context): FrameworkBindingIndex
- bindImportedName(index: FrameworkBindingIndex, site: SyntaxEvidenceV3, name: string): BindingProof
- bindDeclaredReceiver(index: FrameworkBindingIndex, site: SyntaxEvidenceV3): BindingProof

BindingProof 是内部判别联合：BOUND 携带 qualifiedName:string、support:PluginV2Support[]；UNPROVEN 携带下述固定诊断 code。不是 Canonical resolution，不修改原 callee.resolution。索引的具体 Map 布局由实现者决定，不提供通用 resolver 插件或持久缓存。

新建 framework-extraction.ts：extractFrameworkDrafts(input: unknown, framework: 'spring'|'mongo'|'kafka'|'fastapi'): FrameworkExtractionResult。未知 selector 拒绝；入口 validatePluginV4Context 一次。返回深冻结的 {drafts: FrameworkDraft[], diagnostics: ProviderSnapshotDiagnostic[]}；逐条草稿仍经过已有 strict 校验，诊断复用 IR 既有 schema。框架无证据时空结果；有相应已声明导入/目标语法而不能证明时给定位诊断。不从 F0 的 matched 推导绑定。

规则放 framework-rules.ts 的四个固定函数，不注册到 public index、生产 Runtime router 或旧 Plugin descriptor；同一结果不称 V4 完整 extract SPI。仅当文件体积确有阅读负担才按框架拆文件，不建立注册/策略框架。

framework-draft.ts 提取现有 key 计算和已验证 context 的私有校验 helper，提供 createFrameworkDraftFromValidatedContext(context, {framework,ruleId,sourceRange,proposal,support})，参数类型来自已有 schema 的 pick/omit；旧 validateFrameworkDraft 包装入口及错误/键语义保持。不要在每条输出重复解析整个 Context4，不复制 canonical JSON/哈希算法。create helper 必须走同一结构/引用/键检查，不能成为绕过入口。

非法结构/引用/basis 使用原 IR_VALIDATION_FAILED；合法输入的证据不足使用 WARNING：
FRAMEWORK_BINDING_UNPROVEN、FRAMEWORK_SCOPE_PARTIAL、FRAMEWORK_NAME_CONFLICT、FRAMEWORK_CONTROL_UNPROVEN、FRAMEWORK_VALUE_UNSUPPORTED、FRAMEWORK_API_UNSUPPORTED、FRAMEWORK_REGISTRATION_UNPROVEN、FRAMEWORK_SIGNATURE_UNREPRESENTABLE。
不输出原始源文/环境/凭据。无 fs/network/process/model/Storage 权限；无配置新增键。

## 3. 绑定证明

### 3.1 所有正绑定共同条件

site 必须有同文件 lexicalScope，所查询的 scope 与查找祖先链都 COMPLETE。除结构性 scope 外，用于正证明的观察必须 UNCONDITIONAL；条件调用可以留诊断，不解可达性。收集每个查找 scope 的 BINDING_SCOPE 支持，保证“无其他定义”依赖的完整性有显式依据。

同名普通赋值、声明、参数、import、effect 参与名字集合。Python CALLABLE 声明的名字在 parent 建立，参数在 callable 中遮蔽；Java TYPE 在外层、typed binding 在其实际 lexicalScope 建立，不能把方法返回类型当变量类型。查找不依赖数组顺序。IMPORT_ALIAS 与 IMPORT_BINDING 不可盲算成两次写：只有同文件/同scope、targetName=boundName、源范围相同且alias值明确对应相同qualifiedName时合为同一导入证明，支持保留两条；不能证明该对应就拒绝。Code节点仅核对身份，不作为额外同名定义重复计数。CALLABLE.parameterNames是参数遮蔽摘要；仅有摘要而无精确参数类型记录时可以阻断外层，不能生成正typed receiver证明。内层存在任何同名声明，即使在 site 后，也阻断外层 Python 名字；不推 reaching definition。

查询名字若有多个候选、重赋值、UNBIND/AUGMENT/循环等效果，或 GLOBAL/NONLOCAL 对该目标 scope 的写影响，拒绝正绑定。扫描 effect 时同时使用 targetScopeRef，不能只看 site 当前 scope。未知名字/目标、未知 import 依赖已由 scope PARTIAL 阻断。wildcard/relative import 无绝对证明，拒绝经过该 scope 的相关正绑定。字段/属性写须以 targetName 的根名及完整 member 名与受查询对象核对，不能忽略 app.get = replacement；无法证明 effect 枚举完整时保留 PARTIAL。

Python 只沿已记录 scope 父链查找。Java 不按源码位置猜块/继承/重载；块限制、type parameter、自定义同名 TYPE 或变量遮蔽均拒绝。相关 scopes PARTIAL 时绝不回退按名称匹配。

### 3.2 导入名称和调用

Java JAVA_TYPE、Python PYTHON_SYMBOL 可直接证明唯一导入别名到限定名的声明；PYTHON_MODULE 仅在现有字段能证明绑定模式时展开成员链；qualifiedName含点且boundName等于首段时，按已批准[同根导入澄清](2026-10-30-phase1-dotted-module-binding-clarification.md)返回UNPROVEN，不能正支持 import a.b 或 import a.b as a 的歧义形式。其他明确别名的后续成员链必须完整对应导入路径。JAVA_STATIC_MEMBER 只证明显式成员，不当 TYPE。拒绝 wildcard、relative、自定义同名、跨文件导出和内置名推测。完全限定拼写仍要证明其根名未被遮蔽，不是白名单字符串即通过。

callee RESOLVED 时仅 EXACT 可用，且 actual target 的 qualifiedName 必须与导入/类型证明相符；HEURISTIC/AMBIGUOUS/UNSUPPORTED 拒绝。NON_RESOLVED/UNRESOLVED 仅在 candidates 为空、名称表达式能由上述导入闭包唯一证明时，可证明“源码声明的框架目标”，不改写其 Code 解析等级、不声称实际分派 EXACT。有候选但未解析不忽略。

Python app/router 只接受唯一 DIRECT_VALUE 赋值且 valueRange 与构造 INVOCATION 完全相等；复用旧 helper 的关系条件，新增 v3 typed wrapper，不把 v3 整体送旧 schema parser。构造先于使用，同一模块、无第二赋值/别名传播，构造目标须证为 fastapi.FastAPI 或 fastapi.APIRouter。FastAPI 构造只接受无参数，APIRouter 只接受可选 prefix；其他构造参数本包诊断。UNKNOWN(CALL_RESULT) 不当具体返回值，身份来自直接右值关系。

Java receiver 只接受裸局部名或 this.field：唯一 TYPED_BINDING 的 declaredName 精确匹配，declaredType 为可由显式 TYPE import 证明的简单名或完整限定名，拒绝泛型文本、复合表达式、继承推测。this.field 必须有同 TYPE 的字段声明；裸名先检查参数/局部遮蔽。类型证明只说明静态声明意图，不证明 bean 实例、非 null、实际网络/数据操作已执行。

## 4. 固定规则矩阵

所有 proposal 的 basis 来自当前 context；implementationRef 为实际 callable owner，不以 MODULE 代替函数。支持含 anchor、导入/类型、所有查找 scope、构造/声明和必要容器关系；任何缺支持不得输出。每个 ruleId 固定为下表值加 :v1。

|ruleId|正例及准确输出|拒绝/限制|
|---|---|---|
|spring-http|显式导入 org.springframework.web.bind.annotation 的 GetMapping/PostMapping/PutMapping/DeleteMapping/PatchMapping，真实 METHOD owner；单个 literal value 或 path，二者不能同时出现；由 BINDING_SCOPE 父链唯一证明所在 TYPE 的单个 RequestMapping literal 前缀可组合；无类 mapping 时空前缀。HTTP PROVIDER，方法由明确注解固定|多个 mapping、方法 RequestMapping 的 method 解释、接口/继承/自定义组合注解、placeholder、动态/数组路径、未知额外匹配参数（params/headers/consumes/produces）拒绝；这只是声明映射，不证明 Controller bean 活跃|
|spring-cron|org.springframework.scheduling.annotation.Scheduled 的单个 cron literal，JOB TASK；schedule 为 OBJECT，仅包含原 cron STRING entry，不翻译时区/周期|空/占位符/表达式 cron、同时 fixedRate/fixedDelay、zone/timeUnit 等本包未实现项诊断；不证明调度器已启用|
|mongo-template-read|已证明 org.springframework.data.mongodb.core.MongoTemplate 的 receiver；find/findOne 恰3参数，findAll 恰2参数，末参数为非空 literal collection；DATA_OPERATION READ，resourceKind=MONGODB_COLLECTION，namespace=null|无显式 collection 的类型命名推断、动态 collection、同名普通方法、reactive/fluent 链及不在表内 overload 拒绝|
|mongo-template-write|同 receiver；insert/save 恰2参数，末参数非空 literal collection；DATA_OPERATION WRITE，其他字段同上，handlerRef=null|不猜 remove/update overload，不把 WRITE 当 DataChangeTrigger，不从文档对象推 schema|
|kafka-listener|org.springframework.kafka.annotation.KafkaListener 的真实 METHOD；仅 topics 为一个非空 literal 字符串，或非空、去重 literal STRING 数组；每 topic 一个 MESSAGE CONSUMER，transport=KAFKA，namespace=null|topicPattern/topicPartitions、SpEL/placeholder、跨集群推断、额外未知配置不忽略；不是已启动 listener 的证明|
|kafka-send|已证明 org.springframework.kafka.core.KafkaTemplate receiver 的 send，2/3/4/5 参数固定公开 overload，首参数非空 literal topic；MESSAGE PRODUCER，transport=KAFKA，namespace=null|sendDefault/ProducerRecord/Message/fluent/泛型 declaredType 本包不支持；不从 payload/key 猜 schema|
|fastapi-route|同文件 MODULE 的已证明 FastAPI/APIRouter 对象；get/post/put/delete/patch/options/head decorator，首位置参数或 path keyword 唯一 literal 路径；真实 callable owner。HTTP PROVIDER；APIRouter prefix 加下述唯一 include prefix|动态/嵌套调用、通配、额外未知 path 参数、条件定义、反射注册、未知装饰器包装关系诊断；不证明 server 已启动|
|fastapi-include|同文件模块内 FastAPI.include_router(router,prefix=literal)，两个对象都有唯一上述构造；router 构造 prefix 仅 literal 或官方默认空串。仅一跳 router→app，include 必须在该 router 的 route 声明之后|多个 include、router→router、循环、跨文件、include 后才新增路由、动态 prefix/依赖/未知参数诊断。未包含的 router 路由给 REGISTRATION_UNPROVEN，不作完整应用端点草稿|

Mongo 上述每个正操作同时生成同 collection 的 DATA_RESOURCE，schemaRef=null；不得按名字合并不同 namespace 的实体，这里的 null 明确是未知，不是共同部署证明。key 按既有输入范围 identity，不新增持久资源身份。

HTTP path 只处理绝对路径：根 / → []，普通非空段 → LITERAL，整个段 {identifier} → PARAMETER。拒绝重复斜杠、非根尾斜杠、query/fragment、编码/正则/converter/混合花括号/通配，不自行等价归一化。组合前缀仅去掉连接点的一次分隔斜杠，不修改段内容；各输入先独立校验。schema refs/serviceHint 均 null；未知 Request/Response schema 不伪造。

规则参数只接受固定表可解释的名称/位置，duplicate keyword、冲突 positional/keyword、未知影响语义的参数拒绝。query/payload 等不参与合同身份的参数可以保持 UNKNOWN，但不得掩盖 topic/path/collection 的未知。未实现声明必须有定位限制，不能称完整覆盖。

Kafka namespace=null 不允许跨仓 channel 匹配；listener topics 的每个元素共享原 Syntax anchor。API 的参数个数为源码结构条件，不是新 profile/数值门槛。

## 5. 支持、重算、资源和恢复

草稿使用原 framework-draft-v1 key 域、同 basis、引用和冻结规则。支持去重并稳定排序；输出按 draftKey 再 ruleId 排序。同 draftKey 多结果只保留按 ruleId 精确字典序最小的已验证草稿，不拼接或丢失该草稿自身支持；相同 ruleId 时以排序后的 support 序列作稳定 tie-break。不要按名称合并不同 anchor，禁止另定义身份域。

不持久化绑定结果。每次对完整当前 Context4 重算；删除/改名/改 import 后旧草稿不进入新结果，NO_OP 的同输入置换结果不变。不在旧结果上补丁式追加。有效输入的局部未证明可返回其他独立已验证草稿及诊断，但结果绝不代表完整发布。非法输入或资源上限失败时整个调用抛原错误，不暴露半个可发布结果；无 Store 写入或事务恢复责任。

沿用 MAX_PLUGIN_CONTEXT_FACTS 的现有值作为本私有调用的草稿和诊断总条数上限（新的使用语义已获本包批准，不新增数值）；每次 append 前检查，超过抛 IR_VALIDATION_FAILED。不把该逻辑 cap 冒称物理内存资格。只用既有有界数组/Map，按 scope/name 建索引，禁止为每个规则复制全量 Context 或构建路径笛卡尔积。topic 数组也受同一输出上限。不增加时间/RSS门槛或默认配置。

## 6. Fixture、Evaluation与验收

复用 p1-plugin-context-v2 的 fixture.json，新 binding-extraction/inputs.json 与 expected.json，先独立编写输入和字面预期，不调用产品 binder 生成 oracle。只有本Fixture新增键，不加全局库存计数或新Fixture ID。新测试统一挂一个根脚本，既有框架 E01/E02仍另行验收。

|责任|独立矩阵|验证|
|---|---|---|
|共享绑定|Java TYPE/static/wildcard/同名TYPE/参数/字段/局部；Python symbol/module/alias/dotted/relative/wildcard；后置局部遮蔽、GLOBAL/NONLOCAL、循环/删除/增强写、属性重写、PARTIAL祖先、非exact callee|framework-bindings.test.mjs；BOUND 必须带全部相关支持，负例不生成草稿|
|Spring|方法/类 prefix、cron正例；数组/冲突/动态/自定义注解/额外约束负例|framework-extraction.test.mjs 的 spring cases；HTTP/TASK 精确 payload|
|Mongo|显式collection READ/WRITE/RESOURCE；假 receiver、未知集合、watch-only、缺handler、同名不同类型|同测试 mongo cases；无 WATCH/DataChangeTrigger 冒认|
|Kafka|显式topic producer/consumer、topics数组；重名/动态/placeholder/sendDefault/namespace未知|同测试 kafka cases；无schema或跨仓等价推断|
|FastAPI|直接app、router/prefix/一次include；include先于声明、重注册、跨文件、遮蔽、Depends缺关联|同测试 fastapi cases；只有本包正能力输出|
|共同边界|支持删除/外basis/输入置换/同key去重/输出上限/旧V2V3拒绝/Runtime拒绝草稿|同测试公共cases；旧 framework-draft/V4测试回归|
|生产者适用性|引用 B-F2-B r5 的实际Syntax3/V4桥，确认本包仅依赖这些已存在字段；Source pkg.Factory 不是fastapi正例，不改名伪装|只读适用性审查，不重跑管线；不将其当真实框架正例|

此包无新的真实 Source→框架正例 Native 捕获，因此手写框架 Context 的通过只证明 binder/规则。真实四框架解析覆盖、语义 Evaluation 原门槛、E01/E02 均不得关闭。既有 Quality Gate 不降低；本包也不将没有阈值的精确 Fixture 检查命名为原整包 Evaluation通过。

## 7. 治理和实施边界

没有 FROZEN IR/SQLite/发布边界改变；本文件是新私有绑定算法、规则及 cap 适用语义的集中设计提案，已获用户明确批准。已将本设计与 PLUGIN_SPI、WORK_BREAKDOWN/PHASE_ACCEPTANCE、DESIGN_TRACEABILITY 同步为有限实施依据；不改 ADR-020 的 Canonical 发布责任，不提前标验收。

无迁移/History格式变更/新依赖/分数/模型/公开路由。安全和失败关闭仍满足 AGENTS。原生产物理资格 NOT_READY、A6 NOT_QUALIFIED、profile catalog 空、Native timeout UNKNOWN、main 取消结算未查询及旧R4限制保持。

## 8. 原Phase1必须能力与后继缺口

以下是 OPEN 后续，既不是本包已实现，也不是新增 DEFERRED：Spring Feign/HTTP consumer及依赖、更多 mapping；Mongo watch→handler→DataChangeTrigger及更多读写API；Kafka原生producer/consumer更多形式及EVENT边界组装；FastAPI跨文件router/Depends及参数关联；领域草稿→有依据语义置信策略→Canonical Runtime/ExecutionGraph/RuntimeFlow→应用发布与增量失效；完整Plugin factory/SPI/生产路由；物理资格及原E01/E02/Quality Gate。

特别是 Depends(func) 不能仅凭一个嵌套 INVOCATION 推出“哪个参数/函数依赖谁”；watch() 不足以给现有 WATCH proposal 所必需 handlerRef。若后继需要新增语法关联，必须有独立Source证据与集中合同提案，本包不预授权补字段。

Exit：仅 B_F2C_DECLARATION_DRAFT_LOCAL_EXIT，所有本表任务/Fixture/范围匹配检查/架构/文档证据满足且未解决本包 Important/Critical 缺陷为零时才记录。父任务仍4/21接受、17开放，不用测试数推算进度。

## 9. API依据与复核范围

2026-10-30只读查阅官方资料，不运行框架、不安装版本；这些说明固定可识别语法的含义，不构成所有框架版本兼容承诺。规则须严格匹配本表，未列API不猜：
- [Spring MVC mappings](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html)：类与方法映射、HTTP专用注解、多mapping限制。
- [Spring scheduling](https://docs.spring.io/spring-framework/reference/integration/scheduling.html)：Scheduled的cron/周期配置；本包仅原样cron声明。
- [Spring Data Mongo queries](https://docs.spring.io/spring-data/mongodb/reference/mongodb/template-query-operations.html)与[CRUD](https://docs.spring.io/spring-data/mongodb/reference/mongodb/template-crud-operations.html)、[MongoTemplate API](https://docs.spring.io/spring-data/mongodb/docs/current/api/org/springframework/data/mongodb/core/MongoTemplate.html)：Template读写及显式collection overload；[Mongo change streams](https://www.mongodb.com/docs/drivers/java/sync/current/logging-monitoring/change-streams/)说明watch范围，本包不从watch猜handler。
- [KafkaTemplate send](https://docs.spring.io/spring-kafka/reference/kafka/sending-messages.html)与[KafkaListener](https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages/listener-annotation.html)：显式topic overload与listener声明。
- [FastAPI router](https://fastapi.tiangolo.com/tutorial/bigger-applications/)、[APIRouter reference](https://fastapi.tiangolo.com/reference/apirouter/)、[Depends](https://fastapi.tiangolo.com/tutorial/dependencies/)：prefix/include及依赖声明边界。

[集中计划](../plans/2026-10-30-phase1-framework-binding-extraction.md)；[作者评审](../reviews/2026-10-30-phase1-framework-binding-extraction-review.md)。

## 实施状态补记

[实施评审](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)记录最新root98/98、原兼容64/64、注册35/35及架构17项目通过。原§3.2同根dotted-module歧义已由[获准澄清](2026-10-30-phase1-dotted-module-binding-clarification.md)限定为UNPROVEN；保留旧正例及97/98失败，批准后仅更改该例新预期并完整验证98/98，包有限Exit成立。typed receiver当前仅接受既有producer的UNRESOLVED-empty形状；更多精确值不猜绑定，相关能力未声明完整。
