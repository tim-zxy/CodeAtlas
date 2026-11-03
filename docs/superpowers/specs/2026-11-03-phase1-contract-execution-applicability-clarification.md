# HTTP合同匹配与执行连接适用性澄清

日期：2026-11-03。APPROVED / IMPLEMENTED_LOCAL_EXIT。仅续接已批准显式schema整包的T4；不是新项目或重新拆任务审批。

## 真实证据与冲突

已批准schema证据链现已让J7接口声明consumer及真实proxy调用点consumer均MATCHED/DECLARED_HTTP_SCHEMA_EXACT_V1，实际stitch生成1条HTTP跨仓边；但缺少执行点的接口声明另触发WORKSPACE_BOUNDARY_UNPROVEN，整体PARTIAL，Application正确NOT_PUBLISHED，未提交workspace。准确证据：原B目录declared-http-schema/t4-diagnostic.log。两份合同不删，真实调用边不伪造；本地测试故意保留原COMMITTED断言的失败。

当前设计§4明确复用V2核验、仅替换frozen/match校验，但没有定义“合同已匹配、在完整声明运行图中无调用点”的适用性。原stitch把每个MATCHED都要求一个执行连接。直接删限制、丢接口consumer或为声明造执行边都不成立。本澄清拟补这一种缺失语义，不改变schema未知规则、六状态或Source/Code gate。

## 推荐的最小规则

仅在新stitchWorkspaceExecutionV3适用，旧V1/V2结果保持。MATCHED依然表示合同兼容，不保证存在被执行的调用。缺source boundary时，仅同时满足下列全部条件才按“当前声明运行图没有该合同调用点”处理：

1. HTTP consumer已通过本包Source声明证明，match理由含DECLARED_HTTP_SCHEMA_EXACT_V1；consumer/provider及完整repo候选均已通过现行身份/支持/currentness验证。
2. 源repo候选是完整的Graph/Flow V2，完整current site-plan的basis、membership和digest已由原校验认证；不能拿稀疏plan、PARTIAL或caller标签替代。
3. 有对应consumer合同的真实HTTP_CALL binding；完整site-plan中没有任何entry引用这些binding IDs。不能仅凭Runtime节点缺失、源码名字或接口名称猜“无需执行”。
4. provider的目标entry仍唯一可证明。若任一已有调用site关联这些binding，但图缺source boundary，或provider entry缺失/歧义，仍保留WORKSPACE_BOUNDARY_UNPROVEN。

满足时只保留该MATCHED合同、不生成执行边；当前真实proxy consumer仍必须保留其真实HTTP跳边。不能借此把一个实际缺失/动态/未覆盖调用解释为不存在。若无其他限制，workspace可在EXPLICIT_DECLARED_HTTP_SCHEMA这一已批准目的下COMPLETE。仍不声称实际HTTP执行或部署成功。

该规则使用已存在candidate.derivation.sitePlan和HTTP_CALL binding，不新增输入字段、Canonical模型、schema/格式版本、SQL迁移、数值、profile、依赖或Native信息。新增的只是明确的适用性判断；它改变当前coverage结果，因此需明确治理确认，未静默实施。

## 验证与原整包续接

批准后直接继续原T4：保留两MATCHED，断言实际调用点的一条HTTP边，声明consumer不造执行边；实际调用site仍存在但缺boundary、缺provider、partial/错误plan的拒绝控制保持。由固定Runtime→Application→Store完成实际owned发布、只读重开与正式Source CAS后的AFFECTED/拒绝/last-good检查。既有schema/授权/容器/预算和旧兼容检查统一完成，不再次逐步骤审批。

Source重放的初始inventory排序和Java v2 revision/request/echo重绑定缺陷均在测试输入修正，原记录raw字节保留，仍标RECORDED_REPLAY。没有使用真实Native/Git/helper/collector，也没有把记录流重绑定冒称新实际观察。

此确认只覆盖本规则、相应设计/ADR/Fixture追踪同步和原T1–T4剩余验证/范围修复。云端CI/Git写入、真实Native/资源测量、模型、新依赖/profile/经验数字和C/D仍未授权。T4/整包当前HOLD，不因组件测试绿而签收父任务。


## 实施结果

用户明确批准后仅V3实现上述完整plan/no-site判断，并计入同请求预算。T4正向从原NOT_PUBLISHED转为实际COMMITTED、两个MATCHED/恰一条HTTP边，非空证据只读重开及正式Source CAS/last-good通过；实际site仍在而全部boundary链接缺失的负控制维持PARTIAL。准确局部日志t4-applicability-green-03.log和最终exit-tests.log在原B/declared-http-schema，旧失败不删除。最终根/兼容8入口120/120，0fail/cancel/skip/todo；旧V1/V2输出经原Fixture复验。无需新增字段、实体、SQL迁移、依赖或数值。
