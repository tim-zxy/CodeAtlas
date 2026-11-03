# B-F2-B：绑定充分性观察到版本化历史的集中设计

状态：B_F2B_BINDING_PIPELINE_LOCAL_EXIT。承接已完成的[B-F2-A精确合同](2026-10-30-phase1-binding-sufficiency-contract.md)，本文件与[集中包](../plans/2026-10-30-phase1-binding-sufficiency-pipeline.md)已获用户明确批准。已批准顺序实施及计划内本地验证；未批准云端CI/Git写入。

## 1. 目标、选择与边界

目标：固定私有wire7库观察→完整字节流核验→Syntax3归一化→不可变origin/current历史→Stage/Store→重开读取→Plugin V4 context，保留同账本、COMPLETE发布门禁和旧版本。不是四框架绑定器/extract、语义置信或Canonical Runtime发布，也不新增公开混合路由或物理运行资格。

推荐复用现有管线，内部由明确版本选择替代不足以表示三种模式的bool，旧固定wrapper行为不变。复制v7管线会重复预算/异常恢复；覆盖旧v6则破坏旧捕获和历史。只做producer虽可独立测试，但无法验收后面的支持与持久衔接，因此合为一个顺序批次。此为作者推荐，不冒称用户已批准新增合同。

不增加依赖、生产配置键、预算默认值、profile/校准/新数值、SQL迁移或新Code节点种类。不调用Git、analyzer CLI、harness/helper/collector、模型、云端或Git写入，不接触R4。局部Rust库测试和受控临时SQLite将纳入一次实施审批，不能从前包授权推定。

## 2. 实码差距与责任点

|当前责任点|当前行为|本包必要变化|
|---|---|---|
|binding_syntax.rs / code_syntax.rs / code_syntax_producer.rs|固定v6；共享core以bool选择5/6|新增固定7库入口；共享core明确选择5/6/7；旧失败信封保持原版本|
|python.rs / java_syntax.rs|已有五kind、v2 scope/直接右值；缺import形式/效果/完整scope和control|按A§4枚举，所有新观察参与预算；有漏项就PARTIAL|
|native-code-syntax-request/stream、native-observation-codec|快照类型只5/6；budgeted Readable分支硬编码6|固定7快照和完整reader；内部选择贯通，禁止仅改版本后交旧parser|
|syntax-normalizer-core|固定旧kind映射、v1/v2身份；callee精度丢失|v3全字段与新引用映射、新域、支持闭包和明确策略适用条件|
|syntax-history-candidate / activation-history-format|envelope只1/2，三历史域按1/2|严格3分派和原origin保持；不变SQL/body/manifest schema|
|composition/delta、Runtime、mixed-analysis-stage|按v6选择mapper/parser/raw一致性|新增固定7工厂及Stage独立重核；旧固定入口不扩义|

此表来自当前源码，未执行新producer，以下语法正反例为待实现oracle，不声称实测结果。

## 3. 固定wire7与库边界

Rust新增binding_sufficiency.rs：BindingSufficiencyRequest，decode_binding_sufficiency_request(bytes)，write_binding_sufficiency_observation(request,control,output)，serve_binding_sufficiency_request(bytes,control,output)。参数/错误沿binding_syntax对应类型，仅新wrapper固定7/SYNTAX_BINDING_V3；lib.rs导出库模块，main/CLI dispatcher不变。

共享核心明确区分CodeSyntaxV1(5)、BindingV2(6)、BindingV3(7)，不是可扩展插件注册表。旧bool wrapper如需保留则只映射原两种选择；不得让请求字段自行获得新入口授权。TS同样显式5/6/7分派，公开旧入口保持固定。

wire7完全沿原事件顺序、requestId/sequence、LF/UTF8/行长、requestChecksum、started/completed owner/Source回显、事件counts、terminal checksum、重复/跨文件/缺失coverage、Code+Syntax组合outcome规则。STARTED/COMPLETED固定syntaxContract；SYNTAX_OBSERVATION使用A已实现raw schema。新增scope不另造事件类型。失败仅沿既有错误码；单个PARTIAL scope必须令相应Syntax文件coverage及最终syntaxOutcome/outcome为PARTIAL，不能以完整Code或schema有效转为SUCCEEDED。

