# Phase1 启动审查（待用户确认；不构成实施授权）

## 收尾后补记（2026-10-22，优先于下文审查时的 HOLD）

用户已明确接受历史超时作为未解决遗留项，并确认正常合并及可能自动触发的
main CI。PR21 已正常合并为 `433015700c7c701a6493f7f8fa5eace00e773913`；REST
核实合并树与通过六项必需检查的 `cc5a8cb` 完全一致。Phase0.5 已按原门禁和
保留风险完成验收记录，见[最终收尾](../../handoff/PHASE05_CLOSEOUT.md)。下文关于
未合并、未接受风险的结论是原审查快照，不再是当前阻塞。历史根因仍 UNKNOWN。

Phase1 详细设计前置阻塞解除；DESIGN-READY、缺少已评审 implementation-ready
任务包、26份现有 Fixture 中无 Phase1 Fixture 等事实和追踪缺口均未改变。
可开始详细设计与任务化评审，但本次确认不授权 Phase1 编码。自动 main CI
39708335128 最后读取仍运行中，未冒称通过；无追加重跑或试验。

日期：2026-10-22，Asia/Shanghai。审查基线：`cc5a8cb571986c5e56ed04053b2c96ef500fcacb`。

## 结论

**Phase 晋级：HOLD / NOT APPROVED。Phase1 成熟度：DESIGN-READY，不是 IMPLEMENTATION-READY。**

当前 Phase0.5 的21项原始技术退出义务有代码、Fixture、原始测试及 Evaluation 支持；最新一次准确 head 的 PR/push 六个作业均成功，PR 侧22条原始 actual 验收也通过。**这不等于上一 Phase 的正式收尾已全部完成**：尚无 PR21 正常合并的验证证据；权威文档仍保留生效的集成/失败处理 HOLD，未同步最终结算；历史 Native 超时缺少因果解释，也没有已接受的风险处置/关闭决定。本次不能自行豁免这些条件或把旧失败改成成功。

因此停止正式晋级与 Phase1 编码。本审查仅提供下一阶段的准备性设计分组、依赖、追踪缺口和待确认方案。没有运行新 CI、重跑旧 CI、推送、合并、发布、安装依赖或重新测量。

## 审查方法与权威

重新读取根 AGENTS、Handoff 主入口、CURRENT_STATUS、DESIGN_AUTHORITY、IMPLEMENTATION_PROTOCOL、ROADMAP、WORK_BREAKDOWN 的 Phase0.5/Phase1 部分、PHASE_ACCEPTANCE 两阶段退出条款、DESIGN_TRACEABILITY 的跨阶段与任务/Fixture 对照，以及 DEFERRED_DECISIONS。

大型状态/追踪文档包含大量历史追加条目。本次以现行约束、规范章节和适用的已接受修订为准；旧 checkpoint 不作为当前完成证据，日期较新也不自动覆盖更高权威。

设计依据：

- [Handoff](../../handoff/ENGINEERING_HANDOFF.md)、[协议](../../handoff/IMPLEMENTATION_PROTOCOL.md)、[权威](../../handoff/DESIGN_AUTHORITY.md)。
- [Roadmap](../../handoff/ROADMAP.md)、[WBS](../../handoff/WORK_BREAKDOWN.md)、[Acceptance](../../handoff/PHASE_ACCEPTANCE.md)、[Traceability](../../handoff/DESIGN_TRACEABILITY.md)、[Deferred](../../handoff/DEFERRED_DECISIONS.md)。
- ADR-001..014：本地优先、Canonical IR、SQLite、AUTO/MANUAL、流分层、知识身份、LLM、安全、数据库拆分、Evaluation、Wiki、语言/框架边界。
- ADR-015..019：严格版本化协议、REFRESH/派生状态、真实证据分层、parser 观测、独占固定布局与精确包验收。
- Canonical IR、Module Boundaries、Provider/Plugin SPI、SQLite Schema、Runtime Configuration、Knowledge Workflow、Reconciliation、Agent API、Security、Evaluation；Wiki、Native Scalability、Diagram 三份扩展规范的相关边界。
- 实际源码、Migration Manifest、26份 Evaluation Fixture Manifest、当前 runner/测试注册，以及本地保存的原始日志、报告、receipt、导出摘要与诊断 sidecar。

