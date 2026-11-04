import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical } from './independent-history-resource-model.mjs';
import { modelNonemptyRawDecoder } from './independent-nonempty-raw-decoder-resource-model.mjs';
import { modelJavaOwner } from './independent-java-owner-resource-model.mjs';
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  refKey = (r) => JSON.stringify([r.factType, r.providerId, r.providerFactId]);
/** Successful full raw pipeline for the three frozen Java/Python cases; input-only reference, no product imports. */
export function modelNonemptyFullProvider(target, raw) {
  let bytes = 0n,
    items = 0n,
    depth = 0;
  const ledger = [],
    record = (label, ni, nb, d = 0) => {
      items += BigInt(ni);
      bytes += BigInt(nb);
      depth = Math.max(depth, d);
      ledger.push({ label, items: Number(ni), serializedBytes: Number(nb), depth: d });
    },
    q = (label, v) => {
      const m = measures(v);
      record(label, m.nodes, Buffer.byteLength(JSON.stringify(v)), m.depth);
      return v;
    },
    tuple = (domain, fields) => {
      const wire =
        domain + '\0' + fields.map((f) => Buffer.byteLength(String(f)) + ':' + f).join('');
      record(
        'tuple ' + domain,
        fields.length + 2,
        Buffer.byteLength(wire) + Buffer.byteLength(domain) + 1 + 64,
      );
      return domain + ':' + sha(wire);
    },
    importLedger = (prefix, steps) => {
      for (const s of steps) record(prefix + ' ' + s.label, s.items, s.serializedBytes, s.depth);
    };
  q('full target encoding', target);
  q('full target owned', target);
  q('full target schema', target);
  record(
    'outer raw copy representations',
    0,
    2 * (Buffer.byteLength(raw.requestText) + Buffer.byteLength(raw.outputText)),
  );
  const m = structuredClone(raw.metadata);
  q('metadata encoding', m);
  q('metadata owned', m);
  q('metadata schema', m);
  const decoder = modelNonemptyRawDecoder(raw);
  importLedger('decoder', decoder.ledger);
  const c = decoder.result.observation,
    p = c.request.payload;
  q('admitted Code Syntax', c);
  if (m.java)
    for (const v of [m.java.request, ...m.java.events])
      record('Java hard JSON', 0, Buffer.byteLength(JSON.stringify(v)));
  const projected = target.inventory.filter((f) =>
      ['SOURCE', 'TEST'].includes(f.classification.role),
    ),
    javaFiles = projected.filter((f) => f.languageHint === 'java'),
    pythonFiles = projected.filter((f) => f.languageHint === 'python');
  const capabilities = [
      ...(m.java ? ['JAVA_CODE_V2'] : []),
      ...(pythonFiles.length ? ['PYTHON_SYNTAX_CODE_V1'] : []),
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
    ].map((name) => ({ name, support: 'SUPPORTED', coverage: 'COMPLETE' })),
    diagnostics = [...(m.java?.events ?? []), ...c.events]
      .filter((e) => e.type === 'DIAGNOSTIC')
      .map((e) => e.payload),
    snapshot = {
      ...m.snapshot,
      repositoryId: target.source.repositoryId,
      requestedRevisionId: target.source.revisionId,
      requestedRevisionFingerprint: target.source.contentFingerprint,
      capabilities,
      diagnostics,
      outcome: 'SUCCEEDED',
    };
  q('complete snapshot', snapshot);
  let javaPairs = [];
  if (m.java) {
    const j = m.java,
      stream = { request: j.request, events: j.events };
    q('Java normalization stream', stream);
    q('Java parsed normalization stream', stream);
    for (const f of j.request.payload.sourceFiles) q('Java source lookup', [f.id, f]);
    if (j.events.some((e) => e.type === 'EDGE'))
      throw Error('closed full Provider Java edges excluded');
    const owner = modelJavaOwner({
        target,
        scope: { units: [], removedSourceFileIds: [] },
        javaRows: m,
      }),
      normalization = owner.ledger.filter(
        (s) =>
          s.label.startsWith('normalizer ') ||
          s.label.startsWith('canonical draft') ||
          s.label.startsWith('provider tuple ') ||
          s.label === 'factKey array' ||
          s.label.startsWith('final canonical') ||
          s.label.startsWith('final schema'),
      );
    // Java owner normalizer derivation is reused; its Runtime ownership/receipt costs are deliberately excluded.
    let cursor = 0;
    for (const e of j.events.filter((e) => e.type === 'NODE')) {
      q('Java seen Provider fact id', e.payload.providerFactId);
      const group = [];
      do {
        group.push(normalization[cursor++]);
      } while (
        group.at(-1)?.label !== 'final schema representation' &&
        cursor < normalization.length
      );
      if (group.at(-1)?.label !== 'final schema representation')
        throw Error('incomplete independent Java normalizer ledger');
      importLedger('Java node', group);
      const node = owner.result.nodes.find(
          (n) => n.providerNode.providerFactId === e.payload.providerFactId,
        ),
        pair = {
          provider: {
            factType: 'NODE',
            providerId: e.payload.providerId,
            providerFactId: e.payload.providerFactId,
          },
          canonical: node.canonicalNode,
        };
      q('Java normalized pair', pair);
      q('Java canonical lookup', [e.payload.providerFactId, node.canonicalNode]);
      javaPairs.push(pair);
    }
    for (const pair of javaPairs)
      q(
        'Java normalized ordering key',
        pair.canonical.factKey +
          '\0' +
          pair.provider.providerId +
          '\0' +
          pair.provider.providerFactId,
      );
    javaPairs.sort((a, b) =>
      compare(
        a.canonical.factKey + '\0' + a.provider.providerId + '\0' + a.provider.providerFactId,
        b.canonical.factKey + '\0' + b.provider.providerId + '\0' + b.provider.providerFactId,
      ),
    );
    for (const pair of javaPairs)
      q('Java canonical reference lookup', [
        pair.provider.providerFactId,
        { factType: 'NODE', id: pair.canonical.id },
      ]);
    q('Java normalized result', { nodes: javaPairs, edges: [] });
  }
  const start = decoder.ledger.findIndex((s) => s.label === 'Python input'),
    end = decoder.ledger.findIndex((s) => s.label === 'Python normalized pairs');
  importLedger('projection', decoder.ledger.slice(start, end + 1));
  const normalized = {
    nodePairs: [...javaPairs, ...decoder.normalized.nodePairs],
    edgePairs: decoder.normalized.edgePairs,
  };
  q('combined normalization', normalized);
  const observed = { snapshot, nodes: normalized.nodePairs, edges: normalized.edgePairs };
  const collect = (label) => {
    const input = {
      repositoryId: target.source.repositoryId,
      revisionId: target.source.revisionId,
      observations: [observed],
    };
    q(label + ' input', input);
    q(label + ' parsed', input);
    q(label + ' observation path', ['observations', 0]);
    q(label + ' provider', snapshot.providerId);
    q(label + ' snapshot', snapshot.id);
    const supports = [];
    for (const [factType, field] of [
      ['NODE', 'nodes'],
      ['EDGE', 'edges'],
    ])
      for (const [i, pair] of observed[field].entries()) {
        const inputPath = ['observations', 0, field, i];
        q(label + ' fact path', inputPath);
        const unique = [
          snapshot.id,
          factType,
          pair.provider.providerId,
          pair.provider.providerFactId,
        ];
        q(label + ' unique fields', unique);
        q(label + ' unique key', JSON.stringify(unique));
        const fields = [target.source.repositoryId, target.source.revisionId, ...unique];
        q(label + ' evidence fields', fields);
        const evidenceId = tuple('provider-evidence-v1', fields),
          fact = { factType, id: pair.canonical.id };
        q(label + ' canonical reference', fact);
        const evidence = {
            id: evidenceId,
            repositoryId: target.source.repositoryId,
            revisionId: target.source.revisionId,
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
        for (const [name, v] of [
          ['evidence', evidence],
          ['fact evidence', factEvidence],
          ['binding', binding],
        ]) {
          q(label + ' ' + name, v);
          q(label + ' parsed ' + name, v);
        }
        const support = {
          factType,
          canonical: pair.canonical,
          snapshotId: snapshot.id,
          inputPath,
          evidence,
          factEvidence,
          binding,
        };
        q(label + ' support', support);
        supports.push(support);
      }
    q(label + ' supports', supports);
    return supports;
  };
  const supports = collect('projection collection');
  q('merge selection supports', supports);
  for (const s of supports) {
    const f = s.canonical,
      fields = [f.repositoryId, f.revisionId, s.factType, f.factKey],
      key = JSON.stringify(fields);
    q('merge grouping fields', fields);
    q('merge grouping key', key);
    q('merge canonical identity key', [s.factType + ':' + f.id, key]);
    q('merge grouping support', s);
  }
  const nodes = [],
    edges = [],
    explanations = [];
  if (new Set(supports.map((s) => s.factType + ':' + s.canonical.id)).size !== supports.length)
    throw Error('closed full Provider requires unique supports');
  for (const s of supports) {
    const f = s.canonical,
      identity =
        s.factType === 'NODE'
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
    q('merge identity', identity);
    q('merge compared identity', identity);
    q('merge ordered group', [s]);
    q('merge confidence scores', [f.confidence.score]);
    q('merge fact draft', f);
    q('merge parsed fact', f);
    q('merge evidence ordering group', [s]);
    const summary = {
      evidenceId: s.evidence.id,
      confidence: f.confidence,
      resolution: s.factType === 'EDGE' ? f.target.resolution : null,
    };
    q('merge support summary', summary);
    q('merge conflict categories', []);
    const explanation = {
      fact: { factType: s.factType, id: f.id },
      selectedEvidenceId: s.evidence.id,
      supports: [summary],
      selectionRule: 'SINGLE_SUPPORT',
      conflicts: [],
    };
    q('merge explanation', explanation);
    q('merge group result', { fact: f, explanation });
    q('merge selected input path', [s.factType + ':' + f.id, s.inputPath]);
    q('merge selected fact', f);
    q('merge selected explanation', explanation);
    (s.factType === 'NODE' ? nodes : edges).push(f);
    explanations.push(explanation);
  }
  nodes.sort((a, b) => compare(a.factKey, b.factKey));
  edges.sort((a, b) => compare(a.factKey, b.factKey));
  for (const e of explanations)
    q('merge explanation ordering key', e.fact.factType + ':' + e.fact.id);
  explanations.sort((a, b) =>
    compare(a.fact.factType + ':' + a.fact.id, b.fact.factType + ':' + b.fact.id),
  );
  q(
    'merge selected node ids',
    nodes.map((n) => n.id),
  );
  const selected = { nodes, edges, explanations };
  q('merge selected result', selected);
  q('merge canonical supports', supports);
  const ordered = [...supports].sort((a, b) => compare(a.evidence.id, b.evidence.id)),
    merged = {
      ...selected,
      evidence: ordered.map((s) => s.evidence),
      factEvidence: ordered.map((s) => s.factEvidence),
      bindings: ordered.map((s) => s.binding),
    };
  q('merged complete result', merged);
  const candidate = {
    kind: 'NATIVE_PROJECTION_CANDIDATE',
    snapshot,
    normalized,
    merged,
    codeSyntax: c,
    scope: {
      inventory: m.inventory,
      nativeSourceFileIds: p.sourceFiles.map((f) => f.id),
      capabilities: capabilities.map((v) => v.name),
    },
    provenance: {
      tool: m.tool,
      java: m.java
        ? {
            kind: 'PARSED_V2',
            requestId: m.java.request.requestId,
            startedAt: m.java.startedAt,
            settledAt: m.java.settledAt,
          }
        : null,
      codeSyntax: {
        kind: 'RAW_V5',
        requestId: c.request.requestId,
        startedAt: m.codeSyntax.startedAt,
        settledAt: m.codeSyntax.settledAt,
        requestChecksum: c.requestChecksum,
        outputChecksum: sha(raw.outputText),
        terminalChecksum: c.checksum,
      },
    },
  };
  q('projection candidate', candidate);
  q('history projection bridge', { candidate, metadata: m, java: m.java });
  q('complete inventory equality', [m.inventory, target.inventory]);
  const admitted = {
    kind: 'DECLARED_FULL_RAW_OBSERVATION',
    metadata: m,
    java: m.java,
    codeSyntax: c,
    provenance: {
      kind: 'DECLARED_INPUT',
      requestIdentity: c.requestChecksum,
      outputIdentity: sha(raw.outputText),
    },
  };
  q('admitted raw', admitted);
  q('full partitions', [projected, javaFiles, pythonFiles]);
  const descriptors = [
    ...(javaFiles.length
      ? [
          {
            kind: 'JAVA_GROUP',
            sourceFileIds: javaFiles.map((f) => f.id).sort(compare),
            previousUnitId: null,
          },
        ]
      : []),
    ...pythonFiles.map((f) => ({
      kind: 'PYTHON_FILE',
      sourceFileIds: [f.id],
      previousUnitId: null,
    })),
  ];
  q('required units', descriptors);
  q('existing units', []);
  const units = descriptors
    .map((d) => {
      q('unit descriptor', d);
      const fields = [
        target.source.repositoryId,
        target.source.revisionId,
        target.repositoryLocatorDigest,
        'native',
        d.kind,
        ...(d.kind === 'PYTHON_FILE' ? d.sourceFileIds : []),
      ];
      q('new unit identity fields', fields);
      const id = tuple('history-native-unit-v1', fields);
      q('new unit id', id);
      const unit = { id, providerId: 'native', kind: d.kind, sourceFileIds: d.sourceFileIds };
      q('new unit', unit);
      return unit;
    })
    .sort((a, b) => compare(a.id, b.id));
  q('assembled units', units);
  q('assembled normalized', normalized);
  for (const pair of [...normalized.nodePairs, ...normalized.edgePairs]) {
    q('assembled Provider identity', pair.provider.providerFactId);
    q('assembled Canonical identity', pair.canonical.id);
  }
  q('assembled diagnostics', diagnostics);
  q('assembled capabilities', capabilities);
  q('assembled snapshot draft', snapshot);
  q('assembled parsed snapshot', snapshot);
  for (const f of target.inventory) q('full Source lookup', [f.id, f]);
  const allRaw = [...(m.java?.events ?? []), ...c.events];
  for (const e of allRaw.filter((e) => ['NODE', 'EDGE'].includes(e.type))) {
    const key = refKey({
      factType: e.type,
      providerId: e.payload.providerId,
      providerFactId: e.payload.providerFactId,
    });
    q('original Provider identity', key);
    q('original Provider lookup', [key, e.payload]);
  }
  const dependencies = [...normalized.nodePairs, ...normalized.edgePairs]
    .map((pair) => {
      const original = allRaw.find(
          (e) =>
            e.type === pair.provider.factType &&
            e.payload.providerId === pair.provider.providerId &&
            e.payload.providerFactId === pair.provider.providerFactId,
        ).payload,
        unit = units.find((u) =>
          original.providerKind.startsWith('java.')
            ? u.kind === 'JAVA_GROUP'
            : u.kind === 'PYTHON_FILE' && u.sourceFileIds[0] === original.sourceRange.sourceFileId,
        ),
        d = { providerFact: pair.provider, unitIds: [unit.id] };
      q('support dependency', d);
      return d;
    })
    .sort(
      (a, b) =>
        compare(a.providerFact.factType, b.providerFact.factType) ||
        compare(a.providerFact.providerId, b.providerFact.providerId) ||
        compare(a.providerFact.providerFactId, b.providerFact.providerFactId),
    );
  const coverage = [];
  for (const u of units)
    for (const facet of [
      'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      u.kind === 'JAVA_GROUP' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
    ]) {
      const row = { unitId: u.id, facet, originSnapshotId: snapshot.id, coverage: 'COMPLETE' };
      q('unit coverage', row);
      coverage.push(row);
    }
  coverage.sort((a, b) => compare(a.unitId, b.unitId) || compare(a.facet, b.facet));
  const observation = {
    observation: observed,
    units,
    supportDependencies: dependencies,
    coverage,
    requestIdentity: c.requestChecksum,
    outputIdentity: sha(raw.outputText),
    settlement: 'DECLARED_SUCCEEDED',
  };
  q('complete declared observation', observation);
  const complete = collect('full support collection'),
    activeSupports = complete
      .map((s) => {
        const { inputPath, ...rest } = s,
          key = refKey(s.binding.providerFact),
          dependency = dependencies.find((d) => refKey(d.providerFact) === key);
        q('support dependency binding', [key, dependency]);
        const value = { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: s.canonical };
        q('support digest encoding', value);
        q('support digest ordered reserve', value);
        const row = {
          ...rest,
          dependencyUnitIds: dependency.unitIds,
          valueDigest: sha(historyCanonical(value)),
        };
        q('complete active support', row);
        return row;
      })
      .sort(
        (a, b) =>
          compare(a.factType, b.factType) ||
          compare(a.binding.providerFact.providerId, b.binding.providerFact.providerId) ||
          compare(a.binding.providerFact.providerFactId, b.binding.providerFact.providerFactId) ||
          compare(a.evidence.id, b.evidence.id),
      );
  const result = {
    kind: 'DECLARED_FULL_RAW_SUPPORT_CANDIDATE',
    observation,
    activeSupports,
    merged,
    raw: admitted,
  };
  q('complete full support candidate', result);
  if (bytes > BigInt(Number.MAX_SAFE_INTEGER) || items > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('unsafe independent full Provider resource cost');
  return {
    result,
    cost: { serializedBytes: Number(bytes), items: Number(items), maxDepth: depth },
    ledger,
    scope:
      'Three closed full raw Provider cases, single support per fact; not arbitrary Java/Python, DELTA, Stage, Store, Native or RSS qualification.',
  };
}
