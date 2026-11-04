# Phase1 Knowledge and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, only after explicit user implementation approval. Steps use checkbox (`- [ ]`) syntax for tracking. No new chat, worktree, parallel long tests, or subagent execution is authorized.

**Goal:** 完成可追溯的文档/语义知识发布，FTS5、标准Wiki、六工具MCP、安装与Phase1端到端验证。

**Architecture:** 复用第一份计划的Canonical/Runtime/合同basis，经不可变CompilationInputSnapshot、候选验证、身份/Reconciliation、Evaluation与copy-on-write publication形成知识；Wiki/Agent只能按权限消费公开用例。LLM与网络在事务外，所有语义发布显式MANUAL。

**Tech Stack:** 当前TypeScript/Node >=24<25、Zod、node:sqlite、现有runtime/application/ports；必要Markdown/YAML/MCP解析依赖必须先核验准确版本/许可证并批准，不在本计划暗中安装。

**Spec:** [Knowledge and Consumption](../specs/2026-10-22-phase1-knowledge-and-consumption-design.md)、[Evaluation](../specs/2026-10-22-phase1-evaluation-design.md)、[Compatibility](../specs/2026-10-22-phase1-compatibility-proposal.md)、[Foundation plan](2026-10-22-phase1-foundation-and-runtime.md)。

## Global Constraints

- PROPOSED，所有目标文件、Fixture、命令均未创建/执行；任务unchecked。未获用户明确确认前不得实施。
- 第一份计划的全局约束、共同结束检查完整继承：旧工作/换行/原失败/风险保留；不自动stage/commit/push/CI，不用非pristine R4 DB。
- 所有schema、W007..W011、port依赖及accepted ADR/spec先同步；W009单独完成不具备合法发布能力，需W010/W011 provenance完整约束。
- Runtime只能依赖既有application/storage/providers/plugins；model/query/Store ports通过Application re-export的结构类型消费，不能直接import knowledge/ir绕过当前architecture allowlist。Storage只依赖IR。
- semantic quality需要ACTUAL_MODEL；无本地模型/未批准baseline时保持NOT_EVALUABLE，不将fixture double当真实质量。远端LLM另授权。
- conditional degraded候选默认按建议关闭；用户若要求启用必须补相应path-specific设计/任务，不在本计划自动加入。

## Review Focus

1. 同WORKTREE下长编译期间source/support改变：P1-12/P1-14保历史依据、拒绝旧head或准确标AFFECTED，绝不声称跨库瞬时原子一致。
2. 模型输出未提供的实体/关系、doc注入、repair泄露：P1-11/P1-14必须拒绝，不由模型自评confidence。
3. rename/reword与split/disappearance：P1-13不能姓名相似即合并、无阈值即自动deprecate；CURRENT/TARGET不误冲突。
4. 发布后输出失败与重启：P1-14/P1-18保COMMITTED/UNKNOWN准确效果，不能自动重试复制publication。
5. 旧知识/索引/投影与权限变化：P1-15..18检查可读范围、missing/stale及read-only不触发语义更新。

## 顺序与独立性

默认P1-10→11→12→13→14→15→16→17→18→19→20；P1-10纯解析、11模型安全边界可在接口冻结后独立于Plugin逻辑实现，但不并发。12需要09跨repo读取，14需要10..13及W011，16需要14的published query，18需17及安全/Runtime组合，19最终封板需18。跨repo发布和W009..W011的manifest/事务不可独立分支各自定案。

### P1-10: Markdown/ADR结构与W007/W008

**Files:** Create `packages/documents/src/parse-document.ts`, `packages/documents/test/parse-document.test.mjs`, `packages/storage/migrations/workspace/007_documents.sql`, `008_claims.sql`, `packages/storage/src/documents/document-store.ts`, `packages/storage/test/document-store.test.mjs`, `packages/application/src/update-documents.ts`, `packages/application/test/update-documents.test.mjs`, `fixtures/phase1/document-ir/`; Modify domain/Storage/App exports、workspace manifest、root tests。

