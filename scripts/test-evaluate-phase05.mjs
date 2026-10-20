import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  link,
  cp,
  mkdir,
  symlink,
  rename,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { RepositorySourceStateStore } from '../packages/storage/dist/index.js';
import { createQueryControl } from '../packages/application/dist/index.js';
import { readEvaluationStateRows } from '../packages/storage/dist/analysis/evaluation-state.js';
import { withCodeQueryDatabase } from '../packages/storage/test/helpers/code-query-fixture.mjs';

const helperURL = new URL('./helpers/phase05-evaluation-fixture.mjs', import.meta.url);
let helper;
try {
  await access(helperURL);
  helper = await import(helperURL);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  helper = {};
}
const goldenURL = new URL(
  '../fixtures/evaluation/phase05-code-intelligence/expected/performance.json',
  import.meta.url,
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const evaluationReadBudget = {
  maxMetadataRows: 5000,
  maxResultBytes: 1_000_000,
  timeoutMs: 10_000,
};

for (const mode of ['published', 'retained']) {
  test(`Native ${mode} reader borrows the real session snapshot without a nested BEGIN`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-borrowed-snapshot-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-test-module-mocks',
        fileURLToPath(new URL('./fixtures/phase05-borrowed-snapshot.mjs', import.meta.url)),
        mode,
        root,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      mode,
      rowBoundaryReached: true,
      qualified: false,
    });
  });
}

test('pinned source repository applies declared add modify delete and refuses an altered baseline', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-pinned-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(typeof helper.preparePhase05PinnedRepository, 'function');
  const input = {
    directory: path.join(root, 'case'),
    baseline: { 'src/A.java': Buffer.from('class A {}\n'), 'B.java': Buffer.from('class B {}\n') },
    target: {
      'src/A.java': Buffer.from('class A { int n; }\n'),
      'C.java': Buffer.from('class C {}\n'),
    },
  };
  const prepared = await helper.preparePhase05PinnedRepository(input);
  input.target['C.java'].fill(0); // prepared bytes must not alias the caller
  await prepared.applyTarget();
  assert.equal(
    await readFile(path.join(prepared.repositoryRoot, 'src/A.java'), 'utf8'),
    'class A { int n; }\n',
  );
  assert.equal(
    await readFile(path.join(prepared.repositoryRoot, 'C.java'), 'utf8'),
    'class C {}\n',
  );
  await assert.rejects(access(path.join(prepared.repositoryRoot, 'B.java')));
  await assert.rejects(prepared.applyTarget());
  const altered = await helper.preparePhase05PinnedRepository({
    ...input,
    directory: path.join(root, 'altered'),
  });
  await writeFile(path.join(altered.repositoryRoot, 'B.java'), 'foreign change');
  await assert.rejects(altered.applyTarget());
  assert.equal(
    await readFile(path.join(altered.repositoryRoot, 'B.java'), 'utf8'),
    'foreign change',
  );
  assert.equal(
    await readFile(path.join(altered.repositoryRoot, 'src/A.java'), 'utf8'),
    'class A {}\n',
  );
});

test('pinned repository refuses unsafe names before output and supports an empty Git baseline', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-empty-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(typeof helper.preparePhase05PinnedRepository, 'function');
  for (const filename of ['../escape.java', '.git/config', 'a/../../escape', 'a\\b.java']) {
    await assert.rejects(
      helper.preparePhase05PinnedRepository({
        directory: path.join(root, 'unsafe'),
        baseline: { [filename]: Buffer.from('x') },
        target: {},
      }),
    );
    await assert.rejects(access(path.join(root, 'unsafe')));
  }
  const prepared = await helper.preparePhase05PinnedRepository({
    directory: path.join(root, 'empty'),
    baseline: {},
    target: { 'Added.java': Buffer.from('class Added {}\n') },
  });
  assert.ok(
    execFileSync('git', ['-C', prepared.repositoryRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
  );
  await prepared.applyTarget();
  assert.equal(
    await readFile(path.join(prepared.repositoryRoot, 'Added.java'), 'utf8'),
    'class Added {}\n',
  );
});

test('pinned transition refuses a same-path replacement repository without changing its bytes', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-replaced-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await helper.preparePhase05PinnedRepository({
    directory: path.join(root, 'case'),
    baseline: { 'A.java': Buffer.from('class A {}\n') },
    target: { 'A.java': Buffer.from('class A { int n; }\n') },
  });
  await rename(prepared.repositoryRoot, path.join(root, 'original'));
  await mkdir(prepared.repositoryRoot);
  await writeFile(path.join(prepared.repositoryRoot, 'A.java'), 'class A {}\n');
  await assert.rejects(prepared.applyTarget());
  assert.equal(
    await readFile(path.join(prepared.repositoryRoot, 'A.java'), 'utf8'),
    'class A {}\n',
  );
});

test('published Native qualification refuses before opening SQL when the exact READ_SEAL profile is absent', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-native-read-refusal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, 'missing.sqlite');
  await assert.rejects(
    helper.readPhase05PublishedState({
      databasePath,
      repositoryId: 'repo',
      repositoryRoot: root,
      budget: evaluationReadBudget,
      native: {
        expected: {
          repositoryId: 'repo',
          revisionId: 'worktree',
          contentFingerprint: 'fingerprint',
          providerId: 'native',
          providerVersion: '1',
          language: {
            languageId: 'java',
            grammarVersion: '0.23.5',
            analyzerVersion: '1',
            compatibilityVersion: '1',
          },
          resolverVersion: '1',
          normalizerVersion: '2',
          policyFingerprint: 'policy',
          requestedCapabilities: ['SYMBOL'],
        },
        limits: { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16 },
      },
    }),
    (error) => error.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
  );
  await assert.rejects(access(databasePath), { code: 'ENOENT' });
});

test('published Native qualification rejects a caller-owned workspace reservation without executing accessors', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-native-read-control-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let reads = 0;
  const native = {
    limits: { maxSerializedBytes: 1_000_000, memoryBudgetBytes: 16, workspaceReservationBytes: 0 },
  };
  Object.defineProperty(native, 'expected', {
    enumerable: true,
    get() {
      reads++;
      throw new Error('untrusted accessor');
    },
  });
  await assert.rejects(
    helper.readPhase05PublishedState({
      databasePath: path.join(root, 'missing.sqlite'),
      repositoryId: 'repo',
      repositoryRoot: root,
      budget: evaluationReadBudget,
      native,
    }),
    /Invalid Evaluation Native controls/,
  );
  assert.equal(reads, 0);
  assert.deepEqual(await readdir(root), []);
});

