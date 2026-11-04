## 当前结果 — 2026-10-29

用户已批准本包并已执行；现为A6_PLATFORM_NOT_QUALIFIED。一次Prepare通过，G01一次失败后停止，G02/G03未执行。imagePath诊断缺口已离线修正（17PASS），当前C#未重编译/实测。[A6实施记录](../plans/2026-10-29-phase1-process-acquisition-conformance.md#实施记录与作者评审2026-10-29)；[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-process-acquisition-conformance/results.json)。下方待审批文字为保留历史，不能据当前源码冒称旧冻结采集通过。

# Phase1 A6：Windows 进程生命周期采集可行性设计

2026-10-29。PROPOSED / REVIEW_READY；未授权实施或执行。与[完整任务包](../plans/2026-10-29-phase1-process-acquisition-conformance.md)一次审查，不拆方向/细化/单case确认。当前只有设计/只读核验。

## 1. 目的与基线

[A5结果](../../../.superpowers/sdd/2026-10-29-phase1-mixed-execution/results.json)为A5_FIXED_EXECUTION_LOCAL_EXIT，271 PASS/1原C1 TODO。Source/owner/Stage/请求/Store固定链已存在，不重做。本包只回答：能否在一个立即退出的Node后代执行前取得其OS句柄，并在同一实例实际退出后查询终生working-set峰值？

原[C2评审](../reviews/2026-10-23-phase1-trusted-context-implementation-review.md)：held-ready可获取；closed-before-attach明确不可获取；取消即使有峰值也不合格。原四个slot全部spent，不重试或复用。新实验不冒充旧slot，也不证明真实Git/Native或全A5资格。

成功最多退出A6_NODE_DESCENDANT_CONFORMANCE_ONLY；失败A6_PLATFORM_NOT_QUALIFIED；仅离线实施则A6_OFFLINE_TOOL_ONLY / PLATFORM_NOT_EXECUTED。任何结果都measurementEligible=false；P1-04/05、Phase1和父任务4/21保持。

## 2. 实码核验

| 实码 | 已有能力 | 不能推定 |
| --- | --- | --- |
| runtime/src/mixed-execution.ts | 一个deadline，Source→Java v2→v5→重查→Store；等待原client close | 当前v5 lifecycle=null，无实际资源采集或生产资格 |
| source/src/git.ts::controlledGit | 固定命令/管道、取消/超时、kill/await close | rev-parse靠argv即可运行，stdin屏障不能消除事后PID attach窗口 |
| providers/src/native-client.ts::runProcess | 原transport拥有stdout/err/stdin；v5私有beforeInput/afterClose/dispose | 不能用它证明Git/完整后代，也不能用私有ChildProcess._handle |
| scripts/syntax-peak-collector.ps1 | 已有PowerShell/C# PInvoke和PeakWorkingSetSize查询布局 | 自己启动helper，不是Node创建的实际后代 |
| runtime/src/syntax-observation-profile.ts | 严格SYNTAX_OBSERVATION/HOST+NATIVE布局 | 不改purpose、正向catalog、profile数字或全链保留量 |

## 3. 平台事实和选择（作者推荐，尚未接受）

官方技术依据，均不是本机实测：

