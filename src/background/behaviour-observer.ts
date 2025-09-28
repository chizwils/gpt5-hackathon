/* eslint-env browser */
import {
  appendConfidenceTagByTabIds,
  getSetting,
  logEvent,
  markTabsClosed,
  recordTimelineEntry,
  reopenPageByUrl,
  upsertSetting,
  updatePagesByTabId
} from '@data';

interface TabSnapshot {
  id: number;
  title: string;
  url: string;
  windowId: number;
  groupId?: number;
  pinned: boolean;
  openerTabId?: number;
  index?: number;
}

const tabCache = new Map<number, TabSnapshot>();
const windowCloseBuffer = new Map<number, { tabs: TabSnapshot[]; timeout: number | null }>();
const bulkCloseBuffer = new Map<number, { tabs: TabSnapshot[]; timeout: number | null }>();
const researchBurstBuffer = new Map<number, { openerId: number; tabs: TabSnapshot[]; timeout: number | null }>();
const activeTabByWindow = new Map<number, { id: number; index: number }>();
const windowLayouts = new Map<number, number[]>();
const recentCommandByWindow = new Map<number, { mode: BulkCloseMode; expires: number }>();

const BULK_CLOSE_WINDOW_MS = 600;
const RESEARCH_WINDOW_MS = 800;
const INCOGNITO_SETTING_KEY = 'incognito-allowed';

type BulkCloseMode = 'bulk_close' | 'close_to_right' | 'close_others';

const toTabMeta = (tab: TabSnapshot) => ({ title: tab.title, url: tab.url, index: tab.index });

const cacheTab = (tab: chrome.tabs.Tab) => {
  if (tab.id === undefined || tab.id < 0) return;
  tabCache.set(tab.id, {
    id: tab.id,
    title: tab.title ?? tab.url ?? 'Untitled tab',
    url: tab.url ?? '',
    windowId: tab.windowId ?? -1,
    groupId: tab.groupId && tab.groupId >= 0 ? tab.groupId : undefined,
    pinned: Boolean(tab.pinned),
    openerTabId: tab.openerTabId ?? undefined,
    index: tab.index
  });
};

const classifyBulkClose = (tabs: TabSnapshot[], anchor?: { id: number; index: number }): BulkCloseMode => {
  if (!tabs.length || !anchor) return 'bulk_close';
  const indexes = tabs
    .map((tab) => tab.index)
    .filter((index): index is number => typeof index === 'number');
  if (!indexes.length) return 'bulk_close';
  const greater = indexes.filter((index) => index > anchor.index).length;
  const lesser = indexes.filter((index) => index < anchor.index).length;
  if (greater && !lesser) return 'close_to_right';
  if (greater && lesser) return 'close_others';
  return 'bulk_close';
};

const deriveAnchorFromLayout = (windowId: number, closingTabs: TabSnapshot[]) => {
  const layout = windowLayouts.get(windowId);
  if (!layout?.length) return undefined;
  const closingIds = new Set(closingTabs.map((tab) => tab.id));
  const candidateId = layout.find((id) => !closingIds.has(id));
  if (candidateId === undefined) return undefined;
  const snapshot = tabCache.get(candidateId);
  const index = snapshot?.index ?? layout.indexOf(candidateId);
  if (index < 0) return undefined;
  return { id: candidateId, index };
};

const refreshWindowLayout = (windowId?: number) => {
  if (!chrome.tabs?.query) return;
  if (windowId === undefined || windowId < 0) return;
  chrome.tabs.query({ windowId }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const ids = tabs
      .map((tab) => {
        cacheTab(tab);
        return tab.id;
      })
      .filter((id): id is number => typeof id === 'number' && id >= 0);
    windowLayouts.set(windowId, ids);
  });
};

const tagTabsInGroup = (groupId: number) => {
  if (!chrome.tabs?.query) return;
  if (groupId === undefined || groupId < 0) return;
  chrome.tabs.query({ groupId }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((id): id is number => typeof id === 'number');
    if (!tabIds.length) return;
    void appendConfidenceTagByTabIds(tabIds, 'tab_group').catch(() => {});
  });
};

