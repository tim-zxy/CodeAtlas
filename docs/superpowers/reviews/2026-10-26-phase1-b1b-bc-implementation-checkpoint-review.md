# B1b A/B/C 本地实施检查点与未决兼容边界

2026-10-26。AUTHOR_ONLY / LOCAL_BC_COMPONENT_TEST_CYCLES_VERIFIED / B1B_NOT_COMPLETE。范围依据：[已批准A..G计划](../plans/2026-10-26-phase1-b1b-local-canonical-history-closure.md)。用户要求原会话顺序实施，不派代理；这是作者代码评审，不冒充独立review／合并或阶段验收。

## 当前交付与明确未完成

| 单元  | 当前结果                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | 首份产品前183case/402file语料及旧行为基线已封存；保留第一版、失败及纠正。新Artifact路径负控制后184case/404file；四Fixture根均为组件/声明证据，Stage/Store语料尚未执行，不算其通过                             |
| B     | 同一C3-A framing emitter复用；旧R010/R011输出、错误、计费边界保持；null basis capture新增私有committedSnapshotCount比较，不改变public view/API                                                                |
| C     | 私有Canonical Syntax mapper与H1域摘要helper；五kind/八value、原typed refs/loser闭包、两类歧义、最终值SupportRef、syntaxKey/initial id/extractionVersion、固定0.5和七token；无public index／生产路由／动态策略 |
| D/E/F | 未实现完整历史组合、Mixed Stage或Store；发现diagnostics比较冲突后暂停相关依赖链，等待具体[澄清提案](../specs/2026-10-26-phase1-snapshot-diagnostics-compatibility-proposal.md)接受                            |
| G     | 目前适用的局部回归、build、IR types、architecture、注册／文档追踪和封存；完整B1b验收、Stage/Store恢复与Runtime资格仍OPEN                                                                                      |

只追加两个已实现root，另两个等待E/F；四Fixture通过自动发现进入61total/35Phase1/catalog0，不等于所有未来case已有执行证据。P1-04/05、H2/H3完整验收、H4/H5与全Phase1仍OPEN，主任务仍4/21完成、17未关闭。

## 实际验证与复现

全部命令及原始stdout/stderr、独立 .run.json、具体scope在 .superpowers/sdd/2026-10-26-phase1-b1b-local-canonical-history-closure/。

- 执行起点6625前置摘要匹配，10根依赖先pin；只读完整Git状态保存，HEAD/原分支未推进。
- baseline：6文件385/385；B API缺失RED39、可调用错误摘要RED39、独立摘要/census GREEN40；格式后的B最终兼容4文件231/231。
- C API缺失与可调用stub RED；首个真实运行41/43暴露两项新Fixture适配缺陷，纠正后44/44。补充精确／少一项输入和H1摘要预算、全部token组合／去重／不回显自由文本与loser-ref，48项通过。作者审查再发现NODE冒充EDGE支持，真实单例RED后新增明确种类校验；最终C root49项纳入总回归。
- 最终适用36文件：**1337/1337通过，0fail/cancel/skip/todo**，83004.3628ms；这是B/C及旧pure/storage范围，不是完整root或B1b全部门禁。scope文件逐项列明，没有Native/helper/collector/模型/CI/Rust。
- 最终Providers/Storage/Runtime本地TypeScript build均exit0；实际IR test:types constituent exit0；architecture **17项目通过**。没有依赖安装或质量阈值变更。
- 独立完整empty/Python/Java/mixed四目标通过原H1 manifest/origin/projection校验。另一个诊断兼容probe：**1对照通过、1真实RED失败INVALID_HISTORY**，未修复也未算绿；原组合器接受的SUCCEEDED WARNING在H1 SQL全对象比较被拒绝。

这些结果互相重叠，不相加充当进度或样本量。新Syntax数值是用户接受的规范性单档，不是测量概率；旧Library/Source/18历史记录资格不提升。旧Phase0.5完整回归／校准／取消main CI没有重跑，原timeout仍UNKNOWN。

## 作者审查

C3-A仅把原framing从SQL读取器提取；旧guard、UTF8/TEXT先检、序列化与内存收费回调保留原位置/顺序，Unicode/numeric keys/coverage multiplicity及所有旧临界向量通过。私有census数字来自原来已经读取/计费的值；不新增SQL或改变公开数据形状，失败撤销handle。

Mapper先安全有界扫描并预留原／decode／schema表示，然后严格parse；从原bindings/supports和完整selected值重建上下文，不接caller availableEntities或policy/score，不按名称补引用。MODULE owner沿既有显式Source path关系验证，其他owner用SourceRange。所有输出通过原Canonical parser并冻结，失败不返回部分Syntax或修改输入；原始账本累计保留，未当RSS/profile证明。

