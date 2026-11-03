## A-runtime 本地实施更新；protocol 最终门禁 OPEN — 2026-10-29

用户已明确批准 D1–D4/T1–T6 本会话顺序实施。Source受控核验、Stage累计账本、v5分发代码/原始流和私有进程屏障已实现；当前 **AR_LOCAL_IMPLEMENTED_PROTOCOL_GATE_OPEN**，不是全包验收通过。最新本地组件107 PASS/1 TODO、注册360/360、纯IPC176/176、Stage333/333、Rust指定库29/29、架构17项目、构建/类型/精确格式通过。文件symlink因EPERM为TODO/C1 OPEN。

Rust protocol内部测试最终复验在link.exe LNK1104失败，未执行；一次独立构建目录对照在依赖链接LNK1105/1224失败。准确根因UNKNOWN，不自动重试、不称已修复/flaky；旧T4的18项GREEN不冒称最终门禁。详见[作者实施评审](../reviews/2026-10-29-phase1-runtime-local-readiness-review.md)，准确证据根 `.superpowers/sdd/2026-10-29-phase1-runtime-local-readiness`。未新增独立评审。

实施细节以评审及实际源码为准：native-client私有aliases是default对象成员，避免既有export-star将named aliases公开；lifecycle类型模块内，public index/options保持。私有raw consumer可接既有caller limits；Source parsed副本解析前预付；Stage account拒绝ambient事务。这些是获准私有边界的缺陷修正，不增加公开契约或数值。实际protocol筛选为`protocol::`（包含新增mixed_v5_tests），旧计划`protocol::tests`仅能选旧模块；Source旧控制的准确命令见attempt3 receipt。

无真实Native、额外acquisition helper/collector/model、新目的schema/profile值/依赖、云端CI或Git写入。既有G13 Node模块隔离进程如实记录。全Source选择/Python扫描、实际归因/运行资源与H5仍OPEN，主任务4/21接受、17未关闭；空catalog继续拒绝。历史timeout UNKNOWN、C2spent/main取消未查/R4mutable限制不变。原前任10315摘要未覆盖Source，本包单独保留Source原字节并补入继任封存；不声称原摘要覆盖整仓。下方旧“未实施/REVIEW_PENDING”保留为历史，由本补记限定范围替代。

## A-runtime D1–D4 / T1–T6 已批准 — 2026-10-29

用户明确批准Source核验/Stage累计记账、v5分发及原始流、私有进程输入屏障及配套本地组件实施包，本会话顺序实施，不逐任务确认。状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION，尚无实现/新测试通过声明。无真实Native/额外Node helper/collector/model、profile/新目的schema/数值/依赖、云端CI/Git写入授权。全Source选择范围/Python扫描/实际归因与H5仍OPEN，主任务4/21接受、17未关闭。下方REVIEW_PENDING为保留历史；本补记只提升本次明确范围，不接受§8未知目的或完整运行资格。

# Phase1 A-runtime：Source、账本与 v5 进程边界附约

2026-10-29。状态：PROPOSED / CONSOLIDATED_REVIEW。用户已批准统一推进编排；本文新增的私有接口、账本续接和进程输入时序尚非已接受契约。设计、实施任务与审批范围在本包一次审查，不再拆方向和细化审批。

## 1. 目标与当前范围

交付可独立验证的 AR-LOCAL 准备能力：真实文件字节/祖先核验、与现有 Stage 账本续接、v5 实际 CLI 分发代码、保留原始流的私有传输和采集前输入屏障。此包允许实现和本地纯规则/隔离文件/SQLite/Rust库验证，**不执行 Native 可执行文件、Node helper、PowerShell collector 或测量**。

AR-LOCAL不是完整A-runtime/H5/P1-04/05退出。实际混合Source扫描/Python分类接入、受信实际采集工具、全流程资源资格及生产路由开放在后续运行包中完成；不能把本包当成已能正式索引Python。所需后续条件见§8，保留为明确缺口而非伪造实现。

保留Canonical IR、SQLite真相、LLM candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow。旧IPC1..4、R001..R011/W001..W003、owner-map/历史身份、Code/Syntax置信策略、旧Java/v3路径和所有原始Fixture不改；不增依赖、默认数值、Quality Gate或profile值。

