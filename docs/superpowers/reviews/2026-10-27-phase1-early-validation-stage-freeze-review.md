## 组件输入可携带性检查点 — 2026-10-27

已将36份封存组件输入整理为库内可携带材料：24份JSON按标准库gzip保存原payload字节，12份JSONL不变，loader校验存储/解压摘要与原byteLength。六处消费者不再读旧私有输入；未从产品生成expected、未修改.prettierignore或格式门禁。原目录与无旧私有输入复制目录四组均212/212，0fail/cancel/skip/todo，含19个真实Node退出；不同环境重复不累计为424。架构17项目通过，产品/编译产物未改。[本轮作者评审](2026-10-27-phase1-component-reference-portability-review.md)记录Windows路径及辅助代码首轮失败、最终转绿和可复现入口。

新增材料为原Fixture根附加参考39文件，不新增Fixture ID/门槛；原2241 Fixture字节、所有历史原文/失败保留，registry61/exactPhase1 35/catalog0。原Stage66/Store43共109项已逐项映射输入/期望/基线摘要、相关组件证据及缺口，尚未执行的原case全部保持OPEN，不以组件数冒充验收。

本记录替代下方“组件必须读取旧W输入”的历史限制；.superpowers仍仅作证据/临时输出而不提交。D/E/F IN_PROGRESS、G OPEN；独立整操作预算、完整原Fixture与较宽旧快照恢复仍待，B1b/P1-04/05/Phase1未完成。原D..G顺序继续，无新增Native、校准、profile/依赖/数值、CI或Git授权；timeout仍UNKNOWN及全部既有风险不变。

## ABA 与 Store 组件新检查点 — 2026-10-27

获批ABA私有SQLite见证及实际查询记账3→5已实施，同/另连接ABA拒绝；Store锁内资格、一次lease消费、原子持久写入、未知提交只读判定和清理诊断已接入。19类实际SQL边界异常与真实Node退出38/38。[作者组件评审](2026-10-27-phase1-stage-aba-store-component-review.md)记录全部RED→GREEN及范围限制；下方待批准/无Store/ABA仍RED等为保留快照。

最新集中本地回归15文件609/609，0fail/cancel/skip/todo；Storage/Runtime build exit0，架构17项目通过。Stage37/Store69是组件结果，不代替原Stage66/Store43逐项验收。原Fixture2241字节、registry61/Phase1 35/catalog0保持，全部历史失败/原文保留。

D/E/F IN_PROGRESS，G OPEN；独立整操作预算reference、完整66/43映射、可携带Fixture整理及较宽原始快照恢复仍待，B1b/P1-04/05/Phase1未完成。组件数据仍在私有证据目录，不可提交.superpowers或声称干净checkout/CI就绪。原D..G已批准，后续顺序推进无需逐小步骤确认；无新增Native、校准、依赖、数值、云端CI或Git写入授权。Native历史timeout仍UNKNOWN，既有风险不变。

# B1b 前置验证、真实 owner/观察及最终冻结组件评审

2026-10-27。AUTHOR_COMPONENT_REVIEW / NOT_ACCEPTED_AS_COMPLETE。已批准的三方法修订实施中；D/E IN_PROGRESS，F/G OPEN；完整 Stage66、Store43 和 Phase1 均未验收。按 code-reviewer 模板作者复核；用户要求同会话顺序执行，未派代理，不是独立整分支评审。

## 已实现的范围

- 固定 Runtime 端口精确为 prepareJavaOwner、validateObservation、compose；private index/wire/config 不开放。前两者复用原 Providers Java/v5/normalizer/full/R0/owner-map 校验，原 compose 算法输出保持。Java 元数据按自身 UTF8 顺序验证；与 H1 inventory 的完整记录按 ID 比较，不改任一排序契约。
- Stage 从真实同库 capture 重新推导范围/units，校验完整 Java 原 NODE 与规范化节点对照，计算已批准 javaRowsDigest/owner 正文；无 Java 原三例字节不变。原始 raw 副本、Source、scope、同实例 owner、原 checksum/provenance、完整 JSONL 与端口声明逐项比较；仅删除 null 不运行 raw 规则。
- freeze 只调用一次 compose；Storage 重新验证完整 H1、Code identity、全量 typed supports/losers、未影响旧支持与 origin、实际 snapshot/diagnostics、物理 coverage multiplicity、成员和 projection/origin。固定 TEMP 全内容封存，内部 WeakMap opaque lease；尚无 Store 消费者。
- 原始完整 snapshot 目前只从已验证祖先 archive 恢复并与 SQL 实存投影精确比对；不从缺失字段制造 diagnostics=[]。更广的旧原文恢复/兼容和整操作独立 budget 仍 OPEN。
- 分阶段消费和保留表示持续累计，异常也导入实际消费。最终 compose 用内部 WeakMap 留失败 receipt，原纯组件错误类型/码保持；Stage 失败安全撤权。收据一致性测试不是独立整操作算术或 RSS 合格证明。

## 独立预期与完整调试记录

证据根 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/。

