# Phase1 共享契约、事实入口与运行模型详细设计

状态：PROPOSED，待用户评审。设计不授权实施。适用基线与历史风险见[启动方案](2026-10-22-phase1-design-progression.md)。本文件与[兼容性提案](2026-10-22-phase1-compatibility-proposal.md)、[知识与消费设计](2026-10-22-phase1-knowledge-and-consumption-design.md)、[Evaluation设计](2026-10-22-phase1-evaluation-design.md)组成同一待审设计包；若与现行权威冲突，现行权威优先。

## 1. 实码约束与选型

实际入口：`apps/cli → packages/runtime/src/index-command.ts → packages/application/src/index-command.ts → Source/Provider/Storage ports`。MCP仅bootstrap smoke。Provider现有node/edge和Canonical Code IR严格对象没有annotation/decorator参数或字面量字段；Plugin现有context仅nodes/edges/sourceFiles/configuration，support仅CanonicalFactRef。Native入口在analyze.rs直接创建JavaAnalyzer。故不能假定已有事实足以实现四框架。

推荐：保留Code IR v1和IPC v1/v2/v3；新建语言中立、来源定位的SyntaxEvidence契约和独立版本协商的语法观察操作；Plugin V2消费Code事实与语法证据，输出统一Runtime/Contract候选。Java和有限Python共用调度/受限文件读取/终端完整性/取消机制；框架解释只在Plugin。该决定须接受兼容性提案后实施。

备选：外部合格Provider可以满足同一契约，但当前无已接入实现；不能把未来Provider当已存在的较低成本方案。只读OpenAPI/config能补充合同，却不能证明FastAPI decorator/router/dependency与实现绑定。拒绝让Plugin自己重新解析原始Java/Python或调用LLM补Code事实。

## 2. 通用字段与严格性

复用`EntityId`、`EntityRef`、`SourceRange`、`Confidence`、schema envelope、JSON安全和typed IR errors。新payload按schema名字独立version=1；不得修改已有v1对象的strict keys/enums。省略与null显式区分，所有引用唯一，所有数组拒绝稀疏项、同一identity重复和跨basis引用。未知字段/版本拒绝，不做best-effort升级。

下列为新契约的字段表。`Id`是现有opaque EntityId；`Digest`采用项目已有fingerprint/digest validator，内容哈希域在每schema分别固定；`Ref`是现有EntityRef。所有正文与字符串都受请求aggregate byte budget约束，不能先分配无界数组后检查。

| 类型           | 必需字段                                                                              | 约束                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| RepoBasis      | repositoryId, revisionId, contentFingerprint, codeActivationDigest                    | activationDigest绑定当前Canonical图、support与coverage的稳定内容；不能只有WORKTREE revisionId                            |
| DocumentBasis  | documentId, documentRevisionId, contentFingerprint                                    | 不依赖当前路径，原位置在revision内保存                                                                                   |
| WorkspaceBasis | workspaceId, revisionSetId, workspaceActivationDigest | 工作区合同/执行事实依据；entity revision绑定冻结RevisionSet，不伪装成Repo/Document依据 |
| SupportRef     | basis（RepoBasis、DocumentBasis或WorkspaceBasis）, entity:Ref, valueDigest                            | entity必须在该basis捕获的合法输入中存在；值摘要匹配；不把Provider ID当Canonical身份                                      |
| RequestControl | signal, deadline, maxInputBytes, maxOutputBytes, maxItems, maxDepth                   | signal/deadline是进程内控制，序列化请求使用cancel/deadline字段；数值为正safe integer，期限有限；上限来自验证后的调用预算 |
| ResultMeta     | basisRefs, sourceFreshness, compilationCurrency或null, coverage, warnings, truncation | 无编译知识的code查询currency=null；coverage不是伪造比例；truncation包含原因和未展开ref                                   |
| ScopedRef      | repositoryId或workspaceId的严格判别联合, entity:Ref                                   | 已有EntityRef不加额外字段；跨repo引用必须外包作用域                                                                      |

