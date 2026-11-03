# B-F1-B 绑定观察库闭环集中实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。同会话顺序；不新增代理/会话/工作树/Git写入。

**Goal:** 一次交付MODULE归属澄清、v6库级AST→原始流→TS校验/归一化→V3闭环。
**Architecture:** 新入口明确选新模式，旧wrapper保持；共享原Source/预算/Writer/normalizer核心，History和生产路由仍阻断。
**Tech Stack:** 已有Rust/Tree-sitter、TS/Node/Zod/SQLite值契约；无新依赖。
**Spec:** [详细设计与兼容澄清](../specs/2026-10-30-phase1-binding-observation-design.md)。
**Status:** 用户已明确批准 S1–S4；B_F1B_BINDING_OBSERVATION_LIBRARY_EXIT（本地库组件范围）。

## Global Constraints

工作树C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；不覆盖D目录，不reset/stash/stage/改无关EOL/清宿主worktree。保留旧Fixture、raw、失败与.superpowers；R4 mutable DB不接触。
允许范围拟含Rust库测试及其owned Source读/原始流输出，不含analyzer CLI、真实Git、Native harness/collector/helper、模型、校准/profile、新数字/依赖、CI或Git写入。批准前不执行。
没有新profile时真实入口仍拒绝；旧Native timeout UNKNOWN/C1/A6/main结算均不因本地PASS关闭。

## Review Focus

- 真实MODULE null范围与人工range正例不一致：旧负例保留，增加真实normalized MODULE+SourceFile归属正反例。
- decorator/默认参数owner被误作scope：真实AST oracle，不依赖名字或最近位置。
- 新版本改JSON后交给旧checksum reader：测试实际v6 bytes、严格header/binding/终端与旧拒绝。
- 新字段省略计费/支持：累计budget失败前缀、lexicalScope缺binding/valueDigest拒绝；events/items独立。
- 库PASS被当生产/历史资格：无CLI/Runtime/History修改，实际桥输出和适用性分列。

## S1：独立语料与MODULE澄清

Files：Modify packages/ir/src/syntax-evidence-v2.ts、packages/ir/test/syntax-evidence-v2.test.mjs、packages/plugins/src/plugin-context-v3.ts、packages/plugins/test/plugin-context-v3.test.mjs。
Create fixtures/phase1/syntax-contract/binding-observation/inputs.json、expected.json，以及sources/python-direct.py、python-nested.py、python-scopes.py、java-typed.java、java-scopes.java；同一源内不同site按独立case标识，记录实际清单。

Consumes现有F1-A与真实python-normalizer MODULE shape；produces可选sourceFiles context的精确MODULE归属和V3供值。不是补造SourceRange。
- [x] 先冻结独立源/请求/逻辑expected与scope/身份negative；现有scope-without-range控制保持。
- [x] 新真实形状用例RED，再实现设计§1；IR/Plugins定向GREEN。
- [x] 不修改Canonical Code或Python normalizer现有MODULE含义。

## S2：Rust v6库入口与真实AST字段

Create crates/native-analyzer/src/binding_syntax.rs（请求解码/固定库入口及binding_v6测试）。
Modify crates/native-analyzer/src/{lib.rs,syntax.rs,code_syntax.rs,code_syntax_producer.rs,java_syntax.rs,python.rs}；
Modify crates/native-analyzer/src/python/code_syntax_tests.rs仅必要旧控制/共享测试引用，不重写旧expected。

Produces decode_binding_syntax_request、write_binding_syntax_observation、serve_binding_syntax_request；无main/protocol dispatch广告。Shared核心模式LEGACY/CODE_V5/BINDING_V6仅内部，旧公开接口默认分支不变。
- [x] 库测试先证明缺v6 API/新AST输出RED；实现v6完整请求原字节身份和Writer终端合同。
- [x] 实现scope/valueRange/typed声明，严格按设计支持子集；未知隐式scope=null/coverage限制。
- [x] 旧v4/v5字节/预算/取消控制与新prefix/计数/checksum通过。额外遍历先计费，无校准或预算放宽。
- [x] Rust测试owned输出保留版本、源码/request/工具身份，供S3实际桥；禁用capture时普通测试不写实际桥输出。Capture仅使用测试专用CODEATLAS_BINDING_CAPTURE_ROOT，解析后必须在本包.superpowers/sdd/2026-10-30-phase1-binding-observation/library-output拥有根内；按修订分目录保留，不能覆盖旧输出。不加产品环境键。

