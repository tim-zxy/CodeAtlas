# Product Vision

## Product definition

Build a local-first Engineering Intelligence and Knowledge Runtime for Coding Agents. It continuously maintains verifiable code, contract, and execution facts, and compiles durable engineering knowledge only when requested. The interfaces and handoff are agent-neutral: Codex, Claude Code, OpenCode, IDEs, CLIs, and future Engineering Agents consume the same canonical state through compact agent projections or readable wiki projections.

Wiki pages are views. They are not the source of truth.

## Outcomes

The product must:

- install quickly and work without a cloud service, LLM, embedding model, or daemon;
- keep source fingerprints, code facts, contracts, `ExecutionGraph`, and `RuntimeFlow` current through incremental updates;
- preserve stable engineering knowledge such as components, capabilities, flows, integrations, architecture rules, decisions, and migrations;
- distinguish observed current state, declared target state, historical state, and transition state;
- provide agents with project context, symbol understanding, traceable flows, cross-repository contracts, impact context, architecture context, and change context;
- expose confidence, evidence, resolution, coverage, freshness, and provenance instead of hiding uncertainty;
- improve through fixtures, evaluation, usage, corrections, curated claims, and resolution rules.

## Product domains

1. Workspace and source management
2. Code intelligence
3. Runtime and flow intelligence
4. Cross-repository contract intelligence
5. Document intelligence
6. Engineering knowledge and wiki projection
7. Change, impact, and lifecycle management
8. Search, retrieval, and agent context
9. Evaluation and knowledge flywheel
10. Local runtime, security, configuration, and packaging

## Users and primary jobs

- Coding agent: obtain bounded, fresh, referenced context before changing code.
- Developer: understand unfamiliar modules, entry points, dependencies, and flows.
- Reviewer: identify affected contracts, flows, data resources, and architecture rules.
- Maintainer: keep knowledge useful without regenerating it on every save.
- Platform owner: understand multi-repository services, contracts, boundaries, and migrations.

## Non-goals

- Replacing file reading, grep, editing, source control, or shells already available to agents.
- Treating a generated narrative as canonical truth.
- Requiring vectors for core retrieval.
- Building a cloud control plane in the initial product.
- Converting every provider-specific fact into false certainty.
- Freezing speculative Phase 3 storage or routing details before evidence exists.

## Success definition

The deterministic core works locally without LLMs. Code intelligence is measurable and incrementally correct. Higher-level knowledge is grounded, identity-stable, state-aware, manually published, and never replaces the last known-good version on a failed build. Agent responses include references and freshness so consumers can decide when to inspect raw sources.

## Handoff independence

The implementation repository carries its own product intent, architecture, governance, roadmap, work breakdown, acceptance, traceability, specifications, decisions, and current status. A new Engineering Agent can continue work without access to the original ChatGPT conversation or the history of any earlier Agent.
