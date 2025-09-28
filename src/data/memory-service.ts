import { db } from './db';
import type {
  ChunkRecord,
  ConfidenceTag,
  MediaSessionRecord,
  MemoryEventRecord,
  PageRecord,
  SessionRecord,
  SettingRecord,
  TimelineEntryRecord
} from './schema';

const cryptoRef: Crypto | undefined =
  typeof globalThis !== 'undefined' && 'crypto' in globalThis ? globalThis.crypto : undefined;

export const createId = () =>
  cryptoRef?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

type NewChunk = Omit<ChunkRecord, 'id' | 'pageId'>;
type NewEvent = Omit<MemoryEventRecord, 'id'>;
type NewMediaSession = Omit<MediaSessionRecord, 'id'>;
type NewSession = Omit<SessionRecord, 'id' | 'pageIds' | 'startedAt'> & {
  id?: string;
  startedAt?: string;
  pageIds?: string[];
};

interface TimelineEntryInput {
  id?: string;
  type: TimelineEntryRecord['type'];
  title: string;
  description?: string;
  tags?: string[];
  relatedPageIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  sessionId?: string;
}

type NewPage = Omit<PageRecord, 'id' | 'confidenceTags' | 'visitCount' | 'lastInteractionAt'> & {
  id?: string;
  confidenceTags?: ConfidenceTag[];
  visitCount?: number;
  lastInteractionAt?: string;
};

export interface PersistMemoryCaptureOptions {
  page: NewPage;
  chunks?: NewChunk[];
  events?: NewEvent[];
  mediaSessions?: NewMediaSession[];
  session?: NewSession;
}

export const persistMemoryCapture = async ({
  page,
  chunks = [],
  events = [],
  mediaSessions = [],
  session
}: PersistMemoryCaptureOptions) => {
  const pageId = page.id ?? createId();
  const sessionId = session?.id ?? page.sessionId ?? undefined;

  await db.transaction('rw', db.pages, db.chunks, db.events, db.mediaSessions, async () => {
    const basePage: PageRecord = {
      id: pageId,
      url: page.url,
      title: page.title,
      rawText: page.rawText,
      capturedAt: page.capturedAt,
      lastInteractionAt: page.lastInteractionAt ?? page.capturedAt,
      visitCount: page.visitCount ?? 1,
      confidenceTags: page.confidenceTags ?? [],
      canonicalUrl: page.canonicalUrl,
      closedAt: page.closedAt,
      windowId: page.windowId,
      tabId: page.tabId,
      tabGroupId: page.tabGroupId,
      topicLabel: page.topicLabel,
      summary: page.summary,
      snapshotPath: page.snapshotPath,
      sessionId: sessionId ?? page.sessionId
    };

    const existing = await db.pages.get(pageId);
    if (existing) {
      await db.pages.update(pageId, {
        ...basePage,
        visitCount: existing.visitCount + 1,
        lastInteractionAt: basePage.lastInteractionAt
      });
      await db.chunks.where('pageId').equals(pageId).delete();
    } else {
      await db.pages.put(basePage);
    }

    if (chunks.length) {
      const chunkRecords: ChunkRecord[] = chunks.map((chunk, index) => ({
        id: createId(),
        pageId,
        order: chunk.order ?? index,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        embedding: chunk.embedding,
        embeddingModel: chunk.embeddingModel,
        highlights: chunk.highlights
      }));

      await db.chunks.bulkAdd(chunkRecords);
    }

    if (events.length) {
      const eventRecords: MemoryEventRecord[] = events.map((event) => ({
        id: createId(),
        pageId: event.pageId ?? pageId,
        sessionId: event.sessionId ?? sessionId,
        type: event.type,
        timestamp: event.timestamp,
        payload: event.payload
      }));

      await db.events.bulkAdd(eventRecords);
    }

    if (mediaSessions.length) {
      const mediaRecords: MediaSessionRecord[] = mediaSessions.map((media) => ({
        id: createId(),
        pageId: media.pageId ?? pageId,
        kind: media.kind,
        startedAt: media.startedAt,
        endedAt: media.endedAt,
        durationSeconds: media.durationSeconds,
        captions: media.captions,
        progress: media.progress
      }));

      await db.mediaSessions.bulkAdd(mediaRecords);
    }

    if (session) {
      const sessionRecord: SessionRecord = {
        id: sessionId ?? createId(),
        title: session.title ?? basePage.title,
        origin: session.origin ?? 'manual',
        startedAt: session.startedAt ?? basePage.capturedAt,
        endedAt: session.endedAt,
        confidenceScore: session.confidenceScore,
        topicLabel: session.topicLabel ?? basePage.topicLabel,
        pageIds: session.pageIds ?? [pageId]
      };

      const existingSession = await db.sessions.get(sessionRecord.id);
      if (existingSession) {
        const mergedPageIds = Array.from(new Set([...existingSession.pageIds, ...sessionRecord.pageIds]));
        await db.sessions.update(sessionRecord.id, {
          ...existingSession,
          ...sessionRecord,
          pageIds: mergedPageIds,
          endedAt: sessionRecord.endedAt ?? existingSession.endedAt
        });
      } else {
        await db.sessions.put(sessionRecord);
      }
    }
  });

  return pageId;
};

