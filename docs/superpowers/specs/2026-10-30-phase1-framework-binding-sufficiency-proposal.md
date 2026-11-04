# B-F2：四框架绑定充分性与领域候选统一修订提案

状态：方向已批准；B-F2-A合同子包已批准并完成有限本地出口（详见后继合同/实施结果），producer/reader/mapper/历史的B-F2-B集中子包随后获批并完成有限本地出口；绑定器和四规则仍待后继批准/实现。精确合同及本地合同包见[后继合同](2026-10-30-phase1-binding-sufficiency-contract.md)。本提案是B批后继标签，不新增主任务/Phase，也不替代P1-06/07与E01/E02门禁。
前置：[F1-A字段](2026-10-29-phase1-binding-contract-detail.md)、[F1-B实际观察](2026-10-30-phase1-binding-observation-design.md)、[F1-C历史](2026-10-30-phase1-binding-history-design.md)、[F1-D覆盖修订](2026-10-30-phase1-call-result-coverage-design.md)。四框架目标沿用[原共享设计§4](2026-10-22-phase1-contracts-and-runtime-design.md)。

## 1. 审查结论

已具备可用的Code/Syntax V3 context、直接右值关系、typed声明、严格原始流与版本化历史，以及Python direct实际完整观察。尚不具备完整框架绑定/领域候选实施依据。不能把“已有一个同名import、同scope且只有一条被观察的赋值”当作唯一到达定义，也不能把callee.state=RESOLVED当作EXACT。

本轮只读核验，无新产品/Fixture/测试/构建/数据库、Rust/Native/helper/collector或云端/Git操作。[准确输入身份与证据范围](../../../.superpowers/design/2026-10-30-phase1-framework-binding-sufficiency/evidence.json)。F1-D前轮18/47/35及Rust收据只作前置适用证据，不计本轮PASS。

## 2. 四项实码缺口

|缺口|实码责任点|影响|
|---|---|---|
|被观察的赋值集合不等于完整名称绑定集合|python.rs Collector.walk处理assignment/import/function/call，但未表达for目标、delete、global/nonlocal或条件祖先|导入/构造器/receiver可被未表示的名称效果遮蔽；不能从缺少冲突记录证明安全|
|Java IMPORT丢失导入形式|java_relations.rs保留normal/static/wildcard/static_wildcard，canonical-normalizer.ts将它们归并IMPORT|不得由originalHint末段推断普通类型导入；类静态成员/通配可能具有相同hint|
|Canonical callee不含resolution|syntax-normalizer-core.ts将raw RESOLVED的EXACT/HEURISTIC映为同一SyntaxCallee.state/target；IR只含state/name/target/candidates|框架规则不能仅凭RESOLVED认定精确绑定。已有NON_EXACT理由是限制说明，不能代替明确字段与证明|
|领域IR要求confidence但语义策略未选|runtime-ir.ts RuntimeBaseShape要求Confidence，Plugin候选只验证通用envelope|不能默填1/0、把Syntax的0.5变成语义分数，或以结构合法冒充语义校准|

### 静态反例（没有运行producer，不能称实测失败）

Python：导入FastAPI后以for FastAPI in factories覆盖名称，再app=FastAPI()；del FastAPI后调用；条件分支内定义router后装饰函数。现有五kind与lexicalScope无法充分表达名称效果/条件来源。不能通过“import唯一”和range排序排除这些反例。来源是当前walk分支和字段合同，不补造当前raw。

Java：import org.springframework.web.bind.annotation.GetMapping与import org.springframework.web.bind.annotation.GetMapping.*具有不同绑定意义；当前Canonical IMPORT不能恢复其variant。插件不能重新读源/解析文本来补齐。

## 3. 推荐方案与不采用方案

推荐一次治理补齐最小绑定证据，再统一实现四框架规则与严格候选草稿；Canonical Runtime组装等待有依据的语义置信策略与原Application发布合同。不是给每个框架另建解析器、AST数据库或数据流引擎。

不采用：名称猜测或最近range绑定；让Plugin重解析源码/执行import/调用LLM；在旧严格版本添加可选字段；用ARTIFACT的declaredValues偷渡未版本化的AST协议；先实现四套靠猜测的extract再补门禁。

