// Private pure offline readers. No execution, OS acquisition or profile authority.
import { createHash } from 'node:crypto';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
const code = 'INVALID_MIXED_NATIVE_QUALIFICATION';
const check = (v) => {
  if (!v) throw Error(code);
};
const exact = (v, keys) => {
  check(v && typeof v === 'object' && !Array.isArray(v));
  check(Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)));
};
const roles = ['OBSERVER', 'HOST', 'GIT', 'V2', 'V5'];
const bindings = ['owner', 'source', 'oracle', 'repository', 'workspace', 'environment'];
const sha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v);
const freeze = (v) => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
};
const failure = () => Object.assign(Error(code), { code });
export function readMixedNativeQualificationDraft(value) {
  try {
    validateOperationPolicyData(value);
    exact(value, [
      'kind',
      'schemaVersion',
      'scope',
      'productionAdmission',
      'executionAuthorized',
      'bindings',
      'roles',
      'resource',
      'runSpec',
    ]);
    check(
      value.kind === 'MIXED_NATIVE_QUALIFICATION_DRAFT' &&
        value.schemaVersion === 1 &&
        value.scope === 'INSTRUMENTED_ONLY' &&
        value.productionAdmission === false &&
        value.executionAuthorized === false &&
        value.runSpec === null,
    );
    exact(value.bindings, bindings);
    check(bindings.every((k) => sha(value.bindings[k])));
    check(Array.isArray(value.roles) && value.roles.length === roles.length);
    const mapped = new Map();
    for (const r of value.roles) {
      exact(r, ['role', 'imageSha256']);
      check(roles.includes(r.role) && !mapped.has(r.role) && sha(r.imageSha256));
      mapped.set(r.role, r.imageSha256);
    }
    const r = value.resource;
    exact(r, [
      'contractVersion',
      'metric',
      'hostLogicalMetric',
      'components',
      'formula',
      'reservationBytes',
      'hostAllowanceBytes',
    ]);
    check(
      r.contractVersion === 1 &&
        r.metric === 'PROCESS_PEAK_WORKING_SET_BYTES' &&
        r.hostLogicalMetric === 'RETAINED_LOGICAL_BYTES' &&
        Array.isArray(r.components) &&
        JSON.stringify(r.components) === JSON.stringify(roles) &&
        r.formula === null &&
        r.reservationBytes === null &&
        r.hostAllowanceBytes === null,
    );
    const plan = {
      kind: value.kind,
      schemaVersion: 1,
      scope: 'INSTRUMENTED_ONLY',
      productionAdmission: false,
      executionAuthorized: false,
      bindings: Object.fromEntries(bindings.map((k) => [k, value.bindings[k]])),
      roles: roles.map((role) => ({ role, imageSha256: mapped.get(role) })),
      resource: {
        contractVersion: 1,
        metric: r.metric,
        hostLogicalMetric: r.hostLogicalMetric,
        components: [...roles],
        formula: null,
        reservationBytes: null,
        hostAllowanceBytes: null,
      },
      runSpec: null,
    };
    const planDigest = createHash('sha256')
      .update('codeatlas-mixed-native-offline-draft-v1\0' + JSON.stringify(plan))
      .digest('hex');
    return freeze({
      status: 'OFFLINE_DRAFT_ONLY',
      planDigest,
      plan,
      measurementEligible: false,
      productionAdmission: false,
      executionAuthorized: false,
    });
  } catch {
    throw failure();
  }
}
export function readMixedNativeQualificationTrace(value, draft) {
  try {
    const parsed = readMixedNativeQualificationDraft(draft);
    validateOperationPolicyData(value);
    exact(value, ['kind', 'schemaVersion', 'planDigest', 'provenance', 'outcome', 'processes']);
    check(
      value.kind === 'MIXED_NATIVE_QUALIFICATION_TRACE' &&
        value.schemaVersion === 1 &&
        value.planDigest === parsed.planDigest &&
        value.provenance === 'OFFLINE_UNAUTHENTICATED' &&
        ['COMPLETE', 'CANCELLED', 'FAILED'].includes(value.outcome) &&
        Array.isArray(value.processes),
    );
    const images = new Map(parsed.plan.roles.map((x) => [x.role, x.imageSha256])),
      instances = new Set(),
      osInstances = new Set(),
      ordinals = new Set();
    const events = [
      'createOrdinal',
      'acquireOrdinal',
      'workOrdinal',
      'exitOrdinal',
      'finalQueryOrdinal',
      'releaseOrdinal',
    ];
    let host = null;
    for (const p of value.processes) {
      exact(p, [
        'instanceId',
        'parentInstanceId',
        'pid',
        'creationIdentity',
        'role',
        'imageSha256',
        'pipeOwnerInstanceId',
        ...events,
        'pipeCloseOrdinal',
        'queryStatus',
        'peakWorkingSetBytes',
      ]);
      check(
        id(p.instanceId) &&
          id(p.creationIdentity) &&
          positive(p.pid) &&
          ['HOST', 'GIT', 'V2', 'V5'].includes(p.role) &&
          p.imageSha256 === images.get(p.role),
      );
      const os = String(p.pid) + ':' + p.creationIdentity;
      check(!instances.has(p.instanceId) && !osInstances.has(os));
      instances.add(p.instanceId);
      osInstances.add(os);
      let previous = 0;
      for (const e of events) {
        check(positive(p[e]) && p[e] > previous && !ordinals.has(p[e]));
        ordinals.add(p[e]);
        previous = p[e];
      }
      check(
        (p.queryStatus === 'RECORDED' && positive(p.peakWorkingSetBytes)) ||
          (p.queryStatus === 'FAILED' &&
            p.peakWorkingSetBytes === null &&
            value.outcome !== 'COMPLETE'),
      );
      if (p.role === 'HOST') {
        check(
          host === null &&
            p.parentInstanceId === null &&
            p.pipeOwnerInstanceId === null &&
            p.pipeCloseOrdinal === null,
        );
        host = p;
      } else {
        check(
          id(p.parentInstanceId) &&
            id(p.pipeOwnerInstanceId) &&
            positive(p.pipeCloseOrdinal) &&
            p.pipeCloseOrdinal > p.exitOrdinal &&
            !ordinals.has(p.pipeCloseOrdinal),
        );
        ordinals.add(p.pipeCloseOrdinal);
      }
    }
    check(host !== null);
    for (const p of value.processes) {
      if (p !== host)
        check(
          p.parentInstanceId === host.instanceId &&
            p.pipeOwnerInstanceId === host.instanceId &&
            p.createOrdinal > host.workOrdinal &&
            p.exitOrdinal < host.exitOrdinal &&
            p.pipeCloseOrdinal < host.exitOrdinal,
        );
    }
    const byPid = new Map();
    for (const p of [...value.processes].sort((a, b) => a.createOrdinal - b.createOrdinal)) {
      const prior = byPid.get(p.pid);
      check(!prior || prior.releaseOrdinal < p.createOrdinal);
      byPid.set(p.pid, p);
    }
    return freeze({
      status: 'OFFLINE_TRACE_CONSISTENT',
      planDigest: parsed.planDigest,
      outcome: value.outcome,
      processCount: value.processes.length,
      measurementEligible: false,
      productionAdmission: false,
      executionAuthorized: false,
    });
  } catch {
    throw failure();
  }
}
