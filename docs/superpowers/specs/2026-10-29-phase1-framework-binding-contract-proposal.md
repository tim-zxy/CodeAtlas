# B-F1 框架绑定与语义候选：设计审查及契约修订提案

状态：DESIGN_REVIEW_READY；当前输入不足以按原计划完整实施四框架抽取。本文不授权新版本、产品、Fixture或实际运行。
依据：[ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md)、[共享设计](2026-10-22-phase1-contracts-and-runtime-design.md)、[B批及F0](2026-10-29-phase1-framework-detection-design.md)、[Plugin SPI](../../handoff/specs/PLUGIN_SPI.md)。
本轮仅只读核验与设计，无新测试/构建/Native/模型/采集/CI/Git写入。

## 1. B-F1 的目标与 F0 边界

F0 已证明有声明依赖；F1 才负责“哪一个代码实体以哪一条框架规则产生什么候选”。目标包括 Spring HTTP/调度/依赖与HTTP consumer、Mongo资源/读写/变更、Kafka合同/事件边界、FastAPI路由/前缀/依赖。输出仍是受支持的候选，Application校验后才可能进入AUTO事实发布，不涉及MANUAL语义、Capability、BusinessFlow或Wiki发布。

不能把已通过的F0 74项Plugin检查当作F1真实语义证据。四个extract factory、Runtime/Contract领域候选验收、持久化和E01/E02仍未实现。

## 2. 实码与现有Fixture证明的输入缺口

| 缺口 | 已有依据 | 直接后果 |
| --- | --- | --- |
| 赋值右值调用没有明确锚点 | python.rs value的call分支输出UNKNOWN(CALL_RESULT)；walk分别发ASSIGNMENT和INVOCATION | 无法安全断定哪个调用结果被赋给app/router |
| 语义owner不是词法作用域 | Python decorator owner是被装饰函数；alias/assignment可能owner为module或函数；统一Syntax没有lexicalScope字段 | 不能直接按owner相等连接外层router与decorator，也不能忽略参数/局部shadow |
| Java typed receiver信息不足 | java_syntax.rs DECLARATION当前处理method/constructor；variable_declarator只有targetName/value | 不能由方法返回类型推导字段/局部变量的Mongo/Kafka类型 |
| 归一化保持未知 | syntax-normalizer.ts将callee原target映射，保留NON_EXACT_CALLEE_RESOLUTION_PRESERVED | 不得将import存在或raw.name直接升级为解析成功 |
| Plugin候选只验证通用envelope | plugin-spi-v2.ts validatePluginV2Candidate | SPI演示payload不是可发布EntryPoint/Contract |
| 现有持久契约严格限定旧形状 | activation-history-format.ts validateSyntaxEnvelope只接受syntax-evidence v1；syntax-history-candidate.ts固定v1；Plugin V2嵌入v1数组 | 不能只在Native加字段或放宽Zod，就宣称整链兼容 |

本轮读取的已有独立Fixture：
fixtures/phase1/syntax-present-activation-oracle/calibration/events.jsonl
明确包含同一module下的：
- ASSIGNMENT targetName=app，range=(1,0)..(1,15)，value=UNKNOWN(CALL_RESULT)；
- INVOCATION callee=FastAPI，range=(1,6)..(1,15)，target=UNRESOLVED。
两个记录都合法，但当前没有“ASSIGNMENT右值恰为该调用”的字段。这里是现有Fixture数据证据，不冒称本轮实际Native观察。

另一个现有原始源是 fixtures/phase1/python-syntax-unit/inputs/app.py，包含APIRouter alias、Router(prefix)、Depends和动态path，说明常见验收路径确实需要这类绑定，不是为假想扩展建设平台。

## 3. 不采用的捷径与推荐

不让Plugin重新解析Java/Python，不执行import，不用LLM修补Code事实；不把callee name、同文件import、最近调用或数组遍历顺序当作绑定。尤其 app = wrapper(FastAPI()) 中内层调用不能被误当成app的构造器；条件表达式也不能按“只有一个调用”猜测。

只支持完整限定名的狭小示例可以交付部分能力，但无法满足现有FastAPI router/Depends、Mongo/Kafka typed receiver验收。本提案不将必需能力移到DEFERRED，也不降低E01/E02。

