# Phase1 A4：有界 SourceState 与 Runtime 预算衔接

2026-10-29。A4_BOUNDED_SOURCE_LOCAL_EXIT。与[合并任务包](../plans/2026-10-29-phase1-bounded-source-state.md)一次审查。本文件的A4范围已获用户批准并完成本地实现；§6生产缺口仍未获实施授权。

## 1. 核验结论与范围

当前已交付 SETTLED_JAVA_OWNER_LOCAL_EXIT；[上批结果](../../../.superpowers/sdd/2026-10-29-phase1-settled-java-owner/results.json)仍是原范围证据。设计准备时仅阅读源码和形成文档；实施结果见§8及任务包文末。

实码存在三个相连缺口：
- storage/src/source-state/repository.ts 的 load/findCommitRevisionId 使用 .all；Application 在 load 返回后 account.own(previous)，不能阻止此前的 SQL TEXT 交付或数组建立。
- Runtime 私有 mixed-source-preparation 接收 SourceStatePort，没有固定的同 DB、同预算 Store 构造；旧 Native SQL lifetime 是事后归因，不能替代前付预算。
- SQL 注册校验只确认 repository ID；Source 的 Git 根可能与调用者绑定的数据库根不同。必须在 Source CAS 前核对，不可等 Stage/Store 拒绝后才发现 Source 已写入。

可复用：原 SourceState 解析、状态校验、CAS/事务、revision transition；activation-history 和 repository-index-session 的 numeric-before-TEXT 模式；A2 原 Application/Source 安全与同账本续接；A3 请求与已结算 owner。无需新依赖、迁移、通用 SQL 框架或新配置版本。

本包交付有界 Source 准备，以及沿现有固定 v2/v5 → Stage → Store 组件链的组合验证；**不实现完整生产执行器**。完整调用链的剩余决策在§6统一列出，不能用私有组件退出冒称生产就绪。

## 2. 私有接口

### Storage

在既有 source-state/repository.ts 新增文件级函数，不从 source-state/index.ts 或 storage/index.ts 导出：

~~~ts
createBudgetedSourceStateStore(
  db: DatabaseSync,
  repository: Repository,
  budget: HistoryReadBudget,
  account: ReturnType<typeof borrowMixedSourceBudget>,
): RepositorySourceStateStore
~~~

返回原类实例；模块内 WeakMap 绑定该实例、准确连接、repository 和同一 budget/account。原公开构造与旧方法行为不变，无 ambient 全局开关，无调用者可伪造的 ownership token，不另写第二套 SourceState Store。account 必须是由该 budget 借出的真实 Source account；若现有私有模块不能直接证明关联，只增加一个内部关联断言，不接受鸭子类型作为证明。

有界实例的 load/findCommitRevisionId/replace 只允许绑定 repository ID。首次及后续注册核对读取 slot=1 的 id/root_path，与绑定 Repository 精确比较；沿用既有 index-session 精确根规则，不自行大小写折叠、realpath 放宽或修补注册记录。Repository.rootPath 由可信调用者提供已解析根，字符串存在不等于获得权限。工厂只建立关联，不执行 SQL；实际首次注册查询仍在 Application 授权之后。account 类型复用 mixed-source-account.ts 的返回类型，Storage 不新增对 Source/Application 的依赖。

### Application

MixedSourcePreparationInput 增加可选 expectedRepository: Repository，限私有准备接口。提供时：
1. 授权及 repo ID 一致性先于 SourceState 访问；
2. Source 观察完成后，observation.rootPath 必须精确等于 expectedRepository.rootPath；
3. 检查位于 reconcileObservedGitWorktree / replace 之前，重查 verifySelection 时仍核对同一根。

不提供该字段的旧 A2 路径保持原行为。新增安全错误使用既有 SOURCE_CHANGED（身份变化）和 INVALID_INPUT（请求身份不一致），不新增公开错误类别。旧 SourceState 错误类别保留；预算、取消、deadline 通过原私有错误模型传播，不被 load/replace 的通用 catch 改写为 SOURCE_STATE_INVALID/WRITE_FAILED。

### Runtime

在既有 mixed-source-preparation.ts 新增文件级 prepareBudgetedMixedSourceOperation，不从 Runtime index 导出；旧 default 函数保持兼容。

~~~ts
type BudgetedMixedSourceInput =
  Omit<MixedSourcePreparation, 'sourceState'> & {
    database: DatabaseSync;
    repository: Repository;
    operationBudget: EffectiveConfig['indexing']['resourceBudget'];
  };
~~~

其中 MixedSourcePreparation 指该文件现有输入类型（实现时可为其命名导出私有类型），不是返回类型。新函数产生与原 default 相同的准备结果/budget/account/effects/verifySelection：
- 在同一函数内建立一次 beginMixedSourceAccount，再创建绑定 Store，调用既有 Application 准备；不用旧 wrapper 再建立第二个账本。
- 传 expectedRepository；拒绝 ID 不一致、非法预算和 caller-owned transaction，早于 Source/SQL 交付。
- 同一 account/budget 返回给现有 Stage/Store；失败撤销 account；不新增关闭调用者 DB 的责任。
- 新私有函数不授予 INDEX/RAW 权限、运行资格或发布权；原 Application 授权全部保留。

