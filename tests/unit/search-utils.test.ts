import { describe, expect, it } from 'vitest';
import { hasQuery, normalizeQuery, wildcard } from '../../src/lib/server/search-utils';

describe('search-utils', () => {
  it('normalizes query text', () => {
    expect(normalizeQuery('  The Clash  ')).toBe('the clash');
  });

  it('detects valid query input', () => {
    expect(hasQuery('  ok  ')).toBe(true);
    expect(hasQuery('   ')).toBe(false);
    expect(hasQuery(undefined)).toBe(false);
  });

  it('builds wildcard string', () => {
    expect(wildcard('Pink Floyd')).toBe('%pink floyd%');
  });
});
