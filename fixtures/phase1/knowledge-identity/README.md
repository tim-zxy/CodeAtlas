# Conservative identity and pure plans

Independent synthetic five-type IR inputs, adapted from the existing strict IR
vectors. No actual snapshot capture, model, Source/Native process or DB is involved.
Literal semantic/presentation digests were computed before production implementation
with independent Python hashlib + sorted-key UTF8 JSON and the declared set fields.
Tests compare these literal digests; they do not build their oracle with the producer.

Run `node --test packages/knowledge/test/identity.test.mjs packages/knowledge/test/reconciliation.test.mjs`
after building Knowledge. The root mandatory test includes both exact files.

Full scoped references and revision are compared; Claim state needs the same scope,
subject reference and declared snapshot binding. Mathematical reference closure here
is not actual capture authenticity. Contexts must come from validated Application
capture before real use; P1-12/14 are not implemented by this Fixture.

Outcomes are candidates/plans only. No publisher, opaque ID allocation, database,
model, timer, approved numerical threshold or resource profile is introduced.
MERGE without complete independently verified survivor facts remains review-only;
SPLIT always reviews; missing time/value proof cannot assert CONFLICT; disappearance
only proposes AFFECTED. Advanced drift remains DEFERRED, not PASS.
This bounded Fixture does not close all original P1-13/E09 obligations or Phase1.
