## B1–B2本地实施与批次审查结果 — 2026-11-03

用户已明确批准完整离线包。六项family、八个原Source pin的私有数据/helper与四处R5有限范围已实施，旧/无context循环保持；多文件直接按当前summaries总长度限制，包含两个base文件，retained不再进入R5下降搜索，remove只枚举固定pair，upsert范围耗尽拒绝检查放在原DB关闭/只读重开后，未跳过settlement。所有原实际Native/Source/相邻拒绝/Store/重开断言保持。

TDD纯scope两项0/2 RED（缺模块），最终scope/旧context/版本隔离4/4 PASS、0fail/skip/todo/cancel、268.1634ms；六JS语法通过，具名格式通过。没有运行真实边界入口、Native/Rust/helper/DB或构建；四个真实分支的当前producer行为仍由下一真实资格批次证明，纯scope测试不代替。没有新Fixture ID/注册、产品模块/迁移/数值/依赖或公开入口。准确日志及SHA归原B results.nativeCiQualificationPreparation。

作者已沿实际调用链复核批次上界：八类边界1848 Native；其他14类DESCRIBE+FULL28；13个成功类独立target FULL26；cancel reference2；九轮replay（functional2＋qualification1＋calibration5＋holdout1）每轮最多18 Native，共162；合计最多2066。每轮包含token-race竞争Native1、main正常Native17，四种fault用Node，SQL-preflight不spawn；重开retry只read/prepare，不再次Apply/Native。9×22=198 replay Node、2 reference Node，其他三个用途worker252，固定FULL child84、fault child36，加八个顶层Node命令，总计580。编译仅允许未来一次cargo build及一次rustc描述，其编译器/linker子进程不伪称固定测量进程数。最大数量是原case内全部调用的保守上界，不是新增重试额度。

完整argv/cwd、逐文件SHA、Node/Rust shim、52项Native source、未存在的新输出、原scope和停止规则写入原B integration-preparation/r5-run-manifest-preparation.json，状态REVIEW_READY_EXECUTION_NOT_AUTHORIZED。一次D prepare已含22qualification/110calibration/22holdout，不另重复；全四用途320校准、64独立holdout保持。按同一清单顺序执行，命令失败后不启动后续命令、不重新编译重跑；原命令内部有限case失败保留其结果，允许其既定循环自然结算，不通过再次运行选择峰值。

未来Native binary SHA仅可来自明确批准的那次构建及原build receipt，首次Native前核对源码/工具/当前Node编译身份；不把前轮意外构建用于资格。配对与verify manifest按既有严格schema由当前raw和SHA构成，当前无匹配floor则priorApprovals=[]，不拿旧profile授予新身份。candidate先冻结再holdout，任何失败/漂移保持HOLD。profile具体数值、安装、admitted actual、Release/CI/Git仍未授权；没有下载或重复完整普通回归。


# R5 Native语料发现有界化设计

日期2026-11-03。状态B1_B2_LOCAL_EXIT / ACTUAL_RUN_APPROVAL_PENDING。继承[资格集中设计](2026-11-03-phase1-native-ci-qualification-design.md)，只解决Q0已证实的发现次数缺口；不授权实际Native、构建、测量或云端。

## 依据与选择

本轮只读核对原R4八份boundary.json与已批准approved-transport.json的archive.entries，长度和原SHA全部相同。未读取SQLite或尝试恢复mutable R4。以下是历史Source形状，不是当前R5边界、输出、profile或pristine证明。

|case|历史接受数量|相邻下一数量|单位|
|---|---:|---:|---|
|d-preparation-input|394|395|fileCount|
|d-slow-stdin|394|395|fileCount|
|d-shared-owners|238|239|fileCount|
|d-complete-coverage|392|393|fileCount|
|d-overlay-retention|392|393|fileCount|
|d-retained-sites|1982|1983|memberCount|
|d-dense-remove|1981|1982|memberCount|
|d-dense-upsert|1986|1987|memberCount|

推荐仅对固定R5准备路径限定有限枚举范围，继续使用当前Native逐项核验；原R1..R4及无D context的算法保持。另一条路线是给原无限发现循环指定新的经验尝试预算，现无该数值的证据且会增加新的决策，不采用。也不从旧输出构造新Provider事实。

## 具体规则

