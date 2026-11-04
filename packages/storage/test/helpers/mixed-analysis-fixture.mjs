import { readComponentReference } from '../../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import { historyFixture, seedLiteral } from './r011-history-fixture.mjs';
const ownerRoot =
  'fixtures/phase1/mixed-analysis-stage/component-references/owner-scope-independent';
export async function ownerFixture(t, id) {
  const x = JSON.parse(readComponentReference(ownerRoot + '/' + id + '.json')),
    f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.input);
  return { ...f, ...x };
}
const observationRoot =
  'fixtures/phase1/mixed-analysis-stage/component-references/stage-observation-independent';
export async function observationFixture(t, id) {
  const x = JSON.parse(readComponentReference(observationRoot + '/' + id + '.json')),
    f = await historyFixture(t, 'available', { seed: false });
  seedLiteral(f.db, x.input);
  return {
    ...f,
    ...x,
    raw: {
      metadata: x.metadata,
      requestBytes: readComponentReference(observationRoot + '/' + id + '-request.jsonl'),
      outputBytes: readComponentReference(observationRoot + '/' + id + '-output.jsonl'),
    },
  };
}