`codeActivationDigest`由Storage在同一读snapshot内计算/读取；先复用当前激活字段和规范化内容摘要，不引入可绕过同fingerprint激活变化的裸字符串token。具体摘要输入包含canonical facts、active support、coverage和indexed fingerprint，按项目已有Unicode确定序列编码。根路径、并发完成顺序不参与语义摘要。

没有批准的预算默认值时不擅自填数。产品配置提供经审阅的preset或要求显式配置；缺少必要预算返回CONFIG_INVALID，不无限运行。Plugin旧上限10000 facts总量、10000 sourceFiles维持，新V2的facts+syntax计入同一facts总额。分片不得破坏owner所需支持闭包；放不下返回受控budget/coverage诊断，不静默丢critical事实。

## 3. 语言中立语法证据

SyntaxEvidence字段：id, syntaxKey, repositoryId, revisionId, sourceFingerprint, sourceRange, owner（ScopedRef或null）, syntaxKind, payload, supportRefs, confidence, extractionVersion。

syntaxKind与严格payload：

| kind        | payload                                                      | 解释边界                                                          |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| DECORATION  | callee（Resolved/Nonresolved名字引用）, arguments:Argument[] | Java annotation和Python decorator的语法；不命名Spring/FastAPI意义 |
| INVOCATION  | callee, receiver或null, arguments:Argument[]                 | 不从简单方法名直接断言Mongo/Kafka语义                             |
| DECLARATION | declaredType或null, parameterNames, modifiers                | owner绑定的类型/参数/可见性等语法，不替代Code SYMBOL              |
| ASSIGNMENT  | targetName, value:SyntaxValue                                | 局部可静态证明常量或对象构造绑定                                  |
| ARTIFACT    | mediaType, logicalPath, contentDigest, declaredValues        | 被Source policy批准的配置/构建artifact，无任意fs权限              |

Argument={name:string|null,value:SyntaxValue,sourceRange}。SyntaxValue严格联合：STRING(value)、NUMBER(规范JSON数字)、BOOLEAN(value)、NULL、REFERENCE(name,resolution,candidates)、ARRAY(items)、OBJECT(entries)、UNKNOWN(reason)。不执行表达式、用户模块、annotation processor或Python import；超预算、动态拼接/反射/运行期配置保留UNKNOWN，不假装解析为常量。

syntaxKey=版本化域+repo+sourceFile稳定ID+owner canonical键或null+语法kind+源位置+规范payload摘要；不包含Provider ID。它是当前语法观察身份，不承诺源码移动后稳定语义知识身份。Provider绑定和原始provider fact id保留在Evidence，独立于canonical syntax key。

owner缺失不允许“最近函数”猜测；可用于文件级检测，但依赖owner的entrypoint必须unresolved。Python入口必须同时提供经Provider归一化的MODULE/SYMBOL与最小IMPORT/REFERENCE事实，不能只生成decorator却假设owner已存在。Native v4对Python先输出旧ProviderNode/Edge v1形状的语言事实，再输出引用同次provider owner ID的语法记录；TypeScript先完成Python→Canonical映射，再绑定SyntaxEvidence owner。未证明的CALL/INHERITANCE/OVERRIDE保持未注册。Java owner使用已有CodeBasis，不能由装饰器名字捏造。

### 3.1 Native观察与激活

拟议独立协商Native IPC v4 `OBSERVE_SYNTAX`，v1..v3原严格消息不变。输入：repo/revision/fingerprint、changed/removed文件清单、每文件已验证source identity与owner映射、资源预算、请求id。输出：Java的严格syntax记录；Python的最小Provider Code节点/边与syntax记录；每文件coverage/diagnostics、唯一terminal（分类型counts+checksum+版本/basis）。请求不传DB路径，不允许shell或完整环境；旧capability不得因新descriptor存在而升级。

