import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../../../fixtures/phase1/native-composition-candidate/', import.meta.url);
export const sha = (x) => createHash('sha256').update(x).digest('hex');
export const fixtureJSON = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
export const limits = {
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
};
export async function loadCompositionCase(id) {
  const c = (await fixtureJSON('cases.json')).find((x) => x.id === id);
  if (!c) throw Error('Unknown fixture');
  return {
    metadata: await fixtureJSON(c.metadata),
    requestBytes: await readFile(new URL(c.request, root)),
    outputBytes: await readFile(new URL(c.output, root)),
    expected: await fixtureJSON(c.expected),
  };
}
export function reseal(request, events) {
  events = structuredClone(events);
  const requestBytes = Buffer.from(JSON.stringify(request) + '\n');
  for (const e of events)
    if (e.type === 'OBSERVATION_STARTED' || e.type === 'OBSERVATION_COMPLETED')
      e.payload.requestChecksum = sha(requestBytes);
  for (const [i, e] of events.entries()) e.sequence = i;
  const last = events.at(-1);
  if (last.type === 'OBSERVATION_COMPLETED')
    last.payload.checksum = sha(
      Buffer.from(
        events
          .slice(0, -1)
          .map((x) => JSON.stringify(x) + '\n')
          .join(''),
      ),
    );
  return {
    requestBytes,
    outputBytes: Buffer.from(events.map((x) => JSON.stringify(x) + '\n').join('')),
  };
}
