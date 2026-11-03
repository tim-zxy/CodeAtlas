# Phase1 B0：Source-target 归一化入口与完整性边界 DCP

状态：**B0-a LOCAL_CONTRACT_COMPLETE，2026-10-23；仅纯契约本地验证**。用户明确“批准”本文件 B0-a 书面契约；[具体实施计划](../plans/2026-10-23-phase1-python-source-normalization.md)已获用户确认，沿用本会话顺序实施方式。B0-b 的完整 Code 证明仍需另行设计与批准，本文件不确定其 wire 布局。原 PROPOSED 快照完整保留于 .superpowers/sdd/2026-10-23-phase1-python-source-normalization/spec-before-acceptance.md；以下“拟议／未来／本轮”描述保留原设计时点；当前已实施范围和新证据见末尾补记，不表示 B0-b 或 Phase1 完成。

依据：[ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md)、[已接受混合兼容](2026-10-22-phase1-mixed-native-compatibility-proposal.md)、[C3-A 契约](2026-10-23-phase1-code-context-capture-dcp.md)、[C3-A 实施审查](../reviews/2026-10-23-phase1-code-context-capture-implementation-review.md)。本文件不改变 Canonical IR、SQLite authoritative、LLM candidate-only、AUTO/MANUAL 或 ExecutionGraph → RuntimeFlow → BusinessFlow。

## 1. 目的与成功标准

目标：允许 Python Provider 事实在最终 Code graph 尚未形成时，依据正确 Source 目标进行纯归一化；最终 RepoBasis 仍只能在完整合并候选经过验证后由受控工作流产生。保留所有旧严格入口、Fixture、Provider/Canonical 事实身份与拒绝规则。

B0-a 的可验证成功：新入口不需要、不接受 codeActivationDigest；相同实际观察匹配独立 Canonical golden；旧入口与原语料逐字节不变；伪 authority 字段、跨 repo/revision/Provider/snapshot、缺 Source 和非法关系仍拒绝。该结果仅为 provisional nodePairs/edgePairs，不包含 outcome、发布资格、stage token 或历史 Source 证明。

不包含：Native wire/producer/descriptor、Source.py 分类激活、完整混合 Code 生产、Stage 冻结、R011/历史 manifest、removed 认证、锁内 CAS/atomic Apply、实际进程/collector/profile、校准、数值/依赖、云端 CI。B0-a 完成不表示 B0 全部完成、FastAPI ready 或 P1-04/05/Phase1 验收。

## 2. 已核验事实与反例

启动时 C3-A 收据664/664 SHA 匹配；其422 PASS/1 TODO 是前轮证据，本轮没有重跑范围回归。C1 file-symlink EPERM、B/C、完整 root/实际 Native/联合门禁保持 OPEN；四个 C2 生命周期已耗尽，历史 Native 超时 UNKNOWN。

| 实码路径                                                                                   | 当前事实                                                                                            | 设计后果                                                                 |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| providers/python-normalizer.ts::InputSchema/normalizePythonObservation                     | 要求 basis:RepoBasis；函数只用 repositoryId/revisionId，不读取 codeActivationDigest                 | 最终候选摘要在 FactMerger 后产生；不能在归一化前填占位 digest            |
| providers/native-syntax-owner-binding.ts::SyntaxTargetSourceSchema                         | 已存在严格的 repo/revision/contentFingerprint 三元组，纯 schema，无数据库/进程依赖                  | 复用该定义，不再增加一个同形 IR 类型或依赖                               |
| providers/native-syntax-ipc.ts::NativeSyntaxCoverageSchema/validateSyntaxObservationStream | 覆盖为 per-file Syntax 状态；terminal 的 SUCCEEDED/PARTIAL 由此推导；counts/checksum 校验结构一致性 | SUCCEEDED 不是独立 Code 完整性证明；数量自洽不证明没漏事实               |
| native-analyzer/syntax_producer.rs::write_syntax                                           | partial 累积 result.coverage.status，terminal 跟随该位                                              | 不能通过给观察改名就获得另一种 Code 成功语义                             |
| application/apply-full-analysis.ts::applyFullAnalysis                                      | observation 和 ProviderSnapshot 均须 SUCCEEDED                                                      | 保持原门禁，不把 PARTIAL 包装为一个成功快照交给旧 Apply                  |
| C3-A capture/recheck                                                                       | 真实已有 Code/support/coverage/Source 身份，history 永远 UNAVAILABLE，无原子 Apply                  | 能作为以后授权工作流的输入观察；不能代替未产生的候选 basis 或 Stage 证明 |

