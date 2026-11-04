## Q1/Q2一次完整批次完成 — 2026-11-03

八入口exit0、22qualification/320calibration/64independent holdout、失败0；3小时59分50秒，未重试。原B r5-final-numeric-audit.json为准确关闭证据。[具体数值与下一集中包](../specs/2026-11-03-phase1-native-profile-numeric-review.md)待批准；静态表尚未安装，不授admitted actual/CI/Git或Phase1资格。旧NOT_READY/待执行文字留作历史。

## 有界发现已本地完成，Q1/Q2真实批次待一次确认 — 2026-11-03

[有界包实施与完整数量审查](2026-11-03-phase1-bounded-native-preparation.md)替代此前DISCOVERY_RUN_BOUND缺口，保留原失败。新清单最大2066 Native/580 Node、一次cargo build/一次rustc描述；原320校准/64独立holdout另有qualification/functional/嵌套调用，全部已计入。八个顶层Node命令准确argv与独占输出见原B r5-run-manifest-preparation.json；真实资格、数值/安装及云端仍未授权。Q040/40为历史范围，新scope最终4/4，不重跑全root。

## Q0实施与真实清单审查结果 — 2026-11-03

R5附约与Q0已明确批准。唯一实际工具修改为layout helper（v5默认、旧四映射保留、五根confinement）；CI仅追加R5失败fallback，三个既有测试文件同步独立v5/拒绝控制。没有改pack schema/实现、产品packages、迁移/Fixture/注册/依赖/阈值或approved-transport.json。

安全定向RED为10项5PASS/5FAIL；实现后扩大至相关临时文件ownership/严格record控制，40/40 PASS、0fail/cancel/skip/todo，1993.0827ms。日志r5-safe-red.log、r5-green.log归原B integration-preparation；首轮r5-red.log保留。

**必须披露的首轮测试错误：** 我在R5输出拒绝尚未实现时调用了真实prepare负向分支，意外运行rustc描述1次、cargo build1次（exit0），新建R5作为失败输出，随后尝试取得旧R4时EEXIST停止。没有运行Native analyzer、语料生成、测量或安装，也不能把该构建计为资格。旧R4拒绝发生在接管/写入之前；没有依据宣称其全目录新hash核验。测试已增加纯confinement前置断言，后续安全RED/GREEN不再到达构建。

用户另行明确批准纠正本次外部文件：确认仅ci-result.json（95字节）与native-build-process.json（264字节），逐SHA归档到原B integration-preparation/r5-incident，再仅删除这两个文件与空目录。archive-receipt.json记录原SHA与rootAbsent=true；无递归、无R1..R4操作，原失败完整保留。R5现在不存在，但其先前事故不抹去、不伪装为从未创建。

Q0-2已完成只读展开与缺口审查，结果为NOT_READY_DISCOVERY_RUN_BOUND，而不是完整可执行清单通过。既有prepare将构建、语料发现、22qualification、110校准和22holdout合在一次命令内，不能按文件名拆成互相独立的可执行阶段。独立原始输入和当前编译身份仍必须在未来freeze重新绑定；本次未改变Git head或授予实际运行权限。


# Native CI qualification preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 本会话顺序实施，不新增代理、会话或工作树。

**Goal:** 完成固定R5离线兼容与可审查的准确真实运行清单，避免已知不合格的CI尝试。

**Architecture:** 复用原layout/pack/bench/holdout工具，只在既有单一责任点增加固定版本。真实执行、数值和云端分别按设计的集中边界处理。

**Tech Stack:** 现有Node标准库、现有脚本测试与Git只读身份。

**Spec:** ../specs/2026-11-03-phase1-native-ci-qualification-design.md

状态：Q0_OFFLINE_IMPLEMENTED / RUN_MANIFEST_NOT_READY。Q0批准与本轮准确结果见文首。

## Global Constraints

- 当前head be41b9b2dfd58661388000689bd9769b8f3b5fb7；保存原提交，无amend/reset/stash/stage/commit/push。
- v5固定C:\CodeAtlas-P05-D5-R5；原v1..v4原映射/字节/ownership保持，不创建真实R5。
- 不改生产模块、wire、SQL迁移、用途公式、cap/timeout、分数/依赖或现有approved-transport.json。
- 不调用cargo/prepare/bench/collect/实际Native/helper/collector、下载或云端写入。
- 所有结果归原B results.json.nativeCiQualificationPreparation；当前身份和历史证据只按适用范围复用。

