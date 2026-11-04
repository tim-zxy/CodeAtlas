# Phase1 B1-A Native Projection Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the existing session. User-specified sequential execution, retained evidence and no commits override skill defaults for subagents, commits and cleanup.

**Goal:** 在不进入 Runtime/Store 的前提下，将完整声明的 Java v2 与 v5 Python Code/Syntax 组成一份具有准确 scope 和来源的 Native 投影候选。

**Architecture:** 新增两个 package-private Providers 模块：一个安全快照并校验输入/上下文，一个复用原 normalizer/merger 构造单 snapshot 候选。独立 Source/原始参考及完整 Canonical/support 预期先于产品冻结。旧公开 index、协议、normalizer、merger、Storage、Runtime 与 profile 均不改。

**Tech Stack:** 既有 TypeScript、Node built-ins、Zod 4.6.1、node:test；不新增依赖。

**Spec:** [已接受 B1-A 书面设计](../specs/2026-10-24-phase1-b1-composition-design.md)，仅 §4；§5 的 B1-B/C/D 保持阻塞。

**Status:** USER_CONFIRMED_PLAN；A1..A3 COMPLETE_LOCAL_NATIVE_PROJECTION_CONTRACT。Fresh24-file526PASS/architecture17/Providersbuild0；见实施作者评审和implementation-verification.json。后文原拟议/NOT_RUN保留计划时点，当前执行结果以此检查点为准。

## Global Constraints

- 原工作树 C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；原会话顺序，不建工作树/会话/agent、不提交/推送/清理。D main 不覆盖本地交接。
- Canonical IR provider-independent；SQLite authoritative；LLM candidate-only；AUTO/MANUAL；ExecutionGraph → RuntimeFlow → BusinessFlow 不变。
- 保留旧一 Provider 一 snapshot、SUCCEEDED 门禁、IPC1..4/隔离v5、Java/Python identity、原 Source policy、R001..R010 与原 Fixture。
- 三个书面接受的 scope 名称仅限候选：JAVA_CODE_V2、PYTHON_SYNTAX_CODE_V1、FRAMEWORK_SYNTAX_OBSERVATION_V1；不广告协商/descriptor 或 Python 通用完整能力。
- 无 capture handle、最终 RepoBasis、Canonical SyntaxEvidence、stage lease、历史 retained/removed、Store/SQL、R011、生产调用者、Source 激活、真实 Native/helper、Rust、profile/数字/新依赖或 CI。
- 显式限额无默认值；不将逻辑序列化限额解释为 OS/RSS/准入证明。超限拒绝，不分批/重试/降级。
- C1 EPERM OPEN；四个 C2 生命周期已用完；历史 Native timeout UNKNOWN；main 取消结算不查询；R4 不触碰。

## Review Focus

1. Java 只请求部分能力却宣称完整 Java Code：A2 测试 `java_scope_requires_all_five_legacy_capabilities`。
2. 全 inventory 与合法子投影各自正确但漏掉一个文件：A2 测试 `two_valid_children_cannot_omit_declared_source`。
3. 两个分别在限额内的输入加中间产物重叠后超限：A2/A3 测试 `aggregate_budget_is_not_per_component_budget` 与 `merged_result_is_charged_before_return`。
4. typed validated 对象、Proxy/getter、共享/脱离 bytes 绕过快照：A2 测试 `typed_result_is_revalidated_without_callbacks` 与 `byte_views_are_owned_or_rejected`。
5. 同 ID 但声明 tool/时间/文件字段不同，或完整字节掩盖 owner 失败：A2/A3 测试 `same_snapshot_does_not_hide_context_mismatch`、`structural_candidate_has_no_execution_or_apply_authority`。

## File Map

