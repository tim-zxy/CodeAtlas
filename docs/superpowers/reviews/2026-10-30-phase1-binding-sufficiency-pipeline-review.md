# B-F2-B作者设计/计划审查 — 2026-10-30

结论：DESIGN_AND_PLAN_REVIEW_READY，尚未批准或实施。范围见[设计](../specs/2026-10-30-phase1-binding-sufficiency-pipeline-design.md)与[J1–J5](../plans/2026-10-30-phase1-binding-sufficiency-pipeline.md)。作者自审，无新代理、产品/Fixture修改、测试/构建/Rust/DB/CI或Git写入。

已核对：固定v6 Rust入口与bool共享core；TS request5/6、budgeted Readable硬编码6；normalizer原域/策略/支持；History只1/2、Stage协议到envelope分派；V4现有集合闭包与IR依赖方向。锁定grammar核对了Python for/with/except/pattern/walrus/global/nonlocal/delete/import及Java参数/resource/import/update等实际字段；语法表不是解析器执行证据。

集中修正：持久H1需整个Syntax集合闭包，不能只单条parser；共享到IR避免Storage依赖Plugins；raw reader还须拒绝缺scope却宣称SUCCEEDED；Rust旧控制filter应为code_syntax_producer::tests，code_syntax.rs并无tests模块，不允许0tests冒称通过。新增kind的支持策略适用是提案，不把A的15项结构测试当新mapper/校准证据。

验收路径：J1真实Source→raw；J2精确bytes/terminal/版本；J3独立身份/支持/固定策略适用；J4真实Stage/Store/reopen及历史3；J5范围门禁/治理。未改Store故障算法无需全量重复旧退出矩阵。普通测试必须脱离.superpowers；实际捕获另记，未执行/skip不计PASS。

未解决的执行前决策集中为一次：批准新身份域与策略适用附约、集合共享校验和历史3，以及J1–J5内Rust库/受控Source/临时SQLite/必要复验。没有新分数、依赖、生产进程或云端授权请求。若新向量不支持旧策略适用，须停相关映射，不能默改分数。

完整四框架绑定/提取、语义策略、实际Native/物理资格和E01/E02仍缺；父任务4/21保持。不得把本设计作为后继四规则或profile的空白授权。
