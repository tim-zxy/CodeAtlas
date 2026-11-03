// Independent reference authoring: standard-library arithmetic over declared inputs only.
// Never imports the loader, producer, parser or expected observed output.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const manifestPath = 'fixtures/phase1/syntax-qualification-draft/inputs/draft.json';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
// Reference canonicalization is implemented by JSON's replacer on a recursively ordered copy.
const ordered = (v) =>
  Array.isArray(v)
    ? v.map(ordered)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort(order)
            .map((k) => [k, ordered(v[k])]),
        )
      : v;
const identity = (name, v) =>
  hash(
    Buffer.from('codeatlas-syntax-qualification-' + name + '-v1\0' + JSON.stringify(ordered(v))),
  );

export function authorDraft(root, relative = manifestPath) {
  const reads = [];
  const read = (p) => {
    const b = fs.readFileSync(path.join(root, p));
    reads.push({ path: p, bytes: b.length });
    return b;
  };
  const raw = read(relative),
    draft = JSON.parse(raw),
    corpusRaw = read(draft.corpus.path),
    corpus = JSON.parse(corpusRaw);
  const originals = [...corpus.calibration, ...corpus.holdout];
  for (const original of originals) {
    original.sources.forEach((s) =>
      read(path.posix.join(path.posix.dirname(draft.corpus.path), s.path)),
    );
    read(path.posix.join(path.posix.dirname(draft.corpus.path), original.oracle.path));
  }
  const cases = draft.cases
    .map((c) => {
      const requestRaw = read(c.request.path),
        request = JSON.parse(requestRaw),
        p = request.payload;
      const contextRaw = read(c.context.path),
        expectedRaw = read(c.expected.path);
      c.sources.forEach((s) => read(s.artifact.path));
      // Manual scenario expectation: only the 3 accepted pairs use ABSENT instead of PRESENT.
      const mismatch = ['dynamic-malformed', 'nested-source', 'bounded-output'].includes(
        c.id.split(':')[1],
      );
      return {
        id: c.id,
        rawRequestDigest: hash(requestRaw),
        requestIdentityDigest: identity('request', request),
        contextDigest: hash(contextRaw),
        expectedDigest: hash(expectedRaw),
        sourceInventoryDigest: identity('source-inventory', p.sourceFiles),
        removedInventoryDigest: identity('removed-inventory', p.removedSourceFiles),
        resourceDigest: identity('resource', {
          resourceBudget: p.resourceBudget,
          deadlineEpochMs: p.deadlineEpochMs,
        }),
        retainedPathsDigest: identity('retained-paths', c.retainedPaths),
        requestShapeDifferences: mismatch ? ['expectedActivation'] : [],
      };
    })
    .sort((a, b) => order(a.id, b.id));
  const missingToolIdentities = [];
  for (const [key, value] of Object.entries(draft.tooling)) {
    if (value === null) missingToolIdentities.push(key);
    else read(value.path);
  }
  const unresolvedObligations = [
    'TRUSTED_CONTEXT_REQUIRED',
    'EXECUTION_SCOPE_REQUIRED',
    'PROCESS_ACQUISITION_REQUIRED',
    'PROFILE_APPROVAL_REQUIRED',
    'FULL_CODE_SYNTAX_STORE_PROOF_REQUIRED',
    'TOOL_IDENTITIES_UNQUALIFIED',
    'ORACLE_PROVENANCE_REQUIRED',
  ];
  if (cases.some((c) => c.requestShapeDifferences.length))
    unresolvedObligations.push('SCENARIO_REBIND_REQUIRED');
  if (missingToolIdentities.length) unresolvedObligations.push('TOOL_IDENTITIES_MISSING');
  return {
    report: {
      schemaVersion: 1,
      kind: 'SYNTAX_QUALIFICATION_PREPARATION_ONLY',
      status: 'DRAFT',
      readiness: 'NOT_READY',
      manifestDigest: hash(raw),
      corpusDigest: hash(corpusRaw),
      cases,
      missingToolIdentities,
      unresolvedObligations: unresolvedObligations.sort(order),
      artifactsRead: reads.length,
      totalBytesRead: reads.reduce((n, r) => n + r.bytes, 0),
    },
    limits: {
      maxManifestBytes: raw.length,
      maxArtifactBytes: Math.max(...reads.slice(1).map((r) => r.bytes)),
      maxFiles: reads.length,
      maxTotalBytes: reads.reduce((n, r) => n + r.bytes, 0),
    },
    reads,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  fs.writeFileSync(
    'fixtures/phase1/syntax-qualification-draft/expected/report.json',
    JSON.stringify(authorDraft(process.cwd()).report, null, 2) + '\n',
  );
}
