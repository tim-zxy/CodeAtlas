import crypto from 'node:crypto';
import { modelZeroFullProvider } from './independent-zero-provider-resource-model.mjs';
import { modelCodeIdentity, measures } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
} from './independent-history-resource-model.mjs';
const H = (d, v) =>
    crypto
      .createHash('sha256')
      .update(d + '\0' + C(v))
      .digest('hex'),
  B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent Runtime cost');
    return Number(v);
  };
function accounting() {
  let bytes = 0n,
    items = 0n,
    pin = 0n,
    depth = 0;
  const ledger = [],
    own = (label, v, retain = true) => {
      const m = measures(v);
      items += m.nodes;
      if (retain) pin += m.weight;
      depth = Math.max(depth, m.depth);
      ledger.push({
        label,
        items: N(m.nodes),
        serializedBytes: 0,
        retainedLogicalBytes: retain ? N(m.weight) : 0,
        depth: m.depth,
      });
    },
    encode = (label, v) => {
      own(label + ' traversal', v, false);
      const text = C(v),
        n = B(text);
      bytes += 2n * n;
      pin += 2n * n;
      ledger.push({
        label: label + ' encoding',
        items: 0,
        serializedBytes: N(2n * n),
        retainedLogicalBytes: N(2n * n),
        depth: 0,
      });
      return text;
    },
    owned = (label, v) => {
      own(label + ' initial', v);
      const text = encode(label, v);
      const parsed = JSON.parse(text);
      own(label + ' parsed', parsed);
      return parsed;
    },
    buffer = (label, text) => {
      const n = 2n * B(text);
      bytes += n;
      pin += n;
      ledger.push({ label, items: 0, serializedBytes: N(n), retainedLogicalBytes: N(n), depth: 0 });
    },
    raw = (label, n) => {
      bytes += BigInt(n);
      pin += BigInt(n);
      ledger.push({ label, items: 0, serializedBytes: n, retainedLogicalBytes: n, depth: 0 });
    },
    part = (label, cost, provider = false) => {
      const p = provider ? cost.serializedBytes : cost.retainedLogicalBytes;
      bytes += BigInt(cost.serializedBytes);
      items += BigInt(cost.items);
      pin += BigInt(p);
      depth = Math.max(depth, cost.maxDepth);
      ledger.push({
        label,
        items: cost.items,
        serializedBytes: cost.serializedBytes,
        retainedLogicalBytes: p,
        depth: cost.maxDepth,
      });
    },
    finish = (value) => {
      const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
        result = { ...value, usage };
      own('complete pure Runtime result', result);
      const cost = {
        rows: 0,
        serializedBytes: N(bytes),
        items: N(items),
        retainedLogicalBytes: N(pin),
        maxDepth: depth,
        memoryBudgetBytes: N(2n * pin),
      };
      Object.assign(usage, {
        rows: 0,
        serializedBytes: cost.serializedBytes,
        items: cost.items,
        retainedLogicalBytes: cost.retainedLogicalBytes,
      });
      return { result, cost, ledger };
    };
  return { own, encode, owned, buffer, raw, part, finish };
}
export function zeroFullCapture(input, stageModel) {
  const d = stageModel.privateReadAfterOwner.details,
    revision = d.view.targetSource.revisionId,
    carriers = (input.tables.activation_history ?? []).map((r) => JSON.parse(r.manifest_json)),
    snapshots = d.snapshotRows
      .filter((r) => r.requested_revision_id === revision)
      .map((r) => {
        const snap = carriers.flatMap((m) => m.state.snapshots).find((s) => s.id === r.id);
        if (!snap) throw Error('closed full snapshot carrier absent');
        return snap;
      })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    parent: d.view.history
      ? {
          activationId: stageModel.ownerBody.expectedActivationId,
          repositoryId: d.view.history.state.basis.repositoryId,
          revisionId: d.view.history.state.basis.revisionId,
        }
      : null,
    snapshotIds: d.snapshotIds,
    snapshots,
    coverage: [],
    activeProviderIds: [],
  };
}
export function modelZeroValidation(target, capture, ownerDigest, raw) {
  const a = accounting(),
    scope = { units: [], removedSourceFileIds: [] },
    owner = { stageDigest: ownerDigest, java: null },
    packet = { target, capture, scope, owner, metadata: raw.metadata };
  a.owned('validation packet', packet);
  a.own('reserved metadata', raw.metadata);
  a.own('parsed metadata', raw.metadata);
  a.own('target metadata', raw.metadata);
  a.own('parsed target metadata', raw.metadata);
  for (const f of raw.metadata.inventory) {
    a.raw('inventory path bytes', Buffer.byteLength(f.path));
    a.raw('inventory identity bytes', Buffer.byteLength(f.id));
  }
  a.own('metadata inventory', raw.metadata.inventory);
  a.own('complete inventory equality', [raw.metadata.inventory, target.inventory]);
  a.own('contract and scope records', [target.contracts, [], []]);
  a.buffer('request owned byte representations', raw.requestText);
  a.buffer('output owned byte representations', raw.outputText);
  const full = modelZeroFullProvider(target, raw);
  a.part('real full Provider pipeline', full.cost, true);
  const p = full.result.raw.codeSyntax.request.payload,
    binding = {
      expectedActivationBasis: p.expectedActivationBasis,
      targetSource: p.targetSource,
      ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: ownerDigest },
      providerId: p.providerId,
      providerSnapshotId: p.providerSnapshotId,
      sourceFiles: [],
      owners: [],
    };
  a.own('provisional binding complete check', binding);
  return {
    input: { mode: 'FULL', target, capture, scope, owner },
    ...a.finish({ raw: full.result.raw }),
  };
}
function modelEmptySyntaxAssembly(input) {
  const steps = [],
    q = (label, value) => {
      const m = measures(value),
        bytes = Buffer.byteLength(JSON.stringify(value));
      steps.push({ label, items: Number(m.nodes), serializedBytes: bytes, depth: m.depth });
    },
    digest = (domain, value) => {
      q(domain + ' value', value);
      q(domain + ' canonical copy', value);
      steps.push({
        label: domain + ' framing',
        items: 0,
        serializedBytes: Buffer.byteLength(domain) + 1,
        depth: 0,
      });
      return H(domain, value);
    };
  q('manifest declared input', input);
  q('manifest copied input', input);
  q('manifest schema parsed input', input);
  q('assembled empty pairs', []);
  const state = { ...input.state, syntaxOrigins: [] },
    members = [];
  q('complete history state', state);
  q('current members', members);
  const manifest = {
    schemaVersion: 1,
    parent: input.parent,
    state,
    observation: input.observation,
    transitions: null,
    syntaxMembers: members,
    codeIdentity: state.basis.codeActivationDigest,
    sourceIdentity: digest('codeatlas-activation-source-v1', state.inventory),
    originRegistryDigest: digest('codeatlas-activation-origins-v1', state.snapshots),
  };
  q('complete history manifest', manifest);
  const activationId = 'activation:' + digest('codeatlas-activation-history-v1', manifest),
    result = { manifest, activationId, origins: [], projections: [], members };
  q('complete history candidate', result);
  return {
    result,
    cost: {
      items: steps.reduce((n, s) => n + s.items, 0),
      serializedBytes: steps.reduce((n, s) => n + s.serializedBytes, 0),
      maxDepth: Math.max(...steps.map((s) => s.depth)),
    },
    ledger: steps,
  };
}
export function modelZeroCompose(target, capture, qualificationRef, raw) {
  const a = accounting(),
    declarations = { mode: 'FULL', target, capture, metadata: raw.metadata, qualificationRef };
  a.owned('composition declarations', declarations);
  a.buffer('request owned byte representations', raw.requestText);
  a.buffer('output owned byte representations', raw.outputText);
  const full = modelZeroFullProvider(target, raw);
  a.part('real full Provider pipeline', full.cost, true);
  for (const tag of ['NODE', 'EDGE', 'EVIDENCE', 'BINDING', 'FACT_EVIDENCE', 'SUPPORT_CANDIDATE']) {
    a.own(tag + ' ordered input', []);
    a.own(tag + ' ordered rows', []);
  }
  const snapshots = [...capture.snapshots, full.result.observation.observation.snapshot].sort(
      (a, b) => (a.id < b.id ? -1 : 1),
    ),
    code = {
      targetSource: target.source,
      committedSnapshotCount: capture.snapshotIds.length + 1,
      nodes: [],
      edges: [],
      evidence: [],
      bindings: [],
      factEvidence: [],
      candidates: [],
      snapshots,
      coverage: [],
    };
  a.own('complete future Code input', code);
  const modeledCode = modelCodeIdentity(code);
  a.part('future Code nine-group identity', modeledCode.cost);
  const state = {
    basis: modeledCode.basis,
    repositoryLocatorDigest: target.repositoryLocatorDigest,
    inventory: target.inventory,
    contracts: target.contracts,
    units: [],
    snapshots,
    nodes: [],
    edges: [],
    supports: [],
    coverage: [],
  };
  a.own('complete declared history state', state);
  const observation = {
      snapshotId: raw.metadata.snapshot.id,
      requestIdentity: full.result.raw.provenance.requestIdentity,
      outputIdentity: full.result.raw.provenance.outputIdentity,
      javaProvenance: null,
      scope: { unitIds: [], removedSourceFileIds: [] },
      qualificationRef,
    },
    assembled = modelEmptySyntaxAssembly({
      mode: 'FULL',
      state,
      parent: capture.parent,
      observation,
      transitions: null,
      syntax: [],
    });
  a.part('real empty Syntax/history assembly', assembled.cost, true);
  a.part(
    'final history manifest validation',
    manifestResourceModel(assembled.result.manifest).cost,
  );
  return {
    input: { mode: 'FULL', target, capture, qualificationRef },
    assembledLedger: assembled.ledger,
    ...a.finish({ ...assembled.result, basis: modeledCode.basis, code }),
  };
}