// The declared patch has zero COVERAGE events; its PARTIAL capability metadata
// must not be fabricated into additional per-file coverage rows.
for (const [scenario, supportCount, coverageCount] of [
  ['current', 20, 2],
  ['multi-provider', 40, 2],
]) {
  test(`published state reader returns the complete ${scenario} Store image without writing`, async (t) => {
    assert.equal(typeof helper.readPhase05PublishedState, 'function');
    await withCodeQueryDatabase(t, scenario, async ({ databasePath, repositoryId }) => {
      const before = await readFile(databasePath);
      const image = await helper.readPhase05PublishedState({
        databasePath,
        repositoryId,
        repositoryRoot: path.dirname(databasePath),
        budget: evaluationReadBudget,
      });
      const golden = JSON.parse(
        await readFile(
          new URL('../fixtures/queries/code-query/expected/graph.json', import.meta.url),
          'utf8',
        ),
      );
      assert.deepEqual(
        image.supports.facts.nodes
          .map(({ id, kind, name }) => ({ id, kind, name }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        golden.nodes,
      );
      assert.equal(image.supports.facts.edges.length, 12);
      assert.equal(image.supports.sourceFiles.length, 1);
      for (const field of ['bindings', 'factEvidence', 'candidates'])
        assert.equal(image.supports[field].length, supportCount);
      assert.equal(image.coverage.observations.length, coverageCount);
      assert.deepEqual(image.coverage.nativeStates, []);
      assert.equal(image.coverage.baseline, 'MISSING');
      assert.equal(image.indexed.contentFingerprint, image.revision.contentFingerprint);
      assert.deepEqual(await readFile(databasePath), before);
    });
  });
}

for (const scenario of ['stale', 'not-indexed']) {
  test(`published state reader refuses ${scenario} instead of qualifying the retained graph`, async (t) => {
    assert.equal(typeof helper.readPhase05PublishedState, 'function');
    await withCodeQueryDatabase(t, scenario, async ({ databasePath, repositoryId }) => {
      const before = await readFile(databasePath);
      await assert.rejects(
        helper.readPhase05PublishedState({
          databasePath,
          repositoryId,
          repositoryRoot: path.dirname(databasePath),
          budget: evaluationReadBudget,
        }),
      );
      assert.deepEqual(await readFile(databasePath), before);
    });
  });
}

for (const defect of [
  'missing-link',
  'terminal-active',
  'wrong-provider',
  'tiny-bytes',
  'tiny-rows',
  'foreign-root',
  'coverage-file',
  'orphan-coverage',
  'bad-target-state',
  'invalid-node-subtype',
  'ambiguous-source',
]) {
  test(`published state reader refuses ${defect} and preserves the actual database`, async (t) => {
    assert.equal(typeof helper.readPhase05PublishedState, 'function');
    await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
      const db = new DatabaseSync(databasePath);
      try {
        if (defect === 'missing-link')
          db.exec('DELETE FROM fact_evidence WHERE rowid=(SELECT min(rowid) FROM fact_evidence)');
        if (defect === 'terminal-active')
          db.exec(
            "UPDATE evidence SET status='SUPERSEDED' WHERE rowid=(SELECT min(rowid) FROM evidence)",
          );
        if (defect === 'wrong-provider')
          db.exec(
            "UPDATE provider_fact_bindings SET provider_id='foreign' WHERE rowid=(SELECT min(rowid) FROM provider_fact_bindings)",
          );
        if (defect === 'coverage-file')
          db.exec(
            "UPDATE analysis_coverage SET source_file_id='absent' WHERE id=(SELECT min(id) FROM analysis_coverage)",
          );
        if (defect === 'orphan-coverage') {
          db.exec('PRAGMA foreign_keys=OFF');
          db.exec(
            "INSERT INTO analysis_coverage(provider_snapshot_id,capability_name,source_file_id,status) SELECT 'missing-snapshot',capability_name,source_file_id,status FROM analysis_coverage LIMIT 1",
          );
        }
        if (defect === 'bad-target-state' || defect === 'invalid-node-subtype')
          db.exec('PRAGMA ignore_check_constraints=ON');
        if (defect === 'bad-target-state')
          db.exec(
            "UPDATE canonical_edges SET target_state='UNKNOWN' WHERE rowid=(SELECT min(rowid) FROM canonical_edges WHERE target_state='UNRESOLVED')",
          );
        if (defect === 'invalid-node-subtype')
          db.exec(
            "UPDATE canonical_nodes SET type_kind='CLASS' WHERE rowid=(SELECT min(rowid) FROM canonical_nodes WHERE kind='SYMBOL')",
          );
        if (defect === 'ambiguous-source')
          db.prepare(
            "INSERT INTO revisions(id,repository_id,kind,content_fingerprint,base_revision_id) VALUES(?,?,'WORKTREE',?,NULL)",
          ).run('other-worktree', repositoryId, 'other-source');
      } finally {
        db.close();
      }
      const before = await readFile(databasePath);
      const budget = { ...evaluationReadBudget };
      if (defect === 'tiny-bytes') budget.maxResultBytes = 1;
      if (defect === 'tiny-rows') budget.maxMetadataRows = 1;
      await assert.rejects(
        helper.readPhase05PublishedState({
          databasePath,
          repositoryId,
          repositoryRoot: defect === 'foreign-root' ? tmpdir() : path.dirname(databasePath),
          budget,
        }),
      );
      assert.deepEqual(await readFile(databasePath), before);
    });
  });
}

test('published state reader leaves large unvalidated Native payloads unread and explicitly unverified', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(`INSERT INTO native_analysis_state(repository_id,provider_id,provider_snapshot_id,revision_id,content_fingerprint,header_json)
        SELECT repository_id,provider_id,id,requested_revision_id,requested_revision_fingerprint,'{}' FROM provider_snapshots`);
      db.prepare('UPDATE native_analysis_state SET header_json=?').run(
        JSON.stringify({ unvalidated: 'x'.repeat(1_000_000) }),
      );
    } finally {
      db.close();
    }
    const before = await readFile(databasePath);
    const image = await helper.readPhase05PublishedState({
      databasePath,
      repositoryId,
      repositoryRoot: path.dirname(databasePath),
      budget: { ...evaluationReadBudget, maxResultBytes: 100_000 },
    });
    assert.equal(image.coverage.baseline, 'PRESENT_UNVERIFIED');
    assert.equal(image.coverage.nativeStates.length, 1);
    assert.deepEqual(await readFile(databasePath), before);
  });
});

test('Storage evaluation read owns one snapshot across a real concurrent Source commit', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
    const writer = new DatabaseSync(databasePath);
    writer.exec('PRAGMA journal_mode=WAL');
    const db = new DatabaseSync(databasePath, { readOnly: true });
    db.exec('PRAGMA query_only=ON');
    const budget = createQueryControl({ ...evaluationReadBudget, maxNodes: 5000, maxEdges: 5000 });
    let changed = false;
    const source = new RepositorySourceStateStore(writer),
      previous = source.load(repositoryId);
    try {
      const rows = await readEvaluationStateRows(db, repositoryId, {
        ...budget,
        async checkpoint() {
          await budget.checkpoint();
          if (db.isTransaction && !changed) {
            changed = true;
            source.replace(previous, {
              ...previous,
              revision: { ...previous.revision, contentFingerprint: 'concurrent-source' },
            });
          }
        },
      });
      assert.equal(changed, true);
      assert.equal(rows.revisions[0].content_fingerprint, previous.revision.contentFingerprint);
      assert.equal(
        rows.repository_state[0].indexed_content_fingerprint,
        previous.revision.contentFingerprint,
      );
      assert.equal(db.isTransaction, false);
      assert.equal(source.load(repositoryId).revision.contentFingerprint, 'concurrent-source');
    } finally {
      db.close();
      writer.close();
    }
    await assert.rejects(
      helper.readPhase05PublishedState({
        databasePath,
        repositoryId,
        repositoryRoot: path.dirname(databasePath),
        budget: evaluationReadBudget,
      }),
    );
  });
});