**Interfaces:** `parseDocument(AuthorizedDocumentBytes,RequestControl):DocumentDraft`；`applyDocuments(ValidatedDocumentBatch):Promise<DocumentApplyReceipt>`；typed schemas来自P1-01。documents包不直接读Source/DB/模型。

- [ ] Step 1: literal Markdown/ADR与位置golden先写；`duplicate-heading-keeps-distinct-section`、`fenced-code-is-not-instruction`、`table-and-link-retain-source-ranges`、`parse-failure-retains-document-revision`、`semantic-claim-not-auto-published`，deepEqual结构及事务前后pointer。
- [ ] Step 2: `node --test packages/documents/test/parse-document.test.mjs packages/storage/test/document-store.test.mjs packages/application/test/update-documents.test.mjs`观察缺行为失败。
- [ ] Step 3: 接受后的单一Markdown AST依赖和位置转换、strict IR/授权字节入口、W007/W008 atomic apply；unknown/malformed块显式coverage，不执行HTML/import/URL。
- [ ] Step 4: build documents/storage/application/runtime并重跑；W006→W007→W008、rerun/too-new/锁/失败重开、source policy与权限负例通过；无语义编译副作用。
- [ ] Step 5: 注册`p1-document-ir-v1`；记录parser版本/语法覆盖、结构AUTO与语义MANUAL、migration checksums、E07/trace。

### P1-11: 四SemanticTask与本地/compatible adapter

**Files:** Create `packages/knowledge/src/semantic-context.ts`, `semantic-task.ts`, `packages/knowledge/test/semantic-context.test.mjs`, `semantic-task.test.mjs`, `packages/application/src/semantic-model-port.ts`, `packages/runtime/src/llm/openai-compatible-adapter.ts`, `packages/runtime/test/semantic-model-adapter.test.mjs`, `fixtures/phase1/semantic-runtime/`; Modify exports、approved prompt registry数据和root tests。

**Interfaces:** `buildSemanticContext({snapshot,task,scope,policy,budget}):SemanticContext`；`SemanticModelPort.generate(SemanticInvocationRequest,RequestControl):Promise<SemanticInvocationResult>`。Runtime经Application re-export port，knowledge不import模型SDK。

- [ ] Step 1: 四任务literal outputs；`unknown-support-ref-is-rejected`、`repair-rechecks-secret-policy`、`transport-retry-does-not-consume-repair-counter`、`cancelled-output-is-not-candidate`、`missing-model-keeps-deterministic-query-usable`、`security-block-never-selects-remote`。
- [ ] Step 2: 运行新knowledge/runtime tests确认缺函数/行为RED；所有double明确TEST_DOUBLE。
- [ ] Step 3: versioned prompt/schema选择、上下文边界、bounded输出和usage/provenance；配置local endpoint或显式remote，禁不受控redirect/fallback；重试无批准上限就不自动重试。
- [ ] Step 4: build knowledge/application/runtime后纯tests和受限本地mock HTTP adapter测试通过；本地mock协议不是ACTUAL_MODEL。真实本地模型验收在20，未配置保持待验，不转远端。
- [ ] Step 5: 注册`p1-semantic-runtime-v1`；记录prompt/model-policy版本、实际调用有无、禁存raw payload、remaining actual quality evidence。

### P1-12: 冻结RevisionSet与不可变编译输入

**Files:** Create `packages/application/src/capture-compilation-input.ts`, `packages/application/test/capture-compilation-input.test.mjs`, `fixtures/phase1/compilation-snapshot/`; 12交付纯capture与现有读端口组合，W010 DDL及append-only持久化归14，不制作临时镜像schema冒充真实迁移。

**Interfaces:** `captureCompilationInput(request:CompilationCaptureRequest,ports:CompilationCapturePorts,control):Promise<CompilationInputSnapshot>`；readCanonical/readRuntime/readDocuments每库单snapshot，capture后重验basis；输出不可变值及其规范字节摘要，由14的`CompilationInputStore.putValidatedSnapshot(snapshot):Promise<SnapshotReceipt>`持久化。

