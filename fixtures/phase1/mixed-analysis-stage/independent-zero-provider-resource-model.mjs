import crypto from 'node:crypto';
import { measures } from './independent-code-resource-model.mjs';
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex'),
  N = (v) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error('unsafe independent Provider cost');
    return Number(v);
  };
/** Closed full-raw Provider pipeline with no projected files/facts/Syntax. All intermediate shapes come from literal inputs. */
export function modelZeroFullProvider(target, raw) {
  const metadata = structuredClone(raw.metadata),
    request = JSON.parse(raw.requestText),
    events = raw.outputText.trimEnd().split('\n').map(JSON.parse),
    R = BigInt(Buffer.byteLength(raw.requestText)),
    O = BigInt(Buffer.byteLength(raw.outputText));
  if (
    request.payload.sourceFiles.length ||
    request.payload.owners.length ||
    events.length !== 2 ||
    metadata.java !== null
  )
    throw Error('closed Provider model requires empty projected observation');
  let serialized = 0n,
    items = 0n,
    maxDepth = 0;
  const ledger = [],
    q = (label, v) => {
      const m = measures(v),
        b = BigInt(Buffer.byteLength(JSON.stringify(v)));
      items += m.nodes;
      serialized += b;
      maxDepth = Math.max(maxDepth, m.depth);
      ledger.push({ label, items: N(m.nodes), serializedBytes: N(b), depth: m.depth });
      return v;
    },
    rawCharge = (label, n) => {
      serialized += n;
      ledger.push({ label, items: 0, serializedBytes: N(n), depth: 0 });
    },
    preflight = (label, v) => {
      const m = measures(v);
      items += m.nodes;
      maxDepth = Math.max(maxDepth, m.depth);
      ledger.push({ label, items: N(m.nodes), serializedBytes: 0, depth: m.depth });
    },
    python = (label) => {
      const p = {
        targetSource: metadata.targetSource,
        providerId: metadata.snapshot.providerId,
        providerSnapshotId: metadata.snapshot.id,
        sourceFiles: [],
        nodes: [],
        edges: [],
      };
      q(label + ' input', p);
      q(label + ' parsed input', p);
      for (const k of ['sourceFiles', 'nodes', 'edges']) q(label + ' ' + k, []);
      q(label + ' normalized pairs', { nodePairs: [], edgePairs: [] });
    },
    collect = (label, observation) => {
      const input = {
        repositoryId: target.source.repositoryId,
        revisionId: target.source.revisionId,
        observations: [observation],
      };
      q(label + ' input', input);
      q(label + ' parsed input', input);
      q(label + ' input path', ['observations', 0]);
      q(label + ' provider', observation.snapshot.providerId);
      q(label + ' snapshot identity', observation.snapshot.id);
      q(label + ' supports', []);
    };
  q('full target owned encoding', target);
  q('full target second ownership', target);
  q('full target third ownership', target);
  rawCharge('all raw request copy/decode representations', 4n * R);
  rawCharge('all raw output copy/decode representations', 4n * O);
  q('metadata serialized', metadata);
  q('metadata decoded', metadata);
  q('metadata schema parsed', metadata);
  preflight('request ASCII preflight', request);
  q('request decoded', request);
  q('request schema parsed', request);
  const { codeContract, ...commonPayload } = request.payload,
    common = {
      protocolVersion: 4,
      requestId: request.requestId,
      sequence: 0,
      type: 'OBSERVE_SYNTAX',
      payload: commonPayload,
    };
  q('common payload', commonPayload);
  q('common request', common);
  q('common parsed request', common);
  for (const [i, e] of events.entries()) {
    preflight('event ' + i + ' ASCII preflight', e);
    q('event ' + i + ' decoded', e);
    q('event ' + i + ' schema parsed', e);
  }
  q('complete event vector', events);
  q('correspondence input', { request, events });
  python('decoder normalization');
  const terminal = events.at(-1).payload,
    codeSyntax = {
      request,
      events,
      codeOutcome: terminal.codeOutcome,
      syntaxOutcome: terminal.syntaxOutcome,
      outcome: terminal.outcome,
      counts: terminal.counts,
      checksum: terminal.checksum,
      requestChecksum: sha(raw.requestText),
    },
    outputIdentity = sha(raw.outputText);
  q('validated stream wrapper', { observation: codeSyntax, outputIdentity });
  q('admitted Code Syntax observation', codeSyntax);
  const capabilities = [
      { name: 'FRAMEWORK_SYNTAX_OBSERVATION_V1', support: 'SUPPORTED', coverage: 'COMPLETE' },
    ],
    snapshot = {
      ...metadata.snapshot,
      repositoryId: target.source.repositoryId,
      requestedRevisionId: target.source.revisionId,
      requestedRevisionFingerprint: target.source.contentFingerprint,
      capabilities,
      diagnostics: [],
      outcome: 'SUCCEEDED',
    };
  q('complete Provider snapshot', snapshot);
  python('projection normalization');
  const normalized = { nodePairs: [], edgePairs: [] };
  q('combined normalization', normalized);
  const observed = { snapshot, nodes: [], edges: [] };
  collect('projection merge collection', observed);
  q('merge selection supports', []);
  q('merge selected node identities', []);
  const selected = { nodes: [], edges: [], explanations: [] };
  q('merge selection result', selected);
  q('merge canonical supports', []);
  const merged = { ...selected, evidence: [], factEvidence: [], bindings: [] };
  q('complete merged result', merged);
  const candidate = {
    kind: 'NATIVE_PROJECTION_CANDIDATE',
    snapshot,
    normalized,
    merged,
    codeSyntax,
    scope: {
      inventory: metadata.inventory,
      nativeSourceFileIds: [],
      capabilities: ['FRAMEWORK_SYNTAX_OBSERVATION_V1'],
    },
    provenance: {
      tool: metadata.tool,
      java: null,
      codeSyntax: {
        kind: 'RAW_V5',
        requestId: request.requestId,
        startedAt: metadata.codeSyntax.startedAt,
        settledAt: metadata.codeSyntax.settledAt,
        requestChecksum: sha(raw.requestText),
        outputChecksum: outputIdentity,
        terminalChecksum: terminal.checksum,
      },
    },
  };
  q('complete projection candidate', candidate);
  q('history projection bridge', { candidate, metadata, java: null });
  q('complete inventory equality', [metadata.inventory, target.inventory]);
  const admittedRaw = {
    kind: 'DECLARED_FULL_RAW_OBSERVATION',
    metadata,
    java: null,
    codeSyntax,
    provenance: { kind: 'DECLARED_INPUT', requestIdentity: sha(raw.requestText), outputIdentity },
  };
  q('declared raw record', admittedRaw);
  q('projected Java Python partitions', [[], [], []]);
  q('required unit descriptions', []);
  q('existing units', []);
  q('assembled units', []);
  q('assembled normalized pairs', normalized);
  q('assembled diagnostics', []);
  q('assembled capabilities', capabilities);
  q('assembled snapshot draft', snapshot);
  q('assembled parsed snapshot draft', snapshot);
  for (const f of target.inventory) q('full source lookup ' + f.id, [f.id, f]);
  const observation = {
    observation: observed,
    units: [],
    supportDependencies: [],
    coverage: [],
    requestIdentity: sha(raw.requestText),
    outputIdentity,
    settlement: 'DECLARED_SUCCEEDED',
  };
  q('declared complete observation', observation);
  collect('complete support collection', observed);
  const result = {
    kind: 'DECLARED_FULL_RAW_SUPPORT_CANDIDATE',
    observation,
    activeSupports: [],
    merged,
    raw: admittedRaw,
  };
  q('declared complete full support candidate', result);
  return { result, cost: { serializedBytes: N(serialized), items: N(items), maxDepth }, ledger };
}
