# Phase1 C3：真实捕获契约与后续 stage／采集边界 DCP

状态：**C3-A PLAN CONFIRMED，2026-10-23；LOCAL SCOPE VERIFIED**。用户“按照推荐继续下一步”接受推荐A契约并进入writing-plans。B/C仍仅为后续阻塞与方向，未获实施批准。用户随后“确认”已批准具体计划，按其范围实施；没有新增helper／Native／校准／profile数值／迁移／依赖或云端授权。

依据：[ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md)、[已接受混合兼容](2026-10-22-phase1-mixed-native-compatibility-proposal.md)、[共享契约详细设计](2026-10-22-phase1-contracts-and-runtime-design.md)、[既有 owner-binding](2026-10-22-phase1-syntax-owner-binding.md)、[下一设计简报](2026-10-23-phase1-trusted-capture-next-design-brief.md)。

## 1. 目的、当前事实与不包含项

目的：把来自真实 SQLite 的 Code/Source 观察，与调用方提供的 structural digest 区分；使同一 WORKTREE ID、Source fingerprint 下的支持变化也能被检测。复用现有连接、IR 验证、事务和有界读取模式。第一段不创建产品 Native 路径、不授予运行／发布资格。

前置基线：上一收据562项哈希全部匹配；C1 最终340 PASS/1显式TODO，真实文件 symlink 创建 EPERM 的门禁仍 OPEN；C2 已用尽4个 helper 生命周期，无重试，结果全部 measurementEligible=false。历史 Native 超时原因 UNKNOWN。Phase0.5 验收与遗留风险不重新打开；main取消请求最终结算不在本轮核验范围，不重跑。

本轮无代码、schema/SQL、Fixture、依赖、profile数值或现有运行器修改。没有 Source Python 激活、generic observer、broker/addon、私有 Node HANDLE、远端写入、云端 CI、DB/R4操作、新工作树/会话/agent。保留所有旧证据及失败。

## 2. 实码审计：不能省略的差距

| 实际路径                                                                                                                        | 已实现事实                                                                                      | 设计结论                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [native-full-bootstrap.ts](../../../packages/runtime/src/native-full-bootstrap.ts)::applyNativeFullBootstrap                    | v3比较完整Source数量/字段，captureNativeActivationToken，stage，normalize/merge/seal，最终Store | 不把Java投影作为v3完整仓库，也不把这条旧seal改名作混合凭证                                                |
| [native-analysis-state.ts](../../../packages/storage/src/analysis/native-analysis-state.ts)::captureNativeActivationToken/token | 绑定indexed指针、全repo已提交snapshot计数、Java派生summary身份；事务内读取                      | 保留原算法。另计算完整Code/active-support摘要；原token不足以证明R009候选或Canonical内容没变               |
| [source-state/repository.ts](../../../packages/storage/src/source-state/repository.ts)::replace/load                            | Source写入CAS后，同一WORKTREE行更新fingerprint、删除并重建source_files；load用all               | 当前Source不是历史已激活文件清单；新有界capture不直接调用无对应上限的load                                 |
| [canonical-fact-store.ts](../../../packages/storage/src/analysis/canonical-fact-store.ts)::applyFullBatch                       | 验证候选；BEGIN IMMEDIATE内重查旧Native token及revision；一次写Code/support/snapshot/指针       | 复用其单事务/last-good模式；仅新增锁外recheck不足以代替锁内CAS；不从公开布尔值认定自己在Store事务         |
| [temp-stage.ts](../../../packages/storage/src/analysis/temp-stage.ts)::RepositoryAnalysisStage                                  | 连接级固定TEMP表名，completed后不能accept，但normalize/merge可继续写，native sealed才全面拒写   | completed不是owner-stage冻结；不能并排创建同名第二stage；不能借旧Native seal冻结混合owner阶段             |
| [native-syntax-admission.ts](../../../packages/runtime/src/native-syntax-admission.ts)                                          | 空catalog在prepare/Source/二进制读取/spawn前拒绝                                                | 新capture不绕过此门禁、不接入生产prepare；纯Storage测试不代表产品准入                                     |
| [native-client.ts](../../../packages/providers/src/native-client.ts)::runProcess/observeNativeSyntax                            | Node直接spawn、唯一decoder/drain/kill/close；写入当前会立即启动；无采集barrier                  | 将来barrier必须在同一真实child上、首字节前建立，错误/取消监听须先安装；本段不加hook                       |
| [native-syntax-ipc.ts](../../../packages/providers/src/native-syntax-ipc.ts)::NativeSyntaxCoverageSchema                        | 按文件只有COMPLETE/PARTIAL/UNSUPPORTED及limitations，终端SUCCEEDED/PARTIAL                      | 不能从Syntax PARTIAL推导单独完整Code成功，更不能改标为旧applyFullAnalysis的SUCCEEDED                      |
| [python-normalizer.ts](../../../packages/providers/src/python-normalizer.ts)                                                    | 输入basis要求RepoBasis；实现用repo/revision构造标识，不读取codeActivationDigest                 | 生产流程存在“归一化前要求最终Code basis”的循环；C3-B应先提出明确Source-target输入修订，不能填假digest占位 |

