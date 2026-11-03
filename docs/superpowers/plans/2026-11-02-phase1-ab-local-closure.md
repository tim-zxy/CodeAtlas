# Phase1 A/B Local Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans；本会话顺序实施，TDD、systematic-debugging和verification-before-completion按适用执行。用户禁止新增代理/会话/工作树、Git写入和清理证据，覆盖技能默认行为。批准后U0–U7连续执行，不逐schema/框架/测试再询问。

**Goal:** 一次补齐Source表面证据、四框架、图/Flow和授权仓库/跨仓本地发布链；失败与尚未获资格的生产运行保持明确。

**Architecture:** 隔离wire8/Syntax4/Context5，三个最小新kind和有界callback；共用绑定/覆盖/site-plan，复用原Stage/Store/事务/预算。Runtime IR不增加实体，SQL 外壳 schema_version=1，JSON 内 formatVersion=2 记录派生目的和计划。

**Tech Stack:** 当前TypeScript/Node、Rust1.98.1、tree-sitter-java0.23.5/python0.25.0、SQLite及现有锁定库；无新依赖。

**Spec:** [精确合同](../specs/2026-11-02-phase1-ab-local-closure-contract.md)。状态 APPROVED / LOCAL_COMPONENTS_VERIFIED / A_B_EXIT_HOLD；设计、实现、owned 数据库及固定库级操作和后续 SQL1/JSON2 修订均已批准。

## Global Constraints

- 原工作树/AGENTS/冻结架构、provider-independent IR、SQLite authoritative、LLM candidate-only、AUTO事实/MANUAL知识、ExecutionGraph→RuntimeFlow→BusinessFlow保持。
- 旧协议/Source/origin/失败不覆盖，R4/C2/旧测量根不复用，无reset/stash/stage/换EOL/清理。新记录沿原B唯一results/progress，新output目录create-new。
- 本包允许普通本地Node测试、一个显式前台批次driver、真实库级/测试可执行文件、已有受控Source只读和测试拥有SQLite；不运行analyzer CLI/main、A6测量helper/collector、Git/网络/模型、用户DB升级/校准/云端CI/Git写入。
- 不改质量门槛/新增经验分数；仅沿合同扩展既有规范0.5策略，弱支持不提高。角色/覆盖/身份与新version已在合同选定，实施不猜新含义。

## Review Focus

1. 参数默认值与annotation/名字绑定scope混淆：必须精确default范围和完整名称证明，注解/遮蔽拒绝。
2. callback体被画成注册方法同步CALL：本地callback fence、Code CALL精确引用/site-plan和EVENT语义共同验证，不推断新线程。
3. 资源或注入目标按名字猜：原未知集合和多目标反例保留，不选bean实例。
4. 只改Plugin仍被Graph恒PARTIAL阻断或循环等待跨仓：新图目的/未知边界/收据明确，跨仓critical另验证。
5. 新字段在History/Stage/reopen丢失或同ID覆写：新域/强制重观察/不可变origin和同lease联合提交。
6. 测试专用输入/重放被当ACTUAL_PRODUCT或物理profile：执行kind、真实owner和资格独立记录，未满足不宣称阶段ready。

## 文件与责任

### IR（结构和共享引用闭包）
Create packages/ir/src/syntax-evidence-v4.ts、runtime-site-plan.ts；Modify index.ts及必要新类型导出。旧syntax-evidence-v3.ts行为不动。runtime-identity.ts增加v2候选摘要，旧函数不改；runtime-ir/framework-binding-ir不增实体。共享集合校验由IR实现一次。

### Native（实际语言表面证据）
Create crates/native-analyzer/src/framework_surface.rs（版本8边界/测试与有界关系收集）；Modify lib.rs注册、code_syntax.rs模式、code_syntax_producer.rs、java_syntax.rs、python.rs，只在新mode分支启用；现有binding_sufficiency.rs/旧helper只做确有需要的共享提取，17旧流必须字节不变。analyze.rs仅新增默认ignored的Code库测试入口，调用原run/serializer，不修改Java Code producer意义或解析等级。