test('Storage evaluation read preserves outer transactions and original budget failures', async (t) => {
  await withCodeQueryDatabase(t, 'current', async ({ databasePath, repositoryId }) => {
    const db = new DatabaseSync(databasePath, { readOnly: true });
    db.exec('PRAGMA query_only=ON');
    const sentinel = new Error('budget refused');
    try {
      db.exec('BEGIN');
      await assert.rejects(
        readEvaluationStateRows(db, repositoryId, {
          async checkpoint() {},
          chargeMetadataRow() {},
          reserveText() {
            throw sentinel;
          },
        }),
        (error) => error === sentinel,
      );
      assert.equal(db.isTransaction, true);
      db.exec('ROLLBACK');
      await assert.rejects(
        readEvaluationStateRows(db, repositoryId, {
          async checkpoint() {},
          chargeMetadataRow() {},
          reserveText() {
            throw sentinel;
          },
        }),
        (error) => error === sentinel,
      );
      assert.equal(db.isTransaction, false);
    } finally {
      db.close();
    }
  });
});
async function sourceDigest(root) {
  const files = [];
  for (const filename of (await readdir(path.join(root, 'src'))).sort())
    files.push({
      path: 'src/' + filename,
      sha256: hash(await readFile(path.join(root, 'src', filename))),
    });
  return hash(JSON.stringify(files));
}

