# Phase1 可信上下文与进程采集分段提案

状态：DIRECTION ACCEPTED 2026-10-23。用户明确“批准，继续下一步”，批准推荐的C1/C2准备范围；具体实施计划另行审阅。沿用已批准的 Syntax 准入、混合兼容与遍历预算契约；本提案不修改已接受的 wire、owner-map 编码、profile 或迁移。不是 IMPLEMENTATION-READY，也不是可执行的测量清单。

## 目标与本轮范围

将16份独立 Source 参考推进到可审查的运行准备材料，同时确认现有平台能力能否采集实际 transport 子进程的终生峰值。已获批方向包括C1准备清单校验与C2最多4个拥有Node helper场景；实施计划审阅前仅细化文档。真实产品捕获/transport bridge、Native、校准、依赖和云端写入/CI仍不在本包授权内。

建议下一批准包限定为：严格的未执行清单校验与独立 Fixture；最多4个顺序、受控 Node helper 生命周期的外部句柄可行性探针。探针代码属于保留的实验/证据，不进入产品。真实 Runtime/Storage 捕获、产品 transport hook、Native 运行及数值安装分别保留后续门禁。

## 已核验的实际路径

| 当前实现 | 已有能力 | 不能据此推定的能力 |
| --- | --- | --- |
| packages/runtime/src/native-syntax-admission.ts::observeAdmittedNativeSyntax | 空 catalog 在 prepare、Source/二进制读取和 spawn 前拒绝；已有环境/profile匹配与 maxItems 上游限制 | prepare 回调不会自动变成经 Storage 认证的真实上下文；不能提供 profile 测试绕过 |
| packages/providers/src/native-client.ts::observeNativeSyntax → runProcess | 严格 context/request、shell:false、windowsHide、独立 stdin/stdout/stderr、取消/超时、流校验、await close | 没有外部句柄采集接口；也没有通用 observer callback |
| scripts/syntax-peak-collector.ps1 | 自己创建 Node helper、保留自己的进程句柄、退出后读取峰值 | 不是 Node transport 所创建的 Native；不能测一个 helper 再冒称实际 Native |
| packages/runtime/src/native-full-bootstrap.ts | 检查 SQLite Source清单、捕获旧激活 token、临时stage、验证/归一化/merge/seal、Application/Store apply | 属于原 v3 全量路径；不能拿过滤清单或 Python 事实复用旧summary/门禁 |
| packages/storage/src/analysis/temp-stage.ts::RepositoryAnalysisStage | connection-local TEMP、Provider/merged迭代、终端确认与 Native state seal | 没有已实现的混合 provisional Syntax owner-stage lease/认证 stageDigest；旧 Native state seal 不是它的替代物 |
| packages/storage/src/analysis/native-analysis-state.ts::captureNativeActivationToken | 事务内有界读取现有激活状态 | 不是 Syntax owner/support 或 removal 清单的完整认证 |
| packages/runtime/test/fixtures/native-dense-diagnostic.mjs | 测试专用 spawn/stream monkeypatch，记录时序 | 未进入测量 catalog，不能自动晋级为内存采集器或假定不影响 HOST |

16-case 索引为 .superpowers/sdd/2026-10-22-phase1-foundation-and-runtime/task-04-source-reference-index.json。动态/畸形、嵌套、输出边界的两组共6个请求使用 ABSENT 单元基线；原目录要求 PRESENT。其余10份即使形状一致，也仍是 synthetic unit context。Source/reference覆盖16/16不代表实际运行覆盖16/16。

## 可信上下文：来源与数据边界

区分三种材料，不增加第三份生产真相：

1. **Source/reference包**：独立预期、原始Source、请求模板、context和哈希。它能够支持有界测试，不能认证实时数据库/临时stage。
2. **未执行资格清单**：固定待执行工具、Source/expected/request/context/resource身份、原场景与实际请求的差异及未完成义务。它只能表示准备状态，不可由调用者填 APPROVED 字样后进入 Runtime catalog。
3. **生产准备上下文**：未来由 Runtime 协调，Storage在事务/有界读取下提供真实旧激活与Source清单，受验证的临时Code stage提供owner及其支持，Application拥有发布策略。只有实际实现、独立Fixture/CAS/失败恢复后才能称 trusted capture。

