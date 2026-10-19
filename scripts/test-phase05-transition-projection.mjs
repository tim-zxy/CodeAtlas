import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as runner from './evaluate-phase05.mjs';
import { capturePhase05PinnedInputs } from './helpers/phase05-evaluation-fixture.mjs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { evaluatePhase05Facts } from '../packages/evaluation/dist/index.js';

const transitions = JSON.parse(
  await readFile(
    new URL('../fixtures/native/java-refresh-producer/expected/transitions.json', import.meta.url),
  ),
).cases;
const recipe = (id) => transitions.find((row) => row.id === id);

test('consumed records verify original shared removals and changed-source delivery, never final-state inference or parse order', () => {
  assert.equal(typeof runner.verifyPhase05ConsumedNativeRecords, 'function');
  const row = recipe('shared-last-owner-deletion-zero-target');
  const baseline = {
    supports: {
      sourceFiles: [{ id: 'old', path: 'A.java' }],
      candidates: [
        {
          evidenceId: 'package-support',
          candidate: { kind: 'PACKAGE', name: 'p', sourceRange: null },
        },
      ],
      bindings: [
        {
          evidenceId: 'package-support',
          providerFact: { factType: 'NODE', providerId: 'native', providerFactId: 'package-id' },
        },
      ],
    },
    nativeBaseline: {
      state: {
        files: [
          {
            summaryJson: JSON.stringify({
              emittedFacts: [
                { factType: 'NODE', ownership: 'SHARED', providerFactId: 'package-id' },
              ],
            }),
          },
        ],
      },
    },
  };
  const source = {
    revision: { repositoryId: 'repo', id: 'worktree', contentFingerprint: 'sha256:empty' },
    files: [],
  };
  const record = {
    outcome: 'SUCCEEDED',
    operation: 'INCREMENTAL',
    result: {},
    nativeObservation: {
      scope: 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY',
      childClosed: true,
      children: [
        {
          executableMatches: true,
          closeObserved: true,
          exitCode: 0,
          signal: null,
          stdinClosed: true,
          stdoutClosed: true,
          stderrClosed: true,
        },
      ],
      nativeStream: {
        scope: 'CONSUMED_NATIVE_RECORDS_ONLY',
        terminalCount: 1,
        captureFailed: false,
        siteEvents: [],
        operations: [
          {
            protocolVersion: 3,
            requestId: 'refresh',
            type: 'REMOVE_NODE',
            payload: { providerId: 'native', providerFactId: 'package-id' },
          },
        ],
        terminal: {
          protocolVersion: 3,
          requestId: 'refresh',
          type: 'REFRESH_COMPLETED',
          payload: {
            outcome: 'SUCCEEDED',
            repositoryId: 'repo',
            revisionId: 'worktree',
            revisionFingerprint: 'sha256:empty',
            counts: {
              sourceFiles: 0,
              coverage: 0,
              diagnostics: 0,
              upsertedNodes: 0,
              upsertedEdges: 0,
              removedNodes: 1,
              removedEdges: 0,
            },
          },
        },
      },
    },
  };
  assert.equal(
    runner.verifyPhase05ConsumedNativeRecords({ record, source, baseline, recipe: row }),
    true,
  );
  for (const defect of [
    'missing-operation',
    'foreign-id',
    'duplicate',
    'failed-operation',
    'capture',
    'wrong-count',
    'foreign-context',
    'missing-source',
    'missing-native-identity',
    'foreign-native-child',
    'failed-native-child',
  ]) {
    const wrong = structuredClone(record);
    if (defect === 'missing-native-identity')
      delete wrong.nativeObservation.children[0].executableMatches;
    if (defect === 'foreign-native-child')
      wrong.nativeObservation.children[0].executableMatches = false;
    if (defect === 'failed-native-child') wrong.nativeObservation.children[0].exitCode = 1;
    if (defect === 'missing-operation') {
      wrong.nativeObservation.nativeStream.operations = [];
      wrong.nativeObservation.nativeStream.terminal.payload.counts.removedNodes = 0;
    }
    if (defect === 'foreign-id')
      wrong.nativeObservation.nativeStream.operations[0].payload.providerFactId = 'foreign';
    if (defect === 'duplicate') {
      wrong.nativeObservation.nativeStream.operations.push(
        structuredClone(wrong.nativeObservation.nativeStream.operations[0]),
      );
      wrong.nativeObservation.nativeStream.terminal.payload.counts.removedNodes = 2;
    }
    if (defect === 'failed-operation') wrong.outcome = 'FAILED';
    if (defect === 'capture') wrong.nativeObservation.nativeStream.captureFailed = true;
    if (defect === 'wrong-count')
      wrong.nativeObservation.nativeStream.terminal.payload.counts.sourceFiles = 1;
    if (defect === 'foreign-context')
      wrong.nativeObservation.nativeStream.terminal.payload.revisionFingerprint = 'different';
    if (defect === 'missing-source')
      wrong.nativeObservation.nativeStream.siteEvents = [
        {
          protocolVersion: 3,
          requestId: 'refresh',
          type: 'SOURCE_FILE',
          payload: { id: 'foreign' },
        },
      ];
    assert.equal(
      runner.verifyPhase05ConsumedNativeRecords({ record: wrong, source, baseline, recipe: row }),
      false,
      defect,
    );
  }
});

