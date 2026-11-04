## 已批准并完成有限本地实施 — 2026-10-31

用户已批准本设计与 T1–T3，现为 DECLARED_RECEIVER_LOCAL_EXIT；[准确结果与作者审查](../reviews/2026-10-31-phase1-declared-receiver-consumption-review.md)。旧 generic-type 预期按本合同修订一项并封存原件；其余旧输入/预期不变。下方未授权文字是批准前历史，不授后续 Rust/真实运行或完整框架验收。

# 声明接收者消费修订：同 site 初始化与简单泛型类型

2026-10-31；PROPOSED / IMPLEMENTATION_NOT_AUTHORIZED。仅 P1-06 的现有 Syntax3 消费修订，不是框架生产资格或 Phase1 退出。

## 依据与取舍

依据：AGENTS 设计治理、PLUGIN_SPI 的 Canonical 输入/候选责任、ADR-002/012、B-F2-B §4/5、B 剩余设计 §3/6，以及 [实际 Source 观察审查](../reviews/2026-10-31-phase1-framework-source-characterization-review.md)。本提案没有变更上述已接受合同；以下消费规则须获批准才实施。

原始证据在唯一 B 账本 framework-source-characterization/run-01/kafka.*：真实 typed declaration 和 DIRECT_VALUE assignment 的 range（零基 7:38..77）、owner、lexicalScope 一致；declaredType 为 KafkaTemplate<String, String>。声明和初始化分别有自己的 Syntax 身份，不应删除其中一条原始观察。

实码路径：java_syntax.rs variable_declarator 分别发两条观察 → binding_sufficiency.rs 补 scope/control → 原 reader/normalizer → PluginV4 Context → createFrameworkBindingIndex → bindDeclaredReceiver → importProof。当前 definitions.length !== 1 拒绝这对记录；importProof 的 identifier 校验也拒绝带泛型的 declaredType。

推荐在 bindDeclaredReceiver 一个责任点消费这两种已有信息。备选是新增 wire 字段/让 producer 删除 assignment，均无必要且损失来源事实；全局在索引中折叠则影响 import、遮蔽和其他规则。推荐不改索引及原始观察，仅在接收者消费处证明。

用户已要求集中处理、避免无必要方案问答；本推荐由作者提出，尚不能写成用户已选择或已批准。作者自审，不新增代理。

## 1. 同 site 初始化对

保持原单个 TYPED definition 成功路径。仅当名字的候选恰好是一条 TYPED 和一条 WRITE，才允许把它们作为一个声明及其初始化消费；任意第三项、额外写入、参数、effect 或重复声明继续拒绝。

两者必须来自同一经 validatePluginV4Context 核验的 Java Source，并且：

- typed 为 DECLARATION/TYPED_BINDING，有非空 declaredName/declaredType；write 为 ASSIGNMENT/DIRECT_VALUE，targetName 与 declaredName 及 receiver 名完全相同。
- 两条 sourceRange 的 sourceFileId 和四坐标完全一致，sourceFingerprint 完全一致；owner 与 lexicalScope 为相同非空完整 Code ref（按现有 ref 值比较，不仅比字符串 id）。
- 两条 controlContext 均 UNCONDITIONAL；原 safeChain 的完整 scope、通配/未知 import 拒绝、memberWrites 和 callee 精度校验继续适用。
- 原观察保持各自身份、UNKNOWN 值及来源。这个对应仅证明它们是同 site 的静态类型声明/初始化，不证明初始化对象实际类型、运行时派发或调用结果。
- 成功 support 同时包含 typed 和 assignment，以及原 scope/import 支持，沿 combineSupport 去重排序；不得只删除 write 再返回旧 support。

未知 initializer 的值保留；这里仍按显式静态 declaredType 处理接收者，与原单 TYPED 路径相同，不从 initializer 猜类型。若输入不能证明对应，保持 UNPROVEN。

## 2. 简单泛型 declaredType 的消费子集

raw 和 Canonical declaredType 保留原文，仅消费时提取名义类型。仅在 bindDeclaredReceiver 的 Java typed 路径使用；bindImportedName 不增加任何语法。

