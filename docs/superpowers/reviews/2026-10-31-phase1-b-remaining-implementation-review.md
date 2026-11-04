# 固定Source观察首轮已执行；失败与缺口 — 2026-10-31

已按批准固定命令执行一次Rust库级观察：编译成功，1测试0pass/1fail；六对raw均保存，2 COMPLETE/3 PARTIAL/1 RESOURCE_LIMIT_EXCEEDED（Spring）。严格wire7 reader接受五份，Spring按同一资源错误拒绝。未重跑、未放大cap、未修producer；本错误不是harness错误，不使用纠错复验额度。具体限额类别UNKNOWN，不能混称历史Native timeout。

[详细实证审查](2026-10-31-phase1-framework-source-characterization-review.md)逐域映射十二Source义务及既有/缺失字段，收录当前手动test默认ignore与首轮源码封存差异。主批未成功退出，普通格式/架构PASS不替代Source/原Evaluation。旧producer/测试/TS/模板/锁文件不变，未进行第二次Cargo或产品修订；原父任务保持OPEN。

# B6 Source充分性与发布阻塞作者审查 — 2026-10-31

已在原B许可的离线Fixture范围准备四个Source文本（Spring/Mongo/Kafka/FastAPI）及逐域独立审查义务，复用两个未执行的Depends默认/注解对照；共六Source，未解析/执行/捕获。四个原Fixture ID仅增加Source/审查路径；原inputs/expected向量、criticalFacts与qualityGates不变，有原manifest快照和摘要证明。新增义务不冒称完整critical分母/批准baseline。

发布阻塞已定位到framework-runtime-candidate固定PARTIAL/DOMAIN_RECORDS_ONLY及entry候选继承PARTIAL/DECLARATION_ENTRIES_ONLY；原工作流正确拒绝。因此更多接线或仅采Source都不能自动完成生产发布。不能删标记、改COMPLETE或设置ready布尔值绕过；先取得实际Source字段/关系，再集中治理必要语义与coverage合同。

核对依据：原2026-10-22 contracts-and-runtime设计§4四域必须语义，foundation-and-runtime计划P1-06..09的实际Source路径，以及evaluation设计E03/E04和E05/E06。Syntax3现有callee/lexicalScope/control/declaredName不等于默认参数/注解角色或fluent返回对象关系；typed初始化是否足够先观察，不预判需要新字段。旧17例r5只有原Source/reader/V4适用范围，不能补作四域真实来源。

集中包先只观察既有字段，不改产品让它成功。Java测试owner映射只按既有Source oracle等级使用，不伪称Canonical normalizer/DB闭包；完整流校验也不能代替实际框架关系/原critical probes。审批依据为原B设计§7与IMPLEMENTATION_PROTOCOL，不是技能额外强加逐任务审批。

本轮仅Node Fixture检查35/35，库存发现70/Phase1 44；8个JSON范围格式通过，实际Source观察NOT_EXECUTED。原B5最新52项产品收据按未变源码/产物摘要复用、不重跑、不与35相加。证据source-review-commands.json/source-review-proof.json位于原B唯一账本目录；旧原始产物/失败与R4不动。父任务4/21接受、17OPEN，B5/B6与原E03..E06/Source/物理/完整Phase1门禁不关闭。 这是作者审查，不是新独立整包评审。

# B5 workspace接线作者审查及剩余缺口 — 2026-10-31

沿原批准B5/B6实现ContractStore.readWorkspaceInputs，复用原完整冻结输入/Source/currentness认证：同一逻辑读取预算覆盖实际repo快照、现存W003 frozen集、根与workspace旧指针，返回实际持久候选，不承诺跨库原子时刻。Application deriveWorkspaceRuntime实际调用matcher/stitch，私有composeMatchedWorkspaceRuntime经原授权工作流提交，trace仍只读。FrozenContractSet显式输入，不猜服务身份，不改旧prepare端口。

真实接线暴露原手工存储例把boundaryRef写成CONTRACT，实际stitch要求FRAMEWORK_BINDING；更正为正式图既有语义后又复现Store只按Code/Source/Syntax解释所有externalRefs的遗漏。现只对同repo/revision、同候选中已验证的binding进行peer-envelope闭包核验，binding值仍按不可变runtime_bindings归档及payload/digest校验；不伪造Source SupportRef，其余来源认证不放宽。缺失binding反例继续拒绝。

