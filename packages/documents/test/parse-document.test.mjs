import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const base = JSON.parse(readFileSync(new URL('./fixtures/source-draft.json', import.meta.url)));
function account() {
  return {
    invalid: false,
    checkpoint() {
      if (this.invalid) throw Error('invalid');
    },
    own() {
      this.checkpoint();
    },
    reserveBuffer() {},
    visitItem() {
      this.checkpoint();
    },
    invalidate() {
      this.invalid = true;
    },
  };
}
function input(source, kind = 'MARKDOWN') {
  let next = 0;
  const { blockRefs, diagnostics, completeness, parserVersion, ...revision } = structuredClone(
    base.envelope.payload.revision,
  );
  revision.sourceFingerprint = 'sha256:' + createHash('sha256').update(source).digest('hex');
  return {
    document: { ...base.envelope.payload.document, sourceKind: kind },
    revision,
    allocateId: () => `opaque:${++next}`,
  };
}
async function parse(raw, kind) {
  const source = Buffer.from(raw);
  return (await import('../dist/parse-document.js')).parseDocument(
    source,
    input(source, kind),
    account(),
  );
}
test('unrepresentable whitespace link target preserves literal with original BOM/CRLF range and valid neighbors', async () => {
  const out = (await parse('\ufeff[x](< >) [ok](./ok.md) [](./empty.md)\r\n')).payload;
  assert.equal(out.blocks[0].payload.text, '[x](< >) ok ');
  assert.equal(out.revision.completeness, 'PARTIAL');
  assert.deepEqual(
    out.links.map((link) => [link.typedContent.label, link.typedContent.target]),
    [
      ['ok', './ok.md'],
      ['', './empty.md'],
    ],
  );
  assert.deepEqual(out.revision.diagnostics, [
    {
      code: 'MARKDOWN_LINK_TARGET_NOT_TYPED',
      sourceRange: {
        documentRevisionId: 'doc-revision:one',
        startLine: 0,
        startColumn: 3,
        endLine: 0,
        endColumn: 11,
      },
    },
  ]);
  assert.deepEqual(out.claims, []);
});
for (const [name, raw, content] of [
  ['heading', '# [x](< >) [ok](./ok.md)\n', (out) => out.blocks[0].payload.text],
  ['list', '- [x](< >) [ok](./ok.md)\n', (out) => out.blocks[0].payload.items[0].text],
  ['quote', '> [x](< >) [ok](./ok.md)\n', (out) => out.blocks[0].payload.text],
  [
    'table',
    '| X |\n| - |\n| [x](< >) [ok](./ok.md) |\n',
    (out) => out.tables[0].typedContent.rows[0][0],
  ],
])
  test(`unrepresentable link target preserves inline syntax inside ${name}`, async () => {
    const out = (await parse(raw)).payload;
    assert.equal(content(out), '[x](< >) ok');
    assert.equal(out.revision.completeness, 'PARTIAL');
    assert.deepEqual(
      out.links.map((link) => link.typedContent.target),
      ['./ok.md'],
    );
    assert.ok(out.revision.diagnostics.some((d) => d.code === 'MARKDOWN_LINK_TARGET_NOT_TYPED'));
    assert.deepEqual(out.claims, []);
  });
