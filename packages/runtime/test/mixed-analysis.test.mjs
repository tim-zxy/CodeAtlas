import { readComponentReference } from '../../../fixtures/phase1/mixed-analysis-stage/component-references/corpus.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cases,
  loadRawHistoryCase,
} from '../../../fixtures/phase1/declared-raw-history-candidate/corpus.mjs';
import { reference } from '../../../fixtures/phase1/declared-raw-history-candidate/reference-ledger.mjs';
import * as raw from '../../providers/dist/declared-delta-raw-support-candidate.js';
const generous = {
  maxSerializedBytes: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
};
const run = (x, c) => {
  assert.equal(typeof raw.default, 'function');
  return raw.default(x.input, x.metadata, x.requestBytes, x.outputBytes, c);
};
for (const row of cases.filter((c) => !loadRawHistoryCase(c.id).expected.error))
  test(
    'D raw continuation preserves independent complete candidate and exact cumulative budget ' +
      row.id,
    () => {
      const x = loadRawHistoryCase(row.id),
        total = reference(row.id).total,
        spent = { serializedBytes: 37, items: 11 };
      const c = {
          limits: {
            ...generous,
            maxSerializedBytes: total.serializedBytes + spent.serializedBytes,
            maxItems: total.items + spent.items,
          },
          budget: { ...spent },
        },
        owned = c.budget;
      assert.deepEqual(run(x, c).candidate, x.expected.candidate);
      assert.strictEqual(c.budget, owned);
      assert.deepEqual(c.budget, {
        serializedBytes: total.serializedBytes + spent.serializedBytes,
        items: total.items + spent.items,
      });
      for (const key of ['maxSerializedBytes', 'maxItems']) {
        const b = { limits: { ...c.limits, [key]: c.limits[key] - 1 }, budget: { ...spent } };
        assert.throws(
          () => run(x, b),
          (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED' && e.message === e.code,
        );
      }
    },
  );
test('D raw continuation rejects caller prepared shortcut and unsafe ledger without getters', () => {
  const x = loadRawHistoryCase('I01');
  let calls = 0;
  const getter = Object.defineProperty({}, 'limits', {
    enumerable: true,
    get() {
      calls++;
      return generous;
    },
  });
  for (const c of [
    getter,
    new Proxy({ limits: generous, budget: { serializedBytes: 0, items: 0 } }, {}),
    { limits: generous, budget: { serializedBytes: -1, items: 0 } },
    { limits: generous, budget: { serializedBytes: 0, items: Number.MAX_SAFE_INTEGER + 1 } },
    { limits: generous, budget: { serializedBytes: 0, items: 0 }, prepared: true },
  ])
    assert.throws(
      () => run(x, c),
      (e) => e.code === 'INVALID_INPUT' && e.message === e.code,
    );
  assert.equal(calls, 0);
});

import * as full from '../../providers/dist/native-composition.js';
import { loadCompositionCase } from '../../providers/test/fixtures/native-composition-helpers.mjs';
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test(
    'D full composition owns one continuing ledger and preserves complete ' + id + ' candidate',
    async () => {
      const x = await loadCompositionCase(id);
      assert.equal(typeof full.default, 'function');
      const before = { serializedBytes: 37, items: 11 },
        c = { limits: { ...generous }, budget: { ...before } },
        owned = c.budget;
      assert.deepEqual(full.default(x.metadata, x.requestBytes, x.outputBytes, c), x.expected);
      assert.strictEqual(c.budget, owned);
      const l = {
        ...generous,
        maxSerializedBytes: c.budget.serializedBytes,
        maxItems: c.budget.items,
      };
      assert.deepEqual(
        full.default(x.metadata, x.requestBytes, x.outputBytes, {
          limits: l,
          budget: { ...before },
        }),
        x.expected,
      );
      for (const key of ['maxSerializedBytes', 'maxItems'])
        assert.throws(
          () =>
            full.default(x.metadata, x.requestBytes, x.outputBytes, {
              limits: { ...l, [key]: l[key] - 1 },
              budget: { ...before },
            }),
          (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED' && e.message === e.code,
        );
    },
  );

import { readNativeCompositionInputs } from '../../providers/dist/native-composition-input.js';
for (const id of ['python-only', 'mixed'])
  test('D full resource cause survives the first normalization boundary ' + id, async () => {
    const x = await loadCompositionCase(id),
      admitted = admission.default(x.metadata, x.requestBytes, x.outputBytes, {
        limits: { ...generous },
        budget: { items: 0, serializedBytes: 0 },
      });
    assert.throws(
      () =>
        full.default(x.metadata, x.requestBytes, x.outputBytes, {
          limits: { ...generous, maxItems: admitted.budget.items + 1 },
          budget: { serializedBytes: 0, items: 0 },
        }),
      (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED' && e.message === e.code,
    );
  });

import fs from 'node:fs';
import * as history from '../../providers/dist/syntax-history-candidate.js';
for (const id of ['python-only', 'java-only', 'mixed'])
  test(
    'D origin/current identities and complete immutable rows match independent ' + id + ' target',
    () => {
      const target = JSON.parse(
        fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/' + id + '.json'),
      );
      assert.equal(typeof history.createSyntaxHistoryPair, 'function');
      for (const row of target.origins) {
        const body = JSON.parse(row.origin_json),
          input = { body, selectedNodes: target.manifest.state.nodes },
          c = { limits: { ...generous }, budget: { serializedBytes: 0, items: 0 } };
        const expected = {
          origin: row,
          projection: target.projections.find((p) => p.origin_id === row.id),
          member: target.members.find((m) => m.originId === row.id),
          metadata: target.manifest.state.syntaxOrigins.find((o) => o.id === row.id),
        };
        const actual = history.createSyntaxHistoryPair(input, c);
        assert.deepEqual(actual, expected);
        const limits = {
          ...generous,
          maxSerializedBytes: c.budget.serializedBytes + 37,
          maxItems: c.budget.items + 11,
        };
        assert.deepEqual(
          history.createSyntaxHistoryPair(input, {
            limits,
            budget: { serializedBytes: 37, items: 11 },
          }),
          expected,
        );
        for (const key of ['maxSerializedBytes', 'maxItems'])
          assert.throws(
            () =>
              history.createSyntaxHistoryPair(input, {
                limits: { ...limits, [key]: limits[key] - 1 },
                budget: { serializedBytes: 37, items: 11 },
              }),
            (e) => e.code === 'RESOURCE_LIMIT_EXCEEDED',
          );
        const bad = structuredClone(input);
        bad.body.envelope.payload.id = 'syntax:forged';
        assert.throws(
          () =>
            history.createSyntaxHistoryPair(bad, {
              limits: { ...generous },
              budget: { serializedBytes: 0, items: 0 },
            }),
          (e) => e.code === 'INVALID_CANDIDATE',
        );
      }
    },
  );

import { createHash } from 'node:crypto';
const canonical = (v) =>
  Array.isArray(v)
    ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object'
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
for (const missing of ['SOURCE_FILE', 'CODE_NODE'])
  test('D history pair requires complete ' + missing + ' support closure', () => {
    const t = JSON.parse(
        fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/python-only.json'),
      ),
      body = JSON.parse(t.origins[0].origin_json);
    body.envelope.payload.supportRefs = body.envelope.payload.supportRefs.filter(
      (s) => s.entity.kind !== missing,
    );
    const { id, ...payload } = body.envelope.payload;
    body.envelope.payload.id =
      'syntax:' +
      createHash('sha256')
        .update('codeatlas-syntax-initial-v1\0' + canonical(payload))
        .digest('hex');
    assert.throws(
      () =>
        history.createSyntaxHistoryPair(
          { body, selectedNodes: t.manifest.state.nodes },
          { limits: { ...generous }, budget: { serializedBytes: 0, items: 0 } },
        ),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
  });

import { loadHistoryCase } from '../../storage/test/helpers/r011-history-fixture.mjs';
test('D retained origin preserves old policy, diagnostics and exact row while reprojecting only current supports', () => {
  const x = loadHistoryCase('syntax-ancestor').input,
    origin = x.tables.syntax_origins[0],
    body = JSON.parse(origin.origin_json),
    manifests = x.tables.activation_history.map((r) => JSON.parse(r.manifest_json)),
    old = manifests.find(
      (m) => canonical(m.state.basis) === canonical(body.envelope.payload.supportRefs[0].basis),
    ),
    current = manifests.at(-1),
    member = x.tables.activation_syntax_members.find(
      (m) => m.activation_id === x.tables.active_history_pointer[0].activation_id,
    );
  assert.equal(typeof history.reprojectSyntaxHistoryPair, 'function');
  const actual = history.reprojectSyntaxHistoryPair(
    {
      body,
      originNodes: old.state.nodes,
      currentBasis: current.state.basis,
      currentNodes: current.state.nodes,
    },
    { limits: { ...generous }, budget: { serializedBytes: 0, items: 0 } },
  );
  assert.deepEqual(actual.origin, origin);
  assert.deepEqual(
    actual.projection,
    x.tables.syntax_projections.find((p) => p.id === member.projection_id),
  );
  assert.deepEqual(actual.metadata, current.state.syntaxOrigins[0]);
  const projected = JSON.parse(actual.projection.envelope_json).payload;
  assert.deepEqual(projected.confidence, body.envelope.payload.confidence);
  assert.equal(projected.extractionVersion, body.envelope.payload.extractionVersion);
});

test('D full diagnostics stay ordered in immutable origin and alter history identities without altering Code basis', () => {
  const t = JSON.parse(
      fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/python-only.json'),
    ),
    body = JSON.parse(t.origins[0].origin_json),
    before = structuredClone(body);
  body.originSnapshot.diagnostics = [
    {
      code: 'JAVA_WARNING',
      severity: 'WARNING',
      message: 'declared Java component warning',
      sourceRange: null,
    },
    { code: 'V5_INFO', severity: 'INFO', message: 'declared v5 component info', sourceRange: null },
  ];
  const input = { body, selectedNodes: t.manifest.state.nodes },
    result = history.createSyntaxHistoryPair(input, {
      limits: { ...generous },
      budget: { serializedBytes: 0, items: 0 },
    }),
    saved = structuredClone(result);
  assert.deepEqual(
    JSON.parse(result.origin.origin_json).originSnapshot.diagnostics,
    body.originSnapshot.diagnostics,
  );
  assert.notEqual(result.origin.id, t.origins[0].id);
  assert.notEqual(result.projection.id, t.projections[0].id);
  assert.deepEqual(result.metadata.basis, t.basis);
  body.originSnapshot.diagnostics.reverse();
  const reversed = history.createSyntaxHistoryPair(input, {
    limits: { ...generous },
    budget: { serializedBytes: 0, items: 0 },
  });
  assert.notEqual(reversed.origin.id, result.origin.id);
  assert.deepEqual(result, saved);
  assert.ok(
    Object.isFrozen(result) &&
      Object.isFrozen(result.origin) &&
      Object.isFrozen(result.metadata.basis),
  );
  assert.deepEqual(
    before.envelope.payload.confidence,
    JSON.parse(result.origin.origin_json).envelope.payload.confidence,
  );
});
test('D history pair rejects unsafe input and never executes getters or proxy traps', () => {
  let calls = 0;
  const target = JSON.parse(
      fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/python-only.json'),
    ),
    body = JSON.parse(target.origins[0].origin_json),
    base = { body, selectedNodes: target.manifest.state.nodes };
  const getter = Object.defineProperty({}, 'body', {
      enumerable: true,
      get() {
        calls++;
        throw Error('SECRET_LITERAL');
      },
    }),
    proxy = new Proxy(base, {
      ownKeys() {
        calls++;
        throw Error('SECRET_LITERAL');
      },
    }),
    cycle = { ...base };
  cycle.self = cycle;
  for (const input of [
    getter,
    proxy,
    cycle,
    { ...base, selectedNodes: Array(2) },
    { ...base, ready: true },
  ])
    assert.throws(
      () =>
        history.createSyntaxHistoryPair(input, {
          limits: { ...generous },
          budget: { serializedBytes: 0, items: 0 },
        }),
      (e) => e.code === 'INVALID_CANDIDATE' && !e.message.includes('SECRET_LITERAL'),
    );
  assert.equal(calls, 0);
});
test('D retained projection refuses missing required values or confidence downgrade without changing origin', () => {
  const x = loadHistoryCase('syntax-ancestor').input,
    origin = x.tables.syntax_origins[0],
    body = JSON.parse(origin.origin_json),
    manifests = x.tables.activation_history.map((r) => JSON.parse(r.manifest_json)),
    old = manifests.find(
      (m) => canonical(m.state.basis) === canonical(body.envelope.payload.supportRefs[0].basis),
    ),
    current = manifests.at(-1),
    input = {
      body,
      originNodes: old.state.nodes,
      currentBasis: current.state.basis,
      currentNodes: current.state.nodes,
    },
    before = structuredClone(input);
  for (const nodes of [
    [],
    current.state.nodes.map((n) => ({ ...n, confidence: { ...n.confidence, score: 0 } })),
  ])
    assert.throws(
      () =>
        history.reprojectSyntaxHistoryPair(
          { ...input, currentNodes: nodes },
          { limits: { ...generous }, budget: { serializedBytes: 0, items: 0 } },
        ),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
  assert.deepEqual(input, before);
});

import {
  HistoryReadBudget,
  validateHistoryManifest,
  validateSyntaxPair,
} from '../../storage/dist/analysis/activation-history-format.js';
import { historyLimits, declaredDelta } from '../../storage/test/helpers/r011-history-fixture.mjs';
function historyAssemblyInput(target, mode = 'FULL', syntaxOverride) {
  const { syntaxOrigins, ...state } = target.manifest.state;
  return {
    mode,
    state,
    parent: target.manifest.parent,
    observation: target.manifest.observation,
    transitions: target.manifest.transitions,
    syntax:
      syntaxOverride ??
      target.origins.map((row) => ({ kind: 'NEW', body: JSON.parse(row.origin_json) })),
  };
}
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test(
    'D complete nine-field manifest and all pair rows match independent ' + id + ' target',
    () => {
      const t = JSON.parse(
        fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/' + id + '.json'),
      );
      assert.equal(typeof history.createSyntaxHistoryManifest, 'function');
      const input = historyAssemblyInput(t),
        before = structuredClone(input),
        actual = history.createSyntaxHistoryManifest(input, {
          limits: { ...generous },
          budget: { serializedBytes: 0, items: 0 },
        });
      assert.deepEqual(actual, {
        manifest: t.manifest,
        activationId: t.activationId,
        origins: [...t.origins].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        projections: [...t.projections].sort((a, b) =>
          a.origin_id < b.origin_id ? -1 : a.origin_id > b.origin_id ? 1 : 0,
        ),
        members: t.members,
      });
      assert.deepEqual(input, before);
      const budget = new HistoryReadBudget(historyLimits),
        m = validateHistoryManifest(actual.manifest, budget);
      for (const row of actual.origins) {
        const member = actual.members.find((x) => x.originId === row.id);
        validateSyntaxPair(
          row,
          actual.projections.find((p) => p.id === member.projectionId),
          m.state.syntaxOrigins.find((o) => o.id === row.id),
          member.unitId,
          m,
          [m],
          budget,
        );
      }
    },
  );
test('D delta manifest retains immutable origin with exact parent and existing transition literal', async () => {
  const x = loadHistoryCase('syntax-ancestor').input;
  await declaredDelta(x);
  const manifests = x.tables.activation_history.map((r) => JSON.parse(r.manifest_json)),
    current = manifests.at(-1),
    body = JSON.parse(x.tables.syntax_origins[0].origin_json),
    old = manifests.find(
      (m) => canonical(m.state.basis) === canonical(body.envelope.payload.supportRefs[0].basis),
    ),
    target = { manifest: current, origins: x.tables.syntax_origins },
    input = historyAssemblyInput(target, 'DELTA', [
      { kind: 'RETAINED', body, originNodes: old.state.nodes },
    ]);
  assert.equal(typeof history.createSyntaxHistoryManifest, 'function');
  const result = history.createSyntaxHistoryManifest(input, {
    limits: { ...generous },
    budget: { serializedBytes: 0, items: 0 },
  });
  assert.deepEqual(result.manifest, current);
  assert.equal(result.activationId, x.tables.active_history_pointer[0].activation_id);
  assert.deepEqual(result.origins, x.tables.syntax_origins);
  const budget = new HistoryReadBudget(historyLimits),
    m = validateHistoryManifest(result.manifest, budget);
  validateSyntaxPair(
    result.origins[0],
    result.projections[0],
    m.state.syntaxOrigins[0],
    result.members[0].unitId,
    m,
    manifests,
    budget,
  );
});
test('D full rebuild keeps exact parent while invalid modes, missing delta draft and duplicate origins refuse', () => {
  const t = JSON.parse(
      fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/python-only.json'),
    ),
    input = historyAssemblyInput(t),
    parent = {
      activationId: 'activation:declared-component-parent',
      repositoryId: t.basis.repositoryId,
      revisionId: t.basis.revisionId,
    };
  assert.equal(typeof history.createSyntaxHistoryManifest, 'function');
  const rebuilt = history.createSyntaxHistoryManifest(
    { ...input, parent },
    { limits: { ...generous }, budget: { serializedBytes: 0, items: 0 } },
  );
  assert.deepEqual(rebuilt.manifest.parent, parent);
  assert.equal(rebuilt.manifest.transitions, null);
  const expected = { ...t.manifest, parent };
  assert.equal(
    rebuilt.activationId,
    'activation:' +
      createHash('sha256')
        .update('codeatlas-activation-history-v1\0' + canonical(expected))
        .digest('hex'),
  );
  for (const bad of [
    { ...input, mode: 'NO_OP' },
    { ...input, mode: 'DELTA', parent },
    { ...input, syntax: [...input.syntax, input.syntax[0]] },
    {
      ...input,
      syntax: [{ ...input.syntax[0], kind: 'RETAINED', originNodes: input.state.nodes }],
    },
    { ...input, ready: true },
  ])
    assert.throws(
      () =>
        history.createSyntaxHistoryManifest(bad, {
          limits: { ...generous },
          budget: { serializedBytes: 0, items: 0 },
        }),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
});

import * as fullHistory from '../../providers/dist/declared-delta-raw-support-candidate.js';
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test(
    'D full raw history bridge preserves complete original supports and dependency units ' + id,
    async () => {
      const fixture = await loadCompositionCase(id),
        t = JSON.parse(
          fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/' + id + '.json'),
        ),
        state = t.manifest.state;
      assert.equal(typeof fullHistory.composeDeclaredFullRawSupportCandidate, 'function');
      const result = fullHistory.composeDeclaredFullRawSupportCandidate(
        {
          source: {
            repositoryId: t.basis.repositoryId,
            revisionId: t.basis.revisionId,
            contentFingerprint: t.basis.contentFingerprint,
          },
          repositoryLocatorDigest: state.repositoryLocatorDigest,
          inventory: state.inventory,
          contracts: state.contracts,
        },
        fixture.metadata,
        fixture.requestBytes,
        fixture.outputBytes,
        { limits: { ...generous }, budget: { serializedBytes: 37, items: 11 } },
      );
      assert.deepEqual(result.observation.observation.snapshot, state.snapshots[0]);
      assert.deepEqual(result.observation.units, state.units);
      assert.deepEqual(result.observation.coverage, state.coverage);
      assert.deepEqual(
        result.activeSupports.map(({ snapshotId, ...s }) => s),
        state.supports,
      );
      assert.deepEqual(result.merged, fixture.expected.merged);
      assert.equal(result.raw.provenance.kind, 'DECLARED_INPUT');
    },
  );

import * as admission from '../../providers/dist/native-composition-input.js';
import { validateCodeSyntaxObservationStreamWithBudget } from '../../providers/dist/native-code-syntax-ipc.js';
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test(
    'D full input continuation includes actual strict v5 decoder consumption ' + id,
    async () => {
      const x = await loadCompositionCase(id),
        old = admission.readNativeCompositionInputs(
          x.metadata,
          x.requestBytes,
          x.outputBytes,
          generous,
        ),
        decoder = { limits: { ...generous }, budget: { items: 0, serializedBytes: 0 } };
      validateCodeSyntaxObservationStreamWithBudget(x.requestBytes, x.outputBytes, decoder);
      const b = { items: 11, serializedBytes: 37 },
        c = { limits: { ...generous }, budget: b };
      assert.equal(typeof admission.default, 'function');
      const actual = admission.default(x.metadata, x.requestBytes, x.outputBytes, c);
      assert.strictEqual(actual.budget, b);
      assert.deepEqual(b, {
        items: 11 + old.budget.items + decoder.budget.items,
        serializedBytes: 37 + old.budget.serializedBytes + decoder.budget.serializedBytes,
      });
      assert.deepEqual(actual.snapshot, old.snapshot);
      assert.deepEqual(actual.codeSyntax, old.codeSyntax);
    },
  );

test('D full history bridge preserves legal SUCCEEDED warning diagnostics from admitted raw', async () => {
  const x = await loadCompositionCase('empty'),
    t = JSON.parse(fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/empty.json')),
    request = JSON.parse(x.requestBytes),
    events = x.outputBytes.toString().trimEnd().split('\n').map(JSON.parse),
    terminal = events.pop(),
    diagnostic = {
      code: 'FULL_HISTORY_COMPONENT_WARNING',
      severity: 'WARNING',
      message: 'declared full history component warning',
      sourceRange: null,
    };
  events.push({
    protocolVersion: 5,
    requestId: request.requestId,
    sequence: events.length,
    type: 'DIAGNOSTIC',
    payload: diagnostic,
  });
  terminal.payload.counts.diagnostics = 1;
  events.push(terminal);
  const { reseal } = await import('../../providers/test/fixtures/native-composition-helpers.mjs'),
    bytes = reseal(request, events),
    s = t.manifest.state;
  const result = fullHistory.composeDeclaredFullRawSupportCandidate(
    {
      source: {
        repositoryId: t.basis.repositoryId,
        revisionId: t.basis.revisionId,
        contentFingerprint: t.basis.contentFingerprint,
      },
      repositoryLocatorDigest: s.repositoryLocatorDigest,
      inventory: s.inventory,
      contracts: s.contracts,
    },
    x.metadata,
    bytes.requestBytes,
    bytes.outputBytes,
    { limits: { ...generous }, budget: { serializedBytes: 37, items: 11 } },
  );
  assert.equal(result.observation.observation.snapshot.outcome, 'SUCCEEDED');
  assert.deepEqual(result.observation.observation.snapshot.diagnostics, [diagnostic]);
  assert.deepEqual(
    result.raw.codeSyntax.events.filter((e) => e.type === 'DIAGNOSTIC').map((e) => e.payload),
    [diagnostic],
  );
});

test('D manifest construction rejects malformed observation and incomplete transition rather than hashing them', () => {
  const t = JSON.parse(fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/empty.json')),
    input = historyAssemblyInput(t),
    parent = {
      activationId: 'activation:declared-component-parent',
      repositoryId: t.basis.repositoryId,
      revisionId: t.basis.revisionId,
    };
  for (const bad of [
    { ...input, observation: { ...input.observation, ready: true } },
    { ...input, observation: 'declared-succeeded' },
    {
      ...input,
      mode: 'DELTA',
      parent,
      transitions: {
        kind: 'TRANSITION_DRAFT',
        activationId: parent.activationId,
        oldBasis: t.basis,
      },
    },
  ])
    assert.throws(
      () =>
        history.createSyntaxHistoryManifest(bad, {
          limits: { ...generous },
          budget: { serializedBytes: 0, items: 0 },
        }),
      (e) => e.code === 'INVALID_CANDIDATE',
    );
});

test('D full bridge adapts complete Native byte-order inventory to unchanged H1 UTF16 order without losing any Source fields', async () => {
  const raw = await loadCompositionCase('empty'),
    base = (await loadCompositionCase('python-only')).metadata.inventory[0],
    files = [
      {
        ...structuredClone(base),
        id: 'file:bmp',
        path: '\ue000.txt',
        classification: { ...base.classification, role: 'OTHER' },
        languageHint: null,
      },
      {
        ...structuredClone(base),
        id: 'file:nonbmp',
        path: '\u{10000}.txt',
        classification: { ...base.classification, role: 'OTHER' },
        languageHint: null,
      },
    ],
    canonicalFiles = [files[1], files[0]];
  raw.metadata.inventory = files;
  const t = JSON.parse(fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/empty.json')),
    target = {
      source: {
        repositoryId: t.basis.repositoryId,
        revisionId: t.basis.revisionId,
        contentFingerprint: t.basis.contentFingerprint,
      },
      repositoryLocatorDigest: t.manifest.state.repositoryLocatorDigest,
      inventory: canonicalFiles,
      contracts: t.manifest.state.contracts,
    },
    before = structuredClone(target);
  assert.deepEqual(
    full.composeNativeProjection(raw.metadata, raw.requestBytes, raw.outputBytes, generous).scope
      .inventory,
    files,
  );
  const result = fullHistory.composeDeclaredFullRawSupportCandidate(
    target,
    raw.metadata,
    raw.requestBytes,
    raw.outputBytes,
    { limits: { ...generous }, budget: { items: 0, serializedBytes: 0 } },
  );
  assert.deepEqual(result.raw.metadata.inventory, files);
  assert.deepEqual(result.observation.units, []);
  assert.deepEqual(target, before);
  const bad = structuredClone(target);
  bad.inventory[0].sensitivity = 'SECRET';
  assert.throws(
    () =>
      fullHistory.composeDeclaredFullRawSupportCandidate(
        bad,
        raw.metadata,
        raw.requestBytes,
        raw.outputBytes,
        { limits: { ...generous }, budget: { items: 0, serializedBytes: 0 } },
      ),
    (e) => e.code === 'INVALID_CONTEXT',
  );
});

// Fixed Runtime FULL path: independent targets predate this implementation.
const rulesAPI = async () => {
  const url = new URL('../dist/mixed-analysis.js', import.meta.url);
  assert.ok(fs.existsSync(url), 'fixed Runtime rules implementation must exist');
  return import(url.href);
};
async function fixedFullInput(id) {
  const raw = await loadCompositionCase(id),
    t = JSON.parse(fs.readFileSync('fixtures/phase1/mixed-analysis-stage/targets/' + id + '.json'));
  const s = t.manifest.state;
  return {
    t,
    input: {
      mode: 'FULL',
      target: {
        source: {
          repositoryId: s.basis.repositoryId,
          revisionId: s.basis.revisionId,
          contentFingerprint: s.basis.contentFingerprint,
        },
        repositoryLocatorDigest: s.repositoryLocatorDigest,
        inventory: s.inventory,
        contracts: s.contracts,
      },
      capture: {
        parent: null,
        snapshotIds: [],
        snapshots: [],
        coverage: [],
        activeProviderIds: [],
      },
      rawBundle: {
        metadata: raw.metadata,
        requestBytes: raw.requestBytes,
        outputBytes: raw.outputBytes,
      },
      qualificationRef: t.manifest.observation.qualificationRef,
    },
  };
}
for (const id of ['empty', 'python-only', 'java-only', 'mixed'])
  test('fixed Runtime complete FULL raw to independently frozen history ' + id, async () => {
    const { createMixedAnalysisRules } = await rulesAPI(),
      { input, t } = await fixedFullInput(id),
      before = structuredClone(input),
      port = createMixedAnalysisRules();
    assert.ok(Object.isFrozen(port));
    assert.deepEqual(Object.keys(port), ['prepareJavaOwner', 'validateObservation', 'compose']);
    const result = port.compose(input, historyLimits);
    assert.equal(typeof result?.then, 'undefined');
    assert.deepEqual(result.manifest, t.manifest);
    assert.equal(result.activationId, t.activationId);
    assert.deepEqual(result.basis, t.basis);
    assert.deepEqual(
      result.origins,
      [...t.origins].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(
      result.projections,
      [...t.projections].sort((a, b) => a.origin_id.localeCompare(b.origin_id)),
    );
    assert.deepEqual(result.members, t.members);
    assert.deepEqual(result.code.nodes, t.codeGroups.NODE);
    assert.deepEqual(result.code.edges, t.codeGroups.EDGE);
    assert.deepEqual(result.code.evidence, t.codeGroups.EVIDENCE);
    assert.deepEqual(result.code.bindings, t.codeGroups.BINDING);
    assert.deepEqual(result.code.factEvidence, t.codeGroups.FACT_EVIDENCE);
    assert.deepEqual(result.code.candidates, t.codeGroups.SUPPORT_CANDIDATE);
    assert.deepEqual(structuredClone(input), before);
    assert.ok(Object.isFrozen(result));
    assert.ok(
      result.usage.items > 0 &&
        result.usage.serializedBytes > 0 &&
        result.usage.retainedLogicalBytes > 0,
    );
    assert.equal(result.usage.rows, 0);
  });
test('fixed Runtime FULL retains complete snapshot census, accurate full parent and old physical coverage', async () => {
  const { createMixedAnalysisRules } = await rulesAPI(),
    { input, t } = await fixedFullInput('mixed');
  input.capture.parent = {
    activationId: 'activation:previous',
    repositoryId: t.basis.repositoryId,
    revisionId: t.basis.revisionId,
  };
  const old = {
    ...t.manifest.state.snapshots[0],
    id: 'snapshot:old',
    diagnostics: [
      { severity: 'INFO', code: 'PRIOR', message: 'preserve full original', sourceRange: null },
    ],
  };
  input.capture.snapshotIds = ['snapshot:another-revision', 'snapshot:old'];
  input.capture.snapshots = [old];
  input.capture.coverage = [
    {
      providerSnapshotId: 'snapshot:old',
      capabilityName: 'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      sourceFileId: null,
      status: 'COMPLETE',
    },
    {
      providerSnapshotId: 'snapshot:old',
      capabilityName: 'FRAMEWORK_SYNTAX_OBSERVATION_V1',
      sourceFileId: null,
      status: 'COMPLETE',
    },
  ];
  const r = createMixedAnalysisRules().compose(input, historyLimits);
  assert.deepEqual(r.manifest.parent, input.capture.parent);
  assert.equal(r.manifest.transitions, null);
  assert.deepEqual(
    r.manifest.state.snapshots.find((s) => s.id === old.id),
    old,
  );
  assert.equal(r.code.committedSnapshotCount, 3);
  assert.equal(r.code.coverage.filter((c) => c.providerSnapshotId === old.id).length, 2);
  const b = new HistoryReadBudget(historyLimits);
  assert.deepEqual(
    (await import('../../storage/dist/analysis/code-identity.js')).predictCodeActivation(r.code, b),
    r.basis,
  );
});
test('fixed Runtime FULL rejects unknown fields, stale census/snapshot reuse and foreign active provider before publication', async () => {
  const { createMixedAnalysisRules } = await rulesAPI();
  for (const change of [
    (x) => (x.ready = true),
    (x) => (x.policy = 'caller-policy'),
    (x) => (x.capture.activeProviderIds = ['foreign']),
    (x) => (x.capture.snapshotIds = ['snapshot:one']),
    (x) => (x.capture.snapshots = [x.rawBundle.metadata.snapshot]),
    (x) => (x.capture.snapshotIds = ['duplicate', 'duplicate']),
    (x) => x.target.inventory[0] && (x.target.inventory[0].sensitivity = 'SECRET'),
  ]) {
    const { input } = await fixedFullInput('mixed');
    change(input);
    assert.throws(
      () => createMixedAnalysisRules().compose(input, historyLimits),
      (e) => e.message === e.code,
    );
  }
});
test('fixed Runtime FULL rejects getters/proxy and input limits without executing user code', async () => {
  const { createMixedAnalysisRules } = await rulesAPI();
  const { input } = await fixedFullInput('mixed');
  let calls = 0;
  const bad = Object.defineProperty({ ...input }, 'target', {
    enumerable: true,
    get() {
      calls++;
      return input.target;
    },
  });
  for (const x of [
    bad,
    new Proxy(input, {
      get() {
        calls++;
        throw Error('must not get');
      },
    }),
  ])
    assert.throws(() => createMixedAnalysisRules().compose(x, historyLimits));
  assert.equal(calls, 0);
  const low = { ...historyLimits, memoryBudgetBytes: 1 };
  assert.throws(
    () => createMixedAnalysisRules().compose(input, low),
    (e) => e.code === 'HISTORY_LIMIT_EXCEEDED',
  );
});

test('fixed Runtime refuses custom raw properties and forged byte views without invoking getters', async () => {
  const { createMixedAnalysisRules } = await rulesAPI();
  let calls = 0;
  const { input } = await fixedFullInput('empty');
  const raw = Buffer.from(input.rawBundle.requestBytes);
  Object.defineProperty(raw, 'length', {
    get() {
      calls++;
      return 0;
    },
  });
  input.rawBundle.requestBytes = raw;
  assert.throws(
    () => createMixedAnalysisRules().compose(input, historyLimits),
    (e) => e.message === e.code,
  );
  assert.equal(calls, 0);
  const { input: fake } = await fixedFullInput('empty');
  fake.rawBundle.requestBytes = Object.create(Uint8Array.prototype);
  assert.throws(
    () => createMixedAnalysisRules().compose(fake, historyLimits),
    (e) => e.message === e.code,
  );
});
test('fixed Runtime phase budgets enforce the final cumulative receipt and keep captures pinned', async () => {
  const { createMixedAnalysisRules } = await rulesAPI(),
    { input } = await fixedFullInput('mixed'),
    port = createMixedAnalysisRules(),
    result = port.compose(input, historyLimits);
  // Receipt consistency controls, not a new independent arithmetic oracle.
  const exact = {
    ...historyLimits,
    maxSerializedBytes: result.usage.serializedBytes,
    maxItems: result.usage.items,
    memoryBudgetBytes: result.usage.retainedLogicalBytes * 2,
  };
  assert.deepEqual(port.compose(input, exact), result);
  for (const key of ['maxSerializedBytes', 'maxItems', 'memoryBudgetBytes'])
    assert.throws(
      () => port.compose(input, { ...exact, [key]: exact[key] - 1 }),
      (e) => ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(e.code),
    );
  for (const mode of ['DELTA', 'NO_OP'])
    assert.throws(
      () => port.compose({ ...input, mode }, historyLimits),
      (e) => e.code === 'INVALID_HISTORY',
    );
});

test('fixed Runtime output ownership does not freeze or alias caller Source, snapshots or coverage', async () => {
  const { createMixedAnalysisRules } = await rulesAPI(),
    { input, t } = await fixedFullInput('empty');
  const old = { ...t.manifest.state.snapshots[0], id: 'snapshot:old' };
  input.capture.snapshotIds = ['snapshot:old'];
  input.capture.snapshots = [old];
  const coverage = {
    providerSnapshotId: old.id,
    capabilityName: 'FRAMEWORK_SYNTAX_OBSERVATION_V1',
    sourceFileId: null,
    status: 'COMPLETE',
  };
  input.capture.coverage = [coverage];
  const result = createMixedAnalysisRules().compose(input, historyLimits);
  assert.equal(Object.isFrozen(input.target.source), false);
  assert.equal(Object.isFrozen(old), false);
  assert.equal(Object.isFrozen(coverage), false);
  old.diagnostics.push({
    severity: 'INFO',
    code: 'AFTER',
    message: 'caller mutation',
    sourceRange: null,
  });
  coverage.status = 'PARTIAL';
  input.target.source.contentFingerprint = 'content:later';
  assert.equal(result.code.snapshots.find((s) => s.id === old.id).diagnostics.length, 0);
  assert.equal(result.code.coverage[0].status, 'COMPLETE');
  assert.equal(result.code.targetSource.contentFingerprint, t.basis.contentFingerprint);
});

const deltaReferenceRoot =
  'fixtures/phase1/mixed-analysis-stage/component-references/runtime-delta-independent-v4';
async function fixedDeltaInput(id) {
  const x = JSON.parse(readComponentReference(deltaReferenceRoot + '/' + id + '.json')),
    { rawCase, ...input } = x.input;
  if (rawCase) {
    const raw = loadRawHistoryCase(rawCase);
    input.rawBundle = {
      metadata: raw.metadata,
      requestBytes: readComponentReference(deltaReferenceRoot + '/' + rawCase + '-request.jsonl'),
      outputBytes: readComponentReference(deltaReferenceRoot + '/' + rawCase + '-output.jsonl'),
    };
  } else input.rawBundle = null;
  return { input, expected: x.expected };
}
for (const id of JSON.parse(readComponentReference(deltaReferenceRoot + '/index.json')))
  test('fixed Runtime complete DELTA/NO_OP matches independent ' + id, async () => {
    const { createMixedAnalysisRules } = await rulesAPI(),
      { input, expected } = await fixedDeltaInput(id),
      before = structuredClone(input),
      actual = createMixedAnalysisRules().compose(input, historyLimits),
      { usage, ...result } = actual;
    assert.deepEqual(result, expected);
    assert.deepEqual(structuredClone(input), before);
    assert.equal(Object.isFrozen(input.target.source), false);
    assert.ok(usage.items > 0 && usage.serializedBytes > 0);
    assert.ok(Object.isFrozen(actual));
    if (expected.kind === 'NO_OP') {
      assert.equal(Object.hasOwn(actual, 'manifest'), false);
      assert.equal(Object.hasOwn(actual, 'code'), false);
      assert.equal(Object.hasOwn(actual, 'origins'), false);
    }
  });
test('fixed Runtime DELTA validates old origins and Code readset even when all origins retire', async () => {
  const { createMixedAnalysisRules } = await rulesAPI();
  for (const mutate of [
    (x) => (x.capture.origins[0].origin_json += ' '),
    (x) => x.capture.projections.pop(),
    (x) => (x.capture.parent.activationId = 'activation:forged'),
    (x) => x.capture.snapshotIds.push('snapshot:extra-census'),
    (x) => x.capture.coverage.pop(),
    (x) => x.capture.activeProviderIds.push('forged'),
    (x) => x.capture.ancestors.push(x.capture.history),
  ]) {
    const { input } = await fixedDeltaInput('delete-all');
    mutate(input);
    assert.throws(
      () => createMixedAnalysisRules().compose(input, historyLimits),
      (e) => e.message === e.code,
    );
  }
});
test('fixed Runtime NO_OP rejects extraneous raw, missing history and unsafe capture without invoking getters', async () => {
  const { createMixedAnalysisRules } = await rulesAPI();
  for (const mutate of [
    (x) =>
      (x.rawBundle = { metadata: {}, requestBytes: Buffer.alloc(0), outputBytes: Buffer.alloc(0) }),
    (x) => (x.capture.history = null),
    (x) => x.capture.origins.pop(),
  ]) {
    const { input } = await fixedDeltaInput('noop-mixed');
    mutate(input);
    assert.throws(
      () => createMixedAnalysisRules().compose(input, historyLimits),
      (e) => e.message === e.code,
    );
  }
  const { input } = await fixedDeltaInput('noop-mixed');
  let calls = 0;
  Object.defineProperty(input.capture, 'origins', {
    enumerable: true,
    get() {
      calls++;
      return [];
    },
  });
  assert.throws(() => createMixedAnalysisRules().compose(input, historyLimits));
  assert.equal(calls, 0);
});

test('fixed Runtime retained origin resolves against complete genuine ancestry across a second activation', async () => {
  const { createMixedAnalysisRules } = await rulesAPI(),
    x = await fixedDeltaInput('delete-python'),
    { input, expected } = x,
    old = input.capture.history,
    m = expected.manifest;
  input.capture = {
    ...input.capture,
    parent: {
      activationId: expected.activationId,
      repositoryId: m.state.basis.repositoryId,
      revisionId: m.state.basis.revisionId,
    },
    history: m,
    ancestors: [old],
    origins: expected.origins,
    projections: expected.projections,
  };
  const actual = createMixedAnalysisRules().compose(input, historyLimits);
  assert.equal(actual.kind, 'NO_OP');
  assert.equal(actual.activationId, expected.activationId);
  assert.deepEqual(actual.basis, expected.basis);
  const bad = structuredClone(input);
  bad.capture.ancestors = [];
  assert.throws(
    () => createMixedAnalysisRules().compose(bad, historyLimits),
    (e) => e.code === 'INVALID_HISTORY',
  );
});
for (const id of ['noop-mixed', 'delete-python', 'raw-I01'])
  test('fixed Runtime cumulative delta receipt exact and one-below ' + id, async () => {
    const { createMixedAnalysisRules } = await rulesAPI(),
      { input } = await fixedDeltaInput(id),
      port = createMixedAnalysisRules(),
      r = port.compose(input, historyLimits),
      l = {
        ...historyLimits,
        maxSerializedBytes: r.usage.serializedBytes,
        maxItems: r.usage.items,
        memoryBudgetBytes: r.usage.retainedLogicalBytes * 2,
      };
    assert.deepEqual(port.compose(input, l), r);
    for (const k of ['maxSerializedBytes', 'maxItems', 'memoryBudgetBytes'])
      assert.throws(
        () => port.compose(input, { ...l, [k]: l[k] - 1 }),
        (e) => ['HISTORY_LIMIT_EXCEEDED', 'RESOURCE_LIMIT_EXCEEDED'].includes(e.code),
      );
  });