- [ ] Step 1: `mutable-revision-id-does-not-prove-same-input`、`same-fingerprint-support-change-invalidates-capture`、`captured-input-is-immutable`、`capture-has-no-raw-secret`、`cross-repo-capture-does-not-claim-simultaneous-state`、`policy-revocation-denies-reading-body`。
- [ ] Step 2: `node --test packages/application/test/capture-compilation-input.test.mjs`缺接口RED；测试包含独立capture向量及真实09读端口，不预建未发布schema。
- [ ] Step 3: 基于09读取端口捕获经policy过滤事实与support digest，冻结RevisionSet；不复制live repo真相表，不把current pointer变成历史出处；本任务成功条件止于完整capture/不可变返回值与basis重验；持久化明确由14拥有，不留下跨任务未闭合的自身完成条件。
- [ ] Step 4: build application/storage/runtime后新tests+原workspace RevisionSet immutability回归；三scope捕获、budget/取消/source变化负例均通过。W010持久化、不可变表及publication集成是14的完成义务。
- [ ] Step 5: 注册`p1-compilation-snapshot-v1`并记录capture已验与14持久化未验的区别。

### P1-13: 身份与最小Phase1 Reconciliation

**Files:** Create `packages/knowledge/src/identity.ts`, `reconciliation.ts`, `packages/knowledge/test/identity.test.mjs`, `reconciliation.test.mjs`, `fixtures/phase1/knowledge-identity/`; Modify exports/identity policy引用与root tests。

**Interfaces:** `resolveKnowledgeIdentity({candidate,existingItems,policyRef},control):IdentityDecision`；`reconcileKnowledge(input:ReconciliationInput):ReconciliationPlan`。结构anchor唯一exact模式，无证据不引入相似度权重。

- [ ] Step 1: rename/reword同opaque ID、结构更新正确revision、同名不同scope不合并、多结构候选REVIEW_REQUIRED、split review、disappearance不立刻deprecate、CURRENT/TARGET无冲突；deepEqual literal expected决策和解释。
- [ ] Step 2: `node --test packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs`确认缺接口/行为失败。
- [ ] Step 3: strict type/scope/state筛选、结构signals、完整decision及review gate；缺阈值输出null+policy状态；merge遵循规范survivor建议且不能无证据执行；不实现Phase2高级drift/curation。
- [ ] Step 4: build knowledge后重跑；含transition与drift applicability控制，证明“不误冲突/没有伪报高级分析”，不把DEFERRED记PASSED。
- [ ] Step 5: 注册`p1-knowledge-identity-v1`；若exact模式不能满足独立Fixture则提EVOLVABLE设计调整与证据，禁止放宽oracle或捏造numeric policy。

### P1-14: W009..W011、三工作流与原子发布

**Files:** Create workspace `009_knowledge.sql`, `010_lifecycle.sql`, `011_evaluation.sql`, `packages/storage/src/knowledge/knowledge-store.ts`, `packages/storage/src/knowledge/compilation-input-store.ts`, `packages/storage/test/compilation-input-store.test.mjs`, `packages/storage/test/knowledge-store.test.mjs`, `packages/application/src/update-knowledge.ts`, `packages/application/test/update-knowledge.test.mjs`, `packages/runtime/src/knowledge-composition.ts`, `packages/runtime/test/knowledge-composition.test.mjs`, `fixtures/phase1/knowledge-publication/`, `fixtures/phase1/source-freshness/`; Modify manifests/exports/root注册。

**Interfaces:** `updateKnowledge(KnowledgeUpdateRequest,KnowledgeUpdatePorts,RequestControl):Promise<KnowledgeUpdateResult>`；`KnowledgePublicationPort.publish(input:ValidatedPublicationSet):Promise<PublicationReceipt>`。expected head CAS、run id/idempotency、input snapshot、evaluation与support闭包必需。

