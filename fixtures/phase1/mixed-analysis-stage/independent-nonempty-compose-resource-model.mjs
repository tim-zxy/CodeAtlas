import crypto from 'node:crypto';
import { measures, modelCodeIdentity } from './independent-code-resource-model.mjs';
import {
  historyCanonical as C,
  manifestResourceModel,
  pairResourceModel,
} from './independent-history-resource-model.mjs';
import { modelNonemptyFullProvider } from './independent-nonempty-provider-resource-model.mjs';
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Closed initial FULL Java/Python composition. No product imports or observed costs. */
export function modelNonemptyCompose(target, capture, qualificationRef, raw) {
  if (
    capture.parent !== null ||
    capture.snapshotIds.length ||
    capture.snapshots.length ||
    capture.coverage.length ||
    capture.activeProviderIds.length
  )
    throw Error('closed composition requires initial capture');
  let bytes = 0n,
    items = 0n,
    pin = 0n,
    depth = 0;
  const ledger = [],
    record = (label, ni, nb, np, d = 0) => {
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
      record(label, m.nodes, 0n, retain ? m.weight : 0n, m.depth);
    },
    encode = (label, v) => {
      own(label + ' traversal', v, false);
      const text = C(v),
        n = Buffer.byteLength(text);
      record(label + ' encoding', 0, 2 * n, 2 * n);
      return text;
    },
    q = (label, v) => {
      const m = measures(v),
        n = Buffer.byteLength(JSON.stringify(v));
      record(label, m.nodes, n, n, m.depth);
      return v;
    },
    h = (domain, v) => {
      q(domain + ' input', v);
      q(domain + ' ordered reserve', v);
      record(domain + ' framing', 0, Buffer.byteLength(domain) + 1, Buffer.byteLength(domain) + 1);
      return sha(domain + '\0' + C(v));
    },
    plainDigest = (label, v) => {
      q(label + ' input', v);
      q(label + ' ordered reserve', v);
      return sha(C(v));
    },
    tuple = (domain, fields) => {
      const wire =
          domain + '\0' + fields.map((f) => Buffer.byteLength(String(f)) + ':' + f).join(''),
        n = Buffer.byteLength(wire) + Buffer.byteLength(domain) + 1 + 64;
      record(domain + ' tuple', fields.length + 2, n, n);
      return domain + ':' + sha(wire);
    },
    part = (label, c, provider = false) =>
      record(
        label,
        c.items,
        c.serializedBytes,
        provider ? c.serializedBytes : c.retainedLogicalBytes,
        c.maxDepth,
      ),
    scope = (kind, value) => ({
      scope: 'REPOSITORY',
      repositoryId: target.source.repositoryId,
      entity: { kind, id: value.id, revisionId: target.source.revisionId },
    });
  const declarations = { mode: 'FULL', target, capture, metadata: raw.metadata, qualificationRef };
  own('composition declarations', declarations);
  encode('composition declarations', declarations);
  own('owned composition declarations', declarations);
  for (const s of [raw.requestText, raw.outputText]) {
    const n = 2 * Buffer.byteLength(s);
    record('raw byte owned representations', 0, n, n);
  }
  const full = modelNonemptyFullProvider(target, raw);
  part('complete full Provider', full.cost, true);
  const merged = full.result.merged,
    ob = full.result.observation,
    supports = full.result.activeSupports.map(({ snapshotId, ...v }) => v),
    ordered = (label, values, key) => {
      own(label + ' values', values);
      const rows = values.map((value) => ({ value, key: key(value) }));
      own(label + ' rows', rows);
      for (const row of rows)
        for (const k of row.key) {
          const n = Buffer.byteLength(k);
          record(label + ' byte key', 0, n, n);
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
    };
  const code = {
    targetSource: target.source,
    committedSnapshotCount: 1,
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
    snapshots: [ob.observation.snapshot],
    coverage: ob.coverage.flatMap((row) =>
      ob.units
        .find((u) => u.id === row.unitId)
        .sourceFileIds.map((sourceFileId) => ({
          providerSnapshotId: row.originSnapshotId,
          capabilityName: row.facet,
          sourceFileId,
          status: row.coverage,
        })),
    ),
  };
  own('future Code', code);
  const modeled = modelCodeIdentity(code),
    basis = modeled.basis;
  part('future Code identity', modeled.cost);
  const state = {
    basis,
    repositoryLocatorDigest: target.repositoryLocatorDigest,
    inventory: target.inventory,
    contracts: target.contracts,
    units: ob.units,
    snapshots: code.snapshots,
    nodes: [...merged.nodes].sort((a, b) => cmp(a.id, b.id)),
    edges: [...merged.edges].sort((a, b) => cmp(a.id, b.id)),
    supports,
    coverage: ob.coverage,
  };
  own('full declared history state', state);
  const syntax = [];
  for (const e of full.result.raw.codeSyntax.events.filter(
    (e) => e.type === 'SYNTAX_OBSERVATION',
  )) {
    const r = e.payload,
      f = target.inventory.find((f) => f.id === r.sourceFileId),
      u = ob.units.find((u) => u.sourceFileIds.includes(f.id)),
      input = {
        basis,
        sourceFile: f,
        raw: r,
        selectedNodes: state.nodes,
        bindings: merged.bindings,
        supports,
        extractorVersion: 'syntax-v1',
      };
    q('syntax input', input);
    q('syntax owned input', input);
    q('syntax schema input', input);
    for (const n of state.nodes) q('syntax selected node lookup', [n.id, n]);
    for (const b of merged.bindings) q('syntax binding key', b.providerFact);
    for (const s of supports) {
      q('syntax support key', s.binding.providerFact);
      plainDigest('syntax complete support candidate', {
        kind: 'DECLARED_HISTORY_CANDIDATE_V1',
        candidate: s.canonical,
      });
    }
    const needed = new Map(),
      ref = (provider) => {
        q('syntax reference lookup', provider);
        const b = merged.bindings.find((b) => C(b.providerFact) === C(provider)),
          n = state.nodes.find((n) => n.id === b.canonicalFact.id),
          v = scope('CODE_NODE', n);
        q('syntax mapped reference', v);
        needed.set(n.id, v);
        return v;
      },
      owner = r.owner === null ? null : ref(r.owner);
    let payload,
      nonExact = false;
    if (r.syntaxKind === 'DECLARATION') payload = structuredClone(r.payload);
    else if (
      r.syntaxKind === 'ASSIGNMENT' &&
      r.payload.value.kind === 'REFERENCE' &&
      r.payload.value.target.state === 'UNRESOLVED' &&
      !r.payload.value.target.candidates.length
    ) {
      const v = r.payload.value;
      nonExact = v.target.resolution !== 'EXACT';
      payload = {
        targetName: r.payload.targetName,
        value: { kind: 'REFERENCE', name: v.name, resolution: v.target.resolution, candidates: [] },
      };
    } else throw Error('closed composition Syntax kind/value not covered');
    q('syntax mapped payload', payload);
    const reasons = [
      'DECLARED_SOURCE_CONTEXT_MATCHED',
      'SYNTAX_PAYLOAD_VALIDATED',
      'REQUIRED_SUPPORTS_CLOSED',
    ];
    if (owner === null) reasons.push('OWNER_NULL_PRESERVED');
    if (nonExact) reasons.push('NON_EXACT_VALUE_REFERENCE_PRESERVED');
    const supportRefs = [
      {
        basis,
        entity: { kind: 'SOURCE_FILE', id: f.id, revisionId: basis.revisionId },
        valueDigest: h('codeatlas-phase1-support-value-v1', f),
      },
    ];
    for (const v of needed.values())
      supportRefs.push({
        basis,
        entity: v.entity,
        valueDigest: h(
          'codeatlas-phase1-support-value-v1',
          state.nodes.find((n) => n.id === v.entity.id),
        ),
      });
    supportRefs.sort((a, b) =>
      cmp(
        JSON.stringify([a.entity.kind, a.entity.id, a.entity.revisionId]),
        JSON.stringify([b.entity.kind, b.entity.id, b.entity.revisionId]),
      ),
    );
    const meaning = { owner: owner ? { kind: 'CODE_NODE', id: owner.entity.id } : null, payload },
      pd = plainDigest('syntax meaning', meaning),
      range = r.sourceRange,
      fields = [
        basis.repositoryId,
        f.id,
        f.contentFingerprint,
        range.startLine,
        range.startColumn,
        range.endLine,
        range.endColumn,
        r.syntaxKind,
        pd,
      ],
      syntaxKey = tuple('syntax-key-v1', fields),
      extractionVersion = tuple('syntax-extraction-v1', [
        'syntax-v1',
        'syntax-canonical-mapper-v1',
        'syntax-surface-support-v1',
      ]);
    // Existing approved fixed syntax confidence, not a new threshold/profile.
    const initial = {
        syntaxKey,
        repositoryId: basis.repositoryId,
        revisionId: basis.revisionId,
        sourceFingerprint: r.sourceFingerprint,
        sourceRange: r.sourceRange,
        owner,
        supportRefs,
        confidence: { score: 0.5, method: 'syntax-surface-support-v1', reasons },
        extractionVersion,
        syntaxKind: r.syntaxKind,
        payload,
      },
      id = 'syntax:' + h('codeatlas-syntax-initial-v1', initial),
      envelope = { schema: 'codeatlas.syntax-evidence', version: 1, payload: { id, ...initial } },
      referenceContext = {
        availableEntities: [
          scope('SOURCE_FILE', f),
          ...state.nodes.map((n) => scope('CODE_NODE', n)),
        ],
        availableSupports: supportRefs,
      };
    q('syntax envelope', envelope);
    q('syntax parsed envelope', envelope);
    q('syntax reference context', referenceContext);
    q('syntax parsed reference context', referenceContext);
    const item = {
      kind: 'NEW',
      body: {
        schemaVersion: 1,
        providerSyntaxId: r.providerSyntaxId,
        originSnapshot: ob.observation.snapshot,
        sourceFile: f,
        unitId: u.id,
        envelope,
      },
    };
    own('new Syntax body', item);
    syntax.push(item);
  }
  const observed = {
    snapshotId: ob.observation.snapshot.id,
    requestIdentity: ob.requestIdentity,
    outputIdentity: ob.outputIdentity,
    javaProvenance: raw.metadata.java
      ? {
          kind: 'PARSED_V2',
          requestId: raw.metadata.java.request.requestId,
          startedAt: raw.metadata.java.startedAt,
          settledAt: raw.metadata.java.settledAt,
        }
      : null,
    scope: { unitIds: ob.units.map((u) => u.id).sort(cmp), removedSourceFileIds: [] },
    qualificationRef,
  };
  const assemblyInput = {
    mode: 'FULL',
    state,
    parent: null,
    observation: observed,
    transitions: null,
    syntax,
  };
  q('manifest assembly input', assemblyInput);
  q('manifest assembly owned', assemblyInput);
  q('manifest assembly parsed', assemblyInput);
  const pairs = [];
  for (const item of syntax) {
    const body = item.body,
      source = body.sourceFile,
      snapshot = body.originSnapshot,
      payload = body.envelope.payload,
      input = { body, selectedNodes: state.nodes };
    q('pair input', input);
    q('pair owned', input);
    q('pair parsed', input);
    q('pair envelope', body.envelope);
    q('pair parsed envelope', body.envelope);
    const available = [
      { kind: 'SOURCE_FILE', value: source },
      ...state.nodes.map((value) => ({ kind: 'CODE_NODE', value })),
    ];
    q('pair available values', available);
    const values = new Map(),
      entities = [];
    for (const { kind, value } of available) {
      const ref = scope(kind, value);
      q('pair available lookup', [kind + ':' + value.id, value, ref]);
      values.set(kind + ':' + value.id, value);
      entities.push(ref);
    }
    for (const support of payload.supportRefs) {
      const key = support.entity.kind + ':' + support.entity.id,
        v = values.get(key);
      q('pair support lookup', [key, v]);
      h('codeatlas-phase1-support-value-v1', v);
    }
    q(
      'pair supported identities',
      payload.supportRefs.map((s) => s.entity.kind + ':' + s.entity.id),
    );
    const rc = { availableEntities: entities, availableSupports: payload.supportRefs };
    q('pair reference context', rc);
    q('pair parsed reference context', rc);
    q('pair final envelope', body.envelope);
    q('pair final parsed envelope', body.envelope);
    const { id: initialId, ...withoutId } = payload;
    q('pair payload without id', withoutId);
    if (initialId !== 'syntax:' + h('codeatlas-syntax-initial-v1', withoutId))
      throw Error('independent initial identity mismatch');
    q('pair complete body', body);
    const od = h('codeatlas-syntax-origin-v1', body),
      originId = 'syntax-origin:' + od,
      pd = h('codeatlas-syntax-projection-v1', { originId, payload: withoutId }),
      projectionId = 'syntax:' + pd,
      projected = {
        schema: 'codeatlas.syntax-evidence',
        version: 1,
        payload: { ...payload, id: projectionId },
      };
    q('projected envelope', projected);
    const pairEncode = (label, v) => {
        q(label + ' encoding', v);
        q(label + ' reserve', v);
        return C(v);
      },
      pair = {
        origin: {
          id: originId,
          repository_id: source.repositoryId,
          revision_id: source.revisionId,
          origin_snapshot_id: snapshot.id,
          origin_digest: od,
          origin_json: pairEncode('origin', body),
        },
        projection: {
          id: projectionId,
          repository_id: source.repositoryId,
          origin_id: originId,
          projection_digest: pd,
          envelope_json: pairEncode('projection', projected),
        },
        member: { originId, projectionId, unitId: body.unitId },
        metadata: {
          id: originId,
          unitId: body.unitId,
          originSnapshotId: snapshot.id,
          valueDigest: od,
          basis,
        },
      };
    q('complete pair', pair);
    q('manifest pair identity', originId);
    pairs.push(pair);
  }
  q('complete pair vector', pairs);
  pairs.sort((a, b) => cmp(a.origin.id, b.origin.id));
  const completeState = { ...state, syntaxOrigins: pairs.map((p) => p.metadata) },
    members = pairs.map((p) => p.member);
  q('complete history state', completeState);
  q('complete current members', members);
  const manifest = {
    schemaVersion: 1,
    parent: null,
    state: completeState,
    observation: observed,
    transitions: null,
    syntaxMembers: members,
    codeIdentity: basis.codeActivationDigest,
    sourceIdentity: h('codeatlas-activation-source-v1', state.inventory),
    originRegistryDigest: h('codeatlas-activation-origins-v1', state.snapshots),
  };
  q('complete manifest', manifest);
  const activationId = 'activation:' + h('codeatlas-activation-history-v1', manifest),
    assembled = {
      manifest,
      activationId,
      origins: pairs.map((p) => p.origin),
      projections: pairs.map((p) => p.projection),
      members,
    };
  q('complete history candidate', assembled);
  part('final H1 manifest validation', manifestResourceModel(manifest).cost);
  for (const p of pairs)
    part(
      'final H1 Syntax pair validation',
      pairResourceModel({
        origin: p.origin,
        projection: p.projection,
        current: manifest,
        ancestors: [manifest],
      }).cost,
    );
  const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
    result = { ...assembled, basis, code, usage };
  own('complete composition result', result);
  if ([bytes, items, pin, 2n * pin].some((n) => n > BigInt(Number.MAX_SAFE_INTEGER)))
    throw Error('unsafe independent composition cost');
  const cost = {
    rows: 0,
    serializedBytes: Number(bytes),
    items: Number(items),
    retainedLogicalBytes: Number(pin),
    maxDepth: depth,
    memoryBudgetBytes: Number(2n * pin),
  };
  Object.assign(usage, {
    rows: 0,
    serializedBytes: cost.serializedBytes,
    items: cost.items,
    retainedLogicalBytes: cost.retainedLogicalBytes,
  });
  return {
    input: { mode: 'FULL', target, capture, qualificationRef },
    result,
    cost,
    ledger,
    scope:
      'Initial full Java class/compilation-unit, Python module/unresolved import/reference and declaration/assignment Syntax only; no DELTA/retained/Native/Store qualification.',
  };
}