| 路径 | 职责 |
| --- | --- |
| Create packages/providers/src/native-composition-input.ts | strict 元数据/byte 快照、限额、投影/上下文/成功条件，固定错误类型；仅包内导出 |
| Create packages/providers/src/native-composition.ts | 单 snapshot、Java/Python 归一化、一次 merger、来源与深冻结结果；仅包内导出 |
| Create packages/providers/test/native-composition-input.test.mjs | unsafe/预算/strict/上下文/scope/时间/完整性负例 |
| Create packages/providers/test/native-composition.test.mjs | 完整候选、Evidence/owner/冲突/来源/冻结与旧边界 |
| Create packages/providers/test/fixtures/native-composition-helpers.mjs | 仅 fs/crypto 的固定 Fixture 加载、token 实例化和独立 mutation reseal，不导入产品生成 expected |
| Create fixtures/phase1/native-composition-candidate/ | 独立清单、12 种输入种子、Source/原始参考/完整预期；A1 前置冻结 |
| Create scripts/test-native-composition-candidate.mjs | 独立 Fixture 完整结果及注册/公共边界校验；缺输入失败，不生成 expected/skip |
| Modify package.json | 仅根 test 命令增加上述两个测试与一个脚本，各一次 |
| Modify 控制文档与本计划/评审 | 状态、trace、实际证据；允许文档列表见 A3 |

现有任何产品文件都不需要重构。Providers dist 两个新模块由声明 build 生成；不改 dist/index 或 package exports。现有 .gitattributes 已覆盖所有 Phase1 .py/.java/.jsonl，故不新增 EOL 规则。

## Exact Contracts Submitted with This Plan

```ts
// native-composition-input.ts; package-private exports, not src/index.ts
interface NativeCompositionLimits {
  readonly maxSerializedBytes: number;
  readonly maxItems: number;
  readonly maxDepth: number;
}
type NativeCompositionErrorCode =
  | 'INVALID_INPUT' | 'INVALID_CONTEXT' | 'UNSUPPORTED_SCOPE'
  | 'INCOMPLETE_OBSERVATION' | 'RESOURCE_LIMIT_EXCEEDED'
  | 'NORMALIZATION_FAILED' | 'MERGE_FAILED';
class NativeCompositionError extends Error {
  constructor(code: NativeCompositionErrorCode);
  readonly code: NativeCompositionErrorCode; // message === code; no input/underlying error
}
function readNativeCompositionInputs(
  metadata: unknown, requestBytes: Uint8Array, outputBytes: Uint8Array,
  limits: NativeCompositionLimits,
): PreparedNativeComposition;
// native-composition.ts; package-private
function composeNativeProjection(
  metadata: unknown, requestBytes: Uint8Array, outputBytes: Uint8Array,
  limits: NativeCompositionLimits,
): NativeProjectionCandidate;
```

limits 必须 exact own data object，三字段正 safe integer，拒绝 -0/Proxy/getter/未知字段/缺字段，无默认值。metadata 是 exact plain JSON，只有以下字段：

- `targetSource`: 既有 SyntaxTargetSourceSchema。
- `inventory`: SourceFile[]，按 UTF-8 path/id 排序；id/path 唯一、repo/revision 与 target 一致。
- `snapshot`: exact `{id,providerId,providerVersion,runtimeVersion,startedAt,completedAt}`，复用既有 IR 字段 schema；capabilities/diagnostics/outcome 由组合生成，调用者不得提供。
- `tool`: exact `{target,profile}`，复用 NativeAnalyzerDescriptorSchema 的 build 字段。
- `java`: null 或 exact `{request,events,terminal,providerVersion,runtimeVersion,tool,startedAt,settledAt}`；strict v2 request/events，terminal 必须等于最后事件。供 normalizeNativeAnalysis 的内部类型 adapter 仅补 `stderr:''`，表示本接口没有采集 stderr，不伪称捕获到空 stderr。
- `codeSyntax`: exact `{providerVersion,runtimeVersion,tool,startedAt,settledAt}`；对应两个单独位置参数的原始 v5 bytes。