const scheduleBulkFinalise = (windowId: number) => {
  const buffer = bulkCloseBuffer.get(windowId);
  if (!buffer) return;
  if (buffer.timeout) clearTimeout(buffer.timeout);

  buffer.timeout = setTimeout(async () => {
    if (buffer.tabs.length > 1) {
      const tabs = buffer.tabs.map(toTabMeta);
      const anchor = activeTabByWindow.get(windowId) ?? deriveAnchorFromLayout(windowId, buffer.tabs);
      if (anchor) {
        activeTabByWindow.set(windowId, anchor);
      }
      const commandContext = recentCommandByWindow.get(windowId);
      const mode = commandContext && commandContext.expires > Date.now()
        ? commandContext.mode
        : classifyBulkClose(buffer.tabs, anchor);
      if (commandContext && commandContext.expires > Date.now()) {
        recentCommandByWindow.delete(windowId);
      }
      const tags = ['bulk-close', 'cleanup'];
      if (mode === 'close_to_right') tags.push('close-right');
      if (mode === 'close_others') tags.push('close-others');

      await recordTimelineEntry({
        type: 'bulk_close',
        title: `Closed ${buffer.tabs.length} tabs`,
        description: tabs
          .slice(0, 5)
          .map((tab) => tab.title)
          .join(', '),
        tags,
        metadata: { tabs, anchor, mode }
      });

      const tabIds = buffer.tabs.map((tab) => tab.id);
      if (mode === 'close_to_right') {
        await appendConfidenceTagByTabIds(tabIds, 'close_to_right');
      } else if (mode === 'close_others') {
        await appendConfidenceTagByTabIds(tabIds, 'close_others');
      }
      await markTabsClosed(tabIds, new Date().toISOString()).catch(() => {});
    }
    bulkCloseBuffer.delete(windowId);
  }, BULK_CLOSE_WINDOW_MS);
};

const scheduleWindowFinalise = (windowId: number) => {
  const buffer = windowCloseBuffer.get(windowId);
  if (!buffer) return;
  if (buffer.timeout) clearTimeout(buffer.timeout);

  buffer.timeout = setTimeout(async () => {
    if (buffer.tabs.length) {
      const tabs = buffer.tabs.map(toTabMeta);
      await recordTimelineEntry({
        type: 'window_close',
        title: `Closed window with ${buffer.tabs.length} tabs`,
        description: tabs
          .slice(0, 5)
          .map((tab) => tab.title)
          .join(', '),
        tags: ['window-close'],
        metadata: { tabs }
      });
      const tabIds = buffer.tabs.map((tab) => tab.id);
      await appendConfidenceTagByTabIds(tabIds, 'window_closed');
      await markTabsClosed(tabIds, new Date().toISOString()).catch(() => {});
    }
    windowCloseBuffer.delete(windowId);
    windowLayouts.delete(windowId);
    activeTabByWindow.delete(windowId);
    recentCommandByWindow.delete(windowId);
  }, BULK_CLOSE_WINDOW_MS);
};

const scheduleResearchBurstFinalise = (openerId: number) => {
  const buffer = researchBurstBuffer.get(openerId);
  if (!buffer) return;
  if (buffer.timeout) clearTimeout(buffer.timeout);

  buffer.timeout = setTimeout(async () => {
    if (buffer.tabs.length > 1) {
      const tabs = buffer.tabs.map(toTabMeta);
      const opener = tabCache.get(openerId);
      await recordTimelineEntry({
        type: 'research_burst',
        title: `Opened ${buffer.tabs.length} tabs from ${opener?.title ?? 'a source tab'}`,
        description: tabs
          .slice(0, 5)
          .map((tab) => tab.title)
          .join(', '),
        tags: ['research'],
        metadata: { opener: opener?.title ?? null, openerUrl: opener?.url ?? null, tabs }
      });
    }
    researchBurstBuffer.delete(openerId);
  }, RESEARCH_WINDOW_MS);
};

