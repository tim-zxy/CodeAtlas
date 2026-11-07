import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { types } from 'node:util';
import { ensurePhase1Data } from '@codeatlas/ir';

/** Structural view of the existing owner-supplied shared account; no new ledger/default. */
export interface DocumentAccount {
  checkpoint(): void;
  own(value: unknown): void;
  reserveBuffer(bytes: number): void;
  visitItem(): void;
  invalidate(): void;
}
export class DocumentDraftError extends Error {
  constructor(
    readonly code:
      | 'INVALID_DOCUMENT_INPUT'
      | 'INVALID_DOCUMENT_RANGE'
      | 'DOCUMENT_SOURCE_MISMATCH'
      | 'SEMANTIC_CLAIMS_REQUIRE_WORKFLOW',
  ) {
    super(code);
    this.name = 'DocumentDraftError';
  }
}
function assert(
  value: unknown,
  code: 'INVALID_DOCUMENT_INPUT' | 'INVALID_DOCUMENT_RANGE' = 'INVALID_DOCUMENT_INPUT',
): asserts value {
  if (!value) throw new DocumentDraftError(code);
}
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const byteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')!.get!;
const buffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
export type DocumentPosition = Readonly<{ line: number; column: number }>;

/** Private geometry over an owned, exact original byte copy. No parser/authentication authority. */
export function documentSourceGeometry(source: Uint8Array, account: DocumentAccount) {
  try {
    account.checkpoint();
    assert(types.isUint8Array(source) && !types.isProxy(source));
    const backing = buffer.call(source) as ArrayBuffer;
    assert(!types.isSharedArrayBuffer(backing));
    const length = byteLength.call(source) as number;
    account.reserveBuffer(length);
    const bytes = Buffer.from(new Uint8Array(backing, byteOffset.call(source), length));
    account.checkpoint();
    assert(isUtf8(bytes));
    account.checkpoint();
    const starts = [0],
      ends: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      account.checkpoint();
      account.visitItem();
      if (bytes[i] === 10 || bytes[i] === 13) {
        const end = i;
        if (bytes[i] === 13 && bytes[i + 1] === 10) i++;
        account.own({ start: i + 1, end });
        ends.push(end);
        starts.push(i + 1);
      }
    }
    ends.push(bytes.length);
    const fingerprint = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    account.checkpoint();
    const column = (line: number, offset: number) => {
      account.checkpoint();
      account.visitItem();
      assert(
        Number.isSafeInteger(line) && line >= 0 && line < starts.length,
        'INVALID_DOCUMENT_RANGE',
      );
      assert(
        Number.isSafeInteger(offset) && offset >= 0 && offset <= ends[line]! - starts[line]!,
        'INVALID_DOCUMENT_RANGE',
      );
      const absolute = starts[line]! + offset;
      assert(absolute === ends[line] || (bytes[absolute]! & 192) !== 128, 'INVALID_DOCUMENT_RANGE');
    };
    const geometry = Object.freeze({
      fingerprint,
      sizeBytes: bytes.length,
      leadingBomUtf16Units: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 1 : 0,
      assertRange(range: {
        startLine: number;
        startColumn: number;
        endLine: number;
        endColumn: number;
      }) {
        try {
          account.own(range);
          ensurePhase1Data(range);
          column(range.startLine, range.startColumn);
          column(range.endLine, range.endColumn);
          assert(
            range.endLine > range.startLine ||
              (range.endLine === range.startLine && range.endColumn >= range.startColumn),
            'INVALID_DOCUMENT_RANGE',
          );
          account.checkpoint();
        } catch (error) {
          account.invalidate();
          throw error;
        }
      },
      positionsAt(offsets: readonly number[]): readonly DocumentPosition[] {
        try {
          account.checkpoint();
          account.own(offsets);
          ensurePhase1Data(offsets);
          assert(Array.isArray(offsets));
          account.own(offsets);
          const fixedOffsets = [...offsets];
          const ordered = fixedOffsets
            .map((offset, index) => {
              account.visitItem();
              assert(
                Number.isSafeInteger(offset) && offset >= 0 && offset <= bytes.length,
                'INVALID_DOCUMENT_RANGE',
              );
              account.own({ offset, index });
              return { offset, index };
            })
            .sort((a, b) => {
              account.checkpoint();
              account.visitItem();
              return a.offset - b.offset || a.index - b.index;
            });
          const result: DocumentPosition[] = [];
          let utf16 = 0,
            at = 0,
            line = 0,
            col = 0,
            next = 0;
          for (;;) {
            account.checkpoint();
            account.visitItem();
            while (ordered[next]?.offset === utf16) {
              account.own({ line, column: col });
              result[ordered[next]!.index] = Object.freeze({ line, column: col });
              next++;
            }
            if (at === bytes.length) break;
            const first = bytes[at]!;
            let width = first < 128 ? 1 : first < 224 ? 2 : first < 240 ? 3 : 4;
            let units = width === 4 ? 2 : 1;
            if (first === 13 && bytes[at + 1] === 10) {
              width = 2;
              units = 2;
            }
            assert(
              !ordered[next] || ordered[next]!.offset >= utf16 + units,
              'INVALID_DOCUMENT_RANGE',
            );
            if (first === 10 || first === 13) {
              line++;
              col = 0;
            } else col += width;
            at += width;
            utf16 += units;
          }
          assert(next === ordered.length, 'INVALID_DOCUMENT_RANGE');
          account.checkpoint();
          return Object.freeze(result);
        } catch (error) {
          account.invalidate();
          throw error;
        }
      },
    });
    account.checkpoint();
    return geometry;
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
export function mapDocumentOffsets(
  source: Uint8Array,
  offsets: readonly number[],
  account: DocumentAccount,
) {
  return documentSourceGeometry(source, account).positionsAt(offsets);
}

/** Pinned remark/micromark offsets omit one leading BOM. Restore original UTF16
 * offsets before mapping to original zero-based UTF8 byte coordinates. No parse,
 * Source authorization, redaction or publication authority is supplied here. */
export function mapMarkdownOffsets(
  source: Uint8Array,
  offsets: readonly number[],
  account: DocumentAccount,
): readonly DocumentPosition[] {
  try {
    account.own(offsets);
    ensurePhase1Data(offsets);
    assert(Array.isArray(offsets));
    account.own(offsets);
    const fixed = offsets.map((offset) => {
      assert(
        Number.isSafeInteger(offset) && offset >= 0 && !Object.is(offset, -0),
        'INVALID_DOCUMENT_RANGE',
      );
      return offset;
    });
    const geometry = documentSourceGeometry(source, account);
    account.own(fixed);
    const original = fixed.map((offset) => offset + geometry.leadingBomUtf16Units);
    return geometry.positionsAt(original);
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