本次未联网刷新 PR 状态。PR21 未合并的判断基于最后保留的原始 REST 记录和缺少合并验证证据，不冒充此刻的服务器实时查询；任何云端 CI 执行先由用户确认。

## 1. 上一 Phase 的强制退出审查

### 1.1 可复核证据索引

下文 `E` 为本仓库 `.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/`。该目录的原始证据必须保留；它不是已提交源码或全新测量。

| 编号 | 原始证据及本次核对 | 范围与限制 |
| --- | --- | --- |
| E1 | `task8-r4-final-gates-summary.json`：18项 exit0；对应原始日志存在；root 日志1595项/1594 pass/0 fail/1既有 Windows skip；registered REFRESH707/707 | 是原有完整回归结果；本次没有重新执行全套。pack/build/IR types/rustfmt 等安静命令允许空日志，以原退出记录、构建产物和下游执行佐证，不伪造输出 |
| E2 | `task8-r4-actual-evaluation/report/report.json`：31/31、无失败/缺失；五门禁1/1/1/1/0；SHA256 `77f8dab1b2ca3dfcd627de767767951bd1c7e4413a4b89e650db3d47b569bf67` | 本次用现有 evaluator 复算，与原报告逐字段一致；不是仅信任 PASS 字符串 |
| E3 | 本次按原 runner 的7个 dist 包及4个脚本重新计算 Evaluation implementation digest，得到 `76db1d7f011da6cfb4dfbbe3d0ebb1938fe015ab4bad60b15e41bcb0e38d4bc6`，匹配 E2 | 此摘要与产品准入摘要 `3d503771…c5a0` 使用不同域，不能混为一谈 |
| E4 | 准确 head `cc5a8cb`：PR39609209947 / push39609203817 attempt1 均 completed/SUCCESS、六 jobs SUCCESS；两份 Native 原始日志188503/187558字节留存 | 本地原始 REST/日志证据，不在本次重新运行云端；不等于 merge 已发生 |
| E5 | PRartifact12358281078：293798148字节，SHA256 `afa115175499922a62e98d18ceac04476f5c8e5f94353da867e3241c72c6a0bb`；下载已 exit0；只选择性抽取262文件 | 未重复下载，未重新展开240MB内层批准 ZIP |
| E6 | `task8-r4-actual-diagnostic-hosted-audit.json/log`：22/22 admitted 原 receipt、0 fail、transaction/TEMP closed；199原导出文件摘要、17进程 sidecar；峰347144192 <= 已批准394211328字节 | 使用原完整22类 immutable 合同身份验证；不采用或恢复本机非 pristine 工作数据库 |
| E7 | E6原 actual report SHA256 `775733b9c3b6f76eaaf9005f7ee194009092d415e8f7f47815616655acf66c1e`；本次重新核对 | Node峰不包含 Native child；有限样本不是 OS RSS 上界保证 |
| E8 | `phase1-startup-evidence-2026-10-22.json`：本次只读复算结果、26 Manifest/0 Phase1、5个空导出包、无云端操作 | 审查辅助记录，不是新的产品测试通过声明 |

### 1.2 原21项技术退出义务

下面的“有通过证据”仅限声明的 Fixture/版本/环境；**不抹去集成 HOLD，不声明无限稳定性**。

