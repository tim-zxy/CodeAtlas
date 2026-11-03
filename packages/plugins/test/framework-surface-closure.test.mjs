import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/plugin-context/binding-sufficiency/inputs.json',
      import.meta.url,
    ),
  ),
);
function context() {
  const c = structuredClone(base.context);
  c.contextVersion = 5;
  c.syntaxSchemaVersion = 4;
  for (const s of c.syntaxEvidence) {
    s.callbackScope = null;
    if (s.syntaxKind === 'INVOCATION')
      Object.assign(s.payload, {
        invocationForm: 'CALL',
        calleeRange: { ...s.sourceRange, endColumn: s.sourceRange.startColumn + 1 },
        codeCallRef: null,
      });
  }
  return c;
}
const api = () =>
  import('../dist/plugin-context-v5.js').catch((e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  });
test('context5 validates Syntax4 collection and freezes owned output without mutating input', async () => {
  const a = await api();
  assert.equal(typeof a.validatePluginV5Context, 'function');
  const c = context();
  const out = a.validatePluginV5Context(c);
  assert.deepEqual(out, c);
  assert(Object.isFrozen(out.syntaxEvidence[0]));
  assert(!Object.isFrozen(c));
  const old = await import('../dist/plugin-context-v4.js');
  assert.throws(() => old.validatePluginV4Context(c));
});
test('context5 refuses mixed versions/missing scope and callback labels without fence', async () => {
  const a = await api();
  assert.equal(typeof a.validatePluginV5Context, 'function');
  for (const change of [
    (c) => delete c.syntaxEvidence[0].callbackScope,
    (c) => (c.syntaxSchemaVersion = 3),
    (c) => c.syntaxEvidence.shift(),
    (c) => {
      const s = c.syntaxEvidence.find((s) => s.syntaxKind === 'INVOCATION');
      s.callbackScope = structuredClone(s.sourceRange);
      s.lexicalScope = null;
      s.controlContext = 'UNKNOWN';
    },
  ]) {
    const c = context();
    change(c);
    assert.throws(() => a.validatePluginV5Context(c));
  }
});

test('SPI5 has explicit descriptor, current support detection and bounded extraction context', async () => {
  const a = await import('../dist/plugin-spi-v5.js').catch((e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  });
  assert.equal(typeof a.validatePluginDescriptorV5, 'function');
  const descriptor = {
    pluginId: 'spring',
    pluginVersion: '2.0.0',
    languages: ['java'],
    frameworks: ['spring'],
    requiredProviderCapabilities: [],
    producedSemanticCapabilities: ['RUNTIME_FACT_SET', 'FRAMEWORK_BINDING_SET'],
    configurationSchema: { schema: 'codeatlas.plugin.spring', version: 1 },
    trustClass: 'BUILT_IN',
    contextVersion: 5,
    syntaxSchemaVersion: 4,
  };
  assert.deepEqual(a.validatePluginDescriptorV5(descriptor), descriptor);
  assert.throws(() => a.validatePluginDescriptorV5({ ...descriptor, contextVersion: 4 }));
  const c = context(),
    d = {
      matched: true,
      support: [{ kind: 'SYNTAX', id: c.syntaxEvidence[0].id }],
      diagnostics: [],
    };
  assert.deepEqual(a.validatePluginV5Detection(c, d), d);
  assert.throws(() =>
    a.validatePluginV5Detection(c, { ...d, support: [{ kind: 'SYNTAX', id: 'unknown' }] }),
  );
  assert.throws(() => a.validatePluginV5Detection(c, { ...d, matched: false }));
  const out = a.validatePluginV5ExtractionContext({
    ...c,
    detection: d,
    syntaxMembershipDigest: 'c'.repeat(64),
    maxItems: 1,
  });
  assert.equal(out.maxItems, 1);
  assert(Object.isFrozen(out));
  assert.throws(() => a.validatePluginV5ExtractionContext({ ...c, detection: d, maxItems: 0 }));
});