### Providers（严格字节、映射和历史）
Create native-framework-surface-contract.ts、native-framework-surface-stream.ts、syntax-framework-surface-normalizer.ts。Modify现有native-code-syntax-request/stream、native-observation-codec、syntax-normalizer-core、native-composition-input/native-composition、history-transition/history-transition-input、syntax-history-candidate及共享kind/metadata dispatcher；新分支明确8/4，旧分支不放宽。必要包导出用于固定内置Runtime，非Native能力广告。

### Plugins（语义和覆盖）
Create plugin-context-v5.ts、plugin-spi-v5.ts、framework-surface-compiler.ts。Modify现有framework-bindings/rules/extraction/draft/runtime-candidate/entry-candidate/binding-candidate的最小共享内核，保留严格V4包装；增加createFrameworkPluginV5、四个V5 factory和selectFrameworkPluginsV5，旧selector不自动升级。共用一个新参数/局部来源/有界callback索引，不复制四套算法或重解析Source。

### Execution/Contracts（图与跨仓）
Modify derive-execution.ts、derive-runtime-flow.ts、declared-execution.ts中的策略分派，增加V2入口和site-plan消费；旧入口保持。复用match-contracts与stitch-workspace，不重写匹配算法；若策略验证需接v2，仅在现有validator扩展受控分支。

### Storage/Application/Runtime（真实边界与事务）
Modify analysis/activation-history-format、activation-history、mixed-analysis-stage/store；runtime/runtime-fact-store、contract-store。增加Syntax4和activation容器v2分派、readFrozenFrameworkInputsV2、readFrameworkInputsV2、applyWithRuntimeV2及只读v2收据/查询范围；不改DDL/迁移/校验和。原V1路径结果与预算保持。

Application derive-framework-runtime/refresh-runtime-facts、derive-workspace-runtime/trace-runtime增加严格V2入口/返回metadata，依赖仅IR/Execution/Contracts/Source，不导入Plugins/Storage。Runtime framework-runtime-composition、mixed-analysis/validation/request/execution增加固定模式8与V5组合，继续作为唯一接线点，权限/取消/预算不旁路，无生产配置新键。

### 测试与工具（少量聚合入口）
Create packages/ir/test/syntax-evidence-v4.test.mjs；packages/providers/test/framework-surface-pipeline.test.mjs；packages/plugins/test/framework-surface-closure.test.mjs；packages/execution/test/framework-surface-execution.test.mjs；packages/runtime/test/framework-surface-publication.test.mjs。复用Storage现有helper并在现有runtime-fact-store/contract-store测试中补v2重开与必要故障控制。

Create scripts/run-phase1-ab-local.mjs（显式手动driver，不是后台helper）；scripts/test-phase1-ab-local.mjs聚合Node测试、根test只注册一次。普通根测试只读可携带recorded输入，不隐式运行Rust/Source采集/网络。现有Fixture根追加surface-closure目录和manifest路径，不先增ID或复制计数守卫。

## U0 — 冻结独立Source oracle与所需基线

- [ ] 读完合同，核对所有实际路径/调用者；仅冻结实际受影响源码、锁、工具、请求模板、Source和oracle，不全仓hash。确认.codegraph仍无则不建。
- [ ] fixtures/phase1/syntax-contract/surface-closure中先写独立cases/expected semantic slots/坏结构向量；Source/refs通过文件、真实声明限定名、kind、字段/关系匹配，不能由actual复制golden或预测provider ID当真值。
- [ ] 固定12个Source case如下；新增5个Source只作为文本，Manifest仅引用已存在路径。

