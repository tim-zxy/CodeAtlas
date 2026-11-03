# B-F1-D CALL_RESULT 覆盖语义集中实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans；按用户既有选择，本会话顺序，无新代理/会话/工作树或Git写入。

**Goal:** 精确区分Python v6调用返回值未知与已完整观察的call，保留所有真实遗漏/失败门禁。
**Architecture:** 现有Collector.binding下局部原因分支；旧writer聚合、TS reader/normalizer、组合与Store不变。
**Tech Stack:** 已安装Rust/tree-sitter/Node；无依赖/数值/迁移。
**Spec:** [B-F1-D DCP](../specs/2026-10-30-phase1-call-result-coverage-design.md)。
**Status:** B_F1D_CALL_RESULT_COVERAGE_LIBRARY_EXIT；获批D1–D3已完成，另一次定向复验获用户明确批准。

## Global Constraints

使用C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas，不修改D旧副本或失配Git元数据。原Fixture/证据/EOL保留；不reset/stash/stage/commit/清理。新产物固定本包.superpowers/sdd/2026-10-30-phase1-call-result-coverage/library-output/<一次性批次>，create_new，不写B-F1-B的r1或其他旧owned目录。
只允许批准后的Rust库测试可执行文件/受控Source读取；无analyzer CLI/独立Native/helper/collector/模型、新实际Native→Store链或生产DB/公开路由/profile/校准、新数值/依赖、云端CI或Git写入。未取得具体批准时仅本文档。

## Review Focus

- v6普通call可以完整，但UNKNOWN和未解析callee不升级为语义绑定。
- 文件其他partial不能被CALL_RESULT分支清零；nested混合负例固定此行为。
- v4/v5和Java不进入本特例；旧原始r1仍拒绝。
- 预算/取消/错误终端不变；不能为新例增加资源上限。
- 新捕获目录与旧owner严格分离，缺产物不能以Fixture输出代替实际库流。

## D1：独立预期与最小Rust行为修订

**Modify:** crates/native-analyzer/src/python.rs（Collector.unknown/value责任点）、crates/native-analyzer/src/binding_syntax.rs（已有测试模块）；fixtures/phase1/syntax-contract/fixture.json仅追加路径。
**Create:** fixtures/phase1/syntax-contract/call-result-coverage/inputs.json、expected.json，必要的独立.py源只放同目录；不改旧源。
**Consumes:** observe_binding_syntax及已有value/walk；code/syntax coverage与终端的原严格结构。
**Produces:** 无新产品接口；仅binding=true的CALL_RESULT不单独置partial。

- [x] 先在本包保存独立逻辑输入/expected及精确原字节身份；固定DCP§4正负行为，同一输入走v5旧控制。
- [x] 测试请求构造复用旧requestTemplate/owner digest，但显式使用新语料的固定根、实际path/Source fingerprint；旧request(name)仍固定旧Fixture根，不替换其默认。v5控制独立构造合法v5请求，不篡改任何已捕获v6 bytes。
- [x] 新增binding_v6_call_result_observation_completeness测试：直接call/包裹关系/参数call，其他partial、旧v5、未知值/计数和预算控制。测试名称仅一组参数化行为，不按内部函数增加镜像套件。
- [x] 首次RED：cargo test --offline --locked -p codeatlas-native-analyzer --lib binding_syntax::tests::binding_v6_call_result_observation_completeness -- --exact。应失败于现有direct coverage=PARTIAL，而不是编译/Fixture错误；后者不能算有效RED。
- [x] 最小改动unknown的binding且reason=CALL_RESULT分支；不清除partial、不改其余unknown或terminal、不改Java。

## D2：一次实际捕获、严格组合与旧拒绝

**Modify:** 同一Rust测试模块，scripts/test-binding-history.mjs仅追加一条import。
**Create:** packages/providers/test/syntax-call-result-coverage.test.mjs。
**Consumes:** D1、现有direct/nested source、composeBindingProjectionForHistory(metadata,requestBytes,outputBytes,composition)、旧normalizer→V3桥。
**Produces:** 新direct完整库raw、new nested PARTIAL raw、只读TS准入证据；不是运行期鉴证或Store发布。

