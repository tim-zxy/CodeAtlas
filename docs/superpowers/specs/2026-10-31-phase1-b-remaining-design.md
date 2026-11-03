## §5/6 workspace接线实施补记 — 2026-10-31

readWorkspaceInputs消费显式FrozenContractSet，以既有完整认证核对实际repo候选、frozen W003集和根，捕获旧workspace指针；原写事务仍重核，不承诺跨库原子。Application调用原matcher/stitch，Runtime私有固定组合，原prepare签名不变。原workspace digest已对binding集合排序，返回绑定沿stitch规范顺序。正式Graph的FRAMEWORK_BINDING边界引用由同批严格binding envelope及不可变表验证，Code/Source/Syntax支持仍独立认证；不是外部Source或策略扩展。准确52项局部证据见唯一results.json，不替代实际Source/原质量门禁。

## §6实施接线补记 — 2026-10-31

原授权内新增固定私有composeFrameworkRuntime；routes/configuration由调用者显式提供，无生产配置新键/默认，SQLite输入按expected完整身份读取，只接Syntax3。Application消费固定工厂输出，统一合并后交既有Graph/Flow；Runtime仅选择/连接，Storage仅IR。原SPI候选单位在多个路由间从同一request.maxItems扣减；Graph/Flow继续原控制。空匹配不能证明完整，保留FRAMEWORK_OBSERVATION_UNPROVEN/PARTIAL并由原工作流拒绝发布。此为原设计的实现追踪，不新增策略数值或修改旧接口；最终有限证据见唯一results.json。

# B5当前范围补记 — 2026-10-31

五迁移/Runtime与Workspace Store/授权/私有接线组件已实施；完整V4选择/来源整链及B6/原父门禁仍OPEN；同Code full历史恢复身份控制和最少SQL前付实证已补，不新增完整费用矩阵，不能将以下未勾选项视为已验收。准确证据见[实施审查](../reviews/2026-10-31-phase1-b-remaining-implementation-review.md)和原唯一结果索引。原范围连续推进，不逐任务确认。

# B5迁移批准补记 — 2026-10-31

用户明确批准[五迁移最小修订](2026-10-31-phase1-migration-backup-policy-proposal.md)。仅五个纯新增迁移backupRequired=false，取代下方true复用假设；旧runner拒绝、checksum与全部边界保持。B5–B6沿原整包连续实施，无微步骤审批。

# 实施批准补记 — 2026-10-31

用户最新“批准”明确批准本统一设计与B1–B6本地实施包。以下PROPOSED/未授权文字保留为审批前历史；当前实施范围和限制沿原整包，无逐组件再次审批。执行账本：[执行账本](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/progress.md)；尚未完成整包验收。

# Phase1 B批剩余整体设计：框架、流程、合同与持久化

2026-10-31；状态PROPOSED / IMPLEMENTATION_NOT_AUTHORIZED。
这是原P1-06..09剩余工作的统一设计入口。用户要求按原五批执行，内部阶段连续推进；本方案涉及尚未批准的新契约/迁移/本地SQLite运行，需一次整包审阅后实施。不是另增阶段或新的产品范围。

## 1. 目标、基线与可复用成果

目标：将现有声明组件接成四Plugin→标准化边界绑定→ExecutionGraph/RuntimeFlow→合同匹配/冻结RevisionSet串联→Repository/Workspace Storage→Application/Runtime的完整本地工作流。子组件PASS不单独作为原父任务完成。

准确任务映射：
|原任务|必须交付|现状|
|---|---|---|
|P1-06|Spring/Mongo/Kafka内建Plugin、独立Fixture、实际Syntax集成证据|已有检测/绑定、部分草稿/领域候选/入口；factory/完整边界与集成未完成|
|P1-07|FastAPI Plugin与Python支持链|有限route/router声明链已具备；完整factory/Depends与实际集成仍缺|
|P1-08|ExecutionGraph/RuntimeFlow、R012/R013、原子刷新/查询|G1声明局部CALL链已具备；异步/数据/任务边界、持久化/正式接线仍缺|
|P1-09|服务/合同、六结果匹配、基础跨仓、W004..W006|Contracts包为空；严格IR/matcher/stitch/Store及接线仍缺|

此前G1报告将图的完整父任务写成P1-07，后续按本表澄清为P1-08；不改既有报告/原始证据来掩盖历史表述，也不改变4/21接受、17OPEN计数。