test('empty destinations preserve raw inline syntax without creating same-document target rules', async () => {
  const out = (await parse('[empty]() [ok](./ok.md)\n')).payload;
  assert.equal(
    out.revision.parserVersion,
    'codeatlas-markdown-adapter-v1.2/unified-11.0.5/remark-parse-11.0.0/remark-gfm-4.0.1',
  );
  assert.equal(out.blocks[0].payload.text, '[empty]() ok');
  assert.equal(out.revision.completeness, 'PARTIAL');
  assert.deepEqual(
    out.links.map((link) => link.typedContent.target),
    ['./ok.md'],
  );
});
for (const [label, language] of [
  ['entity whitespace', '&#32;'],
  ['NBSP', '\u00a0'],
])
  test(`unrepresentable fenced ${label} language preserves whole raw fence and neighboring CODE`, async () => {
    const fence = '```' + language + '\r\nx\r\n```';
    const out = (
      await parse('\ufeff' + fence + '\r\n\r\n```js\r\nsafe\r\n```\r\n\r\n```\r\nplain\r\n```\r\n')
    ).payload;
    assert.deepEqual(
      out.blocks.map((block) => block.kind),
      ['OTHER', 'CODE', 'CODE'],
    );
    assert.equal(out.blocks[0].payload.text, fence);
    assert.deepEqual(out.blocks[0].sourceRange, {
      documentRevisionId: 'doc-revision:one',
      startLine: 0,
      startColumn: 3,
      endLine: 2,
      endColumn: 3,
    });
    assert.deepEqual(
      out.codeSnippets.map((snippet) => snippet.typedContent.language),
      ['js', null],
    );
    assert.deepEqual(
      out.blocks.slice(1).map((block) => block.payload.text),
      ['safe', 'plain'],
    );
    assert.equal(out.revision.completeness, 'PARTIAL');
    assert.deepEqual(
      out.revision.diagnostics.map((diagnostic) => diagnostic.code),
      ['MARKDOWN_CODE_LANGUAGE_NOT_TYPED'],
    );
    assert.equal(
      out.revision.parserVersion,
      'codeatlas-markdown-adapter-v1.2/unified-11.0.5/remark-parse-11.0.0/remark-gfm-4.0.1',
    );
    assert.deepEqual(out.claims, []);
  });
