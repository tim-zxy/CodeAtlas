# Phase1 显式 HTTP schema 与跨仓集中实施计划

> REQUIRED SUB-SKILL: executing-plans；本会话顺序，TDD/调试/verification按适用。用户要求一次整包审批、禁止新代理/会话/工作树/Git写入，覆盖技能默认commit/reviewer流程。批准后 T1–T4 连续实施与范围内修复，不逐字段/模块审批。

**Goal:** 让已入库 Source 可认证的有限 HTTP 声明经过实际 matcher/stitch/授权工作流在 owned workspace 发布，保留无声明时的未知结果。
**Architecture:** 仅 workspace FrozenContractSetV2 添加正文证据；不改 repo Contract。复用完整 snapshot/CAS/事务/last-good，SQL1/JSON2 容器，无新迁移/Native/依赖。
**Tech Stack:** 现有 TypeScript/Node标准库、Zod、SQLite。
**Spec:** [详细设计](../specs/2026-11-03-phase1-declared-http-schema-design.md)。APPROVED / B_DECLARED_HTTP_SCHEMA_LOCAL_EXIT；用户已明确批准整包及适用性澄清，详见末尾当前结算。

## Global Constraints

原架构/Quality Gate/Fixture根不变；无经验新数值、profile、用户DB、CI、Git、Rust/Native/helper/collector、模型或C/D编码。全部历史/失败留存，原B results/progress唯一索引；旧源码/Fixture改前只备份一次，不stage/reset/stash。新函数/types严格采用设计名，V1入口/字节保持。无parallel长测或新代理。Source JSON用标准库解析，schemaDocuments同账本，不增加文件扫描/IO API。

## Review Focus

1. 调用方自报schema与Source正文不符：T1哈希/值闭包，T3实际snapshot完整认证。
2. Feign两consumer只证明一条却COMPLETE：T2逐合同集合检查，T4源集成保留两项。
3. body absent与未知/null混同或语言String冒充HTTPJSON：T2独立正反golden，原无文档反例不变。
4. 读取新JSON悄然按V1解释、重开丢失声明/输入摘要：T3严格格式分派及readonly重开。
5. Source CAS/预算/取消之后仍发布或预算被中间层重置：T2累计控制，T3锁内认证，T4权限先行与last-good。

## T1 — 独立语料与IR声明输入

**Files** Create packages/ir/src/declared-http-schema.ts、packages/ir/test/declared-http-schema.test.mjs；Modify packages/ir/src/contract-ir.ts、packages/ir/src/index.ts；Create fixtures/phase1/contract-matching/declared-schema-inputs.json、declared-schema-expected.json、sources/caller-http.contract、sources/provider-http.contract；Modify 该目录fixture.json，仅追加inputs/expected路径，不改ID/critical/gates。

**Consumes** 既有 SourceFile/RepoBasis/SupportRef/Phase1ReferenceContext、canonicalRuntimeJson 和 FrozenContractSet结构。
**Produces** 设计§3的三个strict schema/type；decodeDeclaredHttpSchemaDocuments(documents:readonly SourceSchemaDocument[],contracts:FrozenContractSetV2['contractRefs'],context:Phase1ReferenceContext,limits:DeclaredSchemaLimits):{declarations:readonly DerivedHttpSchemaDeclaration[],consumed:{items:number,inputBytes:number}}；parseFrozenContractSetV2(input:unknown,context:Phase1ReferenceContext,limits:DeclaredSchemaLimits):{set:FrozenContractSetV2,declarations:readonly DerivedHttpSchemaDeclaration[],consumed:{items:number,inputBytes:number}}；workspaceRuntimeInputDigestV2(set:FrozenContractSetV2):string。
DeclaredSchemaLimits={maxInputBytes:number,maxItems:number,maxDepth:number}；DerivedHttpSchemaDeclaration={contractRef:ScopedRef,query:{kind:'ABSENT'},request:{kind:'ABSENT'},response:DeclaredHttpResponse,sourceSupport:SupportRef}。无文件/SQL依赖。声明由完整冻结文档导出，不接受另一个独立caller declarations数组；parse只调用decode一次并交付消费，Contracts prepare不再重复解码。