已核对G1的16个产品/Fixture/注册输入身份不变，复用其54项新链及121兼容、55注册/workspace、构建/架构历史证据；本设计不重跑。保留旧private API及其拒绝行为，不让旧单仓CALL接口静默接受新边界。

## 2. 总体取舍

推荐一个B批方案、一个实施任务包：先将接口统一冻结，再按数据依赖顺序实现，不按框架/文件申请确认。域归属继续Plugins→IR，Execution→Contracts/IR，Storage→IR，Application组织授权与事务，Runtime只接线。

备选：继续按每个private出口拆包会造成多次重读/审批且不能完成原任务；现在直接建Store会把缺失边界/匹配契约埋进SQL。故先统一契约、再同批落地和验证。所有设计选择标为本提案，不能当此前已获批准。

本地实现允许普通Node、测试拥有的临时SQLite以及已有受控Source字面Fixture；不启动实际Git/Native CLI、Rust库/collector/helper/模型，不校准或选profile值。新的真实观察资格由A批准确运行包处理；B不得绕过。

## 3. 一次统一的数据契约

### 3.1 严格Plugin V4与标准化绑定

新增显式V4 describe/detect/extract适配，contextVersion=4、syntaxSchemaVersion=3，复用现有Context4和支持联合；旧V1/V2/V3入口/descriptor不接新增字段。四个新factory明确命名createSpringPluginV4/createMongoPluginV4/createKafkaPluginV4/createFastApiPluginV4，禁止用V2名字承诺可处理Syntax3。

输出使用严格版本化候选：RuntimeFactSet v1，以及独立codeatlas.framework-binding-set/version1。绑定集payload={basis,externalRefs,supportInventory,bindings}；binding共同字段沿用RuntimeBaseShape，增加ownerRef和判别联合：
- MESSAGE_PUBLISH / MESSAGE_CONSUME / HTTP_CALL：contractRef；
- DATA_READ / DATA_WRITE：resourceRef；
- DATA_WATCH：resourceRef、handlerRef；
- TASK_CREATE / TASK_EXECUTE：taskRef；
- DEPENDENCY：dependencyRef（Code引用；只说明声明依赖，不等于CALL）。

所有关系必须绑定本次真实Code owner、确切Source site及当前支持；target必须是同一候选集已生成的合同/资源/任务或已证明Code，不按名字跨接。不把私有draftKey当Canonical事实支持。

绑定factKey=framework-binding:+H(framework-binding-fact-v1,[repo,kind,ownerCode.factKey,target.factKey,siteTuple,handler.factKey|null])；siteTuple=[Canonical Source path,startLine,startColumn,endLine,endColumn]。id=binding:+H(framework-binding-entity-v1,[repo,revision,kind,factKey])。H按既有domain+NUL+JSON.stringify tuple的SHA256，排除provider/Syntax原ID/规则名/置信。当前Syntax支持仍采用已批准runtime-syntax-support-v1，不新建重复来源系统。

扩展规则优先现有Syntax3与共享binder：Spring路由/Scheduled/可证明Feign与声明依赖；Mongo typed receiver读写及可证明handler；Kafka发送/监听；FastAPI route/router/可证明Depends。相同声明初始化的多个Syntax记录须有实际同site/owner证据才能折叠，不为通过Fixture默许多定义。

**输入充分性门禁：**独立Source/旧库捕获与手写Context分开。若某能力在Syntax3中无法证明，输出明确UNKNOWN/coverage，记录缺字段/Fixture反例；暂停该能力的正例签收，继续本批无依赖工作。不得插件重解析、按名称猜测或顺手引入wire8/Syntax4。新协议/Native变更若确需，作为本批集中治理差异，不能被泛化授权。

### 3.2 ServiceIdentity、ContractMatch和workspace execution

