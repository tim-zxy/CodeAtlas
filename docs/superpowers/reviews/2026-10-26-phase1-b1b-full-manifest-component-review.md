# B1b 未来 Code 身份、完整 manifest 与 full raw 历史桥检查点

2026-10-26。LOCAL_COMPONENTS_VERIFIED / D_IN_PROGRESS / B1b_NOT_COMPLETE。继续已批准 D..G，无新增授权请求。作者复核，未使用独立评审代理；不声称整批退出或可合并。

## 实际实现与边界

Storage 私有 predictCodeActivation 接受完整未来旧表行视图与独立全库 committedSnapshotCount，使用 B 的同一 C3-A emitter。九组字段、UTF8/BLOB 排序、JS 数字键枚举、全部原候选、typed NODE/EDGE、完整历史 snapshot 及 physical coverage multiplicity 均保持。时间与 diagnostics 依旧不进入 Code identity，完整历史身份仍包含它们。只做纯身份计算；完整性／全库 census 真实性归未来 owned capture/Stage，不是 caller packet 的权限。

Providers 私有 createSyntaxHistoryManifest 严格构造原九字段正文、source/registry/activation 身份及全部 origin/projection/member。复用已完成的新／保留 pair；FULL 不带旧 Syntax，允许准确 parent 的完整重建；DELTA 要求完整 TRANSITION_DRAFT、同 repo/revision 与 parent/source 对应。NO_OP 不能构造新历史。observation 和 transitions 必须是既有完整形状，额外成功标志、缺字段均拒绝。正向结果全部再经原 H1 validateHistoryManifest/validateSyntaxPair 验证。完整 H1 语义验证在未来固定 Runtime/Stage 仍为必需，不能以本层结构校验替代。

新增 full 原始观察衔接仅复用 Native 严格准入、归一化、选择与 R1 的 unit／原 typed-ref 依赖／coverage 构造，保留所有原支持、候选值摘要和原 diagnostics。内部保留的 parsed metadata/normalized rows 只能由实际准入调用产生，不接受外部 Prepared 或 trusted flag。完整 Provider 重验证、同 ID 全内容冲突、freshness 和真实 Source/run 资格仍归完整 Runtime/Stage/Store/H5。Native-only 声明候选不能清除 foreign supports，也不能独自证明全仓 full 合格。

私有 full 输入现在直接调用 budgeted v5 解码，账本包括实际 raw/decoded/预检消费；旧公开 full 输入和 R1 预算／结果不变。R1 共有构造提取只改内部参数，不伪造 history，也未新增依赖、公共出口、迁移、IR/wire/Profile 或置信数值。

## 实证、修订与测试范围

证据根：.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/。启动7923个检查点 hash 全匹配；HEAD cc5a8cb 与原分支未变。原 Source/Fixture 文件未更改。

- future-code-api-red → future-code-green：缺入口到 56/56，包括11个完整旧 C3A transcript 与四个完整 Native 目标。future-code-reference-green：67/67；独立从冻结字节向量推导完整 UTF8/items/depth/logical-memory 的 exact/one-below。该补充算术在首次实现后编写，不虚称预先冻结。另补已有 rows/bytes/items/retained 账不被清零的控制。
- complete-manifest-api-red 后初次编译遇 ProviderId/EntityId 品牌错误；纠正为既有 ProviderIdSchema。初次测试在失败构建仍发出的 JS 上37/38，不能称合格构建：唯一行为差异为 mixed 原始行集合顺序，完整 manifest/hash/member 已一致。保留所有日志，修复测试集合适配后87/87。
- Ruling D3：origins/projections 是完整行集合，按 origin 身份比对每个字段；独立 Fixture 原始行序不改。manifest.members 与 state.syntaxOrigins 仍精确 canonical 排序，不弱化有序数组契约。
- full-input-budget-api-red：证实新增内部共享准入入口不存在。预算化 v5 返回 observation 包装，正确适配后四类输入精确满足“旧准入消费＋原严格 v5 解码消费＋先前已用账”；不再把内部解码当免费。
- full-history-bridge-first：203/204，唯一失败为旧私有模块导出清单未登记新 full 入口。按原不可变 self-hash/successor 证明精确增一项，公共 index/export 名单仍严格原样；full-history-bridge-green204/204。旧 R1 独立候选和 exact 预算全通过。
- manifest-shape-closure-red：可调用反例复现额外 observation.ready／不完整 transition 被直接散列；完整既有形状校验后拒绝，未靠 Storage 后续兜底宣称本层正确。
- full-manifest-final：最终格式化／构建后集中37文件 **1429/1429**，0 fail/cancel/skip/todo，145145.3129ms。范围 full-manifest-scope.json；未启动真实 Native/helper、校准、全部根或整阶段测试。
- 此后作者 Unicode 复核出现 full-inventory-order-red：两个 OTHER 路径的合法 Native UTF8/BLOB 顺序与 H1 UTF16 顺序不同。Ruling D4：仅新增 full 桥在分别验证两种输入各自顺序后，按唯一 Source ID 比较完整记录，预先收费比较表示；保留 Native 原始数组与 H1 原始数组。Native 排序门禁、H1 排序门禁、旧 R0/R1 的精确数组关系都不改；改变 sensitivity 仍拒绝。该例是声明式 Source 元数据排序控制，不是实际 Source 内容/指纹或 Native producer 覆盖证据。
- 最后 full-inventory-adapter-green **207/207**，覆盖当前修改的 full 桥、Runtime 组件、旧 R1/full 输入及预算。1429发生在该窄适配前，不谎称最终全范围重跑或累计这两个重叠测试数。
- Providers/Storage/Runtime 本地构建通过；最后适配后 Providers 再编译通过；full-manifest-guardrails17项目、full-manifest-ir-types均 exit0。

## 作者复核与剩余

按实现计划与 code-reviewer 模板逐项检查身份域、Source 完整字段、typed-ref 原支持、固定诊断顺序、错误不含自由文本、共享账本、旧出口和架构方向。发现并处理上述编译类型、解码消费、形状与 Unicode 适配问题；未用删 Fixture、降低门禁或修改旧冻结报告解决。保留原证据／旧失败／此前已接受风险。现有受界扫描的实际资源表现仍须以后资格评估，当前逻辑预算不是 V8/RSS 或 Native reservation 证据。

**D 尚未完成**：还缺固定 createMixedAnalysisRules 的 full/delta/NO_OP 一次同步装配、owned capture 全读集／census 与未来身份连接、实际 Java 临时 owner/raw 绑定、完整 original/current 祖先的重验证或退休，以及 Stage 可自行核对的整链预算 receipt。当前 Runtime/test 是组件消费者，Runtime 产品端口尚不存在。

E 的同连接 opaque 所有权／TEMP／freeze，F 的原子提交／锁内比较／竞争／写入边界故障／Node 磁盘退出／COMMIT 未知恢复，以及 G 的完整出口与剩余两个根测试注册均 OPEN。冻结 Stage66 / Store43 仍只是声明案例，未记为执行通过。P1-04/05、B1b 和 Phase1 仍未完成。

下一项仍按原批准范围连接固定 Runtime 规则，然后 E/F/G，不重新拆包索批。没有 Git 写入、云端 CI、依赖／新值、真实 Native/helper/collector/model、新代理／会话／工作树、用户数据库或 R4 复用。原 Native timeout UNKNOWN、main CI取消结算未查询、C1/C2、R4非pristine及R1证据限制继续保留。
