# C3-A Code Context Capture 实施作者审查

2026-10-23；用户已确认[具体计划](../plans/2026-10-23-phase1-code-context-capture.md)，实施依据为[已接受契约](../specs/2026-10-23-phase1-code-context-capture-dcp.md)。按约定同会话、原工作树顺序执行，不新建 agent；本报告为作者评审，未经独立 reviewer，不能称 merge-ready。

## 实现与证据边界

新增单一 Storage 模块和导出；三个 API 分别捕获、复核、释放。只读短事务与数字预检覆盖14表，完整 IR 与反向 census 不隐藏缺支持／候选／引用。Code 摘要包含完整 R009 候选、同 indexed revision 的所有 snapshots、必需 coverage 多重性；Source 和数据库 locator 独立绑定，historicalSourceProof 永远 UNAVAILABLE。

七文件 Fixture 在产品模块存在前冻结：A1-fixture-before-product-freeze.json。13个字面样本的预期由标准库 authoring 从输入产生，不调用产品 capture/hash/merger/数据库。临时 root 的 locator 与读取预算在首个 capture 前独立写入拥有样本；Code/Source 对照冻结字面预期。正例通过 session、Source.replace、normal staging/merge、Application Apply/patch；未直接写成功图或指针。补充 unresolved 样本同样在首次比较前独立固化；不冒称属于早于产品的原七文件冻结。

同 HEADER 的 beta display 变体保留相同 alpha 代表及 min-confidence，候选／coverage 摘要仍不同。真实 SQL get/iterate 交付行及 TEXT UTF-8 字节匹配独立 read-plan；三项控制精确边界通过、各减一拒绝。完整对象在编码前验证，scalar Unicode 顺序等价于 UTF-8，无 locale／整图 JSON／全量 TEXT all。未安装任何 profile 或数值门槛。

## Review Focus 对应

| 关注点                                           | 直接证据                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 同 HEADER 的 losing candidate／coverage 差异     | 13样本完整冻结 view 与 Code摘要逐项匹配                                                         |
| 空Code、WORKTREE历史S、多重性、typed ID／Unicode | 对应固定样本与真实SQL交付/精确预算测试                                                          |
| 巨大TEXT/BLOB、缺候选、孤立关系                  | numeric-before-payload、缺候选UNAVAILABLE、反向census与NEGATIVE_ONLY损坏控制                    |
| ambient、跨连接、关闭／重开、永久失效            | 两个真实连接正常提交；同JS对象重开；伪/Proxy/cross错误不伤原owner；失败后RELEASED；release无SQL |
| Source更旧／更新、classification、locator／顺序  | stale样本、正常Source.replace、locator负例；反序观察和等价JSON载荷排版；只读连接数据库字节不变  |

## 本轮发现与修正

- 初始测试准备：cleanup先于close导致EBUSY，尾部换行名称违反既有IR，NODE/EDGE共用Provider observation ID；修正新helper/独立输入，原失败和修订前文件保留。故意关闭连接的cleanup也改为检查实际isOpen，未改变生产session。
- 构建需EpochMillisecondsSchema验证品牌类型；连接isOpen是own accessor，使用本地已验证的native location(temp) brand检查，未读取结果载荷／运行child。
- 重复语义键、ACTIVE Evidence缺binding、candidate EDGE缺source node、Canonical unresolved目标缺candidate node，均有真实RED与对应numeric census修复；schema检查还须点名coverage物理id，不能仅凭列数。未加查询交付行或修改Fixture预算。
- 首次32文件回归400PASS/1FAIL/1TODO：严格Storage导出断言漏新模块；只同步该一行，保持assert.equal和依赖守卫。中间421PASS/1TODO为最后schema修正前证据，不作最终构建的通过记录。

原始日志全部保留于本计划 workspace。最终32文件回归：**422 PASS、0 FAIL、1显式TODO，共423项**；其中新capture测试100 PASS。Storage TypeScript构建通过；架构17项目通过；registry46／Phase1精确20，Syntax catalog0。最终日志A4-final-schema-matching-regression.log，收据implementation-verification.json。C1真实file-symlink EPERM仍是原有OPEN门禁。

## 实施裁定与局限

1. 沿用用户优先约束：不commit、不清理workspace／旧证据；只运行已批准的32文件范围，不运行包含未授权Native/helper的bare root gate。这不豁免后续完整门禁。
2. 同一JS数据库对象可以close/open；WeakMap对象相等不够。每个handle私有保留一个从不执行的 SELECT 1 WHERE 0 StatementSync；native close会终结它，setReadBigInts(false)无需SQL即可拒绝旧incarnation。release/失效丢弃marker，不增加公开构造器、连接wrapper或stage lease。若平台行为改变则必须拒绝/重新验证，不能借摘要复活。
3. coverage利用SQLite窗口的数字multiplicity/occurrence，仍逐条读取／校验／计费全部原始行，只在每组最后一行编码，避免前后payload重叠；未减少maxRows或删除重复语义。SQLite排序/cache/statement实体开销未被宣称为RSS证明。
4. 同步既有workspace结构测试的精确导出行，是批准Storage导出的必要配套；未授权相邻模块导出或依赖变化。原本已有yaml/Provider/Plugin/Evaluation变更保留。

Deferred minors：无新报告的小项。未闭合的实质范围仍为B/C历史Source/removal、stage冻结、normalizer/outcome、R011／锁内CAS／atomicApply、实际Native barrier/资源／故障恢复／新进程restart；需下一具体设计，不能把A的成功当作其实现。C1真实file-symlink EPERM仍OPEN；旧C2四次生命周期用尽；历史Native超时UNKNOWN。无新增依赖、迁移、profile/default／数值Quality Gate、Native/采集helper、云端写入或CI。

Declined to judge：实际磁盘授权／symlink安全由Source/Runtime负责；A仅绑定数据库locator。历史Source/removed与原子发布是B；实际进程/采集/profile是C。它们仍为明确未通过的后续门禁，未按“计划外”丢弃。

## 收尾与追踪

| 任务             | 本地状态与可复现证据                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| A1 独立Fixture   | 七文件初始冻结全部匹配；13字面输入正常工作流；原始RED与修订保留                              |
| A2 capture／预算 | 100项新测试中完整向量、每控制减一、numeric-before-payload、完整反向census与真实SQL交付账匹配 |
| A3 生命周期      | 同连接／cross／同对象重开／release／两连接提交／ambient和失败永久失效均通过；原库字节不变    |
| A4 注册／治理    | 32文件422PASS+原TODO、registry46/20、architecture17、格式与基线哈希见最终收据                |

前收据594项覆盖范围并非整个仓库：其中非文档/非ledger变化只有package.json的单次测试注册，删除该添加即可恢复原哈希。Storage index未在前收据内，已用Git HEAD核对仅新增一行导出；workspace结构测试前已有Phase1 yaml/Provider/Plugin/Evaluation变更，本轮只增加Storage期望行。最终收据扩大记录这两个文件。不得把有限哈希范围表述为全仓字节证明。

完整root verify、实际Native、HOST/NATIVE资源、独立review、联合Apply/进程restart和云端CI均未执行／未通过，不由范围回归代替。没有新未解决的A合同缺陷；后续推荐先写B0 Source-target输入与Code/Syntax完整性契约，评审后再开发B。
