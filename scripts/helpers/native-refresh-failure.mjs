// Diagnostic-only: formatting must never replace the original operation failure.
export function refreshFailureText(error, includeStack = false) {
  try {
    const field = includeStack ? 'stack' : 'message';
    const value =
      error !== null && (typeof error === 'object' || typeof error === 'function')
        ? Object.getOwnPropertyDescriptor(error, field)?.value
        : undefined;
    return typeof value === 'string' ? value : String(error);
  } catch {
    return includeStack ? 'UNPRINTABLE_PREPARATION_FAILURE' : 'UNPRINTABLE_REFRESH_FAILURE';
  }
}