完整reader输出ValidatedBindingAwareObservation（request固定7，SYNTAX_OBSERVATION payload为BindingAwareSyntaxObservation，其余事件沿旧结构且固定7），并保留原始字节outputIdentity；不是修改JSON版本后重序列化。reader按provider ref检查每文件scope subject唯一、父链/范围与非null lexical/target引用存在；缺闭包的SUCCEEDED拒绝，Code种类/完整语义仍由后续Canonical/Stage核验，不据raw凭空认证。纯reader可以保留合法PARTIAL供诊断；composition/发布仍拒绝INCOMPLETE_OBSERVATION。

## 4. producer枚举及scope/control

严格履行A§4，不更改Python Code V1能力。对每个实际合法MODULE/TYPE/可调用Code scope发唯一BINDING_SCOPE，范围为完整AST作用域范围（不是Code name范围），parent为真实合法外scope；MODULE借已核验owner map/path/fingerprint，不按位置猜owner。Python class/lambda/comprehension无合法Code scope时不造节点、不回退外scope，文件与受影响合法scope保留PARTIAL/限制。

控制分类只描述语法效果：分支/循环/条件表达式/异常处理内观察为CONDITIONAL；遇无法分类的控制祖先为UNKNOWN并保留限制；已证明无条件才UNCONDITIONAL；BINDING_SCOPE结构记录恒UNCONDITIONAL。函数名建立属于外scope；参数绑定属于新函数scope，默认值/decorator求值保持外scope。Java块内名可保守提升为所属合法scope的冲突（限制明确记录），不得据此给正绑定；未知target/name仍PARTIAL。声明range必须处于其lexical scope观察范围。

Python import按AST保留模块导入与alias、from导入、relative、wildcard；保留既有Code IMPORT与alias兼容记录，但不得把同一普通赋值再发成BINDING_EFFECT。Java从import_declaration的static/asterisk语法判形式，不从Canonical hint倒推。普通赋值/函数/参数/TYPE用既有ASSIGNMENT/DECLARATION；for/with/except/pattern/walrus/delete/augmented/global/nonlocal按A的effect，无法枚举则显式限制。参数名在既有CALLABLE.parameterNames可完整承载时不制造第二条同义记录；独立typed参数仅使用真实参数类型，不能使用return type。

GLOBAL目标只同文件MODULE；NONLOCAL只有能从明确祖先声明证明的callable scope才填ref，否则null并PARTIAL；绝不因最近父函数存在就认为目标已证明。普通效果目标为lexicalScope；目标scope闭包必须存在。异常目标的自动失效由EXCEPTION_TARGET保守影响整个名字，不假装只有赋值。复杂解构可不求解，但必须PARTIAL，不能静默忽略。

实施前从锁定grammar node-types建立与独立Source oracle对应的枚举表：绑定形式→观察或限制、control分类、所属scope、预期coverage。默认未处理绑定构造不得COMPLETE；普通无绑定表达式不因缺专用分支一律PARTIAL。沿现有AST walk/tick/depth/cancel/bytes预算，新增遍历/记录也计费；不建CFG或通用数据流引擎。

新providerSyntaxId沿各语言原长度前缀哈希法，域python-syntax-v3 / java-syntax-v3；tuple为path、kind、startByte、endByte、同site语义区分值。区分值为新payload的排序键JSON（对象键精确排序、数组保序），防止一site多个名称效果相撞；只是provider局部身份，不进入Canonical key。旧v1/v2域及tuple不变。

## 5. Canonical映射、身份与Syntax支持策略附约（待批准）

新增固定normalizeBindingAwareSyntaxObservation(input:unknown,context:CodeSyntaxCompositionBudget):SyntaxEvidenceV3，输入沿现有basis/sourceFile/raw/selectedNodes/bindings/supports/extractorVersion精确结构，extractorVersion仍syntax-v1。只接受A raw3；owner、scope、parent、target和callee引用必须经ProviderFactBinding+Evidence+FactEvidence+当前选定Code证明。模块null范围仍核对自身path/fingerprint；不根据名称制造ref。

