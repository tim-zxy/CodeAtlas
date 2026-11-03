## P1-03 continuation authorization — 2026-10-22

The user requests the next design/development step. P1-03 contract implementation is authorized under ADR-020; [its precise contract detail](../specs/2026-10-22-phase1-syntax-plugin-contracts.md) supplements the accepted task. Later actual Native/grammar/profile work is not performed by this task. Cloud writes/CI and other established separate gates remain. Earlier first-batch-only entries are historical for this additional authorization.

## 2026-10-22 approval update

User confirms the recommended architecture decisions and first batch P1-00..02. ADR-020 is the effective architecture record; later task implementations, exact future dependency/wire/profile/numeric gates remain separate. Prior PROPOSED/NOT AUTHORIZED wording below is the review snapshot, not a revocation of this bounded approval. Task checkboxes still reflect actual verification, not approval.

# Phase1 Foundation and Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, only after explicit user implementation approval. Steps use checkbox (`- [ ]`) syntax for tracking. No subagent execution, new chat, or worktree is authorized.

**Goal:** 交付可验证的Phase1契约、安全、语法入口、四Plugin、Runtime与跨仓合同基础。

**Architecture:** 保留Code IR v1与IPC v1..v3；以独立版本的SyntaxEvidence和Plugin V2补足事实入口，经Application/Store validated workflows激活Runtime。Repository与Workspace真相分离，任何中间态都带准确basis/freshness。

**Tech Stack:** 当前Node >=24<25、TypeScript、Zod、node:sqlite、Rust/Tree-sitter及已存在的Source/Provider/Storage/Fixture机制。Python grammar具体版本须独立兼容核验和锁定；本计划不授权安装。

**Spec:** [契约与Runtime设计](../specs/2026-10-22-phase1-contracts-and-runtime-design.md)、[兼容性提案](../specs/2026-10-22-phase1-compatibility-proposal.md)、[Evaluation设计](../specs/2026-10-22-phase1-evaluation-design.md)。后半计划：[Knowledge and Delivery](2026-10-22-phase1-knowledge-and-delivery.md)。

## Global Constraints

- 当前P1-00..03获批并有本地实现/验证；P1-04..20仍是后续计划，实际依赖/Native/profile门禁另行满足。下文后续任务的文件和命令是计划，不是实施结果。
- 用户已接受ADR-020及首批实施；R011 syntax / R012 execution / R013 flow为获接受的新预留，已发布SQL保持不变。后续任务仍须单独授权。
- 保留全部旧Schema/Fixture/失败证据、Canonical独立性、SQLite authority、candidate-only与AUTO/MANUAL；不预建DEFERRED能力。
- 只顺序跑范围匹配本地验证；任何云端写入/CI、依赖安装、profile数值和破坏性操作独立确认。
- 每任务先写独立expected和失败测试→观察真实缺行为失败→最小实现→相关回归/Fixture/architecture→CURRENT_STATUS/trace记录；已有行为用characterization，不伪造RED。
- 下面node tests使用dist前，执行相应package build。全依赖构建仅在公共声明变化或封板时运行；不自动清除dist、重装依赖或并发长测。
- 不自动commit/stage；每完成任务只列精确diff供审阅，不能将既有9份文档/无关EOL混入。commit/push授权分别判断，绝不自动push。

## Review Focus

1. Code basis同fingerprint但support变化：P1-05/P1-08必须拒绝旧runtime activation，不能只比revision ID。
2. 命名相同的非框架annotation/decorator/method：P1-06/P1-07保持不匹配而非误报入口。
3. changed/delete/restart和旧语法残留：P1-04/P1-05证明不无故全仓解析、不留旧owner支持。
4. 消息/HTTP歧义与异步顺序：P1-08/P1-09不能first-match或从遍历ordinal推时间顺序。
5. 无profile或新grammar未验证：P1-04不能借旧Java/v3准入启动新观察或宣称Python成熟。

## 实施前治理任务（非编码）