// Pure binder responsibility input; not a Source capture or publication context.
function parameterBindingSeed() {
  const c = context(),
    scope = c.syntaxEvidence.find(
      (s) => s.syntaxKind === 'BINDING_SCOPE' && s.payload.scopeRef.entity.id === 'code:function',
    ),
    decl = structuredClone(c.syntaxEvidence.find((s) => s.syntaxKind === 'DECLARATION'));
  Object.assign(decl, {
    id: 'syntax:callable',
    syntaxKey: 'key:callable',
    owner: scope.payload.scopeRef,
    lexicalScope: scope.payload.scopeRef,
    payload: {
      declarationForm: 'CALLABLE',
      declaredName: 'handler',
      declaredType: null,
      parameterNames: ['client'],
      modifiers: [],
    },
  });
  const param = {
    ...structuredClone(decl),
    id: 'syntax:param',
    syntaxKey: 'key:param',
    syntaxKind: 'PARAMETER_BINDING',
    payload: {
      callableRef: scope.payload.scopeRef,
      language: 'java',
      name: 'client',
      ordinal: 0,
      parameterForm: 'POSITIONAL',
      declaredType: 'MongoClient',
      typeRange: decl.sourceRange,
      defaultValueRange: null,
    },
  };
  const imported = c.syntaxEvidence.find((s) => s.syntaxKind === 'IMPORT_BINDING');
  Object.assign(imported.payload, {
    qualifiedName: 'com.mongodb.client.MongoClient',
    importedName: 'MongoClient',
    boundName: 'MongoClient',
  });
  const invocation = c.syntaxEvidence.find((s) => s.syntaxKind === 'INVOCATION');
  invocation.payload.callee = {
    state: 'NON_RESOLVED',
    resolution: 'UNRESOLVED',
    name: 'client.getDatabase',
    target: null,
    candidates: [],
  };
  invocation.payload.receiver = {
    kind: 'REFERENCE',
    name: 'client',
    resolution: 'UNRESOLVED',
    target: null,
    candidates: [],
  };
  c.syntaxEvidence.push(decl, param);
  return { c, param, invocation };
}
test('V5 shared binder indexes each explicit parameter once and binds supported declared type without masking writes', async () => {
  const a = await import('../dist/framework-bindings.js'),
    { c, param, invocation } = parameterBindingSeed(),
    i = a.createFrameworkBindingIndex(c),
    defs = a.namedDefinitions(i, 'code:function', 'client');
  assert.equal(defs.length, 1);
  assert.equal(defs[0].syntax.id, param.id);
  const proof = a.bindDeclaredReceiver(i, invocation);
  assert.equal(proof.state, 'BOUND');
  assert.equal(proof.qualifiedName, 'com.mongodb.client.MongoClient');
  assert(proof.support.some((s) => s.kind === 'SYNTAX' && s.id === param.id));
  const write = structuredClone(c.syntaxEvidence.find((s) => s.syntaxKind === 'ASSIGNMENT'));
  write.payload.targetName = 'client';
  c.syntaxEvidence.push(write);
  assert.equal(
    a.bindDeclaredReceiver(a.createFrameworkBindingIndex(c), invocation).state,
    'UNPROVEN',
  );
  const old = structuredClone(c);
  old.contextVersion = 4;
  old.syntaxSchemaVersion = 3;
  old.syntaxEvidence = old.syntaxEvidence.filter(
    (s) => s.syntaxKind !== 'PARAMETER_BINDING' && s !== write,
  );
  const legacy = a.namedDefinitions(a.createFrameworkBindingIndex(old), 'code:function', 'client');
  assert(legacy.some((d) => d.syntax.id === 'syntax:callable' && d.kind === 'PARAM'));
});

