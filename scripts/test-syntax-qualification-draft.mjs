import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Read-only Git filter simulation; does not checkout or write Git objects/index.
test('Phase1 raw artifacts survive Windows checkout filters byte-for-byte', () => {
  const git = (...args) => {
    const result = spawnSync('git', args, { windowsHide: true });
    assert.equal(result.status, 0, result.stderr.toString());
    return result.stdout;
  };
  const raw = git('cat-file', 'blob', 'HEAD:package.json');
  for (const file of [
    'fixtures/phase1/syntax-changed-only-oracle/calibration/app.py',
    'fixtures/phase1/syntax-java-owner-oracle/calibration/Endpoint.java',
    'fixtures/phase1/syntax-changed-only-oracle/calibration/request.jsonl',
  ]) {
    assert.deepEqual(
      git(
        '-c',
        'core.autocrlf=true',
        'cat-file',
        '--filters',
        '--path=' + file,
        'HEAD:package.json',
      ),
      raw,
      file,
    );
    assert.match(git('check-attr', 'text', '--', file).toString(), /: text: unset/);
  }
});

test('draft preparation loader is available without granting execution', async () => {
  const module = await import('./syntax-qualification-draft.mjs');
  assert.equal(typeof module.loadSyntaxQualificationDraft, 'function');
});
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { authorDraft } from '../fixtures/phase1/syntax-qualification-draft/authoring.mjs';
import { nativeSyntaxObservationProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = 'fixtures/phase1/syntax-qualification-draft/inputs/draft.json';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const json = (p) => JSON.parse(syncFs.readFileSync(p));
const baseline = authorDraft(root);
const load = async (r = root, p = manifestPath, l = baseline.limits) =>
  (await import('./syntax-qualification-draft.mjs')).loadSyntaxQualificationDraft(r, p, l);
const fixed = (e) =>
  e.code === 'INVALID_SYNTAX_QUALIFICATION_DRAFT' &&
  e.message === e.code &&
  !e.message.includes('SENSITIVE_SENTINEL');
const frozen = (v) => {
  if (v && typeof v === 'object') {
    assert.ok(Object.isFrozen(v));
    Object.values(v).forEach(frozen);
  }
};
async function owned(t) {
  const r = await fs.mkdtemp(path.join(tmpdir(), 'codeatlas-qualification-'));
  t.after(() => fs.rm(r, { recursive: true, force: true }));
  await fs.cp(path.join(root, 'fixtures/phase1'), path.join(r, 'fixtures/phase1'), {
    recursive: true,
  });
  return r;
}
async function save(r, d) {
  await fs.writeFile(path.join(r, manifestPath), JSON.stringify(d, null, 2) + '\n');
}
async function rewrite(r, ref, bytes) {
  await fs.writeFile(path.join(r, ref.path), bytes);
  ref.sha256 = sha(bytes);
}
async function valid(r) {
  return load(r, manifestPath, authorDraft(r).limits);
}

test('draft-baseline-is-always-not-ready with independent frozen full report', async () => {
  const report = await load();
  assert.deepEqual(
    report,
    json(path.join(root, 'fixtures/phase1/syntax-qualification-draft/expected/report.json')),
  );
  assert.equal(report.cases.length, 16);
  assert.equal(report.cases.filter((c) => c.requestShapeDifferences.length).length, 6);
  assert.equal(report.missingToolIdentities.length, 7);
  assert.equal(report.readiness, 'NOT_READY');
  assert.equal(nativeSyntaxObservationProfiles.length, 0);
  frozen(report);
});
for (const axis of ['removed', 'resource'])
  test('whole request binds ' + axis + ' while owner-map stays unchanged', async (t) => {
    const r = await owned(t),
      d = json(path.join(r, manifestPath)),
      c = d.cases.find((c) => c.id === 'calibration:changed-only-restart');
    const req = json(path.join(r, c.request.path)),
      owner = req.payload.ownerBinding.ownerMapDigest;
    if (axis === 'removed')
      req.payload.removedSourceFiles[0].previousContentFingerprint = 'content:different';
    else req.payload.resourceBudget.maxEvents++;
    await rewrite(r, c.request, Buffer.from(JSON.stringify(req) + '\n'));
    await save(r, d);
    const out = await valid(r),
      after = out.cases.find((x) => x.id === c.id),
      before = baseline.report.cases.find((x) => x.id === c.id);
    assert.equal(json(path.join(r, c.request.path)).payload.ownerBinding.ownerMapDigest, owner);
    for (const k of [
      'rawRequestDigest',
      'requestIdentityDigest',
      axis === 'removed' ? 'removedInventoryDigest' : 'resourceDigest',
    ])
      assert.notEqual(after[k], before[k]);
    assert.equal(out.readiness, 'NOT_READY');
  });
for (const key of ['approved', 'readiness', 'SEALED', 'testBypass', 'reservationBytes'])
  test('caller cannot introduce ' + key, async (t) => {
    const r = await owned(t),
      d = json(path.join(r, manifestPath));
    d[key] = 'SENSITIVE_SENTINEL';
    await save(r, d);
    await assert.rejects(valid(r), fixed);
  });
test('all tool artifact bytes present still cannot confer qualification', async (t) => {
  const r = await owned(t),
    d = json(path.join(r, manifestPath));
  for (const k of Object.keys(d.tooling)) d.tooling[k] = d.cases[0].context;
  await save(r, d);
  const out = await valid(r);
  assert.deepEqual(out.missingToolIdentities, []);
  assert.equal(out.readiness, 'NOT_READY');
  for (const obligation of [
    'TOOL_IDENTITIES_UNQUALIFIED',
    'ORACLE_PROVENANCE_REQUIRED',
    'TRUSTED_CONTEXT_REQUIRED',
    'PROCESS_ACQUISITION_REQUIRED',
    'PROFILE_APPROVAL_REQUIRED',
  ])
    assert.ok(out.unresolvedObligations.includes(obligation));
});
test('rehashed structurally valid false reference retains provenance obligation', async (t) => {
  const r = await owned(t),
    d = json(path.join(r, manifestPath)),
    c = d.cases[0];
  const events = syncFs
    .readFileSync(path.join(r, c.expected.path), 'utf8')
    .trimEnd()
    .split('\n')
    .map(JSON.parse);
  events.find((e) => e.type === 'NODE').payload.name = 'SENSITIVE_SENTINEL';
  const prefix = events
    .slice(0, -1)
    .map((e) => JSON.stringify(e) + '\n')
    .join('');
  events.at(-1).payload.checksum = sha(Buffer.from(prefix));
  await rewrite(r, c.expected, Buffer.from(prefix + JSON.stringify(events.at(-1)) + '\n'));
  await save(r, d);
  const out = await valid(r);
  assert.equal(out.readiness, 'NOT_READY');
  assert.ok(out.unresolvedObligations.includes('ORACLE_PROVENANCE_REQUIRED'));
  assert.notEqual(
    out.cases.find((x) => x.id === c.id).expectedDigest,
    baseline.report.cases.find((x) => x.id === c.id).expectedDigest,
  );
  assert.ok(!JSON.stringify(out).includes('SENSITIVE_SENTINEL'));
});
for (const defect of [
  'missing-case',
  'duplicate-case',
  'extra-case',
  'wrong-source-id',
  'wrong-source-bytes',
  'retained-overlap',
  'retained-duplicate',
  'removed-overlap',
  'corrupt-expected',
  'wrong-context',
  'fake-catalog',
])
  test('correspondence refuses ' + defect, async (t) => {
    const r = await owned(t),
      d = json(path.join(r, manifestPath)),
      c = d.cases[0];
    if (defect === 'missing-case') d.cases.pop();
    if (defect === 'duplicate-case') d.cases[1] = c;
    if (defect === 'extra-case') d.cases.push({ ...c, id: 'calibration:invented' });
    if (defect === 'wrong-source-id') c.sources[0].sourceFileId = 'file:invented';
    if (defect === 'wrong-source-bytes')
      await rewrite(r, c.sources[0].artifact, Buffer.from('SENSITIVE_SENTINEL'));
    if (defect === 'retained-overlap') c.retainedPaths = ['app.py'];
    if (defect === 'retained-duplicate') c.retainedPaths = ['retained.py', 'retained.py'];
    if (defect === 'removed-overlap') {
      const q = json(path.join(r, c.request.path));
      q.payload.removedSourceFiles = [
        { id: 'file:removed', path: 'app.py', previousContentFingerprint: 'old' },
      ];
      await rewrite(r, c.request, Buffer.from(JSON.stringify(q) + '\n'));
    }
    if (defect === 'corrupt-expected') await rewrite(r, c.expected, Buffer.from('{}\n'));
    if (defect === 'wrong-context') await rewrite(r, c.context, Buffer.from('{}'));
    if (defect === 'fake-catalog') {
      const q = json(path.join(r, d.corpus.path));
      q.holdout = [];
      await rewrite(r, d.corpus, Buffer.from(JSON.stringify(q)));
    }
    await save(r, d);
    await assert.rejects(
      load(r, manifestPath, {
        ...baseline.limits,
        maxManifestBytes: syncFs.statSync(path.join(r, manifestPath)).size,
      }),
      fixed,
    );
  });
for (const bad of [
  '/absolute',
  '../escape',
  'a/../b',
  'a//b',
  'a\\b',
  'C:/absolute',
  'a:b',
  'a\0b',
  'a|b',
  'a>b',
  './x',
])
  test('portable path refuses ' + JSON.stringify(bad), async () => {
    await assert.rejects(load(root, bad), fixed);
  });
for (const key of Object.keys(baseline.limits))
  test('exact read accounting rejects one below ' + key, async () => {
    await assert.rejects(
      load(root, manifestPath, { ...baseline.limits, [key]: baseline.limits[key] - 1 }),
      fixed,
    );
  });
test('limits require exact keys, safe positive data without getter invocation', async () => {
  for (const limits of [
    { ...baseline.limits, extra: 1 },
    { ...baseline.limits, maxFiles: 0 },
    { ...baseline.limits, maxFiles: Number.MAX_SAFE_INTEGER + 1 },
  ])
    await assert.rejects(load(root, manifestPath, limits), fixed);
  let accessed = false;
  const limits = { ...baseline.limits };
  Object.defineProperty(limits, 'maxFiles', {
    get() {
      accessed = true;
      return 1;
    },
  });
  await assert.rejects(load(root, manifestPath, limits), fixed);
  assert.equal(accessed, false);
});
for (const defect of ['bom', 'invalid-utf8', 'extra-record', 'no-lf'])
  test('raw request refuses ' + defect, async (t) => {
    const r = await owned(t),
      d = json(path.join(r, manifestPath)),
      ref = d.cases[0].request,
      b = syncFs.readFileSync(path.join(r, ref.path));
    const bytes =
      defect === 'bom'
        ? Buffer.concat([Buffer.from([239, 187, 191]), b])
        : defect === 'invalid-utf8'
          ? Buffer.from([255, 10])
          : defect === 'extra-record'
            ? Buffer.concat([b, b])
            : b.subarray(0, -1);
    await rewrite(r, ref, bytes);
    await save(r, d);
    await assert.rejects(
      load(r, manifestPath, {
        ...baseline.limits,
        maxManifestBytes: syncFs.statSync(path.join(r, manifestPath)).size,
      }),
      fixed,
    );
  });
for (const kind of ['root-junction', 'intermediate-junction', 'hardlink', 'directory', 'symlink'])
  test('confined file refuses ' + kind, async (t) => {
    const r = await owned(t),
      d = json(path.join(r, manifestPath)),
      file = path.join(r, d.cases[0].context.path);
    if (kind === 'root-junction') {
      const alias = r + '-alias';
      await fs.symlink(r, alias, 'junction');
      t.after(() => fs.unlink(alias));
      await assert.rejects(load(alias), fixed);
      return;
    }
    if (kind === 'intermediate-junction') {
      const dir = path.dirname(file),
        moved = dir + '-original';
      await fs.rename(dir, moved);
      await fs.symlink(moved, dir, 'junction');
      await assert.rejects(load(r), fixed);
      return;
    }
    if (kind === 'hardlink') {
      await fs.link(file, file + '-link');
    } else if (kind === 'directory') {
      await fs.unlink(file);
      await fs.mkdir(file);
    } else {
      await fs.rename(file, file + '-target');
      try {
        await fs.symlink(file + '-target', file, 'file');
      } catch (error) {
        if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
        t.todo(
          'OPEN GATE: Windows denied real file symlink creation (EPERM); no symlink refusal evidence',
        );
        return;
      }
    }
    await assert.rejects(load(r), fixed);
  });
test('named-file replacement after real open is rejected deterministically', async (t) => {
  const r = await owned(t);
  await valid(r);
  const d = json(path.join(r, manifestPath)),
    target = path.join(r, d.cases[0].context.path),
    originalOpen = fs.open;
  let replaced = false;
  t.mock.method(fs, 'open', async function (file, ...args) {
    const handle = await originalOpen.call(this, file, ...args);
    if (file === target && !replaced) {
      replaced = true;
      await fs.rename(target, target + '-original');
      await fs.writeFile(target, 'SENSITIVE_SENTINEL');
    }
    return handle;
  });
  await assert.rejects(valid(r), fixed);
  assert.equal(replaced, true);
});
for (const status of ['APPROVED', 'SEALED'])
  test('existing status field cannot grant ' + status, async (t) => {
    const r = await owned(t),
      d = json(path.join(r, manifestPath));
    d.status = status;
    await save(r, d);
    await assert.rejects(valid(r), fixed);
  });
test('complete tool references and matching synthetic shapes still remain not ready', async (t) => {
  const { computeSyntaxOwnerMapDigest } = await import('../packages/providers/dist/index.js');
  const r = await owned(t),
    d = json(path.join(r, manifestPath));
  const activation = json(path.join(r, d.cases[0].context.path)).expectedActivationBasis;
  for (const c of d.cases) {
    if (!['dynamic-malformed', 'nested-source', 'bounded-output'].includes(c.id.split(':')[1]))
      continue;
    const context = json(path.join(r, c.context.path)),
      request = json(path.join(r, c.request.path));
    context.expectedActivationBasis = activation;
    request.payload.expectedActivationBasis = activation;
    request.payload.ownerBinding.ownerMapDigest = computeSyntaxOwnerMapDigest(context);
    await rewrite(r, c.context, Buffer.from(JSON.stringify(context)));
    await rewrite(r, c.request, Buffer.from(JSON.stringify(request) + '\n'));
    const events = syncFs
      .readFileSync(path.join(r, c.expected.path), 'utf8')
      .trimEnd()
      .split('\n')
      .map(JSON.parse);
    for (const e of events)
      if (['SYNTAX_STARTED', 'SYNTAX_COMPLETED'].includes(e.type)) {
        e.payload.expectedActivationBasis = activation;
        e.payload.ownerBinding.ownerMapDigest = request.payload.ownerBinding.ownerMapDigest;
      }
    const prefix = events
      .slice(0, -1)
      .map((e) => JSON.stringify(e) + '\n')
      .join('');
    events.at(-1).payload.checksum = sha(Buffer.from(prefix));
    await rewrite(r, c.expected, Buffer.from(prefix + JSON.stringify(events.at(-1)) + '\n'));
  }
  for (const key of Object.keys(d.tooling)) d.tooling[key] = d.cases[0].context;
  await save(r, d);
  const out = await valid(r);
  assert.equal(out.readiness, 'NOT_READY');
  assert.equal(out.cases.filter((c) => c.requestShapeDifferences.length).length, 0);
  assert.deepEqual(out.missingToolIdentities, []);
  assert.equal(out.unresolvedObligations.length, 7);
  assert.ok(out.unresolvedObligations.includes('TRUSTED_CONTEXT_REQUIRED'));
  assert.ok(out.unresolvedObligations.includes('ORACLE_PROVENANCE_REQUIRED'));
});
