import type { RuntimeRequestControl } from '@codeatlas/ir';
import { canonicalCompilationJson } from '../../../ir/dist/compilation-input-contract.js';
import {
  parseOfflinePublicationCommand,
  type OfflinePublicationCommand,
} from '../../../ir/dist/offline-publication-contract.js';

/** Private self-owned provenance; neither coverage nor this receipt grants quality admission. */
export function schema11PublicationReceipt(input: unknown, control: RuntimeRequestControl) {
  const command = parseOfflinePublicationCommand(input, control);
  const request = command.request;
  return {
    schema: 'codeatlas.schema11-publication-provenance' as const,
    version: 1 as const,
    workspaceId: request.workspaceId,
    runId: request.runId,
    snapshotId: request.snapshot.snapshotId,
    revisionSetId: request.snapshot.revisionSetId,
    evaluationId: request.evaluation.evaluationId,
    inputDigest: request.snapshot.inputDigest,
    candidateSetDigest: request.evaluation.candidateDigest,
    // Retain the validated originals and explicit mapping, not a derived coverage estimate.
    command,
  };
}
export function parseSchema11PublicationReceipt(input: unknown, control: RuntimeRequestControl) {
  const json = (v: unknown) => canonicalCompilationJson(v, control);
  const value = JSON.parse(json(input));
  const expected = schema11PublicationReceipt(value.command, control);
  if (json(value) !== json(expected)) throw Error('READ11_RECEIPT_INVALID');
  return expected;
}
export function schema11PublicationHeads(command: OfflinePublicationCommand) {
  return {
    expected: Object.fromEntries(
      command.entries.map((e) => [e.record.itemEnvelope.payload.id, e.expectedHead]),
    ),
    result: Object.fromEntries(
      command.entries.map((e) => [
        e.record.itemEnvelope.payload.id,
        e.record.revisionEnvelope.payload.id,
      ]),
    ),
  };
}