import { surfaceContext } from './fixtures/framework-surface-context.mjs';
test('V5 recorded Sources normalize and explicit Java parameter retains actual type proof', async () => {
  const a = await import('../dist/framework-bindings.js');
  for (const id of ['J1', 'J2', 'J4', 'J5', 'J7', 'P1', 'P2', 'P3', 'P4', 'P5']) {
    const c = await surfaceContext(id);
    assert(c.syntaxEvidence.length);
    if (id === 'J4') {
      const s = c.syntaxEvidence.find(
        (s) => s.syntaxKind === 'INVOCATION' && s.payload.callee.name === 'client.getDatabase',
      );
      assert(s);
      const proof = a.bindDeclaredReceiver(a.createFrameworkBindingIndex(c), s);
      assert.equal(proof.state, 'BOUND');
      assert.equal(proof.qualifiedName, 'com.mongodb.client.MongoClient');
    }
  }
});

test('V5 FastAPI emits only direct default Depends on a uniquely bound provider', async () => {
  const a = await import('../dist/framework-extraction.js');
  assert.equal(typeof a.extractFrameworkSurfaceDrafts, 'function');
  for (const id of ['P1', 'P2', 'P3', 'P4']) {
    const c = await surfaceContext(id),
      out = a.extractFrameworkSurfaceDrafts(c, 'fastapi'),
      deps = out.drafts.filter((d) => d.value.payload.proposal.kind === 'DEPENDENCY');
    if (id === 'P1' || id === 'P2') {
      assert.equal(deps.length, 1);
      const p = deps[0].value.payload.proposal;
      assert.equal(c.nodes.find((n) => n.id === p.ownerRef.entity.id).name, 'handler');
      assert.equal(c.nodes.find((n) => n.id === p.dependencyRef.entity.id).name, 'provider');
      assert(
        deps[0].support.some(
          (r) =>
            r.kind === 'SYNTAX' &&
            c.syntaxEvidence.some((s) => s.id === r.id && s.syntaxKind === 'PARAMETER_BINDING'),
        ),
      );
    } else {
      assert.equal(deps.length, 0);
      assert(out.diagnostics.length > 0);
    }
  }
  const old = await surfaceContext('P2');
  assert.throws(() => a.extractFrameworkDrafts(old, 'fastapi'));
});

test('V5 Mongo watch proves database/collection and bounded real handler, refusing unknown origin or incomplete callback', async () => {
  const a = await import('../dist/framework-extraction.js');
  for (const id of ['J4', 'J5']) {
    const c = await surfaceContext(id),
      out = a.extractFrameworkSurfaceDrafts(c, 'mongo'),
      watch = out.drafts.filter(
        (d) =>
          d.value.payload.proposal.kind === 'DATA_OPERATION' &&
          d.value.payload.proposal.operation === 'WATCH',
      );
    assert.equal(watch.length, 1);
    const p = watch[0].value.payload.proposal;
    assert.equal(p.namespace, 'atlas');
    assert.equal(p.logicalName, 'events');
    assert.equal(c.nodes.find((n) => n.id === p.handlerRef.entity.id).name, 'handle');
    assert(
      watch[0].support.some(
        (r) =>
          r.kind === 'SYNTAX' &&
          c.syntaxEvidence.some((s) => s.id === r.id && s.syntaxKind === 'CALLBACK_BINDING'),
      ),
    );
    for (const mutate of [
      (x) => {
        const cb = x.syntaxEvidence.find((s) => s.syntaxKind === 'CALLBACK_BINDING');
        cb.payload.status = 'PARTIAL';
        cb.payload.limitations = ['INDEPENDENT_NEGATIVE'];
      },
      (x) => {
        x.syntaxEvidence.find(
          (s) => s.syntaxKind === 'ASSIGNMENT' && s.payload.targetName === 'database',
        ).payload.targetName = 'unknown_database';
      },
    ]) {
      const bad = structuredClone(c);
      mutate(bad);
      assert.equal(
        a
          .extractFrameworkSurfaceDrafts(bad, 'mongo')
          .drafts.filter((d) => d.value.payload.proposal.operation === 'WATCH').length,
        0,
      );
    }
  }
});

