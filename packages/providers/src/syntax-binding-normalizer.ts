import normalizeSyntaxObservationCore from './syntax-normalizer-core.js';
import type { SyntaxEvidenceV2 } from '@codeatlas/ir';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
export default function normalizeBindingSyntaxObservation(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): SyntaxEvidenceV2 {
  return normalizeSyntaxObservationCore(input, context, true) as SyntaxEvidenceV2;
}
