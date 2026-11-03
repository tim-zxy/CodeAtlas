## B-F1-D已批准：仅Python v6 CALL_RESULT例外 — 2026-10-30

用户已批准[局部DCP](2026-10-30-phase1-call-result-coverage-design.md)：只有binding v6的UNKNOWN(CALL_RESULT)不单独令Syntax PARTIAL；其他unknown/遗漏/失败、v4/v5及Java保持，完整发布门禁不降低。B0b§4.2动态值规则的此例外仅适用新v6，旧r1不能重标；不改IR/SQL/分数/profile或生产资格。D1–D3已完成有限库组件出口；[准确结果/原失败及作者审查](../plans/2026-10-30-phase1-call-result-coverage.md)。实际direct完整、nested仍拒绝；Rust集中15/16后获批矩阵定向1/1，不冒称整批重跑；父任务4/21及Phase1 OPEN。

# B-F1-B：绑定观察的库级生产与归一化闭环

状态：用户已明确批准并在本地库组件范围交付；依据：[F1-A已交付合同](2026-10-29-phase1-binding-contract-detail.md)、[F1方向提案](2026-10-29-phase1-framework-binding-contract-proposal.md)及ADR-020。本包把真实AST库输出接到已有v2/context3，不修改生产CLI、History或SQL。

## 1. 实码结论与方案

Rust code_syntax_producer.rs、JavaSyntaxAnalyzer、PythonSyntaxAnalyzer与TS的v5 reader、同账本normalizer已有可复用链路。推荐增加固定的v6库入口和内部模式，共享Source读取/预算/写流与旧映射规则；保留v4/v5入口、bytes、终端、错误及预算行为。不能复制整套producer，不能把v6先改成v5后校验checksum。

发现一项F1-A与真实Code形状的兼容冲突：
python-normalizer.ts明确将MODULE的Canonical sourceRange置null，qualifiedName等于SourceFile.path；syntax-normalizer.ts已接受这个归属规则。F1-A的scope校验只接受非null范围，人工模块Fixture有range，不能证明真实模块输入可用。

### MODULE归属澄清（与本包一并批准）

parseSyntaxEvidenceV2的context保持现有references/codeNodes，增加可省略的sourceFiles:SourceFile[]。缺省不填值、不查询fs；原调用与旧拒绝控制继续有效。
- 正常非null scope.sourceRange仍要求同sourceFile。
- 仅MODULE且range=null时，要求显式sourceFiles中唯一匹配该syntax.sourceFileId的当前值；repo/revision/fingerprint与syntax一致；MODULE.qualifiedName严格等于该SourceFile.path。
- 校验sourceFiles重复ID/path、foreign basis；不能仅靠一个路径字符串或CodeNode.name匹配。
- 无文件值、路径/指纹不符，或TYPE/SYMBOL的null范围仍拒绝。已有scope-without-range负例不删除。
- Plugin V3传其既有sourceFiles，不新增caller inventory或fs权限。输入仍是声明式捕获值，不因此取得Store鉴证/激活权。

这是对已有文件归属规则的复用，不修改Canonical Code MODULE，不在normalizer中补造范围。本包批准前不静默改已接受的F1-A规则。

## 2. 新协议6：完整库合同

新请求仍为已批准BindingCodeSyntaxRequestSchema：protocolVersion6、OBSERVE_CODE_SYNTAX、codeContract PYTHON_SYNTAX_CODE_V1、syntaxContract SYNTAX_BINDING_V2。extractorVersion保留当前请求的syntax-v1常量；兼容身份必须包含protocol6、syntaxContract、新Native build，不能将该常量单独视作旧格式兼容证据。

事件名与v5保持OBSERVATION_STARTED/NODE/EDGE/SYNTAX_OBSERVATION/CODE_COVERAGE/SYNTAX_COVERAGE/DIAGNOSTIC/OBSERVATION_COMPLETED及两类FAILED；header固定version6。
STARTED/COMPLETED的binding复用v5所有字段并必需syntaxContract；requestChecksum为实际v6原始请求字节SHA256。完成counts沿原六类别逐条实数统计，新增typed观察计入syntax；checksum为实际preterminal v6 bytes（含LF）。旧v5 schema不接纳这些新增字段。
唯一terminal、sequence、requestId、完整文件coverage、Code/owner/引用闭包、failed整批丢弃、PARTIAL诚实返回、Source policy、严格UTF8/LF及累计输入/输出/items/depth/deadline/cancel继续适用。Pythonscope只能引用本流已产生的合法节点，Java只能引用请求中已验证owner映射；缺失必须null/限制或拒绝，不能新增假Code节点。