保留八kind全部字段；callee.target.resolution原样进入Canonical resolution；supportRefs包含Source及全部引用Code，摘要按现有支持域/当前值产生，重投影不能丢新引用。统一引用遍历用既有模式，不能递归复制整套平台。parseSyntaxEvidenceV3为每条返回前校验；V4集合级scope闭包在最终候选冻结和持久读回时验证，不能以单条parser代替。

语义key域syntax-key-v3，tuple沿v2的repositoryId、sourceFileId、fingerprint、range四坐标、syntaxKind、meaningDigest。meaning={owner,lexicalScope,controlContext,payload}，所有Code ref递归压缩为{kind:CODE_NODE,id}（不含provider/revision）；新scope/effect引用同样压缩，callee.resolution保留。meaningDigest沿historyDraftDigest，canonical排序/编码沿既有方法。extraction域syntax-extraction-v3，版本tuple=[syntax-v1,syntax-canonical-mapper-v3,syntax-surface-support-v1,SYNTAX_BINDING_V3]。新字段变化须改变key，provider名字变化在等价Canonical输入下不改变key。revision变化仍只影响projection，不重写origin意义。

提出将既有syntax-surface-support-v1的“声明式表面支持”含义应用到v3八kind，不增加/调优任何分数：沿既有固定score=0.5/method与弱支持上界；任一所需Code支持低于该值则拒绝，不能抬分或改为min。前三reason保持原顺序；owner/scope为null及callee/value非精确/UNKNOWN按现有v2条件追加原token。scope PARTIAL、control与限制保留在payload/common，不伪造高置信或语义reason。该分数不表示完整绑定/语义正确概率。

这一条件适用扩展已获本次明确批准，并以J3独立八kind向量/弱支持拒绝及真实库桥验证；A的15项仍仅证明结构，不能充当本包新mapper证据。J3须以独立向量证明：支持齐全与相同支持域/弱支持上界、新引用缺失必拒绝、PARTIAL不获得发布资格、新kind与旧kind同类映射条件无差别。批准本附约只允许按这些条件实施和验证；缺证据或发生原策略冲突就停相关映射并保留raw，不默选新分数。旧policy数值/旧parser/旧历史不变，不选择Runtime语义策略。

## 6. 历史/组合/Stage与恢复

v3 origin/current继续使用body schema1、manifest schema1、SQLite11；精确域codeatlas-syntax-initial-v3、codeatlas-syntax-origin-v3、codeatlas-syntax-projection-v3。仅接受envelope1/2/3；未知版拒绝；每个pair按origin自身版本计算，不能以当前策略重写旧origin。v3 mapper/pair/retained明确选择3；兼容manifest可包含旧祖先，原1/2工厂仍严格。

新增固定BindingAware composition/delta/rules入口，精确要求wire7/SYNTAX_BINDING_V3/mapper3；共享内核分派，Java完整候选及settled owner核验、owner digest、unit/dependency/删除投影/覆盖和同账本续接保持。升级合约即使Source未变，也按原规则重新观察所有Native单元，不能NO_OP。DELTA retained重查当前Source/Code/支持与scope闭包，当前v3候选不能夹旧Syntax版本；旧祖先只按原版本读取。

Stage独立验证raw、metadata、contract、origin、envelope版本7→3以及全部字段；整集合用V4结构/闭包等价规则核验，避免Runtime单方面声称scope完整。存储层只复用IR/本层函数，不导入Plugins；V4的scope集合规则若需要共享，提取为IR中一个实际共用的验证函数，并由V4与Storage调用，不在两层复制算法。函数输入为已知Code/Source/reference上下文及Syntax3数组，输出void/IR_VALIDATION_FAILED；有界调用前按原账本收费，旧版本不调用。