| 原退出项 | 实际代码/Fixture/测试入口 | 证据结论 |
| --- | --- | --- |
| 1 扫描、ignore、generated/vendor/test、二进制与包含/排除 | `packages/source/src/scan.ts`；basic-java-repo/gitignore/generated-vendor | 有通过证据：E1；Manifest 与现有 Source 测试注册可核对 |
| 2 Java 符号、导入、调用、继承、引用、诊断与 coverage | Rust Java adapter、Provider decoder；java-basic-symbol/nested-types/call-basic/inheritance/overload/unresolved-call | 有通过证据：E1、E2 Native GOLDEN；并非所有语言已实现 |
| 3 LanguageAnalyzer 边界、框架解释不进入语言适配器 | `crates/native-analyzer/src/language.rs` trait 与 Java adapter | 源码边界存在；E1架构/Rust/Native检查支持 |
| 4 Provider→Canonical、保留 unresolved | `packages/providers/src/staged-patch.ts` 及 normalizers；canonical-normalization | E1及E2的记录 Provider 分量；不冒充实时解析样本 |
| 5 Canonical/Evidence/binding 持久化 | `packages/storage/src/analysis/canonical-fact-store.ts`；full-analysis-apply/two-provider-same-call | E1、E2 SQLite 比较支持 |
| 6 Full失败保旧图与激活指纹、正确 freshness | Runtime full bootstrap、Application full Apply、Storage activation state | 原 rollback/reopen/freshness 测试及E2保留态检查支持 |
| 7 单文件增/改/删的 validated patch | Application change detector/patch、Runtime refresh、Store事务；refresh-v3 | E1 REFRESH707、E2声明 transition 支持 |
| 8 changed-only/restart、不持久化 AST、不默认全量重解析 | ADR-016派生摘要、ADR-018真实 parser 入口/完成观测 | E2原 parser reference/trial、restart/dependent 用例支持 |
| 9 cold/1/5/50阶段时间和峰值、固定输入 | `scripts/evaluate-phase05.mjs` 与性能 Fixture 输入 | E2有真实 telemetry；没有新设时延/吞吐阈值 |
| 10 worker一致性、实际不同完成顺序、有界资源 | worker-pair及原调度/stream/stage测试 | E2 workers1/2图/coverage/support相同、stale0，completion-order摘要实际不同；E6资源门禁 |
| 11 timeout/budget/parser/unsupported/partial/zero-fact区分 | Provider/Native typed outcomes、java-coverage-*、负例测试 | E1、E2；“能正确报告超时”不等于“历史超时根因已修复” |
| 12 v2 source-grounded统计、strict v1 unavailable | 版本化 TS/Rust IPC 与 shared cases | E1协议/coverage测试；不扩展旧严格协议 |
| 13 移除一个支持而保留另一个、不留stale binding | FactMerger/Store；two-provider-same-call | E1及E2记录 Provider SQLite 分量支持 |
| 14 R009重新选择、legacy回退、失败保旧图 | Store patch与active candidates；incremental-patch-apply | E1、E2支持；原未选中候选不能凭空补造 |
| 15 同 WORKTREE 指纹推进、跨revision/immutable受控回退 | Application/Store显式 FULL_ANALYSIS_REQUIRED | E1 registered cases 支持；未证明通用跨revision carry-forward |
| 16 understand / CODE_TRACE位置、置信、coverage | `packages/runtime/src/code-query.ts`、Application/Storage query、CLI adapter；p05-code-query-cli-v1 | E1及原CLI读后重启/只读证据；不等同 RuntimeFlow/BusinessFlow |
| 17 Critical Symbol Recall >=0.95 | 原冻结 critical scope / evaluator | E2本次复算值1，PASS |
| 18 Critical Direct Call Precision >=0.95 | 同上，额外预测仍算FP | E2值1，PASS |
| 19 Critical Direct Call Recall >=0.90 | 原 direct-call scope | E2值1，PASS |
| 20 Incremental correctness ==1 | 原21项 incremental义务 | E2值1，PASS；未缩减分母 |
| 21 Stale provider bindings ==0 | 原持久化支持/binding比较 | E2值0，PASS |

ADR-016附加的图/summary/support/Evidence/coverage/指纹同事务激活、restart、failed-Apply重试、legacy/incompatible/ownership/resource拒绝也有既有 registered lifecycle 证据；不能以孤立 schema 测试替代它们。

E2证据分层为 **28 NATIVE_INDEX + 2 RECORDED_PROVIDER_SQLITE + 1 DECLARED_SOURCE_NATIVE**，严格保留 ADR-017适用范围；不称31例都是完整公开Git→Native路径。

### 1.3 阻止本次晋级的未闭合项

