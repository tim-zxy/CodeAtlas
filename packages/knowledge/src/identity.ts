import { phase1Assert, type RuntimeRequestControl } from '@codeatlas/ir';
import {
  KnowledgeBudget,
  KnowledgeControlStop,
  identityPolicyRef,
  record,
  canonical,
  order,
  immutable,
  prepareCandidate,
  prepareExisting,
  type PreparedComparison,
} from './comparison-contract.js';
export type IdentityDecision = {
  outcome:
    | 'UNCHANGED'
    | 'UPDATE'
    | 'NEW'
    | 'MERGE'
    | 'SPLIT'
    | 'CONFLICT'
    | 'DEPRECATE'
    | 'REVIEW_REQUIRED';
  matchedId: string | null;
  signalComparisons: {
    signal: string;
    candidateRefs: string[];
    existingRefs: string[];
    relation: 'EXACT' | 'DIFFERENT' | 'UNAVAILABLE';
    reasons: string[];
  }[];
  score: null;
  thresholdRef: null;
  ambiguityMarginRef: null;
  alternatives: {
    itemId: string;
    relation: 'EXACT' | 'NON_EXACT' | 'UNAVAILABLE';
    reasons: string[];
  }[];
  reasons: string[];
  requiresReview: boolean;
};
export function reviewIdentity(reason: string): IdentityDecision {
  return {
    outcome: 'REVIEW_REQUIRED',
    matchedId: null,
    signalComparisons: [],
    score: null,
    thresholdRef: null,
    ambiguityMarginRef: null,
    alternatives: [],
    reasons: [reason],
    requiresReview: true,
  };
}
export function resolveIdentityWithBudget(
  input: unknown,
  budget: KnowledgeBudget,
): IdentityDecision {
  budget.data(input);
  const v = record(input, ['candidate', 'existingItems', 'policyRef']);
  if (v.policyRef !== identityPolicyRef) return reviewIdentity('POLICY_NOT_APPROVED');
  phase1Assert(Array.isArray(v.existingItems));
  const candidate = prepareCandidate(v.candidate, budget),
    existing = v.existingItems.map((x) => prepareExisting(x, budget));
  phase1Assert(new Set(existing.map((x) => x.item!.id)).size === existing.length);
  return resolvePreparedIdentityWithBudget(candidate, existing, budget);
}

/** Package-private reuse within one validated synchronous invocation only.
 * Prepared comparisons are not external authority or a cross-request cache. */
export function resolvePreparedIdentityWithBudget(
  candidate: PreparedComparison,
  existing: PreparedComparison[],
  budget: KnowledgeBudget,
): IdentityDecision {
  if (!candidate.state) return reviewIdentity(candidate.stateReason!);
  const out = reviewIdentity('NO_EXACT_STRUCTURE'),
    exact: typeof existing = [];
  let unavailable = false;
  for (const old of existing.sort((a, b) => order(a.item!.id, b.item!.id))) {
    budget.tick();
    if (
      candidate.subject.type !== old.subject.type ||
      canonical(candidate.subject.scope) !== canonical(old.subject.scope)
    )
      continue;
    if (old.state && old.state !== candidate.state) continue;
    const valid = old.state !== null && old.storedFingerprintsValid;
    const equal = valid && candidate.anchors === old.anchors;
    out.alternatives.push({
      itemId: old.item!.id,
      relation: !valid ? 'UNAVAILABLE' : equal ? 'EXACT' : 'NON_EXACT',
      reasons: [
        !valid
          ? (old.stateReason ?? 'EXISTING_FINGERPRINT_UNVERIFIED')
          : equal
            ? 'EXACT_STRUCTURAL_REFERENCES'
            : 'STRUCTURAL_OR_REVISION_CHANGE',
      ],
    });
    out.signalComparisons.push({
      signal: 'COMPLETE_STRUCTURE',
      candidateRefs: [candidate.anchors],
      existingRefs: [old.anchors],
      relation: !valid ? 'UNAVAILABLE' : equal ? 'EXACT' : 'DIFFERENT',
      reasons: [
        !valid
          ? 'EXISTING_COMPARISON_UNAVAILABLE'
          : equal
            ? 'EXACT_STRUCTURAL_REFERENCES'
            : 'STRUCTURAL_OR_REVISION_CHANGE',
      ],
    });
    if (!valid) unavailable = true;
    else if (equal) exact.push(old);
  }
  if (unavailable) {
    out.reasons = ['EXISTING_COMPARISON_UNAVAILABLE'];
    return immutable(out);
  }
  if (exact.length > 1) {
    out.reasons = ['AMBIGUOUS_EXACT_IDENTITIES'];
    return immutable(out);
  }
  if (exact.length === 1) {
    const old = exact[0]!;
    out.matchedId = old.item!.id;
    const unchanged =
      candidate.fingerprints!.semanticFingerprint === old.fingerprints!.semanticFingerprint;
    out.outcome = unchanged ? 'UNCHANGED' : 'UPDATE';
    out.requiresReview = !unchanged || old.item!.sourceFreshness !== 'FRESH';
    out.reasons = [unchanged ? 'SAME_SEMANTIC_FINGERPRINT' : 'SAME_IDENTITY_SEMANTIC_CHANGE'];
  } else if (out.alternatives.length) {
    out.reasons = ['STRUCTURAL_OR_REVISION_REVIEW_REQUIRED'];
  } else {
    out.outcome = 'NEW';
    out.reasons = ['NO_EXISTING_IDENTITY_IN_TYPE_SCOPE_STATE'];
  }
  return immutable(out);
}
/** Pure structural decision. Application capture, quality and manual publication remain separate. */
export function resolveKnowledgeIdentity(
  input: unknown,
  control: RuntimeRequestControl,
): IdentityDecision {
  try {
    const budget = new KnowledgeBudget(control);
    const result = resolveIdentityWithBudget(input, budget);
    budget.tick();
    return result;
  } catch (error) {
    if (error instanceof KnowledgeControlStop) return immutable(reviewIdentity(error.message));
    throw error;
  }
}
