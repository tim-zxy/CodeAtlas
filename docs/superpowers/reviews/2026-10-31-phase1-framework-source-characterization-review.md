# Framework Source characterization — actual attempt and bounded review

2026-10-31。状态：RUN_ATTEMPT_FAILED / SPRING_CAP_HOLD。用户批准的T1–T3已按边界推进；不声明本包成功退出、Phase1验收或生产资格。

## 执行与证据

[唯一B索引](../../../.superpowers/sdd/2026-10-31-phase1-b-remaining-execution/results.json)。固定1.98.1 cargo/rustc路径与SHA、锁定直接依赖缓存、六Source/四义务文件/template/Cargo.lock/test源码在执行前记录。新目录run-01，未复用旧r1..r5或R4。

准确命令仍是批准的cargo test --locked --offline -p codeatlas-native-analyzer --lib framework_source_characterization::characterize_six_sources -- --exact --test-threads=1。编译成功，实际1项测试0pass/1fail，27项旧测试filtered out，不能记为旧测试通过。唯一测试进程实际按固定顺序观察六Source，每份保存request/output/observation摘要；Spring失败在最后，所以六份均留存。源码/工具及测试exe哈希见framework-source-run01-inputs.json、framework-source-run01.run.json与framework-source-final-proof.json。

| Source case | Rust终端 | Syntax outcome / reader结果 |
| --- | --- | --- |
| depends-default | OBSERVATION_COMPLETED | COMPLETE；严格reader接受 |
| depends-annotation | OBSERVATION_COMPLETED | PARTIAL / INCOMPLETE_BINDING_ENUMERATION；reader接受 |
| fastapi-routes | OBSERVATION_COMPLETED | COMPLETE；reader接受 |
| kafka | OBSERVATION_COMPLETED | PARTIAL / INCOMPLETE_BINDING_ENUMERATION；reader接受 |
| mongo | OBSERVATION_COMPLETED | PARTIAL / INCOMPLETE_BINDING_ENUMERATION；reader接受 |
| spring | OBSERVATION_FAILED | RESOURCE_LIMIT_EXCEEDED，retryable=false；reader按原错误拒绝 |

Spring只产生STARTED+FAILED，没有语法记录。当前终端不区分具体限额；不能声称maxItems、memory或timeout根因已定位。writer没有I/O错误，这不是harness错误，不适用一次harness纠错复验。主额度已用，纠错额度未用且本错误不具资格；不自动重跑、不修改Source/cap去转绿。历史Native timeout根因仍是另一项UNKNOWN。

## Source充分性发现

- Depends两份raw不相同：默认参数是COMPLETE，注解是PARTIAL，位置/owner ID也不同。两份Depends INVOCATION的payload都只有callee/arguments/receiver，没有明确的parameter/default/annotation角色。coverage不能当角色证据。
- FastAPI routes实际输出有constructor、decorator、include_router和静态prefix；现有字段值得先复用。本包未执行完整Canonical normalizer/Plugin/Store链，不能把raw COMPLETE升级成语义发布。
- Kafka的TYPED_BINDING(template)与DIRECT_VALUE assignment在零基range[7,38..77]、owner和lexicalScope完全一致。这为同site对应提供现成字段，不能再一概声称缺这种信息；但declaredType是带泛型的字符串，现有type import路径仍需审查。root scope标UNSUPPORTED_BINDING_SCOPE:object_creation_expression，所有scope PARTIAL；旧字段的局部折叠不能单独解决整体准入。
- Mongo确有findOne/save及静态events参数；watch、forEach、handle均出现，但forEach receiver和lambda参数为UNKNOWN，handle的lexicalScope=null/controlContext=UNKNOWN，scope带UNSUPPORTED_BINDING_SCOPE:lambda_expression。没有可证明的返回对象→订阅→handler关联。
- Spring route/job/Feign/注入四项没有本次观察证据，保持NOT_EVALUABLE。不能拿声明Fixture补作实际Source证明。

十二条Source审查义务逐项记录于framework-source-characterization/obligation-review.json；semanticGate全部NOT_EVALUABLE。这是按Source字段充分性作作者审查，不是原E03..E06的完整critical inventory或新计分基线。

## 最小后续范围

1. 先区分无需新wire的已有字段问题：typed同site、泛型类型名消费、普通object creation的scope分类；若涉及producer修订须另形成集中修订/运行包，本包不改。
2. 需要中立角色/结果关联的Depends与Mongo，以及固定PARTIAL如何正确表示覆盖/发布资格，集中出准确DCP；不自动上wire8/Syntax4、不删限制或提高分数。
3. Spring先定位/区分触发限额，或审阅拆成更小Source的具体方案；这不是自动扩大已批准cap的许可。
4. A6/profile、真实生产Source重验证和原E03..E06/critical/性能门禁继续独立保持。

## 收尾验证与限制

只新增cfg(test)模块和lib.rs注册，其余旧Rust源码/旧测试及原TS产品、Source/template/锁文件摘要匹配。没有产品函数修改、新依赖/协议/数值或DB操作。新手动观察测试最后标记ignore，防止未来默认cargo test/CI隐式启动Source观察；原27项测试未改，未删除必需门禁。首轮实际test/lib源已封存并匹配执行前SHA。ignore是执行后test-only安全修正，当前文件不冒称已重新编译；未来另获批准的同filter需额外--ignored。本轮没有第二次Cargo执行。

两个test-only文件格式检查exit0，架构17项目exit0；inspect.mjs只重放已保存流，没有新采集。脚本正常结束不等于六Source资格通过。无全TS构建、旧完整回归、Native CLI/helper/collector/模型、云端CI、Git写入或新代理。本报告为作者审查；父任务4/21与17OPEN不变。
