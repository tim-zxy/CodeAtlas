import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { ownerFixture } from './helpers/mixed-analysis-fixture.mjs';
import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { historyFixture, seedLiteral, historyLimits } from './helpers/r011-history-fixture.mjs';
import { allRows } from './helpers/mixed-analysis-store-fixture.mjs';
import { captureActivationContext } from '../dist/analysis/activation-history.js';
import { MixedAnalysisStage } from '../dist/analysis/mixed-analysis-stage.js';
import { createMixedAnalysisRules } from '../../runtime/dist/mixed-analysis.js';
const x = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../fixtures/phase1/mixed-analysis-stage/other-zero-context.json',
      import.meta.url,
    ),
  ),
);
test('bound original OTHER-only full zero facts accepts complete declared raw without treating it as deletion', async (t) => {
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(sha(fs.readFileSync(x.provenance.emptyTarget)), x.provenance.emptyTargetSha256);
  assert.equal(sha(readComponentReference(x.provenance.source)), x.provenance.sourceSha256);
  for (const key of ['input', 'expected'])
    assert.equal(
      sha(fs.readFileSync('fixtures/phase1/mixed-analysis-stage/' + x.binding[key])),
      x.binding[key + 'Sha256'],
    );
  const raw = {
      metadata: structuredClone(x.raw.metadata),
      requestBytes: Buffer.from(x.raw.requestText),
      outputBytes: Buffer.from(x.raw.outputText),
    },
    rules = createMixedAnalysisRules(),
    input = {
      mode: 'FULL',
      target: {
        source: x.owner.body.targetSource,
        repositoryLocatorDigest: x.owner.body.repositoryLocatorDigest,
        inventory: x.expected.manifest.state.inventory,
        contracts: x.preparation.contracts,
      },
      capture: {
        parent: null,
        snapshotIds: [],
        snapshots: [],
        coverage: [],
        activeProviderIds: [],
      },
      rawBundle: raw,
      qualificationRef: x.preparation.qualificationRef,
    };
  const { usage, code, ...control } = rules.compose(input, historyLimits);
  assert.deepEqual(code, {
    targetSource: x.owner.body.targetSource,
    committedSnapshotCount: 1,
    nodes: [],
    edges: [],
    evidence: [],
    bindings: [],
    factEvidence: [],
    candidates: [],
    snapshots: x.expected.manifest.state.snapshots,
    coverage: [],
  });
  assert.deepEqual(
    control,
    x.expected,
    'existing pure Runtime independently proves the declared zero-fact input and expected history',
  );
  const f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.source);
  const before = allRows(f.db),
    h = captureActivationContext(f.db, x.source.repositoryId, historyLimits),
    s = new MixedAnalysisStage(f.db, h.handle, 'FULL', historyLimits, rules),
    owner = s.prepareOwner(null, x.preparation);
  assert.equal(owner.stageDigest, x.owner.stageDigest);
  assert.deepEqual(
    JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='OWNER'").get().value_json,
    ),
    x.owner.body,
  );
  s.acceptObservation(owner.ownerHandle, raw);
  const token = s.freeze(),
    actual = JSON.parse(
      f.db.prepare("SELECT value_json FROM mixed_stage WHERE key='FROZEN'").get().value_json,
    );
  assert.deepEqual(token.basis, x.expected.basis);
  for (const key of Object.keys(x.expected)) assert.deepEqual(actual[key], x.expected[key]);
  assert.deepEqual(allRows(f.db), before);
  s.close();
  assert.deepEqual(allRows(f.reopen(true)), before);
});

for (const kind of ['FULL-null', 'FULL-wrong-inventory', 'FULL-bad-request', 'DELTA-with-raw'])
  test('zero-unit admission keeps strict ' + kind + ' refusal', async (t) => {
    const deletion = kind === 'DELTA-with-raw',
      f = deletion
        ? await ownerFixture(t, 'delta-delete-only')
        : await historyFixture(t, 'available', { seed: false });
    if (!deletion) seedLiteral(f.db, x.source);
    const before = allRows(f.db),
      h = captureActivationContext(
        f.db,
        deletion ? f.input.repositoryId : x.source.repositoryId,
        historyLimits,
      ),
      rules = createMixedAnalysisRules();
    let composes = 0;
    const stage = new MixedAnalysisStage(
        f.db,
        h.handle,
        deletion ? 'DELTA' : 'FULL',
        historyLimits,
        Object.freeze({
          ...rules,
          compose(...args) {
            composes++;
            return rules.compose(...args);
          },
        }),
      ),
      owner = stage.prepareOwner(null, deletion ? f.preparation : x.preparation);
    let raw = {
      metadata: structuredClone(x.raw.metadata),
      requestBytes: Buffer.from(x.raw.requestText),
      outputBytes: Buffer.from(x.raw.outputText),
    };
    if (kind === 'FULL-null') raw = null;
    if (kind === 'FULL-wrong-inventory') raw.metadata.inventory = [];
    if (kind === 'FULL-bad-request') raw.requestBytes.fill(0);
    assert.throws(
      () => stage.acceptObservation(owner.ownerHandle, raw),
      (e) => e.message === e.code,
    );
    assert.throws(
      () => stage.freeze(),
      (e) => e.code === 'STAGE_RELEASED',
    );
    assert.equal(composes, 0);
    assert.deepEqual(allRows(f.db), before);
    stage.close();
    assert.deepEqual(allRows(f.reopen(true)), before);
  });
