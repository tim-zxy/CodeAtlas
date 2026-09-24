# Deferred Decisions

| Decision | Earliest phase | Trigger for design | Constraint |
|---|---:|---|---|
| SCIP and Joern depth | 3 | Measured gaps in native/provider accuracy | Must normalize through Provider SPI and Canonical IR. |
| CFG/PDG and taint persistence | 3 | Agent utility shows demand for advanced flow/data analysis | Do not overload `ExecutionGraph` with provider-native structures. |
| Adaptive provider routing | 3 | Comparable quality, latency, and coverage data exists | Preserve deterministic capability reporting. |
| Adaptive model routing and prompt auto-tuning | 3 | Stable semantic fixtures and cost/quality data exist | No silent remote fallback. |
| Managed local model download | 3 | Distribution size, licensing, and UX are validated | Core install remains model-free. |
| Third-party plugin sandbox | 3 | External plugin ecosystem is approved | Phase 1 uses built-in trusted plugins only. |
| Agent session memory | 3 | Privacy model and utility metrics justify persistence | Canonical knowledge is not session memory. |
| Enterprise ACL and remote runtime | 3 or later | A concrete deployment requirement exists | Local-first defaults remain intact. |
| Single executable | 3 | Packaging data shows benefit over npm plus native binaries | Protocol and IR versioning remain independent. |
| Automatic semantic publication | 3 or later | False-change and identity-drift rates meet an approved gate | Manual mode remains available and safe. |
| Exact Phase 3 physical schemas | 3 | Prior phase requirements stabilize | Avoid speculative migrations. |
| User-authored Declarative WikiSpec, profile inheritance, and persistence | 2 | Phase 1 standard Wiki/projection has been evaluated | Spec/profile changes never call `update_knowledge`; pin versions. |
| Wiki validation and diff policy tuning | 2 | Projection Fixtures and internal use cases exist | Missing data is explicit; no LLM filler. |
| Custom Wiki Section Provider and Data Adapter SDK | 3 | Trusted extension use cases and security review exist | No direct Canonical Knowledge or SQLite mutation. |
| `FAST`/`BALANCED`/`PRECISE` analysis-depth profiles | 2 or later | Cold and incremental benchmarks plus quality data exist | Profiles never change Canonical IR or bypass capability evidence; adaptive routing remains Phase 3. |
| Complete source-grounded KnowledgeCandidate degradation orchestration | 2 | Phase 1 candidate-path grounding/security and agent-utility evidence | Phase 1 may define and validate bounded candidates under its authorized manual workflow; full orchestration is not a Phase 0/0.5/1 dependency. |
| DiagramModel, Mermaid renderer, and artifact lifecycle | 2 | Phase 1 engineering-fact/Knowledge provenance and projection Fixtures | Diagram remains derived, not canonical; temporal sequence requires ordered evidence. |
| Cross-repository sequence and migration diagrams | 2 | Contract-boundary order evidence and published migration knowledge | Do not infer order from CallGraph or fabricate target-state steps. |

Deferred means intentionally undecided, not forgotten. The formal roadmap contains no Phase 4.

