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