最终去重影响范围52/52，0fail/cancel/skip/todo；Storage/Application/Runtime三包构建、架构17及9个具名文件格式exit0。准确命令b5-workspace-final-commands.json，源码/产物b5-workspace-input-hashes.json与b5-workspace-artifact-hashes.json，均在原B批证据目录。此前44项43pass/1fail及更早缺API RED、正确binding引用的Store RED原样保留；不同范围52/108/149不相加。

非空owned声明合同经实际matcher/stitch授权持久化；两仓同局部ID/逆序集合输入/Source CAS失效和PARTIAL不覆盖last-good均有证据。原workspace摘要配方本就按repo排序，组装沿stitch排序返回冻结binding，不改摘要/身份契约。当前证据不是实际四框架Source→跨仓发布资格；完整Source充分性、原E03..E06/critical recall/性能/物理门禁及B6仍OPEN，父任务4/21接受、17OPEN不变。

本轮调用链审查：原INDEX授权→精确冻结输入/实际repo候选读取→实际matchContracts→实际stitchWorkspaceExecution→原完整覆盖检查→原workspace写事务及前后来源核对。QUERY不触发prepare。新增内部Application→Contracts依赖与lock/exact inventory同步，符合原架构；旧接口不变。此为作者范围审查，不是新独立整分支评审。

| 剩余义务 | 核对依据与当前边界 | 后续处理 |
| --- | --- | --- |
| 实际四框架Source正例到完整发布 | 四个框架Fixture的inputs/expected为声明结构；fastapi/source-adequacy/README明确未授新producer资格 | 制定一次准确来源采集/组合包；未经批准不执行Native/Rust |
| Depends/注入、Mongo handler/fluent、typed初始化 | 原Source充分性审查及framework-rules保留未知；现有Syntax3不等于证明这些角色/返回身份 | 集中评审最小语言中立证据需求；不自动添加wire8/Syntax4或名称猜测 |
| 原Fixture/Evaluation与critical事实分母 | 新声明Fixture criticalFacts/qualityGates为空仅是组件证据 | 按原E03..E06与原父门禁补齐，不把发现/测试数当Recall |
| 物理/生产观察 | A6 NOT_QUALIFIED、profile空、历史Native超时UNKNOWN | 保持NOT_READY；真实批次/profile需原保留授权 |

Source/Evaluation不足不能由已完成的私有组合冲抵；后继C..E无空白实施授权。本轮不新造数值/协议或触发CI。

# B5固定V4与当前Context续接作者审查 — 2026-10-31

已沿原批准B5/B6实现RuntimeFactStore.readFrameworkInputs：同SQLite快照核验完整expected身份/当前Source目标、按原逻辑预算读取Code/Source/Syntax3/支持及已声明capability；旧Syntax明确拒绝且旧历史接口保持。固定selectFrameworkPluginsV4只选现有四个内置factory；Application合并严格候选（同ID异内容拒绝、支持/限制保留）后调用既有Graph/Flow，私有composeFrameworkRuntime接入原授权工作流与Store。无匹配也保留PARTIAL，不产生空COMPLETE。多路由复用原SPI单位扣减同请求maxItems，未新增数值/默认/profile。

最终源码四包（Plugins/Storage/Application/Runtime）构建exit0；最终产物去重108/108，0fail/cancel/skip/todo；架构17及14个具名文件格式exit0。准确收据b5-framework-sealed-tests.run.json、b5-framework-final-builds.json及b5-framework-final-commands.json；新源码/产物摘要b5-framework-input-hashes.json与b5-framework-final-artifact-hashes.json，均在原B批唯一证据目录。最终重编译后部分JS摘要改变，故108相同范围复验一次；未虚称产物不变。旧149/14/108不相加。

已核对调用链：原Application授权→basis捕获→readFrameworkInputs精确重核→route/descriptor capability过滤→当前严格Context→工厂detect/extract→候选合并→既有Graph/Flow→原Application完整性检查→固定Store。PRIVATE入口无生产命令/新配置键；Runtime无领域规则，Application无Plugin依赖，Storage仅IR。两个新增内部依赖Application→Execution、Runtime→Plugins已声明/锁定并同步原exact依赖与导出快照；未安装第三方库。

