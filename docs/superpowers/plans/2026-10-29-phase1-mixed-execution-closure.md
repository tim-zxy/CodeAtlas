# Phase1 A5 Fixed Mixed Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this same session, sequentially. Steps use checkbox syntax. 不新增代理、会话、工作树或Git提交。

**Goal:** 将已完成的A2–A4串成一个固定私有执行组件，统一显式配置、NO_OP、空FULL和真实提交结算。

**Architecture:** 新配置解析器与固定Runtime调用者，复用原Source/请求/client/Stage/Store；Stage/Store仅追加两个文件级只读视图，不新建捕获/预算框架。公开产品混合路由继续受尚未完成的完整资源资格阻断。

**Tech Stack:** 现有TypeScript/Node/SQLite及测试工具；无新依赖、迁移、Rust/wire变更、默认数值或profile。

**Spec:** [A5设计](../specs/2026-10-29-phase1-mixed-execution-design.md)。

状态A5_FIXED_EXECUTION_LOCAL_EXIT；用户已批准T1–T4，完整实际运行包NOT_READY。本计划一次确认T1–T4及范围内修复，不逐任务确认。

## Global Constraints

- 指定C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas，D旧目录不覆盖。保护现有文件/EOL/所有原证据；Git状态当前不可用，不修复metadata。
- Canonical IR provider-independent；SQLite authoritative；candidate-only；AUTO/MANUAL；ExecutionGraph → RuntimeFlow → BusinessFlow；DEFERRED不提前。
- 新provider configurationSchemaVersion=2只用于显式MIXED_CODE_SYNTAX_V1；顶层configVersion1和旧Java/v3路径不改。
- 不执行真实Git/Native/helper/collector、校准/profile、新数值/依赖、云端CI或Git写入。
- 配置/host逻辑费用/Native visitor/events/物理RSS不同域；未测量不记0，无空catalog/testflag绕过。
- 按风险最小验证：开发定向，结束合并；新增失败保留并诊断，原范围统一修复；不为文档/收据重跑测试。

## Review Focus

1. 把items当events或rows：T1独立来源/越界控制，原Syntax ticks与Host逻辑ledger分开。
2. 捕获后数据库/Source变化被误判NO_OP：T2/T3两次Stage读集校验、Source重查与并发变化负例。
3. 空FULL被误当缺流或删除DELTA：T2严格重用原empty v5完整流和唯一python descriptor；DELTA仍不发空请求。
4. COMMITTED后cleanup失败被说回滚：T2真实Store本地receipt，T3端到端错误effects，不自动fresh恢复重置预算。
5. 任意caller raw/qualificationRef解锁生产：T3无raw/transport注入口、无public export、实际profile/进程仍OPEN。

## 文件与接口

产品：
- 新 packages/runtime/src/mixed-execution-config.ts：resolveMixedExecutionConfig(EffectiveConfig)，设计§3唯一配置来源和固定域映射，导出仅供文件级内部引用。
- 新 packages/runtime/src/mixed-execution.ts：default runMixedExecution(input)，设计§5固定顺序、成功/失败effects。
- packages/runtime/src/mixed-request-preparation.ts：仅空FULL与python descriptor选择；保留所有非空/DELTA路径。
- packages/storage/src/analysis/mixed-analysis-stage.ts：追加readMixedNoOpBasis(stage, contracts)，复用原readPreparation/checkStageContext。
- packages/storage/src/analysis/mixed-analysis-store.ts：追加readMixedAnalysisSettlement(store)，原WeakMap固定字段，无SQL/恢复/写入。

测试/Fixture：
- 新 packages/runtime/test/mixed-execution-config.test.mjs：配置域/版本/无默认与旧EffectiveConfig兼容。
- 新 packages/runtime/test/mixed-execution.test.mjs：固定调用者整链。
- 新 packages/storage/test/mixed-execution-views.test.mjs：两个只读视图的真实handle/费用/结算。
- packages/runtime/test/mixed-request-preparation.test.mjs：空FULL正/负例，既有非空/DELTA兼容。
- scripts/test-mixed-runtime-readiness.mjs：新三文件各注册一次，根入口不重复导入。
- fixtures/phase1/mixed-runtime-readiness/mixed-execution/{cases.json,expected.json,README.md}；原fixture.json增加对应引用，不新建全局计数守卫。

文档：当前设计/本计划、CURRENT_STATUS、总执行计划、ADR-020、DESIGN_AUTHORITY、Runtime/Provider规范、R011 Stage附约、WBS/Acceptance/Trace。仅更新受影响部分，结果索引一份。

## T1：显式配置

