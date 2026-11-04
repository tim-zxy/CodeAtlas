import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const provenance = JSON.parse(readFileSync(new URL('provenance.json', import.meta.url), 'utf8'));
const data = provenance.budgetReference;
export function visitJSON(v, depth = 0) {
  let items = 1,
    maxDepth = depth;
  if (v !== null && typeof v === 'object')
    for (const x of Object.values(v)) {
      const r = visitJSON(x, depth + 1);
      items += r.items;
      maxDepth = Math.max(maxDepth, r.maxDepth);
    }
  return {
    serializedBytes: Buffer.byteLength(JSON.stringify(v)),
    items,
    depth: maxDepth,
  };
}
export function sumOperations(ops) {
  const out = { serializedBytes: 0, items: 0 };
  for (const v of ops)
    for (const k of ['serializedBytes', 'items']) {
      if (!Number.isSafeInteger(v[k]) || v[k] < 0 || v[k] > Number.MAX_SAFE_INTEGER - out[k])
        throw Error('Unsafe frozen reference');
      out[k] += v[k];
    }
  return out;
}
export function reference(id = 'BASE') {
  const r = data[id];
  if (!r) throw Error('Missing frozen accounting reference');
  const total = sumOperations(r.operations);
  if (JSON.stringify(total) !== JSON.stringify(r.total)) throw Error('Frozen total mismatch');
  return r;
}
export function span(id, start, end) {
  const ops = reference(id).operations,
    a = ops.findIndex((o) => o.tag === start);
  if (a < 0) throw Error('No reference start');
  const b = ops.findIndex((o, i) => i >= a && o.tag === end);
  if (b < 0) throw Error('No reference end');
  return sumOperations(ops.slice(a, b + 1));
}
export function tupleReference(domain, fields) {
  const hash = createHash('sha256')
    .update(domain)
    .update(Buffer.from([0]));
  let bytes = Buffer.byteLength(domain) + 1;
  for (const field of fields) {
    const b = Buffer.from(String(field));
    hash.update(String(b.length) + ':').update(b);
    bytes += String(b.length).length + 1 + b.length;
  }
  const id = domain + ':' + hash.digest('hex');
  return {
    id,
    serializedBytes: bytes + Buffer.byteLength(id),
    items: fields.length + 2,
  };
}
export function budgetLimits(recipe) {
  const l = {
      maxSerializedBytes: Number.MAX_SAFE_INTEGER,
      maxItems: Number.MAX_SAFE_INTEGER,
      maxDepth: Number.MAX_SAFE_INTEGER,
    },
    r = reference();
  if (recipe === 'total-bytes-minus-one') l.maxSerializedBytes = r.total.serializedBytes - 1;
  else if (recipe === 'total-items-minus-one') l.maxItems = r.total.items - 1;
  else if (recipe === 'depth-or-overflow') l.maxDepth = 1;
  else if (recipe === 'raw-prefix') l.maxItems = provenance.rawPrefixAllowance.maxItems;
  else {
    const tag =
      recipe === 'tuple-prefix'
        ? 'support-tuple'
        : recipe === 'support-prefix'
          ? 'support-row'
          : 'selector-fact-copy';
    const i = r.operations.findIndex((o) => o.tag === tag);
    l.maxItems = sumOperations(r.operations.slice(0, i + 1)).items - 1;
  }
  return l;
}
