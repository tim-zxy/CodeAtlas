# Phase1 显式 HTTP schema 证据与正向跨仓设计

日期：2026-11-03。状态：APPROVED / B_DECLARED_HTTP_SCHEMA_LOCAL_EXIT。原 B / P1-06..09 的一个集中续接包；不是新阶段。用户已明确批准本文和 T1–T4 整包，本会话顺序实施。

## 1. 依据、问题与目标

依据 AGENTS、DESIGN_AUTHORITY、IMPLEMENTATION_PROTOCOL、ROADMAP、WORK_BREAKDOWN、PHASE_ACCEPTANCE、ADR-020、CANONICAL_IR/PLUGIN_SPI/MODULE_BOUNDARIES/EVALUATION，以及原 A/B 合同 §7–8 和[本地实施评审](../reviews/2026-11-03-phase1-ab-local-implementation-review.md)。

当前实际 J7 InventoryProxySource.java 与 P5 inventory-service.py：Feign items 声明和 proxy 调用点形成两份 consumer；GET /items 与显式 inventory 身份对应 provider。query/request/response refs 均 null。match-contracts.ts 对任何缺失或不同 schema ref 保持 UNRESOLVED/SCHEMA_COMPATIBILITY_UNPROVEN；真实 workspace Store 拒绝 PARTIAL。修复后局部链 205/205，不证明这个正向门禁通过。

Java String 或 Python return 字符串未证明 HTTP 编码、media type 或完整响应协议，不能直接生成兼容 schema。目标是让**双方明确声明、且正文可由已入库 Source 指纹认证的有限 HTTP 合同**参与基础跨仓匹配，保留无声明时的未知结果。

## 2. 方案比较与边界

- **推荐：快照绑定的显式合同文档。** 复用 SourceFile/SupportRef、FrozenContractSet、原 matcher/stitch、授权 workflow 和 W005/W006；正文作为不可信输入，Store 验证它确属冻结 Source。无需新 Native、语言类型分析、文件读取器或第三方库。结果表达“声明合同相容”，不证明部署、编解码器实际配置或运行成功。
- **替代：扩展语言类型/返回值及框架编解码证明。** 需要新的 producer/Syntax/映射及配置证据；仅加返回类型仍不足。当前不推荐，不纳入本包；不是无限期豁免，后续按真实需求设计。

不把 null 当 absence；不以 Code/Source 节点冒充 SCHEMA；不改写当前 repo Contract；不造外部引用、不推导全局 Schema Registry。不包含 OpenAPI/JSON Schema 通用解析、结构子类型兼容、泛型/DTO/递归/$ref、HTTP 状态推断、Message/RPC 扩展、C/D 知识/文档产品、新依赖/阈值/profile、生产 CLI 或实际 Native。

这是受控私有输入格式，不宣称标准 OpenAPI 或完整 JSON Schema 支持。采用现有标准库 JSON.parse；所有层使用同一 IR 解码函数，固定同一解析语义，不自建第二套 JSON lexer。未知字段/版本和不支持的值严格拒绝，不自动降级为已证明。

## 3. 最小数据合同

### 3.1 Source 文档

文档正文为严格 JSON envelope：

    {schema:'codeatlas.declared-http-schema',version:1,bindings:[
      {contractFactKey:Text,
       query:{kind:'ABSENT'},request:{kind:'ABSENT'},
       response:{kind:'ABSENT'}|{kind:'JSON_STRING',mediaType:'application/json'}}
    ]}

Text 沿现有 Phase1ExactString。bindings 非空，同一文件重复 factKey 拒绝。同 repo 跨文件重复 attachment 也拒绝，不选第一个。QUERY/REQUEST 本包只支持显式 ABSENT；RESPONSE 支持 ABSENT 或 application/json 字符串。其他内容保持未支持，不扩大 schema 语言。此形状是本文拟批准的首个可交付子集，没有经验数值。

