## B1-B2 first package local acceptance — 2026-10-25

User confirmation approved T1–T3. All three are locally accepted as LOCAL_DECLARED_DELTA_CANDIDATE_CONTRACT: compatible self-validating history pipeline exit, complete retained+fresh declared support candidate, every-original reference closure and existing selection, plus independent Fixture/registration/evidence. [Implementation author review](../reviews/2026-10-25-phase1-delta-support-candidate-implementation-review.md) records the exact contract and limitations. Earlier plan-pending/proposed wording below is historical.

Fresh evidence: Providers build exit0;30 named Node files810PASS/0FAIL/0SKIP/0TODO/0cancelled; architecture17PASS; registry52/exactPhase1 26/newID once/Runtime Syntax catalog0. Independent12-family35-case73-file Fixture froze before product;563 predecessor Fixture bytes remain protected. Evidence and exact commands: .superpowers/sdd/2026-10-25-phase1-delta-support-candidate/implementation-verification.json. Old public outputs/errors/digests/byte-item boundaries remain compatible; one cumulative logical budget continues through the candidate. This does not qualify heap/RSS/deadline or actual execution.

Only DECLARED_INPUT consistency is accepted. Raw bridge, authentic history/Source/run/provisional owner, final RepoBasis/Canonical Syntax, Stage/Store and B1-B2 overall remain OPEN, as do B1-C/D, P1-04/05 and Phase1 exits. R011 adds no physical schema; provider-independent IR/SQLite authoritative/LLM candidate-only/AUTO-MANUAL/ExecutionGraph→RuntimeFlow→BusinessFlow and Deferred boundaries are preserved. Next: separately design raw bridge with C capture/Stage boundaries.

No actual Native/helper/Rust/DB/R4/measurement/calibration/profile/numeric/dependency/cloud/stage/commit/push/cleanup/new worktree/session/subagent. C1EPERM OPEN; fourC2 lifetimes spent; historical timeoutUNKNOWN; main39708335128 cancellation unqueried; mutable R4 untouched. Scoped local gates do not replace unexecuted global gates. Original document bytes/EOL follow unchanged.

## Written direction accepted; concrete first-package plan pending — 2026-10-25

User “确认” accepts this written B1-B2 direction. The [concrete three-task plan](../plans/2026-10-25-phase1-delta-support-candidate.md) and [author plan review](../reviews/2026-10-25-phase1-delta-support-candidate-plan-review.md) are REVIEW_PENDING; T1..T3 NOT_STARTED. Earlier PROPOSED wording below is preserved history, superseded only for written-direction acceptance. Only the declared full support/Code candidate and compatible shared-budget private exit are in this first plan; raw bridge/C/D,DB/Native/profile/numbers/dependencies/CI are not authorized.

# Phase1 B1-B2：增量支持组装与完整候选设计

状态：**PROPOSED / DESIGN REVIEW ONLY，2026-10-25**。本轮“继续”推进后继设计，不授权产品编码、Fixture创建、构建/测试、Native/helper、数据库、数值/profile或云端操作。

依据：[B1-B历史支持设计](2026-10-24-phase1-history-support-design.md)、[B1-B1实施评审](../reviews/2026-10-24-phase1-history-transition-implementation-review.md)、[B1总体边界](2026-10-24-phase1-b1-composition-design.md)、[ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md)、[Provider SPI](../../handoff/specs/PROVIDER_SPI.md)、[Canonical IR](../../handoff/specs/CANONICAL_IR.md)、[Native IPC](../../handoff/specs/NATIVE_IPC.md)。

## 1. 目标与当前证据

目标：把B1-B1的“哪些支持应该保留/退休”推进为**完整的声明Code/support候选**：所有目标Source对应的有效支持、原候选、合并结果和引用闭包一致；保留多个历史origin，并且本次新Native观察仍最多一份。

启动核验2080/2080前序哈希匹配，当前563个覆盖Fixture路径（原468加B1-B1新95）保持原样。前次27文件662PASS/架构17/registry51-exact25/catalog0是历史证据，本轮不重跑。原C工作树/分支/HEAD不变，无.codegraph，不创建索引、会话、工作树或agent。