const partialVector = (id) => {
  const syntax = id === 'syntax-partial-retained-restart';
  const file = {
    id: 'target-file',
    repositoryId: 'repo',
    revisionId: 'worktree',
    path: syntax ? 'Syntax.java' : 'Unsupported.java',
    contentFingerprint: 'sha256:target',
    classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
    languageHint: 'java',
    sensitivity: 'INTERNAL',
  };
  const events = [
    { type: 'SOURCE_FILE', payload: file },
    ...['SYMBOL', 'IMPORT', 'CALL', 'INHERITANCE', 'REFERENCE'].map((capability) => ({
      type: 'COVERAGE',
      payload: {
        capability,
        sourceFileId: file.id,
        support: 'SUPPORTED',
        coverage: 'PARTIAL',
        statistics: {
          eligibleSites: !syntax && capability === 'CALL' ? 1 : 0,
          coveredSites: 0,
          unsupportedSites: !syntax && capability === 'CALL' ? 1 : 0,
          partialSites: 0,
          resolutionCounts: { EXACT: 0, HEURISTIC: 0, AMBIGUOUS: 0, UNRESOLVED: 0, UNSUPPORTED: 0 },
        },
      },
    })),
    {
      type: 'DIAGNOSTIC',
      payload: {
        code: syntax ? 'SYNTAX_ERROR' : 'UNSUPPORTED_RELATION_SOURCE',
        severity: 'WARNING',
        message: 'original diagnostic',
        sourceRange: {
          sourceFileId: file.id,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 1,
        },
      },
    },
  ].map((event, sequence) => ({ ...event, protocolVersion: 3, requestId: 'partial', sequence }));
  return {
    proof: {
      validatedPartialBranch: true,
      terminalCaptureFailed: false,
      siteEvents: events,
      terminal: {
        requestId: 'partial',
        payload: { counts: { sourceFiles: 1, coverage: 5, diagnostics: 1 } },
      },
    },
    source: { files: [structuredClone(file)] },
  };
};

for (const id of [
  'syntax-partial-retained-restart',
  'unsupported-recognized-region-retained-restart',
]) {
  test(`PARTIAL original sites bind ${id} to its declared Source and diagnostic`, () => {
    assert.equal(typeof runner.verifyPhase05PartialSites, 'function');
    const { proof, source } = partialVector(id);
    assert.equal(runner.verifyPhase05PartialSites(recipe(id), proof, source), true);
    for (const defect of [
      'unvalidated',
      'missing-diagnostic',
      'foreign-source',
      'wrong-code',
      'missing-coverage',
      'wrong-request',
      'duplicate-coverage',
      'count',
      'source-metadata',
      'site-partition',
    ]) {
      const wrong = structuredClone(proof);
      if (defect === 'unvalidated') wrong.validatedPartialBranch = false;
      if (defect === 'missing-diagnostic') wrong.siteEvents.pop();
      if (defect === 'foreign-source')
        wrong.siteEvents.at(-1).payload.sourceRange.sourceFileId = 'foreign';
      if (defect === 'wrong-code') wrong.siteEvents.at(-1).payload.code = 'UNRELATED';
      if (defect === 'missing-coverage') wrong.siteEvents.splice(1, 1);
      if (defect === 'wrong-request') wrong.siteEvents[0].requestId = 'other-request';
      if (defect === 'duplicate-coverage')
        wrong.siteEvents[2] = structuredClone(wrong.siteEvents[1]);
      if (defect === 'count') wrong.terminal.payload.counts.sourceFiles = 0;
      if (defect === 'source-metadata') wrong.siteEvents[0].payload.classification.role = 'TEST';
      if (defect === 'site-partition')
        wrong.siteEvents.find(
          (e) => e.type === 'COVERAGE' && e.payload.capability === 'CALL',
        ).payload.statistics.coveredSites = 1;
      assert.equal(runner.verifyPhase05PartialSites(recipe(id), wrong, source), false, defect);
    }
  });
}

