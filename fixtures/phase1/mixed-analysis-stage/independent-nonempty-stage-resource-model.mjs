import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelNonemptyHistoryRead } from './independent-nonempty-history-read-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent Stage count');
    return Number(v);
  },
  H = (domain, v) =>
    crypto
      .createHash('sha256')
      .update(domain + '\0' + C(v))
      .digest('hex');
/** Closed nonempty Stage constructor, Python FULL and existing-ID DELTA owner/first cleanup. Independent H1 state only; no callback or observed counters. */
export function modelNonemptyStageBudget(
  input,
  semantic,
  preparation = null,
  ownerReference = null,
  mode = 'DELTA',
) {
  const basic = modelNonemptyHistoryRead(input, semantic),
    first = modelNonemptyHistoryRead(input, semantic, basic, true);
  let currentRead = first;
  const s = {
      rows: BigInt(first.state.rows) + 6n,
      serializedBytes: BigInt(first.state.serializedBytes),
      items: BigInt(first.state.items),
      pin: BigInt(first.state.retainedLogicalBytes),
    },
    required = {
      rows: BigInt(first.required.maxRows) + 6n,
      bytes: BigInt(first.required.maxSerializedBytes),
      memory: BigInt(first.required.memoryBudgetBytes),
      depth: first.required.maxDepth,
    },
    temp = [];
  const raise = (k, v) => {
      if (v > required[k]) required[k] = v;
    },
    pin = (v) => {
      s.pin += v;
      raise('memory', 2n * s.pin);
    },
    bytes = (v) => {
      s.serializedBytes += v;
      raise('bytes', s.serializedBytes);
    },
    rows = (v) => {
      s.rows += BigInt(v);
      raise('rows', s.rows);
    },
    own = (v, retain = true) => {
      const m = measures(v);
      s.items += m.nodes;
      required.depth = Math.max(required.depth, m.depth);
      if (retain) pin(m.weight);
    },
    encode = (v) => {
      own(v, false);
      const text = C(v),
        n = B(text);
      bytes(2n * n);
      pin(2n * n);
      return text;
    },
    digest = (domain, v) => {
      encode(v);
      bytes(B(domain) + 1n);
      pin(64n);
      return H(domain, v);
    },
    snapshot = () => ({
      state: {
        rows: N(s.rows),
        serializedBytes: N(s.serializedBytes),
        items: N(s.items),
        retainedLogicalBytes: N(s.pin),
      },
      required: {
        maxRows: N(required.rows),
        maxSerializedBytes: N(required.bytes),
        maxItems: N(s.items),
        maxDepth: required.depth,
        memoryBudgetBytes: N(required.memory),
      },
      tempRows: structuredClone(temp),
    });
  own({ changes: 0, dataVersion: 0 });
  const captured = { key: 'CAPTURE', value_json: first.result.identity };
  own(captured);
  bytes(B(captured.key) + B(captured.value_json));
  pin(B(captured.key) + B(captured.value_json));
  temp.push(captured);
  const constructor = snapshot();
  if (preparation === null)
    return {
      constructor,
      firstCloseAdditionalCharge: 0,
      firstCleanupReservationRows: 1,
      physicalSetupRows: 5,
    };
  if (mode !== 'FULL' && mode !== 'DELTA') throw Error('closed Stage mode required');
  if (mode === 'DELTA' && !ownerReference) throw Error('closed delta owner reference required');
  own(null);
  own(preparation);
  own(JSON.parse(encode(preparation)));
  rows(4);
  own({ changes: 0, dataVersion: 0 });
  own({ changes: 0, dataVersion: 0 }, false);
  const total = temp.reduce((n, r) => n + B(r.key) + B(r.value_json), 0n);
  raise('rows', s.rows + 2n * BigInt(temp.length));
  raise('bytes', s.serializedBytes + total);
  raise('memory', 2n * (s.pin + total));
  for (const r of temp) {
    rows(2);
    const b = B(r.key) + B(r.value_json);
    bytes(b);
    pin(b);
    own(r, false);
  }
  const fresh = modelNonemptyHistoryRead(input, semantic, currentRead, true),
    previous = currentRead.state;
  raise('rows', s.rows + BigInt(fresh.required.maxRows - previous.rows));
  raise(
    'bytes',
    s.serializedBytes + BigInt(fresh.required.maxSerializedBytes - previous.serializedBytes),
  );
  raise(
    'memory',
    2n * s.pin +
      BigInt(fresh.required.memoryBudgetBytes) -
      2n * BigInt(previous.retainedLogicalBytes),
  );
  required.depth = Math.max(required.depth, fresh.required.maxDepth);
  rows(fresh.state.rows - previous.rows);
  bytes(BigInt(fresh.state.serializedBytes - previous.serializedBytes));
  s.items += BigInt(fresh.state.items - previous.items);
  pin(BigInt(fresh.state.retainedLogicalBytes - previous.retainedLogicalBytes));
  currentRead = fresh;
  const old = basic.view.history.state,
    inventory = fresh.details.view.targetInventory;
  let requiredUnits, removed;
  if (mode === 'DELTA') {
    own([old.inventory, inventory, old.contracts, preparation.contracts, old.units]);
    requiredUnits = ownerReference.scope.unitIds.map((id) => {
      const u = old.units.find((u) => u.id === id);
      if (!u || u.kind !== 'PYTHON_FILE' || u.providerId !== 'native')
        throw Error('closed delta requires existing Python unit');
      return { kind: u.kind, ids: u.sourceFileIds, previousId: u.id };
    });
    removed = ownerReference.scope.removedSourceFileIds;
  } else {
    if (
      old.units.some((u) => u.providerId !== 'native') ||
      old.supports.some((v) => v.binding.providerFact.providerId !== 'native')
    )
      throw Error('closed full requires native-only supports');
    const projected = inventory.filter(
      (f) => f.classification.role === 'SOURCE' || f.classification.role === 'TEST',
    );
    if (projected.some((f) => f.languageHint !== 'python'))
      throw Error('closed full owner only Python, no Java callback');
    requiredUnits = projected.map((f) => ({ kind: 'PYTHON_FILE', ids: [f.id], previousId: null }));
    removed = [];
  }
  own(requiredUnits);
  const units = requiredUnits
    .map((r) => {
      let id = r.previousId;
      if (id === null) {
        const fields = [
            basic.view.targetSource.repositoryId,
            basic.view.targetSource.revisionId,
            fresh.details.repositoryLocatorDigest,
            'native',
            r.kind,
            ...r.ids,
          ],
          domain = 'history-native-unit-v1';
        own(fields);
        const parts = fields.map((f) => String(Buffer.byteLength(f)) + ':' + f),
          wire = domain + '\0' + parts.join(''),
          size = B(wire);
        bytes(size);
        pin(size);
        pin(64n + B(domain) + 1n);
        id = domain + ':' + crypto.createHash('sha256').update(wire).digest('hex');
      }
      return { id, providerId: 'native', kind: r.kind, sourceFileIds: r.ids };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  own([units, removed]);
  const history = basic.view.history,
    expectedActivationId = history
      ? 'activation:' + digest('codeatlas-activation-history-v1', history)
      : null,
    body = {
      schemaVersion: 1,
      repositoryLocatorDigest: fresh.details.repositoryLocatorDigest,
      expectedActivationId,
      expectedOldBasis: basic.view.activeBasis,
      targetSource: basic.view.targetSource,
      inventoryDigest: fresh.details.sourceInventoryDigest,
      contracts: preparation.contracts,
      scope: {
        unitIds: units.map((u) => u.id),
        removedSourceFileIds: removed,
        ownerSourceFileIds: [],
      },
      javaRowsDigest: null,
    },
    stageDigest = digest('codeatlas-provisional-owner-stage-v1', body),
    encoded = encode(body),
    ownerRow = { key: 'OWNER', value_json: encoded };
  own(ownerRow);
  bytes(B(ownerRow.key) + B(encoded));
  pin(B(ownerRow.key) + B(encoded));
  rows(1);
  temp.push(ownerRow);
  const owner = snapshot();
  return {
    constructor,
    owner,
    ownerBody: body,
    stageDigest,
    privateReadAfterOwner: currentRead,
    firstCloseAdditionalCharge: 0,
    firstCleanupReservationRows: 1,
    physicalSetupRows: 5,
    scope:
      'Closed native-only Python FULL deterministic unit-ID work, existing-ID Python delta and deletion-only owner. No Java callback/observation/freeze/Store.',
  };
}
