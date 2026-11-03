# Phase1 Settled Java Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, sequentially in the current session. No new agents, sessions or worktrees. Steps use checkbox tracking.

**Goal:** Java结束后即可生成owner；v5结束后接收真实最终metadata，不预填未来完成时间。

**Architecture:** 在原Provider输入模块增加严格已结算Java准备schema，Runtime复用原Java校验并按已知字段关联最终metadata，Stage只为新分支使用独立摘要输入域。旧完整metadata路径、摘要和精确费用保持。Source/请求构造/Store/collector不重写。

**Tech Stack:** 现有TypeScript、Zod、Node24.15.0 node:test/node:sqlite、node:crypto；无新依赖。

**Spec:** [时序修订](../specs/2026-10-29-phase1-settled-java-owner-design.md)。

状态：SETTLED_JAVA_OWNER_LOCAL_EXIT，2026-10-29。获批S1–S3本地组件完成；准确范围/新鲜门禁见文末结果。

## Global Constraints

- 实际Phase1工作目录：C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；沿用同一工作树顺序实施。
- 三个产品模块；不扩展到有界SourceState、完整Runtime执行器、配置投影或资源采集平台。
- 不改public index、旧IR/IPC/owner-map、SQL/迁移/lockfiles/依赖、新数值或profile。
- 新准备明确省略未知未来字段；旧完整metadata严格性、费用和golden保持。
- 真实Native/Git/helper/collector、云端CI/Git写入/新代理未授权。
- 使用既有收敛策略：定向RED/GREEN，末尾受影响门禁一次；相同测试不跨root重复执行；一份results.json和本plan内作者审查，保留所有原始失败。

## Review Focus

- 不得将deadline、当前时间或null冒充未来settledAt（S1/S2）。
- 不能因为只比较已知字段，就漏掉Java事件、诊断、tool/版本或Source库存（S2）。
- 旧metadata不能借新分支绕过原整份相等和时间漂移拒绝（S1/S2）。
- 新digest只绑定已发生事实，最终合法时间变化不能要求重发v5或重建owner（S2/S3）。
- 新分支消费/失败进入同账本，不回退旧成本或绕过Stage/Store（S2/S3）。

## 精确文件

产品（仅三份，均修改）：
1. packages/providers/src/native-composition-input.ts：新增SettledJavaOwnerPreparationSchema/type及固定projectSettledJavaOwner；复用原字段schema，将validateParsedCompositionJava参数类型收窄为实际使用字段，原算法不改。
2. packages/runtime/src/mixed-analysis-validation.ts：javaOwner/targetAndScope/checkLocator支持严格新准备；observation新分支进行known projection精确关联，旧分支保持原whole metadata比较。
3. packages/storage/src/analysis/mixed-analysis-stage.ts：controlledJava新形状、javaDigest新域；原状态/正文/lease/cleanup与旧路径费用不变。

测试/Fixture：
- 新增 packages/providers/test/settled-java-owner.test.mjs。
- 新增 packages/runtime/test/settled-java-owner.test.mjs。
- 新增 packages/storage/test/settled-java-owner.test.mjs。
- 修改 packages/runtime/test/mixed-source-preparation.test.mjs，仅添加settled-owner组合分支；原A2/A3分支保留。
- 修改 scripts/test-mixed-runtime-readiness.mjs，导入三个新模块一次。
- fixtures/phase1/mixed-runtime-readiness/java-owner-timing/{cases.json,expected.json,README.md}；原fixture.json仅追加input/expected路径，不新增ID/全局计数守卫。

文档：本spec/plan、ADR020、DESIGN_AUTHORITY、PROVIDER_SPI、R011 Stage契约、A3附约、WBS/PHASE_ACCEPTANCE/DESIGN_TRACEABILITY/CURRENT_STATUS、统一后续计划。只同步受影响短说明和链接，不复制历史正文。

## S1：独立时序Fixture与严格准备schema

**Consumes:** 原stage-observation-independent、early-java-independent-v2独立metadata/nodes/Source/raw参考；现有Meta字段schema。
**Produces:** SettledJavaOwnerPreparationSchema、类型、projectSettledJavaOwner(finalMetadata)。均仅模块文件级使用，不经public index。

- [x] 保存三份产品源码/现有Fixture Manifest原字节；核验旧参考asset与decoded摘要。
- [x] 在产品改动前写并冻结三份Fixture文件：明确已知字段、新准备字面量、最终合法/逆序时间、逐字段负例和expected来源。
- [x] 用独立标准库reference推导新javaRowsDigest和stageDigest期望；输入为已冻结旧expected nodes/已知snapshot/Java，沿新域+规范JSON编码。不得调用新产品digest/normalizer生成expected。旧golden不改。
- [x] Provider新测试先观察接口缺失RED：无未来字段通过；未来字段即使null也拒绝；kind/schema/Java未结算/版本或tool冲突拒绝；旧Meta解析与字段顺序不变。
- [x] 最小提取既有Java schema片段供两schema共用；新投影只固定pick已知字段，不能成为通用field-mask工具。
- [x] Providers构建，新文件GREEN；确认旧函数只收窄类型、不复制Java parser。门禁不涉及Native/Rust子进程。

