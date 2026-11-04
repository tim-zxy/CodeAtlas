# B-F2-B观察、归一化和历史集中实施计划

> 使用superpowers:executing-plans，本会话顺序实施；用户选择优先于新代理/会话/工作树/commit建议。

**Goal:** 固定7→Syntax3→历史/Stage/Store→V4的有限本地链，不逐模块审批。
**Architecture:** 旧wrapper固定，内部明确版本分派；复用原预算、Source/Evidence、SQL和恢复；不复制管线。
**Tech Stack:** 已锁Rust/tree-sitter、TS/Zod、Node crypto/node:sqlite；无新依赖。
**Spec:** [B-F2-B详细设计](../specs/2026-10-30-phase1-binding-sufficiency-pipeline-design.md)。
**Status:** B_F2B_BINDING_PIPELINE_LOCAL_EXIT（见实施结果）。

## Global Constraints

原C工作树实施，D旧副本不改。wire7/SYNTAX_BINDING_V3、Syntax3/context4、旧版保持；SQLite11/body1/manifest1。身份域/策略适用严格按spec§5–6，不选新数值。全链累计预算/COMPLETE门禁不弱化。一次批次包括本地Rust库/Node/受控Source/临时SQLite；没有CLI/Git/独立Native/helper/collector/模型、profile/校准、CI/Git写入/新代理。已获用户明确批准并顺序实施；以下为已完成任务及其要求。

## Review Focus

- 预算化Readable仍硬编码6：J2确保5/6/7交叉拒绝及原始字节身份不漂移。
- scope COMPLETE来自漏枚举：J1每条A§4语法对应观察或PARTIAL，默认/装饰器/参数的scope分别验证。
- 新引用或control不入身份/支持：J3独立key与缺支持向量，禁止只看schema成功。
- 单条合法但整体缺scope/循环：J4冻结与H1重开集合核验，旧历史不补造scope。
- 只读库捕获冒称Store/物理资格：J5分开记录实际链、声明式链与未执行项。

## J1：库producer与独立Source oracle

Modify：crates/native-analyzer/src/lib.rs、code_syntax.rs、code_syntax_producer.rs、python.rs、java_syntax.rs；binding_syntax.rs只作保持原wrapper所需衔接。
Create：crates/native-analyzer/src/binding_sufficiency.rs（含定向tests）；fixtures/phase1/syntax-contract/binding-pipeline/{sources/,inputs.json,expected.json,enumeration.json}；现有fixture.json只追加路径。

Interfaces：BindingSufficiencyRequest以及decode/write/serve_binding_sufficiency_*，签名沿spec§3；内部版本选择沿明确5/6/7。输出严格v7 bytes，原预算/coverage/terminal。

- [x] 先冻结Source/预期及grammar枚举表，逐行覆盖A§4；正例明确正常模块/函数、JavaTYPE/常规导入，负例含所有effects/不可靠scope与条件。不得产品生成expected。
- [x] 写定向测试并RED，核对失败因缺v7入口/新观察，不把编译环境失败当行为RED。
- [x] 实现spec§3–4；原Code V1 facets与未知值规则保持，只有v7新增信息；旧domain/请求保持。
- [x] GREEN及旧binding_syntax、code_syntax模块定向兼容；错误/预算/取消复用既有边界，新增观察纳入同账本。
- [x] 完成：Source oracle逐项比较内容/scope/control/status而非只比数量；实际输出按新路径存证，原捕获不动。

## J2：完整request/stream/Readable

Modify：packages/providers/src/native-code-syntax-request.ts、native-observation-codec.ts、native-code-syntax-stream.ts，仅版本选择与新schema必需位置；旧native-binding-stream.ts固定6。
Create：packages/providers/src/native-binding-sufficiency-stream.ts；packages/providers/test/native-binding-sufficiency-stream.test.mjs。

Interfaces：readBindingAwareSyntaxRequestSnapshotWithBudget(bytes,composition)、validateBindingAwareSyntaxObservationStreamWithBudget(request,output,composition)；default consumeBindingAwareSyntaxObservation(request,readable,signal,limits,composition)，沿旧函数参数类型。快照拥有bytes/requestChecksum；validate返回{observation:ValidatedBindingAwareObservation,outputIdentity:string}，consume返回该observation，composition为必需CodeSyntaxCompositionBudget。严格返回类型见spec§3，不用as断言把旧request5伪装7。

- [x] 独立声明式streams先RED：固定7正例，旧5/6拒绝、错selector/checksum/sequence、少scope造成的PARTIAL/outcome一致性、截断/foreign与预算耗尽。
- [x] 贯通内部明确版本选择；预算Reader不再暗含true=6；复用buffer/abort/错误清理，不增加进程启动器。
- [x] 单文件GREEN并接J1实际库raw（单独证据标识）；跨chunk输入与取消只测新触发点，不复制完整旧IPC矩阵。
- [x] 完成：原始bytes/hash保持，PARTIAL可读但不能发布，5/6原行为保持。

