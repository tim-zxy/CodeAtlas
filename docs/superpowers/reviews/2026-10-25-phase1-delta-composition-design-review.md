# Phase1 B1-B2 增量完整候选：作者设计评审

日期：2026-10-25。类型：AUTHOR DESIGN / BUILDER SELF-CHECK，沿用本会话顺序，无独立reviewer或产品实现。

[被审设计](../specs/2026-10-25-phase1-delta-composition-design.md)；[B1-B1实施基线](2026-10-24-phase1-history-transition-implementation-review.md)。

结论：**可提交推荐书面方向审阅，尚未接受；尚无具体实施计划或编码授权。** 第一实施包是声明完整Code/support候选，完整B1-B2的raw bridge及B1-C/D仍OPEN。启动2080/2080哈希匹配，前662测试/架构17是历史证据，本轮不重跑。

## 实码与构建者视角核验

| 检查           | 设计处理                                                                                                                | 仍缺的资格                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 把草案变成实物 | RETAIN原support加唯一新Native observation经collectMergeSupports构造的fresh支持；对照草案逐项核Evidence/refs/coverage    | 这只认证数据自洽，不认证历史来源                                                  |
| 多历史origin   | 不将历史包装进新MergeInput；保留原candidate/Evidence/snapshot/times，独立registry不叫本次observations                   | 真实Storage历史、origin scope/请求/结算由C/raw合同提供                            |
| 选择器复用     | selectMergedFacts/min confidence/tie-break及MCA形状不复制，旧public路径不改                                             | 不能单用selected edges闭包推定所有R009 candidate有效                              |
| 全候选引用     | 对每份active原candidate检查target Source/dependency和node/source/resolved/UNRESOLVED candidates；退役旧记录与active分开 | 独立“未胜出候选悬空”负例必须先冻结；不是本轮发现已发生的产品故障                  |
| shared预算     | 旧入口不暴露spent计数，另起预算/只计返回draft会漏账；拟内部self-validating入口一次owned prepare并携带同一budget         | 具体重构需旧字段/error/digest/临界值兼容证据，不能把重构视作已批准                |
| 单位与coverage | Python单位身份保持，Java整组成员演化，zero-fact也逐facet完整；foreign变化/未知整体拒绝                                  | 原性能门禁仍需真实Evaluation，未执行不记通过                                      |
| 新basis/Syntax | 输出targetSource和最终basis重验义务，不给旧basis改名或输出新Canonical SyntaxEvidence                                    | C最终owner/basis/valueDigest projection未设计完                                   |
| Raw桥接        | 全仓与观察scope分离；PARSED_V2不伪造raw hash，v5实际bytes与normalized严格绑定                                           | C provisional owner/stage、成功/完整/未取消/未late settlement与真实Source还需联审 |
| 无循环接入     | C提供前置捕获/受控provisional身份；B1-B2输出完整Code候选；C/D完成final basis上的Syntax与CAS                             | 第一纯包不先要求D已Apply，也不声称C捕获已存在                                     |
| 错误/安全      | fixed code、无payload回显、owned/frozen、跨阶段累计、无自动全量或半图                                                   | 新private code/schema/精确命令在writing-plans固定，不修改wire/IR错误枚举          |

## 作者选择与代价

1. 先完成normalized声明→完整候选。理由：raw观察仍缺C的真实历史/owner/stage合同，不能把它们当现成输入。代价：该包完成后仍不能称真实changed-only流水线ready，raw bridge不可跳过。
2. 保留现有B1-B1 public接口，增加一个自行校验unknown的私有组合出口共享预算。理由：避免阶段重置和重复prepare，又不接受caller trusted对象。代价：必须修改一处既有私有实现，并用原95字节/46案例及边界证明兼容。
3. 全部原candidate闭包比只检查winner更严格。理由：原支持会继续成为活动候选，不能隐藏失效引用。代价：旧声明若有隐藏悬空候选可能被拒绝；保留last-good，不能通过删支持或清空candidates“修复”。
4. origin registry明确与新observations/当前活动支持集合分开，旧条目不改标。代价：输出可能保留未使用的历史snapshot元数据，必须预算，不能声称这些条目都ACTIVE或新采集。
5. 本轮只更新提案入口，不把所有控制规范标成已接受；接受后再同步ADR-020相关Provider/Canonical/Evaluation/Security/追踪等。代价：当前还不能直接执行实现。

这些选择是作者推荐，尚未作为用户决定记录。没有新依赖、资源值、默认预算、SQL/R011物理表或公共Core模型。

## 评审覆盖与未闭合事项

D01..D12覆盖no-op/空仓/纯删除、Python/Java/混合scope、原candidate/winner、foreign正反例、Source/单位/coverage、草案实物、所有活动候选闭包、merge冲突/不确定性、安全与累计budget、旧接口/架构/注册。每项对应设计任务图和future本地验收；Fixture尚未创建、没有通过计数。

从构建者视角，第一包的输入/处理/输出/边界能支持下一轮writing-plans。精确函数名、DTO字段/错误枚举、独立literal语料、兼容refactor步骤、root注册和命令仍应在计划固定，再整包确认，不能把本设计当执行计划。

尚未闭合：真实历史链/Source捕获、Raw delta/normalized绑定与实际settlement、provisional stage身份、最终Syntax owner/basis/valueDigest、R011/Store/锁内CAS/恢复/读者、原Native资源与性能资格。无独立review/全量集成/CI。它们不是第一纯包免除的门禁。

在本书面范围内未发现未分类的Critical/Important设计冲突；后续若必须更改FROZEN Core/wire/Source CAS、绕过Evidence/ownership或降低门槛，停止受影响工作并提DCP。

## 本轮证据

前序2080哈希核验、三份原状态文档保存、产品/原563 Fixture字节不变、文档格式/链接/差异和最终回执见 .superpowers/design/2026-10-25-phase1-delta-composition/design-verification.json。只有文档及作者核验，无product/Fixture/registration/build/test/DB/Rust/Native/helper/profile/number/dependency/cloud/stage/commit/cleanup。

C1真实文件symlink EPERM OPEN，四C2生命周期已用完，Native timeout UNKNOWN，main39708335128取消结算未查，mutable R4未碰。B1-B2/C/D、P1-04/05/Phase1全部保持OPEN。
