# R011 历史与 Stage 详细契约作者评审

日期：2026-10-25。对象：[详细DCP](../specs/2026-10-25-phase1-r011-history-stage-contract.md)。结论：**H1存储/捕获方向可书面评审，详细DCP待接受；H2/H3映射附约仍有阻断；无实施授权**。作者自审，无独立review、SQL执行或数据库验收。

## 实码支撑与修正

1. C3-A直接检查schema version10，不能把“已有真实capture”理解为R011可用。DCP保留旧公开门禁，新R011路径复用编码核心但必须证明旧字节/错误/预算兼容。
2. migration runner对backupRequired=true直接拒绝。DCP提议新增事务迁移false，不虚构已存在的自动备份流程；这是待用户接受的显式选择。
3. R009当前candidate及Source/Code会变更。历史副本不能FK到这些当前行；五表关系外壳保留独立不可变历史、Syntax origin/current projection及活动成员。SQL FK之外的所有语义关系须由writer/capture验证。
4. 同fingerprint下旧writer改变支持、覆盖后又写回相同值，单次hash比较不能记录中间失效。DCP提议十一表33个失效trigger和四表8个不可变trigger；这两项数量由明确表×操作导出，是DDL结构，不是新的运行门槛。联合writer最后发布pointer，rollback同时恢复旧pointer；Source独立CAS不触发这些失效器。
5. 初次Syntax origin identity、current projection identity和manifest identity存在潜在自引用风险。DCP分别排除id自身，先最终Code basis，再初次origin，再current projection，再manifest；Code digest不含Syntax。
6. Providers未有Canonical Syntax normalizer，raw不带confidence但Canonical必须有。已在DCP§10明确阻断H2/H3计划，禁止默认数值，H1不生成生产Syntax或历史。不能把此问题记成“后续随意实现”。

## 设计覆盖

| 原启动评审缺失项                              | 本次状态                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| R011表/PK/FK/索引/不可变/legacy失效           | DCP§2明确DDL与精确trigger展开规则；尚未执行，约束正确性仍待独立Fixture     |
| 版本/checksum/备份/失败/回退                  | §1/2.2明确无backfill/false/no-down/原runner事务，实际SQL冻结后计算checksum |
| history/member/Syntax身份编码                 | §3明确域/正文/排序/来源/投影；新身份契约待接受与独立golden                 |
| capture/Stage API、所有权、错误/预算          | §4/5明确接口和状态；Storage只依赖IR，Runtime固定规则port不授权限           |
| full建立、foreign重验证和legacy reader/writer | §7明确拒绝隐式继承、旧四writer及R010摘要不兼容；旧图last-good不删除        |
| 锁内CAS与每个写入边界恢复                     | §6列顺序、故障/COMMIT未知/close失败/真实重开矩阵；本轮无DB执行             |
| Fixture/Quality Gate追踪                      | §8设计族映射H1–H5；未创建Fixture或注册虚假数量，原Gate保持                 |
| Raw→Canonical Syntax映射/confidence           | **§10明确未闭合；阻断H2/H3计划，不阻断H1组件设计**                         |
| 真实进程/准入/资源、生产Runtime               | H5另案；没有新增运行/数值/profile/云端权限                                 |

## 待用户集中审阅的选择

- R011 JSON关系外壳与保守legacy失效机制，及旧C3-A仍只支持R010的兼容策略。
- 纯新增迁移backupRequired=false、不猜测backfill、不就地downgrade。
- 新持久身份/捕获/lease/事务契约，首次full必须重新验证拟激活全部Provider来源。
- 先只给H1写精确实施计划；H2/H3须先补映射/置信策略附约，H4/H5依赖不变。

## 验证与限制

2298前序hash在本轮开始匹配。前序810Node/build/architecture17/registry52-26/catalog0仅是历史证据，未重跑。本轮核验新文档相对链接、格式、范围diff、14份旧文档原文/EOL后缀、全部非文档前序文件哈希；receipt见.superpowers/design/2026-10-25-phase1-r011-history-stage-contract/design-verification.json。

本次只写文档/设计证据，不编译、运行产品测试、执行SQL/数据库/Native/helper/Rust、建立索引、改profile/阈值/依赖、触发云端CI或Git写入。原证据、失败、Fixture根与R4保留。没有独立review或真实故障恢复PASS，H1–H5及B1-B2/C/D/P1-04/05/Phase1仍未完成。