## J3：Syntax3映射、身份与策略适用证据

Modify：packages/providers/src/syntax-normalizer-core.ts；只保留真正共享验证/转换，旧wrapper固定1/2。
Create：packages/providers/src/syntax-binding-sufficiency-normalizer.ts；packages/providers/test/syntax-binding-sufficiency-normalizer.test.mjs；syntax-contract/binding-pipeline下追加mapper-inputs.json、mapper-expected.json、policy-crosswalk.json。

Interfaces：default normalizeBindingAwareSyntaxObservation(input:unknown,composition:CodeSyntaxCompositionBudget):SyntaxEvidenceV3。输入精确沿现有normalizer字段；八kind/null/版本域/已有0.5条件按spec§5。引用/支持不能由测试trusted列表绕过原证明。

- [x] 先手写独立Canonical/key/extraction/理由预期并冻结，列每kind新引用与弱支持对应关系；新接口/丢resolution/control/scope造成RED。
- [x] 映射全字段、压缩引用的新key及extraction域；对照原上界，不提高Code/语义分数，不为新kind发明默认confidence。
- [x] GREEN包括支持缺失/低于原固定值、null/UNKNOWN保留、provider-independent key、新字段改变key、v2仍拒绝v3。若原策略适用条件无法满足则停止相应映射并保留raw，不能下调阈值或改分数。
- [x] 将新增kind的适用证据和限制同步原策略附约；不把声明式policy向量称校准或概率验证。

## J4：版本化历史与真实Stage/Store链

Modify（沿既有职责，不改SQL/Store事务方法体）：
packages/providers/src/syntax-history-candidate.ts、native-composition-input.ts、native-composition.ts、declared-delta-raw-observation.ts、declared-delta-raw-support-candidate.ts；packages/storage/src/analysis/activation-history-format.ts、mixed-analysis-stage.ts；packages/runtime/src/mixed-analysis-validation.ts、mixed-analysis.ts。
Create：packages/providers/test/syntax-binding-sufficiency-history.test.mjs；packages/runtime/test/binding-sufficiency-publication.test.mjs；既有p1-mixed-analysis-store-v1根增加binding-pipeline/inputs.json、expected.json并追加manifest路径。
若确需共享scope集合规则，修改packages/ir/src/syntax-evidence-v3.ts及packages/plugins/src/plugin-context-v4.ts，只提取validateSyntaxBindingScopeClosure(syntaxEvidence:readonly SyntaxEvidenceV3[],context:unknown):void并供V4/Storage共同使用；context沿parseSyntaxEvidenceV3输入。不在Storage导入Plugins；原V4结果、冻结与cap保持。

Interfaces：createBindingAwareSyntaxHistoryPair、reprojectBindingAwareSyntaxHistoryPair，沿旧pair的unknown输入与CodeSyntaxCompositionBudget，返回严格version3 pair；现有createVersionedSyntaxHistoryManifest新增3分派。readBindingAwareCompositionInputsWithBudget、composeBindingAwareProjectionForHistory、prepareDeclaredBindingAwareDeltaRawObservationWithBudget、composeDeclaredBindingAwareFullRawSupportCandidate、composeDeclaredBindingAwareDeltaRawSupportCandidateWithBudget：参数/返回结构沿Binding对应方法，仅raw/request固定7。Runtime新增createBindingAwareMixedAnalysisRules():MixedAnalysisRulesPort。不公开至index/生产dispatcher。

- [x] 独立v3pair/跨版祖先/三摘要域、retained新引用、原版本拒绝先RED；scope父环/缺失和保留意义漂移拒绝。
- [x] 扩展明确1/2/3分派与固定7组合；升级Source不变仍重观察；FULL/DELTA/删除/NO_OP沿原规则。
- [x] 临时真实SQLite经原Stage/Store完成FULL、DELTA/retained、升级重观察、重开读回及旧祖先；一次新字段事务失败验证last-good原子保持，预算失败用量不归零。
- [x] 持久集合闭包由H1路径核验，不能只在Plugin端验证；原origin字节/摘要及旧事务实现保持。
- [x] 完成：实际库链与声明式持久链分别记证据；只有两者都可连接才称该准确路径通过。若实际Code facets仍PARTIAL，则保留真实拒绝、不能用声明式成功替代实际生产资格。

## J5：一次收尾、注册与追踪

Create：scripts/test-binding-sufficiency-pipeline.mjs（只汇总J2/J3/J4四个测试文件）；package.json只追加一个root。现有Fixture根只追加子路径，无新ID/全局计数。

