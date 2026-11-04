# Phase1 A/B 连续实施评审与门禁映射

日期：2026-11-03。状态：LOCAL_COMPONENTS_VERIFIED / A_B_EXIT_HOLD。作者评审，不冒称独立评审。原 U0–U7 和 Runtime 容器最小修订已获批准；禁止新代理、Git写入、云端CI和额外物理运行的边界保持。

## 结果与准确范围

已实现 wire8/Syntax4/Context5 的严格字节、规范化、历史、Stage、四框架、调用点计划、Graph/Flow V2、Application授权与Runtime固定组合，以及真实owned SQLite联合提交、重开、增量/删除/保留和NO_OP。生产bootstrap/CLI/DESCRIBE未自动升级；实际Native进程资格仍不可用。

修复前的一次去重收尾批次：25个Node测试入口，430项中428PASS、2个既有条件桥接SKIP、0FAIL/0CANCEL/0TODO。两项跳过分别是依赖额外实际库输入的v7 Source桥和Python Syntax3/V4桥；本轮未启动它们，不计通过。八包IR/Contracts/Providers/Plugins/Execution/Storage/Application/Runtime构建、IR声明类型检查和17项目架构检查通过。40个本批文件范围格式已执行。31项Native冻结源码/锁/旧IR边界身份均匹配，作为复用既有U2证据的依据，不是新Native运行。

唯一索引：.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json；准确命令清单和输出：ab-local-closure/final-local-scope.json、final-local-tests.log、final-builds.json、final-ir-types.log、final-architecture.log、final-format.log、final-immutable-identity.json。旧失败、原始Source和Fixture根全部保留；重叠历史测试数不相加。

## 实施与契约核对

|责任|实现及证据|结论|
|---|---|---|
|身份与严格版本|provider-independent syntax-key-v4、extractor2/mapper4/policy2；旧1..7、Syntax1..3、V4入口不自动接收新版本；独立结构/支持/错误控制|组件通过|
|Code CALL与回调|只连接同owner、精确calleeRange且唯一的真实Code CALL；callback保留真实handler、callbackScope和UNKNOWN控制，不造lambda Code节点；V2只消费精确角色的边，不改Code图|组件通过|
|参数/框架|显式参数只索引一次；Autowired仅所需TYPE；Depends仅直接默认值且provider唯一；Mongo保留database/collection来源及有界handler；Feign调用点owner与接口声明分开；Kafka不造无声明入口|组件通过|
|共享上下文覆盖|每个固定工厂列出未证明的Syntax引用；Application只有另一固定规则已证明同一site时才合并关闭，硬限制仍保留；未知调用继续PARTIAL，其Syntax以当前摘要外部引用保留|纯组合正反控制通过，不是新的Source捕获|
|V5 SPI/固定路由|基础Context5不变；私有extraction continuation传递既定syntaxMembershipDigest，两候选携带同一site-plan；descriptor使用已有FRAMEWORK_SYNTAX_OBSERVATION_V1和语言Code facet；不伪造SYMBOL广告|组件通过|
|预算与授权|同Stage/live lease预提交视图延续原账本，外来lease/小预算拒绝；候选与plan累计计费；Application先授权后读取，拒绝权限不消耗发布lease|组件通过|
|存储容器|SQL schema_version保持1；JSON严格{formatVersion:2,identity,candidate}，旧{identity,candidate}字节格式保持，未知/混格式拒绝；V2候选/策略/plan摘要认证，旧入口不吞新格式|联合提交及只读重开通过；迁移未改|
|恢复/保留|初次SQL版本冲突四表回滚0；原失败保留。OTHER新增/修改仍FULL回退；已有OTHER删除路径保留immutable origins，更新Runtime后正确NO_OP；Python changed-unit及native删除由明确RECORDED_REPLAY进入真实Stage/Store|组件通过；不冒称新Native观察|
|跨仓|独立J7/P5 owned根、真实SQL RevisionSet/RepositoryRuntimeBinding、显式inventory身份及原matcher/V2 stitch；PARTIAL被实际workspace Store拒绝，无新workspace activation|负向通过；正向验收HOLD|

私有Runtime准备/冻结发布和已提交刷新复用同一V5工厂/Application派生。Runtime未增加对IR的直接依赖，Application不导入Plugins/Storage；SQLite继续权威，向量可重建，LLM candidate-only和AUTO/MANUAL边界未动。

## Source正向跨仓缺口（不能签收）

J7调用与P5 provider的方法GET、路径/items和显式service=inventory相符；但两侧query/request/response schema refs均为null。原matcher因此产生两项UNRESOLVED/SCHEMA_COMPATIBILITY_UNPROVEN，V2 stitch为PARTIAL，实际ContractStore拒绝WORKSPACE_RUNTIME_PARTIAL。证据：crossrepo-store-guard.log。接口声明和真实proxy调用点是两条消费合同，不能只挑一条或用另一不相符路径冒充命中。

不得将这个负向测试的PASS写成MATCHED、E05/E06通过或整包退出。保留原严格schema兼容门禁；没有以Code节点冒充schema、按名称猜schema、填占位ref、修改六种匹配结果或降低阈值。正向Source匹配需要先有可认证的兼容schema依据；当前合同没有这条Source生产/引用链，不能由实施者猜测补齐。