## S2：Runtime关联、Stage摘要与预算

**Consumes:** S1新schema/投影与原Java严格验证；Stage真实capture/RulesPort。
**Produces:** 既有prepareOwner可接收新形状，旧返回值/状态保持；最终acceptObservation仍要求完整metadata。

- [x] Runtime/Storage新测试先RED：Java-only/mixed省略未来字段仍可prepareOwner；新branch最终时间晚于准备的合法literal可以完成；旧branch同样漂移必须拒绝。
- [x] 逐字段拒绝：Java request/events/terminal/诊断、snapshot已知五字段、tool/版本、target/全inventory/locator、foreign owner/Stage、最终时间逆序；不每层重复同一结构测试。
- [x] 新摘要匹配S1独立expected；准备后合法最终v5时间变化不改变其摘要；Java事实/已知snapshot改变则改变新摘要；旧摘要参考保持。
- [x] 修改Runtime javaOwner及targetAndScope对新shape选择对应严格schema；共用原Java验证/归一化核心；旧分支调用顺序和收费保持。
- [x] 新observation投影与准备逐字段完全相等，并核对原normalized nodes；新branch检查Java已结算后才开始v5；原最终CompositionMetadata及raw全校验继续执行。
- [x] 修改Stage controlledJava的严格keys与摘要分支：旧算法不改，新算法绑定 spec§4域+已知snapshot/java/nodes；不更改stageDigest外层域或持久化schema。
- [x] 对新路径做exact/one-below/累计/失败前缀和Store导入控制；复用原HistoryReadBudget/规则receipt模式，不从新实测usage填expected。
- [x] 三包构建后只运行新增Runtime/Storage文件，GREEN才进入组合；原问题若来自Fixture/实现先定位，真实契约冲突才另治理。

## S3：组合、集中门禁、作者评审和追踪

**Dependencies:** S1/S2。无额外执行器/采集器。
**Produces:** SETTLED_JAVA_OWNER_LOCAL_EXIT或诚实OPEN结果，一份可重现索引。

- [x] 在A3现有Source→v2/v5固定double→Stage→verifySelection→Store中添加settled-owner分支；Java阶段仅构造已知新准备，最终v5 metadata在之后才提供。原Java/Source/raw/oracle保持适用引用。
- [x] 组合证明最终history/SQL保存完整最终时间，不落部分准备对象；Source已提交而后失败不冒充回滚；不自动重跑Apply。
- [x] 只导入三个新测试一次，保持原Fixture ID、旧Manifest内容及全部旧根/expected；不修改八个历史计数。
- [x] 执行下面集中清单，保留首轮失败；无关构建/校准不重跑。
- [x] 同步影响文档；本plan内作者评审覆盖known/final、旧兼容、预算和真实运行边界。用户禁止新增代理，作者审查不冒称独立评审。
- [x] 写一个本包results.json及简短CURRENT_STATUS，声明新鲜命令/范围与复用依据。原资源目的、真实运行/时序采集、SQL预算和P1-04/05保持OPEN。

## 准确本地验证清单

以下在实际C目录由 D:/Program Files/nodejs/node.exe 顺序执行。只允许node runner、拥有SQLite/文件、固定in-process child；不创建acquisition helper或运行Native。开发时先运行各新增文件；收尾才运行整合/兼容清单。

1. 构建（Providers → Storage → Runtime）：
   - node node_modules/typescript/bin/tsc -p packages/providers/tsconfig.json
   - node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
   - node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
2. 一次readiness root，包含新增三文件和扩展组合：
   - node --test --test-concurrency=1 scripts/test-mixed-runtime-readiness.mjs
3. 一次旧Stage root（333原用例，含旧Runtime callback/精确费用）：
   - node --test --test-concurrency=1 scripts/test-mixed-analysis-stage.mjs
4. 一次受影响旧Provider组合验证：
   - node --test --test-concurrency=1 packages/providers/test/native-composition-input.test.mjs packages/providers/test/native-composition.test.mjs
5. 一次Fixture/注册与架构：
   - node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs
   - node scripts/check-architecture.mjs
6. 实际改动代码/测试的Prettier --check，保持既有EOL，不全仓格式化。

不将新增文件再加入Stage root，从而避免root间重复。旧Store事务文件未改，复用原恢复/崩溃证据，不重跑19 worker；Rust/wire/Source实现未改，不机械重跑对应长测。若真实影响扩大先记录适用性，再选择必要门禁；不能删除旧断言、降低阈值或用TODO当通过。

## 追踪矩阵