- [ ] Step 1: 真实临时SQLite tests：`failed-or-partial-keeps-published-head`、`publication-head-race-refuses-second-writer`、`same-idempotency-key-with-different-input-refused`、`reopen-after-interruption-retains-last-good`、`commit-then-output-error-reports-committed`、`source-changed-after-commit-is-affected-not-rolled-back`、`missing-provenance-fk-blocks-publish`；三个scope都验，不仅unit double。
- [ ] Step 2: 新App/Store/Runtime tests观察缺publication行为失败；故障点在写revision、关联provenance、pointer移动前后独立注入。
- [ ] Step 3: 补W009→W010→W011的前向FK/关联表设计、append-only snapshots、single workspace publication事务和typed effects；LLM在事务外，policy提交前复验，后置basis变更如实标affected。
- [ ] Step 4: build storage/knowledge/application/runtime；`node --test packages/storage/test/knowledge-store.test.mjs packages/application/test/update-knowledge.test.mjs packages/runtime/test/knowledge-composition.test.mjs packages/storage/test/compilation-input-store.test.mjs`；所有升级/锁/取消/失败/重开与12 snapshot实际持久化集成通过。SourceFreshness与四currency状态分别验证。
- [ ] Step 5: 注册publication/source-freshness Fixture、W011前publication拒绝、E08..E11证据；若actual模型/quality baseline缺失只标workflow验证，不宣称phase语义gate通过。

### P1-15: Published KnowledgeQuery与无embedding FTS5

**Files:** Create `packages/application/src/knowledge-query.ts`, `packages/application/test/knowledge-query.test.mjs`, `packages/storage/src/knowledge/knowledge-query-store.ts`, `packages/storage/test/knowledge-query-store.test.mjs`, `fixtures/phase1/fts-query/`; FTS DDL纳入尚未发布的W011（如已发布则用新migration，禁止改旧文件）；Modify exports/注册。

**Interfaces:** `KnowledgeQuery.readPublished(PublishedKnowledgeQuery,RequestControl):Promise<KnowledgeQueryResult>`；`searchKnowledge(KnowledgeSearchQuery,KnowledgeQueryPorts,control):Promise<KnowledgeSearchResult>`。

- [ ] Step 1: `pending-candidate-not-searchable`、`fts-works-with-embedding-disabled`、`rebuild-keeps-canonical-revisions`、`search-filters-permission-before-materialization`、`stale-published-revision-is-visible-with-warning`、`same-rank-stable-id-order`、`unavailable-index-is-not-successful-empty-result`。
- [ ] Step 2: 新App/Store query tests观察缺能力RED。
- [ ] Step 3: 参数化FTS与有界graph展开、published-only/scope policy、精确basis/currency meta，derived重建不改变真相；不接Zvec/hybrid。
- [ ] Step 4: build application/storage/runtime后`node --test packages/application/test/knowledge-query.test.mjs packages/storage/test/knowledge-query-store.test.mjs`；真实FTS查询、损坏/恢复、无模型路径和原code-query兼容通过。
- [ ] Step 5: 注册`p1-fts-query-v1`，记录E12与FTS构建版本、失效/恢复证据。

### P1-16: 标准LOCKED Wiki/Markdown投影

**Files:** Create `packages/knowledge/src/standard-wiki.ts`, `packages/knowledge/test/standard-wiki.test.mjs`, `packages/application/src/project-wiki.ts`, `packages/runtime/src/wiki-artifact-writer.ts`, `packages/runtime/test/wiki-artifact-writer.test.mjs`, `fixtures/phase1/standard-wiki/`; Modify exports/CLI显式reprojection适配/测试注册。

**Interfaces:** `projectStandardWiki(WikiProjectionRequest,{knowledgeQuery,artifactWriter},RequestControl):Promise<WikiProjectionResult>`；deterministic模板只消费published查询结果，artifact writer confined copy-on-write。

- [ ] Step 1: `wiki-never-reads-raw-fact-store`（注入只能KnowledgeQuery的port）、`locked-policy-refuses-custom-sections`、`missing-required-data-is-not-complete`、`reprojection-does-not-call-model-or-update`（计数均0）、`write-failure-keeps-old-artifact`、`target-junction-outside-root-refused`。
- [ ] Step 2: 新Wiki/writer tests观察缺接口失败。
- [ ] Step 3: 标准章节、来源/版本tuple、missing/stale/partial；受限文件artifact写入和manifest切换；不建Phase2 WikiSpec/继承/SDK/独立SQLite artifact表。
- [ ] Step 4: build knowledge/application/runtime后新tests+14/15实际published→Markdown路径；同内容/version不自触发revision、输出失败原文件可读、无模型仍可重投影。
- [ ] Step 5: 注册`p1-standard-wiki-v1`，记录E17/E18/E22与实际输出artifact/provenance，无虚构Architecture/Migration。