1. **集成未闭合**：最后保存状态中 PR21仍OPEN，分支含实际 Provider优化、profile、fixture/helper/CI变化，不只是文档。缺少正常 merge commit/head/base 验证，不能把 PR20 的合并当作这些后续变化已集成。合并可能触发 main push CI，本次不执行。
2. **正式权威/记录未闭合**：CURRENT_STATUS、PHASE_ACCEPTANCE、退出审计顶部仍有旧 HOLD/待验收表述；最新结算在 E 原始证据中。需要按事实同步并作正式退出判断，不能仅换成“全部完成”。
3. **历史失败处置未闭合**：旧1dfe01a push 的 Native10000ms TIMEOUT深层原因未知；本轮旧失败案例成功，close约2079ms，并没有捕获原失败因果窗口。需要用户审阅风险处置方案/关闭依据；不能靠重跑直到绿，也不能直接说已修复。若处置意味着改变现有完成/可靠性要求，先走受控 DCP，不能口头豁免强制门禁。
4. **本机复现环境限制**：一次 scratch 试验因恢复控制误判，留下 R4 overlay 的 post-trial工作DB。原进程所有权已结束；不得伪造 receipt、手动覆DB或改 helper 绕 guard。immutable seed/发布资产不变；这个工作副本不可宣称 pristine/可复用。它不直接证明产品回滚失效，但必须在复现交接中披露，不能拿来无条件重跑原 collector。

结论不是“仍有红色的最新 CI”，而是“技术通过证据存在，**整体正式退出尚不可认证**”。本次不晋级。

### 1.4 可复现方式与注意事项

只读复核（不启动 Provider、Native、测量或云端）：

```powershell
# Fixture Manifest发现/严格验证；应得到26份、Phase1为0
node --input-type=module -e "import{discoverFixtures}from'./packages/evaluation/dist/fixture-registry.js';const f=await discoverFixtures('fixtures');console.log(f.length,f.filter(x=>x.manifest.phase==='1').length)"

# 重算原31报告，不只是读取其overall文字
node --input-type=module -e "import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{evaluatePhase05LayeredReport}from'./packages/evaluation/dist/phase05-layered-report.js';const r=JSON.parse(await readFile('.superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/task8-r4-actual-evaluation/report/report.json'));assert.deepEqual(evaluatePhase05LayeredReport({schemaVersion:2,identity:r.identity,requiredRuns:r.requiredRuns,observations:r.observations}),r);console.log(r.gates)"

Get-Content .superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/task8-r4-final-root.log -Tail 9
Get-Content .superpowers/sdd/2026-10-13-p05-index-evaluation-closeout/task8-r4-final-registered-native-refresh.log -Tail 9
```

完整原测试命令来源是 `package.json` 的 test/test:native-analysis/test:native-refresh、`task8-r4-final-gates.mjs` 和 `.github/workflows/ci.yml`；Evaluation原命令为该 gate脚本中的 `scripts/evaluate-phase05.mjs --fixture fixtures/evaluation/phase05-code-intelligence --output <原独占目录> --native <R4 pinned Native> --config <原配置> --repetitions 1`。**不能原地照抄重跑**：独占输出/所有权/当前工作DB状态及准确资源身份必须先满足；云端另获确认。本报告不以运行新长期测试来填补治理决定。

本次辅助证据检查曾错误地要求每个命令日志非空；pack/build/IR types/rustfmt合法安静成功。已改为核对退出记录及对应产物，原检查错误保存在 `phase1-startup-evidence-2026-10-22-first-check-error.log`，不是产品失败或追加CI理由。

## 2. Phase1 目标、成熟度、任务包

目标是 **Core product proof**，不是扩展所有语言或做高级架构智能：框架事实→执行/合同→文档/Claim→受治理的知识发布→搜索/Wiki/Agent API→可安装产品，并证明安全和端到端效用。

ROADMAP明确Phase1为DESIGN-READY；WORK_BREAKDOWN只列规划分组，没有已审阅的Phase1任务级包。实际核对：