- [Node24.15 ChildProcess](https://nodejs.org/download/release/v24.15.0/docs/api/child_process.html)：公开PID/事件/管道，没有公开Windows进程HANDLE参数。
- [Windows debug events](https://learn.microsoft.com/en-us/windows/win32/debug/debugging-events)：CREATE_PROCESS_DEBUG_EVENT先于用户态执行，提供进程/初始线程/映像文件句柄；事件期间相关进程线程暂停。由此推断可以避开短进程事后获取窗口，仍须实测。
- [创建标志](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)：DEBUG_PROCESS覆盖新进程及后代调试链，不能同时加DEBUG_ONLY_THIS_PROCESS；另起调试链等逃逸不自动视为覆盖。
- [ContinueDebugEvent](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-continuedebugevent)：由创建调试进程的同一线程继续；EXIT_PROCESS继续后系统关闭事件进程/线程句柄。须DuplicateHandle取得自有保留句柄，不能对系统句柄双close。
- [内存查询](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo)与[计数器](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters)：有权限才可查询；PeakWorkingSetSize单位bytes；最终退出后查询成功不能凭文档保证。
- [Job计数器](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information)：Job/process内存限制和相关统计围绕commit，不能无依据改称working-set/RSS证明。

| 方案 | 取舍 | 决定建议 |
| --- | --- | --- |
| 事后PID attach + stdin等待 | 最省，但argv型Git/快速失败仍可能先退出，旧C2已有负例 | 不重复原探针 |
| 外层资格工具使用OS调试创建事件 | 不替换Node内部Git/Native owner，不转发其协议，可在用户态执行前拿句柄 | 推荐仅做本包小范围Node后代验证 |
| Job统计或新addon/生产broker | 指标不等价，或增加ABI/依赖/launch拓扑 | 本包不实施，不改指标 |
| 转B/C独立产品任务 | 能推进其他能力，A资源缺口仍OPEN | 推荐方案拒绝或失败后的可选后继 |

新增调试行为会改变运行环境，不预设透明性。本包不是完整debugger产品、不安装依赖；拒绝或失败时不自动另造平台框架。

## 4. 最小工具与收据契约

仅资格工具，不改packages/**产品源码、Rust、数据库迁移、A5或公开路由。

- scripts/mixed-process-collector.cs：单线程Win32事件循环、映像/创建身份、duplicate/最终查询/释放。
- scripts/mixed-process-collector.ps1：固定Prepare或Collect入口，已有Add-Type编译/已锁定程序集加载、HOST通道drain和工具自身结算。只接受明确Node/helper和三模式，不接受任意命令或PID attach。
- scripts/mixed-process-conformance-child.mjs：固定HOST/立即退出后代/等待取消后代/简单根模式；Node拥有后代管道、kill、await close。
- scripts/mixed-process-conformance.mjs：唯一纯离线readMixedProcessConformance(value, limits)，不spawn、不读取产品catalog、不生成profile。
- scripts/test-mixed-process-conformance.mjs：一个人工trace suite，不调用collector/Add-Type/helper。

收据kind=MIXED_PROCESS_ACQUISITION_CONFORMANCE，schemaVersion=1，measurementEligible恒false。mode只允许SHORT_DESCENDANT/CANCEL_DESCENDANT/FINAL_QUERY_FAILURE；status=COMPLETE或INELIGIBLE，不携带APPROVED、RUN_READY或reservation。

实例记录：本次create序号、PID、creation FILETIME十进制字符串、映像路径/摘要、CREATE/EXIT序号、OS实际退出及Node close佐证、finalPeakBytes或null、query/release结算。HOST/HELPER分开；COLLECTOR自身本次资源/退出证据单列，不能充当HOST/NATIVE。PID必须与本次同一句柄实例一致，不能只比较大致时间窗口。

保留进程级记录和必要固定错误码；不读取进程内存、Source、原始stderr、任意命令行或debug字符串。limits显式，复用现有有界JSON/数据检查，不把Native事件cap、Syntax ticks或SQL rows当Windows事件阈值；不积累所有DLL/线程载荷。

## 5. 生命周期和失败

1. Prepare使用一次已有Add-Type编译调用生成拥有目录collector.dll。编译成本/其编译器进程单列，不叫被测HOST；失败停止，不装SDK/换编译器/重试。Collect不再编译。
2. 启动前冻结实际Node/PowerShell/C#/PS1/helper/validator/程序集SHA、argv、env白名单、安全控制与输出ownership。新源/DLL当前不存在，执行freeze尚NOT_READY；不填占位SHA。
3. 只CreateProcessW创建拥有Node HOST，DEBUG_PROCESS，不DebugActiveProcess/枚举PID/提权/读私有HANDLE；启动隐藏窗口。
4. CREATE事件内绑定映像、PID/creation身份并DuplicateHandle。准备失败不继续业务执行，终止/结算拥有链，不按旧PID找替代进程。
5. CreateProcess/WaitForDebugEvent/ContinueDebugEvent保持同一OS线程。映像文件句柄及时close；系统debug线程/进程句柄按API结算；自有duplicate单独close。仅每实例已识别的初始loader breakpoint使用固定继续规则，其余异常NOT_HANDLED；重复/未知初始化异常不得临时扩白名单变绿。
6. EXIT事件时读取只能是辅助。Continue后用duplicate确认实际OS退出，再最终GetProcessMemoryInfo；只有同实例最终正峰值、正确单位和释放齐全才是完整helper记录。早期峰值、最终查询失败或错配均UNKNOWN/INELIGIBLE，不补0/前次峰值。
7. HOST管道由collector异步drain，后代管道只由Node消费，不能第二消费者或阻塞debug循环。取消由HOST终止自己的后代并await close，collector继续OS退出与释放。
8. 失败/超时/取消不重试。只终止本次握持的实例，处理退出并释放自有句柄；无法确认清理=CLEANUP_UNKNOWN，停止余项。不能直接放弃debug事件而遗留暂停进程。
9. debugger会改变异常/时序，Win32权限、x64布局及最终查询可用性须真实case证明；纯trace/静态解析不能替代。不能据helper成功推导非debug生产适用性或profile值。

## 6. 唯一新增helper批次（待一次明确批准）

最多3次Collect、5个Node生命周期，另一次Prepare：共4次工具PowerShell调用、Add-Type编译调用1次，其准备成本单列。测试runner/静态解析不是被测helper，不混入5个计数。原C2四slot保持spent。

| case | 拥有Node数量 | 独立预期 |
| --- | --- | --- |
| G01 SHORT_DESCENDANT | 1 HOST + 1立即退出后代=2 | 不让后代等待ready；CREATE/同一句柄/实际OS退出/最终peak/Node close和释放齐全；平台做不到则如实失败 |
| G02 CANCEL_DESCENDANT | 1 HOST + 1等待取消后代=2 | HOST kill/await close；即使有峰值也CANCELLED/INELIGIBLE，全部句柄结算 |
| G03 FINAL_QUERY_FAILURE | 1简单退出HOST，无后代=1 | 显式注入该实例最终查询不可用，记录INJECTED、peak=null/INELIGIBLE，不访问错误PID/fallback值 |

每项一次、顺序。G01非预期失败停止后两项；任何清理UNKNOWN/工具改变停止剩余；不能换超时/取成功样本/重做slot。复用既有实验10000ms helper寿命控制和1000000字节外层输出控制（scripts/syntax-peak-collector.ps1和scripts/test-syntax-peak-collector.mjs）；这些是测试安全控制，不是新增产品/质量/profile阈值，不扩大。

只读核验的工具：
Node D:/Program Files/nodejs/node.exe，fileVersion24.15.0，SHA256 3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5。
PowerShell C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe，fileVersion10.0.26100.8875，SHA256 60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f。
OS/当前进程均64位。这些由文件metadata/hash读取，未运行Node版本命令/collector；执行前必须再核对，不用旧文字放行新工具。

批准整包可覆盖按本设计实现、冻结实际身份后的一次Prepare/G01..G03，不覆盖未知Native运行；若只批准离线，编译/Collect/被测helper均不得启动。准确argv见计划。

## 7. 完整A5 Native运行清单仍NOT_READY

| 必须锁定 | 当前缺口 |
| --- | --- |
| collector Win32 ABI/初始化异常/短命后代/最终查询 | 待本包真实helper；Synthetic trace不算平台证明 |
| 实际Git/Native构建、argv/env/grammar/后代/collector身份 | 未冻结完整实际工具包 |
| 原独立FULL/DELTA/删除/NO_OP/失败输入、pristine SQLite和完整oracle | 局部资料可复用；真实清单未准备，不能用R4 mutable |
| 无profile首次资格测量的专用authority | 尚未定案，不能给公开Runtime加bypass |
| 全链purpose、保留量、逻辑预算剩额、校准/holdout次数 | 未批准；旧HOST+NATIVE schema不动，不先填数字 |
| 调试环境→非调试生产适用性 | OPEN，不能由helper成功推出 |
| 完整准确命令/ownership/停止条件 | 后继Native包单独审查，本包CI次数0 |

A5串行await Git/v2/v5 close只是后继并存分析输入；本包不批准max/sum公式、不忽略未知后代/collector、不安装reservation=0。RSS、commit和逻辑retention保持不同语义。

## 8. 最小验证、治理与回退

人工Fixture先写正确短命、缺CREATE/EXIT、PID复用/creation错配、提前close/无最终读、单位/0峰值、取消/注入、漏释放、伪APPROVED；一个离线suite。三个真实case承担OS/管道/初始化证明，不建每Win32 API的镜像测试。格式/注册/架构只跑影响范围，不跑A5 272或旧Stage/Store/Native完整批。

原IR provider-independent、SQLite authoritative、candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow和所有DEFERRED保持。只记录实验边界，不修改已接受生产ADR/用途；后继改变purpose/计量/launch owner或hook须另有DCP/证据。仅作者审查，不新增代理。

回退：停用新工具、保留原失败/未花费slot，产品保持拒绝；不清理旧证据、不恢复R4。拒绝/失败后可继续B/C独立设计，A实际资格仍OPEN。

集中问题：是否批准本设计、T1–T3及一次Prepare/三个新helper场景？可只批准离线实施。均不含实际Git/Native/全A5、校准/profile数字、新依赖、云端CI或Git写入。