新增单独版本化IR，不改现有RuntimeFactSet v1为多repo形状：
- FrozenServiceCatalog：workspaceBasis、services、entries、contractBindings。service={id,factKey,logicalServiceKey,location:WORKSPACE|OUTSIDE_WORKSPACE|KNOWN_EXTERNAL,repositoryRef|null,supportRefs}；identity entry={id,factKey,serviceRef,sourceBasis,identityKind,namespace,key,supportRefs}；contractBinding={contractRef,serviceRef,supportRefs}。WORKSPACE service必须对应冻结集中的repo，其他两种必须有显式来源登记；contractBinding只关联现存合同，不重写其serviceRef或payload。identityKind固定LOGICAL_SERVICE/HTTP_ORIGIN/MESSAGE_NAMESPACE；仅明确受支持的登记/来源声明，不从目录名推服务身份。重复identity保留歧义。
- FrozenContractSet：workspaceBasis、repositoryBindings、catalog、contractRefs及其严格payload/支持；repositoryBinding={repoBasis,syntaxActivationId,syntaxMembershipDigest,runtimeActivationId,runtimeCandidateDigest}。绑定必须与冻结RevisionSet的repo/revision/fingerprint一致，不能只比较WORKTREE revision ID。
- ContractMatch envelope schema=codeatlas.contract-match/version1：{id,factKey,workspaceBasis,consumerRef,status,candidateProviderRefs,selectedProviderRef,reasons,supportRefs,basisRefs,confidence}。status为MATCHED/AMBIGUOUS/UNRESOLVED/CONFLICTED/OUTSIDE_WORKSPACE/KNOWN_EXTERNAL；selected只在MATCHED存在且必须属于单一候选。
- WorkspaceExecution envelope schema=codeatlas.workspace-execution/version1：{workspaceBasis,repositoryBindings,nodes,edges,coverage,supportInventory}；node={id,factKey,repositoryRuntimeRef}；edge={id,factKey,sourceRef,targetRef,matchRef,transitionKind,supportRefs,confidence}。源repo的context和节点不在workspace重算/压平；仓库ScopedRef保留原repo/revision。每跳含真实match和支持。

服务/匹配键使用版本化tuple：service[workspace,目标repo|null,显式logicalServiceKey]、identity[workspace,service.factKey,identityKind,namespace,key]；match[workspace,revisionSet,consumer的repo+contract.factKey]；workspace node[workspace,revisionSet,repo,Runtime kind,factKey]；workspace edge[workspace,revisionSet,source semantic tuple,target semantic tuple,match.factKey,transitionKind]。不可将mutable路径、provider ID或数组ordinal当身份。activation payload摘要另含全部支持/策略，不把逻辑ID当旧记录可变许可。四类新增workspace记录的factKey前缀分别service:/service-identity:/contract-match:/workspace-execution:，域统一phase1-workspace-fact-v1、tuple=[workspaceId,kind,上述meaning]；id前缀workspace-entity:，域phase1-workspace-entity-v1、tuple=[workspaceId,revisionSetId,kind,factKey]。services仅有logicalServiceKey登记时合法，identity不是猜出的部署身份。

workspaceBasis.workspaceActivationDigest固定为H(workspace-runtime-input-v1,[workspaceId,revisionSetId,按repo排序的repositoryBindings,catalogCoreDigest,policyDigest])，catalogCoreDigest只散列services/entries/contractBindings，不包含catalog外层workspaceBasis，避免摘要自引用；该值标识冻结输入，不是假称已提交的workspace输出activation。

匹配顺序：身份/协议/方向/namespace→method/path或transport/channel→有来源schema约束。唯一证据充分兼容者MATCHED，多充分兼容者AMBIGUOUS；明确矛盾CONFLICTED；缺身份/schema/namespace证据UNRESOLVED。仅明确登记才可KNOWN_EXTERNAL/OUTSIDE_WORKSPACE，找不到不是外部。未知schema即使两者都null也不等于兼容。

HTTP沿consumer→provider；MESSAGE中ContractMatch消费者是listener、provider是producer，但stitch传播必须producer→consumer。未MATCHED不串联，保留原未解析边/诊断。基础跨仓只做冻结快照组合，不承诺跨DB同一原子时刻。

### 3.3 置信与策略边界

已有领域/执行策略0.5及其适用条件不变。新增绑定使用runtime-declaration-support-v1的相同规范支持约定，显式将适用范围扩展到本节已证明关系；不将DEPENDENCY升级执行关系。

匹配/跨仓拟采用contract-support-bound-v1，score取本条实际使用、具有confidence的输入支持分数的最小值；resolution=HEURISTIC。没有分数的Source不捏造，输入无足够支持则UNRESOLVED；组合不增分，不设新分值/阈值/投票。此取值方法和政策用途本次需明确批准，不借旧0.5审批推定授权。数值不是匹配正确率。

