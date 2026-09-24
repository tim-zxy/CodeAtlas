import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { classifyFile } from '../dist/classify.js';
import { walkCandidates } from '../dist/walk.js';
import { hasCode, repoPath } from './helpers.mjs';

async function inDirectory(run) {
  const root = await mkdtemp(join(tmpdir(), 'codeatlas-source-walk-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('walks regular files in canonical ordinal order without following links', async () =>
  inDirectory(async (root) => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'z.java'), 'class Z {}');
    await writeFile(join(root, 'src', 'A.java'), 'class A {}');
    await writeFile(join(root, 'src', 'B.java'), 'class B {}');
    try {
      await symlink(join(root, 'src'), join(root, 'alias'), 'junction');
      await symlink(join(root, 'z.java'), join(root, 'link.java'), 'file');
    } catch (error) {
      if (error.code !== 'EPERM') throw error;
    }
    const paths = [];
    for await (const file of walkCandidates(root, () => true)) paths.push(file.path);
    assert.deepEqual(paths, ['src/A.java', 'src/B.java', 'z.java']);
  }));

test('prunes directories before reading their contents', async () =>
  inDirectory(async (root) => {
    await mkdir(join(root, 'skip'));
    await writeFile(join(root, 'skip', 'hidden.java'), 'class Hidden {}');
    await writeFile(join(root, 'visible.java'), 'class Visible {}');
    const paths = [];
    for await (const file of walkCandidates(root, (directory) => directory !== 'skip')) {
      paths.push(file.path);
    }
    assert.deepEqual(paths, ['visible.java']);
  }));

test('a file removed between directory listing and inspection fails the scan', async () =>
  inDirectory(async (root) => {
    await mkdir(join(root, 'a'));
    await writeFile(join(root, 'b.java'), 'class B {}');
    const collect = async () => {
      for await (const _ of walkCandidates(root, async (directory) => {
        if (directory === 'a') await rm(join(root, 'b.java'));
        return false;
      })) {
        // Exhaust the candidate stream to observe the error.
      }
    };
    await assert.rejects(collect(), hasCode('SOURCE_CHANGED'));
  }));

test('classifies role, provenance and content independently', async () =>
  inDirectory(async (root) => {
    const java = join(root, 'Generated.java');
    await writeFile(java, 'class Generated {}');
    assert.deepEqual(await classifyFile(java, repoPath('src/test/java/Generated.java')), {
      languageHint: 'java',
      classification: { role: 'TEST', provenance: 'AUTHORED', contentKind: 'TEXT' },
    });
    assert.deepEqual(await classifyFile(java, repoPath('build/generated/test/Generated.java')), {
      languageHint: 'java',
      classification: { role: 'TEST', provenance: 'GENERATED', contentKind: 'TEXT' },
    });
    assert.deepEqual(await classifyFile(java, repoPath('vendor/generated/Generated.java')), {
      languageHint: 'java',
      classification: { role: 'SOURCE', provenance: 'VENDOR', contentKind: 'TEXT' },
    });
  }));

test('identifies binary NUL and invalid UTF-8 samples without returning contents', async () =>
  inDirectory(async (root) => {
    const binary = join(root, 'blob.bin');
    const invalid = join(root, 'invalid.txt');
    await writeFile(binary, Buffer.from([0, 1, 2, 3]));
    await writeFile(invalid, Buffer.from([0xff, 0xfe]));
    assert.deepEqual(await classifyFile(binary, repoPath('assets/blob.bin')), {
      languageHint: null,
      classification: { role: 'OTHER', provenance: 'AUTHORED', contentKind: 'BINARY' },
    });
    assert.equal(
      (await classifyFile(invalid, repoPath('docs/invalid.txt'))).classification.contentKind,
      'BINARY',
    );
  }));

test('a file removed before classification is not accepted as success', async () =>
  inDirectory(async (root) => {
    const file = join(root, 'gone.java');
    await writeFile(file, 'class Gone {}');
    await rm(file);
    await assert.rejects(classifyFile(file, repoPath('gone.java')), hasCode('SOURCE_CHANGED'));
  }));