上述差距是代码审计结论；未运行新实验来证明任何产品可行性。

## 3. 方案与选择

| 方案                                                                       | 得失                                                                             | 本次选择                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| 直接复用旧token、纯context或C1报告当授权                                   | 最少代码，但漏掉完整Code/support与生命周期，不能认证removed                      | 拒绝                                    |
| 一次实现capture、R011、混合stage、barrier、profile                         | 可覆盖最终路径，但Code完整性/Source历史/采集开销尚缺契约与独立预期，容易掩盖循环 | 本轮不实施，也不对未定接口作承诺        |
| C3-A先做真实只读capture/recheck；B解决完整候选/持久化；C解决真实进程与记账 | 先得到可独立验证的SQLite身份基础，保留所有后续门禁                               | 推荐；A书面契约已确认，具体实施计划待审 |

C3-A不伪装成完整capturedContext。B/C依赖A的证据，但都不能仅凭A成功获得运行／Apply资格。不是新Phase或新Phase1 Exit条件。

## 4. C3-A 模块与已接受接口契约（已按批准计划实施）

Storage负责读取真实数据库和捕获对象的连接身份；Application保留授权与发布策略；Runtime未来只组合Application端口；Providers仍负责严格wire/owner验证，不导入Storage。Storage依赖IR和Node标准库，不新增跨层依赖。

拟修改：新增 packages/storage/src/analysis/code-context-capture.ts、storage导出和必要测试注册；对应测试、独立Fixture与文档。不得顺便改旧Native token、Store事务、temp-stage、Source分类、Runtime prepare或Provider transport。实际文件/命令由书面设计接受后的writing-plans固定。A不新增公开Application端口或Runtime路由；接口先限于Storage与其验证测试，后续组合依然通过Application定义的域端口。

拟议Storage API：

```text
captureRepositoryCodeContext(database, repositoryId, limits)
  -> { handle, view }
recheckRepositoryCodeContext(database, handle, limits) -> void
releaseRepositoryCodeContext(database, handle) -> void
```

- database必须来自调用工作流已经授权的Repository session；本API不把任意CLI数据库路径变为授权，也不创建/升级数据库。
- handle为冻结的空对象，Storage模块私有WeakMap记录同一DatabaseSync对象、捕获摘要、存活状态；不提供从JSON、digest、路径、布尔值重建的构造器。结构相同的伪对象、另一连接、关闭/重开后对象均拒绝。摘要本身无授权能力。
- release对同一已释放handle幂等；未知或跨连接handle拒绝。recheck失败将handle永久失效；重试必须重新capture，不复活旧handle。连接关闭后的调用只返回安全错误。
- capture/recheck均为同步、无await的自有短只读事务；已有ambient transaction时拒绝，避免继承一个过期snapshot。内部BEGIN/COMMIT/ROLLBACK不写持久表；没有跨Native运行持有的读锁。
- view递归冻结，字段恰为schemaVersion=1、kind=REPOSITORY_CODE_CAPTURE、repositoryId、repositoryLocatorDigest、activeBasis、targetSource、sourceInventoryDigest、sourceFileCount、committedSnapshotCount、historicalSourceProof=UNAVAILABLE。activeBasis为既有RepoBasis或null；targetSource为repo/revision/contentFingerprint或null。没有WORKTREE时targetSource/sourceInventoryDigest为null且sourceFileCount为0。
- view不包含Source正文、root原文、owner载荷、可执行文件、profile或可发布token。未暴露的Source metadata按行哈希后释放，不留一份完整图/Source数组。
- historicalSourceProof在A中永远UNAVAILABLE。当前Source fingerprint即使碰巧等于indexed fingerprint，也不被视为历史清单认证。没有任何A返回值允许请求removed或执行Native。

