# 按需scope修订 — 作者设计审查

2026-11-02；REVIEW_READY，实施未授权。已通读augment完整第二轮与最终scope输出、tick_binding及旧三测试，依据当前同cap诊断提出最小改动，不假定具体超限caller已定位。

- 正确性：第二轮lex值只被TYPE/import/effect分支消费；没有消费者的求值可省，但block/unsupported/最终scope闭包和旧观察的scope/control必须保留。复用原effect match避免维护第二套kind白名单。
- 记账：只减少实际未执行的查询，不删除真实tick或调高cap，不引入缓存及其隐藏内存；work_items是内部实做步骤，旧成功wire事实须等价。
- Fixture：原ancestor控制out.observations为空，应补独立字面assignment使它证明真实消费者；Source与maxItems10不改，ResourceLimit预期保持，旧原件封存。不能依赖无效工作保留某个测试结果，也不能删除祖先预算门禁。
- 运行：原Spring同cap RED单项、GREEN原模块4项（包含17个旧Source oracle），均准确filter/新owned目录；可定位的新实现/准备缺陷最多一次条件复验，cap仍拒绝或未明失败不具资格。无CLI/collector/模型/校准/CI/Git。
- 限制：Spring能否完成须实际验证；PARTIAL也只能当观察，不授框架发布。旧17 raw适用性及事实不一致会阻断，不能以优化预算为由豁免。

其余统一缺口已记录在设计末：普通new的三处语义、Depends角色、Mongo参数未知资源身份、缺watch/注入规则和现有DEPENDENCY/DATA_WATCH IR尚无完整消费者、critical baseline追踪。当前不批准新wire/IR/分数/数值，也不将这些事项改为DEFERRED。

链接/原始身份只读检查通过，17个兼容Source存在；本轮没有构建、测试或额外实际观察。原Spring诊断/失败及Node163证据未变，不重跑、不累计。审查为作者自审，按用户禁止新增代理不声称独立review。父项4/21、17OPEN。