test('public-operation closure needs actual bound-session checks, not a result or a closed file', () => {
  assert.equal(typeof runner.phase05ObservedClosure, 'function');
  const evidence = {
    scope: 'OBSERVED_CHILD_AND_CONSUMED_WIRE_ONLY',
    childClosed: true,
    sqlLifetime: {
      scope: 'REPOSITORY_INDEX_SESSION_LIFETIME_ONLY',
      openedConnections: 1,
      closedConnections: 1,
      transactionClosed: true,
      tempClosed: true,
      connectionClosed: true,
      captureFailed: false,
    },
  };
  assert.deepEqual(runner.phase05ObservedClosure(evidence), {
    transactionClosed: true,
    tempClosed: true,
    childClosed: true,
  });
  for (const field of [
    'captureFailed',
    'openedConnections',
    'closedConnections',
    'connectionClosed',
    'scope',
  ]) {
    const wrong = structuredClone(evidence);
    wrong.sqlLifetime[field] =
      field === 'captureFailed'
        ? true
        : field.endsWith('Connections')
          ? 0
          : field === 'scope'
            ? 'FOREIGN'
            : false;
    const actual = runner.phase05ObservedClosure(wrong);
    assert.notEqual(actual.transactionClosed, true, field);
    assert.notEqual(actual.tempClosed, true, field);
  }
  evidence.sqlLifetime.tempClosed = false;
  assert.equal(runner.phase05ObservedClosure(evidence).tempClosed, false);
  assert.deepEqual(runner.phase05ObservedClosure(null), {
    transactionClosed: null,
    tempClosed: null,
    childClosed: null,
  });
});

test('transition Source validation binds original bytes and metadata rather than blessing observed target state', async () => {
  assert.equal(typeof runner.verifyPhase05TransitionSources, 'function');
  const pins = await capturePhase05PinnedInputs({ repositoryRoot: path.resolve('.') });
  const row = recipe('modify-call-target');
  const state = {
    revision: { id: 'prepared-revision', repositoryId: 'prepared-repository' },
    files: Object.entries(row.target).map(([filename, asset]) => ({
      id: filename,
      repositoryId: 'prepared-repository',
      revisionId: 'prepared-revision',
      path: filename,
      contentFingerprint: `sha256:${createHash('sha256')
        .update(pins.readFile('p05-native-refresh-producer-v1', `source/${asset}`))
        .digest('hex')}`,
      classification: { role: 'SOURCE', provenance: 'AUTHORED', contentKind: 'TEXT' },
      languageHint: 'java',
      sensitivity: 'INTERNAL',
    })),
  };
  assert.equal(runner.verifyPhase05TransitionSources(pins, row, state, 'target'), true);
  for (const field of [
    'contentFingerprint',
    'revisionId',
    'repositoryId',
    'path',
    'languageHint',
  ]) {
    const wrong = structuredClone(state);
    wrong.files[0][field] = 'unexpected';
    assert.equal(runner.verifyPhase05TransitionSources(pins, row, wrong, 'target'), false, field);
  }
  const wrongRole = structuredClone(state);
  wrongRole.files[0].classification.role = 'TEST';
  assert.equal(runner.verifyPhase05TransitionSources(pins, row, wrongRole, 'target'), false);
  const missing = structuredClone(state);
  missing.files.pop();
  assert.equal(runner.verifyPhase05TransitionSources(pins, row, missing, 'target'), false);
  const duplicate = structuredClone(state);
  duplicate.files.push(structuredClone(duplicate.files[0]));
  assert.equal(runner.verifyPhase05TransitionSources(pins, row, duplicate, 'target'), false);
});
const modified = () => ({
  sourcePaths: ['Caller.java', 'Other.java', 'Target.java'],
  relations: [
    {
      file: 'Caller.java',
      kind: 'java.call',
      resolution: 'EXACT',
      targets: ['Other.go'],
      candidateIds: ['other-go'],
      hint: null,
    },
  ],
  sharedPackages: [],
});

