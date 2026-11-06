import test from 'node:test';
import assert from 'node:assert/strict';
import * as reader from './mixed-native-qualification-plan.mjs';

// Synthetic consistency controls only: no actual image, process or Source evidence.
const roles = ['OBSERVER', 'HOST', 'GIT', 'V2', 'V5'];
const sha = (n) => n.toString(16).padStart(64, '0');
const draft = () => ({
  kind: 'MIXED_NATIVE_QUALIFICATION_DRAFT',
  schemaVersion: 1,
  scope: 'INSTRUMENTED_ONLY',
  productionAdmission: false,
  executionAuthorized: false,
  bindings: {
    owner: sha(1),
    source: sha(2),
    oracle: sha(3),
    repository: sha(4),
    workspace: sha(5),
    environment: sha(6),
  },
  roles: roles.map((role, i) => ({ role, imageSha256: sha(i + 10) })),
  resource: {
    contractVersion: 1,
    metric: 'PROCESS_PEAK_WORKING_SET_BYTES',
    hostLogicalMetric: 'RETAINED_LOGICAL_BYTES',
    components: [...roles],
    formula: null,
    reservationBytes: null,
    hostAllowanceBytes: null,
  },
  runSpec: null,
});
const read = (v) => {
  assert.equal(typeof reader.readMixedNativeQualificationDraft, 'function');
  return reader.readMixedNativeQualificationDraft(v);
};
const image = (role) => draft().roles.find((x) => x.role === role).imageSha256;
function trace(d) {
  const row = (role, id, pid, start) => ({
    instanceId: id,
    parentInstanceId: role === 'HOST' ? null : 'host',
    pid,
    creationIdentity: 'creation-' + id,
    role,
    imageSha256: image(role),
    pipeOwnerInstanceId: role === 'HOST' ? null : 'host',
    createOrdinal: start,
    acquireOrdinal: start + 1,
    workOrdinal: start + 2,
    exitOrdinal: start + 3,
    finalQueryOrdinal: start + 4,
    releaseOrdinal: start + 5,
    pipeCloseOrdinal: role === 'HOST' ? null : start + 6,
    queryStatus: 'RECORDED',
    peakWorkingSetBytes: 1024,
  });
  const host = row('HOST', 'host', 100, 1);
  Object.assign(host, { exitOrdinal: 90, finalQueryOrdinal: 91, releaseOrdinal: 92 });
  return {
    kind: 'MIXED_NATIVE_QUALIFICATION_TRACE',
    schemaVersion: 1,
    planDigest: read(d).planDigest,
    provenance: 'OFFLINE_UNAUTHENTICATED',
    outcome: 'COMPLETE',
    processes: [
      host,
      row('GIT', 'git', 101, 10),
      row('V2', 'v2', 102, 20),
      row('V5', 'v5', 103, 30),
    ],
  };
}
const inspect = (v, d) => {
  assert.equal(typeof reader.readMixedNativeQualificationTrace, 'function');
  return reader.readMixedNativeQualificationTrace(v, d);
};
const invalid = (fn) =>
  assert.throws(fn, (e) => e.code === 'INVALID_MIXED_NATIVE_QUALIFICATION' && e.message === e.code);
