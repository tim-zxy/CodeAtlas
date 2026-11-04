## A4 有界SourceState本地交付完成 — 2026-10-29

B1–B3获批范围已完成，A4_BOUNDED_SOURCE_LOCAL_EXIT：[实现/作者审查与证据](../plans/2026-10-29-phase1-bounded-source-state.md#实施结果与作者审查2026-10-29)。有界UTF-8 SQL前付、同账本/全局cap、CAS前根绑定与既有固定链组合已验；195 PASS/1原C1 TODO、注册35/35、架构17与三包构建/范围格式通过。无公开route/配置新键/迁移/profile；生产路由/配置来源/全链资源资格和父任务仍OPEN。下方批准前/实施中快照仅为历史。

## A4 有界SourceState整包已批准 — 2026-10-29

用户明确批准[A4详细设计](2026-10-29-phase1-bounded-source-state-design.md)与B1–B3本地顺序实施。新增仅限实例绑定/前付SQL、同账本与预算cap、CAS前根核对及既有组件组合；原公开Store/CAS、IR/SQL schema、资格catalog和Mandatory Gates保持。状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION，实施/验证尚未完成；无真实Git/Native/helper/collector、生产新配置/数值/依赖、CI或Git写入授权。父任务与原风险不变。

## 用户已批准整包实施 — 2026-10-29

本次明确批准A2及S1–S4顺序实施与原范围统一修复；状态ACCEPTED_FOR_LOCAL_IMPLEMENTATION。下方REVIEW_READY/NOT_STARTED保留为批准前快照，不代表实现或测试已完成。

# Phase1 A2：混合 Source 接入与前置费用续接

2026-10-29。**REVIEW_READY，尚未批准实施**。本文件与同名实施计划一次审查，不再拆方向/细化审批。A-runtime 仍属于 P1-04/05，不新增主任务。

## 当前证据与本包边界

T1–T6 的 Source 字节核验、Stage/Store、v5 分发及私有进程屏障已有本地证据。协议最终复验本次18/18通过，36个非目标测试未运行；原LNK1104/1105根因仍UNKNOWN，C1文件symlink仍TODO。没有真实Native/资源资格。

实码缺口：classifySample只识别Java；observeGitWorktree在Source CAS和Stage创建前运行；Stage构造目前新建HistoryReadBudget，仅续接capture费用。直接把.py全局识别为Python会改变旧Java/v3路径；先扫描再创建空账本会漏掉前置费用。因此本包补一个明确的私有混合Source路径和同预算对象续接，不另造通用扫描器、插件或资格令牌。

设计依据：ADR-020、PROVIDER_SPI、SECURITY、MODULE_BOUNDARIES、RUNTIME_CONFIGURATION、现行R011/Stage附约以及[A-runtime附约](2026-10-29-phase1-runtime-boundaries-design.md)§3/4/8。此前附约明确未授权初始Python扫描和选择范围重查；以下新增边界须本次接受。Canonical IR/SQL/wire/旧公开API/数值/生产catalog不变。

## 方案与取舍

推荐：共享现有路径策略、Git命令、walk、指纹核心和Application reconcile；增加固定混合模式的私有入口，沿用HistoryReadBudget和当前控制。保留原Java-only入口。

不采用全局扩充classifySample默认行为（污染旧调用者）或复制完整扫描器/新预算框架（重复安全与恢复逻辑）。不为未来语言/collector增加配置或泛化插件点。

## 1. Source职责与接口

新增source/src/mixed-source-workflow.ts，内部default对象含：

- observeMixedGitWorktree(request: SourceScanRequest, account: MixedSourceAccount, control: { signal: AbortSignal; deadlineEpochMs: number }): Promise<ObservedWorktree>
- verifyMixedSourceSelection(request: SourceScanRequest, expected: ObservedWorktree, account: MixedSourceAccount, control: { signal: AbortSignal; deadlineEpochMs: number }): Promise<void>

不从source/index.ts导出。request沿用已校验的repositoryId、root/workspace与include/exclude；不存在新的“approved/qualificationRef”字段。account沿用T1–T6的checkpoint/own/reserveBuffer/readBytes/visitItem/invalidate；control由固定Runtime传同次signal/绝对deadline，供等待中的Git异步I/O立即取消，不用轮询checkpoint代替取消监听。

classify.ts抽取共享纯分类核心，提供文件级混合分类适配。仅新模式在原规则基础上识别.py；测试目录、provenance、UTF-8/二进制判断遵循同一原规则，.pyi等不扩展。旧classifySample/fingerprintFile/observeGitWorktree的签名、默认行为及原Fixture结果保持。新指纹入口从同次安全读取的sample得到混合分类，禁止为了分类再读一遍文件。

复用compilePathPolicy/selectPath，hard deny仍优先，include覆盖默认排除/Git ignore的原规则不变。完整库存含OTHER、非Native语言及零事实文件，不把投影语言列表当Source全集。二进制或当前Native不支持的投影输入仍按既有准入规则受控拒绝，不能偷偷改成成功或假造覆盖。

scan/walk/git/fingerprint只增加新路径需要的内部可选控制或提取共享核心；旧入口不启用新收费/链接策略。新遍历用Node opendir逐项枚举，避免readdir先分配整个目录列表；结果沿原UTF-16排序后生成inventory指纹。目录打开/遍历前后重查根/祖先身份，迭代器在失败/取消后关闭；不新增目录规模默认值。保留旧路径跳过链接语义，新混合路径在需进入的链接/硬链接上fail closed；被硬排除子树不读取。

Git仍固定参数、shell:false/windowsHide与原环境规则，不加依赖/helper。新受控路径在写stdin前预付、接收前预留有界应用buffer，沿现有Git批次/硬上限取更紧剩余量；chunk到达后先检查容量再复制，累计stdin/stdout/stderr有效字节及保留buffer，失败kill/drain/await close。新混合路径maxInputBytes同时累计文件和Git有效I/O，不在批次/重查/Stage移交时重置；旧FS核验语义不变。Node内部pipe分配不能伪称应用已精确预付，其实际开销留给全流程RSS资格。不能先收集无界输出再拒绝。错误不回显原路径/输出；既有SourceScanError保持，account的取消/截止/预算错误沿原code传播。

## 2. 全集重查与Source CAS

Application新增私有mixed-source-workflow.ts，经现有authorizeOperation验证INDEX/READ_SOURCE及路径，再调用Source；Runtime不新增直达Source依赖。使用reconcileObservedGitWorktree和既有SourceStatePort.replace(expected,next) CAS，不手改SQL、不提交Canonical分析。

初始流程：读取旧Source基线→混合观察→确认root/branch/HEAD→以原expected CAS发布目标Source。返回实际StoredWorktreeState及本次观察，不返回可信库存/运行资格token。Source已经提交但后续分析失败时，保留Source和last-good分析，准确报告stale；不声称全流程已回滚。

分析前与Store.apply前各重查选择范围：按相同root/config重新枚举与Git ignore决策，比较规范排序路径集、全部分类、languageHint和内容指纹；配置、根定位、branch/HEAD不同即拒绝，不把变化自动吸收为新的分析输入。新增、删除、ignore或排除变化导致全集不同必须拒绝。逻辑removedPaths不要求物理不存在，不重新读取被排除内容。只有无语义影响的ignore文本变化可因相同实际选择结果而通过。

无法提供跨FS/SQLite原子快照：保证声明核验点及Store锁内CAS；最终文件核验完成后仍可能有外部修改，保留既有后续stale检测。Store.apply前不持SQL事务跨await；apply内部同步完成，沿原COMMITTED/UNKNOWN恢复，不重试写入。

## 3. 前置费用进入同一Stage账本

Storage新增内部mixed-source-account.ts，提取现有Source account的公共实现，提供：

beginMixedSourceAccount(limits: HistoryReadLimits, control: { signal: AbortSignal; deadlineEpochMs: number; maxInputBytes: number }): { budget: HistoryReadBudget; account: MixedSourceAccount }

这是固定Runtime内部持有的真实预算对象，不接受外部usage/prior，不可序列化为资格证明。Source只收到account，不能修改budget计数。所有值来自现有有效配置，不引入默认、profile值或新Quality Gate。校验输入边界一次，内部已验证数据按类型复用。

MixedAnalysisStage兼容增加末尾内部可选参数budget?: HistoryReadBudget。省略时走原构造/成本；新路径必须传begin产生的同次对象，先按剩余量为capture、构造与原cleanup预留准入，再在同一对象累计原capture/Stage费用，禁止新建空账本或回填caller统计。Source文件字节与元数据前缀、重复重查、失败费用和maxInputBytes计数不在移交时清零。限额只能相同或更紧；更紧时先核对已花费再继续。

account生命周期在Stage接管后绑定原Stage有效状态；最初借出的account也不能绕过APPLYING/CONSUMED/INVALID/closed。失败使同次操作失效，不因尚无Stage而允许复用。复用已有私有状态与预算内核，不另建预算schema、公开receipt或授权token。

范围说明：本包把文件/元数据观察费用续接到现有analysis账本；SourceState数据库读取/CAS仍遵循既有INDEX读控制，不把这项组件工作冒称“整个进程RSS或所有SQL开销已统一测量”。完整Source/Git/Java/v5/SQLite/collector归因仍由实际运行包明确。

## 4. Runtime准备与生产边界

Runtime新增私有mixed-source-preparation.ts：校验已有有效配置与授权→创建上述account→经Application观察/CAS→交给既有capture/Stage构造。保留target来源与原expected，不能让caller自填库存/费用/资格。

本包只接通本地准备组件；不修改runIndexCommand旧Java/v3分发，不开放DESCRIBE或catalog，不新增真实mixed-run成功路径。未来实际入口须先验证完整混合流程资格，再调用prepare，缺资格不得读取Source/DB或spawn。现有SYNTAX_OBSERVATION仅观察边界，不能借用其记录为整个混合流程准入。

真实Java完整组→v5→Stage→Store、准确MIXED_ANALYSIS目的/component schema、collector代码与生命周期清单、实际oracle/holdout/运行次数/命令和最终profile数值，将在本包实现身份稳定后形成一个真实运行审查包；本包不提前假定HOST+NATIVE足够，也不预批未知数值。

## 5. Fixture与最小验证

复用p1-mixed-runtime-readiness-v1，新增source-integration子目录及独立literal期望，在产品前冻结新增文件；原11个literal/README文件及old expected不动，旧Manifest单独保存。现有fixture.json仅追加inputs.sourceIntegration和expected.sourceIntegration路径引用，保留原键与值；本包记录新Manifest摘要，不把旧冻结摘要改成新内容。不新增Manifest/Fixture ID，不改变registry62/Phase1 36或八个历史计数脚本。原注册入口只追加新测试文件一次。

必需行为：Java旧路径与混合.py分类差异；include/exclude/ignore/hard deny；OTHER/Unicode/空库存；新增/删除/ignore选择变化；替换/链接；跨读取取消与截止；Git失败/超限/close；授权前零文件/DB/进程访问；Source CAS冲突；Source已提交后分析失败准确stale；前置非零账本→capture→Stage→Store连续收费、失败失效及旧account移交后生命周期。

使用拥有临时文件/SQLite和固定Git进程替身；不init/commit临时Git仓库、不运行实际Git或Native/helper/collector。成功纯组件不代替真实Git/Native资格。C1无法创建真实文件链接继续TODO，不改系统权限。

## 6. 作者设计审查与一次性决定

已核对scan→fingerprint→Application reconcile→capture→Stage→Store实际接口；Source只有IR依赖，跨层保持Application转接。重点风险是前缀丢失、Source选择变化被当成物理删除、旧模式被全局污染、移交前account绕过Stage失效、组件成功被误作生产准入；上节逐项测试对应这些风险。

请求一次接受本文件与[实施任务包](../plans/2026-10-29-phase1-mixed-source-runtime-integration.md)，随后S1–S4顺序实施和原范围修复，不再逐任务确认。新增的混合Source模式/全集重查及Stage前置账本接管是本次需批准的契约。无新依赖/IR/SQL/数值、实际Git/Native/collector、云端/Git写入或代理授权。若发现旧FROZEN冲突，只暂停相关链并集中治理，不新增假设绕过。

实施澄清：原OperationPolicy对RAW强制具体path，不能用null或占位文件授权整仓。私有Application输入使用INDEX/LOCAL、DERIVED/path=null做仓库权限预检，再通过Source控制中的固定authorizePath回调对每个实际文件以RAW/path授权；回调在指纹读取前执行，重查时同样执行。此为已批准路径授权义务的实现，不放宽原安全契约。

实施状态：A2_LOCAL_SOURCE_PRELUDE_COMPONENT_EXIT，具体行为、作者发现、证据与限制集中见同名实施计划“实施结果与作者审查”。本包Runtime私有准备只消费内部已解析limits/control，实际EffectiveConfig唯一派生、注册根核对与完整资格准入属于未开放的后继生产路由，不据组件测试声称已实现全流程准入。
