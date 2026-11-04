# Phase1 可信上下文准备与拥有helper句柄探针实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the existing session/worktree. Steps use checkbox syntax. 不派subagent，不新建会话/工作树。

**Goal:** 实现永远不授予运行资格的DRAFT清单校验，并诚实回答最多4个拥有Node helper的外部句柄采集问题。

**Architecture:** C1是scripts层单一有界读取/校验工具，复用现有严格请求、owner-context和完整stream校验。C2是plan-owned实验，Node保留helper启动/管道/kill/close所有权，PowerShell只持有对该helper获取的OS句柄；没有产品hook或broker。

**Tech Stack:** 已安装Node内置模块、现有built providers/application/evaluation、现有PowerShell/.NET及Win32调用模式；无新依赖、无Rust/SQLite迁移。

**Spec:** [已批准分段方向](../specs/2026-10-23-phase1-trusted-context-and-process-acquisition-proposal.md)。用户2026-10-23已批准方向，执行方式既定为本会话顺序inline。本计划是该方向的具体实施审阅稿，尚未执行。

## Global Constraints

- 工作树固定C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas，分支codex/p05-integrated-exit-audit；D:/workspace/CodeAtlas不是本轮实现目录。
- 先读AGENTS/handoff当前权威、已批准提案和本计划。没有.codegraph，不创建索引。保留已有脏文件、EOL、旧Fixture/.superpowers失败证据；不stage/commit/reset/stash或清理工作树、R4 DB。
- Canonical IR独立、SQLite真相、LLM candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow不变。不改owner-map编码、旧IPC1..3、profile purpose/数字/catalog、Source分类或生产capture/transport。
- C1只输出DRAFT/NOT_READY，无TRUSTED_CAPTURE/RUN_APPROVED/PROFILE_APPROVED/SEALED状态，不接触Native运行。
- C2至多4个拥有Node helper生命周期，每场景只一次，串行，无Native/Source/profile、系统进程枚举/扫描、外部用户进程、提权、私有Node _handle或新增依赖。失败不重试、不自动改用broker/addon。
- 沿用已有helper的10000ms阶段等待、现有调用方30000ms上限及既有输出上限；是实验控制而非产品数值。整体上限触发可以少于4个场景，保留失败，不提高上限重试。
- 云端CI/写入保持暂缓。实际Native、校准、profile数字、产品hook/bridge、迁移及新增依赖仍须另行批准。

## Review Focus

1. 同ownerMap但removed或预算变化：完整请求身份必须变化，不能以ownerMap充当整个请求身份。
2. 6个activation形状差异、缺失工具身份或全部工具引用看似完整：结果仍NOT_READY，不得从任意输入批准运行。
3. 根路径前缀相似、路径穿越、junction/symlink/hardlink、替换中的文件、非法UTF-8/超限：根内只读、有界、固定无载荷错误，不能读取到其他文件后才忽略。
4. helper提前退出/PID复用疑点/获取失败：只访问拥有的child；没有最终证据就明确不可用，不复制上次峰值。
5. 取消、超时、EOF/EPIPE或句柄最终读取失败：Node owner仍kill/drain/await close，collector释放句柄；任何peak都不能把取消变成成功样本。

## 文件范围