## 2. 实码输入与方案选择

- MixedAnalysisStage已拥有capture、TEMP、owner、raw、freeze/lease与共享逻辑预算；MixedAnalysisStore锁内重查并保留COMMITTED/UNKNOWN及cleanupFailed真实身份。
- Source fingerprintFile已做句柄/命名对象/祖先前后检查，但不能按本次操作预算逐块取消或向Stage累积收费。
- consumeCodeSyntaxObservationStream只返回校验结果，Stage需要原始request/output字节；不能把结果重新JSON序列化当原始流。
- Rust code_syntax_producer已有serve_code_syntax_request(bytes, SyntaxWalkControl, output)，protocol.rs却只显式分发v4和旧v3/1/2。v5库完成不等于CLI可用。
- runProcess是实际spawn/pipe/取消/timeout/close所有者，无句柄采集准备屏障。C2只证明拥有Node helper的有限可行性，四次已花费。
- SyntaxObservationProfile明确仅覆盖观察边界，不覆盖前置Java完整图、SQLite retained/Stage/Store。空catalog继续拒绝，不能借旧条目。

推荐复用Stage账本及原runProcess，为新路径提供私有适配。替代方案“另造Stage/transport”重复恢复逻辑，不采用；“broker/addon/私有Node HANDLE”改变launch与依赖，不采用。全局Python分类或直接把v5加到公开DESCRIBE会影响旧调用者，本包不做。

## 3. 完整调用链与信任边界

未来受权的实际组合顺序：

1. Application完成INDEX/READ_SOURCE授权与有效配置；Runtime先检查准确目的/实现/环境资格，无资格不调用Source/prepare、不建Stage、不spawn。
2. 正常Source工作流产生并validated CAS写入目标Source。Python分类必须由后续混合Source入口提供，不由本包核验器猜测/修改。
3. Storage有界captureActivationContext读取SQLite目标Source/完整旧Code/history；Runtime从capture取全部targetInventory，不能从外部挑子集当完整清单。
4. 建MixedAnalysisStage并取得私有Source账本适配；Source核验完整目标文件、授权删除路径与根/祖先；此时只有Source观察，不是运行成功。
5. 必需Java组由真实v2完整Java观察产生PARSED_V2事实；先完整settle/await close，再由prepareOwner冻结真实Java/owner/stageDigest。旧v3full不得改成过滤清单。
6. owner绑定构造严格v5原请求；Node创建实际Native、登记所有退出/取消/timeout监听、启动唯一stdout/stderr消费者；采集准备完成且child未结束/未取消才发送stdin。
7. 原始输出与终端/exit均成功后，核对实际请求、Source、owner、范围、覆盖与完整来源，再acceptObservation→freeze。
8. 再核验全部目标/删除路径；SQLite无事务等待。之后无await/外部回调地调用Store.apply，锁内重查SQLite Source/Code/history/TEMP/lease并提交。
9. 关闭自己拥有资源；COMMIT后输出/关闭失败保留提交身份；无法证明提交状态用现有inspectMixedAnalysisOutcome在新连接恢复，不重复Apply。

本包实施§4–6的组件和其与现有Stage的局部验证，不提供以上全链的实际成功证据。流程图中的步骤1/2/5/6的真实运行、8的实际联动及H5仍由§8约束。

文件系统与SQLite不能组成原子快照。承诺是已声明核验点的完整哈希与身份匹配、锁内数据库CAS、明确basis及后续stale检测；不承诺文件永远不变。最终FS核验之后仍可能有外部修改，不能伪称强一致文件系统事务，也不回滚用户Source。

## 4. Source核验与共享账本

### 4.1 私有接口

新建 packages/source/src/mixed-source-verification.ts，不从source/index.ts导出：

```ts
interface MixedSourceAccount {
  checkpoint(): void;
  own(value: unknown): void;
  reserveBuffer(bytes: number): void;
  readBytes(bytes: number): void;
  visitItem(): void;
  invalidate(): void;
}
interface MixedSourceVerificationInput {
  rootPath: string;
  files: readonly SourceFile[];
  removedPaths: readonly RepositoryRelativePath[];
}
verifyMixedSourceFiles(
  input: MixedSourceVerificationInput,
  account: MixedSourceAccount,
): Promise<void>;
```

