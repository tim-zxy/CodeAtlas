# Spring同cap诊断 — 实际结果与作者审查

2026-11-02；SPRING_DIAGNOSTIC_GUARD_IDENTIFIED。用户已批准T1–T3与一次固定库级诊断，主额度1/1，harness纠错0次；当前失败不是harness错误，不追加复验。

## 实际结论

新运行明确触发binding_sufficiency.rs::tick_binding中的共享accounted_items上限：next=1001、max_items=1000，在items.set(next)之前拒绝。它记录的是共享账本下一项，不是证明此helper被调用1001次，也不是已花费1001项。函数既被scope/control祖先遍历使用，也被其他枚举路径使用；具体调用点未识别，不能把探针标签binding.ancestor_tick当成唯一祖先路径证明。

Spring仍输出OBSERVATION_FAILED / RESOURCE_LIMIT_EXCEEDED / retryable=false。原maxItems及所有其他cap不变，没有修复、提高限额或减少记账。guard只是当前请求在测试构建中的拒绝位置，不证明产品计费错误或应提高预算。

新request SHA=cdeec15871d68d771495f69bfd51e12504444a4936fc45145484fc25e1d0bc9e，与原request字节一致；新raw SHA=9f750736573f73c155fd34d681f649b894dce32499dd7710a6855cddfc8de72c，与原run01字节一致。Source848字节、十个原owner、Source指纹/根不变，deadlineEpochMs=null、maxDurationMs沿原1000；新调用建立新Instant deadline，无额外owner预分析。原请求读入计5600字节，Source读取allowance按原表达式为59936，当前未触发此拒绝。

这些是同输入/同cap和未改产品逻辑的强佐证，但旧run01没有guard记录，其历史精确维度仍保持UNKNOWN；原Native timeout是另一项UNKNOWN，不叫已修复或flaky。

## 执行与验证

准确命令/环境/开始结束/exe哈希位于[唯一B索引](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)的springResourceDiagnostic及其run01.run.json。只执行：

    cargo test --locked --offline -p codeatlas-native-analyzer --lib framework_source_characterization::diagnose_spring_resource_guards -- --exact --ignored --nocapture --test-threads=1

直接固定1.98.1 cargo/rustc，编译成功；1个诊断测试pass，0fail，28 filtered out，不能把28项计为通过。测试pass表示观察/终端成功留存，不是Spring解析成功。链接器有一条创建lib/exp的warning，命令exit0；未运行Clippy/全库或额外Source观察。

新源码仅在java.rs、java_syntax.rs、binding_sufficiency.rs、code_syntax_producer.rs、syntax.rs增加19个cfg(test)数值探针；framework_source_characterization.rs仅追加默认ignored的诊断函数。五模块移除新增cfg(test)探针并规范化格式后与执行前正文一致；原six-source函数保持。无新global状态/hook/依赖/release字段，stderr只记录guard常量/数值，stdout仍原wire。

首次差异核验脚本未识别rustfmt在checked_sub前的换行，出现一个false；修正只读匹配后六文件核对成功，未修改源码、未花费Rust运行额度。原核验记录保留在pre-run-source-proof.json，修正证据在pre-run-source-proof-corrected.json，不能称它是产品测试RED。

Node用原已构建wire7严格reader重放新raw，仍拒绝RESOURCE_LIMIT_EXCEEDED；主机离线重放沿旧inspect预算，并非新的生产profile。范围rustfmt --check exit0，架构17项目exit0。六文件执行后摘要不变，原Source/request/lock/reader及18个旧raw、四个Node绑定产品/向量摘要匹配；没有重跑163或52项历史测试。

## 作者审查与有限退出

逐项核对Review Focus：探针只在测试构建、原条件/累加/返回保留；无scope/UNKNOWN/coverage修订；默认ignored阻止普通测试隐式采集；只用新owned run-01/create_new；未覆盖旧raw；未重现/异常不自动重跑。结果识别当前guard，故诊断包退出为GUARD_IDENTIFIED，不是DIAGNOSIS_INCONCLUSIVE。

本次为作者审查，依用户禁止新增代理约束不做第二代理评审，不宣称独立分支review。诊断不是产品行为改动，不人为补日志镜像测试或伪造RED/GREEN。首轮资源失败原样保留，未使用条件纠错额度。

## 对A/B后续统一契约的影响

1. 普通构造有三处关联：Java lexical_scope、augment统一限制，以及unknown(DYNAMIC_EXPRESSION)设置文件PARTIAL。锁定grammar将匿名class_body表示为named child，不是body字段。只删scope限制仍不充分。
2. 当前共享记账拒绝应作为预算适用性/工作量证据；不能静默取消祖先计费、调高cap或将失败Source改小后记成修复。具体重构或新值仍须准确合同与证据。
3. Depends角色、Mongo result/订阅/handler关联、框架候选的完整覆盖/发布义务继续在同一A/B合同包细化，不按字段拆审批；未完成精确合同的工作不因诊断批准得到实施许可。

原P1-04..09、A6/profile/真实生产进程资格、E03..E06/critical/性能及Phase1仍OPEN；父项4/21、17OPEN。无Native CLI/helper/collector/模型/DB、CI/Git写入、新数值/依赖。生产resource资格不能从本次Rust lib测试推导。
