# Phase1 详细设计与任务包自审

日期：2026-10-22，Asia/Shanghai。对象：[设计总索引](../specs/2026-10-22-phase1-design-package.md)所列材料。形式：本会话顺序自审；没有派生独立评审者，不能宣称独立review通过。

## 结论

形成了可供用户评审的详细设计草案、兼容性提案、两份21任务的实施计划和22项退出追踪。**设计未获批准，Phase1仍DESIGN-READY；不宣称整个Phase1已IMPLEMENTATION-READY。** 下面的待决策/依赖未关闭前，相应产品任务不可领取。产品unit/Fixture/Evaluation尚未运行，文档QA不替代它们。

## 重要发现与修正

| 发现                                                    | 设计修正                                                                                                                                                     | 验证责任                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 当前IR/Plugin严格schema无法携带annotation/decorator参数 | 独立SyntaxEvidence、显式Plugin V2与拟议Native新协商，旧Code/ProviderSnapshot/IPC不改义；提交兼容性提案A                                                      | P1-01/03及旧strict负例                                                                 |
| Source只将.java分类为源码；Python无Code owner           | .py SOURCE/python及最小Provider Module/Symbol/Import/Reference→Canonical映射纳入04；候选CodeBasis下owner验证、Code/Syntax同事务、Java支持与summary兼容纳入05 | actual Python/混合Provider/Source fingerprint与restart tests；语法记录不能代替Code事实 |
| 仅冻结WORKTREE revision ID不足以保编译依据              | 不可变CompilationInputSnapshot、support value digest、发布CAS及前后basis重验；不声称跨库原子同一时刻                                                         | 12 capture、14真实W010持久化/并发/失败；提案B                                          |
| 捕获任务依赖未来W010却可误标完成                        | 12只拥有capture与immutable值；真实append-only Store/DDL归14，不制作临时镜像schema假集成                                                                      | 12独立capture测试；14实际升级与Store tests                                             |
| W009不能对尚不存在W010/W011建立完整FK                   | W009只建已有引用；W011关联provenance表+publication强制依赖/触发器，W011前publication拒绝；evaluation_runs明确id主键                                          | 14完整每migration边界与dangling provenance拒绝                                         |
| 文档代码块可能成为秘密副本                              | 授权与inline secret扫描/redaction在结构持久化前执行；原指纹/位置与redacted文本分开                                                                           | 10文档Store负例、11发送前重扫、15 FTS/16 Wiki不泄露                                    |
| 新domain probes不能借旧Code criticalFacts/空gates通过   | 独立Phase1报告，required inventory/实际证据kind/基线身份验证；缺义务与空分母不PASS                                                                           | 00/20及提案C                                                                           |
| 非exact identity/弃用阈值无Fixture依据                  | exact结构唯一匹配+review的最小模式；不猜权重/数字；transition/drift保边界                                                                                    | 13；若Fixture不能满足则走EVOLVABLE调整，不能删测试                                     |

## 仍未关闭的决定与启动限制

1. **需用户接受A/A2/B/C**：新语法/协议、未发布repo预留调整、编译历史支持和新Evaluation报告。正式ADR编号尚未分配；接受后先同步治理文件，不把本草案当已生效权威。
2. **语法wire/跨语言组合风险**：v4精确消息schema、Python grammar与tree-sitter准确版本、owner normalization及旧Java summary lifetime必须在03..05的合同/实际Fixture收敛；不能因写了协议名就认定已验证。若需要改变旧FROZEN行为，停止相关实现并补受控修订。
3. **依赖尚未锁定**：Python grammar、Markdown AST、YAML与MCP协议解析依赖只能在官方兼容核验/许可证/版本和用户允许的范围内引入；本轮没有安装/选任意版本。
4. **质量基线未批准**：critical入口/边界、真实本地模型语义质量、identity非exact/延迟弃用策略与运行预算没有测量/批准值。不能把旧95/95/90或任意数移用。只影响适用任务/最终验收，不是削弱安全不变量的理由。
5. **产品选项待定**：建议条件降级关闭、首个实际安装验证Windows x64；这不是自动缩减已有承诺或提前启用后期能力。最终发行/模型范围由用户审阅。
6. **Phase0.5跟踪项保持**：历史Native timeout UNKNOWN、R4 mutable DB非pristine、run39708335128 cancel未新查结算。本轮未启动/恢复CI、重跑校准/回归、重复下载产物或操作预算。