| 路径                                                                            | 职责                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| .gitattributes                                                                  | 只增加Phase1 raw .py/.java/.jsonl的-text规则，保护现有字节，不重写任何Fixture                                      |
| scripts/syntax-qualification-draft.mjs                                          | C1唯一导出加载函数及私有校验/读取/身份辅助，无CLI运行器/Runtime入口                                                |
| scripts/test-syntax-qualification-draft.mjs                                     | C1纯文件/合同测试，无进程启动                                                                                      |
| fixtures/phase1/syntax-qualification-draft/fixture.json                         | p1-syntax-qualification-draft-v1，phase1/runtime-graph，空language/framework，仅准备合同能力；空qualityGates非豁免 |
| 同Fixture的inputs/draft.json、expected/report.json、authoring.mjs、README.md    | 手写16-case草稿、独立身份计算及状态预期/边界说明；复用已有冻结Source/reference，不复制生产输出                     |
| package.json                                                                    | 仅注册C1必需测试；C2不注册进root/CI，防止自动重复探针                                                              |
| .superpowers/sdd/2026-10-23-phase1-trusted-context-preparation/                 | 本计划ledger、RED/GREEN/回归、哈希和C2实验脚本/原始结果；全部保留                                                  |
| CURRENT_STATUS/authority/WBS/acceptance/trace/Evaluation/preflight与本计划/评审 | 同步真实状态、运行边界及对应证据                                                                                   |

不得为复用C1文件读取而重构Runtime profile loader或旧corpus工具。复用现有严格函数；将已有有界文件读取模式局部用于新工具，避免引入只有一个调用者的通用文件框架。

## C1 精确输入/输出合同

导出：loadSyntaxQualificationDraft(rootValue, relativeManifest, limits) → Promise<deeply-frozen report>。

rootValue必须是明确的规范根目录；relativeManifest是根内可移植相对路径。limits严格包含maxManifestBytes/maxArtifactBytes/maxFiles/maxTotalBytes四个正安全整数；是调用方显式文件读取控制，不是Native资源预算或profile。根仅做metadata/路径核验；manifest/catalog和每次文件内容读取均计入maxFiles及maxTotalBytes，同一个FD的分块read不是新增文件次数。重复打开/读取同一路径仍计费，不靠路径去重规避总量。加法必须安全，不先分配超限缓冲区。

### Draft v1

根字段恰为：schemaVersion:1、kind:SYNTAX_QUALIFICATION_DRAFT、status:DRAFT、corpus、cases、tooling。未知字段拒绝，包括approved/testBypass/reservationBytes/readiness/SEALED。

- ArtifactRef恰为{path,sha256}，path为根内可移植相对路径，sha256为64位小写hex。不得出现空段、.、..、绝对路径、反斜杠、冒号、NUL或Windows保留路径分隔/重定向字符。
- corpus为原OFFLINE_UNEXECUTED catalog的ArtifactRef；raw SHA必须等于已有packages/runtime/dist/syntax-observation-corpus.js::nativeSyntaxObservationCorpus.catalogDigest（只读导入冻结常量，不改Runtime）。严格核对其版本、revision、由该常量caseIds确定的8类×calibration/holdout、case ID、Source/probe引用和SHA。用同一个有界读取流程核对原Source/probe，不私自改变旧catalog或探针。
- cases恰为原catalog的16个唯一case。每项字段恰为id/request/context/expected/sources/retainedPaths。request/context/expected为ArtifactRef；sources为{sourceFileId,artifact:ArtifactRef}数组，与严格request.sourceFiles一一对应；retainedPaths为唯一、可移植的逻辑路径，不与changed/removed路径重叠。
- request引用已有单行LF JSONL，无BOM/非法UTF-8/额外记录/换行规范化；调用parseSyntaxObservationRequest并validateSyntaxOwnerContext。完整expected通过compareSyntaxObservationOutput(request,expectedBytes,expectedBytes)校验；其outcome须匹配原probe.expectedOutcome。这只是参考有效性，不是实际producer结果。
- 每个request Source的id/path/fingerprint与sources及原catalog Source的逻辑basename/原始字节SHA一致；原probe中的retainedPath（若有）与retainedPaths匹配。removed身份由现有严格请求解析，逻辑路径须匹配原case.requestShape.removedSourceFiles。不得把removed/retained当需读取的Source文件。
- tooling字段恰为nodeExecutable/nativeExecutable/hostBuild/cargoLock/rustToolchain/grammarSet/collector；每项是ArtifactRef或null。null记录缺失；非null仅核对字节身份，不能认证其执行/功能或取消NOT_READY。