snapshot.providerId 固定为实际 Native descriptor 的 `native`，不允许 `native-python` 等伪分身；所有时间使用既有 UtcInstantSchema；组合开始≤组件开始≤组件结算≤组合完成。版本与 tool 逐字段一致；v5 request 的 providerVersion 同样匹配。Java parsed请求/逐事件/事件总数及总序列化输出还需按既有NATIVE_CLIENT_HARD_LIMITS的相应上限检查；这里只能限制已有parsed表示的序列化尺寸，不能声称验证了未知原始行字节/传输。Java request 本来没有这些版本字段，组件元数据仍明确是声明，不补造 wire 字段。repository 对象在 Java/v5 之间相同；所有 target/原 fact Provider 与 snapshot 身份精确匹配。不得混淆 Java terminal 的 revisionFingerprint（Source）和 contentFingerprint（Code 输出）。

投影定义：inventory 中 role 为 SOURCE/TEST 的项目必须是 TEXT、非 SECRET、languageHint 为 java/python，否则 UNSUPPORTED_SCOPE。OTHER 留在完整声明清单，显式不在分析投影；不从 Source 清单中静默丢弃未知语言。Java/v5 子清单必须等于对应投影的完整 SourceFile（顺序也匹配）；Java 仅 Java，v5 为全部 Java/Python。Java 投影空时 java 必须 null，非空则必需。v5 removedSourceFiles 必须为空，新增 retained/removed 元数据字段一律拒绝。

Java requestedCapabilities 必须恰为旧集合 SYMBOL/IMPORT/CALL/INHERITANCE/REFERENCE，不增加新旧能力或改旧 schema。terminal 和逐文件 coverage 皆 SUPPORTED/COMPLETE，统计 unsupportedSites/partialSites 为零，原 strict 计数与完整流规则保留。v5 复用 pure validator，整体 SUCCEEDED、Syntax COMPLETE、Python Code COMPLETE；无 Python 时 Code NOT_APPLICABLE。缺必需子结果、合法 PARTIAL/失败 Java terminal 或不完整 scoped coverage→INCOMPLETE_OBSERVATION；小于完整 scope 的 Java capability 请求→UNSUPPORTED_SCOPE。原 v5 pure validator 拒绝的损坏/失败 wire 不另造宽松解析器，非 resource 错误映射 INVALID_INPUT；resource 错误保持 RESOURCE_LIMIT_EXCEEDED。

### 安全快照与逻辑预算

1. 先安全读取 limits 和 byte intrinsic length；拒绝 Proxy、非 Uint8Array/Buffer 原型、SharedArrayBuffer、detached views。借用 copyCodeSyntaxBytes 的原有实现，保留其错误类别并在新边界映射；不得改原 helper。所有 v5 原 hard caps 仍生效。
2. metadata 用逐层 iterator/own property descriptor 扫描，先拒绝 Proxy/环/特殊原型/getter/setter/toJSON、symbol/隐藏额外字段、稀疏/额外属性数组、undefined/非有限/-0/非法 Unicode；不得先调用 Object.entries/ensurePhase1Data/JSON.stringify 触发 getter 或创建整棵 work list。每访问一个 JSON value（含容器）计 limits.maxItems，根深度 0；此JSON工作计数与v5 resourceBudget.maxItems的AST遍历语义相互独立，不能等同；重复引用按每次出现计工作，祖先循环拒绝。
3. 在取得安全数据/深度/项目数后，复用 boundedJson 做有界字符串，再 JSON.parse 为 owned metadata。此安全扫描只服务新包内边界，不重写通用IR guard或新增JSON库。byte copies、metadata 字符串/解析表示、prepared v5/Java 解析表示、normalized、merged、最终结果均在引入阶段累计检查序列化字节；不回收已消耗额度。raw bytes 按真实 byteLength，JSON 表示按 boundedJson 的 UTF-8 长度。字符串/parsed 表示并存分别计，整数加法使用 safe overflow check；不得将 bytes 转 hex/JSON 数组记账。
4. A2 的 PreparedNativeComposition 在本包内包含：owned metadata（按上述输入结构解析的只读值）、owned requestBytes/outputBytes、validated codeSyntax、java（strict 解析值或 null）、生成的 scoped snapshot、`budget:{serializedBytes,items}`。A3 延续同一预算，不给每阶段新预算。返回前不暴露可写 Buffer；最后结果深冻结，不 freeze 非空 typed array。
5. 此限额是应用显式表示的保守累计逻辑限制，不是 heap/RSS 保证，也不冒充被复用 Zod/normalizer 内部分配的精确记账。normalizer/merger 的内部短期分配仍未测量；真实 memory/profile 保持 C 阶段阻塞。任何实现无法保证输入复制/解析前的既定限额检查，应暂停修正，不能把检查搬到无界分配之后。

