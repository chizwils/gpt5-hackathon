/* eslint-env browser */
import { logEvent, recordTimelineEntry } from '@data';

interface DownloadRecord {
  id: number;
  url?: string;
  filename?: string;
  tabId?: number;
  danger?: chrome.downloads.DangerType;
  state: chrome.downloads.State;
  startTime: string;
  endTime?: string;
}

const downloadCache = new Map<number, DownloadRecord>();

const getDomain = (url?: string) => {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
};

const registerDownloadListeners = () => {
  if (!chrome.downloads) return;

  chrome.downloads.onCreated.addListener(async (download) => {
    downloadCache.set(download.id, {
      id: download.id,
      url: download.url,
      filename: download.filename,
      tabId: download.tabId ?? undefined,
      danger: download.danger,
      state: download.state,
      startTime: download.startTime ?? new Date().toISOString()
    });

    await logEvent({
      type: 'download_start',
      timestamp: new Date().toISOString(),
      payload: {
        downloadId: download.id,
        url: download.url,
        filename: download.filename,
        danger: download.danger
      }
    });

    await recordTimelineEntry({
      type: 'other',
      title: `Download started: ${download.filename ?? getDomain(download.url)}`,
      description: download.url,
      tags: ['download'],
      metadata: { url: download.url, filename: download.filename }
    });
  });

  chrome.downloads.onChanged.addListener(async (delta) => {
    if (delta.id === undefined) return;
    const record = downloadCache.get(delta.id);
    if (!record) return;

    if (delta.state?.current) {
      record.state = delta.state.current;
    }
    if (delta.endTime?.current) {
      record.endTime = delta.endTime.current;
    }

    if (delta.state?.current === 'complete') {
      await logEvent({
        type: 'download_complete',
        timestamp: new Date().toISOString(),
        payload: {
          downloadId: record.id,
          url: record.url,
          filename: record.filename
        }
      });

      await recordTimelineEntry({
        type: 'other',
        title: `Download complete: ${record.filename ?? getDomain(record.url)}`,
        description: record.url,
        tags: ['download', 'complete'],
        metadata: { url: record.url, filename: record.filename }
      });
    }

    downloadCache.set(record.id, record);
  });

  chrome.downloads.onErased.addListener((downloadId) => {
    downloadCache.delete(downloadId);
  });
};

export const registerDownloadObserver = () => {
  if (!chrome.downloads) return;
  registerDownloadListeners();
};

export const __test = {
  getDomain
};
