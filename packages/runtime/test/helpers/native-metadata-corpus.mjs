import { createHash } from 'node:crypto';
import {
  computeNativeSummaryDigest,
  computeNativeFactContentDigest,
} from '../../../providers/dist/index.js';

export const memoryCases = [
  'zero-file',
  'empty-file',
  'maximum-short-files',
  'dense-numeric-sites',
  'long-ascii',
  'long-bmp',
  'long-astral',
  'repeated-shared-owners',
  'duplicate-metadata',
  'foreign-metadata',
  'deep-unknown-input',
  'oversized-sql-column',
  'oversized-staged-fact',
];
export const corpusRevision = 'p05-native-metadata-memory-v1';
export const corpusExpected = {
  repositoryId: 'repo',
  revisionId: 'worktree',
  contentFingerprint: 'fp',
  providerId: 'native',
  providerVersion: '0.0.0',
  language: {
    languageId: 'java',
    grammarVersion: '0.23.5',
    analyzerVersion: '0.0.0',
    compatibilityVersion: '1',
  },
  resolverVersion: '1',
  normalizerVersion: '1',
  policyFingerprint: 'policy',
  requestedCapabilities: ['SYMBOL'],
};
const span = { startLine: 0, startColumn: 0, endLine: 0, endColumn: 1 };
const confidence = { score: 1, method: 'parser', reasons: [] };
export function summaryFor(index) {
  const sourceFile = {
    id: `f-${index}`,
    repositoryId: 'repo',
    revisionId: 'worktree',
    path: `src/F${index}.java`,
    contentFingerprint: `fp-${index}`,
    classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: 'java',
    sensitivity: 'PUBLIC',
  };
  return {
    schemaVersion: 1,
    sourceFile,
    symbols: [],
    relationSites: [],
    diagnostics: [],
    emittedFacts: [],
    coverage: [
      {
        capability: 'SYMBOL',
        sourceFileId: sourceFile.id,
        support: 'SUPPORTED',
        coverage: 'COMPLETE',
        statistics: {
          eligibleSites: 0,
          coveredSites: 0,
          unsupportedSites: 0,
          partialSites: 0,
          resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
        },
      },
    ],
  };
}
function nodeFor(summary, index, kind = 'java.class', name = `C${index}`) {
  const node = {
    providerId: 'native',
    providerFactId: `${summary.sourceFile.id}-n-${index}`,
    providerSnapshotId: 'snapshot',
    repositoryId: 'repo',
    revisionId: 'worktree',
    providerKind: kind,
    name,
    qualifiedName: name,
    sourceRange: { sourceFileId: summary.sourceFile.id, ...span },
    confidence,
  };
  summary.symbols.push({
    providerFactId: node.providerFactId,
    providerKind: kind,
    name,
    qualifiedName: name,
    signature: '',
    isStatic: false,
    span: { ...span },
  });
  summary.emittedFacts.push({
    factType: 'NODE',
    providerFactId: node.providerFactId,
    contentDigest: computeNativeFactContentDigest(node),
    ownership: 'FILE',
  });
  return node;
}
function syntheticId(prefix, value) {
  return `${prefix}:${createHash('sha256')
    .update(`${prefix}\0${Buffer.byteLength(value)}:${value}`)
    .digest('hex')}`;
}
function headerFor(summaries) {
  return {
    schemaVersion: 1,
    ...corpusExpected,
    sourceFileCount: summaries.length,
    summaryDigest: computeNativeSummaryDigest(summaries),
  };
}
function serializedBytes(summaries, header) {
  return (
    Buffer.byteLength(JSON.stringify(header)) +
    summaries.reduce((n, s) => n + Buffer.byteLength(JSON.stringify(s)), 0)
  );
}
export function buildMemoryCase(name) {
  if (!memoryCases.includes(name)) throw Error(`Unknown memory case: ${name}`);
  let summaries = name === 'zero-file' ? [] : [summaryFor(0)];
  const nodes = [];
  let outcome = 'AVAILABLE';
  if (name === 'maximum-short-files' || name === 'repeated-shared-owners') {
    summaries = [];
    // Grow by measured serialized bytes, not a guessed fixed file count.
    let bytes = Buffer.byteLength(JSON.stringify(headerFor([])));
    for (let index = 0; ; index++) {
      const summary = summaryFor(index);
      let node;
      if (name === 'repeated-shared-owners') {
        node = nodeFor(summary, index, 'java.package', 'demo');
        const shared = {
          providerId: 'native',
          providerFactId: syntheticId('java-package-container-v1', 'demo'),
          providerSnapshotId: 'snapshot',
          repositoryId: 'repo',
          revisionId: 'worktree',
          providerKind: 'java.package_container',
          name: 'demo',
          qualifiedName: 'demo',
          sourceRange: null,
          confidence,
        };
        summary.emittedFacts.push({
          factType: 'NODE',
          providerFactId: shared.providerFactId,
          contentDigest: computeNativeFactContentDigest(shared),
          ownership: 'SHARED',
        });
        if (!index) nodes.push(shared);
      }
      const next = Buffer.byteLength(JSON.stringify(summary));
      // Header's sourceFileCount decimal grows; retain only a few bytes for it.
      if (bytes + next + String(index + 1).length > 1_000_000) break;
      bytes += next;
      summaries.push(summary);
      if (node) nodes.push(node);
    }
  } else if (name === 'dense-numeric-sites') {
    const summary = summaries[0];
    let bytes = serializedBytes(summaries, headerFor(summaries));
    for (let index = 0; ; index++) {
      const oldSymbols = summary.symbols.length,
        oldFacts = summary.emittedFacts.length;
      const node = nodeFor(summary, index);
      const site = {
        kind: 'CALL',
        variant: 'method',
        sourceFactId: node.providerFactId,
        targetHint: `call${index}`,
        arity: Number.MAX_SAFE_INTEGER - index,
        span: { ...span },
      };
      const delta =
        Buffer.byteLength(JSON.stringify(summary.symbols.at(-1))) +
        Buffer.byteLength(JSON.stringify(summary.emittedFacts.at(-1))) +
        Buffer.byteLength(JSON.stringify(site)) +
        3;
      if (bytes + delta > 1_000_000) {
        summary.symbols.length = oldSymbols;
        summary.emittedFacts.length = oldFacts;
        break;
      }
      summary.relationSites.push(site);
      nodes.push(node);
      bytes += delta;
    }
  } else if (name.startsWith('long-')) {
    nodes.push(nodeFor(summaries[0], 0));
    const character = { 'long-ascii': 'a', 'long-bmp': '漢', 'long-astral': '😀' }[name];
    const available = 1_000_000 - serializedBytes(summaries, headerFor(summaries));
    summaries[0].symbols[0].signature = character.repeat(
      Math.floor(available / Buffer.byteLength(character)),
    );
  }
  let header = headerFor(summaries);
  if (name === 'duplicate-metadata') {
    summaries.push(structuredClone(summaries[0]));
    header.sourceFileCount = 2;
    header.summaryDigest = computeNativeSummaryDigest(summaries);
    outcome = 'INVALID';
  } else if (name === 'foreign-metadata') {
    summaries[0].sourceFile.repositoryId = 'foreign';
    header.summaryDigest = computeNativeSummaryDigest(summaries);
    outcome = 'INVALID';
  } else if (name === 'deep-unknown-input') {
    let nested = true;
    // Stay within SQLite JSON's accepted nesting envelope so actual persistent
    // read validation, rather than the table CHECK, exercises unknown input.
    for (let i = 0; i < 800; i++) nested = { unknown: nested };
    // The staging serializer must handle this without recursive stack overflow;
    // strict Provider validation rejects unknown keys before recursing into it.
    return {
      name,
      header,
      summaries,
      nodes,
      outcome: 'INVALID',
      unknownSummary: { ...summaries[0], unknown: nested },
    };
  } else if (name === 'oversized-sql-column' || name === 'oversized-staged-fact')
    outcome = 'RESOURCE_LIMIT_EXCEEDED';
  if (serializedBytes(summaries, header) > 1_000_000)
    throw Error(`Corpus exceeds envelope: ${name}`);
  return { name, header, summaries, nodes, outcome };
}

export function caseJsonFiles(value) {
  return value.summaries.map((s) => ({
    sourceFileId: s.sourceFile.id,
    sourcePath: s.sourceFile.path,
    contentFingerprint: s.sourceFile.contentFingerprint,
    summaryJson: JSON.stringify(s),
  }));
}