## Review Focus

- 旧v4批准记录必须仍落R4，不能按当前生成默认落R5。
- 输出在任何旧/新证据根下均拒绝；相似前缀目录不能误判为根内。
- strict reader对未知revision仍拒绝；v5不能使旧Native清单获得新资格。
- 一个prepare命令可能包含多次Native/FULL；运行数必须展开，不用320掩盖其余执行。
- 所选离线测试可能隐式启动真实工具；执行前检查调用链，只选注入/纯验证路径。

## Q0-1 固定版本兼容与追踪（批准后连续执行）

**Files:**
- Modify: scripts/helpers/native-refresh-ci-layout.mjs
- Modify: .github/workflows/ci.yml（仅原失败fallback追加R5路径，不改触发器/jobs/运行步骤）
- Test: scripts/test-native-refresh-ci-layout.mjs
- Test: scripts/test-native-refresh-ci-pack.mjs（原严格v4保留，另补v5独立record）
- Test: scripts/test-native-refresh-ci.mjs（仅必要的新默认路径/拒绝预期）
- Synchronize: docs/handoff/adr/ADR-019-d5-exact-layout-ci-replay.md、docs/specs/native-analyzer-scalability.md、docs/handoff/specs/EVALUATION.md、docs/handoff/PHASE_ACCEPTANCE.md、docs/handoff/DESIGN_TRACEABILITY.md、docs/handoff/CURRENT_STATUS.md。

**Interfaces:** 既有refreshCiLayoutRootForRevision(revision)、refreshCiLayoutRevision、refreshCiLayoutRoot和assertRefreshCiOutputOutsideLayouts(output)；不新增API。旧reader按record.layoutRevision派发；现有非v1 generator-v3分支覆盖v5，不无故改pack实现。

- [x] 审计三个测试文件的test名称/调用链，列出不触发真实运行的精确selector。
- [x] 独立追加v5映射/新默认/五根confinement正反例，保留旧四映射与未知revision拒绝；只运行这些case，预期未支持v5的明确RED。
- [x] 最小扩展layout helper；按批准范围追加fallback；保留旧v4record控制，增加v5严格record控制。schemaVersion/generator规则不改。
- [x] 用同selectors证明GREEN与旧版拒绝/ownership安全；只跑实际受影响的必要局部兼容测试，不跑整包测量。
- [x] 具名格式与JS语法，检查diff只有批准路径；若实际pack调用链另有必须修改项，先定位是否原范围常规兼容缺陷，未发现前不预留扩展。
- [x] 同步上表权威文档与原B结果索引；状态仅Q0局部完成，不能改CI/Phase1 HOLD为PASS。

## Q0-2 完整实际批次清单（依赖Q0-1）

**Files:** 更新本计划的批次附表；原B结果索引保存可机读执行清单，不新增通用runner/产品入口。

**Consumes:** 新layout映射、原prepare/worker/pack代码及当前可用工具、输入与pristine规则。
**Produces:** RUN_MANIFEST_REVIEW_READY或具体NOT_READY缺项；批准前不填未知二进制SHA。

- [x] 只读展开scripts/native-refresh-ci.mjs::prepareRefreshCiEvidence及replay生成器、既有四bench/candidate/holdout/actual入口；列出所有内部Native、Node、构建及Source/reference准备种类/次数上界。
- [x] 列清校准65+70+75+110=320与独立13+14+15+22=64；另外列22类qualification、生成过程、诊断与批准后actual，不能把case数量误写为总进程数。无法给固定上界的生成段单列为尚未可授权，并说明使其封闭的最小准备。
- [x] 用现有文件读取/hash方法冻结实际源码/Node/Rust描述路径和输入；构建产物明确需批准的一次构建后才产生，列构建失败/变化即停，不伪造现在已知SHA。输出路径必须唯一新建；R1..R4绝不接管。
- [x] 为每个操作列准确argv、env白名单、owned输出、最大批次数、成功/失败预期、cleanup及失败停止规则；手工审查shell:false/windowsHide和不下载旧产物。
- [x] 核对当前windows环境与原离线bootstrap规则，floor仅来自真正匹配的已批准用途/环境；没有则按原规则null，不能借旧数值创造新资格。
- [x] 作者集中自审设计覆盖/计数/fixture/Quality Gate映射，审查是否可给出实际运行审批问题；本次生成次数尚未封闭，如实NOT_READY，不发空白授权请求。