**Consumes:** 已解析EffectiveConfig及原NativeClient hard caps。
**Produces:** resolveMixedExecutionConfig，source、HistoryReadLimits、operationBudget、native events/transport；字段按设计§3，无任何profile或运行授权对象。

- [x] 先冻结配置真值表与独立预期，使用既有测试允许量，不新增默认/阈值。
- [x] RED：缺失/重复/disabled native、错version/kind、缺字段/未知字段、非法数字、transport超过原hard/global cap；rows/events与items不能互换。
- [x] 实现纯解析器，复用已有strict/budget检查；路径规则交既有Application/Source解释，Runtime不直接依赖Source；不改EffectiveConfig通用provider解析及旧config。
- [x] 定向验证新文件与原effective-config.test.mjs。相同字段输入不得生成隐式默认或caller资格。

## T2：空FULL、NO_OP和结算视图

**Consumes:** 原Stage读集/只读prepare、原Store receipt、原empty Fixture与A3构造器。
**Produces:** 设计§4 readMixedNoOpBasis、§6 readMixedAnalysisSettlement，以及合法空FULL请求。T3固定使用，无注入替代。

- [x] 新Fixture expected先来自原empty/python/java/mixed Composer参考和人工路由表；expected不从产品自生成。冻结旧参考摘要及新数据。
- [x] RED：原构造器空FULL拒绝；缺/重复python descriptor仍拒绝；DELTA空requiredUnits仍null。
- [x] RED：NO_OP仅PREPARING/DELTA/真实Stage；inventory/contract/locator/basis变化不能返回旧basis，stale/cross-handle仍原拒绝，读集费用exact/one-below复用原输入模型及新投影确定费用。
- [x] RED：Store receipt不存在为null；真实COMMITTED/NOT_COMMITTED/UNKNOWN/cleanup failure映射；getter不执行SQL、不返回manifest，不伪称fresh状态。
- [x] 最小实现两个视图与空FULL构造；不更改Stage既有prepareScope、Store交易/rollback/close，也不删除旧unchanged DELTA拒绝。
- [x] 定向运行新views与原请求测试。原Stage/Store方法未改时，不机械启动333/288/旧19崩溃workers；若确需修改原算法或成本，先记录具体影响，再跑对应已有门禁。

## T3：固定执行器

**Consumes:** T1配置、A4准备结果、T2视图、A3构造、settled-owner、原v2/v5 client、原Stage/Store。
**Produces:** 设计§5/6规定的私有结果与错误effects；不导出公开Runtime入口。

- [x] RED：固定调用者不存在，禁止caller raw/events/candidate/transport/store factory输入；无新增public export。
- [x] 按原独立参考实现进程内Git/Native doubles：真实Source文件/SQLite、真实请求构造/解码/owner/candidate/lease/Store。动态ID/时间只做明确身份重绑和真实时序断言，不用产品输出作为golden。
- [x] 实现单一deadline、一次A4预算、remaining capture/Stage导入、NO_OP两次校验、v2结算后owner、v5后最终时间、Source重查紧接同步apply。
- [x] 正向：空FULL/仅OTHER/Python/Java/mixed；INCREMENTAL unchanged与删除ONLY、Python局部和Java全组。NO_OP历史/Graph表不变，Source effects真实。
- [x] 负向：历史缺失full-required、其他provider变化、合同/分类变化、Source变化、取消/超时/错误/晚到流。禁止自动full回退或reapply。
- [x] 真实SQLite故障：COMMIT结果未知、提交后关闭失败、原last-good保持；读取本地receipt报告真实身份。fresh只读恢复不在本操作中偷偷执行。
- [x] 定向修复与验证；不添加Native实际测量、额外Node collector或profile matcher。

## T4：合并验收、作者评审与追踪

**Consumes:** T1–T3和既有基线证据。
**Produces:** A5_FIXED_EXECUTION_LOCAL_EXIT或如实未通过项；不关闭父任务/Phase1。

- [x] 顺序构建Storage→Runtime（只有依赖/声明实际改变时补建Application/Providers；不扩大完整workspace构建）。
- [x] 一次组件根：node --test --test-concurrency=1 scripts/test-mixed-runtime-readiness.mjs packages/runtime/test/effective-config.test.mjs。新三文件由根入口发现，不重复列入。
- [x] node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs；node scripts/check-architecture.mjs；只检查/格式化本包改动文件。
- [x] 核对未变旧Stage/Store/Provider/IR/wire和参考语料适用性；原崩溃/Native/Rust长批不重跑。若实现改变原行为则扩大到相应既有门禁，不豁免必需门禁。
- [x] 作者按Review Focus检查；修复原范围问题，保留RED、失败与独立oracle。无新增代理，不称独立评审。
- [x] 同步权威/验收/trace及CURRENT_STATUS，一份results入口；生产资格仍NOT_READY，保持C1/timeout UNKNOWN/C2spent/main取消未查/R4限制和父任务4/21。

