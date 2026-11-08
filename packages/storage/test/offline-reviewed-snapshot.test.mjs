import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadMigrationPlan } from '../dist/migrations/manifest.js';
import { applyMigrationPlan } from '../dist/migrations/runner.js';
import { openCompilationInputStore } from '../dist/knowledge/compilation-input-store.js';
import { createCompilationInputSnapshot } from '../../application/dist/compilation-input-contract.js';
import {
  createOfflineCompilationInspection,
  runOfflineCompilationInspection,
} from '../../application/dist/offline-compilation-inspection.js';
import { runCapturedIntegrationStateTestDouble } from '../../application/dist/integration-state-test-double.js';
import { reconcileKnowledge } from '../../knowledge/dist/index.js';
import {
  fixture,
  control,
  account,
  options,
  wr,
  hash,
  canonical,
} from '../../application/test/helpers/captured-integration-fixture.mjs';
const limits = {
  maxRows: 10000,
  maxSerializedBytes: 2000000,
  maxItems: 200000,
  maxDepth: 100,
  memoryBudgetBytes: 20000000,
};
const check = () => {};
async function setup(t, mode = 'normal') {
  const root = await realpath(tmpdir()),
    dir = await mkdtemp(path.join(root, 'codeatlas-offline-reviewed-')),
    dbfile = path.join(dir, 'owned.sqlite');
  const db = new DatabaseSync(dbfile),
    connections = [db];
  t.after(async () => {
    for (const c of connections) if (c.isOpen) c.close();
    assert.equal(path.dirname(dir), root);
    await rm(dir, { recursive: true, force: true });
  });
  const c = control(),
    sharedAccount = account();
  const bytes = Buffer.from('const value = 1;\n');
  await writeFile(path.join(dir, 'a.java'), bytes);
  const f = fixture(),
    source = f.raw.repositories[0].supports[0];
  source.value.contentFingerprint = 'sha256:' + hash(bytes);
  f.support.valueDigest = hash('codeatlas-phase1-support-value-v1\0' + canonical(source.value));
  source.capturedValueDigest = hash(
    'codeatlas.capture-value.v1\n' +
      canonical({ value: source.value, valueSchemaRef: 'SourceFile@1' }),
  );
  const requirement = {
    key: JSON.stringify(['SOURCE_FILE', 'w', 'r', 'v', 'f']),
    kind: 'SOURCE_FILE',
    workspaceId: 'w',
    repositoryId: 'r',
    revisionId: 'v',
    entityId: 'f',
    path: 'a.java',
    contentFingerprint: source.value.contentFingerprint,
  };
  const plan = await loadMigrationPlan(
    new URL('../migrations/workspace/manifest.json', import.meta.url),
    'WORKSPACE',
  );
  assert.equal(plan.latestVersion, 8);
  applyMigrationPlan(db, plan);
  db.prepare('INSERT INTO workspace VALUES(1,?,?)').run('w', dir);
  db.prepare('INSERT INTO repositories VALUES(?,?,?)').run('r', 'w', dir);
  db.exec("INSERT INTO revision_sets VALUES('rs','w',0,0)");
  db.prepare('INSERT INTO revision_set_items VALUES(?,?,?,?)').run(
    'rs',
    'r',
    'v',
    f.raw.repositories[0].repoBasis.contentFingerprint,
  );
  db.exec("UPDATE revision_sets SET frozen=1 WHERE id='rs'");
  for (const [version, file] of [
    [9, '009_knowledge.sql'],
    [10, '010_lifecycle.sql'],
  ]) {
    db.exec(
      await readFile(new URL('../migrations/workspace-proposed/' + file, import.meta.url), 'utf8'),
    );
    db.exec('PRAGMA user_version=' + version);
  }
  const captureRequest = {
    schemaVersion: 1,
    workspaceId: 'w',
    scope: f.raw.scope,
    revisionSetId: 'rs',
    ...f.raw.selection,
    policyVersions: f.raw.policyVersions,
  };
  const key = {
    runId: 'run:offline',
    subject: { issuerNamespace: 'owned:offline-test', subjectId: 'synthetic' },
    requestKey: 'request:offline',
    request: {
      schemaVersion: 1,
      captureRequest,
      updateMode: 'FULL',
      expectedHeads: { heads: [] },
      workflowRef: 'workflow:offline',
      modelPolicyRef: null,
    },
  };
  const store = await openCompilationInputStore(db, 'w', limits);
  store.createRun({ ...key, createdAtMs: 0 }, limits, c, check);
  let originalSnapshot,
    receipt,
    generated = 0,
    usage = 0,
    putAttempts = 0,
    reserved = 0;
  sharedAccount.reserveCall = () => {
    reserved++;
  };
  sharedAccount.chargeUsage = () => {
    usage++;
  };
  const events = [];
  const owner = createOfflineCompilationInspection({
    binding: {
      operationId: 'owned-offline',
      workspaceId: 'w',
      revisionSetId: 'rs',
      scope: f.raw.scope,
      policyVersions: f.raw.policyVersions,
    },
    control: c,
    account: sharedAccount,
    ports: {
      evidenceKind: 'TEST_PORTS_NOT_AUTHORITY',
      async readMetadata() {
        events.push('metadata');
        return [requirement];
      },
      async authorizeOriginal(file) {
        assert.deepEqual(file, requirement);
        events.push('authorize');
      },
      async readOriginal(file) {
        assert.equal(events.at(-1), 'authorize');
        assert.equal(path.basename(file.path), file.path);
        events.push('read');
        return readFile(path.join(dir, file.path));
      },
      async materializeSnapshot(originals) {
        assert.deepEqual(Buffer.from(originals.get(requirement.key)), bytes);
        events.push('materialize');
        originalSnapshot = createCompilationInputSnapshot(f.raw, c);
        return originalSnapshot;
      },
      async recheck() {
        assert.deepEqual(await readFile(path.join(dir, 'a.java')), bytes);
        events.push('recheck');
      },
      async settle() {
        events.push('settle');
      },
      async consume(snapshot) {
        putAttempts++;
        events.push('consume');
        assert.ok(Object.isFrozen(snapshot));
        assert.deepEqual(snapshot, originalSnapshot);
        const exec = db.exec.bind(db);
        let calls = 0;
        if (mode === 'lost-ack')
          db.exec = (sql) => {
            const value = exec(sql);
            if (sql === 'COMMIT') throw Error('lost acknowledgement');
            return value;
          };
        try {
          receipt = store.putSnapshot(key, snapshot, limits, c, () => {
            if (mode === 'cleanup-unknown' && ++calls === 3)
              throw Object.assign(Error('unsettled'), { cleanupState: 'UNKNOWN' });
          });
        } finally {
          db.exec = exec;
        }
        if (receipt.status !== 'COMMITTED' || receipt.cleanupState !== 'SETTLED')
          throw Object.assign(Error('snapshot consumer outcome uncertain'), {
            cleanupState: receipt.cleanupState,
          });
      },
    },
  });
  const execute = async () => {
    const inspection = await runOfflineCompilationInspection(owner);
    db.close();
    const reopened = new DatabaseSync(dbfile);
    connections.push(reopened);
    const reader = await openCompilationInputStore(reopened, 'w', limits),
      snapshot = reader.readSnapshot(key, limits, control(), check);
    assert.deepEqual(snapshot, originalSnapshot);
    assert.equal(hash(canonical(snapshot)), inspection.payloadDigest);
    const identity = {
      providerId: 'owned-fixture',
      modelId: 'local-double',
      adapterVersion: 'fixture-v1',
    };
    const output = await runCapturedIntegrationStateTestDouble(
      snapshot,
      options(),
      {
        promptRef: 'offline:claim',
        modelPolicyRef: 'offline:model',
        invocationBudget: { maxInputBytes: 200000, maxOutputBytes: 20000 },
      },
      {
        evidenceKind: 'TEST_DOUBLE',
        identity,
        capabilities: { outputMode: 'NATIVE_JSON_SCHEMA' },
        async generate() {
          generated++;
          const claim = {
            schema: 'codeatlas.claim',
            version: 1,
            payload: {
              id: 'claim:offline',
              subject: wr('SERVICE', 's1'),
              predicate: 'state',
              value: { kind: 'LITERAL', value: true },
              scope: snapshot.scope,
              stateIntent: 'CURRENT',
              claimKind: 'DECLARED',
              evidenceRefs: [f.support],
              confidence: { score: 1, method: 'fixture', reasons: ['literal'] },
              authority: 'DECLARED',
            },
          };
          return {
            structuredOutput: claim,
            identity,
            usage: { inputTokens: 2, outputTokens: 1 },
            finishReason: 'STOP',
            warnings: [],
            outputDigest: hash(canonical(claim)),
          };
        },
      },
      c,
      sharedAccount,
    );
    const reviewed = reconcileKnowledge({
      subjects: [output.reconciliationSubject],
      existingItems: [],
      policyRef: 'knowledge-exact-reference-v1',
      intents: [],
      disappearedItemIds: [],
      control: c,
    });
    return { inspection, snapshot, output, reviewed, reopened };
  };
  return {
    db,
    store,
    key,
    owner,
    execute,
    events,
    get receipt() {
      return receipt;
    },
    get generated() {
      return generated;
    },
    get usage() {
      return usage;
    },
    get putAttempts() {
      return putAttempts;
    },
    get reserved() {
      return reserved;
    },
    get originalSnapshot() {
      return originalSnapshot;
    },
  };
}
test('owned original-file inspection persists exact snapshot, reopens and produces a candidate review plan', async (t) => {
  const f = await setup(t),
    result = await f.execute();
  assert.equal(f.receipt.status, 'COMMITTED');
  assert.equal(result.inspection.clearance, false);
  assert.equal(result.inspection.consumption, 'CONSUMED');
  assert.equal(f.generated, 1);
  assert.equal(f.reserved, 1);
  assert.equal(f.putAttempts, 1);
  assert.equal(f.usage, 1);
  assert.equal(result.output.binding.capturedInputDigest, result.snapshot.inputDigest);
  assert.equal(result.output.authorization, 'NOT_ESTABLISHED');
  assert.equal(result.output.publicationEffect, 'NOT_ATTEMPTED');
  assert.equal(
    result.reopened.prepare('SELECT count(*) n FROM compilation_input_snapshots').get().n,
    1,
  );
  assert.equal(result.reopened.prepare('SELECT count(*) n FROM snapshot_supports').get().n, 1);
  const support = result.snapshot.repositories[0].supports[0];
  const row = result.reopened
    .prepare(
      'SELECT workspace_id,snapshot_id,revision_set_id,support_value_digest,captured_value_digest,value_schema_ref,payload_json FROM snapshot_supports',
    )
    .get();
  assert.equal(row.workspace_id, 'w');
  assert.equal(row.snapshot_id, 'snap');
  assert.equal(row.revision_set_id, 'rs');
  assert.equal(row.support_value_digest, support.ref.valueDigest);
  assert.equal(row.captured_value_digest, support.capturedValueDigest);
  assert.equal(row.value_schema_ref, 'SourceFile@1');
  assert.deepEqual(JSON.parse(row.payload_json), support);
  assert.deepEqual(
    {
      ...result.reopened
        .prepare('SELECT state,snapshot_id,finished_at_ms FROM compilation_runs')
        .get(),
    },
    { state: 'CAPTURING', snapshot_id: 'snap', finished_at_ms: null },
  );
  const action = result.reviewed.actions[0];
  assert.equal(action.operation, 'NEW');
  assert.equal(action.revisionIntent, 'NEW_ITEM');
  assert.equal(action.retainedItemId, null);
  assert.equal(action.previousRevisionId, null);
  assert.equal(result.reopened.prepare('SELECT count(*) n FROM knowledge_items').get().n, 0);
  assert.equal(result.reopened.prepare('SELECT count(*) n FROM publication_runs').get().n, 0);
});
for (const mode of ['lost-ack', 'cleanup-unknown'])
  test(
    'real snapshot ' + mode + ' preserves commit separately and blocks generation or retry',
    async (t) => {
      const f = await setup(t, mode);
      await assert.rejects(f.execute(), {
        consumption: 'UNKNOWN',
        cleanupState: mode === 'cleanup-unknown' ? 'UNKNOWN' : 'SETTLED',
      });
      assert.equal(f.generated, 0);
      assert.equal(f.reserved, 0);
      assert.equal(f.putAttempts, 1);
      assert.equal(f.usage, 0);
      assert.equal(f.receipt.status, mode === 'lost-ack' ? 'COMMIT_OUTCOME_UNKNOWN' : 'COMMITTED');
      assert.equal(f.receipt.cleanupState, mode === 'cleanup-unknown' ? 'UNKNOWN' : 'SETTLED');
      assert.equal(
        f.store.inspectCommit(f.key, 'snap', limits, control(), check).status,
        'COMMITTED',
      );
      assert.equal(f.db.prepare('SELECT count(*) n FROM compilation_input_snapshots').get().n, 1);
      assert.equal(f.db.prepare('SELECT state FROM compilation_runs').get().state, 'CAPTURING');
      await assert.rejects(runOfflineCompilationInspection(f.owner), { consumption: 'UNKNOWN' });
      assert.equal(f.putAttempts, 1);
    },
  );
