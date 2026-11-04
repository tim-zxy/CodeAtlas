# A/B剩余框架证据与发布闭包：统一契约草案

2026-11-02；DESIGN_IN_PROGRESS，未授权新产品合同。沿原P1-04..09，原4/21接受、17OPEN保持，不改变Wiki/知识后继路线。

## 1. 已解决与本轮新证据

按需scope改动已获批并本地退出：Spring原cap完成观察，但PARTIAL；17旧流字节一致，准确结果见2026-11-02-phase1-demand-driven-scope-implementation-review.md。新的Spring流保留29条Syntax；本轮只读追踪java_syntax.rs的所有partial赋值分支，确认Source的this.repository = repository左值为field_access，现有assignment_expression分支仅处理identifier，其他左值直接置partial且不发ASSIGNMENT。这是一条确定的基础PARTIAL触发路径，但尚未用新实际运行证明修订后所有PARTIAL均消失。

现有ASSIGNMENT.targetName允许this.member，emit已提供DIRECT_VALUE/valueRange；framework-bindings.ts已有memberWrites保守拒绝。所以不需要为普通成员写新增Runtime IR，不能只去掉partial而不记录写入，否则可能漏掉接收者被替换的证据。

本轮沿原B离线Fixture/Source许可，新增MongoWatchSource.java与独立watch-obligations.json，仅追加原p1-mongo-v1两路径。该Source明确client.getDatabase(atlas)→database.getCollection(events)→collection.watch().forEach(lambda→handle)，不是产品输出或实际运行结果。旧MongoSource及所有旧向量保留；其collection只是方法参数，不能借其他read/write方法中的events认定watch资源。35项Manifest/Registry检查通过，无新Fixture ID/critical分母或阈值，不代表watch能力通过。

## 2. 一次治理的修订边界

|能力|可复用结构|所需最小证据/行为|拒绝或未知边界|
|---|---|---|---|
|Spring基本覆盖|现有ASSIGNMENT/控制/成员写索引|记录简单this.identifier = value，保留精确target/valueRange和控制语义|array、复合/动态receiver、未知左值继续PARTIAL；记录成员写不证明注入|
|普通Java构造|现有UNKNOWN与scope/typed声明|区分无匿名class_body的普通构造与匿名类；将“结果值未知”与“名称/表面枚举不完整”明确区分|未知值不变已知对象；lambda/匿名/未建模绑定继续限制；不泛化Python历史例外|
|参数与依赖|CALLABLE.parameterNames、TYPED_BINDING、Code TYPE/CALLABLE、现有DEPENDENCY binding|参数归属/顺序/类型及default/annotation角色；provider/注入目标需当前Code声明和无歧义scope证明|不按名称相同推理bean、不将注解Depends当默认注入；多候选/遮蔽保留未知|
|Mongo资源|声明式receiver、静态字符串、现有DATA_RESOURCE|数据库与集合由实际getDatabase/getCollection来源链证明|参数或动态名称不借其他方法常量补齐，不将相同名字视为同资源|
|Mongo订阅/handler|INVOCATION/argument范围、已有DATA_WATCH和DataChangeTrigger|watch结果作为forEach receiver、callback槽位/body或引用到真实handler的直接证据|目前lambda没有完整合法scope；不能通过把body scope改外层来绕过，不能构造Code lambda节点|
|完整候选|现有Runtime/FrameworkBinding schemas、支持/身份规则与Store|补DEPENDENCY/DATA_WATCH消费者，按逐规则义务判覆盖并组装已验证事实|不能仅删DOMAIN_RECORDS_ONLY/DECLARATION_ENTRIES_ONLY，不用COMPLETE替换缺规则|

## 3. 表达关系的最小草拟方向（尚非schema权威）

先复用现有range/decl/ref，不建立通用AST图/数据流引擎。

- 参数记录需要callableRef、name、ordinal、declaredType|null、defaultValueRange|null、annotationRange|null。仅直接默认值范围等于Depends调用范围才有参数默认注入资格；注解调用单独保留。默认值求值scope仍是语言规定外scope，参数名字绑定scope仍是callable，不能用owner替代两者差别。
- 调用值关系仅表达直接语法连接：consumer调用site、producer调用site与关系RECEIVER/ARGUMENT；端点为同Source/fingerprint的明确Syntax kind+完整range，并必须唯一对应真实观察，不根据距离或名字拼接。
- callback关联必须区别“把调用返回值作为参数”和“把函数作为回调，调用位于函数体”。lambda→handle不能伪装成ARGUMENT(handle返回值)。应记录callback范围/参数及body角色，或仅支持可证明的method-reference；二者需独立Source正反例决定适用子集。
- body/free-name的作用域闭包是实质前置：若现有合法Code scope无法承载lambda，应明确设计独立的有界callback证据或继续拒绝，不能制造Canonical Code节点或默填父scope。新增角色字段本身不证明这个闭包已经成立。

