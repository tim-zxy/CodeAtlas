# Phase1 C3-A Code Context Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the existing session/worktree. Steps use checkbox syntax. 用户已选择inline顺序；不新建agent、会话或工作树。

**Goal:** 在真实自有SQLite连接上实现有界Code/support/coverage/Source身份捕获与复核，不增加运行或发布入口。

**Architecture:** Storage单一新增模块持有私有WeakMap及短读事务，逐行验证/哈希既有R010数据；只导出三个函数与只读类型。独立Fixture先冻结预期，测试通过正常Source/Application/Store流程建立正例；旧Native token/Runtime/Store不修改。

**Tech Stack:** 已安装Node24、node:sqlite/node:crypto、TypeScript、现有IR schemas和Storage boundedJson/SQL字符串charge模式；没有新依赖。

**Spec:** [C3-A已确认书面契约](../specs/2026-10-23-phase1-code-context-capture-dcp.md)。用户“按照推荐继续下一步”接受A并进入writing-plans；B/C不随之接受或实施。用户已确认本计划；A1..A4已按范围本地实施与验证，见末尾收尾记录。

## Global Constraints

- 固定C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas、codex/p05-integrated-exit-audit，base cc5a8cb571986c5e56ed04053b2c96ef500fcacb；D:/workspace/CodeAtlas不是实现目录。没有.codegraph，不建立索引。
- 先核验本计划收据并重读AGENTS/当前权威/Spec；保留所有既有dirty/EOL、Fixture及.superpowers原始失败。不stage/commit/reset/stash/清理、不触碰R4、不提交.pnpm-store。
- C3-A只面向UTF-8、已由正常session核验的R010/user_version=10；不会初始化/升级任意生产数据库。测试迁移只在本测试创建的临时DB。
- Canonical IR、SQLite真相、LLM candidate-only、AUTO/MANUAL及ExecutionGraph→RuntimeFlow→BusinessFlow不变。新摘要包含既有契约要求的coverage，不修改owner-map或旧Native token。
- 无Source分类、Runtime.prepare/CLI/MCP/Apply路由、stage lease、normalizer输入修订、R011/迁移、Native hook、profile字段/数值或依赖。A的historicalSourceProof永远UNAVAILABLE。
- 不执行任何新helper/Native CLI/测量/校准/云端CI或写入；旧C2四槽已耗尽不重跑。历史Native超时UNKNOWN；C1真实file symlink EPERM仍OPEN，不改为PASS。
- 测试limits是显式读取控制，正safe integer，无产品默认；数值从独立样本/固定读计划推导，不加猜测余量或降低门禁。

## Review Focus

1. 相同HEADER/提交计数但未选中的Provider support candidate或coverage变化：完整摘要必须变化；不能header-only蒙混过关。
2. 无Code事实的成功snapshot、同WORKTREE历史coverage和重复覆盖：保留完整S集合及多重性，物理rowid/并发时间不成为语义身份。
3. 巨大TEXT/BLOB、缺候选、LEFT JOIN遮蔽孤立记录：数字预检后才能获取载荷；无quiet truncation或伪空图。
4. 调用方已开旧snapshot、跨连接/伪造/关闭重开handle、recheck失败后再调用：拒绝且不回滚调用方事务；本连接失效不可复活。
5. Source比已索引Code新、root locator变化、表或对象key重排：前两者被分别绑定，后者不改语义摘要；不能谎称磁盘或历史Source已认证。

## 文件范围与接口

| 文件                                                                                                                                                                | 改动                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| packages/storage/src/analysis/code-context-capture.ts                                                                                                               | 新增：三个函数、只读类型、私有读取/验证/编码/生命周期；无全局DB/文件/进程副作用                                                                    |
| packages/storage/src/index.ts                                                                                                                                       | 仅导出上述模块                                                                                                                                     |
| packages/storage/test/code-context-capture.test.mjs                                                                                                                 | 新增：实际自有SQLite合同/状态/边界测试                                                                                                             |
| packages/storage/test/helpers/code-context-capture-fixture.mjs                                                                                                      | 新增：本Fixture专用DB构造、正常Apply/patch、独立limits和清理；不改旧helper                                                                         |
| fixtures/phase1/code-context-capture/{fixture.json,inputs/cases.json,expected/views.json,expected/transcripts.json,expected/read-plan.json,authoring.mjs,README.md} | 新增独立p1-code-context-capture-v1，phase1/runtime-graph，空languages/frameworks，capability SQLITE_CAPTURE_CONTRACT_ONLY；qualityGates={}不是豁免 |
| package.json                                                                                                                                                        | 仅将新测试注册一次在既有canonical-fact-store测试之前                                                                                               |
| ADR-020/Canonical IR/SQLite/Runtime/Security/Evaluation/当前状态/WBS/acceptance/trace及本Spec/plan/review                                                           | 同步A的实际证据与范围；B/C仍OPEN                                                                                                                   |
| .superpowers/sdd/2026-10-23-phase1-code-context-capture/                                                                                                            | 本计划ledger、预冻结、失败与核验日志；永久保留                                                                                                     |