Rust新库入口：
- decode_binding_syntax_request(bytes) → BindingSyntaxRequest，持有原字节checksum与结构/公共payload校验结果。
- write_binding_syntax_observation(request,control,output) 与 serve_binding_syntax_request(bytes,control,output)。
共享旧私有decoder/writer核心，固定LEGACY/CODE_V5/BINDING_V6模式；原公开wrapper仍固定旧模式。无动态版本注册器、CLI/协议分发或DESCRIBE广告。

TS私有接口：
- readBindingSyntaxRequestSnapshotWithBudget(bytes,composition)。
- validateBindingSyntaxObservationStreamWithBudget(requestBytes,outputBytes,composition)。
- default consumeBindingSyntaxObservation(requestBytes,readable,signal,limits,composition)。
可复用旧framing/common检查，但新schema、实际原字节与checksum必须完整保留。limits来自已验证caller/现有硬上限，没有新默认数值；composition沿用既有五维累计账本边界，不将输出events和遍历items混用。该consumer只拥有Readable消费，无spawn/collector权限。

## 3. AST字段与scope的支持子集

Java：沿用真实SymbolFact和请求owner map；scope查找跳过变量实体，选真实method/constructor/type声明对应Code节点。无法合法映射则null，不按最近range猜。新增typed声明读取实际field/local声明名/type，CALLABLE仍为方法/构造声明；未知var推断不转为具体类型。无变量Code owner时owner=null，独立lexicalScope保留。

Python：DIRECT_VALUE仅单一identifier目标的直接普通赋值，valueRange为实际完整RHS。IMPORT_ALIAS仍为独立类别/null range；annotation/其他复杂赋值保持OTHER/null或明确限制，不偷偷拆链式/解构目标。
scope从真实AST归属求得：
- module正文引用本流MODULE；function body引用真实function节点。
- decorator与普通默认参数表达式使用外层求值scope，不能用被装饰/定义函数作scope。
- 当前无合法Code节点的class/lambda/comprehension、不能明确解释的annotation/header形式为null并报告限制，不回退为module或外层function。
- 嵌套函数、同名参数和重复赋值不做唯一reaching-definition结论；本包只生产语法证据。

两语言均保持CALL_RESULT/DYNAMIC_EXPRESSION UNKNOWN，不推断对象类型。直接scope查找的祖先步、额外声明及新引用计入现有items/depth/结果预算；不增加跨文件搜索。v4/v5不执行新模式的遍历/字段输出，旧成本/bytes回归必须保留。

## 4. Canonical v2归一化

新私有normalizeBindingSyntaxObservation(input,composition)消费F1-A字段及原完整basis/source/selectedNodes/bindings/supports输入。复用旧normalizer的Code/Evidence/valueDigest/ProviderFactBinding校验；lexicalScope经过同一合法binding映射，并进入needed支持集合，不能仅保存裸Code ID。
SourceFile、owner、callee/value引用及lexicalScope的支持全部闭合，复用codeatlas-phase1-support-value-v1计算原Code/Source值摘要。MODULE归属按§1；任何foreign/dangling scope拒绝。

v2独立身份域：
- meaning={owner,lexicalScope,payload}，owner/scope/reference使用既有compact Canonical ref（不含Provider ID），payload包含新assignment/declaration字段。
- fields沿旧tuple顺序：repoId、sourceFileId、sourceFingerprint、完整sourceRange、syntaxKind、meaning摘要。
- syntaxKey域syntax-key-v2；extraction域syntax-extraction-v2，其versions为syntax-v1、syntax-canonical-mapper-v2、syntax-surface-support-v1、SYNTAX_BINDING_V2。
- id为syntax:前缀加codeatlas-syntax-initial-v2域的initial值摘要。initial含新key/extractionVersion、完整值和支持，规则与旧构建一致。
- 保留旧syntax-surface-support-v1置信策略及其原值，不加分、不选新分数/阈值、不重测profile；null scope仅增加LEXICAL_SCOPE_NULL_PRESERVED解释，不改变UNKNOWN或缺owner原因。
- 全部新字段/tuple/摘要/映射和输出副本按现有账本计费，返回parseSyntaxEvidenceV2通过的不可变候选。

