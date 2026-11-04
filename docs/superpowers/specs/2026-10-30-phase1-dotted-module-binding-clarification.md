# B-F2-C：Python同根 dotted-module 导入歧义澄清

状态：ACCEPTED，用户已明确批准；2026-10-30已完成本包98/98本地验证。
前置：[已批准设计](2026-10-30-phase1-framework-binding-extraction-design.md)§3.2；[实施评审](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)。

## 已发现的具体冲突

原独立Fixture python-dotted-module 要求将 qualifiedName=fastapi.routing、boundName=fastapi、importKind=PYTHON_MODULE 的引用 fastapi.routing.APIRouter 正绑定到 fastapi.routing.APIRouter。

但下列源语义不同：

~~~python
import fastapi.routing
# fastapi 绑定顶层 fastapi；后续 fastapi.routing 指向所导入子模块。
~~~

~~~python
import fastapi.routing as fastapi
# fastapi 直接绑定 fastapi.routing；再访问 fastapi.routing 是另一条成员链。
~~~

只读核对 crates/native-analyzer/src/binding_sufficiency.rs 的 alias.unwrap_or_else 分支：两种形式产生上述相同 IMPORT_BINDING语义字段。旧 python.rs 的 IMPORT_ALIAS 值保留 qualifiedName，B包又将targetName同步为boundName，因此旧alias赋值的这两个字段也不能排除同根显式alias。sourceRange/fingerprint/identity仍不同，但现有合同未将范围长度定义为alias模式证明；Plugin也不能读原始Source重解析。没有运行新Python/Native来佐证，以上是当前生产代码映射和独立声明反例的静态证据。

新增独立负例 python-dotted-same-root-alias 在原实现返回BOUND，review-red.txt记录失败；安全关闭该范围后，它通过，而原正例变成UNPROVEN，final-root-r2.txt完整保留这一失败。不是数值门槛失败，也不是flaky，不得改名为通过。

## 推荐的最小澄清

只要 PYTHON_MODULE 的qualifiedName含点，且boundName等于qualifiedName首段，在当前输入合同下返回UNPROVEN。既不猜“未显式alias”，也不猜“显式alias到首段”。该结果表示绑定证明不足，不将合法Python导入定义为无效。

继续支持无点的模块导入、symbol导入，以及别名不同于模块首段的明确模块绑定；四框架既有批准子集和原Phase1目标保持。实际完整dotted-module正绑定能力继续OPEN，不能被这次拒绝改记为已实现/DEFERRED。

不增加导入模式字段、wire/IR/history版本、Source读取权限、分数、依赖、运行/校准或新数值。若将来必须正支持这一歧义形式，再以独立Source证据细化显式绑定模式；不提前实施备选。

## 兼容及已批准的准确步骤

澄清批准前，代码已失败关闭，原正例保持BOUND并失败。用户已明确批准本澄清后，才将这一例预期改为UNPROVEN；原freeze/expected/97/98失败和审批前文档副本全部保留。没有修改产品代码。

以下步骤已顺序完成：
1. 保留原freeze和expected所有历史版本；仅将该一例新的预期标为UNPROVEN，补记本澄清的能力限制。
2. 同步设计、计划、PLUGIN_SPI、验收和追踪文档，不动原IR/版本/发布门禁。
3. 执行一次完整本包root（当前98项；不重跑未变的Native/Store/全回归），范围格式检查。旧64/64兼容、35/35注册、架构17项目只有输入/代码适用性仍成立才复用。
4. 所有原定本地条件通过后才能记录B_F2C_DECLARATION_DRAFT_LOCAL_EXIT。原Phase1/P1-06..09/E01/E02和真实资格仍OPEN。

本确认不授权后继功能、新字段、真实Native/helper/collector、profile、依赖、CI或Git写入。

## 本地结算

approved-root.txt为98/98、0fail/cancel/skip/todo，范围格式检查通过。源代码与旧兼容、构建和架构收据适用输入身份核对不变，复用64/64兼容、35/35注册及17项目架构/Plugins构建；不是重跑声明。已记录B_F2C_DECLARATION_DRAFT_LOCAL_EXIT；[最新实施评审](../reviews/2026-10-30-phase1-framework-binding-extraction-implementation-review.md)。真实完整dotted-module正绑定能力与原Phase1门禁继续OPEN。
