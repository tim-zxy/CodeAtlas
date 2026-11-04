## 当前T1–T3执行结算 — 2026-10-31

T1身份/单入口完成；T2已运行固定主批但Spring资源失败，六份raw保留、五份重放接受及一份错误拒绝；T3十二义务审查/身份/格式/架构已记录。不标整体成功退出。主运行额度1/1，harness纠错0/1但本错误不适用，未启动第二次Cargo。旧输入与producer不改，当前test已手动only ignore，未来另行批准的重现需--ignored。见对应Source characterization review与原B唯一results.json。

## 首轮执行后安全收尾 — 2026-10-31

首轮按原命令实际运行1项并失败，六份raw均保存；Spring RESOURCE_LIMIT_EXCEEDED不是harness错误，未复验。作者审查发现新增手动Source测试不应被将来的默认cargo test隐式执行：首轮test/lib源另存并校验原冻结SHA后，新增ignore标记；以后明确获准的同filter运行还需传--ignored。本轮不重编译/重跑此变更，忽略的是新增人工characterization入口，未删除/跳过任何原必需门禁。

## 2026-10-31 已批准

用户明确批准本设计及T1–T3集中包，按原固定次数/边界顺序执行；下方PROPOSED保留为审批前原文。

# Framework Source Characterization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current chat, sequentially. User forbids new agents/worktrees/Git writes; those overrides persist.

**Goal:** 用一次受控旧wire7库级观察收敛四框架Source及发布阻塞的准确缺口。

**Architecture:** 复用现有Rust producer、JavaAnalyzer owner观察及Providers完整reader。一个cfg(test)模块、一个精确filter、六Source；记录与语义资格分开，不新增生产入口或通用采集平台。

**Tech Stack:** 仓库固定Rust1.98.1/现有锁定grammars，现有Node24/Providers dist；不新增依赖。

**Spec:** [Source充分性设计](../specs/2026-10-31-phase1-framework-source-characterization-design.md)。

## Global Constraints

状态PROPOSED；本计划的Rust代码/命令尚未执行。已准备的Source/审查义务属于原B允许的离线Fixture范围。原B§7不含Rust，须一次集中批准本包后再实施T1–T3。保留旧证据/失败；无新协议、产品行为、coverage政策、profile/数值、用户DB、Native CLI/helper/collector、云端CI、Git或代理。

## T1 — 单入口准备与身份冻结

- [ ] 只读确认固定工具链/锁定依赖均已安装；缺项即停，不自动网络安装。读取原r5身份/源码/报告，只复用，不运行旧17例。
- [ ] Create crates/native-analyzer/src/framework_source_characterization.rs，仅cfg(test)可达；Modify src/lib.rs追加cfg(test)模块注册。仅characterize_six_sources一个测试；产品函数、旧Source oracle和旧测试不变。
- [ ] 从原template构造六个单Source请求，更新实际根/路径/指纹；Java owners用既有JavaAnalyzer及原owner_map_digest。复用原既有cap；source太大/unsupported不改cap或隐藏。
- [ ] 校验源目录属于仓库并拒绝外部symlink，创建任务独占输出目录；文件create_new，request/output/异常分别保留。不能把失败写成空成功。
- [ ] 执行前保存六Source、四域义务、requestTemplate、两个test文件、Cargo.lock与工具链文件摘要，以及要调用的工具路径身份；不能只记录状态文字。工具链/新程序集身份在实际编译后补记，不提前伪造。

Done：输入清单、确切filter、独占目录和test-only变更可复查；尚不声称观察成功。不单独再问T2。

## T2 — 固定一次库运行及完整流重放

- [ ] 按Spec的cargo --locked --offline --lib --exact命令执行一个主运行。它包含正常编译及单个Rust库测试进程，不运行analyzer CLI/Source程序。
- [ ] 六Source顺序读取/观察，逐份保存完整request/output和terminal；不要求未知语义变COMPLETE。仅wire、身份或harness不正确视为观察执行失败；Source语义缺项记录为缺项。
- [ ] 如主运行因已定位的test-harness错误失败，可在同test-only范围修正并最多复验一次同filter；使用第二个新目录。producer/契约/cap/语义问题立即保留，不修产品或自动重试。
- [ ] 新任务证据目录内的最小inspect.mjs只重放六对原始字节，调用现有validateBindingAwareSyntaxObservationStreamWithBudget和原显式replay限额模式；不生成一套新通用runner或产品API，不启动进程/采集器。保留完整错误/coverage/输出身份。

Done：每份原始输入/流/Source摘要与实际程序集可对应；仅库级观察和wire校验，不冒称Java Canonical闭包、物理资格或生产激活。

## T3 — 一次义务审查与原范围续接

- [ ] 每域obligations逐条标Source依据、实际raw字段、规范化/绑定可用性及缺口；默认未评估，不从actual生成Source期望。Defaults/annotation不声称相同raw，typed初始化只在实际同site/owner证据后评估是否可用旧字段。
- [ ] 把缺项归到已有字段足够、确缺中立证据、固定PARTIAL发布含义、原验收/物理资格四类。前者可提交原B内必要修复，后面不得擅自发wire8/Syntax4/新数值或删门禁。
- [ ] 仅执行新测试的必要检查、受影响格式和原架构检查；无产品改变时不重建全TS、不重跑全库/旧完整回归。若没有生产行为修改，不为流程额外制造RED。
- [ ] 更新原B唯一results.json、CURRENT_STATUS/追踪/Source评审。原测试计数不相加；Fixture发现不等于Evaluation。

Done：后续最小DCP有实际证据，而不是猜测。父任务保持原4/21与17OPEN，除非所有原验收义务实际满足。

## 一次批准范围

批准T1–T3，包括test-only Rust模块、一次固定主命令以及最多一次已定位harness修正复验；普通Node重放/最小本地检查/文档统一执行。批准不包含producer修订、coverage改变、分数、校准/profile、Native CLI/helper/collector、DB、依赖、CI、Git写入或新代理。新运行审批依据为原B§7及用户保留的真实运行边界。