旧normalizeSyntaxObservation默认仍走v1，旧Fixture/键/摘要/分数不变。仅提取必要共享核心，不另建通用映射平台。新v2输出不能提交现行history-pair或Store。

## 5. Fixture和跨语言库闭环

复用p1-syntax-contract-v1，在binding-observation子目录新增独立源/请求/raw/Canonical oracle，Manifest仅增路径，无新ID/全局计数守卫。
最少覆盖行为而非数量门槛：直接/包裹/条件/括号调用、alias、decorator/默认参数scope、嵌套函数/shadow、class/lambda/comprehension未知、typed field vs return type、多声明、MODULE null归属、wrong scope/path/fingerprint、预算/取消前缀、缺终端/坏checksum。
oracle先于产品冻结，expected不得由producer或normalizer生成。

Rust库级测试从受控Fixture Source经真实AST/Writer产生JSONL；测试专用owned输出供TS reader→Code映射/normalizer v2→Plugin V3核对，必须保留实际输出，不用golden替代这条桥。至少Python direct与nested两条代表路径；其余按行为测试，不机械扩张捕获。
这属于库级实际源码验证，包含运行Rust测试可执行文件，但不运行analyzer CLI或独立Native harness/collector；不能称OS资源资格/E01实际产品链。测试输出只写本包拥有目录，保留每个修订失败，不扫描旧PID或碰R4 DB。只有定位并修正后才复验相关测试，不无因重试。

## 6. History与生产阻断

本包不改现行v1 history parser/manifest/Stage/Store。v2候选继续被当前发布入口拒绝，不能用v1投影落origin或先独立写Python Code再假装原子完成。
后继History包已有明确责任：v1/v2 origin读写的版本派发、完整Code+Syntax同账本闭包、retained重投影与删除、digest/extractorCompatibility、旧full/delta/NO_OP及last-good恢复；是否需SQL迁移须对实际R011 JSON/约束举证，本包不预留空表。历史接入与候选身份/支持/置信及四框架extract仍需具体审查。
完整流程仍为ExecutionGraph→RuntimeFlow→BusinessFlow；SQLite authoritative、LLM candidate-only及AUTO/MANUAL边界不动。A6未获资格不因库测试通过改变，真实v6仍无profile且启动前拒绝。

## 作者设计审查（2026-10-30）

已按python-normalizer.ts的MODULE range=null/qualifiedName=path、旧syntax-normalizer的MODULE特例及F1-A范围规则确认冲突。推荐增加显式SourceFile值，仅扩展MODULE归属证明，旧null负例继续拒绝。新身份域不引入Provider身份或新分数；旧v5原字节不能被“投影成新模式”替代。

旧Providers若有export-star，额外共享函数放新私有核心，避免仅保持index文件不改却泄漏新API。文件/Fixture/新旧语义均限定；History不在此包，后继不能用v1投影激活。Rust库测试属于本包拟议实际执行范围，未批准前本轮没有构建、测试或采集。

## 批准后的实现澄清（2026-10-30）

§1的已批准MODULE文件归属证明同样用于V3 Syntax owner，避免真实MODULE null range经旧V2 owner检查误拒绝。V3复用旧base/nodes/files/edge/support检查后，显式保持组合cap、Syntax ID/key唯一、basis/file fingerprint/owner门禁并解析完整v2；返回原完整V3。V2保持严格拒绝。
完整本地证据、审查裁定与后继边界见[实施结果](../plans/2026-10-30-phase1-binding-observation.md)。protocol内存测试实际属于bin单测目标，原--lib零匹配不算通过。普通Node命令缺capture时显式skip实际桥，本次已指定r1执行两条且0skip；后续CI不得将跳过视作桥验收。