未执行清单必须包括：

- 明确 schema/kind、qualification-only 目的、未执行状态与待满足义务；不得携带或安装资源保留量/批准token。
- case与mode、原目录身份及完整Source/expected引用；原有16-case索引是输入，不可把 observed output 当 expected。
- request原始JSONL SHA256、严格解析后的完整请求身份、context身份、Source/移除/保留清单与resource形状；完整请求身份必须涵盖 removedSourceFiles、所有预算、版本、snapshot和deadline策略，不能只使用 ownerMapDigest。
- executable/build/lock/toolchain/grammar/collector身份可以在 DRAFT 中列为未就绪；任何字段缺失都阻止生成执行就绪清单，不填伪造占位哈希。
- readiness只能由校验得出；不允许传入 approved:true、testBypass 或任意数字来改变 Runtime gate。SEALED_UNEXECUTED即便将来引入，也不等于批准运行或profile。
- 有界读取、根内路径、链接/重定向拒绝、字节哈希、重名/重叠拒绝、固定错误码、不回显Source、owner载荷或无限环境。复用已有范围匹配的读取/校验模式，不添加通用manifest框架。

本次先实现的清单校验器只产生 DRAFT / NOT_READY 和明确缺口。它不得输出 TRUSTED_CAPTURE、RUN_APPROVED 或 PROFILE_APPROVED，也不扩展 Runtime公开参数。实际capture的源端口、临时stage seal编码、生命周期及重查/CAS必须在P1-04/05联合设计中再定案；本提案没有为尚不存在的lease伪造API。

### 真实捕获的后续必需条件

- expectedActivationBasis从SQLite捕获，targetSource来自授权的当前Source；WORKTREE revision ID或相同fingerprint不足以证明支持未变。
- Java owner来自已验证临时Code事实与Provider→Canonical绑定，Python新事实在最终候选前保持三角色边界。禁止独立提交Java/Python半图。
- capturedContext与stage生命周期绑定，关闭、重建、回滚、重新归一化或支持变化即失效；stageDigest不能从调用者标量、临时路径或旧v3 Native state seal冒充。
- removedSourceFiles不在已接受owner-map编码内。保留该编码，由完整请求身份及授权变更/删除清单独立绑定；Apply再次检查旧激活、Source/支持、候选和删除。若需要改变wire/owner-map，另走DCP。
- Source Python分类目前仍未启用，不能为了测量绕过正常准入；资格Fixture不能冒称已实现生产Source工作流。实际Java完整图、混合完整候选及Canonical Syntax/support/Store预期仍需补齐。
- profile缺失前置拒绝保留。资格工具在产品准入之外使用已存在的低层受信传输，不给产品增加免profile入口。资格上下文与生产上下文的适用范围必须分别记录。

## 进程采集：平台事实与方案比较

