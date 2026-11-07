import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { principalAclReader } from '../dist/windows-principal-precompiled.js';
const templateFile = new URL(
  '../../../scripts/windows-principal-deployment-guard.ps1',
  import.meta.url,
);
test('fixed checker exposes NEW_VERSION while retaining the legacy modes', () => {
  const source = fs.readFileSync(templateFile, 'utf8');
  assert.ok(source.includes("ValidateSet('PREFLIGHT','INSTALLED','NEW_VERSION')"));
  assert.ok(source.includes("if($Mode -ceq 'NEW_VERSION')"));
});
test(
  'owned coexistence checks exact target, containers, ancestors and legacy behavior',
  { skip: process.platform !== 'win32' },
  () => {
    const source = fs.readFileSync(templateFile, 'utf8');
    const start = source.indexOf('function Preflight-NewVersion{');
    assert.ok(start >= 0, 'new preflight must exist');
    const stop = source.indexOf("\nif($Mode -ceq 'NEW_VERSION')", start);
    assert.ok(stop > start);
    const guardFrom = source.indexOf('function Guard('),
      guardTo = source.indexOf('\nfunction Preflight-NewVersion{', guardFrom);
    const legacyFrom = source.indexOf('$base=', stop),
      legacyTo = source.lastIndexOf('\n[pscustomobject]@');
    assert.ok(guardFrom >= 0 && guardTo > guardFrom && legacyFrom > stop && legacyTo > legacyFrom);
    const workspace = fileURLToPath(new URL('../../../', import.meta.url));
    fs.mkdirSync(path.join(workspace, '.superpowers'), { recursive: true });
    const owned = fs.mkdtempSync(
      path.join(workspace, '.superpowers', 'principal-coexistence-fixture-'),
    );
    function withinOwned(full) {
      const relative = path.relative(owned, full);
      assert.ok(
        relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
        'fixture move must stay owned',
      );
    }
    function moveOwned(from, to) {
      withinOwned(fs.realpathSync(from));
      withinOwned(fs.realpathSync(path.dirname(to)));
      withinOwned(path.resolve(to));
      assert.equal(fs.existsSync(to), false);
      fs.renameSync(from, to);
    }
    const digest = 'd'.repeat(64),
      leaf = 'release-' + digest,
      oldLeaf = 'release-' + 'a'.repeat(64),
      cases = [];
    const basic = (name, mode = 'NEW_VERSION', expected = false) => {
      const base = path.join(owned, name),
        programs = path.join(base, 'Programs'),
        code = path.join(programs, 'CodeAtlas'),
        releases = path.join(code, 'releases');
      fs.mkdirSync(releases, { recursive: true });
      const previous = path.join(releases, oldLeaf);
      fs.mkdirSync(previous);
      const sentinel = path.join(previous, 'old-sentinel.txt');
      fs.writeFileSync(sentinel, 'RETAIN_OLD_VERSION');
      const c = {
        name,
        mode,
        programs,
        root: path.join(releases, leaf),
        expected,
        sentinel,
        before: fs.statSync(sentinel).mtimeMs,
      };
      cases.push(c);
      return { ...c, code, releases, base, c };
    };
    basic('safe', 'NEW_VERSION', true);
    let x = basic('missing-code');
    moveOwned(x.code, path.join(x.base, 'retained-code'));
    x = basic('missing-releases');
    moveOwned(x.releases, path.join(x.base, 'retained-releases'));
    x = basic('code-file');
    moveOwned(x.code, path.join(x.base, 'retained-code'));
    fs.writeFileSync(x.code, 'NO_OVERWRITE');
    x = basic('releases-file');
    moveOwned(x.releases, path.join(x.base, 'retained-releases'));
    fs.writeFileSync(x.releases, 'NO_OVERWRITE');
    for (const which of ['programs', 'code', 'releases']) {
      x = basic(which + '-junction');
      const moved = path.join(x.base, 'physical-' + which);
      moveOwned(x[which], moved);
      fs.symlinkSync(moved, x[which], 'junction');
    }
    x = basic('higher-ancestor-junction');
    const physical = path.join(x.base, 'physical-parent');
    fs.mkdirSync(physical);
    moveOwned(x.programs, path.join(physical, 'Programs'));
    const alias = path.join(x.base, 'alias-parent');
    fs.symlinkSync(physical, alias, 'junction');
    x.c.programs = path.join(alias, 'Programs');
    x.c.root = path.join(x.c.programs, 'CodeAtlas', 'releases', leaf);
    x = basic('code-dangling-container');
    const danglingCode = path.join(x.base, 'temporary-code');
    moveOwned(x.code, danglingCode);
    fs.symlinkSync(danglingCode, x.code, 'junction');
    moveOwned(danglingCode, path.join(x.base, 'retained-code'));
    x = basic('target-directory');
    fs.mkdirSync(x.root);
    x = basic('target-file');
    fs.writeFileSync(x.root, 'NO_OVERWRITE');
    x = basic('target-junction');
    fs.symlinkSync(path.dirname(x.sentinel), x.root, 'junction');
    x = basic('target-dangling-junction');
    const missing = path.join(x.base, 'missing-target');
    fs.mkdirSync(missing);
    fs.symlinkSync(missing, x.root, 'junction');
    moveOwned(missing, missing + '.retained');
    x = basic('target-case-alias');
    fs.mkdirSync(path.join(x.releases, leaf.toUpperCase()));
    x = basic('sibling-junction');
    fs.symlinkSync(path.dirname(x.sentinel), path.join(x.releases, 'other-alias'), 'junction');
    for (const [name, where, owner, rights, inherit] of [
      ['ancestor-owner', 'programs', 'UNKNOWN', null, false],
      ['ancestor-writer', 'programs', null, 2, false],
      ['container-owner', 'code', 'UNKNOWN', null, false],
      ['container-create-child', 'code', null, 4, false],
      ['releases-generic-write', 'releases', null, 1073741824, false],
      ['releases-inherited-write', 'releases', null, 2, true],
    ]) {
      x = basic(name);
      Object.assign(x.c, { denyPath: x[where], owner, rights, inherit });
    }
    x = basic('container-read-only', 'NEW_VERSION', true);
    Object.assign(x.c, { denyPath: x.code, rights: 1179817 });
    x = basic('target-parent-mismatch');
    x.c.root = path.join(x.code, leaf);
    x = basic('first-install', 'PREFLIGHT', true);
    moveOwned(x.code, path.join(x.base, 'retained-code'));
    basic('first-existing-refuses', 'PREFLIGHT', false);
    x = basic('first-ancestor-writer', 'PREFLIGHT', false);
    Object.assign(x.c, { denyPath: x.programs, rights: 2 });
    moveOwned(x.code, path.join(x.base, 'retained-code'));
    x = basic('first-ancestor-sibling-create', 'PREFLIGHT', true);
    Object.assign(x.c, { denyPath: x.programs, rights: 4 });
    moveOwned(x.code, path.join(x.base, 'retained-code'));
    for (const [name, kind, expected] of [
      ['installed', 'none', true],
      ['installed-writer', 'writer', false],
      ['installed-unknown-link', 'link', false],
      ['installed-outside-link', 'outside', false],
    ]) {
      x = basic(name, 'INSTALLED', expected);
      fs.mkdirSync(x.root);
      const catalog = {
        schema: 'codeatlas.closed-runtime-package',
        version: 1,
        files: [],
        links: [],
      };
      if (kind === 'outside') {
        catalog.links.push({ path: 'alias', target: 'inside' });
        fs.mkdirSync(path.join(x.root, 'inside'));
        fs.symlinkSync(path.dirname(x.sentinel), path.join(x.root, 'alias'), 'junction');
      }
      if (kind === 'link')
        fs.symlinkSync(path.dirname(x.sentinel), path.join(x.root, 'undeclared'), 'junction');
      if (kind === 'writer') Object.assign(x.c, { denyPath: x.root, rights: 2 });
      const bytes = Buffer.from(JSON.stringify(catalog));
      fs.writeFileSync(path.join(x.root, 'closed-runtime.json'), bytes);
      x.c.installedDigest = sha256(bytes);
    }
    function sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    }
    const snapshots = [];
    function snapshot(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) snapshot(full);
        else if (entry.name === 'old-sentinel.txt')
          snapshots.push({
            file: full,
            mtime: fs.statSync(full).mtimeMs,
            contents: fs.readFileSync(full, 'utf8'),
          });
      }
    }
    snapshot(owned);
    for (const c of cases) {
      if (c.name === 'programs-junction') c.stopAt = c.programs;
      else if (['code-junction', 'code-dangling-container'].includes(c.name))
        c.stopAt = path.join(c.programs, 'CodeAtlas');
      else if (c.name === 'releases-junction')
        c.stopAt = path.join(c.programs, 'CodeAtlas', 'releases');
      else if (c.name === 'higher-ancestor-junction') c.stopAt = path.dirname(c.programs);
      else if (c.name.startsWith('target-') && c.name !== 'target-parent-mismatch')
        c.stopAt = c.root;
    }
    const input = {
      reader: principalAclReader,
      guard: source.slice(guardFrom, guardTo),
      preflight: source.slice(start, stop),
      legacy: source.slice(legacyFrom, legacyTo),
      cases,
    };
    const inputFile = path.join(owned, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(input));
    const r = spawnSync(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(workspace, 'scripts/test-principal-coexistence.ps1'),
        '-InputFile',
        inputFile,
      ],
      {
        env: {
          ...process.env,
          PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
        },
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1000000,
        windowsHide: true,
        shell: false,
      },
    );
    fs.writeFileSync(
      path.join(owned, 'result.json'),
      JSON.stringify(
        {
          status: r.status,
          signal: r.signal,
          errorCode: r.error?.code ?? null,
          stdout: r.stdout,
          stderr: r.stderr,
        },
        null,
        2,
      ),
    );
    assert.ifError(r.error);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const report = JSON.parse(r.stdout.trim());
    assert.equal(report.cases, cases.length);
    assert.equal(report.failures, 0);
    assert.equal(report.identityQueries, 0);
    assert.equal(report.ACLWrites, 0);
    // Every preflight is read-only, including failed target occupancy cases.
    for (const saved of snapshots) {
      assert.equal(fs.readFileSync(saved.file, 'utf8'), saved.contents);
      assert.equal(fs.statSync(saved.file).mtimeMs, saved.mtime);
    }
    for (const c of cases.filter((c) => c.mode === 'NEW_VERSION' && c.expected))
      assert.equal(fs.existsSync(c.root), false);
  },
);