- `packages/execution/src/index.ts`、`contracts`、`documents`、`knowledge`、`agent-api` 同位置均只有 `export {};`，尚不是可用子系统。
- `apps/mcp/src/main.ts` 只有 `--smoke` 启动路径，普通路径明确未实现，不是已交付六工具。
- Plugins已实现严格SPI/候选校验/确定性选择，不等于已有Spring/Mongo/Kafka/FastAPI实现。
- repository migration实际到R010；workspace实际到W003。R011/R012、W004..W011仍是Phase1规划，不可把表名列表当DDL实现。
- Runtime现有 bootstrap配置只有版本/mode/workspaceRoot；完整EffectiveConfig、LLM/安全策略组合、Agent setup等仍有差距。
- 26份有效Manifest均属Phase0/0.5；`vulnerability-processing`、`spring-fastapi-kafka` 尚无注册的Phase1 Manifest和验收报告。

**目前没有可以直接领取编码的、已经审阅的 implementation-ready Phase1任务包。**

## 3. 必做、边界与实现差距

必做范围取自 PHASE_ACCEPTANCE 的22项，不从 package 名称推断完成：

- 四类内建框架Plugin：Spring、Mongo、Kafka、FastAPI；canonical entry points/tasks/data resources/contracts；关键入口/边界基线。
- ExecutionGraph 的REQUEST/EVENT/JOB/TASK/BATCH上下文，确定性RuntimeFlow和每步支持引用。
- 服务身份/HTTP与消息合同匹配、ambiguity/unresolved/conflicted/outside-workspace/known-external及保留revision/confidence的跨仓trace。
- Markdown/ADR结构Document IR、Evidence/Claims；Component/Capability/Integration/grounded BusinessFlow候选。
- Repo/Workspace/CrossRepo知识工作流：冻结RevisionSet、身份/谨慎reconciliation、copy-on-write手动发布、失败保最后发布；freshness与currency分离。
- 有权限/预算/版本/结构验证的LLM runtime、本地或OpenAI-compatible供应商边界；不要求云端模型或模型随安装分发。
- 无embedding也能使用的FTS5；六个MCP工具及L0/L1/L2按需、预算化、只读获取。
- 标准LOCKED Wiki只读已发布Knowledge，不因投影变化触发语义更新；缺失/过期跨仓支持明确报告。
- 安全基线、配置/安装/init/index/agent setup dry-run/doctor/status，以及两个E2E全部critical probes。
- 若启用降级候选：只在显式授权的语义更新内，保留来源/生成方法/coverage/未验证关系，走同一验证与发布链；不是必做完整降级编排。

Not in Scope / Deferred：

| 能力 | 边界 |
| --- | --- |
| Embedding/Zvec/hybrid检索、daemon/local HTTP、advanced reconciliation及架构/Decision/Migration知识 | Phase2方向；Phase1不得以此阻塞FTS5和one-shot/MCP核心 |
| 用户Declarative WikiSpec、profile继承/自定义持久化、通用验证/diff调优 | Phase2；Phase1标准LOCKED Wiki仍必做 |
| 全量source-grounded降级编排、完整DiagramModel/Mermaid renderer/跨仓时序和迁移图 | Phase2；不能伪造关系或从CallGraph推断时序 |
| SCIP/Joern深度、CFG/PDG/taint持久化、adaptive provider/model routing、管理式模型下载、第三方插件sandbox、Agent session memory、单可执行文件、自动语义发布 | Phase3或更晚；早期不引入依赖 |
| Enterprise ACL/远端runtime、Wiki扩展SDK | Phase3或更晚；Phase1只有当前本地安全与内建可信Plugins |
| 任意所有语言或FAST/BALANCED/PRECISE深度档 | 无“Phase1全语言”门槛；深度档至少Phase2且须证据 |
| Phase4 | 未获正式设计，不存在 |

特别缺口：FastAPI语义是Phase1必需，但当前只有Java Native能力。必须设计并以Fixture证明其Python事实入口，**不等于可以把“所有语言”改成门槛，也不能用LLM降级候选假扮Canonical Code Facts**。

## 4–5. 建议任务分组、依赖、设计/Fixture/门禁

下表ID只是本审查的**建议分组标签**，不是已批准WBS、Fixture ID或可执行实现计划。所有“待建”Fixture目前都未注册；需在详细设计中落实准确输入、独立oracle、错误/恢复、命令和Owner。

