## A-runtime 本地实施更新；protocol 最终门禁 OPEN — 2026-10-29

用户已明确批准 D1–D4/T1–T6 本会话顺序实施。Source受控核验、Stage累计账本、v5分发代码/原始流和私有进程屏障已实现；当前 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**，不是全包验收通过。最新本地组件107 PASS/1 TODO、注册360/360、纯IPC176/176、Stage333/333、Rust指定库29/29、架构17项目、构建/类型/精确格式通过。文件symlink因EPERM为TODO/C1 OPEN。

Rust protocol内部测试最终复验在link.exe LNK1104失败，未执行；一次独立构建目录对照在依赖链接LNK1105/1224失败。准确根因UNKNOWN，不自动重试、不称已修复/flaky；旧T4的18项GREEN不冒称最终门禁。详见[作者实施评审](../reviews/2026-10-29-phase1-runtime-local-readiness-review.md)，准确证据根 `.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。未新增独立评审。

实施细节以评审及实际源码为准：native-client私有aliases是default对象成员，避免既有export-star将named aliases公开；lifecycle类型模块内，public index/options保持。私有raw consumer可接既有caller limits；Source parsed副本解析前预付；Stage account拒绝ambient事务。这些是获准私有边界的缺陷修正，不增加公开契约或数值。实际protocol筛选为`protocol::`（包含新增mixed_v5_tests），旧计划`protocol::tests`仅能选旧模块；Source旧控制的准确命令见attempt3 receipt。

无真实Native、额外acquisition helper/collector/model、新目的schema/profile值/依赖、云端CI或Git写入。既有G13 Node模块隔离进程如实记录。全Source选择/Python扫描、实际归因/运行资源与H5仍OPEN，主任务4/21接受、17未关闭；空catalog继续拒绝。历史timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。原前任10315摘要未覆盖Source，本包单独保留Source原字节并补入继任封存；不声称原摘要覆盖整仓。下方旧“未实施/REVIEW_PENDING”保留为历史，由本补记限定范围替代。

## A-runtime D1–D4 / T1–T6 已批准 — 2026-10-29

用户明确批准Source核验/Stage累计记账、v5分发及原始流、私有进程输入屏障及配套本地组件实施包，本会话顺序实施，不逐任务确认。状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION，尚无实现/新测试通过声明。无真实Native/额外Node helper/collector/model、profile/新目的schema/数值/依赖、云端CI/Git写入授权。全Source选择范围/Python扫描/实际归因与H5仍OPEN，主任务4/21接受、17未关闭。下方REVIEW_PENDING为保留历史；本补记只提升本次明确范围，不接受§8未知目的或完整运行资格。

# Phase1 A-runtime 本地准备实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the existing session/worktree, sequentially. Steps use checkbox syntax. 不新增代理/会话/工作树，不自动提交或删除证据。

**Goal:** 实现Source逐块核验/Stage账本续接、v5 CLI分发与原始传输、私有输入屏障，并以本地组件证据封板AR-LOCAL。

**Architecture:** 复用现有fingerprintFile、Stage/Store、v5库producer/validator和runProcess。新入口均私有；Source/Storage结构型计费接口不增加依赖边；空catalog保持生产拒绝。

**Tech Stack:** 已安装Node/TypeScript、Rust/Tree-sitter、SQLite、现有测试/Fixture工具；无新依赖。

**Spec:** [A-runtime附约](../specs/2026-10-29-phase1-runtime-boundaries-design.md)。状态：CONSOLIDATED_REVIEW_PENDING；未来新增契约不能被统一编排的批准自动接受。

## Global Constraints

- 仅C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas。保留所有既有本地内容、EOL、.superpowers/旧Fixture/失败；不reset/stash/批量stage、commit/push/PR或清理。
- 逐任务TDD，缺API与可调用断言RED区分；新产品前冻结独立Fixture。数值只取旧常量与独立样本精确成本，不增默认/profile/Quality Gate。
- 不执行Native CLI、Node helper、PowerShell collector或模型；不运行完整verify/root（含未授权真实路径）、校准/CI。Rust库/内部入口测试可执行，生成二进制不等于实际Native运行。
- C1权限缺口、C2spent、timeout UNKNOWN、main取消未查、R4mutable保留；不能从double/逻辑成本推OS/RSS资格。
- 只修改下述精确文件；新依赖/新public export/SQL/schema/置信策略/真实运行目的不在范围。A2实际运行包与具体值另审。
- 适用治理同步在实施前记录ACCEPTED范围，产品完成后补实际证据；不把提案写成已实现。

## Review Focus

1. Source有小预算但先读大块：T2/T3证明read前预付和Stage非零前缀累计。
2. 一次读取期间同内容替换或祖先变化：T2真实文件控制，不能只比内容hash。
3. beforeInput挂起时取消/child先退出：T5证明零业务输入、完整settlement和dispose。
4. 原始JSON字段顺序/转义改变：T4原流逐字节保留，禁止重编码。
5. 新v5分支污染旧协议/成本或误开放生产：T4–6保留旧golden和空catalog前置拒绝。

## 任务依赖与文件职责

T1独立冻结→T2 Source受控读取→T3 Stage共享计费→T4 v5分发/原始流→T5私有进程生命周期→T6注册、范围回归、治理追踪和作者评审。T2与T4逻辑可独立，但仍按此顺序，不并发长测。T5消费T4的原始流接口；T3消费T2的结构型account。

### Task 1: 独立Fixture与基线冻结

**Files Create:** fixtures/phase1/mixed-runtime-readiness/README.md、fixture.json、inputs/cases.json、expected/source.json、expected/accounting.json、expected/process.json、expected/dispatch.json。原始Source作为inputs内独立文件，使用既有Fixture source合法路径；实现前记录完整文件清单。
**Files Create (tests):** packages/source/test/mixed-source-verification.test.mjs、packages/storage/test/mixed-source-accounting.test.mjs、packages/providers/test/native-code-syntax-client.test.mjs。
**Interfaces:** 产出p1-mixed-runtime-readiness-v1，literal期望与冻结摘要；不产run/profile/owner token。完整§7各族映射到cases.json，测试代码不能生成自身expected。

- [ ] 核对继任封存、保存旧产品/Fixture/注册与拟改文件原字节；建立本计划自己的SDD ledger与精确任务brief，不修改旧plan ledger。
- [ ] 独立手算Source内容SHA、读取/缓冲/元数据计费、callback/close/输入事件顺序和v5分发预期；先写expected再写实现。
- [ ] 新测试先证明API缺失（不是业务RED）；保存原始失败与冷冻结；Manifest沿v1，不新增阈值；确切case/文件数由实际清单计算不虚报。
- [ ] 核对所有原Fixture SHA未变后进入T2。

### Task 2: Source私有受控指纹与完整清单核验

**Files Modify:** packages/source/src/fingerprint.ts。
**Files Create:** packages/source/src/mixed-source-verification.ts。
**Test:** packages/source/test/mixed-source-verification.test.mjs。
**Interfaces:** 实现附约§4的MixedSourceAccount/MixedSourceVerificationInput/verifyMixedSourceFiles和fingerprintFileControlled；旧fingerprintFile与observeGitWorktree签名/行为不变，不改source/index.ts。

- [ ] 写canary与真实拥有临时文件测试：相同输入通过；hash不同、替换命名对象/祖先、越根、重复/重叠、hardlink拒绝；逻辑删除文件存在/不存在都可接受且实际读取为0。使用fs test mock在确定读取阶段替换自己文件，避免依赖碰运气race。
- [ ] 写预算与取消断言：read触发前费用不够时实际read调用为0；多块读取按固定已知size预付、不退款；abort/过期在下一read前失败；结束后句柄关闭。原测试继续验证旧输出不变。
- [ ] 运行node --test packages/source/test/mixed-source-verification.test.mjs，观察可调用业务RED；实现共享私有读取核心与新核验器，禁止复制第二套安全读取实现。
- [ ] 构建Source后运行新test；在新test中直接调用旧fingerprintFile/fingerprintInventory，比对原Fixture literal指纹和错误，且不创建Git仓库。另运行node --test --test-name-pattern='^disappearing or non-file selected paths fail with SOURCE_CHANGED真实symlink/junction若环境不支持保留OPEN，不宣称全OS门禁通过；不改系统权限。
- [ ] 记录新链保守成本与旧链兼容证据，不赋Python分类或Source权威。

### Task 3: Stage账本适配与失败前缀

**Files Modify:** packages/storage/src/analysis/mixed-analysis-stage.ts。
**Test:** packages/storage/test/mixed-source-accounting.test.mjs。
**Interfaces:** 附约§4.3 borrowMixedSourceAccount(stage,{signal,deadlineEpochMs,maxInputBytes})，仅文件级export，旧constructor/freeze/lease/Store公共接口不变。

- [ ] 用已有测试setup建立拥有临时SQLite/真实Stage；不改Source SQL真相、不触碰用户DB。写非零prior、两次核验累计、buffer分配前拒绝、read预付、items/serializedBytes/memory每维等值与一以下、整数溢出及错误前缀、重新借用account不能放宽预算/截止或更换signal。
- [ ] 写FROZEN允许核验但APPLYING/CONSUMED/closed/INVALID拒绝、失败永久失效及Store最终导入相同账本和cleanup credit断言；独立expected来自原Stage成本＋literalSource收费，不从usage回填。
- [ ] 运行新test观察业务RED；在原WeakMap budget上实现最小适配。account多次借用不能重置FS input计数；同Stage维护单一input累计值。
- [ ] Storage构建后新test及原Stage相关预算/cleanup/失效控制通过。此时组件可用，不代表真实Source→Native→Store运行资格。

### Task 4: v5 CLI分发代码与原始流保留

**Files Modify:** crates/native-analyzer/src/protocol.rs、crates/native-analyzer/src/code_syntax.rs、crates/native-analyzer/src/code_syntax_producer.rs、packages/providers/src/native-code-syntax-stream.ts。
**Tests:** protocol.rs内部#[cfg(test)]模块；packages/providers/test/native-code-syntax-stream.test.mjs。
**Interfaces:** Rust复用serve_code_syntax_request并新增serve_code_syntax_request_from_budget(bytes: &[u8], cancelled: &AtomicBool, output: &mut impl Write) -> io::Result<()>，经code_syntax.rs re-export（仅Rust库内部架构，不修改DESCRIBE）；TS新增consumeCodeSyntaxObservationBytes，签名见附约§5.2，原consumeCodeSyntaxObservationStream返回值精确保持。

- [ ] 在protocol.rs内部用Cursor/Vec写合法v5/畸形v5不降级/parse-workers拒绝/旧v4对照；使用独立空源请求或既有冻结请求，先RED，非启动CLI。
- [ ] TS用已冻结完整raw写字节保留正例、键序/转义不重编码、分块/单字节/外部buffer修改、缺终端/超限/abort反例；先业务RED后实现一个共享消费核心。
- [ ] 仅构建受影响包，运行node --test packages/providers/test/native-code-syntax-stream.test.mjs及明确旧IPC控制。
- [ ] 运行cargo test -p codeatlas-native-analyzer --bin codeatlas-native-analyzer protocol::tests --locked，预期新分发与原内部协议tests通过；再运行cargo test -p codeatlas-native-analyzer --test code_syntax_request --test code_syntax_producer_unit --test syntax_dispatch_unit --locked。不运行Native CLI、oracle capture或额外OS helper。
- [ ] 保留DESCRIBE及原wire原字节/错误，实际v5子进程仍NOT_RUN。

### Task 5: 私有v5 client与输入屏障

**Files Modify:** packages/providers/src/native-client.ts。
**Files Create:** packages/providers/src/native-code-syntax-client.ts。
**Test:** packages/providers/test/native-code-syntax-client.test.mjs。
**Interfaces:** 附约§5.2 observeOwnedCodeSyntax私有default入口与§6 OwnedNativeLifecycle；runProcess仅内部新增参数/私有v5 request类型，并提供附约规定的validateOwnedNativeOptions/ownedNativeTimeout/runOwnedNativeProcess文件级aliases供新client消费，NativeClientOptions/public index严格不变。

- [ ] 先写固定进程double：EventEmitter＋PassThrough，设置ChildProcess实际消费的pid/stdin/stdout/stderr/kill/exitCode等字段，不真实spawn。沿用仓库已有node:child_process默认对象替换＋node:module.syncBuiltinESMExports方式，测试finally恢复并sync；该文件顺序运行，spawn默认替换为抛UNEXPECTED_OS_CHILD，只有当前case可返回拥有double。不开experimental模块mock或产品test开关。
- [ ] 断言beforeInput未完成时stdin写0；准备失败/close/取消/timeout/stderr/decoder错误后无成功结果；close/drain后afterClose，所有路径dispose恰一次；不能只Promise.race后遗留callback。
- [ ] 断言私有client返回原request/output精确Buffer与原terminal结果；旧公开options不能接lifecycle，旧exports inventory不扩张。先RED后最小runProcess适配和新client。
- [ ] Providers构建后运行新test、native-code-syntax-stream.test.mjs以及纯native-ipc.test.mjs/native-ipc-v2.test.mjs/native-ipc-v3.test.mjs/native-syntax-ipc.test.mjs。新client测试用同一个固定double补充旧v1/v3/v4调用无lifecycle时的字节/事件/错误优先级对照；不导入或执行已核验含Node helper的旧native-client/native-full-v3-client/native-syntax-client进程测试。后者本包NOT_RUN，原范围进程回归保留到另行明确授权的运行包，不伪称完整旧transport门禁通过。
- [ ] 不在本任务实现/运行collector；C2原脚本、slot和收据不改。

### Task 6: 一次本地封板与治理追踪

**Files Create:** scripts/test-mixed-runtime-readiness.mjs（只导入本包Node测试，不调用cargo/Native/collector）；Fixture README及本计划对应作者实施评审。
**Files Modify:** 根package.json（追加该root入口一次）；下列8个脚本的registry精确计数61→62、Phase1 35→36及对应registry标签；test-declared-delta-raw-admission.mjs的原16处替换重建审计将目标更新为本次准确值，仍逐文件完整比较，不增加宽松allowlist：\n\n- scripts/test-history-transition.mjs\n- scripts/test-delta-support-candidate.mjs\n- scripts/test-r011-history-capture.mjs\n- scripts/test-syntax-mapping-preparation.mjs\n- scripts/test-syntax-evidence-reuse.mjs\n- scripts/test-declared-observation-scope.mjs\n- scripts/test-declared-delta-raw-admission.mjs\n- scripts/test-declared-raw-history-candidate.mjs\n\n执行前产准确替换位置清单；若实际新增Manifest不是恰一个，先修任务缺陷，不批量调计数。
**Governance Modify:** docs/handoff/{CURRENT_STATUS,DESIGN_AUTHORITY,WORK_BREAKDOWN,PHASE_ACCEPTANCE,DESIGN_TRACEABILITY}.md、adr/ADR-020-phase1-contracts-and-evaluation.md、specs/{NATIVE_IPC,PROVIDER_SPI,SECURITY,EVALUATION,MODULE_BOUNDARIES}.md、Stage附约、统一推进计划。保留原字节后缀及备份。

- [ ] 追加root注册；独立Fixture发现该ID一次，旧61/Phase1 35是预检基线而非最终测量值；新增后实际计数必须为62/36，与精确守卫同步，catalog仍0。
- [ ] 顺序构建Source/Providers/Storage及受声明影响的Application/Runtime；运行node --test --test-concurrency=1 scripts/test-mixed-runtime-readiness.mjs、IR类型、node scripts/check-architecture.mjs，以及node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs scripts/test-workspace-structure.mjs scripts/test-architecture-rules.mjs和上述8个registry脚本。scripts/test-syntax-evidence-reuse.mjs只以node --test方式调用注册测试，不直接执行会独占写reuse-report的CLI。每条准确命令保存command JSON/日志/退出码。
- [ ] 仅当实际改动需要，顺序运行原四root中受影响Stage和直接消费链，以及T2/T4/T5声明的兼容文件；原55文件/完整回归不机械重复。不得将过滤未运行项目算通过；本地封板仍记录真实Native及旧OS helper进程回归OPEN；不得将库/double证据替代这些门禁。
- [ ] 只格式化精确新改文件，Rust fmt只核对新改区、必要时遵循原风格；不全仓EOL同步、不重装依赖。
- [ ] 作者自审检查五项Review Focus和所有AR族；未授权新代理，不冒称独立评审。本轮新实现最终fresh组件回归齐全才标AR-LOCAL_COMPONENTS_VERIFIED；OS缺口/实际Native/完整H5另列。
- [ ] 更新治理追踪、完整diff/原字节保护/继任摘要、失败及rulings。主任务仍4/21接受、17未关闭；无P1-04/05/Phase1整体关闭。准备§8准确真实运行包，一次集中处理其目的/采集器/操作清单，不询问微步骤。

## 审批与完成界线

接受本计划和附约后T1–T6可连续顺序实施与范围内修复，不再逐任务询问。当前批准统一编排的“批准实施”不把尚未呈现的Source账本/进程时序契约自动定为现有权威；本包将其一次完整提交。实际运行、新目的/profile schema/数值/依赖、云端/Git仍保留。

自审：T2产生account消费接口，T3提供同形实际Stage适配；T4产生owned原始流，T5消费同一接口；T6root只含本包纯组件测试。无重复parser、无新DB真相、无虚假lease/实际测量token。整个A-runtime/H5仍有§8的真实来源/测量边界，不以本计划长度代替这些证据。
 packages/source/test/fingerprint.test.mjs（已核验该case只用临时文件）。原observeGitWorktree/scan需要Git fixture写入的完整回归本包NOT_RUN，留到明确的后续操作包；期望所选case 0fail。真实symlink/junction若环境不支持保留OPEN，不宣称全OS门禁通过；不改系统权限。
- [ ] 记录新链保守成本与旧链兼容证据，不赋Python分类或Source权威。

### Task 3: Stage账本适配与失败前缀

**Files Modify:** packages/storage/src/analysis/mixed-analysis-stage.ts。
**Test:** packages/storage/test/mixed-source-accounting.test.mjs。
**Interfaces:** 附约§4.3 borrowMixedSourceAccount(stage,{signal,deadlineEpochMs,maxInputBytes})，仅文件级export，旧constructor/freeze/lease/Store公共接口不变。

- [ ] 用已有测试setup建立拥有临时SQLite/真实Stage；不改Source SQL真相、不触碰用户DB。写非零prior、两次核验累计、buffer分配前拒绝、read预付、items/serializedBytes/memory每维等值与一以下、整数溢出及错误前缀、重新借用account不能放宽预算/截止或更换signal。
- [ ] 写FROZEN允许核验但APPLYING/CONSUMED/closed/INVALID拒绝、失败永久失效及Store最终导入相同账本和cleanup credit断言；独立expected来自原Stage成本＋literalSource收费，不从usage回填。
- [ ] 运行新test观察业务RED；在原WeakMap budget上实现最小适配。account多次借用不能重置FS input计数；同Stage维护单一input累计值。
- [ ] Storage构建后新test及原Stage相关预算/cleanup/失效控制通过。此时组件可用，不代表真实Source→Native→Store运行资格。

### Task 4: v5 CLI分发代码与原始流保留

**Files Modify:** crates/native-analyzer/src/protocol.rs、packages/providers/src/native-code-syntax-stream.ts。
**Tests:** protocol.rs内部#[cfg(test)]模块；packages/providers/test/native-code-syntax-stream.test.mjs。
**Interfaces:** Rust复用serve_code_syntax_request；TS新增consumeCodeSyntaxObservationBytes，签名见附约§5.2，原consumeCodeSyntaxObservationStream返回值精确保持。

- [ ] 在protocol.rs内部用Cursor/Vec写合法v5/畸形v5不降级/parse-workers拒绝/旧v4对照；使用独立空源请求或既有冻结请求，先RED，非启动CLI。
- [ ] TS用已冻结完整raw写字节保留正例、键序/转义不重编码、分块/单字节/外部buffer修改、缺终端/超限/abort反例；先业务RED后实现一个共享消费核心。
- [ ] 仅构建受影响包，运行node --test packages/providers/test/native-code-syntax-stream.test.mjs及明确旧IPC控制。
- [ ] 运行cargo test -p codeatlas-native-analyzer --bin codeatlas-native-analyzer protocol::tests --locked，预期新分发与原内部协议tests通过；再运行cargo test -p codeatlas-native-analyzer --test code_syntax_request --test code_syntax_producer_unit --test syntax_dispatch_unit --locked。不运行Native CLI、oracle capture或额外OS helper。
- [ ] 保留DESCRIBE及原wire原字节/错误，实际v5子进程仍NOT_RUN。

### Task 5: 私有v5 client与输入屏障

**Files Modify:** packages/providers/src/native-client.ts。
**Files Create:** packages/providers/src/native-code-syntax-client.ts。
**Test:** packages/providers/test/native-code-syntax-client.test.mjs。
**Interfaces:** 附约§5.2 observeOwnedCodeSyntax私有default入口与§6 OwnedNativeLifecycle；runProcess仅内部新增参数，NativeClientOptions/public index严格不变。

- [ ] 先写固定进程double：EventEmitter＋PassThrough，设置ChildProcess实际消费的pid/stdin/stdout/stderr/kill/exitCode等字段，不真实spawn。沿用仓库已有node:child_process默认对象替换＋node:module.syncBuiltinESMExports方式，测试finally恢复并sync；该文件顺序运行，spawn默认替换为抛UNEXPECTED_OS_CHILD，只有当前case可返回拥有double。不开experimental模块mock或产品test开关。
- [ ] 断言beforeInput未完成时stdin写0；准备失败/close/取消/timeout/stderr/decoder错误后无成功结果；close/drain后afterClose，所有路径dispose恰一次；不能只Promise.race后遗留callback。
- [ ] 断言私有client返回原request/output精确Buffer与原terminal结果；旧公开options不能接lifecycle，旧exports inventory不扩张。先RED后最小runProcess适配和新client。
- [ ] Providers构建后运行新test、native-code-syntax-stream.test.mjs以及纯native-ipc.test.mjs/native-ipc-v2.test.mjs/native-ipc-v3.test.mjs/native-syntax-ipc.test.mjs。新client测试用同一个固定double补充旧v1/v3/v4调用无lifecycle时的字节/事件/错误优先级对照；不导入或执行已核验含Node helper的旧native-client/native-full-v3-client/native-syntax-client进程测试。后者本包NOT_RUN，原范围进程回归保留到另行明确授权的运行包，不伪称完整旧transport门禁通过。
- [ ] 不在本任务实现/运行collector；C2原脚本、slot和收据不改。

### Task 6: 一次本地封板与治理追踪

**Files Create:** scripts/test-mixed-runtime-readiness.mjs（只导入本包Node测试，不调用cargo/Native/collector）；Fixture README及本计划对应作者实施评审。
**Files Modify:** 根package.json（追加该root入口一次）；精确registry数量守卫仅在预检确认依赖新增Manifest时修改，先产精确路径/旧新数量清单，不放宽匹配。
**Governance Modify:** docs/handoff/{CURRENT_STATUS,DESIGN_AUTHORITY,WORK_BREAKDOWN,PHASE_ACCEPTANCE,DESIGN_TRACEABILITY}.md、adr/ADR-020-phase1-contracts-and-evaluation.md、specs/{NATIVE_IPC,PROVIDER_SPI,SECURITY,EVALUATION,MODULE_BOUNDARIES}.md、Stage附约、统一推进计划。保留原字节后缀及备份。

- [ ] 追加root注册；独立Fixture发现该ID一次，旧61/Phase1 35是预检基线而非最终测量值；新增后实际计数与精确守卫同步，catalog仍0。
- [ ] 顺序构建Source/Providers/Storage及受声明影响的Application/Runtime；运行node scripts/test-mixed-runtime-readiness.mjs、IR类型、architecture17与原注册/manifest/export守卫。每条准确命令保存command JSON/日志/退出码。
- [ ] 仅当实际改动需要，顺序运行原四root中受影响Stage和直接消费链，以及T2/T4/T5声明的兼容文件；原55文件/完整回归不机械重复。不得将过滤未运行项目算通过；本地封板仍记录真实Native及旧OS helper进程回归OPEN；不得将库/double证据替代这些门禁。
- [ ] 只格式化精确新改文件，Rust fmt只核对新改区、必要时遵循原风格；不全仓EOL同步、不重装依赖。
- [ ] 作者自审检查五项Review Focus和所有AR族；未授权新代理，不冒称独立评审。本轮新实现最终fresh组件回归齐全才标AR-LOCAL_COMPONENTS_VERIFIED；OS缺口/实际Native/完整H5另列。
- [ ] 更新治理追踪、完整diff/原字节保护/继任摘要、失败及rulings。主任务仍4/21接受、17未关闭；无P1-04/05/Phase1整体关闭。准备§8准确真实运行包，一次集中处理其目的/采集器/操作清单，不询问微步骤。

## 审批与完成界线

接受本计划和附约后T1–T6可连续顺序实施与范围内修复，不再逐任务询问。当前批准统一编排的“批准实施”不把尚未呈现的Source账本/进程时序契约自动定为现有权威；本包将其一次完整提交。实际运行、新目的/profile schema/数值/依赖、云端/Git仍保留。

自审：T2产生account消费接口，T3提供同形实际Stage适配；T4产生owned原始流，T5消费同一接口；T6root只含本包纯组件测试。无重复parser、无新DB真相、无虚假lease/实际测量token。整个A-runtime/H5仍有§8的真实来源/测量边界，不以本计划长度代替这些证据。