limits恰为maxRows、maxSerializedBytes、memoryBudgetBytes三个正安全整数，无默认值。它们是调用方显式读取控制，不是Native profile；不能安装保留量。沿用现有SQL UTF-8字符串charge/NativeStateLimits模式，只证明其逻辑边界，不宣称V8 RSS、SQLite总内存或采集profile已合格。已有workspaceReservation不从调用者接受为认证参数。精确读取计划和已有accounting测试会在实施计划中列明，不能拿估计RSS当通过。

## 5. 读取范围、完整性与有界策略

Capture读取并验证：

1. 由正常migration-checked session提供当前已发布R010连接（user_version=10并核对必需schema）；不创建/升级。R009候选用于读集，R010的summary不参与新Code摘要。未知版本或缺失表返回UNAVAILABLE；未来R011适配单独同步。随后读取repository注册及root locator、repository_state indexed双字段。指针一空一非空为无效，不借最新revisions行替代旧indexed_content_fingerprint。
2. 当前WORKTREE revision与完整source_files，重名/重复ID、跨repo/revision、非法IR拒绝；按SourceFile IR验证后构造完整清单摘要；多个WORKTREE、所选目标域的SourceFile缺失其revision或字段自相矛盾均拒绝；其他合法历史revision域不冒充当前WORKTREE。Source图仍可与当前Code不同，诚实表达stale；不因此覆盖last-good。
3. 以indexed revision为Code域，读取完整Canonical NODE/EDGE及UNRESOLVED目标数据；包括完整name/range/confidence/target内容，不只FactKey。
4. 读取该repo的全部ACTIVE Evidence及其Binding、FactEvidence、R009 active_support_candidates，验证类型化键(type,id)、引用、candidate id/FactKey/context与support对应。活动支持跨indexed域或孤立引用拒绝；多个Provider同FactKey的每份候选都进入摘要，不只代表winner。历史SUPERSEDED/INVALIDATED不作为当前支持。
5. 必须包括coverage，遵守已有共享契约§2。snapshot集合S取该repo所有requested_revision_id等于indexed指针的已提交行，且包含全部活动支持引用的snapshot（活动支持引用跨该域则拒绝）。原因：R001..R010没有独立“最新空图snapshot”指针，不能用rowid/time猜一份最新coverage；同WORKTREE历史集合保守纳入并受限额控制，绝不漏掉无Code事实但有coverage的提交。读取S的snapshot元数据/capabilities和全部analysis_coverage。覆盖记录只作稳定身份，不据此推导Code完整或改标PARTIAL。committedSnapshotCount沿用旧token的SQL语义——该repo全部provider_snapshots计数，不根据rowid/时间猜最新；空Code或相同内容再次提交仍能改变身份。A不重选FactMerger，不把snapshot身份当完整Coverage验收。

无indexed指针时activeBasis=null；必须验证没有矛盾的ACTIVE支持。孤立、损坏或缺失R009候选为UNAVAILABLE/INVALID，不填空图或凭空补支持。历史候选不完整的旧库保留可读，但新捕获不能授予后续复用资格；不自动full解析或回填。

只允许当前支持的UTF-8 SQLite编码用于该新capture，以便复用既有SQL字节上界；其他编码返回UNAVAILABLE，旧功能不变。先数字count/length preflight，再逐行iterate/parse/hash；不调用all聚合TEXT、不聚合完整图JSON。不拉取一条超限TEXT后才检查大小。每类固定读取/重复读取均进入计划预算；安全加法防溢出，计数/字节超过即停止。对每行含IR对象键、scalar和序列化暂存按既有严格模式核算；未知/非法字段不绕过边界。缺失字段、join遗漏和被LEFT JOIN隐藏的孤立记录均须反向census检查。