## 后继整体顺序（不包含在Q0实际授权）

Q1真实构建/语料qualification → Q2一次四用途校准+独立holdout → Q3具体数值/依据集中审批、安装与必要准入/actual → Q4准确本地最终提交/资产云写入、push+PR两批六jobs → Q5完整分支评审和正常merge及main批次。

Q1/Q2可在准确清单上一次审批顺序执行，不逐case询问；失败保留、停止对应分支，不重试到绿。独立Syntax/A6不是本次Java资格的先决重建任务，也不被它关闭。Q3未知数字/Q4云写入是用户明确保留的真实决策，不能在本设计中预授权。

## 作者自审

设计目标只对应当前CI资格阻塞；固定R5有原R4 mutable和精确source清单差异的实际依据。无新抽象/依赖/Fixture ID/阈值，无完整回归重跑。Q0出口刻意不声称已具备真实执行权限；准备与运行的分界来自现有用户授权，不增加逐微步骤审批。当前Q0离线实现/定向验证与清单缺口审查已完成；真实启动次数未封闭，按计划的替代出口记录NOT_READY，不授权后继运行。

## 实际批次附表（非执行授权）

可机读明细：原B integration-preparation/r5-run-manifest-preparation.json。以下命令均未执行；路径参数在真实批次冻结前不得以尖括号占位形式运行。

|操作|现有准确入口|固定数及未封闭项|
|---|---|---|
|D统一prepare|node scripts/native-refresh-ci.mjs prepare <原B/integration-preparation/r5-prepare>|调用至多1次；内部rustc描述1/cargo build1；语料增长次数未封闭；44次functional Node trial、2次cancel-reference Node trial、22资格＋110校准＋22holdout测量Node；另含Native及negative fault child，不能相加称总进程数|
|READ_SEAL|node scripts/bench-native-metadata-memory.mjs，stdout独占保存新raw|65worker；独立holdout13|
|FULL_TRANSPORT|node scripts/bench-native-full-v3-memory.mjs，stdout独占保存新raw|70worker＋至多70个固定Node fixture child；holdout14worker＋至多14child|
|REFRESH_VERIFY|node scripts/native-refresh-verification-memory.mjs bench <new raw.json>|75worker；collect的独立holdout15worker，无真实Native producer|
|paired candidate|node scripts/native-memory-profile.mjs candidate <manifest.json> <root>|纯离线，manifest准确hash/候选文件尚未产生；不安装|
|paired holdout|node scripts/native-memory-observations.mjs candidate <independent dir> <candidate.json>|27worker及其中FULL的至多14child；候选冻结后执行|
|verify candidate/holdout|node scripts/native-refresh-verification-memory.mjs candidate <manifest> <root> <candidate>；collect <candidate> <workers> <holdout>|纯候选与15个独立worker；不能重复D prepare中已有holdout|
|具体数值后的actual|原approved模式及必需CI准入入口|未授权，不混入320/64；准确批次在具体候选/数值审查后冻结|

生成器实际缺口不是新的测量阈值：preparedFileBoundary逐文件实际FULL至继承input/line cap（五类）；retained-sites在既有1982 Source seed附近下降/增长并真实FULL；dense-remove从该seed减1逐项增长；dense-upsert从该seed逐项实际REFRESH至原output cap。原Source seed仅是hash核验的source-family准备，不是旧测量/边界资格。当前没有被批准的单次发现启动上界；不得擅填新数值或自动给循环加profile开关。

当前各Native调用仍走既有DESCRIBE/FULL/REFRESH及固定10秒控制，Node replay原60秒控制、原输出限制不变。一次preparedSourceRefresh另有DESCRIBE和FULL，成功类另建独立target FULL oracle。未来应先形成有界发现方案或可独立核验的有限recipe，再统一批准包含这些实际进程的完整批次。Q0不把该缺口升级为自动编码权限，也不发空白运行审批。
