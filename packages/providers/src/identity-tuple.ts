import { createHash } from 'node:crypto';

export class CanonicalIdentityEncodingError extends TypeError {
  constructor(readonly fieldIndex: number) {
    super('Canonical identity fields must contain well-formed Unicode');
    this.name = 'CanonicalIdentityEncodingError';
  }
}

function wellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function digestIdentityTuple(domain: string, fields: readonly (string | number)[]): string {
  const hash = createHash('sha256')
    .update(domain, 'utf8')
    .update(Buffer.from([0]));
  for (const [index, field] of fields.entries()) {
    if (
      typeof field === 'number' &&
      (!Number.isSafeInteger(field) || field < 0 || Object.is(field, -0))
    ) {
      throw new TypeError('Canonical identity coordinates must be non-negative safe integers');
    }
    const value = String(field);
    if (!wellFormedUtf16(value)) throw new CanonicalIdentityEncodingError(index);
    const bytes = Buffer.from(value, 'utf8');
    hash.update(String(bytes.byteLength), 'ascii').update(':', 'ascii').update(bytes);
  }
  return `${domain}:${hash.digest('hex')}`;
}
