import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observationFixture } from '../../storage/test/helpers/mixed-analysis-fixture.mjs';
import {
  freezeOnConnection,
  allRows,
} from '../../storage/test/helpers/mixed-analysis-store-fixture.mjs';
import { historyLimits } from '../../storage/test/helpers/r011-history-fixture.mjs';
import {
  captureActivationContext,
  releaseActivationContext,
} from '../../storage/dist/analysis/activation-history.js';
import {
  MixedAnalysisStage,
  readMixedNoOpBasis,
} from '../../storage/dist/analysis/mixed-analysis-stage.js';
import { MixedAnalysisStore } from '../../storage/dist/analysis/mixed-analysis-store.js';
import { computeSyntaxOwnerMapDigest } from '../../providers/dist/native-syntax-owner-binding.js';
import { reseal } from '../../providers/test/fixtures/native-composition-helpers.mjs';
const input = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/mixed-analysis-store/binding-history/inputs.json',
      import.meta.url,
    ),
  ),
);
async function rules() {
  const api = await import('../dist/mixed-analysis.js');
  assert.equal(typeof api.createBindingMixedAnalysisRules, 'function');
  return api.createBindingMixedAnalysisRules();
}
async function staged(db, mode = 'FULL', snapshotId = 'snapshot:one', partial = false) {
  const port = await rules(),
    capture = captureActivationContext(db, 'repo:one', historyLimits),
    stage = new MixedAnalysisStage(db, capture.handle, mode, historyLimits, port);
  const owner = stage.prepareOwner(null, {
    contracts: input.contracts,
    qualificationRef: 'fixture:declared-no-physical-qualification',
  });
  let x = structuredClone(input);
  if (capture.view.targetInventory.length === 0) {
    const empty = await loadCompositionCase('empty');
    x = {
      ...x,
      metadata: empty.metadata,
      request: JSON.parse(empty.requestBytes),
      events: empty.outputBytes.toString().trimEnd().split('\n').map(JSON.parse),
    };
    x.request.protocolVersion = 6;
    x.request.payload.syntaxContract = 'SYNTAX_BINDING_V2';
    for (const e of x.events) {
      e.protocolVersion = 6;
      if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(e.type))
        e.payload.syntaxContract = 'SYNTAX_BINDING_V2';
    }
  }
  const replace = (v) =>
    typeof v === 'string' && v === 'snapshot:one'
      ? snapshotId
      : Array.isArray(v)
        ? v.map(replace)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replace(x)]))
          : v;
  const metadata = replace(x.metadata),
    request = replace(x.request),
    events = replace(x.events),
    p = request.payload;
  metadata.inventory = [...capture.view.targetInventory].sort(
    (a, b) =>
      Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
      Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)),
  );
  metadata.targetSource = capture.view.targetSource;
  p.targetSource = capture.view.targetSource;
  p.expectedActivationBasis = mode === 'FULL' ? null : capture.view.history.state.basis;
  p.sourceFiles = p.sourceFiles.map((f) => capture.view.targetInventory.find((g) => g.id === f.id));
  for (const e of events)
    if (['SYNTAX_OBSERVATION', 'CODE_COVERAGE', 'SYNTAX_COVERAGE'].includes(e.type)) {
      const file = capture.view.targetInventory.find((f) => f.id === e.payload.sourceFileId);
      if (file) e.payload.sourceFingerprint = file.contentFingerprint;
    }
  p.ownerBinding = { kind: 'PROVISIONAL_CODE', stageDigest: owner.stageDigest, ownerMapDigest: '' };
  p.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest({
    expectedActivationBasis: p.expectedActivationBasis,
    targetSource: p.targetSource,
    ownerBinding: { kind: 'PROVISIONAL_CODE', stageDigest: owner.stageDigest },
    providerId: p.providerId,
    providerSnapshotId: p.providerSnapshotId,
    sourceFiles: p.sourceFiles,
    owners: p.owners,
  });
  for (const e of events)
    if (['OBSERVATION_STARTED', 'OBSERVATION_COMPLETED'].includes(e.type)) {
      e.payload.ownerBinding = p.ownerBinding;
      e.payload.targetSource = p.targetSource;
      e.payload.expectedActivationBasis = p.expectedActivationBasis;
    }
  if (partial) {
    events.find((e) => e.type === 'SYNTAX_COVERAGE').payload.status = 'PARTIAL';
    events.find((e) => e.type === 'SYNTAX_COVERAGE').payload.limitations = [
      'UNRESOLVED_OR_UNSUPPORTED_SYNTAX',
    ];
    events.at(-1).payload.syntaxOutcome = 'PARTIAL';
    events.at(-1).payload.outcome = 'PARTIAL';
  }
  return { stage, owner, capture, raw: { metadata, ...reseal(request, events) } };
}
test('binding full publishes complete v2 through real Stage/Store and readonly reopens', async (t) => {
  await rules();
  const f = await observationFixture(t, 'python-only'),
    s = await staged(f.db);
  s.stage.acceptObservation(s.owner.ownerHandle, s.raw);
  const token = s.stage.freeze(),
    store = new MixedAnalysisStore(f.db),
    id = store.apply(token.lease, historyLimits);
  const h = captureActivationContext(f.db, 'repo:one', historyLimits);
  assert.equal(h.view.status, 'AVAILABLE');
  assert.ok(h.view.history.syntaxMembers.length > 0);
  const reference = JSON.parse(
    readFileSync(
      new URL(
        '../../../fixtures/phase1/native-composition-candidate/python-only/expected.json',
        import.meta.url,
      ),
    ),
  ).merged;
  for (const key of ['nodes', 'edges'])
    assert.deepEqual(
      h.view.history.state[key],
      [...reference[key]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    );
  for (const row of f.db.prepare('SELECT origin_json FROM syntax_origins').all()) {
    const body = JSON.parse(row.origin_json);
    assert.equal(body.envelope.version, 2);
    assert.ok(body.envelope.payload.lexicalScope);
  }
  const reopened = f.reopen(true),
    again = captureActivationContext(reopened, 'repo:one', historyLimits);
  assert.deepEqual(again.view.history, h.view.history);
  releaseActivationContext(reopened, again.handle);
  releaseActivationContext(f.db, h.handle);
  assert.throws(
    () => store.apply(token.lease, historyLimits),
    (e) => e.code === 'STAGE_RELEASED',
  );
  s.stage.close();
});
test('binding upgrade reobserves unchanged Native source and preserves immutable v1 ancestor', async (t) => {
  await rules();
  const f = await observationFixture(t, 'python-only'),
    old = freezeOnConnection(f.db, 'python-only');
  new MixedAnalysisStore(f.db).apply(old.token.lease, historyLimits);
  old.stage.close();
  const before = f.db.prepare('SELECT * FROM syntax_origins ORDER BY id').all(),
    s = await staged(f.db, 'DELTA', 'snapshot:two');
  s.stage.acceptObservation(s.owner.ownerHandle, s.raw);
  const token = s.stage.freeze();
  new MixedAnalysisStore(f.db).apply(token.lease, historyLimits);
  const h = captureActivationContext(f.db, 'repo:one', historyLimits);
  assert.ok(h.view.history.parent);
  const active = new Set(h.view.history.syntaxMembers.map((m) => m.originId));
  for (const row of before) {
    assert.deepEqual(f.db.prepare('SELECT * FROM syntax_origins WHERE id=?').get(row.id), row);
    assert.equal(active.has(row.id), false);
  }
  for (const row of f.db.prepare('SELECT id,origin_json FROM syntax_origins').all())
    if (active.has(row.id)) assert.equal(JSON.parse(row.origin_json).envelope.version, 2);
  releaseActivationContext(f.db, h.handle);
  s.stage.close();
});
test('binding PARTIAL and transaction failure keep complete last-good image', async (t) => {
  await rules();
  const f = await observationFixture(t, 'python-only');
  const good = await staged(f.db);
  good.stage.acceptObservation(good.owner.ownerHandle, good.raw);
  new MixedAnalysisStore(f.db).apply(good.stage.freeze().lease, historyLimits);
  good.stage.close();
  const s = await staged(f.db, 'FULL', 'snapshot:two', true),
    before = allRows(f.db);
  assert.throws(() => s.stage.acceptObservation(s.owner.ownerHandle, s.raw));
  s.stage.close();
  assert.deepEqual(allRows(f.db), before);
  const ready = await staged(f.db, 'FULL', 'snapshot:three');
  ready.stage.acceptObservation(ready.owner.ownerHandle, ready.raw);
  const token = ready.stage.freeze();
  f.db.exec(
    "CREATE TEMP TRIGGER binding_fail BEFORE INSERT ON syntax_projections BEGIN SELECT RAISE(ABORT,'binding-test-rollback');END",
  );
  assert.throws(() => new MixedAnalysisStore(f.db).apply(token.lease, historyLimits));
  assert.deepEqual(allRows(f.db), before);
  ready.stage.close();
});

import { RepositorySourceStateStore } from '../../storage/dist/source-state/repository.js';
import { loadCompositionCase } from '../../providers/test/fixtures/native-composition-helpers.mjs';
test('binding retained v2, deletion-only, NO_OP and empty FULL preserve original origins', async (t) => {
  await rules();
  const f = await observationFixture(t, 'python-only'),
    source = new RepositorySourceStateStore(f.db),
    before = source.load('repo:one');
  const notes = {
    ...before.files[0],
    id: 'file:notes',
    path: 'notes.md',
    contentFingerprint: 'notes:one',
    classification: { role: 'OTHER', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: null,
  };
  source.replace(before, {
    revision: { ...before.revision, contentFingerprint: 'content:withnotes' },
    files: [...before.files, notes],
  });
  const full = await staged(f.db);
  full.stage.acceptObservation(full.owner.ownerHandle, full.raw);
  new MixedAnalysisStore(f.db).apply(full.stage.freeze().lease, historyLimits);
  full.stage.close();
  const originals = f.db.prepare('SELECT * FROM syntax_origins ORDER BY id').all(),
    state = source.load('repo:one');
  source.replace(state, {
    revision: { ...state.revision, contentFingerprint: 'content:withoutnotes' },
    files: state.files.filter((f) => f.id !== 'file:notes'),
  });
  const h = captureActivationContext(f.db, 'repo:one', historyLimits),
    stage = new MixedAnalysisStage(f.db, h.handle, 'DELTA', historyLimits, await rules()),
    owner = stage.prepareOwner(null, {
      contracts: input.contracts,
      qualificationRef: 'fixture:declared-no-physical-qualification',
    });
  stage.acceptObservation(owner.ownerHandle, null);
  new MixedAnalysisStore(f.db).apply(stage.freeze().lease, historyLimits);
  stage.close();
  assert.deepEqual(f.db.prepare('SELECT * FROM syntax_origins ORDER BY id').all(), originals);
  const captured = captureActivationContext(f.db, 'repo:one', historyLimits);
  assert.equal(captured.view.history.syntaxMembers.length, originals.length);
  releaseActivationContext(f.db, captured.handle);
  const image = allRows(f.db),
    noopCapture = captureActivationContext(f.db, 'repo:one', historyLimits),
    noop = new MixedAnalysisStage(f.db, noopCapture.handle, 'DELTA', historyLimits, await rules());
  assert.ok(readMixedNoOpBasis(noop, input.contracts));
  noop.close();
  assert.deepEqual(allRows(f.db), image);
  const old = source.load('repo:one');
  source.replace(old, {
    revision: { ...old.revision, contentFingerprint: 'content:empty' },
    files: [],
  });
  const deleted = captureActivationContext(f.db, 'repo:one', historyLimits),
    remove = new MixedAnalysisStage(f.db, deleted.handle, 'DELTA', historyLimits, await rules()),
    o = remove.prepareOwner(null, {
      contracts: input.contracts,
      qualificationRef: 'fixture:declared-no-physical-qualification',
    });
  remove.acceptObservation(o.ownerHandle, null);
  new MixedAnalysisStore(f.db).apply(remove.freeze().lease, historyLimits);
  remove.close();
  const last = captureActivationContext(f.db, 'repo:one', historyLimits);
  assert.equal(last.view.history.syntaxMembers.length, 0);
  releaseActivationContext(f.db, last.handle);
  assert.deepEqual(f.db.prepare('SELECT * FROM syntax_origins ORDER BY id').all(), originals);
  const empty = await staged(f.db, 'FULL', 'snapshot:empty');
  empty.stage.acceptObservation(empty.owner.ownerHandle, empty.raw);
  new MixedAnalysisStore(f.db).apply(empty.stage.freeze().lease, historyLimits);
  empty.stage.close();
  assert.equal(f.db.prepare('SELECT count(*) n FROM canonical_nodes').get().n, 0);
});

import { createHash } from 'node:crypto';
test('binding same-version DELTA publishes changed source with fresh v2 origins', async (t) => {
  await rules();
  const f = await observationFixture(t, 'python-only'),
    full = await staged(f.db);
  full.stage.acceptObservation(full.owner.ownerHandle, full.raw);
  new MixedAnalysisStore(f.db).apply(full.stage.freeze().lease, historyLimits);
  full.stage.close();
  const source = new RepositorySourceStateStore(f.db),
    old = source.load('repo:one'),
    next = structuredClone(old),
    text = input.sourceText + '# source edit\n';
  next.revision.contentFingerprint = 'content:delta';
  next.files[0].contentFingerprint = 'sha256:' + createHash('sha256').update(text).digest('hex');
  source.replace(old, next);
  const delta = await staged(f.db, 'DELTA', 'snapshot:delta');
  delta.stage.acceptObservation(delta.owner.ownerHandle, delta.raw);
  new MixedAnalysisStore(f.db).apply(delta.stage.freeze().lease, historyLimits);
  delta.stage.close();
  const h = captureActivationContext(f.db, 'repo:one', historyLimits);
  assert.equal(h.view.history.state.basis.contentFingerprint, 'content:delta');
  assert.ok(h.view.history.transitions);
  for (const member of h.view.history.syntaxMembers) {
    const origin = JSON.parse(
      f.db.prepare('SELECT origin_json FROM syntax_origins WHERE id=?').get(member.originId)
        .origin_json,
    );
    assert.equal(origin.envelope.version, 2);
    assert.equal(origin.sourceFile.contentFingerprint, next.files[0].contentFingerprint);
  }
  releaseActivationContext(f.db, h.handle);
});

test('binding fixed factory rejects legacy contract on raw-free NO_OP', async () => {
  const port = await rules(),
    old = JSON.parse(
      readFileSync(
        new URL(
          '../../../fixtures/phase1/mixed-analysis-store/noop-independent-context.json',
          import.meta.url,
        ),
      ),
    ).declared.input;
  const { rawCase, ...request } = old;
  request.rawBundle = null;
  assert.throws(() => port.compose(request, historyLimits));
});