本轮只执行一次现有纯函数的内存反例：从已冻结 bounded-output 参考的33 nodes/32 syntax/1 coverage/SUCCEEDED，内存中移除所有 NODE/EDGE/SYNTAX、更新 sequence/counts/checksum，保留 COMPLETE coverage；现有结构 validator 接受0 nodes/0 syntax/1 coverage/SUCCEEDED。旧 normalizer 也接受 schema-valid 的空 node/edge 数组。未修改任何原输入或 Source、未执行 Native/DB/child；这个结果只证明结构验证与完整提取证明不同，**不是实际 Native 漏提取、生产漏洞、独立正例或完整 oracle 通过**。

证据与重现脚本：.superpowers/design/2026-10-23-phase1-b0-source-target/。raw 输入哈希、纯函数观测结果及可重现脚本分开保留；脚本在观测后保存，未再次运行。完整参考 counts 与削减流不符；本轮未另调用全输出 checker。

## 3. 方案比较与推荐

| 方案                                                         | 影响                                                           | 结论                         |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------- |
| 修改原 normalizePythonObservation，使 basis 可选或自动补摘要 | 破坏原 strict shape，旧调用含义不清，易把候选冒充已激活 Code   | 拒绝                         |
| 新增严格 Source-target 入口，共用同一私有算法，保留旧 API    | 消除循环且兼容旧 Fixture；纯结果继续无授权能力                 | **推荐 B0-a**                |
| 先一次改 v4 双结果、mixed stage、manifest 和 Store           | 需要完整 Source/code-completeness/Stage/资源契约，目前证据不足 | 保留为 B0-b/B1/C，当前不实施 |

不增加通用 normalization framework、配置开关、兼容推断、默认值或第三种 Canonical IR。两个显式入口使旧 shape 与新 Source 目标不会被猜测升级。

## 4. B0-a 具体接口与职责

拟新增：

```text
normalizePythonSourceObservation(value: unknown): NormalizedPythonObservation
```

输入必须是 plain data，精确字段如下，所有数组/对象继续通过现有 ensurePhase1Data 和严格 IR schema：

```text
{
  targetSource: { repositoryId, revisionId, contentFingerprint },
  providerId,
  providerSnapshotId,
  sourceFiles: SourceFile[],
  nodes: ProviderNode[],
  edges: ProviderEdge[]
}
```

- targetSource 复用既有 SyntaxTargetSourceSchema，不新增字段。它是 Source 目标，不是 RepoBasis、DocumentBasis 或 ownerBinding。
- 顶层 basis、codeActivationDigest、expectedActivationBasis、ownerBinding、capturedHandle、publish、ready 等额外字段一律拒绝；targetSource 自身带摘要或其他额外键同样拒绝。新入口必须拒绝缺字段、null、Proxy/getter/sparse array/非法 Unicode。现有 opaque Source schema 只检查非空与精确字符串，不保证所有字段的 scalar Unicode；新 wrapper 在 plain-data/strict-schema 边界补该检查，仅用于新 shape，不改变旧入口的历史接受集合。
- Provider 只做纯映射；不读取 SQLite、文件、环境、profile 或配置，不调用 Native，不替调用方核验“完整清单已从真实仓库捕获”。
- 完整 sourceFiles 只指该归一化输入显式提供的文件集合；不能冒充完整仓库 inventory。每个 SourceFile 的 repo/revision、唯一 ID/path、TEXT/python、SOURCE/TEST，以及每个观察的 Provider/snapshot/repo/revision/SourceRange 必须满足现有规则。
- targetSource.contentFingerprint 是仓库 Source 目标指纹，不能与每个文件指纹直接比较。Provider 事实中没有该仓库指纹可供此纯函数认证；不得增加一个无真实依据的相等检查或把 schema-valid 说成 authenticated。
- 真正调用工作流将来必须把 targetSource 与 C3-A 捕获的当前目标和完整 inventory 身份对齐，并在 Store 锁内复核。这个 Application/Stage 组合尚未实施；本函数不返回满足该义务的证明。
- SYMBOL/MODULE、IMPORT/REFERENCE 的映射、FactKey/Canonical ID、sourceRange、confidence、排序、边引用闭包、未知 kind 拒绝和现有硬上限完全复用当前算法；不增加 Python class/call/dataflow 能力。
- 返回类型仍是既有 NormalizedPythonObservation，精确为递归冻结的 nodePairs/edgePairs。合法空数组可以返回空映射，这只说明“输入无观察”，不说明某文件真实无事实或完整覆盖。

## 5. 旧入口兼容与最小实现范围

保留 normalizePythonObservation(value:unknown) 和 PYTHON_NORMALIZER_VERSION 及其原严格 basis schema。旧入口继续要求完整 RepoBasis；不将其历史 synthetic unit basis 升格为真实激活凭证。旧调用、错误类别、输出和原 golden 不变。