保留现状也是可行选择，但完整四框架与Phase1继续OPEN；只实现狭窄示例不能替代原必需能力。不能把这些缺口改成DEFERRED。

## 4. 最小绑定证据的设计方向

以下是新契约的设计要求，不是已接受schema；字段表/AST覆盖矩阵、严格版本号及身份域必须在实施包中一并落定。没有这些准确合同前不授权编码。

### 4.1 明确解析等级

新Canonical callee保留raw的EXACT/HEURISTIC/AMBIGUOUS/UNRESOLVED/UNSUPPORTED，并与state/target/candidates严格一致；旧v1/v2含义不变。新框架规则只接受明确、带支撑的EXACT作为精确引用，不通过缺少warning来推定EXACT。历史旧callee不自动补为EXACT。

### 4.2 导入绑定

新观察显式保留语言、导入形式、声明的限定名、实际绑定名及源范围：Java区分normal/static/wildcard/static_wildcard；Python区分module/symbol/relative/wildcard和真实alias。不得把import a.b的绑定名机械填成a.b，也不得从剥离星号的hint反推形式。

通配/相对导入等不能完整证明的形式给限制，不假设为空。保留原IMPORT边与alias观察以兼容旧行为；新字段来自同次真实AST，不来自Plugin的命名推测。

### 4.3 作用域与名称效果

只提供静态绑定真正需要的证据：合法Code scope及父scope、绑定/遮蔽/失效的名字与原范围、是否处于条件/未知控制环境、绑定枚举的完整性/限制。既有参数名/声明/赋值可直接复用，不重复创建第二份等价事实。

必须事先列出会引入/覆盖/删除/转移名称的AST种类及处理责任（如for、delete、global/nonlocal、异常/上下文管理目标、模式/赋值表达式、Java局部/参数/字段/类型遮蔽）。不承诺通用reaching-definition求解；无法枚举或解释的scope不作正绑定。对于conditional/reassignment只作保守拒绝，不能因遍历顺序选择最后一个值。

父scope必须由明确AST归属和合法Code节点证明，不按name或scope节点的名字范围猜层级。scope未知或Code能力不足保留原限制，不制造CLASS/VARIABLE实体。

这不是增加到处重复的防御校验：Native负责真实语法/枚举，normalizer负责provider-independent映射/支持/身份，Plugin只消费已验证值并作一次绑定判断。完整性需要独立Source oracle；计数/checksum不是没有漏绑定的证明。

### 4.4 版本和持久化

采用明确新版本隔离，不能改写现有v6/Syntax v2/context3或其历史。推荐将上述信息作为新的语言中立Syntax合同，而非仅存在于进程内的私有缓存；这样增量/重启仍可从持久证据重算框架语义。

当前可见最高号为wire6/Syntax2/context3；后继应先核对所有实际声明再在具体合同分配新版本，本文不将建议号当已批准常量。新syntaxKey/extraction/history摘要及compatibility显式隔离；保留旧读者、旧raw和旧origin。SQL仍按实际字段与约束判定，不预建迁移/空表，也不假定新kind一定能绕过现有H1/Stage门禁。

旧scope/导入/解析信息缺失时报告需显式新观察，不追写旧历史、不自动全量重跑；Source changed-only、累计预算与依赖重验证保持。

## 5. 四框架统一规则边界

|框架|必须保留的目标|绑定/未知边界|
|---|---|---|
|Spring|HTTP provider/consumer、类/方法mapping、Scheduled任务与依赖|证明annotation/type归属、所属Code与常量；同名自定义、动态/占位符、多mapping冲突不猜|
|Mongo|DataResource、读写/变更操作、watch/变更触发|证明receiver类型/集合/namespace及handler；save/find名称或普通写入不能证明Mongo或watch|
|Kafka|producer/consumer合同与异步事件边界|证明listener或receiver与topic；namespace/schema未知保持未知，不合并不同集群同名topic|
|FastAPI|HTTP route、APIRouter/include/prefix、Depends关系|构造器归属、唯一受支持绑定、作用域与注册关系闭包；wrapper内层、重赋值、动态include/path不提升|

