import assert from 'node:assert/strict';
import test from 'node:test';
import { cases, loadCase } from '../../../fixtures/phase1/mixed-code-identity/corpus.mjs';
function ordered(v) {
  return Array.isArray(v)
    ? v.map(ordered)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
            .map((k) => [k, ordered(v[k])]),
        )
      : v;
}
for (const c of cases)
  test('independent C3-A byte transcript ' + c.id, async () => {
    const { createCodeIdentityEncoder } = await import('../dist/analysis/code-identity.js'),
      { input, expected } = loadCase(c);
    let transcript = '',
      remembered = [];
    const e = createCodeIdentityEncoder(input.domain, {
      start: (s) => (transcript += s),
      encode: (v, rawBytes) => {
        assert.equal(rawBytes, 0);
        const j = JSON.stringify(ordered(v));
        transcript += Buffer.byteLength(j) + ':' + j;
        return j;
      },
      remember: (tag, v) => remembered.push({ tag, v }),
      end: () => {},
    });
    for (const g of input.groups) {
      e.group(g.tag, g.entries.length);
      for (const entry of g.entries) e.emit(entry);
    }
    assert.equal(transcript, expected.transcript);
    assert.equal(e.end(), expected.digest);
    assert.equal(Buffer.byteLength(transcript), expected.serializedBytes);
    assert.equal(
      remembered.length,
      input.groups.reduce((n, g) => n + 1 + g.entries.length, 0),
    );
  });

import fs from 'node:fs';
import crypto from 'node:crypto';
import { HistoryReadBudget } from '../dist/analysis/activation-history-format.js';
import { historyLimits } from './helpers/r011-history-fixture.mjs';
import * as identity from '../dist/analysis/code-identity.js';
function rowPacket(groups) {
  const g = Object.fromEntries(groups.map((x) => [x.tag, x.entries.map((e) => e.value)])),
    h = g.HEADER[0];
  return {
    targetSource: {
      repositoryId: h.repositoryId,
      revisionId: h.indexedRevisionId,
      contentFingerprint: h.indexedContentFingerprint,
    },
    committedSnapshotCount: h.committedSnapshotCount,
    nodes: g.NODE,
    edges: g.EDGE,
    evidence: g.EVIDENCE,
    bindings: g.BINDING,
    factEvidence: g.FACT_EVIDENCE,
    candidates: g.SUPPORT_CANDIDATE,
    snapshots: g.SNAPSHOT.map((s) => ({
      ...s.snapshot,
      capabilities: s.capabilities,
      diagnostics: [],
      startedAt: '2026-10-24T00:00:00.000Z',
      completedAt: '2026-10-24T00:00:00.003Z',
    })),
    coverage: g.COVERAGE.flatMap((c) =>
      Array.from({ length: c.multiplicity }, () => {
        const { multiplicity, ...row } = c;
        return row;
      }),
    ),
  };
}
const completeIdentityCases = cases.filter((c) => {
  const x = loadCase(c).input;
  return (
    x.domain === 'codeatlas-code-activation-v1' &&
    x.groups.length === 9 &&
    x.groups[0].entries.length === 1
  );
});
for (const c of completeIdentityCases)
  test('future row view matches independent complete C3A digest ' + c.id, () => {
    assert.equal(typeof identity.predictCodeActivation, 'function');
    const { input, expected } = loadCase(c),
      packet = rowPacket(input.groups),
      before = structuredClone(packet);
    for (const key of [
      'nodes',
      'edges',
      'evidence',
      'bindings',
      'factEvidence',
      'candidates',
      'snapshots',
      'coverage',
    ])
      packet[key].reverse();
    for (const s of packet.snapshots) s.capabilities.reverse();
    const basis = identity.predictCodeActivation(packet, new HistoryReadBudget(historyLimits));
    assert.deepEqual(basis, { ...packet.targetSource, codeActivationDigest: expected.digest });
    assert.deepEqual(packet, {
      ...before,
      nodes: [...before.nodes].reverse(),
      edges: [...before.edges].reverse(),
      evidence: [...before.evidence].reverse(),
      bindings: [...before.bindings].reverse(),
      factEvidence: [...before.factEvidence].reverse(),
      candidates: [...before.candidates].reverse(),
      snapshots: [...before.snapshots]
        .reverse()
        .map((s) => ({ ...s, capabilities: [...s.capabilities].reverse() })),
      coverage: [...before.coverage].reverse(),
    });
  });
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test('future row view matches frozen complete Native target ' + id, () => {
    const t = JSON.parse(
        fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/' + id + '.json'),
      ),
      groups = Object.entries(t.codeGroups).map(([tag, values]) => ({
        tag,
        entries: values.map((value) => ({ value })),
      })),
      packet = rowPacket(groups);
    packet.snapshots = t.manifest.state.snapshots;
    assert.equal(typeof identity.predictCodeActivation, 'function');
    assert.deepEqual(
      identity.predictCodeActivation(packet, new HistoryReadBudget(historyLimits)),
      t.basis,
    );
  });
