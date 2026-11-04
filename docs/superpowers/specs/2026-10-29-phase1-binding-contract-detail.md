## B-F1-B获批补记 — 2026-10-30

[MODULE归属澄清与v6库闭环](2026-10-30-phase1-binding-observation-design.md)已明确批准并完成本地组件验证。下文scope必需非null范围的旧快照增加唯一MODULE例外：显式当前SourceFile值、唯一id/path、同basis/fingerprint及qualifiedName=path；V3 owner同规则。TYPE/SYMBOL null范围与缺文件证明仍拒绝。v6完整原字节reader/库AST/v2 normalizer已交付，History/生产路由仍阻断；本附约不修改原身份、数值或发布权限。

# B-F1-A 版本化绑定契约详细设计

状态：用户已批准具体T1–T3包并完成本地契约交付（2026-10-30）。实现范围与后继限制见文末。
目标：把右值锚点、词法scope和typed declaration定义为可独立校验的语言中立证据。此次只实现契约/TS校验器，不实现producer、normalizer、history接入、框架extract或生产路由。

## 1. 精确版本与对象

| 层 | 本包定义 | 兼容要求 |
| --- | --- | --- |
| Native | 保留mixed协议6；新请求schema与raw观察schema，syntaxContract=SYNTAX_BINDING_V2 | 协议1..5行为/请求/字节/终端不改；本包没有v6事件流consumer或producer |
| Canonical | codeatlas.syntax-evidence envelope version2 | 旧version1解析器仍拒绝新对象，新解析器拒绝version1，不隐式upgrade |
| Plugin | 私有contextVersion3，syntaxSchemaVersion2 | 旧V1/V2仍严格；V3本包只有context校验，不提前定义extract factory |
| History/SQL | 本包不变，仍只激活既有版本 | v2对象不能传给现行Stage/Store；没有migration、自动bootstrap或origin重写 |

已对产品TS/Rust检索，未发现使用protocol6或context3的实现；这些是本次拟定版本，不能从“下一版本”推导已协商或具备运行资格。保留版本不等于DESCRIBE广告或实际CLI分发。

## 2. Raw与Canonical字段

所有既有kind/payload字段、SourceRange坐标、SyntaxValue、UNKNOWN和owner语义保留。仅新版本添加：

| 位置 | 严格必需字段 | 约束 |
| --- | --- | --- |
| common | lexicalScope:ref或null | raw为ProviderNodeRef；canonical为repository ScopedRef，kind CODE_NODE。owner与scope独立，不能以owner自动填scope |
| ASSIGNMENT.payload | assignmentForm:IMPORT_ALIAS / DIRECT_VALUE / OTHER；valueRange:SourceRange或null | DIRECT_VALUE要求非null；其余要求null；不改变既有targetName/value |
| DECLARATION.payload | declarationForm:CALLABLE / TYPED_BINDING / OTHER；declaredName:string或null | CALLABLE/TYPED_BINDING要求非空exact名；OTHER可null。declaredType仍可null，不凭名字推断 |
| DECORATION/INVOCATION/ARTIFACT.payload | 没有新增字段 | 只增加common.lexicalScope，不把任意表达式变成call value |

valueRange必须同文件且由assignment.sourceRange包含；采用既有坐标的字典序比较，不新增长度阈值。无界/非法范围仍受控拒绝。它记录实际右值节点全范围，不是assignment全范围或选中的内层call。

lexicalScope与owner均引用当前输入basis合法Code实体。canonical校验需要Code node值以核对scope：MODULE、TYPE或SYMBOL中的METHOD/CONSTRUCTOR/FUNCTION；不得用FIELD/VARIABLE当作用域。scope的sourceRange必须属于同一sourceFile；无法提供这样的合法节点时用null，保留覆盖缺口，不伪造MODULE/TYPE/VARIABLE。Python当前class owner/Code能力有限，null是合法未知，不以外层module偷偷替代class scope。

raw schema只校验结构和范围；Provider实例、节点存在、实际AST关系以及绑定闭包属于后继完整stream/producer/normalizer职责。方法名中不得含“validated stream”等会扩大权威的含义。

### 直接调用关系（纯判定规则）

parse后的两条Canonical对象，只有同时满足以下条件才可提出直接右值调用关系：
- 一条为DIRECT_VALUE ASSIGNMENT，另一条为INVOCATION；
- repo/revision/sourceFingerprint/extractionVersion/sourceFile一致；
- lexicalScope非null且相同；
- valueRange与INVOCATION.sourceRange完全相等。

该关系只说明语法位置，不说明构造器身份、调用成功、返回类型、唯一reaching definition或框架归属；CALL_RESULT仍为UNKNOWN。Import alias、wrapper内层call、conditional、await或parenthesized外层不因包含关系升级。不解析callee name，不模拟执行顺序。
本包可提供私有纯函数isDirectAssignmentCall(assignment,invocation):boolean消费已经校验的v2对象，后继绑定器直接复用，不额外引入relation模型/ID/存储。

## 3. 精确接口

