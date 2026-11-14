import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import * as pack from '../../../scripts/helpers/native-refresh-ci-pack.mjs';
import { validateRefreshCiApproval } from '../../../scripts/helpers/native-refresh-ci-pack.mjs';

const workflow = () =>
  readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('A1 CI selection uses one exact approval without replacing historical approvals', () => {
  const text = workflow();
  const entry = readFileSync(
    new URL('../../../.github/qualification/a1-ci-actual22.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(
    text.match(/fixtures\/ipc\/refresh-v3\/approved-transport-a1\.json/g)?.length ?? 0,
    2,
  );
  assert.ok(entry.includes('fixtures/ipc/refresh-v3/approved-transport-a1.json'));
  assert.equal(text.includes('approved-transport-r5.json'), false);
  assert.equal(text.includes('approved-transport-r8.json'), false);
  assert.equal(text.includes('$historicalApproval'), false);
  assert.equal(text.includes('Copy-Item -LiteralPath $r8ApprovalPath'), false);
  assert.match(text, /node \.github\/qualification\/a1-ci-actual22\.mjs/);
  assert.match(
    entry,
    /const approval = validateRefreshCiApproval\(JSON\.parse\(await readFile\(approvalPath, 'utf8'\)\)\)/,
  );
  assert.match(entry, /const packArgs = \{ approval, archivePath, repositoryPath \}/);
  assert.match(entry, /const value = await installRefreshCiPack\(packArgs\)/);
});

test('A1 CI selection preserves jobs, original actual gates, stop control and token restoration', () => {
  const text = workflow();
  const jobs = text.split(/^jobs:\s*$/m)[1];
  assert.ok(jobs, 'Original jobs section required');
  assert.deepEqual(
    [...jobs.matchAll(/^  ([a-z][a-z-]*):$/gm)].map((m) => m[1]),
    ['typescript', 'rust', 'native-analysis'],
  );
  const step = parse(text).jobs['native-analysis'].steps.find(
    (step) => step.name === 'Require approved exact-pack Native REFRESH actual22',
  );
  assert.equal(step['timeout-minutes'], 110);
  assert.equal(step.if, "success() && !cancelled() && steps.script_catalog.outcome == 'success'");
  const nativeSteps = parse(text).jobs['native-analysis'].steps;
  const actualIndex = nativeSteps.findIndex((value) => value.name === step.name);
  for (const prerequisite of nativeSteps.slice(0, actualIndex))
    assert.notEqual(prerequisite['continue-on-error'], true);
  for (const name of [
    'Preserve memory observations including failures',
    'Preserve original fixed-volume REFRESH scratch on export failure',
  ])
    assert.equal(nativeSteps.find((value) => value.name === name).if, 'always()');
  assert.match(step.run, /Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue/);
  assert.match(step.run, /Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue/);
  assert.match(step.run, /finally \{[\s\S]*\$env:GITHUB_TOKEN = \$previousGitHubToken/);
  assert.match(step.run, /finally \{[\s\S]*\$env:GH_TOKEN = \$previousGhToken/);
  assert.ok(step.run.includes('$env:NODE_OPTIONS = $previousNodeOptions'));
  const entry = readFileSync(
    new URL('../../../.github/qualification/a1-ci-actual22.mjs', import.meta.url),
    'utf8',
  );
  assert.match(entry, /control = await createR9StopControl\(output, verifyIdentity\)/);
  assert.match(
    entry,
    /readRefreshTransportReplayCorpus\(\s*installed\.manifestPath,\s*installed\.bindingPath,\s*installed\.fixtureContext,/,
  );
  assert.match(
    entry,
    /runRefreshTransportCommand\(\s*\['collect', 'approved', installed\.candidatePath, path\.join\(output, 'actual'\)\],\s*installed\.fixtureContext,\s*control,/,
  );
  assert.match(
    entry,
    /validateRefreshCiActualReport\(report, \{\s*candidateSha256: approval\.candidate\.sha256,\s*candidate: approval\.candidate,\s*identity: values\[0\]\.identity,/,
  );
  assert.match(entry, /await verifyRefreshCiLayoutOwnership\(installed\.layout\)/);
  assert.match(entry, /assert\.deepEqual\(await readdir\(installed\.layout\.tempRoot\), \[\]\)/);
  assert.match(entry, /await verifyIdentity\(true\)/);
});

test('R8 CI selection retains original and current fixed-volume failure evidence', () => {
  const text = workflow();
  const fallback = text.split(
    'Preserve original fixed-volume REFRESH scratch on export failure',
  )[1];
  assert.ok(fallback, 'Original fallback step required');
  for (const suffix of ['', '-R2', '-R3', '-R4', '-R5', '-R8'])
    assert.ok(fallback.includes('C:/CodeAtlas-P05-D5' + suffix + '/evidence/corpus/replay'));
  assert.match(fallback, /if: always\(\)/);
  assert.match(fallback, /name: native-refresh-original-fallback/);
});

test('R8 CI selection pins the verified asset and retains strict approval refusals', () => {
  const readApproval = () =>
    JSON.parse(
      readFileSync(
        new URL('../../../fixtures/ipc/refresh-v3/approved-transport-r8.json', import.meta.url),
        'utf8',
      ),
    );
  const approved = validateRefreshCiApproval(readApproval());
  assert.deepEqual(approved.release, {
    repository: 'tim-zxy/CodeAtlas',
    tag: 'p05-d5-fixture-fc042b319b7a2d0e4c719f4aa80ecda46eb5b53550eb409e18938260f20a3964',
    releaseId: 436279924,
    assetId: 716516452,
    assetName: 'codeatlas-p05-d5-r8.zip',
  });
  assert.equal(approved.archive.bytes, 245270697);
  assert.equal(
    approved.archive.sha256,
    '542791c28652b255f5c5843f8110a926aa68fda3c53374ab0747d55e541b030b',
  );
  assert.equal(approved.archive.entries.length, 5423);
  assert.equal(approved.candidate.reservationBytes, 403861504);
  assert.equal(
    approved.environment.implementationDigest,
    '1cbaef7ba843af6419a39af6dd3dfe0a7241c92851ff70d6ce77213819714bcf',
  );
  for (const corrupt of [
    (value) => {
      value.release.assetId = 0;
    },
    (value) => {
      value.release.tag = 'p05-d5-fixture-' + '0'.repeat(64);
    },
    (value) => {
      value.candidate.reservationBytes--;
    },
    (value) => {
      value.unreviewedOverride = true;
    },
  ]) {
    const value = readApproval();
    corrupt(value);
    assert.throws(() => validateRefreshCiApproval(value));
  }
});

async function scriptCatalogFixture(t) {
  const temp = await realpath(tmpdir());
  const root = await mkdtemp(path.join(temp, 'codeatlas-script-preflight-'));
  t.after(async () => {
    assert.equal(path.dirname(root), temp);
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'scripts/nested'), { recursive: true });
  await writeFile(path.join(root, 'scripts/alpha.mjs'), 'alpha\n');
  await writeFile(path.join(root, 'scripts/nested/beta.cs'), 'beta\n');
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  const manifestBytes = Buffer.from(
    JSON.stringify({
      generator: {
        dependencies: [
          { path: 'repository/package.json', sha256: hash('not a script') },
          { path: 'repository/scripts/alpha.mjs', sha256: hash('alpha\n') },
          { path: 'repository/scripts/nested/beta.cs', sha256: hash('beta\n') },
        ],
      },
    }),
  );
  const approval = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/ipc/refresh-v3/approved-transport-r8.json', import.meta.url),
      'utf8',
    ),
  );
  const manifestEntry = approval.archive.entries.find(
    (entry) => entry.path === 'evidence/corpus/artifacts/manifest.json',
  );
  manifestEntry.bytes = manifestBytes.length;
  manifestEntry.sha256 = hash(manifestBytes);
  return { repositoryPath: root, manifestBytes, approval };
}

test('script catalog preflight accepts matching scripts without claiming Native qualification', async (t) => {
  assert.equal(typeof pack.inspectRefreshCiScriptCatalog, 'function');
  const result = await pack.inspectRefreshCiScriptCatalog(await scriptCatalogFixture(t));
  assert.equal(result.scope, 'SCRIPT_CATALOG_PREREQUISITE_ONLY');
  assert.equal(result.matches, true);
  assert.equal(result.expectedCount, 2);
  assert.equal(result.currentCount, 2);
  assert.deepEqual([result.added, result.removed, result.changed], [[], [], []]);
  assert.equal(result.nativeQualified, false);
});

test('script catalog preflight refuses added removed and altered script membership', async (t) => {
  assert.equal(typeof pack.inspectRefreshCiScriptCatalog, 'function');
  const input = await scriptCatalogFixture(t);
  await unlink(path.join(input.repositoryPath, 'scripts/alpha.mjs'));
  await writeFile(path.join(input.repositoryPath, 'scripts/nested/beta.cs'), 'changed\n');
  await writeFile(path.join(input.repositoryPath, 'scripts/gamma.ps1'), 'gamma\n');
  const result = await pack.inspectRefreshCiScriptCatalog(input);
  assert.equal(result.matches, false);
  assert.deepEqual(result.added, ['repository/scripts/gamma.ps1']);
  assert.deepEqual(result.removed, ['repository/scripts/alpha.mjs']);
  assert.deepEqual(result.changed, ['repository/scripts/nested/beta.cs']);
  assert.equal(result.nativeQualified, false);
});

test('script catalog preflight authenticates the approved manifest before reading a checkout', async (t) => {
  assert.equal(typeof pack.inspectRefreshCiScriptCatalog, 'function');
  const input = await scriptCatalogFixture(t);
  const bad = Buffer.from(input.manifestBytes);
  bad[0] ^= 1;
  await assert.rejects(
    () =>
      pack.inspectRefreshCiScriptCatalog({
        ...input,
        manifestBytes: bad,
        repositoryPath: path.join(input.repositoryPath, 'absent'),
      }),
    /manifest hash/i,
  );
  input.approval.archive.entries = input.approval.archive.entries.filter(
    (entry) => entry.path !== 'evidence/corpus/artifacts/manifest.json',
  );
  await assert.rejects(
    () => pack.inspectRefreshCiScriptCatalog(input),
    /approved replay manifest/i,
  );
});

test('R8 CI script prerequisite failure cannot pass or run the expensive qualification gates', () => {
  const doc = parse(workflow());
  const job = doc.jobs['native-analysis'];
  const catalog = job.steps.find((step) => step.id === 'script_catalog');
  assert.ok(catalog, 'An explicit script prerequisite is required');
  assert.notEqual(job['continue-on-error'], true);
  assert.notEqual(catalog['continue-on-error'], true);
  assert.match(catalog.run, /process\.exitCode = 1/);
  assert.ok(
    job.steps.findIndex((step) => step.name === 'Run HOST launch inventory memory checks') <
      job.steps.indexOf(catalog),
  );
  for (const name of [
    'Build Native Analyzer',
    'Run Native REFRESH composition and replay contracts',
    'Enforce fresh read-seal, transport and refresh-verification reservations',
    'Collect every required memory class',
    'Require approved exact-pack Native REFRESH actual22',
  ]) {
    const step = job.steps.find((step) => step.name === name);
    assert.ok(step, name + ' remains required');
    assert.match(step.if, /steps\.script_catalog\.outcome == 'success'/);
  }
  assert.match(
    job.steps.find((step) => step.name === 'Preserve memory observations including failures').if,
    /always\(\)/,
  );
});
