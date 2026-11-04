import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  observationFixture,
  ownerFixture,
} from '../../storage/test/helpers/mixed-analysis-fixture.mjs';
import { historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import { captureActivationContext } from '../../storage/dist/analysis/activation-history.js';
import * as stageAPI from '../../storage/dist/analysis/mixed-analysis-stage.js';
import { HistoryReadBudget } from '../../storage/dist/analysis/activation-history-format.js';
import { createMixedAnalysisRules } from '../dist/mixed-analysis.js';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
let api;
try {
  api = (await import('../dist/mixed-request-preparation.js')).default;
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const rawRoot =
  'fixtures/phase1/mixed-analysis-stage/component-references/stage-observation-independent/';
async function setup(t, id, owner = false) {
  const f = await (owner ? ownerFixture : observationFixture)(t, id);
  const capture = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
  const stage = new stageAPI.MixedAnalysisStage(
    f.db,
    capture.handle,
    owner ? f.mode : 'FULL',
    historyLimits,
    createMixedAnalysisRules(),
  );
  return { ...f, capture, stage };
}
function syntaxInput(preparation, r) {
  const {
    repository,
    providerVersion,
    providerSnapshotId,
    extractorVersion,
    deadlineEpochMs,
    resourceBudget,
    languages,
  } = r.payload;
  return {
    preparation,
    repository,
    requestId: r.requestId,
    providerVersion,
    providerSnapshotId,
    extractorVersion,
    deadlineEpochMs,
    resourceBudget,
    languages,
  };
}
for (const id of ['java-only', 'mixed', 'python-only'])
  test('A3 Runtime constructors match independent original requests ' + id, async (t) => {
    const f = await setup(t, id),
      b = new HistoryReadBudget(historyLimits);
    const javaPrep = stageAPI.readMixedJavaPreparation(f.stage, f.preparation.contracts);
    if (f.metadata.java) {
      const original = f.metadata.java.request,
        { sourceFiles: _files, irSchemaVersion: _ir, ...fields } = original.payload;
      const actual = api.prepareMixedJavaRequest(
        { preparation: javaPrep, ...fields, requestId: original.requestId },
        b,
      );
      assert.deepEqual(actual, original);
    } else {
      const r = JSON.parse(readComponentReference(rawRoot + id + '-request.jsonl'));
      assert.equal(
        api.prepareMixedJavaRequest(
          {
            preparation: javaPrep,
            repository: r.payload.repository,
            revision: {
              id: javaPrep.targetSource.revisionId,
              repositoryId: javaPrep.targetSource.repositoryId,
              kind: 'WORKTREE',
              contentFingerprint: javaPrep.targetSource.contentFingerprint,
              baseRevisionId: null,
            },
          },
          b,
        ),
        null,
      );
    }
    const owner = f.stage.prepareOwner(f.javaRows, f.preparation);
    const p = stageAPI.readMixedCodeSyntaxPreparation(f.stage, owner.ownerHandle);
    const original = JSON.parse(readComponentReference(rawRoot + id + '-request.jsonl'));
    const output = api.prepareMixedCodeSyntaxRequest(syntaxInput(p, original), b);
    assert.ok(Buffer.isBuffer(output));
    assert.deepEqual(JSON.parse(output), original);
    assert.equal(output.at(-1), 10);
    assert.ok(b.serializedBytes > output.length);
    f.stage.close();
  });
test('A3 Runtime deletion-only skips v2/v5 and preserves actual old basis', async (t) => {
  const f = await setup(t, 'delta-delete-only', true),
    b = new HistoryReadBudget(historyLimits);
  const j = stageAPI.readMixedJavaPreparation(f.stage, f.preparation.contracts);
  const repository = { id: f.input.repositoryId, rootPath: f.input.tables.repository[0].root_path };
  assert.equal(
    api.prepareMixedJavaRequest(
      {
        preparation: j,
        repository,
        revision: {
          id: j.targetSource.revisionId,
          repositoryId: j.targetSource.repositoryId,
          kind: 'WORKTREE',
          contentFingerprint: j.targetSource.contentFingerprint,
          baseRevisionId: null,
        },
      },
      b,
    ),
    null,
  );
  const h = f.stage.prepareOwner(null, f.preparation),
    p = stageAPI.readMixedCodeSyntaxPreparation(f.stage, h.ownerHandle);
  assert.deepEqual(p.expectedActivationBasis, f.capture.view.history.state.basis);
  assert.equal(api.prepareMixedCodeSyntaxRequest({ preparation: p, repository }, b), null);
  f.stage.acceptObservation(h.ownerHandle, null);
  f.stage.close();
});
for (const kind of ['root', 'repository', 'target', 'revision', 'limit'])
  test('A3 Runtime rejects ' + kind, async (t) => {
    const f = await setup(t, 'mixed'),
      b = new HistoryReadBudget(
        kind === 'limit' ? { ...historyLimits, maxItems: 1 } : historyLimits,
      );
    const j = stageAPI.readMixedJavaPreparation(f.stage, f.preparation.contracts);
    const original = f.metadata.java.request,
      { sourceFiles: _f, irSchemaVersion: _ir, ...fields } = structuredClone(original.payload);
    const input = { preparation: structuredClone(j), ...fields, requestId: original.requestId };
    if (kind === 'root') input.repository.rootPath = '/wrong/root';
    if (kind === 'repository') input.repository.id = 'repo:wrong';
    if (kind === 'target') input.preparation.targetSource.contentFingerprint = 'wrong';
    if (kind === 'revision') input.revision.id = 'revision:wrong';
    assert.throws(() => api.prepareMixedJavaRequest(input, b));
    f.stage.close();
  });
test('A3 Runtime distinct event/item allowances are retained and wrong v5 locator refuses', async (t) => {
  const f = await setup(t, 'python-only'),
    h = f.stage.prepareOwner(null, f.preparation);
  const p = stageAPI.readMixedCodeSyntaxPreparation(f.stage, h.ownerHandle),
    r = JSON.parse(readComponentReference(rawRoot + 'python-only-request.jsonl'));
  const input = syntaxInput(p, r);
  input.resourceBudget = {
    ...input.resourceBudget,
    maxItems: r.payload.resourceBudget.maxItems + 1,
  };
  const b = new HistoryReadBudget(historyLimits),
    out = JSON.parse(api.prepareMixedCodeSyntaxRequest(input, b));
  assert.equal(out.payload.resourceBudget.maxEvents, r.payload.resourceBudget.maxEvents);
  assert.equal(out.payload.resourceBudget.maxItems, r.payload.resourceBudget.maxItems + 1);
  input.repository = { ...input.repository, rootPath: '/wrong/root' };
  assert.throws(() => api.prepareMixedCodeSyntaxRequest(input, b));
  f.stage.close();
});

for (const kind of ['missing-language', 'duplicate-language', 'input-limit'])
  test('A3 Runtime v5 refuses ' + kind, async (t) => {
    const f = await setup(t, 'python-only'),
      h = f.stage.prepareOwner(null, f.preparation);
    const p = stageAPI.readMixedCodeSyntaxPreparation(f.stage, h.ownerHandle),
      r = JSON.parse(readComponentReference(rawRoot + 'python-only-request.jsonl'));
    const input = syntaxInput(p, r),
      b = new HistoryReadBudget(historyLimits);
    if (kind === 'missing-language') input.languages = [];
    if (kind === 'duplicate-language') input.languages = [...input.languages, ...input.languages];
    if (kind === 'input-limit')
      input.resourceBudget = { ...input.resourceBudget, maxInputBytes: 1 };
    assert.throws(
      () => api.prepareMixedCodeSyntaxRequest(input, b),
      (e) => typeof e.code === 'string',
    );
    f.stage.close();
  });

test('A3 Runtime nonempty DELTA request retains captured old basis and new target', async (t) => {
  const f = await setup(t, 'delta-python-modified', true),
    h = f.stage.prepareOwner(null, f.preparation);
  const p = stageAPI.readMixedCodeSyntaxPreparation(f.stage, h.ownerHandle);
  const reference = JSON.parse(readComponentReference(rawRoot + 'python-only-request.jsonl'));
  const input = syntaxInput(p, reference);
  input.repository = { id: f.input.repositoryId, rootPath: f.input.tables.repository[0].root_path };
  const result = JSON.parse(
    api.prepareMixedCodeSyntaxRequest(input, new HistoryReadBudget(historyLimits)),
  );
  assert.deepEqual(result.payload.expectedActivationBasis, f.expected.body.expectedOldBasis);
  assert.deepEqual(result.payload.targetSource, f.expected.body.targetSource);
  assert.deepEqual(result.payload.sourceFiles, f.capture.view.targetInventory);
  assert.equal(result.payload.ownerBinding.stageDigest, f.expected.stageDigest);
  f.stage.close();
});

for (const kind of ['valid', 'missing-language', 'duplicate-language'])
  test('A5 empty FULL request ' + kind, async (t) => {
    const f = await observationFixture(t, 'python-only');
    f.db.prepare('DELETE FROM source_files').run();
    const h = captureActivationContext(f.db, f.input.repositoryId, historyLimits);
    const stage = new stageAPI.MixedAnalysisStage(
      f.db,
      h.handle,
      'FULL',
      historyLimits,
      createMixedAnalysisRules(),
    );
    const owner = stage.prepareOwner(null, f.preparation),
      p = stageAPI.readMixedCodeSyntaxPreparation(stage, owner.ownerHandle);
    const r = JSON.parse(
      fs.readFileSync('fixtures/phase1/native-composition-candidate/empty/request.jsonl'),
    );
    const input = syntaxInput(p, r);
    if (kind === 'missing-language') input.languages = [];
    if (kind === 'duplicate-language') input.languages.push(structuredClone(input.languages[0]));
    try {
      if (kind === 'valid') {
        const request = JSON.parse(
          api.prepareMixedCodeSyntaxRequest(input, new HistoryReadBudget(historyLimits)),
        );
        assert.deepEqual(request.payload.sourceFiles, []);
        assert.deepEqual(request.payload.owners, []);
        assert.deepEqual(request.payload.languages, r.payload.languages);
      } else
        assert.throws(() =>
          api.prepareMixedCodeSyntaxRequest(input, new HistoryReadBudget(historyLimits)),
        );
    } finally {
      stage.close();
    }
  });
