# ADR 009 No Automatic Remote Fallback

Status: Accepted

Decision: Remote LLM and embedding use are separate explicit opt-ins. Local-only mode or a security-policy block cannot fall back to any remote provider. Default `allowRemoteFallback` is false.

Consequences: failure may be partial/unavailable but does not exfiltrate data; derived facts and raw source can receive different access decisions.

