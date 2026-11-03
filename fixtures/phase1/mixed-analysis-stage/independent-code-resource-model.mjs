import crypto from 'node:crypto';
export const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
      ? '{' +
        Object.keys(value)
          .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
          .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
          .join(',') +
        '}'
      : JSON.stringify(value);
export const measures = (value) => {
  let nodes = 1n,
    weight = typeof value === 'string' ? BigInt(Buffer.byteLength(value)) : 0n,
    depth = 0;
  if (value && typeof value === 'object') {
    if (!Array.isArray(value))
      for (const k of Object.keys(value)) weight += BigInt(Buffer.byteLength(k));
    for (const v of Object.values(value)) {
      const m = measures(v);
      nodes += m.nodes;
      weight += m.weight;
      depth = Math.max(depth, 1 + m.depth);
    }
  }
  return { nodes, weight, depth };
};
const number = (n) => {
    if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('independent model unsafe integer');
    return Number(n);
  },
  cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export function codeGroups(input) {
  const coverage = new Map();
  for (const row of input.coverage) {
    const key = [
        row.providerSnapshotId,
        row.capabilityName,
        row.sourceFileId === null ? 'NONE' : 'SOURCE',
        row.sourceFileId ?? '',
        row.status,
      ],
      encoded = JSON.stringify(key),
      prior = coverage.get(encoded);
    if (prior) prior.value.multiplicity++;
    else coverage.set(encoded, { key, value: { ...row, multiplicity: 1 } });
  }
  return [
    [
      'HEADER',
      [
        {
          key: [input.targetSource.repositoryId],
          value: {
            repositoryId: input.targetSource.repositoryId,
            indexedRevisionId: input.targetSource.revisionId,
            indexedContentFingerprint: input.targetSource.contentFingerprint,
            committedSnapshotCount: input.committedSnapshotCount,
          },
        },
      ],
    ],
    ...[
      ['NODE', 'nodes', (v) => [v.id]],
      ['EDGE', 'edges', (v) => [v.id]],
      ['EVIDENCE', 'evidence', (v) => [v.id]],
      ['BINDING', 'bindings', (v) => [v.evidenceId, v.providerFact.factType, v.canonicalFact.id]],
      ['FACT_EVIDENCE', 'factEvidence', (v) => [v.evidenceId, v.fact.factType, v.fact.id]],
      ['SUPPORT_CANDIDATE', 'candidates', (v) => [v.evidenceId, v.factType, v.canonicalFactId]],
    ].map(([tag, field, key]) => [tag, input[field].map((value) => ({ key: key(value), value }))]),
    [
      'SNAPSHOT',
      input.snapshots.map(({ startedAt, completedAt, diagnostics, capabilities, ...snapshot }) => ({
        key: [snapshot.id],
        value: { snapshot, capabilities: [...capabilities].sort((a, b) => cmp(a.name, b.name)) },
      })),
    ],
    ['COVERAGE', [...coverage.values()]],
  ].map(([tag, entries]) => [
    tag,
    entries.sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        const d = cmp(a.key[i], b.key[i]);
        if (d) return d;
      }
      return 0;
    }),
  ]);
}
/** Closed algebra from the nine-group framing contract and ownership sites. No product imports, execution, receipts or limits. */
export function modelCodeIdentity(input) {
  const groups = codeGroups(input),
    rows = groups.flatMap(([tag, entries]) => [{ tag, count: entries.length }, ...entries]),
    arrays = groups.map(([, entries]) => entries),
    triples = input.coverage.map((row) => {
      const key = [
        row.providerSnapshotId,
        row.capabilityName,
        row.sourceFileId === null ? 'NONE' : 'SOURCE',
        row.sourceFileId ?? '',
        row.status,
      ];
      return [key, JSON.stringify(key), row];
    }),
    initial = measures(input),
    sum = (vs, f) => vs.reduce((n, v) => n + f(v), 0n),
    domain = 'codeatlas-code-activation-v1\0',
    domainBytes = BigInt(Buffer.byteLength(domain)),
    jsonBytes = rows.map((v) => BigInt(Buffer.byteLength(canonical(v)))),
    prefixBytes = jsonBytes.map((n) => BigInt(String(n).length + 1)),
    items =
      2n * initial.nodes +
      sum(arrays, (v) => measures(v).nodes) +
      2n * sum(rows, (v) => measures(v).nodes) +
      sum(triples, (v) => measures(v).nodes),
    ownedWeight =
      2n * initial.weight +
      sum(arrays, (v) => measures(v).weight) +
      2n * sum(rows, (v) => measures(v).weight) +
      sum(triples, (v) => measures(v).weight),
    encodedBytes = jsonBytes.reduce((n, v) => n + v, 0n),
    framingBytes = prefixBytes.reduce((n, v) => n + v, 0n),
    pin = ownedWeight + domainBytes + 2n * encodedBytes + framingBytes + 64n,
    depth = Math.max(
      initial.depth,
      ...arrays.map((v) => measures(v).depth),
      ...rows.map((v) => measures(v).depth),
      ...triples.map((v) => measures(v).depth),
    ),
    transcript = domain + rows.map((v, i) => String(jsonBytes[i]) + ':' + canonical(v)).join('');
  return {
    basis: {
      ...input.targetSource,
      codeActivationDigest: crypto.createHash('sha256').update(transcript).digest('hex'),
    },
    cost: {
      rows: 0,
      serializedBytes: number(domainBytes + encodedBytes + framingBytes),
      items: number(items),
      retainedLogicalBytes: number(pin),
      maxDepth: depth,
      memoryBudgetBytes: number(2n * pin),
    },
    ledger: {
      domainBytes: number(domainBytes),
      emittedRows: rows.length,
      groups: groups.map(([tag, entries]) => ({
        tag,
        count: entries.length,
        ownedItems: number(measures(entries).nodes),
        ownedWeight: number(measures(entries).weight),
      })),
      encodedBytes: number(encodedBytes),
      framingBytes: number(framingBytes),
      ownedWeight: number(ownedWeight),
      finalDigestPin: 64,
    },
  };
}
