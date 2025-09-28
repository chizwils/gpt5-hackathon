import { describe, expect, it } from 'vitest';
import { __test } from '@/background/recap-aggregator';

const { deriveTopicTags, formatRecency, summariseText } = __test;

describe('recap aggregator helpers', () => {
  it('derives topic tags from meaningful text', () => {
    const tags = deriveTopicTags('This GDPR report covers AI compliance and privacy obligations for ML teams.');
    expect(tags).toContain('privacy');
    expect(tags).toContain('ai');
    expect(tags).toContain('research');
  });

  it('formats recency buckets', () => {
    expect(formatRecency(0.25)).toBe('15 minutes ago');
    expect(formatRecency(3.6)).toBe('4 hours ago');
    expect(formatRecency(48)).toBe('2 days ago');
    expect(formatRecency(-1)).toBe('just now');
  });

  it('summarises long text with an ellipsis', () => {
    const longText = 'a'.repeat(400);
    const summary = summariseText(longText, 50);
    expect(summary.length).toBeLessThanOrEqual(50);
    expect(summary.endsWith('…')).toBe(true);
  });
});
