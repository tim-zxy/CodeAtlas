import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
import * as api from '../dist/document-write-preflight.js';

function fixture(raw = '\ufeff# Same\r\n\r\n# Same\r\n') {
  const bytes = Buffer.from(raw),
    fingerprint = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const { account, usage } = makeAccount();
  let next = 0;
  const state = { reads: 0, checks: 0, allocations: [] };
  const metadata = {
    document: {
      id: 'doc:one',
      workspaceId: 'workspace:one',
      repositoryId: 'repo:one',
      logicalPath: 'note.md',
      mediaType: 'text/markdown',
      sourceKind: 'MARKDOWN',
      currentRevisionId: null,
    },
    revision: {
      id: 'doc-revision:one',
      documentId: 'doc:one',
      sourceFingerprint: fingerprint,
      policyVersion: 'policy:test',
      sourceBasis: {
        documentId: 'doc:one',
        documentRevisionId: 'doc-revision:one',
        contentFingerprint: fingerprint,
      },
    },
    allocateId(kind) {
      state.allocations.push(kind);
      return `opaque:${++next}`;
    },
  };
  const input = {
    path: 'note.md',
    metadata,
    account,
    source: {
      observation: { repositoryId: 'repo:one' },
      effects: Object.freeze({ sourceCommit: 'COMMITTED', sourceReconciled: true }),
      async readDocumentBytes(path) {
        assert.equal(path, 'note.md');
        state.reads++;
        return { bytes, contentFingerprint: fingerprint, sizeBytes: bytes.length };
      },
      async verifySelection() {
        state.checks++;
      },
    },
  };
  return { input, state, usage, bytes };
}
test('parsed preflight parses real Source once and never returns candidate or clearance', async () => {
  assert.equal(typeof api.checkParsedDocumentWrite, 'function');
  const f = fixture(),
    result = await api.checkParsedDocumentWrite(f.input);
  assert.equal(result.status, 'NOT_COMMITTED');
  assert.equal(result.reason, 'SECRET_COVERAGE_INCOMPLETE');
  assert.equal(result.scan.clearance, false);
  assert.deepEqual(f.state.allocations, [
    'DOCUMENT_SECTION',
    'DOCUMENT_BLOCK',
    'DOCUMENT_SECTION',
    'DOCUMENT_BLOCK',
  ]);
  assert.equal(f.state.reads, 1);
  assert.equal(f.state.checks, 1);
  assert.deepEqual(Object.keys(result).sort(), ['reason', 'scan', 'sourceEffects', 'status']);
  assert.deepEqual(result.sourceEffects, f.input.source.effects);
});
test('strict scope, locator and metadata conflicts fail before reading Source', async () => {
  for (const change of [
    (f) => (f.input.metadata.document.logicalPath = 'other.md'),
    (f) => (f.input.metadata.document.repositoryId = 'repo:other'),
    (f) => (f.input.metadata.revision.documentId = 'doc:other'),
    (f) => (f.input.metadata.revision.sourceBasis.documentRevisionId = 'doc-revision:other'),
    (f) => (f.input.metadata.revision.extra = true),
    (f) =>
      Object.defineProperty(f.input.metadata, 'allocateId', {
        enumerable: true,
        get() {
          throw Error('getter executed');
        },
      }),
    (f) =>
      Object.defineProperty(f.input.metadata.document, 'logicalPath', {
        enumerable: true,
        get() {
          throw Error('getter executed');
        },
      }),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(
      () => api.checkParsedDocumentWrite(f.input),
      (e) => e.message !== 'getter executed',
    );
    assert.equal(f.state.reads, 0);
    assert.equal(f.usage.invalid, true);
  }
});

test('cleanup uncertainty from invalidation also survives the sanitized failure', async () => {
  const f = fixture();
  f.input.source.verifySelection = async () => {
    throw Object.assign(Error('private source error'), { code: 'SOURCE_CHANGED' });
  };
  f.input.account.invalidate = () => {
    throw Object.assign(Error('private cleanup error'), { cleanupState: 'UNKNOWN' });
  };
  await assert.rejects(
    () => api.checkParsedDocumentWrite(f.input),
    (e) => {
      assert.equal(e.code, 'SOURCE_CHANGED');
      assert.equal(e.cleanupState, 'UNKNOWN');
      assert.deepEqual(e.sourceEffects, f.input.source.effects);
      assert.equal(String(e).includes('private'), false);
      return true;
    },
  );
});
test('transport fingerprint and original byte fingerprint both must match metadata', async () => {
  for (const tamper of ['transport', 'bytes']) {
    const f = fixture();
    f.input.source.readDocumentBytes = async () => ({
      bytes: tamper === 'bytes' ? Buffer.from('other') : f.bytes,
      contentFingerprint:
        tamper === 'transport'
          ? 'sha256:' + '0'.repeat(64)
          : f.input.metadata.revision.sourceFingerprint,
      sizeBytes: f.bytes.length,
    });
    await assert.rejects(() => api.checkParsedDocumentWrite(f.input), {
      code: 'DOCUMENT_SOURCE_MISMATCH',
    });
    assert.equal(f.state.checks, 0);
    assert.equal(f.usage.invalid, true);
  }
});
test('actual parsed secrets and partial structures still produce only deny-only results', async () => {
  for (const raw of [
    '# Secrets\n\npassword=synthetic-only\n',
    '- [x] task\n\n| A | B |\n| - | - |\n| x | y | overflow |\n',
  ]) {
    const f = fixture(raw),
      result = await api.checkParsedDocumentWrite(f.input);
    assert.equal(result.status, 'NOT_COMMITTED');
    assert.equal(
      result.reason,
      raw.includes('password=') ? 'SECRET_DETECTED' : 'SECRET_COVERAGE_INCOMPLETE',
    );
    assert.equal(result.scan.clearance, false);
    assert.equal(f.state.checks, 1);
    assert.equal(JSON.stringify(result).includes('synthetic-only'), false);
  }
});
test('metadata and allocator are fixed before awaiting Source and before allocator mutation', async () => {
  const f = fixture(),
    allocate = f.input.metadata.allocateId;
  f.input.source.readDocumentBytes = async () => {
    f.state.reads++;
    f.input.metadata.document.logicalPath = 'other.md';
    f.input.metadata.revision.sourceBasis.documentId = 'doc:other';
    f.input.metadata.allocateId = () => {
      throw Error('replaced allocator');
    };
    return {
      bytes: f.bytes,
      contentFingerprint: f.input.metadata.revision.sourceFingerprint,
      sizeBytes: f.bytes.length,
    };
  };
  f.input.metadata.allocateId = (kind) => {
    f.input.metadata.document.repositoryId = 'repo:other';
    return allocate(kind);
  };
  assert.equal((await api.checkParsedDocumentWrite(f.input)).status, 'NOT_COMMITTED');
  assert.equal(f.state.reads, 1);
  assert.equal(f.state.checks, 1);
});
test('final source drift and final cancellation cannot return a receipt', async () => {
  for (const code of ['SOURCE_CHANGED', 'CANCELLED']) {
    const f = fixture();
    f.input.source.verifySelection = async () => {
      if (code === 'SOURCE_CHANGED')
        throw Object.assign(Error('password=synthetic-only'), { code });
      f.input.account.checkpoint = () => {
        throw Object.assign(Error('private cancellation'), { code });
      };
    };
    await assert.rejects(
      () => api.checkParsedDocumentWrite(f.input),
      (e) => {
        assert.equal(e.code, code);
        assert.deepEqual(e.sourceEffects, f.input.source.effects);
        assert.equal(String(e).includes('synthetic-only'), false);
        return true;
      },
    );
    assert.equal(f.usage.invalid, true);
  }
});
test('allocator mutation of returned Source bytes cannot change the inspected source snapshot', async () => {
  const f = fixture('# Ordinary heading with enough room to mutate returned source bytes\n');
  const allocate = f.input.metadata.allocateId;
  f.input.metadata.allocateId = (kind) => {
    f.bytes.fill(32);
    f.bytes.write('password=synthetic-injected');
    return allocate(kind);
  };
  const result = await api.checkParsedDocumentWrite(f.input);
  assert.equal(f.bytes.toString().includes('password='), true);
  assert.equal(result.reason, 'SECRET_COVERAGE_INCOMPLETE');
  assert.equal(result.scan.detected, false);
  assert.equal(result.status, 'NOT_COMMITTED');
  assert.equal(f.state.checks, 1);
});
for (const [label, value] of [
  ['ordinary Error', Error('private invalidation')],
  ['undefined', undefined],
  ['false', false],
])
  test(`any invalidation throw marks cleanup UNKNOWN: ${label}`, async () => {
    const f = fixture();
    const primary = Object.freeze(
      Object.assign(Error('private source failure'), { code: 'SOURCE_CHANGED' }),
    );
    f.input.source.readDocumentBytes = async () => {
      throw primary;
    };
    f.input.account.invalidate = () => {
      throw value;
    };
    await assert.rejects(
      () => api.checkParsedDocumentWrite(f.input),
      (error) => {
        assert.notEqual(error, primary);
        assert.equal(error.code, 'SOURCE_CHANGED');
        assert.equal(error.cleanupState, 'UNKNOWN');
        assert.deepEqual(error.sourceEffects, f.input.source.effects);
        assert.equal(String(error).includes('private'), false);
        return true;
      },
    );
  });
test('proxy failures are sanitized without executing descriptor traps', async () => {
  const f = fixture();
  let traps = 0;
  f.input.source.readDocumentBytes = async () => {
    throw new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          traps++;
          throw Error('private trap');
        },
      },
    );
  };
  await assert.rejects(() => api.checkParsedDocumentWrite(f.input), {
    code: 'DOCUMENT_PREFLIGHT_FAILED',
  });
  assert.equal(traps, 0);
  assert.equal(f.usage.invalid, true);
});
for (const name of ['checkParsedDocumentWrite', 'checkDocumentWrite'])
  test(`${name} unknown cleanup and throwing invalidate preserve safe fresh failure and Source effects`, async () => {
    const f = fixture(),
      primary = Object.freeze(
        Object.assign(Error('password=synthetic-only'), {
          code: 'SOURCE_CHANGED',
          cleanupState: 'UNKNOWN',
        }),
      );
    if (name === 'checkDocumentWrite')
      f.input.envelope = { payload: { document: f.input.metadata.document } };
    f.input.source.readDocumentBytes = async () => {
      throw primary;
    };
    f.input.account.invalidate = () => {
      throw Error('password=invalidate-only');
    };
    await assert.rejects(
      () => api[name](f.input),
      (e) => {
        assert.notEqual(e, primary);
        assert.equal(e.code, 'SOURCE_CHANGED');
        assert.equal(e.cleanupState, 'UNKNOWN');
        assert.deepEqual(e.sourceEffects, f.input.source.effects);
        assert.equal(String(e).includes('password='), false);
        return true;
      },
    );
  });
