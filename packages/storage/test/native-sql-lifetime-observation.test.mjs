import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../dist/analysis/native-apply-sql-observation.js';

function family(name, operation) {
  assert.equal(
    typeof api.withNativeSqlSourceFamily,
    'function',
    'private raw source family missing',
  );
  return api.withNativeSqlSourceFamily(name, operation);
}

const emptyQueries = {
  COMPLETION: ['DIAGNOSTIC', 'COMPLETION_EVENT', 'COMPLETION_REMOVAL'],
  NORMALIZE: ['SOURCE_FILE', 'REMOVE_NODE', 'REMOVE_EDGE', 'UPSERT_NODE', 'UPSERT_EDGE'],
};
const emptyRead = (query) => api.nativeSqlEmptyPatchRead?.(query);
const partialReads = () => api.nativeSqlPartialCompletion?.();
const targetRefusal = () => api.nativeSqlTargetRevisionRefusal?.();

for (const name of ['SEAL', 'APPLY']) {
  test(`D5 target revision refusal ${name} proves numeric-only failure`, async () => {
    const result = await capture(
      () =>
        family(name, () => {
          targetRefusal();
          throw 0;
        }),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, 0);
    assert.equal(result.captureFailed, false);
    complete(result, 0, 0);
    assert.equal(result.evidence.coverage[0].disposition, 'PROVEN_NO_TEXT');
  });
}

