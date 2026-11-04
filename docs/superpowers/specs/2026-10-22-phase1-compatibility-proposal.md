## 2026-10-22 approval update

User confirms the recommended architecture decisions and first batch P1-00..02. ADR-020 is the effective architecture record; later task implementations, exact future dependency/wire/profile/numeric gates remain separate. Prior PROPOSED/NOT AUTHORIZED wording below is the review snapshot, not a revocation of this bounded approval. Task checkboxes still reflect actual verification, not approval.

# Phase1 语法证据、不可变编译依据与Evaluation兼容性提案

状态：PROPOSED / NOT ACCEPTED。日期：2026-10-22。此文件是待用户评审的ADR/DCP材料，不是已生效ADR；不占用或修改`docs/handoff/adr/`中的正式编号。相关实现必须等待接受及权威同步。其他不依赖争议项的设计可继续。

## A. 语法证据入口与未发布迁移预留

### 当前权威与观察

ADR-002/010/014冻结provider-independent Canonical、严格版本兼容、语言与框架边界、Rust不拥有SQLite。ADR-015/016保留IPC v1/v2/v3各自严格schema，ProviderSnapshot v1也无任意扩展。SQLITE_SCHEMA当前预留R011 execution_graph、R012 runtime_flow；这些migration未发布。

实际`packages/ir/src/canonical-code-fact.ts`、`provider-code-fact.ts`没有annotation/decorator/value载荷；`packages/plugins/src/plugin-spi.ts`的strict context无artifact，support只允许CanonicalFactRef。Rust语言注册仅Java；已装tree-sitter/tree-sitter-java，未有Python grammar。Source classifySample还只识别.java为SOURCE/java，.py为OTHER/null。缺口影响Spring路径/任务、Mongo/Kafka参数和FastAPI，而非单纯新增一个Plugin文件。

### 提议决定

1. 独立SyntaxEvidence IR及Provider观察规范；语言中立，owner绑定、精确源位置、常量/引用/unknown，不把Spring/Kafka/FastAPI意义写入parser。
2. Python入口同时提供Source/python分类、最小Provider MODULE/SYMBOL/IMPORT/REFERENCE及owner→Canonical映射；分类变化改变Source fingerprint，必须显式bootstrap而非改旧basis。不得从decorator直接捏造owner。
3. 独立协商Native IPC v4 `OBSERVE_SYNTAX`，Java携带语法观察；Python同时携带旧Provider Code v1形状的最小语言观察，再由TypeScript归一化和绑定syntax owner，不改变Code IR v1、ProviderSnapshot v1、IPC v1..v3或原v3summary。Plugin V2显式选择context/support联合，旧validator保留。
4. TypeScript根据每文件持久指纹/兼容版本选择changed files；Native无DB、无框架解释、无持久AST。Python Code差分与syntax同事务激活，保留其他Provider支持；Java v3 summary只按其真实上下文校验保留，不兼容则显式拒绝refresh而非自动全量重解析。当前Code/旧Runtime中间态显式报告AFFECTED；validated Store锁内比较basis后原子激活Syntax/Execution/RuntimeFlow。
5. 新R011 framework_syntax，未发布ExecutionGraph/RuntimeFlow预留移至R012/R013。现有R001..R010 SQL/checksum不变。workspace W004..W011不移动。不改任何Phase0.5退出阈值。

### 替代方案及取舍

- 把字面量编码到name/qualifiedName或伪造Code节点：破坏Code语义、身份及旧比较器，拒绝。
- Plugin用原始源码自行regex/AST解析：重复parser、越过现有bounded SPI，拒绝。
- 完整新Provider或全语言扩展：成本与事实覆盖未证明，不作为前置；合格Provider仍可实现同一观察契约。
- 将Syntax内容塞入Plugin configuration：把证据伪装配置，support验证无从证明，拒绝。
- 语法仅瞬时不持久：restart会无故全仓解析且无法证明旧runtime的来源，拒绝。

### 安全/兼容/恢复

新协商不自动升级旧客户端；请求不传库路径、不继承任意env、不执行源码/import。新records在既有预算、取消和terminal完整性框架内验证；新观察的内存目的需独立测量和批准，旧profile不移植。Python grammar、Markdown/YAML解析依赖版本必须在实施前读取官方兼容信息、固定lock并做最小输入验证；本轮不安装、不声明兼容已通过。

迁移后没有syntax数据时返回NOT_AVAILABLE，而非猜测backfill。回退是禁用新能力、保留旧Code路径与最后旧basis Runtime；不逆改user_version或删除新表。旧二进制遇too-new DB继续安全拒绝，需要旧版时使用经验证备份而非原地降级。

### 接受前与接受后的文档动作

待接受后，先同步CANONICAL_IR、NATIVE_IPC、PROVIDER_SPI、PLUGIN_SPI、SQLITE_SCHEMA、native-analyzer-scalability、MODULE_BOUNDARIES相关说明、ROADMAP迁移预留、WORK_BREAKDOWN、PHASE_ACCEPTANCE追踪说明与DESIGN_TRACEABILITY；必要时建立正式新ADR并更新index。现有门禁和接受的Phase0.5原记录不重写。