- [x] 测试专用保存逻辑只提取必要共用实现：旧save_capture默认owner固定旧目录，新binding_v6_call_result_coverage_capture显式owner固定本包目录。保持canonical子路径/create_new guard；不以放宽原owner断言通过。
- [x] 独立新测试先声明direct预期SUCCEEDED/Code COMPLETE/Syntax COMPLETE并保留UNKNOWN；nested仍PARTIAL/INCOMPLETE_OBSERVATION。新产物由CODEATLAS_CALL_RESULT_LIBRARY_OUTPUT显式选择；普通注册缺省显式skip实际桥，指定路径却缺文件必须失败。
- [x] GREEN与旧语法兼容集中一次：设置CODEATLAS_CALL_RESULT_CAPTURE_ROOT到本包新owned批次，执行cargo test --offline --locked -p codeatlas-native-analyzer --lib syntax。既有syntax库控制与新组一起执行，新capture测试只写direct/nested两条请求/输出，结束清除该env。
- [x] 不复用旧capture writer的env启动旧实际捕获；旧binding_v6_actual_capture可在无旧env情况下仅走内存控制，不覆写r1。
- [x] TS实际新组合使用原始新bytes，无重封装/改版本或终端；metadata沿已声明测试值，Source/inventory取请求实际值。嵌套inner call不得被提升为app直接callee。
- [x] 原normalizer→V3桥单独以CODEATLAS_BINDING_LIBRARY_OUTPUT=新产物运行，验证实际scope/支持/旧身份公式，不再复制其完整桥实现。

## D3：最小兼容验收与治理同步

- [x] 新root执行时：CODEATLAS_BINDING_LIBRARY_OUTPUT仍指定旧r1（保留C包两条PARTIAL拒绝），CODEATLAS_CALL_RESULT_LIBRARY_OUTPUT指定本包新输出。node --test --test-concurrency=1 scripts/test-binding-history.mjs；指定实际输入后不得以skip作本包完成证据。
- [x] 新原始映射桥与直接相关旧TS兼容：node --test --test-concurrency=1 packages/providers/test/syntax-binding-normalizer.test.mjs packages/providers/test/native-binding-stream.test.mjs packages/providers/test/native-code-syntax-stream.test.mjs；此命令的旧env指向新捕获，原normalizer桥没有把PARTIAL当组合成功。
- [x] Fixture manifest/registry两文件，架构检查；只格式化/检查本包实际修改文件（Rust沿仓库formatter）。无TS产品变化则复用C包三包build的匹配源码身份，不机械重建或重跑428旧全批。
- [x] ADR-020、B0b§4.2新增“仅v6 CALL_RESULT”明确例外（v5段保持）、F1-B与NATIVE_IPC/EVALUATION/必要scalability条目、DESIGN_AUTHORITY/TRACEABILITY、WBS/ACCEPTANCE/CURRENT_STATUS同步；短补记指向本包，不复制历史全文。
- [x] 一份results.json索引准确命令、测试数/skip、源码/build/输入raw身份、失败与复用适用性；作者整包审查。无新增独立代理，不删除旧证据。

## 执行次数与失败边界

整包批准拟包含两次顺序Rust库测试命令：一次D1有效RED、一次D2修复后的集中GREEN/兼容及捕获；至多写direct/nested各一个新请求与一个输出，不启动独立进程采集。编译属于这两条命令，不另运行cargo build。它们是测试次数限制，不是质量/资源阈值。

若Rust编译/链接或实际捕获失败，保留失败，不自动重试、改工具链、开新target目录或覆盖旧产物；继续完成可独立的离线工作，准确标出未执行实际门禁。只有定位出的实现/Fixture缺陷才提出必要的有界复验，不把无限次数重试含在批准中；额外真实运行单独说明。缺新流时不假造成功输出，不关闭D包。

新Node范围测试/格式/架构按相关改动修复后可做必要本地复验，不涉及helper/collector/校准。本文不授权Rust bin protocol/CLI测试或真实Store路径；C包原Store事务/回滚证据按未变实现复用而不累加。

## 追踪与退出

|任务|依据|Fixture/门禁|完成证据|
|---|---|---|---|
|D1|DCP§3、B0b例外、F1-A直接关系|p1-syntax-contract-v1新增独立子语料；Rust RED/GREEN|仅CALL_RESULT特例、旧模式与其他partial不变|
|D2|DCP§4/5、原v6 checksum/预算|新实际direct/nested；旧r1拒绝|完整direct纯组合通过、nested拒绝、UNKNOWN与V3支持不漂移|
|D3|收敛策略、原架构/注册门禁|既有root追加一文件、原注册与架构|治理一致、准确新旧结果和未执行项，无生产资格误报|