唯一新增公共函数：

```text
captureRepositoryCodeContext(db: DatabaseSync, repositoryId: EntityId,
  limits: CodeContextCaptureLimits): CapturedRepositoryCodeContext
recheckRepositoryCodeContext(db: DatabaseSync, handle: object,
  limits: CodeContextCaptureLimits): void
releaseRepositoryCodeContext(db: DatabaseSync, handle: object): void
```

CodeContextCaptureLimits恰含maxRows/maxSerializedBytes/memoryBudgetBytes；CapturedRepositoryCodeContext恰含handle/view。view完全照Spec§4，不加ready/authorized/profile、Source/owner正文或debug counters。三个类型名固定为CodeContextCaptureLimits、CapturedRepositoryCodeContext、RepositoryCodeContextView，view使用最后一项。类型可由Storage导出，运行时authority仅在私有WeakMap；不为一个调用方增加通用capture框架、外部observer或任意SQL端口。

## 读取计划与控制的具体化

实施者不得调用RepositorySourceStateStore.load、查询session的私有all路径或readNativePatchActiveSupports的全量返回数组充作新capture。沿用其IR重建/连接/事务模式，私有局部实现有界流式读集；不为复用重构旧模块。

### 固定读取阶段

1. 在进入SQL前拒绝proxy/伪DatabaseSync、非法EntityId和非plain/未知字段/非法safe-integer limits；用IR.ensurePhase1Data，不引入Storage→Application依赖。合法实例的关闭状态用现有isOpen检查。capture/recheck不接受ambient transaction，release不发SQL。
2. 自有BEGIN后读PRAGMA user_version、encoding；数字存在性/字段计数核对当前选用的14张表：repository、repository_state、revisions、source_files、canonical_nodes、canonical_edges、unresolved_targets、evidence、provider_fact_bindings、fact_evidence、active_support_candidates、provider_snapshots、provider_capabilities、analysis_coverage。字段名单从已发布R010 SQL固定，采用code-query.ts的numeric count匹配模式；不返回sqlite_schema.sql或pragma列名TEXT。没有R010 summary内容读取。
3. 对每个下表数据域先固定numeric census(count/UTF-8 TEXT byte长度/不允许BLOB或类型异常)，再按已有scalar选择器获得header/indexed/target。预检约束先于任何payload读取和排序工作；失败安全退出。
4. payload流使用固定表/列白名单。先iterate只含rowid/数字长度/类型违例计数的locator，再在已admit的单行大小内按rowid查询明确列；rowid仅定位，不进入摘要、不决定最新snapshot。每个statement iterator在finally return/关闭。
5. 基于真实已读header建立S：repo相同且requested_revision_id=indexed指针。检查全部ACTIVE Evidence均在indexed域，所引用snapshot属于S且其Provider身份/成功状态及绑定符合既有IR/Store规则。没有索引时检查矛盾ACTIVE支持而不是伪空图。S中的历史snapshot保守保留，无timestamp/rowid“最新”猜测。
6. 对以下域分别count和双向census，再逐行输出Spec§6分组。缺失legacy R009 candidate为UNAVAILABLE；candidate存在但IR或关系损坏为INVALID。对全部孤立关系使用数字反向查询，不靠INNER JOIN漏行；不从当前Source验证旧graph的历史指纹。

