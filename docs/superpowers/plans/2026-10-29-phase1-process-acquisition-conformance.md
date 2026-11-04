## 当前结果 — 2026-10-29

A6_PLATFORM_NOT_QUALIFIED。用户明确批准整包；Prepare1次通过，G01一次失败后停止，无重试，G02/G03未执行。当前imagePath诊断修订只有离线17PASS，C#未重新编译；不关闭平台资格或父任务。

# Phase1 A6 Process Acquisition Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in this session, sequentially. Steps use checkbox syntax. 不新增代理/会话/工作树/Git写入。

**Goal:** 用一个小范围Windows工具验证短命Node后代同一HANDLE的终生working-set查询。

**Architecture:** 外层PowerShell/C#标准Win32调试事件；Node继续拥有后代管道；唯一离线收据validator和人工trace；真实case各一次，不扩产品框架。

**Tech Stack:** 现有Node24/Windows PowerShell/.NET/Win32/Fixture，无新依赖、迁移、Rust或产品数值。

**Spec:** [A6设计](../specs/2026-10-29-phase1-process-acquisition-conformance-design.md)。

REVIEW_READY / IMPLEMENTATION_NOT_AUTHORIZED。一次审批T1–T3及明确新helper；若仅离线批准，所有编译/Prepare/Collect不执行。

## Global Constraints

