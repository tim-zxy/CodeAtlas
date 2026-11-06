// Fixed private bootstrap. Not an OS-channel, script-origin or execution authorization gate.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { loadMixedNativeHostBootstrapDescriptor } from './mixed-native-owner-context.mjs';
import { createMixedNativeHostModuleHooks } from './mixed-native-host-module-loader.mjs';
const code = 'INVALID_MIXED_NATIVE_HOST_BOOTSTRAP';
const need = (v) => {
  if (!v) throw Object.assign(Error(code), { code });
};
const exact = (v, keys) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const freeze = (v) => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
};
const envKeys = [
  'CODEATLAS_HOST_MAX_MANIFEST_BYTES',
  'CODEATLAS_HOST_MAX_ARTIFACT_BYTES',
  'CODEATLAS_HOST_MAX_TOTAL_BYTES',
  'CODEATLAS_HOST_MAX_FILES',
  'CODEATLAS_HOST_DEADLINE_EPOCH_MS',
];
function envelope(environment) {
  need(environment && typeof environment === 'object');
  const names = Object.keys(environment);
  need(!names.some((k) => ['NODE_OPTIONS', 'NODE_PATH'].includes(k.toUpperCase())));
  need(
    Object.keys(environment)
      .filter((k) => k.toUpperCase().startsWith('CODEATLAS_HOST_'))
      .sort()
      .join('|') === [...envKeys].sort().join('|'),
  );
  const values = envKeys.map((k) => {
    const v = environment[k];
    need(
      typeof v === 'string' &&
        /^[1-9][0-9]*$/.test(v) &&
        positive(Number(v)) &&
        String(Number(v)) === v,
    );
    return Number(v);
  });
  const [maxManifestBytes, maxArtifactBytes, maxTotalBytes, maxFiles, deadlineEpochMs] = values;
  return {
    artifactLimits: { maxManifestBytes, maxArtifactBytes, maxTotalBytes, maxFiles },
    deadlineEpochMs,
  };
}
export async function prepareFixedMixedNativeHostBootstrap(argv, environment) {
  try {
    need(
      Array.isArray(argv) &&
        argv.length === 2 &&
        typeof argv[0] === 'string' &&
        path.isAbsolute(argv[0]) &&
        argv[0].endsWith('.json') &&
        typeof argv[1] === 'string' &&
        /^[a-f0-9]{64}$/.test(argv[1]),
    );
    const [manifestAbsolute, manifestSha256] = argv;
    const fixed = envelope(environment),
      live = () => need(Date.now() < fixed.deadlineEpochMs);
    live();
    const root = path.dirname(manifestAbsolute),
      manifestPath = path.basename(manifestAbsolute);
    const loaded = await loadMixedNativeHostBootstrapDescriptor(
      root,
      manifestPath,
      manifestSha256,
      fixed.artifactLimits,
    );
    live();
    const d = loaded.descriptor;
    need(
      exact(d, [
        'kind',
        'schemaVersion',
        'artifactLimits',
        'deadlineEpochMs',
        'hostEntryArtifactId',
        'hostModuleArtifactIds',
        'workspaceId',
        'repositoryId',
        'slots',
        'controlLimits',
        'edges',
      ]),
    );
    need(
      d.kind === 'MIXED_NATIVE_HOST_BOOTSTRAP_DESCRIPTOR' &&
        d.schemaVersion === 1 &&
        d.deadlineEpochMs === fixed.deadlineEpochMs,
    );
    need(
      exact(d.artifactLimits, Object.keys(fixed.artifactLimits)) &&
        Object.keys(fixed.artifactLimits).every(
          (k) => d.artifactLimits[k] === fixed.artifactLimits[k],
        ),
    );
    need(
      typeof d.workspaceId === 'string' &&
        d.workspaceId.length > 0 &&
        typeof d.repositoryId === 'string' &&
        d.repositoryId.length > 0 &&
        Array.isArray(d.slots),
    );
    need(
      exact(d.controlLimits, ['maxFrameBytes', 'maxTotalBytes', 'maxFrames']) &&
        Object.values(d.controlLimits).every(positive),
    );
    for (const slot of d.slots) {
      need(
        exact(slot, ['launchId', 'role', 'phase', 'command']) &&
          typeof slot.launchId === 'string' &&
          /^[A-Za-z0-9_-]+$/.test(slot.launchId) &&
          ['GIT', 'V2', 'SURFACE_V8'].includes(slot.role) &&
          ['SOURCE', 'ANALYSIS'].includes(slot.phase),
      );
      const c = slot.command;
      need(
        exact(c, ['executablePath', 'arguments', 'environment', 'cwd']) &&
          typeof c.executablePath === 'string' &&
          path.isAbsolute(c.executablePath) &&
          typeof c.cwd === 'string' &&
          path.isAbsolute(c.cwd) &&
          Array.isArray(c.arguments) &&
          c.arguments.every((a) => typeof a === 'string') &&
          c.environment !== null &&
          typeof c.environment === 'object' &&
          !Array.isArray(c.environment) &&
          Object.values(c.environment).every((v) => typeof v === 'string'),
      );
    }
    const hooks = createMixedNativeHostModuleHooks(
      loaded.closure,
      d.hostEntryArtifactId,
      d.edges,
      import.meta.url,
    );
    return Object.freeze({
      ownerInput: freeze({
        root,
        manifestPath,
        manifestSha256,
        artifactLimits: d.artifactLimits,
        hostEntryArtifactId: d.hostEntryArtifactId,
        hostModuleArtifactIds: d.hostModuleArtifactIds,
        workspaceId: d.workspaceId,
        repositoryId: d.repositoryId,
        slots: d.slots,
        deadlineEpochMs: d.deadlineEpochMs,
        controlLimits: d.controlLimits,
      }),
      hooks,
    });
  } catch {
    throw Object.assign(Error(code), { code });
  }
}
export async function runFixedMixedNativeHostBootstrap(argv, environment, channels) {
  need(exact(channels, ['incoming', 'outgoing']));
  const fixedChannels = Object.freeze({ incoming: channels.incoming, outgoing: channels.outgoing });
  need(fixedChannels.incoming && fixedChannels.outgoing);
  const prepared = await prepareFixedMixedNativeHostBootstrap(argv, environment);
  let registration;
  try {
    need(Date.now() < prepared.ownerInput.deadlineEpochMs);
    registration = registerHooks({ resolve: prepared.hooks.resolve, load: prepared.hooks.load });
    const entry = await import(prepared.hooks.entrySpecifier);
    need(
      typeof entry.runMixedNativeHostOperation === 'function' &&
        Date.now() < prepared.ownerInput.deadlineEpochMs,
    );
    // No injected verifier. Pinned entry retains genuine in-process Application/Storage work.
    // Its return value is data, never a publication or execution authorization assertion.
    const value = await entry.runMixedNativeHostOperation(
      Object.freeze({ ownerInput: prepared.ownerInput }),
      fixedChannels,
    );
    need(Date.now() < prepared.ownerInput.deadlineEpochMs);
    return Object.freeze({
      value,
      executionAuthorized: false,
      productionAdmission: false,
      measurementEligible: false,
      moduleClosureAuthenticated: false,
      contextAuthenticated: false,
      liveTransportConnected: false,
    });
  } finally {
    registration?.deregister();
    prepared.hooks.dispose();
  }
}
// Fixed two-argument entry only. Tests import functions and use synthetic modules/channels.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runFixedMixedNativeHostBootstrap(process.argv.slice(2), process.env, {
      incoming: process.stdin,
      outgoing: process.stdout,
    });
  } catch {
    process.exitCode = 1;
  } // No raw diagnostic payload is written into V2 control stdout.
}