| 域                  | 取值/关系                                                                  | 排序和处理                                                                                     |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| locator/header      | repository.id/root_path；indexed双字段；全repo snapshot count              | LOCATOR独立，HEADER语义不含root或时间                                                          |
| target/source       | 至多一个WORKTREE、该目标的完整SourceFile列                                 | TARGET，[id] UTF-8；非Source/排除分类仍纳入；其他合法历史revision不当当前目标                  |
| Canonical           | indexed revision全部node/edge；unresolved目标完整hint/candidates           | NODE/EDGE按id；edge逐条关联相应unresolved行，反向拒绝resolved edge带悬挂unresolved记录         |
| 活动支持            | repo全部ACTIVE Evidence，逐项Binding/FactEvidence/candidate与对应Canonical | EVIDENCE id；关系按Spec结构化key；candidate完整内容，不只winner；typed NODE/EDGE键             |
| snapshot/capability | S完整元数据、每snapshot capabilities                                       | snapshot id、capability name；时间合法性检查但不入语义摘要                                     |
| coverage            | S全部原始analysis_coverage                                                 | 依Spec语义key排序，null用NONE/SOURCE tag；流式合并相同语义元组的精确multiplicity；原行均计预算 |

所有key比较采用UTF-8逐元素顺序。数据库UTF-8已核验后可用ORDER BY CAST(column AS BLOB)及显式NULL tag；不用locale或JSON字符串整体排序代替复合key。coverage相同key只保留一个正在累加的组，最多前后两条载荷；group count通过数字distinct census取得。不得保留全部nodes/support/S/Source数组。

### 可复现控制记账

expected/read-plan.json独立声明固定numeric查询、各scope locator数量、payload读取次数、重复lookup、原coverage行数及分组数；由手写输入推导，不从loader SQL输出反算边界。每一次SQL get/iterate交付的行计maxRows，包括schema/census/空域numeric结果、locator与payload的两次读取、重复关联读取；原coverage重复行逐条进入流，不靠group聚合减少预算。

maxSerializedBytes控制一次调用累计“实际获取TEXT的UTF-8字节 + 所有域/NUL/长度前缀/分组与记录canonical JSON输出字节”。重复读取TEXT重复计费；无TEXT的numeric结果只计行。先对剩余额度做安全加法/预检；逐条canonical JSON先用既有boundedJson模式量长/charge，再交给hash，不先生成整图JSON。所有Spec定义的域和value精确形状不在计划中改写。

memoryBudgetBytes沿用既有2×UTF-8逻辑字符串charge，记录该步骤仍活跃的raw SQL/已解析字符串/单行编码字符串及固定view/handle字符串；归档read-plan明确每阶段保留集合，取独立预期峰值作为测试边界。若实现暂存Buffer，则另计其活跃字节；优先hash.update字符串/分段，避免多余Buffer。每步释放不再持有的行/编码/上组，异常也清理。这个控制不证明对象头、V8 RSS、SQLite page/cache或排序TEMP内存；不得据此注册profile，组合门禁仍在C3-C。

fixtureLimits由该样本read-plan的精确行数/累计输出字节/逻辑存活峰值得到；三项负例各减一。实现与计划发生不一致先查固定读集、重复读取和Fixture算术，记录修正依据，不增加margin、不把实现测得的结果回填expected。禁止对生产接口新增trace回调以凑测试；需要的查询顺序证明仅在测试用Node内置mock包裹真实db.prepare/statement，保留真实SQL结果/方法绑定。

## Task A1：独立Fixture与测试DB输入

**Consumes:** Spec§4..7、既有provider-evidence-v1长度元组编码、RepositorySourceStateStore.replace、RepositoryAnalysisStage/FactStore、Application.applyFullAnalysis/applyAnalysisPatch、collectMergeSupports/selectMergedGroup的已存在模式。

**Produces:** 上述Fixture、只用于该Fixture的DB helper、测试的expected/limits。authoring只导入Node fs/crypto；不调用新capture、生产hash/Normalizer/Merger/SQLite查询来生成expected。

