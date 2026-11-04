# B-F2-A：绑定充分性精确合同与领域草稿

状态：B_F2A_BINDING_CONTRACT_LOCAL_EXIT。用户已批准精确合同及C1–C4并完成有限本地实施；[实施结果与审查](../plans/2026-10-30-phase1-binding-sufficiency-contract.md#实施结果与作者整包审查--2026-10-30)。本包只建立精确结构/引用与草稿边界，不实现producer、名称绑定算法或四框架抽取规则。

## 1. 版本和职责

已核对产品源码现有最高wire6/Syntax2/Plugin context3；推荐新私有wire7、syntaxContract=SYNTAX_BINDING_V3、Canonical Syntax envelope.version3、Plugin contextVersion4/syntaxSchemaVersion3。旧v4/v5/v6、Syntax1/2、Context1/2/3和所有原始产物/历史保持严格。

新请求仍OBSERVE_CODE_SYNTAX，保留codeContract=PYTHON_SYNTAX_CODE_V1；本包只提供request/observation schema，不宣称已有完整framing/checksum/stream/producer/CLI或资格。无DESCRIBE/协商广告、生产路由、profile/默认值或SQL变更。协议版本是合同标识，不是资源或Quality Gate数值。

## 2. 统一公共字段与既有kind

Syntax v3包含原v2的所有公共字段（id/key/extractionVersion、repo/revision、sourceRange/fingerprint、owner/lexicalScope、supportRefs/confidence），额外必需：

controlContext: UNCONDITIONAL | CONDITIONAL | UNKNOWN。

它说明该观察的求值/名称效果是否依赖分支、循环或未知控制；不表示程序执行顺序或可达性。没有证据不得填UNCONDITIONAL。BINDING_SCOPE是结构性枚举，固定UNCONDITIONAL；声明是否条件建立由相应DECLARATION记录表达。

DECORATION/INVOCATION.callee增加必需resolution: EXACT/HEURISTIC/AMBIGUOUS/UNRESOLVED/UNSUPPORTED：
- RESOLVED仅允许EXACT或HEURISTIC、非null target、空candidates；
- NON_RESOLVED仅允许其余三类、null target；AMBIGUOUS至少两个不同候选，UNSUPPORTED必须空候选，UNRESOLVED按既有非解析结构保留未证候选，不新增基数限制且不能当精确；
- raw沿现有target.resolution，不重复新增第二个resolution字段；Canonical将其明确保留。

ASSIGNMENT保持IMPORT_ALIAS/DIRECT_VALUE/OTHER与range规则，不改UNKNOWN；DECLARATION.declarationForm增加TYPE，既有CALLABLE/TYPED_BINDING/OTHER保留。非OTHER仍要求declaredName非空；TYPE描述真实Code TYPE的声明，owner必须指向真实Code TYPE且declaredName与其name相同，不补造Python CLASS。参数类型在后继producer有真实语法时可用TYPED_BINDING表达，不能用方法return type填参数/字段类型。

## 3. 三类新增语言中立观察

### IMPORT_BINDING

payload精确为{language,importKind,qualifiedName,importedName,boundName}；后三字段为exact Text|null。

|importKind|language|字段约束|
|---|---|---|
|JAVA_TYPE|java|qualifiedName完整声明名，importedName为末段，boundName=importedName|
|JAVA_STATIC_MEMBER|java|qualifiedName完整静态成员名，importedName为成员，boundName=importedName；不自动视为类型|
|JAVA_WILDCARD / JAVA_STATIC_WILDCARD|java|qualifiedName保留星号前限定名；importedName/boundName=null|
|PYTHON_MODULE|python|qualifiedName为明确导入模块；importedName=null；boundName为真实alias或实际顶层绑定名|
|PYTHON_SYMBOL|python|qualifiedName为明确绝对导入目标；importedName为显式导入名；boundName为真实alias或该名|
|PYTHON_RELATIVE|python|qualifiedName保留源中的前导点及目标拼写；importedName按实际导入项或null，boundName可知时保留；不据此声称已解析绝对模块|
|PYTHON_WILDCARD|python|qualifiedName保留来源含前导点；importedName/boundName=null|
|UNKNOWN|java/python|字段只保留确知值，不补默认；对应scope不得标完整|

Java三种显式非wildcard限定名不含星号，TYPE/STATIC_MEMBER的qualifiedName末段必须等于importedName；不做包/嵌套类型解析。其余语言/形式组合拒绝。普通模块绑定必须保留import a.b与import a.b as c的区别，不从Canonical IMPORT倒推。本包schema校验显式值和一致性，不证明它来自AST。

### BINDING_EFFECT

payload精确为{name,effect,targetScopeRef}，name为Text|null，targetScopeRef为Code scope ref|null。
effect枚举：ITERATION_TARGET、CONTEXT_TARGET、EXCEPTION_TARGET、PATTERN_TARGET、WALRUS_TARGET、UNBIND、AUGMENT、GLOBAL、NONLOCAL、UNSUPPORTED_BINDING。

只记录现有ASSIGNMENT/DECLARATION/IMPORT_BINDING未覆盖的名称效果，不把同一普通赋值复制成第二份binding事实。非UNSUPPORTED_BINDING必须有name；任一无法确认的目标以UNSUPPORTED_BINDING或null target诚实保留，对应scope必须PARTIAL。

普通效果targetScopeRef须等于lexicalScope；GLOBAL必须指向同文件MODULE；NONLOCAL必须指向明确祖先可调用scope而非MODULE，否则null并PARTIAL。不能只拒绝当前局部引用却遗漏对目标scope的影响。Plugin后继只要某名字受这些效果影响就保守拒绝正绑定，不求解循环/条件到达定义。

### BINDING_SCOPE

payload精确为{scopeRef,parentScopeRef,status,limitations}：scopeRef非null合法Code scope，parentScopeRef为合法同文件Code scope|null；status COMPLETE/PARTIAL；limitations为去重exact Text数组，COMPLETE当且仅当为空。

该记录lexicalScope=scopeRef，owner为scopeRef或null（不把SourceFile当Code owner）。MODULE的parent必须null；非MODULE若parent=null只能PARTIAL并含PARENT_SCOPE_UNKNOWN。所有scope仍须是既有MODULE/TYPE/可调用SYMBOL；引用及MODULE path/fingerprint归属按F1-B已接受规则校验。

COMPLETE仅表示事前固定的绑定枚举义务已覆盖，不代表名称可唯一绑定。条件/冲突可以被完整观察，但规则必须拒绝其正绑定。未知或漏枚举的绑定行为必须PARTIAL；后继完整stream要求该文件相应Syntax coverage/terminal也PARTIAL，不能让结构记录绕过原完整发布门禁。

## 4. 实际语法枚举义务（后继producer必须证明）

已只读核对本机锁定tree-sitter-python0.25.0与java0.23.5的node-types.json，未运行解析器。此表固定责任；Source oracle要验证真实输出而不是以计数自洽替代。

|语法|已有可复用或新增责任|不得遗漏|
|---|---|---|
|Python assignment / augmented_assignment|普通既有ASSIGNMENT；增强写用AUGMENT|链式/解构无法明确枚举时scope PARTIAL|
|import_statement / import_from_statement|明确IMPORT_BINDING，旧IMPORT/alias保留兼容|真实boundName、relative/wildcard|
|function_definition / class_definition / 参数|既有CALLABLE/参数名；合法TYPE才发TYPE|函数名在外scope遮蔽，参数在函数scope遮蔽；无合法class Code仍原限制|
|for_statement/for_in_clause、with_item、except_clause/as_pattern|ITERATION/CONTEXT/EXCEPTION_TARGET|解构/alias和异常目标的失效不能当无影响|
|case_clause、named_expression、delete/global/nonlocal|PATTERN/WALRUS/UNBIND/GLOBAL/NONLOCAL|未知名字/目标scope不能跳过后COMPLETE|
|lambda/comprehension/type_alias_statement等不能可靠证明scope的形式|明确scope PARTIAL及限制|不回退为MODULE或外层函数，不提前引入新Code能力|
|Java import_declaration|四类import形式|static与wildcard不得混同|
|variable_declarator、formal/spread/catch参数、enhanced_for、resource|复用typed/参数声明或新增对应EFFECT|字段/局部/参数/块遮蔽；无合法精确映射用PARTIAL|
|assignment_expression/update_expression、type_parameter、局部TYPE|ASSIGNMENT/AUGMENT/TYPE或限制|未表达的名字失效不能当不存在|
|Java lambda/匿名类/无法证明块归属|保守PARTIAL|不靠最近位置猜scope；不构建通用CFG|

块作用域缺少Code scope时不造新节点：允许把冲突提升为所属合法可调用scope的保守拒绝，但必须在合同/Fixture显式记录限制，不能因此作新的正绑定。对未知target/null name的枚举缺口仍PARTIAL。

## 5. Canonical parser与Plugin Context4

IR新增SyntaxEvidenceV3Schema/type及parseSyntaxEvidenceV3(envelope,context)，context与v2一致：{references,codeNodes,sourceFiles?}。
- 严格schema/version/字段；继承所有旧common、支持/引用/source/fingerprint与range不变量；新scope/target/parent/callee引用同样必须有完整支持和值摘要。
- 新kind不伪装成ARTIFACT；公共校验优先复用既有phase1-support/Source/Code函数，仅确有重复时提取私有helper，不为旧版本增加新行为。
- parser只校验显式数据及支持与输入inventory的一致性，不鉴证这些值来自Store；不生成confidence/id/key或从字段存在推断提取完整性。

PluginV4ContextSchema = V3 context字段，contextVersion4、syntaxSchemaVersion3、syntaxEvidence为v3。validatePluginV4Context只在责任入口验证/冻结一次；沿用现有combined facts/files cap，所有新增观察都计入syntax数量，不新增预算数值。

上下文额外闭包：每个非null lexicalScope和非null effect目标须有唯一BINDING_SCOPE；parent引用须在scope表，禁止环/跨文件/foreign basis；合法MODULE为根；重复scope subject拒绝。每条观察范围必须包含于其subject scope实际观察范围（BINDING_SCOPE的sourceRange，而不是Code声明名范围）；默认参数/decorator按真实外scope核对。父范围包含子范围。模块null Code range仍靠path/fingerprint证明，不伪造范围。

PARTIAL scope可被合法context承载以保留诊断，但不能成为后继正绑定的完整依据。存在UNKNOWN import、null effect目标或UNSUPPORTED_BINDING时，其所属scope必须PARTIAL。V4不会自动补缺scope为完整，不把旧V3字段投影后交旧Plugin执行。

## 6. 严格领域草稿（无Canonical分数/ID）

私有schema为codeatlas.framework-draft/version1；payload精确为{basis,framework,ruleId,draftKey,sourceRange,proposal}；外层候选仍{capability,value,support}，support复用Canonical/Syntax联合，非空/去重/在当前context存在。

framework为spring/mongo/kafka/fastapi；ruleId为exact Text版本标识，capability固定FRAMEWORK_DRAFT；support至少包含一条同文件、sourceRange与草稿anchor完全相等的SYNTAX引用，不能只有import边；proposal中的Code refs须在外层Canonical支持或这些Syntax的支撑闭包中。此处只验证结构闭包，语义因果支撑仍须由后继规则/Fixture验证，不能因形状合法认作框架事实。proposal使用下列判别联合，不接受任意JSON：

|kind|精确字段（除kind）|
|---|---|
|HTTP|direction PROVIDER/CONSUMER，implementationRef Code ref，signature复用HttpContractSignatureSchema|
|TASK|taskKind JOB/TASK/BATCH，implementationRef Code ref，schedule SyntaxValue|
|DATA_RESOURCE|resourceKind Text，logicalName/namespace Text或null，schemaRef ScopedRef或null|
|DATA_OPERATION|implementationRef Code ref，resourceKind Text，logicalName/namespace Text或null，operation READ/WRITE/WATCH，handlerRef Code ref或null|
|MESSAGE|implementationRef Code ref，signature复用MessageContractSignatureSchema|
|DEPENDENCY|ownerRef/dependencyRef均Code ref|

DATA_OPERATION中WATCH只有handlerRef非null才是完整支持的变更候选；READ/WRITE的handlerRef必须null。Mongo的resourceKind在对应规则中固定，不由schema猜框架。合同/schema/namespace未知仍按已有nullable意义保留，不能证明跨仓匹配或schema等价。TASK schedule为UNKNOWN时保留其reason，不作为已知触发事实。

所有ref/源范围必须在同basis context与支持中有实际对应值，schemaRef不存在则拒绝，不另传可信ref列表；本包不从普通Code类型制造schema实体，V4未提供专用schema实体时相应schemaRef须null。普通字段不满足原Runtime signature表示能力时必须诊断，不偷偷规范化正则/通配/编码/尾斜杠或发明默认值。

草稿明确不含id/factKey/confidence/resolution，加入这些多余字段即拒绝；不能通过RuntimeFactSet parser。它不能给Application AUTO发布权。此合同校验声明草稿及支撑，不在本包证明某框架API已绑定或推导该语义正确。

draftKey = framework-draft: + SHA256(codeatlas-framework-draft-v1 + NUL + canonicalJSON({basis,sourceRange,proposal,syntaxKeys}))；syntaxKeys为support中全部Syntax的唯一key按精确字典序排序。canonicalJSON对object keys排序、array保序，复用已有安全JSON/标准crypto，不引入依赖。framework/ruleId/Provider/Plugin ID不进入此输入；支持集合与规则来源仍保留，draftKey只是当前输入范围内去重键，不是未来Canonical/Knowledge稳定身份。键不符拒绝；支持排序变化不得改变键。

validateFrameworkDraft(context:unknown,candidate:unknown)返回冻结的严格候选；如实现使用已验证context的内部helper，不再次逐层复制/重验证全部数据。新module不导出到Plugins public index。

## 7. 精确本包与后继

本包合同出口B_F2A_BINDING_CONTRACT_LOCAL_EXIT：IR v3明确数据、私有v7 request/raw schema、V4 scope闭包与领域草稿验证可用；旧strict版本与Runtime拒绝草稿保持。没有producer/完整reader/normalizer/history新版本、绑定器/四规则实现、置信策略或实际框架能力验收。

后继将按一份具体包集中接producer→严格stream→normalizer→版本化历史，并统一绑定器/四规则API矩阵/Fixture；Native资格与语义置信/Canonical发布各有准确门禁。语法身份域/新normalizer策略必须在该后继设计中固定，不能把本包输入schema当生成这些身份的授权。原Syntax置信策略是否适用于新kind须有Fixture/Evaluation依据，不能在实现中默选分数。

安全/资源：复用ensurePhase1Data、strict schema与IR_VALIDATION_FAILED；无fs/env/network/process/SQL/模型授权，不创建执行上下文或写Canonical知识。旧字段/历史/依赖/profile与Phase1门槛不变。

## 8. 审查与追踪

独立Fixture复用p1-syntax-contract-v1及实际根fixtures/phase1/plugin-context/（ID p1-plugin-context-v2），新增binding-sufficiency子目录；无新ID/全局计数。分别覆盖版本/精度、import组合、scope循环/缺支撑/范围/partial、name effects、草稿键/refs/严格字段及Runtime拒绝。实际for/delete语义只在后继producer的独立Source oracle证明；本包不冒称解析过这些源。

[集中实施计划](../plans/2026-10-30-phase1-binding-sufficiency-contract.md)固定文件、接口、RED/GREEN及门禁。作者设计审查已核对Java compilation_unit可映射为现有MODULE，故不新增SourceFile-as-scope或假MODULE；新请求必须带合法module owner，缺失则后继拒绝。A本包已获明确批准并完成有限合同出口；producer/映射/历史的新增契约与实施范围见[待批准后继](2026-10-30-phase1-binding-sufficiency-pipeline-design.md)，不能从A授权推定。

## 实施一致性补记 — 2026-10-30

raw BINDING_SCOPE与Canonical一致：controlContext固定UNCONDITIONAL，lexicalScope指向payload.scopeRef，非null owner也必须同一subject；raw TYPE必须有owner，具体Code类型/名称由Canonical context核对。结构schema不证明provider映射、AST枚举完整性、Store鉴证或框架语义。精确实现与Fixture追踪见集中包结果。
