import { isUtf8 } from 'node:buffer';
import { types } from 'node:util';
import { ensurePhase1Data } from '@codeatlas/ir';
import { DocumentDraftError, type DocumentAccount } from './source-positions.js';

const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const getter = (name: string) => Object.getOwnPropertyDescriptor(typedArray, name)!.get!;
function rangeCheck(value: unknown): asserts value {
  if (!value) throw new DocumentDraftError('INVALID_DOCUMENT_RANGE');
}

/** Offline transform only. Supplied ranges do not prove complete detection or
 * authorize access/transfer. The caller must protect and recheck the final bytes.
 * Byte offsets/line endings survive; Unicode character columns require reparsing.
 */
export function maskDocumentRanges(
  source: Uint8Array,
  ranges: unknown,
  account: DocumentAccount,
): Buffer {
  try {
    account.checkpoint();
    if (!types.isUint8Array(source) || types.isProxy(source))
      throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    const backing = getter('buffer').call(source) as ArrayBuffer;
    if (types.isSharedArrayBuffer(backing)) throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    const size = getter('byteLength').call(source) as number;
    account.reserveBuffer(size);
    const bytes = Buffer.from(new Uint8Array(backing, getter('byteOffset').call(source), size));
    if (!isUtf8(bytes)) throw new DocumentDraftError('INVALID_DOCUMENT_INPUT');
    account.own(ranges);
    ensurePhase1Data(ranges);
    rangeCheck(Array.isArray(ranges));
    account.own(ranges);
    const fixed = structuredClone(ranges) as { startByte: number; endByte: number }[];
    let previousEnd = 0;
    const boundary = (offset: number) => offset === size || (bytes[offset]! & 192) !== 128;
    for (const range of fixed) {
      account.checkpoint();
      account.visitItem();
      rangeCheck(range !== null && typeof range === 'object' && !Array.isArray(range));
      rangeCheck(
        Object.keys(range).length === 2 &&
          Object.hasOwn(range, 'startByte') &&
          Object.hasOwn(range, 'endByte'),
      );
      const { startByte, endByte } = range;
      rangeCheck(Number.isSafeInteger(startByte) && Number.isSafeInteger(endByte));
      rangeCheck(startByte >= previousEnd && endByte > startByte && endByte <= size);
      rangeCheck(boundary(startByte) && boundary(endByte));
      previousEnd = endByte;
    }
    let selected = 0;
    for (let at = 0; at < size; at++) {
      account.checkpoint();
      account.visitItem();
      while (fixed[selected] && fixed[selected]!.endByte <= at) selected++;
      const range = fixed[selected];
      if (range && range.startByte <= at && bytes[at] !== 13 && bytes[at] !== 10) bytes[at] = 42;
    }
    account.checkpoint();
    return bytes;
  } catch (error) {
    account.invalidate();
    throw error;
  }
}