只签收B_F1D_CALL_RESULT_COVERAGE_LIBRARY_EXIT，不签收真实Store端到端、四框架语义、A6或Phase1。四框架规则/领域候选/独立Evaluation将在一个后继具体包集中审批，不拆成四次；新分数/完整生产执行与物理资格仍有各自边界。

作者计划审查：D1→D2→D3共享Collector和捕获，顺序最省准备；normalizer/V3已有桥复用，不另造测试平台；捕获owner固定、两类env分离，避免新direct输入破坏旧r1拒绝控制。无待自行选择的资源数值或未知产品接口。

## 实施结果与作者审查 — 2026-10-30

已交付B_F1D_CALL_RESULT_COVERAGE_LIBRARY_EXIT：唯一产品改动是Python unknown责任点在binding=true且CALL_RESULT时不单独置partial；UNKNOWN原值、scope/直接关系、Code统计、其他partial/错误、v4/v5和Java保持。13类独立Source/expected先于产品冻结（15文件），Manifest只加路径，既有root只加一个测试import。

实际新direct库输出SUCCEEDED/Code COMPLETE/Syntax COMPLETE，经原始bytes严格组合及normalizer→V3桥通过；nested仍PARTIAL且完整组合拒绝。旧r1两条原始流及四份文件身份保持，新旧除Syntax coverage与terminal外的全部events逐值一致，不补造返回值/对象绑定或重标旧流。

验证记录：首次Rust RED在direct预期处有效失败；集中库批次15 PASS/1 FAIL，失败是新增v4测试误用过期basis请求模板。修正为当前targetSource/ownerBinding请求后，用户另行批准一次定向复验，矩阵1/1 PASS（13类输入，含v5及direct-v4控制）。其余15项按未变测试函数/相同产品源码复用该集中批次，不把原失败收据改写为16/16新鲜GREEN。实际捕获测试当时已PASS，两条捕获不重复执行；编译test源码修订身份分开记录。

最终Node历史root18/18（含旧r1拒绝、新实际准入及原声明式SQLite回归）；新实际normalizer/V3桥和旧流兼容47/47；注册35/35，架构17项目，5文件Prettier及2文件Rust格式通过，均0skip/0todo。TS产品源码/锁未改，复用C包对应build，未为Rust局部变更重建三包或重跑428旧全批。准确命令、失败及复用见[唯一结果索引](../../../.superpowers/sdd/2026-10-30-phase1-call-result-coverage/results.json)，[范围/原始流身份](../../../.superpowers/sdd/2026-10-30-phase1-call-result-coverage/scope-and-identity.json)。

作者整包审查：生产diff反向替换后与before字节一致；Java/writer/锁/root package未变，C包23个未获准更改文件与原身份一致；原失败保留，无新增独立评审。Deferred minors：无。

Rulings：
- D3明确列出的既有history root包含C包声明式SQLite回归；Global排除项澄清为不新增实际Native→Store端到端或生产DB路径。仅执行已列root，没有将新Rust raw交给真实Store鉴证。若误解此区别会造成端到端资格误报，因此结果分开。
- 同一产品源码下复用集中批次其余15项，仅对已证实的v4测试构造做一次获批定向复验；身份比较证明其他测试函数不变。若判断错误会遗漏兼容回归，保留原15/16日志及准确限制，不冒称整批重绿。
- 新captured raw绑定捕获时源码/测试可执行文件身份；后续测试构造修改不追写旧身份或重捕获。若判断错误会错误归属产物，capture-revision保留原源码与hash。

出口不含真实Source/capture/owner→Native→Store端到端、框架语义、物理资格或Phase1验收。父任务4/21、P1-04..07/E01/E02/Phase1 OPEN，A6 NOT_QUALIFIED；历史timeout UNKNOWN、旧链接失败/main取消未查/R4 mutable限制保持。无CLI、helper/collector/model、profile/新数值/依赖/迁移、云端CI或Git写入。后继统一推进四框架绑定与领域候选契约/Fixture/Evaluation，不逐框架审批。
