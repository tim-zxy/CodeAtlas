# B-F3：Runtime声明候选与语义支持策略设计

状态：APPROVED / B_F3_RUNTIME_DOMAIN_CANDIDATE_LOCAL_EXIT，2026-10-30。用户已明确批准本文与Q1–Q3（“批准，继续”），包括独立0.5/HEURISTIC约定；数值不是实测概率或Quality Gate。下文“拟议/待批准”措辞保留提案缘由，审批状态由本段及实施证据取代。使用brainstorming、writing-plans、executing-plans、TDD及Ponytail full。

## 1. 核验结论与本包目的

B-F2-C已完成有限声明草稿出口；[98/98结算](../../../.superpowers/sdd/2026-10-30-phase1-framework-binding-extraction/accepted-results.json)和[实施评审](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)是前置证据，本轮不重跑。现有54个规则Fixture中26个有草稿输出，全部是声明式Context；不是26组真实框架Source捕获或概率样本。

已核对runtime-ir.ts、confidence.ts、phase1-support.ts、framework-draft.ts、framework-extraction.ts、mixed-analysis-store.ts与repository迁移manifest：
- RuntimeFactSet v1已有strict字段/引用闭包，所有Runtime记录必须有confidence/resolution；测试中的SOURCE_LITERAL/1只是独立结构向量，未定义框架语义策略。
- execution/src/index.ts、contracts/src/index.ts仍为空入口；没有可直接调用的ExecutionGraph/Contract匹配实现。
- 当前repo migration止于11/framework_syntax；既有Mixed Store接Code/Syntax历史，没有Runtime领域指针/领域表。不得因方法名带Runtime或迁移预留存在，就称现成发布Store。
- Runtime IR没有独立DATA_OPERATION或DEPENDENCY实体；不能把这两类草稿硬塞成Code CALL、DataChangeTrigger或无来源EntryPoint。

推荐下一包只实现真实的“草稿→strict Runtime领域候选”纯组件，产出合同、任务和资源及证据闭包；不创建占位SQL表、空策略注册器、公开路由或虚拟入口。后继执行图/发布路线同时在§8明确，不能用本包代替原Phase1目标。

备选：先做经验概率校准，需要独立语义真值、真实Source输出、协议和运行授权；当前证据不足，不能由98/98推正确率。直接继承Syntax分数或用默认0/1填Schema没有语义依据，拒绝。单一规范支持策略更接近既有Syntax政策、可在本地声明式组件范围推进；本文明确这是作者推荐，待用户决定。

## 2. 拟议独立语义政策（本次须明确批准）

政策/method固定runtime-declaration-support-v1。候选取值为score=0.5，resolution=HEURISTIC，仅表示“固定规则在当前输入上证明了相应框架声明及领域字段”，不是运行正确率、部署已启用、业务可信度、质量指标或发布许可。

选择说明：0.5是本设计推荐的规范约定，不是从26个正例估计出来的概率。既有Syntax的0.5只形成来源支持上限，不能提供本政策授权；相同数值不表示相同含义，也不能从已有Syntax审批推定本次已批准。当前证据不能唯一确定任何实数分值；请将“同意这一约定”与“测量证明该数值”严格区分。未获明确批准不得赋分、安装策略或创建Canonical候选。

只在以下条件全部满足时使用该单一值：
1. 输入通过Context4及集合闭包，使用当前完整basis；当前同根dotted-module的UNPROVEN保持。
2. 草稿来自当前固定extractFrameworkDrafts，不接收调用方、插件扩展或LLM传入的任意草稿/置信政策。
3. 对应框架目标、receiver/直接构造、静态字段及实现/资源作用域满足B-F2-C规则；同一逻辑只由该规则实现证明，不再创建第二套binder。
4. 实际使用的Syntax必须声明既有syntax-surface-support-v1及其已批准固定score=0.5；未知方法或伪称该方法但改变其值时不适用。实际使用的Code支持score不得低于本语义政策候选值；低于时拒绝该候选，不用min/平均/投票/重排发明新分值。SourceFile没有confidence，不给它捏造分数。该入口检查不鉴证输入来自Store，发布仍须独立认证当前值。
5. 支持闭包完整，未知namespace/schema保留null；不能用低分绕过身份、歧义、资源和支持硬拒绝。

