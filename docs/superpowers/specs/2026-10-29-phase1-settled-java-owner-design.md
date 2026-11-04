# Phase1：Java owner 准备与最终观察的时序修订

2026-10-29。状态：SETTLED_JAVA_OWNER_LOCAL_EXIT；获批S1–S3已完成本地组件交付。与[集中实施包](../plans/2026-10-29-phase1-settled-java-owner.md)一次评审，不再拆方向、细化和任务审批。

## 1. 实码证据与必须修订的问题

当前A3仅本地请求衔接已交付，结果见[原索引](../../../.superpowers/sdd/2026-10-29-phase1-mixed-request-preparation/results.json)。本轮未重跑它的完整回归。

真实顺序必须是：Java完整结束 → prepareOwner/stageDigest → 构造v5请求 → v5结束 → 最终metadata与Store。现行实现却有如下环：
1. Runtime javaOwner 要求 CompositionMetadataSchema；其中 snapshot.completedAt、codeSyntax.startedAt/settledAt 均必需。
2. Stage controlledJava 严格保留完整metadata；javaDigest还把含completedAt的整个snapshot纳入摘要。
3. Runtime observation要求 isDeepStrictEqual(prepared.metadata,m)，因此真实v5完成后不能换成新的真实时间。
4. v5请求又需要这个准备过程产生的stageDigest。

因此静态literal/replay可以通过，真实串行流程无法在不预填未来时间的情况下满足契约。这不推翻A3已声明的组件结果，也不能以“测试通过”证明真实编排已就绪。

[只读核验](../../../.superpowers/sdd/2026-10-29-phase1-settled-java-owner-design/inspection.json)保存四个关键源码摘要及既有纯回调诊断：原mixed准备ACCEPTED，删去未来字段并使用本提案新形状时现行代码拒绝INVALID_CANDIDATE。该拒绝是现行schema行为，不冒称新schema已实现或新测试已通过；无DB/Native/Git/collector运行。

依据：ADR-020；[Stage契约§5](2026-10-25-phase1-r011-history-stage-contract.md)；[Runtime顺序§3](2026-10-29-phase1-runtime-boundaries-design.md)；[A3请求衔接](2026-10-29-phase1-mixed-request-preparation-design.md)；NativeIPC/Provider/Evaluation/Security。新增私有准备schema和摘要输入域超出A3授权，故在编码前集中治理；没有据此认定需要修改Canonical IR或已发布IPC。

## 2. 推荐方案与备选

推荐新增一个仅含已知事实的 SETTLED_JAVA_OWNER 准备形状，最终观察时按明确的已知字段投影精确关联。最终完整metadata仍走原严格验证。保留旧完整metadata路径及其字节/精确成本，供原语料和重放使用；后续真实编排必须使用新形状。

不采用：
- 预填deadline/当前时刻作为v5完成时间，或准备后修改已冻结对象：把未发生事件记为完成，且破坏owner身份。
- 直接删掉整份metadata比较：会放过Java原始流、版本、Source或snapshot身份漂移。
- 改为v5结束后才prepareOwner：v5请求本身需要stageDigest，循环仍在。
- 一并重写执行器/SQLite/collector：并非消除此时序循环所必需，扩大未经证明的变更面。

## 3. 新的私有数据契约

在 providers/src/native-composition-input.ts 复用已有字段schema，新增 SettledJavaOwnerPreparationSchema / 对应类型，不从package index导出：

~~~ts
{
  kind: 'SETTLED_JAVA_OWNER';
  schemaVersion: 1;
  targetSource: CompositionMetadata['targetSource'];
  inventory: CompositionMetadata['inventory'];
  snapshot: {
    id; providerId; providerVersion; runtimeVersion; startedAt;
  };
  tool: CompositionMetadata['tool'];
  java: NonNullable<CompositionMetadata['java']>;
}
~~~

以上是字段表；类型均来自现行schema，不新造IR基本类型。snapshot没有completedAt，整体没有codeSyntax；这两个字段即使传null也按unknown key拒绝。java中既有startedAt、settledAt、request、events、terminal、版本及tool都必需，因为Java此时已真正结束。

