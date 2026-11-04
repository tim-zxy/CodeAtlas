import crypto from 'node:crypto';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import { modelNonemptyHistoryRead } from './independent-nonempty-history-read-model.mjs';
import { modelNonemptyStageBudget } from './independent-nonempty-stage-resource-model.mjs';

import { modelRetainedComposition } from './independent-retained-runtime-resource-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  SHA = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent nonempty Stage count');
    return Number(v);
  };
/** Closed original retained/deletion Stage, retaining old history and exact parent. */
export function modelRetainedStage(input, semantic, preparation, ownerReference) {
  const start = modelNonemptyStageBudget(input, semantic, preparation, ownerReference, 'DELTA');
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
    units = body.scope.unitIds.map((id) => read.view.history.state.units.find((u) => u.id === id));
  mark('owner');
  const capture = () => {
      const data = read.details,
        current = read.view.history;
      if (!current) throw Error('closed active full history absent');
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
          history: current,
          ancestors: data.archive.slice(1),
          origins: data.origins,
          projections: data.projections,
        };
      own(value);
      return value;
    },
    invoke = (cap) => {
      const packet = {
        mode: 'DELTA',
        target,
        capture: cap,
        rawBundle: null,
        qualificationRef: preparation.qualificationRef,
      };
      own(packet);
      const pure = modelRetainedComposition(packet);
      part(pure.cost);
      own(pure.result);
      return parse(encode(pure.result));
    };
  context();
  tempWrite('OBSERVATION', null);
  const observed = snapshot();
  mark('observed');
  context();
  const finalCapture = capture(),
    result = invoke(finalCapture);
  part(manifestResourceModel(result.manifest).cost);
  part(modelCodeIdentity(result.code).cost);
  digest('codeatlas-activation-history-v1', result.manifest);
  own(
    [
      ...read.view.history.state.units.filter(
        (u) =>
          !units.some((v) => v.id === u.id) &&
          !u.sourceFileIds.some((id) => body.scope.removedSourceFileIds.includes(id)),
      ),
      ...units,
    ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
  own(result.manifest.state.snapshots);
  const expectedCoverage = [...finalCapture.coverage];
  own(expectedCoverage);
  for (const r of [...result.code.coverage, ...expectedCoverage]) encode(r);
  for (const origin of result.origins)
    own({ ...read.details.origins.find((v) => v.id === origin.id) });
  for (const origin of result.origins) {
    const projection = result.projections.find((p) => p.origin_id === origin.id);
    part(
      pairResourceModel({
        origin,
        projection,
        current: result.manifest,
        ancestors: [result.manifest, ...read.details.archive],
      }).cost,
    );
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
      'Closed original retained/deletion Stage, immutable old origin and current-basis projection; no Native or failure-prefix qualification.',
  };
}