|case|Source|期望边界|
|---|---|---|
|J1|spring/source-adequacy/SpringSource.java（原）|成员写/参数类型完整；route/job/Feign/声明依赖有支持；不证明bean实例|
|J2|kafka/source-adequacy/KafkaSource.java（原）|普通构造/typed初始化与send/listener；不制造无声明入口|
|J3|mongo/source-adequacy/MongoSource.java（原）|读写可证明；watch资源来源未知，Runtime不得完整激活|
|J4|mongo/source-adequacy/MongoWatchSource.java（原）|atlas/events来源＋有界lambda/private handler＋DATA_CHANGE EVENT|
|J5|mongo/source-adequacy/MongoWatchReferenceSource.java（新增）|同来源，this::handle/private方法；不推断线程|
|J6|syntax-contract/surface-closure/sources/SourceSafety.java（新增）|匿名类/复杂写/非闭合callback等负控制，PARTIAL或前置拒绝，不发布|
|J7|spring/source-adequacy/InventoryProxySource.java（新增）|/proxy入口→typed Feign接口items调用→消费/items；接口声明与调用点分开|
|P1|fastapi/source-adequacy/routes.py（原）|router/prefix /api/v1/items与默认Depends|
|P2|fastapi/source-adequacy/depends-default.py（原）|默认角色及唯一provider，非按调用名字猜|
|P3|fastapi/source-adequacy/depends-annotation.py（原）|不产生默认注入；明确非支持annotation用法/部分结果，不冒称可部署|
|P4|fastapi/source-adequacy/depends-shadow.py（新增）|导入Depends被覆盖，不能绑定|
|P5|fastapi/source-adequacy/inventory-service.py（新增）|真实GET /items，显式inventory服务身份，与J7精确匹配|

- [ ] J7源包含@RestController proxy方法和当前同文件@FeignClient接口，private字段client类型为该接口，proxy直接调用client.items；不依赖猜Code CALL target。P5源是普通FastAPI /items。
- [ ] J5沿J4只将callback换成this::handle，保留private handler。J6逐危险site有独立预期/限制，不能只因任一PARTIAL就判全部负控制通过。P4用实际名字覆盖，不把默认参数的语言外scope误当参数shadow。
- [ ] Source案例不是E02数字baseline；原17 Source/两个预算控制、四框架旧向量/critical/qualityGates保留原件。新recorded流将作为inputs而非expected，旧.superpowers产物不删除/提交。

## U1 — 跨层严格合同与纯测试RED/GREEN

- [ ] 先写参数/连接/callback/calleeRange/codeCallRef/collection closure的独立正反向量；Node确认旧接口/结构不支持再实现新schema/dispatcher。
- [ ] 实现IR4、Provider8 request/raw/codec、Context5与site-plan严格结构；先完成Rust模式/decoder及共享writer framing，Source新语义尚未实现时可合法暴露缺失，不能把编译错误当行为RED。
- [ ] 默认null callbackScope等基础字段只在新mode发出。单记录/schema不替代集合closure，旧入口必须拒绝新字段/版本。
- [ ] 规范支持策略v2适用性、weak支持/引用缺失、provider重命名不影响语义key、新角色改变key各有一处责任测试。

## U2 — 真实库Source生产、必要时序与兼容

- [ ] 一个前台Node driver管理输出和必要的owned Stage实例；调用固定测试可执行文件，不运行analyzer main/CLI。Rust编译在live owner/operation deadline建立前完成，不让编译时间消耗Source请求的相对deadline。
- [ ] 复用原analyze::run的真实Java2 Code生产/serializer，单worker，7个Java Source逐一运行；使用实际raw→现有normalizer/FactMerger认证的Code/Evidence/Binding准备Java owner，禁止手造Canonical事实或code:provider-id替代真实ID。
- [ ] 复用SETTLED_JAVA_OWNER与Stage.prepareJavaOwner时序；不得将未结算snapshot先写SQL再改同ID时间。没有真正授予owner就保留失败，不能用任意stageDigest/qualificationRef冒充。纯parser/负控制输入可以明确标PURE_CONTRACT/DIAGNOSTIC，不据其发布或签收ACTUAL_PRODUCT。
- [ ] 为新source_truth测试冻结上述12case/真实owner请求，先RED记录缺参数/成员写/关系等，保存所有输出再归纳失败，不遇第一例就丢后续产物。
- [ ] 最小实现合同中的新mode成员写、普通构造/opaque结果、参数、direct VALUE_LINK、有界callback；旧v7路径不变。所有实际工作/保留量沿既有计费。
- [ ] 集中GREEN固定新模块；每个正例和负例对应冻结oracle，不为过测删除限制、改cap或把应完整的正例改成预期失败。
- [ ] 原binding_sufficiency模块一次兼容复验（不include ignored），原17source oracle及两预算控制；旧17完成流字节对比现有r5。若新mode导致旧流变化，先修隔离，不放宽。