- [ ] 用户评审三份技术设计及兼容性提案A/B/C；接受后创建正式ADR（编号先查重）并同步Canonical/Native/Provider/Plugin/Storage/Evaluation等规范、预留、WBS和trace。
- [ ] 用户确认条件降级关闭/启用、发行平台范围；baseline数字不预批，按独立Fixture测量后另审。
- [ ] 锁定必要parser/MCP/config依赖的官方兼容信息、许可证与准确版本，给出已有能力不能覆盖的依据；无授权不安装。
- [ ] 首批产品任务才从P1-00开始；任一冻结冲突未接受则暂停该依赖链，其他只做不依赖的设计。

## 任务与依赖

P1-00→P1-01→P1-02→P1-03→P1-04→P1-05→P1-06→P1-07→P1-08→P1-09为默认顺序；02的安全纯规则与01可在接口冻结后独立测试，但本会话仍顺序。四Plugin逻辑各自有Fixture，但共享context、Store、manifest不能并行定案。P1-10文档纯解析可独立于04..09开发，持久化须等W004..W006前序迁移到位。

### P1-00: Phase1 Fixture/probe与报告兼容基础

**Files:** Create `packages/evaluation/src/phase1-report.ts`, `packages/evaluation/test/phase1-report.test.mjs`, `fixtures/phase1/report-contract/fixture.json`, `fixtures/phase1/report-contract/inputs/vectors.json`, `fixtures/phase1/report-contract/expected/report.json`; Modify `packages/evaluation/src/index.ts`, root `package.json`测试注册及EVALUATION/trace。

**Interfaces:** consumes旧Manifest v1、已有IR JSON/envelope validators；produces `evaluatePhase1Report(input:Phase1EvaluationInput):Phase1EvaluationReport`。requiredObligations/observations/baseline/applicability字段严格遵循Evaluation设计，不改Code comparator/criticalFacts。

- [x] Step 1: 先写literal required/actual向量及测试`missing-required-obligation-is-not-pass`：`assert.notEqual(report.overall,'PASS')`；`empty-critical-inventory-is-invalid`、`test-double-cannot-satisfy-actual-model`、`unapproved-baseline-is-not-evaluable`分别断言受控拒绝/NOT_EVALUABLE；正确literal向量结果逐字段等于independent expected。
- [x] Step 2: `node --test packages/evaluation/test/phase1-report.test.mjs`观察缺函数失败；若输入构造错误先修test，不称产品RED。
- [x] Step 3: 实现纯report严格schema/完整义务聚合/版本与hash绑定；保留旧Code入口含义；Manifest的空qualityGates不赋Phase1验收权。
- [x] Step 4: `pnpm --filter @codeatlas/evaluation build`，再运行新test和`packages/evaluation/test/fixture-manifest.test.mjs`、`fixture-registry.test.mjs`、`quality-gates.test.mjs`；预期0 fail及原26可发现，新report-contract独立可发现；不是领域能力通过。
- [x] Step 5: 记录Fixture ID `p1-report-contract-v1`、命令/报告、null/未批准baseline限制和新增测试root注册；不标Phase1 gate PASS。

### P1-01: Runtime/Document/Claim/Knowledge严格IR

**Files:** Create `packages/ir/src/runtime-ir.ts`, `syntax-evidence.ts`, `document-ir.ts`, `knowledge-ir.ts`, `phase1-support.ts`, `packages/ir/test/phase1-ir.test.mjs`, `packages/ir/type-test/phase1-brands.test.ts`, `fixtures/phase1/ir-contract/`; Modify `packages/ir/src/index.ts`、现有type-test配置和精确export测试注册。

**Interfaces:** produces各schema/parser与`RepoBasisSchema`、`SupportRefSchema`、`RuntimeFactSetSchema`、`KnowledgeCandidateSchema`；字段以两份详细设计为准。imports只来自本package/已有Zod，不依赖上层。

