# Phase1 B1-B1 声明历史转换：实施作者评审

日期：2026-10-24。类型：AUTHOR IMPLEMENTATION SELF-REVIEW，非独立评审、集成或真实运行资格。

依据：[已批准计划](../plans/2026-10-24-phase1-history-transition.md)、[已接受设计](../specs/2026-10-24-phase1-history-support-design.md)、[计划作者评审](2026-10-24-phase1-history-transition-plan-review.md)。用户“批准”授权本会话顺序实施T1–T3；未扩大Native/DB/CI或后继B/C/D范围。

## 结果

T1–T3达到 **LOCAL_DECLARED_HISTORY_TRANSITION_CONTRACT**。两个Providers私有模块提供 owned严格输入、声明历史/当前完整状态一致性、Source全字段差分、Python逐文件/Java全投影组依赖、旧支持RETAIN/SUPERSEDE/INVALIDATE、其他Provider重验证拒绝、来源coverage与Syntax最终basis重验义务。它们不接受旧winner冒充R009原候选，不给旧origin换快照或时间。

输出只是冻结的转换草案与一致性摘要，没有完整新Canonical图、authenticated/ready/applicable字段、真实Source/运行所有权、Stage lease或Apply路由。历史parent只检查显式单前驱自指/跨库，不宣称完整链无环证明。私有valueDigest只绑定声明候选副本，不能认证一致伪造的数据，也不替换旧Canonical/SupportRef/digest算法。

## 新鲜证据

| 验证                       | 本轮结果 / 回执                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Providers构建              | exit0，final-providers-build.json；失败TS2322另保留                                                             |
| 批准的27文件Node范围回归   | 662PASS/0FAIL/0SKIP/0TODO，final-node-27.json/log；其中新3文件136项，原24文件526项                              |
| 架构边界                   | 17项目通过，final-architecture.json/log                                                                         |
| 独立Fixture                | p1-history-transition-draft-v1，18族46组字面input/expected，95文件；原预期字节全部不变                          |
| 注册                       | 原root序列保留，仅追加3路径各一次；registry51、exact Phase1 25、新ID一次、Syntax catalog0，由新oracle实际断言   |
| 最终测试输入               | final-test-inputs.json固定130路径，含新源码/编译JS/3测试/旧cohort/Fixture/真实catalog与root；执行前后再次验哈希 |
| 格式、链接、原文与冻结核验 | 由implementation-verification.json列出实际命令和计数；不是产品回归替代品                                        |

证据目录：.superpowers/sdd/2026-10-24-phase1-history-transition/。实际HEAD仍cc5a8cb571986c5e56ed04053b2c96ef500fcacb，branch codex/p05-integrated-exit-audit，C工作树未提交内容由哈希回执绑定；未推送、提交或触发CI。

## 作者发现、RED及修正

1. 独立语料作者脚本将structuredClone直接作为Array.map回调，索引误作options，首次停在冻结前。保留首版，第二版单参数包装完成；已有部分相同JSON只核对，不覆盖。
2. 新入口缺失API RED与可调用壳behavior RED分别留存。T1有效历史/错误分类、T2 Python保留和外国Provider过期拒绝的断言均曾实际失败；不是只用导入错误声称行为RED。
3. 初次T1构建TS2322未把provider.factType联合类型收窄为NODE。修正历史分组重建的字面类型，同时仍与原binding精确比较，不能借类型修正强制接收错类型。
4. 评审补出Native支持可跨两个Python单位、数字键顺序及深层递归栈问题；先有review-input-red与review-deep-red。修正为单Native依赖单位，以及预留等长有界表示后迭代按原字段顺序编码；没有降低深度/字节门槛或改旧摘要算法。
5. 合法ProviderFactRef中转义字符的JSON拼写序与字段原值序不同；review-ref-order-red复现，改为逐字段ordinal比较，JSON tuple仅作唯一性key。
6. 新增Python Source可误用未变Python单位ID，产生重复coverage；review-python-unit-alias-red先失败，修正为Python单位身份绑定exact Source ID，Java整组成员演化按原设计保留。
7. 第一轮新契约125项为124PASS/1个预期root注册RED，不报整组通过；T3仅追加3路径后通过，后续review新增边界进入最终136项。
8. Fixture格式检查46文件失败，未豁免。所有95原始冻结字节先复制到fixture-original-format；格式化后95个JSON值一致，所有expected字节不变。仅刷新当前raw input/manifest哈希元数据，保留原pre-product freeze与format-successor freeze；没有从产品重算goldens。
9. 最终输入审计先发现Providers dist/.tsbuildinfo变化而拒绝。精确核对原1789路径，当时只有package.json与该编译缓存变化；后者是批准构建的生成元数据，不称旧字节不变。旧JS/源码/IR/Runtime/Storage/wire/lock/profile保持前序字节；当前缓存/新JS另纳入测试哈希。

所有失败/旧freeze/作者脚本/日志仍保存，不重试云端、不删除失败或把未执行门禁记为通过。

## 合同与安全评审

- Source比较id/path/fingerprint/classification/language/sensitivity/repo/revision；路径交叉复用/跨revision/范围退出明确FULL_ANALYSIS_REQUIRED，不自动回退或读取SECRET。
- 声明当前值包含原candidate/confidence、支持、快照、coverage和membership，不能只凭相同WORKTREE/fingerprint接纳；其他Provider依赖过期为整体拒绝，不偷偷退休或保留成有效。
- 观察scope精确，Java range-less容器按整个组；零事实Source仍有coverage。移除完整单位可给无新snapshot的草案，不能伪造实际删除观察或Apply准入。
- 原支持关系复用collectMergeSupports按每个历史origin分别校验；当前声明选择复用selectMergedFacts，未放宽一次新MergeInput一Provider一snapshot。新delta完整merge/closure仍在B1-B2。
- 输入先做描述符/Proxy/Unicode/环/逻辑资源检查，输出与owned输入冻结，错误只有固定code；没有raw payload/路径/SQL/环境回显，无回调、自动重跑或外部副作用。
- 当前匹配/分组使用已有简单查找，部分为二次扫描；maxItems限制逻辑规模，但不构成性能或heap/RSS证明。没有无依据缓存/索引抽象；实际性能Eval仍未执行，不算通过。
- 没有公共index/旧调用路由/IR shape/SQLite schema/Native CLI/Runtime profile修改，没有新依赖或数值，也没有Deferred能力。

在本地声明契约范围内，没有剩余未解决Critical/Important作者发现；该结论不替代独立review或真实集成资格。

## 保留门禁和后继

B1-B仍OPEN：B1-B2完整delta assembler；B1-C真实历史捕获/完整链、R011物理schema、stage、最终Syntax owner/basis/valueDigest闭包；B1-D锁内CAS/原子Apply/回滚/重启/读者。当前Source独立CAS未变，不回填旧历史、不复活旧lease。真实Native/helper/准入/性能/profile、实际DB和统一CI都NOT_RUN。

C1真实文件symlink EPERM OPEN，四C2生命周期已用完，历史Native timeout UNKNOWN，main39708335128取消结算未重查，mutable R4未碰。P1-04/05与Phase1退出保持OPEN。下一步是B1-B2详细设计审查，并与C的真实历史/冻结契约协调；本次批准不自动授权后继实现、DB或云端写入。