contractFactKey 必须在文档自身 repository 的当前完整 contractRefs 中唯一存在、protocol=HTTP，且该 Contract 的三项 schema refs 全为 null。它是明确实体绑定，不是按方法名/路径猜实现。已有非 null refs 不被声明覆盖；其旧匹配规则保持。Feign 接口声明和真实 proxy consumer 必须各有明确 attachment，不能只选能命中的一个。

### 3.2 绑定 Source 的正文证据

    SourceSchemaDocument = {sourceFile:SourceFile,sourceSupport:SupportRef,contentUtf8:string}

sourceSupport 为现有 RepoBasis + SOURCE_FILE id/revision；valueDigest 沿 codeatlas-phase1-support-value-v1 + NUL + canonicalRuntimeJson(sourceFile)。sourceFile 的 repo/revision 必须与该 repositoryBinding 对齐，角色为 OTHER/AUTHORED/TEXT、languageHint=null；contentUtf8 是非空原文 string，不能使用会 trim 的 Phase1ExactString；必须为良构 Unicode，UTF-8 字节 SHA256 与 sourceFile.contentFingerprint 精确相同。不得重写 EOL、加 BOM、trim 或凭解析后 JSON 摘要代替原 Source 指纹。

新 Store read/apply 必须与真实 snapshot.values 中 SOURCE_FILE 的**完整值与 support**精确匹配，不仅接受 caller 自报的 ref/digest。正文只来自调用方已获许可的 Source 输入，不新增 path/URL 字段或文件扫描/读取端口。API 不读取路径、不执行文档、不做网络解析。声明正文只在不可变 workspace 证据 payload 保存；不输出到日志，也不接收任意源代码片段。

### 3.3 FrozenContractSetV2

保留原 FrozenContractSet 的全部字段，增加必填：

    matchingPolicyVersion:'declared-http-schema-v1'
    schemaDocuments:SourceSchemaDocument[]

数组可空；空或缺少某方 attachment 不等于兼容。集合按 sourceSupport 的 basis/entity 键排序，同 Source 重复拒绝。contractRefs 仍是当前 repo Store 的**完整且逐值相同**合同集合，不用加 schema 的副本替换它。原 V1 parser/入口拒绝新增字段。

IR 新增 DeclaredHttpSchemaDocumentSchema、SourceSchemaDocumentSchema、FrozenContractSetV2Schema、decodeDeclaredHttpSchemaDocuments 和 parseFrozenContractSetV2。IR 只做严格结构、正文/Source 摘要与引用闭包，不做服务选择/合同匹配、不触碰 SQL 或文件。

解码输出为 {declarations:readonly DerivedHttpSchemaDeclaration[],consumed:{items:number,inputBytes:number}}；parseFrozenContractSetV2 返回 {set:FrozenContractSetV2,declarations,consumed}，只解码一次，把消费显式交给上层续接。每项声明包含当前 contractRef、query/request/response 值及 sourceSupport；它是可重建的内部投影，不新增 Canonical Schema 实体或 SupportRef entity kind。SourceSupport 直接进入实际使用它的 match.supportRefs/basisRefs。

## 4. 匹配、派生身份和版本

新增 matchContractsV2，返回 DeclaredContractMatchingCandidate=ContractMatchingCandidate & {consumed:{items:number,inputBytes:number}}；旧 matchContracts 不变。consumed 表示本调用实际准入/遍历消费，prepare 与 stitch 的新版本同样返回该两项；不把预算收据写入 Canonical 事实。服务身份、method/path、唯一性、六状态、Message/RPC 和已支持非空 schema refs 规则复用。新分支仅用于双方 HTTP 三 refs 均 null 的候选对：

|证据|结果|
|---|---|
|双方都有完整 attachment，三个 slot 逐值相同|schema 兼容已证明，可继续原唯一 provider 判断|
|双方完整，但 response 声明明确相反|该对显式冲突，沿原 CONFLICTED 聚合规则|
|任一方无 attachment|该对未证明，沿原 UNRESOLVED；不得推断 absence|
|双方对应 refs 按原规则均非空且一致|沿原 ref identity 证明，不借新文档覆盖|
|混合非空/null、不同 refs 或未支持的协议形状|沿原未证明/拒绝规则，不从声明跨模型补齐|