for (const [scenario, count] of [
  ['COLD', 0],
  ['INCREMENTAL_1', 1],
  ['INCREMENTAL_5', 5],
  ['INCREMENTAL_50', 50],
]) {
  test(`phase05 performance preparation makes owned real Git ${scenario} inputs`, async (t) => {
    assert.equal(
      typeof helper.preparePhase05PerformanceRepository,
      'function',
      'Missing owned performance preparation',
    );
    const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-inputs-'));
    t.after(() => rm(base, { recursive: true, force: true }));
    const directory = path.join(base, 'owned');
    const prepared = await helper.preparePhase05PerformanceRepository({ directory, scenario });
    const expected = JSON.parse(await readFile(goldenURL, 'utf8'));
    assert.equal((await readdir(path.join(prepared.repositoryRoot, 'src'))).length, 50);
    assert.equal(await sourceDigest(prepared.repositoryRoot), expected.baselineDigest);
    assert.equal(
      await readFile(path.join(prepared.repositoryRoot, 'src/Unit00.java'), 'utf8'),
      'package evaluation.performance;\nclass Unit00 {\n  void first() {}\n  void second() {}\n  void run() { first(); }\n}\n',
    );
    const gitArgs = ['-c', 'core.autocrlf=false', '-C', prepared.repositoryRoot];
    assert.equal(
      execFileSync('git', [...gitArgs, 'status', '--porcelain'], { encoding: 'utf8' }),
      '',
    );
    await prepared.applyTarget();
    const changed = execFileSync('git', [...gitArgs, 'diff', '--name-only'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    assert.deepEqual(
      changed,
      Array.from({ length: count }, (_, index) => `src/Unit${String(index).padStart(2, '0')}.java`),
    );
    assert.equal(
      await sourceDigest(prepared.repositoryRoot),
      expected.scenarios[scenario].targetDigest,
    );
    assert.equal((await readdir(path.join(prepared.repositoryRoot, 'src'))).length, 50);
    await assert.rejects(access(path.join(prepared.repositoryRoot, 'repository.sqlite')), {
      code: 'ENOENT',
    });
  });
}

test('phase05 performance preparation rejects an existing destination and invalid scenario before creating files', async (t) => {
  assert.equal(typeof helper.preparePhase05PerformanceRepository, 'function');
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-sentinel-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sentinel = path.join(base, 'sentinel');
  await writeFile(sentinel, 'retained');
  await assert.rejects(
    helper.preparePhase05PerformanceRepository({ directory: sentinel, scenario: 'COLD' }),
  );
  assert.equal(await readFile(sentinel, 'utf8'), 'retained');
  const missing = path.join(base, 'missing');
  await assert.rejects(
    helper.preparePhase05PerformanceRepository({ directory: missing, scenario: 'AUTOMATIC' }),
  );
  await assert.rejects(access(missing), { code: 'ENOENT' });
});

for (const mutation of ['changed-source', 'hardlinked-source']) {
  test(`phase05 target preparation refuses ${mutation} before any declared edit`, async (t) => {
    assert.equal(typeof helper.preparePhase05PerformanceRepository, 'function');
    const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-source-guard-'));
    t.after(() => rm(base, { recursive: true, force: true }));
    const prepared = await helper.preparePhase05PerformanceRepository({
      directory: path.join(base, 'owned'),
      scenario: 'INCREMENTAL_50',
    });
    const unchanged = path.join(prepared.repositoryRoot, 'src/Unit00.java');
    const before = await readFile(unchanged);
    const finalFile = path.join(prepared.repositoryRoot, 'src/Unit49.java');
    if (mutation === 'changed-source') await writeFile(finalFile, 'class Foreign {}\n');
    else await link(finalFile, path.join(base, 'foreign-link.java'));
    await assert.rejects(prepared.applyTarget(), /Performance fixture baseline changed/);
    assert.deepEqual(await readFile(unchanged), before);
  });
}

const repository = fileURLToPath(new URL('../', import.meta.url));
async function copyPinnedFixtures(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const catalog = JSON.parse(
    await readFile(
      new URL(
        '../fixtures/evaluation/phase05-code-intelligence/inputs/scenarios.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const pin of catalog.fixtures) {
    const target = path.join(root, pin.directory);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(repository, pin.directory), target, { recursive: true });
  }
  return root;
}

test('pinned reader returns verified independent bytes and does not expose mutable storage', async () => {
  assert.equal(typeof helper.capturePhase05PinnedInputs, 'function');
  const captured = await helper.capturePhase05PinnedInputs({ repositoryRoot: repository });
  assert.equal(captured.fixtures.length, 8);
  assert.deepEqual(
    captured.filePaths('java-call-basic').filter((filename) => filename.startsWith('source/')),
    ['source/src/A.java', 'source/src/B.java'],
  );
  const paths = captured.filePaths('java-call-basic');
  paths.length = 0;
  assert.equal(captured.filePaths('java-call-basic').length, 7);
  const bytes = captured.readFile('java-basic-symbol', 'source/src/Basic.java');
  const original = Buffer.from(bytes);
  bytes.fill(0);
  assert.deepEqual(captured.readFile('java-basic-symbol', 'source/src/Basic.java'), original);
  assert.throws(() => captured.readFile('java-basic-symbol', '../fixture.json'));
  await captured.assertUnchanged();
});

for (const mutation of ['source', 'golden', 'extra', 'hardlink']) {
  test(`pinned reader refuses physical ${mutation} before returning evidence`, async (t) => {
    assert.equal(typeof helper.capturePhase05PinnedInputs, 'function');
    const root = await copyPinnedFixtures(t);
    const filename = path.join(
      root,
      'fixtures/native/java-basic-symbol',
      mutation === 'golden' ? 'expected/nodes.json' : 'source/src/Basic.java',
    );
    if (mutation === 'hardlink') await link(filename, path.join(root, 'foreign.java'));
    else if (mutation === 'extra')
      await writeFile(path.join(path.dirname(filename), 'Extra.java'), 'class Extra {}');
    else await writeFile(filename, Buffer.concat([await readFile(filename), Buffer.from('\n')]));
    await assert.rejects(
      helper.capturePhase05PinnedInputs({ repositoryRoot: root }),
      /Pinned fixture/,
    );
  });
}

test('pinned reader detects changed oracle after capture while retaining original bytes', async (t) => {
  assert.equal(typeof helper.capturePhase05PinnedInputs, 'function');
  const root = await copyPinnedFixtures(t);
  const captured = await helper.capturePhase05PinnedInputs({ repositoryRoot: root });
  const original = captured.readFile('java-basic-symbol', 'expected/nodes.json');
  await writeFile(path.join(root, 'fixtures/native/java-basic-symbol/expected/nodes.json'), '[]');
  await assert.rejects(captured.assertUnchanged(), /Pinned fixture/);
  assert.deepEqual(captured.readFile('java-basic-symbol', 'expected/nodes.json'), original);
});

const reportVectorURL = new URL(
  '../packages/evaluation/test/fixtures/phase05-report-vectors.json',
  import.meta.url,
);
test('report persistence retains unsuccessful observations in a closed new artifact', async (t) => {
  assert.equal(typeof helper.persistPhase05Report, 'function');
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-report-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const vector = JSON.parse(await readFile(reportVectorURL, 'utf8')).missingRun;
  const reportPath = await helper.persistPhase05Report({
    directory: path.join(base, 'owned'),
    input: vector,
  });
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.overall, 'FAIL');
  assert.equal(report.missingRuns.length, 1);
  assert.deepEqual(report.observations, vector.observations);
  await assert.rejects(
    helper.persistPhase05Report({ directory: path.dirname(reportPath), input: vector }),
  );
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
});

test('report persistence refuses invalid controls without adopting an existing sentinel', async (t) => {
  assert.equal(typeof helper.persistPhase05Report, 'function');
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-report-control-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sentinel = path.join(base, 'sentinel');
  await writeFile(sentinel, 'retained');
  const vector = JSON.parse(await readFile(reportVectorURL, 'utf8')).missingRun;
  await assert.rejects(helper.persistPhase05Report({ directory: sentinel, input: vector }));
  assert.equal(await readFile(sentinel, 'utf8'), 'retained');
  const missing = path.join(base, 'missing');
  await assert.rejects(
    helper.persistPhase05Report({ directory: missing, input: { ...vector, extra: true } }),
  );
  await assert.rejects(access(missing), { code: 'ENOENT' });
  await assert.rejects(
    helper.persistPhase05Report({ directory: 'relative-output', input: vector }),
  );
});

test('evidence IO refuses linked input root and linked output parent', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-linked-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const real = path.join(base, 'real');
  const alias = path.join(base, 'alias');
  await mkdir(real);
  await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(helper.capturePhase05PinnedInputs({ repositoryRoot: alias }), /canonical/);
  const vector = JSON.parse(await readFile(reportVectorURL, 'utf8')).missingRun;
  await assert.rejects(
    helper.persistPhase05Report({ directory: path.join(alias, 'report'), input: vector }),
    /canonical/,
  );
  assert.deepEqual(await readdir(real), []);
});

async function independentCanonicalReference() {
  const root = new URL('../fixtures/normalization/canonical-normalization/', import.meta.url);
  const input = JSON.parse(await readFile(new URL('inputs/result.json', root), 'utf8'));
  // A declared call subset, not an invented merged image of Provider pairs.
  const pairs = JSON.parse(await readFile(new URL('expected/nodes.json', root), 'utf8'));
  const nodes = ['method-run', 'ctor-a'].map(
    (id) => pairs.find((pair) => pair.provider.providerFactId === id).canonical,
  );
  const edges = [
    JSON.parse(await readFile(new URL('expected/edges.json', root), 'utf8')).find(
      (pair) => pair.provider.providerFactId === 'call-ctor',
    ).canonical,
  ];
  const expected = { sourceFiles: input.request.payload.sourceFiles, facts: { nodes, edges } };
  return {
    expected,
    actual: structuredClone(expected),
    criticalSymbols: [],
    criticalDirectCalls: [],
  };
}

async function independentSupportReference() {
  const { expected } = await independentCanonicalReference();
  const snapshots = [
    {
      id: 'snapshot-reference',
      repositoryId: 'repo-fixture',
      providerId: 'native',
      providerVersion: '1',
      runtimeVersion: '1',
      requestedRevisionId: 'rev-fixture',
      requestedRevisionFingerprint: 'sha256:reference',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      capabilities: [],
      diagnostics: [],
      outcome: 'SUCCEEDED',
    },
  ];
  const evidence = [],
    bindings = [],
    factEvidence = [],
    candidates = [];
  for (const [index, candidate] of [...expected.facts.nodes, ...expected.facts.edges].entries()) {
    const factType = index < 2 ? 'NODE' : 'EDGE';
    const providerFact = {
      factType,
      providerId: 'native',
      providerFactId: ['method-run', 'ctor-a', 'call-ctor'][index],
    };
    const fact = { factType, id: candidate.id };
    const evidenceId = ['evidence-method', 'evidence-constructor', 'evidence-call'][index];
    evidence.push({
      id: evidenceId,
      repositoryId: 'repo-fixture',
      revisionId: 'rev-fixture',
      providerSnapshotId: 'snapshot-reference',
      providerFact,
      status: 'ACTIVE',
    });
    bindings.push({
      providerFact,
      providerSnapshotId: 'snapshot-reference',
      canonicalFact: fact,
      evidenceId,
    });
    factEvidence.push({ fact, evidenceId });
    candidates.push({ fact, evidenceId, candidate });
  }
  return { ...expected, snapshots, evidence, bindings, factEvidence, candidates };
}

test('active support comparison proves complete closure without treating snapshot labels as semantics', async () => {
  assert.equal(typeof helper.comparePhase05ActiveSupports, 'function');
  const expected = await independentSupportReference();
  const actual = structuredClone(expected);
  actual.snapshots[0].id = 'snapshot-trial';
  actual.snapshots[0].requestedRevisionFingerprint = 'sha256:retained';
  for (let index = 0; index < actual.evidence.length; index++) {
    const id = `trial-evidence-${index}`;
    actual.evidence[index].id = id;
    actual.evidence[index].providerSnapshotId = 'snapshot-trial';
    actual.bindings[index].evidenceId = id;
    actual.bindings[index].providerSnapshotId = 'snapshot-trial';
    actual.factEvidence[index].evidenceId = id;
    actual.candidates[index].evidenceId = id;
  }
  for (const field of ['evidence', 'bindings', 'factEvidence', 'candidates'])
    actual[field].reverse();
  const before = structuredClone({ expected, actual });
  assert.deepEqual(helper.comparePhase05ActiveSupports({ expected, actual }), {
    supportEqual: true,
    staleBindings: 0,
  });
  assert.deepEqual({ expected, actual }, before);
});

for (const defect of [
  'missing-binding',
  'missing-link',
  'missing-candidate',
  'extra-binding',
  'terminal-evidence',
  'dangling-evidence',
  'wrong-provider',
  'wrong-snapshot',
  'failed-snapshot',
  'foreign-context',
  'wrong-fact',
  'wrong-candidate',
  'duplicate-evidence',
  'duplicate-link',
  'duplicate-provider-support',
  'unbacked-fact',
]) {
  test(`active support comparison refuses ${defect} even when the graph is unchanged`, async () => {
    assert.equal(typeof helper.comparePhase05ActiveSupports, 'function');
    const expected = await independentSupportReference(),
      actual = structuredClone(expected);
    if (defect === 'missing-binding') actual.bindings.pop();
    if (defect === 'missing-link') actual.factEvidence.pop();
    if (defect === 'missing-candidate') actual.candidates.pop();
    if (defect === 'extra-binding')
      actual.bindings.push({ ...actual.bindings[0], evidenceId: 'absent' });
    if (defect === 'terminal-evidence') actual.evidence[0].status = 'SUPERSEDED';
    if (defect === 'dangling-evidence') actual.evidence.pop();
    if (defect === 'wrong-provider') actual.bindings[0].providerFact.providerId = 'other';
    if (defect === 'wrong-snapshot') actual.evidence[0].providerSnapshotId = 'absent';
    if (defect === 'failed-snapshot') actual.snapshots[0].outcome = 'FAILED';
    if (defect === 'foreign-context') actual.evidence[0].repositoryId = 'other';
    if (defect === 'wrong-fact') actual.bindings[0].canonicalFact.id = actual.facts.nodes[1].id;
    if (defect === 'wrong-candidate') actual.candidates[0].candidate = actual.facts.nodes[1];
    if (defect === 'duplicate-evidence') actual.evidence.push(actual.evidence[0]);
    if (defect === 'duplicate-link') actual.factEvidence.push(actual.factEvidence[0]);
    if (defect === 'duplicate-provider-support') {
      const evidenceId = 'duplicate-support';
      actual.evidence.push({ ...actual.evidence[0], id: evidenceId });
      actual.bindings.push({ ...actual.bindings[0], evidenceId });
      actual.factEvidence.push({ ...actual.factEvidence[0], evidenceId });
      actual.candidates.push({ ...actual.candidates[0], evidenceId });
    }
    if (defect === 'unbacked-fact') {
      actual.evidence.pop();
      actual.bindings.pop();
      actual.factEvidence.pop();
      actual.candidates.pop();
    }
    assert.throws(
      () => helper.comparePhase05ActiveSupports({ expected, actual }),
      /Phase05 active support/,
    );
  });
}

test('valid changed support or candidate cannot pass merely because the selected graph matches', async () => {
  assert.equal(typeof helper.comparePhase05ActiveSupports, 'function');
  const expected = await independentSupportReference();
  for (const change of ['provider-fact', 'candidate', 'provider-version']) {
    const actual = structuredClone(expected);
    if (change === 'provider-fact') {
      actual.evidence[0].providerFact.providerFactId = 'changed';
      actual.bindings[0].providerFact.providerFactId = 'changed';
    }
    if (change === 'candidate') actual.candidates[0].candidate.confidence.score = 0.5;
    if (change === 'provider-version') actual.snapshots[0].providerVersion = '2';
    assert.deepEqual(helper.comparePhase05ActiveSupports({ expected, actual }), {
      supportEqual: false,
      staleBindings: 0,
    });
  }
});

test('terminal history is retained but cannot become active support', async () => {
  const expected = await independentSupportReference(),
    actual = structuredClone(expected);
  actual.snapshots.push({
    ...actual.snapshots[0],
    id: 'snapshot-old',
    requestedRevisionFingerprint: 'sha256:old',
  });
  actual.evidence.push({
    ...actual.evidence[0],
    id: 'history-only',
    providerSnapshotId: 'snapshot-old',
    status: 'SUPERSEDED',
  });
  const before = structuredClone(actual);
  assert.deepEqual(helper.comparePhase05ActiveSupports({ expected, actual }), {
    supportEqual: true,
    staleBindings: 0,
  });
  assert.deepEqual(actual, before);
  actual.evidence.at(-1).status = 'ACTIVE';
  assert.throws(
    () => helper.comparePhase05ActiveSupports({ expected, actual }),
    /Phase05 active support/,
  );
});

test('complete support loss differs from support integrity failure', async () => {
  const expected = await independentSupportReference(),
    actual = structuredClone(expected);
  actual.facts.edges = [];
  for (const field of ['evidence', 'bindings', 'factEvidence', 'candidates']) actual[field].pop();
  assert.deepEqual(helper.comparePhase05ActiveSupports({ expected, actual }), {
    supportEqual: false,
    staleBindings: 0,
  });
});

test('active support rejects accessor or hidden records without executing user code', async () => {
  const expected = await independentSupportReference();
  let calls = 0;
  for (const hidden of [false, true]) {
    const actual = structuredClone(expected);
    if (hidden) Object.defineProperty(actual.bindings[0], 'extra', { value: true });
    else
      Object.defineProperty(actual.candidates[0], 'candidate', {
        enumerable: true,
        get() {
          calls++;
          return expected.candidates[0].candidate;
        },
      });
    assert.throws(
      () => helper.comparePhase05ActiveSupports({ expected, actual }),
      /Phase05 active support/,
    );
  }
  assert.equal(calls, 0);
});

test('source-bound comparison retains the independent Canonical oracle and validates the shared seed', async () => {
  assert.equal(typeof helper.comparePhase05SourceBoundFacts, 'function');
  const input = await independentCanonicalReference();
  const before = structuredClone(input);
  const result = helper.comparePhase05SourceBoundFacts(input);
  assert.equal(
    result.comparison.entries.every(
      (entry) => entry.classification === null && entry.differences.length === 0,
    ),
    true,
  );
  assert.deepEqual(input, before);
});

for (const defect of [
  'fingerprint',
  'revision',
  'opaque-id',
  'absent-source',
  'foreign-context',
  'dangling-target',
  'dangling-source',
  'dangling-candidate',
]) {
  test(`source-bound comparison refuses ${defect} rather than repairing expected facts`, async () => {
    assert.equal(typeof helper.comparePhase05SourceBoundFacts, 'function');
    const input = await independentCanonicalReference();
    if (defect === 'fingerprint') input.actual.sourceFiles[0].contentFingerprint = 'sha256:changed';
    if (defect === 'revision') input.actual.sourceFiles[0].revisionId = 'other-revision';
    if (defect === 'opaque-id') input.actual.sourceFiles[0].id = 'other-source-id';
    if (defect === 'absent-source')
      input.actual.facts.nodes.find((node) => node.sourceRange).sourceRange.sourceFileId = 'absent';
    if (defect === 'foreign-context') input.actual.facts.nodes[0].repositoryId = 'other-repository';
    if (defect === 'dangling-target')
      input.actual.facts.edges.find((edge) => edge.target.state === 'RESOLVED').target.target.id =
        'absent';
    if (defect === 'dangling-source') input.actual.facts.edges[0].source.id = 'absent';
    if (defect === 'dangling-candidate')
      input.actual.facts.edges[0].target = {
        state: 'UNRESOLVED',
        resolution: 'UNRESOLVED',
        originalHint: 'ctor',
        candidates: [{ factType: 'NODE', id: 'absent' }],
      };
    const expectedBefore = structuredClone(input.expected);
    const message = {
      fingerprint: /Source inventory mismatch/,
      revision: /Source inventory mismatch/,
      'opaque-id': /shared Source identities/,
      'absent-source': /Source reference missing/,
      'foreign-context': /fact context mismatch/,
      'dangling-target': /node reference missing/,
      'dangling-source': /node reference missing/,
      'dangling-candidate': /node reference missing/,
    }[defect];
    assert.throws(() => helper.comparePhase05SourceBoundFacts(input), message);
    assert.deepEqual(input.expected, expectedBefore);
  });
}

test('owned expected-PARTIAL trial receipts preserve pre-admission refusal as unproved, never PARTIAL', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-partial-refusal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vector = JSON.parse(
    await readFile(
      new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  );
  const repositoryRoot = path.join(directory, 'repository');
  await mkdir(repositoryRoot);
  const request = {
    schemaVersion: 1,
    operation: 'INCREMENTAL',
    repositoryId: 'partial-refusal',
    initialize: false,
    repositoryRoot,
    databasePath: path.join(directory, 'repository.sqlite'),
    nativeExecutablePath: path.join(directory, 'absent-analyzer.exe'),
    configuration: vector.configuration,
  };
  const saved = await helper.runPhase05IndexTrial({
    request,
    receiptDirectory: path.join(directory, 'receipt'),
    expectedNativeOutcome: 'PARTIAL',
  });
  await saved.assertUnchanged();
  const receipt = JSON.parse(await readFile(saved.receiptPath));
  assert.equal(receipt.outcome, 'FAILED');
  assert.equal(receipt.error.code, 'RESOURCE_LIMIT_EXCEEDED');
  assert.equal(typeof receipt.nativeObservation.partialRefresh, 'object');
  assert.equal(receipt.nativeObservation.partialRefresh.validatedPartialBranch, false);
  assert.equal(receipt.nativeObservation.partialRefresh.terminal, null);
  assert.equal(receipt.nativeObservation.childClosed, null);
  await assert.rejects(access(request.databasePath), { code: 'ENOENT' });
  for (const wrong of ['SUCCEEDED', true, null])
    await assert.rejects(
      helper.runPhase05IndexTrial({
        request,
        receiptDirectory: path.join(directory, 'invalid-receipt'),
        expectedNativeOutcome: wrong,
      }),
      (error) => error.code === 'INVALID_REQUEST',
    );
  await assert.rejects(access(path.join(directory, 'invalid-receipt')), { code: 'ENOENT' });
});

for (const operation of ['FULL', 'INCREMENTAL']) {
  test(`actual public ${operation} admission refusal is durably receipted without publication`, async (t) => {
    assert.equal(typeof helper.runPhase05IndexTrial, 'function');
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-actual-refusal-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const vector = JSON.parse(
      await readFile(
        new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
        'utf8',
      ),
    );
    const repositoryRoot = path.join(directory, 'repository');
    await mkdir(repositoryRoot);
    const request = {
      ...vector.write,
      operation,
      initialize: operation === 'FULL',
      repositoryRoot,
      databasePath: path.join(directory, 'repository.sqlite'),
      nativeExecutablePath: path.join(directory, 'absent-analyzer.exe'),
      configuration: vector.configuration,
    };
    // The literal 16-byte unit budget is a refusal control, never a real profile/default.
    const receiptDirectory = path.join(directory, 'receipt');
    const saved = await helper.runPhase05IndexTrial({ request, receiptDirectory });
    const bytes = await readFile(saved.receiptPath);
    assert.equal(saved.sha256, hash(bytes));
    const receipt = JSON.parse(bytes);
    assert.equal(receipt.outcome, 'FAILED');
    assert.equal(receipt.error.code, 'RESOURCE_LIMIT_EXCEEDED');
    assert.deepEqual(receipt.nativeObservation, {
      scope: 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY',
      children: [],
      childClosed: null,
      wire: [],
      sqlLifetime: {
        scope: 'REPOSITORY_INDEX_SESSION_LIFETIME_ONLY',
        openedConnections: 0,
        closedConnections: 0,
        transactionClosed: null,
        tempClosed: null,
        connectionClosed: null,
        captureFailed: false,
      },
      nativeStream: {
        scope: 'CONSUMED_NATIVE_RECORDS_ONLY',
        terminal: null,
        terminalCount: 0,
        siteEvents: [],
        operations: [],
        captureFailed: false,
      },
      parseObservation: null,
    });
    assert.deepEqual(receipt.error.effects, {
      databaseInitialized: false,
      sourceReconciled: false,
      graphCommit: 'NOT_ATTEMPTED',
    });
    assert.equal(receipt.result, null);
    assert.equal(typeof receipt.totalMs, 'number');
    assert.ok(receipt.totalMs >= 0);
    assert.equal(receipt.peak.scope, 'NODE_PROCESS_LIFETIME_EXCLUDES_NATIVE_CHILD');
    await assert.rejects(access(request.databasePath), { code: 'ENOENT' });
    await assert.rejects(helper.runPhase05IndexTrial({ request, receiptDirectory }));
    assert.deepEqual(await readFile(saved.receiptPath), bytes);
  });
}

for (const operation of ['FULL', 'INCREMENTAL']) {
  for (const existing of [false, true]) {
    test(`actual ${operation} cancellation preserves ${existing ? 'existing database bytes' : 'absent database'} and a durable refusal receipt`, async (t) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-cancel-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const vector = JSON.parse(
        await readFile(
          new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
          'utf8',
        ),
      );
      const repositoryRoot = path.join(directory, 'repository');
      await mkdir(repositoryRoot);
      const databasePath = path.join(directory, 'repository.sqlite');
      // A sentinel is deliberately not a valid SQLite database: cancellation
      // must precede database opening, validation and Native admission.
      const before = Buffer.from('unopened database sentinel\n');
      if (existing) await writeFile(databasePath, before);
      const controller = new AbortController();
      controller.abort();
      const saved = await helper.runPhase05IndexTrial({
        request: {
          ...vector.write,
          operation,
          initialize: operation === 'FULL' && !existing,
          repositoryRoot,
          databasePath,
          nativeExecutablePath: path.join(directory, 'absent-analyzer.exe'),
          configuration: vector.configuration,
        },
        receiptDirectory: path.join(directory, 'receipt'),
        signal: controller.signal,
      });
      const bytes = await readFile(saved.receiptPath);
      const receipt = JSON.parse(bytes);
      assert.equal(receipt.error.code, 'CANCELLED');
      assert.equal(receipt.outcome, 'FAILED');
      assert.equal(receipt.result, null);
      assert.deepEqual(receipt.error.effects, {
        databaseInitialized: false,
        sourceReconciled: false,
        graphCommit: 'NOT_ATTEMPTED',
      });
      assert.equal(saved.sha256, hash(bytes));
      await saved.assertUnchanged();
      if (existing) assert.deepEqual(await readFile(databasePath), before);
      else await assert.rejects(access(databasePath), { code: 'ENOENT' });
      assert.deepEqual(await readdir(repositoryRoot), []);
      for (const suffix of ['-wal', '-shm', '-journal'])
        await assert.rejects(access(databasePath + suffix), { code: 'ENOENT' });
    });
  }
}