test('V5 Spring declares required TYPE and Feign consumer at actual caller while preserving interface declaration', async () => {
  const a = await import('../dist/framework-extraction.js'),
    c = await surfaceContext('J1'),
    out = a.extractFrameworkSurfaceDrafts(c, 'spring'),
    deps = out.drafts.filter((d) => d.value.payload.proposal.kind === 'DEPENDENCY');
  assert.equal(deps.length, 1);
  assert.equal(
    c.nodes.find((n) => n.id === deps[0].value.payload.proposal.dependencyRef.entity.id).name,
    'Repository',
  );
  const proxy = await surfaceContext('J7'),
    consumer = a
      .extractFrameworkSurfaceDrafts(proxy, 'spring')
      .drafts.filter(
        (d) =>
          d.value.payload.proposal.kind === 'HTTP' &&
          d.value.payload.proposal.direction === 'CONSUMER',
      ),
    calls = consumer.filter(
      (d) =>
        proxy.nodes.find((n) => n.id === d.value.payload.proposal.implementationRef.entity.id)
          ?.name === 'proxy',
    );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].value.payload.proposal.signature.serviceHint, 'inventory');
  assert(
    consumer.some(
      (d) =>
        proxy.nodes.find((n) => n.id === d.value.payload.proposal.implementationRef.entity.id)
          ?.name === 'items',
    ),
  );
  const ambiguous = structuredClone(c),
    typed = ambiguous.syntaxEvidence.find(
      (s) =>
        s.syntaxKind === 'DECLARATION' &&
        s.payload.declarationForm === 'TYPE' &&
        s.payload.declaredName === 'Repository',
    );
  const copy = structuredClone(typed);
  copy.id += 'duplicate';
  copy.syntaxKey += 'duplicate';
  ambiguous.syntaxEvidence.push(copy);
  assert.equal(
    a
      .extractFrameworkSurfaceDrafts(ambiguous, 'spring')
      .drafts.filter((d) => d.value.payload.proposal.kind === 'DEPENDENCY').length,
    0,
  );
});

test('V5 runtime candidate reuses validated domain/entry/binding compiler with v2 support and exact callsite owner', async () => {
  const a = await import('../dist/framework-binding-candidate.js');
  assert.equal(typeof a.compileFrameworkSurfaceBindingCandidate, 'function');
  const fast = await surfaceContext('P5'),
    p = a.compileFrameworkSurfaceBindingCandidate(fast, 'fastapi', 10000);
  assert.equal(p.facts.payload.contracts.length, 1);
  assert.equal(p.facts.payload.entryPoints.length, 1);
  assert.equal(p.facts.payload.entryPoints[0].contextKind, 'REQUEST');
  assert.equal(p.facts.payload.contracts[0].confidence.method, 'runtime-declaration-support-v2');
  assert.equal(
    p.facts.payload.entryPoints[0].confidence.method,
    'runtime-execution-declaration-v2',
  );
  const spring = await surfaceContext('J7'),
    out = a.compileFrameworkSurfaceBindingCandidate(spring, 'spring', 10000);
  assert(
    out.bindings.payload.bindings.some(
      (b) =>
        b.kind === 'HTTP_CALL' &&
        spring.nodes.find((n) => n.id === b.ownerRef.entity.id)?.name === 'proxy',
    ),
  );
  assert.equal(out.coverage.status, 'PARTIAL');
  assert.throws(() => a.compileFrameworkBindingCandidate(spring, 'spring', 10000));
});

test('V5 candidate closes declared dependency and DATA_WATCH with current Syntax/Code supports', async () => {
  const a = await import('../dist/framework-binding-candidate.js');
  for (const [id, framework, kind] of [
    ['P2', 'fastapi', 'DEPENDENCY'],
    ['J1', 'spring', 'DEPENDENCY'],
    ['J4', 'mongo', 'DATA_WATCH'],
    ['J5', 'mongo', 'DATA_WATCH'],
  ]) {
    const c = await surfaceContext(id),
      out = a.compileFrameworkSurfaceBindingCandidate(c, framework, 10000),
      bindings = out.bindings.payload.bindings.filter((b) => b.kind === kind);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].confidence.method, 'runtime-declaration-support-v2');
    assert(bindings[0].supportRefs.some((s) => s.entity.kind === 'SYNTAX_EVIDENCE'));
    assert(
      out.facts.payload.externalRefs.some((r) => r.entity.id === bindings[0].ownerRef.entity.id),
    );
    if (kind === 'DATA_WATCH') {
      assert(bindings[0].handlerRef);
      assert.equal(out.facts.payload.dataResources[0].namespace, 'atlas');
    } else assert(!out.coverage.limitations.includes('DEPENDENCY_REPRESENTATION_PENDING'));
  }
});

