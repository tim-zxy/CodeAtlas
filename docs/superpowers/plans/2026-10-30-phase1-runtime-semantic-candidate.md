# B-F3 Runtime领域候选集中实施计划

> **For agentic workers:** 具体方案获批后使用superpowers:executing-plans，在当前会话顺序执行。用户禁止自行新增代理/会话/工作树、Git写入；不逐任务确认。

**Goal:** 将固定四框架声明草稿转换成通过现有Runtime IR parser的合同/任务/资源候选，保持完整图/发布限制。
**Architecture:** 复用Context4、现有binder/固定规则和RuntimeFactSet v1；一个私有compiler，独立固定政策和provider-independent身份，不做通用策略框架。
**Tech Stack:** 现有TypeScript/Zod/Node crypto/node:test，无新依赖。
**Spec:** [B-F3精确设计](../specs/2026-10-30-phase1-runtime-semantic-candidate-design.md)。
**Status:** 用户已明确批准整包，Q1–Q3达到B_F3_RUNTIME_DOMAIN_CANDIDATE_LOCAL_EXIT。0.5/HEURISTIC为独立获准规范约定，不继承Syntax授权，不声称已完成测量。

## Global Constraints

工作目录沿用C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas。D盘旧checkout和破损Git链接不动，不reset/stash/stage/提交/推送。无真实Source读写、Native/Rust/helper/collector/DB/模型、迁移、profile、新依赖或云端CI。只执行获准的普通Node本地组件测试/构建。

严格遵守设计§2政策、§4映射、§5键/支持及§6累计上限。图/flow/入口数组为空是已声明本包边界，不代表原能力完成；coverage必须PARTIAL。不能为了通过测试默改原Runtime IR、未知namespace/schema、AUTO/MANUAL或Phase1门槛。

## Review Focus

- 把旧Syntax授权/结构Fixture分数当语义政策，或让caller JSON选分数：Q1/Q2。
- 把数据操作或依赖草稿变虚拟入口/Code CALL；把合法空候选当删除Runtime指令：Q2。
- 未知namespace的同名集合跨receiver合并、同一receiver被不同方法使用却不合并：Q1/Q2。
- 用历史origin或草稿ID冒充current Syntax支持；缺Source/Code支持或跨basis：Q2。
- 逐实体重复引用导致衍生输出绕过上限；顺序影响归并/键或提高分数：Q2/Q3。

## 准确文件清单

产品新增：packages/plugins/src/framework-runtime-candidate.ts（compiler、固定政策、tuple身份及有界归并，先不拆单实现策略类）。
产品修改：
- packages/plugins/src/framework-extraction.ts：仅提取已验证Context的共享规则入口，保持旧unknown入口及全部行为。
- packages/plugins/src/framework-draft.ts：仅复用现有canonical JSON实现的私有模块导出，旧键/创建/验证保持。

新增测试：packages/plugins/test/framework-runtime-candidate.test.mjs。复用现有test/helpers/framework-binding-fixture.mjs的结构装配入口，不向其塞预期生成或语义政策。
新增Fixture：fixtures/phase1/plugin-context/runtime-candidate/inputs.json、expected.json。
登记：原fixtures/phase1/plugin-context/fixture.json的inputs/expected各加runtimeCandidate路径；原scripts/test-framework-binding-extraction.mjs追加新测试import一次。不增加root/package.json项、新ID、库存计数或capability广告。
治理：本设计/计划/作者评审、CURRENT_STATUS、PLUGIN_SPI、CANONICAL_IR（新支持用途说明）、DESIGN_TRACEABILITY、WORK_BREAKDOWN、PHASE_ACCEPTANCE及B-F2收敛路线。保留原证据；不得提交.superpowers/.pnpm-store。

## Q1：独立政策/语义映射/身份Fixture

**依赖：**已交付B-F2-C，及用户对本包独立数值/语义边界的明确批准。原98/98不是新政策批准。
**产物：**上述两份JSON及新测试文件。输入可复用旧四框架声明形状；预期必须独立写出，不运行compiler生成。

- [x] 冻结policy、MESSAGE方向、ScopeTuple/SemanticTuple和四类领域输出的字面预期；加入旧Syntax规范0.5/较高Code支持、低Code支持拒绝、未知Syntax方法或篡改其旧值拒绝、固定理由顺序/HEURISTIC、不借Syntax method的案例。
- [x] 同Fixture完整覆盖设计§6每个等价类，特别是两receiver同名集合、同receiver多方法、支持删除/跨basis、空候选、无虚拟图和累计单位。
- [x] 用现有validatePluginV4Context/parseRuntimeFactSet检查输入/独立预期的strict结构和闭包。该检查只防止Fixture重复ID等准备缺陷，不能当语义实现通过。
- [x] 冻结文件身份，运行新测试记录缺compiler API的RED；区分API缺失与行为RED，原准备失败保留。已有keys/原98例不改。

**完成条件：**输入和预期可被既有schema解析；policy/映射/身份/反例都有实际字面断言，新增API确实缺失。不得把本准备任务签为B-F3产品出口。

## Q2：一个真实Runtime领域compiler

**接口：**compileFrameworkRuntimeCandidate(input,framework):FrameworkRuntimeCandidate，严格遵照设计§3；输入只有Context4和固定framework selector，不接policy/任意draft/SQL端口。
**依赖：**Q1；三类修改在同一会话顺序完成，不按框架开子任务审批。

