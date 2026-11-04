# B-G1实施与作者整链评审

2026-10-31；用户在精确设计/G1–G4集中确认问题后“继续”，授权该整包及独立runtime-execution-declaration-v1的0.5/HEURISTIC声明支持约定。结果仅B_G1_DECLARED_EXECUTION_LOCAL_EXIT。作者顺序整链评审，无独立代理评审；未执行Git、云端或真实观察。

## 已交付与证据范围

三个私有模块：
- Plugins framework-entry-candidate：只从本次固定领域compiler的有效HTTP provider、Kafka consumer、Scheduled JOB生成入口；producer/Mongo不造根。旧B-F3未知输入入口委托FromValidatedContext，旧输出保持。
- Execution declared-execution：独立IR/Code输入边界，一个入口一个REQUEST/EVENT/JOB context；ENTRY直接target实际owner Code，无伪dispatch CALL。同context节点唯一，EXACT CALL沿真实目标展开；HEURISTIC/AMBIGUOUS/UNRESOLVED/UNSUPPORTED保持非解析目标与实际候选，环回引。
- Execution declared-runtime-flow：每个真实可达图节点一步，候选节点不视为已执行。无压缩器/权重，ordinal仅呈现；不把CALL扇出当branch或topic同名当异步边界。

policy、身份、支持与累计预算均按[批准设计](../specs/2026-10-30-phase1-declared-execution-design.md)。新记录固定0.5/HEURISTIC为规范约定，不是概率测量；不改原Code/Syntax/领域置信。graph/Flow输入只有声明一致性，不认证真实Source或Store。public index、IR/SQL/旧迁移/实际profile不变。

## Fixture与TDD

既有p1-ir-contract-v1增加declaredExecution两路径，14个独立声明输入，未加ID/capability/计数门槛。预期拓扑、角色/上下文、精确身份/step键、loop及手写遍历顺序在产品前冻结；通用字段/引用与支持由测试显式字面断言和冻结输入核对。未将compiler输出反写golden。

预期材料分布在JSON和测试断言，而非存一份巨大完整输出副本：避免复制Runtime parser/全部支持inventory作为第二实现。后续作者审查补强支持全集/锚点断言，Fixture预期语义始终未变。expected JSON原冻结字节经原JSON2格式重建一致。

API RED原样保留；前置Context校验PASS。初始四文件单独执行时，Flow/组合import图测试使图测试在独立进程重复注册；不是独立样本量。最终唯一root只import四文件一次，Node模块缓存去重，准确54项。

## 失败根因与修复

|记录|根因/处理|后续证据|
|---|---|---|
|link.log|本机pnpm11.25.0（manifest指定11.19.0）offline install要求清理既有modules并因NO_TTY拒绝；未开启CI/purge、不清理、不重装|真实核对现有IR0.0.0/Zod4.6.1及lock后，用平台junction只连接execution下两个此前不存在的目标；link-receipt记录真实路径/manifest摘要。没有冒称pnpm安装成功或伪造包身份|
|g2-build.log|队列推断为较窄SYMBOL[]，不能加入CanonicalNode联合类型|显式CanonicalNode[]；真正build0，不以tsc失败时emit的JS测试绿代替构建|
|g3-tests.log|Flow保留输入graph数组顺序；另测试prepare共享输入被低target测试修改、预算预期漏算Flow内coverage|规范已保留集合顺序；prepare逐次clone声明输入；按批准单位补精确预期，保留原失败|
|g3-fixed.log|组合测试删CodeEdge但保留该边inventory，触发正确闭包拒绝|删除测试同步移除CodeEdge inventory；未放宽产品准入|
|review-red.log|作者三个反例：单仓图接受额外workspace refs、图与Flow保留集合/支持/coverage顺序依赖caller|局部边界明确拒绝workspace；一个共享显式set-normalization helper，不排序signature/steps；3/3转绿并完整root54/54|
|review-build.log|断言单仓使TS将Map值收窄为REPOSITORY，局部ScopedRef传参类型不匹配|显式Map<string,ScopedRef>；最终两包build0|

上述不是历史Native timeout修复，也不是flaky诊断；历史风险仍UNKNOWN。初期失败的退出码以保留runner/compiler输出解释，最终门禁退出码单独实际捕获。

## Review Focus与最小门禁

- 真入口：四框架当前支持范围的正/负例、同handler两topic独立context；provenance与完整领域支持继承，角色和owner不猜测。
- 图：direct/chain/diamond/cycle，候选不展开；精确source/target、CodeEdge/Source支持与锚点；低target/非callable有固定未解hint，不升级Code HEURISTIC。
- Flow：真实CALL关系与loop回引；incoming/outgoing引用准确，候选不入steps；没有BRANCH/异步伪连接。
- 失效/边界：去import/CodeEdge后重新推导，不留旧边；foreign basis/digest/根/policy/图语义拒绝；完整集合重排同值；maxItems恰够及少一单位拒绝，包括重复coverage/逐step支持。
- 唯一root54/54；原B-F3 root121/121；注册+workspace55/55（包含35注册与20工作区检查），全部0fail/cancel/skip/todo。Plugins/Execution最终构建exit0，架构17项目，16个明确TS/JS/JSON/YAML格式PASS。不是全仓/Native/DB或Phase1通过。
- 收尾仅删除本包未用类型和重复排序，再构建/新root54及范围格式；未改依赖方向/旧B-F3语义，复用同轮旧root121/注册55/架构17，不重复宽矩阵。

精确命令、原失败、最终退出码、Fixture语义冻结与必要源/编译身份见[单一结果索引](../../../.superpowers/sdd/2026-10-30-phase1-declared-execution/results.json)。治理MD按现有ignore只核对新增段/链接，旧正文后缀保留，不强行换行同步。原独立review-agent/提交/清理脚本因用户约束不运行；这是作者评审，不冒称独立评审。

## 有限出口与后继

G1–G4完成局部声明执行链，未关闭P1-07完整能力或父任务（仍4/21接受、17OPEN）。TASK/BATCH、真实PUBLISH/CONSUME/DATA/任务创建边界、完整四Plugin缺口、合同匹配/跨仓、R012/R013原子发布/失效及E01/E02/真实资格仍OPEN，未转DEFERRED。

后继推荐集中设计“标准化边界操作绑定与局部异步/数据图”：先补精确producer操作→合同、数据操作→资源/owner的绑定，再组装有证据的边界；不能从Code CALL或同名topic生成虚构连接。发布与匹配按原依赖另行细化，当前无其实施/真实运行授权。

A6 NOT_QUALIFIED、空profile、旧R4 mutable DB不作pristine、Native timeout UNKNOWN、main39708335128取消结算未查询与云端授权边界均保持。