## 3. 预算域与前付语义

所有数值均由既有调用者显式传入，无新增默认、profile 或测试数值门槛。

| 域 | 来源与约束 |
| --- | --- |
| SQL rows / serializedBytes | 显式 HistoryReadLimits.maxRows/maxSerializedBytes；不可从 maxItems、maxInputBytes 或 maxOutputBytes 推导 |
| 逻辑 items / depth / memory | 显式 HistoryReadLimits，分别不得超过 operationBudget.maxItems/maxDepth/maxMemoryBytes；沿原 twice-retention 规则 |
| Source 输入 / deadline | control 的显式值；运行采用 min(control.maxInputBytes, operationBudget.maxInputBytes) 和 min(control.deadlineEpochMs, 操作开始时刻 + maxDurationMs)，检查安全整数溢出 |
| 协议 events / buffers | 本包不生成 Native 预算；A3 现有显式输入保留，maxEvents 独立于 maxItems |
| 物理 HOST/子进程内存 | 本包没有测量或资格，不将逻辑字节视为 RSS |

operationBudget 来自已解析 EffectiveConfig，私有入口仍做一次结构/正整数有效性校验；普通可信内部数据不逐层复制。显式 HistoryReadLimits 超过对应全局 cap 时拒绝，不静默改写它们。SQL maxRows/maxSerializedBytes 的生产配置来源仍 OPEN；本包只固定显式私有来源及 cap 关系，不新增 YAML 键。

有界 SQL：
- 固定列清单与固定谓词参数化；numeric census/长度、locator、TEXT row 依次交付，复用现有 numeric-before-TEXT 做法，不导出通用 helper。
- 每次 numeric/locator/TEXT 读取前 checkpoint，并预付将要交付的行；未用预留保守保留，不在失败后归还预算。
- 在 TEXT 读取前以 SQLite length(CAST(column AS BLOB)) 计算原始 UTF-8 字节并预付 serializedBytes 与 pin；禁止先 .all 再计费，禁止用 JS UTF-16 length 代替。
- raw → parsed SourceFile/Revision、聚合数组和 validateState 所需独立副本，按固定字段投影在相应解析/复制前预留 items、depth 和保留字节；复用原校验。必须由独立输入模型给出费用，不能仅调用被测实现生成 expected。
- census 与实际交付处于同一读快照；独立 load/find 自有短读事务，replace 的内部 load 复用其自有 BEGIN IMMEDIATE。拒绝外部 ambient transaction；不在事务内 await。
- maxRows 是读取交付/预留域，不借本包重新定义为写入数。写入沿原 CAS/循环；输入、副本和已读 current 前付，循环逐次 checkpoint。写入耗时受协作 deadline 约束，不宣称可抢占正在执行的同步 SQLite 指令或 OS 内存硬限制。
- 有界错误使同一 Source account 不可再使用，失败计费前缀保留。事务回滚只处理本次拥有的事务，不能回滚 caller transaction。

账本衔接：Source SQL、观察、CAS 内重读、verifySelection 重读均使用同一对象。后继 initial capture 应使用当时 budget.remaining()；Stage 原适配负责导入 capture 累计 usage，不提前导入后再重复收费。现有 Stage setup/cleanup 预留契约保持。未采用预算化新入口的旧测试仅证明旧路径。

## 4. 错误、安全与恢复

- DB id/root 不匹配：在该准备入口实际 Source 访问之前拒绝，无 Source CAS；实际 Git 根不匹配：观察后、CAS 前拒绝。读取不等于授权，保留每文件 RAW 核验。
- read/预算/取消失败：无本次 Source 写入；replace 开始后的失败按既有 UNKNOWN/COMMITTED effects 如实返回，不将 UNKNOWN 擅改为已回滚。
- Source CAS 与 Graph Store 非同一跨资源事务；Source 已提交而 Native/Stage 失败时，保留 Source 真实身份和 last-good Graph。
- Store 前完整 verifySelection，验证成功后到同步 apply 间无额外 await/callback；仍不能声称文件系统和 SQLite 原子快照。
- 关闭 Stage、提交后清理失败及 inspectMixedAnalysisOutcome 沿原规则；不自动 reapply、repair 或重试。
- Canonical IR、SQLite authority、candidate-only、AUTO/MANUAL 及 ExecutionGraph → RuntimeFlow → BusinessFlow 不变，无 DEFERRED 能力。

## 5. Fixture、追踪与退出

使用既有 p1-mixed-runtime-readiness-v1，新增 bounded-source-state/cases.json、expected.json、README.md。独立 oracle：固定 SQL 列/UTF-8 文本、输入状态、明确的读取步骤与原始行为；冻结在实现前，不导入产品计数器生成 expected。仅在现有 fixture.json 增加必要引用，注册测试负责发现/唯一性，根入口增加一次新模块导入。

