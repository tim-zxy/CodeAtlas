## 组件输入可携带性检查点 — 2026-10-27

已将36份封存组件输入整理为库内可携带材料：24份JSON按标准库gzip保存原payload字节，12份JSONL不变，loader校验存储/解压摘要与原byteLength。六处消费者不再读旧私有输入；未从产品生成expected、未修改.prettierignore或格式门禁。原目录与无旧私有输入复制目录四组均212/212，0fail/cancel/skip/todo，含19个真实Node退出；不同环境重复不累计为424。架构17项目通过，产品/编译产物未改。[本轮作者评审](../reviews/2026-10-27-phase1-component-reference-portability-review.md)记录Windows路径及辅助代码首轮失败、最终转绿和可复现入口。

新增材料为原Fixture根附加参考39文件，不新增Fixture ID/门槛；原2241 Fixture字节、所有历史原文/失败保留，registry61/exactPhase1 35/catalog0。原Stage66/Store43共109项已逐项映射输入/期望/基线摘要、相关组件证据及缺口，尚未执行的原case全部保持OPEN，不以组件数冒充验收。

本记录替代下方“组件必须读取旧W输入”的历史限制；.superpowers仍仅作证据/临时输出而不提交。D/E/F IN_PROGRESS、G OPEN；独立整操作预算、完整原Fixture与较宽旧快照恢复仍待，B1b/P1-04/05/Phase1未完成。原D..G顺序继续，无新增Native、校准、profile/依赖/数值、CI或Git授权；timeout仍UNKNOWN及全部既有风险不变。

## ABA 与 Store 组件新检查点 — 2026-10-27

获批ABA私有SQLite见证及实际查询记账3→5已实施，同/另连接ABA拒绝；Store锁内资格、一次lease消费、原子持久写入、未知提交只读判定和清理诊断已接入。19类实际SQL边界异常与真实Node退出38/38。[作者组件评审](../reviews/2026-10-27-phase1-stage-aba-store-component-review.md)记录全部RED→GREEN及范围限制；下方待批准/无Store/ABA仍RED等为保留快照。

最新集中本地回归15文件609/609，0fail/cancel/skip/todo；Storage/Runtime build exit0，架构17项目通过。Stage37/Store69是组件结果，不代替原Stage66/Store43逐项验收。原Fixture2241字节、registry61/Phase1 35/catalog0保持，全部历史失败/原文保留。

D/E/F IN_PROGRESS，G OPEN；独立整操作预算reference、完整66/43映射、可携带Fixture整理及较宽原始快照恢复仍待，B1b/P1-04/05/Phase1未完成。组件数据仍在私有证据目录，不可提交.superpowers或声称干净checkout/CI就绪。原D..G已批准，后续顺序推进无需逐小步骤确认；无新增Native、校准、依赖、数值、云端CI或Git写入授权。Native历史timeout仍UNKNOWN，既有风险不变。

## ABA 私有见证修订已批准 — 2026-10-27

用户明确批准 `2026-10-27-phase1-stage-aba-witness-proposal.md`：使用 SQLite total_changes/data_version 私有见证，按实际两条数字 SQL 行累计计费，构造预留3→5；不改变预算输入、默认值、公开契约或原门禁。原 D..G 继续顺序实施。下方自动审批阻断／待批准为历史，旧失败与原文保留；Stage66、Store43、整操作独立预算与恢复退出仍 OPEN，不将批准记为执行通过。无 Native、云端 CI 或 Git 写入授权。

## Accepted — 2026-10-27

用户明确回复“批准”，接受本文三个固定方法、Java 输入／摘要公式及原 D..G 内相应实现与门禁同步。本文下方 PROPOSED／待决策为接受前原文；批准不授权 Native、云端 CI、Git 写入、新数值或依赖。

# Phase1 Stage 前置验证端口局部修订（待批准）

2026-10-27。PROPOSED / NOT_IMPLEMENTED。只修订原 B1b D/E 的接口衔接；不扩大 Phase1 能力范围，不把既有 D..G 批准撤回。相关实现等待本修订明确批准，其他已批准检查照常完成。

## 冲突与可复核依据

