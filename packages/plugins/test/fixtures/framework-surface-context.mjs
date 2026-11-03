// Recorded component input only; timing is declared, never physical qualification.
import { createHash } from 'node:crypto';
import { readSurfaceCapture } from '../../../../fixtures/phase1/syntax-contract/surface-closure/corpus.mjs';
import { loadCompositionCase } from '../../../providers/test/fixtures/native-composition-helpers.mjs';
import { composeDeclaredFrameworkSurfaceFullRawSupportCandidate } from '../../../providers/dist/declared-delta-raw-support-candidate.js';
import normalize from '../../../providers/dist/syntax-framework-surface-normalizer.js';
import { canonicalRuntimeJson } from '@codeatlas/ir';
import { validatePluginV5Context } from '../../dist/plugin-context-v5.js';
export async function surfaceContext(id) {
  const saved = readSurfaceCapture(id),
    request = JSON.parse(saved.syntax.request),
    p = request.payload,
    metadata = structuredClone(
      (await loadCompositionCase(saved.code ? 'java-only' : 'python-only')).metadata,
    );
  metadata.targetSource = p.targetSource;
  metadata.inventory = p.sourceFiles;
  metadata.snapshot.id = p.providerSnapshotId;
  metadata.snapshot.providerId = p.providerId;
  metadata.snapshot.providerVersion = p.providerVersion;
  metadata.codeSyntax.providerVersion = p.providerVersion;
  if (saved.code) {
    const events = saved.code.output.toString().trim().split('\n').map(JSON.parse);
    Object.assign(metadata.java, {
      request: JSON.parse(saved.code.request),
      events,
      terminal: events.at(-1),
      providerVersion: p.providerVersion,
    });
  } else metadata.java = null;
  const budget = () => ({
      limits: {
        maxSerializedBytes: Number.MAX_SAFE_INTEGER,
        maxItems: Number.MAX_SAFE_INTEGER,
        maxDepth: 128,
      },
      budget: { serializedBytes: 0, items: 0 },
    }),
    target = {
      source: p.targetSource,
      repositoryLocatorDigest: 'b'.repeat(64),
      inventory: p.sourceFiles,
      contracts: [
        {
          providerId: 'native',
          extractor: 'syntax-v2',
          normalizer: 'syntax-canonical-mapper-v4',
          contract: 'SYNTAX_BINDING_V4',
          policy: 'syntax-surface-support-v2',
        },
      ],
    },
    result = composeDeclaredFrameworkSurfaceFullRawSupportCandidate(
      target,
      metadata,
      saved.syntax.request,
      saved.syntax.output,
      budget(),
    );
  const nodes = result.merged.nodes,
    edges = result.merged.edges,
    basis = { ...p.targetSource, codeActivationDigest: 'a'.repeat(64) },
    sourceFiles = p.sourceFiles;
  const syntaxEvidence = result.raw.codeSyntax.events
    .filter((e) => e.type === 'SYNTAX_OBSERVATION')
    .map((e) =>
      normalize(
        {
          basis,
          sourceFile: sourceFiles.find((f) => f.id === e.payload.sourceFileId),
          raw: e.payload,
          selectedNodes: nodes,
          selectedEdges: edges,
          bindings: result.merged.bindings,
          supports: result.activeSupports.map(({ snapshotId, ...s }) => s),
          extractorVersion: 'syntax-v2',
        },
        budget(),
      ),
    );
  const supportInventory = [
    ...nodes.map((v) => ['CODE_NODE', v]),
    ...edges.map((v) => ['CODE_EDGE', v]),
    ...sourceFiles.map((v) => ['SOURCE_FILE', v]),
  ].map(([kind, v]) => ({
    basis,
    entity: { kind, id: v.id, revisionId: basis.revisionId },
    valueDigest: createHash('sha256')
      .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(v))
      .digest('hex'),
  }));
  return validatePluginV5Context({
    contextVersion: 5,
    syntaxSchemaVersion: 4,
    basis,
    nodes,
    edges,
    sourceFiles,
    syntaxEvidence,
    supportInventory,
    configuration: {},
  });
}

/** Pure composed-context responsibility fixture; never a Source capture or Store authority. */
export async function composedSurfaceContext(ids) {
  const contexts = [];
  for (const id of ids) contexts.push(await surfaceContext(id));
  const basis = {
      ...contexts[0].basis,
      repositoryId: 'repo:pure-composed',
      revisionId: 'revision:pure-composed',
    },
    rewrite = (v) => {
      if (!v || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) {
        if (k === 'repositoryId') v[k] = basis.repositoryId;
        else if (k === 'revisionId') v[k] = basis.revisionId;
        else rewrite(x);
      }
    },
    c = {
      contextVersion: 5,
      syntaxSchemaVersion: 4,
      basis,
      nodes: [],
      edges: [],
      sourceFiles: [],
      syntaxEvidence: [],
      supportInventory: [],
      configuration: {},
    };
  for (const context of contexts) {
    const x = structuredClone(context);
    rewrite(x);
    for (const field of ['nodes', 'edges', 'sourceFiles', 'syntaxEvidence'])
      c[field].push(...x[field]);
  }
  const values = new Map([
      ...c.nodes.map((v) => ['CODE_NODE:' + v.id, v]),
      ...c.edges.map((v) => ['CODE_EDGE:' + v.id, v]),
      ...c.sourceFiles.map((v) => ['SOURCE_FILE:' + v.id, v]),
    ]),
    support = (kind, value) => ({
      basis,
      entity: { kind, id: value.id, revisionId: basis.revisionId },
      valueDigest: createHash('sha256')
        .update('codeatlas-phase1-support-value-v1\0' + canonicalRuntimeJson(value))
        .digest('hex'),
    });
  c.supportInventory = [...values].map(([key, v]) => support(key.slice(0, key.indexOf(':')), v));
  for (const s of c.syntaxEvidence)
    s.supportRefs = s.supportRefs.map((r) =>
      support(r.entity.kind, values.get(r.entity.kind + ':' + r.entity.id)),
    );
  return validatePluginV5Context(c);
}