推荐先补足**最小语言中立绑定证据**，再在同一F1批内接四框架规则与领域候选校验。补的是直接语法关系，不建设通用AST持久化、任意数据流引擎、解释器或新采集平台。由于严格wire/IR/history/SPI均受影响，应先集中审查该契约修订，不能作为普通实现选择静默加入。

## 4. 推荐的绑定证据合同

以下是拟议字段与语义，不是当前schema已经具备的事实。

### 4.1 右值精确位置

ASSIGNMENT增加valueRange:SourceRange|null：
- 直接值赋值：记录真实右值语法节点的范围，不能记录整个assignment或内部某个便利子节点。
- import alias是当前producer合成的观察，没有普通赋值右值；valueRange=null，并显式保留alias观察类别。
- 不支持的目标/表达式不补造锚点；保持UNKNOWN和coverage限制。
- valueRange必须同sourceFile/fingerprint，且被该assignment源范围包含。
- 只有valueRange与某INVOCATION的完整范围精确相等，才能提出“直接调用右值”关系。包含关系不够；wrapper(FastAPI())只锚定wrapper。
- 括号、条件、await、链式/解构/多目标赋值不隐式unwrap为直接call；未显式支持的形式保留未绑定及限制。
- 即使锚点成立，CALL_RESULT仍保持UNKNOWN。语法关系不能证明函数已执行、返回值类型或运行期对象身份。

### 4.2 词法作用域

增加lexicalScope:明确的Code node ref|null，单独于owner：
- owner继续表示被描述/装饰的代码实体，不改变历史含义。
- lexicalScope表示表达式求值所在的MODULE/可调用代码作用域；decorator不以被装饰函数冒充其求值作用域。
- 无合法Code scope节点时保留null，不捏造Code事实或以最近range猜scope。
- scope与source/revision/provider映射在同次候选中闭包校验；嵌套函数/同名参数/局部定义保留冲突，不跨scope按名字合并。
- 单有scope仍不等于已完成reaching-definition分析。重复赋值、条件/循环中的绑定及无法排除的shadow必须保持歧义/未解析；首版只承诺明确定义的静态子集。

### 4.3 typed declaration

明确区分CALLABLE声明与TYPED_BINDING声明，并携带declaredName及已有declaredType：
- Java field/local绑定从真实声明语法读取name/type；不能用方法return type填变量type。
- 有合法variable/field Code owner时引用它；没有时owner=null，使用真实lexicalScope和声明名描述语法，不能增造Canonical VARIABLE。
- Python未证明的推断类型仍null；不因构造器名称看起来正确而填入类型。
- framework规则只能消费这些证据加明确的import/alias解释；声明冲突、未知类型或语法范围不足保留诊断。

不在本合同中增加置信分值、资源数值、自动求值或动态配置读取。现有聚合items/bytes/depth/cancel/deadline预算继续适用，新记录和新引用必须计入现行累计账本。

## 5. 版本与兼容决策

现有v4/v5和SyntaxEvidence v1是严格契约；旧对象/旧终端/checksum/Fixture、旧历史origin不能重写，也不能通过可选字段接纳改变旧版本含义。
推荐采用显式新版本通道，而非放宽旧schema：
- 独立协商新的mixed观察wire版本（建议下一可用号v6，实施前核对注册），Code节点/边本身仍保持原Provider形状。
- 新SyntaxEvidence版本承载上述绑定字段；旧v1解析器继续严格拒绝它，新读者按envelope明确选择。
- 新Plugin context版本显式携带新Syntax结构；旧V2输入/拒绝行为保持。不能把新语义偷塞configuration。
- History/Stage/Store按版本验证并保留原origin；新旧格式不得被同一digest/extractorCompatibility冒称兼容。缺新证据时返回诚实不可用/需显式重建，不自动全量重跑或修改旧origin。
- 当前Runtime A5仍固定既有版本，不自动切新通道；新构建/新协议没有可用profile时仍在真实进程启动前拒绝。A6失败和全部物理准入缺口保持。

版本号是契约版本提案，不是资源/质量数值批准。这里也不能预先认定一定需要新的SQL migration；先复用既有versioned payload/history能力，若实码证明无法兼容再以准确表/约束提交变更，禁止先建空表。

## 6. 候选与发布责任