HEURISTIC说明领域记录是规则派生的声明模型，不升级原Code/Syntax callee解析等级，也不把属性字面精确性等同动态分派或部署精确性。不得为通过测试更改Code或Syntax置信。

reasons固定顺序：CURRENT_INPUT_BASIS、FRAMEWORK_DECLARATION_BOUND、RULE_FIELDS_VALIDATED；随后为IMPLEMENTATION_DECLARED（合同/任务）或RESOURCE_SCOPE_PROVED（资源）；再按适用性加入NAMESPACE_UNKNOWN、SCHEMA_UNKNOWN。相应字段确有未知才加入；没有额外加分、负面标记排序或“多数同意”。部署/激活未知写入coverage和范围说明，不伪造observed execution。

政策直接实现在本包私有纯组件中；不做通用policy registry、不新增配置键/环境开关、不接收caller score或strategy callback。未来调整需独立Fixture/Evaluation和治理；既有Quality Gate数值不变。

## 3. 精确组件接口与职责

新建packages/plugins/src/framework-runtime-candidate.ts，导出私有模块函数：

compileFrameworkRuntimeCandidate(input: unknown, framework: 'spring'|'mongo'|'kafka'|'fastapi'): FrameworkRuntimeCandidate

FrameworkRuntimeCandidate的准确结构：
- facts：ReturnType<typeof parseRuntimeFactSet>，固定codeatlas.runtime-fact-set/version1。
- coverage：现有Phase1Coverage，固定PARTIAL，limitations含DOMAIN_RECORDS_ONLY，unverifiedRefs按实际未解析引用填写；无未解析ref则为空。完整图尚未组装是范围限制，不能把它改成COMPLETE。
- provenance：按Runtime实体ID排序的数组；每项{entityId,draftKeys,ruleIds,syntaxIds,policyVersion}，后三引用集合/键集合去重、精确字典序排序，policyVersion固定上述政策名。

此为私有候选结果，不创建第二套无分领域IR，不加公开schema/descriptor/index出口。facts本身是strict Canonical Runtime IR候选；包含它不授予发布权，coverage不可丢弃后转为完整结果。输入未通过校验时抛既有IR_VALIDATION_FAILED；合法但不可表示/低支持的草稿记coverage limitation，不生成对应实体。没有模型/Source读取/网络/SQL权限。

framework-extraction.ts仅提取extractFrameworkDraftsFromValidatedContext(context: PluginV4Context,framework)作为共享内部helper；旧unknown入口仍先验证一次再调用。compiler也先验证一次，随后用同一fixed规则helper，避免对每条草稿重验证全Context。不得让该helper绕过已有草稿strict检查。

framework-draft.ts仅把现有canonical JSON纯函数以私有模块导出供新组件使用，旧键/解析/创建行为不变；public index不变。不为了一个政策增加配置框架或新依赖。

## 4. 领域转换与明确不生成