| 建议组 | 设计依据与交付缺口 | Fixture / Quality Gate / 验收方式 | 前置 |
| --- | --- | --- | --- |
| G0 上一阶段关闭决定 | ADR-012、Protocol、现有Exit Audit；集成、历史失败处置和权威同步 | 复核上节原证据；受保护正常合并验证；风险决定不能豁免强制门禁。任何会触发CI的操作另确认 | 当前审查决定 |
| D1 Phase1合同/持久化/端口详设 | Canonical IR Runtime/Document/Knowledge、ADR-002/005/006/011、Module Boundaries、SQLite | 待建严格schema/版本兼容/引用/错误向量，R011/R012与W004..W011逐项迁移/升级/回滚/隔离设计；先评审，不预建表 | G0后正式规划；准备性设计须用户确认 |
| D2 Fixture/基线/追踪任务包 | ADR-012、Evaluation、Acceptance；L2/L3/L4尚无已批准Phase1基线 | 两个E2E与各域Manifest、critical probes/independent oracle、失败/缺失不得PASS；待批准的数值保持未定，不默认0/1；登记task→spec→fixture→gate→command→report | D1接口可协同，发布前收敛 |
| S 安全与配置骨架 | ADR-001/008/009、Security、Runtime、Agent API | 待建local-only/secret/注入、query-vs-update授权、remote opt-in、取消/预算、allowlist和配置优先级Fixture；零越权/不自动远端回退是既有不变量，不是新设比率 | D1/D2；先冻结安全端口 |
| P1 事实入口与四类Plugin | ADR-002/010/014、Provider/Plugin SPI；FastAPI适用入口需定案 | 每Plugin detection正/负、提取/组合/ambiguity/partial/incremental invalidation；新增语言需独立Fixture/Evaluation/注册；入口/边界recall按待批准冻结基线 | D1/D2/S；Python入口方案先审阅 |
| P2 ExecutionGraph/RuntimeFlow | ADR-005、Runtime IR、repo R011/R012 | 待建request/event/job/task/batch、branch/join/retry/failure/compensation及异步边界；deterministic重放和支持引用完整，不能把code trace标成业务流 | D1、P1事实输入；可先独立golden设计 |
| P3 合同/服务身份/跨仓 | ADR-011、Runtime IR、Workspace W004..W006、Agent API | 待建HTTP/message正反向、歧义/冲突/未解/外部/工作区外，revision与confidence追踪；独立匹配golden及保守失败 | D1、P1、与P2约定边界 |
| P4 Document IR与结构Claims | ADR-004/006、Document/Claim IR、W007/W008、Security | 待建Markdown/ADR heading/block/table/link/code/chunk、来源定位/增量/注入/缺失；结构自动，语义Claim权限分开 | D1/D2/S；不依赖LLM完成结构 |
| P5 LLM runtime / SemanticTask | ADR-008/009、Knowledge Workflow、Security | 待建四种SemanticTask、结构输出、修复/transport retry区分、预算/取消、prompt/model版本/provenance、secret/注入/no-fallback；确定性fixture模型数据不冒充真实模型质量 | D1/D2/S；与P4可独立设计 |
| P6 知识身份/三工作流/发布 | ADR-004/006/007/008/011、Reconciliation、Knowledge Workflow、W009..W011 | 待建rename/reword稳定ID、真实结构演进、ambiguity/merge/split-review/消失、失败/partial保旧版、冻结RevisionSet、grounding/probes及freshness/currency；不自动语义发布 | P2/P3/P4，语义路径P5；最小范围需先审阅 |
| P7 FTS5与标准Wiki | ADR-003/013、SQLite、Wiki Projection、KnowledgeQuery/Application | 待建无embedding搜索、派生索引重建、LOCKED拒绝自定义、required-data/stale/provenance、reprojection不调用update_knowledge、不读裸SQL事实作Wiki | P6发布/查询端口；FTS接口可提前并行 |
| P8 Agent API/MCP/L0-L2 | Agent API六工具、ADR-004/009/013、Security | 待建六工具严格请求/响应/错误、stdio、一进程workspace、read-only/写权限、budget/truncation、lazy L0/L1/L2、startup不全量加载Wiki | D1/S稳定后先设计schema；集成依赖P2/P3/P6/P7 |
| P9 CLI/安装/分发 | ADR-001/010、Runtime Packaging、Security | 待建npm+平台Native包安装、无Rust/无LLM、init/index/setup dry-run/backup/doctor/status/配置升级错误；明确支持平台与离线降级 | D1/S；最终集成P8及各用例 |
| P10 E2E/质量封板 | ADR-012、Phase1全部22项 | 待建vulnerability-processing及spring-fastapi-kafka Manifest、全部critical probes、故障/权限/无模型运行、跨仓revision与last-good恢复；任务测试与实际产品路径分层，不以mock报告冒充端到端 | 全部必需组 |

