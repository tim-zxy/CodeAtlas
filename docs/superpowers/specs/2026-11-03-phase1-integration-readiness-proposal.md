# Phase1 集成就绪准备与冻结Fixture格式治理

日期：2026-11-03。状态：LOCAL_VERIFIED_REVIEW_CANDIDATE / CLOUD_HOLD。用户已要求按“改动整理→基线核对→固定提交→确认准确CI→检查及评审→合入”推进；本文只集中解决实际发现的CI前置冲突，不授权立即push、CI或merge。

## 已完成的核验

- 远端main仍是433015700c7c701a6493f7f8fa5eace00e773913；PR21确认merged，head为cc5a8cb571986c5e56ed04053b2c96ef500fcacb。远端main的tree与当前本地head的tree同为4b35ef9eddc49edfc410b0c6deb49eaea932915c，源树一致，不需要改变源码来对齐。
- 本地物理main停在PR19的8093b2b，当前工作树仍在PR21分支；本地缺4330157对象。后续仅需取得已核实的基线对象，在现有工作树使用新的codex/phase1集成分支，不清理宿主管理工作树、不reset/stash、不改物理main。
- 初次只读清单：66个tracked内容改动、2726个未跟踪候选文件，另103项Git状态有变化但实际字节与HEAD相同。候选规模覆盖此前积累的Phase1本地实现，不能只提交最后T1–T4。103项状态噪声排除，文件留在原位。
- 原暂存区为空。已补.gitignore排除.superpowers/.pnpm-store，formatter只补.pnpm-store依赖目录排除；一份普通扩展文档格式已修复。没有修改54份冻结JSON，没有Git对象/索引/引用写入，没有云端CI。
- CI仍按现有push和pull_request触发，三个job为TypeScript/Ubuntu、Rust/Windows、Native Java集成/Windows；最后一个还执行真实Native/内存准入/固定包下载。保留配置与所有门禁，不自动删job或触发器。

## 两类可复现阻塞

### 1. 干净checkout缺少普通根测试输入

以下普通root可达入口读取忽略目录的历史数据，clean CI没有这些文件：

|入口|依赖/处理|
|---|---|
|packages/providers/test/native-code-syntax-stream.test.mjs|历史public index源快照；迁移为独立可携带baseline，原不扩公开API断言保持|
|scripts/test-declared-observation-scope.mjs|old-behavior数据；原46/35行为/错误/预算比较保持|
|scripts/test-declared-delta-raw-admission.mjs|old-behavior、semantic freezes、原始输入与consumer快照；保留原字节证据及行为控制|
|scripts/test-declared-raw-history-candidate.mjs|历史freeze、consumer快照/批准successor、命令清单；保留原行为/预算与批准变更核对|
|scripts/test-syntax-evidence-reuse.mjs|原18组历史request/events/expected/manifest、源注释/评审pin；只搬运精确原字节，保持不能授当前性/测量资格的反例|
|packages/storage/test/mixed-analysis-cleanup-accounting.test.mjs|输出报告到不存在的私有父目录；改为现有test-owned目录/diagnostic，原独立SQL行审计/预付断言保持|

还存在历史62/36 Fixture总数断言，而当前全局注册基线已是70/44。按已对齐的收敛策略，全局发现/唯一性/总数归现有fixture-registry测试；功能测试继续验证自己的Fixture/能力，不逐文件再维护旧总数。历史62/36的收据原样保存，不能伪装成当前盘点。

含硬编码路径的手动Rust/collector脚本与普通CI入口区分：带ignore/显式approval的历史重采入口不自动启动，不把手动取证资产复制成生产资格；失败诊断输出路径不算必须输入。只改实际普通CI所需路径/等价验证，不顺带整理所有脚本。

### 2. 格式门禁与冻结原字节冲突

只读格式审计：1878个候选可识别文件中55项需要格式化；其中1份普通文档已修复，余下54项均为已存在Phase1 JSON，原始字节不符合formatter排版。对全部54份在内存中格式化并解析比较，JSON语义均相同；文件均为LF，没有任何原文件被改写。

准确路径/原SHA/大小见[54项清单](2026-11-03-phase1-ci-frozen-fixtures.json)。它们分布于12个既有Fixture目录，不能为了format通过静默改写已经冻结的字节、更新旧hash或删行为测试。

## 推荐的一次集中处理

