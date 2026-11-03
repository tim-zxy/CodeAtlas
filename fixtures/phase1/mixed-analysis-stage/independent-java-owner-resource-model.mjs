import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
import { historyCanonical as C } from './independent-history-resource-model.mjs';
const B = (v) => BigInt(Buffer.byteLength(v)),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent Java owner cost');
    return Number(v);
  },
  SHA = (v) => crypto.createHash('sha256').update(v).digest('hex');
/** Closed Java class/compilation-unit fixture owner callback. Pure input-only Runtime+Provider algebra. */
export function modelJavaOwner(input) {
  let bytes = 0n,
    items = 0n,
    pin = 0n,
    depth = 0;
  const ledger = [],
    record = (label, ni, nb, np, d = 0) => {
      items += ni;
      bytes += nb;
      pin += np;
      depth = Math.max(depth, d);
      ledger.push({
        label,
        items: N(ni),
        serializedBytes: N(nb),
        retainedLogicalBytes: N(np),
        depth: d,
      });
    },
    own = (label, v, retain = true) => {
      const m = measures(v);
      record(label, m.nodes, 0n, retain ? m.weight : 0n, m.depth);
    },
    encode = (label, v) => {
      own(label + ' traverse', v, false);
      const text = C(v),
        n = B(text);
      record(label + ' encode', 0n, 2n * n, 2n * n);
      return text;
    },
    owned = (label, v) => {
      own(label, v);
      const value = JSON.parse(encode(label, v));
      own(label + ' parsed', value);
      return value;
    },
    providerBytes = (label, n) => record(label, 0n, n, n),
    q = (label, v) => {
      const m = measures(v),
        n = B(JSON.stringify(v));
      record(label, m.nodes, n, n, m.depth);
    },
    tuple = (domain, fields) => {
      const wire =
          domain +
          '\0' +
          fields.map((f) => String(Buffer.byteLength(String(f))) + ':' + String(f)).join(''),
        n = B(wire) + B(domain) + 1n + 64n;
      record('provider tuple ' + domain, BigInt(fields.length + 2), n, n);
      return domain + ':' + SHA(wire);
    };
  const r = owned('complete callback input', input),
    m = r.javaRows;
  own('metadata before schema', m);
  own('metadata after schema', m);
  const targetMetadata = { ...m, targetSource: r.target.source, inventory: r.target.inventory };
  own('target metadata before schema', targetMetadata);
  own('target metadata after schema', targetMetadata);
  for (const f of m.inventory)
    for (const value of [f.path, f.id]) {
      const n = B(value);
      record('inventory byte key', 0n, n, n);
    }
  own('metadata inventory', m.inventory);
  own('complete inventory comparison', [m.inventory, targetMetadata.inventory]);
  own('contracts and declared scope', [
    r.target.contracts,
    r.scope.units,
    r.scope.removedSourceFileIds,
  ]);
  const domain = 'codeatlas-repository-locator-v1',
    repository = m.java.request.payload.repository;
  record('locator domain', 0n, B(domain) + 1n, B(domain) + 1n);
  let transcript = domain + '\0';
  for (const frame of [
    { tag: 'LOCATOR', count: 1 },
    { key: [repository.id], value: repository },
  ]) {
    const text = encode('locator frame', frame),
      n = B(text),
      prefix = String(n) + ':';
    record('locator prefix/scratch', 0n, B(prefix), n + B(prefix));
    transcript += prefix + text;
  }
  record('locator digest pin', 0n, 0n, 64n);
  if (SHA(transcript) !== r.target.repositoryLocatorDigest)
    throw Error('independent locator mismatch');
  for (const value of [m.java.request, ...m.java.events])
    providerBytes('parsed Java hard JSON', B(JSON.stringify(value)));
  const parsed = { request: m.java.request, events: m.java.events };
  own('validated Java stream', parsed);
  const files = m.inventory.filter(
    (f) =>
      (f.classification.role === 'SOURCE' || f.classification.role === 'TEST') &&
      f.languageHint === 'java',
  );
  own('Java source lookup', files);
  const nodes = m.java.events
    .filter((e) => e.type === 'NODE')
    .map((e) => {
      const p = e.payload,
        base = {
          repositoryId: p.repositoryId,
          revisionId: p.revisionId,
          name: p.name,
          qualifiedName: p.qualifiedName,
          sourceRange: p.sourceRange,
          confidence: p.confidence,
        };
      q('normalizer input', p);
      q('normalizer parsed', p);
      q('normalizer base', base);
      let canonical, fields, fieldPaths;
      if (p.providerKind === 'java.class') {
        const range = p.sourceRange;
        canonical = { ...base, kind: 'TYPE', typeKind: 'CLASS' };
        fields = [
          p.repositoryId,
          p.revisionId,
          'TYPE',
          'CLASS',
          p.qualifiedName,
          range.sourceFileId,
          range.startLine,
          range.startColumn,
          range.endLine,
          range.endColumn,
        ];
        fieldPaths = [
          ['repositoryId'],
          ['revisionId'],
          ['providerKind'],
          ['providerKind'],
          ['qualifiedName'],
          ['sourceRange', 'sourceFileId'],
          ['sourceRange', 'startLine'],
          ['sourceRange', 'startColumn'],
          ['sourceRange', 'endLine'],
          ['sourceRange', 'endColumn'],
        ];
      } else if (p.providerKind === 'java.compilation_unit') {
        const f = files.find((f) => f.path === p.qualifiedName);
        if (!f) throw Error('independent Java source missing');
        canonical = { ...base, kind: 'MODULE', sourceRange: null };
        fields = [p.repositoryId, p.revisionId, 'MODULE', f.path];
        fieldPaths = [['repositoryId'], ['revisionId'], ['providerKind'], ['qualifiedName']];
      } else throw Error('closed Java owner model does not cover ' + p.providerKind);
      q('canonical draft fields', canonical);
      q('normalizer identity fields', fields);
      q('normalizer field paths', fieldPaths);
      const factKey = tuple('node-fact-v1', fields);
      q('factKey array', [factKey]);
      const id = tuple('canonical-node-v1', [factKey]),
        canonicalNode = { ...canonical, factKey, id };
      q('final canonical draft', canonicalNode);
      q('final schema representation', canonicalNode);
      return {
        providerNode: p,
        canonicalNode,
        sourceFileId:
          p.sourceRange?.sourceFileId ?? files.find((f) => f.path === p.qualifiedName)?.id ?? null,
      };
    });
  own('complete normalized owner nodes', nodes);
  nodes.sort((a, b) =>
    a.providerNode.providerId < b.providerNode.providerId
      ? -1
      : a.providerNode.providerId > b.providerNode.providerId
        ? 1
        : a.providerNode.providerFactId < b.providerNode.providerFactId
          ? -1
          : a.providerNode.providerFactId > b.providerNode.providerFactId
            ? 1
            : 0,
  );
  const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 },
    result = { metadata: m, nodes, usage };
  own('complete callback result', result);
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
  return {
    result,
    cost,
    ledger,
    scope:
      'Closed class + compilation-unit pure Java owner Runtime callback only; no Native execution or Stage/Store publication qualification.',
  };
}
