# Phase1 Fixture、Evaluation与验收追踪详细设计

状态：PROPOSED；以下Fixture/命令均为计划，当前未创建、未注册、未执行。不能将本文列出的ID计入已通过能力。现有26有效Manifest/0 Phase1以及Phase0.5原报告不变；原始产物不重复下载，旧失败与旧根完整保留。

## 1. 分层与报告契约

依据ADR-012/017与EVALUATION，保留L1 Code、L2 Runtime/Graph、L3 Knowledge、L4 Agent Utility。Manifest v1仍是发现/路径安全/元数据契约，旧criticalFacts和旧六Code指标不改义。新domain baseline与probes独立命名文件；方案的兼容性接受条件见[提案C](2026-10-22-phase1-compatibility-proposal.md)。

拟新增报告envelope：schema=`codeatlas.phase1-evaluation`, version=1。payload严格字段：

- identity：fixtureId、manifestDigest、source/expected digests、tool/product构建、Native/grammar/normalizer/Plugin、workflow/prompt/modelPolicy/model、config/policy和platform identity；不适用项null并给reason。
- requiredObligations：稳定ID、layer、kind、expected oracle ref、applicableWhen；必须非空，declared critical inventory不可由actual生成。
- observations：obligationId、executionKind、basisRefs、actualArtifactRef/digest、result、counts/metric/nullReason、duration/resource（实际观察或null）、warnings。
- executionKind严格区分PURE_CONTRACT、RECORDED_REPLAY、TEST_DOUBLE、ACTUAL_PRODUCT、ACTUAL_MODEL；只有适用kind能履行该obligation。替身成功不能升级成模型或E2E成功。
- baselineRef：approved baseline artifact id/version/digest、批准记录；没有数字基线则null，相关gate为NOT_EVALUABLE。
- gates：name、source obligation IDs、expected comparison或approved threshold ref、observed、status、reason；overall、missing、failed、notEvaluable、notApplicable、limitations。

status=PASS/FAIL/NOT_EVALUABLE/NOT_APPLICABLE；NOT_APPLICABLE必须有冻结applicability决定和reason（如明确关闭降级候选），不能排除必做四框架或两E2E。FAIL/NOT_EVALUABLE不能被聚合为PASS；缺执行记录、缺required item、重复obligation、空required critical probe集均拒绝成功。

无预测或无期望事实的分母返回null及原因，不记完美分；typed extraction错误和空成功不同。source hash/expected hash变化使旧baseline不适用，不自动重写oracle或批准记录。

新`runPhase1Evaluation(input:Phase1EvaluationInput):Phase1EvaluationReport`为纯报告计算；实际runner通过公开Application/Agent入口运行，Storage原始比较由受限开发工具完成，不让evaluation包直接导入Storage破坏现有依赖。可沿用scripts+public Agent API模式；不放宽架构allowlist为实现方便。

拟命令：`node scripts/evaluate-phase1.mjs --fixture <path> --output <exclusive-owned-directory> --config <approved-config>`。exit0=全部required且适用的义务PASS；exit1=完整报告但失败/未执行/基线不适用；exit2=输入/身份/目录/路径无效（不伪造成功报告）。默认不调用远端模型，要求显式指定local adapter；远端仍另授权。输出独占，保留原始失败，不覆盖旧report。

## 2. Fixture目录与独立oracle

每域目录`fixtures/phase1/<slug>/`包含fixture.json、inputs/、expected/；Manifest引用已有路径，不放尚不存在的文件。schemaVersion=1、phase="1"、category按现有四类；criticalFacts只在Code评价时声明真实FactKey，其他domain用expected文件明确critical slots/probes。

独立oracle先于实现编写：literal源文件/manifest/config/doc、逐条期望symbol/entry/contract/context/flow/claim/knowledge关系、明确哪些是unknown/partial；不能由parser、LLM或测得report复制出expected。golden修改要单独说明变更依据，不随actual漂移。