保留失败：缺API RED；首次14项12pass/2fail源于新测试误以为Spring/FastAPI Entry必须另有binding，原独立expected明确bindings=[]，已改为准确golden而非修改oracle；35项32pass/3fail为两个依赖与新增导出快照，已精确同步；多路由遗漏扣减RED已用同一SPI计数修复；共享计数器初次编译遗漏binding runtime参数，计数使用结构schema，原引用认证仍完整执行。全部原始输出保留。

四框架到Graph/Flow的正例仍来自原独立声明Fixture；现有v7声明输入经真实Stage/Store持久化的Syntax3读取与V4 Context闭包另有正例。实际SQLite→固定factory→Application拒绝PARTIAL/无写入及授权前无读取已验证，但没有把这两种证据拼成真实框架Source→完整发布资格。Workspace具体matcher/stitch准备仍需接线；完整Source充分性、原Evaluation/性能/物理门禁和B6仍OPEN，父任务4/21接受、17OPEN保持。 本节为作者范围审查，不是新独立整分支评审。

# B5双仓续接作者审查 — 2026-10-31

原B5/B6批准范围内补真实双仓owned SQLite组合，修复两个已复现缺陷：合同归档读取按repository_id＋entity_id匹配，保留完整payload/digest验证；Runtime当前性要求Source目标repository/revision/fingerprint与Code basis一致，旧历史仍可读。两个仓库刻意复用局部revision/file/contract ID；两份合同可读回，正式RepositorySourceStateStore CAS仅推进第二仓库后，左仓CURRENT、右仓及workspace AFFECTED，旧冻结候选拒绝且last-good不变。只读恢复亦覆盖。

根因：SQL主键已带repo身份，但readWorkspaceActivation的items.find只用entity_id；Runtime capture沿用允许历史落后于Source的history视图，却漏了Runtime准入所需的当前target比较。固定在各自实际调用点，不放宽原IR/历史校验，不改变已接受设计。首轮后直接SQL变更不是正式来源更新的充分证据，因此另以原SourceState CAS复现CURRENT误报后才修复。

准确收据：.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/b6-two-repo-final-commands.json；最终四文件受影响测试14/14，0fail/cancel/skip/todo；Storage构建、架构17及三文件格式exit0。首次合同身份失败、修复后来源失败、正式Source CAS复现及后续GREEN均保留，不改写失败；旧149是前一检查点，不与14相加，不声称本次重跑完整B root。新源码/产物摘要及其余原输入不变证明见b6-two-repo-hashes.json。

此证据是声明模型＋真实SQLite/正式SourceState API，不是实际Source扫描、Native或完整跨仓框架生产链。完整V4选择/当前Context组装、来源充分性、原Evaluation/物理门禁仍OPEN，B5/B6和父任务4/21接受、17OPEN不变。无新schema/迁移/数值/依赖、用户库升级、CI、Git写入或新代理。 本节为作者范围审查，不是独立整分支评审。

# B5最终当前范围收据 — 2026-10-31

最终当前范围149/149，0fail/cancel/skip/todo；IR/Contracts/Storage/Application/Runtime五包构建、架构17及匹配范围格式exit0。Code/read/History与Schema兼容的未变成功路径按收据复用，不将380/146失败批次改写为通过，不相加重叠计数。最终源码/产物、五迁移旧checksum、70/44 Fixture与10份旧文档后缀均有证明。

非空owned组合也覆盖Runtime binding和W006节点/边；这仍是单repo声明模型，并非新的Source/跨repo生产资格。下方未完成项继续有效。

# B5存储与授权组件作者审查 — 2026-10-31

本补记替代下方“备份修订待批准／尚无Store”的当前状态；原文与原失败保留。用户已明确批准五个纯新增迁移的false标记，并沿原B5–B6连续实施。这里是作者对实际变更的范围审查，不是独立分支评审或整个B批验收。

## 已实施