const handleTabRemoved = async (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => {
  const snapshot = tabCache.get(tabId);
  tabCache.delete(tabId);
  if (!snapshot) return;

  await logEvent({
    type: 'tab_close',
    timestamp: new Date().toISOString(),
    payload: {
      windowId: snapshot.windowId,
      title: snapshot.title,
      url: snapshot.url,
      reason: removeInfo.isWindowClosing ? 'window-close' : 'manual'
    }
  });

  const anchor = activeTabByWindow.get(snapshot.windowId);
  if (anchor?.id === tabId) {
    activeTabByWindow.delete(snapshot.windowId);
  }

  if (removeInfo.isWindowClosing) {
    const buffer = windowCloseBuffer.get(snapshot.windowId) ?? { tabs: [], timeout: null };
    buffer.tabs.push(snapshot);
    windowCloseBuffer.set(snapshot.windowId, buffer);
    scheduleWindowFinalise(snapshot.windowId);
    return;
  }

  const buffer = bulkCloseBuffer.get(snapshot.windowId) ?? { tabs: [], timeout: null };
  buffer.tabs.push(snapshot);
  bulkCloseBuffer.set(snapshot.windowId, buffer);
  scheduleBulkFinalise(snapshot.windowId);
  refreshWindowLayout(snapshot.windowId);
};

const handleTabCreated = async (tab: chrome.tabs.Tab) => {
  cacheTab(tab);

  await logEvent({
    type: 'tab_open',
    timestamp: new Date().toISOString(),
    payload: {
      url: tab.url,
      title: tab.title,
      openerTabId: tab.openerTabId,
      windowId: tab.windowId
    }
  });

  if (tab.active && tab.id !== undefined && tab.windowId !== undefined) {
    activeTabByWindow.set(tab.windowId, { id: tab.id, index: tab.index ?? 0 });
  }

  if (tab.sessionId && tab.url && tab.id !== undefined && tab.windowId !== undefined) {
    await reopenPageByUrl(tab.url, tab.id, tab.windowId, new Date().toISOString()).catch(() => {});
  }

  if (tab.openerTabId) {
    const buffer = researchBurstBuffer.get(tab.openerTabId) ?? {
      openerId: tab.openerTabId,
      tabs: [],
      timeout: null
    };
    buffer.tabs.push({
      id: tab.id!,
      title: tab.title ?? tab.url ?? 'New tab',
      url: tab.url ?? '',
      windowId: tab.windowId ?? -1,
      pinned: Boolean(tab.pinned),
      openerTabId: tab.openerTabId,
      index: tab.index
    });
    researchBurstBuffer.set(tab.openerTabId, buffer);
    scheduleResearchBurstFinalise(tab.openerTabId);
  }

  refreshWindowLayout(tab.windowId ?? undefined);
};

const handleTabUpdated = async (
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) => {
  cacheTab(tab);

  if (typeof changeInfo.groupId === 'number') {
    await updatePagesByTabId(tabId, {
      tabGroupId: changeInfo.groupId >= 0 ? String(changeInfo.groupId) : undefined
    }).catch(() => {});
    if (changeInfo.groupId >= 0) {
      tagTabsInGroup(changeInfo.groupId);
    }
  }

  if (typeof changeInfo.pinned === 'boolean') {
    await logEvent({
      type: changeInfo.pinned ? 'tab_pin' : 'tab_unpin',
      timestamp: new Date().toISOString(),
      payload: { tabId, title: tab.title, url: tab.url }
    });

    await recordTimelineEntry({
      type: 'pin_change',
      title: changeInfo.pinned ? `Pinned tab: ${tab.title}` : `Unpinned tab: ${tab.title}`,
      description: tab.url ?? undefined,
      tags: ['pin'],
      metadata: { url: tab.url, pinned: changeInfo.pinned }
    });

  }

  if (typeof changeInfo.audible === 'boolean') {
    await logEvent({
      type: changeInfo.audible ? 'media_start' : 'media_end',
      timestamp: new Date().toISOString(),
      payload: { tabId, title: tab.title, url: tab.url }
    });

    await recordTimelineEntry({
      type: 'media_activity',
      title: changeInfo.audible ? `Media playing: ${tab.title}` : `Media stopped: ${tab.title}`,
      description: tab.url ?? undefined,
      tags: ['media'],
      metadata: { url: tab.url, audible: changeInfo.audible }
    });
  }

  if (typeof changeInfo.discarded === 'boolean') {
    await recordTimelineEntry({
      type: 'discard',
      title: changeInfo.discarded ? `Tab discarded: ${tab.title}` : `Tab restored: ${tab.title}`,
      description: tab.url ?? undefined,
      tags: ['discard'],
      metadata: { url: tab.url, discarded: changeInfo.discarded }
    });

    if (changeInfo.discarded) {
      await appendConfidenceTagByTabIds([tabId], 'system_discarded');
    }
  }
};

const handleTabMoved = async (tabId: number, moveInfo: chrome.tabs.TabMoveInfo) => {
  const snapshot = tabCache.get(tabId);
  if (snapshot) {
    snapshot.index = moveInfo.toIndex;
    snapshot.windowId = moveInfo.windowId;
    tabCache.set(tabId, snapshot);
  }

  await logEvent({
    type: 'tab_move',
    timestamp: new Date().toISOString(),
    payload: {
      tabId,
      windowId: moveInfo.windowId,
      fromIndex: moveInfo.fromIndex,
      toIndex: moveInfo.toIndex
    }
  });

  refreshWindowLayout(moveInfo.windowId);
};

const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
  const { tabId, windowId } = activeInfo;
  if (tabId === undefined) return;
  chrome.tabs.get(tabId, (tab) => {
    cacheTab(tab);
    activeTabByWindow.set(windowId ?? tab.windowId ?? -1, {
      id: tabId,
      index: tab.index ?? 0
    });
    refreshWindowLayout(tab.windowId ?? windowId);
  });
};

