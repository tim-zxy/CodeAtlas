import {
  HistoryReadBudget,
  checkedHistoryLimits,
  encodeHistoryValue,
  exact,
} from '../packages/storage/dist/analysis/activation-history-format.js';
const code = 'INVALID_PROCESS_CONFORMANCE';
const check = (v) => {
  if (!v) throw Error(code);
};
const integer = (v) => Number.isSafeInteger(v) && v > 0;
const nullable = (v) => v === null || Number.isSafeInteger(v);
export function readMixedProcessConformance(value, limits) {
  try {
    const budget = new HistoryReadBudget(checkedHistoryLimits(limits));
    budget.own(value);
    const r = budget.parse(encodeHistoryValue(value, budget));
    exact(r, [
      'kind',
      'schemaVersion',
      'mode',
      'measurementEligible',
      'status',
      'completeCleanup',
      'error',
      'collector',
      'host',
      'processes',
    ]);
    check(
      r.kind === 'MIXED_PROCESS_ACQUISITION_CONFORMANCE' &&
        r.schemaVersion === 1 &&
        r.measurementEligible === false,
    );
    check(['SHORT_DESCENDANT', 'CANCEL_DESCENDANT', 'FINAL_QUERY_FAILURE'].includes(r.mode));
    check(['COMPLETE', 'INELIGIBLE'].includes(r.status) && typeof r.completeCleanup === 'boolean');
    check(
      r.error === null ||
        /^(INJECTED_FINAL_QUERY_FAILURE|PLATFORM_FAILED_[0-9]+|DEADLINE_EXCEEDED|UNEXPECTED_PROCESS|UNEXPECTED_EXCEPTION|COLLECTOR_FAILED|PIPE_FAILED)$/.test(
          r.error,
        ),
    );
    const collector = exact(r.collector, ['pid', 'peakAtReportBytes', 'lifetimeComplete']);
    check(
      integer(collector.pid) &&
        integer(collector.peakAtReportBytes) &&
        collector.lifetimeComplete === false,
    );
    const h = exact(r.host, [
      'pid',
      'childPid',
      'childExitCode',
      'childSignal',
      'childClosed',
      'outcome',
      'childStdout',
    ]);
    check(
      integer(h.pid) &&
        nullable(h.childPid) &&
        nullable(h.childExitCode) &&
        typeof h.childClosed === 'boolean',
    );
    check(h.childSignal === null || ['SIGTERM', 'SIGKILL'].includes(h.childSignal));
    check(
      ['DONE', 'CANCELLED', 'FAILED'].includes(h.outcome) && ['DONE', ''].includes(h.childStdout),
    );
    check(
      Array.isArray(r.processes) &&
        r.processes.length <= (r.mode === 'FINAL_QUERY_FAILURE' ? 1 : 2),
    );
    const ids = new Set(),
      sequences = new Set();
    let previousCreate = 0;
    for (const p of r.processes) {
      exact(p, [
        'instance',
        'pid',
        'creationFileTime',
        'imageSha256',
        'imagePath',
        'createSequence',
        'exitSequence',
        'osExited',
        'handleReleased',
        'queryStatus',
        'finalPeakBytes',
        'peakUnits',
        'initialBreakpoint',
        'unexpectedException',
      ]);
      check(integer(p.instance) && !ids.has(p.instance));
      ids.add(p.instance);
      check(
        integer(p.pid) &&
          p.pid !== collector.pid &&
          typeof p.creationFileTime === 'string' &&
          /^[1-9][0-9]*$/.test(p.creationFileTime),
      );
      check(typeof p.imageSha256 === 'string' && /^[a-f0-9]{64}$/.test(p.imageSha256));
      check(
        typeof p.imagePath === 'string' &&
          /^[A-Za-z]:[\\\\/]/.test(p.imagePath) &&
          !p.imagePath.includes('\0'),
      );
      check(
        integer(p.createSequence) &&
          p.createSequence > previousCreate &&
          !sequences.has(p.createSequence),
      );
      previousCreate = p.createSequence;
      sequences.add(p.createSequence);
      check(
        p.exitSequence === null ||
          (integer(p.exitSequence) &&
            p.exitSequence > p.createSequence &&
            !sequences.has(p.exitSequence)),
      );
      if (p.exitSequence !== null) sequences.add(p.exitSequence);
      for (const k of ['osExited', 'handleReleased', 'initialBreakpoint', 'unexpectedException'])
        check(typeof p[k] === 'boolean');
      check(p.peakUnits === 'bytes' && ['FINAL', 'INJECTED', 'MISSING'].includes(p.queryStatus));
      check(p.finalPeakBytes === null || integer(p.finalPeakBytes));
      if (p.queryStatus === 'FINAL')
        check(integer(p.finalPeakBytes) && p.osExited && p.exitSequence !== null);
      else check(p.finalPeakBytes === null);
    }
    if (r.error === null || r.error === 'INJECTED_FINAL_QUERY_FAILURE') {
      check(r.completeCleanup && r.processes.length === (r.mode === 'FINAL_QUERY_FAILURE' ? 1 : 2));
      check(
        r.processes[0].pid === h.pid &&
          r.processes.every(
            (p) =>
              p.osExited &&
              p.handleReleased &&
              p.exitSequence !== null &&
              p.initialBreakpoint &&
              !p.unexpectedException,
          ),
      );
      if (r.mode === 'FINAL_QUERY_FAILURE') {
        check(
          r.error === 'INJECTED_FINAL_QUERY_FAILURE' &&
            r.status === 'INELIGIBLE' &&
            r.processes[0].queryStatus === 'INJECTED' &&
            h.childPid === null &&
            h.outcome === 'DONE',
        );
      } else {
        check(
          h.childPid === r.processes[1].pid &&
            h.childPid !== h.pid &&
            h.childClosed &&
            r.processes.every((p) => p.queryStatus === 'FINAL'),
        );
        if (r.mode === 'SHORT_DESCENDANT')
          check(
            r.status === 'COMPLETE' &&
              h.outcome === 'DONE' &&
              h.childExitCode === 0 &&
              h.childSignal === null &&
              h.childStdout === 'DONE',
          );
        else
          check(
            r.status === 'INELIGIBLE' &&
              h.outcome === 'CANCELLED' &&
              ((h.childExitCode !== null && h.childExitCode !== 0) || h.childSignal !== null),
          );
      }
    } else check(r.status === 'INELIGIBLE');
    return Object.freeze({
      kind: r.kind,
      mode: r.mode,
      status: r.status,
      measurementEligible: false,
      completeCleanup: r.completeCleanup,
      processCount: r.processes.length,
    });
  } catch {
    throw Object.assign(Error(code), { code });
  }
}
