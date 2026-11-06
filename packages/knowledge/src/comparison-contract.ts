import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  parseKnowledgeCandidate,
  parseKnowledgeItem,
  parseKnowledgeRevision,
  parseClaim,
  parsePhase1ReferenceContext,
  phase1Assert,
  assertRuntimeRequestControl,
  type RuntimeRequestControl,
} from '@codeatlas/ir';

export const identityPolicyRef = 'knowledge-exact-reference-v1';
export const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const setFields = new Set([
  'implementationRefs',
  'entryPointRefs',
  'responsibilityClaims',
  'componentRefs',
  'runtimeFlowRefs',
  'supportedClaimRefs',
  'participantRefs',
  'contractMatchRefs',
  'boundaryRefs',
  'participants',
  'supportRefs',
  'relationships',
  'steps',
  'nextStepKeys',
  'repositoryIds',
  'subjects',
  'existingItems',
  'intents',
  'disappearedItemIds',
  'claims',
  'candidateIds',
  'existingItemIds',
  'availableEntities',
  'availableSupports',
  'evidenceRefs',
]);
export function canonical(value: unknown, field = '', normalizeSets = true): string {
  if (Array.isArray(value)) {
    const parts = value.map((v) => canonical(v, '', normalizeSets));
    if (normalizeSets && setFields.has(field)) parts.sort(order);
    return '[' + parts.join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(object)
        .sort(order)
        .map(
          (k) => JSON.stringify(k) + ':' + canonical(object[k], k, normalizeSets && k !== 'value'),
        )
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value)!;
}
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
export class KnowledgeControlStop extends Error {}
export class KnowledgeBudget {
  used = 0;
  private readonly ancestors = new Set<object>();
  readonly control: RuntimeRequestControl;
  constructor(control: RuntimeRequestControl) {
    phase1Assert(control && typeof control === 'object' && !types.isProxy(control));
    phase1Assert(
      Object.getPrototypeOf(control) === Object.prototype ||
        Object.getPrototypeOf(control) === null,
    );
    const descriptors = Object.getOwnPropertyDescriptors(control);
    for (const key of ['maxItems', 'maxDepth', 'deadlineEpochMs', 'signal']) {
      const descriptor = descriptors[key];
      phase1Assert(descriptor && 'value' in descriptor && descriptor.enumerable);
    }
    const snapshot = {
      maxItems: descriptors.maxItems!.value,
      maxDepth: descriptors.maxDepth!.value,
      deadlineEpochMs: descriptors.deadlineEpochMs!.value,
      signal: descriptors.signal!.value,
    } as RuntimeRequestControl;
    phase1Assert(snapshot.signal && !types.isProxy(snapshot.signal));
    try {
      phase1Assert(typeof nativeAborted.call(snapshot.signal) === 'boolean');
    } catch {
      phase1Assert(false);
    }
    assertRuntimeRequestControl(snapshot);
    this.control = Object.freeze(snapshot);
  }
  tick(units = 1): void {
    if (nativeAborted.call(this.control.signal))
      throw new KnowledgeControlStop('CONTROL_CANCELLED');
    if (Date.now() >= this.control.deadlineEpochMs)
      throw new KnowledgeControlStop('CONTROL_DEADLINE');
    this.used += units;
    if (!Number.isSafeInteger(this.used) || this.used > this.control.maxItems)
      throw new KnowledgeControlStop('CONTROL_BUDGET');
  }
  data(value: unknown, depth = 0): void {
    this.tick();
    if (depth > this.control.maxDepth) throw new KnowledgeControlStop('CONTROL_DEPTH');
    if (value === null || typeof value !== 'object') {
      phase1Assert(
        value === null ||
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)),
      );
      if (typeof value === 'string') this.tick(value.length);
      return;
    }
    phase1Assert(!types.isProxy(value));
    const array = Array.isArray(value);
    phase1Assert(
      array
        ? Object.getPrototypeOf(value) === Array.prototype
        : Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null,
    );
    if (
      array &&
      Object.getOwnPropertyDescriptor(value, 'length')!.value > this.control.maxItems - this.used
    )
      throw new KnowledgeControlStop('CONTROL_BUDGET');
    phase1Assert(!this.ancestors.has(value));
    this.ancestors.add(value);
    try {
      const keys = Reflect.ownKeys(value);
      phase1Assert(keys.every((k) => typeof k === 'string'));
      if (keys.length > this.control.maxItems - this.used + (array ? 1 : 0))
        throw new KnowledgeControlStop('CONTROL_BUDGET');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (array) {
        const length = descriptors.length!.value as number;
        phase1Assert(Number.isSafeInteger(length) && length >= 0 && keys.length === length + 1);
        if (length > this.control.maxItems - this.used)
          throw new KnowledgeControlStop('CONTROL_BUDGET');
        for (let i = 0; i < length; i++) {
          const d = descriptors[String(i)];
          phase1Assert(d && 'value' in d && d.enumerable);
          this.data(d.value, depth + 1);
        }
      } else
        for (const key of keys as string[]) {
          this.tick(key.length);
          const d = descriptors[key]!;
          phase1Assert('value' in d && d.enumerable);
          this.data(d.value, depth + 1);
        }
    } finally {
      this.ancestors.delete(value);
    }
  }
}
export function record(value: unknown, fields: string[]): Record<string, unknown> {
  phase1Assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  const out = value as Record<string, unknown>;
  const actual = Object.keys(out).sort(order),
    expected = [...fields].sort(order);
  phase1Assert(actual.length === expected.length && actual.every((key, i) => key === expected[i]));
  return out;
}
export function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
type Candidate = ReturnType<typeof parseKnowledgeCandidate>['payload'];
type Revision = ReturnType<typeof parseKnowledgeRevision>['payload'];
type Item = ReturnType<typeof parseKnowledgeItem>['payload'];
type Subject = Pick<
  Candidate,
  'type' | 'scope' | 'importance' | 'structuredContent' | 'supportRefs' | 'inputSnapshotRef'
