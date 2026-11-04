# Phase1 A3 Mixed Request Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline and sequentially in the current session. Steps use checkbox tracking. No new agents, sessions or worktrees.

**Goal:** 将已认证 Stage 范围/owner 接入固定 v2/v5 请求构造，替换局部组合测试的手写请求衔接。

**Architecture:** 两个 Stage 私有投影读取实际 capture/owner 并累计收费；Runtime 复用已有 schema、locator 和 owner-map 编码构造请求。用原独立 raw 与固定进程 double 接通现有 Source/Stage/Store，不新增通用 executor，不开放生产路由。

**Tech Stack:** 现有 TypeScript、Node24.15.0 node:test/node:sqlite、Zod及项目预算工具；无新依赖。

**Spec:** [A3设计](../specs/2026-10-29-phase1-mixed-request-preparation-design.md)。

状态：A3_LOCAL_REQUEST_PREPARATION_EXIT，2026-10-29。用户已批准整包并完成T1–T3本地组件交付；范围和新鲜验证见文末实施结果。

## Global Constraints

- 实际工作目录 C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；D:/workspace/CodeAtlas不是当前Phase1交付树。
- 本会话顺序、最小范围验证、已批准范围修复连续处理；不另建索引、工作树或代理。
- 无真实Git/Native/collector/helper、校准/profile/新数值/依赖、云端CI或Git写入；原C2 slots不复用。
- 沿用Stage/Store原身份、预算/失败前缀、cleanup和提交后恢复；不改旧成功成本、golden或公开API。
- 不把 maxItems/maxEvents/SQL rows、逻辑bytes和物理RSS混同，不填默认门槛。
- 设计§4的实际运行清单NOT_READY，产品catalog仍空；父任务和Phase1退出保持OPEN。

## Review Focus

- Java全集和v5观察子集必须分清；零required Java、删除-only与NO_OP不能误走Native（T1/T2/T3）。
- 非ASCII路径/相同repoID不同root必须保留locator身份，不能只比较ID（T2/T3）。
- 投影之后Stage变更/关闭，不得把数据快照变成活lease（T1/T3）。
- 新增读取/编码的失败前缀和Store累计必须属于同一个真实预算，不接受caller统计（T1/T2/T3）。
- Oracle只来自独立literal/既有参考；动态身份适配不能反向生成expected（T1/T3）。

## 文件与职责

产品范围：
1. 修改 packages/storage/src/analysis/mixed-analysis-stage.ts：两个文件级投影及复用原contracts解析；不动prepareScope算法。
2. 修改 packages/runtime/src/mixed-analysis-validation.ts：只提取原locator算法供同包构造器复用，旧校验和成本保持。
3. 新增 packages/runtime/src/mixed-request-preparation.ts：私有default双构造器，接口见设计§2。

测试/Fixture范围：
- 新增 packages/storage/test/mixed-observation-preparation.test.mjs。
- 新增 packages/runtime/test/mixed-request-preparation.test.mjs。
- 修改 packages/runtime/test/mixed-source-preparation.test.mjs，增加整合用例；原A2正向/负例保留。
- 修改 scripts/test-mixed-runtime-readiness.mjs，只导入两个新测试一次。
- fixtures/phase1/mixed-runtime-readiness/request-preparation/{cases.json,expected.json,README.md}；现有fixture.json只加引用。
- 复用 stage-observation-independent 与原 Java/Python composition 参考，不改旧根/raw/oracle；fixture registry62/Phase1 36应保持。

文档范围：本spec/plan、CURRENT_STATUS、DESIGN_AUTHORITY、WBS/PHASE_ACCEPTANCE/DESIGN_TRACEABILITY、ADR-020、PROVIDER_SPI/NATIVE_IPC、R011 Stage契约及unified-next-delivery的受影响链接/短补记；不是每份历史文档复制正文。无迁移/manifest checksum改动。

## T1：Stage投影与独立reference

**Interfaces:** readMixedJavaPreparation(stage,contracts) 和 readMixedCodeSyntaxPreparation(stage,ownerHandle)，字段/状态/费用严格按设计§1。复用prepareScope、checkStageContext、Stage的HistoryReadBudget。

- [x] 保存三个目标产品文件和现有Manifest原字节到本包before目录；记录所复用旧Fixture摘要。只保存受影响文件，不封存全仓。
- [x] 先写cases/expected/说明：独立列Java/Python集合、移除投影、owner tuple及locator来源；冻结新增三文件和旧Manifest，才开始产品改动。
- [x] 写失败测试：FULL混合/仅Python；DELTA仅Python变更无需Java/Java变更需完整组；Java/Python/OTHER删除投影；跨Stage/close/ambient transaction拒绝；重复读取累计、超限前拒绝/失败前缀；快照外部修改不影响Stage。
- [x] 单独运行新增Storage文件，确认因接口缺失失败，而非loader/fixture错误。
- [x] 实现最小投影；contracts解析若提取，旧prepareOwner继续同次数/同顺序收费。禁止改变prepareScope的NO_OP/回退语义。
- [x] Storage构建后定向重跑新文件；确认新测试通过且原expected不变。T1验收=上述行为+同账本+旧成本兼容，非生产资格。

