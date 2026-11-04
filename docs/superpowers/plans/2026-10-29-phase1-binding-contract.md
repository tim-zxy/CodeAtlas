# B-F1-A 绑定契约与校验器集中实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。本会话顺序执行，不新增代理、会话、工作树或Git写入。

**Goal:** 一次交付版本化绑定字段、IR v2解析、私有raw/request schemas、Plugin V3 context和独立契约Fixture。
**Architecture:** 新版本隔离，复用旧validator共同约束；旧producer/normalizer/history/Runtime不改，不让新schema绕过原资格。
**Tech Stack:** 既有TS/Node/Zod；无依赖、数值或Rust/Native运行。
**Spec:** [精确绑定合同](../specs/2026-10-29-phase1-binding-contract-detail.md)及[已批准方向](../specs/2026-10-29-phase1-framework-binding-contract-proposal.md)。
**Status:** 用户已批准并完成T1–T3；B_F1A_BINDING_CONTRACT_LOCAL_EXIT（2026-10-30）。

## Global Constraints

准确工作树C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；不覆盖D旧目录。保留本地/EOL/原Fixture/失败/.superpowers。无实际Git/Native/helper/collector/model、calibration/profile、新数值/依赖、SQL/migration、云端CI或Git写入。旧strict v1..5/Syntax1/Plugin1..2不放宽。F0和A5/A6原结果按适用性复用，不重跑。
用户只批准了设计方向，本实施包须一次整体确认；批准后各任务/普通修复统一执行，不逐步询问。作者审查，不新增代理。

## Review Focus

- 用新版本字段“降级”为旧对象冒充历史支持：投影只作共同约束检查，不返回、不发布；旧拒绝测试。
- 把范围包含当直接调用：独立nested/conditional/parentheses负例与完全相等正例。
- owner被误用为scope：两者不同的正例、null与foreign/wrong-kind负例。
- Schema安全解析被当完整wire准入：无stream consumer/Runtime route/DESCRIBE修改，文档准确限定。
- 新ID/迁移/无关计数重构：同Fixture ID两路径，三项根测试注册，精确影响审查。

## 文件清单与任务

### T1：先冻结独立语料，落实IR v2

Create:
- fixtures/phase1/syntax-contract/binding-contract/inputs.json
- fixtures/phase1/syntax-contract/binding-contract/expected.json
- packages/ir/src/syntax-evidence-v2.ts
- packages/ir/test/syntax-evidence-v2.test.mjs

Modify packages/ir/src/index.ts：只增加新v2模块导出；原export不删改。

Consumes旧IR schema/parsePhase1Envelope/引用工具；produces精确设计§3的v2 schema/type/parser。codeNodes是供scope值验证的当前捕获值，不是新增可信存储。
- [x] 手写raw/canonical/request/context和关系向量及literal oracle，覆盖设计§5；Freeze输入/expected的初始内容，不复制整仓hash。
- [x] 测试先观察缺新parser RED；若Fixture不合法先修语料，不冒称产品RED。
- [x] 实现strict v2及scope/range校验，共同约束复用旧parser；不改旧SyntaxEvidenceSchema/parseSyntaxEvidence。新对象缺字段拒绝，不用default生成confidence/身份。
- [x] IR build；新测试与原phase1-ir一次匹配验证，含旧parser拒绝新形状。

### T2：raw/request schema、Plugin V3与直接关系

Create:
- packages/providers/src/native-binding-contract.ts
- packages/providers/test/native-binding-contract.test.mjs
- packages/plugins/src/plugin-context-v3.ts
- packages/plugins/test/plugin-context-v3.test.mjs

Consumes T1 v2、旧raw/request schemas、V2 validator；produces设计§3私有schemas与validatePluginV3Context。isDirectAssignmentCall放在plugin-context-v3.ts作私有模块named export，消费已验证v2值，仅执行设计§2精确关系，不重复解析。
- [x] 新测试先RED：新模块缺失；raw/request严格版本、V3 scope/不可变/旧拒绝、direct-vs-nested独立oracle。
- [x] 实现固定新schemas/共同校验投影及精确关系，不创建版本registry、factory、generic AST/解析平台。
- [x] Providers/Plugins build；新文件与旧native-syntax-ipc、native-code-syntax-ipc、plugin-spi-v2、F0范围匹配组合验证。
- [x] 不改providers/plugins public index，不修改Rust/Native请求分发、profile、History或Runtime。

### T3：注册、集中验收与追踪

Modify：
- fixtures/phase1/syntax-contract/fixture.json：inputs/expected各加bindingContract路径。
- package.json：在对应IR/Providers/Plugins测试位置各追加一次上述三个新文件。
- docs/handoff/specs/CANONICAL_IR.md、NATIVE_IPC.md、PLUGIN_SPI.md：新增明确限定的契约补记，旧规范不重写。
- docs/handoff/adr/ADR-020-phase1-contracts-and-evaluation.md、DESIGN_AUTHORITY.md、DESIGN_TRACEABILITY.md、CURRENT_STATUS.md：批准范围、未完成部分与唯一结果链接。
- 本设计/计划的结果段。