未知或不同 media/type 不静默等价；未知输入文档在解码准入时报错，不当作空文档。

匹配层仍只产出候选；只有现有 Application 授权 workflow/Store 可发布。ContractMatch 和 WorkspaceExecution envelope 仍 version=1，既有字段和六状态不变。使用声明证明的 MATCHED 增加理由 DECLARED_HTTP_SCHEMA_EXACT_V1，使用实际双方 Source supports，confidence 继续 contract-support-bound-v1 对有 confidence 输入取最小值；Source 无虚构分数，合并不加分，不引入新阈值。

新输入/候选身份必须区分新旧派生，不能让同 RevisionSet 的旧未解析结果被新 policy 悄然替代：

- workspaceRuntimeInputDigestV2 = H(workspace-runtime-input-v2, [workspaceId,revisionSetId,按 repo 排序的 repositoryBindings,catalogCoreDigest,matchingPolicyVersion,按 Source 键排序的 schemaDocuments])。H 沿原 domain+NUL+JSON.stringify(tuple)，schemaDocuments 各对象使用 canonicalRuntimeJson 生成稳定值；catalogCoreDigest 沿原定义，不含自身 workspaceBasis。
- V2 match.factKey 保持原逻辑 consumer 关系键；V2 match.id 使用 phase1-workspace-entity-v2 域 tuple=[workspaceId,revisionSetId,'CONTRACT_MATCH',factKey,inputDigest]。不覆写旧 match 内容，不混用新旧 id 域。
- workspace-runtime-candidate-v2 散列 canonicalRuntimeJson({frozen,matches,execution})；workspace-runtime-activation-v2 散列 canonicalRuntimeJson(identity)，identity 仍原五字段并绑定新 input/candidate digest。
- 原所有 V1 helper/tuple/字节保持。新 derivation 接口必须显式，不能默认切换生产路由。

Execution 新增 stitchWorkspaceExecutionV3：复用 V2 对 Syntax4/site-plan/真实 repo candidateDigest 的核验，将 frozen/match 的校验与重算替换为 V2 入口，并按后续明确批准的[执行适用性澄清](2026-11-03-phase1-contract-execution-applicability-clarification.md)处理完整current plan证明无调用点的声明；供入 matches 必须与重算精确相同，不接受 caller 自选 MATCHED。保留普通未知调用、事件语义和原跨仓方向。

## 5. Storage/Application/Runtime 连续接线

|责任|接口/行为|
|---|---|
|Storage|ContractStore.readWorkspaceInputsV2(frozen:FrozenContractSetV2,limits:HistoryReadLimits,maxInputBytes:number):WorkspacePreparationInputsV2；读取真实 repo snapshots/完整合同、认证文档 Source 值、冻结输入；不读 Source 路径|
|Application|deriveWorkspaceRuntimeV3(inputs:WorkspacePreparationInputsV2,control:DeclaredContractControl):WorkspaceRuntimeBatchV2；调用 matchContractsV2 和 stitchWorkspaceExecutionV3|
|Application|refreshWorkspaceRuntimeV2(request,ports)；先沿原 INDEX/workspace 授权，再 prepare/取消/COMPLETE 校验与 apply|
|Storage|applyWorkspaceBatchV2(batch:WorkspaceRuntimeBatchV2,limits:HistoryReadLimits,maxInputBytes:number)；复用原事务/CAS/roots/RevisionSet/last-good/unknown commit 路径，锁内再认证源 snapshots 和 Source 证据|
|Storage|traceWorkspaceRuntimeV2(limits)；严格读取新容器，返回 evidenceScope=EXPLICIT_DECLARED_HTTP_SCHEMA；只读恢复不重新读取文件或调用 derive|
|Runtime|composeMatchedWorkspaceRuntimeV2(input:{workspaceId,store,limits,frozen,maxInputBytes})；沿旧字段类型，frozen 为 FrozenContractSetV2、maxInputBytes 为显式正整数且不高于 limits.maxSerializedBytes；私有模块固定串联上述 API，不改 public bootstrap/DESCRIBE/CLI；Runtime 不直接 import IR|

