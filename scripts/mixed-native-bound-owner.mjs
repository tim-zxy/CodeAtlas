// Private offline composition only: descriptor bytes and protocol consistency are not authority.
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
import { loadMixedNativeOwnerContext } from './mixed-native-owner-context.mjs';
import { readMixedNativeQualificationDraft } from './mixed-native-qualification-plan.mjs';
import { createMixedNativeControlCodec } from './mixed-native-control-codec.mjs';
import { createMixedNativeControlExchange } from './mixed-native-control-exchange.mjs';
import { createMixedNativeLaunchSession } from './mixed-native-launch-handshake.mjs';
const code = 'INVALID_MIXED_NATIVE_BOUND_OWNER';
const bad = () => Object.assign(Error(code), { code });
const check = (condition) => {
  if (!condition) throw bad();
};
const exact = (value, keys) => {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
  );
};

export async function bindMixedNativeOwner(request, incoming, outgoing) {
  let channel;
  try {
    validateOperationPolicyData(request);
    exact(request, [
      'root',
      'manifestPath',
      'manifestSha256',
      'artifactLimits',
      'draft',
      'environmentArtifactId',
      'launchBindings',
      'controlLimits',
    ]);
    // Detach all caller data before the loader's first filesystem await.
    const input = structuredClone(request);
    check(
      typeof input.environmentArtifactId === 'string' &&
        /^[A-Za-z0-9_-]+$/.test(input.environmentArtifactId),
    );
    const draft = readMixedNativeQualificationDraft(input.draft);
    // Validate explicit control caps without claiming any supplied stream.
    createMixedNativeControlCodec('0'.repeat(64), input.controlLimits).stop();
    const images = new Map(draft.plan.roles.map((r) => [r.role, r.imageSha256]));
    check(Array.isArray(input.launchBindings));
    for (const binding of input.launchBindings) {
      exact(binding, ['launchId', 'role', 'commandSha256', 'imageSha256']);
      check(
        ['GIT', 'V2', 'V5'].includes(binding.role) &&
          binding.imageSha256 === images.get(binding.role),
      );
    }
    // The session validates fixed IDs/digests/order before any stream takeover.
    const session = createMixedNativeLaunchSession(input.launchBindings, (message, signal) =>
      channel.exchange(message, signal),
    );
    const context = await loadMixedNativeOwnerContext(
      input.root,
      input.manifestPath,
      input.manifestSha256,
      input.artifactLimits,
    );
    const artifacts = new Map(context.artifacts.map((a) => [a.id, a]));
    const digest = (id) => {
      const artifact = artifacts.get(id);
      check(artifact);
      return artifact.sha256;
    };
    for (const key of ['owner', 'source', 'oracle', 'repository', 'workspace'])
      check(draft.plan.bindings[key] === digest(context.bindings[key]));
    // Existing owner manifests bind one Native artifact, shared by V2 and V5.
    for (const [role, key] of [
      ['OBSERVER', 'observer'],
      ['HOST', 'host'],
      ['GIT', 'git'],
      ['V2', 'native'],
      ['V5', 'native'],
    ])
      check(images.get(role) === digest(context.bindings[key]));
    // Explicit file-byte binding only: no interpretation or authentication of a live environment.
    check(draft.plan.bindings.environment === digest(input.environmentArtifactId));
    channel = createMixedNativeControlExchange(
      incoming,
      outgoing,
      context.contextSha256,
      input.controlLimits,
    );
    let disposed = false;
    return Object.freeze({
      take(role) {
        try {
          check(!disposed && channel.status().status === 'OPEN');
          return session.take(role);
        } catch {
          channel.dispose();
          throw bad();
        }
      },
      status() {
        const launch = session.status();
        const control = channel.status();
        return Object.freeze({
          status: disposed
            ? 'CLOSED'
            : launch.status === 'FAILED' || control.status !== 'OPEN'
              ? 'FAILED'
              : 'OFFLINE_BOUND',
          contextSha256: context.contextSha256,
          planDigest: draft.planDigest,
          manifestSha256: context.manifestSha256,
          environmentArtifactId: input.environmentArtifactId,
          environmentSha256: draft.plan.bindings.environment,
          launchStatus: launch.status,
          controlStatus: control.status,
          consumed: launch.consumed,
          remaining: launch.remaining,
          databaseStateVerified: false,
          sourceHistoryAuthenticated: false,
          toolImagesAuthenticated: false,
          environmentAuthenticated: false,
          executionAuthorized: false,
          productionAdmission: false,
          measurementEligible: false,
        });
      },
      dispose() {
        disposed = true;
        channel.dispose();
      },
    });
  } catch {
    channel?.dispose();
    throw bad();
  }
}