for (const defect of ['changed', 'hardlink', 'replaced', 'foreign', 'missing']) {
  test(`actual follow-up trial refuses ${defect} prerequisite receipt before opening its destination`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-prerequisite-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const vector = JSON.parse(
      await readFile(
        new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
        'utf8',
      ),
    );
    const repositoryRoot = path.join(root, 'repository');
    await mkdir(repositoryRoot);
    const request = {
      ...vector.write,
      configuration: vector.configuration,
      databasePath: path.join(root, 'repository.sqlite'),
      repositoryRoot,
      nativeExecutablePath: path.join(root, 'analyzer'),
    };
    const saved = await helper.runPhase05IndexTrial({
      request,
      receiptDirectory: path.join(root, 'original'),
    });
    const bytes = await readFile(saved.receiptPath);
    assert.equal(typeof saved.assertUnchanged, 'function');
    await saved.assertUnchanged();
    let prior = saved;
    if (defect === 'changed') await writeFile(saved.receiptPath, Buffer.from('changed receipt'));
    if (defect === 'hardlink') await link(saved.receiptPath, path.join(root, 'alias'));
    if (defect === 'replaced') {
      await rename(saved.receiptPath, path.join(root, 'retained-receipt'));
      await writeFile(saved.receiptPath, bytes, { flag: 'wx' });
    }
    if (defect === 'foreign') prior = { ...saved };
    if (defect === 'missing') await rename(saved.receiptPath, path.join(root, 'retained-receipt'));
    const receiptDirectory = path.join(root, 'follow-up');
    await assert.rejects(
      helper.runPhase05IndexTrial({ request, receiptDirectory, priorReceipts: [prior] }),
      /Trial prerequisite receipt/,
    );
    await assert.rejects(access(receiptDirectory), { code: 'ENOENT' });
    await assert.rejects(access(request.databasePath), { code: 'ENOENT' });
  });
}

