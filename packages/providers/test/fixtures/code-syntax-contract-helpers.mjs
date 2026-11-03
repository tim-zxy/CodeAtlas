import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { computeSyntaxOwnerMapDigest } from '../../dist/index.js';
const root = new URL('../../../../fixtures/phase1/code-syntax-completeness/', import.meta.url);
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export const line = (v) => JSON.stringify(v) + '\n';
export const decode = (b) => b.toString('utf8').trimEnd().split('\n').map(JSON.parse);
export const json = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
export const bytes = (p) => readFile(new URL(p, root));
export async function load(id = 'alias-reference-python') {
  const requestBytes = await bytes('requests/' + id + '.jsonl'),
    outputBytes = await bytes('observations/' + id + '.jsonl');
  return {
    requestBytes,
    outputBytes,
    request: JSON.parse(requestBytes),
    events: decode(outputBytes),
  };
}
export function ownerMap(request) {
  const p = request.payload,
    o = p.ownerBinding;
  p.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest({
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding:
      o.kind === 'ACTIVE_CODE'
        ? { kind: o.kind, codeActivationDigest: o.codeActivationDigest }
        : { kind: o.kind, stageDigest: o.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  });
}
export function seal(request, events) {
  const requestBytes = Buffer.from(line(request)),
    p = request.payload;
  const binding = {
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: p.ownerBinding,
    extractorVersion: p.extractorVersion,
    codeContract: p.codeContract,
    requestChecksum: sha(requestBytes),
  };
  const counts = {
    nodes: 0,
    edges: 0,
    syntax: 0,
    codeCoverage: 0,
    syntaxCoverage: 0,
    diagnostics: 0,
  };
  const keys = {
    NODE: 'nodes',
    EDGE: 'edges',
    SYNTAX_OBSERVATION: 'syntax',
    CODE_COVERAGE: 'codeCoverage',
    SYNTAX_COVERAGE: 'syntaxCoverage',
    DIAGNOSTIC: 'diagnostics',
  };
  events = structuredClone(events);
  events.forEach((e, i) => {
    e.protocolVersion = 5;
    e.requestId = request.requestId;
    e.sequence = i;
    if (keys[e.type]) counts[keys[e.type]]++;
    if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED')
      Object.assign(e.payload, structuredClone(binding));
  });
  const end = events.at(-1);
  if (end.type === 'OBSERVATION_COMPLETED') {
    end.payload.counts = counts;
    end.payload.checksum = sha(Buffer.from(events.slice(0, -1).map(line).join('')));
  }
  return { requestBytes, outputBytes: Buffer.from(events.map(line).join('')), request, events };
}
export function rawSeal(lines) {
  const last = JSON.parse(lines.at(-1));
  last.payload.checksum = sha(Buffer.from(lines.slice(0, -1).join('')));
  return Buffer.from(lines.slice(0, -1).join('') + line(last));
}
export function zeroFacet(events, facet) {
  const s = events.find((e) => e.type === 'CODE_COVERAGE' && e.payload.facet === facet).payload
    .statistics;
  s.eligibleSites = 0;
  s.coveredSites = 0;
  s.unsupportedSites = 0;
  s.partialSites = 0;
  for (const key of Object.keys(s.resolutionCounts)) s.resolutionCounts[key] = 0;
}
