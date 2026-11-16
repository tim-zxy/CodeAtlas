// Private process-local handoff, never permission or a persisted observation receipt.
import { types } from 'node:util';
import {
  canonicalCompilationJson,
  type CompilationInputSnapshot,
} from './compilation-input-contract.js';
import type { RuntimeRequestControl } from './index.js';

export interface OwnedFreshnessCommand {
  ruleVersion: 'owned-one-shot-freshness@1';
  workspaceId: string;
  selected: { itemId: string; revisionId: string }[];
  expectedProjection: unknown;
  snapshots: CompilationInputSnapshot[];
  basisDigest: string;
}
const commands = new WeakMap<
  object,
  { issuer: object; value: OwnedFreshnessCommand; check: () => void }
>();
export function issueOwnedFreshnessCommand(
  issuer: object,
  value: OwnedFreshnessCommand,
  check: () => void,
  c: RuntimeRequestControl,
): object {
  check();
  const saved = JSON.parse(canonicalCompilationJson(value, c)) as OwnedFreshnessCommand;
  const handle = Object.freeze({});
  commands.set(handle, { issuer, value: saved, check });
  return handle;
}
export function consumeOwnedFreshnessCommand(
  issuer: object,
  handle: object,
  c: RuntimeRequestControl,
): OwnedFreshnessCommand {
  const owner = handle && !types.isProxy(handle) ? commands.get(handle) : undefined;
  if (!owner || owner.issuer !== issuer) throw Error('FRESHNESS_HANDLE_UNAVAILABLE');
  commands.delete(handle); // failed CAS is not retryable
  owner.check();
  return JSON.parse(canonicalCompilationJson(owner.value, c)) as OwnedFreshnessCommand;
}
export function releaseOwnedFreshnessCommand(handle: object): void {
  commands.delete(handle);
}
