export type ConfidenceTag =
  | 'close_to_right'
  | 'close_others'
  | 'window_closed'
  | 'tab_group'
  | 'pinned_retired'
  | 'reading_list'
  | 'quick_glance'
  | 'manual_remember'
  | 'system_discarded'
  | 'highlighted'
  | 'media_session'
  | 'form_in_progress';

export type MemoryEventType =
  | 'tab_open'
  | 'tab_close'
  | 'tab_move'
  | 'tab_pin'
  | 'tab_unpin'
  | 'tab_group_join'
  | 'tab_group_leave'
  | 'window_focus'
  | 'window_blur'
  | 'window_close'
  | 'navigation_start'
  | 'navigation_complete'
  | 'scroll_sample'
  | 'highlight_added'
  | 'highlight_removed'
  | 'media_start'
  | 'media_pause'
  | 'media_end'
  | 'picture_in_picture'
  | 'form_start'
  | 'form_submit'
  | 'clipboard_copy'
  | 'download_start'
  | 'download_complete'
  | 'manual_capture'
  | 'capture_toggle';

export interface PageRecord {
  id: string;
  url: string;
  title: string;
  canonicalUrl?: string;
  capturedAt: string;
  closedAt?: string;
  windowId?: number;
  tabId?: number;
  tabGroupId?: string;
  topicLabel?: string;
  rawText: string;
  summary?: string;
  snapshotPath?: string;
  confidenceTags: ConfidenceTag[];
  sessionId?: string;
  lastInteractionAt: string;
  visitCount: number;
}

export interface ChunkRecord {
  id: string;
  pageId: string;
  order: number;
  text: string;
  tokenCount: number;
  embedding?: number[];
  embeddingModel?: string;
  highlights?: Array<{ id: string; text: string; color?: string }>;
}

export interface MemoryEventRecord {
  id: string;
  pageId?: string;
  sessionId?: string;
  type: MemoryEventType;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface SessionRecord {
  id: string;
  title: string;
  origin: 'history' | 'bulk_close' | 'window_exit' | 'reading_list' | 'manual';
  startedAt: string;
  endedAt?: string;
  confidenceScore?: number;
  topicLabel?: string;
  pageIds: string[];
}

export interface MediaSessionRecord {
  id: string;
  pageId: string;
  kind: 'video' | 'audio' | 'dashboard';
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  captions?: Array<{ start: number; end: number; text: string }>;
  progress?: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

import { type Table } from 'dexie';

export interface MemoryDatabaseSchema {
  pages: Table<PageRecord, string>;
  chunks: Table<ChunkRecord, string>;
  events: Table<MemoryEventRecord, string>;
  sessions: Table<SessionRecord, string>;
  mediaSessions: Table<MediaSessionRecord, string>;
  settings: Table<SettingRecord, string>;
}