覆盖：空库/完整状态/Unicode/null language；多 worktree/重复 commit；绑定 ID/root 错；查询超长 TEXT 与多行；四维费用 exact/one-below；取消/deadline；ambient transaction；CAS 冲突/原 transition 拒绝/写入中断回滚；Source 已提交后的后继失败；Source 观察根不匹配；同账本 Stage 续接及提交前变更。旧行为收据与旧 fixture 原样保留，case 数是覆盖清单结果，不预造质量数值。

| 工作 | 权威与 Fixture | 验收 |
| --- | --- | --- |
| B1 Store 私有有界分支 | AGENTS、RUNTIME_CONFIGURATION SQL 前付、A2、原 SourceState/CAS；新增 bounded-source-state | 交付前拒绝、独立费用模型、旧 Store 兼容、事务恢复 |
| B2 Runtime/Application 衔接 | A2、R011 Stage、收敛策略；同 Fixture 的身份/预算场景 | 同 DB/同账本/同根，原授权和 effects 不变 |
| B3 既有固定链组合 | A3、settled-owner、Stage/Store | 真实本地 SQLite + 进程内 Git/Native double；FULL 与既有删除 DELTA，不冒称 Native E2E |

退出标记 A4_BOUNDED_SOURCE_LOCAL_EXIT；所有适用构建/测试/Fixture/架构/追踪完成后才使用。不关闭 P1-04/05 或 Phase1，父任务计数仍4/21。

## 6. 完整生产编排：统一列出尚缺的决策

推荐固定链：完整资格预检 → 显式预算和绑定 DB → 本包 Source → capture → 明确 FULL/DELTA 路由 → 已结算 Java → owner → v5 → 最终 metadata → freeze → Source 重查 → 同步 Store → 结算/关闭。

本次核验已把可复用组件与缺口分开；以下不是本包可擅定的配置或授权：
1. FULL/DELTA/NO_OP/失效历史恢复的产品路由及其他 provider 保留规则。Stage 明确拒绝 unchanged DELTA；不能捕获 INVALID_STAGE 后自行 full 回退或新建历史冒充 NO_OP。
2. SQL rows/serialized、Native maxEvents/transport 的生产显式配置来源与累计范围。EffectiveConfig 目前没有这些键，不能直接等同 maxItems。下一份生产接口 DCP 须同时给出配置 schema、调用方和资源费用依据。
3. 完整资源目的及实际进程生命周期/归因方案。SYNTAX_OBSERVATION 只覆盖观察；Git、Java、SQLite、HOST、关闭与 collector 成本尚无完整目的/资格。空 catalog 仍必须早于 Source/DB/binary/Native 副作用拒绝；本包不开放新公开路由。
4. 精确实际运行清单、测量产物、事后数值审批。旧 C2 slots 已用尽；不预批未知 profile，不增加 helper/debugger/collector。

这些剩余项集中形成后继生产设计/运行包，不按微步骤询问。真实测量与数值审查具有先后依赖，无法与本包一次签为空白授权。独立 B/C 任务可按总计划在具体包成熟时顺序准备，无需机械等待物理测量。

## 7. 设计阶段作者审查与治理（已获批准的原记录）

作者审查结论：有界分支与三层私有衔接可进入整包审批；完整生产执行器仍 NOT_READY。本轮未做独立代理评审。已剔除通用 SQL 框架、新 YAML/configVersion、公开 mixed route、新 token 层及全仓测试重构。

新增契约为绑定实例、前付/快照/错误传播及 expectedRepository；超出此前 A2/A3 批准，依据 AGENTS/IMPLEMENTATION_PROTOCOL 需一次集中确认。未发现需要改变 FROZEN Canonical/存储/public IPC 决策。批准实施时同步 DESIGN_AUTHORITY、RUNTIME_CONFIGURATION、PROVIDER_SPI、A2 附约、WORK_BREAKDOWN、PHASE_ACCEPTANCE、DESIGN_TRACEABILITY、ADR-020 的适用性说明；不把提案提前写成已接受。

本轮只读输入摘要及文档检查见[设计结果索引](../../../.superpowers/sdd/2026-10-29-phase1-bounded-source-state-design/results.json)。历史 timeout UNKNOWN、C1 EPERM TODO、C2 spent、main CI 取消结算未查、R4 mutable 限制原样保持。

## 8. 实施附记

B1–B3与[作者审查](../plans/2026-10-29-phase1-bounded-source-state.md#实施结果与作者审查2026-10-29)已完成。每次注册核验先支付一行numeric encoding检查，仅接受UTF-8，使BLOB长度等于本契约UTF-8交付字节。parsed文件数组根单独前付一项；独立模型的原草稿/修订全部保留。

自有同步SQL闭包在BEGIN前/COMMIT后检查完整account，内部仅调用私有checkpointOwnedSourceSql检查真实关联、valid/signal/deadline；不调用Stage动作、不await、不改变原Stage对ambient transaction的拒绝。该内部函数不经package index导出。Runtime的Repository类型从Storage签名推导，保留原依赖边。

本包解决私有入口的显式预算来源/cap与SQL前付，不把生产配置来源或全链物理资格标为已完成。