推荐顺序：G0 → D1/D2/S的已审阅合同与基线 → P1/P4/P5 → P2/P3 → P6 → P7/P8 → P9/P10封板。安全和Evaluation是贯穿约束，不是最后补测。

可安全并行（**合同先冻结、独立文件所有权、最后串行集成**）：

- 文档结构、四Plugin的独立golden/检测、LLM边界/安全负例、MCP schema与安装测试设计可分组推进。
- P2与P3可在约定Boundary/EntityRef后分别设计；P4与P5可并行。
- 共享IR、migration序号/manifest、Runtime组成根、公共错误/权限语义与E2E基线不能各分支自行定案；由一个合同Owner收敛。不同工作流不得并行改同一SQLite publication事务。
- 本次只是指出并行机会，未启动并行编码或新会话。

## 追踪缺口（必须独立关闭）

1. WBS只有Phase1规划分组；Traceability仍是“Phase1 framework/knowledge/tasks”等泛指，没有任务级稳定Owner、依赖、输入/输出、失败/恢复、文件及验收命令的已审阅包。
2. Phase1有效Manifest为0；两个指定E2E、Plugin/Runtime/合同/Knowledge/Security/Agent/Wiki/安装Fixtures均无已注册全链对应物。
3. Canonical Runtime/Document/Claim/Knowledge只有概念实体与职责；缺少可实施的严格字段/版本/限制/引用、Store端口、DDL/迁移、并发/回滚/兼容决定。
4. 关键入口/边界recall只要求“已批准Fixture baseline”，目前没有该冻结集/critical划分及批准阈值；不能移植Phase0.5的95/95/90为Phase1新门槛。
5. 当前通用metric CLI仅支持六个Phase0 Code Fact指标；当前Manifest `criticalFacts` 与Code comparator不是Knowledge/Runtime probes机制。新增L2/L3/L4/probe报告、空分母、适用性和baseline版本须显式设计，不能把空qualityGates或类型不适用评估当产品通过。
6. FastAPI输入依赖未落实；“Plugin不重复解析已有facts”与“Python未注册”需要明确可验证的Provider/配置artifact入口，不能默认事实足够。
7. Reconciliation含transition/drift的通用规范，Roadmap把Architecture/Decision/Migration及advanced reconciliation放Phase2。需明确Phase1最小状态保真/不误判冲突与Phase2完整drift能力的边界；本次不把整套后期功能设成Phase1必做。
8. 弱化source-grounded候选是条件项，不是补齐缺失Canonical事实的通行证；是否启用及最小权限/grounding Fixture未定。
9. 平台包兼容矩阵、无Rust/无LLM安装验证、LLM本地可复现probes/模型版本与远端授权策略缺少任务级闭环。
10. 上一阶段CURRENT_STATUS/Traceability/正式退出记录与最终原始证据存在更新缺口；E中的成功报告不能自动改变版本库里的授权/生命周期状态。

## 6. ADR/DCP与待用户决策

目前未发现“启动Phase1必然要推翻FROZEN决策”的依据；不能为了开工预设新的架构。已有ADR覆盖正常增量设计，新增兼容实体/迁移先写详细spec/任务包，不等于随意改旧Schema。

需要先提交书面设计/决定的事项：