**保留原字节，为这54个精确路径用字节完整性门禁替代风格排版检查。** .prettierignore只添加清单中的精确文件，不使用fixtures/**等宽泛豁免；在现有evaluation Fixture门禁中校验清单SHA并核对ignore与清单一一对应。产品/其他文件的格式门禁保持，全部原Fixture语义/错误/预算/支持及Quality Gate继续执行。清单内都是LF，沿已有*.json text eol=lf，不新增换行转换规则。

另一条可行路线是正式建立54份JSON的新格式化基线并同步所有原hash引用；它会改变已冻结文件及历史证据适用性，当前不推荐。不得自行“格式化后更新expected”来掩盖此治理选择。

用户已明确批准推荐准备整包及本地固定提交。54项精确ignore与原SHA门禁在本包启用；不降低任何现行阈值，不把未执行记PASS。

## 连续执行范围与可验证完成条件

1. **历史输入可携带化。** 仅从已完整保存的原证据中逐项复制普通CI确需的非DB输入，集中放入已有syntax-contract Fixture下的可携带包/索引，复用现有gzip/标准库模式；记录原logical路径、SHA与来源。原文件、旧Fixture根/失败/历史successor保留。消费端显式区分历史logical身份与可携带物理位置，不伪造ownership/currentness，不读R4 DB，不下载或重采。必要路径迁移与自源检查的允许变更集中记录，不再新增层层按会话自证目录。
2. **门禁等价迁移。** 生效54项精确格式范围治理和SHA检查；历史全局计数交给既有唯一责任点，保留所有功能/独立语料/失败控制。逐旧检查列对应替代，不直接删除必需验证或用skip掩盖缺输入。
3. **本地集中核验。** 先跑上述责任测试，再顺序全workspace TS构建、普通Node完整root、格式、IR类型、架构与Fixture注册。CI可携带性须按只包含候选文件的输入核对；不让本地.superpowers帮CI“假绿”。另外只读核对既有Native profile与候选构建的适用性；缺匹配必须标为云端前置阻塞，不新增数值、不用豁免或重跑绕过。不新增工作树、进程采集helper/collector、Rust/Native实际运行、profile/校准/模型、依赖或经验数字。必要范围修复和局部复验在本包内，禁止重复完整长测到绿。
4. **固定可审查提交。** 依据逐路径审定清单，仅纳入实质改动与必要新文件，排除两私有目录、103项状态噪声、dist/target/依赖和无关改动；不使用git add .或-A，不覆盖用户已有索引。允许取得已核实main对象并在本工作树固定本地候选提交，记录准确parent/tree/head与测试适用性；不自动push/PR/CI/merge。

本地Git对象/引用写入只限上面的明确固定提交步骤；原物理main和旧分支/工作树保留，不强推或cleanup。若按原用户Git写入边界需要本次集中授权，可与本提案一并批准，之后不逐文件/测试微审批。

## 后续CI及合入边界

固定准确提交后，再集中提交云端授权包：目的、完整SHA、确切次数、三个job范围、实际Native/产物下载内容和本地替代证据。按当前配置，首次push和随后PR会各触发一组，预计共2批/6个job；不能说成单批。不在本包改变触发器来静默省掉检查，不自动重试或回补旧main CI 39708335128。

merge本身还会触发新的main CI，属于另一个明确说明的写入/运行步骤；在必需检查、差异/风险和评审均完成后再进行。A6 NOT_QUALIFIED、E02 NOT_EVALUABLE及历史Native timeout UNKNOWN仍保留，云CI绿色不替代这些资格。当前无可授权的最终新SHA，因此此处不请求立即运行云CI。

作者已核对远端main/PR21与本地源码树、候选目录、无二进制/DB入选、冻结JSON语义等价和6个实际输入/输出阻塞；没有把当前120/120局部结果冒称完整2792文件候选或干净CI通过。下一步只需一次批准上述治理与准备范围，随后连续处理到准确提交/云端授权包。

## 已批准实施进展

- 54项精确路径SHA门禁RED→GREEN；全局70/44和唯一性集中在原registry测试，未改54原文件。
- 携带输入保留原logical身份，以SHA命名的原字节副本显式映射；四份旧Fixture manifest仅允许已批准的inputs/expected追加，原SHA和原critical/gates不变。原64条R011语料范围不含后续独立binding-history两文件；R011仍核对第11迁移身份及全部checksum，不要求它永远为最后迁移。
- G12继续精确限制公开出口；私有模块的六个后续已批准Binding/FrameworkSurface入口列入准确清单，原authority-leak断言不改。两种历史registration successor继续逐项校验，之后只施加可审查的本次精确片段迁移。
- 首轮345项339通过/6失败保留；定位后失败项定向7/7通过。pnpm build包装器试图隐式install并因无TTY停止，未批准依赖重装；改按所有package.json的tsc命令拓扑执行。完整构建发现Runtime推断声明直接引用未声明的zod，已用现有Provider的ReturnType显式注解，CLI/MCP及IR类型复验通过；不增依赖或改运行行为。
- 测试拥有的源码投影置于原证据目录，不是Git工作树，不带.superpowers；只共享现有第三方安装，workspace链接指向投影，fresh dist单独复制且不暂存。它验证无私有输入的普通root，不冒称全新依赖安装或Native资格。

携带包最终复用已有标准库gzip模式：678项logical pin去重为358份原字节，集中为2,410,061字节压缩包及显式索引。原.physical/.logical文件安全检查保持，压缩容器使用既有whole-output cap，每份解码输入仍使用原line/stdin/stdout cap；不增加新数值。仅删除本轮刚生成且已逐字节归档的重复副本，不删除任何原.superpowers证据。全根投影首轮采用等价未压缩布局；最终压缩消费者另作定向复验。

完整普通root首轮进一步揭示旧schema适用性问题：R008/R009最新升级断言仍停在11，workspace隔离断言仍停在3；对齐已批准R013/W006，但原too-new拒绝和原行/图恢复断言保留。R011身份固定在第11条而非永远latest。Phase0.5 Evaluation生产reader明确只接R010，因此其测试用库显式应用原10条计划；默认CodeQuery测试继续使用最新13，未放宽生产reader。19个既有Node崩溃测试的helper默认系统TMP与worker既有安全根冲突；helper改为在既有mixedAnalysisTestRoot下新建test-owned唯一目录，原worker guard及恢复断言不变，不复用旧DB。源码投影缺真实Git index的一项checkout-index provenance测试将回原工作树只读验证，不把投影缺Git当产品通过。

## 本轮收尾与作者整包评审

- 首轮完整普通root组0：4561项，4507 PASS、42 FAIL、10 SKIP、2 TODO，约64分钟。原结果完整保留；42项逐条在原B results.integrationPreparation.failureResolutions映射到新鲜未插桩PASS。不是第二轮全root退出0，不累计重叠次数。旧条件SKIP/TODO不计完成。
- 追加修复：原安全根内短测试投影95/95；最终携带消费者332项先330通过、两项新获准Evaluation manifest追加后继缺失，保留原pin并补齐后2/2；真实Node退出/readonly重开19/19。Evaluation兼容107项先105通过，两项触发原QUERY_TIMEOUT；有界配对计时诊断未复现，恢复原字节后两项未插桩/原预算验证2/2。超时原因仍UNKNOWN，不称fixed或flaky，不改预算，不作性能资格。
- 受影响的两项真实runner控制2/2、此前未执行根组B-runtime78/78、A/B61/61均通过；runner控制中的31类预期失败/资源拒绝不是实际Evaluation PASS或Native成功。
- 全workspace16个唯一项目按package声明的tsc构建、IR类型，兼容修订后Storage/Runtime新鲜构建与IR类型通过。pnpm包装器曾在隐式install前因无TTY停止，原错误保留，不称pnpm命令成功。全仓格式首轮与后续具名改动范围格式通过；架构17项目通过。
- 最终携带包679项logical输入、359份唯一原字节、2,410,527字节gzip，全部对照原件一致。五份manifest只接受已批准inputs/expected追加，旧字段/critical/gates不变。最终投影额外未入选源码文件0；依赖只复用现有安装、workspace链接指向投影，dist来自fresh构建。两份较长原投影及全部失败保留；短投影放既有guard支持的isolated-tests祖先内，worker限制未变，不复用旧DB。
- 作者按源调用链复核：本准备包只改两处产品源码——Runtime返回类型显式复用既有Provider类型，及已获准Evaluation准确10/13准入。旧API/错误/预算/同snapshot/Native独立准入保持；无新依赖/迁移/公开入口。测试出口清单只跟随先前已批准的V5/V2/V3，不从产品重新生成行为golden。其余变动为输入携带、精确格式字节门禁、责任点和必要测试准备/追踪。
- 最终编译身份726ffb9793680e58698fcd3fb3f4d0698228df0fab89217ef04a6846bc6fa013；四个绑定包156个JS均有当前TS来源，无stale/missing。metadata/verification/transport三类profile仍零匹配，Syntax catalog空，云端必需门禁已知缺依据。不能移植旧profile、重采/降阈值或先试跑CI。
- 只固定本地审查候选，不授予合入资格。无独立新代理评审、真实Native/Rust/collector/校准、云端写入、重跑原main CI或付款/额度操作。原4/21接受、17 OPEN，A6 NOT_QUALIFIED、E02 NOT_EVALUABLE、历史Native timeout UNKNOWN、R4 mutable/C2/main取消未查状态全部保留。作者评审不代替后续完整分支独立评审/云端门禁或Phase1退出。

准确命令、原失败/有界诊断和每项PASS选择器统一归原B results.json.integrationPreparation；本地提交head/tree/parent在提交后写入同一索引，避免为文档自指SHA另造提交。