该操作仅解析传入且内容指纹通过的文件；重启后TypeScript根据持久syntax per-file fingerprints与版本决定changed set，不依赖进程内ownership。动态跨文件常量只追可证明的有界依赖；无法完成时UNRESOLVED。不引入AST持久化或通用依赖调度器；失效的Plugin语义可以从已持久合法syntax事实重算，不必全仓重解析。

Source的classifySample目前只将.java标SOURCE/java，.py为OTHER/null。新Python入口必须显式扩展classifySample及language/policy兼容版本，.py的SOURCE/python分类变化将改变相关Source fingerprint；旧basis不得重标为兼容，首次需显式受控bootstrap。TypeScript验证完整终端、文件清单、指纹/owner、所有值、总资源和支持关系后形成ValidatedSyntaxBatch。Python节点/边由独立normalizePythonObservation归一化，并通过现有FactMerger支持语义形成validated Code差分，与syntax在新Application/Store组合事务中共同激活；不把raw syntax直接当Code事实。多Provider场景保留其他Provider支持，移除Python支持不能删除Java支持。Python candidateCodeBasis先由规范化/FactMerger的完整合并候选集合计算；syntax owner在该候选集合验证，Store在写锁内同时复验旧expectedCodeBasis、写入Code差分与syntax，再重算新basis后切pointer。不得用尚未激活的owner绕过整体闭包校验，也不得先独立提交Python Code后把半完成状态冒充原子成功。新语法观察独立于已有v3summary，不复用v3summary布局或准入profile。独立Python观察不冒用Java v3 derived summaries：只有证明既有summary上下文仍匹配才保留可用性，否则明确标INCOMPATIBLE并要求显式bootstrap，不自动全量重解析或猜测carry-forward。混合仓库的Java/Python更新、旧Java summary不误复用/不被无关更新错误删除均是实际验收义务；若现有Store无法满足，先提交受影响组合的详细兼容修订，不能跳过该门禁。新增Native/Node构建身份必须检查精确profile适用性；缺profile失败关闭，数值重测/批准不在本设计内自动授权。

Code graph先更新而syntax/runtime尚未重建是合法中间态：runtime freshness变AFFECTED，查询必须带其旧basis，不得冒充CURRENT。Syntax apply持有repo写锁重新验证CodeBasis，再同时激活syntax+其依赖的runtime/flow候选；失败保留旧syntax/runtime，Code图不回滚为旧版。旧runtime必须报告过期；索引结果分别报告Code与Runtime效果，不能把部分刷新报全成功。

## 4. 四Plugin最小语义与覆盖

| Plugin  | 输入证据                                                                                | 规范化输出                                                                | 必须拒绝或保留不确定                                                |
| ------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Spring  | import/type/annotation名称绑定；class/method mapping常量；Scheduled；Feign/HTTP调用证据 | HTTP EntryPoint/provider或consumer Contract；JOB TaskDefinition；依赖绑定 | 同名自定义annotation、动态path、占位符无已批准config、多mapping冲突 |
| Mongo   | 已证明Mongo类型/集合声明、调用receiver/参数、变更监听证据                               | DataResource、READ/WRITE/数据变化transition、DataChangeTrigger            | 仅凭save/find名字、动态collection、无watch证据的任意写入            |
| Kafka   | listener注解/receiver类型、topic参数或批准config、发送调用                              | producer/consumer message Contract、PUBLISH/CONSUME EVENT边界             | 动态topic、不同集群同名topic、无schema证据的payload等价             |
| FastAPI | Python decorator调用、APIRouter构造/注册/prefix、Depends与函数绑定                      | HTTP EntryPoint/provider Contract、dependency关系                         | 仅同名get装饰器、动态include_router、反射注册、不能解析的依赖       |

由命名/类型/来源共同证明框架归属；证据不足输出coverage限制，而不是静默跳过。artifact读取由Runtime Source policy提供，Plugin只有bounded immutable值。新版context的support类型是CanonicalFactRef/SyntaxRef严格联合；旧Plugin V1与validator保留，Runtime按显式contextVersion选版本，不能把V2额外字段传给V1。