B1-B1只返回survivingFactKeys和生命周期决策，没有构造完整下一状态；当前引用闭包也不应从“这份决策通过”推导。B1-B2要补这个缺口，但完整候选仍不能证明声明历史来自真实SQLite或观察来自合格运行。

保留 provider-independent Canonical IR、SQLite authoritative、LLM candidate-only、AUTO/MANUAL 和 ExecutionGraph → RuntimeFlow → BusinessFlow。不引入Framework语义自动发布、持久AST/CFG、通用Python resolver或其他Deferred能力。

## 2. 实码与方案选择

| 实码                                                                                       | 事实                                                                                                           | 本设计使用方式                                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [history-transition.ts](../../../packages/providers/src/history-transition.ts)             | 内部prepare取得owned packet和budget，计算草案后只返回冻结结果；budget不随结果暴露                              | 复用所有差分/拒绝/生命周期规则，先补内部可组合的累计预算出口                       |
| [history-transition-input.ts](../../../packages/providers/src/history-transition-input.ts) | 原状态、R009 candidate、副本摘要、dependency units、coverage、current/history等关系严格校验；仍是声明          | 不把它的通过升格为真实历史资格；新组装入口自己加载/校验，不接收调用方的trusted结果 |
| [fact-merger-input.ts](../../../packages/providers/src/fact-merger-input.ts)               | 新MergeInput每Provider一snapshot；构建Evidence/binding/link；不用于把历史snapshots打包成新观察                 | 新支持仍由一份新Native observation构造；旧支持直接沿用逐origin验证后的原关系       |
| [fact-merger-selection.ts](../../../packages/providers/src/fact-merger-selection.ts)       | selectMergedFacts支持多个已构造support，保留min confidence/稳定选择/冲突语义；尾部检查最终selected edges的引用 | 复用选择；新增候选边界校验所有活动原candidate的引用，不能只看winner                |
| [staged-merger.ts](../../../packages/providers/src/staged-merger.ts)                       | finalizeStagedSupports展示独立support grouping复用方式，但依赖stage所有权/存储                                 | 第一包不用DB/stage；之后C/D可复用其模式，不能把纯结果传入旧Store                   |
| [native-composition.ts](../../../packages/providers/src/native-composition.ts)             | B1-A完整声明投影，包含raw v5与parsed Java，完整scope/owner/合并检查                                            | 保持不变；delta不能冒充完整target，不能放松该入口来复用                            |

已接受B1-B约束下，组装核心只有一条合适路径：**保留原支持 + 新观察构造的支持 → 原选择器 → 完整候选校验**。把历史snapshots重包装进同一MergeInput违反一Provider一新snapshot；以局部观察调用B1-A违反完整scope；复制一套selector会偏离置信度/冲突语义，因此均不采用。

本次推荐的实施边界是先完成这一核心的纯声明契约。raw delta adapter与真实捕获/准入仍必须完成，但它们依赖C的owner/stage契约，当前不能假定已成立。此分包是作者建议，待用户接受，不表示完整B1-B2已实现或退出。

## 3. 第一实施包：纯完整候选组装

### 3.1 输入及拥有权

概念入口：输入仍为现有HistoryTransitionPacket与显式HistoryTransitionLimits；具体函数名/文件与严格输出schema在方向接受后的writing-plans固定。

- 不接受调用方提供的草案、active support list、selected winner、合并图、computed digest或ready标记作为权威输入；入口自行owned-copy、验证并重算B1-B1决策。
- 不把同一Provider的历史snapshots当作第二份新观察；新observation仍只有一份成功Native声明，null只在B1-B1已允许的no-op/removal-only范围成立。
- 原始字节、Native executable、Source文本、SQLite connection、stage handle和回调不属于第一包输入；不会因输入里有requestIdentity/outputIdentity就假定真正执行过请求。
- 调用方可一致伪造history/current/候选/摘要；纯模块不能认证这种输入，输出永远保留DECLARED_INPUT含义，不返回authenticated/ready/applicable或真实history token。

### 3.2 必须先解决的预算组合缺口

B1-B1 public planHistoryTransition内部有自己的完整累计budget，只输出draft。如果新组装器另开预算、只计draft大小，输入验证/草案阶段的消耗就被漏记。仅把remaining限额传入旧入口也无法取得其实际已耗计数，不能诚实继续累计。