- [ ] 先冻结Source正文和独立expected，选择当前合同factKey的依据记录在Fixture，不用产品结果生成expected。
- [ ] RED：IR测试正例能得到两caller/一provider声明；错正文/指纹/support、重复、跨repo、未知factKey、非空refs覆盖、未知版本/字段拒绝，原V1拒绝新字段。Run: node --test packages/ir/test/declared-http-schema.test.mjs；Expected:缺新接口/新行为FAIL。
- [ ] 最小实现设计§3/4输入摘要；先累计bytes，再解析/计items-depth；同样内容无序集合排序不改变摘要，改变声明/source/policy必须改变新摘要。
- [ ] GREEN：同命令全部PASS；IR构建及IR类型检查。Fixture结构/发现只在T4统一检查，不逐层重复注册计数。

## T2 — 有证据的matcher与V3 stitch

**Files** Modify packages/contracts/src/match-contracts.ts、index.ts；packages/execution/src/stitch-workspace.ts、index.ts；Create packages/contracts/test/declared-http-schema.test.mjs、packages/execution/test/declared-schema-stitch.test.mjs。

**Consumes** T1 FrozenContractSetV2、纯解码声明和新inputDigest；原Contracts/Execution完整规则及V2 repo candidates。
**Produces** prepareFrozenContractsV2(input:unknown,control:DeclaredContractControl):{set:FrozenContractSetV2,context:Phase1ReferenceContext,declarations:readonly DerivedHttpSchemaDeclaration[],consumed:{items:number,inputBytes:number}}；matchContractsV2(input:unknown,control:DeclaredContractControl):DeclaredContractMatchingCandidate；stitchWorkspaceExecutionV3(input:unknown,control:DeclaredContractControl)，返回形状沿V2并增加consumed:{items:number,inputBytes:number}。DeclaredContractMatchingCandidate 沿设计§4，在原结果上增加同一consumed结构。DeclaredContractControl=RuntimeRequestControl & {maxInputBytes:number}。

- [ ] RED：独立vector断言两consumer均MATCHED、缺任一attachment仍未证明、显式相反response为CONFLICTED、多provider为AMBIGUOUS；原null/六状态保留，未扩展的Message/RPC无新证明。Run: node --test packages/contracts/test/declared-http-schema.test.mjs packages/execution/test/declared-schema-stitch.test.mjs；Expected:新API/行为FAIL。
- [ ] 仅参数化旧matching内核必要分派，不重写服务选择；新id/input域依设计§4，实际Source支持进入match；stitch重算与精确比较，保留真实repo digest/site-plan与传播方向。
- [ ] 多文档共用bytes/items/取消控制；prepare/match/stitch重复实际访问累计，内部可返回consumed续接，不能每步重新获得完整cap。必要实现细节留在本包，不新设预算配置或猜数值。
- [ ] GREEN：新测试及旧 match-contracts.test.mjs、stitch-workspace.test.mjs；含单个累计边界/取消与篡改MATCHED拒绝。Contracts/Execution构建；开发不跑所有其他packages。

## T3 — 实际Store容器/授权组合

**Files** Modify packages/storage/src/runtime/contract-store.ts；packages/application/src/derive-workspace-runtime.ts、refresh-workspace-runtime.ts、index.ts；packages/runtime/src/runtime-fact-composition.ts；Create packages/storage/test/declared-schema-contract-store.test.mjs、packages/application/test/declared-schema-workspace.test.mjs。原schema/helper复用，不改迁移或package依赖。

**Consumes** T1/T2，真实readRuntimeBindingForWorkspace.values及原RepositoryRuntimeBinding/RevisionSet、HistoryReadBudget和授权ports。
**Produces** 设计§5所有V2 Store/workflow/Runtime入口及deriveWorkspaceRuntimeV3；Store read/apply 的第三参数 maxInputBytes 必填且在解码前执行；Runtime composition 的五个显式输入字段见设计§5；WorkspaceRuntimeBatchV2、WorkspacePreparationInputsV2只有frozen类型替换。私有接口在既有模块显式export，Runtime不经IR直接import，不自动接生产bootstrap。