| Fixture ID / slug                                   | 输入与独立期望                                                                                                                                                                  | 所属任务            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| p1-report-contract-v1 / report-contract             | 独立required/actual报告向量、缺义务/空集/未批准基线/替身替代actual拒绝                                                                                                          | P1-00               |
| p1-ir-contract-v1 / ir-contract                     | runtime/doc/claim/knowledge合法与非法literal vectors、跨basis、未知版本、稀疏/重复、旧v1不变                                                                                    | P1-01               |
| p1-syntax-contract-v1 / syntax-contract             | Java annotation/Python decorator/value/owner与协议v4边界向量，旧IPC/SPI严格拒绝额外字段                                                                                         | P1-03               |
| p1-syntax-observer-v1 / syntax-observer             | real Java/Python文件、Python Source分类及最小Code owner归一化、动态表达式、同名装饰器、changed/delete/restart、混合Provider支持/Java summary兼容、syntax fingerprint与zero-fact | P1-04               |
| p1-runtime-storage-v1 / runtime-storage             | R011..R013全升级边界、current/affected basis、注入中断与重开、竞争锁                                                                                                            | P1-05、P1-08        |
| p1-plugin-context-v2 / plugin-context               | V1/V2选择、支持缺失/跨revision、immutable/bounded context、无fs/env权限                                                                                                         | P1-03、P1-06        |
| p1-spring-v1 / spring                               | class+method route组合、Scheduled、Feign；同名自定义/动态占位符/冲突负例                                                                                                        | P1-06               |
| p1-mongo-v1 / mongo                                 | 类型绑定/collection/read/write/change listener；仅save/find名字不成立                                                                                                           | P1-06               |
| p1-kafka-v1 / kafka                                 | producer/listener/topic/config/namespace；动态topic与不同集群同名负例                                                                                                           | P1-06               |
| p1-fastapi-v1 / fastapi                             | APIRouter prefix/include/decorator/Depends；未知动态注册与同名get负例                                                                                                           | P1-07               |
| p1-execution-flow-v1 / execution-flow               | 五context/所有有证据transition、branch/join/cycle、重排输入、支持闭包、不伪造时间顺序                                                                                           | P1-08               |
| p1-contract-matching-v1 / contract-matching         | HTTP/message六结果、同路径不同method、namespace/schema冲突、missing≠external                                                                                                    | P1-09               |
| p1-cross-repo-v1 / cross-repo                       | 冻结多个repo revision/fingerprint、MATCHED串联、其他状态不跳转、source变化拒绝                                                                                                  | P1-09               |
| p1-document-ir-v1 / document-ir                     | Markdown/ADR结构、重复heading/table/link/code位置、malformed/注入/rename/访问拒绝                                                                                               | P1-10               |
| p1-semantic-runtime-v1 / semantic-runtime           | 四task literal响应、结构repair/transport区分、取消、usage、secret/context/remote policy、无模型                                                                                 | P1-11               |
| p1-compilation-snapshot-v1 / compilation-snapshot   | 同WORKTREE不同指纹/支持、不可变捕获、长模型任务期间变化、旧证据可定位                                                                                                           | P1-12               |
| p1-knowledge-identity-v1 / knowledge-identity       | rename/reword/update/NEW/ambiguity/merge/split/disappearance/transition、Phase2 drift不伪报已评估                                                                               | P1-13               |
| p1-knowledge-publication-v1 / knowledge-publication | 三scope、CAS/idempotency、失败/partial/取消/竞争/重启、关联表/FK、commit后输出失败                                                                                              | P1-14               |
| p1-source-freshness-v1 / source-freshness           | SourceFreshness与四currency状态、漏watch后查询重验、发布前后basis改变                                                                                                           | P1-14、P1-18        |
| p1-fts-query-v1 / fts-query                         | 无embedding SQLite真实检索、权限filter、派生索引重建/失败、稳定排序                                                                                                             | P1-15               |
| p1-standard-wiki-v1 / standard-wiki                 | published-only、LOCKED、required missing/stale、artifact失败保旧版、reprojection不编译                                                                                          | P1-16               |
| p1-agent-api-v1 / agent-api                         | 六工具strict input/output/error、CODE/EXECUTION/RUNTIME/BUSINESS区分、L0/L1/L2预算/按需                                                                                         | P1-17               |
| p1-security-config-v1 / security-config             | config层级/未知keys、query/update权限、source secret/raw-vs-derived、注入/no-fallback/URL/env                                                                                   | P1-02、P1-11、P1-17 |
| p1-mcp-lifecycle-v1 / mcp-lifecycle                 | real stdio、单workspace、cancel/shutdown、watch overflow/reconcile、startup不载全Wiki                                                                                           | P1-18               |
| p1-install-v1 / install                             | 平台包/协议/缺binary/无Rust/无LLM、init不index、setup dry-run/backup/unsafe config拒绝                                                                                          | P1-19               |
| vulnerability-processing / vulnerability-processing | 下节E2E A全部critical probes                                                                                                                                                    | P1-20               |
| spring-fastapi-kafka / spring-fastapi-kafka         | 下节E2E B全部critical probes                                                                                                                                                    | P1-20               |