1. 上次 owner seal 唯一不匹配项是 verifier 自己尚未写完的 log；8406其他项含全部 Fixture 匹配。owner-preparation-verification-successor.json 仅更正该已结算 log 摘要，原 seal、日志和错误保留。新 seal 排除所有自身活动 label 变体。
2. early-java-independent 首稿在 Java 产品前冻结原 raw NODE/原完整 expected canonical 对照及批准的 SHA256 公式。首轮 callable94/99：原 pure Fixture locator 来自 C:/b1b-component-fixture，与实际 Java request 的 /fixture/repo 无关，严格新校验正确拒绝。v2 独立按原 C3A 计算 locator426090...及 unit tuple；仅新声明上下文适配，原 raw/Fixture/节点/Java 摘要不变，首稿/失败保留。
3. Runtime25/25，随后 Native inventory 逆序和安全异常收据 callable RED→GREEN27/27；加原增量 I01/I03 控制29/29，原 compose failure receipt missingAPI RED→GREEN。旧 pure compose 成功输出和原错误保持。第一次 type build 的 path/name brand 比较按原 String 适配修正，不用 cast 绕过。
4. stage-observation-independent 在 Stage Java/accept 产品前独立冻结3组 Source-only SQL、完整 owner 正文/摘要、原 tuple 重绑定 raw 字节。首次20/23，仅原字节被 JSON own 误扫导致正例失败；分开已计费的二进制副本与 JSON 声明，23/23。恶意端口少返回事件 callable RED→完整 bounded UTF8 JSONL 一致性检查，25/25；重入不能在失效后发 owner。
5. stage-freeze-independent 在 freeze 产品前，从旧独立完整 target 和新 owner/raw 上下文重算全部 unit/origin/projection/manifest 身份；先经既有 H1 结构/pair 审核，不从新 freeze 生成 expected。首次30/33，错误使用 SYNTAX 而非原 v5 SYNTAX_OBSERVATION；只修正新检查名，33/33。仅删 null 记账分支 callable RED→GREEN1/1，保存真实旧快照/coverage。
6. 十文件473/473 早于状态矩阵作者发现，不能当最后全范围绿色结果。原冻结 STATE_MATRIX 明确非法调用 next=当前状态；新实现误把非法调用也永久撤权。新矩阵路径 callable RED，修正 allowed-state guard 放在数据验证 catch 外，保留真正验证失败/重入撤权；只纠正新组件测试的错误预期，原 Fixture不改，35/35。
7. Store SQL 三个独立完整目标和10个 missingAPI RED 已准备；共享辅助仅提取本轮新建部分，旧 r011-history-fixture 不改。没有 mixed-analysis-store.ts 产品文件，没有 Apply、锁内 CAS、竞争、崩溃或未知 COMMIT 产品实现。

## 最新实际门禁与阻断

- early-stage-component-storage-build、runtime-build exit0；7个产品/原新测试及2个新测试辅助/Store测试共9文件显式格式化；early-stage-frozen-final-architecture17项目通过。
- **early-stage-component-final-cohort：10文件476测试，474PASS/2FAIL/0cancel/0skip/0todo，68174.7687ms。** 唯一失败为同连接和另一连接的 pointer ABA；不能合计旧473/35等重叠结果，也不能将最终 cohort 记为通过。
- 两项 ABA 证明持久行相等仍能发生 pointer往返。额外 aba-counter-materiality1/1 只测量 SQLite 原生计数：同连接 total_changes11→13，另一连接原 data_version1→2，行集均相等；不改变产品/预算。
- 自动审批拒绝尚未执行的 epoch/内部预留3→5变更，认为属于未批准数值/记账语义。修复未应用、未绕过；当前实现仍预留3，没有 databaseEpoch。具体可评审[提案](../specs/2026-10-27-phase1-stage-aba-witness-proposal.md)为 PROPOSED，需明确确认。
- 全部2241旧/新增已冻结 Fixture 字节不变，registry61/exactPhase1 35/catalog0；新 Stage/Store/validation 单元文件未冒充 G 根注册。Stage66/Store43 未执行验收。

## 评审结论

**Important：ABA 资格漏洞尚未修复，阻断 Stage/Store 验收。** 不因数据最终相等或部分测试通过而降低原 pointer-aba 门禁。推荐批准原生 SQLite 两个私有见证并按实际成本计账；相关 Source/锁内/CAS 链继续等待该修订，其余已批准范围和完成记录保留。

已复核 Source/typed identity、C3A/H1 编码、原始 Java/full/R0 复用、caller 对象所有权、安全错误、累计计费、旧支持/原文保留、TEMP seal及一次组合。普通 TEMP DDL/reopen 负控制已过，不宣称全部恶意 ABA/ownership 场景已经合格。

未设为“范围外”而丢弃的任务：完整旧 snapshot 恢复、capture→Stage→port→Store 独立预算、原 Stage66/Store43 状态/竞争/每写故障/只读磁盘/Node崩溃/COMMIT未知恢复、旧4 writer兼容、G注册/架构/追踪/整包评审，全部保留 OPEN。真实 Native/Source producer/run/RSS/profile 资格属于既定后续门禁，本组件证明不覆盖、不伪造。

无 Native/helper/collector/model、校准、新数值/profile/依赖/migration、云端 CI、Git 写入、用户 DB/R4、代理/新会话/工作树。Native timeout UNKNOWN、main取消结算未查、C1/C2/R4/R1及依赖起点限制不变。