受支持的文本是 QualifiedName 或 QualifiedName<QualifiedName[, QualifiedName ...]>；QualifiedName 每段须满足现有 identifier 规则，参数间允许普通空白。示例 KafkaTemplate<String, String>、p.Template<p.Key, Value>。不接收前后杂项、空参数、未闭合括号、嵌套泛型、wildcard、数组、var、交叉类型或 annotation。上述未支持形式继续 UNPROVEN，不能截取第一个 < 前字符串就放行。这个子集只为已有实证服务，不建通用 Java 类型解析器。

提取后的名义类型交原 importProof(checkCallee=false)，仍要求 JAVA_TYPE 证据，不能用 JAVA_STATIC_MEMBER/wildcard 替代。泛型参数仅用于确认文本属于受支持子集；不解析它们的运行时意义，不声明已证明泛型兼容性。support 保留原完整 typed Syntax，因此原文变化仍保留在身份/支持中。

## 3. 兼容、存储与安全

不改 wire7、Syntax3、Provider ID、normalizer、history 摘要、IR schema、SQL、插件 SPI、既有 confidence/policy 数值或公开导出。新增成功仅是已核验 Context 上的 binding proof，不是 Canonical Runtime 发布授权。

真实 Kafka 仍具有 PARTIAL scope（object_creation_expression），故当前实际 raw 仍必须被拒绝；不得在 Fixture 重放时把 scope 改 COMPLETE 然后冒称 Source 成功。离线正例是独立的合法 COMPLETE Context，用来证明消费行为；真实 Source 作为拒绝控制和证据来源区分记录。

framework-runtime-candidate 的 DOMAIN_RECORDS_ONLY/PARTIAL 和 entry 的 DECLARATION_ENTRIES_ONLY 不变。Application/Store 拒绝 PARTIAL、last-good、CAS、预算和 AUTO/MANUAL 责任不变。

## 4. 同批最小验证和退出

[集中任务包](../plans/2026-10-31-phase1-declared-receiver-consumption.md)。独立向量写在现有 binding-extraction inputs/expected，保留所有旧输入，旧预期仅按获准泛型规则修订 generic-type 一项（原件封存），其余不变；不新增 Fixture ID、critical 分母或数值门槛。原测试入口已注册，不复制注册计数。

正例覆盖同 site 双记录及简单/全限定泛型，support 必须齐全；反例覆盖额外写入、错 range/owner/scope、条件写入、PARTIAL scope、static/wildcard/名称遮蔽及未支持类型文本。复用原绑定/四框架提取/候选测试，不为每个框架复制费用矩阵。

有限退出：新行为与反例、旧受影响 Fixture 通过，Plugins 本地构建、架构/范围格式通过，文档同步且原 Source 失败不改写。不能关闭 P1-06/07、B6、E03..E06、物理资格或 Phase1；父项仍 4/21、17 OPEN。

## 5. 统一剩余顺序与真实阻塞

1. 本包可以在 Node 组件层独立完成，不等待 Rust 或新字段。
2. producer 普通 new 的 scope 分类：binding_sufficiency.rs 将 object_creation_expression 一概加限制，java_syntax.rs 的 lexical_scope 对其祖先也置 partial。后续须区分匿名类等真实作用域，覆盖两处来源并保留 lambda/未知限制；本包不修改、不授权 Rust。不能只删一个 limitation token。
3. Spring：5600 字节请求已解码且发 STARTED，Source 848 字节，原 maxInputBytes=65536；这排除单纯 request+Source 长度超过该限额的解释，但不能排除后续输出/遍历/深度等。writer 在 analyzer 返回前缓冲文件记录，故无 SYNTAX_OBSERVATION 不足以判断失败发生阶段。Java Code pass、collector、augment、writer 多处映射相同错误码；具体资源维度仍 UNKNOWN。先形成一次可定位 guard/实际计数的最小诊断方案，再申请实际运行，不改 cap、不自动用旧纠错额度。
4. Depends 参数角色、Mongo result→subscription→handler 关系缺失，以及覆盖/发布充分性须集中设计准确合同；当前证据不支持通过名字、范围差异或 COMPLETE 状态补造关系。不预定 wire8/Syntax4，不默选 Runtime 置信分数。
5. 最后才用真实 Source→Canonical→四插件→Graph/Flow→Store/跨仓整链和既有 Evaluation 证明原父任务；资源资格和云端 CI 沿原独立授权边界。

仅第 1 项提交本次集中实施审批，其余是依赖与开放问题，不是空白执行授权。
