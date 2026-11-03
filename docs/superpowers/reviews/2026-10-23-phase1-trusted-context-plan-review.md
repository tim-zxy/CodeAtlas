# 可信上下文准备实施计划作者评审

状态：设计方向已由用户批准；具体实施计划已完成自审，等待整体审阅。尚未开始C0-byte/C1/C2实现或探针。作者评审，不声称独立review。

对象：[实施计划](../plans/2026-10-23-phase1-trusted-context-preparation.md)；[已批准方向](../specs/2026-10-23-phase1-trusted-context-and-process-acquisition-proposal.md)。本轮先核对前次设计收据499项SHA，全部匹配。

## 已定案的实施细节

- C1只有一个scripts层异步加载接口、精确draft/report字段与固定错误；复用请求/context/stream校验，原catalog须匹配Runtime已有冻结身份。工具材料只表示字节身份，不授予执行资格。
- 完整request身份保留所有字段；removed/resource单独摘要便于追踪，原owner-map编码不变。raw与结构摘要分离，数组顺序保留。
- NOT_READY和可信捕获/实际执行/进程采集/profile/完整Code-Syntax-Store/oracle来源等义务始终存在。6个激活形状差异与7个工具缺失进入独立Fixture预期；自比较不证明expected事实或独立作者。
- 所有读取由调用方显式限额，测试合法边界独立按声明工件推导。根/链接/替换/总量/伪批准负例具体；使用拥有临时文件的确定性替换控制，不在产品放测试hook。
- C2文件只在新plan-owned实验目录，原产品spawn不改。最多4个Node helper、每项一次；一个collector会话不创建业务child。case2确认关闭后不再按旧PID打开，case3明确INJECTED不冒称OS失败，case4取消即使有peak也不算成功。
- 一次性wx ledger、slot先消费、无force/reset重试；Node owner负责终止/drain/close，collector负责HANDLE最终读取/释放；EOF/自保护退出防止driver意外结束留下等待者。
- C2不注册到root/CI；C1匹配18个本地测试文件，不启动旧OS collector或实际Native路径。Rust/历史725 Node/83 Rust不冒称新证据；父Phase门禁不豁免。

## 新发现：字节checkout策略

只读git config显示系统core.autocrlf=true。正确权限下git check-attr显示Phase1 app.py、Endpoint.java、request.jsonl的text/eol unspecified，普通json已lf。首次受限环境check-attr返回not-in-worktree，随后同一目录正常权限只读核验成功；未修改仓库配置或文件。

这是当前字节哈希之外的fresh-checkout风险，不能用原16-case本地通过证明不存在。新增C0-byte为计划待审前置项：用已有Git blob的只读--filters模拟建立RED，再仅给fixtures/phase1的py/java/jsonl加-text三条策略，GREEN且所有当前Fixture SHA不变。不得stage/checkout/hash-object -w、改全局autocrlf或重写旧Source/expected；如果模拟不支持该假设，先复核而不是改数据。

本轮仅将此项纳入可评审计划，未改.gitattributes。它是批准方向的必要字节保护细化，需随计划整体确认，不从原C1/C2方向批准自动推导已接受。

## 计划自审修正

原断言示例曾混用report case摘要与输入request层级，已分开为changedCase.requestIdentityDigest与changedRequest.payload.ownerBinding.ownerMapDigest。补充全量工具仍不可ready、重新签checksum的合法错误参考仍需ORACLE_PROVENANCE_REQUIRED；不把结构校验当Source事实认证。固定catalog身份避免接收伪造同revision目录。

所有任务都有消耗/产出、文件、可执行验证和失败收尾；C1/C2独立但仍顺序。没有为尚未设计的混合stage lease或Native bridge承诺API。没有需要执行产品或探针后才能审阅的未定实施动作；真正未知的是C2可行性答案，失败也保留而不重试。

本轮文档格式、本地链接与未修改非文档哈希通过后记录在新plan workspace的plan-review.json。尚无新产品测试/Fixture/实际helper/Native/CI运行。确认计划后连续实施C0-byte→C1→C2→证据评审；不逐个微小步骤询问。P1-04/05与Phase1退出保持OPEN。

Ruling:精确字节保护作为计划待审前置，现有文件不规范化。成本：真正fresh checkout/CI验证仍在后续批次。
Ruling:作者评审，按顺序约束无独立reviewer。成本：没有独立review保证。

只读filter对照现已完成：使用已有HEAD:package.json blob，不接触实际Fixture/索引/对象写入；指定三种Phase1raw路径后，core.autocrlf=true把7592字节变成7625字节（33个CRLF），三组均不等。证据byte-policy-readonly.json。这验证过滤策略风险，不是实际fresh checkout，也未应用属性修订。
