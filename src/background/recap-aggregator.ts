/* eslint-env browser */
import { db } from '@data/db';
import { recordTimelineEntry } from '@data/memory-service';
import type { PageRecord } from '@data';

const RECENT_WINDOW_HOURS = 12;

const TOPIC_KEYWORDS = [
  { tag: 'privacy', keywords: ['gdpr', 'privacy', 'compliance', 'consent', 'regulation'] },
  { tag: 'ai', keywords: ['ai', 'gpt', 'ml', 'llm', 'model', 'neural'] },
  { tag: 'research', keywords: ['study', 'report', 'analysis', 'insights', 'overview'] },
  { tag: 'productivity', keywords: ['workflow', 'productivity', 'note', 'task', 'organize'] }
];

const getHoursAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  return diff / (1000 * 60 * 60);
};

const summariseText = (text: string, limit = 280) => {
  if (!text) return '';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed;
};

const deriveTopicTags = (text: string) => {
  const lower = text.toLowerCase();
  const tags = new Set<string>();
  for (const topic of TOPIC_KEYWORDS) {
    if (topic.keywords.some((keyword) => lower.includes(keyword))) {
      tags.add(topic.tag);
    }
  }
  return Array.from(tags);
};

const formatRecency = (hoursAgo: number) => {
  if (!Number.isFinite(hoursAgo) || hoursAgo < 0) return 'just now';
  if (hoursAgo < 1) {
    const minutes = Math.max(1, Math.round(hoursAgo * 60));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (hoursAgo < 24) {
    const hours = Math.round(hoursAgo);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(hoursAgo / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
};

const sortAndUnique = (values: string[]) => Array.from(new Set(values)).sort();

interface SessionRecapMetadata {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  pageCount: number;
  pages: Array<{
    id: string;
    title: string;
    url: string;
    summary: string;
    capturedAt: string;
    lastInteractionAt: string;
    confidenceTags: string[];
  }>;
}

export const runSessionAggregation = async () => {
  const sessions = await db.sessions.orderBy('startedAt').reverse().limit(50).toArray();
  const activeSessionIds = new Set<string>();

  for (const session of sessions) {
    if (!session.pageIds?.length) continue;

    const pages = (await db.pages.bulkGet(session.pageIds)).filter((page): page is PageRecord => Boolean(page));
    if (!pages.length) continue;

    const recentPages = pages.filter((page) => getHoursAgo(page.lastInteractionAt) <= RECENT_WINDOW_HOURS);
    if (!recentPages.length) continue;

    activeSessionIds.add(session.id);

    const mostRecent = recentPages.reduce((latest, page) =>
      new Date(page.lastInteractionAt).getTime() > new Date(latest.lastInteractionAt).getTime() ? page : latest
    );

    const derivedTags = new Set<string>(['session-recap']);
    for (const page of recentPages) {
      (page.confidenceTags ?? []).forEach((tag) => derivedTags.add(tag));
      deriveTopicTags((page.summary ?? page.rawText).slice(0, 1200)).forEach((tag) => derivedTags.add(tag));
    }

    const sortedPages = [...recentPages].sort(
      (a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime()
    );

    const metadata: SessionRecapMetadata = {
      sessionId: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      pageCount: session.pageIds.length,
      pages: sortedPages.slice(0, 5).map((page) => ({
        id: page.id,
        title: page.title,
        url: page.url,
        summary: summariseText(page.summary ?? page.rawText),
        capturedAt: page.capturedAt,
        lastInteractionAt: page.lastInteractionAt,
        confidenceTags: page.confidenceTags ?? []
      }))
    };

    const description = `${metadata.pageCount} page${metadata.pageCount === 1 ? '' : 's'} • last touched ${formatRecency(
      getHoursAgo(mostRecent.lastInteractionAt)
    )}`;

    const entryTags = sortAndUnique(Array.from(derivedTags));

    const title = session.title || metadata.pages[0]?.title || 'Recent session';

    const existing = await db.timelineEntries.where('sessionId').equals(session.id).first();
    const existingMetadata = existing?.metadata as SessionRecapMetadata | undefined;
    const existingPageIds = existingMetadata?.pages?.map((page) => page.id) ?? [];
    const nextPageIds = metadata.pages.map((page) => page.id);

    const hasChanges =
      !existing ||
      existing.title !== title ||
      existing.description !== description ||
      !arraysEqual(existing.tags ? sortAndUnique(existing.tags) : [], entryTags) ||
      !arraysEqual(existingPageIds, nextPageIds) ||
      existingMetadata?.pageCount !== metadata.pageCount;

    if (!hasChanges) continue;

    await recordTimelineEntry({
      id: existing?.id,
      type: 'research_burst',
      title,
      description,
      tags: entryTags,
      relatedPageIds: session.pageIds,
      metadata,
      sessionId: session.id
    });
  }

  const existingRecaps = await db.timelineEntries.where('type').equals('research_burst').toArray();
  for (const entry of existingRecaps) {
    if (
      entry.sessionId &&
      entry.tags?.includes('session-recap') &&
      !activeSessionIds.has(entry.sessionId)
    ) {
      await db.timelineEntries.delete(entry.id);
    }
  }
};

export const __test = {
  deriveTopicTags,
  formatRecency,
  summariseText
};