### Report v1

schemaVersion=1，kind=SYNTAX_QUALIFICATION_PREPARATION_ONLY，status=DRAFT，readiness=NOT_READY，manifestDigest/corpusDigest、cases、missingToolIdentities、unresolvedObligations、artifactsRead/totalBytesRead。不得返回原始Source/context/owner/环境或可执行令牌。

每个case报告id，rawRequestDigest/requestIdentityDigest/contextDigest/expectedDigest/sourceInventoryDigest/removedInventoryDigest/resourceDigest/retainedPathsDigest，以及requestShapeDifferences。比较原场景expectedActivation/ownerBinding/changedPaths/removedPaths；路径比较仅用于场景差异，不改变完整请求身份。当前fixture必须恰有6个expectedActivation差异。

cases按id的UTF-8字节排序；missingToolIdentities按上述固定tooling字段顺序；unresolvedObligations按UTF-8字节排序去重；差异轴顺序固定ownerBinding/expectedActivation/changedPaths/removedPaths，避免由输入对象key顺序改变报告。

原始文件摘要均SHA256字节。requestIdentityDigest对**整个严格解析request**计算：UTF-8域codeatlas-syntax-qualification-request-v1+NUL+规范JSON，含requestId、root、所有版本/snapshot、removedSourceFiles、全部resourceBudget和deadline字段，不删任何字段。规范JSON只将对象key按UTF-8字节排序，数组顺序和值保留；不重写raw request。其余结构摘要分别用独立域source-inventory-v1/removed-inventory-v1/resource-v1/retained-paths-v1加同一规范JSON；域前缀均codeatlas-syntax-qualification-，尾随NUL。身份是准备材料身份，不是Canonical FactKey、stageDigest或授权证明。

固定义务始终包括TRUSTED_CONTEXT_REQUIRED/EXECUTION_SCOPE_REQUIRED/PROCESS_ACQUISITION_REQUIRED/PROFILE_APPROVAL_REQUIRED/FULL_CODE_SYNTAX_STORE_PROOF_REQUIRED/TOOL_IDENTITIES_UNQUALIFIED/ORACLE_PROVENANCE_REQUIRED。自比较只证明expected结构/checksum，不证明独立作者或事实正确；摘要是追踪身份，不是批准。按事实另加SCENARIO_REBIND_REQUIRED及TOOL_IDENTITIES_MISSING。即使全部工具引用非null、形状一致，仍保留NOT_READY和固定义务。

异常只抛INVALID_SYNTAX_QUALIFICATION_DRAFT（code与message固定），不回显路径、case载荷、Source或底层OS错误。进入Object.keys/读取前复用validateOperationPolicyData检查limits。JSON结构采用现有严格字段模式，不新增JSON parser依赖；重复记录/逻辑身份拒绝，raw字节摘要始终保留。

文件读取沿用现有lstat→realpath→open→fstat→有界读取→fstat/lstat/realpath重查；拒绝根/路径段重定向、非普通文件和nlink不为1的工件。核对inode/dev/size/mtime与打开句柄/最终命名对象一致；发生替换/增长/越界就拒绝，不提供弱化fallback。

### Fixture断言与测试读取控制

测试的fixtureLimits独立从手写manifest、固定原catalog及所有声明工件的读取清单/实际字节推导：maxManifestBytes为草稿字节数，maxArtifactBytes为该样本最大工件字节，maxFiles为声明读取次数（含重复），maxTotalBytes为这些读取字节和。每个拥有临时样本先独立计算其合法边界；负例分别减一。不把这些测试控制变成工具默认或Native资源数值，不为使测试通过增加猜测余量。

关键断言的固定形式如下；expected从独立authoring生成并预冻结，不能用加载器输出更新：

