# Phase1 文档、知识发布、Wiki与Agent详细设计

状态：PROPOSED，未授权实现。共享类型/事实入口见[契约设计](2026-10-22-phase1-contracts-and-runtime-design.md)，冻结输入和兼容决定见[提案](2026-10-22-phase1-compatibility-proposal.md)。设计目标是代码理解+证据支持的LLM候选→受验证发布→Wiki/Agent消费，而非让LLM直接生成无来源的最终文档。

## 1. 模块与调用边界

- documents：结构解析、位置/修订/文档关系；不做隐式语义编译。
- knowledge：候选、身份、Reconciliation、grounding/quality规则与Wiki projection；不导入模型SDK、Storage、Runtime或apps。
- application：三知识更新用例、原子发布命令、查询、权限/取消/效果；通过结构化ports执行。
- runtime：验证EffectiveConfig、注入model/Storage/Source/Plugin、生命周期；领域规则不写入composition root。
- storage：W007..W011及FTS的参数SQL实现；只依赖IR，port结构匹配，不新增上层domain依赖。
- agent-api：严格外部schema/权限与Application映射；apps/mcp仅stdio协议与会话生命周期，apps/cli仅命令适配。

当前上述domain包空入口不代表已实现。复用既有IR validator/typed errors、migration runner、Source policy、index/code query和取消/effect报告，不新建通用workflow engine或新的truth store。

## 2. Document与Claim契约

| 类型                   | 字段                                                                                                                                | 验证/身份规则                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Document               | id, workspaceId, repositoryId或null, logicalPath, mediaType, sourceKind（MARKDOWN/ADR）, currentRevisionId或null                    | id opaque；路径是locator，迁移需显式映射，不把同名文档默认合并                                                                       |
| DocumentRevision       | id, documentId, sourceFingerprint, parserVersion, policyVersion, sourceBasis, blockRefs, diagnostics, completeness                  | 不可变；相同内容和parser/policy tuple不生成重复revision                                                                              |
| Section                | id, documentRevisionId, parentSectionId或null, headingLevel, title, ordinal, sourceRange                                            | section只能引用同revision；重复heading不碰撞，ordinal是文档顺序                                                                      |
| Block                  | id, documentRevisionId, sectionId或null, kind, ordinal, sourceRange, payload                                                        | kind=PARAGRAPH/LIST/QUOTE/CODE/TABLE/HEADING/OTHER；payload严格union，不把任意Markdown当HTML执行                                     |
| Table/Link/CodeSnippet | id, documentRevisionId, blockRef, sourceRange, typedContent                                                                         | Table保行列与header；Link保原target和内部解析结果；Code保language/text digest，不执行                                                |
| EntityMention          | id, documentRevisionId, blockRef, textRange, resolution, candidateRefs                                                              | 同名不直接resolve；只能指向获准basis内实体                                                                                           |
| Chunk                  | id, documentRevisionId, blockRefs, contentDigest, ordinal                                                                           | 派生retrieval unit；不是结构真相；parser/chunk策略变更可重建                                                                         |
| Claim                  | id, subject:ScopedRef, predicate, value:ObjectRef或JSON literal, scope, stateIntent, claimKind, evidenceRefs, confidence, authority | stateIntent=CURRENT/TARGET/HISTORICAL/TRANSITION/DESIRED；claimKind=OBSERVED/DECLARED/INFERRED/CURATED；不因doc标题自动AUTHORITATIVE |

Document SourceRange不能直接冒充Code SourceFile range；文档range使用documentRevisionId+同样零基坐标规则。引用外部URL只保存链接，Phase1不自动抓取网络文档。路径跳出、symlink替换、secret文件、内容变更期间读取均经现有Source边界检查。