新准备校验：
- snapshot.startedAt ≤ java.startedAt ≤ java.settledAt；使用原UtcInstant字段及比较规则，不设置新时钟容差。
- java providerVersion/runtimeVersion/tool与snapshot身份及顶层tool精确一致。
- 复用原完整Java组、五项capability、原v2 request/events/terminal、覆盖和节点归一化校验；不因准备schema较小就减少Java事实义务。
- provider、repo/revision/fingerprint、完整inventory、contracts、required units、root locator仍与真实Stage capture一致。
- 类型判别仅在严格边界一次完成。新kind/schema非法不得回退旧schema；普通已验证内部数据不逐层重复clone/检测。

原 validateParsedCompositionJava 的实际逻辑只读取 targetSource、snapshot身份及java；将其参数类型收窄为这组既有字段，供两种准备形状复用，运行逻辑/旧成本不变。不另写第二个Java解析器。

## 4. Runtime 与 Storage 的精确变化

### Runtime

prepareJavaOwner保持原RulesPort签名。旧完整metadata分支运行原校验。新分支用新schema及仅已知的组件时间/身份检查；targetAndScope按对应已解析schema校验目标inventory，旧分支的schema调用、收费次数和顺序保留。两分支共用Java严格验证、归一化与排序核心。

validateObservation继续要求最终CompositionMetadata及现行raw请求/输出。新准备对应的关联投影为：

~~~ts
projectSettledJavaOwner(finalMetadata) = {
  kind: 'SETTLED_JAVA_OWNER', schemaVersion: 1,
  targetSource: finalMetadata.targetSource,
  inventory: finalMetadata.inventory,
  snapshot: pick(finalMetadata.snapshot,
    ['id','providerId','providerVersion','runtimeVersion','startedAt']),
  tool: finalMetadata.tool,
  java: finalMetadata.java
}
~~~

投影与准备metadata逐字段deep equality；重新验证得到的Java nodes也必须完全相等。这精确保留全部已知字段，不删除Java request/events/terminal中的任意时间或诊断，不忽略tool/版本/根身份。

新分支还要求 java.settledAt ≤ finalMetadata.codeSyntax.startedAt；最终metadata仍满足原完整组件时间范围和原Code/Syntax组合器全部校验。snapshot.completedAt和codeSyntax组件是准备时不存在、最终时才提供的字段，不能作为其他已知字段漂移的豁免。

旧分支保持原整份metadata equality；不得借新分支让旧语料的完成时间漂移通过。共享投影helper仅在已有Provider输入模块定义并复用，不引入通用mask/diff配置。

### Storage

controlledJava只增加明确新kind分支，验证新schema形状的结构与Runtime返回值等于Stage拥有的原输入。原完整metadata分支及原控制保持。Canonical nodes、Provider nodes、sourceFileId和完整Java units逐项验证仍照旧。

javaDigest：
- 旧完整metadata输入继续原算法、原字节、原摘要；
- 新准备的javaRowsDigest = SHA256(UTF8('codeatlas-settled-java-owner-v1' + NUL) || encodeHistoryValue({snapshot,java,nodes}))，其中snapshot仅为新schema的五项已知身份。
- 原owner-stage正文、schemaVersion、scope、Stage生命周期及外层stageDigest域保持；新javaRowsDigest明确有独立输入域，不重新解释任何旧摘要。
- Source/locator/contracts/inventory仍由原Stage正文绑定。java组件本身完整含tool和版本，不能替换已冻结Java观察。
- 无Java时仍为null；Python-only、DELTA删除-only、NO_OP原行为不改。
- 仍使用同一真实HistoryReadBudget，新投影/编码/摘要的副本和前缀按既有规则预付；失败失效、前缀保留、cleanup及Store导入保持。新路径费用单独验证，不将新cost强加旧路径。

不新增TEMP表、数据库迁移、持久化IR、wire字段或授权token。Final history/origin仍只保存完整真实最终metadata；不会把部分准备对象发布为ProviderSnapshot。旧history不可变、旧owner-map算法和最终SQL字段精确比较（含全部既有时间字段）不变。