七解释token只由固定规则、原raw resolution/递归值决定，顺序/去重固定；callee HEURISTIC不会因Canonical丢resolution而漏记。字符串/UNKNOWN原值保留在合法payload，confidence解释不混入原始自由文本。Code confidence没有修改，也不从owner借分。

完整history/Stage/Store仍不存在；不把私有mapper接受声明上下文称为真实Source／最终activation授权。diag修订尚未应用，旧capture目前仍严格按原代码拒绝非空诊断。建议的P比较是明确待决的校验边界，不能悄悄删diagnostics让RED绿。

## 裁定与成本（全部保留在台账）

- B1：沿旧C3-A实际字节顺序，包括JS numeric-key枚举，不换成historyJSON规则；选错会改变所有Code身份。独立旧/新字节向量与旧预算验证通过。
- B2：null-basis census漏检属于原完整capture/CAS要求的实现缺陷，私有比较原已读取数值；不改public view或SQL费用。若错判，会留下stale full上下文通过复查的风险；新增RED→GREEN已证明。
- A3：APPLYING只有Store拥有事务，close不允许；在产品前修正独立状态矩阵并留原文。若错判会允许Apply中资源销毁；真实E/F状态测试仍未执行，不能借矩阵宣称通过。
- C1：C需要的initial/H1域摘要先放入计划已列的syntax-history-candidate.ts，供D复用，不复制第二个编码器／新域。若错判会使两种身份/预算漂移；当前完整H1字面输出通过，D尚待实现。
- G1：旧R1 consumer把自身完整字节冻结，批准的计数修改也会触发它；保留旧收据，先验证原始快照哈希，再严格应用新任务冻结的完整精确补丁并比较当前全部字节。若错判会削弱变更来源证明；原64case/10family、旧199、G14旧21和R0旧16个守卫均仍通过。

## Fixture与证据纠正

新M-01适配首版把跨revision ScopedRef折成无revision binding时丢失了负例；在support/evidence中恢复该矛盾，期望仍拒绝。旧Artifact Source path为sources/artifact.yml、logicalPath却为artifact.yml，与已接受映射条件不一致；旧M-01保持原字节，新严格正例修正完整路径并独立重算身份，旧不匹配形式作为新负控制保留。原M-01是历史无数值准备，不能继续把其该样例当新严格mapper的合格正例。

HistorySupport.valueDigest遵循原DECLARED_HISTORY_CANDIDATE_V1，与Syntax SupportRef最终值域不同；只纠正新语料的前者，没有重评分或改变旧Fixture。完整mixed目标初版state.nodes未按H1 ID排序，原失败／原字节保留，产品前纠正。后续格式化仅新文件，JSON值不变，raw Source/wire未格式化，所有第一份freeze可从保留快照复核。

补充预算reference测试是在首版mapper之后新增，明确不是产品前原始证据，也不声称已证明完整Stage账本。C直接证明累计输入/域摘要边界；跨阶段retained内存、完整操作exact/one-below和真实资源验证仍归D/E/F/H5，不由本轮抵消。

工具层另有起点git状态输出超过Node默认缓冲、一次大写label被记录器拒绝；前者保留tool结果元数据并改为直接流式保存，后者没有运行测试，不能算RED。两者未产生产品／Evaluation结果；不冒充已另存完整原始失败stdout。所有实际Node测试/构建失败日志由不可覆盖记录器保留。

## 未评判为已完成的范围

Source真实认证、Native/内存/RSS/profile/取消与历史timeout根因：均在本包实际运行之外，H5/B1c仍OPEN，不能用假数据或本地SQL替代。D/E/F状态／事务／磁盘崩溃恢复：当前未实现/未执行，等诊断契约处理后沿原批准任务连续推进。全Phase1、独立review、整根/云端CI、PR/合并：均未通过/未执行。

未发现需要保留的新minor；本检查点不是完整分支final review。C1EPERM、C2四次生命周期已用、main39708335128取消结算未查询、R4 post-trial mutable限制、R1三份原始详细报告丢失及旧根依赖起点时序缺口继续保留。本轮新pin不能补回历史证明。

诊断控制补记：最新confirmed-red使用真正原始无诊断v5对照；预期仍1PASS/1RED。原probe源码和输出均保留，候选JSON是固定声明而非新运行产物。新snapshotId freshness／同id完整内容冲突要求在待决提案中明确，未据此放松现有比较。