WorkspaceRuntimeBatchV2 与旧 batch 字段相同，只将 frozen 替换为 FrozenContractSetV2；graphs 中的 repo candidate 保持 V2 Graph/Flow。WorkspacePreparationInputsV2 保持旧输入三个字段。ports 仅沿原 prepare/apply，不新增抽象服务或独立生命周期。

W005/W006 同样 CHECK(schema_version=1)，本包明确：SQL 外壳、子表 payload/envelope 均1，activation JSON 新格式严格为 {formatVersion:2,identity,expectedOldActivationId,frozen,matches,execution}。旧 JSON 不带 formatVersion 的原形状保持。未知/混格式拒绝；不接受 SQL2，不修改迁移、checksum、触发器、旧行或用户库。旧公开 trace 对新格式显式拒绝；Store 内部历史/freshness 恢复严格按格式分派，V2 trace 不吞旧格式。

schemaDocuments 原文、Source 元数据及支持由不可变 activation 归档；重开验证完整正文指纹、声明与输入/candidate/activation 摘要及现有子表一致性。首次 apply 必须已认证原 snapshot；历史查询不把后来当前 Source 冒充旧 Source。currentness 仍由完整 repositoryBinding 比较判定 CURRENT/AFFECTED，不承诺跨库原子时刻。

## 6. 同账本、预算与安全

DeclaredContractControl = RuntimeRequestControl & {maxInputBytes:number}，maxInputBytes 是调用方已有 EffectiveConfig 输入上限的续接值，无默认或新配置键/数值。多文档共享该输入余额，解析前累计核对原文字节；严格浅层 schema 后的实际声明、引用、索引和 match比较沿同请求 maxItems 记账，不给解码/匹配/stitch 各重置满额。沿原 deadline/signal 与 maxDepth；Source bytes 不是 maxEvents。

Store 使用原 HistoryReadBudget；原始输入、正文、解码后保留投影和实际 SQL 前付沿同实例累计计费，调用 IR 解码前检查可用 bytes，禁止以新的 budget 实例绕过已用额度。实现可为既有匹配/stitch 内核传递剩余 control，返回实际已消费单位；只在私有 V2/V3 链使用，不改变旧函数成功成本。不得为新增预算设计数值/profile。derive 以 consumed 扣减下一步传入的 items/inputBytes 余额，stitch 对其实际重算也收费；相同输入重复真实解析不能各获满额。Store read/apply 的显式 maxInputBytes 也必须在解码前核对，不得先解析再发现 Application cap 更小。trace 读取归档使用该次 HistoryReadBudget 的字节余量，无默认 Source 输入额度。具体私有函数体和局部变量由实施者决定，预算语义不由其临时另定。

这是逻辑准入，不是新物理内存保证。仍不授 A6/Native/collector/profile 资格。文档缺失或未证明维持 PARTIAL、不覆盖 last-good；无效正文/错 Source/超额失败不提交，事务失败保留原指针。未知提交沿只读结果判定，禁止再次 Apply。

没有新路径解引用、远程 $ref、LLM 或后门 SQL；Source/Code 自动事实与 MANUAL Knowledge/Wiki 边界保持。声明只证明已声明接口，不产 Capability/BusinessFlow 或自动知识发布。

## 7. Fixture、验证和可验收完成条件

沿 p1-contract-matching-v1 增补独立 declared-schema-inputs/expected 及 Java/Python 声明正文，不新增 Fixture ID/criticalFacts 分母或门槛。旧 matching-inputs/expected、无文档 J7/P5 拒绝、38份捕获字节保留。新 Source 文档先冻结，再运行产品；golden 不由 matcher/Store 输出生成。

最小行为证据：完整声明唯一匹配；缺一方/缺一 consumer 仍未知；显式 absence 不等于 null；response 相反冲突；多 provider 歧义；重复/跨 repo/未知 factKey/非空 ref 覆盖拒绝；Source正文、指纹或support替换拒绝；超累计 bytes/items 与取消不发布；旧入口拒绝新格式/旧六状态保持。分别由责任层覆盖一次，不复制全矩阵。

