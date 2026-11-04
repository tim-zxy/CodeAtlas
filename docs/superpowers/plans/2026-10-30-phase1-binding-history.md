# B-F1-C 版本化历史与本地原子发布集中实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans；本会话顺序，无新增代理/会话/工作树或Git写入。

**Goal:** 在保留旧版本/预算/恢复语义的前提下，将完整声明式v6→v2接入既有History与SQLite原子发布。
**Architecture:** 固定新入口，必要共享核心；R011表与Store事务不重建，按真实envelope版本选择严格parser/摘要。
**Tech Stack:** 现有TypeScript/Node/Zod/SQLite；无新依赖、Rust生产代码、数值或profile。
**Spec:** [B-F1-C设计](../specs/2026-10-30-phase1-binding-history-design.md)。
**Status:** 用户已批准C1–C4整包；B_F1C_VERSIONED_HISTORY_LOCAL_EXIT（声明式本地范围，见实施结果）。

## Global Constraints

沿用C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas，保留D目录/本地文件/EOL/原Fixture/.superpowers。Git元数据失配不修复，不reset/stash/stage/commit。仅新增本包受控Source/临时SQLite；无真实Git/Native/Rust测试执行/CLI/helper/collector/model、校准/profile、云端CI或Git写入。已有r1捕获只读复用且核对身份，缺失即报告，不启动producer补齐。

SQLite schema11、body/manifest schema1、Syntax envelope1/2；v1原域不变，v2三域由设计固定。UNKNOWN与原置信值不变；PARTIAL仍拒绝发布。Binding新工厂不连mixed-execution/生产路由。

## Review Focus

- envelope2带v1 hash、origin/projected版本错配或删字段：必须拒绝，不能投影发布。
- retained同ID但scope支撑换文件/消失：完整旧/新Code与文件证明重新核验；无同名猜配。
- 合约升级且Source未变：全部Native单元观察，不能NO_OP；不另加无依据FULL限制。
- 实际r1是PARTIAL：作为拒绝控制，不能充当成功事务证据。
- 预算错误、CAS/事务失败：同账本费用不归零，原Code+Syntax+指针一致地保留last-good。

## 文件与接口清单

产品Modify（11文件；Store方法体/SQL/公开index/混合执行器原则上不改）：
1. packages/providers/src/syntax-history-candidate.ts：固定v2 pair、按实际版本retained、兼容manifest，旧wrapper固定v1。
2. packages/providers/src/native-composition-input.ts：固定v6 metadata/raw准入，同账本。
3. packages/providers/src/native-composition.ts：固定v6 Code/Evidence组合及原始身份。
4. packages/providers/src/declared-delta-raw-observation.ts：v6增量范围与删除投影。
5. packages/providers/src/declared-delta-raw-support-candidate.ts：完整/增量v6历史候选，共享旧核心。
6. packages/storage/src/analysis/activation-history-format.ts：明确版本与域、v2 Source/Code上下文。
7. packages/storage/src/analysis/activation-history.ts：仅必要的类型/读取衔接；查询/预算结构保持。
8. packages/storage/src/analysis/mixed-analysis-stage.ts：新版本/合约/raw与完整origin闭包重核。
9. packages/runtime/src/mixed-analysis-validation.ts：Binding固定准入规则。
10. packages/runtime/src/mixed-analysis.ts：createBindingMixedAnalysisRules、v2 mapper/pair及retained衔接。
11. packages/providers/src/native-binding-stream.ts：仅若组合层需要精确固定6返回类型时收窄类型，不新增运行语义或包装层。

第7/11项若现有泛型/类型无需改动，直接复用，不为满足文件清单而编辑。共享函数仅放真正需要的内部模块，新增named符号前核对public index不转发；如提取一个共用核心比在私有旧模块保持固定入口更复杂，沿原模块最小修改。不得为新模式另复制全pipeline。

Test Create：packages/providers/test/syntax-binding-history.test.mjs、packages/storage/test/binding-history-capture.test.mjs、packages/runtime/test/binding-history-publication.test.mjs；scripts/test-binding-history.mjs仅汇总三文件，root package.json追加该一个入口。
Fixture Create：三个既有根下各 binding-history/inputs.json、expected.json；syntax-contract 下再建 binding-history/source.py（独立无缺失观察正例）。Modify三个fixture.json仅追加路径。复用旧helpers；确有新共享测试准备才提取一个test helper，不设通用builder。

## C1：版本化pair、重投影与H1读契约

**Consumes:** B-F1-B v2 payload、现有basis/Source/Code/support、不可变祖先历史。
**Produces:** createBindingSyntaxHistoryPair、reprojectBindingSyntaxHistoryPair、createVersionedSyntaxHistoryManifest；Storage现有validateSyntaxEnvelope/Pair可明确识别1/2。