先保留既有RuntimeFactSet、EntryPoint/Task/DataResource/Contract结构，不创造框架类型向上泄漏。拟议候选链：
captured Code+Syntax+coverage → bound framework evidence → supported Runtime候选 → Application具体schema/引用闭包验证 → 受治理的Store激活。

Plugin V2候选support中已有CANONICAL/SYNTAX引用可复用其意图；新context的具体闭包仍须版本化。canonical记录的SupportRef与外层Syntax支持不能混为一谈，不能丢掉外层支持后仅用owner证明整个路由/操作。

仍须在完整实施包中集中落定的派生合同：
- 每类候选envelope/capability与批内互引闭包；优先复用RuntimeFactSet封装，不能把SPI演示schema拿来发布。
- provider-independent factKey/ID输入域，区分实体身份、内容摘要和provenance；不得把Plugin/Provider ID混入语义键。
- 输入basis/syntax内容身份、support inventory鉴证和删除/重算策略。
- 置信仅来自有依据的输入策略，不默填1或0，不因多插件同意抬分；本提案不预批新策略或分数。
- partial语义与完整激活的区别；graph/flow/contract和其他context不由名字编造。

这些事项列为实施前缺口，不留产品占位函数；本轮没有把它们自行确定为已批准合同。

## 7. 任务依赖与范围匹配验证

| 合并工作 | 生产/消费与完成条件 | Fixture/质量门禁 |
| --- | --- | --- |
| F1-A 契约与版本 | 明确raw/normalized/context/history版本及字段；旧strict行为不变 | 手写新旧版本正反例、范围/指纹/scope闭包、旧Fixture仍可读；不跑实际Native |
| F1-B producer/normalizer | 从真实AST输出最小锚点/声明，不做框架解释；完整预算传递 | direct/nested/conditional/alias/shadow/decorator-scope/typed-field独立源与expected；Rust库级、TS契约；实际进程资格另列 |
| F1-C 历史与组件输入 | 按真实schema能力保留旧origin，新版本完整候选按既有validated流程接入 | 旧origin不改、版本不兼容拒绝、删除/增量/失败重开、last-good及预算恢复；不手改DB |
| F1-D 四框架+领域候选 | 消费闭包绑定，生成准确Runtime/Contract候选，Application验具体schema | 同名非框架/动态值/多义负例、支持/身份、顺序扰动；四插件集中验证 |
| F1-E 集成与验收 | 满足准确实际运行授权/资格后才进行真实链 | E01/E02、现有end-to-end、批准baseline；未执行不记PASS |

A→B→C/D→E；C/D只有在接口及候选合同明确后才可能独立，当前不安排并发。上表是依赖和成功条件，不是对未知文件/迁移或真实运行的空白实施授权。
开发只跑受影响行为；最终集中验收旧协议/IR/SPI/history及新组件所需范围。沿用既有Node/Rust/SQLite，不新增依赖、不重跑已完成的整仓测量/校准，不追加collector或旧A6 slot。

## 8. 本轮审查结论与集中决策

F0无需修改；F1暂不能按旧P1-06/07计划直接编码完整extract。当前阻断是输入表达能力与版本/鉴证合同，不是需要再跑一次Native或更多保护测试。

需要集中确认的推荐方向：保持UNKNOWN与旧版本不变，接受最小右值锚点、独立词法作用域和typed declaration的版本化设计方向；允许在该边界内继续完成准确wire/IR/SPI/history字段、候选身份/支持与实施文件清单，形成一次完整实施审查。此方向确认不授权编码、新分值、实际进程/模型、profile/依赖、CI或Git写入。

本提案不会把四框架必需能力推后为DEFERRED，也不因当前缺口扩大Phase1目标。若版本化影响成本不接受，必须明确选择保留部分能力且Phase1不验收；不能用名称猜测来替代原质量要求。

## 方向批准与具体包入口

用户已批准推荐方向及集中细化，未批准编码。现已形成[字段/版本/责任点详细合同](2026-10-29-phase1-binding-contract-detail.md)和[T1–T3集中实施包](../plans/2026-10-29-phase1-binding-contract.md)，待一次具体实施确认。首包仅IR v2、私有raw/request schemas、Plugin V3 context与纯关系校验/Fixture；producer、normalizer、history、四框架extract、候选身份/置信策略和实际运行仍不在此实施范围。