### 本包操作清单（一次授权，不逐运行再问）

预计离线编译准备2批：

    cargo test --locked --offline -p codeatlas-native-analyzer --no-run --lib --bin codeatlas-native-analyzer --message-format=json

读取实际test artifact路径/sha，库与binary测试入口均按精确filter调用：

1. binary测试：analyze::tests::phase1_ab_code_source_capture --exact --ignored --nocapture --test-threads=1；7个Java Code请求，单worker，analyzer main不运行。
2. lib测试RED：framework_surface::tests::surface_source_truth --exact --ignored --test-threads=1；固定12case，失败明确区分准备/合同/资源/语义。
3. lib测试GREEN：framework_surface::tests:: --include-ignored --test-threads=1；同12case及本模块独立结构/边界控制，实际测试数量按冻结注册记录，不扩成全库。
4. lib旧兼容：binding_sufficiency::tests:: --test-threads=1；17旧Source与原两小型计费控制，默认ignored Spring不启动。

固定1.98.1 cargo/rustc，--locked/--offline，缺项停而非下载。环境CODEATLAS_AB_BATCH_INPUT/OUTPUT仅指向当前任务owned目录；旧CODEATLAS_BINDING_SUFFICIENCY_OUTPUT若需兼容捕获，显式绑定新compat目录，清除其他旧采集环境。

Java Code测试请求复用现有protocol-v2/valid模板的maxDurationMs30000/maxMemoryBytes64000000，maxEvents选既有Code writer硬限10000以覆盖完整小Source，而不是沿20-event协议小样本截断。此组合明确作为本包测试请求选择一起审批，不安装profile、不声称RSS或质量阈值。请求cap/输入/工具执行前冻结。

Syntax8每请求复用既有Source oracle：duration1000ms、memory/input/output65536、depth64、items1000、events10000，deadlineEpochMs=null；不从旧Syntax失败自动扩大。Node owned组件验证沿已存在fixture/history/request controls，预算边界继续显式有限控制；Number.MAX_SAFE_INTEGER测试上限不能变成生产默认或物理资格。

同一固定语料/预算/入口内，因已定位的实现或Fixture缺陷而进行的必要TDD/定向复验，一并属于本包授权；每次新目录和准确计数/身份，不能无修改重复碰运气、重试到绿，或扩大为全仓/长测。未定位的timeout/resource/ownership失败停止相关实际运行，保留HOLD并推进不依赖的纯实现；新cap/profile/语料/进程用途另批。这样避免人为只给一次额度后每次修代码都重申审批。

## U3 — Canonical、历史、Stage闭包

- [ ] normalizer4/唯一collection validator实现支持、key4/extraction4、真实codeCallRef精确连接；旧normalizer1..3/支持域及错误保持。
- [ ] history/composition/current投影支持RAW_V8/envelope4；版本升级强制重观察全部Native，旧origin不覆写，delta只复用同版本且Source/Code/支持仍有效的unit。
- [ ] Stage独立校验raw/metadata/8→4和全集合，FROZEN前引用/计费/Source/根复查沿原；bad site/callback/params不发lease。
- [ ] 实现同lease只读readFrozenFrameworkInputsV2及源输入账本续接，不先commit Syntax。Snapshot diagnostics/settled Java时序沿已接受澄清，不新造简化metadata。
- [ ] 旧版本/合同混合、同key不同core、缺支持、取消与部分结果各在责任测试拒绝；未变的原完整恢复矩阵复用，不给每个新kind复制一次。

## U4 — 四框架、site计划、图/Flow