>;
export type PreparedComparison = {
  subject: Subject;
  state: string | null;
  anchors: string;
  fingerprints: { semanticFingerprint: string; presentationFingerprint: string } | null;
  storedFingerprintsValid: boolean;
  item: Item | null;
  revision: Revision | null;
  stateReason: string | null;
};
function supports(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(supports);
  if (value === null || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  const here = Array.isArray(object.supportRefs)
    ? object.supportRefs.map((s) => {
        const { basis, entity } = s as Record<string, unknown>;
        return { basis, entity };
      })
    : [];
  return [
    ...here,
    ...Object.entries(object)
      .filter(([k]) => k !== 'supportRefs')
      .flatMap(([, v]) => supports(v)),
  ];
}
function structural(subject: Subject): unknown {
  const c = subject.structuredContent;
  let content: unknown;
  switch (c.kind) {
    case 'COMPONENT':
      content = {
        implementationRefs: c.implementationRefs,
        entryPointRefs: c.entryPointRefs,
        responsibilityClaims: c.responsibilityClaims,
        relationships: c.relationships.map((r) => ({ kind: r.kind, target: r.target })),
      };
      break;
    case 'CAPABILITY':
      content = {
        componentRefs: c.componentRefs,
        entryPointRefs: c.entryPointRefs,
        runtimeFlowRefs: c.runtimeFlowRefs,
        supportedClaimRefs: c.supportedClaimRefs,
      };
      break;
    case 'INTEGRATION':
      content = {
        participantRefs: c.participantRefs,
        contractMatchRefs: c.contractMatchRefs,
        boundaryRefs: c.boundaryRefs,
      };
      break;
    case 'BUSINESS_FLOW':
      content = {
        participants: c.participants,
        runtimeFlowRefs: c.runtimeFlowRefs,
        steps: c.steps.map((s) => ({ stepKey: s.stepKey, nextStepKeys: s.nextStepKeys })),
      };
      break;
    case 'RUNTIME_FLOW_REFERENCE':
      content = { runtimeFlowRef: c.runtimeFlowRef, basisRef: c.basisRef };
      break;
  }
  const supportIdentities = [
    ...new Map(supports(subject).map((s) => [canonical(s), s])).values(),
  ].sort((a, b) => order(canonical(a), canonical(b)));
  return { type: subject.type, scope: subject.scope, content, supportIdentities };
}
function references(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(references);
  if (value === null || typeof value !== 'object') return [];
  const o = value as Record<string, unknown>;
  if ((o.scope === 'REPOSITORY' || o.scope === 'WORKSPACE') && o.entity) return [o];
  return Object.values(o).flatMap(references);
}
function stateOf(
  subject: Subject,
  binding: unknown,
  context: ReturnType<typeof parsePhase1ReferenceContext>,
  budget: KnowledgeBudget,
) {
  if (binding === null) return { state: null, reason: 'STATE_EVIDENCE_MISSING' };
  const b = record(binding, ['inputSnapshotRef', 'claims']);
  if (canonical(b.inputSnapshotRef) !== canonical(subject.inputSnapshotRef))
    return { state: null, reason: 'STATE_SNAPSHOT_MISMATCH' };
  phase1Assert(Array.isArray(b.claims));
  const refs = new Set(references(structural(subject)).map((r) => canonical(r)));
  const states = new Set<string>(),
    ids = new Set<string>();
  for (const envelope of b.claims) {
    budget.tick();
    const claim = parseClaim(envelope, context).payload;
    phase1Assert(!ids.has(claim.id));
    ids.add(claim.id);
    if (canonical(claim.scope) !== canonical(subject.scope))
      return { state: null, reason: 'STATE_SCOPE_MISMATCH' };
    if (!refs.has(canonical(claim.subject)))
      return { state: null, reason: 'STATE_SUBJECT_UNRELATED' };
    states.add(claim.stateIntent);
  }
  const c = subject.structuredContent;
  const required =
    c.kind === 'COMPONENT'
      ? c.responsibilityClaims
      : c.kind === 'CAPABILITY'
        ? c.supportedClaimRefs
        : [];
  if (required.some((r) => !ids.has(r.entity.id)))
    return { state: null, reason: 'STATE_CLAIM_MISSING' };
  return states.size === 1
    ? { state: [...states][0]!, reason: null }
    : { state: null, reason: states.size ? 'STATE_EVIDENCE_CONFLICT' : 'STATE_EVIDENCE_MISSING' };
}
function produce(subject: Subject, state: string) {
  const { title, summary, ...semantic } = subject.structuredContent as unknown as Record<
    string,
    unknown
  >;
  const presentation = {
    ...(title === undefined ? {} : { title }),
    ...(summary === undefined ? {} : { summary }),
  };
  const hash = (kind: string, value: unknown) =>
    createHash('sha256')
      .update(identityPolicyRef + '\0' + kind + '\0' + canonical(value))
      .digest('hex');
  return {
    semanticFingerprint: hash('semantic', {
      type: subject.type,
      scope: subject.scope,
      stateIntent: state,
      structuredContent: semantic,
      supportRefs: subject.supportRefs,
    }),
    presentationFingerprint: hash('presentation', presentation),
  };
}
export function prepareCandidate(value: unknown, budget: KnowledgeBudget): PreparedComparison {
  const v = record(value, ['candidateEnvelope', 'referenceContext', 'stateBinding']);
  const context = parsePhase1ReferenceContext(v.referenceContext),
    subject = parseKnowledgeCandidate(v.candidateEnvelope, context).payload;
  const state = stateOf(subject, v.stateBinding, context, budget);
  return {
    subject,
    state: state.state,
    stateReason: state.reason,
    anchors: canonical(structural(subject)),
    fingerprints: state.state ? produce(subject, state.state) : null,
    storedFingerprintsValid: true,
    item: null,
    revision: null,
  };
}
export function prepareExisting(value: unknown, budget: KnowledgeBudget): PreparedComparison {
  const v = record(value, [
    'itemEnvelope',
    'revisionEnvelope',
    'referenceContext',
    'stateBinding',
    'fingerprintPolicyRef',
  ]);
  const context = parsePhase1ReferenceContext(v.referenceContext),
    item = parseKnowledgeItem(v.itemEnvelope).payload,
    revision = parseKnowledgeRevision(v.revisionEnvelope, context).payload;
  phase1Assert(item.id === revision.itemId && item.type === revision.structuredContent.kind);
  phase1Assert(item.publishedRevisionId === null || item.publishedRevisionId === revision.id);
  const subject: Subject = {
    type: item.type,
    scope: item.scope,
    importance: item.importance,
    structuredContent: revision.structuredContent,
    supportRefs: revision.supportRefs,
    inputSnapshotRef: revision.inputSnapshotRef,
  };
  const state = stateOf(subject, v.stateBinding, context, budget),
    fingerprints = state.state ? produce(subject, state.state) : null;
  return {
    subject,
    state: state.state,
    stateReason:
      state.reason ??
      (item.lifecycleState === 'ACTIVE' ? null : 'EXISTING_LIFECYCLE_REQUIRES_REVIEW'),
    anchors: canonical(structural(subject)),
    fingerprints,
    item,
    revision,
    storedFingerprintsValid:
      item.lifecycleState === 'ACTIVE' &&
      v.fingerprintPolicyRef === identityPolicyRef &&
      item.publishedRevisionId === revision.id &&
      revision.publicationState === 'PUBLISHED' &&
      fingerprints !== null &&
      fingerprints.semanticFingerprint === revision.semanticFingerprint &&
      fingerprints.presentationFingerprint === revision.presentationFingerprint,
  };
}
/** Internal deterministic producer, not a capture/authentication or publication token. */
export function fingerprintKnowledgeComparison(value: unknown, control: RuntimeRequestControl) {
  const budget = new KnowledgeBudget(control);
  budget.data(value);
  const prepared = prepareCandidate(value, budget);
  phase1Assert(prepared.fingerprints !== null);
  const result = immutable(prepared.fingerprints);
  budget.tick();
  return result;
}