SourceFile/RepositoryRelativePath来自现有IR。account只有计费/检查方法，不含DB、owner、lease、permission或“approved”字段。调用者必须先授权；函数本身不授予Source完整性、数据库或运行权限。返回void，禁止产生可伪造的TRUSTED_SOURCE token。函数catch中先调用account.invalidate再抛出受控错误，因此文件/hash/祖先失败也会使实际Stage失效，不能只让计费错误触发失效。新增MixedSourceVerificationError仅在该私有模块定义，code为INVALID_SOURCE_INPUT、SOURCE_CHANGED；计费/取消/截止错误沿account原code传播，不扩展旧SourceScanError公开枚举。

输入须是本地普通data；拒绝Proxy/getter/unknown fields/重复path或ID、范围重叠和非法相对路径。逐字段限额检查先于复制/路径构造，完整元数据和实际拥有的表示按现有账本计费。files中全部成员均核验，含OTHER/零事实/Unicode；不按native语言过滤后冒称完整库存。函数只证明所给清单，库存完整性由SQLite capture/Runtime固定组合保证。

### 4.2 读取规则

复用fingerprintFile原安全检查，提取同文件私有核心，由原公开wrapper按原参数/行为调用；新增package-private受控入口用于本核验器，不扩大public index：

```ts
fingerprintFileControlled(
  absolutePath: string,
  path: RepositoryRelativePath,
  account: MixedSourceAccount,
): ReturnType<typeof fingerprintFile>;
```

- root必须绝对、实际目录且非重解析链接；相对path逐段验证根内范围。每次核验调用的读取前后固定根/祖先dev/ino身份，调用期间root替换拒绝。不同调用之间仅凭相同内容不能证明inode未变；本函数不承诺跨调用的文件系统快照。
- lstat与打开句柄stat一致；普通文件、非链接、非多硬链接（nlink非1拒绝）。读取前/每块/读取后检查取消/截止与预算。同一个拥有buffer顺序复用，大小沿用现有65536/8192常量及剩余额度，分配前reserveBuffer。
- 每块读取前用已知文件剩余size及原buffer界限预付readBytes；实际读少于预付不退款，文件大小/身份变化拒绝。禁止先超限read、之后才拒绝；EOF检查不无限读取增长文件。
- 内容sha256必须与SourceFile.contentFingerprint逐项相同；不重新解释已由Source流程产生的classification/languageHint，也不从.py后缀授予Python支持。
- 读取完成后重查命名对象/句柄/祖先，保留原fingerprintFile合法输出与错误。新路径链接策略更严格，旧API不静默加强或放宽。
- removedPaths是从历史到目标Source的逻辑移除，不等于物理文件删除：文件被ignore/排除后仍可存在。只验证其规范路径、去重和不与目标重叠，不读这些已移出授权范围的文件、不要求物理不存在、不删除文件。删除全集/策略变化由固定Runtime差分及Source重新扫描核验；本函数不能证明目录新增/选择策略变化未发生。后续全链必须包含选择范围的重新核验，不能只调用本函数就说Source全集仍新鲜。

### 4.3 Stage适配与失败

在mixed-analysis-stage.ts新增仅文件级私有导出：

```ts
borrowMixedSourceAccount(
  stage: MixedAnalysisStage,
  control: { signal: AbortSignal; deadlineEpochMs: number; maxInputBytes: number },
): MixedSourceAccount;
```

使用stage对应WeakMap中的**同一个**HistoryReadBudget，不接受caller usage/prior或新建空账。checkpoint检查Stage有效性、signal和绝对deadline；own/buffer/read/items分别调用既有own/pin/add(serializedBytes)/add(items)。额外FS读取累计上限为显式maxInputBytes（取既有EffectiveConfig的值），不新增默认；相同Stage的所有account跨多次核验累计，不按pass/借用清零。首次借用固定同一signal身份；再次借用仅允许同一signal，deadline与maxInputBytes只能取新旧较紧值，不能通过新account放宽或规避取消。readBytes同时收费FS输入计数和serializedBytes，二者任一不够均在读取前拒绝。预算不退款。

