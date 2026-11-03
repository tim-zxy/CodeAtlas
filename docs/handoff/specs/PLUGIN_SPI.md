## 获准 Context5/V5 固定续接与覆盖 — 2026-11-03

按[已批准 A/B 合同](../../superpowers/specs/2026-11-02-phase1-ab-local-closure-contract.md)实施：基础 Context5 不变，私有 extraction continuation 传递既定 syntaxMembershipDigest、positive detection 和累计 maxItems；runtime/binding 候选必须携带相同 site-plan。V5 descriptor 使用已有 FRAMEWORK_SYNTAX_OBSERVATION_V1 与 JAVA_CODE_V2/PYTHON_SYNTAX_CODE_V1，不伪造 SYMBOL 广告；内容仍由完整 Code/Syntax 支持闭包认证。旧 V4/selector 规则不变。

固定工厂按 site 留下未证明 Syntax 引用，Application 仅在另一固定规则已证明同 site 时合并覆盖，硬限制保留。Autowired 同一 site 的所有必需类型均须证明；任一缺失/歧义则该 site 未验证，不因其余参数已证明而 COMPLETE。[实现与正反证据](../../superpowers/reviews/2026-11-03-phase1-ab-local-implementation-review.md)。

## B5显式V4路由接线 — 2026-10-31

selectFrameworkPluginsV4消费原PluginRouteRequest字段，只在Spring/Mongo/Kafka/FastAPI固定工厂中按language/framework/全部required capability过滤；旧V1 selector严格拒绝新版descriptor的合同保持。当前V4 context仅接经SQLite认证的Syntax3，旧历史不做隐式升级。pluginV4CandidateUnits复用原已验证SPI单位定义，多路由从同一maxItems余额扣减；它仅计数，不替代原descriptor/context/support/ref认证。无新默认/阈值/配置键，未匹配或PARTIAL不授完整发布资格。

## V4工厂与严格候选 — 2026-10-31

[批准设计§3.1](../../superpowers/specs/2026-10-31-phase1-b-remaining-design.md)对应Context4/Syntax3与createSpringPluginV4/createMongoPluginV4/createKafkaPluginV4/createFastApiPluginV4。提取需当前positive detection和显式maxItems，Runtime/Binding候选保留coverage。Feign固定规则仅V4 continuation启用，旧private/API行为保持。

只声明已有SYMBOL能力，Syntax要求由版本/Context闭包核验；旧selector不接受新增描述符字段。完整Application/Runtime注册属于尚未完成B5；完整Depends/注入/handler、typed初始化与真实Source/Evaluation仍OPEN，见[实施评审](../../superpowers/reviews/2026-10-31-phase1-b-remaining-implementation-review.md)及[准确命令/唯一结果](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)。

## B-G1私有声明入口适配（2026-10-31）

用户批准[入口与局部执行链](../../superpowers/specs/2026-10-30-phase1-declared-execution-design.md)，compileFrameworkEntryCandidate在一次Context4校验后复用既有固定领域compiler。只由有效HTTP PROVIDER、MESSAGE CONSUMER和Scheduled JOB产生对应HTTP/REQUEST、MESSAGE/EVENT、SCHEDULE/JOB入口；producer/Mongo不造根。owner/合同/任务与当前支持精确一致，保留provenance，候选不授发布/部署资格。

新入口独立执行声明政策0.5/HEURISTIC已明确批准，旧B-F3 API/结果仍保持；新私有出口coverage用DECLARATION_ENTRIES_ONLY及实际限制。public index/descriptor/caps不变。Execution只消费IR/Code结构，不导入Plugin或框架类型；[本包Fixture及门禁](../../superpowers/reviews/2026-10-31-phase1-declared-execution-implementation-review.md)。

## B-F3私有Runtime领域候选（2026-10-30）

用户已批准[领域候选政策与合同](../../superpowers/specs/2026-10-30-phase1-runtime-semantic-candidate-design.md)，Q1–Q3达到有限本地Exit。compileFrameworkRuntimeCandidate只接受Context4及固定framework selector，验证后复用同一fixed extractor；无任意draft、policy callback或registry。输出RuntimeFactSet v1候选+PARTIAL coverage+有序provenance，只有合同/任务/资源；不生成虚拟入口/trigger/context/graph/flow。独立runtime-declaration-support-v1固定0.5/HEURISTIC是声明支持约定，不是实测概率；须实际使用Syntax原method及0.5、Code支持不少于0.5。

按ScopeTuple/语义tuple固定键与current Syntax支持完整闭包，归并不升分；DATA_OPERATION/DEPENDENCY不生成独立实体。复用MAX_PLUGIN_CONTEXT_FACTS做设计规定的累计输出单位上限，不更改旧SPI cap。候选深冻结并经现有Runtime parser；不认证Store、不授发布权限。public index/descriptor/capability/生产路由不变；[Fixture和实际门禁](../../superpowers/reviews/2026-10-30-phase1-runtime-semantic-candidate-implementation-review.md)。

## B-F2-C声明草稿有限交付 — 2026-10-30

