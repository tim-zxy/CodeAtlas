# Phase1 A-runtime 实码缺口与统一设计输入

2026-10-29。状态：READ_ONLY_GAP_REVIEW / DESIGN_INPUT_ONLY。本文不是新的生产契约、profile或运行许可。

## 基线与证据适用性

A-local已完成声明式Node/SQLite组件退出。109原显式绑定接受；四项独立发现已在原范围修复，作者完成适用完整本地验证，无第二次独立评审。原始封存与失败均保留。P1-04/05仍OPEN，Phase1主任务4/21接受、17未关闭。

工作树C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas包含2026-10-29证据；D:/workspace/CodeAtlas的CURRENT_STATUS仍为2026-10-04旧Phase0.5，不能用D替代交付树。没有.codegraph，不新建索引。

## 已存在的调用路径和剩余边界

| 实码 | 已证明/已有行为 | 后续不能跳过的义务 |
| --- | --- | --- |
| runtime/src/mixed-analysis.ts::createMixedAnalysisRules | 纯规则端口prepareJavaOwner/validateObservation/compose；共享逻辑账本与失败记账 | 不能据纯输入认证实时Source、实际Native运行或OS峰值；production routing注释仍disabled |
| storage/src/analysis/mixed-analysis-stage.ts::MixedAnalysisStage | connection-bound capture/Stage；prepareOwner；TEMP/预算/lease、候选闭包和Store联动 | 数据库读集不等于文件系统重验证；不能从任意qualificationRef获得实际进程/资源资格 |
| source/src/path-safety.ts::safeAncestors/assertSameAncestors | 根内祖先目录身份与符号链接拒绝、前后比较 | 须在真实混合工作流确定何时读/重查Source与祖先，并绑定文件字节和目标/删除全集 |
| runtime/src/native-syntax-admission.ts::observeAdmittedNativeSyntax | absent-profile在prepare/Source/binary/spawn前拒绝；环境/实现/corpus匹配 | nativeSyntaxObservationProfiles仍空；不得从A-local逻辑预算自动安装实际RSS保留量 |
| providers/src/native-client.ts::runProcess | Node拥有spawn、pipe、shell:false/windowsHide、allowlisted env、取消/timeout、drain/await close | 当前没有受信实际child句柄采集准备/归因接口；产品hook会改变时序与身份，先做详细设计 |
| 现有C1/C2准备材料 | DRAFT/NOT_READY与有限Node helper句柄实验 | C1真实file-symlink EPERM仍未证明；C2四次已花费，helper不是Native，不自动重试 |
| storage migrations | repository001..011，workspace001..003确有文件 | R011已是带历史语义的现行实现；旧计划的简单syntax-store或重建R011不能直接照搬；后续迁移不是已完成能力 |
| plugins/src | 当前plugin-spi、plugin-spi-v2、plugin-routing及index | 四内建Plugin交付仍需真实语义/支持/负例证据，不能把SPI完成当框架能力ready |

以上路径均相对packages/，除非另标。具体后继函数签名/新字段尚未在本轮确定，禁止从本表猜测生产API。

## 建议顺序与取舍

推荐先完成A-runtime一个合并的详细设计/Fixture/实施任务包，再整体审查。理由是后续四Plugin的实际支持链和运行资格依赖A；先扩展B–E实现会积累未经真实输入证明的集成假设。可以提前顺序完成独立文档解析或Plugin纯规则，但必须各自有成熟的具体依据，且不冒称实际链完成。

替代一是先做B纯Plugin：能取得独立语义反馈，但真实Native资格仍OPEN；不作为默认主线。替代二是A–D并发开发：共享契约/迁移与集成未定，且违反当前顺序/不新增代理偏好，不采用。不引入broker/addon/依赖来“先跑通”采集。

## 必须进入同一A-runtime设计评审的决定

1. Source与SQLite两类身份如何捕获、重验证、计费、取消及失败结算；不宣称跨文件系统/SQLite的虚假原子性。
2. 实际Native同进程采集准备与完整生命周期；launch owner、权限、stdin时序、HOST与instrumentation存活成本以及失败拒绝。
3. 资格输入与产品输入边界；原FULL/DELTA/owner-map/history/删除全集绑定，旧v3不可偷换为过滤清单。
4. 独立oracle、准确实现/工具/corpus与测量范围；实际资格与校准/holdout/profile的依赖；具体数值测量后另审。
5. 批准范围内全部文件、Fixture、注册、测试和治理同步一次提交；不再把方向、计划细化和每个微步骤拆开审批。

此处列问题不是批准答案。本轮不新增wire/IR/SQL/owner-map/public API、profile数值、依赖或运行次数；真实运行前必须有可审阅的准确包。

## 后续能力与验收

B提供框架事实与ExecutionGraph/RuntimeFlow/合同跨仓；C将代码/文档/运行事实及受治理LLM候选转成MANUAL发布的知识；D从published知识生成标准Wiki/Markdown和Agent查询入口；E验证两个实际E2E与完整Phase1义务。Wiki不是把代码直接交LLM后保存为真相，投影自身不获得语义发布权限。

完整WikiSpec/DiagramModel/自适应路由/自动语义发布/第三方sandbox/新语言全覆盖不加为Phase1依赖。所有原有质量门禁保留；未测量、未运行或取消均不记PASS。

详细编排见[统一推进计划](../plans/2026-10-29-phase1-unified-next-delivery.md)。
