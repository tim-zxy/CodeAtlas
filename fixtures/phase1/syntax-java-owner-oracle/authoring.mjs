// Source-literal reference only: no product import, parser, declaration query or observed output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = new URL('./', import.meta.url);
const sha = (b) => createHash('sha256').update(b).digest('hex');
function framed(domain, fields) {
  const h = createHash('sha256')
    .update(domain)
    .update(Buffer.from([0]));
  for (const v of fields) {
    const b = Buffer.from(String(v));
    h.update(String(b.length) + ':').update(b);
  }
  return domain + ':' + h.digest('hex');
}
const range = (a, b) => ({
  sourceFileId: 'file:one',
  startLine: 0,
  startColumn: a,
  endLine: 0,
  endColumn: b,
});
const write = (p, v) => fs.writeFileSync(new URL(p, root), JSON.stringify(v, null, 2) + '\n');
const confidence = { score: 1, method: 'parser', reasons: [] };
function bind(request) {
  const p = request.payload,
    t = p.targetSource,
    a = p.expectedActivationBasis,
    f = p.sourceFiles[0];
  const owners = [...p.owners].sort((a, b) =>
    Buffer.compare(
      Buffer.from(a.providerNodeRef.providerFactId),
      Buffer.from(b.providerNodeRef.providerFactId),
    ),
  );
  const fields = [
    t.repositoryId,
    t.revisionId,
    t.contentFingerprint,
    'ACTIVE',
    a.repositoryId,
    a.revisionId,
    a.contentFingerprint,
    a.codeActivationDigest,
    'PROVISIONAL_CODE',
    p.ownerBinding.stageDigest,
    p.providerId,
    p.providerSnapshotId,
    '1',
    f.id,
    f.path,
    f.contentFingerprint,
    f.languageHint,
    'SOURCE',
    'AUTHORED',
    'TEXT',
    'INTERNAL',
    String(owners.length),
  ];
  for (const o of owners)
    fields.push(
      o.sourceFileId,
      o.providerNodeRef.providerId,
      o.providerNodeRef.providerFactId,
      o.canonicalRef.repositoryId,
      'CODE_NODE',
      o.canonicalRef.entity.id,
      o.canonicalRef.entity.revisionId,
    );
  p.ownerBinding.ownerMapDigest = framed('codeatlas-native-syntax-owner-map-v1', fields).split(
    ':',
  )[1];
  return request;
}
function context(request) {
  const p = request.payload;
  return {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: p.ownerBinding.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  };
}
for (const [mode, suffix] of [
  ['calibration', 'fixture'],
  ['holdout', 'holdout'],
]) {
  const source = fs.readFileSync(
    new URL('../syntax-observation-corpus/' + mode + '/java-owner/Endpoint.java', root),
  );
  const className = 'Endpoint_' + suffix,
    methodName = 'handle_' + suffix,
    literal = '/' + suffix;
  assert.equal(
    source.toString('utf8'),
    'class ' + className + ' { @Route("' + literal + '") void ' + methodName + '() {} }\n',
  );
  assert.equal(source.length, 71);
  for (const [a, b, text] of [
    [6, 22, className],
    [25, 43, '@Route("' + literal + '")'],
    [32, 42, '"' + literal + '"'],
    [49, 63, methodName],
    [25, 68, '@Route("' + literal + '") void ' + methodName + '() {}'],
  ])
    assert.equal(source.subarray(a, b).toString('utf8'), text);
  fs.mkdirSync(new URL(mode + '/', root), { recursive: true });
  fs.writeFileSync(new URL(mode + '/Endpoint.java', root), source);
  const request = JSON.parse(
    fs.readFileSync(
      new URL('../syntax-budget-contract/inputs/java-provisional-request.json', root),
    ),
  );
  const p = request.payload;
  p.sourceFiles[0].path = 'Endpoint.java';
  p.sourceFiles[0].contentFingerprint = 'sha256:' + sha(source);
  const classId = framed('java-symbol-v1', [
    'Endpoint.java',
    'java.class',
    '0',
    className,
    '',
    '0',
  ]);
  const methodId = framed('java-symbol-v1', [
    'Endpoint.java',
    'java.method',
    '1',
    className,
    methodName,
    '()',
    '0',
  ]);
  const ids = [classId, methodId],
    names = [className, methodName],
    qualified = [className, className + '.' + methodName],
    spans = [range(6, 22), range(49, 63)],
    kinds = ['java.class', 'java.method'];
  const symbols = ids.map((providerFactId, i) => ({
    providerFactId,
    providerKind: kinds[i],
    name: names[i],
    qualifiedName: qualified[i],
    signature: i === 0 ? '' : '()',
    isStatic: false,
    span: {
      startLine: 0,
      startColumn: spans[i].startColumn,
      endLine: 0,
      endColumn: spans[i].endColumn,
    },
  }));
  write(mode + '/symbols.json', symbols);
  const providerNodes = ids.map((providerFactId, i) => ({
    providerId: 'native',
    providerFactId,
    providerSnapshotId: 'snapshot:one',
    repositoryId: 'repo:one',
    revisionId: 'revision:worktree',
    providerKind: kinds[i],
    name: names[i],
    qualifiedName: qualified[i],
    sourceRange: spans[i],
    confidence,
  }));
  write(mode + '/provider-nodes.json', providerNodes);
  const canonical = providerNodes.map((n, i) => {
    const kind = i === 0 ? 'TYPE' : 'SYMBOL',
      subkind = i === 0 ? 'CLASS' : 'METHOD';
    const factKey = framed('node-fact-v1', [
      'repo:one',
      'revision:worktree',
      kind,
      subkind,
      n.qualifiedName,
      'file:one',
      0,
      n.sourceRange.startColumn,
      0,
      n.sourceRange.endColumn,
    ]);
    return {
      id: framed('canonical-node-v1', [factKey]),
      factKey,
      repositoryId: 'repo:one',
      revisionId: 'revision:worktree',
      name: n.name,
      qualifiedName: n.qualifiedName,
      sourceRange: n.sourceRange,
      confidence,
      kind,
      ...(i === 0 ? { typeKind: subkind } : { symbolKind: subkind }),
    };
  });
  write(mode + '/canonical-nodes.json', canonical);
  p.owners = ids.map((id, i) => ({
    sourceFileId: 'file:one',
    providerNodeRef: { factType: 'NODE', providerId: 'native', providerFactId: id },
    canonicalRef: {
      scope: 'REPOSITORY',
      repositoryId: 'repo:one',
      entity: { kind: 'CODE_NODE', id: canonical[i].id, revisionId: 'revision:worktree' },
    },
  }));
  bind(request);
  write(mode + '/request.json', request);
  fs.writeFileSync(new URL(mode + '/request.jsonl', root), JSON.stringify(request) + '\n');
  write(mode + '/context.json', context(request));
  const missing = structuredClone(request);
  missing.payload.owners = missing.payload.owners.filter(
    (o) => o.providerNodeRef.providerFactId === classId,
  );
  bind(missing);
  write(mode + '/request-no-method.json', missing);
  write(mode + '/context-no-method.json', context(missing));
  const foreign = structuredClone(request);
  foreign.payload.owners[1].providerNodeRef.providerFactId = 'java-symbol-v1:' + '0'.repeat(64);
  bind(foreign);
  write(mode + '/request-foreign-owner.json', foreign);
  write(mode + '/context-foreign-owner.json', context(foreign));
  for (const [r, isMissing, file] of [
    [request, false, 'events.jsonl'],
    [missing, true, 'events-no-method.jsonl'],
  ]) {
    const p = r.payload,
      binding = {
        expectedActivationBasis: p.expectedActivationBasis,
        targetSource: p.targetSource,
        ownerBinding: p.ownerBinding,
        extractorVersion: 'syntax-v1',
      };
    const owner = isMissing
      ? null
      : { factType: 'NODE', providerId: 'native', providerFactId: methodId };
    const observation = (kind, a, b, payload) => ({
      providerSyntaxId: framed('java-syntax-v1', ['Endpoint.java', kind, String(a), String(b)]),
      sourceFileId: 'file:one',
      sourceFingerprint: p.sourceFiles[0].contentFingerprint,
      sourceRange: range(a, b),
      owner,
      syntaxKind: kind,
      payload,
    });
    const rows = [
      ['SYNTAX_STARTED', binding],
      [
        'SYNTAX_OBSERVATION',
        observation('DECLARATION', 25, 68, {
          declaredType: 'void',
          parameterNames: [],
          modifiers: [],
        }),
      ],
      [
        'SYNTAX_OBSERVATION',
        observation('DECORATION', 25, 43, {
          callee: {
            name: 'Route',
            target: {
              state: 'UNRESOLVED',
              resolution: 'UNRESOLVED',
              originalHint: 'Route',
              candidates: [],
            },
          },
          arguments: [
            { name: null, value: { kind: 'STRING', value: literal }, sourceRange: range(32, 42) },
          ],
        }),
      ],
      [
        'COVERAGE',
        {
          sourceFileId: 'file:one',
          sourceFingerprint: p.sourceFiles[0].contentFingerprint,
          status: isMissing ? 'PARTIAL' : 'COMPLETE',
          limitations: isMissing ? ['UNRESOLVED_OR_UNSUPPORTED_SYNTAX'] : [],
        },
      ],
    ].map(([type, payload], sequence) => ({
      protocolVersion: 4,
      requestId: 'syntax:request',
      sequence,
      type,
      payload,
    }));
    const prefix = rows.map((row) => JSON.stringify(row) + '\n').join('');
    rows.push({
      protocolVersion: 4,
      requestId: 'syntax:request',
      sequence: 4,
      type: 'SYNTAX_COMPLETED',
      payload: {
        ...binding,
        outcome: isMissing ? 'PARTIAL' : 'SUCCEEDED',
        counts: { nodes: 0, edges: 0, syntax: 2, coverage: 1, diagnostics: 0 },
        checksum: sha(Buffer.from(prefix)),
      },
    });
    fs.writeFileSync(
      new URL(mode + '/' + file, root),
      rows.map((row) => JSON.stringify(row) + '\n').join(''),
    );
  }
  write(mode + '/authoring.json', {
    kind: 'INDEPENDENT_JAVA_SOURCE_LITERAL_OWNER_ORACLE',
    sourceSha256: sha(source),
    spans: {
      className: [6, 22],
      methodName: [49, 63],
      methodDeclaration: [25, 68],
      annotation: [25, 43],
      argument: [32, 42],
    },
    symbolFields: { classOwners: [], methodOwners: [className], methodSignature: '()', ordinal: 0 },
    counts: { nodes: 0, edges: 0, syntax: 2, coverage: 1, diagnostics: 0 },
    limitations: [
      'SYNTHETIC_UNIT_REPO_AND_PROVISIONAL_CONTEXT',
      'EXISTING_UNIT_CONTROLS_ONLY',
      'NO_V4_JAVA_CODE_EMISSION',
      'NO_LIVE_RUNTIME_STAGE_OR_STORE_AUTHENTICATION',
      'NO_ACTUAL_NATIVE_PROCESS_PROFILE',
    ],
  });
}
write('fixture.json', {
  schemaVersion: 1,
  id: 'p1-syntax-java-owner-oracle-v1',
  category: 'runtime-graph',
  phase: '1',
  languages: [],
  frameworks: [],
  capabilities: ['BOUNDED_LIBRARY_FULL_OUTPUT_ORACLE_ONLY'],
  inputs: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['Source', 'Endpoint.java'],
        ['Request', 'request.json'],
        ['RequestBytes', 'request.jsonl'],
        ['Context', 'context.json'],
        ['Symbols', 'symbols.json'],
        ['ProviderNodes', 'provider-nodes.json'],
        ['MissingRequest', 'request-no-method.json'],
        ['MissingContext', 'context-no-method.json'],
        ['ForeignRequest', 'request-foreign-owner.json'],
        ['ForeignContext', 'context-foreign-owner.json'],
        ['Authoring', 'authoring.json'],
      ].map(([k, p]) => [m + k, m + '/' + p]),
    ),
  ),
  expected: Object.fromEntries(
    ['calibration', 'holdout'].flatMap((m) =>
      [
        ['Stream', 'events.jsonl'],
        ['OwnerlessStream', 'events-no-method.jsonl'],
        ['CanonicalNodes', 'canonical-nodes.json'],
      ].map(([k, p]) => [m + k, m + '/' + p]),
    ),
  ),
  criticalFacts: [],
  qualityGates: {},
});
