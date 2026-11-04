# B0b-2：独立 v5 producer 与有界 consumer 详细设计（提案）

状态：WRITTEN_DESIGN_ACCEPTED_BY_USER；具体计划已确认，B2-01..06已按LOCAL_LIBRARY_CONTRACT实施并验证。见[实施作者评审](../reviews/2026-10-24-phase1-code-syntax-producer-implementation-review.md)和[实施计划](../plans/2026-10-24-phase1-code-syntax-producer.md)。原提案和计划前状态保留在证据快照；以下“提案/待确认/建议”为历史设计时点，当前实现证据及开放门禁以实施评审为准。

## 1. 启动与范围

前驱 implementation-verification.json 的884/884文件哈希在本轮开始匹配。前轮436PASS、107新测试、architecture17、registry48/exact22/catalog0是历史证据，本轮没有重跑。无 .codegraph，未建立索引。HEAD cc5a8cb571986c5e56ed04053b2c96ef500fcacb；不改动现有本地文档/EOL或历史证据。

目标：同一确定 Source 投影在有界库调用中产生真实 v5 Code/Syntax 原始流，并由 TS 有界读取器交给已有纯验证器；形成独立 Source→完整输出/Canonical 的库级反例。Java仍只承担v5 Syntax，Python承担四facet。所有产出仍为候选。

不包含：Native CLI v5分发、DESCRIBE广告、spawn/真实子进程/collector/helper、生产 Runtime/Source分类、最终混合snapshot/retained support/历史removed/原子Apply、R011迁移、实际内存资格或profile、依赖/数值门槛/云端操作。B0b-3、B1/C及P1-04/05/Phase1出口保持OPEN。本设计中的库测试执行须在具体计划批准后进行；并非授权实际Native分发运行。

## 2. 实码差距和方案

| 当前路径                                         | 已核对的行为                                                                                 | 设计处理                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| syntax.rs / SyntaxRequest                        | 私有header，严格v4及owner-map，保存raw_input_bytes                                           | 新v5严格入口；只提取私有共同payload语义校验，不把v4常量改为5，不重编码伪v4请求              |
| python.rs / observe,declare,walk,value,edge      | 同一树上声明/观察；只有Syntax partial；class置partial；wildcard被continue跳过；无四facet统计 | 在枚举/发射处记录v5 Code责任，不能事后按输出数量猜eligible；旧v4包装及字节结果保持          |
| syntax_producer.rs                               | 安全Source读取、跨文件work_items扣减、v4事件/终端                                            | 新v5 writer，复用Source/控制语义；不可把旧coverage结果重标为Code COMPLETE                   |
| java_syntax.rs                                   | 需要SyntaxRequest，复核真实Java声明owner                                                     | 共享私有payload观察入口，保留旧公开observe；v5不发Java Code                                 |
| native-client.ts / runProcess,decodeSyntaxOutput | 有进程关闭/失败优先级；v4按行有界缓冲                                                        | 本批只做无spawn的v5读取器，不复制进程owner；未来接入仍需B1/C方案                            |
| native-code-syntax-ipc.ts                        | request解析私有；公开函数需要完整request/output字节                                          | 抽取私有request快照供纯validator/reader共用，保留唯一既有公共验证入口                       |
| B0b-1 Fixture                                    | 12个结构种子；Java使用java:Box等unit身份；JS作者序列化                                       | 原44文件不改；另建producer oracle，不能要求实际Java提取匹配unit身份或按producer输出重写预期 |

已接受DCP限定独立v5，只有增量库实现能同时满足当前范围和旧契约。替代方案：把v4加sidecar或重解释SUCCEEDED，违反隔离；直接接CLI/runProcess，越过本批真实运行/准入范围；复制全套Python/Java解析器，造成身份/预算分叉。推荐：新增薄v5边界，复用私有公共语义和树遍历核心；不新增trait/通用协议框架/可配置投影。

这是本设计的推荐实现安排，尚未由用户确认；不是把“继续”写成对新文件布局或库执行命令的批准。

## 3. 模块、接口和数据流

拟新增Rust code_syntax.rs（严格request/受控错误/库入口）和code_syntax_producer.rs（writer）。lib.rs公开新模块，不修改protocol.rs/CLI。接口方向：decode_code_syntax_request(&[u8]) → CodeSyntaxRequest；write_code_syntax_observation(&CodeSyntaxRequest,&SyntaxWalkControl,&mut impl Write) → io::Result<()>；serve_code_syntax_request(&[u8],&SyntaxWalkControl,&mut impl Write)处理可识别请求的拒绝。具体签名/可见性由获批后的writing-plans固定。

