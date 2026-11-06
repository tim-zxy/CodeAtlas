// Pure hooks only: no registration, HOST launch, filesystem fallback or authentication claim.
import { randomUUID } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { readMixedNativeHostModuleClosure } from './mixed-native-owner-context.mjs';
const code = 'INVALID_MIXED_NATIVE_HOST_MODULE_CLOSURE';
const check = (value) => {
  if (!value) throw Object.assign(Error(code), { code });
};
export function createMixedNativeHostModuleHooks(
  closure,
  entryArtifactId,
  edges,
  bootstrapParentURL,
) {
  const snapshot = readMixedNativeHostModuleClosure(closure),
    modules = new Map(snapshot.modules.map((m) => [m.id, m])),
    namespace = randomUUID(),
    urls = new Map(
      [...modules].map(([id, module]) => [id, module.fileURL + '?codeatlas-host=' + namespace]),
    ),
    sources = new Map([...modules].map(([id, m]) => [urls.get(id), m.source])),
    bindings = new Map(),
    builtins = new Set();
  check(
    modules.has(entryArtifactId) && Array.isArray(edges) && edges.length <= snapshot.maxPlanBytes,
  );
  let planBytes = 2;
  for (const edge of edges) {
    check(
      edge &&
        typeof edge === 'object' &&
        Object.keys(edge).sort().join('|') === 'from|specifier|to',
    );
    check(
      ['from', 'specifier', 'to'].every(
        (k) =>
          typeof edge[k] === 'string' &&
          edge[k].length > 0 &&
          edge[k].length <= snapshot.maxPlanBytes &&
          Object.getOwnPropertyDescriptor(edge, k)?.get === undefined,
      ),
    );
    planBytes += Buffer.byteLength(JSON.stringify(edge), 'utf8') + 1;
    check(planBytes <= snapshot.maxPlanBytes && modules.has(edge.from));
    check(
      !/[\x00-\x20?#%\\]/.test(edge.specifier) && !/^(?:file|https?|data):/.test(edge.specifier),
    );
    const builtin = edge.to.startsWith('node:');
    check(builtin ? isBuiltin(edge.to) && edge.specifier === edge.to : modules.has(edge.to));
    const key = urls.get(edge.from) + '\0' + edge.specifier;
    check(!bindings.has(key));
    bindings.set(key, builtin ? edge.to : urls.get(edge.to));
    if (builtin) builtins.add(edge.to);
  }
  const reachable = new Set([urls.get(entryArtifactId)]);
  for (let previous = -1; previous !== reachable.size;) {
    previous = reachable.size;
    for (const [key, target] of bindings)
      if (reachable.has(key.split('\0')[0]) && sources.has(target)) reachable.add(target);
  }
  check(reachable.size === modules.size);
  if (bootstrapParentURL !== undefined) {
    const parent = new URL(bootstrapParentURL);
    check(
      parent.protocol === 'file:' &&
        !parent.search &&
        !parent.hash &&
        parent.href === bootstrapParentURL,
    );
  }
  let disposed = false,
    failed = false,
    entryClaimed = false;
  const guard = () => check(!disposed && !failed);
  const protect = (operation) => {
    try {
      guard();
      return operation();
    } catch (error) {
      failed = true;
      throw error;
    }
  };
  const entrySpecifier = urls.get(entryArtifactId);
  return Object.freeze({
    entrySpecifier,
    resolve(specifier, context) {
      return protect(() => {
        const parent = context?.parentURL;
        const initial =
          !entryClaimed && specifier === entrySpecifier && parent === bootstrapParentURL;
        const target = initial ? entrySpecifier : bindings.get(parent + '\0' + specifier);
        if (initial) entryClaimed = true;
        check(target !== undefined);
        return { url: target, shortCircuit: true };
      });
    },
    load(url, context) {
      return protect(() => {
        if (builtins.has(url)) {
          check(context?.format === undefined || context.format === 'builtin');
          return { format: 'builtin', shortCircuit: true };
        }
        check(sources.has(url) && (context?.format === undefined || context.format === 'module'));
        return { format: 'module', source: sources.get(url), shortCircuit: true };
      });
    },
    dispose() {
      disposed = true;
    },
    status() {
      return Object.freeze({
        status: disposed ? 'CLOSED' : failed ? 'FAILED' : 'OFFLINE_CLOSED_HOOKS',
        executionAuthorized: false,
        productionAdmission: false,
        measurementEligible: false,
        moduleClosureAuthenticated: false,
        contextAuthenticated: false,
        liveTransportConnected: false,
      });
    },
  });
}
