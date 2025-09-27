import Dexie, { type Table } from 'dexie';
import type {
  ChunkRecord,
  MediaSessionRecord,
  MemoryDatabaseSchema,
  MemoryEventRecord,
  PageRecord,
  SessionRecord,
  SettingRecord
} from './schema';

class SemanticMemoryDatabase extends Dexie implements MemoryDatabaseSchema {
  pages!: Table<PageRecord, string>;
  chunks!: Table<ChunkRecord, string>;
  events!: Table<MemoryEventRecord, string>;
  sessions!: Table<SessionRecord, string>;
  mediaSessions!: Table<MediaSessionRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('semantic_memory');

    this.version(1).stores({
      pages:
        '&id, url, capturedAt, closedAt, sessionId, topicLabel, windowId, tabId, tabGroupId, lastInteractionAt, visitCount',
      chunks: '&id, pageId, order',
      events: '&id, pageId, type, sessionId, timestamp',
      sessions: '&id, origin, startedAt, endedAt, topicLabel',
      mediaSessions: '&id, pageId, kind, startedAt, endedAt',
      settings: '&key'
    });

    this.pages.mapToClass(class {});
    this.chunks.mapToClass(class {});
    this.events.mapToClass(class {});
    this.sessions.mapToClass(class {});
    this.mediaSessions.mapToClass(class {});
    this.settings.mapToClass(class {});
  }
}

export const db = new SemanticMemoryDatabase();

export type {
  PageRecord,
  ChunkRecord,
  MemoryEventRecord,
  SessionRecord,
  MediaSessionRecord,
  SettingRecord
};