const deepFrozen = (v) => {
  if (v && typeof v === 'object') {
    assert.ok(Object.isFrozen(v));
    Object.values(v).forEach(deepFrozen);
  }
};
test('private offline draft is detached frozen and never confers authority', () => {
  const d = draft(),
    v = read(d);
  assert.equal(v.status, 'OFFLINE_DRAFT_ONLY');
  assert.equal(v.measurementEligible, false);
  assert.equal(v.productionAdmission, false);
  assert.equal(v.executionAuthorized, false);
  deepFrozen(v);
  d.bindings.source = sha(99);
  assert.notEqual(v.plan.bindings.source, d.bindings.source);
});
test('role order normalizes to the same digest', () => {
  const d = draft(),
    r = read(d);
  d.roles.reverse();
  assert.equal(read(d).planDigest, r.planDigest);
});
for (const [name, change] of [
  ['production promotion', (d) => (d.productionAdmission = true)],
  ['fake execution authority', (d) => (d.executionAuthorized = true)],
  ['caller approval token', (d) => (d.approvalToken = 'SENSITIVE_SENTINEL')],
  ['arbitrary command', (d) => (d.runSpec = { command: 'anything' })],
  ['unknown role', (d) => (d.roles[2].role = 'CONHOST')],
  ['duplicate role', (d) => (d.roles[2].role = 'HOST')],
  ['missing role', (d) => d.roles.pop()],
  ['unbound oracle', (d) => (d.bindings.oracle = null)],
  ['resource aggregation default', (d) => (d.resource.formula = 'SUM')],
  ['resource numeric installation', (d) => (d.resource.reservationBytes = 1)],
  ['logical physical substitution', (d) => (d.resource.metric = 'COMMIT_BYTES')],
  ['unknown permission field', (d) => (d.permissions = ['DEBUG_ALL'])],
])
  test('draft refuses ' + name, () => {
    const d = draft();
    change(d);
    invalid(() => read(d));
  });
test('fixed-role complete synthetic trace remains instrumented and ineligible', () => {
  const d = draft(),
    v = inspect(trace(d), d);
  assert.equal(v.status, 'OFFLINE_TRACE_CONSISTENT');
  assert.equal(v.processCount, 4);
  assert.equal(v.measurementEligible, false);
  assert.equal(v.executionAuthorized, false);
  deepFrozen(v);
});
for (const [name, change] of [
  ['different plan', (t) => (t.planDigest = sha(99))],
  ['claimed OS provenance', (t) => (t.provenance = 'OS_AUTHENTICATED')],
  ['unknown descendant', (t) => (t.processes[1].role = 'CONHOST')],
  ['changed image', (t) => (t.processes[1].imageSha256 = sha(99))],
  ['unowned parent', (t) => (t.processes[1].parentInstanceId = 'external')],
  ['double protocol pipe owner', (t) => (t.processes[1].pipeOwnerInstanceId = 'observer')],
  ['work before acquisition', (t) => (t.processes[1].workOrdinal = 10)],
  ['missing final query', (t) => (t.processes[1].finalQueryOrdinal = null)],
  ['unreleased handle', (t) => (t.processes[1].releaseOrdinal = null)],
  ['child close after host exit', (t) => (t.processes[1].pipeCloseOrdinal = 93)],
  ['same instance reused', (t) => (t.processes[2].instanceId = 'git')],
  ['PID reused while alive', (t) => (t.processes[2].pid = 100)],
  ['event ordinal reused', (t) => (t.processes[2].createOrdinal = 10)],
  [
    'failed query with fabricated peak',
    (t) => {
      t.outcome = 'FAILED';
      t.processes[1].queryStatus = 'FAILED';
    },
  ],
  [
    'failed query promoted complete',
    (t) => {
      t.processes[1].queryStatus = 'FAILED';
      t.processes[1].peakWorkingSetBytes = null;
    },
  ],
])
  test('trace refuses ' + name, () => {
    const d = draft(),
      t = trace(d);
    change(t);
    invalid(() => inspect(t, d));
  });
test('failure query may record null peak only with complete release ordering', () => {
  const d = draft(),
    t = trace(d);
  t.outcome = 'FAILED';
  t.processes[1].queryStatus = 'FAILED';
  t.processes[1].peakWorkingSetBytes = null;
  assert.equal(inspect(t, d).measurementEligible, false);
});
test('cancellation never becomes measurement eligible', () => {
  const d = draft(),
    t = trace(d);
  t.outcome = 'CANCELLED';
  assert.equal(inspect(t, d).measurementEligible, false);
});
test('changed draft binding invalidates a previously matching trace', () => {
  const d = draft(),
    t = trace(d);
  d.bindings.source = sha(99);
  invalid(() => inspect(t, d));
});