test('actual refusal receipt stays verifiable across an independently receipted follow-up refusal', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-receipt-chain-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vector = JSON.parse(
    await readFile(
      new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  );
  const repositoryRoot = path.join(root, 'repository');
  await mkdir(repositoryRoot);
  const request = {
    ...vector.write,
    configuration: vector.configuration,
    databasePath: path.join(root, 'repository.sqlite'),
    repositoryRoot,
    nativeExecutablePath: path.join(root, 'analyzer'),
  };
  const original = await helper.runPhase05IndexTrial({
    request,
    receiptDirectory: path.join(root, 'original'),
  });
  const before = await readFile(original.receiptPath);
  const followup = await helper.runPhase05IndexTrial({
    request: { ...request, operation: 'INCREMENTAL', initialize: false },
    receiptDirectory: path.join(root, 'follow-up'),
    priorReceipts: [original],
  });
  await original.assertUnchanged();
  await followup.assertUnchanged();
  assert.deepEqual(await readFile(original.receiptPath), before);
  assert.equal(
    JSON.parse(await readFile(followup.receiptPath, 'utf8')).error.code,
    'RESOURCE_LIMIT_EXCEEDED',
  );
  await writeFile(original.receiptPath, 'changed prerequisite');
  await assert.rejects(followup.assertUnchanged(), /Trial prerequisite receipt/);
});