test('future global snapshot census changes HEADER even when all current revision rows match', () => {
  const { input } = loadCase(completeIdentityCases[0]),
    packet = rowPacket(input.groups);
  packet.committedSnapshotCount++;
  const groups = structuredClone(input.groups);
  groups[0].entries[0].value.committedSnapshotCount++;
  let bytes = input.domain + '\0';
  for (const g of groups) {
    for (const value of [{ tag: g.tag, count: g.entries.length }, ...g.entries]) {
      const encoded = JSON.stringify(ordered(value));
      bytes += Buffer.byteLength(encoded) + ':' + encoded;
    }
  }
  assert.equal(typeof identity.predictCodeActivation, 'function');
  assert.equal(
    identity.predictCodeActivation(packet, new HistoryReadBudget(historyLimits))
      .codeActivationDigest,
    crypto.createHash('sha256').update(bytes).digest('hex'),
  );
});
test('future row predictor refuses duplicate keys, unsafe input, impossible census and tiny operation budgets', () => {
  const packet = rowPacket(loadCase(completeIdentityCases[0]).input.groups);
  let calls = 0;
  const getter = Object.defineProperty({}, 'targetSource', {
    enumerable: true,
    get() {
      calls++;
      throw Error('SECRET');
    },
  });
  for (const x of [
    getter,
    new Proxy(packet, {}),
    { ...packet, committedSnapshotCount: 0 },
    { ...packet, committedSnapshotCount: Number.MAX_SAFE_INTEGER + 1 },
    { ...packet, nodes: [...packet.nodes, packet.nodes[0]] },
    { ...packet, ready: true },
  ]) {
    assert.equal(typeof identity.predictCodeActivation, 'function');
    assert.throws(
      () => identity.predictCodeActivation(x, new HistoryReadBudget(historyLimits)),
      (e) => e.code === 'INVALID_HISTORY' && !e.message.includes('SECRET'),
    );
  }
  assert.equal(calls, 0);
  for (const key of ['maxItems', 'maxSerializedBytes', 'maxDepth', 'memoryBudgetBytes'])
    assert.throws(
      () =>
        identity.predictCodeActivation(
          packet,
          new HistoryReadBudget({ ...historyLimits, [key]: 1 }),
        ),
      (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
    );
});

// Independent arithmetic over the frozen transcript, never over predictor receipts.
function identityOperationReference(packet, input) {
  const stats = (v, depth = 0) => {
    let items = 1,
      weight = typeof v === 'string' ? Buffer.byteLength(v) : 0,
      maxDepth = depth;
    if (v !== null && typeof v === 'object') {
      if (!Array.isArray(v)) for (const k of Object.keys(v)) weight += Buffer.byteLength(k);
      for (const child of Object.values(v)) {
        const s = stats(child, depth + 1);
        items += s.items;
        weight += s.weight;
        maxDepth = Math.max(maxDepth, s.maxDepth);
      }
    }
    return { items, weight, maxDepth };
  };
  const out = {
    items: 0,
    serializedBytes: Buffer.byteLength(input.domain) + 1,
    retainedLogicalBytes: Buffer.byteLength(input.domain) + 1,
    maxDepth: 0,
  };
  const own = (v, n = 1) => {
    const x = stats(v);
    out.items += n * x.items;
    out.retainedLogicalBytes += n * x.weight;
    out.maxDepth = Math.max(out.maxDepth, x.maxDepth);
  };
  own(packet, 2);
  for (const row of packet.coverage) {
    const key = [
      row.providerSnapshotId,
      row.capabilityName,
      row.sourceFileId === null ? 'NONE' : 'SOURCE',
      row.sourceFileId ?? '',
      row.status,
    ];
    own([key, JSON.stringify(key), row]);
  }
  for (const group of input.groups) {
    own(group.entries);
    for (const value of [{ tag: group.tag, count: group.entries.length }, ...group.entries]) {
      own(value, 2);
      const bytes = Buffer.byteLength(JSON.stringify(ordered(value))),
        prefix = String(bytes).length + 1;
      out.serializedBytes += prefix + bytes;
      out.retainedLogicalBytes += 2 * bytes + prefix;
    }
  }
  out.retainedLogicalBytes += 64;
  return out;
}
for (const c of completeIdentityCases)
  test(
    'future identity independently derived exact and one-below operation budgets ' + c.id,
    () => {
      const { input, expected } = loadCase(c),
        packet = rowPacket(input.groups),
        r = identityOperationReference(packet, input),
        limits = {
          maxRows: 1,
          maxItems: r.items,
          maxSerializedBytes: r.serializedBytes,
          maxDepth: r.maxDepth,
          memoryBudgetBytes: 2 * r.retainedLogicalBytes,
        },
        b = new HistoryReadBudget(limits);
      assert.equal(identity.predictCodeActivation(packet, b).codeActivationDigest, expected.digest);
      assert.deepEqual(
        {
          items: b.items,
          serializedBytes: b.serializedBytes,
          retainedLogicalBytes: b.retainedLogicalBytes,
        },
        {
          items: r.items,
          serializedBytes: r.serializedBytes,
          retainedLogicalBytes: r.retainedLogicalBytes,
        },
      );
      assert.equal(b.rows, 0);
      for (const key of ['maxItems', 'maxSerializedBytes', 'maxDepth', 'memoryBudgetBytes'])
        assert.throws(
          () =>
            identity.predictCodeActivation(
              packet,
              new HistoryReadBudget({ ...limits, [key]: limits[key] - 1 }),
            ),
          (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
        );
    },
  );

test('future identity preserves already spent rows, bytes, items and retained representations', () => {
  const { input, expected } = loadCase(completeIdentityCases[0]),
    packet = rowPacket(input.groups),
    r = identityOperationReference(packet, input),
    spent = { rows: 3, serializedBytes: 5, items: 7, retainedLogicalBytes: 11 },
    limits = {
      maxRows: 4,
      maxSerializedBytes: r.serializedBytes + spent.serializedBytes,
      maxItems: r.items + spent.items,
      maxDepth: r.maxDepth,
      memoryBudgetBytes: 2 * (r.retainedLogicalBytes + spent.retainedLogicalBytes),
    },
    b = new HistoryReadBudget(limits);
  b.add('rows', spent.rows);
  b.add('serializedBytes', spent.serializedBytes);
  b.add('items', spent.items);
  b.pin(spent.retainedLogicalBytes);
  assert.equal(identity.predictCodeActivation(packet, b).codeActivationDigest, expected.digest);
  assert.deepEqual(
    {
      rows: b.rows,
      serializedBytes: b.serializedBytes,
      items: b.items,
      retainedLogicalBytes: b.retainedLogicalBytes,
    },
    {
      rows: spent.rows,
      serializedBytes: r.serializedBytes + spent.serializedBytes,
      items: r.items + spent.items,
      retainedLogicalBytes: r.retainedLogicalBytes + spent.retainedLogicalBytes,
    },
  );
});
