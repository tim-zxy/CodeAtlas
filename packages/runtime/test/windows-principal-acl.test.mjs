import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as api from '../dist/windows-principal-precompiled.js';
test('shared physical ACL reader is inert text, not a Query or permission mutation', () => {
  assert.equal(typeof api.principalAclReader, 'string');
  for (const forbidden of [
    'GetCurrent',
    'Set-Acl',
    'SetAccessControl',
    'Add-Type',
    "GetMethod('Query')",
  ])
    assert.equal(api.principalAclReader.includes(forbidden), false);
});
test('deployment checker preserves the original owner/ancestor/link/right policy bytes', () => {
  const template = fs
    .readFileSync(
      new URL('../../../scripts/windows-principal-deployment-guard.ps1', import.meta.url),
      'utf8',
    )
    .replaceAll('\r\n', '\n');
  const original = template
    .replace('__FIXED_ACL_READER__\n', '')
    .replaceAll(
      '__FIXED_RELEASE_DIGEST__',
      'ac84dad419c823081d471b6aec288985b01a2f3d9c065e9e666174271bef62b7',
    )
    .replaceAll('Read-PhysicalAcl $windows', 'Get-Acl -LiteralPath $windows')
    .replaceAll('Read-PhysicalAcl $full', 'Get-Acl -LiteralPath $full');
  assert.equal(
    createHash('sha256').update(original).digest('hex'),
    '1fc92716df86e262f59b74bf2ea0265c26b05cd770faf78bfa3d69cbb012a6a1',
  );
});
test(
  'owned Windows long paths preserve descriptors and both original ACL policies',
  { skip: process.platform !== 'win32' },
  () => {
    assert.equal(typeof api.principalAclReader, 'string');
    const workspace = fileURLToPath(new URL('../../../', import.meta.url));
    fs.mkdirSync(path.join(workspace, '.superpowers'), { recursive: true });
    const root = fs.mkdtempSync(path.join(workspace, '.superpowers', 'principal-acl-fixture-'));
    const short = path.join(root, 'short', 'fixture.bin');
    fs.mkdirSync(path.dirname(short));
    fs.writeFileSync(short, 'OWNED_ACL_FIXTURE');
    const prefix = path.join(root, 'long') + path.sep,
      suffix = path.sep + 'fixture.bin';
    const long = prefix + 'x'.repeat(266 - prefix.length - suffix.length) + suffix;
    fs.mkdirSync(path.dirname(long), { recursive: true });
    fs.writeFileSync(long, 'OWNED_ACL_FIXTURE');
    const directory = path.join(path.dirname(long), 'directory-child');
    fs.mkdirSync(directory);
    const junction = path.join(root, 'internal-junction');
    fs.symlinkSync(path.dirname(short), junction, 'junction');
    const source = fs.readFileSync(
      new URL('../src/windows-principal-precompiled.ts', import.meta.url),
      'utf8',
    );
    const from = source.indexOf('function Guard-Acl('),
      to = source.indexOf('\nfunction Hash(', from);
    assert.ok(from >= 0 && to > from);
    const template = fs.readFileSync(
      path.join(workspace, 'scripts/windows-principal-deployment-guard.ps1'),
      'utf8',
    );
    const a = template.indexOf('function Guard('),
      b = template.indexOf('\n$base=', a);
    assert.ok(a >= 0 && b > a);
    const input = {
      reader: api.principalAclReader,
      productionPolicy: source.slice(from, to),
      checkerPolicy: template.slice(a, b),
      short,
      long,
      directory,
      junction,
    };
    const inputFile = path.join(root, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(input));
    const result = spawnSync(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(workspace, 'scripts/test-windows-principal-acl.ps1'),
        '-InputFile',
        inputFile,
      ],
      {
        env: {
          ...process.env,
          PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
        },
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: 30000,
        maxBuffer: 1000000,
      },
    );
    fs.writeFileSync(
      path.join(root, 'result.json'),
      JSON.stringify(
        {
          status: result.status,
          signal: result.signal,
          errorCode: result.error?.code ?? null,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        null,
        2,
      ),
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.failures, 0);
    assert.equal(report.principalQueries, 0);
    assert.equal(report.ACLWrites, 0);
    assert.equal(report.physicalCases, 6);
    assert.equal(report.invalidPaths, 10);
    assert.equal(report.policyCases, 28);
  },
);

test('checker generation refuses a different production module before creating output', () => {
  const workspace = fileURLToPath(new URL('../../../', import.meta.url));
  const outputRelative = '.superpowers/principal-guard-version-negative-' + process.pid;
  const target = path.join(workspace, outputRelative);
  assert.equal(fs.existsSync(target), false);
  const closed = new URL('../dist/closed-runtime-package.js', import.meta.url).href;
  const generator = new URL(
    '../../../scripts/write-principal-deployment-guard.mjs',
    import.meta.url,
  ).href;
  const args = [
    process.execPath,
    'TEST_DOUBLE_GENERATOR',
    '.superpowers/closed-runtime-test/release-' + '0'.repeat(64),
    outputRelative,
    '4194304',
    '200000',
    '80',
  ];
  const source = [
    "import {mock} from 'node:test';import fs from 'node:fs';",
    'await mock.module(' +
      JSON.stringify(closed) +
      ",{exports:{readClosedRuntimePackage:async()=>({manifestBytes:Buffer.from(JSON.stringify({files:[{path:'packages/runtime/dist/windows-principal-precompiled.js',sha256:'f'.repeat(64),bytes:1}]})),contentDigest:'0'.repeat(64),recheck(){throw Error('CHECK_MUST_REFUSE_BEFORE_RECHECK')}})}});",
    'process.argv=' + JSON.stringify(args) + ';',
    'let refused=false;try{await import(' +
      JSON.stringify(generator) +
      ")}catch(e){refused=e.message.includes('CANDIDATE_PRINCIPAL_MODULE_MISMATCH')}",
    'if(!refused||fs.existsSync(' +
      JSON.stringify(target) +
      "))process.exitCode=1;else console.log('REFUSED_BEFORE_OUTPUT');",
  ].join('\n');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(
    process.execPath,
    ['--experimental-test-module-mocks', '--input-type=module', '--eval', source],
    {
      cwd: workspace,
      env,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 65536,
      windowsHide: true,
      shell: false,
    },
  );
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim(), 'REFUSED_BEFORE_OUTPUT');
});
