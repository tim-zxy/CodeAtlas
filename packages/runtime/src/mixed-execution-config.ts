import { EffectiveConfigError, type EffectiveConfig } from './effective-config.js';
import {
  NATIVE_CLIENT_HARD_LIMITS,
  type NativeClientLimits,
} from '../../providers/dist/native-client.js';
import { freezeComposition } from '../../providers/dist/native-composition-input.js';
import {
  exact,
  array,
  text,
  checkedHistoryLimits,
} from '../../storage/dist/analysis/activation-history-format.js';
export function resolveMixedExecutionConfig(config: EffectiveConfig) {
  try {
    const matches = config.providers.filter((p) => p.providerId === 'native' && p.enabled);
    if (matches.length !== 1 || matches[0]!.configurationSchemaVersion !== 2)
      throw new EffectiveConfigError();
    const c = exact(matches[0]!.configuration, ['kind', 'source', 'history', 'native']);
    if (c.kind !== 'MIXED_CODE_SYNTAX_V1') throw new EffectiveConfigError();
    const s = exact(c.source, ['include', 'exclude']),
      h = exact(c.history, ['maxRows', 'maxSerializedBytes']);
    const native = exact(c.native, ['maxEvents', 'transportLimits']);
    const limits = exact(native.transportLimits, Object.keys(NATIVE_CLIENT_HARD_LIMITS));
    const positive = (n: unknown): number => {
      if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0)
        throw new EffectiveConfigError();
      return n;
    };
    const transport = Object.fromEntries(
      Object.entries(limits).map(([k, v]) => {
        const n = positive(v);
        if (n > NATIVE_CLIENT_HARD_LIMITS[k as keyof NativeClientLimits])
          throw new EffectiveConfigError();
        return [k, n];
      }),
    ) as unknown as NativeClientLimits;
    const maxEvents = positive(native.maxEvents);
    if (maxEvents > NATIVE_CLIENT_HARD_LIMITS.maxEvents || transport.maxEvents > maxEvents)
      throw new EffectiveConfigError();
    const cap = exact(config.indexing.resourceBudget, [
      'maxInputBytes',
      'maxOutputBytes',
      'maxItems',
      'maxDepth',
      'maxDurationMs',
      'maxMemoryBytes',
    ]);
    for (const v of Object.values(cap)) positive(v);
    const operationBudget = { ...config.indexing.resourceBudget };
    if (
      transport.maxStdinBytes > operationBudget.maxInputBytes ||
      transport.maxStdoutBytes > operationBudget.maxOutputBytes
    )
      throw new EffectiveConfigError();
    const history = checkedHistoryLimits({
      maxRows: positive(h.maxRows),
      maxSerializedBytes: positive(h.maxSerializedBytes),
      maxItems: operationBudget.maxItems,
      maxDepth: operationBudget.maxDepth,
      memoryBudgetBytes: operationBudget.maxMemoryBytes,
    });
    return freezeComposition({
      source: {
        include: Array.from(array(s.include), text),
        exclude: Array.from(array(s.exclude), text),
      },
      history,
      operationBudget,
      native: { maxEvents, transportLimits: transport },
    });
  } catch {
    throw new EffectiveConfigError();
  }
}