|现有草稿|本包输出|范围条件/后继|
|---|---|---|
|HTTP|Contract，direction/signature/implementationRef原样，protocol=HTTP，serviceRef=null|不制造EntryPoint/REQUEST context；类mapping声明不能证明Controller bean或服务已启用。HTTP consumer仍需其原抽取能力，compiler不补抽取|
|TASK|TaskDefinition，taskKind/implementationRef原样，triggerRef=null|schedule保留在Syntax支持及draft provenance中；不塞入Task strict schema，不补ScheduleTrigger、EntryPoint或JOB context|
|DATA_RESOURCE|DataResource，resourceKind/logicalName/namespace/schemaRef原样|未知namespace必须用下述本地资源作用域区分，不能将不同连接同名集合合并|
|MESSAGE|Contract，protocol=MESSAGE，signature/implementationRef原样，serviceRef=null|拟议固定PRODUCER→direction PROVIDER、CONSUMER→direction CONSUMER；这是显式待审合同映射，不由数组位置或调用方向猜测|
|DATA_OPERATION|不生成独立实体；coverage含DATA_OPERATION_REQUIRES_CONTEXT|已有伴随DATA_RESOURCE仍可转换；读写需后继真实context内DATA/BOUNDARY节点，不补虚拟入口；WATCH必须有其原handler证明|
|DEPENDENCY|不生成Runtime事实；coverage含DEPENDENCY_REPRESENTATION_PENDING|依赖注入/配置依赖不等于执行CALL；当前四规则也未交付完整依赖抽取|

entryPoints、triggers、contexts、nodes、edges、flows在本包facts中均为空；不是这些能力已实现。tasks/dataResources/contracts按实际证据填充；没有框架事实时可以得到合法空候选，但该空候选不能解释为删除当前完整Runtime的指令。

MESSAGE direction是声明合同角色；未来消息stitch必须PRODUCER→CONSUMER传递，而HTTP请求是consumer→provider，不能统一按PROVIDER为每条边的调用目标。namespace/schema未知时匹配继续UNRESOLVED，不能因角色可映射就声称跨仓匹配。

## 5. provider-independent身份与支持

### 5.1 本地作用域

固定ScopeTuple为[sourceFile.path, declarationScopeCode.factKey, bindingName|null, implementationCode.factKey|null]，只取现有已证明的值：
- Spring注解：真实所属TYPE scope的Code factKey，bindingName=null，implementation为真实方法。
- FastAPI：已证明app/router直接构造的assignment所属MODULE factKey及targetName，implementation为真实函数；router使用被装入应用的声明路径支持，不按多个app同名路由做部署等价。
- Mongo/Kafka typed receiver：唯一typed declaration的lexicalScope Code factKey和declaredName；资源的implementation分量固定null，避免同一receiver被不同方法使用就拆成不同集合。producer合同还保留实际implementation。
- Kafka listener：真实方法scope/implementation Code factKey，bindingName=null。

从支持中找不到唯一对应作用域时不构造键。禁止从provider原ID、源码最近位置、raw JSON、运行路径或插件ID补键。上述scope来自既有绑定证明的Syntax/Code字段，不引入新IR字段；未知namespace的局部隔离只限制合并，不证明部署身份。

### 5.2 精确键及归并

所有键只用固定tuple，字符串/数组/null原样，UTF-8、无Unicode或路径意义归一化：
- factKey = runtime-fact: + SHA256(runtime-semantic-fact-v1 + NUL + JSON.stringify([repositoryId,kind,ScopeTuple,SemanticTuple]))。
- Contract SemanticTuple=[direction,protocol,SignatureTuple,implementationCode.factKey]。
- HTTP SignatureTuple=[method,pathSegments的[kind,value或name]列表,querySchemaRef或null,requestSchemaRef或null,responseSchemaRef或null,serviceHint]。
- MESSAGE SignatureTuple=[transport,namespace,channel,role,payloadSchemaRef或null,keySchemaRef或null]。
- Task SemanticTuple=[taskKind,implementationCode.factKey]；schedule不混入任务定义身份，仍由其Source支持区分触发声明。
- Resource SemanticTuple=[resourceKind,logicalName,namespace,schemaRef或null]。
- id = runtime: + SHA256(runtime-semantic-entity-v1 + NUL + JSON.stringify([repositoryId,revisionId,kind,factKey]))。

本包所有schema refs/serviceRef均按原草稿未知值null，不做schema识别；后继非null refs需先设计provider-independent引用键，不能把未知的实体原ID当已定义配方。

basis、分数、ruleId、draftKey、Syntax ID、provider/plugin/mapper版本不进入factKey；policy版本进入provenance/后继activation身份，不混成实体意义。既有draftKey继续只用来追溯当前输入，不冒充Canonical factKey。