- [x] 在旧framework-extraction提取validated-context helper；旧入口先验Context一次，不放松原草稿校验。
- [x] 从现有framework-draft导出同一canonical JSON函数，不复制第二套排序编码。新compiler内用标准crypto实现设计§5固定tuple域。
- [x] compiler从当前fixed规则得到草稿，执行独立政策的全部条件，生成Contract/TaskDefinition/DataResource；严格保持空entry/trigger/context/node/edge/flow与PARTIAL coverage。
- [x] 按语义核心归并、支持/来源并集及确定anchor，构造真实current Syntax支持，补完整externalRefs/inventory；累计输出单位先检查再保留，不让多支持者提高分数。
- [x] 最终用parseRuntimeFactSet验证整个固定envelope，冻结候选；合法证据不足记limitation，结构/身份冲突及上限失败不返回半包。
- [x] 新测试GREEN，精确核对payload、支持digest、身份、policy/reasons/coverage与重排/删除结果。所有数值来自获批政策，不来自测试临时回调。

**完成条件：**四框架现有已覆盖声明得到正确领域候选；未覆盖草稿/缺证据保持限制；无公开路由、Store写入、模型或Runtime图占位。

## Q3：集中验证、作者评审与文档验收

**依赖：**Q2。共享规则导致Q1/Q2不可按新任务并行；Fixture/算法原则可独立审查，仍顺序执行。

- [x] 原Fixture登记两个路径、原root只追加一次新测试，不改已有测试预期/计数。
- [x] 运行以下范围匹配批次，集中修复原范围问题；修正后只重复受影响检查，保留旧失败，不自动重试到绿。
- [x] 作者以Review Focus单独审查完整候选链及旧入口兼容，记录发现/修复/未决项。遵守用户禁止新代理，明确是作者审查。
- [x] 文档追踪每项Fixture/门禁/来源和未覆盖目标，CURRENT_STATUS记录新鲜命令与准确数量；只有全部本包条件满足才勾完成。
- [x] 记录B_F3_RUNTIME_DOMAIN_CANDIDATE_LOCAL_EXIT；不关闭完整Plugin、图/flow/发布、真实资格、原Phase1/E01/E02。

## 最小本地批次

Node使用D:/Program Files/nodejs/node.exe，在上述C工作树：
1. Plugins构建：node node_modules/typescript/bin/tsc -p packages/plugins/tsconfig.json；IR源码不改，复用已构建IR。
2. TDD定向：node --test --test-concurrency=1 packages/plugins/test/framework-runtime-candidate.test.mjs；初始RED、集中GREEN，必要原范围修复复验。
3. 完整本包root：node --test --test-concurrency=1 scripts/test-framework-binding-extraction.mjs（包含原98例及新文件，最终按实际输出计数，不设总数门槛）。
4. 旧兼容只跑packages/plugins/test/framework-draft.test.mjs、plugin-context-v4.test.mjs、framework-detection.test.mjs、plugin-context-v3.test.mjs和packages/ir/test/phase1-ir.test.mjs。
5. Fixture注册：packages/evaluation/test/fixture-manifest.test.mjs、fixture-registry.test.mjs；无新Fixture ID，不改库存计数。
6. 架构node scripts/check-architecture.mjs；现有Prettier只检查本包命名TS/JS/JSON/MD。不复制旧Rust/Native/Store/校准矩阵。
7. 一个本包results索引记录命令、退出码、实际数、原失败、必要文件身份/原证据适用范围；不增加多个内容相同的审计器。

## 追踪与未实施后继

Q1→设计§2/4/5→p1-plugin-context-v2/runtime-candidate独立预期。
Q2→设计§3/4/5/6→同Fixture全部语义、支持、身份与失效案例。
Q3→设计§7→root/旧兼容/注册/架构/格式及状态文档。
原Quality Gate保持PHASE_ACCEPTANCE，不从本包case数导出precision/recall或真实运行资格。

设计§8明确后继ExecutionGraph/RuntimeFlow、匹配、Application资格与R012/R013发布依赖。没有相应详细SQL/数值/真实资格之前，不允许将本包解释为那些工作的实施授权。未获本包批准前，Q1–Q3均NOT_STARTED，不安装policy占位实现。

## 实施结算 — 2026-10-30

新组件23/23，root121/121（含新23），旧兼容113/113，注册35/35，构建exit0/架构17项目/本包范围格式通过。作者审查强化原23项后只复验新文件23/23，既有98例/root早期完整收据保留；不虚称重跑所有检查。新Fixture含13个声明输入，并以同一测试文件装配作用域、失效、政策及10000/10001单位边界；无新Fixture ID或capability。

[作者整包评审](../reviews/2026-10-30-phase1-runtime-semantic-candidate-implementation-review.md)明确API RED、构建品牌类型失败、补强断言和未覆盖真实资格；[命令/准确计数/身份索引](../../../.superpowers/sdd/2026-10-30-phase1-runtime-semantic-candidate/results.json)。DEPENDENCY与哈希碰撞不可经固定真实入口制造，不为勾选要求新增任意草稿/哈希注入API；其不生成事实/冲突硬拒绝边界通过代码审查，未冒称运行覆盖。Phase1父任务和§8后继保持OPEN，未执行Native/DB/CI/Git写入。