- [ ] RED：owned真实SQL中caller伪造SourceFile或support即拒绝；SQL1+新JSON2可以写入/重开，未知/混格式拒绝，旧V1入口不吞新容器。Run: node --test packages/storage/test/declared-schema-contract-store.test.mjs packages/application/test/declared-schema-workspace.test.mjs；Expected:缺新API或版本行为FAIL。
- [ ] 复用原事务/roots/CAS和read/archive内核，仅显式版本分派；源正文按snapshot认证，完整repo contracts逐值一致，不向SQLite直接灌伪造schema行。
- [ ] 新容器/摘要按设计§5；查询只用immutable归档，不读后来Source文件冒作旧证据；内部历史恢复兼容两种格式，公开新旧trace严格。SQL子表仍envelope1，完整evidence保存在activationJSON。
- [ ] Application先授权后prepare，终止/PARTIAL不apply；旧cap/敏感性/last-good边界保持；同History预算前付与解析保留，不拆新满额budget。
- [ ] GREEN：新测试及旧contract-store/runtime-refresh适用测试；修改包依赖顺序构建。这里只测新增合同与现有恢复结合点，不复制完整COMMIT故障排列。

## T4 — 正向源文档到真实workspace发布、单批验收

**Files** Create packages/runtime/test/declared-schema-crossrepo.test.mjs；Modify packages/runtime/test/framework-surface-publication.test.mjs（只提取既有owned Stage helper到test/helpers/framework-surface-stage.mjs供两文件复用，原测试语义保持）、scripts/test-phase1-ab-local.mjs（只追加新文件，各一次）；同步设计§8所列authority/trace和本计划状态。必要IR/Contracts/Execution新测试由同一root显式import一次，现有直接注册文件不重复注册。

**Consumes** T1独立声明正文、原38流/J7/P5、T2/3真实产品组合及原SourceStateStore。
**Produces** 声明输入下正向MATCHED与真实跨仓边/发布/重开，以及同Source变更stale的可复现证据。

- [ ] 固定两根/两repo，正文在index前作为OTHER/AUTHORED/TEXT纳入Source完整inventory；原Code/Syntax流按原规则重绑定并明确RECORDED_REPLAY。声明正文与expected在调用产品前冻结；普通根测试不启动Native/Rust/helper或依赖.superpowers输入。
- [ ] RED：调用固定composeMatchedWorkspaceRuntimeV2完成两consumer的源文档匹配与真实SQL发布/只读重开；断言实际MATCHED、当前binding和HTTP跳边。无声明的原J7/P5拒绝测试不删除。先看到集成FAIL，再修复T1–T3原范围问题。
- [ ] 正式SourceState CAS改变文档后旧结果AFFECTED/旧frozen拒绝/last-good保存；权限拒绝前无Store读取、取消无发布。测试不将自制COMPLETE或声明对象直接插SQL作为正向证据。
- [ ] GREEN：新集成文件；根入口显式追加本包 IR/Contracts/Execution/Storage/Application/Runtime 六个新测试文件，各一次；Fixture发现/注册唯一性测试各一次。
- [ ] 收尾前冻结**一份**去重Node文件清单，含本root及旧IR contract、matching/stitch、Store、Application/Runtime受影响入口；只跑一次集中范围批次。构建触及六包、IR类型、scripts/check-architecture.mjs和具名format，普通局部修复必要复验含在本批准内。不得机械复跑完整Phase0.5或全仓verify。
- [ ] 作者按五项Review Focus整包核对，重要范围内缺陷一并修复与最小验证；results/progress附准确命令/exit/执行种类及未满足门禁。不新派代理、不新增收据层或清理原证据。

## 依赖、完成与作者计划审查