test('literal BOM CRLF Unicode coordinates and repeated heading identities', async () => {
  const out = (
    await parse('\ufeff# Same\r\n\r\n\u4e2d\ud83d\ude00\r\n\r\n## Same\r\n\r\n# Same\r\n')
  ).payload;
  assert.deepEqual(
    out.blocks.map((b) => [
      b.kind,
      b.sourceRange.startLine,
      b.sourceRange.startColumn,
      b.sourceRange.endLine,
      b.sourceRange.endColumn,
    ]),
    [
      ['HEADING', 0, 3, 0, 9],
      ['PARAGRAPH', 2, 0, 2, 7],
      ['HEADING', 4, 0, 4, 7],
      ['HEADING', 6, 0, 6, 6],
    ],
  );
  assert.deepEqual(
    out.sections.map((s) => [s.id, s.parentSectionId, s.title]),
    [
      ['opaque:1', null, 'Same'],
      ['opaque:4', 'opaque:1', 'Same'],
      ['opaque:6', null, 'Same'],
    ],
  );
  assert.equal(out.revision.completeness, 'COMPLETE');
  assert.deepEqual(out.claims, []);
  assert.ok(Object.isFrozen(out.blocks[0]));
});
test('real GFM parser yields literal list, quote, code, table and reference link structure', async () => {
  const out = (
    await parse(
      '# ADR 1\n\n## Decision\n\n- alpha\n- beta\n\n> words\n\n```js\nthrow Error("never")\n```\n\n| A | B |\n| - | - |\n| x | y |\n\n[local](./a.md) and [ref][id]\n\n[id]: https://invalid.example/a\n',
      'ADR',
    )
  ).payload;
  assert.equal(out.document.sourceKind, 'ADR');
  assert.deepEqual(
    out.blocks.map((b) => b.kind),
    ['HEADING', 'HEADING', 'LIST', 'QUOTE', 'CODE', 'TABLE', 'PARAGRAPH', 'OTHER'],
  );
  assert.deepEqual(out.blocks[2].payload, {
    ordered: false,
    items: [
      { text: 'alpha', blockRefs: [] },
      { text: 'beta', blockRefs: [] },
    ],
  });
  assert.deepEqual(out.blocks[3].payload, { text: 'words' });
  assert.deepEqual(out.tables[0].typedContent, { headers: ['A', 'B'], rows: [['x', 'y']] });
  assert.equal(
    out.codeSnippets[0].typedContent.textDigest,
    createHash('sha256').update('throw Error("never")').digest('hex'),
  );
  assert.deepEqual(
    out.links.map((l) => [l.typedContent.label, l.typedContent.target, l.typedContent.resolution]),
    [
      ['local', './a.md', 'UNRESOLVED'],
      ['ref', 'https://invalid.example/a', 'EXTERNAL'],
    ],
  );
  // The blank line after the final table row puts links on original line 17.
  assert.deepEqual(
    out.links.map((l) => [
      l.sourceRange.startLine,
      l.sourceRange.startColumn,
      l.sourceRange.endColumn,
    ]),
    [
      [17, 0, 15],
      [17, 20, 29],
    ],
  );
  assert.equal(out.revision.completeness, 'PARTIAL'); // Definition is preserved as OTHER.
  assert.ok(out.revision.diagnostics.some((d) => d.code === 'MARKDOWN_BLOCK_PRESERVED_AS_OTHER'));
});
test('metadata and raw bytes are independent before trusted allocator callbacks', async () => {
  const { parseDocument, MARKDOWN_PARSER_VERSION } = await import('../dist/parse-document.js');
  const source = Buffer.from('# Title\n\nbody\n'),
    i = input(source),
    before = structuredClone(i.revision);
  let next = 0;
  i.allocateId = (kind) => {
    source.fill(0);
    i.document.logicalPath = 'mutated.md';
    i.revision.sourceBasis.repositoryId = 'repo:mutated';
    return `caller:${kind}:${++next}`;
  };
  const out = parseDocument(source, i, account()).payload;
  assert.equal(out.document.logicalPath, 'docs/service.md');
  assert.deepEqual(out.revision.sourceBasis, before.sourceBasis);
  assert.equal(out.revision.sourceFingerprint, before.sourceFingerprint);
  assert.equal(out.revision.parserVersion, MARKDOWN_PARSER_VERSION);
  assert.deepEqual(
    out.blocks.map((b) => b.payload.text),
    ['Title', 'body'],
  );
});
test('strict metadata refuses accessors and extra fields before any allocator', async () => {
  const { parseDocument } = await import('../dist/parse-document.js');
  for (const change of [
    (i) => (i.document.extra = true),
    (i) => (i.revision.parserVersion = 'caller-cannot-label-parser'),
    (i) =>
      Object.defineProperty(i.document, 'logicalPath', {
        enumerable: true,
        get() {
          throw Error('getter executed');
        },
      }),
  ]) {
    const source = Buffer.from('# a'),
      i = input(source),
      a = account();
    let allocations = 0;
    i.allocateId = () => {
      allocations++;
      return 'unused';
    };
    change(i);
    assert.throws(
      () => parseDocument(source, i, a),
      (error) => error.message !== 'getter executed',
    );
    assert.equal(allocations, 0);
    assert.equal(a.invalid, true);
  }
});
test('empty documents, setext headings and ordinary inline/link text use existing fields', async () => {
  const empty = (await parse('')).payload;
  assert.deepEqual(empty.blocks, []);
  assert.equal(empty.revision.completeness, 'COMPLETE');
  const out = (await parse('Title\n=====\n\n**bold** _em_ ~~old~~ `code` [x](#Title)\n')).payload;
  assert.deepEqual(
    out.blocks.map((b) => b.payload.text),
    ['Title', 'bold em old code x'],
  );
  assert.deepEqual(out.blocks[0].sourceRange, {
    documentRevisionId: 'doc-revision:one',
    startLine: 0,
    startColumn: 0,
    endLine: 1,
    endColumn: 5,
  });
  assert.equal(out.links[0].typedContent.resolution, 'UNRESOLVED');
  assert.deepEqual(out.links[0].typedContent.candidates, []);
  assert.equal(out.links[0].typedContent.targetRef, null);
});
test('nested list/container and unrepresented list numbering are explicit partial structures', async () => {
  const out = (await parse('- outer\n  - inner\n\n> # nested\n\n3. third\n')).payload;
  assert.deepEqual(
    out.blocks.map((b) => b.kind),
    ['OTHER', 'OTHER', 'LIST'],
  );
  assert.equal(out.blocks[0].payload.text, '- outer\n  - inner');
  assert.equal(out.blocks[1].payload.text, '> # nested');
  assert.equal(out.sections.length, 0);
  assert.equal(out.revision.completeness, 'PARTIAL');
  assert.deepEqual(
    out.revision.diagnostics.map((d) => d.code),
    [
      'MARKDOWN_BLOCK_PRESERVED_AS_OTHER',
      'MARKDOWN_BLOCK_PRESERVED_AS_OTHER',
      'MARKDOWN_LIST_START_NOT_TYPED',
    ],
  );
});
test('table alignment and fenced metadata are explicit limitations of the existing field whitelist', async () => {
  const out = (await parse('| A | B |\n| :- | -: |\n| x | y |\n\n```js title=x\ntext\n```\n'))
    .payload;
  assert.equal(out.revision.completeness, 'PARTIAL');
  assert.deepEqual(
    out.revision.diagnostics.map((d) => d.code),
    ['MARKDOWN_TABLE_ALIGNMENT_NOT_TYPED', 'MARKDOWN_CODE_META_NOT_TYPED'],
  );
  assert.deepEqual(out.tables[0].typedContent, { headers: ['A', 'B'], rows: [['x', 'y']] });
  assert.deepEqual(out.blocks[1].payload.text, 'text');
});
for (const [name, row, endColumn] of [
  ['short', '| x |', 5],
  ['long', '| x | y | overflow |', 20],
])
  test(`legal GFM ${name} row preserves whole raw table as OTHER/PARTIAL`, async () => {
    const rawTable = `| A | B |\r\n| - | - |\r\n${row}`;
    const out = (await parse(`\ufeff# Table\r\n\r\n${rawTable}\r\n\r\nafter\r\n`)).payload;
    assert.deepEqual(
      out.blocks.map((block) => block.kind),
      ['HEADING', 'OTHER', 'PARAGRAPH'],
    );
    assert.equal(out.blocks[1].payload.text, rawTable);
    assert.deepEqual(out.blocks[1].sourceRange, {
      documentRevisionId: 'doc-revision:one',
      startLine: 2,
      startColumn: 0,
      endLine: 4,
      endColumn,
    });
    assert.deepEqual(out.tables, []);
    assert.equal(out.revision.completeness, 'PARTIAL');
    assert.deepEqual(out.revision.diagnostics, [
      {
        code: 'MARKDOWN_TABLE_ROW_WIDTH_NOT_TYPED',
        sourceRange: out.blocks[1].sourceRange,
      },
    ]);
    assert.equal(out.blocks[2].payload.text, 'after');
    assert.deepEqual(out.claims, []);
  });

