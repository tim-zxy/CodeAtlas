# Security and Trust Boundary Specification

2026-10-19 ADR-019 source-copy trust distinction: Cargo may hard-link its trusted
local build output; checked regular-file identity/hash before/after copying is
required. The independent fixed-root Native, archive and every owned/packed
member still reject multiple links. No archive-selected build input is accepted.

2026-10-18 evidence-backed ADR-019 refinement: .NET ZIP Entry.Open clamps forged
lengths; hostile-fixture RED requires independent bounded System32/tar.exe
read-only stdout/hash/exit validation while .NET keeps creation/materialization.
Fixed argument arrays, allowlisted child environment, closed stdin, drained
stderr and kill/join on overflow; NEVER native tar filesystem extraction. Missing
verifier fails closed. No dependency install/custom production parser/cap change.
Actual original-attempt exports preserve bytes and source mapping outside frozen
inputs, but confer no inode/replay/restore authority. Transient mutable scratch
stays on the fixed volume; export failure fails acceptance and always-upload has
a scoped synthetic replay-root fallback. Read-only packaging across processes
does not authorize root adoption, installation or repair. Remote/numeric gates stay.

2026-10-18 written ADR-019 accepted: implement confined synthetic-pack tooling
under its exact inventory/root/link/size/provenance guards. Host permissions and
explicit artifact publication/remote authority remain required. No production
remote fallback or security-policy weakening; prior pending notices are history.

2026-10-18 proposed [ADR-019](../adr/ADR-019-d5-exact-layout-ci-replay.md) permits
no current download/publication. Its reviewed synthetic-pack design requires
read-only hash-pinned artifact retrieval, exact allowlisted inventory, exclusive
dedicated root and path/link/size guards before execution. No user source/secrets,
arbitrary archive code, unrestricted environment, production remote fallback or
directory overwrite. Explicit artifact-publication authority remains separate.
Written review pending; product trust boundaries below are unchanged.

2026-10-15 accepted ADR-018/§9 rollout: request/source hashes and scalar parser
diagnostics only, inherited ceilings, no raw source/path/request ID or new env key.
The private Evaluation reader observes existing stderr consumption. Production
protocol/admission/publication still ignores diagnostic meaning and retains
existing error serialization/termination rules. Hashes are local correlation,
not anonymity or authenticity; child/receipt/Source qualification remains required.

2026-10-15 review update: original written ADR-018/design accepted; rollout still
awaits revised-plan/corrected-count review. No code, default error serialization,
environment, remote access or current production stderr treatment changed.
The accepted design limits interpretation to owned development Evaluation and
explicitly denies Provider/resource/publication authority to diagnostics.

2026-10-15 pending design review: [ADR-018](../adr/ADR-018-native-evaluation-observations.md)
proposes a private development-Evaluation interpretation of bounded hashed parser
diagnostics. Its [written design](../../superpowers/specs/2026-10-15-p05-native-parse-observation-design.md)
is not accepted or implemented. Current stderr/default-error/production decoding
rules below remain unchanged. References are local correlation metadata, not a
secrecy guarantee or Canonical Evidence. No remote transmission or new environment
key is authorized; any FROZEN conflict requires explicit accepted amendment.

## Trust zones and defaults

Local source and canonical databases remain local by default. Network use, remote LLMs, and remote embeddings require explicit independent configuration. MCP stdio is the Phase 1 default. Telemetry and usage events are separate; local usage recording never implies upload.

Classify data as `PUBLIC | INTERNAL | SENSITIVE | SECRET`. A policy decision considers source classification, derived-vs-raw form, caller, destination, operation, path, and explicit overrides. Derived facts can be permitted while the raw secret source remains denied.

## Source and secret controls

Default deny patterns include `.env*`, private keys, credentials, and secret directories. Secret detection scans candidate payloads before remote transfer and returns redaction/block diagnostics without persisting raw matches. Index access, remote-LLM access, and remote-embedding access are evaluated separately.

## LLM and document safety

External documents, comments, and source text are untrusted evidence, never runtime instructions. Context construction strips/labels instructions, preserves provenance, enforces bounded references, and applies redaction. Model output is untrusted, schema-validated candidate data. A security-policy block stops or uses an allowed local model; it never chooses another remote provider.

## Provider and plugin execution

Native processes use `shell=false`, absolute executable paths, explicit arguments, bounded stdin/stdout/stderr, timeouts, cancellation, and stderr-only logs. Protocol stdout is data, not a log stream. No environment variable is inherited automatically. The production client permits callers to supply only `LANG`, `LC_ALL`, `NO_COLOR`, `SYSTEMROOT`, `WINDIR`, `TEMP`, and `TMP`; every other caller-supplied key is rejected. On Windows, inherited host variables are explicitly blanked before the allowlist overlay because the process launcher can otherwise restore parent values. Windows may still synthesize the platform-intrinsic `NUMBER_OF_PROCESSORS`; consumers must not treat it as trusted configuration or a secret-bearing channel.

Native stderr is capped at 1,000,000 bytes and retained only as explicit diagnostic metadata on typed client failures. It is not parsed as protocol data and is omitted from default error serialization. Timeout, cancellation, corruption, overflow, decoding, schema, complete-stream, and checksum failures terminate or drain the child as applicable and expose no partial events. Phase 1 plugins are built-in and trusted but still receive bounded contexts; arbitrary third-party execution is deferred.

## Agent authorization

Separate query permission from knowledge-update permission. Agent setup supports dry-run, parses/merges/backs up configuration, and emits a snippet instead of unsafe overwrite. No agent operation can bypass source policy or mutate canonical state except through authorized application commands.

## Persistence and logging

Do not store raw secrets, full prompts/contexts, unrestricted environment values, credentials, or hidden reasoning. Invocation metadata/fingerprints and structured result references are sufficient by default; opt-in debug payload retention requires warning, local-only storage, and retention limits.

## Required errors

Include permission denied, security policy blocked, secret detected, remote disabled, provider unavailable, auth failed, rate limited, context too large, output invalid, budget exceeded, protocol violation, and database too new. Errors expose safe remediation without leaking protected data.