## S3：TS完整v6 reader与v2 normalizer

Create packages/providers/src/{native-binding-stream.ts,syntax-binding-normalizer.ts,native-observation-codec.ts,syntax-normalizer-core.ts}。后两者只容纳被新旧入口实际共享的现有核心，不做通用版本registry。
Modify packages/providers/src/{native-binding-contract.ts,native-code-syntax-request.ts,native-code-syntax-ipc.ts,native-code-syntax-stream.ts,syntax-normalizer.ts}：仅提取必要私有共享核心/新入口，旧公共/默认wrapper保持；旧export-star模块不得增加泄漏到public index的新named export。共用函数放新私有核心，旧Error类保持同一导出身份。
Create packages/providers/test/{native-binding-stream.test.mjs,syntax-binding-normalizer.test.mjs}。

Consumes S1/S2与已有composition账本；produces设计§2/4函数，实际v6消费不降级为v5流；normalizeBindingSyntaxObservation经已有Evidence/Binding鉴证并输出v2。
- [x] 新framing/stream/normalizer测试先RED；实现完整文件/引用/终端、schema、累计budget与scope支持闭包。
- [x] 独立v2 identity oracle固定新域/tuple，旧policy原置信值复用，不新增分数。
- [x] 将S2实际Python direct/nested raw经TS reader/Code映射/normalizer→V3，与独立oracle比较；缺actual输出测试失败，禁止fallback golden。
- [x] 新候选调用旧History/Store继续拒绝；用现有v1严格schema控制证明边界，不修改Store源码或跑崩溃worker。

## S4：注册、集中验收、作者审查与文档

Modify fixtures/phase1/syntax-contract/fixture.json：inputs登记bindingObservation JSON与五个sources文件，expected登记bindingObservation JSON；root package.json仅追加两个新Node测试入口。无新Fixture ID/全局计数替换。
同步本设计/计划、F1-A合同MODULE澄清、ADR-020、IR/Native/Plugin规范、DESIGN_AUTHORITY/TRACEABILITY、CURRENT_STATUS、PHASE_ACCEPTANCE/WBS限定适用性。
- [x] 集中运行下表受影响范围，只有相关变化/失败才重跑，不累加开发与最终计数。
- [x] 原范围缺陷统一修复；真正新增合同冲突才再集中确认。若Rust链接失败先保留诊断，不另开target目录或盲重试。
- [x] 一个results索引含准确命令/代码与输入身份、库实际raw/失败、全部未执行项。作者评审，不新增代理；不整仓seal。
- [x] 确认Rust模块/字节流之外无History/SQL/Runtime/public index/依赖变更；保持真实运行拒绝。

## 本地验证清单

采用已安装工具、Cargo --locked，顺序执行；不安装、不联网下载依赖。新源测试不启动analyzer CLI。

    cargo test --offline --locked -p codeatlas-native-analyzer --lib syntax
    cargo test --offline --locked -p codeatlas-native-analyzer --bin codeatlas-native-analyzer protocol::

新binding_v6测试放binding_syntax模块，包含在syntax selector；测试专用capture仍由该库测试产生，不另起Native可执行文件。若既有工具链需环境准备，沿已有可复现方式，不新增依赖或平台服务。
构建ir/providers/plugins及IR原test:types；Node最终匹配组：
- IR syntax-evidence-v2、phase1-ir；
- Providers native-binding-contract、native-binding-stream、syntax-binding-normalizer、native-code-syntax-request/ipc/stream、native-syntax-ipc、syntax-normalizer；
- Plugins plugin-context-v3、plugin-spi-v2、framework-detection；
- Evaluation fixture-manifest/fixture-registry；
- architecture17及命名变动TS/JS/JSON/rustfmt check。不运行根verify、完整Stage/Store长批、Native CLI或profile。

已有test文件名已核对。新源/identity/capture清单在实施开始固定，case总数从实际矩阵得出，不凭空预设质量数值。

## 退出与后继

