## 批准与本地验证最终补记 — 2026-11-04

本页准确四用途值已批准并安装；27＋15通过后，首次D缺context被拒，原失败保留。用户另行批准一次固定R5 context续接，D22/22 ACTUAL_ADMITTED、0failure，最高350482432＜399069184 bytes。准确依据为[最终作者结算](../reviews/2026-11-03-phase1-native-profile-installation-review.md)及原B终审；候选与编译/工具身份未变。下方待批/未执行文字和approved=false草案均保留为提议时历史，不是当前批准状态。没有上调数值、Git或云端写入。

## 数值批准与实施结算

用户已批准本页准确值及Q3；三个条目已安装。一次27＋15观察通过，D入口因缺固定context拒绝并停止，不记D实际22通过。原草案JSON保留approved=false的提议时原字节，不是当前批准状态；当前依据为用户批准、本页及[实施审查](../reviews/2026-11-03-phase1-native-profile-installation-review.md)。以下PROPOSED文字为提议时历史。

# R5四用途具体数值审查

日期2026-11-03。状态PROPOSED_NUMERIC_APPROVAL；没有安装。本批唯一实际执行记录为原B integration-preparation/r5-batch-execution.json；只读终审为r5-final-numeric-audit.json。八入口全exit0，22类qualification、320校准、64独立holdout全部完成、失败0；耗时3小时59分50秒。原始产物/失败记录不重跑或删改。

## 准确申请值（bytes）

|用途|M：校准最高峰|J：最大组内范围|申请预留M＋J|独立holdout最高峰|校准/holdout|
|---|---:|---:|---:|---:|---|
|READ_SEAL|217964544|8691712|226656256|218968064|65/13|
|FULL_TRANSPORT|217964544|8691712|226656256|168321024|70/14|
|REFRESH_VERIFY|345808896|61440000|407248896|335482880|75/15|
|REFRESH_TRANSPORT|364560384|34508800|399069184|362348544|110/22|

READ_SEAL/FULL_TRANSPORT沿原配对策略共用一个静态metadata条目和同一预留量，其余各一个条目，合计三个新增静态条目、四个用途。三个candidate的priorApprovalFloorBytes均null，未借旧build/purpose的floor。READ_SEAL独立最高峰略高于校准M，但低于冻结M＋J；没有把该holdout加进候选调高数值。其余holdout同样逐项满足冻结预留。

这些数值仅适用Node v24.15.0、V8 13.6.233.17-node.48、win32/x64、Zod4.6.1和编译身份726ffb9793680e58698fcd3fb3f4d0698228df0fab89217ef04a6846bc6fa013。Native构建SHA为0fe1b8337be2263684cf5c1c7e1df32c1391245761bf0ec6943e95962418eb17；Rust1.98.1，52项Source和33项工具/辅助pin执行前后相同。基线head be41b9b2dfd58661388000689bd9769b8f3b5fb7加本地已批准R5改动，不是新Git提交。

## 冻结候选与证据

- paired candidate：bf55069efc3b459a8b2eac5cb30e51eed60a764326264d66f1179e421522552f。
- REFRESH_VERIFY candidate：6dd8f8de50d1a683bb087c0eee244788fc5104d4c4082a84578991a03d491aa9。
- REFRESH_TRANSPORT candidate：2c3c890d439c45f8a67d5ba864727ae9a995f02039fb312c021931f6f0c020a7。
- D corpus：9e9b7136852eba80d40bfda8b0fb2a4f57f4e21ef34da2fc5bf0e572811c6dde，严格绑定新R5，不得移植旧R4。

具体提议的三个静态对象另存[数据草案](2026-11-03-phase1-native-profile-proposed-data.json)，kind=PROPOSED_PROFILE_DATA_ONLY、approved=false；该文档不被产品加载。精确原raw/manifest/holdout SHA、覆盖、相邻范围与M＋J算术在原B终审内，可逐文件重现；无需第二轮采集来同步文字。

D当前caller输入仍为既有1,000,000,000；校准最大SQL charge为6,567,184，候选＋charge为405,636,368，小于caller。没有提高caller、生产默认、cap、timeout、质量阈值或改公式。有限样本不是全机器RSS保证，更不是Syntax/全混合链物理资格。

## 推荐集中实施范围

批准准确四用途值后，按[集中安装计划](../plans/2026-11-03-phase1-native-profile-installation.md)连续完成：保存必要可携带原字节依据、在native-metadata-profiles.ts增加三个匹配条目（旧条目全部保留）、Runtime本地编译并核对编译身份及原D依赖目录保持、最小原边界/新数据追踪验证和一次既有原流程的准入后验证。没有新产品API/依赖、分数、迁移或purpose。

准入后只执行一次：27类fresh approved-profile观察、15类ACTUAL_PRIVATE_PORT验证、22类ACTUAL_ADMITTED D。前27是带必需profile的峰值观察，不冒称公开业务执行；三组范围不同。最多18 Native、85个已列明Node（包括三个驱动及14个FULL fixture child、4个D fault child；编译/必要只读核验/非测量编排单列）。不重做320校准/64独立holdout，不再cargo构建，不新增collector/debug helper。

D执行必须由原strict reader重新核验R5新语料和当时pristine/ownership，不因本文件宣称可复用；guard失败即保留并停，不手工恢复、接管或伪造旧R4/R5。当前R4始终不读写。profiles-only重建若改变规定排除之外的原D目录字节或编译身份，也停止，不重贴旧Corpus身份或另行自动校准。

## 后续边界

本次数值/安装/本地一次验证审批不含Release、下载、push/PR/CI/merge或Git写入。admitted结果不等于clean-host CI或Phase1验收；后续仍需审查本地新pack/准确提交和云端批次，取得原保留的明确确认。新Syntax catalog保持空，A6/E02、4/21接受/17OPEN及历史Native timeout UNKNOWN、两项普通Node超时UNKNOWN保持。

作者审查只复核当前冻结数据，不冒称新的独立整分支评审。上一轮首RED误触发构建及经批准两文件归档的完整证据仍保留；本轮Q1/Q2没有重试或额外构建。
