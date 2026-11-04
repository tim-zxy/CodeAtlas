import assert from 'node:assert/strict';
import test from 'node:test';
import { cases, loadCase } from '../../../fixtures/phase1/canonical-syntax-mapping/corpus.mjs';
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { items: 0, serializedBytes: 0 },
});
test('v2 normalizer preserves fixed policy, lexical support and strict legacy refusal', async () => {
  const { default: normalize } = await import('../dist/syntax-binding-normalizer.js');
  const { input } = loadCase(cases.find((c) => c.id === 'declaration-java'));
  input.raw.lexicalScope = input.raw.owner;
  input.raw.payload.declarationForm = 'CALLABLE';
  input.raw.payload.declaredName = 'run';
  const result = normalize(input, budget());
  assert.deepEqual(result.lexicalScope, result.owner);
  assert.equal(result.confidence.score, 0.5);
  assert.equal(result.confidence.method, 'syntax-surface-support-v1');
  const { default: old } = await import('../dist/syntax-normalizer.js');
  assert.throws(() => old(input, budget()));
  const bad = structuredClone(input);
  bad.raw.lexicalScope.providerFactId = 'missing';
  assert.throws(() => normalize(bad, budget()));
  const tiny = budget();
  tiny.limits.maxItems = 1;
  assert.throws(
    () => normalize(input, tiny),
    (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
  );
});

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v !== null && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
const digest = (domain, v) =>
  createHash('sha256')
    .update(domain + '\0')
    .update(canonical(v))
    .digest('hex');
const tuple = (domain, fields) => {
  const h = createHash('sha256').update(domain + '\0');
  for (const value of fields) {
    const raw = Buffer.from(String(value));
    h.update(String(raw.length) + ':').update(raw);
  }
  return domain + ':' + h.digest('hex');
};
const oracle = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/binding-observation/expected.json',
      import.meta.url,
    ),
  ),
);
for (const name of ['python-direct.py', 'python-nested.py'])
  test(
    'actual Rust library bytes → v2 identity/support → V3 ' + name,
    {
      skip: process.env.CODEATLAS_BINDING_LIBRARY_OUTPUT
        ? false
        : 'Requires approved Rust library capture; no golden fallback',
    },
    async () => {
      const path = process.env.CODEATLAS_BINDING_LIBRARY_OUTPUT;
      const request = readFileSync(path + '/' + name + '.request.jsonl'),
        raw = readFileSync(path + '/' + name + '.output.jsonl');
      const { validateBindingSyntaxObservationStreamWithBudget: validate } =
        await import('../dist/native-binding-stream.js');
      const { default: code } = await import('../dist/python-normalizer.js');
      const { default: collect } = await import('../dist/fact-merger-input.js');
      const { default: normalize } = await import('../dist/syntax-binding-normalizer.js');
      const { validatePluginV3Context, isDirectAssignmentCall } =
        await import('../../plugins/dist/plugin-context-v3.js');
      const { createSyntaxHistoryPair } = await import('../dist/syntax-history-candidate.js');
      const b = budget(),
        out = validate(request, raw, b).observation,
        p = out.request.payload;
      const nodes = out.events.filter((e) => e.type === 'NODE').map((e) => e.payload),
        edges = out.events.filter((e) => e.type === 'EDGE').map((e) => e.payload);
      const normalized = code(
        {
          targetSource: p.targetSource,
          providerId: p.providerId,
          providerSnapshotId: p.providerSnapshotId,
          sourceFiles: p.sourceFiles,
          nodes,
          edges,
        },
        b,
      );
      const snapshot = JSON.parse(
        readFileSync(
          new URL(
            '../../../fixtures/phase1/native-composition-candidate/python-only/expected.json',
            import.meta.url,
          ),
        ),
      ).snapshot;
      const { historyDraftDigest } = await import('../dist/history-transition-input.js');
      const original = collect(
        {
          repositoryId: p.targetSource.repositoryId,
          revisionId: p.targetSource.revisionId,
          observations: [{ snapshot, nodes: normalized.nodePairs, edges: normalized.edgePairs }],
        },
        b,
      );
      const supports = original.map((s) => ({
        factType: s.factType,
        canonical: s.canonical,
        evidence: s.evidence,
        binding: s.binding,
        factEvidence: s.factEvidence,
        dependencyUnitIds: null,
        valueDigest: historyDraftDigest(
          { kind: 'DECLARED_HISTORY_CANDIDATE_V1', candidate: s.canonical },
          b.limits,
          b.budget,
        ),
      }));
      const basis = { ...p.targetSource, codeActivationDigest: 'b'.repeat(64) },
        selectedNodes = normalized.nodePairs.map((x) => x.canonical),
        sourceFile = p.sourceFiles[0];
      const syntax = out.events
        .filter((e) => e.type === 'SYNTAX_OBSERVATION')
        .map((e) =>
          normalize(
            {
              basis,
              sourceFile,
              raw: e.payload,
              selectedNodes,
              bindings: original.map((s) => s.binding),
              supports,
              extractorVersion: 'syntax-v1',
            },
            b,
          ),
        );
      for (const s of syntax) {
        assert.equal(s.confidence.score, 0.5);
        assert.equal(s.confidence.method, 'syntax-surface-support-v1');
        const compact = (ref) => (ref === null ? null : { kind: 'CODE_NODE', id: ref.entity.id });
        const convert = (v) =>
          Array.isArray(v)
            ? v.map(convert)
            : v !== null && typeof v === 'object'
              ? v.scope === 'REPOSITORY'
                ? compact(v)
                : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x)]))
              : v;
        const meaning = {
            owner: compact(s.owner),
            lexicalScope: compact(s.lexicalScope),
            payload: convert(s.payload),
          },
          span = s.sourceRange;
        const hash = createHash('sha256').update(canonical(meaning)).digest('hex');
        assert.equal(
          s.syntaxKey,
          tuple(oracle.identity.keyDomain, [
            basis.repositoryId,
            sourceFile.id,
            sourceFile.contentFingerprint,
            span.startLine,
            span.startColumn,
            span.endLine,
            span.endColumn,
            s.syntaxKind,
            hash,
          ]),
        );
        assert.equal(
          s.extractionVersion,
          tuple(oracle.identity.extractionDomain, oracle.identity.versions),
        );
        const { id, ...initial } = s;
        assert.equal(id, 'syntax:' + digest(oracle.identity.initialDomain, initial));
        for (const ref of s.supportRefs) {
          const value =
            ref.entity.kind === 'SOURCE_FILE'
              ? sourceFile
              : selectedNodes.find((n) => n.id === ref.entity.id);
          assert.equal(ref.valueDigest, digest('codeatlas-phase1-support-value-v1', value));
        }
      }
      const inventory = [
        ...new Map(
          syntax.flatMap((s) => s.supportRefs).map((s) => [s.entity.kind + ':' + s.entity.id, s]),
        ).values(),
      ];
      const context = {
        contextVersion: 3,
        syntaxSchemaVersion: 2,
        basis,
        nodes: selectedNodes,
        edges: normalized.edgePairs.map((x) => x.canonical),
        sourceFiles: [sourceFile],
        syntaxEvidence: syntax,
        supportInventory: inventory,
        configuration: {},
      };
      assert.deepEqual(validatePluginV3Context(context), context);
      const app = syntax.find(
        (s) => s.syntaxKind === 'ASSIGNMENT' && s.payload.targetName === 'app',
      );
      const calls = syntax.filter((s) => s.syntaxKind === 'INVOCATION');
      const direct = calls.filter((call) => isDirectAssignmentCall(app, call));
      assert.equal(direct.length, 1);
      assert.equal(
        direct[0].payload.callee.name,
        name === 'python-direct.py' ? 'FastAPI' : oracle.sources[name].appDirectCall,
      );
      if (name === 'python-direct.py') {
        const decorator = syntax.find((s) => s.syntaxKind === 'DECORATION');
        assert.equal(
          selectedNodes.find((n) => n.id === decorator.lexicalScope.entity.id).kind,
          'MODULE',
        );
        assert.notDeepEqual(decorator.owner, decorator.lexicalScope);
      }
      assert.throws(() =>
        createSyntaxHistoryPair(
          {
            body: {
              schemaVersion: 1,
              providerSyntaxId: 'syntax:actual',
              originSnapshot: snapshot,
              sourceFile,
              unitId: 'unit:actual',
              envelope: { schema: 'codeatlas.syntax-evidence', version: 2, payload: app },
            },
            selectedNodes,
          },
          b,
        ),
      );
    },
  );
