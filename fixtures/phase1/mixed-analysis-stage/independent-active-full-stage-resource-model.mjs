import crypto from 'node:crypto';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import { modelNonemptyHistoryRead } from './independent-nonempty-history-read-model.mjs';
import { modelNonemptyStageBudget } from './independent-nonempty-stage-resource-model.mjs';
import { modelNonemptyFullProvider } from './independent-nonempty-provider-resource-model.mjs';
import { modelNonemptyValidation } from './independent-nonempty-validation-resource-model.mjs';
import { modelActiveFullCompose } from './independent-active-full-compose-resource-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  SHA = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent nonempty Stage count');
    return Number(v);
  };
/** Closed active native Python FULL Stage, retaining old history and exact parent. */
export function modelActiveFullStage(input, semantic, preparation, raw) {
  const start = modelNonemptyStageBudget(input, semantic, preparation, null, 'FULL');
  let read = start.privateReadAfterOwner;
  const s = {
      rows: BigInt(start.owner.state.rows),
      bytes: BigInt(start.owner.state.serializedBytes),
      items: BigInt(start.owner.state.items),
      pin: BigInt(start.owner.state.retainedLogicalBytes),
    },
    required = {
      rows: BigInt(start.owner.required.maxRows),
      bytes: BigInt(start.owner.required.maxSerializedBytes),
      memory: BigInt(start.owner.required.memoryBudgetBytes),
      depth: start.owner.required.maxDepth,
    },
    temp = structuredClone(start.owner.tempRows),
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
      const fresh = modelNonemptyHistoryRead(input, semantic, read, true),
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
  const constructor = start.constructor,
    owner = start.owner,
    body = start.ownerBody,
    stageDigest = start.stageDigest,
    target = {
      source: body.targetSource,
      repositoryLocatorDigest: body.repositoryLocatorDigest,
      inventory: read.view.targetInventory,
      contracts: preparation.contracts,
    },
    full = modelNonemptyFullProvider(target, raw),
    units = full.result.observation.units,
    java = null;
  mark('owner');
  const capture = () => {
      const data = read.details,
        current = read.view.history;
      if (!current || current.state.snapshots.length !== 1)
        throw Error('closed active full history absent');
      const snapshots = current.state.snapshots
        .map((full) => {
          own(full);
          const { diagnostics, ...actual } = full;
          own(actual);
          return full;
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const parent = {
          activationId: 'activation:' + digest('codeatlas-activation-history-v1', current),
          repositoryId: current.state.basis.repositoryId,
          revisionId: current.state.basis.revisionId,
        },
        ids = new Set(snapshots.map((s) => s.id)),
        value = {
          parent,
          snapshotIds: data.snapshotIds,
          snapshots,
          coverage: data.coverageRows
            .filter((r) => ids.has(r.provider_snapshot_id))
            .map((r) => ({
              providerSnapshotId: r.provider_snapshot_id,
              capabilityName: r.capability_name,
              sourceFileId: r.source_file_id,
              status: r.status,
            })),
          activeProviderIds: [
            ...new Set(current.state.supports.map((s) => s.binding.providerFact.providerId)),
          ].sort(),
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
          : modelActiveFullCompose(target, cap, preparation.qualificationRef, raw);
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
  const finalCapture = capture(),
    result = invoke('composition', finalCapture);
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
  const expectedCoverage = [
    ...finalCapture.coverage,
    ...units.flatMap((u) =>
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
    ),
  ];
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
      'Closed active native Python FULL Stage with complete old history and accurate parent; no DELTA/retained/failure-prefix or Native qualification.',
  };
}
