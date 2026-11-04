# B-F2-A绑定合同与领域草稿集中实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans；沿用本会话顺序及作者整包审查，无新代理/会话/工作树或Git写入。

**Goal:** 一次建立新绑定数据的严格版本、引用闭包和不能冒充Canonical Runtime的领域草稿。
**Architecture:** 复用现有IR安全/引用/Runtime signatures和Plugin Context，不增加producer/解析平台/DB；旧wrapper保持。
**Tech Stack:** 现有TypeScript/Zod/Node crypto；无依赖、新资源数值或迁移。
**Spec:** [精确合同](../specs/2026-10-30-phase1-binding-sufficiency-contract.md)。
**Status:** B_F2A_BINDING_CONTRACT_LOCAL_EXIT（已获批准并完成C1–C4有限本地合同出口）。

## Global Constraints

沿用C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas，不修改D旧副本、Git元数据、旧Fixture/EOL/证据。不reset/stash/stage/commit；不提交.superpowers/pnpm-store。本包只Node组件/类型/构建；不运行Rust/Native/CLI/helper/collector/model、DB、profile/校准/新数值、云端CI或Git写入。

版本固定wire7/Syntax3/context4+syntaxSchema3、SYNTAX_BINDING_V3；旧4/5/6、Syntax1/2、context1/2/3原语义保持。没有完整stream/producer/normalizer/history调用路径；不可将schema验证称完整观察或实际框架抽取。

## Review Focus

- RESOLVED/HEURISTIC不能当EXACT；新字段不得流入旧版本。
- Java static/wildcard与Python alias/relative不得由hint猜形式。
- scope父环/跨文件/null未知目标不能形成完整绑定依据；Code声明名范围不能代替scope观察范围。
- 草稿refs/support/key须闭包，额外confidence/id拒绝，Runtime parser继续拒绝。
- 基础测试无.superpowers依赖，不引入重复全局计数或模拟producer当实测证据。

## C1：Canonical Syntax v3

**Create:** packages/ir/src/syntax-evidence-v3.ts；packages/ir/test/syntax-evidence-v3.test.mjs。
**Modify:** packages/ir/src/index.ts只追加该IR模块export。
**Interfaces:** SyntaxEvidenceV3Schema/type；parseSyntaxEvidenceV3(envelope:unknown,context:unknown)返回version3 envelope，context为既有references/codeNodes/sourceFiles。

- [x] 先手写并冻结独立输入/expected（沿本spec§2–5，旧v2控制保留），建立缺schema/缺版本的有效RED。
- [x] 实现controlContext、callee精度、TYPE声明与三个新kind、公共Source/支持/范围规则；复用原helper，必要私有helper只作真实共享，不扩旧parser。
- [x] 单文件GREEN：node --test packages/ir/test/syntax-evidence-v3.test.mjs；反例明确检查wrong-version、HEURISTIC状态不一致、缺support、wrong scope和MODULE path/fingerprint。
- [x] IR build及类型检查，旧v2/parser/Runtime结构控制保持；成功只证明显式数据合同。

## C2：固定私有v7结构

**Create:** packages/providers/src/native-binding-sufficiency-contract.ts；packages/providers/test/native-binding-sufficiency-contract.test.mjs。
**Interfaces:** BindingAwareSyntaxObservationSchema/type；BindingAwareCodeSyntaxRequestSchema/type。固定protocol7及SYNTAX_BINDING_V3，仍PYTHON_SYNTAX_CODE_V1。

- [x] raw新字段、import形式、effect目标、scope状态、缺字段/foreign/wrong-version结构先RED。
- [x] 同一spec的ref替换为ProviderNodeRef；保留raw callee.target.resolution，不生成第二个同义字段。
- [x] 只schema，不添加空reader/normalizer/factory占位、不改public index/旧ipc/生产请求。
- [x] Providers build及单文件GREEN，旧native-binding-contract和request结构测试保持。