- [原 Stage 契约 §5](2026-10-25-phase1-r011-history-stage-contract.md)规定 PREPARING 成功前校验 Java 原事实／Source／契约，OWNER_FROZEN 接收成功前校验 Java/v5/scope；规则端口只有 compose，且“调用一次，异常使Stage失效”。最终组合需要已经接收的 Python raw，不能在 Java owner 建立前完成。
- 当前 storage/analysis/mixed-analysis-state.ts 仅有 compose；Stage 构造器精确接受被冻结的这一个方法。Runtime mixed-analysis.ts 对应纯组合已实现。
- 严格 v5 解码、完整 Java stream 检查、normalizeJavaNode、原 owner-map 绑定在 Providers；Storage 依赖层仅允许 IR。证据 early-validation-architecture-probe.json 是本包隔离目录的反例，不是修改真实依赖后的失败：原 architecture checker 拒绝 Storage→Providers。
- 已有 Runtime native-analysis-validation.ts → Storage NativeStateValidationPort 是依赖反转先例。采用相同方向无需新依赖或放宽架构规则。

仅将校验拖到 freeze 会削弱前两步成功语义；提前调用 compose 再调用一次会违反调用次数；复制 Providers 解析器／规范化器会产生第二套实现。都不采用。

## 推荐接口与职责

固定私有 MixedAnalysisRulesPort 改为三个同步方法，继续不从 package index、IPC、用户配置暴露：

```ts
interface MixedAnalysisRulesPort {
  prepareJavaOwner(input: unknown, limits: HistoryReadLimits): unknown;
  validateObservation(input: unknown, limits: HistoryReadLimits): unknown;
  compose(input: unknown, limits: HistoryReadLimits): unknown;
}
```

三个方法均只计算、不访问 DB/进程/网络，不接受 selector、函数输入或 caller-ready 资格。Stage 检查精确方法集合、冻结对象和原同步函数限制；旧 compose-only 对象不作为新 Stage 的有效端口，不设默认或降级分支。既有独立纯 compose 调用保持原输入／输出／错误，新增 Stage 测试改用完整固定端口。

### prepareJavaOwner

Stage 自己先完成真实 capture/TEMP 重查和 scope 重算。无待观察 Java 时仅接受 javaRows=null，不调用该方法，原 no-Java owner 正文和摘要逐字节保持。

有待观察 Java 时，javaRows 使用既有 CompositionMetadataSchema 的完整对象（其 java 必须非 null）；这是已存在格式的私有输入适配，不增加 wire 模型。Stage 不接受 caller 提供 Source、scope 或 normalized owner 来替代拥有读集。传给端口的固定输入是实际 targetSource／完整 inventory／repositoryLocatorDigest／contracts、自算 units／完整 removedSourceFileIds、拥有的 javaRows；完整 Repository 来自原 Java request，核验其身份／locator 与真实读集，不把 caller root 当授权。

Runtime 复用既有 metadata/component 校验、validateParsedCompositionJava 和 normalizeJavaNode，检查完整必需 Java 组、所有原始 NODE/EDGE/coverage/terminal、Provider/Source/版本契约；不裁掉 loser。返回完整拥有的 metadata 与受控 Java NODE 对照数组及实际 usage；每项是 {providerNode,canonicalNode,sourceFileId}，按 providerId/providerFactId 的 H1 字符串顺序排序，拒绝重复。不是最终 selector 结果，不含本次 Python/Syntax。

Stage 独立校验返回结构／IR、原 NODE 与对照数组一一对应、Source/typed identity/范围、契约／快照、排序去重和 usage，保存原 Java 组件及对照。Java facts 的规范化算法仍只有 Providers 一处；IR 校验或对照检查不代替其算法。Stage 决定是否发 owner，不接受端口的布尔成功声明。

javaRowsDigest 的具体私有编码固定为 SHA256(UTF8(H1 canonical({snapshot: metadata.snapshot, java: metadata.java, nodes: 上述完整对照数组})))，无新域前缀；使用已有 H1 canonical 编码与预算规则。外层仍用已接受 codeatlas-provisional-owner-stage-v1；无 Java 仍为 null。原 computeSyntaxOwnerMapDigest 编码不改。独立字节向量先冻结再实现，不从新方法反造 golden。若该具体编码不被接受，Java 路径保持拒绝，不能自行换一种身份公式。

