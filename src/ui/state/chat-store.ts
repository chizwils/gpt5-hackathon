import { create } from 'zustand';
import type { ReactNode } from 'react';
import { getRecentPages, seedDemoData, type PageRecord } from '@data';
import type { BackgroundRequest, BackgroundResponse } from '@/types/background';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  citations?: Array<{ label: string; href: string }>;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  tags?: string[];
}

interface ChatStore {
  threads: ChatThread[];
  activeThreadId: string;
  composerValue: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setComposerValue: (next: string) => void;
  sendMessage: (value: string) => void;
  selectThread: (id: string) => void;
  appendMessage: (message: ChatMessage | ((ctx: ChatThread) => ChatMessage)) => void;
}

const now = new Date();
const iso = (date: Date | number) => new Date(date).toISOString();

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const demoThreads: ChatThread[] = [
  {
    id: 'demo-1',
    title: 'Summarize GDPR research',
    createdAt: iso(now),
    updatedAt: iso(now),
    tags: ['research', 'privacy'],
    messages: [
      {
        id: 'm-1',
        role: 'system',
        createdAt: iso(now),
        content:
          'You are Semantic Memory, a local-first assistant who can recall captured pages and craft concise digests.'
      },
      {
        id: 'm-2',
        role: 'user',
        createdAt: iso(now.getTime() + 60 * 1000),
        content: 'Give me a summary of the orange chart about GDPR fines I saw earlier.'
      },
      {
        id: 'm-3',
        role: 'assistant',
        createdAt: iso(now.getTime() + 120 * 1000),
        content:
          'The chart from European Data Watch (captured 2h ago) shows cumulative GDPR fines reaching €2.6B. Spain and Italy surged in 2023. Want a topic cluster for “EU enforcement”?',
        citations: [
          { label: 'gdpr-fines-chart.png', href: 'memory://snapshots/gdpr-fines-chart.png' }
        ]
      }
    ]
  },
  {
    id: 'demo-2',
    title: 'Daily digest',
    createdAt: iso(now.getTime() - 86400000),
    updatedAt: iso(now.getTime() - 3600000),
    tags: ['digest'],
    messages: [
      {
        id: 'm-4',
        role: 'assistant',
        createdAt: iso(now.getTime() - 3600000),
        content:
          'Good evening! Highlights: 1) Browser OCR prototypes, 2) IndexedDB vector search benchmarks, 3) Voice notes around GPT-5 Realtime.'
      }
    ]
  }
];

const summarizeSnippet = (text: string) => {
  if (!text) return 'No readable text captured yet. Switch to a page with content to capture.';
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 320 ? `${collapsed.slice(0, 317)}…` : collapsed;
};

const safeHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};

const createThreadFromPage = (page: PageRecord): ChatThread => {
  const host = safeHostname(page.url);
  const summary = page.summary?.trim() || summarizeSnippet(page.rawText);

  const assistantMessage: ChatMessage = {
    id: `${page.id}-assistant-snapshot`,
    role: 'assistant',
    content: summary,
    createdAt: page.lastInteractionAt,
    citations: page.snapshotPath
      ? [
          {
            label: host ?? page.title ?? 'Snapshot',
            href: page.snapshotPath
          }
        ]
      : undefined
  };

  const systemMessage: ChatMessage = {
    id: `${page.id}-system-intro`,
    role: 'system',
    createdAt: page.capturedAt,
    content: `Captured "${page.title}"${host ? ` from ${host}` : ''} at ${new Date(page.capturedAt).toLocaleString()}.`
  };

  const tags = Array.from(
    new Set([...(page.confidenceTags ?? []), ...(host ? [host] : [])])
  );

  return {
    id: page.id,
    title: page.title || host || page.url,
    createdAt: page.capturedAt,
    updatedAt: page.lastInteractionAt,
    messages: [systemMessage, assistantMessage],
    tags
  };
};

export const useChatStore = create<ChatStore>((set, get) => ({
  threads: demoThreads,
  activeThreadId: demoThreads[0]?.id ?? '',
  composerValue: '',
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;

    let pages = await getRecentPages(30);
    if (!pages.length) {
      await seedDemoData();
      pages = await getRecentPages(30);
    }

    if (!pages.length) {
      set({ hydrated: true });
      return;
    }

    const threads = pages.map(createThreadFromPage);
    set({
      threads,
      activeThreadId: threads[0]?.id ?? get().activeThreadId,
      hydrated: true
    });
  },
  setComposerValue: (next) => set({ composerValue: next }),
  sendMessage: (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const { activeThreadId, threads } = get();
    const thread = threads.find((t) => t.id === activeThreadId);
    if (!thread) return;

    const nowIso = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `user-${createId()}`,
      role: 'user',
      content: trimmed,
      createdAt: nowIso
    };

    const assistantId = `assistant-${createId()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: 'Thinking through your browsing history…',
      createdAt: nowIso
    };

    const nextThreads = threads.map((t) =>
      t.id === activeThreadId
        ? {
            ...t,
            updatedAt: nowIso,
            messages: [...t.messages, userMessage, assistantMessage]
          }
        : t
    );

    set({ threads: nextThreads, composerValue: '' });

    const updateAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
      set((state) => ({
        threads: state.threads.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                messages: t.messages.map((message) =>
                  message.id === assistantId ? updater(message) : message
                ),
                updatedAt: new Date().toISOString()
              }
            : t
        )
      }));
    };

    const handleError = (errorText: string) => {
      updateAssistant((message) => ({
        ...message,
        content: `⚠️ Unable to reach Semantic Memory right now. ${errorText}`
      }));
    };

    try {
      chrome.runtime.sendMessage<BackgroundRequest, BackgroundResponse>(
        {
          type: 'semantic-memory:query',
          prompt: trimmed
        },
        (response) => {
          if (chrome.runtime.lastError) {
            handleError(chrome.runtime.lastError.message ?? 'Unknown error.');
            return;
          }
          if (!response) {
            handleError('No response from background worker.');
            return;
          }
          if (response.type === 'semantic-memory:query:error') {
            handleError(response.error);
            return;
          }

          if (response.type === 'semantic-memory:query:success') {
            const citations = response.data.contextPages.map((page) => ({
              label: page.title,
              href: `memory://page/${page.id}`
            }));

            updateAssistant((message) => ({
              ...message,
              content: response.data.text,
              citations: citations.length ? citations : undefined
            }));
          }
        }
      );
    } catch (error) {
      handleError(error instanceof Error ? error.message : 'Unknown error.');
    }
  },
  selectThread: (id) => {
    if (get().activeThreadId === id) return;
    set({ activeThreadId: id });
  },
  appendMessage: (message) => {
    const { threads, activeThreadId } = get();
    const nextMessage =
      typeof message === 'function'
        ? message(threads.find((t) => t.id === activeThreadId)!)
        : message;

    const updatedThreads = threads.map((t) =>
      t.id === activeThreadId
        ? {
            ...t,
            updatedAt: new Date().toISOString(),
            messages: [...t.messages, nextMessage]
          }
        : t
    );

    set({ threads: updatedThreads });
  }
}));

export type WithChildren<T = Record<string, never>> = T & { children: ReactNode };