共享Context4绑定与固定四框架规则已达有限本地Exit，98/98。用户批准[同根dotted-module澄清](../../superpowers/specs/2026-10-30-phase1-dotted-module-binding-clarification.md)：qualifiedName含点且boundName等于首段时返回UNPROVEN，不能从范围/同名猜alias模式；完整正绑定能力仍缺。草稿仍无Canonical分数/发布权，无公开SPI版本/router、IR/history/SQL变化。[实现与限制](../../superpowers/reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)。旧阻塞记录为历史，原完整Plugin目标不变。

## B-F2-C私有声明草稿组件（包Exit阻塞） — 2026-10-30

用户已批准Context4共享绑定及固定四规则；私有extractFrameworkDrafts只生成现有FrameworkDraft v1和固定诊断，无公开descriptor/router、Canonical发布或新版本/依赖/分数。[精确范围/实施评审](../../superpowers/reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)。名称遮蔽/效果/非精确引用失败关闭，Java注解须TYPE import及METHOD，路径不损失语义，输出草稿+诊断复用既有cap值。当前typed receiver仅支持UNRESOLVED-empty producer形状；其他未证。嵌套模块同根alias不能区分，原正例失败，[最小澄清](../../superpowers/specs/2026-10-30-phase1-dotted-module-binding-clarification.md)尚待批准；本包及完整Plugin/Phase1未验收。

## B-F2-B固定7/Syntax3管线有限本地交付 — 2026-10-30

用户已批准[完整后继设计](../../superpowers/specs/2026-10-30-phase1-binding-sufficiency-pipeline-design.md)及J1–J5。J1–J5现已达到B_F2B_BINDING_PIPELINE_LOCAL_EXIT；[范围、Fixture、失败与准确门禁](../../superpowers/reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)。新域/固定表面支持策略条件适用及持久集合闭包经本地验证；旧版/SQL11保持。库/声明式Store出口不授CLI/物理/语义发布资格，父任务/Phase1保持OPEN。

## B-F2-A精确合同有限本地交付 — 2026-10-30

