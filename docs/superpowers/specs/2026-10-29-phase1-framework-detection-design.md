# Phase1 B 批：框架事实设计与首包依赖检测

状态：用户已批准 B-F0 设计及实施，当前组件已本地交付；B-F1/G/X 仍只有路线与缺口，不由本批准授权。
依据：[ADR-020](../../handoff/adr/ADR-020-phase1-contracts-and-evaluation.md)、[共享详细设计](2026-10-22-phase1-contracts-and-runtime-design.md)、[Plugin V2](2026-10-22-phase1-syntax-plugin-contracts.md)、[统一编排](../plans/2026-10-29-phase1-unified-next-delivery.md)。

## 目标与实际差距

B 批负责 P1-06..09：Spring/Mongo/Kafka/FastAPI 框架事实、ExecutionGraph/RuntimeFlow、合同匹配和基础跨仓串联。A6 未通过不阻止纯规则组件设计或离线实施，但真实 Source→Native→Syntax→Plugin→Store 资格不能用人工输入替代。

本轮只读核对了 Plugin V1/V2、routing、Canonical Code/Syntax/Runtime IR、Syntax normalizer、Java/Python import/语法生产代码，以及旧 P1-06..09 任务。
- plugins/src 只有 SPI、V2 校验和旧路由，没有四框架实现；execution/src/index.ts、contracts/src/index.ts 仍为空出口。
- Plugin V2 校验 basis/支持闭包/不可变性，候选只校验通用 envelope；既有 fixture.entry-point-candidate 是 SPI 演示，并非生产 EntryPoint schema。
- Java import 生产者区分 normal/static/wildcard，但 Canonical IMPORT 不公开该variant；不能仅凭hint重建导入成员绑定。
- Java syntax 创建 annotation/invocation 的 unresolved target；normalizer 原样映射，并不完成框架绑定。Python import 同时输出 IMPORT 及 alias ASSIGNMENT；不能假设 decorator 的名称已经解析为 FastAPI。
- RuntimeFactSet 已有实体/引用闭包校验，可以复用；ContractMatch/Service/FrozenContractSet 的生产输入与持久化不能从旧计划函数名推定已存在。
- R011 已有实现，不重做。R012/R013、W004..006 必须按实际 migration runner 和前序另行具体设计。

## 推荐顺序与边界

| 合并包 | 交付与依赖 | 完成后可称 ready | 仍需补充 |
| --- | --- | --- | --- |
| B-F0（当前具体包） | 四框架统一 IMPORT 依赖检测；只依赖已有 Code IR/SPI V2 | 离线框架依赖识别组件 | 不证明任何路由、receiver、业务语义或实际框架完整性 |
| B-F1 | 四框架证据绑定与语义候选；消费 F0、Code/Syntax；集中确定候选 envelope、ID/支持规则 | 经独立 Fixture 验证的纯语义抽取 | 真实观察链、增量/重启和 Store 激活 |
| B-G | ExecutionGraph→RuntimeFlow、R012/R013、原子激活 | 派生与本地持久化闭环 | 实际产品路径、全资源资格及 E03/E04 完整证据 |
| B-X | Service/ContractMatch 六结果、冻结 RevisionSet、W004..006、跨仓串联 | 保守匹配/工作区本地闭环 | 真实多仓路径与 E05/E06 |
| B 集成验收 | F1/G/X 加 A 的准确真实链与批准 baseline | 满足正式门禁后才关闭 P1-06..09 | 未完成项不得以组件 PASS 抹去 |

以上是依赖顺序，不新增主任务，也不把这些包当作已经授权的实施。四框架识别合为一个包，不分四次审批；真实运行/新数值仍走既有边界。C 的纯文档解析仍可独立推进。

备选是现在直接实现四个 extract factory，但会被迫自行确定尚未落实的绑定、ID/支持和领域 envelope。推荐先做规模很小的 F0；不先建设通用符号解析平台或可配置规则引擎。

## B-F0 接口与语义

私有模块 packages/plugins/src/framework-detection.ts，default 函数：

    detectFrameworkDependency(context: unknown,
      framework: 'spring' | 'mongo' | 'kafka' | 'fastapi'): PluginV2Detection

仅内置四个选择，不增加 public index、factory、注册器、配置键、Provider capability 或生产路由。后续 built-in detect 可以直接复用该规则；它当前不是完整 FrameworkPluginV2。

在本责任点调用现有 validatePluginV2Context；输出用现有 validatePluginV2Detection 校验/冻结，不实现另一套 JSON、basis 或支持检查。context 已有 facts/files cap 继续适用，不增加阈值。无需持久状态或缓存，每次对当前完整 context 计算，因此删除 import 后下次检测无旧命中。

