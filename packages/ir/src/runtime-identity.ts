import { createHash } from 'node:crypto';
import type { FrozenContractSet } from './contract-ir.js';
import type { SupportRef } from './phase1-support.js';
export function canonicalRuntimeJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalRuntimeJson).join(',') + ']';
  if (v !== null && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map(
          (k) => JSON.stringify(k) + ':' + canonicalRuntimeJson((v as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(v)!;
}
/** Digest of already validated immutable runtime candidate inputs. */
export function runtimeCandidateDigest(value: {
  facts: unknown;
  bindings: unknown;
  coverage: unknown;
}): string {
  return createHash('sha256')
    .update(
      'runtime-candidate-v1\0' +
        JSON.stringify([
          canonicalRuntimeJson({
            facts: value.facts,
            bindings: value.bindings,
            coverage: value.coverage,
          }),
        ]),
    )
    .digest('hex');
}

export function workspaceServiceCatalogDigest(set: Pick<FrozenContractSet, 'catalog'>): string {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const hashTuple = (domain: string, tuple: unknown[]) =>
    createHash('sha256')
      .update(domain + '\0' + JSON.stringify(tuple))
      .digest('hex');
  const normalized = <T extends { supportRefs: SupportRef[] }>(r: T) => ({
    ...r,
    supportRefs: [...r.supportRefs].sort((a, b) =>
      cmp(canonicalRuntimeJson(a), canonicalRuntimeJson(b)),
    ),
  });
  const core = {
    services: [...set.catalog.services].sort((a, b) => cmp(a.id, b.id)).map(normalized),
    entries: [...set.catalog.entries].sort((a, b) => cmp(a.id, b.id)).map(normalized),
    contractBindings: [...set.catalog.contractBindings]
      .sort((a, b) => cmp(canonicalRuntimeJson(a.contractRef), canonicalRuntimeJson(b.contractRef)))
      .map(normalized),
  };
  return hashTuple('workspace-service-catalog-v1', [canonicalRuntimeJson(core)]);
}

export function workspaceRuntimeInputDigest(set: FrozenContractSet): string {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const hashTuple = (domain: string, tuple: unknown[]) =>
    createHash('sha256')
      .update(domain + '\0' + JSON.stringify(tuple))
      .digest('hex');
  return hashTuple('workspace-runtime-input-v1', [
    set.workspaceBasis.workspaceId,
    set.workspaceBasis.revisionSetId,
    [...set.repositoryBindings].sort((a, b) =>
      cmp(a.repoBasis.repositoryId, b.repoBasis.repositoryId),
    ),
    workspaceServiceCatalogDigest(set),
    hashTuple('runtime-policy-v1', ['contract-support-bound-v1']),
  ]);
}

/** Digest of already validated V2 candidate, including exact derivation and site plan. */
export function runtimeCandidateDigestV2(value: {
  facts: unknown;
  bindings: unknown;
  coverage: unknown;
  derivation: unknown;
}): string {
  return createHash('sha256')
    .update(
      'runtime-candidate-v2\0' +
        JSON.stringify([
          canonicalRuntimeJson({
            facts: value.facts,
            bindings: value.bindings,
            coverage: value.coverage,
            derivation: value.derivation,
          }),
        ]),
    )
    .digest('hex');
}

/** Digest of an already validated plan; shared by fixed Runtime and immutable Store. */
export function runtimeSitePlanDigest(value: unknown): string {
  return createHash('sha256')
    .update('runtime-site-plan-v1\0' + JSON.stringify([canonicalRuntimeJson(value)]))
    .digest('hex');
}