```js
const report = await loadSyntaxQualificationDraft(root, manifestPath, fixtureLimits);
assert.deepEqual(report, expected);
assert.equal(report.readiness, 'NOT_READY');
assert.equal(report.cases.length, 16);
assert.equal(report.cases.filter((c) => c.requestShapeDifferences.length).length, 6);
assert.equal(report.missingToolIdentities.length, 7);
assert.equal(nativeSyntaxObservationProfiles.length, 0);
assert.notEqual(changedCase.requestIdentityDigest, originalCase.requestIdentityDigest);
assert.equal(
  changedRequest.payload.ownerBinding.ownerMapDigest,
  originalRequest.payload.ownerBinding.ownerMapDigest,
); // 从两份输入读，不在report泄露该值
assert.equal(rehashedAlteredReference.readiness, 'NOT_READY');
assert.ok(rehashedAlteredReference.unresolvedObligations.includes('ORACLE_PROVENANCE_REQUIRED'));
await assert.rejects(
  () => loadSyntaxQualificationDraft(root, badPath, fixtureLimits),
  (error) =>
    error.code === 'INVALID_SYNTAX_QUALIFICATION_DRAFT' &&
    error.message === 'INVALID_SYNTAX_QUALIFICATION_DRAFT',
);
```

深冻结断言递归检查report的对象/数组，不只检查根；错误无载荷断言另外检查不含注入的敏感sentinel。Source/retained/removed路径指的是每个case的逻辑路径，不能与ArtifactRef的物理相对路径混用。

## Task C0-byte：精确字节的checkout策略前置保护

本轮只读证据：已有Git blob的--filters模拟在三种raw路径下均由7592变7625字节（33个CRLF），byte-policy-readonly.json留证；没有实际checkout或Fixture修改。系统core.autocrlf=true；git check-attr确认Phase1的app.py、Endpoint.java、request.jsonl均text/eol unspecified，普通json已text/eol=lf。之前16-case哈希只证明当前工作副本，不能保证Windows fresh checkout不转换rawSource/校验和流。本问题不会通过重写现有字节来解决。

- [x] 将只读Git filter回归加入新scripts/test-syntax-qualification-draft.mjs：以已存在的HEAD:package.json blob作无敏感内容样本，git cat-file blob取得raw，再用git -c core.autocrlf=true cat-file --filters --path=<Phase1 raw fixture path> HEAD:package.json取得模拟checkout字节。对.py/.java/.jsonl都assert字节相等；当前策略预期RED。仅用已有Git对象，不hash-object -w、不stage/checkout/clone，不冒称实际fresh checkout测试。
- [x] 仅在.gitattributes增加三条：fixtures/phase1/**/\*.py -text、fixtures/phase1/**/_.java -text、fixtures/phase1/\**/_.jsonl -text。匹配已有IPC raw流的保留方式；不改全局config、其他路径属性或旧SQL规则。
- [x] GREEN只读filter模拟与check-attr(text=unset)；全部既有Fixture SHA保持逐字节相等。本地现有EOL flags不整理，原失配/失败证据保留。这个前置检查不证明将来CI已执行。

C0-byte仅是C1精确工件身份的必要checkout保护，纳入本计划整体审阅；不是新的产品功能或对已接受Source/golden数值的修改。若只读过滤实验不能重现风险，保留实际结果并重新判断，不能为了符合预期去改Fixture字节。

## Task C1：未执行清单合同、加载器与Fixture

**Consumes:** 既有parseSyntaxObservationRequest、validateSyntaxOwnerContext、compareSyntaxObservationOutput、validateOperationPolicyData、只读nativeSyntaxObservationCorpus冻结常量，16-case索引与冻结原catalog/reference。

**Produces:** 上述唯一加载函数、独立Fixture和必需测试；绝不产生实际run/profile资格。