test('V5 site plan enumerates every invocation with proven roles and keeps unsupported declarations partial', async () => {
  const a = await import('../dist/framework-surface-compiler.js');
  assert.equal(typeof a.compileFrameworkSurfaceCandidate, 'function');
  for (const [id, framework] of [
    ['P5', 'fastapi'],
    ['P1', 'fastapi'],
    ['P2', 'fastapi'],
    ['J2', 'kafka'],
    ['J4', 'mongo'],
    ['J5', 'mongo'],
    ['J7', 'spring'],
    ['J1', 'spring'],
  ]) {
    const c = await surfaceContext(id),
      out = a.compileFrameworkSurfaceCandidate(c, framework, 'c'.repeat(64), 10000);
    assert.equal(
      out.sitePlan.entries.length,
      c.syntaxEvidence.filter((s) => s.syntaxKind === 'INVOCATION').length,
    );
    assert.equal(out.coverage.status, 'COMPLETE', id + ':' + out.coverage.limitations.join(','));
    assert(out.sitePlan.entries.every((e) => e.proofSyntaxKeys.includes(e.siteKey)));
    if (id === 'J4') assert(out.sitePlan.entries.some((e) => e.role === 'CALLBACK_BODY'));
  }
  for (const id of ['P3', 'P4']) {
    const out = a.compileFrameworkSurfaceCandidate(
      await surfaceContext(id),
      'fastapi',
      'c'.repeat(64),
      10000,
    );
    assert.equal(out.coverage.status, 'PARTIAL');
    assert(out.coverage.limitations.length);
  }
});

test('V5 compiler refuses qualifier selection and weak dependency support; returned plan is immutable and shares output budget', async () => {
  const a = await import('../dist/framework-surface-compiler.js'),
    drafts = await import('../dist/framework-extraction.js'),
    binding = await import('../dist/framework-binding-candidate.js');
  const spring = structuredClone(await surfaceContext('J1')),
    autowired = spring.syntaxEvidence.find(
      (s) => s.syntaxKind === 'DECORATION' && s.payload.callee.name === 'Autowired',
    ),
    qualifier = structuredClone(autowired);
  qualifier.id += 'qualifier';
  qualifier.syntaxKey += 'qualifier';
  qualifier.sourceRange = {
    ...qualifier.sourceRange,
    startColumn: qualifier.sourceRange.startColumn + 1,
  };
  qualifier.payload.callee.name = 'Qualifier';
  spring.syntaxEvidence.push(qualifier);
  assert.equal(
    drafts
      .extractFrameworkSurfaceDrafts(spring, 'spring')
      .drafts.filter((d) => d.value.payload.proposal.kind === 'DEPENDENCY').length,
    0,
  );
  const weak = structuredClone(await surfaceContext('P2'));
  weak.syntaxEvidence.find((s) => s.syntaxKind === 'PARAMETER_BINDING').confidence.score = 0.4;
  assert.equal(
    binding
      .compileFrameworkSurfaceBindingCandidate(weak, 'fastapi', 10000)
      .bindings.payload.bindings.filter((b) => b.kind === 'DEPENDENCY').length,
    0,
  );
  const c = await surfaceContext('P5'),
    out = a.compileFrameworkSurfaceCandidate(c, 'fastapi', 'c'.repeat(64), 10000);
  assert(Object.isFrozen(out.sitePlan.entries));
  assert(Object.isFrozen(out.coverage.limitations));
  assert.throws(() => out.sitePlan.entries[0].proofSyntaxKeys.push('fabricated'));
  const p = out.facts.payload,
    baseUnits =
      [...p.entryPoints, ...p.tasks, ...p.dataResources, ...p.triggers, ...p.contracts].reduce(
        (n, r) => n + 1 + r.supportRefs.length,
        0,
      ) +
      p.externalRefs.length +
      p.supportInventory.length +
      out.bindings.payload.bindings.reduce((n, b) => n + 1 + b.supportRefs.length, 0),
    planUnits = out.sitePlan.entries.reduce(
      (n, e) => n + 1 + e.proofSyntaxKeys.length + e.bindingIds.length,
      0,
    );
  assert.throws(() =>
    a.compileFrameworkSurfaceCandidate(
      c,
      'fastapi',
      'c'.repeat(64),
      Math.max(baseUnits, planUnits),
    ),
  );
});

