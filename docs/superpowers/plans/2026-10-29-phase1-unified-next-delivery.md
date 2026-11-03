## B-F0已交付；B-F1绑定契约集中治理 — 2026-10-29

[F0结果](2026-10-29-phase1-framework-detection.md#实施结果与作者审查2026-10-29)已获批完成：Plugin74/74、registry35/35、架构17及构建/格式通过，仅依赖检测。当前下一设计为[B-F1绑定修订](../specs/2026-10-29-phase1-framework-binding-contract-proposal.md)：源码/旧Fixture证明赋值调用关系、词法scope和typed binding表达不足。推荐先补最小语言中立证据，旧严格版本与UNKNOWN保留；不直接写四个基于名称猜测的extract factory。

当前DESIGN_REVIEW_READY，新增绑定/版本方向须集中确认；不授权未具体化的producer/history/Plugin实现。无新测试/实际运行，A6及Phase1状态保持。下方F0待审为历史。

## 当前转入B批独立设计 — 2026-10-29

[A6身份诊断续接](2026-10-29-phase1-process-acquisition-identity-diagnostic.md#实施结果与作者审查2026-10-29)已获批并执行：新Prepare1成功，D01一次拒绝本次conhost路径，无重试；当前imagePath修订已编译观测到，旧G01未知身份仍不回填。A6继续NOT_QUALIFIED。下方“修订未编译”是已被后继收据替代的历史。

现在以[B批实际缺口与F0设计](../specs/2026-10-29-phase1-framework-detection-design.md)、[集中实施包](2026-10-29-phase1-framework-detection.md)顺序推进。四框架检测一次实施审查，非四次审批；语义抽取/Store/实际路径不由依赖检测推导完成。当前仅设计，无新增运行或产品编码。

## A6已执行，平台未获资格 — 2026-10-29

用户批准整包后已执行一次Prepare（编译及x64布局通过）和一次G01。G01返回UNEXPECTED_PROCESS，资格失败，按批准规则停止：G02/G03未执行、无重试/第二次编译。两份OS记录中1个确认冻结Node映像、另1个身份未明；两者退出/duplicate释放及collector退出已确认，目标最终峰值均缺失。状态 **A6_PLATFORM_NOT_QUALIFIED**；[A6实施记录](2026-10-29-phase1-process-acquisition-conformance.md#实施记录与作者评审2026-10-29)；[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-process-acquisition-conformance/results.json)。

诊断缺口imagePath已在当前源码/离线validator与人工Fixture中修正，17/17通过；当前C#修订未重编译/实测，原冻结源码/DLL/失败保留，不把新源码套到旧收据。Fixture注册35/35、架构17及范围格式通过；A5原结果按适用性复用。无实际Git/Native/全A5、profile/新依赖、CI或Git写入；原风险和父任务4/21保持。若继续真实探针，须新的准确一次性编译/运行批准，不自动利用未执行slot；也可顺序准备B/C独立设计。下方待批准文字为已被明确批准/本结果替代的历史。

## 当前下一包：A6进程采集可行性集中审查 — 2026-10-29

A5本地交付有效，不重复组件。已准备[A6设计](../specs/2026-10-29-phase1-process-acquisition-conformance-design.md)与[完整任务/固定helper清单](2026-10-29-phase1-process-acquisition-conformance.md)，待一次整体批准。建议只做Windows debug-created HANDLE短命后代/取消/最终查询故障可行性；最多5个新Node、3Collect、1Prepare，原C2不复用。可只批准离线；尚未实施/编译/运行。

完整Git/Native/全A5、purpose/accounting/profile/非debug适用性与云端/Git写入仍OPEN且未授权。失败停，不重试/扩大；缺实际SHA或工具改变不启动。拒绝或失败可顺序转B/C独立设计。作者审查见[本包评审](../reviews/2026-10-29-phase1-process-acquisition-design-review.md)。

## A5固定混合执行链本地交付完成 — 2026-10-29

获批T1–T4已完成，A5_FIXED_EXECUTION_LOCAL_EXIT：[A5实施结果与作者审查](2026-10-29-phase1-mixed-execution-closure.md#实施结果与作者审查2026-10-29)；[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-execution/results.json)。显式Native配置v2、Stage内NO_OP、既有空FULL、固定私有Source→v2/v5→Stage→Store及真实本地结算已接入。最终271 PASS/1原C1 TODO，注册35/35，Storage/Runtime构建、17项目架构及范围格式通过。原Stage/Store方法体、公开路由、IR/wire/SQL schema与原Fixture参考保持。

完整物理资格/采集/profile与公开混合路由仍NOT_READY；qualificationRef仅candidate引用，无真实Git/Native/helper/collector、数值/依赖、CI或Git写入。父任务4/21、P1-04/05/Phase1及原风险保持OPEN。下方设计待审/未实施文字为历史快照，由本补记限定范围替代。

## A-runtime 本地实施更新；protocol 最终门禁 OPEN — 2026-10-29

用户已明确批准 D1–D4/T1–T6 本会话顺序实施。Source受控核验、Stage累计账本、v5分发代码/原始流和私有进程屏障已实现；当前 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**，不是全包验收通过。最新本地组件107 PASS/1 TODO、注册360/360、纯IPC176/176、Stage333/333、Rust指定库29/29、架构17项目、构建/类型/精确格式通过。文件symlink因EPERM为TODO/C1 OPEN。

Rust protocol内部测试最终复验在link.exe LNK1104失败，未执行；一次独立构建目录对照在依赖链接LNK1105/1224失败。准确根因UNKNOWN，不自动重试、不称已修复/flaky；旧T4的18项GREEN不冒称最终门禁。详见[作者实施评审](../reviews/2026-10-29-phase1-runtime-local-readiness-review.md)，准确证据根 `.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。未新增独立评审。

实施细节以评审及实际源码为准：native-client私有aliases是default对象成员，避免既有export-star将named aliases公开；lifecycle类型模块内，public index/options保持。私有raw consumer可接既有caller limits；Source parsed副本解析前预付；Stage account拒绝ambient事务。这些是获准私有边界的缺陷修正，不增加公开契约或数值。实际protocol筛选为`protocol::`（包含新增mixed_v5_tests），旧计划`protocol::tests`仅能选旧模块；Source旧控制的准确命令见attempt3 receipt。

无真实Native、额外acquisition helper/collector/model、新目的schema/profile值/依赖、云端CI或Git写入。既有G13 Node模块隔离进程如实记录。全Source选择/Python扫描、实际归因/运行资源与H5仍OPEN，主任务4/21接受、17未关闭；空catalog继续拒绝。历史timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。原前任10315摘要未覆盖Source，本包单独保留Source原字节并补入继任封存；不声称原摘要覆盖整仓。下方旧“未实施/REVIEW_PENDING”保留为历史，由本补记限定范围替代。

## 统一编排已批准；A-runtime新增边界集中评审 — 2026-10-29

用户明确“批准实施”已呈现的统一推进计划。已直接完成实码核验与[A-runtime Source/账本/v5附约](../specs/2026-10-29-phase1-runtime-boundaries-design.md)、[T1–T6精确本地任务包](../plans/2026-10-29-phase1-runtime-local-readiness.md)及作者自审。新增D1–D4（Source私有核验/Stage收费、v5分发/原始流、进程输入屏障、对应本地验证）集中REVIEW_PENDING，不是已接受契约。未把先前仅库级v5或观察profile扩为真实Native/完整混合流程资格。

本轮无产品编码、Fixture/注册/构建/测试/Native/helper/collector/model/云端/Git写入；新包接受后同范围顺序连续实施，不逐微步骤审批。完整Source/Python扫描/选择范围新鲜与实际进程/资源目的仍需具体证据，H5/P1-04/05/Phase1 OPEN，主任务4/21接受、17未关闭。原A-local109绑定保持；timeout UNKNOWN、C1EPERM/C2spent/main取消未查/R4限制不变。旧文档原字节完整作为后缀保留。

# Phase1 后续统一推进计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this same session, sequentially. Steps use checkbox syntax. 不新增代理、会话、工作树，不自动提交。

**Goal:** 将剩余17个主任务按依赖合并推进，取消重复的方向确认、任务细化确认和微步骤确认，同时保留真实设计与运行门禁。

**Architecture:** 复用已退出的 A-local；先完成 A-runtime 真实输入与运行资格，再交付框架/流程、知识发布、查询投影、集成验收。本文是执行编排与审批规则，不是尚未定案的生产接口或实际运行授权。

**Tech Stack:** 现有 TypeScript/Node、Rust/Tree-sitter、SQLite、现有测试与 Evaluation 工具。无新增依赖或数值。

**Spec:** [本轮实码缺口审查](../specs/2026-10-29-phase1-runtime-readiness-gap-review.md)、ADR-020、现行 handoff/specs，以及既有 2026-10-22 foundation-and-runtime / knowledge-and-delivery 任务包的未被后续修订替代部分。

## Global Constraints

- 实际交付工作树为 C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas。D:/workspace/CodeAtlas 是旧状态的独立目录，本轮不迁移或覆盖它。
- Canonical IR provider-independent；SQLite authoritative；LLM candidate-only；AUTO事实/MANUAL语义；ExecutionGraph → RuntimeFlow → BusinessFlow。
- 保留已有脏文件、换行、历史失败、Fixture根与所有 .superpowers。禁止 reset/stash/批量stage、R4恢复或ownership伪造。
- 新 FROZEN 冲突须治理批准；EVOLVABLE须Fixture/Evaluation依据；DEFERRED不提前。
- 真实 Native/helper/collector/模型、校准/profile及新数值、新依赖、云端CI、Git写入均不从本计划推导授权。已有C2四个slot不复用；C1真实symlink权限缺口不记通过。
- 所有新资格依赖准确代码/输入/环境身份；旧Java/v3 profile不替代混合Syntax资格；catalog缺失继续启动前拒绝。
- 不重跑已完成完整回归；发生相关代码变化才跑匹配验证，候选封板集中顺序验证。失败诊断后决定后续，不重试到绿。

## Review Focus

1. 将109项本地绑定误当真实Native或全Phase1验收：A与E分别提供组件/实际路径适用性，父任务不提前关闭。
2. 旧计划R011/接口已被后续附约改变：各批次开始做权威差异表，旧计划只取仍有效部分，不重建已完成H1..H4。
3. Source在观察与提交之间变化，或取消后晚到成功：A先设计全链身份/重新核验和失败结算，保留last-good与真实提交身份。
4. 任意qualificationRef、helper峰值或逻辑字节被当作运行资格：A要求实际进程身份、测量方法/完整生命周期、资源与取消实证。
5. 查询或Wiki触发语义写入：C/D/E检验MANUAL发布、published-only、LOCKED、无隐式update。

## 当前基线

2026-10-29 A-local为 A_LOCAL_DECLARED_COMPONENT_EXIT_ACCEPTED。既有独立评审四项已修复；最终Code75、Syntax59、Stage333、Store288、旧兼容1270均通过，重叠不累计。109项原显式Node/SQLite绑定接受，整体Fixture/真实Native/P1-04/05未关闭。主任务接受4/21，未关闭17；这是主任务计数，不是工时百分比。

原封存：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/independent-review-closure-verification.json。本轮先校验原封存，不重跑该套测试。历史timeout仍UNKNOWN，main取消结算未重查，R4 mutable/C2 spent限制保留。

## 统一执行与集中审批

1. 同一已批准包内：Fixture、TDD、产品实现、必要修复、适用回归、架构检查、追踪文档和作者评审连续执行，不逐文件/测试/微步骤提问。已有执行方式不再询问。
2. 后续新批次先直接完成实码核验、设计、精确任务/Fixture/验证清单与作者审查；若需要新增契约批准，将它们合成**一个可评审的实施包**。不再分别请求“方向→细化→任务包”三次确认。
3. 现有批准已覆盖且没有新设计问题的工作直接处理。本文不自动批准未来未写出的接口、数值或任务。
4. 发现审批事项先集中列明依据、推荐选择、受影响文件/门禁、回退和授权边界；只暂停相关依赖链，继续不依赖该决定的准备工作。
5. 新依赖/破坏性操作/真实运行必须具体可审阅。数值须测量后才能审批，不能预批未知值。CI到集成候选再列准确commit、目的、次数、jobs与本地替代，一次申请；push/PR/merge等仍受同一云端写入约束。
6. 不自动新增评审代理。作者自审不冒称独立评审；若后续确需新独立评审，将范围与相应实施包一并提出。

## 五批交付与17项覆盖

| 批次 | 主任务 | 顺序交付 | 完成条件与审批组织 |
| --- | --- | --- | --- |
| A-runtime | P1-04/05（2） | 实际Source与完整请求/owner/history续接；资源/取消；实际采集路径；资格、profile与真实集成 | A-local复用不重做；先合并本地详细设计/任务包；实际运行和事后具体值另有准确操作清单 |
| B 框架与流程 | P1-06..09（4） | Spring/Mongo/Kafka→FastAPI→ExecutionGraph/RuntimeFlow→合同与基础跨仓 | 四Plugin可各自纯测试，仍顺序执行；实际链依赖A；同批设计/Fixture/Store/迁移/验证一并审查 |
| C 知识发布 | P1-10..14（5） | Markdown/ADR与Claim→四SemanticTask→不可变输入→稳定身份/Reconciliation→三工作流MANUAL原子发布 | 文档纯解析可提前；持久化遵守迁移前序；实际模型/远端及依赖不隐式授权 |
| D 查询交付 | P1-15..19（5） | published查询/FTS5→标准Wiki/Markdown→六Agent工具/L0-L2→MCP生命周期→安装CLI | 读取真实已发布知识；FTS可重建；Wiki不自行LLM补写；stdio/安装检查按准确操作范围执行 |
| E 集成验收 | P1-20（1） | 两个实际E2E、完整义务/已批准基线、恢复/安全/架构/安装和最终集成 | A–D资格齐全；缺失/取消/N/A分开；本地封板后才申请必要的一次云端批次，不自动发布 |

调度不是把所有后续工作一律阻塞：B的独立语义规则与C的文档解析可在其具体包成熟且批准后提前顺序进行；其成功不替代A实际链或父任务验收。默认优先A，避免先扩散多个尚未闭环子系统。当前不新增并发任务。

## 首批可立即执行的设计准备 A0（本轮执行，不含产品编码）

**Files:** 本计划；本轮实码缺口审查；本轮作者评审；CURRENT_STATUS及既有合并执行计划的最新补记；独立design证据目录。
**Interfaces:** 只消费既有封存、源码、任务和规范；产出文档、路径/摘要清单和NOT_READY缺口。不生成owner/lease/run/profile token，不改产品API。

- [x] 核对实际工作树与A-local当前范围，区分旧D目录与C交付目录。
- [x] 读取现行任务/原计划和关键源码，记录真实Source、process采集、profile与后续模块缺口。
- [x] 形成五批任务覆盖、依赖、局部可独立工作、一次整包审查规则。
- [x] 作者检查审批边界与旧版本冲突；保留原文件字节与独立继任证据，不重跑测试。
- [ ] 下一交付：将下列A1具体设计、Fixture与实施任务一次完成后集中审查；不再先问是否允许设计或细化。

## A1 合并详细设计包的交付清单

这些是设计的可验证输出，不是已批准产品接口：

- [ ] 以现有MixedAnalysisStage/capture、Runtime规则和Source安全读取为准，画出Source捕获→owner→实际观察→raw→候选→lease→Store的调用链，逐边说明谁拥有对象、谁重查何种身份；明确FULL/DELTA/删除/OTHER-only/NO_OP及旧full回退。
- [ ] 给出Source重验证的精确私有接口、字段/摘要/预算/取消时序与文件修改表；说明SQLite snapshot和文件系统不能假装跨资源原子事务。错误不冒充回滚，COMMIT后失败保持真实身份。
- [ ] 给出实际Native transport与采集方案的推荐/替代、进程身份与发送输入前准备、单stdout消费者、drain/await close/句柄释放和HOST/collector成本。C2只作helper可行性输入，不作Native证明，不重试旧slot。
- [ ] 独立Fixture先列输入、expected出处、负例和适用性；至少覆盖文件/祖先替换、链接拒绝、支持变化、预算失败前缀、取消/超时、晚到流、删除/重启、同ID异内容、提交不确定及cleanup失败。沿用既有合同数值，不凭空加门槛。
- [ ] 列出精确产品/测试/注册/文档文件、接口生产消费、任务完成条件与本地安全命令清单。严格区分无spawn纯规则、Node/SQLite组件、真实Native/collector、校准/holdout/profile实际准入。
- [ ] 将所有新增契约、依赖/平台/额外helper需求及治理同步项集中到一页决策表，连同完整计划和作者评审提交。未批准前不改相关产品实现。

## 追踪和风险分层验证

| 批次 | 设计依据 | Fixture/Evaluation | 验证层 |
| --- | --- | --- | --- |
| A | ADR-010/014/017/018/020；Native/Provider/Security；现行R011 history/Stage及各附约 | syntax-observer、mixed历史/Stage/Store；109绑定仅保留原适用范围；真实Source/进程/RSS缺口单列 | 先纯规则与既有Node/SQLite；再明确授权的实际路径/qualification；新候选实测后审具体值 |
| B | contracts-and-runtime-design；Plugin SPI；Runtime IR/合同规范 | 四Plugin、execution-flow、runtime-storage、contract-matching、cross-repo；E01–06/E19 | 独立纯Fixture→真实Syntax链→迁移/CAS/失败重开 |
| C | knowledge-and-consumption-design；KnowledgeWorkflow/Reconciliation/Security | document-ir、semantic-runtime、compilation-snapshot、identity、publication、freshness；E07–11/E14 | 文档/候选规则→持久化→实际模型语义/安全/发布证据，不用double替代实际模型 |
| D | Agent API、wiki-projection、ADR-003/013 | fts-query、standard-wiki、agent-api、mcp-lifecycle、install；E12–15/E17–20/E22 | 只读/权限/预算→stdio生命周期→批准平台安装；不提前引入完整WikiSpec |
| E | EVALUATION、PHASE_ACCEPTANCE、phase1-evaluation-design | vulnerability-processing及spring-fastapi-kafka；完整E01–E22义务与批准baseline | 准确候选集成本地门禁→必要云端；实际结果逐项归档 |

上表后续Fixture名称来自既有计划，是所需交付对象，不代表目录/实现已存在、已注册或已通过。每批细化时固定实际ID、oracle、root注册与gate；缺失保持缺失，禁止空分母/空qualityGates放行。迁移沿既有runner/checksum/user_version；已实现R011不可照旧计划重做，R012/R013、W004..W011按实际前序审查后逐步交付。

## 批次共同退出和状态更新

- [ ] TDD/Fixture/必要Evaluation/失败恢复/架构检查齐全，范围和环境可重现。
- [ ] 先区分实现、Fixture或设计缺陷，原范围缺陷统一修复；真正契约冲突才集中治理。
- [ ] 受影响spec/ADR/acceptance/trace/migration同步；CURRENT_STATUS准确列已完成/未执行/限制和下一任务。
- [ ] 只对资格相符的任务关闭；组件退出、主任务接受、Phase1退出分别记录。
- [ ] 归档原始失败和继任摘要；不合计重叠测试；不以文档新鲜时间替代证据。

## 后续批次执行方式：收敛策略已批准（2026-10-29）

后续统一遵循 [IMPLEMENTATION_PROTOCOL：收敛执行策略](../../handoff/IMPLEMENTATION_PROTOCOL.md#用户批准的收敛执行策略2026-10-29)。开发定向验证、批次集中验收，未变部分按适用性复用证据；新增保护先说明具体风险及覆盖缺口。仅维护一份批次结果入口，减少重复计数守卫、自重建测试、历史正文复制与整仓封存；已有必需门禁的合并须证明等价覆盖。

本轮不另建测试重构项目。后续在相关任务内逐步收敛；批准范围内顺序连续执行，无需微步骤审批。既有安全/恢复/Fixture/Evaluation/Quality Gate及云端、真实运行等授权边界保持。当前Rust protocol链接失败与C1权限缺口未关闭，Phase1完成状态不变。

## 当前执行位置更新（2026-10-29）

protocol::最终内部门禁已补齐18/18；旧链接根因UNKNOWN，C1仍TODO。相关2,932项身份一致，组件回归直接复用，见[续接结果索引](../../../.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness/continuation-results.json)。

下一项为[A2混合Source与前置账本](2026-10-29-phase1-mixed-source-runtime-integration.md)，设计/任务/最小验证一次呈现，REVIEW_READY但尚未实施；不再拆方向与细化审批。A2涵盖Source/Python、全集重查、前置费用及Application/Runtime准备组件；实际Git/Native与完整资源资格属于后继准确运行包，当前不执行。

## A2已在本地组件范围交付（2026-10-29）

[实施包结果](2026-10-29-phase1-mixed-source-runtime-integration.md#实施结果与作者审查2026-10-29)为当前入口，原A2待确认快照已被整包批准及局部交付替代。下一项集中设计完整混合Runtime生产编排、准确资源目的与真实一次性运行包；不重做Source/Stage组件，不机械重跑未变部分。C1/实际运行与P1-04/05仍OPEN。

## A3下一批收敛决定（2026-10-29）

只读核验发现Stage owner/范围已验证但缺固定请求投影，原A2局部正向仍手工重绑request。下一步以[A3设计](../specs/2026-10-29-phase1-mixed-request-preparation-design.md)和[T1–T3合并包](2026-10-29-phase1-mixed-request-preparation.md)集中审查，尚未授权实施。完整实际运行包当前NOT_READY；不为短生命周期Git问题直接新增debugger采集平台，不将Syntax目的或逻辑预算冒称完整资源资格。先完成有界请求衔接，后续固定实际实现再提交精确运行清单；无真实运行或profile预批。

## A3本地请求衔接已交付（2026-10-29）

[T1–T3实施结果](2026-10-29-phase1-mixed-request-preparation.md#实施结果与作者审查2026-10-29)替代此前待审状态；范围仅固定请求链与本地整合。完整Runtime配置/资源资格、真实运行清单和profile仍OPEN，父任务4/21保持。下一包围绕已有固定请求实现准备完整编排/资源设计，不再重做Source、Stage或请求组件；具体方案成熟后集中确认新增契约/实际操作。

## 真实Runtime时序循环已定位（2026-10-29）

下一真实编排依赖的明确契约问题已实码确认：Java准备当前绑定尚未发生的v5完成metadata。已完成[时序修订设计](../specs/2026-10-29-phase1-settled-java-owner-design.md)和[S1–S3集中包](2026-10-29-phase1-settled-java-owner.md)，待一次整体批准；不再拆方向/细化审批。它保留旧组件/摘要/成本，新增仅已知Java事实的准备形状。SourceState预算、配置域和实际进程资格仍列后继完整编排义务，本包不扩建collector或执行真实运行。原A3结果仍仅本地组件，不能当作真实时序证明。

## Java owner时序修订已交付（2026-10-29）

[获批S1–S3结果](2026-10-29-phase1-settled-java-owner.md#实施结果与作者审查2026-10-29)关闭已定位的未来metadata循环（本地组件范围）。旧分支/摘要/成本兼容门禁通过。下一项把SourceState有界SQL、预算来源与固定Runtime编排集中设计；真实进程/资源目的/值仍须精确证据和对应批准，不重做已交付组件，不自动运行Native或CI。主任务4/21保持。

## A4 下一整包已形成（2026-10-29）

[设计及完整编排剩余决策](../specs/2026-10-29-phase1-bounded-source-state-design.md)与[B1–B3精确任务](2026-10-29-phase1-bounded-source-state.md)一次呈现，REVIEW_READY / IMPLEMENTATION_NOT_AUTHORIZED。实现包合并有界SourceState、预算cap/根绑定、现有固定链组合与文档验收；不为每个步骤分拆审批。完整生产路由/配置/资源资格仍NOT_READY，不冒称本地准备包已覆盖。真实测量和事后具体值具有依赖，后继按准确包审批，不预批空白数值。

## A4本地闭环完成（2026-10-29）

[B1–B3结果与作者审查](2026-10-29-phase1-bounded-source-state.md#实施结果与作者审查2026-10-29)为当前入口。下一项继续把生产路由/配置来源/完整资源资格一起设计，不重做已交付组件，不自动运行测量/Native/CI；真正新契约仍形成一个具体包后集中审查。父任务4/21保持。

## A5固定调用者整包待集中确认（2026-10-29）

[设计](../specs/2026-10-29-phase1-mixed-execution-design.md)与[T1–T4计划](2026-10-29-phase1-mixed-execution-closure.md)一次呈现，REVIEW_READY_LOCAL_IMPLEMENTATION。选择显式FULL/INCREMENTAL、不增AUTO回退；复用Stage吸收capture费用后确认NO_OP，不造新贷记机制。新增配置、空FULL、固定链与结算视图集中审查。全链实际采集/资格仍NOT_READY，未知物理schema/运行清单/数值不从本地实施授权推导；B/C独立具体设计可按既有统一策略顺序准备。
