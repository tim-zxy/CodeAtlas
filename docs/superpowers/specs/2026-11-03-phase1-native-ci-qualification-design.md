## Q0实施与真实清单审查结果 — 2026-11-03

R5附约与Q0已明确批准。唯一实际工具修改为layout helper（v5默认、旧四映射保留、五根confinement）；CI仅追加R5失败fallback，三个既有测试文件同步独立v5/拒绝控制。没有改pack schema/实现、产品packages、迁移/Fixture/注册/依赖/阈值或approved-transport.json。

安全定向RED为10项5PASS/5FAIL；实现后扩大至相关临时文件ownership/严格record控制，40/40 PASS、0fail/cancel/skip/todo，1993.0827ms。日志r5-safe-red.log、r5-green.log归原B integration-preparation；首轮r5-red.log保留。

**必须披露的首轮测试错误：** 我在R5输出拒绝尚未实现时调用了真实prepare负向分支，意外运行rustc描述1次、cargo build1次（exit0），新建R5作为失败输出，随后尝试取得旧R4时EEXIST停止。没有运行Native analyzer、语料生成、测量或安装，也不能把该构建计为资格。旧R4拒绝发生在接管/写入之前；没有依据宣称其全目录新hash核验。测试已增加纯confinement前置断言，后续安全RED/GREEN不再到达构建。

用户另行明确批准纠正本次外部文件：确认仅ci-result.json（95字节）与native-build-process.json（264字节），逐SHA归档到原B integration-preparation/r5-incident，再仅删除这两个文件与空目录。archive-receipt.json记录原SHA与rootAbsent=true；无递归、无R1..R4操作，原失败完整保留。R5现在不存在，但其先前事故不抹去、不伪装为从未创建。

Q0-2已完成只读展开与缺口审查，结果为NOT_READY_DISCOVERY_RUN_BOUND，而不是完整可执行清单通过。既有prepare将构建、语料发现、22qualification、110校准和22holdout合在一次命令内，不能按文件名拆成互相独立的可执行阶段。独立原始输入和当前编译身份仍必须在未来freeze重新绑定；本次未改变Git head或授予实际运行权限。


# Phase1 Native CI 资格补齐：集中设计

日期：2026-11-03。状态：ACCEPTED_Q0_OFFLINE_IMPLEMENTED / RUN_MANIFEST_NOT_READY；真实执行清单尚未冻结。用户已同意先准备资格补齐方案；本文不把该同意扩大为真实运行、数值安装或云端授权。

## 目标与范围

先解除当前三个 CI jobs 的已知 Native 前置阻塞，再安排准确提交上的云端检查与正常合入。此批只补现有 Java/REFRESH CI 资格，不实现 Phase1 混合生产资格，不关闭 A6、E02 或 Phase1 父项；4/21 已接受、17 OPEN 保持。

基线为本地候选 be41b9b2dfd58661388000689bd9769b8f3b5fb7，parent 433015700c7c701a6493f7f8fa5eace00e773913。当前四包156个编译JS的既有审计和原本地功能证据复用；本轮不重跑64分钟普通根测试，不编译、不启动 Native/Rust/helper/collector。

## 实码核验与证据

1. nativeMetadataEnvironment 对 IR/Storage/Providers/Runtime 的实际编译JS（仅排除规定的profile数据模块）及Zod版本计算身份。既有最终审计身份为 726ffb9793680e58698fcd3fb3f4d0698228df0fab89217ef04a6846bc6fa013，Node24.15.0 / V8 13.6.233.17-node.48 / win32 x64 / Zod4.6.1。三个旧profile目录均无匹配；Syntax catalog空。该身份是当前编译证据，不是未来重建的预授权身份。
2. CI Native job明确启用两个REQUIRE标志，执行三个当前profile门禁；随后执行原exact-pack actual22。verifyRefreshCiPack先精确比较当前Native sourceFiles，install再核对独立依赖目录。旧批准包不能因曾经PASS而获得当前适用性。
3. 本次只读独立盘点：旧批准Native源清单28项，当前52项；新增24、修改6、删除0。修改为Cargo.lock、crates/native-analyzer/Cargo.toml及src/analyze.rs、java.rs、lib.rs、protocol.rs。原批准包绑定layout-v4，不能替换其SHA或伪装为当前Native包。本次未下载旧包。
4. 当前prepare仅选择固定R4，且原R4已存在post-trial mutable DB；不能当作pristine、恢复、接管或绕过ownership。新增证据需要新的治理决定。

原始记录复用原B results.json.integrationPreparation；本次盘点和文档检查写同一索引nativeCiQualificationPreparation，不新造全仓封存或重复收据体系。

## 方案比较与推荐

- 推荐：复用既有四用途测量/候选/holdout/pack工具，新增固定layout-v5 = C:\CodeAtlas-P05-D5-R5。只扩充版本映射、全部根的输出防重叠、必要既有测试与失败上传路径。保留旧版映射、generator-v3、原字节清单、所有预算和拒绝规则。没有新通用runner、任意目录参数或新依赖。
- 继续等待：保留本地候选及CI HOLD，可安全推进其他已获准产品任务，但不能完成本次CI/合入目标。
- 不采用：移植旧profile、重贴旧包身份、复用mutable R4、降低门禁、先试跑CI；均不能解决精确身份冲突。