test('D5 target revision refusal cannot qualify a successful invocation', async () => {
  const result = await capture(
    () =>
      family('SEAL', () => {
        targetRefusal();
        return false;
      }),
    [{ family: 'SEAL', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.threw, false);
  assert.equal(result.value, false);
  assert.equal(result.evidence.coverage[0].disposition, 'UNKNOWN');
  assert.equal(result.evidence.coverageComplete, false);
});

test('D5 target revision refusal preserves actual zero-length selected TEXT', async () => {
  const result = await capture(
    () =>
      family('APPLY', () =>
        api.withNativeApplySqlFields('row', [''], () => {
          targetRefusal();
          throw 0;
        }),
      ),
    [{ family: 'APPLY', role: 'MAIN', disposition: 'OBSERVED' }],
  );
  assert.equal(result.error, 0);
  assert.equal(result.evidence.coverage[0].disposition, 'OBSERVED');
  complete(result, 0, 0);
});

test('D5 target revision refusal cannot borrow another role', async () => {
  const result = await capture(
    () =>
      family('SEAL', () => {
        api.withNativeSqlSourceRole('RETRY', targetRefusal);
        throw 0;
      }),
    [{ family: 'SEAL', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.error, 0);
  assert.equal(result.evidence.coverageComplete, false);
});

test('D5 target revision refusal cannot borrow another capture', async () => {
  let inner;
  const outer = await capture(
    () =>
      family('SEAL', () => {
        inner = capture(() => {
          targetRefusal();
          throw 0;
        }, [{ family: 'SEAL', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }]);
        // A synchronous outer failure cannot borrow the inner capture's marker.
        throw false;
      }),
    [{ family: 'SEAL', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  const settledInner = await inner;
  assert.equal(settledInner.error, 0);
  assert.equal(settledInner.evidence.coverageComplete, false);
  assert.equal(outer.error, false);
  assert.equal(outer.evidence.coverageComplete, false);
});

test('D5 target revision refusal cannot qualify Completion', async () => {
  const result = await capture(
    () =>
      family('COMPLETION', () => {
        targetRefusal();
        throw 0;
      }),
    [{ family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.error, 0);
  assert.equal(result.evidence.coverageComplete, false);
});

test('D5 target revision refusal cannot qualify an escaped asynchronous failure', async () => {
  const result = await capture(
    () =>
      family('SEAL', async () => {
        targetRefusal();
        await Promise.resolve();
        throw 0;
      }),
    [{ family: 'SEAL', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.error, 0);
  assert.equal(result.evidence.coverageComplete, false);
});
test('D5 partial query proof combines actual empty diagnostics and guarded skipped scans', async () => {
  const result = await capture(
    () =>
      family('COMPLETION', () => {
        emptyRead('DIAGNOSTIC');
        partialReads();
        return false;
      }),
    [{ family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  complete(result, 0, 0);
  assert.strictEqual(result.value, false);
});
test('D5 partial query proof still requires the actual diagnostic query', async () => {
  const result = await capture(
    () => family('COMPLETION', partialReads),
    [{ family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.evidence.coverageComplete, false);
  assert.equal(result.evidence.retainedSqlBytes, null);
});
test('D5 partial query proof cannot borrow another role', async () => {
  const result = await capture(
    () =>
      family('COMPLETION', () => {
        emptyRead('DIAGNOSTIC');
        api.withNativeSqlSourceRole('RETRY', partialReads);
      }),
    [{ family: 'COMPLETION', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.evidence.coverageComplete, false);
});
test('D5 partial query proof cannot qualify normalization', async () => {
  const result = await capture(
    () =>
      family('NORMALIZE', () => {
        for (const query of emptyQueries.NORMALIZE) emptyRead(query);
        partialReads();
        return false;
      }),
    [{ family: 'NORMALIZE', role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
  );
  assert.equal(result.evidence.coverageComplete, false);
  assert.strictEqual(result.value, false);
});
test('D5 partial query proof preserves materialized diagnostics as observed', async () => {
  const result = await capture(
    () =>
      family('COMPLETION', () => api.withNativeApplySqlFields('diagnostic', ['abc'], partialReads)),
    [requirement('COMPLETION')],
  );
  complete(result, 3, 6);
  assert.equal(result.evidence.coverage[0].disposition, 'OBSERVED');
});
for (const [name, queries] of Object.entries(emptyQueries)) {
  test(`D5 empty query proof ${name} requires the executed complete set`, async () => {
    const result = await capture(
      () =>
        family(name, () => {
          for (const query of queries) emptyRead(query);
          return false;
        }),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    complete(result, 0, 0);
    assert.strictEqual(result.value, false);
  });
  for (const omitted of queries)
    test(`D5 empty query proof ${name} rejects missing ${omitted}`, async () => {
      const result = await capture(
        () =>
          family(name, () => {
            for (const query of queries) if (query !== omitted) emptyRead(query);
          }),
        [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
      );
      assert.equal(result.evidence.coverageComplete, false);
      assert.equal(result.evidence.retainedSqlBytes, null);
    });
  test(`D5 empty query proof ${name} cannot borrow a nested invocation`, async () => {
    const result = await capture(
      () =>
        family(name, () =>
          family(name, () => {
            for (const query of queries) emptyRead(query);
          }),
        ),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    assert.equal(result.evidence.coverageComplete, false);
    assert.equal(result.evidence.retainedSqlBytes, null);
  });
  test(`D5 empty query proof ${name} preserves a failed invocation`, async () => {
    const result = await capture(
      () =>
        family(name, () => {
          for (const query of queries) emptyRead(query);
          throw 0;
        }),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, 0);
    assert.equal(result.evidence.coverageComplete, false);
  });
  test(`D5 empty query proof ${name} cannot borrow another role`, async () => {
    const result = await capture(
      () =>
        family(name, () =>
          api.withNativeSqlSourceRole('RETRY', () => {
            for (const query of queries) emptyRead(query);
          }),
        ),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    assert.equal(result.evidence.coverageComplete, false);
    assert.equal(result.evidence.retainedSqlBytes, null);
  });
  test(`D5 empty query proof ${name} cannot borrow another capture`, async () => {
    const result = await capture(
      () =>
        family(name, () =>
          capture(() => {
            for (const query of queries) emptyRead(query);
          }, [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }]),
        ),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    assert.equal(result.evidence.coverageComplete, false);
    assert.equal(result.evidence.retainedSqlBytes, null);
  });
  test(`D5 empty query proof ${name} retains observed zero rather than no TEXT`, async () => {
    const result = await capture(
      () =>
        family(name, () =>
          api.withNativeApplySqlFields('empty string row', [''], () => {
            for (const query of queries) emptyRead(query);
          }),
        ),
      [requirement(name)],
    );
    complete(result, 0, 0);
    assert.equal(result.evidence.coverage[0].disposition, 'OBSERVED');
  });
  test(`D5 empty query proof ${name} refuses an escaped asynchronous invocation`, async () => {
    const result = await capture(
      () =>
        family(name, async () => {
          for (const query of queries) emptyRead(query);
          await Promise.resolve();
          throw 0;
        }),
      [{ family: name, role: 'MAIN', disposition: 'PROVEN_NO_TEXT' }],
    );
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, 0);
    assert.equal(result.evidence.coverageComplete, false);
    assert.equal(result.evidence.retainedSqlBytes, null);
  });
}

test('D5 lifetime family raw frames coexist across nested families', async () => {
  const result = await capture(
    () =>
      family('APPLY', () => {
        return api.withNativeApplySqlFields('row', ['a'], () =>
          family('SEAL', () => api.withNativeApplySqlFields('row', ['bc'], () => false)),
        );
      }),
    [requirement('APPLY'), requirement('SEAL')],
  );
  complete(result, 3, 6);
  assert.strictEqual(result.value, false);
});

test('D5 lifetime family raw owner nesting is not an additional source', async () => {
  const result = await capture(
    () =>
      family('NORMALIZE', () =>
        api.withNativeApplySqlFields('row', ['abc'], () => {
          const nested = api.observeNativeApplySql(
            () => {},
            () => false,
          );
          assert.equal(nested.captureFailed, false);
        }),
      ),
    [requirement('NORMALIZE')],
  );
  complete(result, 3, 6);
});

test('D5 lifetime family token gauge replaces current row without summing history', async () => {
  const result = await capture(
    () =>
      family('APPLY', () =>
        api.withNativeApplySqlToken(() => {
          const report = api.nativeApplySqlTokenObserver();
          report('TOKEN_ROW', 2);
          report('TOKEN_ROW', 3);
          report('TOKEN_RETURN', 1);
        }),
      ),
    [requirement('APPLY')],
  );
  complete(result, 3, 6);
});

test('D5 lifetime family summary aliases stay pinned across iterator advances', async () => {
  const result = await capture(
    () =>
      family('COMPLETION', () =>
        api.withNativeApplySqlSummaries(() => {
          const first = [
            ...api.yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', ['abc'], () => ({
              field: 'abc',
            })),
          ];
          const second = [
            ...api.yieldNativeApplySqlFields('STAGE_SUMMARY_ROW', ['abc'], () => ({
              field: 'abc',
            })),
          ];
          assert.equal(first.length + second.length, 2);
        }),
      ),
    [requirement('COMPLETION')],
  );
  complete(result, 6, 12);
});

test('D5 lifetime family retirement ID splits a field set without double counting', async () => {
  const result = await capture(
    () =>
      family('APPLY', () => {
        let release;
        api.withNativeApplySqlRetirementRows(['abc', 'x'], (keep) => {
          release = keep('abc');
        });
        api.withNativeApplySqlFields('independent', ['y'], () => {});
        release();
      }),
    [requirement('APPLY')],
  );
  complete(result, 4, 8);
});

test('D5 lifetime family escaped iterator refuses even after late close', async () => {
  let iterator;
  const result = await capture(
    () =>
      family('NORMALIZE', () => {
        iterator = api.yieldNativeApplySqlFields('row', ['abc'], () => 1);
        assert.equal(iterator.next().value, 1);
      }),
    [requirement('NORMALIZE')],
  );
  incomplete(result);
  iterator.return();
  incomplete(result);
});

test('D5 lifetime family raw capture failure preserves falsy operation result', async () => {
  const fields = function* () {
    yield 'a';
    throw 0;
  };
  const result = await capture(
    () => family('SEAL', () => api.withNativeApplySqlFields('row', fields(), () => false)),
    [requirement('SEAL')],
  );
  assert.strictEqual(result.value, false);
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, true);
  assert.strictEqual(result.captureFailure, 0);
  incomplete(result);
});

test('D5 lifetime family raw scopes preserve primitive operation exceptions', async () => {
  for (const failure of [0, null, undefined, '']) {
    const result = await capture(
      () =>
        family('SEAL', () =>
          api.withNativeApplySqlFields('row', ['abc'], () => {
            throw failure;
          }),
        ),
      [requirement('SEAL')],
    );
    complete(result, 3, 6);
    assert.equal(result.threw, true);
    assert.strictEqual(result.error, failure);
  }
});

test('D5 lifetime family unclassified raw selection refuses otherwise complete evidence', async () => {
  const result = await capture(() => {
    family('SEAL', () => api.withNativeApplySqlFields('known', ['abc'], () => {}));
    return api.withNativeApplySqlFields('unknown', ['x'], () => false);
  }, [requirement('SEAL')]);
  assert.strictEqual(result.value, false);
  assert.equal(result.threw, false);
  assert.equal(result.captureFailed, true);
  incomplete(result);
});

const requirement = (family = 'BASELINE_READ', role = 'MAIN', disposition = 'OBSERVED') => ({
  family,
  role,
  disposition,
});
function capture(operation, requirements = [requirement()]) {
  assert.equal(
    typeof api.observeNativeSqlLifetime,
    'function',
    'private lifetime capture is required',
  );
  return api.observeNativeSqlLifetime(operation, requirements);
}
function complete(result, bytes, charge) {
  assert.equal(result.captureFailed, false);
  assert.equal(result.evidence.coverageComplete, true);
  assert.equal(result.evidence.retainedSqlBytes, bytes);
  assert.equal(result.evidence.retainedSqlStringChargeBytes, charge);
  assert.ok(Object.isFrozen(result.evidence));
  assert.ok(Object.isFrozen(result.evidence.coverage));
  assert.ok(result.evidence.coverage.every(Object.isFrozen));
  assert.ok(Object.isFrozen(result.evidence.reasons));
  assert.deepEqual(
    Object.keys(result.evidence).sort(),
    [
      'scope',
      'coverageComplete',
      'retainedSqlBytes',
      'retainedSqlStringChargeBytes',
      'coverage',
      'reasons',
    ].sort(),
  );
}
function incomplete(result) {
  assert.equal(result.evidence.coverageComplete, false);
  assert.equal(result.evidence.retainedSqlBytes, null);
  assert.equal(result.evidence.retainedSqlStringChargeBytes, null);
  assert.ok(result.evidence.reasons.length > 0);
}

test('D5 lifetime ledger alias_transfer', async () => {
  const result = await capture(() => {
    const source = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
    api.transferNativeSqlSourceDomain(source, 'PREPARATION', 'MAIN');
    api.endNativeSqlSourceDomain(source);
    return false;
  }, [requirement(), requirement('PREPARATION')]);
  complete(result, 3, 6);
  assert.strictEqual(result.value, false);
  assert.equal(result.threw, false);
});

test('D5 lifetime ledger independent_equal_sources', async () => {
  const result = await capture(() => {
    const first = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
    const second = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
    api.endNativeSqlSourceDomain(first);
    api.endNativeSqlSourceDomain(second);
  });
  complete(result, 6, 12);
});

test('D5 lifetime ledger disjoint_peaks', async () => {
  const result = await capture(() => {
    const first = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 2);
    api.endNativeSqlSourceDomain(first);
    const second = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
    api.replaceNativeSqlSourceDomain(second, 1);
    api.endNativeSqlSourceDomain(second);
    return null;
  });
  complete(result, 3, 6);
  assert.strictEqual(result.value, null);
});

test('D5 lifetime ledger unsafe_capture preserves primitive exceptions', async () => {
  for (const bytes of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER]) {
    for (const failure of [0, null, undefined, '']) {
      const result = await capture(() => {
        api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', bytes);
        throw failure;
      });
      incomplete(result);
      assert.equal(result.captureFailed, true);
      assert.equal(result.threw, true);
      assert.strictEqual(result.error, failure);
    }
  }
});

test('D5 lifetime ledger unsafe_capture refuses simultaneous overflow', async () => {
  const result = await capture(() => {
    const first = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3_000_000_000_000_000);
    const second = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3_000_000_000_000_000);
    api.endNativeSqlSourceDomain(first);
    api.endNativeSqlSourceDomain(second);
    return 'original';
  });
  incomplete(result);
  assert.equal(result.captureFailed, true);
  assert.equal(result.value, 'original');
});

test('D5 lifetime ledger missing_coverage is not observed zero', async () => {
  incomplete(await capture(() => {}));
  complete(
    await capture(() => {
      const source = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 0);
      api.endNativeSqlSourceDomain(source);
    }),
    0,
    0,
  );
});

test('D5 lifetime ledger missing_coverage positive no-text proof', async () => {
  complete(
    await capture(() => {
      api.proveNativeSqlDisposition(
        'BASELINE_READ',
        'MAIN',
        'PROVEN_NO_TEXT',
        'numeric preflight refused before TEXT',
      );
    }, [requirement('BASELINE_READ', 'MAIN', 'PROVEN_NO_TEXT')]),
    0,
    0,
  );
  incomplete(
    await capture(() => {
      api.proveNativeSqlDisposition('BASELINE_READ', 'MAIN', 'PROVEN_NO_TEXT', '');
    }, [requirement('BASELINE_READ', 'MAIN', 'PROVEN_NO_TEXT')]),
  );
  incomplete(
    await capture(() => {
      api.proveNativeSqlDisposition('BASELINE_READ', 'MAIN', 'PROVEN_NOT_REACHED', 'guard refused');
      const source = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 0);
      api.endNativeSqlSourceDomain(source);
    }),
  );
});

test('D5 lifetime ledger settled_scope refuses escaped and unmatched handles', async () => {
  let escaped;
  const result = await capture(() => {
    escaped = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
  });
  incomplete(result);
  api.endNativeSqlSourceDomain(escaped);
  incomplete(result);
  for (const action of [
    (handle) => api.endNativeSqlSourceDomain(handle),
    (handle) => api.replaceNativeSqlSourceDomain(handle, 1),
    (handle) => api.transferNativeSqlSourceDomain(handle, 'PREPARATION', 'MAIN'),
  ]) {
    incomplete(
      await capture(() => {
        const handle = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
        api.endNativeSqlSourceDomain(handle);
        action(handle);
      }, [requirement(), requirement('PREPARATION')]),
    );
  }
  incomplete(
    await capture(() => {
      const handle = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
      api.transferNativeSqlSourceDomain(handle, 'BASELINE_READ', 'MAIN');
      api.endNativeSqlSourceDomain(handle);
    }),
  );
});

test('D5 lifetime ledger settled_scope isolates nested and concurrent captures', async () => {
  let inner;
  const outer = await capture(async () => {
    const handle = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 2);
    inner = await capture(() => {
      api.replaceNativeSqlSourceDomain(handle, 3);
      return null;
    });
    api.endNativeSqlSourceDomain(handle);
  });
  complete(outer, 2, 4);
  incomplete(inner);
  const results = await Promise.all(
    [2, 3].map((bytes) =>
      capture(async () => {
        const handle = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', bytes);
        await new Promise((resolve) => setImmediate(resolve));
        api.endNativeSqlSourceDomain(handle);
      }),
    ),
  );
  complete(results[0], 2, 4);
  complete(results[1], 3, 6);
});

test('D5 lifetime ledger unsafe_capture rejects unknown roles and extra requirements', async () => {
  incomplete(await capture(() => api.beginNativeSqlSourceDomain('BASELINE_READ', 'OTHER', 0)));
  incomplete(await capture(() => {}, [{ ...requirement(), extra: 'not evidence' }]));
  incomplete(await capture(() => {}, [requirement(), requirement()]));
});

test('D5 lifetime ledger unsafe_capture refuses hidden extra requirement properties', async () => {
  for (const extra of [Symbol('extra'), 'hidden']) {
    const input = Object.defineProperty(requirement(), extra, { value: { raw: 'not retained' } });
    const result = await capture(() => {
      const handle = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 0);
      api.endNativeSqlSourceDomain(handle);
      return false;
    }, [input]);
    incomplete(result);
    assert.equal(result.captureFailed, true);
    assert.strictEqual(result.value, false);
  }
});

test('D5 lifetime ledger unsafe_capture preserves capture failure identity independently', async () => {
  for (const failure of [0, null, undefined, '']) {
    const input = {
      role: 'MAIN',
      disposition: 'OBSERVED',
      get family() {
        throw failure;
      },
    };
    const result = await capture(() => null, [input]);
    incomplete(result);
    assert.equal(result.captureFailed, true);
    assert.strictEqual(result.captureFailure, failure);
    assert.strictEqual(result.value, null);
    assert.equal(result.threw, false);
  }
});

test('D5 lifetime ledger settled_scope freezes evidence and snapshots mutable requirements', async () => {
  const input = requirement();
  const result = await capture(async () => {
    input.family = 'APPLY';
    input.disposition = 'PROVEN_NOT_REACHED';
    const handle = api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3);
    api.replaceNativeSqlSourceDomain(handle, 4);
    api.endNativeSqlSourceDomain(handle);
  }, [input]);
  complete(result, 4, 8);
  assert.deepEqual(result.evidence.coverage, [
    { family: 'BASELINE_READ', role: 'MAIN', disposition: 'OBSERVED', cause: null },
  ]);
  assert.throws(() => {
    result.evidence.retainedSqlBytes = 100;
  }, TypeError);
  assert.throws(() => {
    result.evidence.coverage[0].cause = 'changed';
  }, TypeError);
  assert.equal(api.beginNativeSqlSourceDomain('BASELINE_READ', 'MAIN', 3), null);
});
