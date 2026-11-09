// Self-owned fixture host only; count37 is not a real tokenizer or production authorization.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createOwnedBusinessTraceMcpServer } from '../dist/owned-business-stdio.js';

import { createOwnedBusinessTraceSession } from '@codeatlas/agent-api';
const fixture = JSON.parse(
  readFileSync(
    new URL('../../../fixtures/phase1/knowledge-identity/inputs.json', import.meta.url),
    'utf8',
  ),
).subjects.find((x) => x.name === 'BUSINESS_FLOW');
const existing = structuredClone(fixture.existing),
  revision = existing.revisionEnvelope.payload;
const canonical = (v) =>
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
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ref = { itemId: existing.itemEnvelope.payload.id, revisionId: revision.id };
const queryResult = {
  kind: 'OWNED_TEST_PUBLICATION',
  workspaceId: 'workspace:one',
  selectionDigest: sha(
    'codeatlas.offline-knowledge.selection.v1\0' +
      canonical({ workspaceId: 'workspace:one', refs: [ref] }),
  ),
  records: [
    {
      itemEnvelope: existing.itemEnvelope,
      revisionEnvelope: existing.revisionEnvelope,
      referenceContext: existing.referenceContext,
      coverage: fixture.candidate.candidateEnvelope.payload.coverage,
      provenance: {
        attemptId: 'owned-public-business:synthetic',
        runId: revision.compilationRunId,
        snapshotId: revision.inputSnapshotRef.id,
        revisionSetId: revision.revisionSetId,
        evaluationId: revision.evaluationRef.id,
      },
      currentHeadRevisionId: revision.id,
      isCurrentHead: true,
      warnings: ['LIVE_SOURCE_NOT_OBSERVED'],
    },
  ],
  productionQuery: 'NOT_AUTHORIZED',
  quality: 'NOT_EVALUABLE',
};
const limits = {
  maxDepth: 20,
  maxSteps: 20,
  maxEdges: 20,
  maxOutputBytes: 1000000,
  maxTokens: 1000,
};
const mode = process.argv[2] ?? 'normal';
const api = createOwnedBusinessTraceSession({
  workspaceId: 'workspace:one',
  repositoryIds: ['repo:one'],
  limits,
  authorize() {
    if (mode === 'denied') throw Error('SECRET private-path');
  },
  knowledgeQuery: async () => {
    if (mode === 'slow' || mode === 'deadline')
      await new Promise((resolve) => setTimeout(resolve, 80));
    return queryResult;
  },
  tokenCounter:
    mode === 'no-counter'
      ? null
      : {
          kind: 'EXACT_LOCAL_COUNTER',
          policyRef: 'fixture:business-trace:OWNED_TEST_ONLY:v1',
          measure: (text) => ({
            policyRef: 'fixture:business-trace:OWNED_TEST_ONLY:v1',
            contentDigest: sha(text),
            outputTokens: 37,
          }),
        },
});

const app = createOwnedBusinessTraceMcpServer(
  {
    session: api,
    limits: {
      maxMessageBytes: mode === 'small-input' ? 1024 : mode === 'small-output' ? 3000 : 2000000,
      maxConcurrentCalls: mode === 'slow' ? 1 : 4,
      maxItems: 1000000,
      maxDepth: 100,
      requestTimeoutMs: mode === 'deadline' ? 1 : 10000,
    },
  },
  { input: process.stdin, output: process.stdout },
);
await app.start();
process.stderr.write('OWNED_FIXTURE_READY\n');
const final = await app.completion;
process.stderr.write('OWNED_FIXTURE_' + final.cleanupState + '\n');
