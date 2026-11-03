# B1b 固定 Runtime FULL 组合组件检查点

2026-10-26。LOCAL_FULL_COMPONENT_VERIFIED / D_IN_PROGRESS / B1b_NOT_COMPLETE。仅作者检查，未使用独立评审代理；不是完整分支评审或可合并结论。

## 实现与验证范围

新增 Runtime mixed-analysis.ts 和 Storage mixed-analysis-state.ts 私有同步端口类型；只实现 FULL，DELTA/NO_OP 明确拒绝而不降级。Stage 尚不存在，所有 capture 字段为声明式输入，真实性、完整性、owner/Source/root/run、准确 parent 和全库 census 必须由后续 Storage-owned adapter 提供并独立校验，不能照抄用户同名字段。空 profile catalog／生产路由及公共 index 未更改。

复用 full raw 准入和单位／typed 原支持／coverage，全部 loser 候选仍保留。先按完整未来旧表行和全库 snapshot ID census 计算 Code basis，再用固定已接受 mapper 生成每条 Canonical Syntax，构造完整历史并实际运行原 validateHistoryManifest/validateSyntaxPair。完整旧 snapshot 诊断不丢，旧 physical coverage 包含重复记录。FULL 可保留准确 parent、transitions=null，所有 Syntax 都是本次新观察。旧 ID 包括其他 revision 已占用时拒绝新 snapshot；foreign active Provider 无重验证路径则拒绝。

Provider 每段以上一操作总计数开始；Serialized cap 在调用前取剩余 bytes 与原 H1 剩余 logical-memory 容量，实际消费在 finally 导入同一 HistoryReadBudget，全部表示保守保留至结束。旧公开入口／计费不改。原 raw 和 owned copy 分别预先收费；UTF8 排序键只分配一次并先收费，原 Code BLOB 与 H1 UTF16 顺序分别保留。最终 receipt 包含当前纯组合的 rows/bytes/items/retained，Stage capture/SQL/pin 续接仍未接通；不得称完整操作收据。动态 exact/one-below 测试只验证 receipt 一致性，不是独立预算 oracle，也不是 V8/RSS/Native 内存资格。

## RED、调试与新证据

证据根 `.superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/`。

- fixed-runtime-full-red：新增七个测试因产品 API 缺失失败，其余既有49通过。
- fixed-runtime-first-build：syntax 数组类型与 Java provenance 字段假设失败；改为从实际 parsed Java 原字段复用原 provenance 构造，成功构建后才执行 callable。
- fixed-runtime-full-first-callable：53/56。完整 manifest/basis/origin 已匹配；失败定位为 selector fact-key 顺序不同于 Code 行键，以及新增旧 snapshot 测试漏 sourceRange:null。修正实际写入 DTO 顺序和这个新增非法测试对象，独立目标原字节不变；full-green56/56。
- fixed-runtime-raw-safety-red：真实 Buffer 自有 length getter 被调用一次；修复为 genuine byte view/prototype 检查、intrinsic byteLength、拒绝额外属性和伪字节视图，分配前收费。fixed-runtime-safety-green58/58。该测试同时证明错误拒绝不能以执行用户 getter 为代价。
- 首次格式化后的 fixed-runtime-final-cohort 六文件364/364；其后作者发现冻结输出会沿旧 snapshot／Source／coverage 引用冻结调用者，fixed-runtime-output-ownership-red 可调用复现。复用 H1 受预算 encode/parse 建立独立拥有的声明副本，原值／编码／解码均记账；输出不再 alias 或冻结调用者。最终 fixed-runtime-ownership-build exit0，fixed-runtime-ownership-final 六文件365/365，0 fail/cancel/skip/todo，完整范围／时长见 run.json。覆盖 fixed Runtime、Code identity、H1、mapper、旧 full 和 R1/register 兼容；不与旧58/364/1429/207相加。
- fixed-runtime-ownership-architecture：最终17项目通过。IR/Provider 产品未改，本轮未无故重跑全阶段或旧校准。

## 作者检查与下一步

依 code-reviewer 模板对数据来源、全部 Code 原候选、排序／域／full parent、snapshot freshness／诊断、raw 安全、计费、冻结和架构方向单独阅读。受界线性／二次查找复用现有模式，实际资源资格仍OPEN。未把声明数据、组件目标中的临时 c owner digest 或 fixture 根冒充实际 Source/Stage 证明。

D 的 DELTA/NO_OP、完整 owned capture/祖先重投影或退休、owner/raw 绑定与全链独立计费仍缺；E/F 未实现，Stage66/Store43 仅声明语料，G 余下根注册及完整恢复门禁 OPEN。下一步在原批准范围内完成 DELTA/NO_OP 和 owned adapter，再 Stage/Store。无新授权请求。

没有 Native/helper/collector/model、校准、云端 CI、依赖／数值／迁移、Git 写入、新工作树／会话／代理、用户DB或R4操作。Native历史 timeout UNKNOWN、main取消结算未查、C1/C2/R4非pristine/R1历史报告和依赖起点限制均保留。