所需新Fixture：p1-syntax-contract-v1、p1-syntax-observer-v1、p1-plugin-context-v2、p1-runtime-storage-v1；同时必须保留旧strict IPC/SPI拒绝行为与所有历史Fixture根。临时新协议编号4仅在接受方案和确认仓库无并行编号占用后正式保留。

## B. 可变WORKTREE与知识编译输入快照

### 当前权威与问题

ADR-006/007/008/011要求Evidence链、稳定Knowledge、LLM事务外和冻结RevisionSet。现有Source/Code使用同一个可变WORKTREE revision ID推进fingerprint；Store会替换当前Canonical图、解除部分旧binding并退役Evidence。只保存revision ID无法在长语义任务后重建当时输入，也不能在代码变更后把旧支持当当前事实。

### 提议决定

W010的CompilationRun保存不可变、已过滤的结构化CompilationInputSnapshot：冻结RevisionSet、每repo Code/Runtime activation digest、选定DocumentRevision、获准的事实及support值摘要、领域/安全策略版本。它是历史编译证据，不是新的实时repository truth store；live facts仍以repo SQLite为准。

仓库读取在每库单一WAL snapshot内获取basis+facts，捕获完所有库后再验证basis，workspace提交后再做变化检查。不是跨库原子快照：报告明确选定revision集合与捕获时间窗，不宣称各repo同时刻。瞬时变化再返回同值可被视为同语义输入；不同active支持通过digest区分。

LLM只消费被授权的immutable snapshot。发布workspace事务CAS比较expected published head与本地basis invalidation ledger；跨库发布前/后还做repo token核验。检测变更时不覆盖最后已发布版，或把已提交的准确旧basis结果立即标为AFFECTED并返回该事实；不能把已提交结果伪称回滚。任何源变化不改变输入快照的历史内容。

无跨库锁情况下不能承诺“提交瞬间所有repo源状态原子一致”。正确性承诺是历史basis可证明、last-good可读、显式freshness和查询时重验。若用户要求跨库线性一致且无短窗口，必须另作治理设计，不能在本设计中隐瞒代价。

### 影响与回退

W010新增compilation_input_snapshots、snapshot_supports作为CompilationRun附属审计表，内容受secret/权限/字节预算，默认不存raw source/完整prompt/隐含推理。知识revision指向immutable snapshot及其support，repo事实淘汰不使历史出处伪装成当前。失效只能改变health元数据，不能修改当时snapshot。

涉及同期授权撤销时，读取、模型发送、候选验证和发布分别重验policy；捕获合法不授权永久读出原敏感材料。策略收紧可拒绝展示snapshot正文，仅返回安全元数据。保留策略须避免删除仍被published revision引用的证据；Phase1不实现自动后台清理。

回退：编译失败保原published pointer；中断记录run失败/取消而非假完成；不自动重试产生新版本。Phase1只增加证据保真，不引入跨revision Code事实carry-forward、跨库FK或分布式事务。

Fixture：p1-compilation-snapshot-v1、p1-knowledge-publication-v1、p1-source-freshness-v1，覆盖same WORKTREE不同指纹/支持、发布前后变化、重启、权限撤销和保旧版。

## C. Phase1 Evaluation兼容性

保留严格Fixture Manifest v1及Code comparator/evaluator语义。Phase1 Manifest的inputs/expected使用已允许的命名路径映射；criticalFacts继续只表示Code NODE/EDGE FactKey，不能用于塞Knowledge/probe ID。

为Phase1新增独立domain evaluation report `codeatlas.phase1-evaluation` v1，期望的critical probes/Runtime节点/合同/Knowledge slots存`expected/probes.json`和`expected/runtime.json`等文件，不重释旧字段。现有qualityGates为空只能表示legacy code evaluator无适用门禁；Phase1 suite必须由新runner执行其显式obligations，legacy空gate exit0不能用于Phase1通过。

缺manifest、空required probe集、缺actual证据、零分母、未批准baseline、错误版本、未执行实际路径均不能PASS。新metric与既有质量不变量分离，数值阈值待冻结Fixture和本地测量后批准。本提案没有新的数字门槛、允许失败比率或CI豁免。

影响文档：EVALUATION、ADR-012兼容说明或新ADR、Agent/Knowledge任务spec、PHASE_ACCEPTANCE映射、DESIGN_TRACEABILITY。旧fixture/tool/report版本仍可重算，老报告不转换成新层的成功。

## 审批条目

本文件请求评审A/B/C三项技术决定及影响清单。即使被接受，也不自动批准：产品编码、Python grammar/Markdown/YAML依赖具体版本、新内存profile数值、远端LLM、平台支持承诺、push/PR/merge或任何CI运行。实际实施仍需对应written plan和用户明确确认。
