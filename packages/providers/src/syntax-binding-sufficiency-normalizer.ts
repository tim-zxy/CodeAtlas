import normalizeSyntaxObservationCore from './syntax-normalizer-core.js';
import type { SyntaxEvidenceV3 } from '@codeatlas/ir';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
export default function normalizeBindingAwareSyntaxObservation(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): SyntaxEvidenceV3 {
  return normalizeSyntaxObservationCore(input, context, 3) as SyntaxEvidenceV3;
}