S1→S2→S3→S4，Scope/Fixture/公共核心共享，顺序实施。
出口B_F1B_BINDING_OBSERVATION_LIBRARY_EXIT：真实AST库输出、v6 byte校验、v2映射及V3链，仅在本地组件范围。不能关闭History/生产Native/完整四框架/E01/E02或Phase1；父任务4/21不因子包完成增长。

后继需具体History版本/retained/原子发布合同，再完成四框架候选身份/支持与语义规则。批准本包不预批这些未知内容。用户一次批准此详细设计、MODULE澄清及S1–S4后连续实施/统一修复，不为每个schema、文件或语言再询问。

## 实施结果与作者审查（2026-10-30）

本会话顺序交付S1–S4。Rust固定v6库入口共享原解码/Source/Writer核心，Java真实typed声明与Python直接RHS/词法scope已产生；TS验证实际version6 bytes/终端/六类counts/checksum/引用闭包，v2归一化保留原置信策略，lexicalScope纳入Evidence支持与独立identity域。MODULE null范围需要显式同basis SourceFile/path/fingerprint证明；V3 owner也复用此获准规则。无v1投影输出或History激活。

最终组件437/437（含两条实际Rust raw→Code/Evidence→v2→V3，0fail/cancel/skip/todo）；Rust syntax库14/14、protocol内存18/18；Fixture注册35/35、架构17项目、IR/Providers/Plugins构建及IR test:types通过。命名格式收据及最终文件身份见[唯一结果索引](../../../.superpowers/sdd/2026-10-30-phase1-binding-observation/results.json)。各开发/最终重叠收据不累计；未执行完整verify、Stage/Store长测或云端CI。

真实raw位于本包library-output/r1：两条原始request/output，不是重序列化或golden。仅实际桥测试需CODEATLAS_BINDING_LIBRARY_OUTPUT指向已获准的Rust库capture；路径存在但缺文件会FAIL，绝不fallback。未提供capture的普通Node套件显式跳过这两条，因此普通套件PASS不能替代本次实际桥证据。Capture环境只在Rust测试模块内，无产品环境键/运行路由。

作者整包审查（依批准不新增代理，不能冒称独立评审）：发现缺账本回落v5及raw容量先分配后记账两项Important，review-red2FAIL→review-green4PASS；已修复并完成437项适用组件复验。兼容拆出时旧foreign-fingerprint负例暴露遗漏，显式basis/文件指纹与总cap/唯一id/key、owner/完整v2校验均保留，失败未删。当前无待修复Important/Critical；无Deferred minor。

执行中的三项裁定：①多site Source原模板maxEvents20不足，测试复用既有硬上限10000，保留20事件拒绝控制；风险是掩盖cap，专项负例覆盖。②真实MODULE owner触发V2旧约束，V3改为复用旧base校验后完整v2校验及显式原门禁；风险是遗漏旧校验，旧负例与实际桥共同验证。③原计划--lib protocol::实际0测试，修正到bin测试目标的protocol::；已逐项核对18项为内存接口、无CLI/child，风险是误启产品路径，源检查与Rust测试目标证明边界。原零匹配日志保留，不记为验证通过。

Fixture产品前冻结7文件；5个Source SHA不变，两份JSON仅格式化。原序列化复原后与产品前哈希精确一致，按真实恢复时间保留原字节及说明；不倒填“之前已保存”的证据。Cargo.lock、Providers/Plugins public index与快照字节一致；根package移除两条唯一注册后与原JSON完全一致。依赖/SQL/History/Runtime/CLI未修改；无需本包迁移。原计划中syntax.rs、native-binding-contract.ts不需改动，直接复用现有公共检查/schema。

本出口仅B_F1B_BINDING_OBSERVATION_LIBRARY_EXIT。父任务仍4/21，17未关闭；P1-04/05/06/07、E01/E02、完整框架extract及Phase1 OPEN。A6仍NOT_QUALIFIED，profile/catalog和生产启动拒绝保持；旧Native timeout根因UNKNOWN，旧链接失败也不追认已修复，main取消结算未查询，不操作R4 mutable DB。无实际Git/analyzer CLI/独立Native harness/collector/helper/模型、新分值/依赖、云端CI或Git写入。后继需具体History版本与原子发布合同，再接四框架语义候选；不将本包批准扩张为这些未知范围授权。