Plugin输出仍是候选：`{capability,value:SchemaEnvelope,support}`。Application按capability选择具体Runtime/Contract schema验证，检查support在输入basis存在、引用闭包完整后，才能进入AUTO事实激活。Plugin不持有Storage接口。

## 5. Runtime与合同数据契约

共同RuntimeRecord字段：id, factKey, repositoryId, revisionId, basis:RepoBasis, sourceRange或null, supportRefs（非空）, confidence, resolution。factKey使用无Provider/Plugin身份的领域结构键；pluginVersion进provenance，不进实体键。支持者分离，移除一个支持不能删除仍有有效支持的事实。

| 实体              | 除共同字段外的字段                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| EntryPoint        | triggerKind（HTTP/RPC/MESSAGE/SCHEDULE/TASK/DATA_CHANGE/BATCH/CLI/MANUAL）, ownerRef, contextKind, contractRef或null, taskRef或null |
| TaskDefinition    | taskKind（JOB/TASK/BATCH）, implementationRef, triggerRef或null                                                                     |
| DataResource      | resourceKind, logicalName或null, namespace或null, schemaRef或null                                                                   |
| DataChangeTrigger | resourceRef, operation（INSERT/UPDATE/DELETE/UNKNOWN）, handlerRef                                                                  |
| Contract          | direction（PROVIDER/CONSUMER）, protocol（HTTP/MESSAGE/RPC）, serviceRef或null, signature（下述严格联合）, implementationRef或null  |
| ExecutionContext  | kind（REQUEST/EVENT/JOB/TASK/BATCH）, entryRef, parentContextRef或null                                                              |
| ExecutionNode     | contextRef, kind（ENTRY/CODE/TASK/DATA/BOUNDARY）, targetRef                                                                        |
| ExecutionEdge     | contextRef, sourceRef, target（resolved ref或unresolved候选）, transitionKind, guard或null, boundaryRef或null                       |
| RuntimeFlow       | entryRef, derivationVersion, contexts, steps, branches, boundaries, coverage                                                        |
| RuntimeFlowStep   | stepKey, ordinal, contextRef, executionNodeRefs, incomingEdgeRefs, outgoingStepKeys, supportRefs                                    |

HTTP signature={method,pathSegments,querySchemaRef|null,requestSchemaRef|null,responseSchemaRef|null,serviceHint|null}；pathSegments是LITERAL/PARAMETER判别列表，保留case和编码意义，不能将任意正则/通配当相等。MESSAGE signature={transport,namespace|null,channel,role（PRODUCER/CONSUMER）,payloadSchemaRef|null,keySchemaRef|null}；未知schema不能证明兼容。RPC使用显式service/operation/schema refs；无插件覆盖时不声称支持。

transitionKind保持规范CALL/HTTP/RPC/PUBLISH/CONSUME/CREATE_TASK/EXECUTE_TASK/DATA_CHANGE/BRANCH/JOIN/RETRY/FAILURE/COMPENSATION；只有源证据存在才发出，不能因枚举存在就推断catch/retry/compensation。代码CALL不能自行建立业务时间顺序。

### 5.1 确定性派生

`deriveExecutionGraph(input:RuntimeFactSet, control:RequestControl):ExecutionGraphCandidate`：输入单basis已验证事实；源上下文作为节点分区，异步边建立新context并保留边界；无法解析的target保持未解。循环保留循环关系，不无限展开。

`deriveRuntimeFlows(input:ExecutionGraph, control:RequestControl):RuntimeFlow[]`：按entry stable key、context、edge kind、target key确定遍历顺序；纯CALL连续且单入单出且同context的非边界段可压缩，branch/join/async/retry/failure节点不得跨越压缩。ordinal只是呈现顺序，不证明真实执行先后；真实precedence来自supported edges，循环以back-reference表达。预算截断输出明确frontier与PARTIAL，不能激活为完整结果。