CodeSyntaxRequest持有严格v5 header、原始字节长度和实际原始请求SHA；不能由调用方提供checksum。严格5/OBSERVE_CODE_SYNTAX/PYTHON_SYNTAX_CODE_V1后校验共同payload。syntax.rs原v4入口先执行原字段/版本限制，再调用提取后的共同值校验；每个版本自己拥有精确字段集合。新类型不能转换成公开SyntaxRequest冒充旧wire。

PythonSyntaxAnalyzer和JavaSyntaxAnalyzer保留原observe(&SyntaxRequest,...)。内部借用已验证payload的观察方法供两种边界使用；不把新模式参数暴露给调用方。Python旧路径不收集Code统计；v5路径在同一解析树/Collector中追加私有统计，已有身份域、源范围、literal规则、旧tick/输出不变。新v5统计操作也检查取消/预算；不得新增不记账的第二次全树扫描。

拟新增TS native-code-syntax-request.ts：移动而非复制当前私有request schema/快照读取，给同包validator/reader复用，index不导出parser/schema/raw授权能力。快照在首次await前复制真实request字节，后续checksum始终针对该快照；调用方事后修改buffer无效。既有纯validator API和八字段结果不变。

拟新增TS native-code-syntax-stream.ts：包内consumeCodeSyntaxObservationStream(requestBytes, stdout:Readable, signal:AbortSignal) → Promise<ValidatedCodeSyntaxObservation>，不加入index公共导出，不接收executablePath、profile或ready开关。它只拥有本次stdout读取；不拥有子进程、不证明子进程退出，也不提供生产调用入口。具体计划必须明确由谁销毁输入流、移除abort监听，以及所有失败的单次清理断言。

顺序：请求快照/校验 → Rust受控Source读取与库writer → TS逐chunk边界检查 → EOF完整字节 → 原validateCodeSyntaxObservationStream → 八字段冻结候选。TS reader不会绕过最终validator；不增设Canonical mapper、发布token或另一份存储真相。

## 4. producer责任、预算、失败

逐文件按现有path/id UTF8顺序处理，单次read_verified_source验证内容、链接/路径、元数据前后和SHA；只读明确sourceFiles，removed清单不触发读取/扫描。请求原字节+所有已读Source共用maxInputBytes；跨文件累计新v5 visitor work_items，不与maxEvents混用。SyntaxWalkControl只可收紧request/hard边界。Source/AST/结果/输出重叠仍需C实际内存测量，maxMemoryBytes不能凭正数shape被写成峰值已满足。

四facet在Source枚举时计数：MODULE每Python文件1，空/注释也有module；FUNCTION支持范围内function_definition并对应唯一声明/owner，含nested/async；IMPORT逐明确项保留hint/alias，wildcard必须计eligible/unsupported并给UNSUPPORTED_WILDCARD_IMPORT；REFERENCE仅固定Syntax值投影中解释为REFERENCE的出现次数，不泛化到return/所有标识符。

class使FUNCTION PARTIAL并给UNSUPPORTED_CLASS_SCOPE；class本身不是新FUNCTION单位，也不造TYPE。已发射的合法函数仍计covered。无法表示的声明/owner/import不计covered；语法错误对不能可靠判定的facet给SYNTAX_ERROR/PARTIAL，不能用丢弃Source单位换COMPLETE。动态非Code值可仅使Syntax PARTIAL。每facet分区恒等，edge resolution分布等于实际输出；limitations去重并使用固定确定性顺序。完整性范围不随样本失败缩小。

writer独立发OBSERVATION_STARTED/NODE/EDGE/SYNTAX_OBSERVATION/CODE_COVERAGE/SYNTAX_COVERAGE/DIAGNOSTIC/OBSERVATION_COMPLETED；文件阶段、四facet顺序、双outcome及六counts严格复用B0b-1。start/terminal回显包含原始requestChecksum；terminal SHA只包含之前真实写出的完整行。不可重编码对象计算替代原字节哈希。

