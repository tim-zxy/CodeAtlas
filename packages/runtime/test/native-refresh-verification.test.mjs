import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as runtime from '../dist/index.js';
import { nativeMetadataEnvironment } from '../dist/native-metadata-admission.js';
import { nativeMetadataProfiles } from '../dist/native-metadata-profiles.js';

// Missing implementation yields an assertion about the required boundary, not an import crash.
const api = await import('../dist/native-refresh-verification.js').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});

for (const budget of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  test(`trusted scalar ${String(budget)} refuses before opener`, async () => {
    assert.equal(typeof api.verifyNativeRefreshObservation, 'function');
    let opened = 0;
    await assert.rejects(
      api.verifyNativeRefreshObservation(budget, () => {
        opened++;
        throw Error('must not prepare');
      }),
      (e) => e.code === 'INVALID_CONFIGURATION',
    );
    assert.equal(opened, 0);
  });

async function isolated(t, fullOnly) {
  const directory = await mkdtemp(join(tmpdir(), 'codeatlas-refresh-preflight-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'packages', 'runtime');
  await mkdir(root, { recursive: true });
  await cp(new URL('../dist', import.meta.url), join(root, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), join(root, 'package.json'));
  for (const name of ['providers', 'storage'])
    await symlink(
      fileURLToPath(new URL(`../../${name}`, import.meta.url)),
      join(directory, 'packages', name),
      'junction',
    );
  // Negative-only isolation: a current-build full profile must NOT authorize verification.
  const profiles = fullOnly
    ? [{ ...nativeMetadataProfiles[0], ...nativeMetadataEnvironment() }]
    : [];
  await writeFile(
    join(root, 'dist', 'native-metadata-profiles.js'),
    `export const nativeMetadataProfiles = Object.freeze(${JSON.stringify(profiles)});\n` +
      'export const nativeRefreshVerificationProfiles = Object.freeze([]);\n',
  );
  return import(pathToFileURL(join(root, 'dist', 'native-refresh-verification.js')).href);
}

for (const fullOnly of [false, true])
  test(
    fullOnly
      ? 'full profile cannot admit verification'
      : 'missing verification profile before preparation',
    async (t) => {
      assert.equal(typeof api.verifyNativeRefreshObservation, 'function');
      const port = await isolated(t, fullOnly);
      const calls = { opened: 0, request: 0, iterator: 0, sink: 0 };
      const input = {
        get requestBytes() {
          calls.request++;
          throw Error('must not decode');
        },
        get lines() {
          calls.iterator++;
          throw Error('must not iterate');
        },
        get sink() {
          calls.sink++;
          throw Error('must not accept');
        },
      };
      await assert.rejects(
        port.verifyNativeRefreshObservation(Number.MAX_SAFE_INTEGER, () => {
          calls.opened++;
          return input;
        }),
        (e) => e.nativeStateReason === 'RESOURCE_LIMIT_EXCEEDED',
      );
      assert.deepEqual(calls, { opened: 0, request: 0, iterator: 0, sink: 0 });
    },
  );

test('private verification boundary is not a public Runtime SPI', () => {
  assert.equal(runtime.verifyNativeRefreshObservation, undefined);
});