## 5. Fixture 与验收

沿用p1-mixed-runtime-readiness-v1，在java-owner-timing下新增cases.json/expected.json/README.md，并只追加Manifest input/expected引用。输入来自现有独立Java/mixed参考、Source字节与raw；新准备/最终时间顺序是独立literal，不能从产品输出回填。

最少行为族：
- 新准备不包含未来字段即可产生owner，并在v5结束后接收完整最终metadata；Java-only/mixed均覆盖。
- prepared.snapshot.completedAt/codeSyntax、未知kind/version拒绝；旧完整metadata继续原样通过，旧时间漂移仍拒绝。
- 已知snapshot身份、Java raw任意字段、tool/版本、inventory/root/owner/Stage变化拒绝。
- 最终完成时间与准备无关但满足真实顺序可接受；Java未结束/最终时间逆序拒绝，不设置容差。
- 同Java已知事实的新stageDigest不随合法最终v5完成时间变化；Java事实或已知snapshot身份改变会改变新摘要；旧摘要golden全部保持。
- 新路径边界/失败前缀/相同账本到Store；旧Stage精确成功成本不变。
- 现有Source→v2/v5 double→Stage→Store组合增加新准备分支，原旧分支保留。全部是本地组件，不是实际Native测量。

退出仅SETTLED_JAVA_OWNER_LOCAL_EXIT，要求对应Fixture、三包构建、受影响兼容/架构和文档追踪齐全。不是完整Runtime、资源资格或P1-04/05关闭。

## 6. 完整Runtime仍需解决的三个后继缺口

| 问题 | 实码依据 | 下一完整编排包必须落实 |
| --- | --- | --- |
| SourceState SQL前置预算 | source-state/repository.ts的load/findCommitRevisionId使用.all，A2在返回后才account.own；旧native instrumentation不是Phase1前付门禁 | 复用原CAS/解析，用有界窗口和同账本在交付前限额；保持旧公开行为，不能把A2逻辑组件冒称完整SQL资源证明 |
| 配置与预算域 | EffectiveConfig六字段；旧IndexConfiguration和Stage分别还需maxEvents/maxRows/maxSerializedBytes等 | 明确各域来源/累计和原生阶段预留，不将maxItems当maxEvents或SQL行数，不凭空填默认或数值 |
| 实际进程/资源资格 | C2仅旧helper；短命Git仍有attach-before-exit竞争；现catalog0 | 冻结真实调用顺序、所有存活进程/collector成本、完整oracle与精确操作清单；未就绪不得运行或安装profile |

本次仅核验/记录这三项，不预批其实现和指标变化。不新增debugger/addon/broker、探针、依赖或CI；全资源目的和实际运行包仍NOT_READY。后续应把有界SQL、预算来源及固定编排集中设计，不拆成逐函数审批；时序新契约必须先定案，避免编排建立在伪造完成时间上。

## 7. 集中批准与治理同步

推荐一次批准本修订和S1–S3：三个产品模块、新Fixture/三个测试模块/一处组合扩展/原root注册、范围匹配的本地验证及作者评审。新私有schema、known/final比较规则和javaRowsDigest新域是此次实质审批点。

批准后同步ADR020、DESIGN_AUTHORITY、Provider_SPI、R011 Stage契约、WBS/acceptance/trace/status及A3附约的相关说明。Canonical IR、SQLite authoritative、LLM candidate-only、AUTO/MANUAL、ExecutionGraph→RuntimeFlow→BusinessFlow、DEFERRED范围不变。

无新profile/数值/依赖、真实Native/Git/helper/collector、云端CI、Git写入或新代理。原历史Native超时UNKNOWN、C1TODO、C2spent/main取消未查/R4mutable限制不变；回退为不用新准备分支并保留空catalog/last-good，不删旧证据或重写history。

实施结果、作者评审和全部范围限制见[集中实施结果](../plans/2026-10-29-phase1-settled-java-owner.md#实施结果与作者审查2026-10-29)。
