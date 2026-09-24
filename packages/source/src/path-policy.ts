import type { RepositoryRelativePath } from '@codeatlas/ir';

import { SourceScanError } from './errors.js';
import type { SourceScanRequest } from './types.js';

type Decision = 'DENY' | 'INCLUDE' | 'DEFAULT';
type Pattern = readonly string[];

export interface CompiledPathPolicy {
  decision(path: RepositoryRelativePath): Decision;
  mayDescend(directory: string): boolean;
  couldIncludeDescendant(directory: string): boolean;
}

function parsePattern(value: unknown): Pattern {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    /^[A-Za-z]:\//.test(value) ||
    value.includes('\\') ||
    value.startsWith('!') ||
    value.endsWith('/')
  ) {
    throw new SourceScanError('INVALID_INPUT', 'Invalid source path pattern');
  }
  const segments = value.split('/');
  if (
    segments.some(
      (part) =>
        part === '' || part === '.' || part === '..' || (part.includes('**') && part !== '**'),
    )
  ) {
    throw new SourceScanError('INVALID_INPUT', 'Invalid source path pattern');
  }
  return segments;
}

function segmentMatches(pattern: string, segment: string): boolean {
  let expression = '^';
  for (const character of pattern) {
    if (character === '*') expression += '.*';
    else if (character === '?') expression += '.';
    else expression += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(`${expression}$`, 'u').test(segment);
}

function matches(pattern: Pattern, path: readonly string[]): boolean {
  const memo = new Map<string, boolean>();
  const visit = (patternIndex: number, pathIndex: number): boolean => {
    const key = `${patternIndex}:${pathIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let answer = false;
    if (patternIndex === pattern.length) answer = pathIndex === path.length;
    else if (pattern[patternIndex] === '**') {
      answer =
        visit(patternIndex + 1, pathIndex) ||
        (pathIndex < path.length && visit(patternIndex, pathIndex + 1));
    } else if (
      pathIndex < path.length &&
      segmentMatches(pattern[patternIndex]!, path[pathIndex]!)
    ) {
      answer = visit(patternIndex + 1, pathIndex + 1);
    }
    memo.set(key, answer);
    return answer;
  };
  return visit(0, 0);
}

function canMatchDescendant(pattern: Pattern, directory: readonly string[]): boolean {
  const memo = new Map<string, boolean>();
  const visit = (patternIndex: number, directoryIndex: number): boolean => {
    const key = `${patternIndex}:${directoryIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let answer = false;
    if (directoryIndex === directory.length) answer = patternIndex < pattern.length;
    else if (patternIndex < pattern.length) {
      if (pattern[patternIndex] === '**') {
        answer = visit(patternIndex + 1, directoryIndex) || visit(patternIndex, directoryIndex + 1);
      } else if (segmentMatches(pattern[patternIndex]!, directory[directoryIndex]!)) {
        answer = visit(patternIndex + 1, directoryIndex + 1);
      }
    }
    memo.set(key, answer);
    return answer;
  };
  return visit(0, 0);
}

function hardDenied(path: readonly string[]): boolean {
  return path.some((segment) => {
    const lower = segment.toLowerCase();
    return (
      ['.git', '.hg', '.svn', '.ekp', 'secrets', 'credentials'].includes(lower) ||
      lower.startsWith('.env') ||
      ['.pem', '.p12', '.pfx', '.key'].some((suffix) => lower.endsWith(suffix)) ||
      ['id_rsa', 'id_ed25519'].includes(lower)
    );
  });
}

function defaultExcluded(path: readonly string[]): boolean {
  return path.some((segment) =>
    ['build', 'dist', 'target', 'vendor', 'node_modules', '.gitignore'].includes(
      segment.toLowerCase(),
    ),
  );
}

export function compilePathPolicy(config: SourceScanRequest['config']): CompiledPathPolicy {
  if (!config || !Array.isArray(config.include) || !Array.isArray(config.exclude)) {
    throw new SourceScanError('INVALID_INPUT', 'Invalid source path configuration');
  }
  for (const patterns of [config.include, config.exclude]) {
    for (let index = 0; index < patterns.length; index += 1) {
      if (!Object.hasOwn(patterns, index)) {
        throw new SourceScanError('INVALID_INPUT', 'Invalid source path configuration');
      }
    }
  }
  const included = config.include.map(parsePattern);
  const excluded = config.exclude.map(parsePattern);
  const decision = (path: RepositoryRelativePath): Decision => {
    const parts = path.split('/');
    if (hardDenied(parts) || excluded.some((pattern) => matches(pattern, parts))) return 'DENY';
    if (included.some((pattern) => matches(pattern, parts))) return 'INCLUDE';
    return 'DEFAULT';
  };
  const couldIncludeDescendant = (directory: string): boolean => {
    const parts = directory.split('/');
    return included.some((pattern) => canMatchDescendant(pattern, parts));
  };
  return {
    decision,
    couldIncludeDescendant,
    mayDescend(directory) {
      const parts = directory.split('/');
      if (hardDenied(parts) || excluded.some((pattern) => matches(pattern, parts))) return false;
      return !defaultExcluded(parts) || couldIncludeDescendant(directory);
    },
  };
}

export function selectPath(
  path: RepositoryRelativePath,
  policy: CompiledPathPolicy,
  ignoredByGit: boolean,
): boolean {
  const decision = policy.decision(path);
  return (
    decision === 'INCLUDE' ||
    (decision === 'DEFAULT' && !ignoredByGit && !defaultExcluded(path.split('/')))
  );
}
