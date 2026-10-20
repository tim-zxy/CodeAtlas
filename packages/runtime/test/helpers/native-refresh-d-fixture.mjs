import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyNativePatch } from '../../../storage/test/helpers/native-refresh-patch-fixture.mjs';
import { readNativeRefreshBaseline } from '../../../storage/dist/index.js';
import { validateNativeStateCandidate } from '../../../providers/dist/index.js';
import { baseCase } from '../../../providers/test/helpers/native-full-v3-corpus.mjs';
import { createNativeRefreshPreparation } from '../../dist/native-refresh-preparation.js';

// Offline component input only; never substitutes for reviewed production admission.
export async function preparedEmptyRefresh(t) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-runtime-'));
  const databasePath = join(directory, 'repository.sqlite');
  const fixture = await emptyNativePatch(t, false, false, null, databasePath, null, '2');
  fixture.stage.close();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const original = baseCase('zero-file').request.payload;
  original.analysisStateContext.normalizerVersion = '2';
  const budget = original.resourceBudget.maxMemoryBytes;
  const descriptor = {
    providerId: 'native',
    providerVersion: '0.0.0',
    runtimeVersion: '0.0.0',
    protocolVersions: [1, 2, 3],
    irSchemaVersions: [1],
    capabilities: ['SYMBOL'],
    languages: [fixture.expected.language],
    limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
    build: { target: 'fixture', profile: 'debug' },
  };
  const invocation = {
    requestId: 'runtime-empty-refresh',
    descriptor,
    trustedContext: fixture.expected,
    payload: {
      irSchemaVersion: 1,
      providerSnapshotId: 'snap-runtime-next',
      repository: { id: 'r', rootPath: directory },
      targetRevision: original.revision,
      requestedCapabilities: ['SYMBOL'],
      deadlineEpochMs: null,
      resourceBudget: original.resourceBudget,
      analysisStateContext: original.analysisStateContext,
    },
  };
  const options = {
    executablePath: join(
      fileURLToPath(new URL('../../../../target/debug/', import.meta.url)),
      process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
    ),
    arguments: ['--parse-workers', '1'],
    timeoutMs: 3000,
    allowedEnvironment: Object.fromEntries(
      ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    ),
  };
  const limits = { maxSerializedBytes: 1_000_000, memoryBudgetBytes: budget };
  const baseline = readNativeRefreshBaseline(
    fixture.db,
    fixture.expected,
    validateNativeStateCandidate,
    limits,
  );
  const prepared = createNativeRefreshPreparation(invocation, baseline, budget, options);
  return { ...fixture, directory, databasePath, invocation, options, prepared, baseline, budget };
}
