import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { executeNativeRequest } from '../../providers/dist/index.js';
import { runMigrations, readAnalysisFreshness } from '../../storage/dist/index.js';
import { applyNativeFullAnalysis } from '../dist/index.js';

const request = JSON.parse(
  await readFile(
    new URL(
      '../../../fixtures/ipc/protocol-v1/analyze-java-basic-v1/request.jsonl',
      import.meta.url,
    ),
    'utf8',
  ),
);
const manifestUrl = new URL('../../storage/migrations/repository/manifest.json', import.meta.url);
const helper = fileURLToPath(
  new URL('../../providers/test/fixtures/native-client-child.mjs', import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const nativeBinary = join(
  process.env.CARGO_TARGET_DIR
    ? resolve(repositoryRoot, process.env.CARGO_TARGET_DIR)
    : join(repositoryRoot, 'target'),
  'debug',
  process.platform === 'win32' ? 'codeatlas-native-analyzer.exe' : 'codeatlas-native-analyzer',
);
const descriptor = {
  providerId: 'native',
  providerVersion: '1',
  runtimeVersion: '1',
  protocolVersions: [1],
  irSchemaVersions: [1],
  capabilities: ['SYMBOL'],
  languages: [
    { languageId: 'java', grammarVersion: '1', analyzerVersion: '1', compatibilityVersion: '1' },
  ],
  limits: { maxLineBytes: 1_000_000, maxEventCount: 10_000, maxTotalBytes: 10_000_000 },
  build: { target: 'test', profile: 'debug' },
};

function options(scenario) {
  const allowedEnvironment = Object.fromEntries(
    ['SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]]),
  );
  return {
    executablePath: process.execPath,
    arguments: [helper, scenario],
    timeoutMs: 3_000,
    allowedEnvironment,
  };
}

async function withDatabase(run, sourceRequest = request) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-runtime-apply-'));
  const databasePath = join(directory, 'repo.sqlite');
  try {
    await runMigrations({ databasePath, databaseKind: 'REPOSITORY', manifestUrl });
    const db = new DatabaseSync(databasePath);
    try {
      const { repository, revision, sourceFiles } = sourceRequest.payload;
      db.prepare('INSERT INTO repository (slot, id, root_path) VALUES (1, ?, ?)').run(
        repository.id,
        repository.rootPath,
      );
      db.prepare('INSERT INTO repository_state (repository_id) VALUES (?)').run(repository.id);
      db.prepare(
        'INSERT INTO revisions (id, repository_id, kind, content_fingerprint, base_revision_id) VALUES (?, ?, ?, ?, ?)',
      ).run(
        revision.id,
        repository.id,
        revision.kind,
        revision.contentFingerprint,
        revision.baseRevisionId,
      );
      const insert = db.prepare(`INSERT INTO source_files
        (revision_id, id, repository_id, path, content_fingerprint, role, provenance, content_kind, language_hint, sensitivity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const file of sourceFiles)
        insert.run(
          file.revisionId,
          file.id,
          file.repositoryId,
          file.path,
          file.contentFingerprint,
          file.classification.role,
          file.classification.provenance,
          file.classification.contentKind,
          file.languageHint,
          file.sensitivity,
        );
      await run(db);
    } finally {
      db.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('runtime composes successful zero-fact Native stream into one active revision', async () => {
  await withDatabase(async (db) => {
    await applyNativeFullAnalysis(db, request, options('valid-analyze'), descriptor);
    assert.equal(readAnalysisFreshness(db, request.payload.repository.id), 'CURRENT');
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
  });
});

test(
  'real Native Java Fixture activates persisted nodes, support, and coverage',
  { skip: !existsSync(nativeBinary) },
  async (context) => {
    const sourceRoot = fileURLToPath(
      new URL('../../../fixtures/native/java-basic-symbol/source/', import.meta.url),
    );
    const source = await readFile(join(sourceRoot, 'src', 'Basic.java'));
    const coverage = JSON.parse(
      await readFile(
        new URL(
          '../../../fixtures/native/java-basic-symbol/expected/coverage.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const nativeRequest = structuredClone(request);
    nativeRequest.requestId = 'runtime-real-java-basic';
    nativeRequest.payload.repository.rootPath = sourceRoot;
    nativeRequest.payload.requestedCapabilities = ['SYMBOL'];
    nativeRequest.payload.sourceFiles = [
      {
        id: coverage[0].sourceFileId,
        repositoryId: nativeRequest.payload.repository.id,
        revisionId: nativeRequest.payload.revision.id,
        path: 'src/Basic.java',
        contentFingerprint: `sha256:${createHash('sha256').update(source).digest('hex')}`,
        classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
        languageHint: 'java',
        sensitivity: 'PUBLIC',
      },
    ];
    const binary = nativeBinary;
    const described = await executeNativeRequest(
      {
        protocolVersion: 1,
        requestId: 'runtime-describe',
        type: 'DESCRIBE',
        payload: { clientProtocolVersions: [1], clientIrSchemaVersions: [1] },
      },
      { executablePath: binary, timeoutMs: 5_000 },
    );
    assert.equal(described.terminal.type, 'DESCRIBE_COMPLETED');
    await withDatabase(async (db) => {
      const started = performance.now();
      let peakNodeRssBytes = process.memoryUsage().rss;
      const sample = setInterval(() => {
        peakNodeRssBytes = Math.max(peakNodeRssBytes, process.memoryUsage().rss);
      }, 5);
      try {
        await applyNativeFullAnalysis(
          db,
          nativeRequest,
          { executablePath: binary, arguments: ['--parse-workers', '1'], timeoutMs: 10_000 },
          described.terminal.payload,
        );
      } finally {
        clearInterval(sample);
      }
      peakNodeRssBytes = Math.max(peakNodeRssBytes, process.memoryUsage().rss);
      context.diagnostic(
        `Cold Index Java basic SYMBOL: applyTotalMs=${(performance.now() - started).toFixed(1)}, sampledPeakNodeRssBytes=${peakNodeRssBytes} (Native child excluded)`,
      );
      assert.equal(readAnalysisFreshness(db, nativeRequest.payload.repository.id), 'CURRENT');
      assert.ok(db.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n > 0);
      assert.ok(
        db.prepare("SELECT count(*) AS n FROM evidence WHERE status = 'ACTIVE'").get().n > 0,
      );
      assert.equal(
        db.prepare('SELECT count(*) AS n FROM analysis_coverage').get().n,
        coverage.length,
      );
    }, nativeRequest);
  },
);

test('runtime rejects PARTIAL without changing the previously active graph', async () => {
  await withDatabase(async (db) => {
    await applyNativeFullAnalysis(db, request, options('valid-analyze'), descriptor);
    const before = db.prepare('SELECT * FROM repository_state').get();
    await assert.rejects(
      applyNativeFullAnalysis(db, request, options('partial-analyze'), descriptor),
    );
    assert.deepEqual(db.prepare('SELECT * FROM repository_state').get(), before);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
  });
});

test('runtime retains the active graph on analyzer failure and cancellation', async () => {
  await withDatabase(async (db) => {
    await applyNativeFullAnalysis(db, request, options('valid-analyze'), descriptor);
    const before = db.prepare('SELECT * FROM repository_state').get();
    const snapshots = db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n;
    await assert.rejects(
      applyNativeFullAnalysis(db, request, options('analyzer-failed'), descriptor),
    );
    const controller = new AbortController();
    const cancelled = applyNativeFullAnalysis(
      db,
      request,
      { ...options('hang'), signal: controller.signal, timeoutMs: 3_000 },
      descriptor,
    );
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(cancelled, { code: 'CANCELLED' });
    assert.deepEqual(db.prepare('SELECT * FROM repository_state').get(), before);
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, snapshots);
  });
});

test('runtime preserves the old graph as STALE after source changes during analysis', async () => {
  await withDatabase(async (db) => {
    await applyNativeFullAnalysis(db, request, options('valid-analyze'), descriptor);
    db.prepare('UPDATE revisions SET content_fingerprint = ? WHERE id = ?').run(
      'sha256:changed-source',
      request.payload.revision.id,
    );
    assert.equal(readAnalysisFreshness(db, request.payload.repository.id), 'STALE');
    await assert.rejects(
      applyNativeFullAnalysis(db, request, options('valid-analyze'), descriptor),
      /Source revision changed/,
    );
    assert.equal(readAnalysisFreshness(db, request.payload.repository.id), 'STALE');
    assert.equal(db.prepare('SELECT count(*) AS n FROM provider_snapshots').get().n, 1);
  });
});
