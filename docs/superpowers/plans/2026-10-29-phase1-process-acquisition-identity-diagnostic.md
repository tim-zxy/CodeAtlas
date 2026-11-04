# A6 映像身份诊断续接计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。本会话顺序实施，不创建代理、会话或工作树。

**Goal:** 用已修正的 imagePath 记录完成一次有界平台诊断，确认新创建实例的实际映像；不以诊断代替 A6 完整资格。
**Architecture:** 复用现有 C#/PowerShell/Node 工具，只为新批准的固定诊断根增加批次选择。旧源码、DLL、freeze、G01 失败及 G02/G03 未执行状态保持原位。
**Tech Stack:** 既有 Windows PowerShell、C# Add-Type、Node.js；无新依赖。
**Spec:** [A6 设计](../specs/2026-10-29-phase1-process-acquisition-conformance-design.md)及[原实施记录](2026-10-29-phase1-process-acquisition-conformance.md#实施记录与作者评审2026-10-29)。
**Status:** 用户已批准并执行；诊断交付，A6 平台资格仍未通过。下方计划中的未授权说明是批准前快照，由本状态与实施记录替代。

## 已核验证据与假设

原 results.json 记录一次 Prepare 成功、一次 G01 资格失败；两份 OS 实例均已记录退出及句柄释放。第二实例准确映像 UNKNOWN，不能猜测为某个系统组件，也不能关联历史 Native timeout。当前 C# 在映像比较前保存 imagePath，离线 17/17 通过，但没有对应新 DLL 或平台收据。

本包只检验一个假设：保留比较前的实际映像路径，可以弥补原失败中的身份诊断缺口。它不假设该映像安全、不预测正例能通过，也不改变只接受冻结 Node 映像的规则。

## 固定范围与次数

工作树仍为 C:/Users/Freya/.codex/worktrees/e4fb/CodeAtlas；D:/workspace/CodeAtlas 不覆盖。
新证据根仅为：
.superpowers/sdd/2026-10-29-phase1-process-acquisition-identity-diagnostic/
其中 run/collector.dll、run/pre-execution-freeze.json、run/D01/ 为新拥有对象。

只允许一次 Prepare 编译，成功并冻结身份后一次 Collect（SHORT_DESCENDANT）；预期为一个 HOST Node 和一个立即退出的 Node child，最多两个预期 Node 生命周期。系统产生的非预期实例仍按原严格规则拒绝并记录，绝不因新路径已知而放行。沿用 10000ms helper、1000000 bytes 输出及 30000ms 外层限制，不增加数值。Prepare 失败则无 Collect；任何失败后不重编译、不重试。D01 即使成功也结束本批，不自动执行旧 G02/G03 或新增取消/注入探针。

不含实际 Git/Native、额外 helper/collector 方法、生产路由、profile/校准、新数值/依赖、云端 CI、Git 写入或新增代理。

## 文件与接口

| 文件 | 最小变化 |
| --- | --- |
| scripts/mixed-process-collector.ps1 | 新增固定 Batch 参数，ValidateSet 为 Original、IdentityDiagnostic，默认 Original；Original 保留原根与 G01..03；IdentityDiagnostic 仅上述新根及 SHORT_DESCENDANT→D01，拒绝其他模式 |
| scripts/mixed-process-collector.cs | 使用已存在的 imagePath 离线修订；不改白名单、debug 事件、句柄/清理或预算 |
| 新证据根/platform.cjs | 复用原一次性编排方式，只有 prepare、collect 两入口，CreateNew 收据，不修改或调用旧 platform.cjs |
| 新证据根/results.json | 唯一新结果入口：准确命令/时间/身份/raw/退出/清理/资格及未完成项 |
| CURRENT_STATUS.md、原 A6 计划、本计划 | 简短结果与链接；不复制十份历史正文 |

现有 validator、17 例人工 Fixture、注册及产品源码不预定修改。若新失败需要超出 imagePath 诊断或固定批次选择的契约修订，停止相关实现并呈现证据，不在实际运行中试改。

## 合并执行任务

### D1：固定新批次入口、一次构建和一次探针

**Consumes:** 当前诊断源码、原 freeze 文件清单/环境约束、原平台与离线失败证据，以及本包明确批准。
**Produces:** 新根独立 DLL/freeze/D01 原始收据；不会产生 A6 全资格或生产资源数值。

- [x] 先用 PowerShell AST 读取参数元数据（不调用脚本入口），证明当前缺少 Batch 参数；记录预期 RED。只实现上表固定参数/根选择，AST 验证 ValidateSet/默认值及显式拒绝其他诊断模式，记录 GREEN。路径/模式静态检查不启动 collector。
- [x] 作者检查 Original 分支保留原路径、marker、freeze/hash、模式和清理；新分支只替换固定拥有根与 caseId，不新增任意目录选项。
- [x] 运行一次现有离线验证：Node --test scripts/test-mixed-process-conformance.mjs，预期 17 PASS；若仅结果文档变化不再运行。对变动 JS 做 Node 语法检查，PS 做 AST 错误检查。无 packages/注册/import 变化，复用原 A6 registry35/35、architecture17，不重跑 A5/Stage/Store/Native。
- [x] 启动前写新 prepare-start，运行一次 Prepare；失败保留原始输出并结束。成功后记录实际 DLL SHA256 与六项 ABI 布局，不在编译前宣称 DLL 身份已知。
- [x] Freeze 沿用既有十项源/Fixture/DLL/Node/PowerShell身份及环境白名单、准确 argv；新 platform.cjs 自身 hash 记在同一 results.json。任一文件变化或缺项拒绝 Collect，不回退旧 DLL。
- [x] 写 D01 attempt-start 后一次 Collect；完整保留 stdout/stderr/外层退出与验证错误。先保存 raw，再做严格资格校验，保证拒绝结果仍保留实际 imagePath。未知路径不能通过离线正例校验是预期的安全行为，不修改 oracle 去接受它。
- [x] 确认记录范围内各实例的退出/句柄释放及 collector 退出；清理 UNKNOWN 如实报告，不扫描旧 PID、不复用旧句柄。实际输出可能含本机映像路径，只保存在本地证据。
- [x] 集中作者审查和文档同步。批准范围内离线修复统一处理，但 freeze 后任何工具变化都结束当前实际批次，不重新构建或再次 Collect。

准确命令（所有路径执行前展开为上述工作树下绝对路径）：

    C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
      -NoLogo -NoProfile -NonInteractive
      -File scripts/mixed-process-collector.ps1
      -Batch IdentityDiagnostic -Action Prepare
      -OutputRoot <新证据根/run>

    C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
      -NoLogo -NoProfile -NonInteractive
      -File scripts/mixed-process-collector.ps1
      -Batch IdentityDiagnostic -Action Collect -Mode SHORT_DESCENDANT
      -NodeExecutable "D:/Program Files/nodejs/node.exe"
      -Freeze <新证据根/run/pre-execution-freeze.json>
      -OutputRoot <新证据根/run/D01>

以 Node spawnSync(shell:false, windowsHide:true) 执行；沿用原环境白名单和原外层控制。外层编排 Node 不属于被测 debug 链，不记录为目标资源证据。

## Review Focus、追踪与出口

| 风险 / 依据 | 验证与判定 |
| --- | --- |
| 误用已花费旧 slot / 原 A6 一次性约束 | 新固定根、独立 CreateNew markers；不触碰原 root |
| 诊断遗漏 / 原 G01 raw、imagePath 修订 | 编译当前源码并保留比较前路径；若仍无路径，明确记录诊断缺口 |
| 把未知程序纳入白名单 / A6 identity 契约 | 白名单不变，UNEXPECTED_PROCESS 仍拒绝 |
| 把 exit0 当通过 / 原 G01 外层与内层差异 | 分列 tool exit、严格 validator、清理；任一不足不声称资格通过 |
| 把单探针迁为 profile/完整资格 / A6 §6 | measurementEligible 恒 false，取消/注入/完整物理用途继续 OPEN |

作者自审：本包只填原计划已要求的身份诊断缺口，并新增固定运行根以保护旧证据；不修改 FROZEN 产品契约，不增 ADR/迁移/Fixture ID/全局计数。唯一新增真实授权为一次新编译与一次 D01；不能从此前“继续”推导为失败重试批准。

完成条件是准确交付本次诊断证据与结论，不要求试验变绿。D01 完整正例只能记单一 SHORT_DESCENDANT 结果；未知映像、异常或清理缺口仍是失败。两种结果均不关闭 A6、P1-04/05 或 Phase1。若得到新身份，可据实际证据决定修订或放弃该方法；不自动追加试验。后续 B/C 独立设计仍可顺序推进。

## 实施结果与作者审查（2026-10-29）

[唯一结果索引](../../../.superpowers/sdd/2026-10-29-phase1-process-acquisition-identity-diagnostic/results.json)：一次 Prepare 编译成功，六项 x64 ABI 布局通过；当前 imagePath 修订已进入新 DLL。一次 D01 于 12:40:37–39 UTC 执行，collector exit0，但 INELIGIBLE / UNEXPECTED_PROCESS，strict validator 拒绝。无重编译、重试或旧 G02/G03。

第二 OS 实例实际记录路径为 C:/Windows/System32/conhost.exe；在预期 Node 路径比较处被拒绝，未采集该映像 SHA，不能由路径推导可信二进制身份。根 Node 的 SHA 匹配冻结工具。两份已记录实例均退出、duplicate 已释放，collector 退出；两份目标 finalPeakBytes 仍 null。不能反向认定原 G01 的未知实例也是该程序，不能据此解释历史 Native timeout。

固定入口 AST RED→GREEN，离线 17/17，编排语法通过；除批准的三段参数/根/case 增补外，旧 wrapper 可精确恢复。十项 freeze 与编排 hash 运行后匹配，八份原批次源/DLL快照匹配旧 freeze。未改产品、Fixture、注册或 import，注册35/35和架构17按原 A6 身份适用性复用，不重跑 A5/Stage/Store/Native。作者审查，无新增独立评审。

本包按有界诊断完成；A6 短命正例、取消/最终查询失败实测、完整物理用途与非debug适用性仍 OPEN，父任务4/21不变。下一步不追加实际运行；如继续该方法，应先基于本次准确路径审查创建/采集边界，而不是自动放行 conhost 或扩大实例数。也可推进独立 B/C 设计。
