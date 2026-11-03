import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import { modelDeclaredHistoryScope } from './independent-delta-history-resource-model.mjs';
/** Closed original partial Python DELTA Runtime composition; no observed counters or product imports. */
export function modelDeltaComposition(input, raw) {
  assert.equal(input.mode, 'DELTA');
  assert.equal(raw.metadata.java, null);
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
  const declarations = { mode: 'DELTA', target, capture, metadata: raw.metadata, qualificationRef };
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
    oldCode = {
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
    identity = modelCodeIdentity(oldCode);
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
  assert.equal(scope.result.mode, 'OBSERVATION_REQUIRED');
  part('complete Provider scope preparation', scope.cost, true);
  for (const text of [raw.requestText, raw.outputText]) {
    const n = 2 * Buffer.byteLength(text);
    add('raw byte copies', 0, n, n);
  }
  const provider = modelDeltaRawProvider(packet, raw);
  part('complete raw DELTA Provider', provider.cost, true);
  const candidate = provider.result.candidate,
    ob = provider.observation,
    merged = candidate.merged,
    supports = candidate.activeSupports.map(({ snapshotId, ...v }) => v),
    transitions = candidate.transition;
  assert.equal(
    provider.result.raw.codeSyntax.events.filter((e) => e.type === 'SYNTAX_OBSERVATION').length,
    0,
  );
  const ordered = (label, values, key) => {
      own(label + ' values', values);
      const rows = values.map((value) => ({ value, key: key(value) }));
      own(label + ' rows', rows);
      for (const r of rows)
        for (const k of r.key) {
          const n = Buffer.byteLength(k);
          add(label + ' byte key', 0, n, n);
        }
      return rows
        .sort((a, b) => {
          for (let i = 0; i < a.key.length; i++) {
            const n = Buffer.compare(Buffer.from(a.key[i]), Buffer.from(b.key[i]));
            if (n) return n;
          }
          return 0;
        })
        .map((r) => r.value);
    },
    cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const code = {
    targetSource: target.source,
    committedSnapshotCount: capture.snapshotIds.length + 1,
    nodes: ordered('NODE', merged.nodes, (v) => [v.id]),
    edges: ordered('EDGE', merged.edges, (v) => [v.id]),
    evidence: ordered('EVIDENCE', merged.evidence, (v) => [v.id]),
    bindings: ordered('BINDING', merged.bindings, (v) => [
      v.evidenceId,
      v.providerFact.factType,
      v.canonicalFact.id,
    ]),
    factEvidence: ordered('FACT_EVIDENCE', merged.factEvidence, (v) => [
      v.evidenceId,
      v.fact.factType,
      v.fact.id,
    ]),
    candidates: ordered(
      'SUPPORT_CANDIDATE',
      supports.map((v) => ({
        evidenceId: v.evidence.id,
        factType: v.factType,
        canonicalFactId: v.canonical.id,
        candidate: v.canonical,
      })),
      (v) => [v.evidenceId, v.factType, v.canonicalFactId],
    ),
    snapshots: candidate.originSnapshotRegistry.toSorted((a, b) => cmp(a.id, b.id)),
    coverage: [
      ...capture.coverage,
      ...ob.coverage.flatMap((r) =>
        ob.units
          .find((u) => u.id === r.unitId)
          .sourceFileIds.map((sourceFileId) => ({
            providerSnapshotId: r.originSnapshotId,
            capabilityName: r.facet,
            sourceFileId,
            status: r.coverage,
          })),
      ),
    ],
  };
  own('future complete Code', code);
  const identity2 = modelCodeIdentity(code),
    basis = identity2.basis;
  part('future complete Code identity', identity2.cost);
  const state2 = {
    basis,
    repositoryLocatorDigest: target.repositoryLocatorDigest,
    inventory: target.inventory,
    contracts: target.contracts,
    units: candidate.dependencyUnits,
    snapshots: code.snapshots,
    nodes: merged.nodes.toSorted((a, b) => cmp(a.id, b.id)),
    edges: merged.edges.toSorted((a, b) => cmp(a.id, b.id)),
    supports,
    coverage: transitions.coverageOrigins,
  };
  own('complete future history state', state2);
  const observed = {
      snapshotId: ob.observation.snapshot.id,
      requestIdentity: ob.requestIdentity,
      outputIdentity: ob.outputIdentity,
      javaProvenance: null,
      scope: {
        unitIds: ob.units.map((u) => u.id).sort(cmp),
        removedSourceFileIds: transitions.diff
          .filter((d) => d.kind === 'REMOVED')
          .map((d) => d.before.id)
          .sort(cmp),
      },
      qualificationRef,
    },
    syntax = [];
  const q = (label, v) => {
      const m = measures(v),
        n = Buffer.byteLength(JSON.stringify(v));
      add(label, m.nodes, n, n, m.depth);
    },
    h = (domain, v) => {
      q(domain + ' value', v);
      q(domain + ' ordered reserve', v);
      const n = Buffer.byteLength(domain) + 1;
      add(domain + ' framing', 0, n, n);
      return crypto
        .createHash('sha256')
        .update(domain + '\0' + C(v))
        .digest('hex');
    };
  const assembly = {
    mode: 'DELTA',
    state: state2,
    parent: capture.parent,
    observation: observed,
    transitions,
    syntax,
  };
  q('assembly input', assembly);
  q('assembly owned input', assembly);
  q('assembly parsed input', assembly);
  q('checked DELTA transition', transitions);
  q('complete pair vector', []);
  const completeState = { ...state2, syntaxOrigins: [] },
    members = [];
  q('complete declared history state', completeState);
  q('complete members', members);
  const manifest = {
    schemaVersion: 1,
    parent: capture.parent,
    state: completeState,
    observation: observed,
    transitions,
    syntaxMembers: members,
    codeIdentity: basis.codeActivationDigest,
    sourceIdentity: h('codeatlas-activation-source-v1', state2.inventory),
    originRegistryDigest: h('codeatlas-activation-origins-v1', state2.snapshots),
  };
  q('complete manifest', manifest);
  const activationId = 'activation:' + h('codeatlas-activation-history-v1', manifest),
    assembled = { manifest, activationId, origins: [], projections: [], members };
  q('complete history candidate', assembled);
  part('final H1 manifest', manifestResourceModel(manifest).cost);
  const result = {
    ...assembled,
    basis,
    code,
    usage: { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
  };
  own('complete Runtime DELTA result', result);
  for (const v of [bytes, items, pin, 2n * pin])
    assert.ok(v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER));
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
import { modelDeltaRawProvider } from './independent-delta-raw-resource-model.mjs';