### P1-17: 六Agent工具与L0/L1/L2

**Files:** Create `packages/agent-api/src/request-context.ts`, `tool-schemas.ts`, `tools.ts`, `packages/agent-api/test/tools.test.mjs`, `packages/application/src/project-context.ts`, `trace-flow.ts`, `knowledge-status.ts`, `fixtures/phase1/agent-api/`; Modify agent-api入口、Application exports、root注册与exact inventory。

**Interfaces:** `createAgentTools(ports:AgentToolPorts):AgentTools`，六方法名保持规范；`executeAgentTool(name,input,context):Promise<AgentToolResponse>`；trace kind=CODE/EXECUTION/RUNTIME/BUSINESS。context/meta字段遵照设计，外部strict schemas映射Application，不直调Provider。

- [ ] Step 1: 六schema合法/非法向量；`read-only-tools-never-update`（五query计数update=0）、`l0-does-not-preload-wiki`、`l2-budget-returns-frontier`、`business-trace-only-published`、`raw-secret-denied-with-derived-access`、`permission-error-is-not-empty-success`。
- [ ] Step 2: `node --test packages/agent-api/test/tools.test.mjs`确认缺工具失败。
- [ ] Step 3: 复用现有code understand/trace和09/15/14端口，按需L0 summary/L1 knowledge/L2 facts；禁止查询隐式compile或远端fallback。
- [ ] Step 4: build agent-api/application/runtime；新tests+现有code-query回归及真实Store→tools调用通过；startup不读全Wiki/模型调用的计数为0。
- [ ] Step 5: 注册`p1-agent-api-v1`，记录E13/E20和预算/错误/权限 schema版本，真实stdio待18。

### P1-18: MCP stdio与Runtime生命周期

**Files:** Create `apps/mcp/src/server.ts`, `apps/mcp/test/server.test.mjs`, `packages/runtime/src/mcp-session.ts`, `packages/runtime/test/mcp-session.test.mjs`, `fixtures/phase1/mcp-lifecycle/`; Modify MCP main/package（仅已批准协议依赖）、Runtime composition/CLI startup reconciliation、注册。

**Interfaces:** `runMcpServer(options:McpServerOptions):Promise<McpExitResult>`；`createMcpSession(config,dependencies):Promise<McpSession>`包含dispose/cancel，单workspace，startup reconciliation后watch，shutdown settle。

- [ ] Step 1: 实际child stdio tests六工具、`stdout-protocol-only`、`request-cannot-switch-workspace`、`cancel-stops-model-and-closes-resources`、`watch-overflow-marks-uncertain-and-reconciles`、`startup-does-not-update-knowledge`、`no-watcher-one-shot-still-reconciles`。
- [ ] Step 2: `node --test --test-concurrency=1 apps/mcp/test/server.test.mjs packages/runtime/test/mcp-session.test.mjs`确认当前普通路径未实现导致失败；`--smoke`成功不是新功能RED替代。
- [ ] Step 3: 官方兼容stdio库/strict tool schemas、bounded context与生命周期；保留smoke；无daemon/background服务、无隐式语义编译。
- [ ] Step 4: build runtime/agent-api/apps/mcp；新tests+原smoke/Runtime construction通过，真实进程stdout无日志、stderr受控，shutdown无悬挂子进程。
- [ ] Step 5: 注册`p1-mcp-lifecycle-v1`；收齐E13/E14/E20实路径与source-freshness漏watch后重验。

### P1-19: 安装/init/setup/doctor/status

**Files:** Create `packages/runtime/src/install-capabilities.ts`, `apps/cli/src/init.ts`, `agent-setup.ts`, `doctor.ts`, `status.ts`, `apps/cli/test/install.test.mjs`, `agent-setup.test.mjs`, `fixtures/phase1/install/`及批准平台Native包目录；Modify CLI routing/package manifests/packaging scripts/README（不publish）。