不调整压缩权重/阈值；首次规则以独立golden和重排输入不变性验收，后续EVOLVABLE调整必须有Fixture证据。

### 5.2 合同匹配与跨仓

`matchContracts(input:FrozenContractSet, control:RequestControl):ContractMatch[]`。每结果={consumerRef,status,candidateProviderRefs,selectedProviderRef|null,reasons,supportRefs,confidence,basisRefs}。同一消费者允许多候选，不使用数组第一项决胜。

顺序：先校验服务身份/协议/方向/namespace，再比较HTTP method/path或消息channel，再检查有证据的schema约束。唯一兼容provider才MATCHED；多兼容为AMBIGUOUS；声明互斥为CONFLICTED；无足够证据UNRESOLVED。只有显式服务登记/声明支持才OUTSIDE_WORKSPACE或KNOWN_EXTERNAL；不能将“没找到”自动判外部。未知payload schema保留限制，不能自动打高置信。

`stitchWorkspaceExecution(input:{revisionSet,graphs,matches},control):WorkspaceExecutionCandidate`只对MATCHED边串联；其余边原样带诊断。跨仓每跳保留repo/revision/fingerprint、ContractMatch和置信支持；组合confidence不超过最弱支持，不凭多Provider同意加分。

## 6. 持久化与迁移安排（提案）

因语法入口先于runtime所需，拟将尚未发布的repo预留改为R011 framework_syntax、R012 execution_graph、R013 runtime_flow。已发布R001..R010不变；这是明确待批准的预留调整，不是当前规范的新事实。workspace W004..W011预留不变。

使用STRICT表，ID TEXT、JSON TEXT且json_valid；所有strict payload仍由IR/app完整校验。每domain表存schema_name/schema_version/payload_json/value_digest，关系字段同时做关系列，不用JSON有效替代引用验证。

| migration / 表                       | 关键列与约束                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| R011 syntax_state                    | repo/revision主键；code_basis_digest, syntax_activation_digest, extractor_compatibility, policy_digest；仅validated apply改pointer |
| R011 syntax_files                    | revision/source_file复合主键；source_fingerprint/extractor_version；不猜测backfill                                                 |
| R011 syntax_observations             | revision/id主键；syntax_key唯一；source_file, owner_id或null, source_fingerprint, payload/digest；同repo/revision owner检查        |
| R011 syntax_supports                 | revision/syntax_id/support_key主键；删除受当前激活集合约束；保留退役观察的证据元数据                                               |
| R012 execution_contexts/nodes/edges  | revision/id复合主键；source/target/context同revision FK；unresolved target使用nullable target列和严格payload，不能悬空resolved     |
| R012 execution_state                 | revision主键；code/syntax activation digests, graph_digest, derivation_version；与graph rows同事务                                 |
| R013 runtime_flows/steps             | revision/flow_id主键；step的flow_id+step_key唯一、ordinal同flow唯一；保留back-reference，support非空验证                           |
| W004 services/service_identities     | workspace/id主键；identity的namespace/type/value/revisionSet；歧义identity保留不强行unique归一                                     |
| W005 contracts/matches/candidates    | revision_set/id主键；repository作用域引用不建跨库FK；selectedProviderRef只在MATCHED存在；候选非唯一不折叠                          |
| W006 workspace_execution_nodes/edges | revision_set/id主键；workspace内引用FK；repo支持由带basis的外部引用校验                                                            |

索引：syntax revision/source_file/owner/key；execution revision/context/source/target；flow revision/entry与step ordinal；contracts revision_set/protocol/direction/namespace/signature摘要；matches status/consumer；不创建未经使用的额外索引。