## 4. 完整本地图、Flow与控制

新正式deriveExecutionGraph/deriveRuntimeFlows消费严格Runtime/绑定输入及现有请求预算/取消/deadline；旧deriveDeclared*继续其单仓CALL适用域。

- 根来自有支持的EntryPoint；REQUEST/EVENT/JOB/TASK/BATCH分别建context，不按Code调用猜异步执行。
- DATA_*在真实可达owner context内产生DATA/边界节点；仅DEPENDENCY不产生CALL。WATCH只有完整resource和handler证明才生成DataChangeTrigger及对应边界。
- PUBLISH/CONSUME、HTTP_CALL、TASK_CREATE/EXECUTE由确切binding建BOUNDARY节点/transition。没有匹配目标时保留NON_RESOLVED；明确匹配后才接目标context，异步保持独立context/parent与边界，不把同步CALL换名冒充。
- 当前CALL图不能证明BRANCH/RETRY/FAILURE等，除非输入有独立支持；不推断运行时先后。
- Flow稳定排序/visited/back-reference复用G1；压缩只允许设计既定的同context、纯CALL、非边界、单入单出段。可以先采用不压缩的合法初版，不能跨异步/branch/join压缩。
- 正式接口按既有预算返回显式frontier及PARTIAL；不替换已批准private接口的hard refusal。取消/deadline不发写指令；部分结果不能成为完整激活。
- 完整覆盖≠已部署启用。coverage按实际观察/可证明语义/未验证关系明确报告，不能仅因仍标声明性质就绕过critical recall，也不能把未执行的真实来源测量记通过。

所有新图/Flow身份在当前语义tuple域外显式版本化（execution-graph-v2/runtime-flow-v2），含context/entry/target稳定语义；不静默重用G1逻辑ID域来改变含义。具体kind的tuple沿用G1共同配方，边增加[transitionKind,binding.factKey|null,source semantic key,target semantic key|null]；未解候选不选第一项。同ID不同核心拒绝；所有支持非空且同basis/明确workspace作用域。

## 5. R012/R013与W004..W006的实际发布合同

### Repository

R012：runtime_activations（不可变父链/输入/策略/candidate digest）、runtime_state（当前指针）、runtime_domain_facts（Entry/Task/Resource/Trigger/Contract及kind）、runtime_bindings、runtime_support_membership、execution_contexts/nodes/edges；R013：runtime_flows、runtime_flow_steps及其当前activation关系。每表STRICT，payload保存准确schema_name/version/payload_json/value_digest；核心关系同时存关系列。

共同键activation_id+entity_id；factKey在activation+kind内唯一；context/node/edge、flow/step引用同activation，边target有resolved与nonresolved判别，不能悬空已解析目标。来源Code引用必须在该activation绑定的repo/revision/current membership完整核验，不把工作区引用用SQLite跨库FK伪装成认证。历史runtime不可FK绑定到会被后续Code刷新删除的current行；runtime_support_membership保存实际使用的、经当前membership认证的严格Code/Source/Syntax值与digest/原basis，或引用已有等价不可变历史值。它是activation的历史支持，不是第二份live truth；Code更新后last-good仍能解析原支持，不猜测carry-forward。bindings与支持按同activation读取。索引只覆盖当前指针、context、source/target、entry、step ordinal的实际读路径。

activation identity包含repo/revision、准确parent、完整CodeBasis、Syntax activation与membership、策略摘要、候选摘要；旧id不可被同代码basis的新Syntax/policy替换内容。读WAL snapshot返回当前事实与输入identity、coverage、CURRENT/AFFECTED/NOT_AVAILABLE；旧last-good仍可读且携旧basis。

applyRuntimeBatch接expectedCodeBasis、expectedSyntax activation/membership、expectedOldRuntime activation、validated完整候选/支持。Runtime/Store锁外准备，写锁内重新核对、同一事务写完整immutable activation+关系+graph+flow并切指针。联合Syntax刷新复用Mixed Store已验证的锁内kernel，在同一连接/事务写Syntax+graph+flow；不执行两次独立commit，不开放任意事务callback绕过lease/Source/CAS。旧Mixed接口结果和恢复门禁保留，必要私有kernel提取有旧Store回归。