## C3：V4 context和scope闭包

**Create:** packages/plugins/src/plugin-context-v4.ts；packages/plugins/test/plugin-context-v4.test.mjs。
**Interfaces:** PluginV4ContextSchema/type；validatePluginV4Context(value:unknown):PluginV4Context。

- [x] 独立context向量先RED：MODULE根、父范围/链、TYPE/callable、partial保留、缺scope、重复subject、cycle/foreign与不支持效果被误标COMPLETE。
- [x] 复用旧Code/Source/inventory入口验证，显式保留全部新syntax；新kind不经ARTIFACT伪装。一次构建scope表作必要闭包，不新增公有可信scope旁路。
- [x] 单文件GREEN及Plugins build；旧V3/V2结果与cap保持，不修改旧检测F0/public index。

## C4：严格领域草稿、统一注册/验证/追踪

**Create:** packages/plugins/src/framework-draft.ts；packages/plugins/test/framework-draft.test.mjs；scripts/test-binding-sufficiency-contract.mjs（仅import上述四测试）。
**Modify:** package.json test只追加这一个root；fixtures/phase1/syntax-contract/fixture.json、fixtures/phase1/plugin-context/fixture.json仅新增子目录输入/expected路径。
**Interfaces:** FrameworkDraftSchema/type；validateFrameworkDraft(context:unknown,candidate:unknown)冻结返回；schema/codeatlas.framework-draft version1及FRAMEWORK_DRAFT，精确六类proposal见spec§6。

- [x] 缺入口RED；手写各草稿正例、wrong ref/digest/key、乱序support等键不变、id/confidence额外字段拒绝、parseRuntimeFactSet拒绝草稿。
- [x] 复用Runtime signature/ref/枚举，不另造可发布Runtime IR或生成分数；标准crypto/安全JSON，无规则注册器。
- [x] 注册现有两Fixture根的binding-sufficiency/inputs.json、expected.json，冻结在产品前；不增加Fixture ID或结构计数守卫。
- [x] 集中构建/新旧测试/注册/架构/范围格式；原范围问题统一修复，无微步骤确认。
- [x] 更新ADR-020、CANONICAL_IR/NATIVE_IPC/PLUGIN_SPI、方向提案/路线、DESIGN_AUTHORITY/TRACEABILITY、WBS/ACCEPTANCE/CURRENT_STATUS，明确仅合同出口。一个results索引记录实际通过数/失败/输入源码身份及未执行项。

## 推荐命令（仅获本包批准后执行）

按依赖顺序构建IR、Providers、Plugins；Runtime/Storage源码未变时不机械重建。

    node node_modules/typescript/bin/tsc -p packages/ir/tsconfig.json
    node node_modules/typescript/bin/tsc -p packages/ir/tsconfig.type-tests.json
    node node_modules/typescript/bin/tsc -p packages/providers/tsconfig.json
    node node_modules/typescript/bin/tsc -p packages/plugins/tsconfig.json
    node --test --test-concurrency=1 scripts/test-binding-sufficiency-contract.mjs
    node --test --test-concurrency=1 packages/ir/test/syntax-evidence-v2.test.mjs packages/ir/test/phase1-ir.test.mjs packages/providers/test/native-binding-contract.test.mjs packages/providers/test/native-code-syntax-request.test.mjs packages/plugins/test/plugin-context-v3.test.mjs packages/plugins/test/plugin-spi-v2.test.mjs packages/plugins/test/framework-detection.test.mjs
    node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs
    node scripts/check-architecture.mjs
    node node_modules/prettier/bin/prettier.cjs --check [本包实际修改TS/JS/JSON]

开发时只跑所属新文件；C1–C4收尾统一做上述一次。没有真实Rust/Native或DB时不复跑C包SQLite/428旧全批、既有测量/校准。F1-D原始流/门禁只按源码适用性复用，不将新schema套旧捕获或计成新PASS。