新kind/字段若需要升级Syntax/wire/context，必须一次性给出严格schema、provider-independent identity、旧版本兼容、normalizer/history/Stage/Store传播和升级强制重新观察；不先写wire8/Syntax4占位代码，也不把ARTIFACT或任意JSON当逃生通道。

## 4. 名称和类型证明

同文件唯一CALLABLE/TYPE声明可以参与正式名称绑定，但必须有独立Code/Evidence支持、完整scope、控制和shadow/write检查。Syntax的UNRESOLVED引用仍原样保留，新的局部绑定证明不能冒称provider升级成EXACT，亦不改Canonical调用图解析等级。

Java参数类型须来自formal_parameter的真实type，不从return type/变量名推断。参数显式记录与旧CALLABLE.parameterNames不应制造两个独立定义；新版本集合级规则须验证名字/顺序一致或保留缺失限制，再在单一索引责任点消费。不在producer和每个框架分别实现名称解析器。

Spring @Autowired声明本身不等于运行时bean选中；只有类型/候选scope和qualifier等所需证据充分时产生依赖binding。接口多个实现或当前仓库外目标不得选第一项。

## 5. coverage与发布闭包

覆盖矩阵必须区分：Source/Code/Syntax枚举完整、框架声明已识别、领域事实/边界有支持、图/Flow/Store输入闭包，以及语义知识发布。任何一层不能替另一层签收。

每个相关Source site必须有明确处理结果：已生成且可验证、已证明不适用、已知不支持/动态/歧义。无关普通调用不自动成为框架缺失；但也不能不经框架归属判断把相关未知调用过滤掉。完整清单/支持/诊断由一次集合验证负责，不在每层重复复制。

当前runtime基础跳过DEPENDENCY；binding-candidate还未生成DEPENDENCY/DATA_WATCH；Mongo规则只支持find/findOne/findAll/insert/save，Spring尚无Autowired规则。现有正式IR已经表示这两种binding，优先补真实消费者，不新建同义实体或新Runtime IR。

候选只有在所属规则义务、输入完整性/支持与实际适用范围全部成立时才有完整激活资格；PARTIAL仍保留last-good、不得Apply。原0.5规范支持策略不代表经验概率，本草案不选择新分数。AUTO Runtime事实/MANUAL知识与BusinessFlow/Wiki边界保持。

## 6. Source/Fixture/Quality Gate映射

- Spring this.field：原SpringSource的constructor负证据→独立简单成员写/复杂写/接收者重写反例→AST生产与原memberWrites拒绝。未做实际新捕获。
- 普通new：原KafkaSource＋匿名类/参数lambda负例→scope与UNKNOWN枚举语义；不能删未支持构造限制转绿。
- Depends：原depends-default/depends-annotation＋routes Source→参数角色/provider目标/遮蔽反例；原FASTAPI-ANNOTATION-CONTROL必须保留。
- Mongo：旧MongoSource未知资源控制＋新增MongoWatchSource明确资源来源→result/receiver/callback/handler角色；watch-obligations为Source义务，不是已批准critical baseline。
- 发布：原runtime-storage/四框架/ExecutionFlow/Contract/跨仓Fixture及原E03..E06→实际Source到当前SQLite Context/四插件/图/Store；保留预算/CAS/lease/unknown commit/last-good，未修改相关模块时不重复全故障矩阵。

四框架当前字面Fixture的criticalFacts/qualityGates为空，必须回连原E2E/PHASE_ACCEPTANCE的critical清单；这里不补造数值、分母或直接签收。核心precision/recall和真实资源资格仍按原门禁。

## 7. 合并执行及本轮退出

继续原五交付批次。先把本表的参数/调用/callback严格字段与身份/作用域规则定案，再形成一份跨层实现包：独立oracle→producer/reader→normalizer/history→插件→Stage/Store→实际Source/原验收。批内普通实现/Fixture/范围测试/修复/文档统一执行，不按字段或框架再拆审批。

尚未定案项是callback作用域证明、依赖目标绑定、完整site覆盖判定及新字段版本传播；它们决定产品语义，不能用“先全包批准、实现时再猜”替代。Spring简单成员写已有字段并不足以证明整个四框架发布闭包，所以本轮不再单独申请该微修订。

本轮退出仅离线准备/草案：新增Source/义务与Manifest路径，35/35结构检查，旧向量/Source/门槛保持；未执行Source、Rust/Native/helper/collector/模型/DB/CI/Git，未改producer/覆盖/评分。后续本草案须成为精确合同再进入集中审批，当前不是implementation-ready。