- [x] C0-byte通过且原数据哈希不变后，写C1测试并观察RED（缺少模块/Fixture），保留原始日志。不得先实现再补一个仅镜像实现的测试。
- [x] 独立编写inputs/draft.json：16项引用现有冻结文件、tooling全部null。authoring.mjs只使用Node标准fs/crypto、手写场景预期和已接受身份公式，不调用产品加载器产生expected；输入先格式化再计算expected，比较前冻结整个新Fixture。
- [x] 测试draft-baseline-is-always-not-ready：报告与独立expected完整相等、16case/6差异/7缺失工具、深冻结、固定义务和Runtime catalog0。
- [x] 测试removed-and-resource-change-bind-whole-request：在拥有临时副本修改removed.previousContentFingerprint或maxEvents，更新该请求ArtifactRef的SHA；ownerMapDigest不变，rawRequestDigest/requestIdentityDigest及相应子摘要必须变化，readiness仍NOT_READY。
- [x] 测试no-caller-readiness-or-approval：未知字段/伪APPROVED/SEALED/testBypass/数字reservation拒绝。填满7个真实工件引用也仍NOT_READY，保留TOOL_IDENTITIES_UNQUALIFIED及可信捕获/运行/profile义务。
- [x] 测试rehashed-altered-reference-still-unqualified：将结构仍合法的expected事实修改并重算checksum/ArtifactRef SHA，结果只能记录不同expectedDigest并保留NOT_READY/ORACLE_PROVENANCE_REQUIRED，不冒称从Source证明独立作者；不更新原参考根。
- [x] 测试catalog-case-and-source-correspondence：少/多/重复case，changed/removed/retained逻辑重叠，Source id/fingerprint/原case不匹配，缺失/篡改文件，完整expected损坏或失败流均拒绝；不同原Source不得靠相同名字混用。
- [ ] 测试confined-file-identity：绝对/穿越/根前缀相似/非法组件/root或中间junction、symlink/hardlink、目录代文件、BOM/非法UTF-8、超manifest/artifact/文件数/总字节、非法limits均固定错误。Windows junction与hardlink测试在拥有临时目录内完成；不能因权限问题静默记通过。 当前实现已具备；真实file symlink创建EPERM留为显式TODO，完整C1验收OPEN。
- [x] 测试named-file-replaced-after-open：用Node内置test mock包裹fs/promises.open，在真实打开后将拥有的文件改名并在原名建立不同文件；正常对照先通过，随后因命名对象/句柄身份差异拒绝。不向产品加测试hook，不做时序碰运气重试。
- [ ] 实现最小单文件loader及私有辅助；GREEN全部对应测试，注册root C1测试；生成新Fixture registry条目，旧Fixture/Source字节不改。 当前实现已具备；真实file symlink创建EPERM留为显式TODO，完整C1验收OPEN。
- [x] 运行下面本地匹配回归、架构、格式与Fixture发现；保留完整日志/命令/退出码和旧product/Fixture哈希。无Rust变化，不重复Rust/真实Native或旧OS helper实测；不把历史83 Rust标为新证据。
- [x] 同步CURRENT_STATUS、authority、trace、WBS、acceptance、Evaluation/preflight、作者评审和本计划ledger。C1完成不解锁C2之外任何运行或Runtime catalog。

### C1验证范围

新测试先单独运行：node --test scripts/test-syntax-qualification-draft.mjs。回归使用node --test --test-concurrency=1，按下列18个文件顺序保存准确command JSON，不执行整个root（其中有未获本包授权的实际Native路径）：

- scripts/test-syntax-qualification-draft.mjs
- scripts/test-syntax-observation-evidence.mjs
- scripts/test-syntax-observation-output.mjs
- scripts/test-syntax-initial-absence-oracle.mjs
- scripts/test-syntax-java-owner-oracle.mjs
- scripts/test-syntax-mixed-provisional-oracle.mjs
- scripts/test-syntax-dynamic-malformed-oracle.mjs
- scripts/test-syntax-nested-source-oracle.mjs
- scripts/test-syntax-bounded-output-oracle.mjs
- scripts/test-syntax-changed-only-oracle.mjs
- packages/providers/test/native-syntax-ipc.test.mjs
- packages/providers/test/native-syntax-owner-binding.test.mjs
- packages/runtime/test/native-syntax-admission.test.mjs
- packages/runtime/test/syntax-observation-profile.test.mjs
- packages/evaluation/test/fixture-registry.test.mjs
- packages/evaluation/test/fixture-manifest.test.mjs
- scripts/test-workspace-structure.mjs
- scripts/test-architecture-rules.mjs