- **上一阶段故障处置/关闭记录**：保留UNKNOWN、失败数据和适用范围，解释当前绿窗能证明什么/不能证明什么；如需改变既有治理/可靠性要求，以DCP列证据、替代方案、影响、回退并获接受，不能直接豁免。
- **Phase1 Evaluation与Fixture/probe兼容设计**：原v1 Manifest/原Code指标不静默改义；若新增报告/Manifest版本或其他material Evaluation接口，按ADR-012/017先评审明确兼容记录，必要时新增ADR，不能先实现再补。
- **Phase1 IR/存储/Publication详设**：冻结字段、版本、R011/R012、W004..W011、事务/迁移/恢复；若破坏已发布R001..R010/W001..W003或IR/Provider契约，停止相关工作并提出DCP/ADR。
- **FastAPI事实入口适用性设计**与**Reconciliation Phase1/2边界澄清**：先做书面方案与Fixture依据，不擅自承诺全Python或完整架构drift。

以下方案若被提出将直接触发FROZEN审查：Wiki直接读裸Fact/SQL、LLM直写Canonical、因解析失败自动语义发布/远端fallback、Rust拥有SQLite、合并repo/workspace真相库、取消Evidence链或改变AUTO/MANUAL、把后期能力变成当前依赖。当前方案不采用它们。

请确认的方案（不是编码授权）：

1. 接受本审查的HOLD结论，先关闭G0；是否允许在不晋级、不编码前提下准备D1/D2/S及事实入口的详细设计。
2. 接受上表作为**设计分组草案**，要求先完成任务级追踪/Fixture/门禁/失败恢复并审阅，之后才决定实施顺序和方法。
3. 允许对FastAPI入口提交比较方案：复用合格Provider路径或在现有语言中立边界内引入有限Python适配路径；先比较能力/Fixture/安全成本再选择，不能用LLM伪造代码事实。
4. 初期是否保持source-grounded降级候选关闭（建议默认不增加可选编排），先交付正常手动知识链；完整降级编排仍属Phase2。
5. 关键入口/边界和知识/Agent probes的具体质量基线，待独立Fixture与测量方案准备后集中批准；本次不请求批准不存在的数值。
6. 云端仍默认不执行；涉及CI的操作先确认具体head、批次、范围和次数。合并/分发/远端LLM也不借本审查自动获得权限。

## 7. Phase1 Exit Criteria与首个可执行任务

退出标准完整保留 PHASE_ACCEPTANCE 的22项，实施包必须逐项落Owner/Fixture/命令/报告：

1. 四框架的canonical入口/task/data/contract；2. 批准基线的critical入口与边界recall；3. 不压平异步的ExecutionGraph；4. 有支持引用的确定性RuntimeFlow；5. 六类合同匹配结果；6. 跨仓revision/confidence；7. Markdown/ADR Document IR/Evidence/Claim；8. 四类grounded知识候选；9. rename/reword身份与结构revision；10. 手动语义更新/失败保旧版；11. freshness/currency分离；12. 无embedding的FTS5；13. 六工具schema/权限；14. 本地、安全、secret/注入/remote opt-in；15. 无Rust/无LLM的安装与操作链；16. 两个E2E全部critical probes；17. 标准Wiki的published Knowledge读边界；18. reprojection不更新知识/LOCKED/缺失明确；19. 注册语言的能力证据、非全语言门槛；20. L0/L1/L2预算按需只读；21. 若启用降级则保留来源限制并经正常门禁；22. System Wiki只用已发布知识且报告缺失/过期跨仓支持。

**建议首个可执行任务不是写产品代码，而是“G0退出差异与风险处置记录＋D1/D2/S书面设计 brief”**：引用本次原始证据、列未闭合决定；在用户确认允许准备性设计后，冻结首批接口/Fixture设计与责任矩阵，提交审阅。正式G0关闭之后才产出/审阅implementation-ready细分包，并再次等用户明确确认才开始Phase1编码。

不建议首任务是直接写Spring Plugin、创建未来所有数据库表、接入云端LLM、实现MCP六工具或重复整轮CI。

---

审查停止点：等待用户对上述方案明确确认。除本审查文档及本地审查证据外，不改产品、Schema、配置、Fixture、权威验收勾选，不提交/推送/合并，也不启动云端任务。
