# Private document Source byte transport

Implementation slice of P1-10, following the existing knowledge/consumption design
section 2, Security RAW READ_SOURCE policy, and Source file/ancestor checks.
This is an implementation choice within those boundaries, not approval of a new
Document authorization, capture, parser, migration or publication contract.

The package-private readDocumentSourceBytes accepts an existing SourceFile, a
repository root, the existing shared MixedSourceAccount, and a trusted per-file
RAW authorization callback. It is not re-exported at the package root. Selection
and repository registration remain the trusted Application caller's responsibility;
an arbitrary caller-supplied SourceFile/hash is not evidence of selection or access.
No complete Application document workflow is claimed by this low-level API.

Authorization is awaited before filesystem access and again before returning.
The supplied file data is copied/validated and frozen before policy use. Source
checks canonical root identity, confined relative path, regular single-link file,
all ancestor identities, and the same opened file before/after reads and after close.
One output Buffer is prepaid against the same account before allocation; bounded
read attempts are prepaid. Raw SHA256 is computed from those same handle bytes and
must equal the supplied original fingerprint. Failure invalidates the account;
an opened handle closes in finally. No partial successful result is returned.

The returned Buffer is mutable and exclusively owned by its caller: no cache or
shared authoritative snapshot is created. Its accompanying fingerprint describes
the originally read bytes; modifying the Buffer invalidates that relationship.
It is unredacted/unparsed data, not a persisted DocumentRevision, authorization
capability, immutable capture, or publication token. Decoder/parser/inline-secret
validation must still run at their prescribed boundaries. No new default budget,
physical memory guarantee, remote destination or source permission is introduced.

An alternative of fingerprinting followed by an independent readFile was rejected:
it would separate verification from the consumed bytes. Existing fingerprint APIs
remain untouched; shared Source ancestor guards and account operations are reused.

Verification uses literal BOM/CRLF/Chinese/emoji bytes, empty/multi-chunk data,
wrong hash/traversal/hardlink/junction/replacement/growth, control failures, the
existing Application policy, and asynchronous permission rejection. Tests use only
owned temporary directories. Rollback removes this unused private transport and
its test-chain entry; no persistent data, old APIs or permissions require migration.

P1-10 still needs exact authorized-byte/parser/draft/secret-scanning/W007-W008
contracts and implementation. P1-12 still needs immutable multi-domain read ports
and capture contracts; this transport does not substitute for either acceptance.

## Existing Application selection and authorization composition

The existing private prepareMixedSource result now exposes readDocumentBytes(path).
It accepts no replacement root, byte payload, policy token or supplied observation.
It looks up the canonical SourceFile from its prepared state, compares the selected
path/fingerprint/classification/language to its Source observation, then checks the
existing RAW READ_SOURCE policy. Both the original policy classification and stored
file sensitivity must allow access; neither can downgrade the other.

The existing verifySelection closure is reused before reading and before returning:
its genuine Source observation/config binding, full selection refresh, expected root
and current canonical state comparison remain intact. The raw reader preserves its
same-handle identity/hash checks. Final authorization and account checkpoint follow
the second selection verification. Changes or failures invalidate the existing
account and preserve accurate Source commit effects. Reading adds no database write;
prepareMixedSource's earlier reconciliation still has its original COMMITTED effect.
These checks currently refresh selection twice per requested document. Batch capture
optimization requires preserving the same invariants, not deleting the checks.

This is local raw-input preparation, not immutable DocumentRevision/capture or a
secret scanner. The existing policy's secretDetected input must not be represented
as an implemented inline-secret detector. The returned mutable bytes remain subject
to the parser/consumer lifetime and persistence checks already required.

Contract triage: private authorized-byte/Draft containers, strict existing IR mapping,
UTF8 position conversion and storage transactions that preserve the specified opaque
IDs, immutable revisions, CAS and AUTO/MANUAL rules are implementation details. They
do not individually require new architecture approvals. A new parser main dependency
still needs explicit selection: the historical remark 69-node closure has not been
adopted merely by preparing this input path. Actual inline-secret detection source
and coverage must be stated and tested; fail-closed whole-document blocking is an
existing option, while a new security service or changed public redaction semantics
would require separate governance. No dependency/DDL/scanner was added by this batch.

Canonical-state comparison also precedes each Source refresh, so an already changed
stored classification refuses without reopening Source. The post-refresh check
remains required: the first check does not protect the subsequent async interval.
