import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { RepositoryRelativePathSchema } from '../../ir/dist/index.js';

import { SourceScanError } from '../dist/errors.js';

export const git = (cwd, args, input) =>
  execFileSync('git', ['-c', 'core.autocrlf=false', '-C', cwd, ...args], {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    },
  });

export const repoPath = (value) => RepositoryRelativePathSchema.parse(value);
export const hasCode = (code) => (error) => error instanceof SourceScanError && error.code === code;

export async function materialize(setup, baseDirectory) {
  const repo = join(baseDirectory, 'repo');
  await mkdir(repo, { recursive: true });
  git(repo, ['init', '-b', setup.branch]);
  for (const file of setup.files) {
    const target = join(repo, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, 'text' in file ? file.text : Buffer.from(file.base64, 'base64'));
  }
  if (setup.commit) {
    git(repo, ['add', '--all']);
    git(repo, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-m',
      'fixture',
    ]);
  }
  return repo;
}
