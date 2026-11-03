# Phase1 A3：Stage 到 v2/v5 请求的私有衔接设计

2026-10-29。状态：A3_LOCAL_REQUEST_PREPARATION_EXIT；用户已批准并完成A3设计及T1–T3本地组件。与[实施包](../plans/2026-10-29-phase1-mixed-request-preparation.md)一次审查；不再分别审批方向、细化和任务。本文只收敛现有调用链的一个实码缺口，不授予生产路由或真实运行资格。

## 依据、核验与范围调整

当前基线为 A2_LOCAL_SOURCE_PRELUDE_COMPONENT_EXIT；[A2结果](../../../.superpowers/sdd/2026-10-29-phase1-mixed-source-runtime-integration/results.json)记录组件106 PASS/1原TODO、Stage333、注册35和四包构建。它们是已有结果，本轮没有重跑，也没有改为全流程验收。

只读核验的实际路径：
- Runtime mixed-source-preparation 创建真实前置账本，经 Application 授权、混合 Source 和原 CAS，提供 verifySelection。
- MixedAnalysisStage.prepareOwner 已在 SQLite capture 基础上推导 required units、完整移除集、Java owner 和 stageDigest，但仅返回 ownerHandle/stageDigest。
- Runtime mixed-analysis-validation 已用真实 Java v2 metadata 和 Canonical 绑定验证 owner；acceptObservation 再校验 v5 raw 与该 owner。
- Runtime mixed-source-preparation.test.mjs 的正向组合仍手工替换旧 request 中的 repo/revision/file/stageDigest/ownerMapDigest。它证明原料可组合，没有交付固定产品请求构造器。
- 原 prepareScope 对未改变 DELTA 明确拒绝 INVALID_STAGE，freeze 只接受实际候选。现阶段不能把 Stage 改成自动支持 NO_OP，也不能借此新增 FULL/DELTA 自动降级规则。

完整生产编排还缺 EffectiveConfig 到各预算域的正式投影、准确资源资格目的、Git/Native 完整归因和真实运行证据。为避免把未解决问题藏入一份“可实施整包”，本次只批准请求衔接和局部整合；后继运行清单保持 NOT_READY。本次不增加 profile schema、调试器或采集平台。

设计依据：ADR-020；PROVIDER_SPI / NATIVE_IPC / SECURITY / EVALUATION / MODULE_BOUNDARIES；R011 Stage 契约及[Runtime边界附约](2026-10-29-phase1-runtime-boundaries-design.md)、[A2附约](2026-10-29-phase1-mixed-source-runtime-integration.md)。沿用 Canonical IR、SQLite authoritative、candidate-only、AUTO/MANUAL 和 ExecutionGraph → RuntimeFlow → BusinessFlow。

## 1. 最小接口与职责

只在原模块文件级导出，不进入 package index。Storage 不导入 Provider/Runtime，不暴露数据库连接、TEMP 或内部可变 owner。新增两项明确投影，不建立通用查询端口、认证 token 或 plan 框架。

在 storage/src/analysis/mixed-analysis-stage.ts：
```ts
readMixedJavaPreparation(stage, contracts): Readonly<{
  mode: 'FULL' | 'DELTA';
  targetSource: { repositoryId: string; revisionId: string; contentFingerprint: string };
  repositoryLocatorDigest: string;
  javaSourceFiles: readonly SourceFile[];
}>;
readMixedCodeSyntaxPreparation(stage, ownerHandle): Readonly<{
  mode: 'FULL' | 'DELTA';
  targetSource: { repositoryId: string; revisionId: string; contentFingerprint: string };
  repositoryLocatorDigest: string;
  expectedActivationBasis: RepoBasis | null;
  inventory: readonly SourceFile[];
  units: readonly { id: string; providerId: string; kind: string; sourceFileIds: readonly string[] }[];
  sourceFiles: readonly SourceFile[];
  removedSourceFiles: readonly { id: string; path: RepositoryRelativePath; previousContentFingerprint: string }[];
  owners: readonly { sourceFileId: string; providerNodeRef: ProviderNodeRef; canonicalRef: ScopedRef }[];
  stageDigest: string;
}>;
```

参数类型使用既有 IR/本文件 Contract 结构，不新建一套 schema。contracts 的校验提取自 prepareOwner 原代码并保留原收费和旧路径结果；新增调用的费用单独进入同一实际账本。

第一函数仅 PREPARING 可用，复用 prepareScope(s, contracts)，javaSourceFiles 只取其 required JAVA_GROUP 的完整成员；Python-only 或无需重新观察 Java 时为空。prepareOwner 仍按实际输入重新验证；投影不代表 Java 已产生或通过。contracts 改变时 prepareOwner 继续按实际新契约判定，不能拿旧投影绕过。

