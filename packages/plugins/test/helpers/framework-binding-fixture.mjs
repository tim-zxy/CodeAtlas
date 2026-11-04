import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL(
  '../../../../fixtures/phase1/plugin-context/binding-extraction/',
  import.meta.url,
);
export const input = JSON.parse(readFileSync(new URL('inputs.json', root)));
export const expected = JSON.parse(readFileSync(new URL('expected.json', root)));
export const ref = (id) => ({
  scope: 'REPOSITORY',
  repositoryId: 'repo:one',
  entity: { kind: 'CODE_NODE', id: 'code:' + id, revisionId: 'revision:one' },
});
export const range = (line, end = line, c = 0, ec = 10) => ({
  sourceFileId: 'file:one',
  startLine: line,
  startColumn: c,
  endLine: end,
  endColumn: ec,
});
export function contextFor(item) {
  const c = structuredClone(input.base),
    python = item.language === 'python';
  c.sourceFiles[0].languageHint = item.language;
  if (python) {
    c.nodes = c.nodes.filter((n) => n.kind !== 'TYPE');
    c.nodes[0].name = c.nodes[0].qualifiedName = c.sourceFiles[0].path = 'src/app.py';
    c.nodes[1].symbolKind = 'FUNCTION';
    c.nodes[1].qualifiedName = 'handler';
  }
  if (item.nested) {
    const n = structuredClone(c.nodes.find((n) => n.id === 'code:function'));
    n.id = 'code:inner';
    n.factKey = 'code-key:inner';
    n.name = n.qualifiedName = 'inner';
    n.sourceRange = range(60, 90);
    c.nodes.push(n);
  }
  c.supportInventory = [
    ...c.nodes.map((n) => ({ kind: 'CODE_NODE', value: n })),
    ...c.sourceFiles.map((f) => ({ kind: 'SOURCE_FILE', value: f })),
  ].map(({ kind, value }) => ({
    basis: c.basis,
    entity: { kind, id: value.id, revisionId: c.basis.revisionId },
    valueDigest: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  }));
  const scopes = [
    ['module', null, 0, 200],
    ...(!python ? [['type', 'module', 20, 180]] : []),
    ['function', python ? 'module' : 'type', 40, 100],
  ];
  if (item.nested) scopes.push(['inner', 'function', 60, 90]);
  const records = scopes.map(([name, parent, start, end]) => ({
    id: 'scope:' + name,
    kind: 'BINDING_SCOPE',
    owner: name,
    scope: name,
    line: start,
    range: range(start, end, 0, 20),
    payload: {
      scopeRef: ref(name),
      parentScopeRef: parent ? ref(parent) : null,
      status: item.partial?.includes(name) ? 'PARTIAL' : 'COMPLETE',
      limitations: item.partial?.includes(name) ? ['DECLARED_LIMITATION'] : [],
    },
  }));
  c.syntaxEvidence = [...records, ...item.records].map((r) => ({
    id: 'syntax:' + r.id,
    syntaxKey: 'declared-key:' + r.id,
    repositoryId: c.basis.repositoryId,
    revisionId: c.basis.revisionId,
    sourceFingerprint: c.sourceFiles[0].contentFingerprint,
    sourceRange: r.range ?? range(r.line),
    owner: r.owner ? ref(r.owner) : null,
    lexicalScope: r.scope ? ref(r.scope) : null,
    confidence: structuredClone(c.nodes[0].confidence),
    extractionVersion: 'declared-binding-fixture-v1',
    controlContext: r.control ?? 'UNCONDITIONAL',
    syntaxKind: r.kind,
    payload: structuredClone(r.payload),
    supportRefs: structuredClone(c.supportInventory),
  }));
  return c;
}
export const syntaxIds = (support) =>
  support
    .map((s) => {
      if (s.kind !== 'SYNTAX') throw Error('Unexpected canonical-only support');
      return s.id.slice('syntax:'.length);
    })
    .sort();
export const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
export function expectedKey(c, proposal, support, sourceRange) {
  const syntaxKeys = support
    .map((id) => c.syntaxEvidence.find((s) => s.id === 'syntax:' + id).syntaxKey)
    .sort();
  return (
    'framework-draft:' +
    createHash('sha256')
      .update(
        'codeatlas-framework-draft-v1\0' +
          canonical({ basis: c.basis, sourceRange, proposal, syntaxKeys }),
      )
      .digest('hex')
  );
}
