import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { phase1Assert, type RuntimeRequestControl } from '@codeatlas/ir';
import {
  KnowledgeBudget,
  KnowledgeControlStop,
  record,
  order,
  immutable,
  prepareCandidate,
  prepareExisting,
  identityPolicyRef,
  canonical,
} from './comparison-contract.js';
import { resolvePreparedIdentityWithBudget, type IdentityDecision } from './identity.js';
export type ReconciliationAction = {
  candidateId: string | null;
  candidateIds: string[];
  existingItemIds: string[];
  existingRevisionRefs: { itemId: string; revisionId: string }[];
  operation: IdentityDecision['outcome'];
  retainedItemId: string | null;
  previousRevisionId: string | null;
  revisionIntent: 'NONE' | 'NEW_ITEM' | 'UPDATE_REVISION';
  supersededItemIds: string[];
  supportHealthIntent: 'AFFECTED' | null;
  reasons: string[];
  requiresReview: boolean;
};
export type ReconciliationPlan = {
  policyRef: string;
  inputDigest: string | null;
  actions: ReconciliationAction[];
  reviewRequired: boolean;
  applicability: { advancedDrift: 'DEFERRED' };
  diagnostics: string[];
};
export type ReconciliationInput = {
  subjects: unknown[];
  existingItems: unknown[];
  policyRef: string;
  intents: {
    kind: 'MERGE' | 'SPLIT' | 'CONFLICT';
    candidateIds: string[];
    existingItemIds: string[];
  }[];
  disappearedItemIds: string[];
  control: RuntimeRequestControl;
};
export function reconcileKnowledge(input: ReconciliationInput): ReconciliationPlan {
  // The original single-argument API carries an explicit cooperative control binding.
  phase1Assert(
    input &&
      typeof input === 'object' &&
      !types.isProxy(input) &&
      (Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null),
  );
  phase1Assert(Reflect.ownKeys(input).every((k) => typeof k === 'string'));
  const descriptors = Object.getOwnPropertyDescriptors(input);
  phase1Assert(
    descriptors.control && 'value' in descriptors.control && descriptors.control.enumerable,
  );
  const control = descriptors.control.value as RuntimeRequestControl;
  let policy = identityPolicyRef;
  let inputDigest: string | null = null;
  try {
    const budget = new KnowledgeBudget(control);
    const data: Record<string, PropertyDescriptor> = { ...descriptors };
    delete data.control;
    const raw: Record<string, unknown> = Object.create(null);
    for (const [k, d] of Object.entries(data)) {
      phase1Assert('value' in d && d.enumerable);
      raw[k] = d.value;
    }
    budget.data(raw);
    const v = record(raw, [
      'subjects',
      'existingItems',
      'policyRef',
      'intents',
      'disappearedItemIds',
    ]);
    phase1Assert(
      Array.isArray(v.subjects) &&
        Array.isArray(v.existingItems) &&
        Array.isArray(v.intents) &&
        Array.isArray(v.disappearedItemIds),
    );
    phase1Assert(typeof v.policyRef === 'string');
    policy = v.policyRef;
    inputDigest = createHash('sha256')
      .update('knowledge-reconciliation-input-v1\0' + canonical(raw))
      .digest('hex');
    budget.tick();
    const plan: ReconciliationPlan = {
      policyRef: policy,
      inputDigest,
      actions: [],
      reviewRequired: false,
      applicability: { advancedDrift: 'DEFERRED' },
      diagnostics: [],
    };
    if (policy !== identityPolicyRef)
      return immutable({ ...plan, reviewRequired: true, diagnostics: ['POLICY_NOT_APPROVED'] });
    const subjects = new Map<string, ReturnType<typeof prepareCandidate>>(),
      existing = new Map<string, ReturnType<typeof prepareExisting>>();
    for (const s of v.subjects) {
      budget.tick();
      const prepared = prepareCandidate(s, budget);
      const id = (
        record((s as Record<string, unknown>).candidateEnvelope, ['schema', 'version', 'payload'])
          .payload as { id: string }
      ).id;
      phase1Assert(!subjects.has(id));
      subjects.set(id, prepared);
    }
    for (const s of v.existingItems) {
      budget.tick();
      const p = prepareExisting(s, budget);
      phase1Assert(!existing.has(p.item!.id));
      existing.set(p.item!.id, p);
    }
    const usedSubjects = new Set<string>(),
      usedExisting = new Set<string>();
    const take = (xs: unknown, map: Map<string, unknown>, used: Set<string>) => {
      phase1Assert(Array.isArray(xs) && xs.length > 0 && xs.every((x) => typeof x === 'string'));
      const out = xs as string[];
      phase1Assert(new Set(out).size === out.length);
      for (const x of out) {
        phase1Assert(map.has(x) && !used.has(x));
        used.add(x);
      }
      return [...out].sort(order);
    };
    for (const intent of v.intents) {
      budget.tick();
      const i = record(intent, ['kind', 'candidateIds', 'existingItemIds']);
      phase1Assert(['MERGE', 'SPLIT', 'CONFLICT'].includes(i.kind as string));
      const cs = take(i.candidateIds, subjects, usedSubjects),
        es = take(i.existingItemIds, existing, usedExisting);
      plan.actions.push({
        candidateId: cs.length === 1 ? cs[0]! : null,
        candidateIds: cs,
        existingItemIds: es,
        existingRevisionRefs: es.map((itemId) => ({
          itemId,
          revisionId: existing.get(itemId)!.revision!.id,
        })),
        operation: i.kind === 'CONFLICT' ? 'REVIEW_REQUIRED' : (i.kind as 'MERGE' | 'SPLIT'),
        retainedItemId: null,
        previousRevisionId: null,
        revisionIntent: 'NONE',
        supersededItemIds: [],
        supportHealthIntent: null,
        reasons: [
          i.kind === 'MERGE'
            ? 'MERGE_SURVIVOR_EVIDENCE_REQUIRED'
            : i.kind === 'SPLIT'
              ? 'PHASE1_SPLIT_REQUIRES_REVIEW'
              : 'CONFLICT_TIME_AND_VALUE_PROOF_REQUIRED',
        ],
        requiresReview: true,
      });
    }
    for (const id of v.disappearedItemIds) {
      budget.tick();
      phase1Assert(typeof id === 'string' && existing.has(id) && !usedExisting.has(id));
      usedExisting.add(id);
      plan.actions.push({
        candidateId: null,
        candidateIds: [],
        existingItemIds: [id],
        existingRevisionRefs: [{ itemId: id, revisionId: existing.get(id)!.revision!.id }],
        operation: 'REVIEW_REQUIRED',
        retainedItemId: null,
        previousRevisionId: existing.get(id)!.revision!.id,
        revisionIntent: 'NONE',
        supersededItemIds: [],
        supportHealthIntent: 'AFFECTED',
        reasons: ['SUPPORT_DISAPPEARANCE_REQUIRES_REVIEW'],
        requiresReview: true,
      });
    }
    const retained = new Set<string>();
    const comparableExisting = [...existing.values()];
    for (const [id, subject] of [...subjects].sort(([a], [b]) => order(a, b))) {
      if (usedSubjects.has(id)) continue;
      budget.tick();
      const d = resolvePreparedIdentityWithBudget(subject, comparableExisting, budget);
      if (d.matchedId) {
        phase1Assert(!usedExisting.has(d.matchedId) && !retained.has(d.matchedId));
        retained.add(d.matchedId);
      }
      const comparedIds = d.matchedId
        ? [d.matchedId]
        : d.alternatives.map((a) => a.itemId).sort(order);
      plan.actions.push({
        candidateId: id,
        candidateIds: [id],
        existingItemIds: comparedIds,
        existingRevisionRefs: comparedIds.map((itemId) => ({
          itemId,
          revisionId: existing.get(itemId)!.revision!.id,
        })),
        operation: d.outcome,
        retainedItemId: d.matchedId,
        previousRevisionId: d.matchedId ? existing.get(d.matchedId)!.revision!.id : null,
        revisionIntent:
          d.outcome === 'NEW' ? 'NEW_ITEM' : d.outcome === 'UPDATE' ? 'UPDATE_REVISION' : 'NONE',
        supersededItemIds: [],
        supportHealthIntent: null,
        reasons: d.reasons,
        requiresReview: d.requiresReview,
      });
    }
    plan.actions.sort((a, b) =>
      order(
        JSON.stringify([a.candidateId, a.existingItemIds, a.operation]),
        JSON.stringify([b.candidateId, b.existingItemIds, b.operation]),
      ),
    );
    plan.reviewRequired = plan.actions.some((a) => a.requiresReview);
    const result = immutable(plan);
    budget.tick();
    return result;
  } catch (error) {
    if (error instanceof KnowledgeControlStop)
      return immutable({
        policyRef: policy,
        inputDigest,
        actions: [],
        reviewRequired: true,
        applicability: { advancedDrift: 'DEFERRED' },
        diagnostics: [error.message],
      });
    throw error;
  }
}