第二函数仅 OWNER_FROZEN 且 ownerHandle 属于同一 Stage 时可用：
- inventory 是完整 targetInventory，sourceFiles 是实际 required units 的全集，不能把后者写成全库清单。
- FULL expectedActivationBasis=null；DELTA 来自真实 capture 的旧 basis，不用 target/new basis 代替。
- owners 只由该 Stage 已验证 Java providerNode/canonicalNode/sourceFileId 生成，使用现有 scoped reference 编码，仅取具有声明 sourceRange 的节点，排除 compilation_unit、无 sourceFileId 或不属于本次 Java 范围的项；不从名字或行号猜 owner。
- removedSourceFiles 从旧 inventory 取已经判定移除且原属 Java/Python 原生投影范围的项，保留原路径/指纹；完整 Source 删除集仍留在 Stage，不把 OTHER 删除伪装成 Native 删除。
- DELTA 仅删除且 units 空，投影可以返回 sourceFiles/owners 空，由调用者走现有 acceptObservation(handle,null)，不制造空 v5 请求。FULL 零原生输入沿既有 validator 行为，不在本包新增支持。
- 每次读取都执行既有 Stage context/lifecycle 检查并在读取、序列化、拥有副本前按同账本计费；新返回值独立、冻结，不冻结内部旧对象或返回 alias。
- 错误按原 stageFailure 归类并使当前 Stage 失效。跨 Stage、ambient transaction、已关闭/消耗/失效均拒绝。正常旧 API 不调用新投影时成本保持。
- 返回值是结构数据，离开 Stage 后不承诺持续新鲜；acceptObservation/freeze/Store 继续持有最终校验职责，不建立新 lease/token/WeakMap 链。

## 2. Runtime 固定请求构造

新增 runtime/src/mixed-request-preparation.ts，私有 default 对象两个成员：
- prepareMixedJavaRequest(input, budget): NativeAnalyzeRequestV2 | null
- prepareMixedCodeSyntaxRequest(input, budget): Buffer | null

budget 是已由 A2 创建并传入 Stage 的 HistoryReadBudget，不从 caller usage 重建。输入是已验证内部数据；只在现有 schema/locator 边界检查，不逐层重复 clone 或检测同一数据。

Java input：preparation（第一投影）、repository、revision、requestId、providerSnapshotId、requestedCapabilities、deadlineEpochMs、resourceBudget（均为原 v2 字段）。输出只使用 projection.javaSourceFiles；为空返回 null。repository/target/revision 与 captured ID/fingerprint 必须一致。使用既有 v2 ANALYZE schema，完整 required Java 组一次请求；不用过滤后的 v3 FULL。

v5 input：preparation（第二投影）、repository，以及现有 CodeSyntaxRequest 的 requestId/providerVersion/providerSnapshotId/extractorVersion/deadlineEpochMs/resourceBudget/languages（既有完整语言descriptor元数据）。providerId 固定 native，codeContract 固定 PYTHON_SYNTAX_CODE_V1。其余 payload 身份、sourceFiles、removedSourceFiles、owners、stageDigest 只能取 projection；languages 按实际 sourceFiles 的现有允许语言稳定去重。ownerMapDigest 调用原 computeSyntaxOwnerMapDigest；removedSourceFiles 仍通过完整 request 身份绑定，不改变 owner-map 编码。

DELTA units 空且有逻辑删除时返回 null，明确调用原 null-observation 分支；其他空范围不静默变成成功。NO_OP 在本包不新建 Stage/历史、不伪装成删除；已有 NO_OP 规则/测试复用。自动模式决策及 FULL 回退属于后继生产编排。

既有 checkLocator 从 mixed-analysis-validation.ts 提取最小同文件 helper，原调用继续使用，新增构造器复用同一 repository locator 编码；无第二套哈希算法。即使 Java 为空也验证 repository/root 对 captured locator，不只比较 repo ID。

v5 通过现有严格 snapshot/parser 返回原始 JSONL Buffer。请求数据和编码字符串/buffer按 encodeHistoryValue/原预算方法先收费再拥有；失败前缀不退款。构造器不打开 Source/DB、不 spawn、不安装 qualification、不调用 Store，不从任意字符串判断准入。request metadata 的数值只消费显式现行预算；不设默认、不推导新门槛，不将 maxEvents 等同 maxItems。

这两个构造器是固定内部工具，不是生产 index 入口。未来调用者仍必须先完成准确目的的 Runtime gate；低层路径存在不构成 bypass。正式运行前还需解决配置唯一投影、全流程各阶段累计、实际峰值和固定资格上下文。

## 3. 局部组合、错误与恢复

新增组合测试连接 A2 Source/CAS → capture → Stage Java projection → v2 构造及现有受控进程 double → prepareOwner → v5 projection/构造及现有原始流 client → acceptObservation → freeze → verifySelection → 同步 Store.apply。

Java 返回只来自现有独立 v2 literal，不从新算法生成 expected。v5 使用独立 raw literal；请求动态 ID 的必要重绑/reseal 仅为测试运行身份适配，明确 expected 的 Canonical/owner/范围来自旧参考，不把新构造器输出反写 golden。构造器断言不由它自己计算对照摘要。