推荐最小私有调整：从现有实现提取一个**始终接收unknown并自行prepare的内部组合入口**，返回owned packet、已计算transition、原limits与同一个可继续使用的内部budget；旧planHistoryTransition只投影其中原draft字段。

- public函数签名、错误、字段、顺序、digest、原累计预算语义均保持；原Fixture95文件/46案例全部回归。新入口不接收caller prepared对象，不增加trusted overload。
- 新组装器调用内部入口一次，再用同一budget继续计支持构造、引用表、投影、编码和最终输出；不重新prepare两次，不给每阶段重新发满额度。
- budget仅在实现模块间传递，不暴露到最终candidate，不用作Storage ownership或身份凭据。
- 不新建通用pipeline/context框架、依赖包或计费profile。正safe integer的三个限额仍无默认；超限立即固定RESOURCE_LIMIT_EXCEEDED，不给出截断候选。
- 这是对既有私有实现的拟议重构，需要本设计接受和新旧Fixture证据；本轮没有修改该实现。

### 3.3 从草案构造有效support集合

1. 读取已验证旧HistorySupport原记录。对每个旧Evidence，草案恰有一个决定；RETAIN精确保留canonical原candidate、Evidence、binding、link、origin snapshot、valueDigest、dependency单位。SUPERSEDE/INVALIDATE不进入下一活动集合，仅留在转换ledger。
2. 新支持只能从本次一份Native MergeObservation调用原collectMergeSupports得到；dependencyUnitIds来自精确typed-ref映射，原candidate副本摘要沿B1-B1本地编码计算，所有派生值继续记同一预算。
3. 校验active typed(providerId,factType,providerFactId)、Evidence id及binding/link一一对应，无重复、多重origin或缺失。新旧同ref只能是已决定的SUPERSEDE，不能同时两份ACTIVE；同ref类型不同仍按现有typed身份处理。
4. actual构造出的Evidence IDs、保留/替换关系、surviving typed canonical references必须与重算草案逐项一致；不让草案字符串跳过实物检查。
5. valid foreign Provider支持完整保留；任何Source/契约依赖过期仍沿用OTHER_PROVIDER_REVALIDATION_REQUIRED。Native不能越权退休他人，不能先提交半张图。

原candidate可能不同于selected winner/confidence，必须两份都保留。退役只改变未来活动membership；纯函数不把旧Evidence原对象改成SUPERSEDED/INVALIDATED，更不写数据库。未来D在受控事务中应用这些生命周期决策。

### 3.4 目标Source、依赖和coverage

目标清单仍包含OTHER、零事实文件；分类、安全、跨revision/locator、path/id交叉复用和不支持语言的原拒绝均保留。

目标依赖单位从已验证输入和草案重建：未变单位保留原定义，重观察单位用精确新定义替换，已完全移除单位退出，新增单位必须是新身份。Python单位不能换Source ID；Java整组按设计替换成员，不能混成新小粒度增量算法。foreign单位无支持时仍不能擅自当作无依赖而丢掉其验证义务。

逐项核对：所有active support依赖存在且Source完整身份适用target；Native每个Python文件/Java整组的required facets恰好一份COMPLETE来源，零事实也需coverage；coverage unit/facet唯一，origin snapshot真实存在于声明registry、Provider和capability兼容，结果与草案coverageOrigins一致。不能把局部snapshot的capabilities复制成全仓完整性，也不能按节点数推覆盖。

退役旧candidate可以引用已不存在于target的旧Source，只保留在旧历史/退休依据中；进入active集合的每份candidate必须对target有效。无需给retired facts伪造新Source或重写旧Canonical ID。

### 3.5 全部原candidate与选择结果的引用闭包

先在完整active支持集合构造typed canonical节点集合，再检查**每份**活动原candidate：

- 每份node/edge的repo/revision与target相同，SourceRange存在时其Source id必须在target并属于该支持的完整依赖。无range的Python MODULE和Java package不得靠name/prefix反推依赖。
- 每份edge.source、RESOLVED target、UNRESOLVED candidates都必须是集合中存在的CODE_NODE。没有“该支持没胜出，就不用检查”的例外。
- 原IR/schema与FactKey/Canonical ID冲突约束不变；不删未知target、清空candidate、升级resolution或补伪节点来通过闭包。