结构解析前执行source授权，结构持久化前再次扫描inline secret并redact/block，Document IR正文与code/table内容不能成为默认秘密副本。redacted块保留原始范围、原文fingerprint与redaction诊断，不能把过滤文本指纹冒充原文指纹。结构解析需正确保留heading、paragraph/list、table、link、fenced/indented code位置和ADR分段；默认不执行raw HTML。推荐使用单个成熟Markdown AST解析器，避免自写大量regex；具体依赖与license/version/位置信息正确性在实施前独立锁定。若无法验证完整语法，不宣称支持完整CommonMark，未知块保留OTHER及coverage，不能静默丢表或code。

`parseDocument(input:AuthorizedDocumentBytes,control:RequestControl):DocumentDraft`纯结构；`applyDocuments(input:ValidatedDocumentBatch):Promise<DocumentApplyReceipt>`在W007事务原子切换currentRevisionId；partial保旧版，当前新源标affected。Structure AUTO；语义Claim extraction仅在authorized update_knowledge内；直接可读的显式声明可作为DECLARED候选，但无法自动把语义解释发布为Knowledge。

## 3. Knowledge契约与依据

KnowledgeItem={id,type,scope,importance,lifecycleState,publishedRevisionId|null,sourceFreshness,compilationCurrency}。type=COMPONENT/CAPABILITY/RUNTIME_FLOW_REFERENCE/BUSINESS_FLOW/INTEGRATION；不新增Phase2 ArchitectureRule/Decision/Migration。scope严格联合REPOSITORY(repositoryId)、WORKSPACE(workspaceId)、CROSS_REPO(workspaceId,repositoryIds)。名称和 prose 不作identity key。

KnowledgeRevision={id,itemId,previousRevisionId|null,revisionSetId,structuredContent,semanticFingerprint,presentationFingerprint,supportRefs,inputSnapshotRef,compilationRunId,evaluationRef,publicationState,createdAt}。所有支持指向不可变snapshot内容与实际entity basis，完整provenance包含workflow/task/prompt/model-policy及adapter/model版本；不默认存raw prompt/context或隐藏推理。

| structuredContent类型 | 必需结构                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| Component             | title, summary, implementationRefs, entryPointRefs, responsibilityClaims, relationships                   |
| Capability            | title, summary, componentRefs, entryPointRefs, runtimeFlowRefs, supportedClaimRefs                        |
| Integration           | title, summary, participantRefs, contractMatchRefs, boundaryRefs, limitations                             |
| BusinessFlow          | title, goal, participants, steps（stepKey/action/supportRefs/nextStepKeys）, runtimeFlowRefs, limitations |
| RuntimeFlowReference  | runtimeFlowRef, basisRef, summary, limitations                                                            |

每个summary/action/关系都要支持链；模型提到未提供的entity ID、无依据参与者、按CallGraph虚构异步时间顺序均拒绝或退为显式候选限制，不可发布为确定事实。confidence不是LLM自报分；使用来源解析/支持的现有Confidence与最低支持上界。

## 4. SemanticTask与模型端口

任务保留四种：CAPABILITY_SYNTHESIS、BUSINESS_FLOW_SYNTHESIS、COMPONENT_SUMMARY、CLAIM_EXTRACTION。Integration候选由已有合同/边界结构形成，不能为了每种知识类型新增模型任务。

`buildSemanticContext(input:{snapshot,task,scope,policy,budget}):SemanticContext`：先授权/redaction→结构事实和稳定ref→必要doc chunk→版本prompt。context包括data/instruction分离标记；文档注释永远是数据。所有候选引用只来自context中的allowlisted ref，context超预算时保留必要闭包或拒绝，不能截掉支持后继续生成完整候选。

`SemanticModelPort.generate(request:SemanticInvocationRequest,control):Promise<SemanticInvocationResult>`。request={taskKind,promptRef,modelPolicyRef,outputSchemaRef,authorizedContext,inputDigest,invocationBudget}；result={structuredOutput,provider/model identity,usage,finishReason,outputDigest,warnings}。Runtime adapter可使用本地或显式opt-in的OpenAI-compatible endpoint；knowledge包不直接发HTTP。模型下载不属于Phase1。

