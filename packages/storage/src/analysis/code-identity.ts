import {
  CanonicalNodeSchema,
  CanonicalEdgeSchema,
  EntityIdSchema,
  ContentFingerprintSchema,
  EvidenceSchema,
  ProviderFactBindingSchema,
  FactEvidenceSchema,
  ProviderSnapshotSchema,
  ProviderCoverageStatusSchema,
  RepoBasisSchema,
  type RepoBasis,
} from '@codeatlas/ir';
import {
  HistoryReadBudget,
  HistoryCaptureError,
  exact,
  array,
  text,
  requireHistory,
  type Row,
} from './activation-history-format.js';
import { boundedJson } from './bounded-json.js';
import { createHash } from 'node:crypto';
export interface CodeIdentityAccounting {
  start(initial: string): void;
  encode(value: unknown, rawBytes: number): string;
  remember(tag: string, value: unknown): void;
  end(): void;
}
/** One C3-A framing implementation; ownership and budget checks stay with its caller. */
export function createCodeIdentityEncoder(domain: string, accounting: CodeIdentityAccounting) {
  const initial = domain + '\0';
  accounting.start(initial);
  const hash = createHash('sha256').update(initial);
  let tag = '';
  const emit = (value: unknown, rawBytes = 0) => {
    const json = accounting.encode(value, rawBytes);
    hash.update(String(Buffer.byteLength(json)) + ':').update(json);
    accounting.remember(tag, value);
  };
  return {
    emit,
    group(nextTag: string, count: number) {
      tag = nextTag;
      emit({ tag, count });
    },
    end() {
      accounting.end();
      return hash.digest('hex');
    },
  };
}

