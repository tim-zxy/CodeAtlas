import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelZeroHistoryRead } from './independent-zero-history-read-model.mjs';
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
/** FULL zero projected-unit Stage through constructor/owner/first close. No rules callbacks or observed counters used. */
export function modelZeroStageBudget(input, preparation) {
  const basic = modelZeroHistoryRead(input),
    first = modelZeroHistoryRead(input, basic, true);
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
  const fresh = modelZeroHistoryRead(input, currentRead, true),
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
  own([]);
  own([[], []]);
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
      scope: { unitIds: [], removedSourceFileIds: [], ownerSourceFileIds: [] },
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
      'No projected units; FULL prepareOwner has no Runtime/Java rule calls. Independent total includes cumulative H1 and reserved first cleanup, not observation/freeze/Store.',
  };
}
