import { modelNonemptyHistoryRead } from './independent-nonempty-history-read-model.mjs';
import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
import { modelJavaOwner } from './independent-java-owner-resource-model.mjs';
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
/** Closed FULL initial or active native Java/mixed Stage with real independently modeled callback; no observed counters. */
export function modelJavaStageBudget(input, preparation, javaRows, semantic = null) {
  const readHistory = (prior = null, detailed = false) =>
    semantic === null
      ? modelZeroHistoryRead(input, prior, detailed)
      : modelNonemptyHistoryRead(input, semantic, prior, detailed);
  const basic = readHistory(),
    first = readHistory(basic, true);
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
  own(javaRows);
  own(preparation);
  own(JSON.parse(encode(preparation)));
  const context = () => {
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
    const fresh = readHistory(currentRead, true),
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
  };
  context();
  const inventory = currentRead.details.view.targetInventory,
    source = basic.view.targetSource,
    projected = inventory.filter(
      (f) => f.classification.role === 'SOURCE' || f.classification.role === 'TEST',
    ),
    javaIds = projected
      .filter((f) => f.languageHint === 'java')
      .map((f) => f.id)
      .sort(),
    requiredUnits = [
      { kind: 'JAVA_GROUP', ids: javaIds, previousId: null },
      ...projected
        .filter((f) => f.languageHint === 'python')
        .map((f) => ({ kind: 'PYTHON_FILE', ids: [f.id], previousId: null })),
    ];
  if (!javaIds.length) throw Error('closed Java Stage requires Java scope');
  if (
    basic.view.history?.state.supports.some((v) => v.binding.providerFact.providerId !== 'native')
  )
    throw Error('closed full Java scope requires native supports');
  own(requiredUnits);
  const units = requiredUnits
    .map((r) => {
      const fields = [
          source.repositoryId,
          source.revisionId,
          currentRead.details.repositoryLocatorDigest,
          'native',
          r.kind,
          ...(r.kind === 'PYTHON_FILE' ? r.ids : []),
        ],
        domain = 'history-native-unit-v1';
      own(fields);
      const wire =
          domain + '\0' + fields.map((f) => String(Buffer.byteLength(f)) + ':' + f).join(''),
        n = B(wire);
      bytes(n);
      pin(n);
      pin(64n + B(domain) + 1n);
      return {
        id: domain + ':' + crypto.createHash('sha256').update(wire).digest('hex'),
        providerId: 'native',
        kind: r.kind,
        sourceFileIds: r.ids,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  own([units, []]);
  const ownedRows = JSON.parse(encode(javaRows));
  own(ownedRows);
  const callbackInput = {
    target: {
      source,
      repositoryLocatorDigest: currentRead.details.repositoryLocatorDigest,
      inventory,
      contracts: preparation.contracts,
    },
    scope: { units, removedSourceFileIds: [] },
    javaRows: ownedRows,
  };
  own(callbackInput);
  const callback = modelJavaOwner(callbackInput);
  bytes(BigInt(callback.cost.serializedBytes));
  s.items += BigInt(callback.cost.items);
  pin(BigInt(callback.cost.retainedLogicalBytes));
  required.depth = Math.max(required.depth, callback.cost.maxDepth);
  own(callback.result);
  const result = JSON.parse(encode(callback.result));
  own(result);
  for (const f of ownedRows.inventory) own(f);
  own([ownedRows.inventory, inventory]);
  for (const n of result.nodes) {
    own(n);
    own(n);
  }
  context();
  const javaText = encode({
    snapshot: result.metadata.snapshot,
    java: result.metadata.java,
    nodes: result.nodes,
  });
  bytes(B(javaText));
  pin(B(javaText));
  pin(64n);
  const javaRowsDigest = crypto.createHash('sha256').update(javaText).digest('hex');
  const history = basic.view.history,
    expectedActivationId = history
      ? 'activation:' + digest('codeatlas-activation-history-v1', history)
      : null,
    body = {
      schemaVersion: 1,
      repositoryLocatorDigest: currentRead.details.repositoryLocatorDigest,
      expectedActivationId,
      expectedOldBasis: basic.view.activeBasis,
      targetSource: basic.view.targetSource,
      inventoryDigest: currentRead.details.sourceInventoryDigest,
      contracts: preparation.contracts,
      scope: {
        unitIds: units.map((u) => u.id),
        removedSourceFileIds: [],
        ownerSourceFileIds: [
          ...new Set(result.nodes.map((n) => n.sourceFileId).filter((v) => v !== null)),
        ].sort(),
      },
      javaRowsDigest,
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
    callbackInput,
    callback,
    ownerBody: body,
    stageDigest,
    privateReadAfterOwner: currentRead,
    firstCloseAdditionalCharge: 0,
    firstCleanupReservationRows: 1,
    physicalSetupRows: 5,
    scope:
      'Closed initial Java-only/mixed or previously activated native Java FULL owner with one real callback; complete cumulative H1/TEMP/controlled-Java/accurate-parent checks and reserved first cleanup. Not observation/freeze/Store.',
  };
}
