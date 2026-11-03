# Spring同cap guard诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans，当前会话顺序执行。用户禁止自行新增代理/工作树/提交/清理证据；这些偏好覆盖技能默认行为。

**Goal:** 用原Spring请求/Source和原cap产生一个新、可定位失败guard的库级观察，不改变任何产品限额、coverage或错误协议。

**Architecture:** 在现有资源拒绝分支增加仅cfg(test)的stderr数值探针；已有手动观察模块新增默认ignored诊断入口，复用真实writer。保留原控制流与计费，不建立遥测框架或新diagnostic wire。

**Tech Stack:** 已锁定Rust1.98.1/Java grammar0.23.5、标准库、原serde_json/sha2与现有TS严格reader；无新依赖。

**Spec:** [原A/B收敛设计](../specs/2026-11-02-phase1-ab-convergence-design.md)。本文件是AB-1的准确诊断部分，PROPOSED / NOT_EXECUTED；不授权后续普通new/角色/coverage修订。

## Global Constraints

- 实施与运行须本包一次明确批准。预计一个离线cargo test命令，单个ignored库测试，单份Spring Source请求；没有CLI/helper/collector/独立Native进程或模型。
- 原request字节复制不重建：.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/framework-source-characterization/run-01/spring.request.jsonl。deadlineEpochMs=null，因此原maxDurationMs从新调用建立新的Instant deadline，不复用已过期Instant。
- 原cap精确保持maxDepth64、maxDurationMs1000、maxEvents10000、maxInputBytes65536、maxItems1000、maxMemoryBytes65536、maxOutputBytes65536。这是原请求身份复用，不是新profile或数值批准。
- 不修改Source、owners、requestId、ownerMapDigest、checksum、根路径或旧run01；实际十个owner与Source指纹仍按原生产路径核验，不另跑Java owner准备。
- 不运行其他Rust/旧Source oracle，不安装/下载，不改Syntax/wire/IR/history/SQL/业务逻辑。Source只读，输出只能写新的任务拥有目录。

## Review Focus

1. 探针改变计数/返回或wire输出：只在已成立拒绝分支输出常量guard名与现有数值，stdout保持原raw。
2. 仅修改scope掩盖原Spring失败：本包完全不改scope/unknown/coverage。
3. 未重现被说成修复：NOT_REPRODUCED明确停止，不提高预算或自动重跑。
4. 新guard被当旧run01确切根因：区分当前重现证据与历史UNKNOWN。
5. 手动测试被默认CI隐式执行：新入口必须ignore，普通测试不采Source。

## T1 — test-only探针与单入口

精确文件范围：
- crates/native-analyzer/src/java.rs：SymbolCollector::push超result_bytes guard（估算量按原定义，不称实际RSS）。
- crates/native-analyzer/src/java_syntax.rs：输入/零cap、Collector::tick、emit及metadata guard。
- crates/native-analyzer/src/binding_sufficiency.rs：tick_binding、push_observation、augment遍历/初始与最终汇总guard。
- crates/native-analyzer/src/code_syntax_producer.rs：Source读取错误边界、累计input/剩余items、Writer::emit的line/events/total bytes，保持原map_err/错误码。
- crates/native-analyzer/src/syntax.rs：depth拒绝分支记录at/max，便于区分writer envelope深度。
- crates/native-analyzer/src/framework_source_characterization.rs：新增#[ignore] diagnose_spring_resource_guards，不改已有six-source测试。

- [ ] 执行前保存这六文件与工具/锁/原请求/Source身份；只冻结实际输入，不做全仓hash。
- [ ] 在每个上述拒绝分支添加独立#[cfg(test)] stderr输出，固定前缀AB_GUARD与静态guard名，列出触发比较的全部维度current/limit；同一guard多维越界如实报告，不任选唯一维度。
- [ ] 不添加全局状态、环境开关、通用hook或release函数参数。Source读取错误只记录阶段/错误类别与已知allowance，不为取得数字新增Source读取；若内层数量不可见，明确UNKNOWN，不伪造。
- [ ] 新测试读取原request原字节，真实decode和writer，按原resourceBudget构造控制。新目录在原B证据根spring-resource-diagnostic/run-01，必须预先存在且为空；create_new写入复制request、raw、observation摘要，绝不覆盖。
- [ ] 观察允许COMPLETED或FAILED，以准确终端/错误记录诊断，不以“Spring成功”作为测试通过要求。新增测试默认ignored；原old27与旧six-source入口不动。

