import { createHash } from 'node:crypto';

const scenario = process.argv[2];

if (scenario === 'early-close') process.exit(7);
if (scenario === 'slow-stdin') await new Promise((resolve) => setTimeout(resolve, 100));

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const requestBytes = Buffer.concat(chunks);
const request = JSON.parse(requestBytes.subarray(0, -1).toString('utf8'));

const line = (event) => Buffer.from(`${JSON.stringify(event)}\n`, 'utf8');
const write = (bytes) =>
  new Promise((resolve, reject) => {
    process.stdout.write(bytes, (error) => (error ? reject(error) : resolve()));
  });
const checksum = (records) =>
  `sha256:${createHash('sha256').update(Buffer.concat(records)).digest('hex')}`;

function envelope(type, sequence, payload, requestId = request.requestId) {
  return { protocolVersion: 1, requestId, sequence, type, payload };
}

function describeEvent({ profile = 'debug', requestId = request.requestId, sequence = 0 } = {}) {
  return envelope(
    'DESCRIBE_COMPLETED',
    sequence,
    {
      providerId: 'native',
      providerVersion: '0.0.0',
      runtimeVersion: '0.0.0',
      protocolVersions: [1],
      irSchemaVersions: [1],
      capabilities: ['protocol-handshake'],
      languages: [
        {
          languageId: 'java',
          grammarVersion: '0.0.0',
          analyzerVersion: '0.0.0',
          compatibilityVersion: '1',
        },
      ],
      limits: {
        maxLineBytes: 1_000_000,
        maxEventCount: 10_000,
        maxTotalBytes: 10_000_000,
      },
      build: { target: 'test', profile },
    },
    requestId,
  );
}

const describeLine = line(describeEvent());

function analysisRecords(sourceFileCount = 0) {
  const context = {
    providerSnapshotId: request.payload.providerSnapshotId,
    repositoryId: request.payload.repository.id,
    revisionId: request.payload.revision.id,
    revisionFingerprint: request.payload.revision.contentFingerprint,
  };
  const records = [line(envelope('ANALYSIS_STARTED', 0, context))];
  const sourceFile = request.payload.sourceFiles[0];
  for (let index = 0; index < sourceFileCount; index += 1) {
    records.push(line(envelope('SOURCE_FILE', index + 1, sourceFile)));
  }
  records.push(
    line(
      envelope('ANALYSIS_COMPLETED', records.length, {
        ...context,
        outcome: 'SUCCEEDED',
        counts: {
          sourceFiles: sourceFileCount,
          nodes: 0,
          edges: 0,
          coverage: 0,
          diagnostics: 0,
        },
        capabilities: [],
        contentFingerprint: 'analysis-output-fp',
        integrityChecksum: checksum(records),
      }),
    ),
  );
  return records;
}