用户已批准[wire7/Syntax3/context4与严格领域草稿合同](../../superpowers/specs/2026-10-30-phase1-binding-sufficiency-contract.md)及C1–C4本地实施；旧版本/历史保持，不授权producer/四规则/分数/发布或真实运行。已完成B_F2A_BINDING_CONTRACT_LOCAL_EXIT；[范围、Fixture、准确门禁与作者审查](../../superpowers/plans/2026-10-30-phase1-binding-sufficiency-contract.md#实施结果与作者整包审查--2026-10-30)。有限出口不关闭父任务4/21及Phase1。

## B-F1-B库级绑定观察已交付 — 2026-10-30

用户已批准S1–S4与MODULE兼容澄清；[实施结果/准确证据/作者审查](../../superpowers/plans/2026-10-30-phase1-binding-observation.md)为本次范围依据。固定Rust v6库AST→原始字节流→TS完整校验→Canonical v2/Evidence支持→Plugin V3两条实际桥已通过；MODULE null范围仅凭显式同basis文件/path/fingerprint证明，owner/scope均保持。原v4/v5/V1/V2严格行为及History/SQLite/生产边界不变。

最终组件437/437、Rust库14/14及protocol内存18/18、注册35/35、架构17项目、三包构建/IR类型和命名格式通过；只接受B_F1B_BINDING_OBSERVATION_LIBRARY_EXIT。作者审查不是独立评审；无CLI、独立harness/helper/collector、CI、Git写入或新数值/依赖。父任务仍4/21，完整History/框架语义/生产资格/E01/E02与Phase1 OPEN，A6 NOT_QUALIFIED及原风险保留。旧pending文字仅为历史快照，不能据本段替代逐项证据。

## 2026-10-22 accepted Phase1 first-batch authority

Accept explicitly selected Plugin V2 context/support for normalized SyntaxEvidence; retain V1 context and support validation unchanged. Implementing V2 belongs to P1-03, not this batch.

Authority: ADR-020 and the user confirmation; architecture acceptance is not implementation evidence.

# Framework Plugin SPI

## Responsibility

Plugins translate canonical language facts and framework artifacts into canonical runtime and contract semantics. Plugins do not parse source independently when facts are already available, write databases directly, or expose framework-specific types above the canonical layer.

```ts
interface FrameworkPlugin {
  describe(): PluginDescriptor;
  detect(input: DetectionContext): Promise<DetectionResult>;
  extract(input: SemanticExtractionContext): AsyncIterable<SemanticFact>;
}
```

Descriptors declare plugin/version, supported languages/frameworks, required provider capabilities, produced semantic capabilities, configuration schema, and trust class. Detection is side-effect free and evidence-backed.

## Phase 0 executable contract

`@codeatlas/plugins` exports strict descriptor, context, detection-result, extraction-context, and semantic-candidate schemas. A descriptor declares duplicate-free languages/frameworks/capabilities, a `{ schema, version }` configuration reference, and `BUILT_IN` trust. Context contains only canonical nodes/edges, source-file metadata, JSON-safe configuration, repository/revision IDs, and bounded arrays: at most 10,000 facts total and 10,000 source files. Cross-revision inputs are rejected; validated context values are deeply frozen before plugin invocation.

`validateDetectionResult` requires support references to facts in the supplied context when `matched` is true and no support when false. Extraction requires positive evidence-backed detection. `validateSemanticFact` requires a declared semantic capability, a versioned JSON-safe payload envelope, and unique canonical support references present in the context. These outputs remain candidates; Phase 1 canonical runtime/contract schemas validate their semantic payload before application publication.

`PluginRegistrationSchema` adds a safe-integer priority. `selectPluginCandidates` rejects duplicate IDs, filters by language, framework, and all required provider capabilities, then orders by descending priority and exact plugin ID. It performs no plugin execution or authority assignment.

## Initial mappings

- Spring: routes, entry points, scheduled jobs, dependency bindings, Feign/HTTP consumer contracts.
- Mongo: data resources, reads/writes, and data-change triggers.
- Kafka: producers, consumers, topics, message contracts, and event execution boundaries.
- FastAPI: routes, router prefixes, dependencies, and provider contracts.

All outputs reference input facts/artifacts. Unknown dynamic framework behavior remains partial/unresolved and contributes to coverage.

## Execution and security

Phase 1 ships trusted built-in plugins only. Plugins receive a bounded immutable context and typed configuration. They have no raw environment, shell, network, or arbitrary filesystem authority through the SPI. Third-party sandboxing is deferred to Phase 3.

## Tests

Each plugin provides detection-positive/negative, extraction, composition, ambiguity, coverage, and incremental invalidation fixtures. Cross-plugin composition must preserve execution contexts rather than flatten HTTP, event, task, and data-change boundaries.



## P1-03 local continuation — 2026-10-22

The user authorizes the next design/development step, P1-03, within ADR-020. The [Syntax/Plugin contract detail](../../superpowers/specs/2026-10-22-phase1-syntax-plugin-contracts.md) defines explicit v4 raw-byte validation and Plugin V2, retaining every old strict schema and evaluated capability advertisement. Contract fixtures do not qualify Native observation, a language grammar, a profile or actual framework behavior.

## B-F0 四框架依赖检测组件（2026-10-29）

用户批准并实施[纯检测合同与计划](../../superpowers/plans/2026-10-29-phase1-framework-detection.md#实施结果与作者审查2026-10-29)。私有detectFrameworkDependency复用V2，matched仅表示Canonical IMPORT中出现已批准框架namespace的声明证据；support仅为对应EDGE。未使用import仍可命中，不能由此认定annotation/receiver绑定或产生Runtime事实。未知/歧义输出未匹配及适用固定诊断；不创造confidence/阈值。Java已丢失wildcard成员信息，Python无import边不伪造支持。

SPI V1/V2 schema、公开index、fact/file caps和Application发布责任保持。当前没有完整框架factory/extract、Store写入或实际框架链；最新74/74包含37项新F0组件检查，E01/E02与主任务不关闭。

## 私有Plugin context3绑定输入合同（2026-10-30）

用户批准并交付[B-F1-A集中包](../../superpowers/plans/2026-10-29-phase1-binding-contract.md#实施结果与作者审查2026-10-30)。PluginV3ContextSchema/validatePluginV3Context明确contextVersion3及syntaxSchemaVersion2，scope仅取同一context.nodes，经IR v2验证；复用旧V2的Code/Source/支持闭包及10000 combined facts/files cap，返回完整不可变V3对象。V2不可执行新输入；public index不变。

isDirectAssignmentCall仅对已解析v2值检查同repo/revision/fingerprint/extractor、同scope与完整range相等，不推断运行结果、constructor或reaching definition。没有V3 descriptor/factory/extract/candidate发布实现；F0/E01/E02边界保持。

## 已批准声明接收者消费子集 — 2026-10-31

[精确消费合同](../../superpowers/specs/2026-10-31-phase1-declared-receiver-consumption-design.md)允许在Java接收者消费处证明同site TYPED_BINDING＋DIRECT_VALUE，仅两项、同完整Source/range/owner/scope且无条件，support保留两条；额外写入/遮蔽/不完整scope继续拒绝。简单QualifiedName参数列表可提取名义类型交原JAVA_TYPE/import/callee证明，原declaredType/UNKNOWN不变，不扩展通用import语法。既有SPI/身份/置信/发布不变；本地163项证据不能替代实际Source或框架验收。


## A/B本地闭环合同已批准 — 2026-11-02

用户明确批准[精确合同](../../superpowers/specs/2026-11-02-phase1-ab-local-closure-contract.md)及U0–U7整包，状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION；wire8/Syntax4/context5、最小语言表面证据、框架覆盖/site-plan、V2候选摘要/activation JSON及同lease联合提交按该合同执行。旧入口/历史/门禁不改，新增用途沿原规范0.5不代表概率校准。仅计划列明的本地库级运行/owned SQLite及范围内修复复验；生产CLI、profile、用户DB、云端CI/Git写入仍未授权。实施结果尚未验收，父项4/21、17OPEN不变。