test('V5 built-in factories use explicit routes and actual complete-observation facets without upgrading V4', async () => {
  const a = await import('../dist/index.js');
  assert.equal(typeof a.selectFrameworkPluginsV5, 'function');
  for (const [id, framework, language] of [
    ['J7', 'spring', 'java'],
    ['J4', 'mongo', 'java'],
    ['J2', 'kafka', 'java'],
    ['P5', 'fastapi', 'python'],
  ]) {
    const c = await surfaceContext(id),
      capabilities = [
        'FRAMEWORK_SYNTAX_OBSERVATION_V1',
        language === 'java' ? 'JAVA_CODE_V2' : 'PYTHON_SYNTAX_CODE_V1',
      ],
      plugins = a.selectFrameworkPluginsV5({
        languageId: language,
        frameworkId: framework,
        providerCapabilities: capabilities,
      });
    assert.equal(plugins.length, 1);
    const plugin = plugins[0];
    assert.equal(plugin.describe().pluginVersion, '2.0.0');
    assert.equal(plugin.describe().contextVersion, 5);
    const detection = await plugin.detect(c);
    assert(detection.matched);
    const out = [];
    for await (const candidate of plugin.extract({
      ...c,
      detection,
      maxItems: 10000,
      syntaxMembershipDigest: 'c'.repeat(64),
    }))
      out.push(candidate);
    assert.equal(out.length, 2);
    assert(out.every((v) => v.coverage.status === 'COMPLETE'));
    assert(
      out.every(
        (v) =>
          v.sitePlan.entries.length ===
          c.syntaxEvidence.filter((s) => s.syntaxKind === 'INVOCATION').length,
      ),
    );
    assert.equal(
      a.selectFrameworkPluginsV5({
        languageId: language,
        frameworkId: framework,
        providerCapabilities: [],
      }).length,
      0,
    );
  }
  assert.equal(a.createSpringPluginV4().describe().pluginVersion, '1.0.0');
});

// Pure modified context: tests required-parameter closure, not a new Source capture.
test('V5 Spring keeps an Autowired site unverified if any required parameter type is unproven', async () => {
  const a = await import('../dist/framework-surface-compiler.js');
  const c = structuredClone(await surfaceContext('J1'));
  const param = c.syntaxEvidence.find((s) => s.syntaxKind === 'PARAMETER_BINDING');
  const decl = c.syntaxEvidence.find(
    (s) =>
      s.syntaxKind === 'DECLARATION' && s.owner?.entity.id === param.payload.callableRef.entity.id,
  );
  decl.payload.parameterNames.push('missing');
  const missing = structuredClone(param);
  missing.id += ':missing';
  missing.syntaxKey += ':missing';
  missing.payload.name = 'missing';
  missing.payload.ordinal = 1;
  missing.payload.declaredType = 'MissingType';
  c.syntaxEvidence.push(missing);
  const out = a.compileFrameworkSurfaceCandidate(c, 'spring', 'c'.repeat(64), 10000);
  assert.equal(out.coverage.status, 'PARTIAL');
  assert(out.coverage.limitations.includes('FRAMEWORK_DEPENDENCY_UNPROVEN'));
  assert(out.coverage.unverifiedRefs.length > 0);
});