输出优先native JSON schema，次选JSON模式+严格验证，再选prompt JSON+有界repair。每种能力显式配置，不假定所有compatible endpoint都实现相同schema功能。transport重试、结构repair、context expansion、model fallback分别计数并消耗同一run预算；没有批准的retry上限就不自动重试，只给typed error。默认remote fallback=false，local-only或security block不可切换远端。

取消/deadline中止读取和生成、等待子任务settle，部分模型输出不作candidate。远端URL/credentials不进入日志；拒绝未批准重定向目标，连接前与每次repair发送前均重验destination/secret policy。模型不可调用工具写库或修改代码。

本地无模型时，init/index/确定性查询/FTS/status可用；update_knowledge返回PROVIDER_UNAVAILABLE并保旧版，不伪造生成结果。确定性fixture adapter用于workflow/安全测试，必须标TEST_DOUBLE，不作为真实语义质量通过证据。

## 5. 三工作流与copy-on-write发布

同一实现骨架按scope解析不同输入，不建三套互相漂移的publication代码：

`updateKnowledge(request:KnowledgeUpdateRequest,ports:KnowledgeUpdatePorts,control:RequestControl):Promise<KnowledgeUpdateResult>`。

request={scope:AUTO|REPOSITORY|WORKSPACE|CROSS_REPO|ALL,mode:AFFECTED_ONLY|FULL,selection,callerContext,expectedPublicationHead|null}；默认scope AUTO、mode AFFECTED_ONLY来自现行规范。AUTO由当前命令选择/已注册workspace关系确定，无法无歧义确定则返回SCOPE_REQUIRED，不擅自更新整个workspace。FULL只表示所选scope内重编，不授权远端或无关仓库。

流程：

1. 校验write capability、源访问、预算、配置；解析scope并冻结RevisionSet。
2. 每repo单WAL snapshot采集Code/Runtime/Contract及support，选定DocumentRevision；捕获后重验basis；写不可变CompilationInputSnapshot。
3. 形成结构draft和bounded SemanticTasks；LLM在事务外运行；记录run/step状态和受控usage。
4. 严格schema、grounding、support存在性、state consistency、身份/reconciliation、质量/probes验证；所有required候选就绪后才准备publication set。
5. 提交前复验权限、basis和expected head；W009..W011单workspace事务写revisions/relations/evaluation/publication receipt，最后CAS移动item pointers。
6. 提交后再核验可变repo basis；发生变化保留已提交历史basis revision并标AFFECTED，结果如实报告COMMITTED_WITH_AFFECTED_SOURCE；不谎称回滚。查询亦检查basis，避免靠漏报watch事件宣称FRESH。

工作流状态（run）CREATED/CAPTURING/GENERATING/VALIDATING/READY/PUBLISHED/FAILED/CANCELLED；启动时未settle且无活owner的run只标INTERRUPTED诊断，不能复造ownership并自动继续调用模型。人工显式再次命令可创建新run，不自动retry-to-green。

KnowledgeUpdateResult={runRef,publicationEffect（NOT_ATTEMPTED/NOT_COMMITTED/COMMITTED/UNKNOWN）,publishedRevisionRefs,sourceState,diagnostics}。输出流失败保commit事实；lost commit acknowledgement用run id查询receipt确认，不能盲重试再写新revision。idempotency key绑定caller/request/input snapshot，重用key但不同输入拒绝。

语义partial或失败：候选和安全diagnostics可留审计，原published pointers不移动。scope内required set原子发布；不将逐item成功拼成完整scope成功。更新一个repo不能删除其他repo知识。范围包含未知/外部repo时必须明确拒绝或保边界，不静默省略。

## 6. 身份与Phase1 Reconciliation边界