## T2 — 一次固定库级诊断与离线归因

- [ ] 先使用固定1.98.1 rustfmt，只格式化触及Rust文件。静态核对每个新增语句均为cfg(test)，原条件/累加/返回不改；保存可审查源码。
- [ ] 冻结Cargo/rustc/rustfmt、lock、实际源码和原输入；缺工具/离线缓存/身份不符即停，不自动安装。
- [ ] 原B拥有新目录，显式设置CODEATLAS_FRAMEWORK_SOURCE_OUTPUT；清除旧CODEATLAS_BINDING_SUFFICIENCY_OUTPUT，避免旧oracle写入。测试需严格验证新目录归属，不接受旧run-01目录。
- [ ] 唯一主命令（直接调用已核对的1.98.1 cargo二进制，RUSTC同工具链，CARGO_NET_OFFLINE=true）：

    cargo test --locked --offline -p codeatlas-native-analyzer --lib framework_source_characterization::diagnose_spring_resource_guards -- --exact --ignored --nocapture --test-threads=1

- [ ] 保存完整stdout/stderr、准确exit、时间、程序集哈希、raw/request/Source身份。编译是该命令一部分，不另运行Native CLI或全部库测试。
- [ ] Node离线检查AB_GUARD和新raw；有RESOURCE错误且guard明确才记录当前拒绝维度。没有guard/未重现/其他异常都保存并停止，不推测或自动追加运行。
- [ ] 使用原已构建wire7严格reader重放新raw；失败按真实错误记录，reader拒绝是诊断结果，不是产品成功。原run01及其失败保持。

允许最多一次仅针对已明确的测试准备错误的同filter纠错复验；不能用于producer/cap/未重现。为避免再次零碎询问，批准本包即涵盖这一条件额度及必要本地修正；非harness失败不具资格，不自动重试到绿。

## T3 — 收尾与后续契约输入

- [ ] 对最终触及文件执行rustfmt --check，运行原node scripts/check-architecture.mjs。无TS/SQL变更，不全仓构建或重跑163/52旧范围。
- [ ] 对照执行前源码确认非cfg(test)逻辑没有修改；对原Source/request/raw和锁验证不变。探针格式可静态审查，不为日志包装新增镜像测试。
- [ ] 原B单一results/progress追加诊断记录，CURRENT_STATUS采用已读内容的局部补丁并先保存旧字节，若审批仍拒绝则保留独立结果，不覆盖状态；原失败完整保留。
- [ ] 作者审查，不新增代理。将当前guard证据、普通new第三处UNKNOWN覆盖、角色/关系与发布义务归入后续统一合同，不能在本包直接修产品。

## 退出与停止

退出是“固定范围诊断记录完成”，不是Spring修复、Rust全回归通过、profile准入或Phase1验收。若无法定位则退出为DIAGNOSIS_INCONCLUSIVE并保留缺口，不重复采集。无CLI/helper/collector/实际Git/模型/DB、校准/profile、新数值/依赖、CI或Git写入。父项4/21与17OPEN不因诊断结果自动改变。


## 已批准执行结果 — 2026-11-02

用户明确批准后T1/T2/T3完成（诊断范围），上方未勾选/NOT_EXECUTED为执行前清单。状态GUARD_IDENTIFIED：tick_binding下一共享项1001超过1000，Spring仍失败，1诊断测试pass/28filtered。准确命令与[作者审查](../reviews/2026-11-02-phase1-spring-resource-diagnostic-review.md)记录同request/raw、未改逻辑证明、格式/架构和限制。main1/1，harness纠错0且当前失败不具资格；无第二次Rust运行。原错误/旧UNKNOWN保留，不授权后续产品修复。