只允许PREPARING/OWNER_FROZEN/OBSERVED/FROZEN，禁止APPLYING/CONSUMED/INVALID/closed。适配内部MixedSourceAccountError携带CANCELLED/DEADLINE_EXCEEDED，不修改MixedAnalysisError原code集合；Stage生命周期/资源错误仍用原code。invalidate只撤销本Stage，不执行SQL或取得lease。任何核验或计费失败使该Stage永久失效；Runtime负责close。保留已花费前缀，即使没有得到lease。Store.acquire仍导入该Stage最新累计账本及cleanup预留，旧公开Stage接口/成功成本不变。新FS费用只出现在显式借用的新路径。

Source package不导入Storage；Storage不导入Source/Runtime类型（用本地结构型契约匹配）；本包不为尚未接入的Runtime新增Application公共exports；未来实际组合经Application转接Source能力，不加依赖边。新增错误在适配外层安全归类：SOURCE_CHANGED、STAGE_LIMIT_EXCEEDED，取消/截止在Runtime使用现有CANCELLED/DEADLINE_EXCEEDED语义，code-only消息，不暴露路径/载荷。

## 5. v5分发与原始传输

### 5.1 Rust

protocol.rs在旧分支前新增严格protocolVersion=5选择，复用serve_code_syntax_request。code_syntax_producer.rs提供serve_code_syntax_request_from_budget(bytes: &[u8], cancelled: &AtomicBool, output: &mut impl Write) -> io::Result<()>，经code_syntax.rs显式re-export供binary使用；有--parse-workers时如v4受控拒绝，不隐式并行。不修改旧解析器、枚举、预算、错误和DESCRIBE版本/成熟度。未知/畸形v5交给既有v5严格framing/失败；无法确定requestId时失败退出，不降级到旧ANALYZE。

新from_budget入口先用既有严格request validator校验，再从其预算构造SyntaxWalkControl；非法请求复用原REQUEST_FAILED生成路径，必要的私有错误writer提取保持原字节，不复制第二个协议解析器；复用v4同类checked duration/Instant overflow和maxSource/items/depth/output约束，不凭空设数值。先在protocol.rs内部Cursor/Vec单测观察分发失败，再修实现；该测试执行Rust测试程序，不启动Native CLI。编译产物生成不等于Native运行资格。

### 5.2 原始流接口

native-code-syntax-stream.ts复用一个消费核心，保留原公开函数精确返回值；新增文件级私有导出：

```ts
consumeCodeSyntaxObservationBytes(
  requestBytes: Uint8Array, stdout: Readable, signal: AbortSignal,
): Promise<{ observation: ValidatedCodeSyntaxObservation; outputBytes: Buffer }>;
```

outputBytes必须来自唯一stdout消费所拥有的原始有效范围，不能重新编码。预分配buffer/有效subarray/必要copy各自归属和保留成本显式计；不返回共享外部可变buffer。终端失败、partial适用性、尾部字节、checksum、abort按现有validator，partial不升级SUCCEEDED。

新建providers/src/native-code-syntax-client.ts私有default export：

```ts
observeOwnedCodeSyntax(
  requestBytes: Uint8Array,
  options: NativeClientOptions,
  lifecycle: OwnedNativeLifecycle | null,
): Promise<{ observation: ValidatedCodeSyntaxObservation;
             requestBytes: Buffer; outputBytes: Buffer; stderr: string }>;
```

严格快照请求原字节，构造校验options/有效deadline，复用native-client.ts::runProcess。为跨文件复用，在native-client.ts只增加文件级aliases：validateOwnedNativeOptions=validateOptions、ownedNativeTimeout=effectiveTimeout、runOwnedNativeProcess=runProcess（保留原实现签名，仅其私有request union加入CodeSyntaxRequest，并增加末尾lifecycle可选参数）。新client消费这三个aliases及固定原始流decoder，不复制进程owner，也不让native-client运行时反向import stream模块；CodeSyntaxRequest只用type import，避免模块初始化环。返回真实owned request/output，不把stderr当事实。这个低层接口不是Runtime准入，不从package index暴露；只能由固定Runtime组合或另行受权资格工具使用。