`resolveKnowledgeIdentity(input:{candidate,existingItems,policyRef},control):IdentityDecision`。先同type/scope/stateIntent筛选，再比较entry/implementation/contract/support等结构anchor；exact相同且唯一的结构identity可以保id，纯rename/reword仅改presentation或适当revision。结构变化不能只因名字相似继承identity。

Decision={outcome,matchedId|null,signalComparisons,score|null,thresholdRef|null,ambiguityMarginRef|null,alternatives,reasons,requiresReview}。没有经Fixture批准的权重/阈值时score及threshold为空，不创造默认0.8/0.95；non-exact结构匹配走REVIEW_REQUIRED。它是最小安全模式，非“已完成可调identity算法”的声明。

- UNCHANGED：semantic fingerprint相同；presentation变化可重投影，不伪造语义结构变化。
- UPDATE/NEW：唯一确定结构保id或新opaque id；涉及critical/core结构变更需review。
- MERGE：按human pin、curated、年龄、支持、usage、外部ref的规范顺序给建议，证据不足不自动选；审阅后survivor保id，其他SUPERSEDED_BY。
- SPLIT：Phase1始终review；不得自动拆身份。
- CONFLICT：仅同identity/scope、重叠时间和同stateIntent的互斥claim；CURRENT REST与TARGET Kafka不算冲突。
- DEPRECATE：支持消失先标AFFECTED/STALE；没有批准的持续时间/次数策略不自动退役。WORKTREE消失更保守。

Phase1保留transition/drift Fixture，但对需要Phase2 ArchitectureRule/Migration对象的drift分析明确NOT_APPLICABLE/DEFERRED，且测试必须证明不误判冲突；不把未运行高级drift评估说成PASS。完整curation/ResolutionRules/advanced reconciliation不是当前依赖。权重、ambiguity margin和deprecation策略是待独立Fixture/Evaluation决定的EVOLVABLE项。

source-grounded降级候选建议默认关闭：不添加自动编排；unsupported parser不能改Code事实或自动触发update_knowledge。若用户选启用，走同一snapshot/model/candidate/publication路径，并增加generationMethod、source refs、coverage限制、unverified relations及path-specific probes；需要单独设计接受，不能借主计划默认启用。

## 7. Workspace迁移与查询

W004..W006及repo迁移见契约设计。W007..W011按现行预留顺序推进，不改旧W001..W003。

| migration       | 表/关键约束                                                                                                                                                                                                                                                                                              | 失败与验收                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| W007 documents  | documents(id,scope,path,current_revision_id)；document_revisions(id,document_id,fingerprint,parser_version,payload_json)；sections/blocks/links按revision FK与ordinal唯一                                                                                                                                | parser失败不切pointer；旧revision不可变；link目标未解不造FK                                                                           |
| W008 claims     | claims(id,document_revision_id或snapshot_ref,kind,state_intent,subject_json,predicate,value_json,scope_json,confidence_json)；claim_evidence(claim_id,support_key,payload_json)                                                                                                                          | OBSERVED/DECLARED/INFERRED/CURATED严格；证据和scope闭包app校验                                                                        |
| W009 knowledge  | knowledge_items(id,type,scope,importance,lifecycle,published_revision_id)；knowledge_revisions(id,item_id,previous_id,revision_set_id,semantic/presentation fingerprints,input_snapshot_id,compilation_run_id,evaluation_id,payload_json)；knowledge_relations(revision_id,kind,target_ref,payload_json) | 引用尚未存在W010/W011表的关系列先存在，待后续migration添加完整外键/约束或在同schema套件中验证；不在W009运行时发布；不可宣称单W009足够 |
| W010 lifecycle  | source_changes/impacts、compilation_runs/publication_runs、compilation_input_snapshots/snapshot_supports                                                                                                                                                                                                 | input snapshots不可变；run→revisionSet FK；scope+expected head CAS；去重request key；FK补全策略见下文                                 |
| W011 evaluation | evaluation_runs(id,run_id,report_schema/version,basis_digest,baseline_ref,status,report_json)、metrics、probe_results；FTS5 derived virtual table/metadata                                                                                                                                               | 不适用/null与failure分开；不把UNKNOWN写PASS；FTS重建不改canonical                                                                     |

