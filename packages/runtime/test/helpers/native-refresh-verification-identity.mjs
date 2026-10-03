import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { verificationCorpusRevision } from './native-refresh-verification-corpus.mjs';

// Test/offline evidence identity only. Runtime never reads these files.
export async function verificationCorpusIdentity() {
  const files = [
    '../../../../fixtures/ipc/refresh-v3/verification-memory-cases.json',
    './native-refresh-verification-identity.mjs',
    './native-refresh-verification-corpus.mjs',
    './native-refresh-verification-worker.mjs',
    '../../../providers/test/helpers/native-full-v3-corpus.mjs',
    '../../../providers/test/helpers/native-refresh-v3-corpus.mjs',
  ];
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file + '\0');
    hash.update(await readFile(new URL(file, import.meta.url)));
  }
  return { revision: verificationCorpusRevision, digest: hash.digest('hex') };
}