## T2：Runtime v2/v5构造与locator复用

**Interfaces:** prepareMixedJavaRequest(input,budget) → NativeAnalyzeRequestV2|null；prepareMixedCodeSyntaxRequest(input,budget) → Buffer|null。准确input取设计§2的既有schema字段，不增加默认预算/公开参数或caller override身份。

- [x] 写失败测试：完整Java组、无需Java返回null；FULL null old-basis/DELTA真实old-basis；完整inventory与观察子集区分；动态/Unicode owner tuple；删除-only null；maxEvents与maxItems独立；错误root/target/revision/超限拒绝。
- [x] 保留错误root、ownerMapDigest和raw字节的独立expected；不调用新构造器生成expected。
- [x] 运行新Runtime文件得到接口缺失RED。
- [x] 提取原checkLocator内共享核心，保持旧调用账本语义；新增构造器使用原schema/owner-map/encodeHistoryValue，在分配前收费。
- [x] Runtime构建，定向新文件GREEN；不调用真实transport或catalog测试绕过。
- [x] 构造器无Source/DB/spawn/Store副作用，输入内部typed数据不增加重复防御框架。

## T3：局部整合、集中验收与追踪

**Dependencies:** T1/T2。不新增产品executor，测试固定调用已有实现。

- [x] 新增Source→capture→Java projection/v2→owner→v5 projection/request→原raw client→Stage→verifySelection→Store组合；使用原独立Java/Python raw和固定in-process child。
- [x] 覆盖实际整合风险：Source全集变化/授权拒绝阻止apply、错误owner/旧stage拒绝、删除-only不spawn、原进程失败不apply；预算非零前缀在Store仍可见。现有相同底层失败不机械复制。
- [x] 先确认缺少衔接的RED，再接入T1/T2；原A2测试保持。只使用本测试拥有临时文件/SQLite，关闭后按已验证根内路径清理，不碰证据或用户DB。
- [x] 开发中仅跑新/直接受影响文件；最终按下面清单一次集中验收，失败保留并按假设修复，不自动重试到绿。
- [x] 同步受影响权威与accepted附约链接；本plan内作者自审说明接口/状态/预算/Oracle/资格边界，不另加重复review文档。
- [x] 一个results.json记录命令、退出、范围、原始失败、复用适用性和OPEN项；CURRENT_STATUS短更新。无新整仓seal。

## 最小验证清单与命令

以 D:/Program Files/nodejs/node.exe 执行；命令在实际C目录，顺序、无并发长测。下列测试仅Node runner及拥有SQLite/文件/固定double；不是额外acquisition helper或Native。运行前若发现文件实际新建OS子进程，暂停该项明确范围，不扩大授权。

1. Storage/Runtime各一次最终构建：
   node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
   node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
2. 当前root一次：
   node --test --test-concurrency=1 scripts/test-mixed-runtime-readiness.mjs
   包含原A2和本包两个新文件，既有C1 TODO如实保留。
3. Stage333 root一次：
   node --test --test-concurrency=1 scripts/test-mixed-analysis-stage.mjs
   原Stage被修改，旧精确预算/生命周期门禁须fresh。若T1无改成本也不能仅靠新例签收旧行为。
4. 现有注册/Manifest两个文件与架构：
   node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs
   node scripts/check-architecture.mjs
5. 对实际改动代码/测试执行本地Prettier --check；不格式化全仓、旧Fixture或EOL。
6. 上述Stage root已导入 packages/runtime/test/mixed-analysis.test.mjs 和 mixed-analysis-validation.test.mjs，覆盖locator原调用；不另重复运行这两份。新增两个文件只在readiness root导入，不加入旧333 root，避免重复。

复用：Source已完成A2、Providers/Rust协议及Store事务/只读恢复结果，仅在相应产品/输入/依赖/环境仍适用时引用；不重跑全仓verify、校准、旧19崩溃worker、CI。资源profile准确构建绑定，不能由本复用规则移植。

## 追踪矩阵

| 任务 | 设计依据 | 独立Fixture/既有证据 | 可验证退出 |
| --- | --- | --- | --- |
| T1 | 本spec§1、Stage契约、ADR020 | request-preparation；原Stage corpus | 真实范围/owner/移除投影；状态与累计；旧Stage成本不变 |
| T2 | 本spec§2、NativeIPC/Provider | 原v2/v5严格字节、locator/owner独立expected | 正确request/null；身份一致；预付；无新副作用 |
| T3 | 本spec§3/5、A2、Security | 原Source/Stage/Store参考＋新增组合 | 同预算到Store，全集重查/失败不apply；注册/架构/追踪通过 |
| 后续资格 | 本spec§4、EVALUATION、Runtime§8 | 真实进程/峰值/完整oracle仍缺 | 本包不签收、不执行，不填未知值 |