同factKey语义核心一致才归并；支持/provenance并集稳定排序，不因多个支持者升分。代表sourceRange取真实支持anchor按path、坐标排序的最小值，仅用于确定呈现，不作为语义胜者。相同id在同一候选内有不同语义核心必须拒绝；不覆写冲突。

未来存储须将不可变记录版本与runtime activation绑定；同逻辑实体ID不是修改旧activation payload的权限。本包无SQL，不改旧Code/Syntax同ID冲突规则。

### 5.3 支持闭包

Runtime SupportRef仅来自：
1. 已使用草稿的Canonical支持及其Syntax的Source/Code支持，与当前Context inventory一一对应；
2. 相应当前Syntax envelope的支持项：entity.kind固定SYNTAX_EVIDENCE，id为当前Syntax payload.id，revisionId为当前basis.revisionId，valueDigest为SHA256(runtime-syntax-support-v1 + NUL + 既有canonical JSON({schema:'codeatlas.syntax-evidence',version:3,payload:当前完整Syntax}))。

这新增的是私有支持用途语义，不更改EntityRef的strict形状。不可用历史origin ID假冒current projection；未来Store必须从其已验证当前membership重建/核对这一支持值。provenance里保留的draft/plugin规则标签不能单独充当SupportRef。

facts.externalRefs和supportInventory只收集实际所需Source/Code/current Syntax闭包；同ref不同digest拒绝。所有Runtime记录支持非空，同basis并包括其Source anchor；最终整个envelope再通过parseRuntimeFactSet，深冻结。该parser检查结构/闭包，不能鉴证Source/Store/运行身份，候选不能自授这些权限。

## 6. 错误、预算、重算与最小验证

复用MAX_PLUGIN_CONTEXT_FACTS的现有值作为本组件输出的累计逻辑单位上限：每个Runtime实体、coverage limitation、外部ref、inventory项、逐记录supportRefs项及provenance引用项都计一单位，插入/保留前检查，按去重后实际集合记账；不同记录内的支持引用发生多次则分别计费。此为新的适用语义，列入本次批准，不选择新上限/默认配置，不声称RSS合格。

不复制全量Context给每个实体；不建立所有候选笛卡尔积。已有输入/草稿上限不当成衍生输出已预算。原错误类型统一IR_VALIDATION_FAILED；上限失败不返回可发布半包。无SQL回滚/进程恢复责任，不增加空的stage/lease对象。

每次从完整当前Context重算；删除/改名/改变绑定后旧贡献自动消失，多支持还有合法来源则保留。输入重排保持同事实/支持/键；同一basis在未来Store改变policy或支持时产生新的activation版本，不能篡改历史。NO_OP只是输入语义不变，不生成写指令。

本轮仅设计及旧材料只读交叉表，不跑测试。未来批准后的Fixture复用p1-plugin-context-v2，runtime-candidate子目录，不新增Fixture ID、全局计数或第二套评测器：

|责任|独立预期与负例|最小检查|
|---|---|---|
|独立政策|使用现有Syntax规范0.5输入、较高Code支持仍输出独立0.5；较低Code支持/未知Syntax方法/篡改旧策略值拒绝；固定method/reasons/resolution；caller不能选score|新framework-runtime-candidate.test.mjs|
|转换|四框架已有正例分别精确Contract/Task/Resource；无虚构EntryPoint/graph；DATA_OPERATION/DEPENDENCY有明确限制|同一文件，复用旧结构装配helper，不由compiler生成expected|
|身份与归并|精确独立tuple/hash；同名集合不同receiver不合并；相同资源多方法支持并集；provider/规则标签不进键，输入置换稳定|同一Fixture及测试|
|闭包/失效|当前Syntax digest、缺支持/foreign basis/同ref异digest、删除一个或全部支持、反序与空候选、重复实体冲突|同一文件|
|预算/兼容|累计单位等于上限可行、一单位超出拒绝；旧Context/草稿/IR行为保持|原root加一个import；四文件旧Plugin兼容+phase1-ir.test、注册、Plugins构建、架构、范围格式|