持久结果严格区分NOT_COMMITTED/COMMITTED/COMMIT_OUTCOME_UNKNOWN，commit后输出/关闭失败保留真实身份；不把异常当未提交。恢复只读判定，不手工修DB。失败/partial/输入变化不删除旧activation。

### Workspace

W004 services/service_identities；W005 workspace_runtime_activations/state、contracts/contract_matches/match_candidates；W006 workspace_execution_nodes/edges。以workspace activation+revisionSet复合键保存，服务identity非全局强制unique，歧义候选不折叠。workspace内部FK完整，repo引用由冻结binding认证，不做跨repo数据库FK。

输入必须是现存frozen RevisionSet；W003仅记录revision/fingerprint，故新增activation同时冻结Code/Syntax/Runtime binding。分库捕获后核验，再在workspace写事务校验冻结集、旧pointer与已绑定候选，原子切workspace pointer。来源跨库变化不承诺原子阻止：前后重查、查询时报告AFFECTED/旧binding；commit已成立而后查发现来源变化时保留COMMITTED事实并标stale，不谎称回滚。

五个migration按原预留逐号追加、既有checksum不改，无猜测backfill/no down。backupRequired拟为true，复用现有runner，失败前保持旧库。新空库/升级/锁/校验失败/重开在测试拥有DB验证，不碰用户/R4 DB。

读写逻辑计费复用现有explicit rows/bytes/items/depth/memory控制；各真实SQL读取前预付、保留实际结果与cleanup费用，不复制与新路径无关的旧完整矩阵。不得新设默认或假称RSS资格；生产观察仍受A批profile约束。

## 6. Application、Runtime及安全

Application提供refreshRuntimeFacts/readRuntimeBasis/traceRuntime、refreshWorkspaceRuntime与replaceContracts的授权边界；只读trace不refresh。Storage依IR及声明端口，不import Plugins/Execution；Runtime只负责已批准配置、Source/进程准入与服务组合，不含规则。

现有已锁定IR/Zod与包内接口接线可按实际需要更新manifest/lock/public exact exports；不增加第三方库、配置默认或远程行为。Provider capability/实际观测资格仍需原Fixture/Evaluation，不能因factory公开就升级语言成熟度。原A6失败/空profile下，真实观察路由明确NOT_READY，不能以B批本地SQLite成功绕过。

Provider-independent Canonical IR、SQLite authoritative、LLM candidate-only、AUTO工程事实/MANUAL语义与ExecutionGraph→RuntimeFlow→BusinessFlow保持。C批知识/Wiki/MCP不提前实现；CFG/PDG/DiagramModel继续原DEFERRED阶段。

## 7. 批次完成与批准边界

所有数据/插件/图/Store/match/workspace串成一条真实本地组合测试，独立Fixture先于实现。每部分有必要的失败/取消/竞争/重开/last-good证据；末尾集中去重跑受影响门禁。不得将声明fixture、库级Source历史捕获、真实Native观察混叫同一种执行证据。

父任务只有原P1-06/07/08/09各自所有门禁具备才关闭；本地实现完成但A批实际资格/关键Source正例或质量baseline缺失，准确标HOLD，继续无依赖项，不以新private出口冲抵父任务。

本提案一次集中批准覆盖上述契约/策略适用、五个迁移/本地测试拥有SQLite、原P1-06..09产品及接线、独立Fixture、范围修复和适用本地测试。运行无上轮Rust精确额度复用；本包不包含任何Rust/Native/helper/collector/真实Git/模型/校准/profile数值/新库/云端CI/Git写入。另有FROZEN冲突、必要新协议/依赖/数值或真实操作时集中列准确差异，不能暗改，也不逐文件再问。

[集中任务及验收映射](../plans/2026-10-31-phase1-b-remaining-execution.md)；[整包作者审查](../reviews/2026-10-31-phase1-b-remaining-review.md)。

## 当前执行检查点 — 2026-10-31

[实施评审](../reviews/2026-10-31-phase1-b-remaining-implementation-review.md)及[准确命令/唯一结果](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)：400/400范围通过，完整Source/Evaluation/B2缺口及B5/B6仍OPEN。[五迁移标记冲突修订](2026-10-31-phase1-migration-backup-policy-proposal.md)待一次集中决策；未实施新SQL/manifest/Store变更，原整包其余授权持续有效，不逐组件重新审批。
