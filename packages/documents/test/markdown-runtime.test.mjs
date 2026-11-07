import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import * as positions from '../dist/source-positions.js';
const require = createRequire(import.meta.url);
const parser = () => unified().use(remarkParse).use(remarkGfm);
function account() {
  return {
    invalid: false,
    checkpoint() {},
    own() {},
    reserveBuffer() {},
    visitItem() {},
    invalidate() {
      this.invalid = true;
    },
  };
}

test('approved exact parser versions handle CommonMark/GFM as local data without execution or fetch', () => {
  for (const [name, version] of [
    ['unified', '11.0.5'],
    ['remark-parse', '11.0.0'],
    ['remark-gfm', '4.0.1'],
  ])
    assert.equal(
      JSON.parse(
        readFileSync(path.join(path.dirname(require.resolve(name)), 'package.json'), 'utf8'),
      ).version,
      version,
    );
  const raw =
    '# Same\n\n# Same\n\n| A | B |\n| - | - |\n| x | y |\n\n- [x] task\n\n~~gone~~ [ref][id]\n\n[id]: https://invalid.example/path\n\n```js\nglobalThis.__codeatlasMarkdownExecuted=true\n```\n\n<script>globalThis.__codeatlasMarkdownExecuted=true</script>\n';
  const fetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error('document fetch forbidden');
  };
  try {
    const tree = parser().parse(raw);
    assert.deepEqual(
      tree.children.map((x) => x.type),
      ['heading', 'heading', 'table', 'list', 'paragraph', 'definition', 'code', 'html'],
    );
    assert.equal(tree.children[2].children[1].children[0].children[0].value, 'x');
    assert.equal(tree.children[3].children[0].checked, true);
    assert.equal(tree.children[4].children[0].type, 'delete');
    assert.equal(tree.children[5].url, 'https://invalid.example/path');
    assert.equal(tree.children[6].value, 'globalThis.__codeatlasMarkdownExecuted=true');
    assert.equal(globalThis.__codeatlasMarkdownExecuted, undefined);
  } finally {
    globalThis.fetch = fetch;
  }
});

test('pinned parser BOM-relative UTF16 offsets map to exact original UTF8 positions', () => {
  assert.equal(typeof positions.mapMarkdownOffsets, 'function');
  for (const bom of ['', '\ufeff']) {
    const raw = bom + '# Hi\r\n\r\n中文😀\r\n';
    const tree = parser().parse(raw);
    const first = tree.children[0].children[0].position,
      second = tree.children[1].children[0].position;
    assert.equal(first.start.offset, 2); // Pinned remark strips the leading BOM from offset accounting.
    const out = positions.mapMarkdownOffsets(
      Buffer.from(raw),
      [first.start.offset, first.end.offset, second.start.offset, second.end.offset],
      account(),
    );
    const shift = bom ? 3 : 0;
    assert.deepEqual(out, [
      { line: 0, column: 2 + shift },
      { line: 0, column: 4 + shift },
      { line: 2, column: 0 },
      { line: 2, column: 10 },
    ]);
  }
});

test('Markdown offset adapter rejects surrogate/CRLF splits and invalidates the shared owner', () => {
  assert.equal(typeof positions.mapMarkdownOffsets, 'function');
  for (const [source, offset] of [
    ['\ufeff😀', 1],
    ['\ufeffa\r\nb', 2],
  ]) {
    const a = account();
    assert.throws(() => positions.mapMarkdownOffsets(Buffer.from(source), [offset], a), {
      code: 'INVALID_DOCUMENT_RANGE',
    });
    assert.equal(a.invalid, true);
  }
});

test('project parser lock exactly preserves the audited 69-node closure and root versions', () => {
  const parseYaml = createRequire(new URL('../../runtime/package.json', import.meta.url))(
    'yaml',
  ).parse;
  const raw = readFileSync(
    new URL(
      '../../../docs/superpowers/reviews/2026-11-06-markdown-parser-candidate-lock.yaml',
      import.meta.url,
    ),
  );
  assert.equal(
    createHash('sha256').update(raw).digest('hex'),
    '37aed2cb8c1a3b5306e01420b98a200ddce63ded2d19dd36e45e2d1e7b2c62ba',
  );
  const candidate = parseYaml(raw.toString('utf8'));
  const project = parseYaml(
    readFileSync(new URL('../../../pnpm-lock.yaml', import.meta.url), 'utf8'),
  );
  assert.equal(Object.keys(candidate.packages).length, 69);
  for (const section of ['packages', 'snapshots'])
    for (const [name, value] of Object.entries(candidate[section]))
      assert.deepEqual(project[section][name], value, name);
  const dependencies = project.importers['packages/documents'].dependencies;
  for (const [name, value] of Object.entries(candidate.importers['.'].dependencies))
    assert.deepEqual(dependencies[name], value);
});