每次write_all失败后立即返回I/O错误，不再向已损坏sink追加成功或重试。writer预留失败事件位置并约束每行/总字节/事件；若剩余字节连失败terminal也放不下，返回明确I/O失败且绝无completed，不承诺任意小budget都能写出失败流。可识别无效请求只发REQUEST_FAILED；无法安全识别requestId/framing时直接InvalidData。取消/超时/Source变化/超限不得产生可适用completed。终端及错误信息固定受控，不回显路径、Source或serde细节。

## 5. consumer和错误边界

先拒绝无效request或已取消signal，再分配/读取。总输出/事件/每行分别取request与现有hard上限；不新增transport默认数值。使用上限内的连续byte缓冲区及增量LF/line/event计数，不保留不受限chunk数组（单字节chunk不能把元数据放大到失控）。检查chunk长度/剩余额度后才copy；严格EOF后调用纯validator。缓冲区容量由已有上限给定，不新增常量。最终纯validator复制/解析会发生raw buffer+解析数据重叠，明确留作未来HOST reservation/profile证据，不能称为恒定内存或完整流式丢弃。

abort需销毁本次读取并移除listener，拒绝成功；错误/EOF/trailing bytes/中途关闭均无部分可用结果。NativeSyntaxContractError保留既有request/version/shape/checksum/resource/Native failure语义；取消用既有CANCELLED，纯transport I/O使用既有NativeClientError PROCESS_FAILED，不伪装成提取结果。进程kill、stderr、exitcode与失败优先级仍由将来的runProcess owner负责，本批不复制或声明已验证。

## 6. Fixture/Evaluation和兼容

新增独立Manifest（建议p1-code-syntax-producer-oracle-v1），保留B0b-1的44文件及旧16Source全部根。先冻结独立Source、请求模板、精确预期事件/coverage/Canonical、序列化规则及SHA；禁止调用新producer/normalizer产出expected。Java owner/Provider ID从已有Java编码及已冻结真golden独立推导，不能使用java:Box unit ID。

Rust serde_json对象键顺序与JS手写顺序可能不同；producer Fixture明确独立的实际wire序列化规则，验证完整原始流。owned临时root是唯一预声明替换字段；绑定SHA/终端SHA由测试标准库根据冻结模板和实际request字节计算，模板其他字段保持。不能对实际输出做排序/去字段/删diagnostic再称完整比对成功。结构种子、真实库oracle和实际Native资格是三种证据。

必须覆盖12类基本Source，加多import项/from-import/alias、嵌套重复引用、class内owner无法表示、语法错误及控制字符/Unicode；正反例矩阵在计划中冻结。预算边界取已有样本实际字节/事件/work与既有hard上限的等值和相邻值，不发明Quality Gate。writer短写/中途失败、取消/过期、第二文件累计超限、changedSource/路径/链接、chunk任意切分和单字节输入均有定向测试。符号链接环境失败必须如实OPEN，不能伪造可运行成功。

兼容验证包含旧v4全量raw/golden/错误/work预算测试，以及IPC1..3、Python/Java normalizer和B0b-1纯接口测试；旧Source和Fixture SHA不变。新统计仅对v5启用；如旧v4字节、错误或work计数变化，先判定实现缺陷，不顺手更新旧golden。无SQL/Canonical/ProviderSnapshot迁移。新候选回退只是不接入，不回滚数据库或清证据。

## 7. 依赖任务、可验证完成条件

下表是设计级任务分解，非已批准可执行计划；获批后使用writing-plans固定文件、RED顺序、精确命令与许可范围。

| 单元                                       | 依赖/顺序                          | 依据/Fixture/完成条件                                                                                                           |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B2-01独立oracle冻结                        | 首任务                             | DCP§4/5/7；新Manifest及全部Source/原始预期/Java身份/序列化规则先于产品冻结；旧44/16Source及registry基线留存；无产品生成expected |
| B2-02严格Rust v5和共同payload私有复用      | 01                                 | DCP§5/安全；真实新增API RED；v5精确解析/原字节绑定/旧v4拒绝保持；两端相同request正负矩阵                                        |
| B2-03Python双coverage和Java私有payload复用 | 02                                 | DCP§4；先以wildcard/class/重复引用等遗漏反例RED；已有身份、Syntax语义/owner和旧v4全部golden保持；统计与独立Source义务一致       |
| B2-04v5库writer和受控settlement            | 03                                 | DCP§5；完整原始流逐字节匹配oracle；计数/双outcome/累积预算、Source失败/I/O故障均诚实终止，无伪success                           |
| B2-05TS request私有快照和有界reader        | 02接口冻结后可逻辑独立；默认仍顺序 | B0b-1契约；分chunk/单字节/超限/abort/cleanup反例，最终返回必须来自已有purevalidator；旧公开API保持                              |
| B2-06跨语言库输出与范围回归/文档           | 04+05                              | 新producer原始流由TS pure/reader及独立oracle共同验证；声明测试/Fixture/架构/文档追踪全部通过，无Native CLI/测量/生产接入声明    |

