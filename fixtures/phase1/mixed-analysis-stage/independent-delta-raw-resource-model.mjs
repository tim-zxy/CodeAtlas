import assert from 'node:assert/strict';
import { measures } from './independent-code-resource-model.mjs';
import { modelDeclaredHistoryScope } from './independent-delta-history-resource-model.mjs';
import { modelNonemptyRawDecoder } from './independent-nonempty-raw-decoder-resource-model.mjs';
/** Closed existing partial Python DELTA admission; full Source inventory, Native-only removals and cumulative decoder. */
export function modelDeltaRawAdmission(packet, raw) {
  assert.equal(raw.metadata.java, null);
  const scope = modelDeclaredHistoryScope(packet),
    decoded = modelNonemptyRawDecoder(raw),
    ledger = [...scope.ledger.map((v) => ({ ...v, label: 'scope ' + v.label }))];
  const q = (label, v) => {
    const m = measures(v);
    ledger.push({
      label,
      serializedBytes: Buffer.byteLength(JSON.stringify(v)),
      items: Number(m.nodes),
      depth: m.depth,
    });
  };
  for (const label of ['metadata input', 'owned metadata', 'parsed metadata'])
    q(label, raw.metadata);
  assert.deepEqual(raw.metadata.inventory, packet.target.inventory);
  assert.deepEqual(raw.metadata.targetSource, packet.target.source);
  const ids = new Set();
  for (const u of scope.result.requiredUnits) {
    assert.equal(u.kind, 'PYTHON_FILE');
    q('required observation unit', u);
    for (const id of u.sourceFileIds) {
      q('required file id', id);
      ids.add(id);
    }
  }
  const files = packet.target.inventory.filter((f) => ids.has(f.id));
  for (const f of files) q('projected observation Source', f);
  const removed = scope.result.diff
    .filter(
      (d) =>
        d.kind === 'REMOVED' &&
        ['SOURCE', 'TEST'].includes(d.before.classification.role) &&
        ['java', 'python'].includes(d.before.languageHint),
    )
    .map((d) => ({
      id: d.before.id,
      path: d.before.path,
      previousContentFingerprint: d.before.contentFingerprint,
    }));
  for (const r of removed) q('projected Native deletion', r);
  const order = (a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
    Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
  files.sort(order);
  removed.sort(order);
  ledger.push(...decoded.ledger.map((v) => ({ ...v, label: 'decoder ' + v.label })));
  assert.deepEqual(decoded.result.observation.request.payload.sourceFiles, files);
  assert.deepEqual(decoded.result.observation.request.payload.removedSourceFiles, removed);
  const admitted = {
    kind: 'DECLARED_DELTA_RAW_OBSERVATION',
    metadata: raw.metadata,
    java: null,
    codeSyntax: decoded.result.observation,
    provenance: {
      kind: 'DECLARED_INPUT',
      requestIdentity: decoded.result.observation.requestChecksum,
      outputIdentity: decoded.result.outputIdentity,
    },
  };
  q('complete admitted raw', admitted);
  const cost = {
    serializedBytes: ledger.reduce((n, v) => n + v.serializedBytes, 0),
    items: ledger.reduce((n, v) => n + v.items, 0),
    maxDepth: Math.max(...ledger.map((v) => v.depth)),
  };
  assert.ok(Number.isSafeInteger(cost.serializedBytes) && Number.isSafeInteger(cost.items));
  return { result: { packet, scope: scope.result, raw: admitted }, cost, ledger };
}
import crypto from 'node:crypto';
import { modelHistorySupportCandidate } from './independent-delta-history-resource-model.mjs';
/** Complete closed original partial Python DELTA Provider pipeline, with total-budget admission and reused opaque unit. */
export function modelDeltaRawProvider(packet, raw) {
  const admission = modelDeltaRawAdmission(packet, raw),
    decoder = modelNonemptyRawDecoder(raw),
    ledger = [...admission.ledger];
  const q = (label, v) => {
      const m = measures(v);
      ledger.push({
        label,
        serializedBytes: Buffer.byteLength(JSON.stringify(v)),
        items: Number(m.nodes),
        depth: m.depth,
      });
      return v;
    },
    cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    ref = (r) => JSON.stringify([r.factType, r.providerId, r.providerFactId]);
  const existing = packet.history.state.units;
  q('all existing units', existing);
  const units = admission.result.scope.requiredUnits
    .map((d) => {
      q('required unit descriptor', d);
      let id = d.previousUnitId;
      if (id === null) {
        const domain = 'history-native-unit-v1',
          fields = [
            packet.target.source.repositoryId,
            packet.target.source.revisionId,
            packet.target.repositoryLocatorDigest,
            'native',
            d.kind,
            ...(d.kind === 'PYTHON_FILE' ? d.sourceFileIds : []),
          ];
        q('fresh unit identity fields', fields);
        const wire = domain + '\0' + fields.map((v) => Buffer.byteLength(v) + ':' + v).join('');
        ledger.push({
          label: 'fresh unit tuple representations',
          items: fields.length + 2,
          serializedBytes: Buffer.byteLength(wire) + Buffer.byteLength(domain) + 1 + 64,
          depth: 0,
        });
        id = domain + ':' + crypto.createHash('sha256').update(wire).digest('hex');
      }
      q('observed unit id', id);
      return q('observed unit', {
        id,
        providerId: 'native',
        kind: d.kind,
        sourceFileIds: d.sourceFileIds,
      });
    })
    .sort((a, b) => cmp(a.id, b.id));
  q('assembled observation units', units);
  const start = decoder.ledger.findIndex((v) => v.label === 'Python input'),
    end = decoder.ledger.findIndex((v) => v.label === 'Python normalized pairs');
  assert.ok(start >= 0 && end >= start);
  ledger.push(
    ...decoder.ledger.slice(start, end + 1).map((v) => ({ ...v, label: 'assemble ' + v.label })),
  );
  const normalized = decoder.normalized;
  q('assembled normalized pairs', normalized);
  for (const pair of [...normalized.nodePairs, ...normalized.edgePairs]) {
    q('normalized Provider fact id', pair.provider.providerFactId);
    q('normalized canonical id', pair.canonical.id);
  }
  const c = admission.result.raw.codeSyntax,
    diagnostics = c.events.filter((e) => e.type === 'DIAGNOSTIC').map((e) => e.payload),
    capabilities = [
      ...(units.some((u) => u.kind === 'JAVA_GROUP') ? ['JAVA_CODE_V2'] : []),
      ...(units.some((u) => u.kind === 'PYTHON_FILE') ? ['PYTHON_SYNTAX_CODE_V1'] : []),
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
    ].map((name) => ({ name, support: 'SUPPORTED', coverage: 'COMPLETE' }));
  q('assembled diagnostics', diagnostics);
  q('assembled capabilities', capabilities);
  const snapshot = {
    ...raw.metadata.snapshot,
    repositoryId: packet.target.source.repositoryId,
    requestedRevisionId: packet.target.source.revisionId,
    requestedRevisionFingerprint: packet.target.source.contentFingerprint,
    capabilities,
    diagnostics,
    outcome: 'SUCCEEDED',
  };
  q('observation snapshot draft', snapshot);
  q('parsed observation snapshot', snapshot);
  for (const f of packet.target.inventory) q('complete Source lookup', [f.id, f]);
  const events = c.events.filter((e) => e.type === 'NODE' || e.type === 'EDGE');
  for (const e of events) {
    const key = ref({
      factType: e.type,
      providerId: e.payload.providerId,
      providerFactId: e.payload.providerFactId,
    });
    q('original Provider identity', key);
    q('original Provider lookup', [key, e.payload]);
  }
  const dependencies = [...normalized.nodePairs, ...normalized.edgePairs]
    .map((pair) => {
      const e = events.find(
        (e) =>
          e.type === pair.provider.factType &&
          e.payload.providerId === pair.provider.providerId &&
          e.payload.providerFactId === pair.provider.providerFactId,
      );
      assert.ok(e);
      const unit = units.find((u) => u.sourceFileIds.includes(e.payload.sourceRange.sourceFileId));
      assert.ok(unit);
      return q('original support dependency', { providerFact: pair.provider, unitIds: [unit.id] });
    })
    .sort(
      (a, b) =>
        cmp(a.providerFact.factType, b.providerFact.factType) ||
        cmp(a.providerFact.providerId, b.providerFact.providerId) ||
        cmp(a.providerFact.providerFactId, b.providerFact.providerFactId),
    );
  const coverage = [];
  for (const unit of units)
    for (const facet of [
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      unit.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
    ])
      coverage.push(
        q('observation coverage origin', {
          unitId: unit.id,
          facet,
          originSnapshotId: snapshot.id,
          coverage: 'COMPLETE',
        }),
      );
  coverage.sort((a, b) => cmp(a.unitId, b.unitId) || cmp(a.facet, b.facet));
  const observation = {
    observation: { snapshot, nodes: normalized.nodePairs, edges: normalized.edgePairs },
    units,
    supportDependencies: dependencies,
    coverage,
    requestIdentity: admission.result.raw.provenance.requestIdentity,
    outputIdentity: admission.result.raw.provenance.outputIdentity,
    settlement: 'DECLARED_SUCCEEDED',
  };
  q('complete declared observation', observation);
  const observedPacket = { ...packet, observation };
  q('complete observed history packet', observedPacket);
  const candidate = modelHistorySupportCandidate(observedPacket);
  ledger.push(...candidate.ledger.map((v) => ({ ...v, label: 'candidate ' + v.label })));
  const result = {
    kind: 'DECLARED_DELTA_RAW_SUPPORT_CANDIDATE',
    candidate: candidate.result,
    raw: admission.result.raw,
  };
  q('complete raw support result', result);
  const cost = {
    serializedBytes: ledger.reduce((n, v) => n + v.serializedBytes, 0),
    items: ledger.reduce((n, v) => n + v.items, 0),
    maxDepth: Math.max(...ledger.map((v) => v.depth)),
  };
  assert.ok(Number.isSafeInteger(cost.serializedBytes) && Number.isSafeInteger(cost.items));
  return { result, observation, cost, ledger };
}
