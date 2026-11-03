# Phase1 B-F0 四框架依赖检测实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。本会话顺序执行，不新增代理、会话、工作树或 Git 写入。

**Goal:** 一次交付四框架纯 IMPORT 依赖检测及独立 Fixture，不把检测当语义抽取验收。
**Architecture:** 复用 Plugin V2 context/detection 校验与原 Fixture ID；一个私有模块、一个行为测试文件，不增加公开 API、状态或注册平台。
**Tech Stack:** 既有 TypeScript、Node、IR/Zod；无新依赖。
**Spec:** [B 批设计与首包合同](../specs/2026-10-29-phase1-framework-detection-design.md)。
**Status:** 用户已批准并顺序实施；B_F0_FRAMEWORK_DEPENDENCY_DETECTION_LOCAL_EXIT。

## Global Constraints

准确工作树 C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；保留 D 旧目录、本地变更、原 Fixture/失败和 .superpowers。不调用真实 Git/Native/helper/collector/模型，不做 calibration/profile/新数值/依赖/云端 CI/Git 写入。A6 失败状态、主任务4/21及既有 C1/timeout/main/R4 风险不变。

## Review Focus

- import 存在不证明 route/receiver 绑定：所有结果只标依赖检测，E01/E02不关闭。
- 相近命名空间不命中：点边界 oracle。
- 正例不能依赖虚构外部 code node：主正例使用实际允许的 unresolved import originalHint。
- 多框架重叠不能只取第一项：Spring/Kafka双结果。
- 无关 schema/registry/EOL变动：新增同一Fixture路径和唯一测试入口，不改全局计数。

## 单一合并任务：检测、Fixture、注册与集中验收

**Files:**
- Create packages/plugins/src/framework-detection.ts
- Create packages/plugins/test/framework-detection.test.mjs
- Create fixtures/phase1/plugin-context/inputs/framework-detection.json
- Create fixtures/phase1/plugin-context/expected/framework-detection.json
- Modify fixtures/phase1/plugin-context/fixture.json：仅增加两条 inputs/expected 路径，capability保留原语义；Fixture仍是V2合同/组件用例。
- Modify root package.json：在现有 plugin-spi-v2 对应根测试链后只追加一次新测试文件。
- Modify 本设计/计划、CURRENT_STATUS、PLUGIN_SPI、DESIGN_TRACEABILITY：简短批准/结果与限制。

**Consumes:** 已有 Canonical IMPORT / SourceFile、validatePluginV2Context、validatePluginV2Detection。
**Produces:** 私有 default detectFrameworkDependency(context,framework)→PluginV2Detection；精确行为按设计字段与排序。不改 packages/plugins/src/index.ts，不引入 factory 占位。

- [x] 先冻结独立 literal Fixture：四正例、namespace碰撞/同名无import、alias/star、EXACT/HEURISTIC/歧义、缺语言/位置、Spring-Kafka重叠、删除/重排、非法context/selector；expected支持与诊断手写，不调用产品生成。案例数由实际清单得出，不新增门槛。
- [x] 写行为测试，动态 import 私有 dist 模块后 deepEqual 完整输出；首次运行观察缺模块 RED，保留准确输出。旧 V2 正向输入尽量复用，避免重复构建复杂大样本。
- [x] 实现一个固定规则模块，纯索引/遍历，无缓存/规则DSL。严格复用 V2 验证；对已验证内部对象不层层克隆。具体诊断 code/message 和排序按设计，不新增产品配置。
- [x] 本地构建 plugins 后运行新行为文件至 GREEN；批准范围缺陷直接修复，不逐微步骤询问。需要范围/契约修订才停相关工作。
- [x] 集中运行新文件 + 既有 plugin-spi.test.mjs、plugin-spi-v2.test.mjs、plugin-routing.test.mjs。运行 evaluation 的 fixture-manifest.test.mjs 与 fixture-registry.test.mjs；没有新增ID，原Fixture数量保持，但以实际输出为准。
- [x] 运行 node scripts/check-architecture.mjs 一次；格式仅新TS/测试/两JSON/Manifest/package.json。不运行根 verify、完整 pnpm test 或任何 Native。
- [x] 作者审查身份/支持/负例/无越界；同一结果索引记录命令、失败、计数、适用性并同步上述追踪文档。保持已接受规则的测试门禁，不为通过删负例。

准确本地命令：使用既有 Node 与仓库已安装 pnpm/tsc；不联网安装。

    pnpm --filter @codeatlas/plugins build
    node --test packages/plugins/test/framework-detection.test.mjs
    node --test packages/plugins/test/framework-detection.test.mjs packages/plugins/test/plugin-spi.test.mjs packages/plugins/test/plugin-spi-v2.test.mjs packages/plugins/test/plugin-routing.test.mjs
    node --test packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs
    node scripts/check-architecture.mjs

局部开发新测试与最终合并测试有重叠，不累计为独立覆盖；最后仅以对应最新结果报告。

## 退出与审批

出口限定为 B_F0_FRAMEWORK_DEPENDENCY_DETECTION_LOCAL_EXIT；无任何实际框架语义、生产API、Store/迁移或 Phase1 主任务验收。未执行的真实观察/E01/E02仍 OPEN，不能记N/A。
批准本设计与本任务后，Fixture→检测实现→最小验证→文档收尾连续执行，无需四框架分开或逐步骤审批。一次整包确认涵盖本包新增固定依赖检测语义，不涵盖尚未具体设计的 F1/G/X。

作者计划自审：四个固定规则共用已有 context/detection 输出，避免四次重复基础设施；无新增支持schema、数值、依赖或migration。关键限制是此包只识别 IMPORT 依赖，这一限制在设计、Fixture命名、完成状态和E门禁中一致。

## 实施结果与作者审查（2026-10-29）

[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-framework-detection/results.json)记录准确命令、全部失败、源码身份及边界。一个私有default检测模块复用V2，四框架按已批准namespace规则检测Canonical IMPORT，无public index/factory/route/Store/IR/SQL变化。根package.json去掉唯一新测试追加后与修改前字节一致，未混入换行变化；Manifest仅增加两个路径，原向量不改。

独立语料32个合法场景、3个非法输入；第一轮引用缺factType NODE，属Fixture缺陷，原字节与失败已保留，未算有效产品RED。修正后context校验PASS1/缺模块FAIL35，先于产品实现冻结；首次GREEN36。作者审查补充一组独立诊断位置排序案例，最终四个新旧Plugin文件74/74通过（含新F0 37，不与开发轮相加）。plugins最终构建exit0、Fixture manifest/registry35/35、架构17项目、六个匹配文件格式通过。

作者审查涵盖命名空间碰撞、同名无import、alias/wildcard信息边界、EXACT/HEURISTIC/歧义、框架重叠、支持/诊断排序去重、删除后无缓存及非法输入拒绝。没有新增独立评审或代理。未重跑未变A5/Stage/Store/Native或全仓测试。

仅交付依赖检测，不证明框架使用点/route/数据操作/合同或版本成熟度；E01/E02、P1-06/07、B批和Phase1继续OPEN，主任务4/21不变。A6仍未获资格，历史Native timeout仍UNKNOWN；无真实Git/Native/helper/collector/模型、数值/依赖、CI或Git写入。下一项是B-F1证据绑定与语义候选详细设计，按原统一方式集中呈现，不创建空factory/迁移或通用解析平台。