- [x] Step 1: 写`cross-basis-support-is-invalid`、`unknown-schema-version-is-refused`、`runtime-step-without-support-is-invalid`、`business-flow-is-not-execution-fact`；assert.throws受控IR error；合法literal parse deepEqual输入；brand type tests拒绝混用ID。
- [x] Step 2: `node --test packages/ir/test/phase1-ir.test.mjs`确认新parser缺失失败。
- [x] Step 3: 最小strict schemas/envelopes/ref闭包验证；省略/null/稀疏/重复/JSON mutation规则复用旧工具；不修改旧CanonicalCodeFact枚举。
- [x] Step 4: `pnpm --filter @codeatlas/ir build`、`pnpm --filter @codeatlas/ir test:types`、`node --test packages/ir/test/phase1-ir.test.mjs packages/ir/test/common-ir.test.mjs packages/ir/test/code-fact-ir.test.mjs packages/ir/test/evidence-ir.test.mjs`；预期全部0 fail，旧严格行为不变。
- [x] Step 5: 注册`p1-ir-contract-v1`，记录新schema名字/版本和旧IR不变证据，更新Canonical spec/trace。

### P1-02: EffectiveConfig与操作安全边界

**Files:** Create `packages/application/src/operation-policy.ts`, `packages/application/test/operation-policy.test.mjs`, `packages/runtime/src/effective-config.ts`, `packages/runtime/test/effective-config.test.mjs`, `fixtures/phase1/security-config/`; Modify runtime composition/exports、root注册。

**Interfaces:** `authorizeOperation(input:OperationPolicyInput):OperationPolicyDecision`纯规则；`loadEffectiveConfig(input:ConfigurationSources):EffectiveConfig`返回immutable；query/update/index/remote分别授权。secret lookup通过Runtime port，不把env/raw secret交domain。

- [x] Step 1: `local-only-denies-remote-on-repair`、`query-does-not-authorize-update`、`repository-overrides-workspace`、`unknown-key-warns-without-value`和secret-file deny；assert.equal允许/拒绝与优先级独立expected。
- [x] Step 2: 运行`node --test packages/application/test/operation-policy.test.mjs packages/runtime/test/effective-config.test.mjs`，记录缺行为失败。
- [x] Step 3: 按现行规范实现YAML版本/层级/受控warning、独立operation/destination策略；必要预算缺失拒绝；不发网络、不下载模型、不新建daemon。
- [x] Step 4: build application/runtime后重跑；包括原bootstrap、Source path-policy与provider-env现有回归；预期无误授权、无raw value泄露且旧startup smoke保留。
- [x] Step 5: 注册`p1-security-config-v1`；记录配置兼容、权限矩阵、错误码；不得把仅unit测试当完整安全E2E。

### P1-03: Syntax IPC与Plugin V2契约

**Files:** Create `packages/providers/src/native-syntax-ipc.ts`, `packages/providers/test/native-syntax-ipc.test.mjs`, `packages/plugins/src/plugin-spi-v2.ts`, `packages/plugins/test/plugin-spi-v2.test.mjs`, `fixtures/phase1/syntax-contract/`, `fixtures/phase1/plugin-context/`; Modify exports与原精确inventory，新增Rust shared-contract测试入口（实现归04）。

**Interfaces:** `parseSyntaxObservationRequest(input:unknown):SyntaxObservationRequest`、`validateSyntaxObservationStream(request,records):ValidatedSyntaxObservation`；`validatePluginV2Context(input)`、`validatePluginV2Candidate(context,descriptor,candidate)`。旧V1函数签名与strict keys不变。

- [x] Step 1: literal TS/Rust同字节expected先写；`v1-context-refuses-artifacts`、`v2-cross-owner-support-is-invalid`、`syntax-terminal-checksum-is-required`、`plugin-context-total-budget-is-enforced`；缺term无适用partial result，旧10000 facts总额不放宽。
- [x] Step 2: `node --test packages/providers/test/native-syntax-ipc.test.mjs packages/plugins/test/plugin-spi-v2.test.mjs`，确认缺新接口RED。
- [x] Step 3: 实现独立协商schema与V2深冻/引用/预算；不是把artifact塞入configuration；旧v1..v3解析器不能接受新消息。
- [x] Step 4: build providers/plugins后新test+原provider/Plugin SPI、IPC bytes/v2/v3回归；预期旧负例仍拒绝，版本选择无隐式升级。
- [x] Step 5: 注册`p1-syntax-contract-v1`、`p1-plugin-context-v2`；同步接受后的NATIVE_IPC/PLUGIN_SPI/PROVIDER_SPI与共享fixture出处。

