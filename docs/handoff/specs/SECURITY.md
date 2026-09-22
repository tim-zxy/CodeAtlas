# Security and Trust Boundary Specification

## Trust zones and defaults

Local source and canonical databases remain local by default. Network use, remote LLMs, and remote embeddings require explicit independent configuration. MCP stdio is the Phase 1 default. Telemetry and usage events are separate; local usage recording never implies upload.

Classify data as `PUBLIC | INTERNAL | SENSITIVE | SECRET`. A policy decision considers source classification, derived-vs-raw form, caller, destination, operation, path, and explicit overrides. Derived facts can be permitted while the raw secret source remains denied.

## Source and secret controls

Default deny patterns include `.env*`, private keys, credentials, and secret directories. Secret detection scans candidate payloads before remote transfer and returns redaction/block diagnostics without persisting raw matches. Index access, remote-LLM access, and remote-embedding access are evaluated separately.

## LLM and document safety

External documents, comments, and source text are untrusted evidence, never runtime instructions. Context construction strips/labels instructions, preserves provenance, enforces bounded references, and applies redaction. Model output is untrusted, schema-validated candidate data. A security-policy block stops or uses an allowed local model; it never chooses another remote provider.

## Provider and plugin execution

Native processes use `shell=false`, absolute executable paths, explicit arguments, bounded stdin/stdout/stderr, timeouts, cancellation, and stderr-only logs. Protocol stdout is data, not a log stream. No environment variable is inherited automatically. The production client permits callers to supply only `LANG`, `LC_ALL`, `NO_COLOR`, `SYSTEMROOT`, `WINDIR`, `TEMP`, and `TMP`; every other caller-supplied key is rejected. On Windows, inherited host variables are explicitly blanked before the allowlist overlay because the process launcher can otherwise restore parent values. Windows may still synthesize the platform-intrinsic `NUMBER_OF_PROCESSORS`; consumers must not treat it as trusted configuration or a secret-bearing channel.

Native stderr is capped at 1,000,000 bytes and retained only for bounded process-exit diagnostics. It is not parsed as protocol data and is omitted from default error serialization. Timeout, cancellation, corruption, overflow, decoding, schema, complete-stream, and checksum failures terminate or drain the child as applicable and expose no partial events. Phase 1 plugins are built-in and trusted but still receive bounded contexts; arbitrary third-party execution is deferred.

## Agent authorization

Separate query permission from knowledge-update permission. Agent setup supports dry-run, parses/merges/backs up configuration, and emits a snippet instead of unsafe overwrite. No agent operation can bypass source policy or mutate canonical state except through authorized application commands.

## Persistence and logging

Do not store raw secrets, full prompts/contexts, unrestricted environment values, credentials, or hidden reasoning. Invocation metadata/fingerprints and structured result references are sufficient by default; opt-in debug payload retention requires warning, local-only storage, and retention limits.

## Required errors

Include permission denied, security policy blocked, secret detected, remote disabled, provider unavailable, auth failed, rate limited, context too large, output invalid, budget exceeded, protocol violation, and database too new. Errors expose safe remediation without leaking protected data.