Node24.15.0公开ChildProcess接口提供PID与生命周期事件，未提供文档化的Windows进程HANDLE导出接口。这是对公开API表面的核验；不使用私有 _handle。公开 diagnostics_channel 的 process/spawn 通道仍是实验接口，只可作为待验证的归因线索，不能据此断言拿到了OS句柄或阻止了stdin写入。[Node ChildProcess](https://nodejs.org/download/release/v24.15.0/docs/api/child_process.html)，[Node诊断通道](https://nodejs.org/download/release/v24.15.0/docs/api/diagnostics_channel.html)。

Windows的进程句柄可在进程结束后保留，GetProcessMemoryInfo使用句柄查询；这不保证给定系统/权限/退出状态下最后一次峰值查询一定成功，必须实测并在失败时拒绝。[句柄生命周期](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers)，[内存查询API](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo)。

| 方案 | 优点 | 缺口/取舍 | 建议 |
| --- | --- | --- | --- |
| Node保留spawn所有权；外部已安装PowerShell对唯一受控child单次attach并持有HANDLE | 优先复用已有平台/collector，无新依赖；保留实际transport与管道所有权 | acquire-before-exit竞争、PID复用/归因、权限、握手、测量开销仍未证明；仅PID不充分 | 先做严格限定的Node helper探针，不能现在批准为Native采集器 |
| PowerShell/broker创建Native并转发协议 | 启动所有者能较早持有HANDLE | 改变launch owner与transport路径；新增broker存活开销不在当前HOST maxRSS中，必须重新审查身份/记账 | 不作为本包实现；禁止偷偷替换executable或用helper峰值冒充Native |
| 新增原生桥接/addon或私有Node HANDLE访问 | 有机会保留同一真实进程句柄 | 新构建/ABI/依赖或私有API风险，超出最小范围；尚无实现证据 | 不引入。前一方案若失败，保存失败并回到治理，不自动换方案 |

推荐保留 HOST=真实Node流程的resourceUsage.maxRSS、NATIVE=真实子进程OS终生PeakWorkingSetSize以及两份保留量求和。当前不改变指标、component布局或purpose。任何collector/broker如果后来进入实际产品或同时存活范围，须明确额外存活成本；不能因称为instrumentation就忽略真实产品开销。

### 建议批准的4个helper探针

只能使用明确路径的当前Node及拥有的固定helper，Windows隐藏窗口，单次顺序执行，不扫描系统进程、不附加用户进程、不使用Native二进制/Source/profile，不轮询PID找进程，不改变系统权限。沿用已有helper的超时控制，不新增产品数值。

1. Node直接创建等待握手的helper；对该次child做一次句柄获取，建立身份记录，取得READY后释放helper，await close后读取保留句柄的终生峰值。必须绑定实际child、创建/退出和collector证据；无法证明身份则失败。
2. helper立即退出，故意使attach晚于退出。允许明确 ACQUISITION_UNAVAILABLE；不填前一次峰值、不把早期snapshot当最终值。该行不得成为有效测量样本。
3. 对拥有的helper注入获取失败，不扫描/探测其他PID。必须拒绝、不发送业务输入、不遗留helper/句柄，保留失败记录。
4. attach后取消拥有的helper；原owner负责kill/await close，collector释放句柄。即使有峰值，也不能算成功观测。

最多4个helper生命周期，每项只做一次。若实现/平台错误阻止后续安全执行，保存失败并停止，不自动重试。即使4项符合预期，也只得出该受控helper场景可行，不能证明实际Native的快速失败、身份、安全握手或HOST透明性。探针输出不得进Syntax profile catalog。

### 后续Native bridge必须满足而本包不批准实施的条件

实际runProcess创建的同一个Native、请求发送前完成受信采集准备、同一保留句柄退出后最终读取、创建/退出/请求/输出全链身份、缺失数据拒绝；无双stdout消费者、不改shell/env/管道、无原始payload日志、取消/超时仍drain+await、所有清理有所有权。不得用PID数值、公共诊断事件或helper的“成功”代替这组证明。确需产品hook/握手/launch owner变化时，提交明确DCP及适用Fixture、accounting和实现计划后再修改。

## 任务依赖、验收与追踪

| 任务 | 依赖 | 拟修改范围 | 可验证完成条件 |
| --- | --- | --- | --- |
| C0 现状与差异清单 | 已有16个Source索引/收据 | 本提案/评审/交接 | 实码路径、6个context差异、没有的stage/handle API逐项标明；本轮完成 |
| C1 未执行manifest严格校验 | 本方向获批后细化计划 | scripts中的最小校验器、独立合同Fixture及必需测试注册 | RED→GREEN：完整请求含removed/resource身份；6差异与缺失工具身份拒绝READY；路径/链接/大小/重复/伪批准拒绝；catalog仍空；不运行Native |
| C2 helper句柄探针 | 用户批准问题/范围，独立于C1 | plan-owned证据实验、已有collector逻辑复用 | 上述4个有界场景；返回成功或明确不具备资格均诚实记录；不生成profile，失败不重试 |
| C3 精确capture/bridge设计定案 | C1/C2证据、联合P1-04/05 stage/owner需求 | DCP/ADR/Fixture与任务计划，先评审 | 决定资格/生产authority、stage seal、移除认证、实际child身份/握手/开销；无猜测API |
| C4 实际候选与运行申请 | C3获批并实施，本地全部对应门禁 | 冻结实际可执行包/命令/case/repetition/owned output | 六项context差异重绑、全部实际身份、全Java/混合候选、故障/生命周期证明具体可审查；另申请Native执行 |
| C5 校准/profile/CI | 各自明确批准 | 各自已有治理流程 | 不自动重试/调参；profile数值另批准；CI按用户要求在集成点统一提交准确head/job/次数确认 |

C1与C2真正独立，但遵循本会话顺序执行，不新增会话/工作树/并发长测。实施计划待本方向评审后用writing-plans细化；沿用已选择的inline顺序方式，不重新询问执行方式。所有必需Fixture/Evaluation/架构/文档追踪保持；空qualityGates不豁免Phase1。

## 治理、影响、回退与批准问题

本包不修改ADR-020已接受内容、IPC1..3/未发布v4字段、owner-map算法、R001..R010/W001..W003、Canonical IR、SQLite真相、LLM candidate-only、AUTO/MANUAL和ExecutionGraph→RuntimeFlow→BusinessFlow。无迁移或新依赖。C1引入的资格清单身份/状态契约是新增准备材料，C2扩展了collector从“自己启动helper”到“观察Node创建helper”的受控问题，故集中请求设计范围确认。

安全：只访问拥有的Node helper；失败不查找别的进程、不提高权限、不暴露Source/secret/环境；保持last-good与catalog拒绝。回退是停用新资格工具/探针并保留原始证据，不删除旧Fixture/收据、profile或DB，不恢复R4。

需要用户决策：是否批准推荐的分段方向，允许后续细化并实施C1的未执行清单校验，以及C2最多4个Node helper可行性场景？批准不涵盖产品捕获/transport hook、实际Native、任何校准/profile数字、新依赖、迁移或云端CI。若只批准C1，C2保持未执行；不会以替代broker悄悄继续。


## 用户批准补记 — 2026-10-23

用户已批准推荐分段方向并要求继续下一步。保留原方案和问题为历史，不再视为方向未定；本次下一步为writing-plans实施计划。沿用本会话顺序/inline，不新增会话/工作树。实施计划审阅通过后可在已批准C1/C2范围连续执行，不逐个测试或helper案例重新确认。没有授权实际Native、产品hook/broker、profile数字、依赖/迁移或CI。


## 具体计划补记 — 2026-10-23

[实施计划](../plans/2026-10-23-phase1-trusted-context-preparation.md)已形成并自审，待整体审阅。新增C0-byte细化来自只读证据：Phase1 raw py/java/jsonl在core.autocrlf=true下未固定转换策略；计划拟用只读filter对照及仅三条目标-text规则保护现有字节，不改Source/expected内容。该项随计划确认，尚未实施；原批准C1/C2方向不重新提问。


## Concrete plan approved and preparation executed — 2026-10-23

The user confirmed the written implementation plan. [Implementation author review](../reviews/2026-10-23-phase1-trusted-context-implementation-review.md) supersedes plan-pending language:C0-byte applied;C1 implementation/tests/independent Fixture present,with real file symlink EPERM as explicit OPEN validation gate;final340 PASS/1 TODO across18 files;C2 exactly4 one-shot owned helpers completed with verified closes/releases. Helper feasibility never qualifies actual Native or profile. All existing P1-04/05/phase exits,actual capture/stage/removal/Store/accounting gates remainOPEN;catalog0,cloud CI deferred,timeout UNKNOWN. [C3 preparation brief](2026-10-23-phase1-trusted-capture-next-design-brief.md) is not implementation/run authority. Four helper slots spent;no retry.