**Interfaces:** `inspectInstallCapabilities(input):InstallCapabilityReport`、`planAgentSetup(request,ports):AgentSetupPlan`、`applyAgentSetup(plan,expectedConfigDigest):Promise<AgentSetupReceipt>`；init/index分离，doctor/status只报告不修复。

- [ ] Step 1: owned临时安装环境屏蔽Rust/LLM；`init-does-not-index`、`setup-dry-run-does-not-write`、`setup-merge-backs-up-and-checks-digest`、`unsafe-config-returns-snippet`、`wrong-platform-or-protocol-refused`、`missing-native-retains-existing-query`。
- [ ] Step 2: 新CLI安装/配置tests确认缺行为RED。
- [ ] Step 3: npm+批准platform native package、版本/协议诊断、dry-run/backup/受控merge；不写用户全局配置除非显式apply，不下载模型或运行源码。
- [ ] Step 4: build CLI/runtime；`node --test --test-concurrency=1 apps/cli/test/install.test.mjs apps/cli/test/agent-setup.test.mjs`，批准平台实际pack→owned临时安装→init/index/query/setup dry-run/doctor/status链，无Rust/无LLM。仅在实际验证平台上声明支持；不npm publish或push。
- [ ] Step 5: 注册`p1-install-v1`，记录E15、platform matrix、可复现包hash与未测平台限制。

### P1-20: 真实E2E、基线审批与Phase1封板

**Files:** Create `scripts/evaluate-phase1.mjs`, `scripts/test-evaluate-phase1.mjs`, `fixtures/phase1/vulnerability-processing/`, `fixtures/phase1/spring-fastapi-kafka/`；Modify required scripts/trace/acceptance证据；不自动改CI或发布。

**Interfaces:** runner通过公开Application/Agent API执行产品路径，调用00的`evaluatePhase1Report`；exclusive output、build/input/oracle/baseline/model/policy identity严格匹配。

- [ ] Step 1: 实现之前冻结两个源场景与Evaluation设计VA/SF probes到独立golden；写`missing-critical-probe-fails`、`test-double-cannot-pass-actual-e2e`、`changed-expected-invalidates-baseline`、`empty-denominator-not-perfect`和failure export tests。
- [ ] Step 2: `node --test scripts/test-evaluate-phase1.mjs`缺runner RED；然后用当前真实产品路径运行两个场景，保留未达义务报告，不重试到绿。
- [ ] Step 3: 最小actual runner串联init/index/Runtime/knowledge/Agent/Wiki；按scope/模型许可运行，禁止raw SQL注入expected、用double冒充真实模型或填补缺Code事实。未批准baseline/模型保持NOT_EVALUABLE。
- [ ] Step 4: 在冻结输入上本地测critical入口/边界与语义probes，集中提交原始计数/覆盖/误差、模型身份和建议baseline，请用户单独批准数字；批准后跑相应候选验收与必要完整本地封板/architecture/declaration/格式/Rust检查。只有新变化/新失败才扩大或重复测试；新profile按独立治理。
- [ ] Step 5: 两E2E全部required critical probes和22项适用exit有原始可复现报告，CURRENT_STATUS/PHASE_ACCEPTANCE/trace同步后才能判Phase1完成。若有required未执行/未批准/失败，明确未完成；云端CI/merge仍需准确提交和批次范围的单独授权。

## 后续精确命令与共同结束检查

每新增test在root或对应required专用script注册；测试文件都用`node --test --test-concurrency=1 <本任务列出的完整路径>`，build使用现有`pnpm --filter @codeatlas/<package> build`或候选封板时`pnpm build`。自定义runner只在20交付后有效，不能在本文撰写时声称执行过。

每任务运行`node scripts/check-architecture.mjs`、受影响guardrail/声明测试和相关旧Fixture，不删旧negative controls、不改质量阈值。输出命令/exit/counts/fixture/build identity/known limits。CURRENT_STATUS更新与trace是任务完成条件；本设计阶段的文档检查不算产品unit/Fixture/Evaluation通过。