if (
  [
    'valid-describe',
    'line-boundary',
    'line-oversize',
    'total-boundary',
    'total-oversize',
    'event-boundary',
  ].includes(scenario)
) {
  await write(describeLine);
} else if (scenario === 'malformed-json') {
  await write(Buffer.from('{not-json}\n'));
} else if (scenario === 'invalid-utf8') {
  await write(Buffer.from([0xff, 0x0a]));
} else if (scenario === 'bom') {
  await write(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), describeLine]));
} else if (scenario === 'crlf') {
  await write(Buffer.concat([describeLine.subarray(0, -1), Buffer.from('\r\n')]));
} else if (scenario === 'blank-line') {
  await write(Buffer.from('\n'));
} else if (scenario === 'wrong-request-id') {
  await write(line(describeEvent({ requestId: 'wrong-request' })));
} else if (scenario === 'out-of-order') {
  await write(line(describeEvent({ sequence: 1 })));
} else if (scenario === 'premature-eof') {
  await write(
    line(
      envelope('ANALYSIS_STARTED', 0, {
        providerSnapshotId: request.payload.providerSnapshotId,
        repositoryId: request.payload.repository.id,
        revisionId: request.payload.revision.id,
        revisionFingerprint: request.payload.revision.contentFingerprint,
      }),
    ),
  );
} else if (scenario === 'analyze-post-terminal') {
  await write(Buffer.concat([...analysisRecords(), Buffer.from('{}\n')]));
} else if (scenario === 'partial-analyze') {
  const records = analysisRecords();
  const terminal = JSON.parse(records.at(-1).toString('utf8'));
  terminal.payload.outcome = 'PARTIAL';
  records[records.length - 1] = line(terminal);
  await write(Buffer.concat(records));
} else if (scenario === 'count-mismatch' || scenario === 'sequence-drift') {
  const records = analysisRecords();
  const terminal = JSON.parse(records.at(-1).toString('utf8'));
  if (scenario === 'count-mismatch') terminal.payload.counts.nodes = 1;
  else terminal.sequence += 1;
  records[records.length - 1] = line(terminal);
  await write(Buffer.concat(records));
} else if (scenario === 'post-terminal') {
  await write(Buffer.concat([describeLine, Buffer.from('{}\n')]));
} else if (scenario === 'event-oversize') {
  await write(Buffer.concat([describeLine, describeLine]));
} else if (scenario === 'byte-at-a-time') {
  for (const byte of line(describeEvent({ profile: 'débug' }))) {
    await write(Buffer.from([byte]));
  }
} else if (scenario === 'environment') {
  const allowed = new Set(['LANG', 'LC_ALL', 'NO_COLOR', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']);
  const leaked = Object.entries(process.env)
    .filter(
      ([name, value]) =>
        !allowed.has(name.toUpperCase()) &&
        value !== '' &&
        name.toUpperCase() !== 'NUMBER_OF_PROCESSORS',
    )
    .map(([name]) => name)
    .sort();
  process.stderr.write(
    `LANG=${process.env.LANG ?? '<absent>'}\nTEMP=${process.env.TEMP ?? '<absent>'}\nPATH=${process.env.PATH === '' ? '<empty>' : (process.env.PATH ?? '<absent>')}\nLEAKED=${leaked.join(',') || '<none>'}\n`,
  );
  await write(describeLine);
} else if (scenario === 'slow-stdin') {
  await write(Buffer.concat(analysisRecords()));
} else if (scenario === 'burst-output') {
  await write(Buffer.concat(analysisRecords(1_000)));
} else if (scenario === 'stderr') {
  process.stderr.write('native diagnostic\n');
  await write(describeLine);
} else if (scenario === 'stderr-oversize') {
  process.stderr.write('12345678901234567');
  await write(describeLine);
} else if (scenario === 'nonzero-exit') {
  process.exitCode = 7;
} else if (scenario === 'hang') {
  setInterval(() => {}, 1_000);
} else if (scenario === 'abort-close-race') {
  await write(describeLine);
  await new Promise((resolve) => setTimeout(resolve, 100));
} else if (scenario === 'valid-analyze') {
  await write(Buffer.concat(analysisRecords()));
} else if (scenario === 'invalid-checksum' || scenario === 'checksum-mismatch') {
  const records = analysisRecords();
  const terminal = JSON.parse(records.at(-1).toString('utf8'));
  terminal.payload.integrityChecksum =
    scenario === 'invalid-checksum' ? 'not-a-sha256' : `sha256:${'0'.repeat(64)}`;
  records[records.length - 1] = line(terminal);
  await write(Buffer.concat(records));
} else if (scenario === 'analyzer-failed') {
  const context = {
    providerSnapshotId: request.payload.providerSnapshotId,
    repositoryId: request.payload.repository.id,
    revisionId: request.payload.revision.id,
    revisionFingerprint: request.payload.revision.contentFingerprint,
  };
  await write(
    Buffer.concat([
      line(envelope('ANALYSIS_STARTED', 0, context)),
      line(
        envelope('ANALYSIS_FAILED', 1, {
          ...context,
          error: {
            code: 'INTERNAL_ANALYZER_FAILURE',
            message: 'Analyzer failed',
            retryable: true,
          },
        }),
      ),
    ]),
  );
} else if (
  [
    'valid-analyze-v2',
    'version-mismatch-v2',
    'invalid-coverage-v2',
    'checksum-mismatch-v2',
  ].includes(scenario)
) {
  const sourceFile = request.payload.sourceFiles[0];
  const context = {
    providerSnapshotId: request.payload.providerSnapshotId,
    repositoryId: request.payload.repository.id,
    revisionId: request.payload.revision.id,
    revisionFingerprint: request.payload.revision.contentFingerprint,
  };
  const v2Envelope = (type, sequence, payload) => ({
    protocolVersion: 2,
    requestId: request.requestId,
    sequence,
    type,
    payload,
  });
  const records = [
    line(v2Envelope('ANALYSIS_STARTED', 0, context)),
    line(v2Envelope('SOURCE_FILE', 1, sourceFile)),
    line(
      v2Envelope('COVERAGE', 2, {
        capability: request.payload.requestedCapabilities[0],
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
      }),
    ),
  ];
  const terminal = v2Envelope('ANALYSIS_COMPLETED', 3, {
    ...context,
    outcome: 'SUCCEEDED',
    counts: { sourceFiles: 1, nodes: 0, edges: 0, coverage: 1, diagnostics: 0 },
    capabilities: [
      {
        name: request.payload.requestedCapabilities[0],
        support: 'SUPPORTED',
        coverage: 'COMPLETE',
      },
    ],
    contentFingerprint: 'v2-content',
    integrityChecksum: checksum(records),
  });
  if (scenario === 'version-mismatch-v2') {
    const mismatched = JSON.parse(records[2].toString('utf8'));
    mismatched.protocolVersion = 1;
    records[2] = line(mismatched);
  }
  if (scenario === 'invalid-coverage-v2') {
    const invalid = JSON.parse(records[2].toString('utf8'));
    invalid.payload.statistics.eligibleSites = 1;
    records[2] = line(invalid);
  }
  if (scenario === 'checksum-mismatch-v2')
    terminal.payload.integrityChecksum = `sha256:${'0'.repeat(64)}`;
  await write(Buffer.concat([...records, line(terminal)]));
} else {
  process.stderr.write('unknown native-client test scenario\n');
  process.exitCode = 2;
}