### Final Result

NativeProjectionCandidate 精确七字段：`kind:'NATIVE_PROJECTION_CANDIDATE'`、`snapshot`、`normalized:{nodePairs,edgePairs}`、`merged`（原 MergedCanonicalAnalysis）、`codeSyntax`（原八字段冻结结果）、`scope:{inventory,nativeSourceFileIds,capabilities}`、`provenance`。scope.capabilities为上述名称的readonly string[]；snapshot.capabilities为既有ProviderCapabilityObservation[]。nativeSourceFileIds按inventory投影顺序，inventory保留全部声明项。

capabilities 顺序 Java（存在时）、Python（存在时）、Syntax（总存在）；值均仅在成功时 SUPPORTED/COMPLETE；snapshot 只一份且 outcome SUCCEEDED。diagnostics 按 Java 事件顺序再 v5 事件顺序原样验证/保留，不前缀改 message。provenance exact `{tool,java,codeSyntax}`：java 为 null 或 `{kind:'PARSED_V2',requestId,startedAt,settledAt}`；codeSyntax 为 `{kind:'RAW_V5',requestId,startedAt,settledAt,requestChecksum,outputChecksum,terminalChecksum}`。两个输出 checksum 分别为原始完整 bytes SHA256 和既有 terminal 前缀 checksum，不能互相替代。Java 没有原字节 hash，禁止捏造。

一份 snapshot 的 normalized Java+Python pairs 送一次 mergeCanonicalObservations；复用其原排序/Evidence/选择，不能改 FactKey、Provider/snapshot ID 或 old support。原 v5 wire Syntax 保留在 codeSyntax，不计算最终 basis、不造 Canonical Syntax。最终 exact keys 不含 authenticated/ready/applicable/settled 标志或 handle/token；相同 raw COMPLETED bytes 不认证真实 owner settlement。重复 ProviderFactId、重复 Canonical identity 或端点/跨文件冲突拒绝，不按顺序覆盖。

## Task A1: Independently Freeze Composition Fixture

**Files:** 新 Fixture 根、test/fixtures/native-composition-helpers.mjs、scripts/test-native-composition-candidate.mjs 的 Fixture-only 部分。

**Interfaces:** Produces 固定 cases.json 和 `loadCompositionCase(id)`：`{metadata,requestBytes,outputBytes,expected}`，expected 是完整候选或固定 error code。helper 仅 fs/crypto，不生成 Canonical/支持预期。