集成：独立 owned J7/P5 roots，现有 SourceFile/SourceState 正式入口将声明文档作为 OTHER 纳入完整 inventory。Java两consumer与Python provider均显式绑定，现有记录流仅按已接受 Stage 规则重绑定，执行种类明确 RECORDED_REPLAY + ACTUAL_OWNED_SOURCE_DOCUMENT + OWNED_SQLITE，而非新 Native/ACTUAL_PRODUCT。

通过固定 Runtime→Application→实际 Store，匹配两consumer、生成真实跨仓边、提交、只读重开；不能用 hand-written COMPLETE 替代。另让 SourceState 正式 CAS 改变声明文件，验证旧结果 AFFECTED、旧 frozen 拒绝和 last-good 保留。复用原 CAS/未知提交/旧Store门禁，不扩为所有故障注入排列。

八包旧构建中仅触及的 IR/Contracts/Execution/Storage/Application/Runtime 按依赖重建；开发责任测试，末尾原匹配/跨仓/发布与新文件去重一批、IR类型、架构17和具名格式。无全仓verify、Rust、Native、helpers/collector、校准、CI或Git写入。正常修复及必要局部复验在批准包内，不限定微小命令次数，不“重试到绿”。

## 8. 治理与退出

本包新增声明证据/身份/派生与workspace容器合同，必须在实施前集中批准本文及[四任务计划](../plans/2026-11-03-phase1-declared-http-schema-crossrepo.md)。这不是凭“继续”静默选定 FROZEN 含义。批准后一次同步 ADR020、CANONICAL_IR、EVALUATION/验收/追踪及原 A/B §8 的证据范围；保持原 null 未知规则，不改变已接受 matcher 结论。

本地退出 B_DECLARED_HTTP_SCHEMA_LOCAL_EXIT：上述正/反Fixture、授权、真实SQL发布/重开/变更和架构/文档均有证据；不能只靠代码或parser绿。它关闭“显式声明输入缺乏可认证 schema依据”的局部缺口；不宣称无文档 J7/P5 变为已解析，也不自动关闭原 E01/E02/E05/E06、A/B整包、A6或父任务。原4/21、17OPEN按原完整门禁逐项结算。显式文档是可选的受支持合同输入，并非宣布所有仓库都必须补写文档；没有文档或超出支持子集仍给出缺失诊断。

## 9. 作者审查与集中审批范围

作者已沿真实调用链核对：Store严格比较完整Contract且拒绝PARTIAL；Execution会重算matches，不能仅改Application传入结果；W005/W006版本列固定1；repo Runtime只能认证本repo Code/Source/Syntax，不能塞workspace假SCHEMA。推荐方案因此在workspace frozen层追加可认证Source正文，保留repo原值，显式新入口/摘要与SQL1/JSON2。

采用者需要接受的实质边界只有本文有限声明语义及新版派生/容器：它证明显式接口声明相容，不证明语言实现或实际HTTP行为。未做独立代理审查，遵守用户顺序约束。此轮未创建产品代码、Fixture或运行测试；原205/205仅为先前检查点，不能冒作新功能PASS。


## 2026-11-03 本地实施结算

T1–T4及执行适用性澄清均已批准并实施，达到B_DECLARED_HTTP_SCHEMA_LOCAL_EXIT。[准确根范围、Fixture、测试/构建/架构与作者评审](../plans/2026-11-03-phase1-declared-http-schema-crossrepo.md)。两个已声明consumer MATCHED、一个真实调用边、实际owned发布/只读重开与Source CAS后AFFECTED/last-good均通过；有调用site却缺boundary仍PARTIAL。旧无schema文档输入仍UNRESOLVED，旧V1/V2和原置信/SQL迁移保持。原“待批准/尚未实施/127范围不含T4”是历史；不据本地退出签收原整个Phase1/Evaluation或物理资格。
