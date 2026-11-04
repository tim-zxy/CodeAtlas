## 实际首轮与后续重现边界 — 2026-10-31

一次原命令已执行：1测试失败，六对raw保留；2 COMPLETE/3 PARTIAL/1资源失败。失败不是harness错误，未自动复验或放大cap。首轮编译用test源码已单独封存；当前新增test标记ignore以禁止未来默认测试隐式观察Source。未来再获批准的同filter命令需额外--ignored；原运行记录与命令不改写。

## 2026-10-31 已批准集中观察包

用户批准固定test-only库观察与必要harness修正一次，未授权产品coverage/新协议/producer修订或物理资格。下方待批准文字为历史。

# Phase1 框架 Source 充分性与发布阻塞核验

状态：PROPOSED_RUN_PACKAGE；现有批准B包内的Source文本/审查义务已准备。本提案不修改产品、coverage、协议、身份或置信策略；下面的Rust测试入口与真实库运行尚未获授权/尚未实施。

## 当前事实与治理依据

原统一B设计§7明确不含Rust/Native/helper真实运行。AGENTS及IMPLEMENTATION_PROTOCOL要求实际实现和Fixture/Evaluation证据一致，不能降低门禁。用户要求最小验证、合并执行及保留真正新范围审批。因此只集中批准下述一份test-only库级观察包，不拆微步骤，不提前批准新的wire/Syntax或生产发布规则。

B5已有当前SQLite→V4 Context、固定四factory→Graph/Flow、冻结仓库→matcher/stitch→授权Store的局部组合证据；唯一B账本最新52/52影响范围通过。它们不是一条真实四框架Source到Canonical发布的鉴证。

实码核验发现：framework-runtime-candidate.ts固定status=PARTIAL并添加DOMAIN_RECORDS_ONLY；framework-entry-candidate.ts改为DECLARATION_ENTRIES_ONLY且继承PARTIAL；Application/Store正确拒绝PARTIAL。故仅收集更多Source或接上Store不可能自行完成发布。本包保持这一边界，先获得能支撑后续治理的准确证据；不能删除标记、手写COMPLETE或另造ready布尔值让产品通过。

## 方案选择与推荐

推荐：先按当前wire7/Syntax3做一次有界Source观察，复用现有producer/完整reader，明确每项义务到底缺producer字段、字段对应关系、绑定规则还是资格证据，再提出最小契约修订。旧17例r5原始产物只在其原范围复用，不重采；不把它们升级成四框架Source鉴证。

备选：直接设计覆盖全部缺口的新协议/IR版本。当前typed初始化可能已有足够same-site信息，先定新字段容易重复已有能力，缺少EVOLVABLE证据，暂不采用。即使批准本包，也不自动批准任何新版本。

## 已冻结的Source与独立审查义务

使用原四Fixture ID，不新增root/ID；四个新Source文件与每域obligations.json是未执行审查输入。旧inputs.json/expected.json、原criticalFacts/qualityGates不变。

| Source | 独立语义义务 | 当前必须保留的不确定性 |
| --- | --- | --- |
| spring/source-adequacy/SpringSource.java | class/method route、Scheduled、静态Feign、构造注入声明 | 不能凭注解短名/参数名证明归属或依赖；声明不证明bean部署 |
| mongo/source-adequacy/MongoSource.java | 真实类型接收者的静态collection读写，watch→结果→订阅→handler | 普通write不是change trigger；fluent返回对象不能按名称猜 |
| kafka/source-adequacy/KafkaSource.java | typed初始化同site对应、发送和listener不同owner | topic不证明namespace/schema，不能折叠两个不同定义 |
| fastapi/source-adequacy/routes.py | app/router/include prefix组合、默认Depends角色 | invocation不是默认参数角色证明 |
| fastapi/source-adequacy/depends-default.py | 既有默认参数对照 | 原字节保留，尚未观察 |
| fastapi/source-adequacy/depends-annotation.py | 既有注解表达式对照 | 不自动当作默认参数依赖，也不声称二者raw相同 |

这些Source是解析语料，不执行Java/Python、不安装框架。obligations不是完整原critical inventory、不是预测raw golden、更不是新分母/阈值。每项观察结果可以缺信息；正确报告NOT_EVALUABLE不能被误写为PASS。

## 固定运行与停止边界

只新增一个cfg(test) Rust模块及一个同名测试，在一个库测试进程中顺序观察六个Source。通过现有decode_binding_sufficiency_request/write_binding_sufficiency_observation；Java owner仍来自现有JavaAnalyzer实际symbols，不手工补owner或用最近函数猜。Java测试用provider→code映射仅与原Source oracle模式同等的request控制，不代表经最终Canonical normalizer/Store证明。

复用binding-pipeline/inputs.json的requestTemplate与原source-oracle既有资源控制；不扩大cap，不安装profile，不改变数字。完整保存request/output、终端/coverage/unknown、源码/工具链/程序集摘要。新独占目录用create_new/不覆盖；所有原r1..r5、失败及R4不动。

拟准确主命令（仅获批后）：

~~~powershell
cargo test --locked --offline -p codeatlas-native-analyzer --lib framework_source_characterization::characterize_six_sources -- --exact --test-threads=1
~~~

先只读确认固定1.98.1工具链和既有依赖可用；不得触发安装或下载。使用新任务专用输出目录，使用专用输出环境变量，不复用旧capture环境/目录。最多一个主运行；只在已定位的test-harness错误时允许一次同filter必要修正复验，每次新目录并保存原失败。producer/契约错误、cap不足或Source语义不足停止相关观察，不为转绿修改产品、不自动提高预算、不重跑到绿。不启动CLI、独立harness/helper/collector、模型、用户数据库或云端CI。

## 输出与完成条件

完成指本包观察与审查完成，不指Phase1完成：六Source身份和原始流可核对；既有严格wire7 reader逐份重放，保留COMPLETE/PARTIAL及错误；按独立义务逐项记录Source真值、观察到的字段/关系、缺项、适用证据种类，不把UNSUPPORTED归零；原产品与golden/critical/gates/迁移/锁文件不变；一次范围验证、文档和原唯一结果索引同步。

随后集中决定：仅需本地绑定修复的部分按原B批准继续；需要新角色/结果关联/coverage含义的部分形成可审阅准确DCP。真正的生产准入仍需A6/profile与原E03..E06、E2E/critical义务；本包不会批准或完成它们。

[实施/运行包](../plans/2026-10-31-phase1-framework-source-characterization.md)。