未来在 python-normalizer.ts 内把已验证输入交给同一私有核心：旧 wrapper 校验原 shape 后仅显式挑出 Source 三元组；新 wrapper 校验新 shape。核心不接受最终 Code digest，也不重新实现第二套身份/边算法。采用已有 export * from './python-normalizer.js'，无需新增 index 行或放宽 workspace export 测试。

| 未来文件                                                                         | 责任                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| packages/providers/src/python-normalizer.ts                                      | 新严格 wrapper、私有核心提取；原入口行为不变                |
| packages/providers/test/python-source-normalizer.test.mjs                        | 新入口及新旧等价/拒绝/纯函数语义                            |
| fixtures/phase1/python-source-normalization/                                     | 拟新增独立输入与 expected；不覆盖旧 python-normalization 根 |
| package.json                                                                     | 只注册新测试一次；不增加依赖                                |
| ADR-020/Provider SPI/IR/Native IPC/Security/Evaluation/状态/WBS/acceptance/trace | 同步接口范围与未关闭门禁                                    |

以上是设计范围，**不是实施计划或本轮已改文件**。旧 Rust/IPC/source/Runtime/Store/migration/profile 文件不在 B0-a 产品改动范围。

## 6. Code/Syntax 完整性与发布矩阵

在将来组合设计之前，以下规则仍是必要门禁，不新增可由用户填布尔值构造的“完整证明”：

| 观察/证据                                                             | 允许归一化为临时候选                                  | 允许本次混合发布                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 传输失败、取消、预算超限、checksum/绑定/结构无效                      | 不形成 validated observation                          | 拒绝；保留 last-good                                                                 |
| 结构合法 PARTIAL/UNSUPPORTED/存在遗漏限制                             | 可保留有明确局限的 provisional 映射供验证，不授予成功 | 拒绝；不得改标 SUCCEEDED                                                             |
| 结构合法 SUCCEEDED，但独立完整 Code 证明缺失（当前 v4 即此类）        | 可按 Source-target 归一化                             | **仍拒绝**；计数/coverage/空结果不代替 Code 证明                                     |
| Code 证明成立但 Syntax PARTIAL，或相反                                | 只保留分项 provisional 证据                           | 拒绝联合成功；不先提交一个半成品                                                     |
| 两项都完整，Source/active basis/完整 merge/support/owner 及预算均验证 | 可形成完整候选，但未获得 Store 权限                   | 只有 B1 的私有冻结、历史/removed 认证及写锁内 CAS/原子事务也通过才能发布；当前不存在 |

纯 normalizer 没有 outcome，因此它本身不产生上述证明。旧 v4 的 outcome/coverage/checksum 和所有既有成功/失败字节语料不改；旧 Apply 的双 SUCCEEDED 检查不减。最终 candidateCodeBasis 只能在完整 retained+changed 支持归并并闭包验证后计算；Syntax support 绑定这个最终候选时还必须保留原观察/owner-binding provenance。不能将 structural digest、C1 report 或一个纯输出数组升级为该工作流权限。

## 7. B0-b 后续必需设计，不随 B0-a 获批

由反例可知，旧 v4 结构完整性不足。后续单独设计要固定：

1. 声明的 Code capability/语言/输入投影、Source 指纹、必需文件集合与合法空结果；没有事先的 eligible scope 不能证明未遗漏。
2. 每个 Code 观察、独立 Code coverage/completeness 与 Syntax coverage/limitations 各自的语义和终端关联；counts/checksum 仅能证明传输一致性，不能自行证明真实提取完整。
3. strict wire/version/feature negotiation 与旧 v4 corpus 的并存策略；保留旧 strict keys/enums，不把原消息直接宽化后称兼容。
4. 生产端能支持的完整性承诺、consumer 的 owner/引用闭包、独立全 Java/全 Python/混合/空事实/遗漏/partial 反例与 Evaluation 依据。不能靠新增一列 COMPLETE 声明自证正确。
5. 多 Provider/snapshot 支持和最终完整合并候选的关联；旧 v3 全清单与 R010 summary 规则不改，Source 分类升级须另有完整 bootstrap/兼容依据。

本文件没有指定新 wire 字段、消息名/版本号、Code-only 发布路径、profile 或数值；这些未定事项是 B0-b 的明确阻塞，不写一个默认方案后提前实施。B0-a 不依赖它们便可独立验证纯映射，但不能据此标 B0/P1-04 完成。

## 8. 拟议 Fixture、验证与依赖