所有Fixture目前只是本文的预期注册清单，不是26份新增文件。相关cases、测试和root注册在获批实施任务内一起交付，不能只新增Manifest后宣称能力完成。

## 3. 两个E2E的具体合成输入与critical probes

两场景均为计划中的自包含合成项目，不声称用户真实仓库已经存在这些业务。

### A. vulnerability-processing

输入：Java/Spring漏洞提交API、Mongo漏洞记录与状态更新、Kafka待处理/处理结果topic、Python/FastAPI内部处理入口、Markdown/ADR业务说明；每个角色位于声明的repo，revision/fingerprint明确。HTTP调用和消息边界只有明确代码/配置支持才连接；文档业务目标以DECLARED来源进入候选。

critical probes（独立expected答案/支持清单）：

- VA-ENTRY：定位提交HTTP入口、处理入口、Kafka listener和已声明调度任务；不遗漏critical入口。
- VA-DATA：标出漏洞集合read/write及有真实watch证据的change trigger；普通write不能冒充trigger。
- VA-BOUNDARY：提交→publish、consume→handler、受支持HTTP边界均保context；没有外部endpoint证据不串联。
- VA-CROSS：跨repo每跳保revision/fingerprint/contract status；未知topic/地址明确unresolved。
- VA-KNOWLEDGE：Component/Capability/Integration/BusinessFlow候选有支持；发布后能回答“谁接收、谁处理、存哪里、靠什么关联”，不要求固定LLM措辞。
- VA-MANUAL：代码索引不产生语义出版；显式update才publish；schema/grounding失败保旧版。
- VA-CHANGE：修改topic/路由后旧知识显示AFFECTED；runtime更新不自动语义更新；重新编译后支持指向新snapshot。
- VA-IDENTITY：仅改标题/表述保knowledge id；结构split需review，不误自动拆分。
- VA-SECURITY：含secret/注入doc不泄露、不遵从指令；local-only失败不远端fallback。
- VA-WIKI：Wiki内容源于已published revision；missing/stale明确；reprojection无模型调用和knowledge写入。
- VA-AGENT：L0有限摘要、L1检索发布知识、L2按需工程证据；read-only工具不触发update。
- VA-RECOVERY：编译/发布/输出故障和进程中断后最后已发布版可读，effects与真实commit一致。

### B. spring-fastapi-kafka

输入：Spring API调用FastAPI路由的显式HTTP consumer/provider合同，FastAPI router prefix/Depends，Java Kafka producer/consumer、相同topic不同namespace和动态topic负例；Mongo资源支持；包含request/event/job/task/batch的独立最小源证据及ADR说明。不要求业务框架覆盖所有未来特性。

critical probes：

- SF-PLUGIN：四框架语义都有canonical输出与源支持；同名无关decorator/annotation不误识别。
- SF-ROUTER：class/method及router/include prefix组合正确；动态配置保partial，而非造常量。
- SF-MATCH：matched/ambiguous/unresolved/conflicted/outside-workspace/known-external六结果均由独立向量验证。
- SF-CONTEXT：HTTP与Kafka异步边界保留；job/task/batch不会压成同步CALL。
- SF-DETERMINISM：输入排列、完成顺序变化后Graph/Flow语义等价；step都有支持，循环不无限展开。
- SF-PYTHON：FastAPI Python事实是实际Provider路径，不由LLM或手工expected注入产品状态；未评估语言capability不宣称稳定。
- SF-INCREMENTAL：source增/改/删和restart只观察适用changed syntax文件；旧owner/route/contract支持被正确失效，不留stale事实。
- SF-STORAGE：旧R010/W003数据库按批准migration升级，失败/锁/too-new安全拒绝；Code fresh/Runtime affected窗口真实报告。
- SF-QUERY：六MCP工具通过实际stdio路径，FTS无embedding、无模型时确定性查询可用，业务trace仅published。
- SF-INSTALL：安装原生包后无需Rust；init不隐式index/compile，setup dry-run不写用户配置。

“全部critical probes通过”来自现有Phase1 exit，不是新增百分比阈值。具体预期实体/路径/源码字节和哈希由P1-00在任何实现之前落盘，且需审阅；本轮不创建产品Fixture。

## 4. 数值基线与真实语义质量

禁止借用Phase0.5的95/95/90作为Phase1入口/边界门槛。先冻结critical set/排除项/输入，再本地运行真实路径，报告分子分母、误报/漏报、coverage、resource；用户审核后固定baseline版本和门槛。性能仅记录真实分阶段时间/peak，无未测承诺。

