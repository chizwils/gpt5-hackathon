import { beforeEach, describe, expect, it } from 'vitest';
import { __test } from '@/background/behaviour-observer';

const { cacheTabSnapshot, clearCaches, getCachedTab, toTabMeta, classifyBulkClose } = __test;

describe('behaviour observer helpers', () => {
  beforeEach(() => {
    clearCaches();
  });

  it('normalises cached tab snapshots with fallbacks', () => {
    cacheTabSnapshot({
      id: 42,
      url: 'https://semantic.memory/dev',
      windowId: 1,
      pinned: false
    } as chrome.tabs.Tab);

    const cached = getCachedTab(42);
    expect(cached?.title).toBe('https://semantic.memory/dev');
    expect(cached?.pinned).toBe(false);
  });

  it('produces minimal tab metadata for timeline entries', () => {
    const meta = toTabMeta({
      id: 5,
      title: 'Research deck',
      url: 'https://example.com',
      windowId: 2,
      pinned: true
    });

    expect(meta).toEqual({ title: 'Research deck', url: 'https://example.com' });
  });
});

it('classifies close-to-right sequences when indices are after anchor', () => {
  const tabs = [
    { id: 1, title: 'A', url: 'a', windowId: 1, pinned: false, index: 2 },
    { id: 2, title: 'B', url: 'b', windowId: 1, pinned: false, index: 3 }
  ];
  const result = classifyBulkClose(tabs as any, { id: 99, index: 1 });
  expect(result).toBe('close_to_right');
});

it('classifies close-others sequences when indices wrap both sides', () => {
  const tabs = [
    { id: 1, title: 'A', url: 'a', windowId: 1, pinned: false, index: 0 },
    { id: 2, title: 'B', url: 'b', windowId: 1, pinned: false, index: 2 }
  ];
  const result = classifyBulkClose(tabs as any, { id: 42, index: 1 });
  expect(result).toBe('close_others');
});