另运行node scripts/check-architecture.mjs和新mjs/JSON/README/新评审/package.json范围格式，核对.gitattributes仅三条目标规则变化；node调用原task-04-source-reference-index-check.mjs核对16/6，保存新输出到本计划证据目录，不覆盖旧结果。Fixture发现必须包含全部既有ID及新p1-syntax-qualification-draft-v1，catalog0。根级强制门禁仍待之后集成批次，不豁免。

## Task C2：最多4个拥有Node helper外部句柄可行性场景

**Consumes:** 已批准问题/4场景与现有PowerShell Counter.Read模式。独立于C1；仍顺序执行。

**Produces:** plan-owned实验脚本及一次性原始尝试记录。不能注册为产品/CI测试或profile数据。

- [x] 在本计划workspace的probe/创建driver.mjs、owned-helper.mjs、collector.ps1及纯控制transcript样例。固定只允许明确Node executable和拥有helper；Node直接spawn保持shell:false/windowsHide/过滤env，唯一stdout消费者；collector不能启动/替换helper或Native。helper必须在stdin EOF或既有10000ms自保护超时退出；collector在owner管道关闭时释放句柄并退出，避免driver意外终止留下等待者。
- [x] driver导入无副作用，只有显式--execute-once才允许执行。先以node --check和PowerShell Parser.ParseFile做无进程helper的语法核验；纯归类/拒绝检查用文字样例，不冒充实际OS证据。C2是实验问题，不用虚假实测RED或重试来完成TDD。
- [x] 执行前冻结driver/helper/collector与Node身份；在固定owned output以wx创建不可复用attempt ledger。每次helper spawn前消耗一个slot并记录case/nonce；最多4，重启driver发现旧ledger就拒绝，没有reset/force/resume重试入口。
- [x] collector可用一个PowerShell会话复用Add-Type/读取模式，最多一个活动句柄；每次case独立nonce、获取/释放、状态和最终记录。只对driver给出的拥有helper做单次OpenProcess，不枚举/轮询进程；使用所需query/synchronize权限，不提权、不访问私有Node HANDLE。
- [x] helper的stdout返回nonce/PID与READY，Node持有真实ChildProcess；collector对同一次目标检查image/creation/lifetime并记录OS creation FILETIME（字符串避免精度损失）。仅PID或诊断事件不算充分身份。若受控场景下仍无法建立关联，返回不可用，不伪造Native可行结论。
- [x] 执行下表4场景，各一次、串行。global watchdog沿用现有调用方30000ms，阶段沿用10000ms；提前耗尽则少于4项并保留原因，不加时/重试。没有真正发出helper spawn的slot也保留为已尝试，不复用。
- [x] 所有路径finally：Node owner终止仍活helper并await close/drain；collector在最终读取或拒绝后释放HANDLE，关闭会话；释放失败/未退出均使该场景不具资格。保留stderr、退出/close状态和原始失败，不泄露环境或Source。
- [x] 对原始结果做独立结果核验，报告实际执行次数、每个slot结果、是否仍有child/handle存活、所有脚本/输出哈希。无论4项结果如何，measurementEligible固定false，kind=OWNED_NODE_HELPER_FEASIBILITY_ONLY；不能导入Syntax catalog。