全量/增量规则：Source add/modify/delete捕获→Code工作流→按syntax版本/指纹取changed→语法观察→受影响Plugin候选/Graph/Flow→validated apply。旧basis更新失败不触碰旧runtime指针；syntax/graph/flow同repo事务切换，W004..W006按冻结RevisionSet的独立workspace事务切换。跨库不使用虚假的原子提交承诺。

每migration独立BEGIN IMMEDIATE、checksum和user_version仍用既有runner；禁止改旧SQL或做隐式downgrade。R011缺历史syntax时runtime标NOT_AVAILABLE，保留code查询；首次显式索引重建syntax，不伪造数据。锁失败、too-new、版本漂移都安全拒绝。未创建所有Phase1空表；按所属任务逐migration交付。

## 7. 边界端口、错误和测试责任

Storage只依赖IR，继续结构化port对接模式，不为实现端口导入Application/上层domain。

| 端口/用例（拟定）               | 签名/效果                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RuntimeFactReadPort             | `readRuntimeBasis(request:{repositoryId,revisionId},control):Promise<RuntimeBasisSnapshot>`，一个WAL读snapshot返回basis/facts/support/coverage                                        |
| RuntimeFactWritePort            | `applyRuntimeBatch(input:ValidatedRuntimeBatch):Promise<RuntimeApplyReceipt>`，内含expectedCodeBasis/expectedRuntimeDigest以及syntax/graph/flow完整替换/差分；Store锁内校验并原子激活 |
| Application.refreshRuntimeFacts | `(request:RuntimeRefreshRequest,ports:RuntimeRefreshPorts,control):Promise<RuntimeRefreshResult>`，组装受控观察和领域派生；不让Plugin调用Storage                                      |
| ContractRegistryPort            | `replaceContracts(input:ValidatedWorkspaceContracts):Promise<WorkspaceApplyReceipt>`，expectedRevisionSet与active digest比较                                                          |
| Application.traceRuntime        | `(request:RuntimeTraceRequest,ports:RuntimeQueryPorts,control):Promise<RuntimeTraceResult>`，只读，不refresh或编译                                                                    |

RuntimeApplyReceipt={graphCommit:COMMITTED|NOT_COMMITTED,oldBasis,newBasis,activatedDigest}；无法证明提交结果的I/O故障另报UNKNOWN，不把异常都映射NOT_COMMITTED。输出失败发生在commit之后时保留COMMITTED事实，复用现有index effect报告原则。

新增typed code：RUNTIME_BASIS_CHANGED、SYNTAX_UNAVAILABLE、SYNTAX_OUTPUT_INVALID、RUNTIME_INPUT_INVALID、RUNTIME_NOT_CURRENT、CONTRACT_INPUT_INVALID；通用PERMISSION_DENIED/SECURITY_POLICY_BLOCKED/REMOTE_DISABLED/BUDGET_EXCEEDED/CANCELLED/DEADLINE_EXCEEDED复用统一IR家族。消息不给原payload/SQL/secret，field path受控。

必测：literal/decorator provenance、同名非框架负例、owner歧义；未知版本和旧SPI拒绝额外字段；异步边界/循环/顺序扰动；合同六结果；runtime先旧后新窗口；same fingerprint但code support改变；apply每阶段失败、取消、锁、重开；last-good查询明确旧basis；跨repo变化拒绝。Fixture与任务编号见Evaluation设计及任务包。

## P1-01 first-publication support-basis clarification

The first-batch Fixture demonstrates that workspace ContractMatch/Execution facts cannot truthfully use RepoBasis or DocumentBasis. Complete the as-yet-unpublished Phase1 SupportRef union with WorkspaceBasis { workspaceId, revisionSetId, workspaceActivationDigest }; its entity revision must equal revisionSetId and its qualified reference must belong to that workspace. This is a compatible implementation clarification under ADR-020, not a change to old Code/Evidence/Snapshot v1, a new truth store, a new phase capability or an approved numeric gate. The independent workspace-provenance test fails before this addition; negative cross-workspace support remains required. Frozen RevisionSet and actual storage authentication stay Application/Storage duties.