const handleTabDetached = async (tabId: number, detachInfo: chrome.tabs.TabDetachedInfo) => {
  await recordTimelineEntry({
    type: 'tab_transfer',
    title: 'Detached tab to new window',
    tags: ['tab-move'],
    metadata: { tabId, fromWindowId: detachInfo.oldWindowId, fromIndex: detachInfo.oldPosition }
  });

  refreshWindowLayout(detachInfo.oldWindowId);
};

const handleTabAttached = (tabId: number, attachInfo: chrome.tabs.TabAttachInfo) => {
  chrome.tabs.get(tabId, async (tab) => {
    cacheTab(tab);
    await updatePagesByTabId(tabId, {
      windowId: attachInfo.newWindowId,
      tabGroupId: tab.groupId && tab.groupId >= 0 ? String(tab.groupId) : undefined
    }).catch(() => {});

    await recordTimelineEntry({
      type: 'tab_transfer',
      title: 'Attached tab from another window',
      tags: ['tab-move'],
      metadata: { tabId, toWindowId: attachInfo.newWindowId, toIndex: attachInfo.newPosition }
    });
  });

  refreshWindowLayout(attachInfo.newWindowId);
};

const handleTabReplaced = async (addedTabId: number, removedTabId: number) => {
  await recordTimelineEntry({
    type: 'tab_replace',
    title: 'Tab replaced by prerender',
    tags: ['replace'],
    metadata: { addedTabId, removedTabId }
  });

  await updatePagesByTabId(addedTabId, { tabId: addedTabId }).catch(() => {});
  chrome.tabs.get(addedTabId, (tab) => {
    refreshWindowLayout(tab?.windowId);
  });
};

const handleTabDiscarded = async (tabId: number, discardInfo: unknown) => {
  await recordTimelineEntry({
    type: 'discard',
    title: 'Tab entered discard',
    tags: ['discard'],
    metadata: { tabId, discardInfo }
  });

  await appendConfidenceTagByTabIds([tabId], 'system_discarded');
};

const registerBookmarkListeners = () => {
  if (!chrome.bookmarks) return;

  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    recordTimelineEntry({
      type: 'other',
      title: `Saved bookmark: ${bookmark.title || bookmark.url || 'Untitled'}`,
      description: bookmark.url ?? undefined,
      tags: ['bookmark'],
      metadata: { url: bookmark.url, title: bookmark.title, parentId: bookmark.parentId }
    }).catch(() => {});
  });

  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    recordTimelineEntry({
      type: 'other',
      title: 'Removed bookmark',
      tags: ['bookmark'],
      metadata: { id, parentId: removeInfo.parentId }
    }).catch(() => {});
  });
};