- [ ] 共用参数/类型/唯一局部来源索引；依合同补Autowired声明需求、Depends默认/provider、Mongo资源/watch/handler及Feign调用点。
- [ ] Source negative与标识正例、shadow/extra writes/多目标/unknown origin依独立oracle验证。Callback scope不伪造Code节点或外scope，Code resolution不升级。
- [ ] 实现V5覆盖清单与RuntimeSitePlanV1，禁止只删V4限制；不把未识别site当不存在。
- [ ] DEPENDENCY/DATA_WATCH用原IR，confidence策略v2保留既有值与含义；actual Code支持不足拒绝。
- [ ] Graph/Flow V2消费精确Code CALL角色，保留Code图、真正异步/事件逻辑及普通未知调用限制。外仓边界保持NON_RESOLVED和明确本地目的，不能提前匹配。
- [ ] 五context/重排/支持沿原Execution Fixture；图预算/深度/取消和未配对Code CALL不被plan吞掉。

## U5 — 授权SQLite单仓/联合/跨仓真实组件

- [ ] 在测试拥有新DB用既有初始化/validated Code/Source流程，真实Code raw/FactMerger/支持进入Stage；禁止直接SQL写expected runtime事实，用户DB和R4不接触。
- [ ] 实现activation JSON v2/metadata policy与candidate digest分支、旧v1保持；readFrameworkInputsV2只接受Syntax4全集，旧读取不偷吃新数据。
- [ ] 固定Runtime.prepare/compose V5＋Application授权派生＋Store.applyWithRuntimeV2，一次joint Code/Syntax/Runtime事务；Source/CAS/lease/支持变化或PARTIAL不切新指针。
- [ ] 新Scope metadata在只读查询/收据明示，last-good仍带旧basis，unknown commit恢复只读核验，不重复Apply。
- [ ] J7和P5独立根/Repo ID，显式inventory服务身份和FrozenContractSet；真实matcher/stitch→workspace Store。断言/proxy边界→/items的源支持与RevisionSet，不能用名字重合匹配原不同路径。
- [ ] 原六种match结果/多repo同局部ID/Source变化stale/CAS/取消/预算及必要原子回滚/重开测试集中补足。没有改变旧SQL步骤的不扩为完整故障矩阵。

## U6 — 可携带输入、集中验证与原验收映射

- [ ] 新actual raw保留原owned根，选定结果作为recorded inputs复制到现有Fixture子目录，沿原标准库/gzip/loader可携带模式；golden仍U0独立字面文件，二者身份分开。普通Node根测试不得依赖私有.superpowers，重放/重绑定若必要明确RECORDED_REPLAY，不冒充新实际捕获。
- [ ] Node聚合入口注册一次；开发只跑上述责任新测试，末尾统一跑新根＋受影响旧IR3/Provider7/Plugin4/Execution/Storage/Runtime/Contracts文件。精确去重清单在U0按调用路径记录，不机械扫所有55资源矩阵。
- [ ] 受影响包按IR→Providers/Plugins/Execution/Contracts→Storage→Application→Runtime构建，旧产物身份可适用时不重复；架构、IR声明/命名、范围格式、原Fixture发现/唯一性集中检查一次。Rust只需触及文件fmt与上述定向，不默认cargo全库/Clippy/CI。
- [ ] E01新Source/支持golden、E03/04五context/异步/step、E05/06六匹配与跨repo逐条记录执行kind/原命令。E02无批准数值baseline时NOT_EVALUABLE，不借Phase0.5阈值、不空分母签收。

## U7 — 一次收尾/作者评审

- [ ] 逐Review Focus审查最终差异，范围内明确缺陷统一修复并必要复验，不逐微步骤确认。用户禁止新代理，本包作者审查明确标记，独立review若后续整分支需要另议，不在此新增代理。
- [ ] 只维护本合同/本计划/原B结果索引/简短CURRENT_STATUS，规范改变同步受影响ADR/Provider/Plugin/IR/历史/验收/追踪的准确段落；不重复复制全历史或创建层层收据。状态旧字节备份后局部增量/追加，不能覆盖丢历史。
- [ ] 列每个原P1-04..09的实际已满足/未满足/NOT_EVALUABLE门禁，具备全部条件才签收。未获物理资格/完整E01或E02等不记为通过，也不把所有组件永远笼统写OPEN；给出真实剩余阻塞及下一批可独立工作。

## Exit / Stop