再调用原selectMergedFacts，沿用SOURCE_BACKED/RESOLUTION_PRIORITY/STABLE_TIE_BREAK/min confidence及冲突/未解析语义。选择后对返回graph与support派生的Evidence/binding/link再检查集合一致、选中节点/边闭包和所有explanation指向实际支持。

这是新完整候选边界，不是认定旧selector实现有缺陷或修改其旧契约。如果旧声明存在未胜出但悬空的候选，新边界拒绝，保留last-good，不自动修复、丢支持或重建。此更严格候选要求必须有独立反例和前序兼容回归，不能暗中加到旧公共路径。

### 3.6 输出语义

拟议私有DTO由以下内容组成，最终字段/排序在实施计划精确固定：

- 固定“声明增量完整候选”kind，以及NO_OP/TRANSITION分类；完整targetSource/Source inventory，不带新codeActivationDigest。
- 重算transition ledger；完整active per-origin原candidate/support集合及dependency单位、coverageOrigins。
- existing MergedCanonicalAnalysis形状的selected graph、Evidence/link/binding/explanations；不新造Canonical核心模型。
- 独立命名的origin snapshot registry：保留声明历史registry并追加唯一的新snapshot（若有），不把registry当作本次observations或ACTIVE snapshot列表；其中历史未使用记录可保留其原出处，不伪造新采集时间。
- Syntax仍只有旧origin的REVALIDATE_FINAL_BASIS/RETIRE_ORIGIN义务，不返回已有效的新Canonical SyntaxEvidence。registry不使这些义务自动完成。
- provenance只绑定historyDigest、ledgerDigest和已有声明request/output identity，明确DECLARED_INPUT；candidate digest若需要只作本地一致性，不能替换Store basis或owner-map。

输出deep-frozen，owned输入隔离，排序与ordinal/Unicode规则沿用既有helper。NO_OP也重查完整candidate引用，不创建snapshot/新时间或宣布Knowledge freshness。完整空仓与仅删除允许形成空selected graph，但不代表真实删除资格或无需准入的Apply。

## 4. raw delta adapter与真实接入的后继合同

第一包不直接把声明observation连接到真实Native。完整B1-B2仍欠以下raw bridge（下称后继包，名称不是新路线图任务）：

- 全仓target inventory与本次观察清单明确分开。Python只观察changed文件；任一Java变化观察全目标Java组；完整Java v2清单与旧v3全量门禁保持；v5精确局部scope不冒充全仓。
- 对parsed Java保持PARSED_V2身份，不伪造raw checksum；v5用实际owned请求/输出bytes及原reader验证。成功/完整/未取消/未late settlement、时间、Source census与各facet检查一个都不能靠DECLARED_SUCCEEDED替代。
- normalizeNativeAnalysis/normalizePythonSourceObservation复用原实现，真实source-unit/owner映射来自raw observation明确sourceFileId与C的捕获/冻结依据，不能从null range、provider fact前缀或caller metadata猜。
- raw规范化结果须与最终交给本设计的normalized新observation逐值一致。retained支持来自C认证旧历史；foreign证明也来自受控流程，不能把普通caller JSON加hash认作来源。
- 初始无历史、纯删除空观察、旧/新owner、provisional stage identity、最终Code basis到Syntax当前投影的闭环，必须与C设计联审；没有充分owner/Source契约就停在纯候选边界。
- Source独立validated CAS保持；最终冻结/联合Apply只由C/D拥有，现有C3-A historicalSourceProof仍UNAVAILABLE。禁止更改旧handle状态、caller inTransaction=true、mutable R4回填或假ownership。

raw bridge不应等待D实际提交后才有输入，也不能用“先建final basis才观察、先观察才有final basis”形成循环：C先定义受控provisional owner/Stage及观察身份，B1-B2生成完整Code候选，C/D再验证最终basis上的Syntax投影和CAS。准确schema/读取与锁协议仍需C完整设计；本段不授权实施mapper或DDL。

## 5. 错误、安全与存储边界

B1-B1现有缺失/损坏/漂移/需全量/foreign重验证/资源错误语义保留。组装新增的错引用、FactKey冲突、member/coverage不一致应是显式私有候选拒绝；精确code在计划固定，不修改Native wire错误或IR枚举。选择器错误映射后不回显inputPath、payload、Source文本、SQL或环境。

