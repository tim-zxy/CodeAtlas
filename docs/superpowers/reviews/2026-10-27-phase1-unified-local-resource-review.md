# Phase1 A-local 统一执行与资源证据作者评审

Status: LOCAL_GATES_VERIFIED / AUTHOR_REVIEW / INDEPENDENT_WHOLE_PACKET_REVIEW_PENDING。

本记录覆盖已批准 U0～U4，本次没有新增产品行为、依赖、数值政策、迁移或 Native 运行资格。主任务仍4/21接受、17未关闭；原109项绑定完整，原Fixture整体签收仍0，U5独立整包评审与最终退出待完成。本地门禁通过不能关闭P1-04/05或Phase1。

## 已执行内容

- U1：原partial Python raw DELTA完整scope/准入、全部Provider支持、Runtime前置与组合、同账本Stage观察/冻结、锁内Store及22表；旧opaque unit、外部与未变Native支持均保留。
- U2：原retained/仅删除上下文，完整旧origin/祖先/Code核验，原3个origin仅1个进入当前成员；origin字节不变，仅当前basis/support摘要/projection变化。raw=null只走原删除分支，无前置raw回调。NO_OP验证完整Runtime、同一历史身份、持久像不变且不建立Stage或事务。
- U3：active FULL/partial DELTA/retained三个非空上下文15个事务/只读恢复向量、5个回滚不确定向量，以及原19类SQL边界完整独立前缀。未知提交不重试同lease，开放事务返回INCONSISTENT且只读；测试仅释放自己注入的隔离事务。原真实Node退出证据先按适用性复用，最终G Store入口按原协议完整执行一次。
- U4：仅追加缺失的Stage/Store两个package测试入口；两个已有入口扩展必要分组。四root去重覆盖55个文件，无漏项，无需修改八个旧注册守卫或61/35计数。按原顺序构建及集中检查。

本次新增15个独立测试参考模型、7份reference、9个测试文件。独立模型只导入标准库和既有独立参考原语；从原字面输入、语义/SQL配对与契约计算结果、身份、逐段账本、required/TEMP/seal和持久像，冻结后再调用产品。无usage回填golden，不把逻辑预算当RSS。测试侧复用已冻结的独立模型骨架，保留旧模型/Fixture/失败原样；限定原封闭输入，不宣称通用资源预测器。

## 最终本地证据

| 范围                          | 结果                              | 收据标签                                                  |
| ----------------------------- | --------------------------------- | --------------------------------------------------------- |
| Providers→Storage→Runtime构建 | 三项exit0                         | unified-g-providers-build / storage-build / runtime-build |
| IR类型                        | exit0                             | unified-g-ir-types                                        |
| Code root                     | 75/75，0fail/cancel/skip/todo     | unified-g-code-root                                       |
| Syntax root                   | 59/59，0fail/cancel/skip/todo     | unified-g-syntax-root                                     |
| Stage root                    | 323/323，0fail/cancel/skip/todo   | unified-g-stage-root                                      |
| Store root                    | 288/288，0fail/cancel/skip/todo   | unified-g-store-root                                      |
| 原34文件兼容范围              | 1270/1270，0fail/cancel/skip/todo | unified-g-old-compat                                      |
| 架构                          | 17项目通过                        | unified-g-architecture                                    |

这些最终root已经包含本轮此前20/20、15/15、5/5与前缀19项的适用检查，不与历史或局部收据相加。收据均在本包.superpowers目录，包含准确命令、退出码、隔离根和完整日志。没有执行含真实Native的全仓verify，也没有取消/未执行检查记PASS。

## 首轮失败和裁决

1. scope3通过而candidate2资源失败：新参考漏计既有tuple返回domain:id表示及array/field/result访问。依据既有源码补齐，仅新参考变化；原模型/JSON/RED收据保留，5/5转绿。
2. 准备脚本出现局部变量重名、字符串语法和错误选中raw DELTA提交后像：保存原脚本和诊断，原输入深比较拒绝错误复用，改用已冻结且原输入完全相等的owner语义配对。初始化异常不冒充产品RED。
3. retained Store新测试多传了过时raw参数：保留原测试稿，修正调用后同项通过；产品/参考计数不变。
4. 原19边界首轮18/19：Code读取入口前剩余额度为0被remaining()正确拒绝，尚未到SQL注入点。新参考加入既有正剩余准入见证1，全部消费计数及其余18项不变；定向1/1，最终Store root全绿。见证不是新增profile或虚构收费。

Ruling：在U1的共享历史/scope模型闭合时一并冻结U2无观察候选和NO_OP，不等待U1所有Store检查才重复准备同一输入；属于统一计划允许的共享静态输入，仍单会话顺序执行。成本是共享模型变化需回归所有消费者，最终四root已覆盖。没有新契约裁决。

作者检查未发现需要修改产品的新增缺陷。新模型少量scope说明沿用前驱的保守限制；以本评审和各reference qualification的准确原输入范围为准，不扩大资格。独立整包评审仍不可由本作者检查替代。

## 保留与边界

补记前9849项前驱摘要，除批准的package.json及两已有root注册文件外全部相同；2347个旧Fixture与374个产品src/dist字节不变。原109 input/expected/base和executionBinding仍在，registry61/Phase1 35、四ID各一次、catalog0。本轮没有产品修复，不重复无关构建/校准；G规定构建均只做一次。

21份权威文档仅加本次实现/证据补记，旧后缀逐字保留；全部旧Fixture根、失败、历史文本与本地EOL保留。没有reset/stash/stage/commit/push/PR/merge、依赖安装、真实Native/helper/collector/模型/profile、云端CI、新会话/工作树/代理。R4 post-trial mutable DB不作为pristine，不改C2寿命；历史Native timeout仍UNKNOWN，main取消结算未查询。

## 尚未退出

[统一执行包](../plans/2026-10-27-phase1-a-local-remaining-unified-execution.md)的U5需要一次独立整包评审、必要修复与最后签收。此前禁止自行新增代理，因此没有自动派审；具体只读评审材料已备好。未来A-runtime及B～E未审设计/真实运行不由本记录授权。保持Canonical IR独立、SQLite authoritative、LLM candidate-only、AUTO/MANUAL及ExecutionGraph→RuntimeFlow→BusinessFlow。

## 封存核验补记

封存工具首轮仅在SQL行排序比较失败：JSON.stringify(row)依赖对象字段插入顺序，重建SQL行与原目标字段顺序不同；使用既有historyCanonical按完整行排序后再比较，保留全部字段、raw JSON和重数，不改变任何目标/产品/门槛。原核验脚本与完整stderr保存；不把该工具错误记作产品失败，不无故重跑四root。
