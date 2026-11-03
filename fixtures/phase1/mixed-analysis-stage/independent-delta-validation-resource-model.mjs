import { measures } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  formatResourceLedger,
} from './independent-history-resource-model.mjs';
import { modelDeltaRawProvider } from './independent-delta-raw-resource-model.mjs';
/** Closed partial Python DELTA Runtime validation callback, including cumulative Provider and prior history. */
export function modelDeltaValidation(target, capture, stageDigest, raw) {
  const st = capture.history.state,
    state = {
      ...st,
      supports: st.supports.map((v) => ({ ...v, snapshotId: v.evidence.providerSnapshotId })),
    },
    historyPacket = {
      history: { activationId: capture.parent.activationId, parent: capture.history.parent, state },
      current: state,
      expectedActivationId: capture.parent.activationId,
      expectedOldBasis: st.basis,
      target,
      observation: null,
    };
  const provider = modelDeltaRawProvider(historyPacket, raw),
    scope = {
      units: provider.observation.units,
      removedSourceFileIds: st.inventory
        .filter((f) => !target.inventory.some((g) => g.id === f.id))
        .map((f) => f.id)
        .sort(),
    },
    owner = {
      stageDigest,
      java: null,
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
  for (const [label, cost] of [
    ['complete prior manifest', manifestResourceModel(capture.history).cost],
    [
      'prior history activation digest',
      formatResourceLedger([
        {
          kind: 'digest',
          label: 'activation',
          domain: 'codeatlas-activation-history-v1',
          value: capture.history,
        },
      ]).cost,
    ],
  ])
    record(label, cost.items, cost.serializedBytes, cost.retainedLogicalBytes, cost.maxDepth);
  own('complete history transition packet', historyPacket);
  record(
    'delta Provider cumulative delta',
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
    input: { mode: 'DELTA', target, capture, scope, owner },
    result,
    cost,
    ledger,
    scope:
      'Closed original partial Python DELTA validation only; no Stage/Store or Native qualification.',
  };
}
