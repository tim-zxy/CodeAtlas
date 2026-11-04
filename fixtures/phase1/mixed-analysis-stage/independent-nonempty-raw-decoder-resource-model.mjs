import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const tuple = (domain, fields) =>
  domain +
  ':' +
  sha(domain + '\0' + fields.map((f) => Buffer.byteLength(String(f)) + ':' + f).join(''));
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** Closed successful v5 fixture decoder. Independent arithmetic, no product imports or observed receipts. */
export function modelNonemptyRawDecoder(raw) {
  const request = JSON.parse(raw.requestText),
    events = raw.outputText.trimEnd().split('\n').map(JSON.parse),
    p = request.payload;
  if (
    !['java', 'python'].every((k) => p.sourceFiles.filter((f) => f.languageHint === k).length <= 1)
  )
    throw Error('closed decoder model allows at most one file per language');
  let bytes = 0n,
    items = 0n,
    depth = 0;
  const ledger = [],
    record = (label, ni, nb, d = 0) => {
      items += ni;
      bytes += nb;
      depth = Math.max(depth, d);
      ledger.push({ label, items: Number(ni), serializedBytes: Number(nb), depth: d });
    },
    q = (label, v) => {
      const m = measures(v);
      record(label, m.nodes, BigInt(Buffer.byteLength(JSON.stringify(v))), m.depth);
    },
    visit = (label) => record(label, 1n, 0n),
    keyFor = (r) => {
      const key = JSON.stringify([r.providerId, r.providerFactId]);
      q('correspondence provider reference key', key);
      return key;
    },
    refs = (v) => {
      visit('reference recursive visit');
      if (v === null || typeof v !== 'object') return;
      if (!Array.isArray(v) && v.factType === 'NODE') {
        keyFor(v);
        return;
      }
      for (const child of Object.values(v)) refs(child);
    },
    line = (label, v) => {
      const m = measures(v);
      record(label + ' JSON preflight', m.nodes, 0n, m.depth);
      q(label + ' decoded', v);
      q(label + ' schema', v);
    };
  record('raw request copy and UTF8 decode', 0n, 2n * BigInt(Buffer.byteLength(raw.requestText)));
  line('request', request);
  const { codeContract, ...commonPayload } = p,
    common = {
      protocolVersion: 4,
      requestId: request.requestId,
      sequence: 0,
      type: 'OBSERVE_SYNTAX',
      payload: commonPayload,
    };
  q('common payload', commonPayload);
  q('common request', common);
  q('parsed common request', common);
  record('raw output copy and UTF8 decode', 0n, 2n * BigInt(Buffer.byteLength(raw.outputText)));
  for (const [i, e] of events.entries()) line('event ' + i, e);
  q('all events', events);
  q('correspondence', { request, events });
  const nodes = events.filter((e) => e.type === 'NODE').map((e) => e.payload),
    edges = events.filter((e) => e.type === 'EDGE').map((e) => e.payload),
    syntax = events.filter((e) => e.type === 'SYNTAX_OBSERVATION').map((e) => e.payload);
  for (const owner of p.owners) keyFor(owner.providerNodeRef);
  for (const n of nodes)
    keyFor({ factType: 'NODE', providerId: n.providerId, providerFactId: n.providerFactId });
  for (const e of events) {
    const v = e.payload;
    if (e.type === 'EDGE') refs(v);
    if (e.type === 'SYNTAX_OBSERVATION') {
      q('syntax identity', v.providerSyntaxId);
      refs(v);
    }
    if (e.type === 'CODE_COVERAGE')
      q('code coverage keyed record', {
        key: JSON.stringify([v.sourceFileId, v.facet]),
        coverage: v,
      });
    if (e.type === 'SYNTAX_COVERAGE') q('syntax covered source identity', v.sourceFileId);
  }
  const pythonInput = {
    targetSource: p.targetSource,
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    nodes,
    edges,
  };
  q('Python input', pythonInput);
  q('Python parsed input', pythonInput);
  for (const k of ['sourceFiles', 'nodes', 'edges']) q('Python ' + k, pythonInput[k]);
  const nodePairs = nodes.map((n) => {
    if (n.providerKind !== 'python.module') throw Error('closed decoder Python node kind');
    const f = p.sourceFiles.find((f) => f.id === n.sourceRange.sourceFileId),
      fields = [p.targetSource.repositoryId, p.targetSource.revisionId, 'MODULE', f.path],
      factKey = tuple('node-fact-v1', fields),
      id = tuple('canonical-node-v1', [factKey]);
    q('Python node fields', fields);
    q('Python node fact key', factKey);
    q('Python canonical node id', id);
    const canonical = {
        id,
        factKey,
        repositoryId: n.repositoryId,
        revisionId: n.revisionId,
        name: n.name,
        qualifiedName: n.qualifiedName,
        sourceRange: null,
        confidence: n.confidence,
        kind: 'MODULE',
      },
      pair = {
        provider: { factType: 'NODE', providerId: n.providerId, providerFactId: n.providerFactId },
        canonical,
      };
    q('Python node pair', pair);
    return pair;
  });
  const edgePairs = edges.map((e) => {
    if (
      !['python.import', 'python.reference'].includes(e.providerKind) ||
      e.target.state !== 'UNRESOLVED' ||
      e.target.candidates.length
    )
      throw Error('closed decoder Python edge kind');
    q('Python edge input', e);
    const source = nodePairs.find(
        (n) => n.provider.providerFactId === e.source.providerFactId,
      ).canonical,
      r = e.sourceRange,
      kind = e.providerKind === 'python.import' ? 'IMPORT' : 'REFERENCE',
      fields = [
        e.repositoryId,
        e.revisionId,
        kind,
        source.factKey,
        r.sourceFileId,
        r.startLine,
        r.startColumn,
        r.endLine,
        r.endColumn,
        'UNRESOLVED',
        e.target.originalHint,
      ],
      factKey = tuple('edge-fact-v1', fields),
      id = tuple('canonical-edge-v1', [factKey]);
    const canonical = {
        id,
        factKey,
        repositoryId: e.repositoryId,
        revisionId: e.revisionId,
        kind,
        source: { factType: 'NODE', id: source.id },
        target: structuredClone(e.target),
        sourceRange: r,
        confidence: e.confidence,
      },
      pair = {
        provider: { factType: 'EDGE', providerId: e.providerId, providerFactId: e.providerFactId },
        canonical,
      };
    q('Python edge pair', pair);
    return pair;
  });
  nodePairs.sort((a, b) => order(a.canonical.factKey, b.canonical.factKey));
  edgePairs.sort((a, b) => order(a.canonical.factKey, b.canonical.factKey));
  const normalized = { nodePairs, edgePairs };
  q('Python normalized pairs', normalized);
  for (const file of p.sourceFiles.filter((f) => f.languageHint === 'python')) {
    for (const v of [nodes, edges, syntax]) q('Python per-file complete view', v);
    const ss = syntax.filter((s) => s.sourceFileId === file.id),
      occurrences = [];
    const collect = (v, span, owner, index, path, assignment) => {
      visit('Syntax expression recursive visit');
      if (v === null || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        v.forEach((x, i) => collect(x, span, owner, index, path + '[' + i + ']', assignment));
        return;
      }
      const inner = v.sourceRange ?? span;
      if (v.kind === 'REFERENCE') {
        const o = {
          owner,
          name: v.name,
          target: v.target,
          range: inner,
          assignment: assignment && path === 'value',
          index,
          path,
          used: false,
        };
        q('Syntax reference occurrence', o);
        occurrences.push(o);
        return;
      }
      for (const [k, child] of Object.entries(v))
        collect(child, inner, owner, index, path ? path + '.' + k : k, assignment);
    };
    ss.forEach((s, i) =>
      collect(s.payload, s.sourceRange, s.owner, i, '', s.syntaxKind === 'ASSIGNMENT'),
    );
    const compatible = (e, o) => {
      if (o.used || o.owner === null) return false;
      if (keyFor(o.owner) !== keyFor(e.source)) return false;
      // This closed corpus has unique assignment/reference names; no ambiguous occurrence ranking.
      return (
        JSON.stringify(o.target) === JSON.stringify(e.target) && o.name === e.target.originalHint
      );
    };
    for (const e of edges.filter(
      (e) => e.sourceRange.sourceFileId === file.id && e.providerKind === 'python.import',
    )) {
      const match = occurrences.find(
        (o) =>
          compatible(e, o) &&
          o.assignment &&
          JSON.stringify(o.range) === JSON.stringify(e.sourceRange),
      );
      if (!match) throw Error('independent import correspondence');
      match.used = true;
    }
    const point = (a, b) =>
      a.startLine - b.startLine ||
      a.startColumn - b.startColumn ||
      a.endLine - b.endLine ||
      a.endColumn - b.endColumn;
    for (const e of edges
      .filter(
        (e) => e.sourceRange.sourceFileId === file.id && e.providerKind === 'python.reference',
      )
      .sort(
        (a, b) =>
          point(a.sourceRange, b.sourceRange) ||
          Buffer.compare(Buffer.from(a.providerFactId), Buffer.from(b.providerFactId)),
      )) {
      let selected;
      for (const o of occurrences)
        if (compatible(e, o)) {
          if (selected) throw Error('closed decoder rejects ambiguous occurrence ranking');
          selected = o;
        }
      if (!selected) throw Error('independent reference correspondence');
      selected.used = true;
    }
    if (occurrences.some((o) => !o.used)) throw Error('unused closed reference');
  }
  const terminal = events.at(-1).payload,
    observation = {
      request,
      events,
      codeOutcome: terminal.codeOutcome,
      syntaxOutcome: terminal.syntaxOutcome,
      outcome: terminal.outcome,
      counts: terminal.counts,
      checksum: terminal.checksum,
      requestChecksum: sha(raw.requestText),
    },
    result = { observation, outputIdentity: sha(raw.outputText) };
  q('validated stream wrapper', result);
  if (bytes > BigInt(Number.MAX_SAFE_INTEGER) || items > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('unsafe independent decoder cost');
  return {
    result,
    normalized,
    cost: { serializedBytes: Number(bytes), items: Number(items), maxDepth: depth },
    ledger,
    scope:
      'Closed declared v5 decoder only; no authenticity, Native, Stage, Store or RSS qualification.',
  };
}