推荐顺序01→02→03→04→05→06；03依赖02内部payload约定，06必须消费两端实际库产出。05在接口冻结后技术上独立，但共享请求抽取和文档状态，不值得并发；不创建新会话/工作树。

## 8. 门禁、评审与待确认

B0b-2 Exit：上述六单元实现/单测/新旧Fixture/Source负例/跨语言库流/架构/追踪证据齐全，旧wire/identity/预算/原golden保持；只认LOCAL_LIBRARY_CONTRACT，不认生产available或Phase1完成。空legacy qualityGates不授予Phase1通过。

第一项可执行工作是在具体实施计划获批后，保存原文件/registry/哈希并独立冻结B2-01；先不改产品。风险分层：静态hash/文档/架构 → TS请求/reader内存流 → 定向Rust request/collector/writer库测试 → 新Source oracle跨消费者 → 范围匹配旧回归。具体Cargo/Node命令由下一步计划给出，当前全部NOT_RUN；不自动运行root/full校准/Native CLI/CI。

治理：本提案是已接受独立v5方向的B0b-2实施细化；不改FROZEN IR/存储/发布/flow，无新增ADR编号。批准后同步ADR-020、NATIVE_IPC/PROVIDER_SPI/SECURITY/EVALUATION、WBS/acceptance/trace及受影响预算说明。若新oracle证明既定投影或旧身份假设错误，暂停对应实现并回DCP，不能修改旧期望或降门槛。

待用户确认：接受“v5库producer+无spawn有界reader、保留全部旧v4语义、另建独立producer oracle”的推荐细化，随后进入writing-plans和一次整体实施计划评审。本次确认不涵盖库测试执行、真实Native/新增helper、profile/数值/依赖、生产接入或云端操作。

保留风险：C1真实file-symlink EPERM开放；四个C2生命周期已用完；历史Native超时根因UNKNOWN；main CI39708335128取消结算不重查、不重跑；R4 mutable DB不触碰。Canonical IR独立、SQLite authoritative、LLM candidate-only、AUTO/MANUAL、ExecutionGraph → RuntimeFlow → BusinessFlow不变。

## Implementation-plan refinements submitted for review — 2026-10-24

The proposed concrete plan fixes18 independent Source families,private Rust/TS signatures,a28-file Node scope,12 selected Rust integration targets plus privatecollector lib tests and single-invocation oracle capture. These details are plan-review proposals,not executed or separately accepted values. No fixture was authored this turn.

Two structural details are explicit: a v5 dictionary that becomes UNKNOWN cannot publish tentative referenceedges;the known discarded reference remains an unsupported obligation rather than shrinking eligible to zero. Oldv4 behavior stays. Frozen expected raw templates preserve numberlexemes;only declaredroot/requestSHA/terminalSHA tokens are replaced independently,never actualoutput normalization.

Cargo may compile its automatic binary as a test build sideeffect,but no NativeCLI is run or qualified. The existing Sourceaccess junction test invokes cmd only to create an owned OS fixture;it is not an acquisitionhelper/C2 lifetime. Planned test approval includes this exact scope. Real child/accounting/profile/cloud authority remains absent.

## Local library implementation — 2026-10-24

Providersbuild0;500Node/105uniqueRust/18actual-librarycross-consumercases/architecture17;registry49-exact23/catalog0.80independentFixturefilesfrozenbeforeproductand319oldFixturepaths preserved. Package-private decodeCodeSyntaxLine issharedbyrequest/events;commonpayload andowner-mapguardsremainseparate to preserveoldv4errorprecedence;sharedRusttestsupportis test-only. No oldwire orpublicindex change. LinkOSbranches/C1andLNK1104unknownrootcause aredisclosed;noPhase1/actualNative/profile/Storequalification. See implementationreview/receipt forfullfailurehistory,lockhashcoveragegap andmethodrulings.