const registerTabGroupListeners = () => {
  if (!chrome.tabGroups) return;

  chrome.tabGroups.onCreated.addListener((group) => {
    recordTimelineEntry({
      type: 'group_activity',
      title: `Created tab group${group.title ? `: ${group.title}` : ''}`,
      tags: ['tab-group'],
      metadata: { color: group.color, id: group.id }
    }).catch(() => {});
    tagTabsInGroup(group.id);
  });

  chrome.tabGroups.onRemoved.addListener((group) => {
    recordTimelineEntry({
      type: 'group_activity',
      title: 'Removed tab group',
      tags: ['tab-group'],
      metadata: { groupId: group.groupId }
    }).catch(() => {});
  });

  chrome.tabGroups.onUpdated.addListener((group) => {
    recordTimelineEntry({
      type: 'group_activity',
      title: `Updated tab group${group.title ? `: ${group.title}` : ''}`,
      tags: ['tab-group'],
      metadata: { color: group.color, id: group.id }
    }).catch(() => {});
    tagTabsInGroup(group.id);
  });
};

const registerReadingListListeners = () => {
  const api = (chrome as typeof chrome & { readingList?: any }).readingList;
  if (!api) return;

  const safeRecord = async (
    entry: { title?: string; url?: string; entryId?: string },
    type: 'added' | 'removed' | 'updated'
  ) => {
    const baseTitle = entry.title || entry.url || 'Reading list entry';
    const title =
      type === 'added'
        ? `Saved to Reading List: ${baseTitle}`
        : type === 'removed'
          ? `Removed from Reading List: ${baseTitle}`
          : `Updated Reading List entry: ${baseTitle}`;
    await recordTimelineEntry({
      type: 'reading_list',
      title,
      description: entry.url,
      tags: ['reading-list'],
      metadata: { ...entry, change: type }
    });
  };

  api.onEntryAdded?.addListener((entry: any) => {
    safeRecord(entry, 'added').catch(() => {});
  });

  api.onEntryRemoved?.addListener((entryId: string) => {
    safeRecord({ entryId }, 'removed').catch(() => {});
  });

  api.onEntryUpdated?.addListener((entry: any) => {
    safeRecord(entry, 'updated').catch(() => {});
  });
};

const checkIncognitoStatus = () => {
  if (!chrome.extension?.isAllowedIncognitoAccess) return;
  chrome.extension.isAllowedIncognitoAccess((allowed) => {
    void (async () => {
      try {
        const previous = await getSetting<boolean>(INCOGNITO_SETTING_KEY);
        if (previous === allowed) return;
        await upsertSetting(INCOGNITO_SETTING_KEY, allowed);
        await recordTimelineEntry({
          type: 'privacy',
          title: allowed ? 'Incognito capture enabled' : 'Incognito capture disabled',
          tags: ['incognito'],
          metadata: { allowed }
        });
      } catch (error) {
        console.debug('Failed to record incognito status change', error);
      }
    })();
  });
};

const handleWindowFocusChanged = async (windowId: number) => {
  await recordTimelineEntry({
    type: 'window_focus',
    title: windowId === chrome.windows.WINDOW_ID_NONE ? 'Focus left the browser' : 'Window focused',
    tags: ['window'],
    metadata: { windowId }
  });
};

const handleSessionsChanged = async () => {
  if (!chrome.sessions?.getRecentlyClosed) return;
  try {
    const items = await new Promise<unknown[]>((resolve, reject) => {
      try {
        chrome.sessions.getRecentlyClosed({ maxResults: 5 }, (sessions) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(sessions ?? []);
        });
      } catch (error) {
        reject(error as Error);
      }
    });
    await recordTimelineEntry({
      type: 'session_event',
      title: 'Recently closed sessions updated',
      tags: ['sessions'],
      metadata: { count: items.length }
    });
  } catch (error) {
    console.debug('Failed to read recently closed sessions', error);
  }
};

const setCommandHint = (windowId: number | undefined, mode: BulkCloseMode) => {
  if (windowId === undefined || windowId < 0) return;
  recentCommandByWindow.set(windowId, { mode, expires: Date.now() + 1200 });
};