具体API/重载/默认行为要以仓库支持版本及独立Fixture固定；现有规则表是能力要求，不是任意框架版本的API白名单。规则包实施前核对官方依据，不在本轮凭记忆补方法矩阵或默认配置。

四套规则共用一份绑定/支持校验，框架自身规则分模块；不做动态规则注册器、模板DSL或插件沙箱。F0依赖检测保持独立，matched不成为绑定证明。

## 6. 候选、置信与发布契约方向

沿用Plugin候选外壳{capability,value:SchemaEnvelope,support}及Canonical/Syntax支持引用的既有意图；增加严格的领域草稿schema，不把任意JSON当EntryPoint/Contract。

草稿按HTTP入口/消费合同、任务、数据资源/操作/变更、消息生产消费、依赖几类组织，字段优先复用Runtime IR的signature/ref/枚举约束。携带basis、规则版本、源范围、完整支持及未解析诊断；不填Canonical id/factKey/confidence，也不允许parseRuntimeFactSet接受草稿。草稿去重键与未来Canonical身份分开；均不得混入Provider/Plugin身份作为语义键。

若必须保持同一实体的多规则来源，保留各自支持，不以“多插件一致”提高分数；排序和重复运行须确定。输入删除/替换后对当前完整Context重算草稿，不维护不可鉴证的Plugin私有状态。

尚无获准语义置信策略时，Runtime IR组装明确拒绝；不复制Syntax 0.5、不用null/缺字段假装Canonical Runtime合法，不默设阈值。这是产品必需项仍OPEN，并非移入后期Phase或取消门禁。后续基于Fixture/Evaluation选择策略、同步设计后才能产生完整Canonical候选，由Application鉴证并AUTO发布；MANUAL语义/Capability/BusinessFlow/Wiki边界保持。

## 7. 合并执行与最小验证

推荐两条相依的设计/实现线统一编排：A最小绑定证据（版本→真实生产→映射/持久化），B四框架+严格领域草稿（共用绑定器→四规则→集中验收）。本会话仍顺序；B的独立逻辑Fixture设计可在不依赖真实Native运行时准备，但不自行并发长测。

每条线先形成完整具体合同/文件清单/独立oracle/批准范围，再一次审查实施包；不逐字段、逐框架或逐测试审批。真实Rust/Native/捕获的准确批次、置信数值和云端CI/Git写入保留各自必要审批，不把本方向批准视为运行授权。

覆盖依据：原p1-syntax-contract-v1及p1-plugin-context-v2等既有Fixture根；新增子目录即可，不先增ID/全局计数。独立源要同时证明正例与for/delete/条件/alias/Java导入variant/HEURISTIC负例。支持闭包、顺序扰动/幂等/删除重算共用一次矩阵，不给每个语法节点复制恢复/资源全套。

开发跑改动的直接行为；收尾集中跑受影响新旧版本、原绑定/历史控制、注册/架构与范围格式。代码/输入/环境匹配且契约允许时复用已有门禁，不为新文档再跑完整回归或校准。无法取得新实际产物时诚实保留缺口，不造golden代替。

## 8. 当前需要集中决定的事项

推荐确认：补齐§4最小绑定证据与明确解析等级；保留旧版本/原门禁；四框架统一输出严格草稿，置信策略未获准前不组装Canonical Runtime。允许据此继续完成精确字段/版本/身份/Fixture和合并实施包设计，不授权编码或实际运行。

不应批准一个尚缺准确schema/AST义务/API矩阵/候选字段的“全包实施”。相关工作不是任务困难而暂停，而是实码揭示先前合同不足，按AGENTS设计治理先集中修订。审查仍为作者审查，无新增代理。

父任务4/21、P1-04..07/E01/E02/Phase1与A6资格不变；SQLite authoritative、provider-independent Canonical IR、LLM candidate-only、AUTO/MANUAL及ExecutionGraph→RuntimeFlow→BusinessFlow保持。历史timeout UNKNOWN、旧link失败/main取消未查/R4限制保持。