不重新执行B-F2-B Rust/Native/Store矩阵、全仓回归或校准。结构与规范支持值测试不等于真实语义正确率、生产Source资格、E01/E02或原Quality Gate。原Gate数值完全保持。

## 7. 本包出口与审批边界

批准项是独立0.5/HEURISTIC政策及其条件、MESSAGE角色映射、身份/归并/current Syntax支持语义、累计上限适用和[Q1–Q3集中实施包](../plans/2026-10-30-phase1-runtime-semantic-candidate.md)。批准后顺序实施及原范围修复，不逐字段/框架确认。

不授权新依赖、真实Source/Native/Rust/helper/collector/DB/模型、SQL迁移、云端CI或Git写入。private模块无公开路由/能力广告。Exit仅B_F3_RUNTIME_DOMAIN_CANDIDATE_LOCAL_EXIT，届时需对应Fixture/适用检查/文档均通过；原Phase1父任务、完整Plugin与P1-06..09/E01/E02仍不能据此关闭。

## 8. 同一后续路线的存储/图/发布设计约束

这是明确后续依赖，不是本包已具备API或自动实施许可：
1. execution负责ExecutionGraph→RuntimeFlow，需要有来源的entry/context与调用/异步边；DATA_OPERATION在真实context内转DATA/边界，DEPENDENCY不直接变CALL。不生成占位入口以让IR闭包成立。
2. contracts负责匹配与跨仓，未知namespace/schema不自动等价。MESSAGE角色与HTTP调用方向分开，跨仓沿冻结RevisionSet保留basis/support。
3. Application负责固定策略输入/完整覆盖/Quality Gate校验；Runtime负责接线，不携领域规则；Storage只依赖IR，负责新迁移和事务。
4. repo后继R012/R013仍须按原预留及实际目标精化SQL列、FK、checksum、索引、查询和资源记账，不能改R011或重用Source独立CAS。此处不建立任何表。
5. 发布输入必须同时绑定current Code basis、当前已验证Syntax activation/membership身份、policy版本/候选digest与expected旧Runtime pointer，不能只比较RepoBasis。同代码basis下Syntax或policy变化也要阻止旧候选激活。
6. 未来单repo事务重核所有输入并切Runtime/graph/flow指针；Code/Syntax先前合法更新而派生失败时保留最后良好Runtime，报告AFFECTED/NOT_AVAILABLE及旧basis，不报CURRENT。完整同步刷新遵守原Syntax/graph/flow同事务规则，不以本纯候选包悄改。
7. 新Runtime immutable activation与支持membership按实际设计落地，SQL失败/竞争/ABA/提交未知/commit后输出错误分别继承已接受原则；不机械复制旧五维记账或完整故障矩阵，需对真实新SQL路径声明最小必需检查。
8. AUTO仍只包含来源/代码/合同/ExecutionGraph/RuntimeFlow；Capability/BusinessFlow/wiki和语义知识仍MANUAL，LLM只给候选。物理profile/A6 NOT_QUALIFIED/历史timeout UNKNOWN与旧R4限制不变。

本包不把上述OPEN改为DEFERRED，也不把缺少真实Store的路线写成已经能运行的发布计划。

## 批准后实施结算 — 2026-10-30

Q1–Q3完成有限候选出口；[实施及作者评审](../reviews/2026-10-30-phase1-runtime-semantic-candidate-implementation-review.md)列明Fixture、准确门禁和剩余范围。代表Source位置取各贡献草稿真实声明锚点最小值，不以import位置替换领域声明。输出累计provenance按draftKeys/ruleIds/syntaxIds实际引用计费，行由所属实体计费。DEPENDENCY现固定规则不可达，保留拒绝独立事实的边界而不开放注入API。§8仍为未实施后继，不因本地候选通过获得发布或真实运行授权。
