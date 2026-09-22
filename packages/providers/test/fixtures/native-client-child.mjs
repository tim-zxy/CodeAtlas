const scenario = process.argv[2];
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const requestBytes = Buffer.concat(chunks);
const request = JSON.parse(requestBytes.subarray(0, -1).toString('utf8'));

const line = (event) => Buffer.from(`${JSON.stringify(event)}\n`, 'utf8');
const write = (bytes) =>
  new Promise((resolve, reject) => {
    process.stdout.write(bytes, (error) => (error ? reject(error) : resolve()));
  });

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

if (
  ['valid-describe', 'line-boundary', 'line-oversize', 'total-boundary', 'total-oversize', 'event-boundary'].includes(
    scenario,
  )
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
} else if (scenario === 'post-terminal') {
  await write(Buffer.concat([describeLine, Buffer.from('{}\n')]));
} else if (scenario === 'event-oversize') {
  await write(Buffer.concat([describeLine, describeLine]));
} else if (scenario === 'byte-at-a-time') {
  for (const byte of line(describeEvent({ profile: 'débug' }))) {
    await write(Buffer.from([byte]));
  }
} else {
  process.stderr.write('unknown native-client test scenario\n');
  process.exitCode = 2;
}