- [x] 先冻结独立输入/expected：v1原控制、v2 initial/origin/projection域、错版本/错域、scope支持遗漏、MODULE null证明、retained当前支撑变化、意义不可变。
- [x] 新接口缺失/当前严格v1导致RED；保留实际输出。
- [x] 实现设计§3/4/6。Provider旧入口仍拒绝v2；兼容manifest按origin自身版本分派，不自动提升v1。
- [x] 运行IR/Providers/Storage受影响构建，再运行新pair/H1读取测试及旧activation-history、syntax-normalizer和history-resource控制。
- [x] 完成条件：v1旧字节/摘要/预算结果不变；v2完整字段在内存候选及H1值校验中保留。H1正例可由现有测试专用literal seed构造，不能称产品Apply已完成；真实持久正例由C3负责。

## C2：固定v6组合与累计账本

**Consumes:** 严格原始v6 bytes、既有metadata/Java已结算owner/完整目标或增量范围。
**Produces:** readBindingCompositionInputsWithBudget、composeBindingProjectionForHistory、prepareDeclaredBindingDeltaRawObservationWithBudget、composeDeclaredBindingDeltaRawSupportCandidateWithBudget、composeDeclaredBindingFullRawSupportCandidate。

- [x] 在同一个Providers测试文件中增加完整input/增量input、缺owner/范围、缺终端/坏checksum、budget已耗尽、失败费用续接的RED。
- [x] 固定选择v6 reader；沿用原Code规范化/Evidence、单snapshot和unitId，不修改原始JSON版本后交旧reader。
- [x] 新入口要求精确Binding合约标签；旧接口仍固定v5。原coverage facet/单位集合与COMPLETE门禁保持。
- [x] 只读加载已保存r1实际两条raw，核对原SHA与metadata关联，证明它们在完整观察门禁以INCOMPLETE_OBSERVATION拒绝。实际产物测试由CODEATLAS_BINDING_LIBRARY_OUTPUT显式启用；指定目录但缺产物即失败，不生成golden替代或启动Native。普通注册套件未指定该变量时显式skip这两条，不依赖未提交.superpowers来保持基本可运行；该普通PASS不替代实际拒绝证据。与独立声明式正例分别记录。
- [x] 完成条件：没有字节身份漂移、账本重置或费用遗漏；新模式不进入旧公开入口，原v5组合旧向量仍通过。

## C3：Stage→Store→重开读取闭环

**Consumes:** C1/C2、现有Source/capture/Stage/Store以及controlled测试目录。
**Produces:** createBindingMixedAnalysisRules():MixedAnalysisRulesPort；本地真实SQLite中的完整v2原子提交及H1读取。

- [x] 新Runtime publication文件先写RED：独立COMPLETE v6 FULL、同版本DELTA/retained、合约升级重观察所有Native单元、删除-only/NO_OP/空FULL、v1祖先到v2当前、未知版本、PARTIAL拒绝。
- [x] 使用新固定工厂；旧工厂不改变。Source权限、临时SQLite、Stage/CAS/lease与Store调用沿既有helpers，绝不直接SQL产品发布。
- [x] 事务边界注入一次v2写入失败并验证Code/Evidence/Syntax/history/指针均保持last-good；复用既有失败工具，不新增故障framework/Node退出helper。只读重开确认v2和祖先v1均可校验。
- [x] lexicalScope仅凭Code/Evidence/文件真实支撑；缺失或meaning漂移拒绝，原origin不可变。
- [x] 新预算控制集中验证累计bytes/items与Stage五维cap、必要分配前付/失败结算；不为每种语法或每个内部副本复制旧资源矩阵。旧Store事务/ABA/提交未知实现未改时引用原对应证据，新增字段只测确有新触发点。
- [x] 完成条件：新测试通过真实Stage和Store，old-v5/v1控制仍通过；原Store方法体/SQL不改或发现必要变化时先举证，不能靠放宽其比较通过。

## C4：集中验证、追踪与作者审查

- [x] 注册一个汇总入口/三Fixture根路径，不新建Fixture ID或全局计数守卫。
- [x] 连续修复原范围缺陷，做一次整包作者审查（不新增代理）。只有真实新契约冲突再集中确认。
- [x] 更新ADR-020、CANONICAL_IR/NATIVE_IPC与既有R011 Stage合同、DESIGN_AUTHORITY/TRACEABILITY、WBS/ACCEPTANCE和CURRENT_STATUS；只更新受影响段，保留历史，不复制整段收尾到无关文档。
- [x] 一份results.json索引准确命令/代码输入身份、失败/新旧结果与未执行项。前置证据只记复用，不累加到新测试数；所有验证以实际行为结果为准，不预设通过数。
- [x] 检查SQL/依赖/public index/生产路由与旧Fixture未被顺手修改；本包退出不关闭父任务或生产资格。

## 推荐验证命令（批准后执行）