## 6. 进程输入屏障与采集准备

native-client.ts的runProcess增加**私有**lifecycle参数，所有旧调用省略时保持原路径。新增类型不进入NativeClientOptions、公用配置、IPC或public index：

```ts
interface OwnedNativeChild {
  pid: number; executablePath: string;
  spawnStartedEpochMs: number; spawnedEpochMs: number;
}
interface OwnedNativeClose { exitCode: number | null; signal: NodeJS.Signals | null }
interface OwnedNativeLifecycle {
  beforeInput(child: Readonly<OwnedNativeChild>, signal: AbortSignal): Promise<void>;
  afterClose(result: Readonly<OwnedNativeClose>): Promise<void>;
  dispose(): Promise<void>;
}
```

这里只给受信协调器同次child元数据，不暴露stdout/stdin，也不允许传任意PID扫描。先登记error/exit/close、取消、timeout与唯一消费者，再启动beforeInput；原timeout覆盖准备、写入和结算。准备reject/取消/child退出/截止后绝不write业务stdin。准备resolve只表示此受信适配已准备，不是通用授权token。

afterClose须在实际child close及管道消费者settle后调用；dispose在所有成功/失败路径恰一次。准备/回收Promise必须响应同一个abort；超时后owner仍kill/drain/await close，不能因为Promise.race返回就留下未完成callback。不能因close返回成功抹去较高优先级CANCELLED/TIMEOUT/协议失败。beforeInput/afterClose/dispose失败均不输出可用成功结果。

本包用进程double验证控制流，不创建OS child；它不证明Windows kill/句柄最终查询。后续资格工具才可复用已保存C2的QueryLimited/Synchronize、creation FILETIME/image/同次PID/nonce、退出后最终峰值/CloseHandle模式；不修改旧probe或复用slot。快速退出、身份不完整、采集器本身异常一律测量不可用，禁止重试或取早期snapshot顶替最终值。

推荐collector只作为离线资格工具，production不依赖PowerShell采集；仍由Node拥有Native启动与管道。工具须独立manifest/准确一次性生命周期清单和实际Native授权后才能运行。collector的OS与宿主开销、是否扰动HOST、所有同时存活进程及Source Git子进程必须列明；未证明完整归因前不生成全流程profile。

## 7. Fixture、错误恢复与追踪

新增一个本地准备Fixture p1-mixed-runtime-readiness-v1，沿用Manifest v1，category=runtime-graph、phase=1。expected由独立literal身份、原字节哈希、调用顺序与预算算式组成，不从新实现usage填golden。全部旧根冻结，不更新旧expected。

| 族 | 依据 | 必需输入/断言 | 本包证据级别 |
| --- | --- | --- | --- |
| AR-SOURCE | §4、Security | Java/Python/OTHER/Unicode、改字节、同内容替换、祖先交换、越根/重复、逻辑删除文件存在/不存在均合法、不读移除文件、hardlink/junction/symlink | 真实拥有临时文件；不能创建的OS分支明确OPEN |
| AR-ACCOUNT | §4.3、Stage附约 | 非零prior、重复核验累计、预付前拒绝、失败前缀、overflow、取消/截止、失效后的复用拒绝、Store导入相同累计和cleanup credit | 独立逻辑reference＋隔离SQLite；不是RSS |
| AR-DISPATCH | §5、NativeIPC | 合法v5、错误v5不降级、--parse-workers拒绝、旧v1..4字节/错误不变 | Cursor/Vec的Rust库/内部入口 |
| AR-RAW | §5.2 | 分块/一字节、原字节保留、late terminal/trailing、checksum、超限、外部buffer变异/abort | 内存流；不是child运行 |
| AR-PROCESS | §6 | 准备前零stdin、退出/取消/超时、准备拒绝、stderr/decoder失败、最终close及dispose顺序、禁止二消费者 | 固定进程double；不是OS测量 |
| AR-GATE | §3/8 | 空catalog在getter/Source/DB/stage/spawn之前拒绝，caller qualificationRef/APPROVED字符串不能开放 | 既有拒绝控制＋新增作用域对照 |