T1→T2→T3→T4顺序执行。T1的独立Fixture准备可先于产品，但不并行启动测试；T2领域与T3存储有接口依赖，不标成独立任务。每项只有实现+对应Fixture/测试+架构/文档证据才结算，纸面任务完成不是父任务验收。

作者核对：Source值认证只在Store对真实snapshot完成；纯IR/parser不能证明当前性。证据只在workspace层，不改repo Contract/旧refs；新版stitch重算不是相信caller MATCHED；W005/W006的CHECK1已在设计解决，未知容器仍拒绝。Source docs作为OTHER进入已有FULL规则，不放宽旧full/delta门禁。预算和schema输入上限均来自已有调用值，未写profile数字。

拟接受 B_DECLARED_HTTP_SCHEMA_LOCAL_EXIT，先回看原U5/E05/E06准确证据类别再决定哪条门禁能关闭；原E02/物理/完整Phase1不自动通过。未进行新功能测试或实施；此计划不授权真实Native/进程测量/云端CI/Git/模型/新依赖。自审已消除三个接口歧义：正文string保留原换行，不用trim型Text；匹配与stitch明确返回consumed以续接控制；Store read/apply必须在解析前接收明确的maxInputBytes，不能先按更大额度解析。本文及详细设计可**一次批准**，随后T1–T4、范围内修复、必要验证与文档连续执行，无微任务重审。


## 实施检查点与作者组件评审 — 2026-11-03

状态：IMPLEMENTED_COMPONENTS_VERIFIED / T4_EXECUTION_APPLICABILITY_HOLD；不是整包退出。用户已批准原设计及T1–T4，本节替代旧“未执行/待整包批准”的历史快照。

|责任|新鲜结果与缺口|
|---|---|
|T1|独立正文/expected先冻结；严格IR、全体bytes解析前准入、Source/support/绑定拒绝和新摘要已实现。Fixture冻结4项保持|
|T2|显式两consumer匹配、缺声明未知、明确冲突、多provider歧义、comparison cap及新V3重算/取消控制已实现；旧六状态/跨仓Fixture保持。正向执行覆盖问题见T4|
|T3|实际owned Store的Source值认证、SQL1/JSON2写入/只读重开/未知混格式拒绝、内部恢复、Application权限/取消及固定Runtime已接入；非空Source声明的最终发布/归档仍随T4未到达|
|T4|两份实际owned Source文档+原记录流重放进入真实Stage/SQLite；两个consumer MATCHED、1条HTTP边，但接口声明没有调用点，旧边界门禁使PARTIAL/NOT_PUBLISHED。正向COMMITTED断言真实失败；之后的重开/Source CAS尚未执行|

一次适用收尾批次14文件 **127/127 PASS，0FAIL/CANCEL/SKIP/TODO**，准确清单final-unaffected-scope.json、输出final-unaffected-tests.log；T4失败明确不包含在该绿色批次，保留t4-diagnostic.log，并非豁免或删除测试。IR/Contracts/Execution/Storage/Application/Runtime六包构建exit0，IR类型及架构17通过。原B唯一results/progress记录命令与身份；不与旧205/205、15/15等重叠数字相加。

作者按Review Focus核对：真实Source内容/值由Store认证；两consumer未丢弃；null没有变成absence；SQL1/严格JSON2和未知格式已测试；授权先行、取消及累计预算拒绝保持。补充两个预算具体RED→GREEN：全部正文bytes必须在第一份JSON解析前准入；比较额度耗尽不能再消费一个单位。原type推断泄漏/ScopedRef导入和测试permissionContext/null、consumer排序等错误均已定位，旧日志保留。共享catalog摘要和纯引用context抽至IR复用，不新增Storage→Contracts依赖。

唯一待治理项：[执行适用性澄清](../specs/2026-11-03-phase1-contract-execution-applicability-clarification.md)PROPOSED，未实施；拟在新V3凭完整current site-plan证明该声明无调用点时保留MATCHED而不造执行边，实际有site却缺边仍拒绝，旧V1/V2不变。没有静默删除WORKSPACE_BOUNDARY_UNPROVEN。T4普通root新增注册和最终完整退出随该项暂停，不把未注册/未到达验收写PASS。