- [x] 写test availability/首个baseline断言，动态导入Storage dist API并assert函数存在；运行新测试，观察缺少API的RED并保存。不可先写实现。
- [x] 手写inputs/cases.json：no-source-not-indexed、source-only、complete、same-header-losing-support-A/B、same-header-coverage-A/B、empty-code-with-coverage、coverage-multiplicity、stale-target-source、unicode-order、typed-node-edge-id、history-snapshot-set。用明确Fixture opaque IDs、固定IR事实与时间，不声称真实Java/Python提取。
- [x] 以code-query-fixture.mjs为模式创建新helper：openRepositoryIndexSession initialize在本test独占temp目录注册repo；Source.replace正常建基线；Test Provider事实经IR/merge/stage.confirmSucceeded→Application.applyFullAnalysis→FactStore。多Provider场景先alpha full，再beta正常patch保留alpha支持。旧helper不改，正例不直接SQL写Canonical/support/指针。
- [x] 同HEADER的两个独立DB使用相同repo/revision/fingerprint/snapshot IDs与计数；只让合法的未胜出beta candidate内容变化，alpha代表保持相同。coverage双DB只变合法coverage/重复性（Test Provider自己的Code输入，不把任何Native/Syntax PARTIAL改标为SUCCEEDED），禁止靠提交次数不同让header-only实现也通过。
- [x] 手工固定Canonical opaque id/FactKey及支持对应；Evidence ID用独立std crypto重述既有provider-evidence-v1字段元组（repo/revision/snapshot/factType/provider/providerFactId）。按Spec新域生成完整逐条transcripts和预期view；不从数据库或新模块提取参考。
- [x] Root locator与temp绝对目录有关：静态Fixture保留声明root的literal向量；真实DB测试仅将已知session输入root代入独立authoring locator公式，在首次capture前保存该样本expected及SHA。Code/Source预期不得随root改变；不读取capture输出作为输入。
- [x] inputs/README/authoring及expected先显式格式化，再冻结整个新Fixture和每个拥有样本的expected。保留任何初始失败与修订；不能把后置观察伪装成预冻结。

## Task A2：有界真实capture与身份

**Files:** 新Storage模块、index导出、新测试；其余产品文件不改。

**Produces:** captureRepositoryCodeContext及三个只读类型；无产品调用点。

- [x] 增加baseline/deep-freeze断言，仍先观察RED；然后实现入参、R010/UTF-8 schema、14域numeric preflight/iterator/IR重建、精确Spec摘要以及私有handle创建。
- [x] baseline必须deepEqual独立expected（除按输入预算的locator外不忽略字段），handle为冻结空对象，view无原始root/Source/owner、ready/authorized/profile字段。historicalSourceProof始终UNAVAILABLE。
- [x] 验证no-source、source-only、empty-Code有coverage、同WORKTREE历史S、多Provider losing候选、typed Node/Edge同ID、Unicode key顺序、转义/多字节长度、row插入顺序和JSON对象key顺序控制。用相同HEADER差异向量断言正确摘要变化，物理重排则相等。
- [x] 完整域/双向census测试：缺R009 candidate→UNAVAILABLE；坏IR/孤立关系/跨域ACTIVE支持/双indexed字段不一致→INVALID；错误schema/非UTF-8/未知版本→UNAVAILABLE。损坏仅在该test创建且已确认所有权的DB中注入，明确标NEGATIVE_ONLY；不构造“成功”旁路，不使用用户库/R4。
- [x] 三个limits精确边界与减一；getter/proxy/未知字段/NaN/Infinity/-0/非safe-int拒绝。用含敏感sentinel的大TEXT/BLOB负例证明numeric拒绝发生在载荷query前，固定code/message无泄露；不以mock证明一个从未读取的成功事实。
- [x] SQL失败/解析失败/预算失败后无自有事务或iterator遗留、无持久写入；导入模块不读DB/文件、不创建child。完成A2对应GREEN后再进入生命周期任务。

断言示例：

```js
const { handle, view } = api.captureRepositoryCodeContext(db, repoId, fixtureLimits);
assert.deepEqual(view, independentlyFrozenExpected);
assert.deepEqual(Object.keys(handle), []);
assert.equal(view.historicalSourceProof, 'UNAVAILABLE');
assert.notEqual(
  losingA.view.activeBasis.codeActivationDigest,
  losingB.view.activeBasis.codeActivationDigest,
); // 相同HEADER/count，代表winner相同
assert.notEqual(
  coverageA.view.activeBasis.codeActivationDigest,
  coverageB.view.activeBasis.codeActivationDigest,
);
```

## Task A3：连接身份、复核和恢复

**Consumes:** 同一模块私有capture/WeakMap；不开放内部digest构造器、readset或事务状态参数。

**Produces:** recheckRepositoryCodeContext/releaseRepositoryCodeContext，明确以下状态表。

| 调用                                                 | 结果/原handle状态                                       |
| ---------------------------------------------------- | ------------------------------------------------------- |
| 合法本连接live recheck，完整读集未变                 | void，live                                              |
| 合法本连接live recheck，Code/Source/locator/计数变更 | CHANGED，永久失效                                       |
| 合法本连接live recheck，损坏/资源/ambient事务        | 对应INVALID/UNAVAILABLE/LIMIT，永久失效；不动调用方事务 |
| 伪对象/Proxy/另一连接的handle                        | INVALID；不伤原连接的live handle                        |
| 本连接已释放/失效，或所属连接已关闭后的recheck       | RELEASED                                                |
| 本连接live release且DB仍打开                         | void，released，无SQL                                   |
| 本连接live release但DB已关闭                         | RELEASED并失效，无SQL；随后重复release幂等              |
| 本连接重复release                                    | void，仍released，无SQL                                 |
| 未知/跨连接release                                   | INVALID，不伤原handle                                   |

