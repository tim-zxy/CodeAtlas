# Phase1 A4 Bounded SourceState Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this same session, sequentially. Steps use checkbox syntax. 不新增代理/会话/工作树，不提交 Git。

**Goal:** 将 SourceState 的 SQL 交付与 Runtime Source 准备接入同一预算，保留 CAS、根身份和真实失败效果。

**Architecture:** 原 Store 的实例私有有界分支；原 Application 增加可选根约束；Runtime 一个私有入口在同一位置建立预算及 Store。沿用现有 Source、请求构造、settled-owner、Stage/Store，无通用执行框架。

**Tech Stack:** 现有 TypeScript、Node SQLite、现有测试工具；无新依赖/迁移/profile/默认数值。

**Spec:** [A4 详细设计](../specs/2026-10-29-phase1-bounded-source-state-design.md)。

状态：A4_BOUNDED_SOURCE_LOCAL_EXIT。用户已批准B1–B3，实施及适用本地验收完成，准确结果见文末。本包包含实现、范围内修复、最小验证、文档同步和作者评审；批准后无需逐任务再次确认。

## Global Constraints

- 实际工作树 C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；D 旧目录不迁移。保护全部现有脏文件/EOL/原始证据。
- 严格保留 AGENTS 不变量、A2 授权、原 SourceState/CAS/错误、R011 capture/Stage/Store 及旧费用路径。
- 无实际 Git/Native/helper/collector、校准/profile、新数值/依赖、云端 CI 或 Git 写入。组合测试仅进程内 double 与本地 SQLite。
- SQL 行/序列化显式输入，maxEvents 不等于 maxItems；新增私有入口不作为完整生产资源资格。
- 开发只跑定向测试；最后受影响门禁集中一次；新失败先诊断，不重试到绿。旧失败、TODO 不删不记通过。

## Review Focus

1. TEXT 在预算拒绝前已交付：B1 的数值查询拦截/超长 TEXT 断言证明没有后继 TEXT SELECT。
2. 同连接但预算/根来自另一操作：B1 关联负例及 B2 同根核验；拒绝后不进入 Source CAS。
3. CAS 内 load 被 ambient 拒绝或误回滚外部事务：B1 自有/外部事务和冲突恢复测试。
4. 历史费用重复导入、失败前缀被重置：B3 同账本组合、四维 exact/one-below 与失效 account。
5. 组件成功被当真实运行：B3 明确所有 spawn 为 double；无公开 route/profile 变化，状态只报 A4 本地退出。

## 文件与职责

产品：
- packages/storage/src/source-state/repository.ts：实例私有预算关联、固定 SQL numeric-before-TEXT、事务与错误保留。
- packages/storage/src/analysis/mixed-source-account.ts：仅在需要时增加真实 budget/account 关联断言；不重构账户 API。
- packages/application/src/mixed-source-workflow.ts：可选 expectedRepository 及 CAS 前/重查根核对。
- packages/runtime/src/mixed-source-preparation.ts：prepareBudgetedMixedSourceOperation 和全局预算 cap 接入，旧 default 不变。

测试/Fixture/注册：
- 新 packages/storage/test/bounded-source-state.test.mjs：独立费用、SQL 时序、CAS/恢复与旧状态语义。
- 新 packages/runtime/test/bounded-source-preparation.test.mjs：预算 cap/身份/授权/同账本，以及原固定链组合。
- packages/application/test/mixed-source-workflow.test.mjs：根不匹配拒绝在 CAS 前，旧未提供字段路径兼容。
- packages/runtime/test/mixed-source-preparation.test.mjs：复用原组合 fixture，至少 settled-owner 正向及提交前 Source 变化改用新私有入口；不复制完整测试框架。
- scripts/test-mixed-runtime-readiness.mjs：新模块各导入一次。
- fixtures/phase1/mixed-runtime-readiness/bounded-source-state/{cases.json,expected.json,README.md}；现有 fixture.json 增加对应引用。

文档：设计§7所列受影响权威、当前状态、本计划；一份本批 results.json。不要扩散历史全局计数修改。

## B1：有界 SourceState

**Consumes:** 原 RepositorySourceStateStore、HistoryReadBudget、真实 Source account、Repository。
**Produces:** 设计§2的 createBudgetedSourceStateStore；旧类/API 与错误保持。B2 使用此工厂。