- [x] 核验本计划回执及所有前置哈希；保存产品/根注册原件、registry ID 清单；不修改旧文件。
- [x] 独立 author 恰好 12 个种子：empty、python-only、java-only、mixed、python-partial、syntax-partial、java-partial、mismatched-target、mismatched-snapshot、inventory-omission、unsupported-source、temporal-mismatch。前四成功，其余分别有固定拒绝类别。case 数是语料设计，不是数值 Quality Gate。
- [x] 固定每个成功样本完整 Source、原始 v5 request/output、Java v2 parsed request/events/terminal（存在时）、metadata/times/tool、完整 normalized/merged Evidence/FactEvidence/binding/explanation 与 provenance/scope。Java 原参考来自 B0b-1 的 requests/observations/java-code-v2.jsonl；Python/混合 Source 可复用同一旧根对应种子，不能混用其 Java unit identity 和 B0b-2 实际 Endpoint identity。逐路径记录 provenance SHA。
- [x] 新 Fixture ID `p1-native-composition-candidate-v1`，category code-intelligence、phase 1、capabilities 仅 NATIVE_COMPOSITION_CANDIDATE_ONLY、languages/frameworks 空、qualityGates 空但声明完整比较脚本必需。期望不得调用产品 composer/normalizer/merger/identity helper生成；只可用手写事实/旧独立 Canonical reference 与已读编码规范的独立 stdlib crypto 生成 literal expected，记录生成脚本/来源。
- [x] 先执行仅Fixture test-name-pattern，验证目录/精确12 IDs/provenance/完整 expected，冻结所有新文件 SHA 后才能新增产品模块。禁止产品实际输出反写 expected；raw tokens 只可 root/requestSHA/terminalSHA，替换/重算须 test-only 独立实现。
- [x] 新增最小 API-absence RED，动态导入新 composer；区分缺模块 RED 与下一任务实际行为 RED，不将任一“测试没有运行”算PASS。
- [x] 保存 pre-product freeze、RED日志和 A1 receipt；不 commit/stage，不删除 author 证据。

Planned commands: `node --test --test-name-pattern=fixture scripts/test-native-composition-candidate.mjs`（新文件仅固定Fixture检查）；随后 `node --test --test-name-pattern=api packages/providers/test/native-composition.test.mjs` 应真实失败。

## Task A2: Safe Inputs, Scoped Snapshot and Context

**Files:** native-composition-input.ts、新 input.test.mjs；修改新 Fixture checker 增加产品 import 的完整测试，不改 frozen expected。

**Interfaces:** Consumes A1 loadCompositionCase；Produces readNativeCompositionInputs 与 PreparedNativeComposition、错误类型及上述累计预算数据；snapshot 仅三项 scoped capabilities。

- [x] 先测试实际 callable 行为 RED：输入已冻结 mixed 应通过，但安全/身份/完整性矩阵应拒绝；最小 callable stub 只服务观察实际失败，立即由实现替换。
- [x] 实现 Exact Contracts 的输入、安全扫描、owned bytes、strict revalidation、投影、上下文/时间和 scoped snapshot；复用旧 helper/schema，不改其语义或公开导出。
- [x] 固定拒绝矩阵：每个身份字段/SourceFile字段/版本/tool/time边界；重复 id/path/owners/事实；无Java却提供结果/漏Java；v5缺失/损坏/失败/partial；少一Java能力/少coverage/统计非complete；retained/removed；未知元数据字段。
- [x] 覆盖 Review Focus 1/2/4/5；Proxy/getter/toJSON 不得执行回调；带 byteLength/valueOf 影子的 Uint8Array 用真实 intrinsic length；Shared/detached/子类拒绝；输入 mutation 不改变 Prepared 自有数据。unsafe 反例先 RED→GREEN，不通过放宽测试解决。
- [x] maxItems/maxDepth/累计字节均以 Fixture 实际导出的精确边界做相等/相邻测试；两个单独可容纳输入累计超限必须拒绝。计数包含空结构、宽/深/重复引用/Unicode/序列化转义；超限固定 RESOURCE_LIMIT_EXCEEDED，消息不含输入。
- [x] `pnpm --filter @codeatlas/providers build`；`node --test --test-concurrency=1 packages/providers/test/native-composition-input.test.mjs`。应零失败/skip/TODO；记录真实结果，不预设PASS数量。
- [x] 范围复核：index、normalizer、merger、旧 helper、Runtime/Storage/locks/profile/Source 未改；更新ledger，不提交。

