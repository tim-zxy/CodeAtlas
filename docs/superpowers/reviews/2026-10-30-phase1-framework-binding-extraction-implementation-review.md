# B-F2-C 实施与作者整包评审

日期：2026-10-30。状态：B_F2C_DECLARATION_DRAFT_LOCAL_EXIT，用户批准导入澄清后完成有限本地验收。
用户批准C1–C3后在原C盘工作树顺序实施；无代理、云端CI/Git写入、Rust/Native/helper/collector/DB/模型或新依赖/分数。作者评审不是独立评审。

## 已实现及准确范围

四个Plugins源码文件：共享索引/导入与receiver证明，固定四框架声明规则，Context4私有入口，以及既有FrameworkDraft的共用创建/严格验证。private index/公开router/旧IR、历史和SQL版本保持；所有结果仍是无Canonical分数/身份的声明草稿，不能发布。

C1共享绑定及C2 Spring HTTP/cron、Mongo显式collection读写/资源、Kafka显式topic发送/监听、FastAPI同文件直接app及一跳router/prefix/include 已落地。C3增加支持失效/重算、顺序无关、key复用、strict旧版本拒绝、原cap精确边界及Runtime拒绝草稿。每条正例精确核对独立proposal、完整Syntax支持和标准算法键。Fixture38个绑定案例、54个规则案例，加共同边界测试；不冒充真实框架Source解析。

唯一新增test/helper装配声明式Context4，复用已有结构，不生成绑定或规则预期；此最小文件边界调整已记ledger。旧注册只追加一个root及原p1-plugin-context-v2两个路径，无新Fixture ID或全局计数守卫。

## 澄清前结果（原失败完整保留）

完整命令和原输出位于 .superpowers/sdd/2026-10-30-phase1-framework-binding-extraction/，澄清前汇总results.json；批准后结算另存accepted-results.json，不覆盖原结果：
- 新root final-root-r2.txt：98项，97PASS、1FAIL、0cancel/skip/todo。失败是原python-dotted-module正例；scope/名称证明37/38，规则及共同边界文件60/60。不得把此前65/65称为最终整包绿色。
- 旧四文件compatibility.txt：64/64，零失败/取消/跳过/todo；相关旧入口和共享draft源码之后未再改行为，只有新规则局部修复，按适用性复用。
- Fixture注册registry.txt：35/35；单一ID/新增路径，库存不按用例数量提升。
- build-r3.txt：Plugins tsc exit0。架构architecture-r2.txt：17项目通过，exit0。
- 命名格式检查及实际身份/单一注册核验见results.json；不宣称全仓format/verify。

## RED、缺陷和修复

初始29绑定/36规则入口RED主要为缺模块API；另有两个不同Case的重复Fixture id，原fail/freeze/r0/r1保留，修正id未改预期。首次编译暴露品牌类型比较/null与union收窄，已在对应构建记录中保留。

初始集中65/65后，作者审查以独立负例证明并统一修复：
- receiver名称/callee不一致与HEURISTIC receiver误入正证明；当前typed receiver仅接受实际既有producer的UNRESOLVED-empty形状，其他形状保守未证。
- 静态成员导入被当成Java注解TYPE。
- 动态额外include可能重复注册router。
- Java cron/topics非法位置参数被当成命名参数。
- Java FUNCTION可冒充METHOD、Spring接口mapping未拒绝。
import alias兼容、参数遮蔽及跨scope NONLOCAL目标另有固定独立检查，不伪称这些新增Case都曾行为RED。

架构首次exit134/OOM：有界扫描定位到TypeScript既有扫描器在新path regex的#字符不前进；没有加内存阈值或改architecture脚本。新路径过滤改为等价字面字符集合+空白检查，原门禁随后17项目通过。原OOM保存，不将其作为历史Native超时的根因或修复证据。

## 已获准的局部合同澄清

[同根dotted-module澄清](../specs/2026-10-30-phase1-dotted-module-binding-clarification.md)：现有字段不能排除 import a.b as a，却曾要求同一语义字段的无alias形式正绑定。推荐仅保守拒绝这类未证输入，不增加新字段/版本。原正例预期在批准前保持BOUND，final-root-r2.txt保存97/98。用户明确批准后，仅改该一例新预期为UNPROVEN；产品代码未变，approved-root.txt完整98/98通过。原预期另存expected-before-approved-clarification.json。

C1–C3现已在获批有限范围完成，记录B_F2C_DECLARATION_DRAFT_LOCAL_EXIT。原失败没有取消/跳过，也没有重标为历史通过；新通过仅来自获准澄清后的新基线。

## 原目标、风险及保护

Spring Feign/依赖、Mongo watch→handler、Kafka更多形式/EVENT边界、FastAPI跨文件/Depends，以及语义置信/Canonical Runtime/ExecutionGraph/RuntimeFlow/生产发布与真实资格继续OPEN。父任务4/21接受、17开放；A6 NOT_QUALIFIED、空profile catalog、历史Native timeout UNKNOWN、main取消结算未查询和旧R4不可视为pristine等限制保持。

保留.superpowers全部freeze/原失败和旧Fixture根；仅新计划自身证据与批准命名文件改变。D盘旧checkout不动，C工作树Git链接不修复；没有stage/commit/push或新增工作树。身份核验不声称已提交HEAD或原本干净工作树。

## 批准后最新结算

一次本包完整测试98/98，零fail/cancel/skip/todo；共享绑定38/38、规则及共同边界60/60。此次仅变更一个Fixture预期及文档，没有产品源码修改。范围格式检查通过，原构建、旧四文件64/64、注册35/35、架构17项目在对应源码/注册身份未变的适用范围复用，未冒称重跑。accepted-results.json记录原结果链接、身份、唯一预期差异和新命令收据。

作者整包审查完成并已修复原范围问题；无新代理，不称独立评审。有限Exit不解决完整dotted-module正绑定、真实四框架Source捕获、语义置信/Canonical发布、生产物理资格或原Phase1/E01/E02。后继推荐集中设计草稿到Runtime候选的有依据语义策略与发布接口；具体包未获授权前不实施。