- [x] 先冻结独立 cases/expected/费用模型与原行为收据。模型仅基于输入/SQL步骤，不导入新产品分支；保留原 fixture。
- [x] 写失败测试：不存在入口；超长 Unicode TEXT 必须拒绝于 TEXT SELECT 前；多行 rows/serialized/items/retention 四维 exact 与 one-below；数值预留前缀不可回退。
- [x] 写事务/语义测试：空状态、完整 load、null language、ambiguous worktree/commit、CAS 冲突、transition 拒绝、写入故障回滚；ambient transaction 不受影响；取消/deadline 不写入。
- [x] 实现实例私有分支与固定列 reader，复用原 parse/validate/replace；旧无绑定分支不改收费/SQL顺序。原 catch 仅对真实私有预算/控制错误保留类别。
- [x] 定向运行新 Storage 文件与原 source-state.test.mjs，修复原范围问题；不启动 Native。

## B2：预算与根衔接

**Consumes:** B1 工厂、原 Application prepareMixedSource、EffectiveConfig 的既有 RequestResourceBudget、显式 HistoryReadLimits/control。
**Produces:** 设计§2 prepareBudgetedMixedSourceOperation，返回原准备结果；B3 续接其 budget/account。

- [x] 测试先固定：非法/超 cap History limits 在 SQL/Source 前拒绝；rows/serialized 不从 global items/input 派生；deadline/输入 min 收敛与溢出拒绝；旧 default 保持。
- [x] Application 加可选 expectedRepository，测试 policy/request/repository ID 不一致、DB 根不匹配、Git 观察根不匹配；根不符时 replace 调用为零；旧未提供字段正向不变。
- [x] Runtime 在一个入口建立真实 prelude，绑定 B1 Store/expectedRepository，传原 Application；不接受替换 SourceState/rules/transport 的新注入口。
- [x] 定向运行新 Runtime 与 Application 对应文件；取消/超时及 SourceCommit UNKNOWN/COMMITTED 沿用已有测试，新增仅测改变的边界。

## B3：组合、验收与同步

**Consumes:** B2 结果 + A3 请求/settled-owner + 原 capture/Stage/Store。
**Produces:** A4_BOUNDED_SOURCE_LOCAL_EXIT 的可重现证据，或明确未通过项；不提升父任务/Phase1状态。

- [x] 将既有 settled-owner 正向/提交前变化路径切到 B2；initial capture 用当时 remaining，交由原 Stage 累计导入，不手动重复收费。保留旧路径测试作为兼容。
- [x] 证明 FULL 成功与既有删除 DELTA 仍通过；Source已提交而后继失败时 last-good Graph不变；同账户 SQL/Source/Stage 费用单调、终结失效。
- [x] 顺序构建 Storage → Application → Runtime：
  - node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
  - node node_modules/typescript/bin/tsc -p packages/application/tsconfig.json
  - node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
- [x] 集中一次：node --test --test-concurrency=1 scripts/test-mixed-runtime-readiness.mjs packages/storage/test/source-state.test.mjs（新模块由根入口发现，不再重复列入）。
- [x] 注册：node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs；架构：node scripts/check-architecture.mjs；仅改动文件格式。
- [x] 原 Stage333、Provider76 等产品未改，核对源码/输入/依赖适用性后复用上批结果，不机械重跑；若修改其产品或失败指向其行为，再扩大到相关门禁并说明原因。原 SourceState 由于实际修改必须 fresh。
- [x] 同步设计§7受影响文档，写一份命令/结果索引与简短 CURRENT_STATUS；保留失败和原始 oracle，不全仓封存，不相加重叠计数。
- [x] 作者按 Review Focus 检查实现、Fixture来源、预算/根时序与授权边界。作者评审不称独立评审。

## 合并审批项与后继

本次一次确认涵盖 B1–B3、设计中的四类新增私有契约、Fixture、测试注册、受影响文档与同范围修复。无实现中的常规选择需要再确认。

完整 Runtime 产品路由/生产预算配置/全链资源资格仍按设计§6集中准备，不在本包中藏入默认值、隐藏资格 flag 或实际运行。当前不请求批准未写出的 production schema 或未知 profile 数值。

## 作者自审（设计阶段）

- 三个任务输入输出一致；B2 建立一次真实预算，没有把旧 wrapper 再包一层建立第二账本。
- Store、Application、Runtime 改动分别针对已观察到的 .all、根绑定和显式预算缺口；没有新框架/公共接口。
- Fixture独立费用/事务恢复与真实 Graph 组件覆盖边界分开；未变 Stage/Provider 按适用性复用，修改 SourceState fresh 验证。
- 完整执行器未具备生产配置/路由/物理资格，明确 NOT_READY；不以此迫使另一个准备 token、collector 或假 profile 提前进入产品。
- 计划与设计一并呈现，仅等待一次实施确认；无独立代理、Native或CI动作。

## 实施结果与作者审查（2026-10-29）