test('source-bound comparison exposes altered confidence instead of regenerating a golden', async () => {
  assert.equal(typeof helper.comparePhase05SourceBoundFacts, 'function');
  const input = await independentCanonicalReference();
  input.actual.facts.nodes[0].confidence.score = 0.5;
  const result = helper.comparePhase05SourceBoundFacts(input);
  assert.equal(
    result.comparison.entries.some((entry) =>
      entry.differences.some((difference) => difference.path === 'confidence.score'),
    ),
    true,
  );
});

async function closedSeed(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-seed-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'seed.sqlite');
  const database = new DatabaseSync(sourcePath);
  try {
    database.exec(
      "CREATE TABLE independent_value(value TEXT); INSERT INTO independent_value VALUES ('original');",
    );
  } finally {
    database.close();
  }
  return {
    directory,
    sourcePath,
    targetPath: path.join(directory, 'reference.sqlite'),
    maxBytes: (await readFile(sourcePath)).length,
  };
}

test('closed seed copy reopens the same independent bytes without WAL dependencies', async (t) => {
  assert.equal(typeof helper.copyPhase05ClosedSeed, 'function');
  const input = await closedSeed(t);
  const bytes = await readFile(input.sourcePath);
  const receipt = await helper.copyPhase05ClosedSeed(input);
  assert.equal(receipt.sha256, hash(bytes));
  assert.equal(receipt.byteLength, bytes.length);
  assert.deepEqual(await readFile(input.targetPath), bytes);
  const database = new DatabaseSync(input.targetPath, { readOnly: true });
  try {
    assert.equal(database.prepare('SELECT value FROM independent_value').get().value, 'original');
  } finally {
    database.close();
  }
  for (const suffix of ['-wal', '-shm', '-journal'])
    await assert.rejects(access(input.targetPath + suffix), { code: 'ENOENT' });
});