## 原任务与Evaluation追踪

|原目标|本轮可确认的能力|仍未满足|
|---|---|---|
|P1-04 Native/语法|原U2真实12Source库观察10COMPLETE/2PARTIAL、7Java Code，38份可携带流；本轮映射/完整及增量历史/Store|完整ACTUAL_PRODUCT、A6/profile/生产资格；不关闭父项|
|P1-05 Spring|路由/prefix/Scheduled、所需类型依赖、Feign声明和调用点；当前支持与拒绝控制|原E01/E02整体Source/critical门禁及生产路径|
|P1-06 Mongo|读写、明确数据库/集合watch、有界真实handler、EVENT语义|全部原Source/Evaluation/生产门禁|
|P1-07 Kafka/FastAPI|真实支持的send/listener、app/router/prefix、默认Depends；annotation/shadow/动态与不明来源保留拒绝|完整适用Source/critical门禁|
|P1-08 ExecutionGraph|V2明确LOCAL_DECLARED_RUNTIME，普通未解析调用仍PARTIAL，已声明外仓HTTP保留NON_RESOLVED/CROSS_REPO_RESOLUTION_PENDING；旧五context/异步控制保留|系统正向跨仓及原完整退出|
|P1-09 RuntimeFlow|稳定全step/支持引用、实际SQLite重开；ordinal不被解释为运行时间|系统E2E/实际资格及全部原退出|
|E01|库级与RECORDED_REPLAY/owned组件证据逐层可追踪|不等于全生产Source执行|
|E02|未新增分母、分数或阈值|NOT_EVALUABLE，缺批准critical baseline|
|E03/E04|受影响旧context/异步/step控制及V2请求/事件/角色/取消/预算控制通过|不替代系统Fixture全部critical probes|
|E05/E06|原六类匹配Fixture/旧stitch兼容通过；真实双仓当前负向拒绝可复现|正向Source schema兼容和实际匹配未通过|

## 收尾状态与合并推进策略

- U0–U4的上述本地组件已实施并通过范围匹配检查；U3含真实changed/removed/retained/NO_OP。
- U5单仓联合/刷新和双仓负向闭包已有实际组件证据；正向跨仓未满足，U5不整体标完成。
- U6本次去重验证完成；U7作者评审与文档同步完成。没有独立评审、全仓verify或新的Native/CI。
- 原父项仍4/21接受、17OPEN；A/B整包及Phase1不签收。旧Native超时根因仍UNKNOWN，main取消最终状态未重新查询，R4 mutable DB未复用，A6 NOT_QUALIFIED/C2原限制保留。
- 后续按一个合并设计包解决Source schema证据/兼容证明与正向跨仓probe；不得把尚未存在的Schema能力或数值静默塞入本包。A6/生产profile和E02 baseline分别仍需其准确授权，C/D只可在原Roadmap范围设计，未获编码授权。不再为原范围修复、测试或文档单独索取审批。


## 作者评审修复与最终范围复验

已提交集合刷新另补实际调用断言：Runtime activation 前进而 Syntax activation 保持，facts 一致；refresh2-proof.log 为 1/1。随后作者审查发现 Autowired 多必需参数仅部分类型可证明时，旧循环会因任一成功而错误关闭整个 site。独立纯修改 Context 先复现 COMPLETE（required-type-red.log），最小修复先完整证明所有必需类型再输出该注入点；缺任一项保留 FRAMEWORK_DEPENDENCY_UNPROVEN 和未验证引用。没有猜 bean、缺失类型或降低支持门槛。required-type-green.log 为 1/1。

修复后只复验受影响的七个 Plugins 文件和一个 Runtime 联合发布文件：review-fix-regression.json 记录准确命令，review-fix-regression.log 为 **205/205 PASS，0 FAIL/CANCEL/SKIP/TODO**；包含旧 V4 兼容、四框架/未知/支持/预算、共享 Spring+Mongo 正反例、真实联合发布/已提交刷新/重开/增量/NO_OP及跨仓拒绝。Plugins 新鲜构建 exit0（required-type-build.log），架构17项目通过（review-fix-architecture.log），源/测试具名格式检查通过。此前430项收据保留，不冒称修复后重新执行全部25入口，不相加计数。其余包源码未因本次修复改变，沿原八包构建与IR类型收据；修复身份见 review-fix-identities.json。

本批实施裁定保持：私有续接既有 membership digest、使用实际已广告的 provider facet、OTHER 新增/修改保持 FULL 回退；未弱化设计/预算/Fixture。共享覆盖仅合并固定规则对当前同 site 的真实证明。正向 schema 缺口不以补占位引用解决。全部裁定的依据、限制和错误成本仍为严格拒绝/无法发布，不授生产资格。未新增待修 minor 项；这是作者审查，不能替代未来整分支独立评审。


原合并路线中合同注册/基础跨仓属于 B（P1-06..09），C 为 Markdown/ADR 与语义知识发布；本缺口仍归原 B 的证据闭包，不借机引入全局通用 Schema Registry 或 C 的产品实现。
