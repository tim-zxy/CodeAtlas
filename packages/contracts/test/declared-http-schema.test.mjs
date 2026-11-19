import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../dist/match-contracts.js';
import { fixture, seal, rebody, control, expected } from './fixtures/declared-schema.mjs';
test('declared HTTP matcher proves both explicit consumers without rewriting repo contracts', () => {
  assert.equal(typeof api.matchContractsV2, 'function');
  const x = fixture(),
    before = structuredClone(x.contractRefs),
    out = api.matchContractsV2(x, control());
  assert.deepEqual(
    out.matches.map((m) => m.payload.status),
    expected.complete,
  );
  assert.deepEqual(x.contractRefs, before);
  assert(out.matches.every((m) => m.payload.reasons.includes('DECLARED_HTTP_SCHEMA_EXACT_V1')));
  assert(
    out.matches.every(
      (m) => m.payload.supportRefs.filter((s) => s.entity.kind === 'SOURCE_FILE').length === 2,
    ),
  );
  assert(out.consumed.items > 0 && out.consumed.inputBytes > 0);
  assert.throws(() => api.matchContracts(x, control()));
  const reversed = structuredClone(x);
  reversed.schemaDocuments.reverse();
  reversed.repositoryBindings.reverse();
  assert.deepEqual(api.matchContractsV2(reversed, control()), out);
});
// Golden statuses follow input consumer order; matcher output has its own stable ref ordering.
const statuses = (x, out) =>
  x.contractRefs
    .filter((r) => r.contract.direction === 'CONSUMER')
    .map(
      (r) =>
        out.matches.find((m) => m.payload.consumerRef.entity.id === r.ref.entity.id).payload.status,
    );
test('declared HTTP missing attachments stay unknown and explicit contradictory response conflicts', () => {
  let x = fixture();
  x.schemaDocuments.pop();
  assert.deepEqual(statuses(x, api.matchContractsV2(seal(x), control())), expected.noProvider);
  x = fixture();
  rebody(x.schemaDocuments[0], (d) => d.bindings.pop());
  assert.deepEqual(
    statuses(x, api.matchContractsV2(seal(x), control())),
    expected.oneCallerMissing,
  );
  x = fixture();
  rebody(x.schemaDocuments[1], (d) => (d.bindings[0].response = { kind: 'ABSENT' }));
  assert.deepEqual(
    statuses(x, api.matchContractsV2(seal(x), control())),
    expected.oppositeResponse,
  );
});
test('declared HTTP cumulative caps and cooperative cancellation never produce successful matches', () => {
  const x = fixture(),
    normal = api.matchContractsV2(x, control()),
    bytes = normal.consumed.inputBytes;
  assert.throws(() => api.matchContractsV2(x, control({ maxInputBytes: bytes - 1 })));
  const small = api.matchContractsV2(x, control({ maxItems: normal.consumed.items - 1 }));
  assert.equal(small.termination, 'BUDGET');
  assert.equal(small.coverage.status, 'PARTIAL');
  const a = new AbortController();
  a.abort();
  assert.equal(api.matchContractsV2(x, control({ signal: a.signal })).termination, 'CANCELLED');
});

test('declared HTTP multiple proven providers remain ambiguous rather than selecting the first', () => {
  const x = fixture(),
    second = structuredClone(x.contractRefs.find((r) => r.contract.direction === 'PROVIDER'));
  second.ref.entity.id += ':second';
  second.contract.id += ':second';
  second.contract.factKey += ':second';
  x.contractRefs.push(second);
  const registration = structuredClone(
    x.catalog.contractBindings.find((r) => r.contractRef.entity.id === 'contract:provider'),
  );
  registration.contractRef = second.ref;
  x.catalog.contractBindings.push(registration);
  rebody(x.schemaDocuments[1], (d) =>
    d.bindings.push({
      ...structuredClone(d.bindings[0]),
      contractFactKey: second.contract.factKey,
    }),
  );
  const out = api.matchContractsV2(seal(x), control());
  assert(
    out.matches.every(
      (m) =>
        m.payload.status === 'AMBIGUOUS' &&
        m.payload.selectedProviderRef === null &&
        m.payload.candidateProviderRefs.length === 2,
    ),
  );
});

test('declared HTTP exhausted comparison allowance never spends beyond its declared cap', () => {
  const x = fixture(),
    prepared = api.prepareFrozenContractsV2(x, control()),
    out = api.matchContractsV2(x, control({ maxItems: prepared.consumed.items }));
  assert.equal(out.termination, 'BUDGET');
  assert(out.consumed.items <= prepared.consumed.items);
});

test('Kafka declarations bind both endpoints to versioned Source and exact wire shapes', () => {
  const x = fixture();
  x.matchingPolicyVersion = 'declared-kafka-schema-v1';
  const serviceRef = x.catalog.entries[0].serviceRef;
  for (const binding of x.catalog.contractBindings) binding.serviceRef = serviceRef;
  for (const entry of x.catalog.entries)
    Object.assign(entry, {
      identityKind: 'MESSAGE_NAMESPACE',
      namespace: 'KAFKA',
      key: 'owned-events',
    });
  for (const { contract } of x.contractRefs) {
    contract.protocol = 'MESSAGE';
    contract.signature = {
      kind: 'MESSAGE',
      transport: 'KAFKA',
      channel: 'events',
      namespace: null,
      role: contract.direction === 'PROVIDER' ? 'PRODUCER' : 'CONSUMER',
      payloadSchemaRef: null,
      keySchemaRef: null,
    };
  }
  for (const doc of x.schemaDocuments)
    rebody(doc, (data) => {
      data.schema = 'codeatlas.declared-kafka-schema';
      data.bindings = x.contractRefs
        .filter((r) => r.ref.repositoryId === doc.sourceFile.repositoryId)
        .map(({ contract }) => ({
          contractFactKey: contract.factKey,
          role: contract.signature.role,
          channel: 'events',
          namespace: 'owned-events',
          payload: { type: 'string', encoding: 'utf-8' },
          key: { kind: 'ABSENT' },
        }));
    });
  const match = (input) => api.matchContractsV2(seal(input), control()).matches;
  const matched = match(x);
  assert(matched.length > 0 && matched.every((m) => m.payload.status === 'MATCHED'));
  assert(
    matched.every(
      (m) => m.payload.supportRefs.filter((s) => s.entity.kind === 'SOURCE_FILE').length === 2,
    ),
  );
  const missing = structuredClone(x);
  missing.schemaDocuments.pop();
  assert(match(missing).every((m) => m.payload.selectedProviderRef === null));
  const conflict = structuredClone(x);
  rebody(conflict.schemaDocuments[1], (doc) => {
    doc.bindings[0].key = { type: 'string', encoding: 'utf-8' };
  });
  assert(match(conflict).every((m) => m.payload.status === 'CONFLICTED'));
  for (const mutate of [
    (doc) => {
      doc.bindings[0].role = 'CONSUMER';
    },
    (doc) => {
      doc.bindings[0].channel = 'other';
    },
    (doc) => {
      doc.bindings.push(doc.bindings[0]);
    },
  ]) {
    const changed = structuredClone(x);
    rebody(changed.schemaDocuments[1], mutate);
    assert.throws(() => match(changed));
  }
  const wrongRevision = structuredClone(x);
  wrongRevision.schemaDocuments[0].sourceFile.revisionId = 'rev:other';
  assert.throws(() => match(wrongRevision));
});