不新增产品通用 executor/transport/DI 端口。局部测试调用已实现产品函数，固定 double 只替代实际 OS child/Git；不是 Native 或全生产 E2E。未变的 Store 事务/UNKNOWN恢复/清理失败证据按源码与输入适用性复用。失败不回滚已提交 Source、不自动重跑 Apply、不清用户文件。保持最终 FS 重查后无 await/外部回调直接 apply 的原约束；FS/SQLite 非原子限制不改。

## 4. 真实资源资格：本次明确不解决的事项

| 范围 | 当前结论 | 后续真实运行前的交付 |
| --- | --- | --- |
| HOST / SQLite / Source / close | A2逻辑预算不等于RSS，尚无完整目的 | 冻结实际编排与配置投影，定义完整资源范围和校准/holdout适用性 |
| Native Java/v5 | 已有 Node owner 与输入前屏障，只有 double 证明 | 同次真实进程句柄、创建/请求/退出身份和最终峰值，准确命令/次数/输出根 |
| 短生命周期 Git | 不能保证 spawn 后 attach 赶上退出 | 证明可行的捕获路径或另提有依据的指标/范围变更；不能静默漏算 |
| 采集器 | C2四个helper已用完，仅可行性输入 | 不复用 slot；新collector方法/实际生命周期另有具体计划和批准 |
| catalog / profile | Syntax目的不覆盖全流程，catalog仍空 | 目的/component契约先审；测量后再审具体值，不预批未知数字 |

Windows DEBUG_PROCESS 可覆盖后代，CREATE_PROCESS_DEBUG_EVENT 在用户态执行前报告；但 debugger 事件/句柄/退出会引入新的生命周期和时序扰动。官方文档只支持机制事实，不能证明现有 Node/Git/Native 全链采集适用性。本次不采用/不实现 debugger、不新增 addon/broker/ETW/admin权限或系统配置。JobObject 的其他内存指标也不能直接替换已接受的 PeakWorkingSet/RSS。

来源：[Microsoft进程调试](https://learn.microsoft.com/en-us/windows/desktop/Debug/process-functions-for-debugging)、[调试事件](https://github.com/MicrosoftDocs/win32/blob/docs/desktop-src/Debug/debugging-events.md)、[WaitForDebugEvent句柄规则](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent)。以上未执行任何平台试验。

真实执行清单当前 **NOT_READY**，没有伪造 executable/build/corpus/profile 哈希或次数。先把本包请求链落实，后续针对固定实现呈现完整可审阅的实际操作清单；确实无法证明的资源门禁保持 OPEN，不能以节约验证为由豁免。

## 5. Fixture、退出与集中决策

复用 p1-mixed-runtime-readiness-v1，在 request-preparation 下添加原参考索引、独立 expected 和说明，Manifest只追加 input/expected引用；不新增ID、旧全局计数或重复 Source 根。保留所有旧 expected/失败。范围、owner、删除、locator、状态/预算失败及局部组合由任务包逐项追踪。

本包退出仅 A3_LOCAL_REQUEST_PREPARATION_EXIT：私有投影和构造器完成、独立Fixture/适用旧Stage门禁/构建/架构通过、受影响文档一致及结果索引新鲜。P1-04/05、真实Source/Git/Native资源资格、生产路由、C1及Phase1不因此关闭。

集中请求批准新增两项 Stage 私有投影、Runtime v2/v5 固定构造器及现有 locator helper复用、独立Fixture和局部组合/必要验证。无SQL/迁移/IR/依赖/公开API/DESCRIBE/profile/数值变化；无真实Git/Native/helper/collector、云端CI/Git写入或新代理。接受后同范围缺陷修复、文档同步和验收连续执行，不逐任务确认。

## 实施澄清（获批范围内）

languages消费现有wire descriptor（含grammar/analyzer/compatibility版本），按实际观察语言选择唯一项，不猜版本。DELTA units为空时依赖已认证prepareScope的逻辑删除保证，因此OTHER-only删除即使Native删除投影为空也返回null；不新增NO_OP规则。Java owner仅来自有声明sourceRange的已验证节点，compilation_unit不是producer declaration owner。显式返回类型避免Storage声明推导泄漏Zod；Runtime沿Provider类型取IR结构，无新依赖边。

本地交付及作者审查见[实施结果](../plans/2026-10-29-phase1-mixed-request-preparation.md#实施结果与作者审查2026-10-29)，不改变§4实际资格缺口。

## 已批准：已结算Java owner时序附约（2026-10-29）

用户已整体批准[时序修订及S1–S3](2026-10-29-phase1-settled-java-owner-design.md)。新SETTLED_JAVA_OWNER准备仅含完整已结算Java和snapshot已知身份；没有codeSyntax/snapshot.completedAt。最终完整metadata经已知字段精确投影及原完整组合门禁关联。新javaRowsDigest使用codeatlas-settled-java-owner-v1＋NUL的独立输入域；旧完整metadata分支、摘要/费用和最终SQL时间/diagnostics比较保持。Stage外层正文/摘要域、owner-map、IR/SQL/wire/public index不变；准备不作为完成snapshot发布。结果与作者审查集中于实施包，不能据此认定完整Runtime或实际资源资格通过。