Knowledge评估以grounding、结构答案、identity、state consistency、required probes为主；名字/措辞有多种正确答案，oracle允许有证据的结构等价，不做substring假质量。确定性adapter证明流程；真实本地模型另跑ACTUAL_MODEL，记录model/prompt/seed或可用采样参数与provider限制。不能保证模型确定重放，就保留原输出摘要和测量条件，不将重跑不同答案掩盖成确定性。

当前没有本地模型选择/批准预算和实测语义报告。相应最终phase gate保持NOT_EVALUABLE，不能用TEST_DOUBLE替代。远端模型或reference-model CI均不在默认授权内；不为了补质量报告自动调用云模型或Actions。

identity非exact权重/ambiguity/deprecation策略同样不能拍脑袋定数。初期exact结构唯一匹配+高风险review是待审最小模式；若不能满足rename/reword/结构evolution Fixture，应以失败证据调整设计并同步baseline，不能放宽测试。

## 5. Exit逐项映射与强制证据

E01..E22沿用启动方案按PHASE_ACCEPTANCE顺序的编号。

| Exit    | Fixture / owner任务                               | 最终验收证据                                                        |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| E01     | 四Plugin、syntax / 03..07                         | ACTUAL_PRODUCT canonical语义与支持golden                            |
| E02     | 四Plugin+两E2E / 00、06、07、20                   | 批准critical baseline及真实recall，不可空分母                       |
| E03/E04 | execution-flow / 08                               | 五context、异步、重排等价、完整step支持                             |
| E05/E06 | contract-matching/cross-repo / 09                 | 六结果/多repo basis/真实串联                                        |
| E07     | document-ir / 10                                  | 结构来源位置、Evidence与Claim边界                                   |
| E08     | semantic-runtime/knowledge-publication / 11..14   | 四类候选schema/grounding+实际模型语义证据                           |
| E09     | knowledge-identity / 13                           | rename/reword/结构revision与review规则                              |
| E10/E11 | publication/source-freshness/snapshot / 12..14    | MANUAL、last-good、currency独立、失败/重启/CAS                      |
| E12     | fts-query / 15                                    | 真实SQLite，无embedding可用与可重建                                 |
| E13     | agent-api/mcp-lifecycle / 17、18                  | 六工具真实stdio+严格schema/权限                                     |
| E14     | security-config/semantic-runtime / 02、11、17、18 | 安全负例和无远端fallback；原env行为保留                             |
| E15     | install / 19                                      | 批准平台真实无Rust/无LLM操作链                                      |
| E16     | 两E2E / 20                                        | VA与SF全部critical probes；原始产品路径证据                         |
| E17/E18 | standard-wiki / 16                                | published-only/LOCKED/reprojection无语义写、缺失诊断                |
| E19     | syntax-observer+四Plugin / 04、06、07             | 语言capability注册须有独立Fixture/Evaluation                        |
| E20     | agent-api/mcp-lifecycle / 17、18                  | L0/L1/L2按需预算、startup不载全Wiki、不隐式update                   |
| E21     | security-config+publication / 00、02、14          | 关闭路径有明确N/A配置证据；若启用另评审并补path-specific actual报告 |
| E22     | standard-wiki+两E2E / 16、20                      | published跨仓支持、missing/stale、不编造Architecture/Migration      |

## 6. 本地验证与云端边界

实施后每task从独立失败测试开始，只跑相应测试/Fixture与受影响回归；测试并非本轮已执行。纯IR/规则先build相应包，再node --test明确路径；Schema/Storage用owned临时DB，不触碰R4 post-trial mutable DB。新增测试须登记root test或专用必需入口，不接受只有手动运行的未注册测试。

边界检查复用`node scripts/check-architecture.mjs`、`node --test scripts/test-architecture-rules.mjs scripts/test-runtime-construction.mjs`及IR type tests；不能删注入非法依赖的negative controls。必要的public声明检查与原exact export inventory同步新增批准接口，不扩大宽松allowlist。

Native实现变动只跑匹配grammar/IPC/语言/Plugin实际路径和相关旧Java回归；本地完整回归、精确profile compatibility/新数值、两E2E只在需要的候选封板时顺序执行，不在每小文档任务重复。遇失败用systematic-debugging，保留原日志并先判断实现/Fixture/设计问题，不自动重试到绿。

云端独立审批：准确commit、目的、预计运行次数、作业范围、可用本地替代齐备后由用户确认。push/PR更新/merge/rerun/dispatch一样受控；不重跑39708335128、不重复下载原完整artifact、不操作付款/预算，也不安排监控定时任务。
