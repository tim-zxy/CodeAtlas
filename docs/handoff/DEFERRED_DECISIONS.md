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

Deferred means intentionally undecided, not forgotten. The formal roadmap contains no Phase 4.