## 批次依赖与真正可独立部分

T1纯配置与T2视图/空FULL可各自测试和拒绝，逻辑上独立；按用户偏好仍顺序执行。T3依赖两者；T4依赖T3。不得把真实资源测量排进这个本地包并行执行。

## 集中审批边界与后继

一次批准覆盖设计§2–6、T1–T4、本地Fixture/范围修复/文档；不覆盖§7尚未完成的物理用途/collector/profile/实际运行或公开混合路由。因新配置、NO_OP与结算/执行契约超出A4，须本次治理批准。批准后不再分方向/细化/微任务确认。

后继实际运行设计必须给出真实进程获取/采集方法、准确源/构建/工具/输入/环境/命令/次数/ownership/失败停止清单；短Git生命周期缺口必须有具体可检验答案。测量后才有具体数值审批，不能把本包范围“合并”成未知授权。

## 作者设计自审

类型来源沿既有依赖边；两个视图为真实Stage/Store的私有只读投影；已有empty v5是独立正例；旧FULL/DELTA门禁及counter不删改。NO_OP复用Stage吸收capture费用，不另造贷记系统。所有关键新增失败均分配至T1–T3。资源义务与未解决算法分开记录，不提供假profile、假精确运行清单或全Phase1完成声明。仅作者审查，无新独立代理。

## 实施结果与作者审查（2026-10-29）

获批T1–T4全部本地完成。唯一[结果索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-execution/results.json)包含准确命令/时间/退出码、保留失败、范围核对和适用性；最新组件272项，271 PASS/1原C1 TODO/0fail；注册35/35、Storage/Runtime构建、架构17项目及范围格式通过。旧Stage/Store方法体与原参考语料保持，append-only视图/新调用者已在真实SQLite和进程内Git/Native doubles下验证；不重跑未变的完整Stage/Store/崩溃workers/Native批。

| 任务 | fresh验收及追踪 |
| --- | --- |
| T1 | mixed-execution-config.test.mjs 16项；旧effective-config 15项兼容。SQL/events/items独立来源、strict字段和原hard/global cap，无新默认或资格 |
| T2 | mixed-execution-views.test.mjs 12项：真实Stage/capture/NO_OP、readset拒绝、结算只读；新增history identity前缀exact/one-below按UTF-8常量独立计算。原readPreparation费用模型复用，不声称重新校准整段历史。原请求文件增3项空FULL控制，旧14项保持 |
| T3 | mixed-execution.test.mjs 34项：5类FULL、NO_OP、缺历史拒绝、删除ONLY、Python局部/Java组、OTHER-only拒绝、合同重验、并发读集、源变化/取消/超时/错误及晚到流、last-good、真实SQLite结算、拒绝caller成功数据和未知异常 |
| T4 | root单次发现新三文件，Fixture manifest两引用；上列最终构建/注册/架构/格式和CURRENT_STATUS/权威/验收/trace同步；父任务不关闭 |

作者按Review Focus检查：配置不混域；NO_OP前后Source/readset真实重查且不造owner/history；空FULL重用唯一Python descriptor与完整空流；Store本地receipt没有SQL或fresh恢复；公开Runtime无export。原其他provider/分类门禁沿未变Stage/History规则，既有boundary/refusal证据继续适用，不把provider版本损坏控制冒称全套foreign-provider fresh验证。无迁移/新依赖/数值或DEFERRED能力。

作者修复：初始固定执行器会对Store清理失败重复close、吞掉NO_OP close失败；相应新矩阵先RED再通过。最后发现falsey未知异常丢失effects，author-unknown-red→green 1/1，author-final-components 271 PASS/1原TODO。最终仅作者审查，遵守本包不新增代理，**不是独立评审**。

语料/失败诊断：初次T3误用直接路径读压缩参考，改用已有校验loader后获得有效missing-executor RED；Java-only子流从混合参考投影时保留原NOT_APPLICABLE终态；测试可变状态统一放shared state。合同变化按既有规则重验，不要求无依据FULL；OTHER-only仍FULL_ANALYSIS_REQUIRED。以上是实现/测试缺陷修正，没有更改获批设计或降低门禁。initial freeze保留；expected.json仅格式改变，cases/README原摘要保持。事实来自独立旧语料，仅重绑动态身份/时间、选择请求子集并按协议重封，未用产品结果学习golden。

完整真实资源资格和公开路由NOT_READY，A5本地完成不等于P1-04/05或Phase1完成。下一步形成A5§7的具体采集方案/准确执行清单；未经确认不测量、不复用C2/R4、不设置profile、不启动云端CI或Git写入。