export const logEvent = async (event: NewEvent) => {
  const record: MemoryEventRecord = {
    id: createId(),
    ...event
  };

  await db.events.add(record);
  return record.id;
};

export const getRecentPages = async (limit = 50) => {
  return db.pages.orderBy('lastInteractionAt').reverse().limit(limit).toArray();
};

export const getSessionTimeline = async (sessionId: string) => {
  return db.events.where('sessionId').equals(sessionId).sortBy('timestamp');
};

export const getPagesByIds = async (ids: string[]) => {
  if (!ids.length) return [];
  const pages = await db.pages.bulkGet(ids);
  const pageMap = new Map(ids.map((id, index) => [id, pages[index] ?? null]));
  return ids.map((id) => pageMap.get(id)).filter(Boolean);
};

export const recordTimelineEntry = async (entry: TimelineEntryInput) => {
  const record: TimelineEntryRecord = {
    id: entry.id ?? createId(),
    type: entry.type,
    title: entry.title,
    description: entry.description,
    tags: entry.tags ?? [],
    relatedPageIds: entry.relatedPageIds ?? [],
    metadata: entry.metadata ?? {},
    createdAt: entry.createdAt ?? new Date().toISOString(),
    sessionId: entry.sessionId
  };

  await db.timelineEntries.put(record);

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      void chrome.runtime.sendMessage({ type: 'semantic-memory:timeline:new', entry: record });
    } catch (error) {
      console.debug('Failed to broadcast timeline entry', error);
    }
  }

  return record.id;
};

export const getRecentTimelineEntries = async (limit = 20) => {
  return db.timelineEntries.orderBy('createdAt').reverse().limit(limit).toArray();
};

export const upsertSetting = async <Value>(key: SettingRecord['key'], value: Value) => {
  await db.settings.put({ key, value });
};

export const getSetting = async <Value>(key: SettingRecord['key']) => {
  const record = await db.settings.get(key);
  return record?.value as Value | undefined;
};

export const resetDatabase = async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
};

export const updatePagesByTabId = async (tabId: number, updates: Partial<PageRecord>) => {
  await db.pages
    .where('tabId')
    .equals(tabId)
    .modify((page) => {
      Object.assign(page, updates, {
        lastInteractionAt: updates.lastInteractionAt ?? new Date().toISOString()
      });
    });
};

export const appendConfidenceTagByTabIds = async (tabIds: number[], tag: ConfidenceTag) => {
  const uniqueIds = Array.from(new Set(tabIds)).filter((id) => Number.isFinite(id));
  await Promise.all(
    uniqueIds.map((tabId) =>
      db.pages
        .where('tabId')
        .equals(tabId)
        .modify((page) => {
          if (!page.confidenceTags.includes(tag)) {
            page.confidenceTags = [...page.confidenceTags, tag];
          }
        })
    )
  );
};

export const markTabsClosed = async (tabIds: number[], closedAt: string) => {
  const uniqueIds = Array.from(new Set(tabIds)).filter((id) => Number.isFinite(id));
  await Promise.all(
    uniqueIds.map((tabId) =>
      db.pages
        .where('tabId')
        .equals(tabId)
        .modify((page) => {
          page.closedAt = closedAt;
          page.lastInteractionAt = closedAt;
        })
    )
  );
};

export const reopenPageByUrl = async (
  url: string,
  tabId: number,
  windowId: number,
  reopenedAt: string
) => {
  if (!url) return;
  const matches = await db.pages.where('url').equals(url).sortBy('capturedAt');
  const existing = matches[matches.length - 1];
  if (!existing) return;

  await db.pages.update(existing.id, {
    tabId,
    windowId,
    closedAt: undefined,
    lastInteractionAt: reopenedAt,
    visitCount: existing.visitCount + 1
  });
};
