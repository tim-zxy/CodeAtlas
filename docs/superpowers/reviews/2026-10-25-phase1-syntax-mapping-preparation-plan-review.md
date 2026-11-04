## M-01/M-02 offline preparation accepted locally — 2026-10-25

User explicitly approved both offline preparation packages. M-01 T1–T3 and M-02 D1–D2 are complete only as LOCAL_MAPPING_ORACLE_PREPARATION / LOCAL_CONFIDENCE_EVIDENCE_PLAN. [Corpus](../../../fixtures/phase1/syntax-mapping-preparation/README.md), [evidence protocol](../specs/2026-10-25-phase1-syntax-confidence-evidence-protocol.md) and [author implementation review](2026-10-25-phase1-syntax-mapping-preparation-implementation-review.md) record the exact scope and gaps. This current entry supersedes the historical planning-pending/not-started entries preserved below; it does not authorize product H2–H5 or a numerical confidence policy.

Fresh exact 16-file local closure: **488 passed, no failed/cancelled/skipped**, architecture **17 projects passed**. Registry **54 total / 28 Phase1 / catalog0**. All 3096 predecessor hashes matched at start; 3072 protected files including all 701 old Fixture files and existing compiled artifacts remain unchanged. Two root tests and one Fixture were added; three old oracles have only three structural substitutions each. The 34 cases/31 classification rows are declarations, not measured observations or sample-sufficiency gates. All measurements, thresholds and numericalPolicy remain null.

Evidence: `.superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/implementation-verification.json`, exact logs, original document snapshots and freezes. An authoring coordinate defect was diagnosed with retained producer examples, proved RED and corrected under an explicit successor freeze; the first raw corpus/freeze remains preserved. No product source/schema/migration/dependency/profile/build/DB/Native/calibration/cloud/Git mutation occurred. Review was author-only under the sequential constraint. H1 local acceptance stands; full H2/H3 DESIGN_BLOCKED, H4/H5/Phase1/P1-04/05 gates OPEN, confidence policy NOT_SELECTED. C1 EPERM/C2 lifetimes spent/Native timeout UNKNOWN/main cancellation settlement unqueried/R4 mutable DB restrictions persist. Next: review the evidence protocol before separately approving any actual evidence operation or numerical strategy.

# M-01/M-02 Syntax preparation task-package review

2026-10-25。结论：两份具体计划 REVIEW_PENDING，可集中评审；所有任务 NOT_STARTED。作者自审，不声称独立评审。用户最新授权只接受映射方向和任务包细化，未授权编码、score、校准、H4/H5或CI。

- [M-01 独立语料与离线校验计划](../plans/2026-10-25-phase1-syntax-mapping-preparation.md)
- [M-02 分类矩阵与证据方案计划](../plans/2026-10-25-phase1-syntax-confidence-evidence.md)
- [已接受的无数值映射方向](../specs/2026-10-25-phase1-syntax-mapping-confidence-design.md)

## 启动核验与当前边界

设计轮次封存3068个文件摘要在本轮开始全部匹配。实际Fixture枚举53/Phase1 27；H1的1467Node/build/architecture17仍是封存历史，本轮未重跑。计划给出未来15文件M-01范围和16文件联合范围及architecture命令，均未执行。所有701个现有Fixture、产品/编译/迁移/注册/依赖/profile和旧证据仍应保持原样。

H1 Local Exit保留。当前批准使映射字段/key/歧义/extractionVersion/缺策略拒绝成为后续计划依据；没有任何数值策略获准，完整H2/H3仍DESIGN_BLOCKED。两准备包的Exit名称分别限定为LOCAL_MAPPING_ORACLE_PREPARATION与LOCAL_CONFIDENCE_EVIDENCE_PLAN。

## 计划覆盖与类型自审

