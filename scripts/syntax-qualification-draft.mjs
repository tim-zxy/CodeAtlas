import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  parseSyntaxObservationRequest,
  validateSyntaxOwnerContext,
} from '../packages/providers/dist/index.js';
import { validateOperationPolicyData } from '../packages/application/dist/index.js';
import { nativeSyntaxObservationCorpus } from '../packages/runtime/dist/syntax-observation-corpus.js';
import { compareSyntaxObservationOutput } from './syntax-observation-evidence.mjs';

const code = 'INVALID_SYNTAX_QUALIFICATION_DRAFT';
const check = (value) => {
  if (!value) throw new Error(code);
};
const object = (value, keys) => {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k)));
  return value;
};
const positive = (n) => check(Number.isSafeInteger(n) && n > 0);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const canonical = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort(order)
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
};
const identity = (domain, value) =>
  sha(Buffer.from('codeatlas-syntax-qualification-' + domain + '-v1\0' + canonical(value)));
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const relative = (name) => {
  check(typeof name === 'string' && name.length > 0 && !/[<>:"\\|?*\x00-\x1f]/.test(name));
  check(
    !name
      .split('/')
      .some(
        (c) =>
          !c ||
          c === '.' ||
          c === '..' ||
          /[ .]$/.test(c) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(c),
      ),
  );
  return name;
};
const ref = (value) => {
  object(value, ['path', 'sha256']);
  relative(value.path);
  check(typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256));
  return value;
};
const parse = (bytes) => {
  check(!(bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191));
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  validateOperationPolicyData(value);
  return value;
};
const sameFile = (a, b) =>
  a.ino === b.ino && a.dev === b.dev && a.size === b.size && a.mtimeMs === b.mtimeMs;
const tools = [
  'nodeExecutable',
  'nativeExecutable',
  'hostBuild',
  'cargoLock',
  'rustToolchain',
  'grammarSet',
  'collector',
];

/** Reads preparation identities only. No input can confer execution or profile authority. */
export async function loadSyntaxQualificationDraft(rootValue, relativeManifest, limits) {
  try {
    validateOperationPolicyData(limits);
    object(limits, ['maxManifestBytes', 'maxArtifactBytes', 'maxFiles', 'maxTotalBytes']);
    Object.values(limits).forEach(positive);
    check(typeof rootValue === 'string' && path.isAbsolute(rootValue));
    const root = path.resolve(rootValue),
      rootStat = await fs.lstat(root);
    check(
      rootStat.isDirectory() && !rootStat.isSymbolicLink() && (await fs.realpath(root)) === root,
    );
    // Also reject a canonical-looking root reached through an ancestor redirection.
    let ancestor = path.parse(root).root;
    for (const component of root.slice(ancestor.length).split(path.sep).filter(Boolean)) {
      ancestor = path.join(ancestor, component);
      check(!(await fs.lstat(ancestor)).isSymbolicLink());
    }
    let artifactsRead = 0,
      totalBytesRead = 0;
    async function bytes(name, limit) {
      relative(name);
      check(artifactsRead < limits.maxFiles);
      artifactsRead++;
      let full = root;
      for (const component of name.split('/')) {
        full = path.join(full, component);
        check(!(await fs.lstat(full)).isSymbolicLink());
      }
      const namedBefore = await fs.lstat(full);
      check(namedBefore.isFile() && namedBefore.nlink === 1);
      check((await fs.realpath(full)) === full);
      const handle = await fs.open(full, 'r');
      try {
        const before = await handle.stat();
        check(before.isFile() && before.nlink === 1 && sameFile(before, namedBefore));
        check(
          Number.isSafeInteger(before.size) &&
            before.size >= 0 &&
            before.size < Number.MAX_SAFE_INTEGER &&
            before.size <= limit,
        );
        check(before.size <= limits.maxTotalBytes - totalBytesRead);
        // The extra byte detects growth; never allocate beyond an explicit file bound plus the sentinel.
        const data = Buffer.alloc(before.size + 1);
        let length = 0;
        while (length < data.length) {
          const read = await handle.read(data, length, data.length - length, null);
          if (read.bytesRead === 0) break;
          length += read.bytesRead;
        }
        const after = await handle.stat(),
          namedAfter = await fs.lstat(full),
          rootAfter = await fs.lstat(root);
        check(
          length === before.size &&
            sameFile(before, after) &&
            sameFile(before, namedAfter) &&
            namedAfter.isFile() &&
            namedAfter.nlink === 1 &&
            !namedAfter.isSymbolicLink(),
        );
        check(
          !rootAfter.isSymbolicLink() &&
            rootAfter.ino === rootStat.ino &&
            rootAfter.dev === rootStat.dev &&
            (await fs.realpath(full)) === full,
        );
        totalBytesRead += length;
        check(Number.isSafeInteger(totalBytesRead));
        return data.subarray(0, length);
      } finally {
        await handle.close();
      }
    }
    async function artifact(value) {
      ref(value);
      const data = await bytes(value.path, limits.maxArtifactBytes);
      check(sha(data) === value.sha256);
      return data;
    }
    const manifestRaw = await bytes(relativeManifest, limits.maxManifestBytes),
      draft = parse(manifestRaw);
    object(draft, ['schemaVersion', 'kind', 'status', 'corpus', 'cases', 'tooling']);
    check(
      draft.schemaVersion === 1 &&
        draft.kind === 'SYNTAX_QUALIFICATION_DRAFT' &&
        draft.status === 'DRAFT',
    );
    const corpusRaw = await artifact(draft.corpus);
    check(sha(corpusRaw) === nativeSyntaxObservationCorpus.catalogDigest);
    const catalog = parse(corpusRaw);
    object(catalog, ['schemaVersion', 'kind', 'revision', 'calibration', 'holdout']);
    check(
      catalog.schemaVersion === 1 &&
        catalog.kind === 'OFFLINE_UNEXECUTED' &&
        catalog.revision === nativeSyntaxObservationCorpus.revision,
    );
    const originals = new Map(),
      catalogArtifacts = new Set();
    const corpusFolder = path.posix.dirname(draft.corpus.path);
    for (const mode of ['calibration', 'holdout']) {
      check(
        Array.isArray(catalog[mode]) &&
          catalog[mode].length === nativeSyntaxObservationCorpus.caseIds.length,
      );
      for (const item of catalog[mode]) {
        object(item, ['id', 'classId', 'sources', 'oracle', 'requestShape', 'resourceShape']);
        check(
          item.id === mode + ':' + item.classId &&
            nativeSyntaxObservationCorpus.caseIds.includes('calibration:' + item.classId) &&
            !originals.has(item.id),
        );
        object(item.requestShape, [
          'ownerBinding',
          'expectedActivation',
          'changedSourceFiles',
          'removedSourceFiles',
        ]);
        object(item.resourceShape, ['kind', 'productionDefaults', 'qualification']);
        check(
          item.requestShape.ownerBinding === 'PROVISIONAL_CODE' &&
            ['PRESENT', 'ABSENT'].includes(item.requestShape.expectedActivation),
        );
        check(
          item.resourceShape.kind === 'EXPLICIT_CALLER_LIMITS_REQUIRED' &&
            item.resourceShape.productionDefaults === false &&
            item.resourceShape.qualification === 'NOT_EXECUTED',
        );
        check(Array.isArray(item.sources) && item.sources.length > 0);
        const sources = [];
        let probe;
        for (const originalRef of [...item.sources, item.oracle]) {
          ref(originalRef);
          check(
            originalRef.path.startsWith(mode + '/' + item.classId + '/') &&
              !catalogArtifacts.has(originalRef.path),
          );
          catalogArtifacts.add(originalRef.path);
          const data = await artifact({
            path: path.posix.join(corpusFolder, originalRef.path),
            sha256: originalRef.sha256,
          });
          if (originalRef === item.oracle) probe = parse(data);
          else sources.push({ name: path.posix.basename(originalRef.path), sha256: sha(data) });
        }
        check(
          isDeepStrictEqual(
            item.requestShape.changedSourceFiles,
            item.sources.map((s) => s.path),
          ),
        );
        check(Array.isArray(item.requestShape.removedSourceFiles));
        item.requestShape.removedSourceFiles.forEach(relative);
        check(
          probe.kind === 'INDEPENDENT_LITERAL_PROBES_UNEXECUTED' &&
            Array.isArray(probe.probes) &&
            probe.probes.length > 0,
        );
        originals.set(item.id, { item, sources, probe });
      }
    }
    check(Array.isArray(draft.cases) && draft.cases.length === originals.size);
    const seen = new Set(),
      cases = [];
    for (const entry of draft.cases) {
      object(entry, ['id', 'request', 'context', 'expected', 'sources', 'retainedPaths']);
      check(typeof entry.id === 'string' && originals.has(entry.id) && !seen.has(entry.id));
      seen.add(entry.id);
      const original = originals.get(entry.id),
        requestRaw = await artifact(entry.request);
      check(
        requestRaw.length > 0 &&
          requestRaw.at(-1) === 10 &&
          requestRaw.indexOf(10) === requestRaw.length - 1 &&
          !requestRaw.includes(13),
      );
      const request = parseSyntaxObservationRequest(parse(requestRaw)),
        p = request.payload;
      const contextRaw = await artifact(entry.context);
      validateSyntaxOwnerContext(request, parse(contextRaw));
      const expectedRaw = await artifact(entry.expected),
        comparison = compareSyntaxObservationOutput(request, expectedRaw, expectedRaw);
      check(comparison.outcome === original.probe.expectedOutcome);
      check(
        Array.isArray(entry.sources) &&
          entry.sources.length === p.sourceFiles.length &&
          entry.sources.length === original.sources.length,
      );
      const sourceIds = new Set(),
        sourceNames = new Set();
      for (const source of entry.sources) {
        object(source, ['sourceFileId', 'artifact']);
        check(typeof source.sourceFileId === 'string' && !sourceIds.has(source.sourceFileId));
        sourceIds.add(source.sourceFileId);
        const file = p.sourceFiles.find((s) => s.id === source.sourceFileId);
        check(file);
        relative(file.path);
        const sourceRaw = await artifact(source.artifact),
          digest = sha(sourceRaw),
          name = path.posix.basename(file.path);
        check(!sourceNames.has(name));
        sourceNames.add(name);
        check(
          file.path === name &&
            file.contentFingerprint === 'sha256:' + digest &&
            original.sources.some((s) => s.name === name && s.sha256 === digest),
        );
      }
      check(Array.isArray(entry.retainedPaths));
      entry.retainedPaths.forEach(relative);
      const changed = p.sourceFiles.map((s) => s.path),
        removed = p.removedSourceFiles.map((s) => s.path);
      removed.forEach(relative);
      check(new Set(entry.retainedPaths).size === entry.retainedPaths.length);
      check(!entry.retainedPaths.some((s) => changed.includes(s) || removed.includes(s)));
      const retained = original.probe.probes
        .filter((p) => Object.hasOwn(p, 'retainedPath'))
        .map((p) => p.retainedPath);
      check(isDeepStrictEqual([...entry.retainedPaths].sort(order), retained.sort(order)));
      check(
        isDeepStrictEqual(
          [...removed].sort(order),
          [...original.item.requestShape.removedSourceFiles].sort(order),
        ),
      );
      const wanted = {
        ownerBinding: original.item.requestShape.ownerBinding,
        expectedActivation: original.item.requestShape.expectedActivation,
        changedPaths: original.item.requestShape.changedSourceFiles
          .map((s) => path.posix.basename(s))
          .sort(order),
        removedPaths: [...original.item.requestShape.removedSourceFiles].sort(order),
      };
      const actual = {
        ownerBinding: p.ownerBinding.kind,
        expectedActivation: p.expectedActivationBasis === null ? 'ABSENT' : 'PRESENT',
        changedPaths: [...changed].sort(order),
        removedPaths: [...removed].sort(order),
      };
      const requestShapeDifferences = [
        'ownerBinding',
        'expectedActivation',
        'changedPaths',
        'removedPaths',
      ].filter((k) => !isDeepStrictEqual(wanted[k], actual[k]));
      cases.push({
        id: entry.id,
        rawRequestDigest: sha(requestRaw),
        requestIdentityDigest: identity('request', request),
        contextDigest: sha(contextRaw),
        expectedDigest: sha(expectedRaw),
        sourceInventoryDigest: identity('source-inventory', p.sourceFiles),
        removedInventoryDigest: identity('removed-inventory', p.removedSourceFiles),
        resourceDigest: identity('resource', {
          resourceBudget: p.resourceBudget,
          deadlineEpochMs: p.deadlineEpochMs,
        }),
        retainedPathsDigest: identity('retained-paths', entry.retainedPaths),
        requestShapeDifferences,
      });
    }
    object(draft.tooling, tools);
    const missingToolIdentities = [];
    for (const name of tools) {
      if (draft.tooling[name] === null) missingToolIdentities.push(name);
      else await artifact(draft.tooling[name]);
    }
    const obligations = [
      'TRUSTED_CONTEXT_REQUIRED',
      'EXECUTION_SCOPE_REQUIRED',
      'PROCESS_ACQUISITION_REQUIRED',
      'PROFILE_APPROVAL_REQUIRED',
      'FULL_CODE_SYNTAX_STORE_PROOF_REQUIRED',
      'TOOL_IDENTITIES_UNQUALIFIED',
      'ORACLE_PROVENANCE_REQUIRED',
    ];
    if (cases.some((c) => c.requestShapeDifferences.length))
      obligations.push('SCENARIO_REBIND_REQUIRED');
    if (missingToolIdentities.length) obligations.push('TOOL_IDENTITIES_MISSING');
    return freeze({
      schemaVersion: 1,
      kind: 'SYNTAX_QUALIFICATION_PREPARATION_ONLY',
      status: 'DRAFT',
      readiness: 'NOT_READY',
      manifestDigest: sha(manifestRaw),
      corpusDigest: sha(corpusRaw),
      cases: cases.sort((a, b) => order(a.id, b.id)),
      missingToolIdentities,
      unresolvedObligations: [...new Set(obligations)].sort(order),
      artifactsRead,
      totalBytesRead,
    });
  } catch {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}