IR新模块syntax-evidence-v2.ts：
- SyntaxEvidenceV2Schema、type SyntaxEvidenceV2。
- parseSyntaxEvidenceV2(envelope:unknown,context:unknown)返回version2 envelope。
- context为严格对象{references:Phase1ReferenceContext,codeNodes:CanonicalNode[]}。codeNodes拒绝重复、foreign repo/revision；lexicalScope须在references与codeNodes同时存在，且满足§2的kind/同文件要求。值仅是调用方捕获数据；本包不鉴证其来自实际Store。
- 复用现有parseSyntaxEvidence对剥离新字段后的局部投影验证旧共同约束，然后单独验证新增字段；投影不返回给调用者、不存储、不重新标为旧语义。新外层版本/strict keys先验证，旧parser绝不直接接受新对象。
- 新parse函数不制造confidence、syntaxKey、id或extractionVersion；它们仍是显式输入并接受原类型约束。真实生成规则属于normalizer后继，不在此选择新分数或hash域。

Providers新私有模块native-binding-contract.ts：
- BindingSyntaxObservationSchema：旧raw五kind加§2字段。
- BindingCodeSyntaxRequestSchema：既有CodeSyntaxRequestSchema字段，protocolVersion=6，type=OBSERVE_CODE_SYNTAX；payload在原codeContract PYTHON_SYNTAX_CODE_V1外必需syntaxContract SYNTAX_BINDING_V2。
- 只导出Zod schemas及相应type给包内测试/后继模块；不增加public index或解析raw stream函数，不复用v5完整consumer去“降级验证v6字节”。
- 新request schema只证明结构，不能称完整request/owner/Source/预算准入。完整raw bytes/preflight/checksum/control验证必须随将来v6reader交付，现行真实入口仍拒绝新协议。

Plugins新私有模块plugin-context-v3.ts：
- PluginV3ContextSchema：V2字段，contextVersion=3，增加syntaxSchemaVersion=2，syntaxEvidence改为v2对象数组。
- validatePluginV3Context(value:unknown)：沿用10000 combined facts和10000 files；将新syntax逐条经parseSyntaxEvidenceV2验证，并复用旧V2对Code/Source/inventory/旧语法共同约束的校验投影。最终返回完整、deep frozen的V3值，不暴露投影，不调用V2 factory执行新输入。
- scope不加入新的caller inventory：来自同一context.nodes，不能另传“可信scope”旁路。
- 不修改V2 validators或F0；没有V3 descriptor/detect/extract/candidate合同的占位实现。

## 4. 安全、预算、错误和存储

复用IR JSON安全、strict envelope/refs和受控IR_VALIDATION_FAILED。Schema.safeParse结构失败是普通Zod拒绝，不为它新增IPC错误家族。
Plugin新字段和syntax对象计入既有facts/input JSON边界；后继有账本的调用方须在传入前按原items/bytes/depth控制。此包不把结构校验当资源准入，不造默认cap或新的无限budget。

无fs/环境/网络/进程/DB授权。SQLite仍authoritative；Code/Syntax/Runtime事实仍由validated Application/Store激活。v2不能借v1历史parser合法化。检查过activation-history-format、syntax-history-candidate的固定version1分支，本包明确不放宽它们。

后继producer须从真实AST填字段；normalizer须把新字段纳入独立版本的身份/extractorCompatibility及预算；history须完整治理v1/v2读写、retained origin和失败恢复；这些修改没有被此包提前授权。是否追加SQL迁移要按实际表能力判定，不先建空表。
候选envelope/identity/support和confidence策略仍待后继完整F1设计，不将它们默认为已完成。

## 5. 独立Fixture与验收矩阵

复用p1-syntax-contract-v1的SYNTAX_CONTRACT_ONLY范围，新建binding-contract/inputs.json、expected.json并加入原Manifest两路径；保留旧请求/events和oracle。不新增Fixture ID/全局计数，不以空qualityGates认定E01/E02通过。

独立手写向量覆盖：
- raw新字段正例、缺字段、unknown key、wrong version、alias/null、DIRECT/null冲突；
- canonical合法scope/owner不同、scope null、foreign/missing/wrong-kind scope、跨文件/越界range；
- DIRECT FastAPI()/wrapper(FastAPI())/conditional/parentheses/import alias不同范围与手写关系结论；
- typed field与method return区别、未知类型和Python缺class scope；
- V1/V2拒绝新对象，新parser拒绝旧version；V3不可变、file/basis/duplicate/combined cap沿用；
- v6请求结构只接受准确selector，原v5结构schema拒绝6和新字段。

四层入口测试只验证各自责任，不重复完整old SPI/History长批。Literal expected不调用产品生成；不在默认root加入Rust/Native实际启动。测试double和手工schema不能满足实际AST提取、鉴证或E01/E02。

## 作者设计审查

已核对既有CodeSyntaxRequestSchema结构、V5事件/schema、V2 context、IR源/出口与现行R011 SQL。当前R011实际是activation_history/syntax_origins等history表，并非旧初稿中的syntax_state；本包没有采用旧表名、改SQL或推测必须追加迁移。未发现产品实现使用protocol6/context3；新版本只有本提案预留。

实施包有意不承诺Native AST真实性或完整F1，因为它不包含producer/history/候选策略。独立relation Fixture只能证明位置判定，不能单凭PASS获得框架绑定/发布权。测试/文档与实际边界统一，后继缺口仍明确保留。无新采集器、框架平台、依赖或数值。

## 本地实现适用性（2026-10-30）

已按具体整包批准完成：[精确实施/验证/作者审查](../plans/2026-10-29-phase1-binding-contract.md#实施结果与作者审查2026-10-30)。原版本、真实准入与后继生产/历史/语义缺口保持；本设计的新协议6只形成结构schema，没有完整byte reader/terminal校验或实际能力广告。