const handleCommandInvocation = (command: string) => {
  if (!chrome.windows?.getLastFocused) return;

  chrome.windows.getLastFocused({ populate: true }, (window) => {
    if (chrome.runtime.lastError) return;
    if (!window || window.id === undefined) return;

    const tabs = (window.tabs ?? []).filter((tab): tab is chrome.tabs.Tab & { id: number } =>
      Boolean(tab.id && tab.id >= 0)
    );

    const active = tabs.find((tab) => tab.active);
    if (active && active.index !== undefined) {
      activeTabByWindow.set(window.id, { id: active.id, index: active.index });
    }

    let mode: BulkCloseMode = 'bulk_close';
    let title = command;
    let tags: string[] = ['command'];
    if (command === 'semantic-memory.close-tabs-to-right') {
      mode = 'close_to_right';
      title = 'Shortcut: Close tabs to the right';
      tags = ['command', 'close-right'];
    } else if (command === 'semantic-memory.close-other-tabs') {
      mode = 'close_others';
      title = 'Shortcut: Close other tabs';
      tags = ['command', 'close-others'];
    }

    setCommandHint(window.id, mode);

    const anchorIndex = active?.index ?? -1;
    const affectedTabs = tabs
      .filter((tab) =>
        mode === 'close_to_right'
          ? tab.index !== undefined && tab.index > anchorIndex
          : mode === 'close_others'
            ? tab.index !== undefined && tab.index !== anchorIndex
            : true
      )
      .map((tab) => ({ title: tab.title ?? tab.url ?? 'Tab', url: tab.url ?? '', index: tab.index }));

    void recordTimelineEntry({
      type: 'bulk_close_hint',
      title,
      tags,
      metadata: {
        windowId: window.id,
        anchor: anchorIndex,
        tabs: affectedTabs.slice(0, 6)
      }
    });

    refreshWindowLayout(window.id);
  });
};

const initialiseTabCache = () => {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(cacheTab);
    const grouped = new Map<number, number[]>();
    tabs.forEach((tab) => {
      if (tab.id === undefined || tab.windowId === undefined) return;
      const bucket = grouped.get(tab.windowId) ?? [];
      bucket.push(tab.id);
      grouped.set(tab.windowId, bucket);
      if (tab.active) {
        activeTabByWindow.set(tab.windowId, {
          id: tab.id,
          index: tab.index ?? 0
        });
      }
    });
    grouped.forEach((ids, windowId) => windowLayouts.set(windowId, ids));
  });
};

export const registerBehaviourObservers = () => {
  if (!chrome.tabs) return;

  initialiseTabCache();

  chrome.tabs.onCreated.addListener((tab) => {
    void handleTabCreated(tab);
  });
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    void handleTabRemoved(tabId, removeInfo);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void handleTabUpdated(tabId, changeInfo, tab);
  });
  chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    void handleTabMoved(tabId, moveInfo);
  });
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onDetached.addListener((tabId, info) => {
    void handleTabDetached(tabId, info);
  });
  chrome.tabs.onAttached.addListener((tabId, info) => {
    handleTabAttached(tabId, info);
  });
  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    void handleTabReplaced(addedTabId, removedTabId);
  });
  if (chrome.tabs.onDiscarded) {
    chrome.tabs.onDiscarded.addListener((tabId, discardInfo) => {
      void handleTabDiscarded(tabId, discardInfo);
    });
  }

  chrome.windows?.onRemoved.addListener((windowId) => {
    const buffer = windowCloseBuffer.get(windowId) ?? { tabs: [], timeout: null };
    windowCloseBuffer.set(windowId, buffer);
    scheduleWindowFinalise(windowId);
  });
  chrome.windows?.onFocusChanged?.addListener((windowId) => {
    void handleWindowFocusChanged(windowId);
  });

  registerTabGroupListeners();
  registerBookmarkListeners();
  registerReadingListListeners();
  checkIncognitoStatus();
  setInterval(checkIncognitoStatus, 1000 * 60 * 30);

  chrome.sessions?.onChanged?.addListener(handleSessionsChanged);
  chrome.commands?.onCommand?.addListener(handleCommandInvocation);
};

export const __test = {
  toTabMeta,
  cacheTabSnapshot: cacheTab,
  getCachedTab: (id: number) => tabCache.get(id),
  clearCaches: () => {
    tabCache.clear();
    windowCloseBuffer.clear();
    bulkCloseBuffer.clear();
    researchBurstBuffer.clear();
    activeTabByWindow.clear();
    windowLayouts.clear();
    recentCommandByWindow.clear();
  },
  classifyBulkClose
};