## 作者设计审查与集中批准

已核对Stage实际prepareScope/prepareOwner/acceptObservation/freeze以及A2组合：最大风险是将一次snapshot误当持续权威、把Native删除投影当完整Source删除、手工request替代真实固定构造。本包以现有Stage最终验真收口，不增加认证框架。原NO_OP拒绝行为保留，自动路由/模式和配置投影尚未解决，未装作IMPLEMENTATION_READY的生产整包。

考虑过直接开放完整Runtime/借Syntax目的、复制v3过滤入口、debugger采集平台；分别因资格范围错误、完整性门禁冲突、额外机制与未证实扰动而未采用。本包未判定需要修改FROZEN决策；新增Stage投影/请求构造超出A2的Source/前置账本批准范围。依据IMPLEMENTATION_PROTOCOL的Phase1“obtains design review before implementation”及既有分包授权边界，需本次集中确认；不是因为所有新增私有函数都必须审批。普通实现细节/TDD/文档/范围修复无需再审批。

推荐一次批准T1–T3及对应设计，当前会话顺序实现和收尾。此次不是“先方向再细化”；范围已经具体，不包含profile、新值/依赖、真实运行、云端/Git写入或新代理。批准后不再逐任务询问。

## 实施结果与作者审查（2026-10-29）

状态 **A3_LOCAL_REQUEST_PREPARATION_EXIT**。T1–T3在获批本地组件范围完成；[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-request-preparation/results.json)保存准确命令、原始失败、最终收据、Fixture冻结与适用性。无独立代理评审，按本包明确范围做作者审查。

交付三个产品文件：Stage两个私有投影和原contracts校验复用；原locator算法同文件提取；Runtime固定v2/v5请求构造。原public index/生产路由、wire/owner-map编码、SQL/迁移、依赖与DESCRIBE保持。新Fixture沿用原ID和三份独立reference文件，旧expected未改，未增加全局计数守卫。

新鲜结果：Storage/Runtime构建exit0；readiness root 125项中124 PASS、1原C1 TODO、0FAIL；原Stage root333/333；Fixture/注册35/35；架构17项目；七个代码/测试文件范围格式通过。作者审查后只新增非空DELTA和扩展Java删除断言，2/2定向通过，最后两文件格式复核；这两项与原root有重叠，不合计测试数。产品在最终构建/Stage门禁后未改，未重跑完整回归。

行为证据包括：独立原v2/v5请求一致；Java/Python/OTHER范围与删除投影；owner/Stage身份与累计失败前缀；动态临时repo下经原transport的Java→v5→Stage→全集重查→Store；OTHER-only删除无需Native、Java变化需完整组/Python变化无需Java；错误owner、流失败、全集新增阻止提交且Source真实提交身份保留。两条Native调用均为in-process进程double，不是OS Native/Git或生产E2E。授权拒绝复用root中未变A2用例；Store崩溃/UNKNOWN/清理事务语义未改，复用原适用收据，不启动旧19 worker。

修正与判断：
- 首轮投影9/11，根因是compilation_unit fallback sourceFileId不等于声明owner；核对实际java_syntax后过滤无声明sourceRange项，原独立expected保持，11/11通过。
- 新推导返回类型泄漏Zod依赖；用明确现有IR/结构型返回解决。Runtime从Provider请求索引类型取Repository/Revision，未加IR依赖。
- v5现行languages是完整版本descriptor，不是语言字符串；消费显式原metadata并按观察语言唯一选取，缺失/重复拒绝，不猜grammar版本。
- 局部组合初次失败由测试v2 reseal漏sha256:前缀造成；仅修测试编码，产品checksum门禁未变。
- DELTA/units为空依赖Stage既有逻辑删除保证；OTHER-only删除的Native删除投影可以为空，构造器返回null。未新增NO_OP、模式降级或空FULL成功。
- T3组合是在T1/T2各自API缺失RED→GREEN后连接现有组件；不为制造“衔接RED”人为移除已工作的实现。组合初次失败与修正真实保留。

作者按正确性/安全/预算/恢复及Ponytail收敛审查：未发现需留待修复的本包问题；没有新增通用executor、DI/认证框架、collector或依赖；原路径只提取既有算法，旧精确Stage门禁fresh通过。未改范围的Provider/Rust/Source实现和Store事务证据按适用性引用，不将其视为新物理资源测量。

本包不是完整Runtime实现或真实资源资格。EffectiveConfig到预算域的正式映射、全流程累计/实际进程归因、准确资源目的及实际运行/测后profile数值仍OPEN；catalog仍空。下一步按固定请求链准备配置/完整编排及资源资格方案，具体真实操作清单成熟后集中审查。P1-04/05和Phase1未关闭，父任务接受仍4/21；历史Native timeout UNKNOWN、C1 TODO、C2spent/main取消未查/R4mutable限制不变。无真实Native/Git/helper/collector、校准、新数值/依赖、云端CI或Git写入。