### P1-04: Java/有限Python语法观察实际路径

**Files:** Create `crates/native-analyzer/src/syntax.rs`, `python.rs`, `packages/providers/src/native-syntax-client.ts`, `packages/providers/src/python-normalizer.ts`, `packages/providers/test/native-syntax-binary.test.mjs`, `fixtures/phase1/syntax-observer/`; Modify `packages/source/src/classify.ts`及`packages/source/test/walk-classify.test.mjs`、Source/fingerprint兼容说明、native main/lib/descriptor dispatch与Cargo manifest/lock（仅已批准grammar版本）、Rust shared cases和required脚本。

**Interfaces:** Native `OBSERVE_SYNTAX`及`observeNativeSyntax(request,clientControl):Promise<ValidatedSyntaxObservation>`；输出SyntaxEvidence/coverage与Python最小Provider Code事实，由`normalizePythonObservation(input):NormalizedPythonObservation`形成Canonical owner映射；不输出框架意义，不持久化AST/DB。

- [ ] Step 1: raw Java/Python源与golden先写；真实binary用例`java-annotation-literals`、`python-decorator-router-values`、`dynamic-expression-remains-unknown`、`changed-files-only-after-restart`、`python-source-classification-and-owner-binding`、`python-update-preserves-java-support-and-validates-summary-compatibility`、`timeout-has-no-applicable-partial-stream`；assert.deepEqual规范syntax与independent oracle。
- [ ] Step 2: 按已批准依赖build Native并运行新实际路径，记录未支持operation失败；不能用unit double证明Native RED/GREEN。
- [ ] Step 3: 复用cap-std读取、Tree-sitter runtime、预算/取消/JSONL终端框架；接有限Python grammar、Source/python分类与最小MODULE/SYMBOL/IMPORT/REFERENCE归一化并实际验证owner定位；Code/Syntax共激活与多Provider lifetime属于05，不用golden伪造Code owner。无profile时仅运行受控unit/协议refusal，不绕过准入作positive claim。
- [ ] Step 4: `cargo test --workspace`仅在Rust实际改动后的对应候选点顺序运行；`node --test --test-concurrency=1 packages/providers/test/native-syntax-binary.test.mjs`及必要旧Java实际解析回归。新内存目的先按独立测量/数值审批流程，预期真实应用/无partial、原协议不变。
- [ ] Step 5: 注册`p1-syntax-observer-v1`、capability/evaluation记录；未测Python能力保持UNSUPPORTED/EXPERIMENTAL，profile未批准则任务未完成，不自动校准或重跑。

### P1-05: R011语法状态与validated apply

**Files:** Create `packages/storage/migrations/repository/011_framework_syntax.sql`, `packages/storage/src/runtime/syntax-store.ts`, `packages/storage/test/syntax-store.test.mjs`, `packages/application/src/refresh-runtime-facts.ts`, `packages/application/test/refresh-runtime-facts.test.mjs`, `fixtures/phase1/runtime-storage/`; Modify repo manifest/Storage出口/Runtime组合和测试注册。

**Interfaces:** `RuntimeFactReadPort.readRuntimeBasis`与`applyRuntimeBatch`接口中syntax子集先实现；`refreshRuntimeFacts`先返回syntax激活/Runtime尚不可用的准确状态，08完成组合。Storage与上层port结构匹配，不新增依赖。

- [ ] Step 1: `same-fingerprint-different-code-support-refuses-apply`、`syntax-migration-does-not-guess-backfill`、`syntax-rollback-after-removal`、`delete-invalidates-owner-support`、`reopen-retains-last-good`；真实临时DB和注入失败点比较原rows/pointers。
- [ ] Step 2: `node --test packages/storage/test/syntax-store.test.mjs packages/application/test/refresh-runtime-facts.test.mjs`观察缺行为失败。
- [ ] Step 3: 使用原migration runner追加R011；expectedCodeBasis锁内核对，file fingerprints/coverage/support闭包验证；Python最小Code差分+syntax同事务，复用FactMerger保留Java支持并实际校验v3 summary兼容，不可证明兼容则拒绝/显式bootstrap，不默认全量重解析；Code更新后旧Runtime标affected，不能把syntax-only报告全runtime成功。
- [ ] Step 4: build storage/application/runtime；重跑新test和migration/原activation-state/source-state回归；每R010→R011、重跑、too-new、锁、checksum、中途失败/重开均0 fail。
- [ ] Step 5: 更新migration checksum、schema/trace及CURRENT_STATUS；待08的graph/flow原子组合明确未完成；不触碰R4现存mutable DB。

