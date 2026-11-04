import { readFileSync } from 'node:fs';
const base = new URL('./', import.meta.url);
export const cases = JSON.parse(readFileSync(new URL('cases.json', base)));
export function loadCase(c) {
  return {
    input: JSON.parse(readFileSync(new URL(c.input, base))),
    expected: JSON.parse(readFileSync(new URL(c.expected, base))),
  };
}