### validateObservation

仅在 OWNER_FROZEN、同实例真实 ownerHandle 成立、capture/TEMP 再查通过后执行一次。Stage 先安全复制并拥有 raw bytes，传入实际 target／capture／自算 scope、拥有的 Java 准备正文和 stageDigest、rawBundle；不转交 caller 可变对象或外部句柄。

Runtime 复用原严格 full 或 R0 v5 解码／Java 检查、PROVISIONAL_CODE 及 computeSyntaxOwnerMapDigest 结构绑定、全部 Source／删除投影／unit／outcome／checksum／counts 规则，核验 raw metadata.java 与先前拥有 Java 内容完全相等。返回完整已解析声明（含原 raw 身份与 typed refs）和实际 usage，不返回 prepared token、lease 或 run-ready 状态。Stage 对原 bytes 与返回声明的一致性／身份／scope／owner/Source/IR／预算再次检查，保留所有原支持后才进入 OBSERVED。仅删除自算无观察时，null raw 在 Stage 内验证并进入 OBSERVED，不调用端口；其余 null 或多余 raw 拒绝。

### compose 与权限

只在 OBSERVED→FROZEN 调用一次原 compose，继续对原始拥有输入运行原完整校验，不信任前两步结果来跳过旧门禁；重复计算实际计费。Storage 仍独立检查最终 manifest／Code/Syntax／来源／闭包／digest，封存固定 TEMP 全内容后才创建私有 lease。Store 锁内三个方法都不调用，真实 CAS/提交资格仍由 Storage 授予。任何错误永久撤销 Stage/owner/lease，沿用既有安全错误集合。

## 预算、安全及兼容性

每次调用只给 Stage 同账本剩余额度，按既有 History↔Composition 残量适配在分配前限制 UTF8/items/depth/logical memory；SQL、原 bytes、副本、解码、Java 对照、端口返回与 TEMP 重叠表示分别计费。使用私有固定的计费续接点，失败也导入已消耗计数，不让端口自报更小 usage 复位总账。usage 是记账资料，不能授权或代替独立整操作 reference。不得新增 profile、阈值或默认数字。

不改变 Canonical IR、原 v2/v5 wire、原 hash/owner-map 编码、SQLite schema/migration、置信策略、AUTO/MANUAL 边界；本条新 javaRowsDigest 内部编码明确以上述公式接受为前提。原 compose-only 私有 Stage 测试需精确更新，原公开纯组件和历史 Fixture 字节不改。无真实 Native、H5 运行资格、校准、新依赖、云端 CI、Git 写入或用户 DB。

## 批准后直接继续原批次

1. 先冻结 Java/no-Java/full/delta/删除、篡改、typed ref、端口次数／失败／事务和整链预算对照，保留现有 owner 三例及全部失败。
2. 同步原 §5、B1b D/E 接口、HS-OWNER/HS-RAW/HS-BUDGET、traceability 与相关测试精确方法保护；维护原 Stage66/Store43 各案例映射，不以改端口删除门禁。
3. 先实现两个 Runtime 固定入口并验证旧行为，再连接 Stage Java／acceptObservation／一次 freeze／TEMP seal／opaque lease，依原 D..G 顺序继续 Store 与整包本地验证，不重新拆包确认。
4. 完成条件包括独立字节期望、异常和时序撤权、旧 full 拒局部、完整 loser/coverage/snapshot、无锁内回调、同账本独立 exact/one-below、架构与文档同步；全套通过前 D/E/F/G、B1b/Phase1 保持未完成。

## 评审结论与待决策

作者局部设计复核：推荐依赖反转；没有执行新端口产品实现，没有独立整分支评审。需用户一次明确批准本接口、Java 输入／摘要公式及原批次内的相应实现与门禁同步。原 §5 的精确单方法接口是设计依据，按 AGENTS/IMPLEMENTATION_PROTOCOL 不能用普通实现裁决静默修改；这不是对已批准小步骤再次索要许可。
