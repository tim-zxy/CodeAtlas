import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const expected = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/syntax-contract/call-result-coverage/expected.json',
      import.meta.url,
    ),
  ),
);
const metadata = JSON.parse(
  readFileSync(
    new URL(
      '../../../fixtures/phase1/mixed-analysis-store/binding-history/inputs.json',
      import.meta.url,
    ),
  ),
).metadata;
const budget = () => ({
  limits: {
    maxSerializedBytes: Number.MAX_SAFE_INTEGER,
    maxItems: Number.MAX_SAFE_INTEGER,
    maxDepth: Number.MAX_SAFE_INTEGER,
  },
  budget: { serializedBytes: 0, items: 0 },
});
for (const name of ['python-direct.py', 'python-nested.py'])
  test(
    'call-result revised actual coverage: ' + name,
    {
      skip: process.env.CODEATLAS_CALL_RESULT_LIBRARY_OUTPUT
        ? false
        : 'Requires explicitly selected new Rust library capture',
    },
    async () => {
      const { composeBindingProjectionForHistory: compose } =
        await import('../dist/native-composition.js');
      const { validateBindingSyntaxObservationStreamWithBudget: validate } =
        await import('../dist/native-binding-stream.js');
      const root = process.env.CODEATLAS_CALL_RESULT_LIBRARY_OUTPUT,
        rb = readFileSync(root + '/' + name + '.request.jsonl'),
        ob = readFileSync(root + '/' + name + '.output.jsonl');
      const p = JSON.parse(rb).payload,
        m = structuredClone(metadata);
      m.targetSource = p.targetSource;
      m.inventory = p.sourceFiles;
      const checked = validate(rb, ob, budget()).observation;
      for (const key of ['outcome', 'syntaxOutcome', 'codeOutcome'])
        assert.equal(checked[key], expected.capture[name][key]);
      if (name === 'python-direct.py') {
        const out = compose(m, rb, ob, budget());
        assert.equal(out.candidate.provenance.codeSyntax.kind, 'RAW_V6');
        const syntax = checked.events
          .filter((e) => e.type === 'SYNTAX_OBSERVATION')
          .map((e) => e.payload);
        const app = syntax.find(
          (s) => s.syntaxKind === 'ASSIGNMENT' && s.payload.targetName === 'app',
        );
        assert.deepEqual(app.payload.value, { kind: 'UNKNOWN', reason: 'CALL_RESULT' });
        const calls = syntax.filter(
          (s) =>
            s.syntaxKind === 'INVOCATION' &&
            JSON.stringify(s.sourceRange) === JSON.stringify(app.payload.valueRange),
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0].payload.callee.name, 'FastAPI');
        assert.deepEqual(calls[0].lexicalScope, app.lexicalScope);
      } else
        assert.throws(
          () => compose(m, rb, ob, budget()),
          (e) => e.code === 'INCOMPLETE_OBSERVATION',
        );
      const broken = Buffer.from(ob);
      broken[3] = 33;
      assert.throws(() => compose(m, rb, broken, budget()));
    },
  );