const byteCompare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function codeOrdered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(codeOrdered);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort(byteCompare)
        .map((k) => [k, codeOrdered((value as Row)[k])]),
    );
  return value;
}
/** Pure future old-table row identity. Only the owned capture/Stage authenticates completeness and the global census. */
export function predictCodeActivation(input: unknown, b: HistoryReadBudget): Readonly<RepoBasis> {
  try {
    b.own(input);
    b.own(input);
    const r = exact(input, [
        'targetSource',
        'committedSnapshotCount',
        'nodes',
        'edges',
        'evidence',
        'bindings',
        'factEvidence',
        'candidates',
        'snapshots',
        'coverage',
      ]),
      source = exact(r.targetSource, ['repositoryId', 'revisionId', 'contentFingerprint']);
    const repositoryId = EntityIdSchema.parse(source.repositoryId),
      revisionId = EntityIdSchema.parse(source.revisionId),
      contentFingerprint = ContentFingerprintSchema.parse(source.contentFingerprint),
      count = r.committedSnapshotCount;
    requireHistory(typeof count === 'number' && Number.isSafeInteger(count) && count >= 0);
    const nodes = array(r.nodes).map((x) => CanonicalNodeSchema.parse(x)),
      edges = array(r.edges).map((x) => CanonicalEdgeSchema.parse(x)),
      evidence = array(r.evidence).map((x) => EvidenceSchema.parse(x)),
      bindings = array(r.bindings).map((x) => ProviderFactBindingSchema.parse(x)),
      facts = array(r.factEvidence).map((x) => FactEvidenceSchema.parse(x)),
      snapshots = array(r.snapshots).map((x) => ProviderSnapshotSchema.parse(x));
    requireHistory(count >= snapshots.length);
    const candidates = array(r.candidates).map((v) => {
      const c = exact(v, ['evidenceId', 'factType', 'canonicalFactId', 'candidate']);
      requireHistory(c.factType === 'NODE' || c.factType === 'EDGE');
      const candidate = (c.factType === 'NODE' ? CanonicalNodeSchema : CanonicalEdgeSchema).parse(
        c.candidate,
      );
      requireHistory(candidate.id === c.canonicalFactId);
      return {
        evidenceId: EntityIdSchema.parse(c.evidenceId),
        factType: text(c.factType),
        canonicalFactId: EntityIdSchema.parse(c.canonicalFactId),
        candidate,
      };
    });
    const coverage = array(r.coverage).map((v) => {
      const c = exact(v, ['providerSnapshotId', 'capabilityName', 'sourceFileId', 'status']);
      return {
        providerSnapshotId: EntityIdSchema.parse(c.providerSnapshotId),
        capabilityName: EntityIdSchema.parse(c.capabilityName),
        sourceFileId: c.sourceFileId === null ? null : EntityIdSchema.parse(c.sourceFileId),
        status: ProviderCoverageStatusSchema.parse(c.status),
      };
    });
    for (const value of [...nodes, ...edges, ...evidence, ...snapshots])
      requireHistory(value.repositoryId === repositoryId);
    for (const value of [...nodes, ...edges, ...evidence])
      requireHistory(value.revisionId === revisionId);
    for (const value of evidence) requireHistory(value.status === 'ACTIVE');
    for (const value of snapshots) requireHistory(value.requestedRevisionId === revisionId);
    type Entry = { key: string[]; value: unknown };
    const compare = (a: Entry, c: Entry) => {
      for (let i = 0; i < a.key.length; i++) {
        const result = byteCompare(a.key[i]!, c.key[i]!);
        if (result) return result;
      }
      return 0;
    };
    const identity = createCodeIdentityEncoder('codeatlas-code-activation-v1', {
      start(raw) {
        const bytes = Buffer.byteLength(raw);
        b.add('serializedBytes', bytes);
        b.pin(bytes);
      },
      encode(value) {
        b.own(value);
        b.own(value);
        const available = Math.min(
          b.limits.maxSerializedBytes - b.serializedBytes,
          Math.floor((Math.floor(b.limits.memoryBudgetBytes / 2) - b.retainedLogicalBytes) / 2),
        );
        let json: string;
        try {
          json = boundedJson(codeOrdered(value), available);
        } catch {
          throw new HistoryCaptureError('HISTORY_LIMIT_EXCEEDED');
        }
        const bytes = Buffer.byteLength(json),
          prefix = String(bytes) + ':';
        b.add('serializedBytes', prefix.length + bytes);
        b.pin(2 * bytes + prefix.length);
        return json;
      },
      remember() {},
      end() {
        b.pin(64);
      },
    });
    const group = (tag: string, entries: Entry[]) => {
      b.own(entries);
      entries.sort(compare);
      for (let i = 1; i < entries.length; i++)
        requireHistory(compare(entries[i - 1]!, entries[i]!) < 0);
      identity.group(tag, entries.length);
      for (const entry of entries) identity.emit(entry);
    };
    group('HEADER', [
      {
        key: [repositoryId],
        value: {
          repositoryId,
          indexedRevisionId: revisionId,
          indexedContentFingerprint: contentFingerprint,
          committedSnapshotCount: count,
        },
      },
    ]);
    group(
      'NODE',
      nodes.map((value) => ({ key: [String(value.id)], value })),
    );
    group(
      'EDGE',
      edges.map((value) => ({ key: [String(value.id)], value })),
    );
    group(
      'EVIDENCE',
      evidence.map((value) => ({ key: [value.id], value })),
    );
    group(
      'BINDING',
      bindings.map((value) => ({
        key: [value.evidenceId, value.providerFact.factType, value.canonicalFact.id],
        value,
      })),
    );
    group(
      'FACT_EVIDENCE',
      facts.map((value) => ({
        key: [value.evidenceId, value.fact.factType, value.fact.id],
        value,
      })),
    );
    group(
      'SUPPORT_CANDIDATE',
      candidates.map((value) => ({
        key: [value.evidenceId, value.factType, value.canonicalFactId],
        value,
      })),
    );
    group(
      'SNAPSHOT',
      snapshots.map((value) => {
        const { startedAt, completedAt, diagnostics, capabilities, ...snapshot } = value;
        void startedAt;
        void completedAt;
        void diagnostics;
        requireHistory(new Set(capabilities.map((c) => c.name)).size === capabilities.length);
        return {
          key: [snapshot.id],
          value: {
            snapshot,
            capabilities: [...capabilities].sort((a, c) => byteCompare(a.name, c.name)),
          },
        };
      }),
    );
    const groups = new Map<string, Entry>();
    for (const row of coverage) {
      const key = [
          row.providerSnapshotId,
          row.capabilityName,
          row.sourceFileId === null ? 'NONE' : 'SOURCE',
          row.sourceFileId ?? '',
          row.status,
        ],
        encoded = JSON.stringify(key);
      b.own([key, encoded, row]);
      const previous = groups.get(encoded);
      if (previous) {
        const value = previous.value as typeof row & { multiplicity: number };
        requireHistory(value.multiplicity < Number.MAX_SAFE_INTEGER, 'HISTORY_LIMIT_EXCEEDED');
        value.multiplicity++;
      } else groups.set(encoded, { key, value: { ...row, multiplicity: 1 } });
    }
    group('COVERAGE', [...groups.values()]);
    return Object.freeze(
      RepoBasisSchema.parse({
        repositoryId,
        revisionId,
        contentFingerprint,
        codeActivationDigest: identity.end(),
      }),
    );
  } catch (e) {
    if (e instanceof HistoryCaptureError) throw e;
    throw new HistoryCaptureError('INVALID_HISTORY');
  }
}