测试上限由独立Fixture全部声明行/字节及固定读取清单推导，负例逐项减一；不新增产品数值或为通过增加余量。SQLite page cache/排序临时页及Node工作区不是字符串charge的证明，真实组合记账属于C3-C/profile门禁。

## 6. Code与Source身份算法

新增算法只用于本DCP的Code/support与Source捕获，不改变Canonical FactKey、旧Native token、owner-map编码或C1域。

- 所有IR对象先严格验证；对象key按UTF-8字节排序，数组保留既有顺序；JSON scalar用JSON.stringify，禁止非法Unicode/非有限数。空值用显式null，不删字段。不是通用RFC8785实现。
- 每条记录编码为UTF-8 canonical JSON，前缀ASCII十进制UTF-8字节数加冒号。域是UTF-8名称后跟NUL。每个分组先编码{tag,count}，随后逐条{key,value}，分组顺序固定；key是下表结构化数组，按各元素UTF-8字节逐项排序，短前缀在前。重复key拒绝。SQL可提供BINARY分组迭代，但不能用locale排序替代UTF-8预期；需要排序键时只在自有TEMP工作区保留有界UTF-8 key，不建持久索引。
- codeActivationDigest域codeatlas-code-activation-v1，依次分组：HEADER(key=[repositoryId]，单条repo/indexedRevision/indexedFingerprint/committedSnapshotCount)；NODE(key=[id])；EDGE([id]，包含完整resolved/unresolved target)；EVIDENCE([id])；BINDING([evidenceId,factType,canonicalFactId])；FACT_EVIDENCE([evidenceId,factType,canonicalFactId])；SUPPORT_CANDIDATE([evidenceId,factType,canonicalFactId]，完整IR候选)；SNAPSHOT([id]，集合S的稳定元数据与按capability name排序的capabilities)；COVERAGE([snapshotId,capabilityName,sourceTag,sourceIdOrEmpty,status]，下述多重集值)。行值只含对应既有IR/持久字段，不含Code摘要自身。NODE/EDGE即使ID相同也不碰撞。
- 各value精确形状：HEADER={repositoryId,indexedRevisionId,indexedContentFingerprint,committedSnapshotCount}；NODE/EDGE/EVIDENCE/BINDING/FACT_EVIDENCE为完整相应IR值；SUPPORT_CANDIDATE={evidenceId,factType,canonicalFactId,candidate}，candidate为完整Canonical NODE或EDGE IR；SNAPSHOT={snapshot,capabilities}，snapshot字段恰为id/repositoryId/providerId/providerVersion/runtimeVersion/requestedRevisionId/requestedRevisionFingerprint/outcome，startedAt/completedAt按既有IR验证有效但不进入语义摘要，capabilities是{name,support,coverage}数组，按name UTF-8排序。COVERAGE的value={providerSnapshotId,capabilityName,sourceFileId,status,multiplicity}；相同语义四元组聚合精确正整数multiplicity，NONE/SOURCE tag区分null与非null，原始重复行全部计入maxRows，不靠聚合绕过读取预算。不同status保留不同元组；不选winner、不删重复、不用物理analysis_coverage.id。覆盖参与摘要，诊断/运行时间不参与；这个身份不能代替coverage或完整性的验收。未声明的物理字段、SQL列顺序和JSON TEXT原排版不参与。
- sourceInventoryDigest域codeatlas-source-inventory-v1，先TARGET(key=[revision.id]，完整WorktreeRevision)，再SOURCE_FILE([id]，完整SourceFile)；完整清单含排除/非Source分类，不将Java/Python投影冒充全仓清单。
- repositoryLocatorDigest域codeatlas-repository-locator-v1，LOCATOR分组(count=1、key=[id])的value为经验证{id,rootPath}；只绑定数据库记录，不证明真实磁盘root、符号链接策略或授权访问。磁盘身份仍是Runtime/Source职责，C1真实file symlink门禁仍开放。
- 返回lowercase64 SHA256。activeBasis repositoryId/revisionId/contentFingerprint来自旧indexed双字段，codeActivationDigest来自上述完整Code/support读集；不是当前WORKTREE行或Java summary摘要。

