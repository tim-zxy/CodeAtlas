import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  setup,
  makeAccount,
  cases,
} from '../packages/source/test/fixtures/mixed-source-git-double.mjs';
import {
  openRepositoryIndexSession,
  RepositorySourceStateStore,
} from '../packages/storage/dist/index.js';
import prepareMixedSource from '../packages/application/dist/mixed-source-workflow.js';
import { workflowRequest } from '../packages/runtime/test/helpers/framework-surface-stage.mjs';

const fingerprint = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
test('same-path GET to POST Source change is genuinely reconciled and unchanged rescan stays equal', async (t) => {
  const f = await setup(t),
    repositoryId = f.request.repositoryId;
  const relative = 'fastapi/source-adequacy/routes.py';
  const before = await fs.readFile(new URL('../fixtures/phase1/' + relative, import.meta.url));
  const after = await fs.readFile(
    new URL('../packages/source/test/fixtures/current13-same-path-after.py', import.meta.url),
  );
  assert.notDeepEqual(before, after);
  assert.equal(before.toString().split('@router.get("/items")').length, 2);
  assert.equal(
    after.toString(),
    before.toString().replace('@router.get("/items")', '@router.post("/items")'),
  );
  const file = path.join(f.root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, before);
  const session = await openRepositoryIndexSession(
    {
      databasePath: path.join(f.root, 'proof.sqlite'),
      repositoryRoot: await fs.realpath(f.root),
      repositoryId,
      initialize: true,
      readOnly: false,
    },
    { async checkpoint() {}, reserveText() {}, chargeMetadataRow() {} },
  );
  f.state.closeOwnedDatabase = () => session.close();
  const sourceState = new RepositorySourceStateStore(session.database);
  const policy = workflowRequest(repositoryId, 'INDEX').policy;
  policy.callerCapabilities.push('READ_SOURCE');
  policy.permissionContext.allowedOperations.push('READ_SOURCE');
  const request = {
    ...f.request,
    config: {
      include: [relative],
      exclude: [...cases.sourcePaths, 'proof.sqlite', 'proof.sqlite-*'],
    },
  };
  const prepare = () =>
    prepareMixedSource({
      request,
      policy,
      account: makeAccount(f.control.signal).account,
      control: f.control,
      sourceState,
    });
  const first = await prepare();
  assert.equal(first.effects.sourceCommit, 'COMMITTED');
  assert.equal(first.state.files.length, 1);
  assert.equal(first.state.files[0].contentFingerprint, fingerprint(before));
  await first.verifySelection();
  await fs.writeFile(file, after);
  await assert.rejects(first.verifySelection(), (e) => e.code === 'SOURCE_CHANGED');
  const second = await prepare();
  assert.equal(second.effects.sourceCommit, 'COMMITTED');
  assert.equal(second.state.files.length, 1);
  assert.equal(second.state.files[0].path, relative);
  assert.equal(second.state.files[0].id, first.state.files[0].id);
  assert.equal(second.state.revision.id, first.state.revision.id);
  assert.equal(second.state.files[0].contentFingerprint, fingerprint(after));
  assert.notEqual(
    second.state.revision.contentFingerprint,
    first.state.revision.contentFingerprint,
  );
  assert.deepEqual(sourceState.load(repositoryId), second.state);
  await second.verifySelection();
  const third = await prepare();
  assert.deepEqual(third.state, second.state);
  await third.verifySelection();
  assert.equal(f.state.calls, f.state.closes);
  t.diagnostic(
    JSON.stringify({
      scope: 'SOURCE_ONLY_NOT_NATIVE_OR_RUNTIME_NO_OP',
      path: relative,
      before: fingerprint(before),
      after: fingerprint(after),
      oldSelectionRefused: true,
      sameSourceIdentity: true,
      unchangedSourceEqual: true,
    }),
  );
});
