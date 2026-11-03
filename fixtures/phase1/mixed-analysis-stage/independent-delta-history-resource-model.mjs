import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  ref = (r) => JSON.stringify([r.factType, r.providerId, r.providerFactId]);
const hash = (v) => crypto.createHash('sha256').update(C(v)).digest('hex');
/** Independent closed history/scope/no-observation model. No product imports, usage or callback execution. */
function accounting() {
  let bytes = 0n,
    items = 0n,
    depth = 0;
  const ledger = [];
  const q = (label, v) => {
    const m = measures(v),
      n = BigInt(Buffer.byteLength(JSON.stringify(v)));
    bytes += n;
    items += m.nodes;
    depth = Math.max(depth, m.depth);
    ledger.push({ label, serializedBytes: Number(n), items: Number(m.nodes), depth: m.depth });
    return v;
  };
  const digest = (label, v) => {
    q(label + ' representation', v);
    q(label + ' ordered representation', v);
    return hash(v);
  };
  const tuple = (domain, fields, charged) => {
    const wire = domain + '\0' + fields.map((v) => Buffer.byteLength(v) + ':' + v).join('');
    if (charged) {
      const n = Buffer.byteLength(wire) + Buffer.byteLength(domain) + 1 + 64,
        k = fields.length + 2;
      bytes += BigInt(n);
      items += BigInt(k);
      ledger.push({
        label: 'evidence tuple framing and returned id',
        serializedBytes: n,
        items: k,
        depth: 0,
      });
    }
    return domain + ':' + crypto.createHash('sha256').update(wire).digest('hex');
  };
  const finish = (result) => {
    assert.ok(bytes <= BigInt(Number.MAX_SAFE_INTEGER) && items <= BigInt(Number.MAX_SAFE_INTEGER));
    return {
      result,
      cost: { serializedBytes: Number(bytes), items: Number(items), maxDepth: depth },
      ledger,
    };
  };
  return { q, digest, tuple, finish };
}
function collect(s, group, snapshot, a, charged) {
  const q = (label, v) => (charged ? a.q(label, v) : v);
  const observation = {
    snapshot,
    nodes: group
      .filter((v) => v.factType === 'NODE')
      .map((v) => ({ provider: v.binding.providerFact, canonical: v.canonical })),
    edges: group
      .filter((v) => v.factType === 'EDGE')
      .map((v) => ({ provider: v.binding.providerFact, canonical: v.canonical })),
  };
  const input = {
    repositoryId: s.basis.repositoryId,
    revisionId: s.basis.revisionId,
    observations: [observation],
  };
  q('merge input', input);
  q('parsed merge input', input);
  q('observation path', ['observations', 0]);
  q('snapshot provider', snapshot.providerId);
  q('snapshot id', snapshot.id);
  const result = [];
  for (const [factType, field] of [
    ['NODE', 'nodes'],
    ['EDGE', 'edges'],
  ])
    for (const [index, pair] of observation[field].entries()) {
      const path = ['observations', 0, field, index],
        unique = [snapshot.id, factType, pair.provider.providerId, pair.provider.providerFactId],
        fields = [s.basis.repositoryId, s.basis.revisionId, ...unique];
      q('fact path', path);
      q('unique tuple', unique);
      q('unique key', JSON.stringify(unique));
      q('evidence identity fields', fields);
      const evidenceId = a.tuple('provider-evidence-v1', fields, charged),
        fact = { factType, id: pair.canonical.id };
      q('canonical fact ref', fact);
      const evidence = {
          id: evidenceId,
          repositoryId: s.basis.repositoryId,
          revisionId: s.basis.revisionId,
          providerSnapshotId: snapshot.id,
          providerFact: pair.provider,
          status: 'ACTIVE',
        },
        factEvidence = { fact, evidenceId },
        binding = {
          providerFact: pair.provider,
          providerSnapshotId: snapshot.id,
          canonicalFact: fact,
          evidenceId,
        };
      for (const v of [evidence, factEvidence, binding]) {
        q('relation draft', v);
        q('parsed relation', v);
      }
      result.push(
        q('collected support', {
          factType,
          canonical: pair.canonical,
          snapshotId: snapshot.id,
          inputPath: path,
          evidence,
          factEvidence,
          binding,
        }),
      );
    }
  q('complete collected supports', result);
  return result;
}
function select(supports, a, charged) {
  const q = (label, v) => (charged ? a.q(label, v) : v),
    groups = new Map();
  q('selector supports', supports);
  for (const s of supports) {
    const f = s.canonical,
      fields = [f.repositoryId, f.revisionId, s.factType, f.factKey],
      key = JSON.stringify(fields);
    q('group identity fields', fields);
    q('group identity key', key);
    q('canonical grouping lookup', [s.factType + ':' + f.id, key]);
    q('group support', s);
    const group = groups.get(key) || [];
    group.push(s);
    groups.set(key, group);
  }
  const nodes = [],
    edges = [],
    explanations = [],
    rank = (s) =>
      s.factType === 'NODE'
        ? s.canonical.sourceRange === null
          ? 0
          : 1
        : { EXACT: 5, HEURISTIC: 4, AMBIGUOUS: 3, UNRESOLVED: 2, UNSUPPORTED: 1 }[
            s.canonical.target.resolution
          ];
  const identity = (s) => {
    const f = s.canonical;
    return s.factType === 'NODE'
      ? {
          id: f.id,
          kind: f.kind,
          subkind: f.kind === 'TYPE' ? f.typeKind : f.kind === 'SYMBOL' ? f.symbolKind : null,
          qualifiedName: f.qualifiedName,
          sourceRange: f.kind === 'PACKAGE' ? null : f.sourceRange,
        }
      : {
          id: f.id,
          kind: f.kind,
          source: f.source,
          sourceRange: f.sourceRange,
          state: f.target.state,
          target: f.target.state === 'RESOLVED' ? f.target.target : f.target.originalHint,
        };
  };
  for (const group of groups.values()) {
    const shape = identity(group[0]);
    q('group identity', shape);
    for (const s of group) {
      q('compared group identity', identity(s));
      assert.deepEqual(identity(s), shape);
    }
    q('group selection ordering', group);
    const ordered = group.toSorted(
        (a, b) =>
          rank(b) - rank(a) ||
          cmp(a.binding.providerFact.providerId, b.binding.providerFact.providerId) ||
          cmp(a.binding.providerFact.providerFactId, b.binding.providerFact.providerFactId) ||
          cmp(a.snapshotId, b.snapshotId),
      ),
      chosen = ordered[0],
      f = chosen.canonical,
      scores = group.map((s) => s.canonical.confidence.score);
    q('confidence scores', scores);
    const confidence =
        group.length === 1
          ? f.confidence
          : {
              score: Math.min(...scores),
              method: 'fact-merger-min-v1',
              reasons: ['minimum active support score'],
            },
      fact = { ...f, confidence };
    q('selected fact draft', fact);
    q('parsed selected fact', fact);
    q('evidence ordering', group);
    const summaries = group
      .toSorted((a, b) => cmp(a.evidence.id, b.evidence.id))
      .map((s) =>
        q('support summary', {
          evidenceId: s.evidence.id,
          confidence: s.canonical.confidence,
          resolution: s.factType === 'EDGE' ? s.canonical.target.resolution : null,
        }),
      );
    const conflict = new Set();
    for (const s of group) {
      const n = s.canonical;
      if (C(n.confidence) !== C(f.confidence)) conflict.add('CONFIDENCE_VARIANT');
      if (s.factType === 'NODE') {
        if (n.name !== f.name || C(n.sourceRange) !== C(f.sourceRange))
          conflict.add('DISPLAY_VARIANT');
      } else {
        if (n.target.resolution !== f.target.resolution) conflict.add('RESOLUTION_VARIANT');
        if (
          n.target.state === 'UNRESOLVED' &&
          f.target.state === 'UNRESOLVED' &&
          C(n.target.candidates) !== C(f.target.candidates)
        )
          conflict.add('CANDIDATE_VARIANT');
      }
    }
    const conflicts = [...conflict].sort();
    q('conflict categories', conflicts);
    const explanation = {
      fact: { factType: chosen.factType, id: f.id },
      selectedEvidenceId: chosen.evidence.id,
      supports: summaries,
      selectionRule:
        group.length === 1
          ? 'SINGLE_SUPPORT'
          : rank(ordered[0]) !== rank(ordered[1])
            ? chosen.factType === 'NODE'
              ? 'SOURCE_BACKED'
              : 'RESOLUTION_PRIORITY'
            : 'STABLE_TIE_BREAK',
      conflicts,
    };
    q('explanation', explanation);
    q('group result', { fact, explanation });
    q('selected path', [chosen.factType + ':' + f.id, chosen.inputPath]);
    q('selected fact', fact);
    q('selected explanation', explanation);
    (chosen.factType === 'NODE' ? nodes : edges).push(fact);
    explanations.push(explanation);
  }
  nodes.sort((a, b) => cmp(a.factKey, b.factKey));
  edges.sort((a, b) => cmp(a.factKey, b.factKey));
  for (const e of explanations) q('explanation order', e.fact.factType + ':' + e.fact.id);
  explanations.sort((a, b) =>
    cmp(a.fact.factType + ':' + a.fact.id, b.fact.factType + ':' + b.fact.id),
  );
  q(
    'selected node ids',
    nodes.map((v) => v.id),
  );
  return q('selected complete result', { nodes, edges, explanations });
}
function prepare(packet, a, charged) {
  a.q('history packet', packet);
  if (charged) a.q('parsed history packet', packet);
  for (const s of [packet.history.state, packet.current]) {
    const q = (label, v) => (charged ? a.q(label, v) : v);
    q('state units and inventory', { units: s.units, inventory: s.inventory });
    q('state contracts', s.contracts);
    q('state snapshot registry', s.snapshots);
    const collected = [];
    for (const snap of s.snapshots) {
      const group = s.supports.filter((v) => v.snapshotId === snap.id),
        obs = {
          snapshot: snap,
          nodes: group
            .filter((v) => v.factType === 'NODE')
            .map((v) => ({
              provider: { ...v.binding.providerFact, factType: 'NODE' },
              canonical: v.canonical,
            })),
          edges: group
            .filter((v) => v.factType === 'EDGE')
            .map((v) => ({
              provider: { ...v.binding.providerFact, factType: 'EDGE' },
              canonical: v.canonical,
            })),
        };
      q('state observation', obs);
      const rebuilt = collect(s, group, snap, a, charged);
      for (const v of group) {
        const actual = rebuilt.find((v2) => v2.evidence.id === v.evidence.id);
        assert.ok(actual);
        const { inputPath, ...relation } = actual,
          { dependencyUnitIds, valueDigest, ...base } = v;
        assert.deepEqual(relation, base);
        assert.equal(
          a.digest('support candidate identity', {
            kind: 'DECLARED_HISTORY_CANDIDATE_V1',
            candidate: v.canonical,
          }),
          v.valueDigest,
        );
        q('support dependencies', {
          canonical: v.canonical,
          binding: v.binding,
          dependencyUnitIds: v.dependencyUnitIds,
          units: s.units,
        });
        collected.push(actual);
      }
    }
    const selected = select(collected, a, charged);
    assert.deepEqual(
      selected.nodes.toSorted((a, b) => cmp(a.id, b.id)),
      s.nodes,
    );
    assert.deepEqual(
      selected.edges.toSorted((a, b) => cmp(a.id, b.id)),
      s.edges,
    );
    q('state coverage closure', { coverage: s.coverage, units: s.units, snapshots: s.snapshots });
  }
  assert.deepEqual(packet.history.state, packet.current);
  assert.equal(packet.expectedActivationId, packet.history.activationId);
  assert.deepEqual(packet.expectedOldBasis, packet.history.state.basis);
}
function derive(packet, a, charged) {
  const old = packet.history.state,
    target = packet.target,
    q = (label, v) => (charged ? a.q(label, v) : v);
  for (const v of [
    old.inventory,
    target.inventory,
    target.inventory,
    old.contracts,
    target.contracts,
    old.units,
  ])
    q('scope declaration', v);
  const oldById = new Map(old.inventory.map((f) => [f.id, f])),
    nextById = new Map(target.inventory.map((f) => [f.id, f]));
  const diff = [...new Set([...oldById.keys(), ...nextById.keys()])].sort(cmp).map((id) => {
    const before = oldById.get(id) || null,
      after = nextById.get(id) || null;
    return a.q('Source diff', {
      kind:
        before === null
          ? 'ADDED'
          : after === null
            ? 'REMOVED'
            : C(before) === C(after)
              ? 'UNCHANGED'
              : 'MODIFIED',
      before,
      after,
    });
  });
  const changed = diff.filter((d) => d.kind !== 'UNCHANGED').map((d) => (d.before || d.after).id);
  q('changed Source ids', changed);
  const contractsSame = (id) =>
    C(old.contracts.find((c) => c.providerId === id)) ===
    C(target.contracts.find((c) => c.providerId === id));
  const changedUnit = (u) =>
    !contractsSame(u.providerId) ||
    u.sourceFileIds.some((id) => changed.includes(id)) ||
    (u.kind === 'JAVA_GROUP' &&
      diff.some(
        (d) =>
          d.kind === 'ADDED' &&
          d.after.languageHint === 'java' &&
          ['SOURCE', 'TEST'].includes(d.after.classification.role),
      ));
  const projected = target.inventory.filter((f) =>
      ['SOURCE', 'TEST'].includes(f.classification.role),
    ),
    javaIds = projected
      .filter((f) => f.languageHint === 'java')
      .map((f) => f.id)
      .sort(cmp),
    pyIds = projected
      .filter((f) => f.languageHint === 'python')
      .map((f) => f.id)
      .sort(cmp);
  q('Java partition', javaIds);
  q('Python partition', pyIds);
  const priorJava = old.units.find((u) => u.providerId === 'native' && u.kind === 'JAVA_GROUP'),
    required = [];
  if (
    javaIds.length &&
    (!contractsSame('native') ||
      C(priorJava?.sourceFileIds || []) !== C(javaIds) ||
      (priorJava && changedUnit(priorJava)))
  )
    required.push({ kind: 'JAVA_GROUP', ids: javaIds, oldId: priorJava?.id || null });
  for (const id of pyIds) {
    const u = old.units.find(
      (u) => u.providerId === 'native' && u.kind === 'PYTHON_FILE' && u.sourceFileIds[0] === id,
    );
    if (!u || changedUnit(u))
      required.push({ kind: 'PYTHON_FILE', ids: [id], oldId: u?.id || null });
  }
  q('required observation descriptors', required);
  return {
    diff,
    required,
    changedUnit,
    unchanged:
      changed.length === 0 &&
      C(old.contracts) === C(target.contracts) &&
      target.source.contentFingerprint === old.basis.contentFingerprint,
  };
}
export function modelDeclaredHistoryScope(packet) {
  const a = accounting();
  assert.equal(packet.observation, null);
  prepare(packet, a, false);
  const d = derive(packet, a, false),
    requiredUnits = d.required.map((r) =>
      a.q('required observation unit', {
        kind: r.kind,
        sourceFileIds: r.ids,
        previousUnitId: r.oldId,
      }),
    ),
    removedSourceFileIds = d.diff
      .filter((v) => v.kind === 'REMOVED')
      .map((v) => v.before.id)
      .sort(cmp);
  a.q('complete removed Source ids', removedSourceFileIds);
  const result = {
    kind: 'DECLARED_NATIVE_OBSERVATION_SCOPE',
    mode: d.required.length ? 'OBSERVATION_REQUIRED' : d.unchanged ? 'NO_OP' : 'NO_OBSERVATION',
    targetSource: packet.target.source,
    diff: d.diff,
    requiredUnits,
    removedSourceFileIds,
    provenance: { kind: 'DECLARED_INPUT', historyActivationId: packet.history.activationId },
  };
  a.q('complete declared observation scope', result);
  return a.finish(result);
}
export function modelNoObservationSupportCandidate(packet) {
  assert.equal(packet.observation, null);
  return modelHistorySupportCandidate(packet);
}
export function modelHistorySupportCandidate(packet) {
  const a = accounting();
  prepare(packet, a, true);
  const d = derive(packet, a, true),
    o = packet.observation;
  if (o) assert.equal(o.units.length, d.required.length);
  else assert.equal(d.required.length, 0);
  let fresh = [];
  if (o) {
    a.q('observed units/inventory', { units: o.units, inventory: packet.target.inventory });
    const group = [...o.observation.nodes, ...o.observation.edges].map((v) => ({
      factType: v.provider.factType,
      canonical: v.canonical,
      binding: { providerFact: v.provider },
    }));
    fresh = collect({ basis: packet.target.source }, group, o.observation.snapshot, a, true);
    a.q('fresh coverage closure', {
      coverage: o.coverage,
      units: o.units,
      snapshots: [o.observation.snapshot],
    });
    a.q('fresh support dependencies', o.supportDependencies);
    for (const v of o.supportDependencies) {
      const support = fresh.find((s) => ref(s.binding.providerFact) === ref(v.providerFact));
      assert.ok(support);
      a.q('fresh dependency closure', {
        canonical: support.canonical,
        binding: support.binding,
        dependencyUnitIds: v.unitIds,
        units: o.units,
      });
    }
  }
  for (const v of fresh) a.q('fresh reference lookup', [ref(v.binding.providerFact), v]);
  const old = packet.history.state,
    survivors = old.supports.filter(
      (v) =>
        v.binding.providerFact.providerId !== 'native' ||
        v.dependencyUnitIds.every((id) => !d.changedUnit(old.units.find((u) => u.id === id))),
    );
  const supportDecisions = old.supports
      .map((s) =>
        a.q('support transition decision', {
          evidenceId: s.evidence.id,
          action: survivors.includes(s)
            ? 'RETAIN'
            : fresh.some((v) => ref(v.binding.providerFact) === ref(s.binding.providerFact))
              ? 'SUPERSEDE'
              : 'INVALIDATE',
          replacementEvidenceId: survivors.includes(s)
            ? null
            : fresh.find((v) => ref(v.binding.providerFact) === ref(s.binding.providerFact))
                ?.evidence.id || null,
        }),
      )
      .sort((a, b) => cmp(a.evidenceId, b.evidenceId)),
    addedEvidenceIds = fresh.map((v) => a.q('added evidence id', v.evidence.id)).sort(cmp),
    facts = new Map();
  for (const s of [...survivors, ...fresh]) {
    const f = { factType: s.factType, id: s.canonical.id },
      key = JSON.stringify([f.factType, f.id]);
    if (!facts.has(key)) facts.set(key, a.q('surviving fact', f));
  }
  const survivingFactKeys = [...facts.values()].sort(
      (a, b) => cmp(a.factType, b.factType) || cmp(a.id, b.id),
    ),
    coverageOrigins = [
      ...old.coverage.filter((v) => !d.changedUnit(old.units.find((u) => u.id === v.unitId))),
      ...(o?.coverage || []),
    ]
      .map((v) => a.q('retained coverage origin', v))
      .sort((a, b) => cmp(a.unitId, b.unitId) || cmp(a.facet, b.facet)),
    syntaxRequirements = old.syntaxOrigins
      .map((v) =>
        a.q('Syntax transition requirement', {
          originId: v.id,
          action: d.changedUnit(old.units.find((u) => u.id === v.unitId))
            ? 'RETIRE_ORIGIN'
            : 'REVALIDATE_FINAL_BASIS',
        }),
      )
      .sort((a, b) => cmp(a.originId, b.originId));
  const historyDigest = a.digest('declared prior history', packet.history),
    ledger = {
      historyDigest,
      expectedActivationId: packet.expectedActivationId,
      expectedOldBasis: packet.expectedOldBasis,
      target: packet.target,
      observation: o,
      diff: d.diff,
      supportDecisions,
      addedEvidenceIds,
      survivingFactKeys,
      coverageOrigins,
      syntaxRequirements,
    };
  const transition = {
    kind: d.unchanged && !o ? 'NO_OP_DRAFT' : 'TRANSITION_DRAFT',
    activationId: packet.history.activationId,
    oldBasis: old.basis,
    targetSource: packet.target.source,
    historyDigest,
    ledgerDigest: a.digest('transition ledger identity', ledger),
    diff: d.diff,
    supportDecisions,
    addedEvidenceIds,
    survivingFactKeys,
    coverageOrigins,
    syntaxRequirements,
  };
  a.q('complete transition draft', transition);
  a.q('candidate support decisions', supportDecisions);
  a.q('old candidate supports', old.supports);
  const active = survivors.map((v) => a.q('retained active support', v));
  if (o) {
    a.q('candidate observation dependencies', o.supportDependencies);
    const rebuilt = collect(
      { basis: packet.target.source },
      [...o.observation.nodes, ...o.observation.edges].map((v) => ({
        factType: v.provider.factType,
        canonical: v.canonical,
        binding: { providerFact: v.provider },
      })),
      o.observation.snapshot,
      a,
      true,
    );
    fresh = rebuilt.map(({ inputPath, ...v }) => {
      const dependencyUnitIds = o.supportDependencies.find(
          (d) => ref(d.providerFact) === ref(v.binding.providerFact),
        ).unitIds,
        valueDigest = a.digest('fresh support candidate identity', {
          kind: 'DECLARED_HISTORY_CANDIDATE_V1',
          candidate: v.canonical,
        }),
        support = { ...v, dependencyUnitIds, valueDigest };
      a.q('new active support', support);
      active.push(support);
      return support;
    });
  }
  active.sort(
    (a, b) =>
      cmp(a.factType, b.factType) ||
      cmp(a.binding.providerFact.providerId, b.binding.providerFact.providerId) ||
      cmp(a.binding.providerFact.providerFactId, b.binding.providerFact.providerFactId) ||
      cmp(a.evidence.id, b.evidence.id),
  );
  for (const s of active) {
    a.q('active evidence id', s.evidence.id);
    a.q('active Provider reference', ref(s.binding.providerFact));
  }
  for (const v of fresh) a.q('candidate fresh reference lookup', [ref(v.binding.providerFact), v]);
  const refs = new Map();
  for (const s of active) {
    const f = { factType: s.factType, id: s.canonical.id },
      key = JSON.stringify([f.factType, f.id]);
    a.q('active fact lookup', [key, f]);
    refs.set(key, f);
  }
  const actualRefs = [...refs.values()].sort(
    (a, b) => cmp(a.factType, b.factType) || cmp(a.id, b.id),
  );
  a.q('actual surviving references', actualRefs);
  assert.deepEqual(actualRefs, survivingFactKeys);
  for (const v of [
    packet.target.inventory,
    old.inventory,
    old.contracts,
    packet.target.contracts,
    o?.units || [],
  ])
    a.q('dependency selection declaration', v);
  const units = [
    ...old.units.filter(
      (u) =>
        !o?.units.some((v) => v.id === u.id) &&
        u.sourceFileIds.some((id) => packet.target.inventory.some((f) => f.id === id)),
    ),
    ...(o?.units || []),
  ]
    .map((u) => a.q('retained unit selection', u))
    .sort((a, b) => cmp(a.id, b.id));
  for (const u of units) a.q('complete dependency unit', u);
  a.q('origin snapshot registry declaration', [
    ...old.snapshots,
    ...(o ? [o.observation.snapshot] : []),
  ]);
  const registry = [...old.snapshots, ...(o ? [o.observation.snapshot] : [])].toSorted((a, b) =>
    cmp(a.id, b.id),
  );
  for (const s of registry) a.q('origin snapshot registry entry', s);
  a.q(
    'active node references',
    active.filter((s) => s.factType === 'NODE').map((s) => s.canonical.id),
  );
  for (const s of active) {
    const f = s.canonical;
    if (f.sourceRange)
      a.q('source range role', {
        evidenceId: s.evidence.id,
        role: 'SOURCE_RANGE',
        id: f.sourceRange.sourceFileId,
      });
    a.q('active support dependency closure', {
      canonical: f,
      binding: s.binding,
      dependencyUnitIds: s.dependencyUnitIds,
      units,
    });
    if (s.factType === 'EDGE') {
      a.q('edge source role', { evidenceId: s.evidence.id, role: 'EDGE_SOURCE', id: f.source.id });
      if (f.target.state === 'RESOLVED')
        a.q('edge target role', {
          evidenceId: s.evidence.id,
          role: 'EDGE_TARGET',
          id: f.target.target.id,
        });
      else
        for (const n of f.target.candidates)
          a.q('edge candidate role', {
            evidenceId: s.evidence.id,
            role: 'EDGE_CANDIDATE',
            id: n.id,
          });
    }
  }
  const selectorInput = active.map((s, i) => ({ ...s, inputPath: ['activeSupports', i] }));
  a.q('complete active selector input', selectorInput);
  const selected = select(selectorInput, a, true);
  a.q('complete active evidence ordering', active);
  const rows = active.toSorted((a, b) => cmp(a.evidence.id, b.evidence.id)),
    selectedRefs = [
      ...selected.nodes.map((n) => ({ factType: 'NODE', id: n.id })),
      ...selected.edges.map((n) => ({ factType: 'EDGE', id: n.id })),
    ].sort((a, b) => cmp(a.factType, b.factType) || cmp(a.id, b.id));
  a.q('complete selected references', selectedRefs);
  assert.deepEqual(selectedRefs, actualRefs);
  for (const exp of selected.explanations) {
    a.q('explained fact key', JSON.stringify([exp.fact.factType, exp.fact.id]));
    const group = rows.filter(
      (s) => s.factType === exp.fact.factType && s.canonical.id === exp.fact.id,
    );
    a.q('original explanation group', group);
    a.q(
      'original support summaries',
      group.map((s) => ({
        evidenceId: s.evidence.id,
        confidence: s.canonical.confidence,
        resolution: s.factType === 'EDGE' ? s.canonical.target.resolution : null,
      })),
    );
  }
  const merged = {
    ...selected,
    evidence: rows.map((v) => v.evidence),
    factEvidence: rows.map((v) => v.factEvidence),
    bindings: rows.map((v) => v.binding),
  };
  a.q('complete delta merged facts', merged);
  const result = {
    kind: 'DECLARED_DELTA_SUPPORT_CANDIDATE',
    mode: d.unchanged && !o ? 'NO_OP' : 'TRANSITION',
    targetSource: packet.target.source,
    inventory: packet.target.inventory,
    transition,
    activeSupports: active,
    dependencyUnits: units,
    merged,
    originSnapshotRegistry: registry,
    provenance: {
      kind: 'DECLARED_INPUT',
      historyDigest,
      ledgerDigest: transition.ledgerDigest,
      observation: o
        ? { requestIdentity: o.requestIdentity, outputIdentity: o.outputIdentity }
        : null,
    },
  };
  a.q('complete delta candidate', result);
  return a.finish(result);
}
