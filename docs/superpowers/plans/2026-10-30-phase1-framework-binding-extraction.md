# B-F2-C Shared Binding and Framework Draft Implementation Plan

> **For agentic workers:** 批准后使用 superpowers:executing-plans，在本会话顺序执行；用户禁止自行新增代理、会话、工作树及Git写入，不逐任务审批。

**Goal:** 在 Context4 上交付共享保守名称证明与四框架首组声明草稿。
**Architecture:** 复用 Syntax3/scope closure 与 FrameworkDraft v1；共享绑定索引加固定规则，无新版本/持久状态/生产发布。
**Tech Stack:** 现有 TypeScript、Zod、Node 标准库和 node:test，无新依赖。
**Spec:** [精确设计](../specs/2026-10-30-phase1-framework-binding-extraction-design.md)。
**Status:** 用户已批准整包并顺序实施；B_F2C_DECLARATION_DRAFT_LOCAL_EXIT，C1–C3在本包有限范围验收。

## Global Constraints

遵守设计§3的正证明、§4固定API表、§5现有上限的拟议适用语义及§8 OPEN缺口。没有真实 Native/Rust/Git/helper/collector/model/DB运行、profile/分值/新依赖、生产路由、云端CI、Git写入或新代理。Fixture只生成声明式数据，不作为实际Source解析收据。

C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas 是已交付输入工作树；D盘旧checkout不改。实际Git身份不可用，不构造commit/pristine证明，证据标明工作副本文件身份。

## Review Focus

- 后置局部定义、跨scope的GLOBAL/NONLOCAL和属性写不能漏过正绑定拒绝：C1。
- 不精确callee和导入同名不能升级为EXACT/框架调用：C1/C2。
- 不能把未include或include后新增的router路由当应用端点：C2。
- unknown namespace/schema、watch缺handler不能推导跨系统等价或变更触发：C2。
- 字符串路径无法保真、支持失效、输出膨胀时必须按设计失败关闭：C2/C3。

## 文件边界

新增产品：packages/plugins/src/framework-bindings.ts、framework-rules.ts、framework-extraction.ts。
修改产品：packages/plugins/src/framework-draft.ts，仅提取共享创建/验证逻辑，旧API语义不变。
新增测试：packages/plugins/test/framework-bindings.test.mjs、framework-extraction.test.mjs。
新增单一root：scripts/test-framework-binding-extraction.mjs（只import上述两个测试）。
新增Fixture：fixtures/phase1/plugin-context/binding-extraction/inputs.json、expected.json。
修改注册：现有 fixtures/phase1/plugin-context/fixture.json 的 inputs/expected 各新增bindingExtraction；package.json 的 test仅追加该root一次。不更改全局库存计数、capabilities或fixture ID。
文档：本设计/本计划/本作者评审、PLUGIN_SPI、CURRENT_STATUS、DESIGN_TRACEABILITY、WORK_BREAKDOWN、PHASE_ACCEPTANCE、framework-semantics-consolidation 路线；必要的实施结果只记录一次。无ADR新版本、无History/Storage/Providers产品修改。

## C1：共享绑定证明（首个可执行任务）

**接口：**设计§2的 FrameworkBindingIndex、BindingProof、createFrameworkBindingIndex、bindImportedName、bindDeclaredReceiver；索引只接已验证Context4。
**依赖：**已交付B-F2-B；不依赖四规则。Fixture预期可先独立完成；仍顺序推进。

- [x] 先编写设计§6共享矩阵的独立输入与字面BOUND/UNPROVEN、支持ID预期，包含scope完整性和全部Review Focus反例。记录Fixture文件摘要，产品不得生成预期。
- [x] 在framework-bindings.test.mjs加载上述数据；缺API/未实现时记录RED，区分import/API RED与行为RED。
- [x] 实现一个按scope/name索引。按设计处理parent链、所有targetScope effect及typed receiver；不新增通用CFG或解释器。
- [x] 运行该文件GREEN，预期每个Case exact结果/支持一致、无skip。修复原范围实现或Fixture缺陷时保留首失败及修正理由，不因测试失败改设计。
- [x] 若类型/字段不足以满足正例，先定位具体语法证据，保留对应能力OPEN；新增语法合同不能自动扩入本包。

**完成条件：**全部设计§3正负例及独立支持预期通过，无无证据升级，无新版本。记录不依赖数组顺序。

## C2：统一四框架规则与草稿入口

**接口：**extractFrameworkDrafts(input,framework):FrameworkExtractionResult；createFrameworkDraftFromValidatedContext参数由原FrameworkDraftSchema推导；ruleId固定设计§4加:v1。
**依赖：**C1。四规则在逻辑上可独立审查，但共享入口/Fixture，按Spring→Mongo→Kafka→FastAPI顺序实施，不开并行代理。

- [x] 先冻结四框架正/负例及exact proposal/support/diagnostic预期，覆盖设计§4全部有实现规则及每个拒绝族，不把§8后继缺口列为必过正例。
- [x] 写framework-extraction.test.mjs的 RED；一个文件内按框架分组，避免四套runner/测试加载器。
- [x] 从framework-draft.ts提取同一键/validated-context helper，旧validateFrameworkDraft保持strict入口；实现固定规则、path保真转换和include顺序检查。
- [x] 入口仅验证一次Context；语义不足输出固定诊断，结构错误抛原错误。所有输出走同一草稿支持/键校验，深冻结。
- [x] GREEN：四框架payload/支持与独立oracle完全相符，unknown/partial不正绑定，Runtime仍拒绝草稿；未实现目标只报限制，不记录为完整四Plugin验收。

