import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { makeAccount } from '../../source/test/fixtures/mixed-source-git-double.mjs';
const api = await import('../dist/document-write-preflight.js').catch(() => ({}));
const vector = JSON.parse(
  await readFile(
    new URL('../../documents/test/fixtures/source-draft.json', import.meta.url),
    'utf8',
  ),
);
function input() {
  const account = makeAccount();
  const state = { checks: 0 };
  return {
    state,
    usage: account.usage,
    input: {
      account: account.account,
      path: vector.envelope.payload.document.logicalPath,
      envelope: structuredClone(vector.envelope),
      source: {
        observation: { repositoryId: vector.envelope.payload.document.repositoryId },
        effects: Object.freeze({ sourceCommit: 'COMMITTED', sourceReconciled: true }),
        async readDocumentBytes() {
          return { bytes: Buffer.from(vector.source) };
        },
        async verifySelection() {
          state.checks++;
        },
      },
    },
  };
}
test('document preflight never treats no-known-pattern as permission to write', async () => {
  assert.equal(typeof api.checkDocumentWrite, 'function');
  const f = input(),
    r = await api.checkDocumentWrite(f.input);
  assert.equal(r.status, 'NOT_COMMITTED');
  assert.equal(r.reason, 'SECRET_COVERAGE_INCOMPLETE');
  assert.equal(r.scan.clearance, false);
  assert.equal(f.state.checks, 1);
  assert.deepEqual(r.sourceEffects, f.input.source.effects);
  assert.equal('draft' in r || 'bytes' in r, false);
});
test('actual original bytes are scanned even when candidate omits secret text', async () => {
  const f = input(),
    raw = Buffer.from(vector.source + '\npassword=synthetic-only');
  f.input.source.readDocumentBytes = async () => ({ bytes: raw });
  f.input.envelope.payload.revision.sourceFingerprint =
    'sha256:' + createHash('sha256').update(raw).digest('hex');
  const r = await api.checkDocumentWrite(f.input);
  assert.equal(r.reason, 'SECRET_DETECTED');
  assert.equal(JSON.stringify(r).includes('synthetic-only'), false);
  assert.equal(f.state.checks, 1);
});
test('candidate added secret is scanned independently of raw input', async () => {
  const f = input();
  f.input.envelope.payload.blocks[0].payload.text = 'password=synthetic-only';
  const r = await api.checkDocumentWrite(f.input);
  assert.equal(r.reason, 'SECRET_DETECTED');
  assert.equal(JSON.stringify(r).includes('synthetic-only'), false);
});
test('source digest, selected path and repository mismatches refuse before result', async () => {
  for (const mutate of [
    (f) => {
      f.input.envelope.payload.revision.sourceFingerprint = 'sha256:' + '0'.repeat(64);
    },
    (f) => {
      f.input.path = 'other.md';
    },
    (f) => {
      f.input.source.observation.repositoryId = 'repo:other';
    },
  ]) {
    const f = input();
    mutate(f);
    await assert.rejects(() => api.checkDocumentWrite(f.input));
    assert.equal(f.usage.invalid, true);
  }
});
test('final source failure is sanitized and cannot yield a scan receipt', async () => {
  const f = input();
  f.input.source.verifySelection = async () => {
    throw Error('password=synthetic-only');
  };
  await assert.rejects(
    () => api.checkDocumentWrite(f.input),
    (e) => {
      assert.equal(e.code, 'DOCUMENT_PREFLIGHT_FAILED');
      assert.equal(String(e).includes('synthetic-only'), false);
      assert.deepEqual(e.sourceEffects, f.input.source.effects);
      return true;
    },
  );
  assert.equal(f.usage.invalid, true);
});

test('cancellation after final Source recheck refuses the receipt', async () => {
  const f = input();
  f.input.source.verifySelection = async () => {
    f.input.account.checkpoint = () => {
      throw Object.assign(Error('cancel'), { code: 'CANCELLED' });
    };
  };
  await assert.rejects(() => api.checkDocumentWrite(f.input), { code: 'CANCELLED' });
  assert.equal(f.usage.invalid, true);
});
test('caller envelope changes during async Source read cannot replace inspected input', async () => {
  const f = input(),
    read = f.input.source.readDocumentBytes;
  f.input.source.readDocumentBytes = async () => {
    f.input.envelope.payload.blocks[0].payload.text = 'password=synthetic-only';
    return read();
  };
  const r = await api.checkDocumentWrite(f.input);
  assert.equal(r.reason, 'SECRET_COVERAGE_INCOMPLETE');
  assert.equal(r.status, 'NOT_COMMITTED');
});

test('known candidate path/repository mismatch refuses before opening selected Source', async () => {
  for (const change of [
    (f) => {
      f.input.path = 'other.md';
    },
    (f) => {
      f.input.source.observation.repositoryId = 'repo:foreign';
    },
  ]) {
    const f = input();
    change(f);
    let reads = 0;
    const read = f.input.source.readDocumentBytes;
    f.input.source.readDocumentBytes = async (...args) => {
      reads++;
      return read(...args);
    };
    await assert.rejects(() => api.checkDocumentWrite(f.input), { code: 'INVALID_DOCUMENT_INPUT' });
    assert.equal(reads, 0);
  }
});
test('uncertain Source cleanup survives sanitized preflight failure without leaking raw error', async () => {
  const f = input();
  f.input.source.readDocumentBytes = async () => {
    throw Object.assign(Error('password=synthetic-only'), { cleanupState: 'UNKNOWN' });
  };
  await assert.rejects(
    () => api.checkDocumentWrite(f.input),
    (e) => {
      assert.equal(e.cleanupState, 'UNKNOWN');
      assert.equal(e.code, 'DOCUMENT_PREFLIGHT_FAILED');
      assert.equal(String(e).includes('synthetic-only'), false);
      assert.deepEqual(e.sourceEffects, f.input.source.effects);
      return true;
    },
  );
});