本地退出要求新合同/12Source必要证据/旧兼容/应用与真实owned SQLite/跨仓/必需负控制/文档均通过。schema/Source/oracle不符先定位，不能改expected迎合；如果不能满足有界callback或Source owner真实性，相关链HOLD而非新造Code节点/绕过guard。完成后按稳定接口准备C/D准确实施，不因A6/profile单项等待停止无依赖工作。

本包不授权C/D编码、生产CLI/广告、实际模型、物理计量/校准/新profile数字、CI/push/PR/merge/Git写入、用户DB升级或新依赖。任何这些操作仍集中说明准确范围并获确认。

### 2026-11-02 连续批次进展及实际容器冲突

2026-11-02 U4/U5连续批次：新增V5候选/依赖/watch、固定全调用点plan、精确Code CALL角色与Graph/Flow V2。新旧范围匹配批次实际168项：167PASS/1FAIL/0skip（u4-u5-unaffected.log；负向name filter未排除import根中的联合红项，按实际计数，不当作全绿）。五包Plugins/Execution/Storage/Application/Runtime构建exit0、架构17通过。
真实U5联合写入发现已接受合同§7.1的SQL schema_version2与R012 CHECK=1冲突，禁止改迁移的条件下不可实施；保留store2-diagnostic.log和联合失败，四表canonical_nodes/active_history_pointer/runtime_activations/runtime_state读数均0（store2-rollback-proof.log）。推荐JSON内formatVersion2/SQL列仍1，准确DCP与作者评审已形成且待用户确认，未实施替代方案。原U0–U7其余授权不撤销，不拆微步骤审批。
尚未完成V5 factory/SPI、Application/Runtime固定组合、联合存储/重开、真实retained/delta存储与workspace匹配、U6/U7退出。U4仅已测组件，不宣称整包或Phase验收；原4/21/17OPEN保持。无新Native/云端CI/Git写入/代理。全部原失败保留；临时dist诊断在finally恢复原字节。

待审提案：../specs/2026-11-02-phase1-runtime-container-version-proposal.md；尚未获准，不覆盖原规范。

### Runtime容器修订已批准并通过局部联合验证

2026-11-02用户批准Runtime容器最小修订：SQL schema_version=1，严格JSON {formatVersion:2,identity,candidate}；旧{identity,candidate}及迁移/checksum保持，未知格式/混格式拒绝。真实owned SQLite联合Code/Syntax/Runtime、准确membership/activation、旧入口拒绝、只读重开及坏格式拒绝1/1通过，见ab-local-closure/store2-approved-green-02.log。首次负向UPDATE被原R012_IMMUTABLE拒绝，已改为仅disposable Fixture新增坏子行，未禁用触发器或修改迁移；该失败保留store2-approved-green.log。原SQL版本冲突HOLD由本批准及新证据限定解除；原失败记录不删除。原U0–U7继续，完整factory/SPI、Application/Runtime与跨仓、U6/U7仍待，无新Native/CI/Git。


## 当前结算 — 2026-11-03

原清单与旧进展保留为执行前/中历史；当前状态以[本批评审](../reviews/2026-11-03-phase1-ab-local-implementation-review.md)及原 B results.json 为准。

|任务|当前状态|
|---|---|
|U0–U4|上述本地合同、库证据、严格历史/增量、四框架及 Graph/Flow 组件已实施；非全部父任务验收|
|U5|单仓同 lease 联合提交、已提交刷新、重开与双仓负向已验证；正向 J7/P5 schema 兼容证据 HOLD，未整体完成|
|U6|25入口去重批次 428 PASS/2条件 SKIP，八包/IR类型/架构及31身份检查完成；评审修复后八文件 205/205，Plugins 构建及架构通过，不扩大到整仓|
|U7|作者评审及原范围修复、权威/任务/验收/追踪同步；无新代理，完整退出未签收|

下一步把 Source schema 证据/兼容证明与正向跨仓 probe 合为一个设计/实施评审批次。未选择新引用模型或放松 matcher，不将此缺口默认为已获编码授权。原物理资格/E02 与 C/D 授权边界保持。