| 任务 | 依据 | Fixture/检查 | 完成条件 |
| --- | --- | --- | --- |
| S1 | spec§3、Provider/NativeIPC | 新java-owner-timing独立reference及Provider新测试 | 新shape严格无未来字段；旧shape/schema保持 |
| S2 | spec§4、R011 Stage/ADR020 | 新Runtime/Storage、旧Stage333/Provider组合 | 已知字段不可漂移；新域独立；旧digest/成本不变 |
| S3 | spec§5、A3/Security | 新组合/原Source授权/Fixture注册/架构 | 完整最终metadata到Store，同账本/失败身份/文档新鲜 |
| 后继 | spec§6、Runtime资源§8 | 有界SQL/配置/实际采集尚缺 | 本包不实施、不签收，不预批未知值 |

## 作者设计审查与集中决定

已依据实际代码核验循环：完整Meta必需未来字段、javaDigest绑定completedAt、observation整份相等、v5又依赖stageDigest。静态fixture不暴露该时序不可能性。推荐方案只拆开“已知准备”与“最终观察”，保留全部已知事实的精确绑定与最终严格门禁；不是删字段放行。

新shape/digest域必须集中批准后实施，依据AGENTS设计治理和IMPLEMENTATION_PROTOCOL的Phase1实施前设计审查，以及A3仅批准请求衔接的范围；未将普通内部实现选择一律升级为审批。旧形状兼容增加一个受控分支，代价小于改写所有旧Fixture/身份/成本；下一真实编排应固定选择新形状，不能继续预填未来时间。

建议一次批准本设计及S1–S3，顺序连续实施、范围修复和收尾，不逐任务确认。本次不包含源状态SQL重构、生产执行器、配置预算新映射、真实运行、profile/数字/依赖、CI/Git写入或代理。

## 实施结果与作者审查（2026-10-29）

状态 **SETTLED_JAVA_OWNER_LOCAL_EXIT**，仅S1–S3本地组件范围。[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-settled-java-owner/results.json)记录冻结、准确命令、原始失败、最后门禁和复用适用性。按本包批准范围由作者评审，无新增独立代理。

三个产品文件完成：Provider严格SETTLED_JAVA_OWNER schema/固定已知字段投影、Runtime新准备/最终metadata关联、Stage新摘要域。新准备没有codeSyntax或snapshot.completedAt，也不会读取这些未来字段的getter。旧完整metadata分支保留整份equality和旧摘要/费用，原v2 Java验证/normalizer/owner-map/Store算法复用；未新增执行器/通用mask/认证框架。

Fixture三文件在相关产品改动前冻结：独立新准备及标准库sorted-key JSON/domain/NUL推导摘要，旧normalized nodes来自原独立reference。核验时发现旧静态Java/v5时间重叠，改用新Fixture中明确串行时间literal；保留首次草稿和冻结记录，旧根/原raw/expected未改。未来时间literal不作为默认值、时钟容差或实际测量。

验证结果以索引为准：Providers/Storage/Runtime三包构建；readiness root157项中156 PASS/1原C1 TODO；旧Stage root333/333；旧Provider组合76/76、Fixture/注册35/35、架构17项目、八文件范围格式均通过。重叠定向结果不合计，未重跑全仓/Rust/旧崩溃worker或CI。完成结论在全部最终收据exit0后记录。

证据重点：
- Provider新schema及未来字段非读取；Runtime已知Java/raw/版本/tool/Source/locator关联、最终时间可延后、重叠/逆序与旧完整metadata漂移拒绝。
- 直接复用未改的独立modelJavaOwner输入代数，验证新callback结果、exact及四维one-below；未用新实现usage回填golden。
- Stage新javaRowsDigest/stageDigest匹配独立reference；摘要前缀one-below在OWNER写入前拒绝，累计前缀保留且账户失效。
- 新settled-owner分支贯通真实拥有Source/SQLite、固定v2/v5进程double、Stage/最终全集重查/Store；SQL和history保存完整最终snapshot时间，不落部分准备对象；原A2/A3正向/失败分支保持。
- 受影响旧Stage精确预算、生命周期/摘要及旧Provider组合复验，旧成本不吸收新分支费用。

首次S1为接口缺失10/10 RED；S2为新准备尚不被Runtime/Stage支持，6 RED/11原拒绝控制PASS。首轮实现中独立成本已通过；两类正向测试构造错误（rawBundle带loader的expected字段、owner-map函数被传完整请求）修正为准确既有envelope，未放宽产品validator或旧expected；S2随后17/17 GREEN。额外重叠、未来getter和摘要前缀控制及新组合均保存定向收据。

作者检查known/final边界、旧兼容、预算/失败、Schema/引用及Ponytail收敛：没有本包内待修复发现；无新增依赖、数值阈值、SQL/迁移、公开API/IPC/DESCRIBE或profile。旧profile资格不随代码变化移植。SourceState .all前付、配置预算域、完整固定编排及真实进程归因/资格仍OPEN，下一个包应围绕这些明确缺口集中设计；本包没有伪称完成它们。

SQLite authoritative、Canonical IR、LLM candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow保持；P1-04/05及Phase1未关闭，主任务仍4/21接受。C1TODO、历史Native timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。无真实Git/Native/helper/collector、校准、新profile值、云端CI或Git写入。