## 任务追踪与依赖

|任务|依据/Fixture|可验证完成条件|
|---|---|---|
|C1|spec§2–5；p1-syntax-contract-v1/binding-sufficiency|新旧版本严格；8kind/source/支持/解析等级一致；不制造值/身份|
|C2|spec§1–4；同根raw/request向量|固定7结构可验证，旧6拒绝新对象；不声称完整字节流|
|C3|spec§5；p1-plugin-context-v2/binding-sufficiency|scope表/父范围/效果target闭包与冻结、partial诚实保留；旧context不扩|
|C4|spec§6–8；同Plugin根草稿向量|严格六类/支持/键与Runtime拒绝；注册/类型/架构/文档齐备|

C1→C2/C3→C4；C2/C3理论上可独立，但本会话仍顺序，避免重复准备与审批。批内不拆字段/框架审批，原范围修复统一处理。

## 退出与后继（不预先授权）

只接受B_F2A_BINDING_CONTRACT_LOCAL_EXIT。随后统一设计/批准producer+完整reader+normalizer+历史衔接，再统一绑定器/四规则与独立API/Fixture矩阵；语义置信和Canonical Runtime/Application发布另有证据门禁。不是Phase1范围减少或DEFERRED。

用户已明确批准本合同与C1–C4并顺序实施；此批准不延伸至下述后继实现/实际进程。没有申请或使用云端额度。

作者计划审查：四框架共享新增语法/草稿合同，先把schema/引用责任点一次定义，避免后继逐框架再补字段；没有实现通用数据流引擎。Source/AST枚举是后继producer义务，本包仅以声明式向量验证合同，不冒称实际提取正确性。

## 实施结果与作者整包审查 — 2026-10-30

C1：新增Syntax v3与共享payload结构；C2：固定wire7 request/raw schema；C3：V4 context验证scope父链、范围、效果目标及完整性；C4：六类严格领域草稿、支持/引用闭包、独立去重键与Runtime拒绝，完成一个根注册和两处既有Fixture路径追加。没有完整reader、producer、normalizer、history或四框架extract。

最终一次集中验证：新根15/15；声明的七文件旧版兼容189/189；Fixture注册35/35；IR/Providers/Plugins构建和IR类型检查成功；架构17项目及本包17文件格式检查通过。[准确命令、身份及失败索引](../../../.superpowers/sdd/2026-10-30-phase1-binding-sufficiency-contract/results.json)。12个受保护旧文件逐字节不变；IR index只追加export、package只追加一个测试入口，两manifest只增加路径且旧值保持。原始Fixture与修订冻结校验通过，格式化前后JSON值一致；这是保存基线的范围检查，不是Git diff或全库清洁声明。

保留的失败及纠正：首次IR构建的Zod枚举拓宽/品牌比较错误已修；独立ARTIFACT占位digest违反既有raw hex64规则，保留原r0/初始冻结后只修raw与匹配Canonical值，successor明确不是产品前冻结，不降低校验。作者审查复现TYPE未核对真实Code TYPE/name、raw scope subject/owner不一致两处缺陷（2个RED），现于各自职责点修复并纳入15个GREEN。没有独立代理评审。负例、草稿键与预期由声明式向量独立定义，不代表真实AST/API语义正确性；旧捕获/历史失败未改写。

只接受B_F2A_BINDING_CONTRACT_LOCAL_EXIT，父任务仍4/21（17项未关闭），P1-04..07/E01/E02及Phase1 OPEN。A6 NOT_QUALIFIED、空profile目录、Native超时UNKNOWN及原风险保持。下一集中包应先完成新版本producer/完整reader/normalizer/历史，再统一绑定器与四框架规则；语义置信及Canonical发布另有门禁。本次无Rust/Native/DB/helper/collector/model、数值/依赖/迁移、云端CI或Git写入。