for (const defect of [
  'existing-target',
  'sidecar',
  'target-sidecar',
  'hardlink',
  'outside-root',
  'over-budget',
  'invalid-sqlite',
  'wal-header',
]) {
  test(`closed seed copy refuses ${defect} without overwriting data`, async (t) => {
    assert.equal(typeof helper.copyPhase05ClosedSeed, 'function');
    const input = await closedSeed(t);
    if (defect === 'existing-target') await writeFile(input.targetPath, 'retained');
    if (defect === 'sidecar') await writeFile(input.sourcePath + '-wal', 'retained');
    if (defect === 'target-sidecar') await writeFile(input.targetPath + '-wal', 'retained');
    if (defect === 'hardlink')
      await link(input.sourcePath, path.join(input.directory, 'alias.sqlite'));
    if (defect === 'outside-root') {
      await mkdir(path.join(input.directory, 'nested'));
      input.directory = path.join(input.directory, 'nested');
    }
    if (defect === 'over-budget') input.maxBytes -= 1;
    if (defect === 'invalid-sqlite') await writeFile(input.sourcePath, 'foreign');
    if (defect === 'wal-header') {
      const database = new DatabaseSync(input.sourcePath);
      try {
        database.exec('PRAGMA journal_mode = WAL');
      } finally {
        database.close();
      }
    }
    const before = await readFile(input.sourcePath);
    await assert.rejects(helper.copyPhase05ClosedSeed(input));
    assert.deepEqual(await readFile(input.sourcePath), before);
    if (defect === 'existing-target')
      assert.equal(await readFile(input.targetPath, 'utf8'), 'retained');
    else await assert.rejects(access(input.targetPath), { code: 'ENOENT' });
    if (defect === 'sidecar')
      assert.equal(await readFile(input.sourcePath + '-wal', 'utf8'), 'retained');
    if (defect === 'target-sidecar')
      assert.equal(await readFile(input.targetPath + '-wal', 'utf8'), 'retained');
  });
}

for (const defect of ['invalid-request', 'status', 'outside-root', 'existing-output']) {
  test(`actual trial refuses ${defect} before creating a new receipt`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-trial-control-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const vector = JSON.parse(
      await readFile(
        new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
        'utf8',
      ),
    );
    let request = {
      ...vector.write,
      repositoryRoot: path.join(directory, 'repository'),
      databasePath: path.join(directory, 'repository.sqlite'),
      configuration: vector.configuration,
    };
    const receiptDirectory = path.join(directory, 'receipt');
    if (defect === 'invalid-request') request.extra = true;
    if (defect === 'status') request = { ...vector.status, databasePath: request.databasePath };
    if (defect === 'outside-root')
      request.databasePath = path.join(path.dirname(directory), 'outside.sqlite');
    if (defect === 'existing-output') {
      await mkdir(receiptDirectory);
      await writeFile(path.join(receiptDirectory, 'sentinel'), 'retained');
    }
    await assert.rejects(helper.runPhase05IndexTrial({ request, receiptDirectory }));
    if (defect === 'existing-output')
      assert.deepEqual(await readdir(receiptDirectory), ['sentinel']);
    else await assert.rejects(access(receiptDirectory), { code: 'ENOENT' });
  });
}

test('actual Source-only preparation shares validated IDs in closed R010 seeds without publishing facts', async (t) => {
  assert.equal(typeof helper.preparePhase05SourceSeed, 'function');
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-source-seed-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const prepared = await helper.preparePhase05PerformanceRepository({
    directory: path.join(base, 'owned'),
    scenario: 'INCREMENTAL_1',
  });
  const vectors = JSON.parse(
    await readFile(
      new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  );
  const configuration = {
    ...vectors.configuration,
    resourceBudget: { maxDurationMs: 60000, maxMemoryBytes: 16, maxEvents: 100 },
  };
  // Explicit synthetic preparation controls, not Native admission/default values.
  const input = {
    databasePath: path.join(base, 'owned', 'seed.sqlite'),
    repositoryRoot: prepared.repositoryRoot,
    repositoryId: 'source-seed-fixture',
    initialize: true,
    configuration,
  };
  const first = await helper.preparePhase05SourceSeed(input);
  assert.equal(first.preparation, 'SOURCE_ONLY_OUTSIDE_MEASUREMENT');
  assert.equal(first.state.files.length, 50);
  assert.equal(new Set(first.state.files.map((file) => file.id)).size, 50);
  await prepared.applyTarget();
  const target = await helper.preparePhase05SourceSeed({ ...input, initialize: false });
  assert.equal(target.state.revision.id, first.state.revision.id);
  assert.notEqual(
    target.state.revision.contentFingerprint,
    first.state.revision.contentFingerprint,
  );
  assert.deepEqual(
    target.state.files.map((file) => file.id),
    first.state.files.map((file) => file.id),
  );
  const unchanged = first.state.files.filter(
    (file, index) => file.contentFingerprint === target.state.files[index].contentFingerprint,
  );
  assert.equal(unchanged.length, 49);
  const bytes = await readFile(input.databasePath);
  const copy = await helper.copyPhase05ClosedSeed({
    directory: path.join(base, 'owned'),
    sourcePath: input.databasePath,
    targetPath: path.join(base, 'owned', 'reference.sqlite'),
    maxBytes: bytes.length,
  });
  const database = new DatabaseSync(path.join(base, 'owned', copy.path), { readOnly: true });
  try {
    assert.deepEqual(
      new RepositorySourceStateStore(database).load(input.repositoryId),
      target.state,
    );
    assert.equal(database.prepare('SELECT count(*) AS n FROM canonical_nodes').get().n, 0);
    assert.equal(database.prepare('SELECT count(*) AS n FROM canonical_edges').get().n, 0);
    assert.equal(
      database.prepare('SELECT indexed_revision_id FROM repository_state').get()
        .indexed_revision_id,
      null,
    );
  } finally {
    database.close();
  }
});

test('Source seed preparation refuses a database outside the owned trial parent', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'codeatlas-phase05-source-boundary-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const prepared = await helper.preparePhase05PerformanceRepository({
    directory: path.join(base, 'owned'),
    scenario: 'COLD',
  });
  const vector = JSON.parse(
    await readFile(
      new URL('../fixtures/indexing/phase05-index-cli/inputs/requests.json', import.meta.url),
      'utf8',
    ),
  );
  const databasePath = path.join(base, 'foreign.sqlite');
  const configuration = {
    ...vector.configuration,
    resourceBudget: { maxDurationMs: 60000, maxMemoryBytes: 16, maxEvents: 200 },
  };
  await assert.rejects(
    helper.preparePhase05SourceSeed({
      repositoryRoot: prepared.repositoryRoot,
      repositoryId: 'source-boundary',
      databasePath,
      initialize: true,
      configuration,
    }),
    /confined/,
  );
  await assert.rejects(access(databasePath), { code: 'ENOENT' });
});