- [x] 先写变化检测、跨连接/伪对象、release/失败后复活的RED，再实现私有WeakMap状态和固定Error.code/message。捕获数值digest或JSON反序列化对象永不能换回handle。
- [x] 用正常Source.replace与Application/Store写入更改同WORKTREE fingerprint下的Code支持/提交，以及Source角色/metadata；recheck必须在新snapshot识别变化。根locator/数据库损坏负例只在拥有DB明确注入且永不晋级正例。
- [x] 两个真实SQLite连接：A capture已结束短事务，B通过正常工作流写入，A recheck看见提交并拒绝；同文件重开新连接不能用旧handle。无需child或并发长测。
- [x] ambient事务测试：测试自己BEGIN并先读建立snapshot，再调用capture/recheck；必须在任何自身SQL前拒绝，db.isTransaction仍true，测试自己ROLLBACK。不能为了复核成功隐式关闭调用方事务。
- [x] valid handle的limits/解析异常首次返回原固定安全类别并失效，之后RELEASED；另一个有效handle不被连带失效。固定错误不含注入Source/path/SQL sentinel。
- [x] 关闭连接后合法handle变为RELEASED；release不发SQL，已释放重复调用幂等。所有finally只回滚自有读事务并关闭自有iterator/TEMP工作区，不关闭caller DB或旧stage。只读capture不是Store锁内CAS，测试与文档不声明原子Apply。
- [x] GREEN全部A3及A2；在registry/格式/架构和回归完成前不宣称整个任务完成。

## Task A4：注册、治理、匹配验证与作者评审

- [x] 新测试注册package.json一次；manifest发现旧45/exact19 Phase1的ID全保留，新增唯一p1-code-context-capture-v1（预期46/exact20，必须实际发现，不改旧Fixture）。空qualityGates不免除Phase1。
- [x] 执行本地Storage TypeScript build、新测试、下列32文件顺序回归、architecture及新文件显式格式；记录准确command/退出码/原始日志。未通过/未执行不标绿，C1 symlink TODO独立保留。
- [x] 核对旧product/Fixture/SQL/lock/profile字节，仅新模块+index导出+package测试注册与同步文档可变化；Source分类、Runtime/catalog、旧token、Store、旧TEMP和B/C都没有实施。原库的数据变化只能来自自有测试DB正常流程/标注负例。
- [x] 同步ADR-020、Canonical IR的Code basis语义、SQLite/Runtime/Security/Evaluation、WBS/acceptance/trace/CURRENT_STATUS及本Spec/plan。区分A局部完成、scope匹配验证、未执行root/联合门禁与原Phase出口。A不能闭合真实历史Source/removal/Stage/Apply/进程/采集/profile。
- [x] 按Review Focus作者自审，记录每项未解决风险和修正的RED/GREEN，不声称独立review或merge-ready；保留所有原始失败与本workspace，不stage/commit/清理。

### 准确验证命令

先按依赖顺序执行：

```text
node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
node --test --test-concurrency=1 packages/storage/test/code-context-capture.test.mjs
node scripts/check-architecture.mjs
```

没有新增IR/Application/Provider/Runtime源文件，不为本包无故重编译Rust或重复完整旧回归；必要的额外build仅在类型依赖实际失败/修改时补，并记录原因。

32文件匹配命令为node --test --test-concurrency=1，按如下顺序传入（另保存command JSON，不使用通配符引入Native路径）：

