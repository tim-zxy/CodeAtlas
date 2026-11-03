import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import {
  modelDeclaredHistoryScope,
  modelNoObservationSupportCandidate,
} from './independent-delta-history-resource-model.mjs';
/** Closed DELTA NO_OP pure Runtime, including complete ancestry/pairs/old Code and both Provider passes. */
export function modelNoopComposition(input) {
  assert.equal(input.mode, 'DELTA');
  assert.equal(input.rawBundle, null);
  const { target, capture, qualificationRef } = input;
  let bytes = 0n,
    items = 0n,
    pin = 0n,
    depth = 0;
  const ledger = [];
  const add = (label, ni, nb, np, d = 0) => {
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
      add(label, m.nodes, 0, retain ? m.weight : 0, m.depth);
    },
    encode = (label, v) => {
      own(label + ' traversal', v, false);
      const n = Buffer.byteLength(C(v));
      add(label + ' encode', 0, 2 * n, 2 * n);
    },
    part = (label, c, provider = false) =>
      add(
        label,
        c.items,
        c.serializedBytes,
        provider ? c.serializedBytes : c.retainedLogicalBytes,
        c.maxDepth,
      ),
    digest = (label, domain, v) => {
      encode(label, v);
      add(label + ' digest frame', 0, Buffer.byteLength(domain) + 1, 64);
      return crypto
        .createHash('sha256')
        .update(domain + '\0' + C(v))
        .digest('hex');
    };
  const declarations = { mode: 'DELTA', target, capture, metadata: null, qualificationRef };
  own('composition declarations', declarations);
  encode('composition declarations', declarations);
  own('owned composition declarations', declarations);
  const ancestors = [capture.history, ...capture.ancestors];
  let currentId;
  for (const [i, m] of ancestors.entries()) {
    part('complete history manifest ' + i, manifestResourceModel(m).cost);
    const id =
      'activation:' +
      digest('history activation identity ' + i, 'codeatlas-activation-history-v1', m);
    if (i === 0) currentId = id;
    else assert.equal(ancestors[i - 1].parent.activationId, id);
  }
  assert.equal(currentId, capture.parent.activationId);
  assert.equal(ancestors.at(-1).parent, null);
  const s = capture.history.state,
    code = {
      targetSource: {
        repositoryId: s.basis.repositoryId,
        revisionId: s.basis.revisionId,
        contentFingerprint: s.basis.contentFingerprint,
      },
      committedSnapshotCount: capture.snapshotIds.length,
      nodes: s.nodes,
      edges: s.edges,
      evidence: s.supports.map((v) => v.evidence),
      bindings: s.supports.map((v) => v.binding),
      factEvidence: s.supports.map((v) => v.factEvidence),
      candidates: s.supports.map((v) => ({
        evidenceId: v.evidence.id,
        factType: v.factType,
        canonicalFactId: v.canonical.id,
        candidate: v.canonical,
      })),
      snapshots: s.snapshots,
      coverage: capture.coverage,
    },
    identity = modelCodeIdentity(code);
  part('complete old Code identity', identity.cost);
  assert.deepEqual(identity.basis, s.basis);
  for (const m of capture.history.syntaxMembers) {
    const pair = {
      origin: capture.origins.find((v) => v.id === m.originId),
      projection: capture.projections.find((v) => v.id === m.projectionId),
      current: capture.history,
      ancestors,
    };
    part('complete current Syntax pair ' + m.originId, pairResourceModel(pair).cost);
  }
  const state = {
      ...s,
      supports: s.supports.map((v) => ({ ...v, snapshotId: v.evidence.providerSnapshotId })),
    },
    packet = {
      history: { activationId: currentId, parent: capture.history.parent, state },
      current: state,
      expectedActivationId: currentId,
      expectedOldBasis: s.basis,
      target,
      observation: null,
    };
  own('complete history transition packet', packet);
  const scope = modelDeclaredHistoryScope(packet);
  assert.equal(scope.result.mode, 'NO_OP');
  part('complete Provider scope preparation', scope.cost, true);
  const candidate = modelNoObservationSupportCandidate(packet);
  assert.equal(candidate.result.mode, 'NO_OP');
  part('complete Provider no-op candidate', candidate.cost, true);
  const result = {
    kind: 'NO_OP',
    activationId: currentId,
    basis: s.basis,
    usage: { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
  };
  own('complete Runtime NO_OP result', result);
  for (const v of [bytes, items, pin]) assert.ok(v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER));
  const cost = {
    rows: 0,
    serializedBytes: Number(bytes),
    items: Number(items),
    retainedLogicalBytes: Number(pin),
    maxDepth: depth,
    memoryBudgetBytes: Number(2n * pin),
  };
  Object.assign(result.usage, {
    rows: 0,
    serializedBytes: cost.serializedBytes,
    items: cost.items,
    retainedLogicalBytes: cost.retainedLogicalBytes,
  });
  return { input, result, cost, ledger };
}