用户已批准本包；B1–B3在本会话顺序完成，状态 **A4_BOUNDED_SOURCE_LOCAL_EXIT**。[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-bounded-source-state/results.json)。本节替代此前“未授权/待实施”快照，仅适用于本包本地范围。

交付四个产品模块：原 SourceStateStore 私有实例绑定与有界 SQL，真实 budget/account 关联；Application 可选 expectedRepository；Runtime 固定预算化准备入口。无新公开 package export、schema/迁移、YAML配置键、默认数值或依赖。旧 default 准备与公开 Store 仍保留。新入口没有授予运行/发布资格。

**费用与事务审查。** SQL先数值 UTF-8 encoding 检查，再 census/locator/TEXT，预付 rows/UTF-8 bytes/items/retention。独立模型不导入产品；原初稿漏掉独立 parsed 文件数组根，已先修正输入模型并复现RED，再补实现的一项费用。SQLite UTF-16 的“文”实测BLOB2字节与UTF-8的3字节不同，补数值encoding拒绝与RED→GREEN；这是保证原UTF-8费用契约的实现修复，不引入新的数值阈值。原模型、预期与冻结记录均保留。

Stage普通account拒绝外部事务，曾使A4自有短读事务在完整组合中失败。现由SourceState在BEGIN前和COMMIT后执行完整account检查，仅在它自己的同步事务闭包中使用相同budget/account的valid/signal/deadline检查；内部不运行Stage动作、不await。原Stage文件/普通checkpoint未修改；ambient事务拒绝和原费用保持。该修复落实获准的“自有/外部事务”区别，没有扩展进程/profile资格。

保留并修复：旧parser getter异常脱敏回归、读事务rollback失败覆盖原错误；两项均先复现RED。Runtime构建曾直接引用未依赖IR包，改用原Storage签名推导类型；不新增依赖。局部catch编辑遗漏/换行未命中的构建失败已保留，后续准确源文本修复；没有自动重试到绿。

**最终验证。**
- Storage/Application/Runtime本地构建通过；最后UTF-8 SQL修复后重新构建Storage，Application/Runtime源码、类型签名及输出保持此前最终构建。
- 最后组件与旧SourceState批次：196 tests / **195 PASS / 1 原C1 TODO / 0 fail/cancel/skip**。root包含新增18项Store、15项Runtime及2项Application控制；这些数量已含在196中，不另相加。
- 同一p1-mixed-runtime-readiness-v1：Fixture注册/manifest **35/35**，架构 **17项目**；最后SQL数值表达式/语料内容修正未改依赖边或注册清单，复用本批先前通过的这两个适用门禁。
- 十个改动代码/测试/模型文件范围格式通过；未改全仓EOL。
- FULL settled-owner 与提交前Source变化已改用新入口；OTHER-only删除DELTA同样使用新入口及remaining capture。原v2/v5传输、请求/owner、Stage/Store与SQLite为真实组件；Git/Native仅进程内double，不称实际Native E2E。Source已提交后的失败保留真实Source身份，last-good Graph保持。

**最小验证与复用。** 原Stage333、Provider76是历史组件证据，不冒称本轮fresh全回归。Stage/Provider产品及相关旧Fixture字节未改；Source account新增关联元数据与自有SQL控制，旧逻辑费用/ambient路径由本轮root中原账户测试覆盖。新SourceState/CAS已fresh。未跑完整Rust、旧崩溃workers、全仓verify、校准或实际Native；不移植旧物理资源profile到新候选。

**作者评审。** 按Review Focus检查了交付前拒绝、绑定根/ID、原CAS/错误/外部事务、失败费用前缀/同账本、组合与公开边界。未发现本包剩余阻断项。Ponytail检查保留固定模块内reader与原Store，未引入通用SQL框架、额外配置/策略插件/注入式执行器；未进行无关重构。按用户和本包约定仅作者评审，没有新增独立代理，亦不将作者评审称独立评审。

**仍开放。** 完整生产FULL/DELTA/NO_OP路由、SQL/events生产配置来源、全链资源目的/实际归因/资格及具体测量/profile；父任务仍4/21接受、17未关闭，P1-04/05和Phase1未完成。原C1 EPERM TODO、Native timeout UNKNOWN、C2 slots spent、main39708335128取消结算未查询/不重跑、R4 mutable限制不变。当前Git status因工作树元数据不可用，未修复或写Git；原文件副本/有限改动摘要保留。

下一步按统一策略合并准备生产路由、预算配置来源和完整资源资格设计；设计§6的未知配置/数值不从本次实施授权中推导。无真实Git/Native/helper/collector、CI或Git写入。
