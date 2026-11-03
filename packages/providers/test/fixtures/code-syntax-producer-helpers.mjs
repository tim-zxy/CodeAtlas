import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../../../fixtures/phase1/code-syntax-producer-oracle/', import.meta.url);
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export const producerJSON = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
export async function loadProducerCase(id) {
  const all = await producerJSON('cases.json'),
    c = all.find((c) => c.id === id);
  if (!c) throw Error('Unknown producer case');
  return {
    requestTemplate: await readFile(new URL(c.request, root)),
    eventsTemplate: await readFile(new URL(c.events, root)),
    expectedCanonical: await producerJSON(c.canonical),
  };
}
export function instantiateTemplates(requestTemplate, eventsTemplate, rootPath) {
  const token = '"__OWNED_ROOT__"',
    r = requestTemplate.toString('utf8');
  if (r.split(token).length !== 2) throw Error('Root token count');
  const requestBytes = Buffer.from(r.replace(token, JSON.stringify(rootPath)));
  const text = eventsTemplate.toString('utf8'),
    isV5 = JSON.parse(requestBytes).protocolVersion === 5;
  if (
    text.split('"__REQUEST_SHA256__"').length - 1 !== (isV5 ? 2 : 0) ||
    text.split('"__TERMINAL_SHA256__"').length !== 2
  )
    throw Error('Checksum token count');
  const lines = text
    .replaceAll('"__REQUEST_SHA256__"', JSON.stringify(sha(requestBytes)))
    .split('\n');
  if (lines.pop() !== '') throw Error('Expected LF');
  const prefix = Buffer.from(lines.slice(0, -1).join('\n') + '\n');
  const outputBytes = Buffer.from(
    prefix.toString('utf8') +
      lines.at(-1).replace('"__TERMINAL_SHA256__"', JSON.stringify(sha(prefix))) +
      '\n',
  );
  return { requestBytes, expectedOutputBytes: outputBytes };
}
export async function instantiateProducerCase(id, rootPath) {
  const x = await loadProducerCase(id);
  return {
    ...instantiateTemplates(x.requestTemplate, x.eventsTemplate, rootPath),
    expectedCanonical: x.expectedCanonical,
  };
}
export async function loadLegacy(rootPath) {
  return instantiateTemplates(
    await readFile(new URL('legacy-v4/request.template.jsonl', root)),
    await readFile(new URL('legacy-v4/events.template.jsonl', root)),
    rootPath,
  );
}
