import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const base = new URL('./', import.meta.url);
export const cases = JSON.parse(readFileSync(new URL('inputs/cases.json', base), 'utf8')).cases;
const utf8 = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const keys = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const n = utf8(a[i], b[i]);
    if (n) return n;
  }
  return a.length - b.length;
};
// Independent literal-input authoring; no product imports or database reads.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort(utf8)
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function domain(name, groups) {
  let transcript = name + '\0';
  const append = (value) => {
    const json = canonical(value);
    transcript += Buffer.byteLength(json) + ':' + json;
  };
  for (const [tag, entries] of groups) {
    append({ tag, count: entries.length });
    for (const [key, value] of [...entries].sort((a, b) => keys(a[0], b[0])))
      append({ key, value });
  }
  return { transcript, digest: createHash('sha256').update(transcript).digest('hex') };
}
function evidenceId(fields) {
  const h = createHash('sha256').update('provider-evidence-v1\0');
  for (const field of fields) h.update(Buffer.byteLength(field) + ':' + field);
  return 'provider-evidence-v1:' + h.digest('hex');
}
export function reference(sample, rootPath = sample.repository.rootPath) {
  const locator = domain('codeatlas-repository-locator-v1', [
    ['LOCATOR', [[[sample.repository.id], { id: sample.repository.id, rootPath }]]],
  ]);
  const source =
    sample.revision === null
      ? null
      : domain('codeatlas-source-inventory-v1', [
          ['TARGET', [[[sample.revision.id], sample.revision]]],
          ['SOURCE_FILE', sample.files.map((f) => [[f.id], f])],
        ]);
  let code = null;
  const evidence = [],
    bindings = [],
    links = [],
    candidates = [];
  for (const index of sample.activeRunIndexes) {
    const run = sample.runs[index],
      s = run.snapshot;
    for (const [factType, pairs] of [
      ['NODE', run.nodes],
      ['EDGE', run.edges],
    ])
      for (const p of pairs) {
        const id = evidenceId([
          s.repositoryId,
          s.requestedRevisionId,
          s.id,
          factType,
          s.providerId,
          p.provider.providerFactId,
        ]);
        const fact = { factType, id: p.canonical.id };
        evidence.push([
          [id],
          {
            id,
            repositoryId: s.repositoryId,
            revisionId: s.requestedRevisionId,
            providerSnapshotId: s.id,
            providerFact: p.provider,
            status: 'ACTIVE',
          },
        ]);
        const key = [id, factType, fact.id];
        bindings.push([
          key,
          {
            providerFact: p.provider,
            providerSnapshotId: s.id,
            canonicalFact: fact,
            evidenceId: id,
          },
        ]);
        links.push([key, { fact, evidenceId: id }]);
        candidates.push([
          key,
          { evidenceId: id, factType, canonicalFactId: fact.id, candidate: p.canonical },
        ]);
      }
  }
  if (sample.runs.length) {
    const indexed = sample.runs.at(-1).snapshot;
    const snapshots = sample.runs.filter(
      (r) => r.snapshot.requestedRevisionId === indexed.requestedRevisionId,
    );
    const coverage = new Map();
    for (const r of snapshots)
      for (const item of r.coverage) {
        const key = [
            r.snapshot.id,
            item.capability,
            item.sourceFileId === null ? 'NONE' : 'SOURCE',
            item.sourceFileId ?? '',
            item.coverage,
          ],
          encoded = JSON.stringify(key);
        if (coverage.has(encoded)) coverage.get(encoded)[1].multiplicity++;
        else
          coverage.set(encoded, [
            key,
            {
              providerSnapshotId: r.snapshot.id,
              capabilityName: item.capability,
              sourceFileId: item.sourceFileId,
              status: item.coverage,
              multiplicity: 1,
            },
          ]);
      }
    code = domain('codeatlas-code-activation-v1', [
      [
        'HEADER',
        [
          [
            [sample.repository.id],
            {
              repositoryId: sample.repository.id,
              indexedRevisionId: indexed.requestedRevisionId,
              indexedContentFingerprint: indexed.requestedRevisionFingerprint,
              committedSnapshotCount: sample.runs.length,
            },
          ],
        ],
      ],
      ['NODE', sample.canonicalNodes.map((n) => [[n.id], n])],
      ['EDGE', sample.canonicalEdges.map((e) => [[e.id], e])],
      ['EVIDENCE', evidence],
      ['BINDING', bindings],
      ['FACT_EVIDENCE', links],
      ['SUPPORT_CANDIDATE', candidates],
      [
        'SNAPSHOT',
        snapshots.map(({ snapshot: s }) => [
          [s.id],
          {
            snapshot: {
              id: s.id,
              repositoryId: s.repositoryId,
              providerId: s.providerId,
              providerVersion: s.providerVersion,
              runtimeVersion: s.runtimeVersion,
              requestedRevisionId: s.requestedRevisionId,
              requestedRevisionFingerprint: s.requestedRevisionFingerprint,
              outcome: s.outcome,
            },
            capabilities: [...s.capabilities].sort((a, b) => utf8(a.name, b.name)),
          },
        ]),
      ],
      ['COVERAGE', [...coverage.values()]],
    ]);
  }
  const indexed = sample.runs.at(-1)?.snapshot;
  return {
    view: {
      schemaVersion: 1,
      kind: 'REPOSITORY_CODE_CAPTURE',
      repositoryId: sample.repository.id,
      repositoryLocatorDigest: locator.digest,
      activeBasis: indexed
        ? {
            repositoryId: sample.repository.id,
            revisionId: indexed.requestedRevisionId,
            contentFingerprint: indexed.requestedRevisionFingerprint,
            codeActivationDigest: code.digest,
          }
        : null,
      targetSource: sample.revision
        ? {
            repositoryId: sample.repository.id,
            revisionId: sample.revision.id,
            contentFingerprint: sample.revision.contentFingerprint,
          }
        : null,
      sourceInventoryDigest: source?.digest ?? null,
      sourceFileCount: sample.files.length,
      committedSnapshotCount: sample.runs.length,
      historicalSourceProof: 'UNAVAILABLE',
    },
    transcripts: {
      locator: locator.transcript,
      source: source?.transcript ?? null,
      code: code?.transcript ?? null,
    },
  };
}
// Fixed SQL delivery plan, independently reconstructed from literal observations.
// Every census returns one numeric row. Every selected payload adds a locator row.
function stringWeight(v) {
  if (typeof v === 'string') return Buffer.byteLength(v);
  if (Array.isArray(v)) return v.reduce((n, x) => n + stringWeight(x), 0);
  if (v && typeof v === 'object')
    return Object.entries(v).reduce((n, [k, x]) => n + Buffer.byteLength(k) + stringWeight(x), 0);
  return 0;
}
function frames(transcript) {
  if (transcript === null) return [];
  let offset = transcript.indexOf('\0') + 1;
  const list = [];
  const bytes = Buffer.from(transcript);
  offset = Buffer.byteLength(transcript.slice(0, offset));
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset),
      n = Number(bytes.subarray(offset, colon).toString());
    const json = bytes.subarray(colon + 1, colon + 1 + n).toString();
    list.push({ value: JSON.parse(json), jsonBytes: n, prefixBytes: colon - offset + 1 });
    offset = colon + 1 + n;
  }
  return list;
}
export function readPlan(sample, rootPath = sample.repository.rootPath) {
  const ref = reference(sample, rootPath),
    active = sample.runs.length > 0;
  const raw = [];
  const add = (tag, values, emitted = []) => raw.push({ tag, values, emitted });
  const repo = [sample.repository.id, rootPath];
  const last = sample.runs.at(-1)?.snapshot;
  const state = [
    sample.repository.id,
    last?.requestedRevisionId ?? null,
    last?.requestedRevisionFingerprint ?? null,
  ];
  const revision = sample.revision ? Object.values(sample.revision) : [];
  add('repository', [repo]);
  add('repository_state', [state]);
  add('revisions', sample.revision ? [revision] : []);
  const sourceRows = sample.files.map((f) => [
    f.revisionId,
    f.id,
    f.repositoryId,
    f.path,
    f.contentFingerprint,
    f.classification.role,
    f.classification.provenance,
    f.classification.contentKind,
    f.languageHint,
    f.sensitivity,
  ]);
  add('source_files', sourceRows);
  const codeFrames = frames(ref.transcripts.code);
  const codeGroups = {};
  let tag;
  for (const f of codeFrames) {
    if (f.value.tag) {
      tag = f.value.tag;
      codeGroups[tag] = [];
    } else codeGroups[tag].push(f.value.value);
  }
  const nodeRow = (n) => [
    n.revisionId,
    n.id,
    n.repositoryId,
    n.factKey,
    n.kind,
    n.typeKind ?? null,
    n.symbolKind ?? null,
    n.name,
    n.qualifiedName,
    n.sourceRange === null ? null : JSON.stringify(n.sourceRange),
    n.confidence.score,
    n.confidence.method,
    JSON.stringify(n.confidence.reasons),
  ];
  const edgeRow = (e) => [
    e.revisionId,
    e.id,
    e.repositoryId,
    e.factKey,
    e.kind,
    e.source.id,
    e.target.state,
    e.target.resolution,
    e.target.state === 'RESOLVED' ? e.target.target.id : null,
    e.sourceRange === null ? null : JSON.stringify(e.sourceRange),
    e.confidence.score,
    e.confidence.method,
    JSON.stringify(e.confidence.reasons),
  ];
  if (active) {
    add('canonical_nodes', sample.canonicalNodes.map(nodeRow));
    add('canonical_edges', sample.canonicalEdges.map(edgeRow));
    for (const e of sample.canonicalEdges)
      add(
        'unresolved_targets',
        e.target.state === 'UNRESOLVED'
          ? [[e.revisionId, e.id, e.target.originalHint, JSON.stringify(e.target.candidates)]]
          : [],
      );
    add(
      'evidence',
      codeGroups.EVIDENCE.map((e) => [
        e.id,
        e.repositoryId,
        e.revisionId,
        e.providerSnapshotId,
        e.providerFact.factType,
        e.providerFact.providerId,
        e.providerFact.providerFactId,
        e.status,
      ]),
    );
    add(
      'provider_fact_bindings',
      codeGroups.BINDING.map((b) => [
        b.providerFact.factType,
        b.providerFact.providerId,
        b.providerFact.providerFactId,
        b.providerSnapshotId,
        b.canonicalFact.id,
        b.evidenceId,
      ]),
    );
    add(
      'fact_evidence',
      codeGroups.FACT_EVIDENCE.map((l) => [l.fact.factType, l.fact.id, l.evidenceId]),
    );
    add(
      'active_support_candidates',
      codeGroups.SUPPORT_CANDIDATE.map((c) => [
        c.evidenceId,
        c.factType,
        c.canonicalFactId,
        JSON.stringify(c.candidate),
      ]),
    );
    add(
      'provider_snapshots',
      sample.runs.map(({ snapshot: s }) => [
        s.id,
        s.repositoryId,
        s.providerId,
        s.providerVersion,
        s.runtimeVersion,
        s.requestedRevisionId,
        s.requestedRevisionFingerprint,
        Date.parse(s.startedAt),
        Date.parse(s.completedAt),
        s.outcome,
      ]),
    );
    for (const r of sample.runs)
      add(
        'provider_capabilities',
        r.snapshot.capabilities.map((c) => [r.snapshot.id, c.name, c.support, c.coverage]),
      );
    add(
      'analysis_coverage',
      sample.runs.flatMap((r) =>
        r.coverage.map((c) => [r.snapshot.id, c.capability, c.sourceFileId, c.coverage]),
      ),
    );
  }
  const payloadText = raw.reduce(
    (n, g) =>
      n +
      g.values.reduce(
        (m, row) =>
          m + row.reduce((t, x) => t + (typeof x === 'string' ? Buffer.byteLength(x) : 0), 0),
        0,
      ),
    0,
  );
  const payloadRows = raw.reduce((n, g) => n + g.values.length, 0);
  const sqlRows = 43 + 1 + raw.length + 2 * payloadRows + (active ? 1 : 0); // bootstrap, committed-count, per-read census, locator+payload, coverage distinct-count
  const framedBytes = Object.values(ref.transcripts).reduce(
    (n, t) => n + (t === null ? 0 : Buffer.byteLength(t)),
    0,
  );
  const textBytes = (row) =>
    row.reduce((n, x) => n + (typeof x === 'string' ? Buffer.byteLength(x) : 0), 0);
  const headerContext =
    Buffer.byteLength(sample.repository.id) +
    textBytes(repo) +
    textBytes(state) +
    textBytes(revision) +
    stringWeight(sample.revision);
  const phases = [];
  let context = headerContext;
  const retainDomain = (kind) => {
    const transcript = ref.transcripts[kind];
    if (transcript === null) return;
    phases.push({
      phase: kind + ':domain',
      logicalUtf8: context + Buffer.byteLength(transcript.slice(0, transcript.indexOf('\0') + 1)),
    });
    let tag,
      position = 0;
    for (const f of frames(transcript)) {
      if (f.value.tag) {
        tag = f.value.tag;
        position = 0;
      }
      let rawBytes = 0;
      if (f.value.key) {
        const id = f.value.key[0];
        if (tag === 'SOURCE_FILE') rawBytes = textBytes(sourceRows.find((r) => r[1] === id));
        if (tag === 'NODE')
          rawBytes = textBytes(nodeRow(sample.canonicalNodes.find((n) => n.id === id)));
        if (tag === 'EDGE') {
          const e = sample.canonicalEdges.find((e) => e.id === id);
          rawBytes = textBytes(edgeRow(e));
          if (e.target.state === 'UNRESOLVED')
            rawBytes += textBytes([
              e.revisionId,
              e.id,
              e.target.originalHint,
              JSON.stringify(e.target.candidates),
            ]);
        }
        const tables = {
          EVIDENCE: 'evidence',
          BINDING: 'provider_fact_bindings',
          FACT_EVIDENCE: 'fact_evidence',
          SUPPORT_CANDIDATE: 'active_support_candidates',
        };
        if (tables[tag])
          rawBytes = textBytes(raw.find((g) => g.tag === tables[tag]).values[position]);
        if (tag === 'SNAPSHOT') {
          const run = sample.runs.find((r) => r.snapshot.id === id);
          rawBytes =
            textBytes(
              raw.find((g) => g.tag === 'provider_snapshots').values[sample.runs.indexOf(run)],
            ) +
            run.snapshot.capabilities.reduce(
              (n, c) => n + textBytes([id, c.name, c.support, c.coverage]),
              0,
            );
        }
        if (tag === 'COVERAGE') {
          const v = f.value.value;
          rawBytes = textBytes([v.providerSnapshotId, v.capabilityName, v.sourceFileId, v.status]);
        }
        position++;
      }
      phases.push({
        phase: kind + ':' + tag + (f.value.key ? ':' + JSON.stringify(f.value.key) : ':group'),
        rawTextBytes: rawBytes,
        logicalUtf8:
          context + rawBytes + 2 * stringWeight(f.value) + 2 * f.jsonBytes + f.prefixBytes,
      });
    }
    context += 64;
  };
  retainDomain('locator');
  retainDomain('source');
  retainDomain('code');
  phases.push({ phase: 'view', logicalUtf8: context + stringWeight(ref.view) });
  const peakLogicalUtf8 = Math.max(...phases.map((p) => p.logicalUtf8));
  return {
    schemaVersion: 1,
    bootstrapNumericRows: 43,
    committedCountRows: 1,
    coverageDistinctRows: active ? 1 : 0,
    reads: raw.map((g) => ({
      table: g.tag,
      censusRows: 1,
      locatorRows: g.values.length,
      payloadRows: g.values.length,
      rawTextBytes: g.values.reduce(
        (n, row) =>
          n + row.reduce((t, x) => t + (typeof x === 'string' ? Buffer.byteLength(x) : 0), 0),
        0,
      ),
    })),
    payloadRows,
    payloadTextBytes: payloadText,
    framedBytes,
    logicalReservation: { headerContextUtf8: headerContext, phases, peakLogicalUtf8 },
    limits: {
      maxRows: sqlRows,
      maxSerializedBytes: payloadText + framedBytes,
      memoryBudgetBytes: 2 * peakLogicalUtf8,
    },
  };
}
if (process.argv.includes('--write')) {
  const refs = cases.map((sample) => [sample.id, reference(sample)]);
  writeFileSync(
    new URL('expected/views.json', base),
    JSON.stringify(Object.fromEntries(refs.map(([id, r]) => [id, r.view])), null, 2) + '\n',
  );
  writeFileSync(
    new URL('expected/read-plan.json', base),
    JSON.stringify(
      Object.fromEntries(cases.map((sample) => [sample.id, readPlan(sample)])),
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    new URL('expected/transcripts.json', base),
    JSON.stringify(Object.fromEntries(refs.map(([id, r]) => [id, r.transcripts])), null, 2) + '\n',
  );
}