- R012/R013、W004/W005/W006及19张新表；严格类型、activation内关系、不可变记录、旧行/旧对象保留、无回填/down，旧true备份拒绝未改。R012审查反例证明原DDL漏掉context入口必填/edge源context关系，已RED→GREEN修正，仅更新尚未发布R012 checksum；修订前SQL/manifest另存。
- RuntimeFactStore从真实SQLite重新认证Code/Syntax与支持值，保存不可变支持归档、graph/Flow及当前指针；锁内CAS、完整候选限制、last-good、COMMITTED/NOT_COMMITTED/COMMIT_OUTCOME_UNKNOWN和只读恢复。
- MixedAnalysisStore新增固定applyWithRuntime分支，复用同一Stage lease/Source/CAS/账本/事务；Runtime SQL错误时Syntax/Code一并回滚。原apply仍返回原Syntax身份，R011入口不静默接受13。
- ContractStore核验实际冻结RevisionSet、精确repo Code/Syntax/Runtime binding和登记根，单个workspace事务写catalog/contracts/matches/图及指针。分库前后重查；提交后来源变化保留COMMITTED/AFFECTED；只读恢复不修库。
- Application先INDEX/QUERY授权，拒绝PARTIAL/取消/过期候选；trace只有读端口。Runtime是私有Store组合，域prepare/derive仍为受信端口，不包含Source扫描或生产V4工厂选择器；物理观察仍NOT_READY。
- workspace输入摘要配方原样共享到IR，Contracts原导出保持，未引入第三方库或反向架构依赖。新测试只追加原B root一次。
- 复用HistoryReadBudget：真实SQL先计费再交付TEXT/行，整个workspace跨repo续接同一账本；没有新默认、profile或RSS保证。资源验证收敛为一个实际SQL行/TEXT/memory/write前付边界检查，不增加完整费用矩阵；它不转成物理RSS资格。

## 验证与保留的失败

准确命令、时间、exit、输入身份均在原B批唯一结果索引。五包构建、IR类型、架构17项目和具名匹配格式有本地收据，最终范围结果以唯一索引为准；新owned库覆盖空库/升级/失败逐版本回滚/只读重开、非空graph/Flow与历史支持、真实lease联合回滚、提交后异常、冻结集/root/binding拒绝、非空服务/合同/match及Application组合。Fixture库存70、Phase1 44，新p1-runtime-storage-v1仅一次；结构Fixture空criticalFacts并不豁免原质量门禁。

首轮旧Store/迁移83项中19个崩溃子进程被原test-root守卫拒绝。仅把新测试TEMP/TMP放回原允许根，未放宽守卫；后续集中批次这些19项全部通过。普通Node测试子进程不是A6采集helper。集中380项379通过、1项精确Storage导出清单失败，已同步完整清单并定向通过；没有把该失败批次改写成全绿。

Schema/capture兼容146项143通过，3项是旧版本/库存期望。索引初始化现准确要求13，too-new用14；Phase0 W003仍以原不可变三迁移前缀验证全部旧库存/冻结断言，W006另有完整新库存/升级检查。不是删除旧门禁。修正后三文件29/29。新Fixture分类拼写、Windows测试库关闭顺序、类型声明泄漏及一次范围格式失败均保留记录。

## 尚未完成，不据组件成功签收

- 已补同Code basis下准确parent full历史恢复改变Syntax activation的实际owned库控制：旧期望拒绝、last-good AFFECTED、新身份重新激活。它不声称新producer Syntax记录或Source运行。Workspace已测非空单repo，不冒称实际多repo数据库端到端。
- 私有Runtime依赖受信derive/prepare端口；完整四V4工厂选择、当前SQLite Context→四Plugin→正式Graph/Flow→冻结匹配/多repo Store的统一生产式组合仍需完成。旧V1 selector继续拒绝V4，不静默升级。
- B2完整Depends、Spring注入、Mongo handler/流式身份及typed初始化需要独立Source与Syntax字段充分性。缺字段保留UNKNOWN/PARTIAL，不重解析或按名称猜测；不得在本包直接引入wire8/Syntax4。
- 原E03–E06、critical recall/性能/真实Source与物理资格仍OPEN。现有声明候选PARTIAL时不会由Application/Store发布；手写COMPLETE测试输入只证明数据库组件，不证明生产规则完整。
- B6整链、整个B批和P1-06..09父任务未退出，父任务仍4/21接受、17OPEN。后继C..E无空白实施授权。

后补SQL计费与历史恢复属于契约一致性检查，未声称在已存在实现上重新取得源码test-first RED。下一步沿原整包集中补有来源依据的离线集成；若实际证据要求新协议/来源采集或新数值，再提交准确治理差异。没有云端CI、Git写入、用户库升级、Native/Rust/采集helper/模型运行或新profile；A6 NOT_QUALIFIED、空catalog、Native timeout UNKNOWN、main取消未结算及R4限制保持。

