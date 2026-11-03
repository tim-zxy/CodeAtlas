import crypto from 'node:crypto';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
} from './independent-history-resource-model.mjs';
import { modelZeroHistoryRead } from './independent-zero-history-read-model.mjs';
import { modelZeroStageBudget } from './independent-zero-stage-resource-model.mjs';
import {
  zeroFullCapture,
  modelZeroValidation,
  modelZeroCompose,
} from './independent-zero-runtime-resource-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent frozen Stage cost');
    return Number(v);
  },
  SHA = (v) => crypto.createHash('sha256').update(v).digest('hex');
/** Complete FULL zero-unit Stage through real validation/composition/freeze and reserved first close. */
export function modelZeroFrozenStage(input, preparation, raw) {
  const start = modelZeroStageBudget(input, preparation),
    s = {
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
    temp = structuredClone(start.owner.tempRows);
  let read = start.privateReadAfterOwner;
  const raise = (k, n) => {
      if (n > required[k]) required[k] = n;
    },
    rows = (n) => {
      s.rows += BigInt(n);
      raise('rows', s.rows);
    },
    pin = (n) => {
      s.pin += n;
      raise('memory', 2n * s.pin);
    },
    bytes = (n) => {
      s.bytes += n;
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
        size = B(text);
      bytes(2n * size);
      pin(2n * size);
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
      pin(64n);
      return SHA(domain + '\0' + text);
    },
    part = (cost) => {
      rows(cost.rows ?? 0);
      bytes(BigInt(cost.serializedBytes));
      s.items += BigInt(cost.items);
      pin(BigInt(cost.retainedLogicalBytes));
      required.depth = Math.max(required.depth, cost.maxDepth);
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
    tempWrite = (key, value) => {
      const encoded = encode(value),
        row = { key, value_json: encoded };
      own(row);
      const n = B(key) + B(encoded);
      bytes(n);
      pin(n);
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
      bytes(BigInt(fresh.state.serializedBytes - prior.serializedBytes));
      s.items += BigInt(fresh.state.items - prior.items);
      pin(BigInt(fresh.state.retainedLogicalBytes - prior.retainedLogicalBytes));
      read = fresh;
    },
    capture = () => {
      const data = read.details,
        all = (data.historyRows ?? []).map((r) => JSON.parse(r.manifest_json));
      if (
        !data.archive.length &&
        data.snapshotRows.some((r) => r.requested_revision_id === data.view.targetSource.revisionId)
      ) {
        for (const m of all) {
          parse(C(m));
          encode(m);
          part(manifestResourceModel(m).cost);
          digest('codeatlas-activation-history-v1', m);
          own(m);
          let child = m;
          while (child.parent) {
            own(child.parent.activationId);
            child = all.find(
              (v) =>
                'activation:' + SHA('codeatlas-activation-history-v1\0' + C(v)) ===
                child.parent.activationId,
            );
            if (!child) throw Error('closed carrier parent absent');
          }
        }
      }
      const value = zeroFullCapture(input, start);
      for (const full of value.snapshots) {
        own(full);
        const { diagnostics, ...actual } = full;
        own(actual);
      }
      if (data.view.history) digest('codeatlas-activation-history-v1', data.view.history);
      own(value);
      return value;
    },
    invoke = (method, captureValue) => {
      const target = {
          source: start.ownerBody.targetSource,
          repositoryLocatorDigest: start.ownerBody.repositoryLocatorDigest,
          inventory: read.view.targetInventory,
          contracts: preparation.contracts,
        },
        packet =
          method === 'validation'
            ? {
                mode: 'FULL',
                target,
                capture: captureValue,
                scope: { units: [], removedSourceFileIds: [] },
                owner: { stageDigest: start.stageDigest, java: null },
                rawBundle: { metadata: raw.metadata },
              }
            : {
                mode: 'FULL',
                target,
                capture: captureValue,
                rawBundle: { metadata: raw.metadata },
                qualificationRef: preparation.qualificationRef,
              };
      own(packet);
      const pure =
        method === 'validation'
          ? modelZeroValidation(target, captureValue, start.stageDigest, raw)
          : modelZeroCompose(target, captureValue, preparation.qualificationRef, raw);
      part(pure.cost);
      own(pure.result);
      return parse(encode(pure.result));
    },
    jsonLines = (text) => {
      const size = B(text),
        lines = text.split('\n').length;
      bytes(size);
      pin(2n * size + BigInt(lines * 8));
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
  const validateCapture = capture(),
    validated = invoke('validation', validateCapture).raw;
  jsonLines(raw.requestText);
  jsonLines(raw.outputText);
  for (const text of [raw.requestText, raw.outputText]) {
    bytes(B(text));
    pin(64n);
  }
  context();
  const req64 = base64(raw.requestText),
    out64 = base64(raw.outputText);
  tempWrite('OBSERVATION', {
    metadata: raw.metadata,
    requestBase64: req64,
    outputBase64: out64,
    validated,
  });
  const observed = snapshot();
  context();
  const composeCapture = capture(),
    result = invoke('composition', composeCapture);
  part(manifestResourceModel(result.manifest).cost);
  part(modelCodeIdentity(result.code).cost);
  digest('codeatlas-activation-history-v1', result.manifest);
  own([]);
  own([
    raw.outputText
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [],
  ]);
  const snapshotData = {
    ...raw.metadata.snapshot,
    repositoryId: result.basis.repositoryId,
    requestedRevisionId: result.basis.revisionId,
    requestedRevisionFingerprint: result.basis.contentFingerprint,
    capabilities: [
      { name: 'FRAMEWORK_SYNTAX_OBSERVATION_V1', support: 'SUPPORTED', coverage: 'COMPLETE' },
    ],
    diagnostics: [],
    outcome: 'SUCCEEDED',
  };
  own(snapshotData);
  own(result.manifest.state.snapshots);
  own([]);
  context();
  tempWrite('FROZEN', result);
  context();
  const sealText = encode(temp.map((r) => [r.key, r.value_json]));
  bytes(B(sealText));
  pin(64n);
  const frozen = snapshot();
  return {
    observed,
    frozen,
    result,
    seal: SHA(sealText),
    privateReadAfterFreeze: read,
    stageDigest: start.stageDigest,
    firstCloseAdditionalCharge: 0,
    scope:
      'FULL zero projected units. Real Runtime/Provider costs composed, complete before-Store Stage schedule; Store and nonempty facts remain separate gates.',
  };
}
