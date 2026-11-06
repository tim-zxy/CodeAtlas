import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { validateRefreshCiApproval } from '../../../scripts/helpers/native-refresh-ci-pack.mjs';

const workflow = () =>
  readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('R8 CI selection uses one exact approval for download and original CLI admission', () => {
  const text = workflow();
  assert.equal(
    text.match(/fixtures\/ipc\/refresh-v3\/approved-transport-r8\.json/g)?.length ?? 0,
    2,
  );
  assert.equal(text.includes('approved-transport-r5.json'), false);
  assert.match(
    text,
    /Copy-Item -LiteralPath \$r8ApprovalPath -Destination \$approvalPath -ErrorAction Stop/,
  );
});

test('R8 CI selection preserves original jobs, actual22 and historical byte restoration', () => {
  const text = workflow();
  const jobs = text.split(/^jobs:\s*$/m)[1];
  assert.ok(jobs, 'Original jobs section required');
  assert.deepEqual(
    [...jobs.matchAll(/^  ([a-z][a-z-]*):$/gm)].map((m) => m[1]),
    ['typescript', 'rust', 'native-analysis'],
  );
  assert.match(
    text,
    /node scripts\/native-refresh-ci\.mjs collect \.superpowers\/native-memory\/exact-pack\/approved\.zip \.superpowers\/native-memory\/exact-pack\/acceptance/,
  );
  assert.ok(text.includes('$historicalApproval = [IO.File]::ReadAllBytes($approvalPath)'));
  assert.match(
    text,
    /finally \{[\s\S]*?\[IO.File\]::WriteAllBytes\(\$approvalPath, \$historicalApproval\)/,
  );
  assert.ok(text.includes("throw 'Historical approval restoration hash mismatch'"));
  assert.ok(text.includes('$env:NODE_OPTIONS = $previousNodeOptions'));
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