- [x] 先确认待改文件存在，按确切字符串追加注册/路径，不批量stage或替换测试计数。
- [x] 最终一次受影响组合测试、manifest/registry两文件及architecture；格式只命名产品/测试/Fixture/Manifest/package文件。不运行根verify或完整Native/Stage/Store回归。
- [x] 作者审查协议隔离、投影不外泄、范围/作用域和无生产旁路；原范围缺陷统一修复。
- [x] 单一results记录准确命令、初始RED/失败、最终实际计数、Fixture身份和适用性；更新CURRENT_STATUS，不累计重叠测试。
- [x] 对比本轮文件，确认旧源/Fixture和换行仅预定变化；保留全部证据，不提交.superpowers。

## 验证命令

使用既有Node和已安装工具，构建相当于各package的tsc，不安装依赖：

    pnpm --filter @codeatlas/ir build
    pnpm --filter @codeatlas/ir test:types
    pnpm --filter @codeatlas/providers build
    pnpm --filter @codeatlas/plugins build
    node --test packages/ir/test/syntax-evidence-v2.test.mjs packages/ir/test/phase1-ir.test.mjs
    node --test packages/providers/test/native-binding-contract.test.mjs packages/providers/test/native-syntax-ipc.test.mjs packages/providers/test/native-code-syntax-ipc.test.mjs
    node --test packages/plugins/test/plugin-context-v3.test.mjs packages/plugins/test/plugin-spi-v2.test.mjs packages/plugins/test/framework-detection.test.mjs
    node --test packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs
    node scripts/check-architecture.mjs

已核对上表既有测试路径及IR test:types脚本存在；使用已安装tsc执行等价命令时记录准确argv。无新增类型brand，只新增现有品牌组成类型，原类型门禁保留。

## 出口、依赖与审批

T1→T2→T3；共享Fixture/IR，顺序执行。每步失败先区分实现/Fixture/设计，超出合同的新冲突才集中治理。

出口B_F1A_BINDING_CONTRACT_LOCAL_EXIT，只是schema/解析/纯关系组件，非Native producer、normalizer、history、框架绑定/语义候选、生产路由或E01/E02。实际scope来源和AST真实性均未测；A6与P1-04/05、P1-06/07、Phase1仍OPEN。

后继整包须实现producer→normalizer→版本化历史输入及真实绑定，再集中确定候选identity/support/confidence与四框架extract；不把本次批准推为这些未知项的实施授权。SQL是否需要迁移由实际结构决定，无空表预建。

作者计划审查：本包跨IR/Providers/Plugins但只完成同一版本化输入合同，是最小可独立验证单元；不把未清楚的历史/候选策略夹进首次实现。成本是增加显式版本合同，需要后继生产链接入；收益是旧严格形状和原门禁保持，字段关系先由独立Fixture固定。批准后按本包连续交付，不再为每个schema询问。

## 实施结果与作者审查（2026-10-30）

[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-binding-contract/results.json)保存准确命令、UTC时间、全部失败、Fixture/产品身份和限制。日期按Asia/Shanghai记录；沿用29日设计文件与拥有目录，不重命名历史。

已交付Syntax v2 schema/type/parser、私有protocol6 request/raw schemas、Plugin V3 context和isDirectAssignmentCall。只在IR公开新增v2模块；Providers/Plugins public index、旧schema/validator、Rust/producer、normalizer、History/SQL及Runtime不改。共同约束通过私有投影复用旧validator，完整新对象保留并校验scope/range；投影不外泄，不成为旧origin或发布权。

独立Fixture在产品前冻结：27 canonical、10 raw、5 request、10 relation向量。最终JSON只格式化，按原序列化复原后的SHA与初始freeze一致，旧向量不改。T1有效RED为缺parser27FAIL/旧控制2PASS；T2缺模块RED后GREEN35。首次IR构建TS2367品牌比较、收尾合并import遗漏造成TS2300重复导入均已修正并保留失败；不是设计变更，也不称已通过的检查失败或flaky。

最终三包构建和IR原类型检查exit0；IR78/78、Providers169/169、Plugins81/81，均0fail/todo；注册35/35、架构17项目和11文件格式通过。各组含旧控制与新用例，开发/最终重叠不累计。作者审查核对scope/owner分离、typed声明、exact range关系、V1/V2拒绝新输入和结构/准入分离；无新增独立代理。根package去掉三个唯一测试追加后与原字节一致，IR index去掉唯一export后与原字节一致，未混入无关EOL。

此出口仅B_F1A_BINDING_CONTRACT_LOCAL_EXIT，不证明Native真实AST、v6字节流、历史激活、构造器类型或框架语义；完整F1、E01/E02、P1-04/05/06/07与Phase1继续OPEN，主任务4/21。未运行实际Git/Native/helper/collector/model、profile/新分值/依赖、云端CI或Git写入。下一步具体设计producer/normalizer及版本化历史输入，再完成候选identity/support/confidence和四框架extract，不从本包批准推导后继实施授权。
