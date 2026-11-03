import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
/** Independent old complete pair plus current-basis-only retained projection; no product or observed usage. */
function initialPair(item, state, q, h) {
  const basis = item.body.envelope.payload.supportRefs[0].basis,
    scope = (kind, value) => ({
      scope: 'REPOSITORY',
      repositoryId: basis.repositoryId,
      entity: { kind, id: value.id, revisionId: basis.revisionId },
    });
  const body = item.body,
    source = body.sourceFile,
    snapshot = body.originSnapshot,
    payload = body.envelope.payload,
    input = { body, selectedNodes: state.nodes };
  q('pair input', input);
  q('pair owned', input);
  q('pair parsed', input);
  q('pair envelope', body.envelope);
  q('pair parsed envelope', body.envelope);
  const available = [
    { kind: 'SOURCE_FILE', value: source },
    ...state.nodes.map((value) => ({ kind: 'CODE_NODE', value })),
  ];
  q('pair available values', available);
  const values = new Map(),
    entities = [];
  for (const { kind, value } of available) {
    const ref = scope(kind, value);
    q('pair available lookup', [kind + ':' + value.id, value, ref]);
    values.set(kind + ':' + value.id, value);
    entities.push(ref);
  }
  for (const support of payload.supportRefs) {
    const key = support.entity.kind + ':' + support.entity.id,
      v = values.get(key);
    q('pair support lookup', [key, v]);
    h('codeatlas-phase1-support-value-v1', v);
  }
  q(
    'pair supported identities',
    payload.supportRefs.map((s) => s.entity.kind + ':' + s.entity.id),
  );
  const rc = { availableEntities: entities, availableSupports: payload.supportRefs };
  q('pair reference context', rc);
  q('pair parsed reference context', rc);
  q('pair final envelope', body.envelope);
  q('pair final parsed envelope', body.envelope);
  const { id: initialId, ...withoutId } = payload;
  q('pair payload without id', withoutId);
  if (initialId !== 'syntax:' + h('codeatlas-syntax-initial-v1', withoutId))
    throw Error('independent initial identity mismatch');
  q('pair complete body', body);
  const od = h('codeatlas-syntax-origin-v1', body),
    originId = 'syntax-origin:' + od,
    pd = h('codeatlas-syntax-projection-v1', { originId, payload: withoutId }),
    projectionId = 'syntax:' + pd,
    projected = {
      schema: 'codeatlas.syntax-evidence',
      version: 1,
      payload: { ...payload, id: projectionId },
    };
  q('projected envelope', projected);
  const pairEncode = (label, v) => {
      q(label + ' encoding', v);
      q(label + ' reserve', v);
      return C(v);
    },
    pair = {
      origin: {
        id: originId,
        repository_id: source.repositoryId,
        revision_id: source.revisionId,
        origin_snapshot_id: snapshot.id,
        origin_digest: od,
        origin_json: pairEncode('origin', body),
      },
      projection: {
        id: projectionId,
        repository_id: source.repositoryId,
        origin_id: originId,
        projection_digest: pd,
        envelope_json: pairEncode('projection', projected),
      },
      member: { originId, projectionId, unitId: body.unitId },
      metadata: {
        id: originId,
        unitId: body.unitId,
        originSnapshotId: snapshot.id,
        valueDigest: od,
        basis,
      },
    };
  q('complete pair', pair);
  return pair;
}
export function modelRetainedHistoryPair(body, originNodes, currentBasis, currentNodes) {
  const ledger = [],
    q = (label, v) => {
      const m = measures(v);
      ledger.push({
        label,
        items: Number(m.nodes),
        serializedBytes: Buffer.byteLength(JSON.stringify(v)),
        depth: m.depth,
      });
    },
    h = (domain, v) => {
      q(domain + ' input', v);
      q(domain + ' ordered reserve', v);
      ledger.push({
        label: domain + ' frame',
        items: 0,
        serializedBytes: Buffer.byteLength(domain) + 1,
        depth: 0,
      });
      return crypto
        .createHash('sha256')
        .update(domain + '\0' + C(v))
        .digest('hex');
    };
  const input = { body, originNodes, currentBasis, currentNodes };
  q('retained input', input);
  q('retained owned input', input);
  q('retained schema input', input);
  const initial = initialPair({ body }, { nodes: originNodes }, q, h),
    basis = currentBasis,
    source = body.sourceFile;
  assert.equal(basis.repositoryId, source.repositoryId);
  assert.equal(basis.revisionId, source.revisionId);
  q('retained envelope', body.envelope);
  q('parsed retained envelope', body.envelope);
  const { id, ...meaning } = body.envelope.payload,
    available = [
      { kind: 'SOURCE_FILE', value: source },
      ...currentNodes.map((value) => ({ kind: 'CODE_NODE', value })),
    ],
    entities = [];
  q('current available values', available);
  for (const { kind, value } of available) {
    const reference = {
      scope: 'REPOSITORY',
      repositoryId: basis.repositoryId,
      entity: { kind, id: value.id, revisionId: basis.revisionId },
    };
    q('current available lookup', [kind + ':' + value.id, value, reference]);
    entities.push(reference);
  }
  const supports = body.envelope.payload.supportRefs.map((s) => {
    const key = s.entity.kind + ':' + s.entity.id,
      value = available.find((v) => v.kind === s.entity.kind && v.value.id === s.entity.id)?.value;
    assert.ok(value);
    q('current support lookup', [key, value]);
    const replacement = { ...s, basis, valueDigest: h('codeatlas-phase1-support-value-v1', value) };
    q('replacement current support', replacement);
    return replacement;
  });
  const payload = { ...meaning, supportRefs: supports };
  q('current payload', payload);
  const pd = h('codeatlas-syntax-projection-v1', { originId: initial.origin.id, payload }),
    projectionId = 'syntax:' + pd,
    envelope = {
      schema: 'codeatlas.syntax-evidence',
      version: 1,
      payload: { id: projectionId, ...payload },
    },
    referenceContext = { availableEntities: entities, availableSupports: supports };
  for (const v of [envelope, envelope, referenceContext, referenceContext, envelope, envelope])
    q('current validated envelope/reference representation', v);
  const result = {
    ...initial,
    projection: {
      id: projectionId,
      repository_id: basis.repositoryId,
      origin_id: initial.origin.id,
      projection_digest: pd,
      envelope_json: C(envelope),
    },
    member: { ...initial.member, projectionId },
  };
  q('complete retained pair', result);
  const cost = {
    serializedBytes: ledger.reduce((n, v) => n + v.serializedBytes, 0),
    items: ledger.reduce((n, v) => n + v.items, 0),
    maxDepth: Math.max(...ledger.map((v) => v.depth)),
  };
  return { result, cost, ledger };
}