首个可执行包不增加Store、schema/migration、Stage或Runtime调用点；不把DTO直接接入旧applyFull/applyPatch。R011仍是未发布逻辑reservation，物理SQL/manifest/pointer/备份/回滚由C设计；不改R001..R010、不引入R014或R012/13依赖。没有跨仓真相库、向量权威、LLM或Wiki写入。

maxSerializedBytes/maxItems/maxDepth继续是明确caller限额和逻辑累计，不是heap/RSS/截止时间或性能资格。共享预算、bounded helper、错误固定化、owned buffer规则不得因Ponytail而省略。实际native准入和资源profile仍未执行、未授权；不引入新默认数值或校准。

任何全量重建/重验证都是返回的要求，不自动运行或删除last-good。任一错误返回无候选；纯组装没有DB副作用，因此不能把它的原子返回测试算成数据库回滚/恢复测试。

## 6. 任务依赖与追踪

这是方向接受后供writing-plans使用的任务图，尚不是可执行计划。

| 单元                              | 依赖与推荐顺序                                        | 可验证完成条件                                                                                         | 依据 / Fixture / Gate                                            |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 组合预算与旧入口兼容              | 第一项；先独立编写/冻结语料，再做API/behavior RED     | 旧B1-B1所有字段、拒绝、digest和既有边界不变；新入口每次自行校验；跨阶段累计边界/一字节或一item不足拒绝 | §3.2；D01/D11/D12；旧95文件、原46案例和现有范围回归/architecture |
| active支持/目标依赖及coverage组装 | 用上项owned pipeline；不可并发改同一核心              | 原支持与新支持实物和草案一致；origin不改标；单位/coverage不重复或丢零事实文件；foreign过期整体拒绝     | §3.3/3.4；D02..D07；原IR/Evidence/Provider契约/Fixture           |
| 原candidate闭包与原selector复用   | 依赖完整active集合                                    | 所有候选与最终selected引用有效；冲突、confidence、resolution/tie-break与旧选择规则一致；错误无部分结果 | §3.5；D03/D06/D08/D09；FactMerger/Canonical/闭包检查             |
| 根注册、回归、文档/作者评审       | 上述全部完成后范围验证                                | 新Fixture一次发现、root精确注册、旧字节保留、完整新旧scope测试/架构/format/trace/status证据            | §7；D01..D12；原27文件662案例是历史基线，未来实际总数按运行报告  |
| raw bridge与C联审                 | 需C明确捕获/owner/Stage身份；是后继合同，不插入第一包 | 真实raw/normalized严格一致、局部scope与全仓分离、真实settlement与retained来源可验证                    | §4；真实Fixture/owner/准入/资源/恢复证据目前缺失；不得记PASS     |

前四项有顺序依赖、共享草案/预算/语料，不应安排并发实现。raw bridge可先补设计，但其真实执行、C的DB/Stage、D的Apply都不由本设计方向自动授权。

## 7. 独立Fixture与风险分层验证

拟新增独立候选Fixture（最终id/目录/字面API/命令在计划固定），保留现有563个covered Fixture路径及全部历史失败/旧freeze。本轮只列义务，不创建语料。预期需独立手写并先冻结；不得由新组装器或选择器生成goldens。