## 计划自检

- 覆盖：P1-00..20每项有Files/Interfaces/五步TDD验证与文档证据；E01..E22在Evaluation与启动矩阵映射，conditional E21单列，不漏四框架、标准Wiki或无模型安装。
- 类型/版本：复用EntityRef而非往旧strict对象加repo字段；ScopedRef/SupportRef外包basis。新payload独立version，不改变ProviderSnapshot v1与Code comparator语义。Runtime/Storage的结构port不扩大package allowlist。
- 比例：计划不写产品实现体；test steps指定行为/assertions、命令和预期效果。两份计划按domain依赖拆分，非巨型单次并发实施。
- 恢复：Code/Runtime freshness窗口、scope publication原子性、CAS、cancel/partial/重启、commit后输出失败、目录/锁/too-new、index/artifact重建均有任务归属。
- 安全：Source/raw-vs-derived、secret/env、doc注入、模型repair与remote opt-in、只读工具无隐式update、LOCKED Wiki均有负例；不靠最后补安全测试。
- 独立性：P1-10纯解析和11模型纯边界可独立，但持久化按workspace连续migration；共享IR/manifest/publication不是独立并行任务。本轮无agent或长测并发。

## 本轮可复核范围

本轮新增文件仅本索引列出的设计/计划/本review，另在CURRENT_STATUS顶部追加设计进度；启动第一步旧文档保留。文档命名范围Prettier格式、Markdown相对链接、21任务连续性/unchecked状态、22项Exit存在性和Fixture映射做本地检查；无product test/build/Native/profile或云端执行声明。

原证据已在本会话启动阶段复算：18历史exit0且日志存在、31行report逐字段相等、26有效Manifest/0 Phase1、保留merge REST记录的树与本地HEAD一致。它们属于Phase0.5，不作为本草案未来功能的通过凭据。

推荐最终审批方式：先对总索引决策表给明确意见；如接受适用设计并**另外明确授权首批P1-00..02实施**，才同步治理并按executing-plans执行。仅“继续设计/认可方向”不当作实施、模型调用、新数字或任何云端写入授权。

## 本轮文档QA实测记录

命名范围Prettier --check：8份新增文档全部符合格式。只读Node断言检查exit0：24个本地Markdown链接存在；P1-00..20连续且每任务含Files/Interfaces/Step1..5，共21任务、0个完成勾选；E01..E22全部有映射；无TODO/TBD/FIXME占位。当前Fixture严格发现仍26份、Phase1为0；HEAD仍cc5a8cb；tracked diff仅docs，staged为空。

以上只是文档结构检查，不证明新schema/算法/迁移/Fixture或产品质量。所有未来测试命令仍未执行；真实模型、Native新操作、安装与E2E没有通过声明。首次尝试追加此QA说明因PowerShell嵌套here-string解析失败而未执行；改为不嵌套的文本追加，没有产品或证据被修改。

可复核命令（指定工作树内，均只读）：

```powershell
node --input-type=module -e "import{readFileSync as read}from'node:fs';import assert from'node:assert/strict';const p=['docs/superpowers/plans/2026-10-22-phase1-foundation-and-runtime.md','docs/superpowers/plans/2026-10-22-phase1-knowledge-and-delivery.md'];const ids=p.flatMap(f=>[...read(f,'utf8').matchAll(/^### P1-([0-9]{2}):/gm)].map(x=>+x[1]));assert.deepEqual(ids,Array.from({length:21},(_,i)=>i));console.log('21 sequential task IDs verified')"
node --input-type=module -e "import{discoverFixtures}from'./packages/evaluation/dist/fixture-registry.js';const f=await discoverFixtures('fixtures');console.log(f.length,f.filter(x=>x.manifest.phase==='1').length)"
git rev-parse HEAD
git -c core.safecrlf=false diff --numstat
git diff --cached --name-only
```