- [x] 按依赖构建IR→Providers→Plugins（仅共同closure变更时）→Storage→Runtime，IR types；开发只跑所属新测试，收尾一个root。
- [x] 旧兼容选native-binding-stream.test.mjs、syntax-binding-normalizer.test.mjs、syntax-binding-history.test.mjs、binding-history-publication.test.mjs、plugin-context-v4.test.mjs和A四文件；Store底层/SQL未变则复用原恢复证据，不机械复跑428/全回归/校准。
- [x] Fixture注册两文件、架构、受改TS/JS/JSON格式、Rust受改文件格式/编译门禁；原失败全部保留。必要修复后仅范围匹配复验，无变化不重复跑绿。
- [x] 同步ADR-020、CANONICAL_IR/NATIVE_IPC/PLUGIN_SPI、R011/Stage受影响规范、DESIGN_AUTHORITY/TRACEABILITY、WORK_BREAKDOWN/PHASE_ACCEPTANCE/CURRENT_STATUS；记录一个results.json，准确命令/源码/grammar/Fixture/实际输出身份与未执行项。
- [x] 作者整包审查只修原范围问题；没有新代理/会话/工作树或Git写入。只有spec§8新增边界才集中提交确认。

## 验证命令与运行授权边界

获批后Rust只运行cargo test -p codeatlas-native-analyzer --lib binding_sufficiency::tests、binding_syntax::tests、code_syntax_producer::tests三个定向filter；开发RED/GREEN和有源码修正后的必要定向复验均在整包范围，不自动循环重试。新库捕获由该测试写到新批次证据目录，不启动独立Native harness/CLI。编译可复用当前锁定依赖；缺环境/依赖则停止，不自行安装。

Node收尾：node --test --test-concurrency=1 scripts/test-binding-sufficiency-pipeline.mjs；前述旧兼容按文件明确展开；node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs；node scripts/check-architecture.mjs；tsc -p各受影响包和IR types；Prettier仅实际改动文件；Rust格式仅本包文件。新root默认不依赖.superpowers，实际捕获桥由显式环境路径启用且缺失即失败，skip不计PASS。临时SQLite仅测试自有目录，不使用用户/R4 DB。

## 追踪、顺序与退出

|任务|依据|Fixture/可验证出口|
|---|---|---|
|J1|spec§3–4 / A§4|p1-syntax-contract-v1/binding-pipeline Source+enumeration；实际v7观察或诚实PARTIAL|
|J2|spec§3|同根独立streams+J1raw；字节/终端/预算/版本闭包|
|J3|spec§5|同根mapper/policy；新域/全引用/旧支持上界，无新数值|
|J4|spec§6|同根历史及p1-mixed-analysis-store-v1/binding-pipeline；原子持久/重开/完整scope集合|
|J5|spec§7–8|上述门禁+治理追踪；仅准确有限出口|

J1→J2→J3→J4→J5顺序。本可独立准备J2/J3声明式向量，但无需代理/并发。首个可执行任务是J1独立Source/枚举oracle冻结；已获明确执行授权且完成有限本地出口。

作者自审：版本路径、scope完整性、provider-independent身份、策略适用、历史摘要、持久闭包均有任务与负控制；Store底层无新行为不重复完整故障矩阵。尚缺的是批准后新产物/Fixture与测试结果，不把设计矩阵计通过。只接受B_F2B_BINDING_PIPELINE_LOCAL_EXIT；不关闭父任务/Phase1或四框架语义。一次批准设计附约与J1–J5即可顺序实施及统一修复，不逐字段/模块确认。

## 实施结果 — 2026-10-30

J1–J5已按批准顺序完成；[作者整包审查/原失败/证据范围](../reviews/2026-10-30-phase1-binding-sufficiency-pipeline-implementation-review.md)和[命令与身份索引](../../../.superpowers/sdd/2026-10-30-phase1-binding-sufficiency-pipeline/results.json)是准确收尾依据。

最终Rust3/3（Source17例及两项资源反例）；新Node root19/19含r5真实库桥及声明式临时Store；九文件兼容76/76、注册35/35，五包构建/IR类型、架构17项目和38+6范围格式通过。旧Rust7+1按未变旧路径复用；无CLI/物理资格或阶段验收。真实库到Syntax3/V4与声明式Store分别举证，不称真实生产Native→Store整次鉴证通过。

额外必要文件是activation-history.ts（H1集合读取），没有初始保存快照，不补造基线；其他范围差异/Source successor/修复见作者审查。所有原始失败、Fixture根和捕获保留；只追加一个root和既有manifest子路径，无新Fixture ID/计数守卫。

B_F2B_BINDING_PIPELINE_LOCAL_EXIT不关闭父任务4/21及Phase1。后继合并共用绑定器/四规则的精确设计、API矩阵和Fixture；本包不授权其编码或新运行。无云端CI/Git写入、profile/依赖/迁移或新数值。
