## 协议门禁续接通过 — 2026-10-29

当前结论更新为 **AR_LOCAL_COMPONENTS_VERIFIED_OS_GAP_OPEN**。针对文件映射占用状态变化的一次protocol::复验18/18通过，36项非目标测试未运行；此前链接失败仍保留且根因UNKNOWN。原本地组件107 PASS/1 TODO、Stage333、纯IPC176、注册360、库29等按2,932项相关身份一致性复用，不重新执行。C1 TODO和实际运行/资源资格依然OPEN；下文V1“最终门禁OPEN”是本次补齐前的历史结论，不再作为当前阻塞。准确命令/结果及复用范围见[续接结果索引](../../../.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness/continuation-results.json)，未新增独立评审。

# Phase1 A-runtime T1–T6 作者实施评审

2026-10-29。用户已批准附约 D1–D4 与 T1–T6 顺序实施。当前状态 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**：本地产品及注册已实现，Rust protocol 最终复验受链接失败阻断，不能签收完整 AR-LOCAL。本文是作者审查，未新增代理或独立复审；不能代替独立评审。

证据根：`.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。原始命令、stdout/stderr、退出码、RED、历史失败和 before 原字节均保留。以本节和最终 evidence-index.json 为当前结论，旧阶段性 GREEN 不是最终全包通过。

## 交付及任务状态

| 任务 | 已实现/证据 | 当前状态 |
| --- | --- | --- |
| T1 独立语料 | p1-mixed-runtime-readiness-v1，12文件，88 Source字节，产品修改前冻结 SHA | 本地完成；原 Fixture 不改 |
| T2 Source | 复用 fingerprint 核心；清单全成员、hash/对象/祖先检查；逻辑删除不读磁盘；每次 read 前预付 | 20 PASS、1 TODO（实际文件 symlink EPERM）；仅证明给定清单，不证明扫描全集/Python分类 |
| T3 Stage | 原 WeakMap 同账本/累计 input；重复借用只收紧；取消/截止/失败失效；真实隔离 SQLite Store 导入及 cleanup | 16/16；旧 Stage 333/333 |
| T4 v5 / raw | CLI分发代码/既有 producer 复用；原始流独占、owned buffer；旧公开结果不变 | raw 40/40；库29/29；protocol 最终链接失败 OPEN |
| T5 lifecycle | spawn 后准备、准备前零业务 stdin；close/管道结算后 afterClose/dispose；失败优先级 | 固定进程 double 21/21；无实际 Native/collector 证明 |
| T6 门禁/治理 | 单 Fixture/root注册、8精确守卫、架构/类型/构建/追踪、原字节与继任摘要 | 已整理；因 T4 最终门禁未通过，整个批次验收仍 OPEN |

## 最终可复现检查

准确命令与环境记录在各 *.run.json；不把不同尝试重复计入通过数。

- Source/Storage构建、IR类型：final-local-attempt1（退出0）；Providers/Application/Runtime修复后构建：attempt2（退出0）。
- 新root + raw + Runtime准入：attempt5 local-components，108项，107 PASS / 0 FAIL / 1 TODO。root含Source21、Storage16、private-client21；raw40、准入10。TODO不可计PASS。
- registry/manifest/workspace/architecture-rules/8精确守卫：attempt3，360/360。
- 纯IPC兼容6文件：attempt3，176/176；旧Source指定失败语义：1/1，其余未选择案例不计通过。
- Stage root：attempt3，333/333。未修改 Store 事务/SQL，不重跑19个旧崩溃进程；前次证据只按原适用范围保留。
- architecture：17项目通过；精确范围 Prettier / Rustfmt：attempt4通过。
- Rust指定库：attempt4，code_syntax_producer_unit 15、code_syntax_request 7、syntax_dispatch_unit 7，共29/29；仅库测试，不是 Native CLI。
- protocol 内部18项在 T4阶段已有 GREEN 原始日志 t4-protocol-green.log；最终格式化后复验 attempt3 在 link.exe LNK1104 失败，未执行测试。一次独立target离线锁定对照 attempt5 在依赖构建脚本链接 LNK1105/1224失败，亦未执行协议测试。最终 protocol 门禁不能记通过，也不能把旧18项冒称当前复验。
- 无额外 Native、acquisition helper、collector/model、profile数值、新依赖、CI或Git写入。已有 G13 注册测试会启动 Node 模块隔离子进程；不据此声称整批零OS进程，亦不计C2 probe生命周期。

## 作者审查与已修复发现

五项 Review Focus 均检查：读取预付与非零账本、读取期间命名/祖先替换、准备期间取消/退出、原字节保持、旧协议/空catalog拒绝。可调用业务 RED 与门禁失败保存在证据根。

1. 请求在快照复制后才比较 caller 限额：改为 intrinsic byteLength 预检；负例证明不先复制。
2. Proxy arguments 数组可能触发 trap：拒绝非普通稠密数组；负例 trap 不调用。
3. Source parsed 元数据副本漏计：解析前按同一已验证 recipe 预付两份表示，非从新 usage 回填 golden。
4. Stage account 允许 caller-owned transaction：共享 alive 拒绝 ambient BEGIN 并失效，不回滚 caller 事务。
5. private aliases 经旧 export-star 泄漏：保留 public index，不新增 named exports；aliases 只作为 native-client 默认私有对象成员，lifecycle 类型模块内。客户端直接引用 default owner，避免 TS4023；公开负控和原 inventory 门禁通过。
6. 注册历史重建两处仍止于旧61/35：保持原16/21替换计数和旧文件 SHA，准确映射62/36；自冻结继任独立保存6处 selfPatches 后整文件比较，不删摘要/不放宽 allowlist。

未发现需要再扩范围的已复现代码缺陷。此结论仅作者范围，不能抹去下面未完成门禁。

## 原始证据保护与范围

基线10315项全部存在；旧 Fixture/失败/历史 .superpowers 不改。该前任摘要未覆盖 packages/source，不能称为整仓覆盖；Source fingerprint.ts 原始内容在本包 before 单独保存，继任摘要补纳 Source src/test/dist 与配置。所有既有文档保留修改前原字节，当前补记追加在原正文前，不丢弃旧状态。新独立12文件 Fixture 与 prefreeze 完全相同。

本批次不改迁移、SQL、依赖锁定、public index、DESCRIBE、catalog或旧 Fixture expected。registry实际62、Phase1 36、catalog0；这些是结构计数，不是新的质量阈值。

## 未完成、限制与下一批次

- V1：当前 Rust protocol 最终门禁 OPEN。原target缺失目标EXE，无匹配运行进程；C盘约29GB可用；未检索到匹配Defender事件。独立target也链接失败，确切根因仍 UNKNOWN。未杀进程、删产物、改安全策略、自动重试或称 flaky/已修复。环境原因查明/可构建后，运行原内部 protocol:: 命令一次并保留结果，再签收AR-LOCAL；无需因此重跑Stage/完整回归。
- V2：真实文件symlink测试 EPERM TODO，C1 OPEN；hardlink/目录junction及其他拥有文件控制通过不代替该分支。
- V3：lifecycle是受信协作接口；beforeInput与回收回调必须响应同一取消信号，当前double不证明任意不响应回调可强行终止、Windows句柄/kill或RSS资格。
- Source选择范围重扫/Python分类、真实Java+v5全链、准确资源目的/component结构、采集器归因、独立oracle/holdout与集成CI仍需后续具体包。下份运行包当前 **NOT_READY**，缺失项见附约§8；不编造命令次数、构建hash或profile值。
- 历史 Native timeout UNKNOWN；C2四生命周期spent；main39708335128取消结算未查、不重跑；R4 post-trial DB非pristine，不恢复/复用。生产空catalog继续前置拒绝。
- H5/P1-04/05/Phase1仍OPEN；主任务4/21接受、17未关闭。Canonical IR、SQLite权威、LLM candidate-only、AUTO/MANUAL及ExecutionGraph→RuntimeFlow→BusinessFlow边界保持。