**完成条件：**设计§4各规则均有独立正例与对应负例，§8缺口追踪清楚，无Canonical发布/分数/隐藏默认。

## C3：共同边界、注册、集中验收

**依赖：**C1/C2。该任务只验证共同接口/失效和文档，不复制旧Store事务/故障矩阵。

- [x] 同测试补充支持删除/改import/改名后的全量重算、输入置换、key稳定及重复结果策略、foreign basis、旧版本拒绝、组合输出上限失败。上限使用现有常量，不引入profile数值。
- [x] 向现有Fixture与根test追加一个入口，原历史fixture/key/登记保持。
- [x] 执行下述最小批次，集中修复原范围缺陷；产品有新修正时仅重跑受影响检查，最后保留准确适用GREEN收据，不自动重试到绿。
- [x] 作者按设计和Review Focus审查整包，记录发现/修复/限制。根据用户禁止新代理，作者审查明确不称独立评审。
- [x] 同步指定文档与CURRENT_STATUS的新鲜命令/Fixture/结果/限制；达到有限Exit才勾完成，Phase1/P1-06..09/E01/E02不提前签收。

## 一次本地验证批次

使用 D:/Program Files/nodejs/node.exe；工作目录为上文C盘。构建/测试正常临时产物仅在该工作树，按本包批准范围执行。

1. build：node node_modules/typescript/bin/tsc -p packages/plugins/tsconfig.json。复用B包未改IR构建；如果既有dist缺失，只报告前置缺失，不悄悄补运行未知组件。
2. C1/C2实施时各运行对应测试文件作RED/GREEN；最终node --test --test-concurrency=1 scripts/test-framework-binding-extraction.mjs。
3. 旧兼容仅node --test --test-concurrency=1 packages/plugins/test/framework-draft.test.mjs packages/plugins/test/plugin-context-v4.test.mjs packages/plugins/test/framework-detection.test.mjs packages/plugins/test/plugin-context-v3.test.mjs。
4. 注册只跑现有packages/evaluation/test/fixture-manifest.test.mjs与fixture-registry.test.mjs；原无新ID，无理由改全局计数。
5. 架构node scripts/check-architecture.mjs；Prettier --check仅本包改动的TS/JS/JSON/MD，沿用现有formatter。不要--write全仓。
6. 结果索引仅记录本包代码/Fixture身份、命令、退出码/实际计数、失败和收据路径。复用未变B证据的适用边界，不重跑Rust/Native/全回归/校准、旧Store恢复/所有62manifest。

精确运行次数以TDD必要失败、集中GREEN及原范围修复复验为限；本包没有受限真实进程批次，不需要为普通Node局部修复单独询问。检查中若出现设计冲突/新能力/新依赖/物理运行/云端写入，暂停受影响项一次集中报告，不扩散为每个字段审批。

## 验收追踪

C1→设计§2/3→p1-plugin-context-v2/binding-extraction shared cases→binding test。
C2→设计§4→同Fixture四框架cases→extraction test+既有FrameworkDraft/Runtime拒绝。
C3→设计§5/6/7→同Fixture共同边界→注册/兼容/架构/范围格式/文档。
原Phase1必需门禁仍引用PHASE_ACCEPTANCE，无新增或降低数值门槛；离线草稿不替代原语义Evaluation。

用户已批准顺序C1→C2→C3和原范围修复，不逐task确认。只记录有限B_F2C_DECLARATION_DRAFT_LOCAL_EXIT，未执行项不能记通过。

## 澄清前实施结果（历史）

[准确评审与证据](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)。C1：实现/独立Fixture/RED及范围修复已做，原dotted-module正例仍失败，整体OPEN；C2：规则及共同边界文件60/60，有限组件已验证；C3：注册/架构/构建通过，整包97/98故仍OPEN。上述未全勾checkbox不代表未开始；只有全部Exit满足后才整体勾选。测试公共结构装配新增一个helpers/framework-binding-fixture.mjs以避免两文件复制，不改变产品接口或oracle来源。确认边界仍只针对新发现的[导入澄清](../specs/2026-10-30-phase1-dotted-module-binding-clarification.md)，不是逐任务重批。

## C1–C3有限出口 — 2026-10-30

用户明确批准[同根导入澄清](../specs/2026-10-30-phase1-dotted-module-binding-clarification.md)后，仅更新一个新预期，保留原BOUND oracle及全部失败。approved-root.txt为98/98、0fail/cancel/skip/todo；范围格式通过，旧兼容64/64/注册35/35/构建/架构17按身份适用性复用。C1共享38/38，规则及共同边界文件60/60。已完成批准的C1–C3和原范围作者审查修复，有限B_F2C_DECLARATION_DRAFT_LOCAL_EXIT成立；不计完整Plugin/Phase1通过。完整dotted-module正绑定及设计§8全部缺口继续OPEN。证据见accepted-results.json和最新实施评审。
