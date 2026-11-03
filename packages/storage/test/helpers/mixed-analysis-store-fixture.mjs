import { readComponentReference } from '../../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { MixedAnalysisStage } from '../../dist/analysis/mixed-analysis-stage.js';
import { captureActivationContext } from '../../dist/analysis/activation-history.js';
import { createMixedAnalysisRules } from '../../../runtime/dist/mixed-analysis.js';
import { computeSyntaxOwnerMapDigest } from '../../../providers/dist/native-syntax-owner-binding.js';
import { reseal } from '../../../providers/test/fixtures/native-composition-helpers.mjs';
import { observationFixture } from './mixed-analysis-fixture.mjs';
import { historyLimits, referenceCanonical, seedLiteral } from './r011-history-fixture.mjs';
const w = 'fixtures/phase1/mixed-analysis-stage/component-references';
export function allRows(db) {
  return Object.fromEntries(
    db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => [
        r.name,
        db
          .prepare('SELECT * FROM ' + r.name)
          .all()
          .map((r) => JSON.parse(JSON.stringify(r)))
          .sort((a, b) =>
            referenceCanonical(a) < referenceCanonical(b)
              ? -1
              : referenceCanonical(a) > referenceCanonical(b)
                ? 1
                : 0,
          ),
      ]),
  );
}

export function stageOnConnection(db, id = 'mixed', capture = captureActivationContext) {
  const root = w + '/stage-observation-independent/',
    x = JSON.parse(readComponentReference(root + id + '.json'));
  const h = capture(db, x.input.repositoryId, historyLimits);
  const replace = (v) =>
    typeof v === 'string' && v === 'snapshot:one'
      ? 'snapshot:two'
      : Array.isArray(v)
        ? v.map(replace)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, replace(v)]))
          : v;
  if (h.view.activeBasis) {
    x.metadata = replace(x.metadata);
    x.javaRows = x.javaRows === null ? null : replace(x.javaRows);
  }
  const stage = new MixedAnalysisStage(
    db,
    h.handle,
    'FULL',
    historyLimits,
    createMixedAnalysisRules(),
  );
  function observationForOwner(o) {
    let q = JSON.parse(readComponentReference(root + id + '-request.jsonl')),
      events = readComponentReference(root + id + '-output.jsonl')
        .toString('utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
    if (h.view.activeBasis) {
      q = replace(q);
      events = replace(events);
    }
    const payload = q.payload,
      oldStage = payload.ownerBinding.stageDigest,
      oldMap = payload.ownerBinding.ownerMapDigest;
    payload.expectedActivationBasis = null;
    const binding = { kind: 'PROVISIONAL_CODE', stageDigest: o.stageDigest };
    const map = computeSyntaxOwnerMapDigest({
      expectedActivationBasis: payload.expectedActivationBasis,
      targetSource: payload.targetSource,
      ownerBinding: binding,
      providerId: payload.providerId,
      providerSnapshotId: payload.providerSnapshotId,
      sourceFiles: payload.sourceFiles,
      owners: payload.owners,
    });
    const rebind = (v) =>
      v === oldStage
        ? o.stageDigest
        : v === oldMap
          ? map
          : Array.isArray(v)
            ? v.map(rebind)
            : v && typeof v === 'object'
              ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, rebind(v)]))
              : v;
    q = rebind(q);
    events = rebind(events);
    for (const e of events)
      if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED')
        e.payload.expectedActivationBasis = null;
    return { metadata: x.metadata, ...reseal(q, events) };
  }
  return { stage, javaRows: x.javaRows, preparation: x.preparation, observationForOwner };
}
export function freezeOnConnection(db, id = 'mixed', capture = captureActivationContext) {
  const ctx = stageOnConnection(db, id, capture),
    owner = ctx.stage.prepareOwner(ctx.javaRows, ctx.preparation);
  ctx.stage.acceptObservation(owner.ownerHandle, ctx.observationForOwner(owner));
  return { stage: ctx.stage, token: ctx.stage.freeze() };
}
export async function frozen(t, id = 'mixed') {
  const f = await observationFixture(t, id);
  return { ...f, ...freezeOnConnection(f.db, id) };
}
export async function committedPythonFixture(t) {
  const x = JSON.parse(
    readComponentReference(w + '/stage-observation-independent/python-only.json'),
  );
  const target = JSON.parse(readComponentReference(w + '/store-row-independent/python-only.json'));
  // An independent pre-Store SQL target seeds a fresh isolated literal database; no product output is used as a golden.
  const clean = await import('./r011-history-fixture.mjs');
  const g = await clean.historyFixture(t, 'available', { seed: false });
  seedLiteral(g.db, { ...x.input, tables: { ...x.input.tables, ...target.tables } });
  return { ...g, input: x.input, ...freezeOnConnection(g.db, 'python-only') };
}