无活动Code时不生成伪造Code digest；Source有无与Code有无独立。独立敏感性控制必须在两个自有数据库中用正常validated流程构造相同HEADER/snapshot数量与身份、不同合法confidence/support候选的场景，分别匹配手写完整摘要；不能只靠提交计数变化证明读到了候选。更改物理row顺序或JSON对象key顺序不应改摘要；更改同FactKey的实际内容、任一支持/候选/活动snapshot、coverage（含零事实场景）、提交计数会改摘要。

## 7. 复核、生命周期与安全错误

recheck重新在新短事务读取同一完整读集，比较locator、indexed/Code摘要、Source target/完整清单、提交计数；任何变化永久失效。相同WORKTREE/revision/fingerprint不足以跳过比较。反向census失败也拒绝，不能靠两次“同样损坏”认定稳定。

A仅有read-only recheck，**没有原子的Apply保证**。B必须在Store自己的BEGIN IMMEDIATE里重读全部相关basis/manifest并CAS后一次写Code+Syntax；不得先锁外成功、锁内只比Source fingerprint。读事务关闭后外部写入可能发生，A不把这个窗口藏成atomic。

错误code和message均为同一固定标识：非法参数/IR/孤立引用/伪或跨连接handle为INVALID_CODE_CAPTURE；不支持schema/编码/缺失必需历史候选为CODE_CAPTURE_UNAVAILABLE；合法handle的完整读集变化为CODE_CAPTURE_CHANGED；读取控制越界为CODE_CAPTURE_LIMIT_EXCEEDED；本连接已释放或永久失效handle为CODE_CAPTURE_RELEASED。首次recheck失败保留当次具体安全类别，之后都为RELEASED；已关闭连接上的有效handle也失效为RELEASED。不回显SQL、db/root路径、Source、owner、环境或底层异常。取消/deadline在未来Runtime组合中贯穿；A没有新的超时数字或后台重试。

## 8. C3-B：必须另外定案的完整stage／Store设计

这部分是发现与约束清单，**不是批准即可实施的接口包**：

- 未来混合入口必须在Source协调、capture/stage准备、二进制读取或spawn前通过准确组合profile准入；不从A的Storage API增加任何CLI／Runtime绕过参数。
- historicalSourceProof需要在成功激活时保留完整已激活Source manifest及policy/Source身份，并与实际Code/support basis原子绑定。拟在尚未发布R011的Syntax/support设计中一并审阅，而非改R010；物理DDL、唯一键/外键、旧库迁移/缺失状态、所有legacy Code写入后的失效规则、last-good读取均须独立Fixture与SQL计划。绝不从当前可变Source或Java-only summaries回填未知Python历史。
- A捕获只能检测当前表，不持久保存历史。若没有可信历史manifest，非空removed/跨重启增量认证必须拒绝；显式重新建基线是另一个经过正常Application审批的工作流，不自动full重跑。A不能关闭changed-only/restart验收。
- owner stage只表示**已验证Java投影的provisional owner basis**，不是最终完整混合图。stageDigest绑定完整捕获Source身份、旧Code basis、Java投影/归一化/支持、工具身份及拟提供owner集合；排除自身stageDigest和ownerMapDigest，随后才算既有ownerMapDigest，避免循环。
- TEMP生命周期须有真实只读冻结状态；close/rollback/rebuild/重新归一化/任何受支持修改使旧绑定失效。同名固定TEMP表不并排实例化：推荐同一连接单一新混合stage内按阶段分区，但具体结构/port/编码须B评审；不得把旧completed标志或Java Native seal当替代。
- Python normalizer先把其未使用的Code digest输入需求改为明确Source-target上下文（独立DCP契约与Fixture），归一化/FactMerger后才算finalCandidateCodeBasis。禁止填全零、旧basis或caller标量充当未来最终basis。
- v4当前PARTIAL没有独立的Code完整性证明；需要明确declared Code capabilities、逐语言成功条件及其独立预期。不能把Syntax PARTIAL包装成ProviderSnapshot SUCCEEDED、删掉applyFullAnalysis检查或直接调Store绕过Application。完整Java图/混合候选、Syntax/support/原子Apply Fixture是阻塞项，不是C1原始参考的自动升级。
- removed的id/path/previous fingerprint与授权变更/历史manifest绑定到**整个请求/执行身份**，不改已接受owner-map编码。最终Apply再次验证旧manifest、Code/support、当前Source、观察的stage和最终候选。