1. 五类多文件边界保留原一个真实seed、逐文件Native FULL、重新frame以及最终真实多文件bootstrap/Store/重开。新增上界仅为表中历史next.fileCount；实际frame仍按当前文件/path/fingerprint和原maxStdinBytes/maxLineBytes判断。在范围内提前找到真实相邻边界可接受；到上界仍无原要求的拒绝则失败，禁止再加文件或更新seed自动重试。complete-coverage/overlay原base两个文件必须计入总fileCount，不把395等误用成新增文件数。
2. retained-sites在R5仅枚举1982、1983一次，复用sizeRetainedSitesBoundary及后续实际bootstrap。保留原Source family/hash核对，取消R5的向下换seed/向上无界搜索；两个当前结果必须仍证明原要求的相邻接受/输入超限，否则失败。旧D context下降/增长不改。
3. dense-remove在R5仅枚举1981、1982，原frame改动、真实summary、后续bootstrap/Store/重开和下一输入拒绝全部保留；不能凭旧数字直接宣称输入超限。
4. dense-upsert仍从既有已核对Source seed1982逐字段实际REFRESH，R5最多到1987（六次）。必须观察到SUCCEEDED及相邻RESOURCE_LIMIT_EXCEEDED、原producer错误及activation不变；范围耗尽而无正确next时失败。不得把两个端点的旧观测复制为新记录。
5. 这些数字是有来源的离线实验范围，不是新生产默认、质量阈值、profile、保留量或概率。缺失/不匹配就保持资格HOLD；实际新边界超出范围需以失败证据另行决定，不能自动扩范围或修改原expected。

## 最小实现与接口

新增私有数据packages/runtime/test/helpers/native-refresh-r5-preparation-scope.json，保留上表八项历史pin/数量及Source-family对应；标记HISTORICAL_SOURCE_SCOPE_ONLY、qualification=false。不复制原旧wire、summary、DB或测量，不新增Fixture ID或全局计数。

新增私有helper packages/runtime/test/helpers/native-refresh-r5-preparation-scope.mjs，唯一导出r5PreparationScope(family, dContext)。只在dContext.executablePath精确属于既有固定R5 Native路径时返回该family的只读数量；其他已知旧/无context返回null以保留原路径，R5未知family拒绝。此值仅供测试准备代码使用，不进入Runtime admission或IR/wire；信任与context校验仍由原snapshotDRefreshFixtureContext承担，不增加包装层或任意配置。

四个现有boundary helper各在原循环/分支增加R5有限范围，均复用上述唯一数据与现有断言；不重写算法，不增加通用采集runner或全局可变预算。遍历到端点后用现有完整性/next断言拒绝，不吞异常或改错误为成功。

## 可验证执行数量

边界生成Native直接启动上界（不含后续functional/测量）：多文件两个398、shared242、complete/overlay两个394，共1826；retained6、remove6、upsert10，共1848。公式含seed DESCRIBE+FULL和最终bootstrap DESCRIBE+FULL；upsert额外包含调用方重新建立最终fixture的2次。完整case中同一preparedSourceRefresh含两次Native启动，不能遗漏DESCRIBE。范围失败可少于上界，不承诺任何成功次数。

1848仅是八类边界生成的上界，不是全部Q1批次数；普通14类准备、成功类独立target FULL、cancel reference、44functional Node及嵌套子进程、22qualification/110calibration/22holdout和构建仍须进入最终运行清单。离线实现验收必须重新沿实际调用链复核该算术，不凭设计文字授运行资格。

## 最小验证、恢复与追踪

在已有scripts/test-native-refresh-ci-layout.mjs追加一个小的纯离线scope/schedule suite：八项独立字面值、R5范围、旧context null、未知family拒绝、总文件数减去base/seed的probe上界、两项固定field范围及六次upsert；使用同一生产准备范围责任点，不仅静态搜源码。没有实际R5/Native/helper/DB/cargo。原40项不机械重跑，只选新scope/现有版本隔离相关case；格式/语法具名运行。四个实际边界分支在真实资格批次承担当前Native行为验证，纯scope测试不得冒称已证明真实producer。

历史八项pin及原命令/失败统一保存在原B索引；新scope数据在批准后冻结，修改原Source族、数字或断言需新证据。同步ADR-019、scalability、Evaluation、Acceptance适用范围、Traceability和CURRENT_STATUS，保留原门禁。无生产模块/SQL/Fixture注册/依赖/分数变化，复用17项目架构证据。

失败只保留原输入/输出/owned目录，关闭本次明确拥有的资源；不清理R1..R4、不自动重建R5、不换根或重试到绿。前轮测试事故原证据和授权清理记录保留；R5当前不存在，启动前仍需再核验。

## 审批与出口

请求一次批准本R5局部契约及离线实施包：数据/helper、四个boundary范围分支、既有测试的小suite、最小验证、权威文档和完整实际运行清单同步，范围内缺陷统一修复。此次改变R5准备失败/停止行为，超出Q0版本映射授权，按AGENTS设计治理不能静默编码。

批准不含实际Native/Rust/helper/DB、构建、测量、校准/数值、下载、CI、Git写入或新代理。离线包完成后，在准确最终源码/工具/命令和全部启动上界上一次确认真实批次；未知候选数字及云端保留各自必要审批。Phase1/A6/E02和历史UNKNOWN均不自动关闭。
