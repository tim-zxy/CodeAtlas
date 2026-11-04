import crypto from 'node:crypto';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import { modelZeroHistoryRead } from './independent-zero-history-read-model.mjs';
import { modelJavaOwner } from './independent-java-owner-resource-model.mjs';
import { modelNonemptyFullProvider } from './independent-nonempty-provider-resource-model.mjs';
import { modelNonemptyValidation } from './independent-nonempty-validation-resource-model.mjs';
import { modelNonemptyCompose } from './independent-nonempty-compose-resource-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  SHA = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent nonempty Stage count');
    return Number(v);
  };
/** Complete initial FULL Stage schedule. Source inputs are nonempty; original Code/history is unindexed. */
export function modelNonemptyFrozenStage(input, preparation, javaRows, raw) {
  if (
    Object.keys(input.tables).sort().join(',') !==
      'repository,repository_state,revisions,source_files' ||
    input.tables.repository_state[0].indexed_revision_id !== null
  )
    throw Error('closed initial Stage input required');
  const basic = modelZeroHistoryRead(input),
    first = modelZeroHistoryRead(input, basic, true);
  let read = first;
  const s = {
      rows: BigInt(first.state.rows) + 6n,
      bytes: BigInt(first.state.serializedBytes),
      items: BigInt(first.state.items),
      pin: BigInt(first.state.retainedLogicalBytes),
    },
    required = {
      rows: BigInt(first.required.maxRows) + 6n,
      bytes: BigInt(first.required.maxSerializedBytes),
      memory: BigInt(first.required.memoryBudgetBytes),
      depth: first.required.maxDepth,
    },
    temp = [],
    ledger = [];
  const raise = (k, n) => {
      if (n > required[k]) required[k] = n;
    },
    rows = (n) => {
      s.rows += BigInt(n);
      raise('rows', s.rows);
    },
    pin = (n) => {
      s.pin += BigInt(n);
      raise('memory', 2n * s.pin);
    },
    bytes = (n) => {
      s.bytes += BigInt(n);
      raise('bytes', s.bytes);
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
    parse = (text) => {
      const v = JSON.parse(text);
      own(v);
      return v;
    },
    digest = (domain, v) => {
      const text = encode(v);
      bytes(B(domain) + 1n);
      pin(64);
      return SHA(domain + '\0' + text);
    },
    part = (c) => {
      rows(c.rows ?? 0);
      bytes(c.serializedBytes);
      s.items += BigInt(c.items);
      pin(c.retainedLogicalBytes);
      required.depth = Math.max(required.depth, c.maxDepth);
    },
    snapshot = () => ({
      state: {
        rows: N(s.rows),
        serializedBytes: N(s.bytes),
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
    }),
    mark = (label) => ledger.push({ label, ...snapshot().state }),
    tempWrite = (key, v) => {
      const value_json = encode(v),
        row = { key, value_json };
      own(row);
      bytes(B(key) + B(value_json));
      pin(B(key) + B(value_json));
      rows(1);
      temp.push(row);
    },
    context = () => {
      rows(4);
      own({ changes: 0, dataVersion: 0 });
      own({ changes: 0, dataVersion: 0 }, false);
      const total = temp.reduce((n, r) => n + B(r.key) + B(r.value_json), 0n);
      raise('rows', s.rows + 2n * BigInt(temp.length));
      raise('bytes', s.bytes + total);
      raise('memory', 2n * (s.pin + total));
      for (const r of temp) {
        rows(2);
        const n = B(r.key) + B(r.value_json);
        bytes(n);
        pin(n);
        own(r, false);
      }
      const fresh = modelZeroHistoryRead(input, read, true),
        prior = read.state;
      raise('rows', s.rows + BigInt(fresh.required.maxRows - prior.rows));
      raise('bytes', s.bytes + BigInt(fresh.required.maxSerializedBytes - prior.serializedBytes));
      raise(
        'memory',
        2n * s.pin +
          BigInt(fresh.required.memoryBudgetBytes) -
          2n * BigInt(prior.retainedLogicalBytes),
      );
      required.depth = Math.max(required.depth, fresh.required.maxDepth);
      rows(fresh.state.rows - prior.rows);
      bytes(fresh.state.serializedBytes - prior.serializedBytes);
      s.items += BigInt(fresh.state.items - prior.items);
      pin(fresh.state.retainedLogicalBytes - prior.retainedLogicalBytes);
      read = fresh;
    };
  own({ changes: 0, dataVersion: 0 });
  const captured = { key: 'CAPTURE', value_json: first.result.identity };
  own(captured);
  bytes(B(captured.key) + B(captured.value_json));
  pin(B(captured.key) + B(captured.value_json));
  temp.push(captured);
  const constructor = snapshot();
  mark('constructor');
  own(javaRows);
  own(preparation);
  parse(encode(preparation));
  context();
  const target = {
      source: basic.view.targetSource,
      repositoryLocatorDigest: read.details.repositoryLocatorDigest,
      inventory: basic.view.targetInventory,
      contracts: preparation.contracts,
    },
    full = modelNonemptyFullProvider(target, raw),
    units = full.result.observation.units,
    descriptors = [
      ...(units.some((u) => u.kind === 'JAVA_GROUP')
        ? [
            {
              kind: 'JAVA_GROUP',
              ids: target.inventory
                .filter((f) => f.languageHint === 'java')
                .map((f) => f.id)
                .sort(),
              previousId: null,
            },
          ]
        : []),
      ...target.inventory
        .filter((f) => f.languageHint === 'python')
        .map((f) => ({ kind: 'PYTHON_FILE', ids: [f.id], previousId: null })),
    ];
  own(descriptors);
  for (const d of descriptors) {
    const fields = [
        target.source.repositoryId,
        target.source.revisionId,
        target.repositoryLocatorDigest,
        'native',
        d.kind,
        ...(d.kind === 'PYTHON_FILE' ? d.ids : []),
      ],
      domain = 'history-native-unit-v1';
    own(fields);
    const wire = domain + '\0' + fields.map((f) => Buffer.byteLength(f) + ':' + f).join('');
    bytes(B(wire));
    pin(B(wire));
    pin(64n + B(domain) + 1n);
    const expected = units.find((u) => u.kind === d.kind && C(u.sourceFileIds) === C(d.ids));
    if (expected.id !== domain + ':' + SHA(wire)) throw Error('independent unit identity mismatch');
  }
  own([units, []]);
  let java = null,
    javaRowsDigest = null;
  if (javaRows !== null) {
    const ownedRows = parse(encode(javaRows)),
      callbackInput = { target, scope: { units, removedSourceFileIds: [] }, javaRows: ownedRows };
    own(callbackInput);
    const callback = modelJavaOwner(callbackInput);
    part(callback.cost);
    own(callback.result);
    const result = parse(encode(callback.result));
    for (const f of ownedRows.inventory) own(f);
    own([ownedRows.inventory, target.inventory]);
    for (const n of result.nodes) {
      own(n);
      own(n);
    }
    context();
    const text = encode({
      snapshot: result.metadata.snapshot,
      java: result.metadata.java,
      nodes: result.nodes,
    });
    bytes(B(text));
    pin(B(text));
    pin(64);
    javaRowsDigest = SHA(text);
    java = { metadata: result.metadata, nodes: result.nodes };
  }
  const body = {
      schemaVersion: 1,
      repositoryLocatorDigest: target.repositoryLocatorDigest,
      expectedActivationId: null,
      expectedOldBasis: null,
      targetSource: target.source,
      inventoryDigest: read.details.sourceInventoryDigest,
      contracts: preparation.contracts,
      scope: {
        unitIds: units.map((u) => u.id),
        removedSourceFileIds: [],
        ownerSourceFileIds: java
          ? [...new Set(java.nodes.map((n) => n.sourceFileId).filter((v) => v !== null))].sort()
          : [],
      },
      javaRowsDigest,
    },
    stageDigest = digest('codeatlas-provisional-owner-stage-v1', body);
  tempWrite('OWNER', body);
  const owner = snapshot();
  mark('owner');
  const capture = () => {
      const value = {
        parent: null,
        snapshotIds: [],
        snapshots: [],
        coverage: [],
        activeProviderIds: [],
      };
      own(value);
      return value;
    },
    invoke = (method, cap) => {
      const packet =
        method === 'validation'
          ? {
              mode: 'FULL',
              target,
              capture: cap,
              scope: { units, removedSourceFileIds: [] },
              owner: { stageDigest, java },
              rawBundle: { metadata: raw.metadata },
            }
          : {
              mode: 'FULL',
              target,
              capture: cap,
              rawBundle: { metadata: raw.metadata },
              qualificationRef: preparation.qualificationRef,
            };
      own(packet);
      const pure =
        method === 'validation'
          ? modelNonemptyValidation(target, cap, stageDigest, raw)
          : modelNonemptyCompose(target, cap, preparation.qualificationRef, raw);
      part(pure.cost);
      own(pure.result);
      return parse(encode(pure.result));
    },
    jsonLines = (text) => {
      const n = B(text),
        lines = text.split('\n').length;
      bytes(n);
      pin(2n * n + BigInt(lines * 8));
      s.items += BigInt(lines);
      for (const line of text.trimEnd().split('\n')) parse(line);
    },
    base64 = (text) => {
      const out = Buffer.from(text).toString('base64');
      bytes(B(out));
      pin(B(out));
      return out;
    };
  context();
  own(raw.metadata);
  parse(encode(raw.metadata));
  for (const text of [raw.requestText, raw.outputText]) {
    bytes(2n * B(text));
    pin(2n * B(text));
  }
  const validated = invoke('validation', capture()).raw;
  jsonLines(raw.requestText);
  jsonLines(raw.outputText);
  for (const text of [raw.requestText, raw.outputText]) {
    bytes(B(text));
    pin(64);
  }
  context();
  tempWrite('OBSERVATION', {
    metadata: raw.metadata,
    requestBase64: base64(raw.requestText),
    outputBase64: base64(raw.outputText),
    validated,
  });
  const observed = snapshot();
  mark('observed');
  context();
  const result = invoke('composition', capture());
  part(manifestResourceModel(result.manifest).cost);
  part(modelCodeIdentity(result.code).cost);
  digest('codeatlas-activation-history-v1', result.manifest);
  own(units);
  const events = [
      ...(raw.metadata.java?.events ?? []),
      ...JSON.parse('[' + raw.outputText.trimEnd().split('\n').join(',') + ']'),
    ],
    facts = events.filter((e) => e.type === 'NODE' || e.type === 'EDGE');
  own([events, facts]);
  own(full.result.observation.observation.snapshot);
  own(result.manifest.state.snapshots);
  const expectedCoverage = units.flatMap((u) =>
    [
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      u.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
    ].flatMap((capabilityName) =>
      u.sourceFileIds.map((sourceFileId) => ({
        providerSnapshotId: raw.metadata.snapshot.id,
        capabilityName,
        sourceFileId,
        status: 'COMPLETE',
      })),
    ),
  );
  own(expectedCoverage);
  for (const r of [...result.code.coverage, ...expectedCoverage]) encode(r);
  for (const origin of result.origins) {
    const projection = result.projections.find((p) => p.origin_id === origin.id);
    part(
      pairResourceModel({
        origin,
        projection,
        current: result.manifest,
        ancestors: [result.manifest],
      }).cost,
    );
    parse(origin.origin_json);
  }
  context();
  tempWrite('FROZEN', result);
  context();
  const sealText = encode(temp.map((r) => [r.key, r.value_json]));
  bytes(B(sealText));
  pin(64);
  const frozen = snapshot();
  mark('frozen');
  return {
    constructor,
    owner,
    observed,
    frozen,
    ownerBody: body,
    stageDigest,
    result,
    seal: SHA(sealText),
    privateReadAfterFreeze: read,
    firstCloseAdditionalCharge: 0,
    physicalSetupRows: 5,
    firstCleanupReservationRows: 1,
    ledger,
    scope:
      'Three initial full nonempty Stage operations through real Runtime validation/compose and frozen lease; no Store, DELTA/retained, failure-prefix or Native/RSS qualification.',
  };
}