1. packages/storage/test/code-context-capture.test.mjs
2. packages/storage/test/canonical-fact-store.test.mjs
3. packages/storage/test/analysis-temp-stage.test.mjs
4. packages/storage/test/analysis-patch-store.test.mjs
5. packages/storage/test/active-support-candidates.test.mjs
6. packages/storage/test/analysis-activation-state.test.mjs
7. packages/storage/test/source-state.test.mjs
8. packages/storage/test/repository-schema.test.mjs
9. packages/storage/test/repository-index-session.test.mjs
10. packages/storage/test/code-query-fixture.test.mjs
11. packages/storage/test/code-query.test.mjs
12. packages/storage/test/native-analysis-state.test.mjs
13. packages/storage/test/native-summary-stage.test.mjs
14. packages/storage/test/patch-stage.test.mjs
15. packages/storage/test/repository-constraints.test.mjs
16. packages/storage/test/migration-runner.test.mjs
17. packages/storage/test/migration-runner-application.test.mjs
18. packages/storage/test/migration-runner-failures.test.mjs
19. packages/providers/test/fact-merger-input.test.mjs
20. packages/providers/test/fact-merger-selection.test.mjs
21. packages/providers/test/fact-merger.test.mjs
22. packages/providers/test/canonical-fact-identity.test.mjs
23. packages/providers/test/provider-evidence-identity.test.mjs
24. packages/runtime/test/native-syntax-admission.test.mjs
25. packages/runtime/test/syntax-observation-profile.test.mjs
26. scripts/test-syntax-qualification-draft.mjs
27. scripts/test-workspace-structure.mjs
28. scripts/test-architecture-rules.mjs
29. packages/evaluation/test/fixture-manifest.test.mjs
30. packages/evaluation/test/fixture-registry.test.mjs
31. packages/application/test/apply-full-analysis.test.mjs
32. packages/application/test/apply-analysis-patch.test.mjs

静态先检查这些文件的import/调用路径没有真实Native/helper；已核对scripts/test-syntax-qualification-draft仅含既有只读Git filter，scripts/test-architecture-rules仅用process.execPath调用固定scripts/check-architecture.mjs检查自有fixture；这两类允许的验证子进程不是OS采集helper样本。不得引入其他target helper/Native/powershell/cargo执行路径；执行前仍核对transitive imports，发现越界则停止该文件，不偷偷放大范围。

格式使用node node_modules/prettier/bin/prettier.cjs --check，明确列新TS/mjs/Fixture JSON/README/package及新文档；Markdown/README默认被忽略时仅对本轮文件用独立ignore-path，不规范化整个旧handoff。另核对迁移manifest/checksums、registry ID集合、catalog0、代码依赖边界与旧C2冻结哈希。

完整root verify/真实Native/云端集成门禁仍待后续集成点；不能用32文件替代它们并宣布Phase1完成。任何云端写入/CI仍按准确head/jobs/批次/次数单独取得确认。

## Pre-flight与依赖自审

A1的Fixture是A2/A3共同输入，必须在首轮实现/比较前冻结；A3直接使用A2同模块私有状态，不引入第二份authority或另一个DB连接包装器。A4仅注册与核验，不激活Runtime。任务顺序固定A1→A2→A3→A4，无独立并发任务。重点反例和每条状态规则都有指定测试，S历史集合和coverage多重性不被优化掉。

本计划不包含B/C实施，也不承诺其未设计的lease/Code completeness/Native barrier API。无法从自有正常workflow构造某个正例时，应先核对Fixture假设/现有Store约束并记录；不得直接SQL拼一个“通过”的图、改SUCCEEDED门禁或降低Source/支持检查。

本计划随用户确认后在既定inline方式连续推进；不对每个小步骤再次询问。预算数字、依赖/迁移、破坏性或云端操作仍须独立确认。首个可执行任务为A1新API availability/基线测试RED与独立Fixture作者工作。当前仅计划与作者审查，无产品代码/Fixture/DB/测试运行。

## 本地实施收尾 — 2026-10-23

Final local32-file regression:422PASS/0FAIL/1explicitTODO (423 total;new capture suite100PASS);Storage TypeScript build and architecture17 pass;Fixture registry46/exact20Phase1,Syntax catalog0. The TODO is the existing C1 real-file-symlink EPERM gate,not an A failure or a waived Phase gate. [实施作者审查](../reviews/2026-10-23-phase1-code-context-capture-implementation-review.md)说明证据范围、独立预期、全部发现和实施裁定。原计划中的审批／未开始文字保留其编写时点含义，由本节替代。

必要配套修订：scripts/test-workspace-structure.mjs严格Storage导出预期只增加本次模块一行；没有放宽assert.equal。窗口multiplicity仍读取全部coverage原行；私有从不执行的StatementSync仅标识连接incarnation。所有原始失败／冻结均保留。README显式formatter核验在收尾补做（其初始冻结字节未改），不把该后置核验改称早于实现。额外unresolved向量在首个实际capture前独立冻结，不伪称属于早于产品的七文件基线。

保持同会话、原工作树；无commit/清理/新依赖/迁移/profile数值/Native/采集helper/云端写入。B/C与所有原Phase门禁仍OPEN。