test('original transition projection checks declared target source inventory and relation semantics', () => {
  assert.equal(typeof runner.verifyPhase05TransitionProjection, 'function');
  const row = recipe('modify-call-target');
  assert.equal(runner.verifyPhase05TransitionProjection(row, modified()), true);
  for (const defect of [
    'wrong-target',
    'missing-site',
    'extra-site',
    'wrong-resolution',
    'extra-file',
  ]) {
    const view = modified();
    if (defect === 'wrong-target') view.relations[0].targets = ['Target.go'];
    if (defect === 'missing-site') view.relations = [];
    if (defect === 'extra-site') view.relations.push(structuredClone(view.relations[0]));
    if (defect === 'wrong-resolution') view.relations[0].resolution = 'HEURISTIC';
    if (defect === 'extra-file') view.sourcePaths.push('Undeclared.java');
    assert.equal(runner.verifyPhase05TransitionProjection(row, view), false, defect);
  }
});

test('original transition projection preserves overload ambiguity multiplicity and original hints', () => {
  assert.equal(typeof runner.verifyPhase05TransitionProjection, 'function');
  const row = recipe('same-arity-overload-resolved-to-ambiguous');
  const view = {
    sourcePaths: ['Caller.java', 'Target.java'],
    sharedPackages: [],
    relations: [
      {
        file: 'Caller.java',
        kind: 'java.call',
        resolution: 'AMBIGUOUS',
        targets: ['Target.go', 'Target.go'],
        candidateIds: ['go-int', 'go-string'],
        hint: 'Target.go',
      },
    ],
  };
  assert.equal(runner.verifyPhase05TransitionProjection(row, view), true);
  view.relations[0].candidateIds[1] = 'go-int';
  assert.equal(runner.verifyPhase05TransitionProjection(row, view), false);
  view.relations[0].candidateIds[1] = 'go-string';
  view.relations[0].hint = 'Different.go';
  assert.equal(runner.verifyPhase05TransitionProjection(row, view), false);
});

test('original transition projection checks shared-container state without inventing patch operation evidence', () => {
  assert.equal(typeof runner.verifyPhase05TransitionProjection, 'function');
  const row = recipe('shared-last-owner-deletion-zero-target');
  assert.equal(
    runner.verifyPhase05TransitionProjection(row, {
      sourcePaths: [],
      relations: [],
      sharedPackages: [],
    }),
    true,
  );
  assert.equal(
    runner.verifyPhase05TransitionProjection(row, {
      sourcePaths: [],
      relations: [],
      sharedPackages: ['p'],
    }),
    false,
  );
  assert.equal(
    runner.verifyPhase05TransitionProjection(recipe('syntax-partial-retained-restart'), {
      sourcePaths: ['Syntax.java'],
      relations: [],
      sharedPackages: [],
    }),
    false,
  );
  assert.equal(
    runner.verifyPhase05TransitionProjection(recipe('metadata-only-source-change'), {
      sourcePaths: ['Caller.java'],
      relations: [],
      sharedPackages: [],
    }),
    false,
  );
});

test('non-accuracy differential metrics cannot dilute original critical gates or repair a wrong graph', async () => {
  assert.equal(typeof runner.phase05DifferentialMetrics, 'function');
  const root = new URL(
    '../fixtures/normalization/canonical-normalization/expected/',
    import.meta.url,
  );
  const pairs = JSON.parse(await readFile(new URL('nodes.json', root)));
  const nodes = ['method-run', 'ctor-a'].map(
    (id) => pairs.find((pair) => pair.provider.providerFactId === id).canonical,
  );
  const edge = JSON.parse(await readFile(new URL('edges.json', root))).find(
    (pair) => pair.provider.providerFactId === 'call-ctor',
  ).canonical;
  const expected = { nodes, edges: [edge] },
    actual = structuredClone(expected);
  actual.edges[0].target.target.id = nodes[0].id;
  const metrics = evaluatePhase05Facts({
    expected,
    actual,
    criticalSymbols: [],
    criticalDirectCalls: [],
  });
  const before = structuredClone(metrics);
  const result = runner.phase05DifferentialMetrics(metrics);
  assert.deepEqual(result.symbol, { tp: 0, fp: 0, fn: 0, recall: null });
  assert.deepEqual(result.directCall, { tp: 0, fp: 0, fn: 0, precision: null, recall: null });
  assert.deepEqual(result.comparison, metrics.comparison);
  assert.ok(result.comparison.entries.some((entry) => entry.differences.length > 0));
  assert.deepEqual(metrics, before);
  const critical = evaluatePhase05Facts({
    expected,
    actual,
    criticalSymbols: [],
    criticalDirectCalls: [edge.factKey],
  });
  assert.throws(() => runner.phase05DifferentialMetrics(critical));
});
