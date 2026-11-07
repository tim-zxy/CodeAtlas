import { types } from 'node:util';
import { verifyCompilationSource } from '../../application/dist/compilation-source.js';
import type { CompilationCaptureRequest } from '../../application/dist/compilation-input-contract.js';
import type {
  createOwnedCompilationInputPorts,
  OwnedRepositoryCompilationFrame,
} from './compilation-input.js';

export class CompilationSourceVerifierError extends Error {
  readonly code = 'SOURCE_CONTEXT_UNAVAILABLE';
  constructor() {
    super('SOURCE_CONTEXT_UNAVAILABLE');
    this.name = 'CompilationSourceVerifierError';
  }
}
function check(value: unknown): asserts value {
  if (!value) throw new CompilationSourceVerifierError();
}
/** Private binding only: the caller retains Source context lifetime. This never
 * prepares Source, reconciles state, grants access, or releases the context. */
export function createCompilationSourceVerifier(options: {
  sources: ReadonlyMap<string, object>;
  ownedInputs: Pick<
    ReturnType<typeof createOwnedCompilationInputPorts>,
    'repositorySourceIdentity'
  >;
}) {
  check(options.sources instanceof Map && !types.isProxy(options.sources));
  const sources = new Map<string, object>();
  for (const [repositoryId, handle] of options.sources) {
    check(typeof repositoryId === 'string' && repositoryId.length > 0);
    check(handle !== null && typeof handle === 'object' && !types.isProxy(handle));
    sources.set(repositoryId, handle);
  }
  check(options.ownedInputs && !types.isProxy(options.ownedInputs));
  const descriptor = Object.getOwnPropertyDescriptor(
    options.ownedInputs,
    'repositorySourceIdentity',
  );
  check(descriptor && Object.hasOwn(descriptor, 'value'));
  const readIdentity: unknown = descriptor.value;
  check(
    typeof readIdentity === 'function' &&
      !types.isProxy(readIdentity) &&
      !types.isAsyncFunction(readIdentity),
  );
  const owner = options.ownedInputs;
  return Object.freeze({
    async verifySource(
      frame: Pick<OwnedRepositoryCompilationFrame, 'handle'>,
      request: Pick<CompilationCaptureRequest, 'workspaceId'>,
    ): Promise<void> {
      const identity = Reflect.apply(readIdentity, owner, [frame]) as ReturnType<
        typeof owner.repositorySourceIdentity
      >;
      if (types.isPromise(identity)) {
        void Promise.prototype.then.call(identity, undefined, () => undefined);
        throw new CompilationSourceVerifierError();
      }
      check(identity && typeof identity === 'object' && !types.isProxy(identity));
      const handle = sources.get(identity.repoBasis.repositoryId);
      check(handle);
      await verifyCompilationSource(handle, identity, request.workspaceId);
    },
  });
}
