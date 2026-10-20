import type { Phase05RunKey } from './phase05-report.js';

export type Phase05ExecutionKind =
  'NATIVE_INDEX' | 'RECORDED_PROVIDER_SQLITE' | 'DECLARED_SOURCE_NATIVE';
export type Phase05ExpectedOutcome = 'PUBLISHED' | 'PARTIAL_RETAINED' | 'CONTRACT_MATCH';
export type Phase05CasePolicy = Readonly<{
  fixtureId: string;
  scenario: Phase05RunKey['scenario'];
  completionOrderId: string | null;
  executionKind: Phase05ExecutionKind;
  expectedOutcome: Phase05ExpectedOutcome;
}>;

const entry = (
  fixtureId: string,
  scenario: Phase05RunKey['scenario'],
  executionKind: Phase05ExecutionKind = 'NATIVE_INDEX',
  expectedOutcome: Phase05ExpectedOutcome = 'PUBLISHED',
  completionOrderId: string | null = null,
): Phase05CasePolicy =>
  Object.freeze({ fixtureId, scenario, completionOrderId, executionKind, expectedOutcome });

// Fixed original case inventory, not a caller-supplied applicability registry.
export const PHASE05_CASE_POLICY: readonly Phase05CasePolicy[] = Object.freeze([
  ...(['COLD', 'INCREMENTAL_1', 'INCREMENTAL_5', 'INCREMENTAL_50'] as const).map((scenario) =>
    entry('p05-code-intelligence-evaluation-v1', scenario),
  ),
  ...[
    'java-basic-symbol',
    'java-call-basic',
    'java-overload',
    'java-inheritance',
    'java-unresolved-call',
  ].map((id) => entry(id, 'GOLDEN')),
  ...[
    'modify-call-target',
    'add-class-method-unknown-to-resolved',
    'delete-class-resolved-to-unknown',
    'delete-method-resolved-to-unknown',
    'add-method-unknown-to-resolved',
    'same-arity-overload-resolved-to-ambiguous',
    'change-import',
    'change-inheritance',
    'shared-first-owner-deletion',
    'shared-nonlast-owner-deletion',
    'shared-last-owner-deletion-zero-target',
    'duplicate-call-hints',
    'metadata-only-source-change',
    'empty-file-noop',
    'syntax-partial-retained-restart',
    'unsupported-recognized-region-retained-restart',
    'cross-file-operation-order',
    'zero-files-noop',
  ].map((id) =>
    entry(
      `p05-native-refresh-producer-v1/${id}`,
      'TRANSITION',
      id === 'metadata-only-source-change' ? 'DECLARED_SOURCE_NATIVE' : 'NATIVE_INDEX',
      id === 'syntax-partial-retained-restart' ||
        id === 'unsupported-recognized-region-retained-restart'
        ? 'PARTIAL_RETAINED'
        : 'PUBLISHED',
    ),
  ),
  entry('canonical-normalization', 'GOLDEN', 'RECORDED_PROVIDER_SQLITE', 'CONTRACT_MATCH'),
  entry('two-provider-same-call', 'PROVIDER_MERGE', 'RECORDED_PROVIDER_SQLITE', 'CONTRACT_MATCH'),
  entry(
    'p05-code-intelligence-evaluation-v1',
    'WORKER_CONSISTENCY',
    'NATIVE_INDEX',
    'PUBLISHED',
    'REQUIRED_WORKER_ORDER_1',
  ),
  entry(
    'p05-code-intelligence-evaluation-v1',
    'WORKER_CONSISTENCY',
    'NATIVE_INDEX',
    'PUBLISHED',
    'REQUIRED_WORKER_ORDER_2',
  ),
]);