Store事务/锁内CAS/ABA/seal/lease/未知提交只读判定/last-good不改；失败费用保留。新增字段写入失败验证一次完整原子回滚；未改Store无需重跑原全部故障/退出矩阵。持久读回重建v3完整集合闭包，不能单条都合法却允许缺scope/父环被当成可用历史。PARTIAL原始流只能诊断，不能绕过现有发布门禁。

## 7. 验证、独立性与有限退出

独立Source oracle先冻结：Python正常alias/direct/decorator/参数及效果遮蔽、条件、非局部/未知scope；Java普通/static/wildcard、TYPE/参数/局部遮蔽/块/lambda。每类明确期待COMPLETE或PARTIAL，不能为了正例通过删除限制。所有A§4行均有观察或限制证据；无需把同一预算矩阵复制到每种语法。

TS声明式完整正例和Rust库实际输出分开保存。实际库输出可证明源到raw/reader/mapping/V4；只有真实临时Stage/Store重开才能证明历史原子链。普通注册不依赖未提交.superpowers；捕获存证可由获批库测试产生，不由产品反写expected。库捕获不冒称analyzer CLI/物理资格/profile。

只接受B_F2B_BINDING_PIPELINE_LOCAL_EXIT，须所有J1–J5及新策略适用向量通过、旧版本控制/适用门禁通过、治理文档同步。父任务4/21、P1-04..07/E01/E02/Phase1保持OPEN；A6 NOT_QUALIFIED、profile空、Native超时UNKNOWN等风险不变。下一包才是共用绑定器和四框架规则，语义置信/Canonical发布仍独立门禁。

## 8. 本次集中审批与治理

用户已一次批准本设计（新身份域、Syntax策略适用附约、共享集合闭包及历史3衔接）与J1–J5本地实施，包含定向Rust库测试、受控Source读写/临时SQLite、原范围缺陷修复和必要复验；不固定机械运行slot，发生失败先定位，修改后做范围匹配复验，不无变化反复重跑到绿。排除CLI/独立Native/helper/collector、校准/profile/新数值/依赖、云端CI/Git写入/新代理。确有FROZEN冲突、新分数/范围/真实运行才集中另审。

获批后在产品前同步ADR-020、CANONICAL_IR、NATIVE_IPC、PLUGIN_SPI及既有R011/Stage受影响段、authority/traceability/acceptance；EVOLVABLE策略适用要记录Fixture结果，证据不足不宣称已接受或完成。作者设计审查与计划自审见集中包；无新代理。

## 有限实施出口 — 2026-10-30

[最终范围/作者审查/失败与修订](../reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)。新Root19/19、Rust3/3（Source17例/两资源控制）及声明门禁已通过。单条Syntax仍用parseSyntaxEvidenceV3；已解析集合用validateSyntaxBindingScopeClosure，H1/Stage通过validateSyntaxProjectionClosure复用已核验pair返回值，无新SQL。TS兼容shim将原false/true固定映射5/6，新7显式选择；不让旧wrapper按输入自升级。

Source定位同时核对AST kind与range，避免EOF共范围误选根；scope/control/nonlocal祖先及import访问与记录共用maxItems，新增记录在保留前检查items/bytes。Java合法compilation-unit MODULE按既有ID单独证明；无合法父scope/嵌套块保持限制。既有数值、旧版本/历史与所有质量门禁保持。

本出口仅覆盖实际库bytes到reader（Java/Python）、四个完整Python来源到Syntax/V4、声明式真实临时Store链；不证明实际生产整次Source/Native/Store物理资格或四框架语义。


## 已批准执行次序补充 — 2026-11-02

[按需scope修订](2026-11-02-phase1-demand-driven-scope-design.md)以当前资源拒绝/静态未使用数据流及独立回归为依据获批实施。augment第二轮仅在TYPE/import/effect实际消费者存在时计算scope；所有真正执行的scope/control/tick、原限制/保留量/最终scope闭包继续原预算。无缓存、cap/字段/意义或旧协议变化。17既有wire7完成流字节不变；Spring同cap完成但PARTIAL，不能推广为完整语义/生产资格。
