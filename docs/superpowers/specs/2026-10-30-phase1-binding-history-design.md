# B-F1-C：版本化 Syntax 历史与本地原子发布

状态：用户已批准整包，已达到 B_F1C_VERSIONED_HISTORY_LOCAL_EXIT；实施与作者审查见[集中实施包](../plans/2026-10-30-phase1-binding-history.md#实施结果与作者审查--2026-10-30)。下文设计时态保留为审查输入，由实施记录限定当前状态。
前置：[B-F1-B库闭环](2026-10-30-phase1-binding-observation-design.md)及[实施证据](../plans/2026-10-30-phase1-binding-observation.md)。治理：ADR-020、IMPLEMENTATION_PROTOCOL 的收敛策略、R011/H1 和既有 Mixed Stage/Store 契约。

## 1. 实码发现与最小方案

- Providers 的 syntax-history-candidate.ts 在 pairInput、initial/origin/projection 摘要及重投影中固定 Syntax v1。
- Storage 的 activation-history-format.ts 在 validateSyntaxEnvelope/validateSyntaxPair 中固定 version=1 和三项 v1 摘要；activation-history.ts 使用它核验当前及祖先历史。
- Runtime mixed-analysis.ts 固定 v5 raw 组合、normalizeSyntaxObservation、version1 envelope；Stage 会重核原始 bytes、owner、Code 和 origin 闭包。只扩展 pair parser 无法完成发布。
- R011 SQL 只限制合法 JSON object、摘要、主外键和不可变触发器，没有 Syntax version 列或 version=1 的 SQL CHECK。故推荐不迁移、不建表；user_version 保持11，原SQL/manifest/hash不改。
- 原 Store 已在同一事务写 Code/Evidence、不可变 origin/projection/history/member，最后更新 active_history_pointer。复用该实现，不另建事务或发布服务。

备选：另建 v2 表会重复恢复/预算/外键逻辑，无结构依据；将 v2 投影为 v1 会丢字段与身份；两者均不采用。推荐在真实版本边界增加固定分派，共享现有组合核心和事务，保留旧入口。用户已要求减少非必要询问，本轮以此推荐形成完整设计与一份集中任务包，待一次具体批准，不逐文件征求选择。

## 2. 目标、出口与排除项

交付 B_F1C_VERSIONED_HISTORY_LOCAL_EXIT：完整声明式 v6 输入经现有受控 Source/capture、规则计算、Stage freeze、一次 lease、Store 事务和 H1 重开读取，保留完整 Syntax v2 与 lexicalScope/支持/身份；v1 历史仍可逐字验证、重投影，旧 v5 路径仍拒绝 v6。

不含 analyzer CLI/公开混合执行路由、DESCRIBE/真实资格或profile、采集器/helper/模型、Rust新运行、框架extract/路由语义、DB迁移/新依赖/新分数、云端CI或Git写入。现有 mixed-execution.ts 的 v2/v5 请求构造不改，应用入口不会因此启动 v6。

## 3. 版本和存储契约

三个版本各自独立：SQLite user_version=11；外层 history manifest.schemaVersion=1、origin body.schemaVersion=1（字段形状未变）；Syntax envelope.version 明确为1或2。禁止按字段“看起来像”判版本，未知版本拒绝，不先删字段、转换 bytes 或补默认。

origin body 仍精确包含 schemaVersion/providerSyntaxId/originSnapshot/sourceFile/unitId/envelope；元数据、member、projection 行结构不变。v2 必须携带已通过 parseSyntaxEvidenceV2 的完整 envelope；sourceFiles context 取该 origin 的 SourceFile 和实际 Code 值，不查询额外 fs、不补造 MODULE range。

| Syntax版本 | initial域 | origin域 | projection域 |
| --- | --- | --- | --- |
| 1 | codeatlas-syntax-initial-v1 | codeatlas-syntax-origin-v1 | codeatlas-syntax-projection-v1 |
| 2 | codeatlas-syntax-initial-v2 | codeatlas-syntax-origin-v2 | codeatlas-syntax-projection-v2 |

均沿现有 canonical JSON、SHA256、syntax:/syntax-origin: 前缀和完整输入构造；v1 原字节/ID/成本不改。v2 initial、syntax-key-v2、syntax-extraction-v2 继续使用B-F1-B已批准规则，不另选置信策略。v2 origin hash 包含完整上述 body；projection hash 输入仍为 {originId,payload:withoutId}，payload 含 lexicalScope，只有域由版本固定选择。

activation manifest 的字段/摘要域 codeatlas-activation-history-v1、source/originRegistry/Code身份规则保持；manifest 已包含 origin/member/合约及其摘要，无需增加冗余版本字段。新旧历史可在祖先链共存；原始 v1 不升级、不改写成 v2。Storage 的明确版本分派是本包新增的兼容合同，不把 SQL 能保存 JSON 当成当前已可使用。

## 4. 私有接口与职责

Providers（现有模块不经 public index export-star，实施时再核对）：
- syntax-history-candidate.ts 保持 createSyntaxHistoryPair / reprojectSyntaxHistoryPair / createSyntaxHistoryManifest 的旧 v1 入口；新增 createBindingSyntaxHistoryPair(input,composition)、reprojectBindingSyntaxHistoryPair(input,composition)、createVersionedSyntaxHistoryManifest(input,composition)。固定 v2 pair 与兼容 manifest 共用必要核心，无版本注册器。
- native-composition-input.ts 新增 readBindingCompositionInputsWithBudget；native-composition.ts 新增 composeBindingProjectionForHistory；固定调用已交付 v6 完整 reader，保留实际原始 request/output identity、metadata/Java owner/单 Native snapshot 关联。
- declared-delta-raw-observation.ts / declared-delta-raw-support-candidate.ts 增加固定 Binding 私有入口 prepareDeclaredBindingDeltaRawObservationWithBudget、composeDeclaredBindingDeltaRawSupportCandidateWithBudget、composeDeclaredBindingFullRawSupportCandidate。沿现有范围、删除投影、unitId、Code规范化、Evidence和同账本支撑；禁止复制整套 v5 pipeline。
- 旧 wrapper 保持固定 v5 / v1，不因新入口接受“1|2/5|6”而放宽旧API。内部原始流类型可明确区分；不能以类型断言掩盖旧入口运行时接纳新版本。

Storage：activation-history-format.ts 的独立信任边界按真实 envelope.version 选择严格 parser 和上述域，核验 immutable origin、祖先 basis、当前 support 值摘要和投影意义。Stage 仍检查真实 bytes/owner/预算/lease，明确对照合约与 wire 版本；Storage 不依赖 Providers 或 Runtime 类型/算法。Store 方法体与事务结构原则上不改，只因现有共享 validator 已认识 v2 即可沿用。

Runtime：mixed-analysis.ts 新增 createBindingMixedAnalysisRules(): MixedAnalysisRulesPort，返回仍是 prepareJavaOwner/validateObservation/compose 三个固定同步方法；mixed-analysis-validation.ts 使用对应 Binding 组合入口。共用旧规则核心，旧 createMixedAnalysisRules 固定旧模式。新工厂仅由本包本地组件显式调用，不连到 mixed-execution/公开index。端口自身不授予 Source、Store 或物理资格权限。

## 5. 合约身份、升级和完整性

Binding 私有模式的 native contracts 行固定：extractor=syntax-v1、normalizer=syntax-canonical-mapper-v2、contract=SYNTAX_BINDING_V2、policy=syntax-surface-support-v1。providerId 仍 native；Java Code v2、PYTHON_SYNTAX_CODE_V1 和已批准Syntax置信原值保持。新合约标签不是Native build资格。

保留现行 FRAMEWORK_SYNTAX_OBSERVATION_V1 coverage facet：它在本包仍表示原有 Syntax 表面观察完整性要求，不能据此推断 envelope 是 v1 或绑定语义已证明；版本由真实wire/envelope/上述合约明确绑定。不给 snapshot 增加虚构资格或额外能力广告，不改变原 unit/facet 精确集合。已核对2026-10-24-phase1-b1-composition-design.md §组合capability与2026-10-26-phase1-declared-raw-history-candidate-design.md：该项对应完整声明的语法观察及单位范围，不证明框架语义。本包不改完整性定义；新字段必须在实际v6严格parser中通过，不能仅凭旧facet通过。

沿用 history-transition 和 Stage 的 contractChanged→unitChanged：native合约升级要求全部仍存在的 Native units 重观察；源未改变也不能 NO_OP，不能携旧 Native v1 origin 偷换成 v2。可验证旧history存在时，既有 DELTA 可以承载这次完整Native重观察，不新增“版本变化一律FULL”门禁。OTHER Provider 不变时沿原依赖规则保留；变化仍 OTHER_PROVIDER_REVALIDATION_REQUIRED。history失效走已有 FULL 重建规则（transitions=null，可保留准确parent）；不自动重跑，不自行恢复历史。

FULL/DELTA 继续要求 raw.outcome=SUCCEEDED、syntaxOutcome=COMPLETE，Python Code=COMPLETE 或既有 NOT_APPLICABLE；FAILED/PARTIAL/缺终端整批不能发布。v2 normalizer 已获准的 UNKNOWN/固定置信分数不等于放宽此门禁。

特别事实：B-F1-B 的真实 python-direct / python-nested raw 均为 Syntax PARTIAL。调用结果 UNKNOWN 等在现有 producer 中会标限制；两条产物只能证明映射与拒绝，不能做成功原子发布样本。新包用独立、无缺失观察的声明式 COMPLETE 输入（如 import/简单字面赋值/函数声明）验证成功事务；真实产物只复用为 PARTIAL 拒绝控制。不改真实终端为COMPLETE，不将声明式正例称真实Native完整路径。覆盖语义调整为明确后继议题，本包不选择其结论。

## 6. retained、删除与恢复

- NEW v2：从获验 v6 raw 到选定 Code/Evidence→normalizeBindingSyntaxObservation→固定 v2 pair；Stage 重核原事件对应关系、数量、同一 snapshot 和已闭合支持，不能只凭 caller给出的v2 JSON落库。
- RETAINED：按 immutable origin 的真实版本重新验证原基准与原 Code；按当前 basis/完整 Code 值重新计算全部支持（含 lexicalScope）。保留原 syntaxKey/extractionVersion/payload/owner/lexicalScope/source/置信含义，仅按既有规则更新 supportRefs 和 projection ID。原 origin 字节/id不变，v1永不自动提升v2。
- scope Code消失、换文件、MODULE路径/指纹错配或置信支撑不满足时沿原拒绝/退休要求处理；不得同名猜配、把scope置null来凑通过、降低分数或额外启动分析。失败保留last-good。
- 删除单元/源文件按原 transition.syntaxRequirements 退休origin；数据库不可变旧行保留，仅新 activation membership改变。NO_OP不新建history/snapshot，也不写指针。
- FULL、DELTA、删除-only、空FULL、NO_OP、last-good和精确parent语义继续适用；同ID不同内容拒绝。

## 7. 原子性、预算与安全

沿用同实例capture、根/Source复核、DB ABA、TEMP seal、一次lease和锁内CAS。一次 Store.Apply 同时保存 Code/Evidence 与完整v2 origin/projection/history/member/active pointer；禁止分两次Apply、先存Code再补Syntax、直接SQL产品写入。事务前/中失败回滚，COMMIT结算/清理失败保持真实身份；未知提交只读判定，不自动重试。

复用五维累计预算、失败费用回报与清理预留；新增字段及版本化JSON副本/摘要/投影计入已有helper。内部已验值不逐层新增防御复制，不增加配置/阈值或内存测量假设。新失败返回沿既有错误边界，不能吞成缺历史、空Syntax或预算归零。Source和DB仅使用本包拥有的受控测试根；不触及R4 mutable DB。

## 8. Fixture/Evaluation追踪与最小验证

不新增Fixture ID：
- p1-syntax-contract-v1：binding-history 子目录，独立 v1/v2 pair与域/origin/projection oracle、错误版本、scope支持、meaning不可变控制。
- p1-r011-history-capture-v1（本轮已核对manifest ID）：binding-history 子目录，祖先混合版本、坏摘要/文件证明、未知版本、只读重开、旧v1字节控制。
- p1-mixed-analysis-store-v1：binding-history 子目录，完整v6声明式FULL/DELTA/升级/retained/删除/NO_OP/事务失败与last-good；新入口须覆盖Stage与真实SQLite Store。

逻辑expected和输入先于产品冻结；复用历史参考只指向原值，不重建整仓hash、不以产品生成expected。范围/验收与准确命令见[集中实施包](../plans/2026-10-30-phase1-binding-history.md)。旧原子事务、ABA、锁/未知提交的无变化实现复用原证据并说明适用性；只对新v2触发点增加事务失败/预算前缀控制，不机械复制旧故障矩阵。

本轮证据为只读代码/SQL/旧收据适用性核验，不运行新测试或数据库；437/14/18是上包历史结果，不能记成本包PASS。作者审查不冒称独立评审。实施批准后，统一修复原范围问题和匹配验证，无需逐任务再确认；真正新冲突/数值/依赖/真实运行/云端和Git写入仍集中确认。

## 9. 作者设计审查

已检查：SQL无版本CHECK而TS固定v1；仅扩parser会遗漏Runtime/Stage；旧规则已可处理合约变化，不需另设FULL保护；实际raw为PARTIAL与映射通过不等于发布通过；retained必须同时校验原/当前值，不能只对当前schema放行。推荐方案覆盖这些缺口，原budget、恢复、Quality Gate不减弱。

本包通过也不关闭四框架语义、生产Native资格、E01/E02或Phase1；父任务仍4/21。需要用户集中决定的是上述版本分派/新历史摘要域、精确Binding合约身份与仅限本地声明式原子发布范围。覆盖语义的后继选择不在此次批准中。
## 10. 任务—依据—Fixture—验收映射

|任务|设计依据|Fixture/证据|必须验收|
|---|---|---|---|
|C1|本设计§3/6；ADR-020与R011 immutable origin/projection；B-F1-B v2 identity|p1-syntax-contract-v1、p1-r011-history-capture-v1附加binding-history输入|v1原字节与域保持；v2三域/严格版本/完整支持；retained原意义不变；未知或缺支持拒绝|
|C2|§4/5/7；B-F1-B严格v6 reader；既有R0/R1范围与同账本合同|同一syntax-contract附加输入；B-F1-B r1两条实际raw（仅PARTIAL拒绝）|实际bytes/checksum、owner/Code/Evidence闭包；scope/删除一致；原COMPLETE和预算门禁保持|
|C3|§5–7；H1/既有Stage→Store和清理预留合同|p1-mixed-analysis-store-v1附加binding-history输入；H1重开读取|真实SQLite声明式FULL/DELTA/retained/删除/NO_OP；升级全Native观察；事务失败last-good；完整v2字段不丢失|
|C4|IMPLEMENTATION_PROTOCOL收敛策略；原Quality Gates/架构边界|现有manifest/registry、受影响旧测试与单一results|注册/架构/构建/格式与追踪；不降低既定门槛；不把空qualityGates当E01/E02验收|

尚缺且不在本包补造：真实COMPLETE v6生产输入/资格、CALL_RESULT UNKNOWN与观察完整性的治理结论、四框架语义Fixture/Evaluation及Phase1完整退出证据。上述缺口不能用本包声明式成功掩盖。
