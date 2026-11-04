# B-F3 Runtime领域候选实施与作者整包评审

2026-10-30；用户明确批准精确设计及Q1–Q3，当前仅完成B_F3_RUNTIME_DOMAIN_CANDIDATE_LOCAL_EXIT。评审由作者在同会话顺序完成，没有新增代理。沿用executing-plans、TDD、Ponytail full及verification-before-completion；用户禁止Git/新工作树/代理，故保留原工作区与手工进度，不执行技能中的提交或工作树清理步骤。

## 结果和准确范围

新增一个私有compileFrameworkRuntimeCandidate。Context4验证一次后共享原固定四规则抽取，旧入口仍保留验证；canonical JSON复用原函数。只产生strict Contract、TaskDefinition及DataResource候选。runtime-declaration-support-v1固定0.5/HEURISTIC，属已批准规范支持约定，不是测得概率；实际Syntax需原method及固定0.5，Code支持不得低于0.5，Source不虚构分数。

独立Fixture在产品前冻结：13个声明Context，领域字段/ScopeTuple/SemanticTuple及精确键来自既有字面草稿预期和本包手写映射，不运行compiler生成expected。它们不是新的真实框架Source样本。当前支持值由完整Syntax3 envelope和runtime-syntax-support-v1域摘要得到；inventory只收实际所用Source/Code/Syntax闭包。输入Context只证明声明一致性，不认证Store或Source。

scope隔离不同receiver的同名集合；同receiver跨方法归并。每次从当前输入重算，移除一来源保留其余，全部移除不留旧贡献；空结果不是发布/删除命令。归并不升分，代表位置为贡献草稿Source锚点的path/坐标最小值。identity不包含Syntax原ID/provider标签/草稿/规则/置信。相同内部ID语义核心冲突硬拒绝，不能覆写。

## 新鲜验证和失败保留

- Q1独立预期通过已有Context4及RuntimeFactSet strict parser。首次23项：1准备PASS、22缺API RED；原q1-red.log保留，属于API缺失RED。
- Plugins首次构建类型接线失败：IR只导出Coverage schema、CanonicalId与EntityId品牌不同；另一次修正漏掉Edge映射。两份失败日志保留，源头修正后构建exit0，不改IR/schema或依赖。
- 新组件23/23 GREEN。含四框架字段/身份、固定理由/置信、较低Code/未知Syntax method/篡改旧值拒绝、foreign basis/支持、重复身份、删除、空输入、重排、两receiver及跨方法归并、provider标签变化。
- root121/121；旧兼容五文件113/113；注册35/35；架构17项目；均0fail/cancel/skip/todo。root的121包含新23，不与其他收据累计作为独立样本量。
- 作者审查补强原23项中的Source anchor、精确externalRefs/inventory、foreign支持及重复Code factKey断言后，受影响新文件再验23/23。没有为纯文档收尾重复旧98、兼容或注册矩阵。
- 累计预算独立构造恰好10000单位：665个listener合同，第二声明为其中两个提供支持；在该输入加一项实际诊断limitation即拒绝10001单位。没有增加配置、上限或RSS声明。
- 范围格式只检查本包8个TS/JS/JSON。治理MD受仓库.prettierignore忽略；只核对新增段及本地链接，不为获得格式PASS重写整个历史文档。

## Review Focus与不足

|重点|审查/证据|结论|
|---|---|---|
|政策来源/调用者选分|新Fixture policy、三个不适用测试、strict caller额外字段拒绝|单一私有政策，无callback/registry；未改Code/Syntax置信|
|虚拟图/错误领域|所有13例断言六类图数组为空；Mongo操作只记limitation|无伪入口/CALL/trigger；DEPENDENCY分支保留限制，现固定规则不生成此草稿，未伪造不可达提案测试|
|资源身份|独立tuple/hash、两receiver与跨方法、删除与反序|未知namespace隔离，资源implementation身份分量null|
|支持与冲突|精确Syntax摘要/引用全集、foreign/重复digest/Code key拒绝、最终parser|无origin/draft冒充支持；哈希核心冲突guard经作者审查，不通过注入哈希碰撞或开放任意draft API造测试|
|输出预算|实际单位和10000/10001，逐条插入前charge|entity/limitation/external/inventory/每record支持/三类provenance引用均计；provenance行以所属entity计，不另发明单位|
|兼容与架构|root121、兼容113、注册35、架构17|旧Fixture ID/caps/index不变，两个旧私有helper改动有原测试覆盖|

未发现须新设计审批的冲突。没有独立整包代理评审授权，本文是作者评审，不冒称独立审查。无真实Source/Rust/Native/DB/helper/collector/模型、公开Plugin/Runtime路由、SQL迁移、profile、新依赖、云端CI或Git写入。

## 追踪与后继

[设计§2–§6](../specs/2026-10-30-phase1-runtime-semantic-candidate-design.md)→[Q1–Q3](../plans/2026-10-30-phase1-runtime-semantic-candidate.md)→p1-plugin-context-v2/runtimeCandidate→packages/plugins/test/framework-runtime-candidate.test.mjs及原root。命令、准确计数、失败和身份见[results](../../../.superpowers/sdd/2026-10-30-phase1-runtime-semantic-candidate/results.json)。

本包只解决领域候选：完整Plugin、执行入口/context/graph→RuntimeFlow、合同匹配、Application发布资格/R012/R013/增量失效及原Evaluation仍OPEN；Phase1父任务4/21接受、17开放不变。建议下一集中设计从有来源的entry/context与领域节点组装切入，同时细化发布依赖；不得用空图候选关闭原门禁。A6 NOT_QUALIFIED、空profile、Native timeout UNKNOWN、main取消结算未查询、旧R4可变DB限制保持。