批准该局部澄清后直接继续原T4、根注册、正向发布/重开/Source CAS、必要范围修复与文档结算，不重新拆四任务审批。无Native/Rust/helper/collector/模型/CI/Git写入或新依赖/profile/数值；4/21、17OPEN和A6/E02/历史风险不变。作者评审，不冒称独立评审。


## 最终本地退出与作者整包评审 — 2026-11-03

**B_DECLARED_HTTP_SCHEMA_LOCAL_EXIT：T1–T4完成。** 用户已明确批准原整包与唯一执行适用性澄清；上方T4 HOLD/待确认/未注册是保留历史，不代表当前状态。没有把失败测试改成通过记录，原log均保留。

- 既有root追加六个新文件各一次；Fixture Source正文资产具名列入原ID，原criticalFacts/gates不变。
- 最终一次root＋受影响匹配/跨仓/Store/授权/Runtime/Fixture兼容共8入口：**120/120 PASS，0FAIL/CANCEL/SKIP/TODO**，exit-scope.json/exit-tests.log。前一14文件127/127是不同范围的历史收据，不与120相加。
- 六包基础构建均exit0；适用性修订后Execution/Application/Runtime三包新鲜构建均exit0，exit-builds.json；其余三包源码未再变，复用final-builds.json。IR类型final-ir-types.log通过，当前架构exit-architecture.log为17项目通过。具名格式、注册/独立Fixture4项和原Native/锁/旧IR31项身份核验见结果索引。
- 最终T4：两consumer真实MATCHED、恰一条当前proxy HTTP边、实际owned workspace COMMITTED、非空声明证据只读重开、正式Source CAS后AFFECTED/旧frozen拒绝/last-good保留。真实调用site存在而boundary全部断开的反例仍PARTIAL。无声明旧Source继续UNRESOLVED，旧规则未被重标。

|Review Focus|最终证据与结论|
|---|---|
|Source真实性|IR正文/SHA/support闭包＋实际Store完整Source值认证，伪造拒绝；全体bytes先准入后解析|
|合同声明/执行|两条consumer不丢弃，完整plan无site者不造边；有site缺boundary仍拒绝，provider必须唯一entry|
|null/未知|ABSENT与null分开；仅显式支持的有限HTTP声明参与兼容，原六状态/无文档门禁保持|
|版本/恢复|SQL1/严格JSON2，未知/混格式拒绝，内部只读恢复和非空Source归档重开已验证；无迁移/旧行改写|
|授权/资源/变更|权限先行、取消/PARTIAL不发布；累计input/items有具体红绿；Source CAS使结果AFFECTED且保留last-good|

作者审查未留未修复的重要项；无独立新代理评审，不冒称全仓verify/原完整Evaluation/生产资格。执行种类为RECORDED_REPLAY＋ACTUAL_OWNED_SOURCE_DOCUMENT＋OWNED_SQLITE；没有新Native/Rust/helper/collector、模型、CI、Git写入、新依赖/profile/经验数值。

裁定已核对：原catalog摘要/引用context抽取复用而不新增依赖；selector只绑定现存记录Code的factKey，schema值与预期由独立字面Fixture给出，不用产品输出生成expected；初始Source路径排序和Java请求/回声重绑定仅修复测试重放输入，不冒充新观察。旧失败、原输入/原根和原风险保留。

本包仅交付有限显式schema合同的本地跨仓闭环；并不要求每个仓库补写文档，不自动推断语言类型/协议或运行成功。原P1-04..09/E01/E02/E05/E06与完整Phase1仍按全部门禁逐项审核，4/21已接受、17OPEN不据组件数提升。A6 NOT_QUALIFIED、E02 NOT_EVALUABLE、历史Native timeout UNKNOWN、main取消结算未重新查询、R4/C2限制保持。下一工作依原路线整理原A/B剩余门禁，并可准备C文档语义/知识发布的集中设计，不授权C/D编码或云端操作。