关键断言示例（test helper supplies caller-explicit limits）：

```js
assert.throws(() => readNativeCompositionInputs(
  missingInventoryCase.metadata, missingInventoryCase.requestBytes,
  missingInventoryCase.outputBytes, limits,
), e => e.code === 'INVALID_CONTEXT' && e.message === e.code);
assert.equal(getterCalls, 0);
assert.deepEqual(prepared.snapshot.capabilities.map(x => x.name), [
  'JAVA_CODE_V2', 'PYTHON_SYNTAX_CODE_V1', 'FRAMEWORK_SYNTAX_OBSERVATION_V1',
]);
```

## Task A3: Single Observation, Evidence and Local Closure

**Files:** native-composition.ts、composition.test.mjs、完成新Fixture checker、根 package.json 精确三注册、相关控制文档。

**Interfaces:** Consumes A2 PreparedNativeComposition；Produces composeNativeProjection 和精确七字段 NativeProjectionCandidate。直接归一化 Java/Python，再一次 merger，不新增替代算法。

- [x] 先以 mixed 全对象 literal expected 做实际行为 RED；再以完整 Evidence/binding/count/order 断言完成最小组合。不得先调用产品生成 expected 再比较同一结果。
- [x] 测试四种成功候选精确匹配；所有12种子决策匹配；Java-only/Python-only/nullJava/empty、重复事实/跨fileowner/悬空端点/normalization及merge错误保持固定错误类别，原始 underlying exception不泄露。
- [x] 测试 `merged_result_is_charged_before_return`：同一 A2 prepared 预算不能在 A3重置；精确边界取实际 Fixture 结构的累计序列化大小，相等成功/少一拒绝。原 normalizer/merger 内部未测峰值不包装成profile证明。
- [x] `structural_candidate_has_no_execution_or_apply_authority`：结果 keys精确七项、全树冻结、无Buffer别名；同一raw bytes可被重放但仍仅候选；v5原八字段无改动，未生成Canonical Syntax/最终basis/旧Evidence改写；测试 public index逐字节未改且无Runtime/Application/Storage调用新API。
- [x] 根 test 命令只增加 `packages/providers/test/native-composition-input.test.mjs`、`packages/providers/test/native-composition.test.mjs`、`scripts/test-native-composition-candidate.mjs` 各一次。自动registry应49→50，总Phase1 exact23→24，新增ID仅p1-native-composition-candidate-v1，catalog仍0；不是新增验收阈值。
- [x] 执行下列精确本地 cohort；旧脚本/Fixture/golden全部保留，无 actualNative/helper/DB/Rust/root/CI。
- [x] 最终作者评审检查 Review Focus；Important/Critical 必须有实际 RED→GREEN 后再运行受影响 cohort；不能自称独立评审或完整集成通过。
- [x] 同步 CURRENT_STATUS、DESIGN_AUTHORITY、WBS、PHASE_ACCEPTANCE、DESIGN_TRACEABILITY、ADR-020、CANONICAL_IR/PROVIDER_SPI/NATIVE_IPC/SECURITY/EVALUATION、scalability、B0b DCP、已接受B1设计/本计划/实施评审；锁定 LOCAL_NATIVE_PROJECTION_CONTRACT，B1整体/B/C/B0b-3/P1-04/05/Phase1 OPEN。
- [x] 核对全部前置/旧Fixture/Source/manifest/checksum和新freeze；记录 scopedbuild/tests/架构/格式/链接/差异及失败日志，封存 implementation-verification.json；没有 stage/commit/cleanup。

## Exact Planned Verification (NOT RUN)

先 `pnpm --filter @codeatlas/providers build`，再以下24个纯TS/内存/Fixture测试文件单批顺序执行；真实模板装配只在内存，不读取实际Source/DB，不跑capturechecker或Native。