新增固定R5属于ADR-019私有EVOLVABLE契约的后继附约，需要明确批准。本设计不改变FROZEN模型、度量公式或数值阈值。批准后同步ADR-019、scalability、Evaluation、Acceptance适用说明和Traceability；旧正文/证据保留。

## 职责、数据与操作边界

|责任点|复用/最小变化|可核验结果|
|---|---|---|
|CI layout helper|新增v5到固定R5；新prepare选择v5；v1..v4原映射不变；所有五根均受输出排斥|独立版本/拒绝向量，已存在根和alias继续拒绝|
|pack/approval reader|复用layout分派和generator-v3规则；不改严格schema/sourceFiles/依赖/SHA/ownership|旧v4记录仍按原R4读取，新v5不会把旧包当新包|
|CI失败产物保存|仅在原fallback路径追加R5，触发器/jobs/必需步骤不变|失败原物可保存，缺失路径仍不能代表actual成功|
|测量与候选工具|原四用途、校准/holdout分离、原M+J/floor规则|候选来自精确新身份，holdout不回流抬高候选|
|证据与配置|先固定源码/编译/工具/语料/命令/环境/owned输出；profile与Release记录后审批|没有未知SHA、假pristine、自动安装或自动发布|

SQLite仅由既有应用/测试拥有流程创建或复制已验证pristine输入；不升级用户库、不读写R4。Rust不写权威SQLite。正常失败保留原输出和错误，停止有关批次；不换PID、不扩大cap、不自动重新生成或重试到绿。只回收当前明确拥有的进程/句柄，cleanup UNKNOWN即停。

## 任务依赖与审批合并

Q0离线兼容/清单准备 → Q1实际构建与语料资格 → Q2四用途校准/独立holdout → Q3准确数值审批/安装/本地admitted检查 → Q4准确资产发布及云端CI → Q5评审与合入。

Q0与后续运行属于不同授权：Q0不创建真实R5根，不运行prepare/bench/collect/cargo，不安装profile，不改批准资产记录，不做Git写入。Q1之前必须把生成器内部的实际Native/helper启动范围展开；不能把一个prepare命令说成只运行一次Native。

现行四用途类数由原工具确定：READ_SEAL13、FULL_TRANSPORT14、REFRESH_VERIFY15、REFRESH_TRANSPORT22。每类五次校准，共320；每类一次独立holdout，共64。D corpus另须原22类qualification，另有构造Source/reference FULL的内部执行及数值批准后的actual22；不能将它们隐藏在320里。以上是既有覆盖要求，不是本轮批准的真实启动数，也不是耗时或全OS进程总数保证。

Q0需交付一个完整可审查实际批次表：每条argv/env白名单、每case/重复号、直接/间接工具与进程种类、最多次数、数据库/输出ownership、精确身份、原始日志目的地、停止条件。若原工具会执行额外READ_SEAL诊断，必须在清单中列明并冻结，不运行中临时追加。计数无法封闭则真实执行仍NOT_READY，不请求空白授权。

真实运行批次可一次批准Q1/Q2及原范围内必要离线修复，但源码/工具freeze后变化立即停止；不自动把新构建接入旧批次。Q3只能在获得具体M/J/floor/候选值/holdout结果后集中审批，不能预批准未知数字。Q4包含Release云写入、准确commit和当前push+PR两批六jobs；merge还会触发main批次，需明确涵盖。两者不能从允许本地开发推导。

## 最小验证与出口

- Q0：三个现有layout/pack/CI脚本的离线相关selectors；仅验证新增v5、旧四映射、五根confinement、严格record拒绝及R5 fallback。先审计selector副作用，禁止默认执行整文件里任何真实prepare/worker/下载；必要时只选已有纯函数/注入fixture case。无需新增Fixture ID、全局计数或产品架构层。
- 仅变动JS语法/具名格式；无packages依赖变化则复用17项目架构证据。不重跑普通root、A/B整链或旧完整Evaluation。只有证据相关性变化才扩大范围。
- Q1/Q2：原独立oracle、全部原类与失败数据、精确身份和独立holdout。取消/失败/未运行/SKIP不计PASS；holdout失败停止该候选，不重新选峰值。
- Q3/Q4：旧purpose准入、equality/one-byte-below、实际匹配profile和必需CI门禁均保留；真实范围的准确selector在运行清单冻结时列出，不因计划数字而宣称通过。
- 作者审查本批设计/计划，不新增代理。后续完整分支独立评审仍是单列未完成要求；不能由本次作者检查代替。

Q0完成仅表示RUN_MANIFEST_REVIEW_READY；四用途完整补齐且后续云端通过也不授Syntax混合流程资格。A6的conhost未知映像/最终peak缺失、非debug适用性、Syntax全链purpose仍独立OPEN。本包不重试其已用尽G01/D01/C2 slot，不自动放行conhost。

历史Native timeout UNKNOWN与两项普通Node QUERY_TIMEOUT UNKNOWN分别保留，不称已修复或flaky。原main CI39708335128不查询重跑或恢复；Phase1原所有验收门槛与DEFERRED边界保持。

## 本次集中待确认

批准本设计的固定R5附约及Q0离线实施/运行清单准备，一次完成范围内修复、必要检查和文档同步。真实R5构建/语料生成/测量待完整清单后一次确认；未知profile值和云端操作维持其必要审批。这样把本次新契约审批集中一次，后续不逐文件或case询问。