| 审查项 | 具体安排 |
| --- | --- |
| 冻结契约与任务界限 | M-01仅Fixture/数据loader/assertion oracle；M-02仅证据文档/JSON/validator；无packages/*/src或生产mapper/规则port实现 |
| 独立expected先于校验代码 | M-01 T1冻结34用例/6family完整literal及Source来源，T2只读oracle随后创建；不从新mapper、selector或writer生成golden |
| 避免重复实现normalizer | corpus.mjs只加载数据，不导出referenceMapping；oracle使用既有schema和身份primitive检查已独立写出的fields/refs/preimages |
| 正确区分准备与产品证明 | expected带BLOCKED_POLICY和canonicalEnvelope=null；没有用任意分数构造完整IR；oracle自洽不宣称Runtime已经拒绝或实际提取已支持 |
| Source/结构控制诚实标注 | ARTIFACT/重复OBJECT强制SCHEMA_CONTRACT_ONLY；Source副本有旧路径/hash；旧calibration/holdout目录只是文件来源，不代表本轮校准/运行资格 |
| 歧义与loser引用 | 精确命名callee-collapse-one/value-collapse-reject/reference-loser-binding及其他原ref控制；不得silent EXACT或丢候选 |
| 编码与分数隔离 | Provider/revision/key变化及Unicode/整数key/extractionVersion独立vectors；未批准policy token仅用于encoding probe，不运行实际policy |
| M-02类型和集合一致性 | root/row字段exact；rows跟随corpus顺序，只去掉明确三个encoding probe；sourceRefs/sourceHashes精确对应；observed/numeric字段null |
| 真实依赖 | M-02分类文案可独立阅读，最终matrix依赖T1freeze；默认T1→T2→D1→D2→共同closure，不自行并发或建代理 |
| 注册与额度 | M-01一manifest+一root test，M-02再一root test且无manifest；未来54/28为结构结果，不是数值gate；仅三处旧strict oracle的title/count改动 |
| 本地验证范围 | 不执行root完整命令；联合只跑一次16文件门禁，包含15文件M-01集合；无build/DB/进程Native/helper/云端动作 |
| 旧工作保护 | 3068前序hash、701Fixture、原文后缀、既有root test前缀、旧ID/catalog0控制均需验证；所有旧失败保留 |

## 自审消除的歧义

1. 不以缺confidence的对象冒充SyntaxEvidence，亦不为了让payload过schema而填0/1。独立payload子schema检查不代表完整IR验收。
2. 不把结构合法的ARTIFACT或重复OBJECT写成当前Native提取器已支持；原SourceFile role只有SOURCE/TEST/OTHER，新配置文本保持OTHER，不增枚举或语言能力。
3. M-02不是全34个用例的测量分母：三个纯编码probe不进入观测分类，剩余31个仍只是声明，不是新样本量充分性门槛。
4. UNKNOWN不自动代表动态，理由字符串不构成Source证据；无法确定标UNDETERMINED。
5. 15/16批次不是连续重复完整长测；联合执行仅T2小范围后一次16文件closure，M-01接受等待共同closure证据。

## 尚未解决但不在准备包中补造的事项

数值confidence策略、真实观测/校准、完整Syntax normalizer、H2真实raw/owner权限、H3最终Stage、H4 Store、H5资格与所有Phase1 exits继续开放。后续需要实际运行或数字时先给明确目的/输入/次数/作业范围/替代方案并单独确认，不靠准备包批准推断授权。没有删必需门禁或降低阈值。

执行风险：本轮作者评审不是独立评审；准备oracle只能证明素材自洽，不证明不存在的生产实现。成本是未来仍需正常产品TDD/Fixture/Evaluation/架构验收；计划已明确保留该成本。

## 集中请求的批准范围

若用户认可计划，下一次确认仅授权这两个准备包的Fixture/离线校验脚本和证据方案，以及精确范围匹配的本地检查；不授权产品映射器/H2-H5、分数、阈值、profile/校准、Native/Rust/进程helper、新依赖、云端CI/Git写入。执行方式已确定为原会话顺序推进，不需再次选择。

本轮仅计划/评审/治理文档与计划元数据；格式、链接、用例覆盖、测试路径存在性、前序hash和原文后缀证据见 .superpowers/sdd/2026-10-25-phase1-syntax-mapping-preparation/plan-review.json。C1EPERM、C2四生命周期已用完、历史超时UNKNOWN、main取消结算未查、R4 mutable限制继续保留。
