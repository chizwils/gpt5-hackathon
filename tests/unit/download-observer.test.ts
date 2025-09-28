import { describe, expect, it } from 'vitest';
import { __test } from '@/background/download-observer';

const { getDomain } = __test;

describe('download observer helpers', () => {
  it('extracts hostnames from well-formed URLs', () => {
    expect(getDomain('https://example.com/path/file.zip')).toBe('example.com');
  });

  it('falls back to raw strings when parsing fails', () => {
    expect(getDomain('not-a-valid-url')).toBe('not-a-valid-url');
  });

  it('returns unknown when URL missing', () => {
    expect(getDomain(undefined)).toBe('unknown');
  });
});