### P1-06: Spring/Mongo/Kafka三内建Plugin

**Files:** Create `packages/plugins/src/spring.ts`, `mongo.ts`, `kafka.ts`, `packages/plugins/test/spring.test.mjs`, `mongo.test.mjs`, `kafka.test.mjs`, 三对应Fixture目录；Modify V2注册与exports、root tests。

**Interfaces:** `createSpringPluginV2()`、`createMongoPluginV2()`、`createKafkaPluginV2()`实现已批准V2 describe/detect/extract，不读取fs/env/DB；输出契约设计的Entry/Task/Data/Contract candidates。

- [ ] Step 1: 各Plugin detection-positive/negative/extraction/composition/ambiguity/partial/invalidation literal输入先写；`same-name-custom-annotation-is-not-spring`、`save-name-without-mongo-receiver-is-not-data-write`、`same-topic-other-namespace-is-not-same-contract`；deepEqual候选与支持oracle。
- [ ] Step 2: `node --test packages/plugins/test/spring.test.mjs packages/plugins/test/mongo.test.mjs packages/plugins/test/kafka.test.mjs`，观察缺factory/行为失败。
- [ ] Step 3: 复用V2 validator/确定性选择和静态证明值；动态关系保unknown，移除支持正确失效，不增加框架类型到IR公共契约。
- [ ] Step 4: build plugins；新纯test+真实Java syntax→Plugin→validated candidate路径及原SPI回归；三个独立Fixture都必须覆盖，不以一个demo替代。
- [ ] Step 5: 登记`p1-spring-v1/p1-mongo-v1/p1-kafka-v1`，记录critical召回原始计数与待批准baseline；不能现在给新数字门槛。

### P1-07: FastAPI Plugin与Python支持链

**Files:** Create `packages/plugins/src/fastapi.ts`, `packages/plugins/test/fastapi.test.mjs`, `fixtures/phase1/fastapi/`; Modify V2注册/exports、required实际测试入口。

**Interfaces:** `createFastApiPluginV2()`；消耗04真实Python syntax与Code owner mapping，产生HTTP EntryPoint/provider Contract/dependency候选。

- [ ] Step 1: `router-prefix-and-include-compose`、`depends-reference-retains-owner-support`、`unrelated-get-decorator-does-not-detect`、`dynamic-router-is-partial`、`deleted-decorator-removes-route`；独立golden含位置与支持。
- [ ] Step 2: `node --test packages/plugins/test/fastapi.test.mjs`观察缺Plugin失败。
- [ ] Step 3: 实现有证据绑定的router/decorator/dependency语义，无Python执行/import，无LLM伪造。
- [ ] Step 4: build plugins；纯tests与04实际观察→Plugin路径均0 fail；actual路径必须使用原始Python源，不能直接把golden注入Store。
- [ ] Step 5: 注册`p1-fastapi-v1`和语言能力证据；动态/不支持限制写入报告，保留入口/边界baseline待批准状态。

### P1-08: ExecutionGraph/RuntimeFlow及R012/R013

**Files:** Create `packages/execution/src/derive-execution.ts`, `derive-runtime-flow.ts`, `packages/execution/test/derive-execution.test.mjs`, `derive-runtime-flow.test.mjs`, repo `012_execution_graph.sql`, `013_runtime_flow.sql`, `packages/storage/src/runtime/runtime-fact-store.ts`, `packages/storage/test/runtime-fact-store.test.mjs`, `fixtures/phase1/execution-flow/`; Modify exports/manifest、05的Application/Runtime组合。