## 9. C3-C：实际child与采集开销的后续DCP

沿用Node作为唯一实际Native启动/管道/kill/close owner；优先外部受控collector单次attach，不引入broker。产品控制的具体API另行提交，禁止将callback放入通用NativeClientOptions供任意调用者旁路。

顺序约束：准入与所有配置校验 → collector自身已就绪 → Node spawn真实Native → 先安装error/close/abort/deadline与唯一stdout decoder、stderr drain → 对同一个live child单次获取并绑定image/creation/持有句柄 → readiness确认 → 发送唯一request首字节 → 完整终端/失败/取消 → Node await close/drain → 同句柄退出后最终查询 → 释放并确认collector退出。不得因握手等待停掉abort/timeout，也不得出现第二个stdout消费者。提前退出/身份疑点/缺失最终峰值始终不可用，不用旧PID重新获取、不借helper峰值、不重试到绿。取消优先级和原错误序保持，无论有无peak都不能成功。

C2只能支持“受控helper可行”，没有证明真实Native身份或启动前静默性。真实Native与工具build绑定、可执行文件读取到spawn之间的替换、非常快的加载失败、EOF/EPIPE/watchdog等均待独立设计/实验授权；不承诺消除无法证明的竞态。

HOST仍是实际Node maxRSS；NATIVE仍是真实child终生PeakWorkingSetSize。collector若与它们同时存活必须显式归属并证明开销/隔离；目前两份reservation相加不能自动覆盖第三进程。C阶段要选择严格隔离的资格仪器或受治理的新accounting契约，不能悄悄把collector塞进NATIVE、忽略开销、套旧purpose、增加未批准margin。没有本DCP的profile形状/数值修改。实际run、校准、数值安装、CI均另行确认。

## 10. 任务、Fixture与门禁映射

下表是设计任务依赖，不是writing-plans实施计划。所有Fixture ID/路径标为拟新增，尚未建立或执行。

| 任务                        | 依赖                           | 拟议证明与可验证完成条件                                                                                                                                                                            | 设计/门禁                                      |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A1 独立身份/状态预期        | 本书面A契约批准、再审具体计划  | 拟p1-code-context-capture-v1：手写code/support/Source及expected hashes；literal顺序/长度 framing，typed keys、空Code但有coverage、同HEADER/计数的不同支持/coverage、UTF-8边界；不由实现生成expected | ADR-020；C1身份不授权原则；Manifest/Evaluation |
| A2 有界真实SQLite capture   | A1 RED                         | 自有临时DB经现有Source/Application/Store validated流程建立数据；正例匹配独立预期；code同FactKey变更、support候选、另一Provider同FactKey、snapshotcount变化可检测；无Native                          | 既有Canonical IR/R009；bound read/unit/Fixture |
| A3 私有连接身份与recheck    | A2                             | 同WORKTREE/fingerprint支持变化、Source分类/locator变化、伪对象、跨连接、关闭重开、release、ambient/stale事务全部拒绝；失败后不能复活；读取无持久更改                                                | Application/Storage边界；失败恢复/last-good    |
| A4 注册与收尾               | A1..3                          | 范围匹配build/types/tests、Fixture registry、架构17、格式、完整读取控制与文档追踪；根级/后续联合门禁不豁免；C1 symlink仍单列                                                                        | Implementation Protocol；P1-04/05保持OPEN      |
| B0 输入/完整性契约          | A证据；另审B设计               | Python normalization无final-basis循环；明确Code与Syntax outcome规则；独立全Java/混合Code/Syntax/support预期                                                                                         | 原SUCCEEDED发布门禁不降级                      |
| B1 stage/历史manifest/Apply | B0；R011 DDL和实施计划分别评审 | 历史Source绑定、removed认证、TEMP失效与Store锁内CAS、故障回滚、实际重启/旧写入失效；所有指针一次提交                                                                                                | ADR-020/混合兼容；R001..010不改；不提前迁移    |
| C1 实际barrier/记账设计     | C2既有记录；另审C设计          | 真实child请求前身份/最终同句柄、唯一消费者、取消/清理、collector归属；先fake/control契约，再独立申请实际运行                                                                                        | 安全/IPC；既有timeout UNKNOWN                  |
| 联合资格与CI申请            | B/C实现和全部相应本地门禁      | 6份实际context重绑、16份场景真正适用、完整candidate/Store/资源/故障证据、准确工具与提交/命令/次数                                                                                                   | actual Native、校准、数值、云端CI分别批准      |