开发只跑所属新文件；每个相关包变化后按依赖构建，不对纯文档更新再构建。收尾统一：

    node node_modules/typescript/bin/tsc -p packages/providers/tsconfig.json
    node node_modules/typescript/bin/tsc -p packages/storage/tsconfig.json
    node node_modules/typescript/bin/tsc -p packages/runtime/tsconfig.json
    node --test --test-concurrency=1 scripts/test-binding-history.mjs
    node --test --test-concurrency=1 packages/storage/test/activation-history.test.mjs packages/storage/test/r011-history-migration.test.mjs packages/providers/test/syntax-normalizer.test.mjs packages/providers/test/native-binding-stream.test.mjs packages/providers/test/native-composition-input.test.mjs packages/providers/test/native-composition.test.mjs packages/runtime/test/mixed-analysis.test.mjs packages/runtime/test/mixed-analysis-validation.test.mjs packages/storage/test/mixed-analysis-retained-origins.test.mjs packages/storage/test/mixed-analysis-noop.test.mjs packages/storage/test/mixed-analysis-full-reestablishment.test.mjs packages/storage/test/mixed-analysis-deletion.test.mjs packages/storage/test/mixed-analysis-store-refusals.test.mjs
    node --test --test-concurrency=1 packages/evaluation/test/fixture-manifest.test.mjs packages/evaluation/test/fixture-registry.test.mjs
    node scripts/check-architecture.mjs
    node node_modules/prettier/bin/prettier.cjs --check [本包实际修改的TS/JS/JSON]

本包最终新root须显式设置CODEATLAS_BINDING_LIBRARY_OUTPUT=<本工作树>/.superpowers/sdd/2026-10-30-phase1-binding-observation/library-output/r1，执行实际拒绝控制后移除；未执行/skip不得计为通过。普通注册不需要该私有产物，不能让后续干净checkout的基础测试因缺.superpowers失败。

现有schema11迁移测试只用受控临时DB，验证旧R011保持，不生成新迁移。Node标准测试执行属本地组件验证；不批准另起测量helper/崩溃worker或运行完整mixed Store root（其含真实退出子进程）。若上列文件引入新child行为，先用名称选择必要非child控制或复用其未变证据，并记录准确selector，不猜测/静默省略必需门禁。

## 依赖与审批边界

C1→C2→C3→C4；候选/原始流/Store状态共享，按用户要求顺序，不能并行长测。真正可独立的只有C1纯值与只读H1分支，但本包也顺序实施，避免重复准备/审查。

一次批准覆盖上述版本域/Binding合约身份及全部Fixture、源码、本地Source/SQLite验证、原范围修复与追踪。无逐微步骤批准；无真实Native/新Rust运行/依赖/数值/云端或Git写入。批准前不改产品、Fixture或测试/DB的限制已由本次整包明确批准替代；后继未知范围仍不实施。后继覆盖语义/FastAPI完整生产路径与四框架extract另行设计；不从本包成功推导这些范围可实施。
## 实施结果与作者审查 — 2026-10-30

C1–C4已顺序完成：按真实envelope1/2分派pair/H1，v2使用三项独立摘要域；固定v6组合和私有Binding规则，经既有Stage/Store真实SQLite事务、重开与v1祖先校验。完整声明式FULL、同版本DELTA、合约升级全Native重观察、retained、删除-only、NO_OP、空FULL与失败回滚均通过。两条已有真实r1 PARTIAL原始bytes保持身份并明确拒绝；没有真实COMPLETE Native发布证据。

新鲜最终门禁：新汇总16/16（实际拒绝控制2项已显式启用，0skip）、13文件旧路径428/428、Fixture注册35/35、三包构建、架构17项目与24文件格式通过。C1中间160控制是重叠开发证据，不累计。准确命令、输入/源码身份、初始RED和构建/清理失败保留在[唯一结果索引](../../../.superpowers/sdd/2026-10-30-phase1-binding-history/results.json)；[范围身份核验](../../../.superpowers/sdd/2026-10-30-phase1-binding-history/scope-and-identity.json)。

作者整包审查发现Binding工厂raw-free NO_OP可绕过精确合约：新增失败测试review-contract-red复现，在共享compose入口修正后review-contract-green通过，再运行最终新旧套件。没有独立评审或新代理。Deferred minors：无。

Rulings：复用共享H1 validator，activation-history.ts无需修改；native-binding-stream仅收窄budgeted返回类型；因此不为文件清单强改未受影响代码。若判断错误会遗漏读取路径，已由H1、v1祖先与只读重开验证限定。测试清理曾误用release接口，修正测试参数而未放宽产品guard。Fixture冻结时间如实记录：C1/C2原字节先于产品，H1描述文件先于RED但没有事前hash收据，不追认冻结证据。

原Store事务/ABA/未知提交的历史依据复用[原独立评审修复记录](../reviews/2026-10-29-phase1-independent-review-fixes.md)，限于本包未变Store/SQL实现；不把历史288计入本包新鲜结果，新v2事务失败另有真实SQLite测试。公开index、mixed-execution、R011/SQL11、Store事务和依赖锁字节保持；根注册只追加一个入口，三个Fixture只追加路径。

出口仅B_F1C_VERSIONED_HISTORY_LOCAL_EXIT；父任务仍4/21，P1-04..07、E01/E02和Phase1 OPEN。A6 NOT_QUALIFIED；历史Native timeout UNKNOWN、旧link失败/main取消未查/R4 mutable限制保持。没有Native/Rust/helper/collector/model运行、新数值/依赖/迁移、CI或Git写入。后继须处理观察完整性/UNKNOWN与四框架绑定语义，不能由声明式成功推导生产资格。