```text
node --test --test-concurrency=1 packages/providers/test/native-composition-input.test.mjs packages/providers/test/native-composition.test.mjs scripts/test-native-composition-candidate.mjs packages/providers/test/native-code-syntax-ipc.test.mjs packages/providers/test/native-code-syntax-request.test.mjs packages/providers/test/native-code-syntax-stream.test.mjs packages/providers/test/native-syntax-ipc.test.mjs packages/providers/test/native-syntax-owner-binding.test.mjs packages/providers/test/native-syntax-budget.test.mjs packages/providers/test/python-source-normalizer.test.mjs packages/providers/test/python-normalizer.test.mjs packages/providers/test/java-node-normalizer.test.mjs packages/providers/test/canonical-normalizer.test.mjs packages/providers/test/canonical-fact-identity.test.mjs packages/providers/test/fact-merger-input.test.mjs packages/providers/test/fact-merger-selection.test.mjs packages/providers/test/fact-merger.test.mjs packages/providers/test/native-ipc.test.mjs packages/providers/test/native-ipc-v2.test.mjs packages/providers/test/native-ipc-v3.test.mjs packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs scripts/test-workspace-structure.mjs scripts/test-code-syntax-producer-oracle.mjs
node scripts/check-architecture.mjs
```

预期：声明文件全执行、0 fail/skip/TODO，架构17通过；实际数量仅由日志结算。registry测试使用其原自有临时目录，不操作已有DB/Source。仅 owned新增TS/tests/scripts与计划/新review做formatter，既有文档保留EOL；`git diff --check`不修改内容。缺build依赖或任何错误时停止诊断，不自动安装/联网/改预算/删测试/跑CI。

## Dependencies, Trace and Exit

A1→A2→A3。A3的API/Evidence/预算依赖A2；A1独立expected必须先于产品，无法并发 author/实现。无值得新agent/会话的独立实施任务。

| 依据 | 任务与可验证证据 | 仍开放 |
| --- | --- | --- |
| 设计§4.1/安全 | A1预冻、A2strict/unsafe/完整投影/限额 | 真实Source/capture/磁盘授权 |
| §4.2/单snapshot | A2五能力/成功条件/版本时间、A3一次merger | 真实run/settlement/profile |
| §4.3/来源/候选 | A1 literal supports、A3完整比对与精确七字段 | 历史retained/完整仓库/最终basis/Syntax发布 |
| §4.4/错误恢复 | A2/A3固定错误无泄露、失败无输出 | Store原子回滚/重启 |
| §5/6/7治理 | A3登记、所有原Fixture/hash、架构/文档/receipt | B1-B/C/D、R011、P1-04/05/Phase1 |

Exit仅为 LOCAL_NATIVE_PROJECTION_CONTRACT：实现+对应单测/独立Fixture+声明旧回归+架构+文档和fresh receipt全部齐备；不以空qualityGates代替Phase1 Gate。第一项实际工作仅在本计划确认后执行 A1哈希/原件捕获和独立Fixture冻结。

请整体审阅上述接口、预算语义、Fixture与本地命令。确认后沿用本会话顺序实施；无微步骤逐次确认。此确认仍不包括 B1-B/C/D、迁移、真实Native/helper、校准/profile数字、依赖、云端写入或CI。


## Implementation checkpoint — 2026-10-24

Full confirmed localscope executed sequentially.69-file correctedindependentfreeze/12families precedesproducts;526uniqueNodePASS(91new),architecture17,registry50/exact24/catalog0. Firstinvalidmanifestreference,callableREDs,hardserializererrorRED,brandedbuildfailure andregistrationRED retained. Only rootthreepaths andtwo private productmodules added;no old product/index/Fixture/profile/DB/Native/cloud changes. See [implementationreview](../reviews/2026-10-24-phase1-native-composition-implementation-review.md) and freshreceipts forbudget/owner-scan/authorreviewlimitations. B1-B/C/D andphase exitsOPEN.