| 组                 | 最低语义覆盖                                                                                           | 验收方式                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| D01 基础           | NO_OP、完整空仓、零事实、仅删除没有新snapshot、初始无历史/遗留Code                                     | 全字段字面candidate或固定拒绝；不造新时间/basis                             |
| D02 scope          | Python-only保留完整Java/其他Python；Java全组变化保留Python；同时变化；新增/移除组成员                  | 完整Source/单位/coverage/support/merged对照，保持B1-A full-only             |
| D03 origin/选择    | 同FactKey多Provider、不同confidence、原candidate不同于winner、稳定tie-break；Native退出但foreign仍有效 | 原candidate、Evidence/links、旧时间/快照和selected/explanation分别精确断言  |
| D04 revalidation   | foreign依赖变/删/未知/contract变；typed ref多ACTIVE；输入current/history漂移                           | 拒绝整个候选，无偷偷退休、降置信或自动重建                                  |
| D05 units/coverage | Python单位ID错绑、Java range-less容器、零事实facet遗漏/重复、错origin capability                       | 精确拒绝，不按node/event计数推完整性                                        |
| D06 Source引用     | retired旧Source缺target可仅作退休依据；active原candidate的Source缺失/依赖不符，即使非winner            | 删除后保留/退休对照，不伪造Source记录或范围                                 |
| D07 ledger实物     | 草案Evidence/active refs与实际支持不一致、同typed ref错误RETAIN+new、origin registry重复               | 自行重算并拒绝，调用方不能传自称trusted草案                                 |
| D08 全候选闭包     | selected边正常，但另一未胜出的UNRESOLVED候选引用不存在node；普通source/resolved target缺失             | 所有active candidate逐项拒绝；不清空candidate或补节点                       |
| D09 原合并语义     | 合法UNRESOLVED/AMBIGUOUS保留；FactKey/ID/identity冲突；最小confidence与稳定排序                        | 独立literal expected与旧FactMerger回归，非只比node数                        |
| D10 ownership      | getter/proxy/环/Unicode/非plain数据，caller修改/私有计数器伪造，所谓成功/late声明                      | 入口拒绝或只给声明候选；无回调/真实运行资格，无数据回显                     |
| D11 预算           | 输入验证+草案+完整support+selected+输出累计；每阶段临界/不足/溢出/深度，阶段间不能重发满额度           | 从实际逻辑消耗推边界，不增加profile数值；所有原边界兼容                     |
| D12 兼容/架构      | 原B1-B1 public输出/错误/95字节/46字面案例；B1-A/normalizer/merger/IR/wire/Storage/index保持            | 当前匹配的本地范围回归、架构guard、root注册、链接/格式/哈希及CURRENT_STATUS |

风险分层：先运行纯输入/预算/组装/闭包小测试；再运行独立新Fixture和B1-B1原字面/预算/拒绝回归；最后跑审阅后计划固定的旧27文件cohort加新测试、Providers范围build、架构与文档校验。无需重跑完整Phase0.5回归/校准，不运行Rust、实际Native/DB/资源采集或云端CI。新增实际运行需求必须另报准确范围并获确认。

D10中一致伪造数据仍可能产生结构一致的声明candidate；测试必须断言它不含authority字段，不能期待纯schema识别真实/伪造历史。真正Source/DB/settlement真实性测试只属于C/真实run，不把无法证明的性质写成PASS。

## 8. Exit、治理与本次集中决策

本次设计Exit：完整候选语义、实码复用、预算组合缺口、独立Fixture、任务依赖和真实性/Raw/Store缺失项可评审；不是实现验收。

第一包未来Exit：声明candidate全字段/支持/引用/coverage一致，独立语料、旧接口兼容、错误/逻辑预算、架构/注册/文档与新鲜可重现证据全部齐备；接受标签仅LOCAL_DECLARED_DELTA_CANDIDATE_CONTRACT。完整B1-B2仍需要raw bridge与合格观察/历史来源，B1-C/D/原P1-04/05/Phase1仍OPEN。

这是ADR-020下的私有组装细化提案。若接受，需同步Provider SPI、Canonical原candidate与winner/引用约束、Evaluation/Security、WBS/acceptance/trace/status，以及B1-B上位设计的第一包边界。SQLite reservation/Source CAS/Native原协议不改；若后续raw/Stage发现FROZEN冲突，停相关工作并另行DCP，不把本提案当作破坏式接口批准。

**请求接受的方向：先实现声明完整候选组装；共用B1-B1累计预算，保留其旧接口；旧/新原支持复用现有选择器，并验证全部活动candidate引用和完整coverage；raw delta bridge与C真实捕获/冻结继续单独联审。** 接受本书面设计后才编写具体实施计划，计划整包再确认后才编码。本轮不批准任何产品或Fixture、Native/DB、profile/数值/依赖/CI。

C1真实文件symlink EPERM仍OPEN；四C2生命周期已用完；历史Native timeout UNKNOWN；main39708335128取消结算未重查；mutable R4未碰。没有stage/commit/push/cleanup，不修改D main旧状态。前序662测试结果仍标历史，本轮只有文档与核验。
