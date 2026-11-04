# B1b DELTA／NO_OP、owned 读集及 Stage 所有权基础检查点

2026-10-27。LOCAL_COMPONENTS_VERIFIED / D_IN_PROGRESS / E_IN_PROGRESS / B1b_NOT_COMPLETE。原批准 D..G 顺序推进；作者复核，不是独立或整分支评审。本次无新增批准请求。

## 本次实现及硬边界

固定 Runtime compose 现在支持 FULL 和 DELTA；DELTA 自算 scope，复用原 R0/R1 和 H0。NO_OP 返回旧 activationId/basis，无 manifest／Code 写入行／新 Syntax；仍先校验当前 Code、完整旧成员和祖先，不接受多余 raw。仅删除接受 null raw，保留所有旧 snapshot／physical coverage，明确 retire 受影响 origin。retained 原始正文／confidence／extractionVersion 不变，完整原引用及旧上下文先验证，再对最终值和 basis 重投影；不会借退休忽略坏 origin。三组 raw 增量保留完整原 typed 支持／loser／foreign 未变支持，并复用原 selector。当前输入仍是声明式数据，真实性、owner/Source/root/run、真实采集授权不能由 DTO 或 component-fixture qualificationRef 授予。

H1 私有默认 adapter 接受真实同 DB opaque capture handle，保留原 capture 与此前每次私有读取的全部 rows/UTF8/items/logical pins。旧 capture/recheck/release 形状、原分支计费／错误结果不变。私有读取保留实际 Code entries、pointer 链 archive、当前 origin/projection、全仓 snapshot ID census、原始 snapshot/capability/physical coverage（含 INTEGER 时间与 coverage.id）、所有本仓 history 原行；均先做 SQL 字节／行数预检。它不从 SQL 缺字段发明 diagnostics=[]，也不把未校验 archived raw rows 变为历史资格。详细读集始于这个有界私有重读；此前公开 capture 只见证其原 Code/H1 view 与 committed count，不虚称更早已存完整 census。完整原 snapshot registry 的恢复选择与 Stage 独立验证仍待连接。

新 MixedAnalysisStage 目前只有真正同连接 constructor/close 基础：WeakMap 私有所有权、固定 mixed_stage TEMP 表、真实 capture／累计账、拒绝第二 Stage／预存在表／代理与异步规则／ambient transaction。statement marker 与 TEMP schema incarnation 防止 close 删除普通重建或重开连接后的同名表；close 删除重型私有记录，用 WeakSet 墓碑保留幂等，不代调用者释放借入的原 capture。后续 prepareOwner、acceptObservation、freeze、opaque owner/lease 尚未实现；不能据此记 Stage66 为通过。没有 Store 文件或 Apply，Store43 同样未执行。

## 证据与调试历史

证据根 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/。启动8141项前置 seal 全匹配，原 Fixture 文件不修改。

- runtime-delta-independent 首稿9例经原 H1 结构／pair 审核后，源码复核发现新参考稿误加了 H0 摘要域。H0 是 unsalted canonical SHA256；保留首稿，在产品 delta 编码前固定 v2，并精确复现原 R1 historyDigest/ledgerDigest。Code 参考公式精确复现四组既有完整目标。
- fixed-runtime-delta-red：原仅 FULL 端口拒绝九组新正向预期。首个可调用67/70：NO_OP四组、删除全部／删除Python及旧 origin／readset 负控制通过；三组 raw 正确拒绝旧请求占位 aaaa basis。
- v3 transport 适配只更新 basis/checksum，原严格门禁仍以 INVALID_REQUEST 拒绝遗漏 owner-map tuple 与开始／结束回显的请求。v4 完整重算原 established tuple（先复现原 ownerMapDigest），更新 basis、结构绑定回显和协议 checksum/provenance/ledger；保留原 Stage c digest 作为声明，不伪造真实 owner。全部旧／v1／v2／v3 字节与失败保留，原 Source 和 raw Fixture 根未改。v4 是首个 delta callable 之后的精确 transport successor，不虚称全数最终字节在产品前冻结。
- fixed-runtime-delta-v4-first-callable70/70；加入确需完整祖先的第二次激活 NO_OP，以及三分支 receipt exact/one-below 后74/74。receipt 控制是动态一致性检查，不是独立整操作算术/RSS 资格。
- owned-capture-adapter-red → 初次91/95：旧90 H1 和所有权负控制通过，新增读集错误假定 SQL 全为 TEXT。按原迁移修正整数时间／physical coverage.id 和其 CAST 字节，保留完整原行，95/95；再补 pointer 变化、连接重开和真正重开前完整行对照。
- Stage ownership-api-red → constructor/close4/4；proxy 输入可调用 RED 证明 instanceof 在代理拒绝前执行 trap，修复顺序并拒绝 async/generator/proxy port，5/5。
- Stage row-prereservation-red 证明少一行预算时仍先 CREATE TEMP；修复为进入私有重读前预留准确三次既有 SQL 行消费（TEMP preflight、schema version、INSERT），6/6。三是实际操作计数，不是新 profile／阈值。数据体／SQL 拷贝也预先记账。
- 最终 delta-stage-final-cohort **九文件415/415，0 fail/cancel/skip/todo**，37593.6704ms；包括 Runtime、H1、Code identity、Code reader、Stage foundation、mapper、旧 full、R1/register 与 H1 corpus。与旧74/95/101/409等重叠，不相加。Source/IR/Providers 产品不改，未无故重跑旧完整回归或校准。
- Storage/Runtime 最后构建 exit0；delta-stage-final-architecture17项目通过；registry61/Phase1 35/catalog0。新增 Stage 单元文件尚未增加根脚本注册，须完整 E 后按 G 补齐。

## 作者复核、裁决与剩余

按原 code-reviewer 模板复核完整输入/输出、H0/H1 两种摘要、祖先闭包与不可变 origin、真实 capture 对象、SQL 所有权／数值类型、累计计费、TEMP schema 生命周期和依赖方向。身份／IR/wire／迁移／置信策略和公开 index 不改。重建同名 TEMP 的 SQL 阴性控制仅证明已执行的普通 DDL 与连接重开场景，不宣称任意恶意宿主或全部 ABA guard 已完成。

Ruling D5：D 的最终 owned 上下文与整链 budget 来源是 E 的真实 Stage，因此在 pure D 通过后先实现 E 所有权基础，再完成 D↔E 集成；不能以任务编号先后为由把 caller 数据标成 owned。若裁决错误会错误耦合或误授权限，故 D/E 均保持 OPEN，freeze 和 Store 必须再次独立验证。

仍缺 prepareOwner 的原 Java／scope／owner-map 绑定、strict acceptObservation、一次 freeze 的完整输出与 TEMP seal／opaque lease、完整原 snapshot registry 恢复及 capture→Stage→port→Store 独立预算证明；F 原子提交／锁内 CAS／竞争／写入故障／Node crash／COMMIT 未知恢复与 G 整包门禁全部 OPEN。Stage66/Store43 只是冻结声明，不能计为执行通过。下一步继续原批准 owner/observation/freeze，再 Store，不要求重新批准或逐步确认。

P1-04/05、B1b、Phase1 未完成。没有真实 Native/helper/collector/model、校准、新 profile／值／依赖／迁移、云端 CI、Git 写入、新工作树／会话／代理、用户 DB／R4 操作。原 Native timeout UNKNOWN、main取消结算未查、C1/C2、R4非pristine、R1报告和依赖起点限制继续保留。
