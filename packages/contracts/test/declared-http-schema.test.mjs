import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalRuntimeJson } from '@codeatlas/ir';
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
  x.kafkaSourceFiles = [];
  for (const doc of x.schemaDocuments) {
    const contracts = x.contractRefs.filter(
      (r) => r.ref.repositoryId === doc.sourceFile.repositoryId,
    );
    const sites = contracts.map(({ contract }) =>
      contract.signature.role === 'PRODUCER'
        ? 'template.send("events", key, value)'
        : '@KafkaListener(topics = "events")',
    );
    const code = {
      ...doc.sourceFile,
      id: 'file:kafka-sites:' + doc.sourceFile.repositoryId,
      path: 'Sites.java',
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      contentFingerprint: 'sha256:' + createHash('sha256').update(sites.join('\n')).digest('hex'),
    };
    const sourceSupport = {
      ...doc.sourceSupport,
      entity: { ...doc.sourceSupport.entity, id: code.id },
      valueDigest: createHash('sha256')
        .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(code))
        .digest('hex'),
    };
    x.kafkaSourceFiles.push({ sourceFile: code, sourceSupport });
    const ranges = sites.map((site, index) => ({
      startLine: index,
      startColumn: 0,
      endLine: index,
      endColumn: site.length,
    }));
    contracts.forEach(({ contract }, i) => {
      contract.sourceRange = { sourceFileId: code.id, ...ranges[i] };
    });
    rebody(doc, (data) => {
      data.schema = 'codeatlas.declared-kafka-schema';
      data.bindings = contracts.map(({ contract }, i) => ({
        selector: {
          path: code.path,
          contentFingerprint: code.contentFingerprint,
          range: ranges[i],
        },
        role: contract.signature.role,
        channel: 'events',
        namespace: 'owned-events',
        payload: { type: 'string', encoding: 'utf-8' },
        key: { type: 'string', encoding: 'utf-8' },
      }));
    });
  }
  const match = (input) => api.matchContractsV2(seal(input), control()).matches;
  const matched = match(x);
  assert(matched.length > 0 && matched.every((m) => m.payload.status === 'MATCHED'));
  assert(
    matched.every(
      (m) => m.payload.supportRefs.filter((s) => s.entity.kind === 'SOURCE_FILE').length === 4,
    ),
  );
  const missing = structuredClone(x);
  missing.schemaDocuments.pop();
  assert(match(missing).every((m) => m.payload.selectedProviderRef === null));
  const unkeyed = structuredClone(x);
  for (const document of unkeyed.schemaDocuments)
    rebody(document, (doc) => {
      for (const binding of doc.bindings) binding.key = { kind: 'ABSENT' };
    });
  const unkeyedResult = api.matchContractsV2(seal(unkeyed), control());
  assert.equal(unkeyedResult.coverage.status, 'PARTIAL');
  assert(
    unkeyedResult.matches.every(
      (m) => m.payload.status === 'UNRESOLVED' && m.payload.selectedProviderRef === null,
    ),
  );
  const conflict = structuredClone(x);
  rebody(conflict.schemaDocuments[1], (doc) => {
    doc.bindings[0].key = { kind: 'ABSENT' };
  });
  assert(match(conflict).every((m) => m.payload.status === 'CONFLICTED'));
  for (const mutate of [
    (doc) => {
      delete doc.bindings[0].key;
    },
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