A1..4顺序；B0和C的设计问题逻辑上可独立，本会话仍顺序、不新建agent或会话。未批准产品数值、依赖、迁移或新OS实验。任何未来根级运行器中包含真实Native/helper的命令也须先拆清授权范围。

## 11. 相容性、治理和审批范围

保持Canonical IR provider-independent、SQLite authoritative、LLM candidate-only、AUTO事实/MANUAL语义发布、ExecutionGraph -> RuntimeFlow -> BusinessFlow。不改变已接受IPC1..3/未发布v4字段、owner-map、profile purpose/数字、R001..R010、Phase1目标与Deferred表。不新增Phase4或R012/R013依赖。

新增codeActivationDigest定义与opaque capture边界（含同WORKTREE历史coverage保守集合的兼容/限额取舍）已由用户本次书面确认；当前同步ADR-020说明、Canonical IR的RepoBasis语义、Runtime/Security、SQLite/Evaluation、WBS/acceptance/trace。A是已接受书面契约，具体实施计划待审；B/C仅PROPOSED，不能作为实施权威。A无迁移。B的R011范围/物理SQL、normalizer输入和Code completeness须各自写明兼容影响并评审；C的hook/accounting同样不能从A批准推导。

回退A：停用新增capture调用，释放自有handle，保留原Code/Source和证据，不写DB、不修改旧token/协议、不删除旧Fixture。没有从prepared handle到Apply的生产入口，因而A不改变用户发布行为。B/C回退另随其具体设计审查。

**原审批问题（用户已接受推荐A）：是否接受C3-A所述只读capture／Code-support身份／私有连接handle／recheck契约，允许下一步写具体实施计划？** 推荐接受A；B/C仅记录阻塞和设计方向，未获实施批准。A之后仍需计划审阅，实际Native、helper追加次数、校准/profile、依赖/迁移、云端操作均不在此确认中。

## 书面接受与实施计划 — 2026-10-23

用户已接受推荐C3-A书面契约，沿用原工作树、inline顺序。旧PROPOSED快照及作者审查保留为历史，不再视为A尚待方向批准。[具体实施计划](../plans/2026-10-23-phase1-code-context-capture.md)及[计划作者审查](../reviews/2026-10-23-phase1-code-context-capture-plan-review.md)已形成，待整体审阅。计划固定读取/编码控制记账、独立Fixture、错误状态和32文件范围验证；A1..A4尚未开始。不新增数字默认/门禁、依赖/迁移或B/C接口；不授权产品代码、DB、helper/Native/CI运行。

## C3-A 实施收尾 — 2026-10-23

用户确认具体计划后已顺序实现A的Storage模块、三个函数与只读类型、独立Fixture和测试注册。前文“拟议／尚不存在／具体计划待审／本轮无代码”保留其设计审查时点含义，由本节和CURRENT_STATUS的新检查点替代；B/C仍未批准实施。

[实施作者审查](../reviews/2026-10-23-phase1-code-context-capture-implementation-review.md)记录独立预冻结、真实SQL交付、RED/GREEN、资源与生命周期、32文件范围和未执行门禁；最终收据为.superpowers/sdd/2026-10-23-phase1-code-context-capture/implementation-verification.json。原R010、完整v3清单/token、Source策略、Runtime/profile与全部Phase门禁不变。history/removal、stage/atomicApply、实际child/collector归属及计量仍不由A证明。

Final local32-file regression:422PASS/0FAIL/1explicitTODO (423 total;new capture suite100PASS);Storage TypeScript build and architecture17 pass;Fixture registry46/exact20Phase1,Syntax catalog0. The TODO is the existing C1 real-file-symlink EPERM gate,not an A failure or a waived Phase gate. 本地A完成不等于独立review、完整root／联合门禁或Phase1完成。
