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

if (scenario === 'valid-describe') {
  await write(
    line(
      envelope('DESCRIBE_COMPLETED', 0, {
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
        build: { target: 'test', profile: 'debug' },
      }),
    ),
  );
} else if (scenario === 'malformed-json') {
  await write(Buffer.from('{not-json}\n'));
} else {
  process.stderr.write('unknown native-client test scenario\n');
  process.exitCode = 2;
}