为避免跨migration前向FK问题：W009创建知识表时只对已存在W003/item/revision的键建FK；run/snapshot/evaluation列暂TEXT并由app拒绝未完整schema的publication。W010/W011完成后使用新增关联表`knowledge_revision_provenance(revision_id,run_id,snapshot_id,evaluation_id)`建立同workspace FKs，并将其作为publication强制依赖；不得修改旧migration文本。publication用例在W011前返回SCHEMA_CAPABILITY_UNAVAILABLE。

KnowledgeRevision结构payload中的provenance必须与关联表完全一致；创建、关联表与pointer移动在同事务。以tests证明不能通过Application发布dangling provenance；任何可绕过触发器/外键的raw SQL不是公开应用工作流。W011触发器要求published pointer引用存在关联的validated revision，失败回滚。

公开查询port：`KnowledgeQuery.readPublished(request:PublishedKnowledgeQuery,control):Promise<KnowledgeQueryResult>`，返回选定revision、sourceFreshness、currency、coverage、support refs和truncation；默认只published，不泄露pending candidate。`searchKnowledge(request:KnowledgeSearchQuery,control):Promise<KnowledgeSearchResult>`用FTS5匹配再按稳定ID打破同分；scope/权限在检索与context materialization均检查，不靠末端删字段。

FTS保存entity/revision/content digest和可获准搜索的文本，不生成embedding。每次publication事务更新derived索引；重建使用canonical revision rows和schema版本，失败保旧索引并返回INDEX_UNAVAILABLE或受控fallback，不隐藏成0结果。source secret正文不进入FTS。

## 8. 标准Wiki与Markdown输出

`projectStandardWiki(request:WikiProjectionRequest,ports:{knowledgeQuery,artifactWriter},control):Promise<WikiProjectionResult>`。request={scope,selectedPublishedRevisionRefs或null,format:MARKDOWN,outputTarget,customizationPolicy:LOCKED,allowPartial}。allowPartial必须显式，默认不把required缺失当完整产物。

标准章节：项目/系统概览、Components、Capabilities、Integrations/Contracts、RuntimeFlow引用、BusinessFlow、来源/coverage/freshness；系统scope可呈现有published支持的跨仓关系。Architecture/Migration章节无Phase1正式知识类型支持则MISSING_DATA/不适用说明，不编造未来状态。

只通过KnowledgeQuery读取published revisions。渲染可以确定性模板化，不再调用LLM。部门自定义、用户WikiSpec、profile继承/通用renderer SDK不实现；平台自带profile版本、engine版本、renderer版本、knowledge revision集合及内容摘要进入artifact provenance。

copy-on-write输出：在获准目标目录创建独占临时文件→完整写入验证→immutable内容/版本命名文件→原子更新manifest/current引用；旧artifact在失败时保持可读。没有Phase1独立Wiki SQLite迁移；复用受限文件artifact writer，不提前引入Phase2 artifact持久化体系。禁止跟随目标symlink/junction越界或覆盖无关用户文件；冲突返回OUTPUT_TARGET_CONFLICT。

reprojection是显式手动命令，与update_knowledge分开；不得enqueue语义更新、调用LLM补缺失或改变knowledge revision。缺required为MISSING_DATA，旧源为STALE，显式允许部分输出为PARTIAL，全部支持齐全才COMPLETE。LOCKED非法customization整体拒绝，不能悄悄部分采用。

## 9. Agent API与MCP

RequestContext={workspaceId,repositorySelection/revisionSet或null,scope,budget,callerCapabilities,permissionContext,deadline/cancel}。响应严格`{data,meta:ResultMeta}`或typed error，成功空结果必须和权限/不可用错误区分。