test('unsupported structure remains raw OTHER with explicit PARTIAL, HTML and URLs never execute', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error('fetch forbidden');
  };
  try {
    const out = (
      await parse(
        '<script>globalThis.__documentExecuted=true</script>\n\n- [x] task\n\n> # nested\n\n![pic](https://invalid.example/image)\n',
      )
    ).payload;
    assert.equal(globalThis.__documentExecuted, undefined);
    assert.equal(out.blocks[0].payload.text, '<script>globalThis.__documentExecuted=true</script>');
    assert.equal(out.revision.completeness, 'PARTIAL');
    assert.ok(out.revision.diagnostics.length >= 3);
    assert.deepEqual(out.claims, []);
  } finally {
    globalThis.fetch = original;
  }
});
test('source mismatch, duplicate allocator IDs, invalid UTF8 and cancellation invalidate owner', async () => {
  const { parseDocument } = await import('../dist/parse-document.js');
  for (const mutate of [
    (i) => (i.revision.sourceFingerprint = 'sha256:' + '0'.repeat(64)),
    (i) => (i.allocateId = () => 'duplicate'),
  ]) {
    const bytes = Buffer.from('# a\n\np\n'),
      i = input(bytes),
      a = account();
    mutate(i);
    assert.throws(() => parseDocument(bytes, i, a));
    assert.equal(a.invalid, true);
  }
  const a = account();
  assert.throws(() => parseDocument(Buffer.from([255]), input(Buffer.from([255])), a));
  assert.equal(a.invalid, true);
  const b = account(),
    stop = Error('cancel');
  b.visitItem = () => {
    throw stop;
  };
  assert.throws(
    () => parseDocument(Buffer.from('text'), input(Buffer.from('text')), b),
    (e) => e === stop,
  );
  assert.equal(b.invalid, true);
});
