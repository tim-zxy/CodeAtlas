import { runtimeStopReason } from '@codeatlas/ir';
import { authorizeRuntimeWorkflow, type RuntimeWorkflowRequest } from './refresh-runtime-facts.js';
/** Query-only port deliberately has no refresh or publication method. */
export function traceRuntime<TResult>(
  request: RuntimeWorkflowRequest,
  ports: { read(): TResult },
): TResult {
  authorizeRuntimeWorkflow(request, 'QUERY');
  const stop = runtimeStopReason(request.control);
  if (stop) throw Error(stop);
  return ports.read();
}