| 工具 / Application映射                    | 输入与输出                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| get_project_context → getProjectContext   | depth=L0/L1/L2, task/query或null；返回bounded ContextItems/refs；L0无模型时工程摘要可用，知识缺失明确   |
| search_knowledge → searchKnowledge        | text,scope,filters,pagination；FTS5+有界图展开，不自动embedding                                         |
| understand_symbol → understandSymbol      | repo/ref或位置；复用现有code query并附entry/runtime relevance，未建runtime单独诊断                      |
| trace_flow → traceFlow                    | kind=CODE/EXECUTION/RUNTIME/BUSINESS, startRef,方向/预算；BUSINESS仅published；不混淆code trace与业务流 |
| get_knowledge_status → getKnowledgeStatus | scope；source freshness、compilation currency、provider health、运行中/失败run安全元信息                |
| update_knowledge → updateKnowledge        | scope/mode/selection/idempotency/expected head；明确write permission；返回publication效果               |

startup不加载全Wiki、不调用模型、不自动update。L1按任务检索published知识；L2按明确需求读取获准的工程事实/evidence，按预算返回refs/frontier，不能把旧Knowledge装成最新工程事实。read-only工具无写权限亦可运行；可能的缓存/派生索引修复不触发semantic update，是否写派生状态须显式operation policy。

MCP stdio一个进程绑定一个workspace；请求不能切到任意workspace/文件路径。协议stdout仅数据、日志stderr；每请求独立预算和取消。现有`--smoke`保留但不能替代六工具验收。启动watcher先完成missed-change reconciliation再监听，丢事件/溢出标不确定并受控reconcile；不自动语义编译。会话关闭停止watcher/模型请求/DB句柄，等待settle，不启动daemon。

MCP协议库如需新依赖，先选官方兼容版本/锁定并验证stdio/cancel；不手写宽松JSON-RPC替代协议校验。未批准的依赖版本在总评审决策表中列出，不在本轮安装。

## 10. 配置、安全、CLI与安装

EffectiveConfig保留runtime/indexing/providers/plugins/knowledge/llm/embedding/agents/security；层级repository>workspace>global>defaults。YAML版本必填、未知key只给受控path warning（现行Phase1规则），秘密通过env/OS credential，禁止写workspace YAML。配置版本与IR/IPC/schema/workflow/prompt独立。

每operation按caller、source分类、derived/raw、scope、目的地分别授权；index允许不等于remote允许。默认secret路径/密钥扫描继续生效，修复输出也重新扫描。插件只能BUILT_IN，immutable context无network/env/fs权限；原Provider env allowlist和Windows消毒不得削弱。

CLI：init创建metadata/config/DB、注册repo，不强制index/compile；显式--index才索引。status/doctor报告事实、模型/索引/profile可用性，不安装/修复/自动校准。agent setup默认dry-run，解析既有配置、展示合并diff、备份再显式写入，无法安全合并返回snippet而非覆盖。code index沿用现有合法命令契约；runtime阶段分别报告状态。

发行推荐首个受支持目标Windows x64（与现有精确Native准入环境对齐）；这只是待用户确认的产品矩阵，不能把其他平台悄悄从原已承诺范围删除。新增Linux/macOS支持需对应构建、真实安装、Native profile证据；不能仅凭TypeScript能运行就声明支持。npm包+platform Native包，无Rust工具链；Node版本满足当前仓库>=24<25，无模型也能运行确定性核心。没有托管模型下载或单可执行文件。

安装期不执行用户源码、不自动触发LLM或远端请求。离线缺platform包则明确PROVIDER_UNAVAILABLE；已有索引/知识仍可按权限查询，不用下载脚本绕过安全。包选择校验os/arch/版本/协议，doctor报告不兼容而不默默运行未知二进制。