matched=true 精确表示“输入中有该框架命名空间的有效 IMPORT 声明证据”，不表示框架已运行或某个 annotation/receiver 已绑定；未使用的 import 也可匹配。此含义符合依赖检测，不能单独授权语义抽取。
- 只查看 IMPORT 边，且 sourceRange 所指文件语言与规则一致；未知或缺失源位置不作为证明。
- RESOLVED/EXACT target 取实际目标 node.qualifiedName；HEURISTIC 不作为命中证明。
- UNRESOLVED/UNRESOLVED 且 candidates 为空时，取 originalHint，含义只是原 import 声明，不提升为解析成功。
- AMBIGUOUS、UNSUPPORTED 或带候选的 unresolved 不作正例；范围合法但未知的输入保留未匹配，不猜测。
- 对完全限定名按点分段匹配；不修剪/重写，不对子串匹配。若 hint 本身带星号或不是合法点分段名，不作正例。Java 生产代码会剥离 wildcard 的星号，只留下 namespace：这种现有 Canonical IMPORT 仍可证明依赖声明，但不能恢复具体导入成员；不得伪称能够区分 normal/wildcard。Python wildcard 当前可能只留下上游 coverage 限制而没有 IMPORT 边，没有边时此检测不生成证据，整体 coverage 仍由上游另行报告。
- Java 规则命名空间：spring 为 org.springframework；mongo 为 com.mongodb 或 org.springframework.data.mongodb；kafka 为 org.apache.kafka 或 org.springframework.kafka。Python fastapi 为 fastapi。命名空间本身或其完整点分段后代才符合；fastapi_extra、org.springframeworkish 均不符。
- 框架可重叠，例如 org.springframework.kafka 声明可同时证明 Spring 和 Kafka 依赖，不能按优先级只取其一。
- 不查看字符串字面量、callee.name 或 save/get/send 等简单名称作为依赖证明；不读取文件、环境、artifact 或模型。

support 是命中 IMPORT 边的 CANONICAL EDGE 引用，按现有 canonical edge factKey 再 id 的精确字典序输出、去重；不是 SYNTAX 猜测引用。matched 与 support 非空严格一致。非正例无 support。
对可识别为同命名空间但仍带星号/不确定的 import 使用固定 code FRAMEWORK_IMPORT_UNVERIFIED、severity WARNING、message "Framework import is not verified"、原 sourceRange；不回显 originalHint。其他框架/普通无关输入不产生噪声诊断。诊断按文件路径、起止位置、code 排序并去重。检测不产生 confidence，因而不增加分值或最低分规则。

## 安全、错误与恢复

全程同步纯规则，无进程、网络、SQL、输出发布或跨资源事务。无持久失败状态；非法 context 沿用 IR_VALIDATION_FAILED，不降级为空成功。非法 framework 选择同样受控拒绝，不默认为另一框架。UNKNOWN 名称不冒充错误根因。
不改变 provider-independent IR、SQLite authority、LLM candidate-only、AUTO/MANUAL 边界；不提前引入第三方 Plugin sandbox、动态加载或 DEFERRED WikiSpec。

## Fixture / Gate / 验收映射

复用 p1-plugin-context-v2，增加 inputs/framework-detection.json 与 expected/framework-detection.json 两个独立手写文件，Manifest 增加对应 inputs/expected 路径；原向量不改，新数据只证明依赖检测。无新 Fixture ID 或全局计数调整，不将空 qualityGates 作为 Phase1 PASS。

| 行为 | 独立输入 / oracle | Gate与适用性 |
| --- | --- | --- |
| 四框架正例 | literal IMPORT、文件语言与 expected support | 四规则完整输出精确比较 |
| 同名/前缀碰撞/无 import | 自定义 Route/get/save/send；相近命名空间 | 不命中，防错误入口前提 |
| alias 与 wildcard | Python import 原名配 alias 观察；star 声明 | alias 不改依赖身份；Java已剥离star只证明namespace，Python无边不伪造 |
| resolved/不确定目标 | EXACT、HEURISTIC、歧义候选 | 不把未知绑定提升为精确 |
| Spring/Kafka 重叠 | 同一 Spring Kafka import | 两个独立检测均正确支持 |
| 删除/重排/重复输入错误 | 删除边；重排合法 arrays；重复事实 | 无缓存残留、确定输出；重复沿用 V2 拒绝 |
| 旧契约/架构 | 原 SPI V1/V2/routing，manifest/registry，architecture | 范围匹配一次集中验证 |

不测每个内部 helper、不创建重建产品算法的 oracle、不跑 Native、崩溃 workers、整仓回归或 A5。

## 后继必须解决的问题

F1 才确定 framework symbol/receiver/alias/shadow 绑定、类级/方法级 route 组合、Mongo 类型/集合、Kafka namespace/schema、FastAPI router/include/Depends；不从“import 存在”推出使用点语义。
同时集中确定 Runtime 候选 envelope/capability、provider-independent factKey/ID、Syntax 直接支持如何进入鉴证 inventory、多候选闭包及不抬高 confidence 规则。现有 SchemaEnvelope 能装任意 JSON 不等于 Application 已具体验证语义。
这些是后继包的明确缺口，不能在 F0 中加空接口或偷偷填值。无 FROZEN 改动要求；若 F1 需要修改已冻结 IR/支持契约，先提交 DCP。E01/E02 和真实框架验收保持 OPEN。

参考标识符来源：[Spring API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/bind/annotation/RequestMapping.html)、[MongoDB Java 文档](https://www.mongodb.com/docs/drivers/java/sync/current/databases-collections/)、[Apache Kafka 源](https://github.com/apache/kafka/blob/trunk/config/producer.properties)、[FastAPI 文档](https://fastapi.tiangolo.com/tutorial/bigger-applications/)。只核对命名空间用途，不据 current 文档宣称已支持任何框架版本或 API 全集。

## B-F0 实施适用性

已批准并完成的组件边界、独立Fixture、失败及最新门禁见[实施结果](../plans/2026-10-29-phase1-framework-detection.md#实施结果与作者审查2026-10-29)。四框架纯依赖检测已交付，不将后继F1/G/X或E01/E02记为已完成；本设计中“后继必须解决的问题”保持有效。
