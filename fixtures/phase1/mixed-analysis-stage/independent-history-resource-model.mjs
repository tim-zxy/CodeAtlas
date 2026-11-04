import { measures } from './independent-code-resource-model.mjs';
export const historyCanonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(historyCanonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + historyCanonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const number = (n) => {
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('independent unsafe history cost');
  return Number(n);
};
/** Ordered primitive ledger from the frozen history contracts. No HistoryReadBudget/product imports or receipts. */
export function formatResourceLedger(steps) {
  let items = 0n,
    serializedBytes = 0n,
    pin = 0n,
    maxDepth = 0;
  const ledger = steps.map(({ kind, value, domain, label }) => {
    const m = measures(value),
      bytes = BigInt(Buffer.byteLength(historyCanonical(value))),
      domainBytes = kind === 'digest' ? BigInt(Buffer.byteLength(domain) + 1) : 0n,
      pins = kind === 'parse' ? m.weight : 2n * bytes + (kind === 'digest' ? 64n : 0n),
      serialized = kind === 'parse' ? 0n : 2n * bytes + domainBytes;
    items += m.nodes;
    serializedBytes += serialized;
    pin += pins;
    maxDepth = Math.max(maxDepth, m.depth);
    return {
      kind,
      label,
      domain: domain ?? null,
      items: number(m.nodes),
      serializedBytes: number(serialized),
      retainedLogicalBytes: number(pins),
      depth: m.depth,
    };
  });
  return {
    cost: {
      rows: 0,
      items: number(items),
      serializedBytes: number(serializedBytes),
      retainedLogicalBytes: number(pin),
      maxDepth,
      memoryBudgetBytes: number(2n * pin),
    },
    ledger,
  };
}
export const manifestResourceModel = (m) =>
  formatResourceLedger([
    ...m.state.supports.map((v) => ({
      kind: 'encode',
      label: 'declared support candidate ' + v.evidence.id,
      value: { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: v.canonical },
    })),
    {
      kind: 'digest',
      label: 'inventory identity',
      domain: 'codeatlas-activation-source-v1',
      value: m.state.inventory,
    },
    {
      kind: 'digest',
      label: 'full snapshot registry identity',
      domain: 'codeatlas-activation-origins-v1',
      value: m.state.snapshots,
    },
  ]);
export function pairResourceModel(input) {
  const { origin, projection, current, ancestors } = input,
    o = JSON.parse(origin.origin_json),
    ep = JSON.parse(projection.envelope_json),
    { id: initialId, ...initial } = o.envelope.payload,
    { id: projectedId, ...payload } = ep.payload,
    oldBasis = o.envelope.payload.supportRefs[0].basis,
    prior = ancestors.find(
      (m) =>
        historyCanonical(m.state.basis) === historyCanonical(oldBasis) &&
        m.state.inventory.some((f) => historyCanonical(f) === historyCanonical(o.sourceFile)),
    );
  if (!prior) throw Error('independent pair requires matching frozen ancestor');
  const closure = (envelope, state, label) =>
    envelope.payload.supportRefs.map((r) => {
      const value =
        r.entity.kind === 'SOURCE_FILE'
          ? state.inventory.find((f) => f.id === r.entity.id)
          : state.nodes.find((n) => n.id === r.entity.id);
      if (!value) throw Error('missing independent support');
      return {
        kind: 'digest',
        label: label + ' ' + r.entity.kind + ':' + r.entity.id,
        domain: 'codeatlas-phase1-support-value-v1',
        value,
      };
    });
  return formatResourceLedger([
    { kind: 'parse', label: 'decode immutable origin', value: o },
    { kind: 'encode', label: 'canonical original origin bytes', value: o },
    {
      kind: 'digest',
      label: 'immutable origin identity',
      domain: 'codeatlas-syntax-origin-v1',
      value: o,
    },
    {
      kind: 'digest',
      label: 'initial Syntax identity',
      domain: 'codeatlas-syntax-initial-v1',
      value: initial,
    },
    ...closure(o.envelope, prior.state, 'initial support'),
    { kind: 'parse', label: 'decode current projection', value: ep },
    { kind: 'encode', label: 'canonical original projection bytes', value: ep },
    {
      kind: 'digest',
      label: 'current projection identity',
      domain: 'codeatlas-syntax-projection-v1',
      value: { originId: origin.id, payload },
    },
    ...closure(ep, current.state, 'current support'),
  ]);
}