**Interfaces:** `deriveExecutionGraph(RuntimeFactSet,RequestControl):ExecutionGraphCandidate`、`deriveRuntimeFlows(ExecutionGraph,RequestControl):RuntimeFlow[]`；complete `applyRuntimeBatch`语法/Graph/Flow同事务激活与readRuntimeBasis。

- [ ] Step 1: `async-boundary-creates-context`、`branch-and-cycle-not-flattened`、`input-permutation-preserves-semantics`、`ordinal-does-not-assert-temporal-order`、`flow-step-without-support-refused`、`runtime-failure-keeps-old-basis`。
- [ ] Step 2: 新execution/Store测试先运行缺函数失败；golden由手写最小上下文/边界图构成。
- [ ] Step 3: 实现确定性规则与压缩边界；完整候选检验后原子apply，budget partial不激活为完整；跨版本/source变化拒绝。
- [ ] Step 4: build execution/storage/application/runtime；`node --test packages/execution/test/derive-execution.test.mjs packages/execution/test/derive-runtime-flow.test.mjs packages/storage/test/runtime-fact-store.test.mjs packages/application/test/refresh-runtime-facts.test.mjs`；R011→R012→R013每边界、失败重开和旧图保留通过。
- [ ] Step 5: 注册`p1-execution-flow-v1`，完成`p1-runtime-storage-v1`的graph/flow部分，记录E03/E04与所有support/coverage、真实syntax集成证据。

### P1-09: 服务/合同与基础跨仓串联

**Files:** Create `packages/contracts/src/match-contracts.ts`, `packages/contracts/test/match-contracts.test.mjs`, `packages/execution/src/stitch-workspace.ts`, `packages/execution/test/stitch-workspace.test.mjs`, W004 `004_services.sql`、W005 `005_contracts.sql`、W006 `006_workspace_execution.sql`, `packages/storage/src/runtime/contract-store.ts`, `packages/storage/test/contract-store.test.mjs`, `packages/application/src/refresh-workspace-runtime.ts`, 两对应Fixture目录；Modify workspace manifest/exports/注册。

**Interfaces:** `matchContracts(FrozenContractSet,RequestControl):ContractMatch[]`、`stitchWorkspaceExecution({revisionSet,graphs,matches},control):WorkspaceExecutionCandidate`；`ContractRegistryPort.replaceContracts`。

- [ ] Step 1: 六结果literal oracle，`multiple-providers-remain-ambiguous`、`missing-provider-is-not-known-external`、`message-namespace-prevents-match`、`cross-repo-change-keeps-old-workspace-graph`；selectedProvider只在MATCHED非null。
- [ ] Step 2: 新match/stitch/store tests观察缺实现失败，expected集合独立于产品matcher。
- [ ] Step 3: 保守匹配/确定性候选顺序、frozen RevisionSet/stable IDs引用；不造跨库FK/原子事务、不提高组合confidence；validated workspace事务替换。
- [ ] Step 4: build contracts/execution/storage/application/runtime；`node --test packages/contracts/test/match-contracts.test.mjs packages/execution/test/stitch-workspace.test.mjs packages/storage/test/contract-store.test.mjs`；W003→W006顺序升级、每阶段失败/锁/重开及多repo实路径通过。
- [ ] Step 5: 注册`p1-contract-matching-v1/p1-cross-repo-v1`；记录E05/E06，明确未匹配边未串联与待语义发布部分。

## 每任务共同结束检查

- [ ] 新测试有root或对应required脚本注册，Fixture Manifest严格发现/路径校验通过；新增public出口同步exact inventory/声明测试。
- [ ] `node scripts/check-architecture.mjs`与受影响的注入非法依赖tests通过；格式只检查命名文件，`git diff --check`仅本轮路径，不批量修旧换行。
- [ ] CURRENT_STATUS记录task、输入/构建、命令、counts、Fixture/version、失败/限制、下一任务；contract变化同步spec/trace。没有fresh证据就不标完成。
- [ ] 本地差异复核未混入无关/EOL或`.superpowers/.pnpm-store`；云端权限仍关闭。