---

# Phase1 B批当前实现作者审查
2026-10-31；只评审本轮已实施B1–B4路径，不是B1–B6整包验收或独立代理评审。

## 实际交付范围
新增严格binding/match/workspace IR、V4 SPI和四工厂，支持已有route/router/cron/Mongo读写/Kafka发送监听及V4限定的可证明Feign接口；正式graph/Flow保留DATA、消息、WATCH、TASK/BATCH上下文与边界；冻结服务/合同六状态匹配和HTTP、MESSAGE方向相反的跨仓投影。仅纯候选，不写Canonical数据库。

七个新Fixture ID，每个只出现一次；所有新增输入为独立声明式结构，域身份沿用旧独立预期，绑定/workspace身份依批准tuple预先构造。没有新来源捕获；手写Context不能替代实际Source/producer/Evaluation。新Fixture的qualityGates为空不代表原E03..E06要求取消，父任务继续OPEN。

## 已发现并修正
- 外部ref占位不能充当本候选实际Resource/Task：独立反例原build RED，现严格查本地实体数组。
- 混合Mongo中只有部分site具备策略时，不能消去所有未组装诊断：实际反例RED后按全部DATA_OPERATION的处理数保留。
- MESSAGE namespace跨多个实际服务不是HTTP服务目标歧义：跨仓正例原UNRESOLVED，现只对HTTP/RPC要求单一目标服务。
- 消费边界应进入EVENT，不是从handler发出消费；完整WATCH应独立EVENT，任务创建只接准确Task entry：真实声明反例及单独context检查。
- graph/Flow同上限包含独立binding envelope、覆盖/停止元数据；取消的workspace返回partial空投影，不把未核验输入列为已接受matches。
- 旧entry公开入口的maxItems检查仍先于Context；旧规则不会因新Feign能力改变，新行为只在V4 continuation启用。
- Contracts公共声明显式返回IR类型，避免为推导类型泄漏另加Zod依赖；仅复用IR内部包。
- 首轮类型错误、测试参数SourceRange/排序/预算取值错误、局部编辑脚本重名失败均保留原日志，没有把失败改写为成功。

取消回归是在源码修正后、重建前对旧编译产物观察RED；不把它记成严格的源码test-first。其他主要新API及所列语义反例先观察缺API/实际行为RED。

## 未满足与暂停项
- B2完整Depends、Spring注入及Mongo handler/流式注册仍OPEN。当前Syntax3没有通用参数默认/注解角色或fluent返回对象身份，不能据名字推断Dependency/WATCH；还缺相应真实Source正例。Feign仅当前字段可证的静态name/value接口+方法映射，动态值、其他形式保持未知。
- 类型声明与初始化多记录未放松重复定义守卫：没有对应真实同site/owner证据前不折叠。
- graph/Flow目前在声明候选范围工作，不证明部署、真实进程/事件顺序或概率准确率；原critical recall/性能等尚未验收。
- B5暂停：统一设计误以为现有runner支持true备份标记。原测试证明仍拒绝。未新增SQL/manifest/Store写入；[集中修订提案](../specs/2026-10-31-phase1-migration-backup-policy-proposal.md)待决策。
- B6仅做当前改动适用门禁；完整持久化组合、原父任务及整个B批未完成。父任务4/21接受、17OPEN保持。

## 验证范围
以唯一结果索引 `.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json` 的最终命令、exit与测试汇总为准，首次和中间失败不覆盖。无独立代理、云端CI或Git写入；旧Native timeout UNKNOWN、A6 NOT_QUALIFIED、空profile、main取消未结算和R4限制均未改。

最终范围检查400/400、0fail/cancel/skip/todo；四包构建、IR类型、架构17及63文件具名格式通过。原备份拒绝1/1；空库前向FK检查通过，W004/W005次序无需更改。七新测试文件仅经一份B root注册，中间重叠收据不累加。不是全仓verify。

Source/Syntax要求由Context4/Syntax3闭包核验；descriptor只声明已有SYMBOL，不发明CODE_GRAPH或以raw事件名充当provider capability。旧selector仍严格；完整V4注册接线属于待完成B5。
