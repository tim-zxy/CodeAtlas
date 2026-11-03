import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelJavaOwner } from './independent-java-owner-resource-model.mjs';
import { modelNonemptyFullProvider } from './independent-nonempty-provider-resource-model.mjs';
/** Closed nonempty FULL Runtime validation callback; its own cumulative ledger includes an independent Provider delta. */
export function modelNonemptyValidation(target, capture, stageDigest, raw) {
  const provider = modelNonemptyFullProvider(target, raw),
    scope = { units: provider.result.observation.units, removedSourceFileIds: [] },
    java = raw.metadata.java ? modelJavaOwner({ target, scope, javaRows: raw.metadata }) : null,
    owner = {
      stageDigest,
      java: java ? { metadata: raw.metadata, nodes: java.result.nodes } : null,
    };
  let bytes = 0n,
    items = 0n,
    pin = 0n,
    depth = 0;
  const ledger = [],
    record = (label, ni, nb, np, d = 0) => {
      items += BigInt(ni);
      bytes += BigInt(nb);
      pin += BigInt(np);
      depth = Math.max(depth, d);
      ledger.push({
        label,
        items: Number(ni),
        serializedBytes: Number(nb),
        retainedLogicalBytes: Number(np),
        depth: d,
      });
    },
    own = (label, v, retain = true) => {
      const m = measures(v);
      record(label, m.nodes, 0n, retain ? m.weight : 0n, m.depth);
    },
    encoded = (label, v) => {
      own(label + ' traversal', v, false);
      const n = Buffer.byteLength(C(v));
      record(label + ' encoding', 0, 2 * n, 2 * n);
    },
    rawBytes = (label, n) => record(label, 0, n, n),
    packet = { target, capture, scope, owner, metadata: raw.metadata };
  own('complete validation input', packet);
  encoded('owned validation input', packet);
  own('parsed validation input', packet);
  own('reserved metadata', raw.metadata);
  own('parsed metadata', raw.metadata);
  const tm = { ...raw.metadata, targetSource: target.source, inventory: target.inventory };
  own('target metadata', tm);
  own('parsed target metadata', tm);
  for (const f of raw.metadata.inventory)
    for (const s of [f.path, f.id]) rawBytes('inventory byte key', Buffer.byteLength(s));
  own('metadata inventory', raw.metadata.inventory);
  own('complete inventory equality', [raw.metadata.inventory, target.inventory]);
  own('contracts and declared scope', [target.contracts, scope.units, scope.removedSourceFileIds]);
  for (const s of [raw.requestText, raw.outputText])
    rawBytes('raw owned copies', 2 * Buffer.byteLength(s));
  if (java) {
    const first = java.ledger.findIndex((s) => s.label === 'metadata before schema'),
      last = java.ledger.findIndex((s) => s.label === 'complete normalized owner nodes');
    if (first < 0 || last < first) throw Error('independent Java validation schedule missing');
    for (const s of java.ledger.slice(first, last + 1))
      record(
        'revalidated Java owner ' + s.label,
        s.items,
        s.serializedBytes,
        s.retainedLogicalBytes,
        s.depth,
      );
  }
  record(
    'full Provider cumulative delta',
    provider.cost.items,
    provider.cost.serializedBytes,
    provider.cost.serializedBytes,
    provider.cost.maxDepth,
  );
  const p = provider.result.raw.codeSyntax.request.payload,
    binding = {
      expectedActivationBasis: p.expectedActivationBasis,
      targetSource: p.targetSource,
      ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest },
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: p.sourceFiles,
      owners: p.owners,
    };
  own('complete provisional binding', binding);
  const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
    result = { raw: provider.result.raw, usage };
  own('complete validation result', result);
  if ([bytes, items, pin, 2n * pin].some((v) => v > BigInt(Number.MAX_SAFE_INTEGER)))
    throw Error('unsafe independent Runtime validation cost');
  const cost = {
    rows: 0,
    serializedBytes: Number(bytes),
    items: Number(items),
    retainedLogicalBytes: Number(pin),
    maxDepth: depth,
    memoryBudgetBytes: Number(2n * pin),
  };
  Object.assign(usage, {
    rows: 0,
    serializedBytes: cost.serializedBytes,
    items: cost.items,
    retainedLogicalBytes: cost.retainedLogicalBytes,
  });

  return {
    input: { mode: 'FULL', target, capture, scope, owner },
    result,
    cost,
    ledger,
    scope:
      'Three closed nonempty FULL validation callbacks only; no composition, Stage freeze, Store, Native or RSS qualification.',
  };
}
