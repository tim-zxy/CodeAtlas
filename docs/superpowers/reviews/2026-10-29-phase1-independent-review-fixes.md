# Phase1 A-local：独立整包评审与一次修复收尾

2026-10-29，A_LOCAL_DECLARED_COMPONENT_EXIT_ACCEPTED。退出只涵盖明确声明的 Node/SQLite 组件，不代表真实 Source/Native/profile、生产路由或 Phase1 整体验收。

评审和产品修复发生于2026-10-28；2026-10-29核对已完成的最终运行并收尾，不改写旧收据或重跑已完成门禁。

## 评审与修复

同一 /root/independent_review 在额度中断后按用户“继续”续接只读整包评审，最终结论 CHANGES_REQUIRED。未跑测试/构建/Native，未修改文件或派生代理。父代理将四项均按实际影响归为 Important，在原批准范围完成一次修复；没有第二次独立评审。发现及定位保存在本包 independent-review-findings.json。

| 发现   | 原契约缺陷与修复                                                                                                                                                | 验证                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IR1 P1 | Stage 分别验证 DTO basis 与 manifest hash，却缺少完整值对应。现在发 lease 前比较 nodes/edges、Evidence/bindings/factEvidence 与原始 candidate，复用已拥有数据。 | rehashed manifest-only edge 先 RED 后 GREEN；node/candidate 拒绝控制及成功 Store→新只读 H1 AVAILABLE/basis/activation 精确比较。                              |
| IR2 P2 | 旧R0公共metadata契约为H1顺序，B1b私有桥接metadata为Native UTF-8顺序。现在旧公共结果/计费保持，只有既有私有continuation按ID比较完整记录且保持Native排序。        | partial Python raw + BMP/astral OTHER Source 正例；Native 逆序、记录不同、H1 逆序拒绝。                                                                       |
| IR3 P2 | 局部准备预算仅成功后合并。私有路径现在准备前共享账本，公开 API/成功成本不变。                                                                                   | scope-schema/metadata-context 独立失败前缀 RED→GREEN；终端 checksum 完整前缀、非零 prior、Runtime 失败用量及 Stage 导入精确相等；Stage 永久失效且持久像不变。 |
| IR4 P2 | H1 numeric 交付行后才检查预算。现在 SQL 前检查剩余行，成功计数不变。                                                                                            | prior rows+1 仅交付已支付的 user_version，encoding 未执行交付；事务/全表不变。                                                                                |

首轮7项有5失败/2通过；IR2当时误用公共R0，属于测试假设错误，其余4失败对应IR1/3/4。IR2后续通过既有私有Provider入口及原位置谓词观察真实INVALID_CONTEXT RED；按原公私边界修正后，10项控制与旧R12/G02共12/12通过。original-candidate首稿用错valueDigest域，原稿保留；按既有 DECLARED_HISTORY_CANDIDATE_V1 包装编码修正后拒绝控制通过。最终10项新控制已包含在Stage root；R12/G02属于兼容范围，12项定向与整包收据不重复累计。兼容首轮1268/1270的两项失败、旧首稿和诊断完整保留。收尾工具准备时出现JavaScript模板字符串引用错误，尚未执行命令/写文件；工具调用和诊断保留，不记为产品失败。

## 新鲜验证与有界验收

Providers→Storage→Runtime构建、IR类型exit0；Code75/75、Syntax59/59、Stage333/333、Store288/288、原34文件兼容1270/1270，全部0fail/cancel/skip/todo；架构17及范围格式通过。独立旧模型重新纯计算，完整结果/成本/身份/22表预期不变；不修改golden、不从usage回填。新增失败前缀来自原ledger与JSON/树计数，Unicode语义正例不扩大原ASCII封闭资源模型的资格。

[109项显式本地绑定验收](2026-10-29-phase1-a-local-bound-acceptance.json)逐条验证原input/expected/base摘要、binding、当前root准确PASS selector与共享资源/兼容门禁。原Stage66/Store43及历史map完整保留；只接受声明的上下文，不将旧generic alpha base冒充Native输入，不无条件改写历史“原整体Fixture接受0”。

原A..G/U0..U5的声明式本地组件范围退出；四root去重55文件，registry61/phase1 35/四ID各一次/catalog0不变。主任务仍4/21接受、17未关闭，P1-04/05/Phase1未完成。真实Source重验证/资源取消、Native/profile/H5及后续B～E仍按具体设计/操作包推进。

本次仅7个产品源码、对应31个src/dist文件及3个测试改变；2369个Fixture/参考文件、依赖/迁移/根注册不变。21份权威文档仅加补记并保留旧字节后缀。原稿/失败/封存/.superpowers全保留；无Native/helper/collector/模型、云端CI或Git写入。

## Rulings I made

- IR2评审把Native排序泛化到旧公共R0；原批准要求兼容旧R12，只在私有桥接作ID比较。按已有边界修正，无新增模式/Fixture变化；若判断错误会造成旧兼容回归或有效私有Unicode拒绝。
- Native/RSS/校准/profile/生产就绪维持OPEN，逻辑组件证据不证明实际运行资格；若判断错误会造成错误的运行资格声明。
- 原整体Fixture与P1-04/05/Phase1未签收，本次仅接受109显式本地绑定及共享门禁，父任务计数不变；若判断错误会扩大范围、虚假验收。
- 历史timeout/main取消/R4/C2维持原状态，timeout UNKNOWN，无新运行或结算证据；若判断错误会使风险记录失真。
- 修复未获第二次独立评审，依据作者TDD与适用完整本地批次验证；若判断错误仍有作者盲点风险。

Deferred minors：无；四项均已按重要问题处理。

下一步准备A-runtime的真实Source重验证、资源/取消及Native资格具体操作包，连同后续B～E设计任务集中审查。真实Native/profile/数值/依赖、云端CI与Git写入仍需各自明确批准。