- 实际C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；保留旧文件/EOL/证据、C2四spent/R4 mutable限制；不修Gitmetadata。
- A5 271PASS/1C1 TODO按适用性复用。产品packages/**、Native/Rust、公开路由、catalog/profile不改。
- 不系统attach/枚举/提权/读Node私有HANDLE；所有helper为拥有链。
- 最多一次Add-Type Prepare、3次Collect/5Node，各case一次；失败/清理不明停止、不重试。
- 新SHA从实际实现/程序集读取；freeze缺项/改变拒绝启动。不预批未知Native、purpose、profile或云端写入。
- 复用原helper10000ms寿命、1000000字节外层输出实验控制，非产品/quality门槛。
- 仅作者审查；原范围统一修复，无逐步骤审批。

## Review Focus

1. 短命进程获取窗口：G01必须CREATION前用户态句柄；缺CREATE离线拒绝。
2. 吞真实异常：仅已识别初始breakpoint继续，其余NOT_HANDLED；Node初始化失败就停，不临时白名单。
3. EXIT后系统关闭句柄：duplicate→实际OS退出→最终查询→释放，漏项拒绝；G03注入最终失败。
4. 取消与管道死锁：collector只读HOST，Node只读后代，G02 kill/await close/全部句柄结算。
5. 实验结果伪profile：恒measurementEligible=false；离线伪APPROVED拒绝，产品/catalog不变。

## Files and interface

Create:
- scripts/mixed-process-collector.cs：同线程Win32循环、x64布局、映像/duplicate/退出最终查询。
- scripts/mixed-process-collector.ps1：固定Prepare/Collect入口、freeze/程序集核对、HOST drain和工具结算。
- scripts/mixed-process-conformance-child.mjs：固定HOST/子模式，禁止任意命令。
- scripts/mixed-process-conformance.mjs：纯readMixedProcessConformance(value, limits)，不spawn/不产profile。
- scripts/test-mixed-process-conformance.mjs：唯一人工trace suite，无真实探针自动执行。
- fixtures/phase1/mixed-runtime-readiness/process-acquisition/{cases.json,expected.json,README.md}。

Modify: scripts/test-mixed-runtime-readiness.mjs只导入离线suite一次；fixture.json增加inputs/expected引用；本包设计/计划/CURRENT_STATUS/统一计划与ADR-020/authority/acceptance/trace只同步实验边界。无生产接口/迁移变更。

## T1：独立语料与离线收据

**Consumes:** 设计§4/5、官方时序/所有权、原C2来源。
**Produces:** 一份人工expected/Fixture、唯一validator和最小测试。

- [ ] 人工冻结trace和预期出处，完整身份/seq/FILETIME/units/释放，不从collector产物生成golden。
- [ ] RED：缺模块；完整、缺CREATE/EXIT、PID复用/creation错配、早期读、无最终值、单位/0峰值、取消/注入、漏释放、伪批准/未知字段。
- [ ] 实现纯函数，复用已有有界JSON/数据校验；不建通用manifest/采集框架。
- [ ] node --test --test-concurrency=1 scripts/test-mixed-process-conformance.mjs；仅该文件。

## T2：Windows工具与拥有helper

**Consumes:** T1收据、原PeakWorkingSetSize布局/错误处理、现有工具。
**Produces:** 固定工具源码、语法/作者审查、获批时一次Prepare与实际freeze；不在Prepare启动Node。

- [ ] 先固定三模式helper输出/管道时序；Node --check不执行。
- [ ] 实现C#同线程CreateProcess/Wait/Continue、DEBUG_PROCESS、duplicate/系统句柄所有权、异常/清理；不增加任意executable/PID入口。
- [ ] PowerShell AST解析0error、两个新增mjs语法检查、作者审查x64 PInvoke/关闭路径；静态检查不是ABI证明。
- [ ] 仅获本包真实helper明确批准时，一次Prepare/Add-Type编译到拥有目录collector.dll；编译器准备成本单列。失败停，不装SDK、换编译器或重试。
- [ ] 冻结五个新源码、程序集、Node/PowerShell、env白名单、argv、控制出处与输出ownership；工具与设计§6不一致/缺SHA则不Collect；原始freeze不改写后重试。

## T3：三个固定case与集中收尾

**Consumes:** T2实际freeze、T1oracle与本包真实helper授权。
**Produces:** 所有attempts含失败/未执行，raw counter/Node close/OS退出/释放与一个结果索引；仅helper可行性结论。

批准后固定拥有根：
.superpowers/sdd/2026-10-29-phase1-process-acquisition-conformance/run/

固定工具argv：
1. C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
   -NoLogo -NoProfile -NonInteractive -File scripts/mixed-process-collector.ps1
   -Action Prepare -OutputRoot <上述拥有根>
2. 同一PowerShell -NoLogo -NoProfile -NonInteractive -File scripts/mixed-process-collector.ps1
   -Action Collect -NodeExecutable D:/Program Files/nodejs/node.exe
   -Mode SHORT_DESCENDANT -Freeze <拥有根/pre-execution-freeze.json> -OutputRoot <拥有根/G01>
3. 相同固定入口，-Mode CANCEL_DESCENDANT，输出G02。
4. 相同固定入口，-Mode FINAL_QUERY_FAILURE，输出G03。

根路径在freeze中展开为已指定C工作树下的绝对argv数组，不是任意caller路径；当前新源码/DLL不存在，因此这些尚不能执行。Prepare只编译；Collect不得重新Add-Type。启动无shell/隐藏窗口，沿用原helper寿命/输出限制，不能失败后扩大重做。

- [ ] 写attempt-start后运行G01：2Node（HOST+立即退出后代），无ready等待；同实例最终读/close/释放齐全才继续。
- [ ] G02：2Node，HOST收到固定取消指令后kill自己的子进程/await close；峰值仍INELIGIBLE。
- [ ] G03：1简单退出HOST，明确INJECTED最终读失败，null峰值；不得按旧PID/fallback值查询。
- [ ] 每case一次；任一非预期失败/工具变化/清理UNKNOWN停止余项，无重试/C2复用。
- [ ] 一次离线suite、fixture-manifest/registry两文件、node scripts/check-architecture.mjs、仅新/改文件格式；不跑A5/Stage/Store/Native完整批。真实探针不入默认root。
- [ ] 作者审查/实际计数/失败/未执行/全Native阻断矩阵同步，唯一results.json，保留源/编译/raw；不整仓seal或清历史。

## 追踪与出口

| 任务 | 设计/证据 | Gate | 独立性 |
| --- | --- | --- | --- |
| T1 | §4/5、C2原收据、Safety边界 | strict/identity/释放/不可批准人工trace | 可独立，不证明OS |
| T2 | §5、官方CREATE/Continue/Query | 静态/编译/作者审查，ABI需T3 | 离线源码可独立交付，平台仍未验证 |
| T3 | §6、新G01..03、实际freeze | G01短命、G02取消、G03读失败、注册/架构 | 依赖T1/T2和明确真实helper授权 |

仅离线→A6_OFFLINE_TOOL_ONLY；完整按预期→A6_NODE_DESCENDANT_CONFORMANCE_ONLY；平台失败→A6_PLATFORM_NOT_QUALIFIED。全部measurementEligible=false；不是完整A5 Native/profile/生产准入。

## 批准与回退

推荐一次批准本设计、T1–T3、本地修复/最小验证、一次Prepare、3Collect/最多5Node；不再微步骤确认。也可只批准离线工具/Fixture/测试，不编译、不执行任何探针。

均不含真实Git/Native/全A5、校准/profile数字、依赖、云端CI或Git写入。新真实Native包需调试适用性、全链purpose/accounting、实际工具/Source/初态/oracle/精确次数和命令，不预批未知项。失败停用工具并保留证据，可转B/C独立设计，不另铺平台框架。

## 实施记录与作者评审（2026-10-29）

[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-process-acquisition-conformance/results.json)保存所有准确命令/时间/退出/原始stdout/stderr/RED、实际freeze和源码/DLL快照。原计划勾选未机械改成全完成：平台正例失败，G02/G03缺失即未执行，不记PASS或N/A。

| 工作 | 实际结果 |
| --- | --- |
| T1 | 人工Fixture先冻结；missing-module RED15→GREEN15。停机后补原设计要求的imagePath独立字段与缺/空负例，diagnostic-red3FAIL→diagnostic-green17PASS |
| T2 | 固定PS1/C#/helper源、Node语法/PowerShell AST通过；唯一Prepare编译通过；x64 Security24/Startup104/StartupEx112/ProcessInfo24/DebugEvent176/Counters72。10文件/工具/env/argv实际freeze启动前完成 |
| T3 G01 | 一次Collect，tool进程exit0但reported INELIGIBLE/error UNEXPECTED_PROCESS，离线资格拒绝；不能把shell exit0写成试验通过 |
| T3 G02/G03 | 因G01失败未执行；没有重新编译、延长控制、重试或复用旧C2 |
| 本地验收 | 最新离线17/17；注册35/35、架构17、范围七文件格式通过。17不和旧15累计；A5/旧Stage/Store/Native批未重跑 |

原始G01有2份OS实例记录：根PID7872映像SHA匹配冻结Node；第二PID29084仅creation FILETIME/事件/释放，映像SHA为空。两者osExited/handleReleased=true，collector PID22016退出0，completeCleanup=true；这只是记录范围内清理证据，不是系统进程扫描或全机无残留断言。两份finalPeakBytes均null；collector peakAtReport/lifetimeComplete=false不作保留量。

源码控制流及原raw证明第二创建实例在映像校验处被拒绝；具体映像和平台根因仍UNKNOWN，不猜测为conhost/WER/权限问题，也不解释历史Native timeout。作者发现原实现没有计划要求的imagePath，路径比较抛出前未保存路径，这是诊断实现缺陷。

按原范围继续做**离线**修复：Entry新增imagePath，GetFinalPathNameByHandle结果在比较前保存；validator严格要求非空绝对映像路径；人工trace补该字段和两负例。没有更改准入/映像白名单/异常放行。原冻结8份仓库源/Fixture/DLL副本和10项freeze保留；当前4项源/语料与旧freeze不同，结果索引列明差异，不能将旧DLL视为含新修订。新C#字段/调用只做源码检查，**未重新编译或实测**；当前平台义务继续OPEN。

作者按Review Focus复查：实际created链、句柄继承列表、same-thread事件和original duplicate最终查询代码已存在；取消/失败后代实测缺失；初始异常/完整短命helper未通过；资格恒false。作者自审发现并修正诊断缺陷，不冒称独立评审或全实现验收。

下一步：若继续A6，应以已呈现诊断修订为基础重新准备一次有界构建/身份收据申请；旧批准的一次Prepare/G01已用完，未执行G02/G03不能自动转作新G01。不新增无依据猜测框架/预算，也不把未知进程加入白名单。完整A5资源/非debug适用性/purpose/profile仍NOT_READY。可先推进B/C独立详细设计；实际Git/Native/云端/Git写入仍须各自准确授权。

续接评审入口：[一次性身份诊断计划](2026-10-29-phase1-process-acquisition-identity-diagnostic.md)。仅计划已形成，尚未授权新编译或实际运行；旧失败和未执行状态不变。

## 身份诊断续接结果（2026-10-29）

用户已批准并执行[独立续接包](2026-10-29-phase1-process-acquisition-identity-diagnostic.md#实施结果与作者审查2026-10-29)：新 Prepare 一次成功，D01 一次返回 UNEXPECTED_PROCESS；本次第二实例路径为 C:/Windows/System32/conhost.exe，未取映像 SHA。当前 imagePath 修订现已编译并观测到；原 G01/DLL仍对应旧源码，不改写旧收据，也不推断其未知实例身份。两份本次记录均退出/句柄释放，collector退出0；无追加运行。原 G02/G03仍未执行，A6_PLATFORM_NOT_QUALIFIED 保持。