| 场景                     | Node owner行为                                                  | collector行为                                                         | 可接受的真实结果                                                                           |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| held-ready               | 创建nonce helper并保持stdin，收到采集READY后才释放，await close | 单次获取、保留同一HANDLE，Node确认close后核对OS已退出再最终查询并释放 | 有充分受控身份和正最终峰值的helper可行性证据；否则明确不可用                               |
| closed-before-attach     | short helper退出并await close后才进入采集步骤                   | 已确认child关闭时不再用旧PID重新OpenProcess                           | ACQUISITION_UNAVAILABLE，reason=CHILD_CLOSED_BEFORE_ACQUIRE，无peak；不声称实际API调用失败 |
| injected-acquire-failure | 创建拥有helper但不发业务输入，获取失败后owner负责终止/close     | 对该拥有case注入失败，不向其他PID发起调用                             | ACQUISITION_UNAVAILABLE，明确INJECTED；不是OS故障测量，所有权完整清理                      |
| cancel-after-attach      | 收到采集READY后kill拥有helper并await close                      | 可最终读取但随后释放HANDLE                                            | CANCELLED，measurementEligible=false；即使有peak也不算成功观测                             |

OS调用失败、身份不明、零/缺失peak、未await退出、读取早于退出、nonce错/重复、残留句柄/子进程，都不能输出成功helper证据。timeout/cancel期间同时drain，不能仅看到kill返回true就声称已退出。

预算是4个**Node helper**生命周期；driver Node自身及一个collector PowerShell会话是实验协调器，不是Native broker或测量样本。Add-Type仅复用已安装平台。不开新窗口，不装编译工具，不扫描其他进程。

如果任何平台/实现错误阻止后续安全场景，保留失败并停止；不得修完后重跑已花费slot。未来需要额外helper尝试时另申请具体范围。探针代码按实验保留，不加入产品包，不因“成功”直接实现transport hook。

## Task C3-prep：评审、证据与下一决策包

- [x] C1/C2完成或诚实报告不可行结果后，逐项核对本计划Review Focus；不能用通过的C1抵消失败的C2，或把未执行场景记为通过。
- [x] 作者评审（不声称独立review），分别记录C1合同完成与C2问题答案/限制；更新全部追踪、精确命令/哈希/运行次数。新workspace证据永久保留。
- [x] 准备真实capture/stage seal/removal认证、实际child归因与启动前握手、HOST/collector存活成本的下一设计建议；没有证据的接口继续标明待定，不创建虚拟lease实现。
- [x] P1-04/05与Phase1退出、全Java/混合Code候选/Canonical Syntax/support/CAS/Store、实际重启与profile门禁保持OPEN。实际Native执行/数值安装/云端CI依然另行确认。

## Pre-flight与计划自审

C1只读准备材料→报告不能晋级；C2探针→可行性结果不能晋级。两者都不向Runtime catalog写入，也不向Native/Store提供授权token，无共享可变产品状态。C1完整请求身份涵盖removed/resources，原ownerMap定义不变。C2不调用runProcess产品路径、不声称其透明性，故不从helper结果推导Native bridge。

计划自审：新增C0-byte精确字节前置保护需在本计划整体确认，未执行；批准的C1/C2范围均有文件、精确接口/状态、失败控制和证据步骤；未将资格材料、生产capture与实际测量混为一体；没有新增产品数字、依赖或迁移。读取边界只用于本工具。真正独立任务仍顺序。需要用户审阅的是本计划整体；通过后在其范围连续推进，不对每个小步骤再次请求确认。

## Confirmed execution checkpoint — 2026-10-23

User confirmed this concrete plan.C0-byte complete;C1 implementation present but full acceptance OPEN for real file symlink EPERM and applicable integration gates;C2 four one-shot cases executed,no retry,all closes/releases confirmed;C3-prep author review and next-design brief written.Final matching local regression340 PASS/1 TODO,not a full root pass. See implementation review and plan-owned implementation-verification.json. Original review/direction-pending wording above is historical and superseded. No Native/cloud/product capture/profile authority added. Evidence workspace preserved by user instruction,no commits or cleanup.