所有本地test若用unlink/rm清理，仅针对自己mkdtemp或固定拥有目录并验证根内，不清理证据或用户文件。Source guard不得直接SQL改Source；Stage/Store本地验证只用拥有临时DB，保留真实COMMITTED/UNKNOWN/cleanupFailed，不创建新恢复模式。已有19个Node崩溃点证据可按hash/范围复用；本包未改Store事务时不无故重跑整个崩溃批次。

## 8. 实际运行、资源与生产开放条件

AR-LOCAL之后一次提交实际运行包，必须有：真实Source分类/扫描入口及权限、完整Java与v5的准确可执行构建、全部Source/删除/保留与request/output/owner/history身份、独立完整oracle、进程/采集器生命周期和所有同时存活成本、计划的case/次数/命令/输出所有权、失败停止规则。缺任一项保持NOT_READY；本轮不填伪造hash或猜运行次数。

完整混合流程不能复用SYNTAX_OBSERVATION或旧Java四目的记录。缺少Source选择范围重扫、混合Python分类的独立入口及其前后CAS联动，故本包Source字节组件通过也不授予Source全集资格；这几项与实际采集归因必须在运行包前完成具体设计/验证。推荐另建准确边界的MIXED_ANALYSIS资格目的；但本包**不实现/接受其profile schema或数值**。须先冻结包括Source/Git/Java/v5/SQLite/关闭阶段的实际进程存活范围，决定完整component结构，再随实际运行包一次审查目的/collector/操作清单；不现在假定HOST+NATIVE两项足够。此项是明确治理依赖，不是被节约额度豁免。

校准和独立holdout沿已批准规则，具体值在实际证据后另审；未知值不能预批。真实run失败保留，不自动重试。Native/Python DESCRIBE成熟度、正式index路由和P1-04/05验收必须等完整资源/生命周期/实际Fixture与Evaluation齐全。CI再在准确集成候选申请，不重跑main39708335128。

## 9. 一次性审批范围、兼容与回退

本次集中请求批准§4 Source私有核验/Stage累计计费、§5 v5 CLI分发及原始传输、§6私有生命周期屏障，以及配套本地实施计划/Fixture/测试注册。允许的测试仅本包明确的内存流、固定process double、拥有文件/SQLite和指定Rust内部/库测试，不授权实际Native/额外helper/collector/model、profile/new purpose实现、新值/依赖、云端或Git写入。

受影响权威：ADR-020（兼容私有附约，不新增ADR编号）、DESIGN_AUTHORITY、WBS/acceptance/trace/status，NATIVE_IPC/PROVIDER_SPI/SECURITY/EVALUATION、MODULE_BOUNDARIES及Stage附约。存储物理布局无变化，SQL/manifest checksum不改；Source旧公开API与Native公开options/export保持。任何既有cost/字节/错误回归先判实现缺陷，不改旧golden。

回退为不接入新私有入口、保持空catalog和旧路径；已产生的证据/失败保留，不删库、不恢复R4、不回滚用户Source。新API不授Canonical发布或资源资格。若审批者要求整个H5一次IMPLEMENTATION-READY，本包仍不能签收：§8的真实测量归因设计必须先有证据；不得以一份长文档掩盖缺口。

## 10. 集中决策表

| 决策 | 推荐与影响 | 此次接受后的范围 |
| --- | --- | --- |
| D1 Source逐块核验与Stage续接 | 同Stage累计/失败失效；逻辑移除不误判物理删除；借用不得重置额度 | T1–3及对应Fixture/本地SQLite与文件测试，旧接口/SQL不变 |
| D2 v5 CLI与原始流 | 独立分发到既有v5库，返回owned原始字节，DESCRIBE仍旧 | T4及纯Rust/流验证，实际Native不运行 |
| D3 私有进程屏障 | 复用runProcess，准备失败/取消不写stdin，close后回收 | T5及固定进程double；不接受公开hook或复用C2 slot |
| D4 批次收尾 | 新Fixture/root和8个精确registry守卫，同步治理、作者自审 | T6，原范围修复/验证连续执行；独立评审未授权，不冒称已完成 |

D1–D4连同实施计划作为一次决定提交；不请求逐个任务再次确认。§8的完整资源目的/真实运行并未定案，保留后续准确操作包审批，不能现在按未知schema/值实施。