拟新增 ID：p1-python-source-normalization-v1；Manifest v1、phase1/code-intelligence、空 languages/frameworks、PYTHON_NORMALIZATION_CONTRACT_ONLY、空 legacy qualityGates；不注册语言能力或免除 Phase1 门禁。独立 authored Source-target 输入不含任何假 Code digest。优先复用旧独立 golden 的精确事实字节，并记录来源 SHA；新样本预期必须先冻结，再写入口。旧 Fixture 和 original16 Source 参考不迁移、不删除、不重命名。

| 未来任务                                          | 依赖                                      | 可验证完成条件                                                                                                                           | 设计／Fixture／门禁                                                     |
| ------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| B0a-1 独立预期与 RED                              | 本书面契约及具体计划获批                  | 新 API 缺失 RED；无 basis 的输入和原独立 golden 冻结                                                                                     | 本§4/5；拟新增Fixture；原 p1-python-normalization-v1                    |
| B0a-2 纯入口/共享核心                             | B0a-1                                     | 共同合法且 well-formed 输入的新旧输出严格等价、Provider ID 中立、顺序稳定、所有现有 context/IR/错误/硬上限保持；禁止空数组被认作成功证明 | Provider/IR；新旧norm测试；architecture                                 |
| B0a-3 匹配验证/追踪                               | B0a-2                                     | Providers build、新测试、旧normalizer/六组Source参考/owner与budget/wire/FactMerger；registry保留旧ID；文档范围一致                       | NativeIPC旧语料、独立 golden、无Native的明确命令清单由writing-plans审查 |
| B0-b 完整提取/结果协议                            | 独立 Code/Syntax 完整性依据及书面协议评审 | 上述§7全部固定并有独立正/负预期，不直接改旧v4消息                                                                                        | 另写具体DCP与计划，当前未批准                                           |
| B1 Stage/manifest/Apply 与 C 实际child/accounting | B0-b及各自契约/计划                       | 锁内复核、回滚/重启、真实运行与资源验证                                                                                                  | 原Phase门禁；Native/校准/数值/CI分别批准                                |

新增负例：新入口缺 targetSource、混用 basis 与 targetSource、嵌入 codeActivationDigest/授权字段、getters/proxies/sparse/Unicode、foreign repo/revision/Provider/snapshot、重复Source/观察ID、缺引用/非Python/未支持kind。Source目标指纹只能作结构声明的限制亦须测试/文档明确，不伪造纯函数对磁盘内容或C3-A authority的认证。

本轮没有新增产品测试、Fixture 注册或回归；现有 API 的纯内存反例作为设计观测单列，不替代这些尚未编写的测试。未来 verification 命令须逐项检查无真实 Native/helper，不跑 bare root verify；不重复既有完整校准。

## 9. 相容性、错误、回退和评审结论

没有 SQL/IR v1/ProviderSnapshot/IPC1..3/旧v4/owner-map/purpose 变更；不新增依赖或数值。复用当前 CanonicalNormalizationError 的 INVALID_FACT、INVALID_CONTEXT、MISSING_REFERENCE、UNSUPPORTED_KIND，不向日志扩散 Source 或底层错误。错误或取消的候选不能触碰 canonical state；B0-a 本身没有持久写入/取消运行器。

回退是停止调用新增纯入口；旧入口、旧事实和全部证据保留，无 DB downgrade、profile 回填、R4 复用或自动全仓解析。若实现需要改变身份算法、旧 schema/error/限额、生产调用或移除旧语料，停止该变更并重新治理。

作者审查见[设计评审](../reviews/2026-10-23-phase1-b0-source-target-design-review.md)。当前仅 B0-a 书面契约可提交审批，B0-b/B1/C 与独立 review/产品/E2E/Phase1 仍 OPEN。批准本文件 B0-a 后进入 writing-plans；该批准不跳过具体实施计划评审，也不授权本文后续未定的协议或实际运行。

## 2026-10-23 B0-a implementation checkpoint

用户确认具体计划后，B0a-1..3 纯契约已在原工作树实施；新严格入口及共享私有 mapper 保留旧 API/schema/version/errors/Fixture。新独立 Fixture 在产品前冻结；本地20文件302PASS、Providers build0、architecture17、registry47/exact21/catalog0。证据见[实施作者审查](../reviews/2026-10-23-phase1-python-source-normalization-implementation-review.md)及 .superpowers/sdd/2026-10-23-phase1-python-source-normalization/implementation-verification.json。原书面设计时点描述保留为历史；本补记替代其未实施/计划待审状态。B0-b/B1/C、C1 EPERM、实际 Native/资源/profile/root/集成/CI 与 P1-04/05/Phase1 仍 OPEN；没有产品发布或完整性权限。
