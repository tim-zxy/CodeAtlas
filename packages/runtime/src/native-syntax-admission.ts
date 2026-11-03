import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { types, isDeepStrictEqual } from 'node:util';
import {
  NativeClientError,
  NativeStateValidationError,
  observeNativeSyntax,
  parseSyntaxObservationRequest,
  type NativeClientOptions,
} from '@codeatlas/providers';
import { nativeMetadataEnvironment } from './native-metadata-admission.js';
import { nativeSyntaxObservationProfiles } from './native-metadata-profiles.js';
import { nativeSyntaxObservationCorpus } from './syntax-observation-corpus.js';
import { matchSyntaxObservationProfile } from './syntax-observation-profile.js';
export interface PreparedSyntaxObservation {
  readonly request: unknown;
  readonly capturedContext: unknown;
  readonly options: NativeClientOptions;
}
export interface AdmittedSyntaxObservationInput {
  readonly memoryBudgetBytes: number;
  readonly maxItems: number;
  readonly executablePath: string;
  readonly prepare: () => Promise<PreparedSyntaxObservation>;
}
function unavailable(): never {
  throw new NativeStateValidationError(
    'RESOURCE_LIMIT_EXCEEDED',
    'No admissible reviewed Syntax observation profile',
  );
}
async function capture(executablePath: string) {
  const host = nativeMetadataEnvironment();
  const file = await open(executablePath, 'r');
  let nativeBinaryDigest: string;
  try {
    const before = await file.stat();
    if (!before.isFile()) unavailable();
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) unavailable();
    nativeBinaryDigest = hash.digest('hex');
  } finally {
    await file.close();
  }
  const lock = await readFile(new URL('../../../Cargo.lock', import.meta.url));
  const toolchain = await readFile(
    new URL('../../../rust-toolchain.toml', import.meta.url),
    'utf8',
  );
  const rustToolchain = /^channel\s*=\s*"([^"\r\n]+)"\s*$/m.exec(toolchain)?.[1];
  if (!rustToolchain) unavailable();
  // First qualification target is Windows x64 under ADR020; other targets stay unregistered.
  if (process.platform !== 'win32' || process.arch !== 'x64') unavailable();
  return Object.freeze({
    ...host,
    corpusRevision: nativeSyntaxObservationCorpus.revision,
    nativeBinaryDigest,
    rustTarget: 'x86_64-pc-windows-msvc',
    rustToolchain,
    cargoLockDigest: createHash('sha256').update(lock).digest('hex'),
    javaGrammarVersion: '0.23.5',
    pythonGrammarVersion: '0.25.0',
    treeSitterVersion: '0.27.0',
    extractorVersion: 'syntax-v1',
    compatibilityVersion: 'syntax-v1',
  });
}
/** Trusted Runtime composition. No caller profile/test bypass; catalog is intentionally empty. */
export async function observeAdmittedNativeSyntax(input: AdmittedSyntaxObservationInput) {
  if (!input || typeof input !== 'object' || types.isProxy(input))
    throw new NativeClientError('INVALID_CONFIGURATION', 'Invalid Syntax admission input');
  const fields = Object.getOwnPropertyDescriptors(input);
  if (
    Object.keys(fields).length !== 4 ||
    !['memoryBudgetBytes', 'maxItems', 'executablePath', 'prepare'].every((k) =>
      Object.hasOwn(fields, k),
    ) ||
    !fields.memoryBudgetBytes ||
    !Object.hasOwn(fields.memoryBudgetBytes, 'value') ||
    !fields.maxItems ||
    !Object.hasOwn(fields.maxItems, 'value') ||
    !fields.executablePath ||
    !Object.hasOwn(fields.executablePath, 'value')
  )
    throw new NativeClientError('INVALID_CONFIGURATION', 'Invalid Syntax admission input');
  const budget = input.memoryBudgetBytes,
    executablePath = input.executablePath;
  if (
    !Number.isSafeInteger(budget) ||
    budget <= 0 ||
    !Number.isSafeInteger(input.maxItems) ||
    input.maxItems <= 0 ||
    typeof executablePath !== 'string' ||
    !isAbsolute(executablePath) ||
    executablePath.includes('\0')
  )
    throw new NativeClientError('INVALID_CONFIGURATION', 'Invalid Syntax admission input');
  // Do not inspect request, lazy factory/getter, Source, binary or environment for an absent profile.
  if (nativeSyntaxObservationProfiles.length === 0) unavailable();
  try {
    const identity = await capture(executablePath);
    let admitted = false;
    for (const p of nativeSyntaxObservationProfiles) {
      try {
        matchSyntaxObservationProfile(p, identity, nativeSyntaxObservationCorpus, budget);
        admitted = true;
        break;
      } catch {}
    }
    if (!admitted) unavailable();
    const prepare = input.prepare;
    if (typeof prepare !== 'function')
      throw new NativeClientError('INVALID_CONFIGURATION', 'Invalid Syntax preparation');
    const prepared = await prepare();
    if (!prepared || prepared.options.executablePath !== executablePath)
      throw new NativeClientError(
        'INVALID_CONFIGURATION',
        'Syntax executable differs from admitted executable',
      );
    const request = validateSyntaxOperationBudget(prepared.request, input.maxItems);
    if (!isDeepStrictEqual(identity, await capture(executablePath))) unavailable();
    return await observeNativeSyntax(request, {
      capturedContext: prepared.capturedContext,
      options: prepared.options,
    });
  } catch (error) {
    if (error instanceof NativeClientError || error instanceof NativeStateValidationError)
      throw error;
    unavailable();
  }
}

/** Structural operation-budget check only; the Runtime catalog gate remains mandatory. */
export function validateSyntaxOperationBudget(
  requestValue: unknown,
  maxItems: number,
): ReturnType<typeof parseSyntaxObservationRequest> {
  if (!Number.isSafeInteger(maxItems) || maxItems <= 0)
    throw new NativeClientError('INVALID_CONFIGURATION', 'Invalid trusted Syntax traversal budget');
  const request = parseSyntaxObservationRequest(requestValue);
  if (request.payload.resourceBudget.maxItems > maxItems)
    throw new NativeStateValidationError(
      'RESOURCE_LIMIT_EXCEEDED',
      'Syntax traversal allowance exceeds operation budget',
    );
  return request;
}
