import normalizeSyntaxObservationCore from './syntax-normalizer-core.js';
import type { SyntaxEvidence } from '@codeatlas/ir';
import type { CodeSyntaxCompositionBudget } from './native-code-syntax-budget.js';
export { SyntaxNormalizationError } from './syntax-normalizer-core.js';
export default function normalizeSyntaxObservation(
  input: unknown,
  context: CodeSyntaxCompositionBudget,
): SyntaxEvidence {
  return normalizeSyntaxObservationCore(input, context, false) as SyntaxEvidence;
}
