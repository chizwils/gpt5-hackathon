import { create } from 'zustand';
import type { ReactNode } from 'react';
import { getRecentPages, seedDemoData, type PageRecord } from '@data';
import type { BackgroundRequest, BackgroundResponse, BackgroundPush } from '@/types/background';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status?: 'streaming' | 'done' | 'error';
  citations?: Array<{ label: string; href: string }>;
  evidence?: Array<{ title: string; snippet: string }>;
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
const iso = (value: Date | number) => new Date(value).toISOString();

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
        status: 'done',
        content:
          'You are Semantic Memory, a local-first assistant who can recall captured pages and craft concise digests.'
      },
      {
        id: 'm-2',
        role: 'user',
        createdAt: iso(now.getTime() + 60 * 1000),
        status: 'done',
        content: 'Give me a summary of the orange chart about GDPR fines I saw earlier.'
      },
      {
        id: 'm-3',
        role: 'assistant',
        createdAt: iso(now.getTime() + 120 * 1000),
        status: 'done',
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
        status: 'done',
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
    status: 'done',
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
    status: 'done',
    content: `Captured "${page.title}"${host ? ` from ${host}` : ''} at ${new Date(page.capturedAt).toLocaleString()}.`
  };

  const tags = Array.from(new Set([...(page.confidenceTags ?? []), ...(host ? [host] : [])]));

  return {
    id: page.id,
    title: page.title || host || page.url,
    createdAt: page.capturedAt,
    updatedAt: page.lastInteractionAt,
    messages: [systemMessage, assistantMessage],
    tags
  };
};

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T> | T | void)) => void;

let backgroundBridgeRegistered = false;

const registerBackgroundBridge = (set: SetState<ChatStore>) => {
  if (backgroundBridgeRegistered) return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  const updateAssistantMessage = (
    threadId: string,
    assistantMessageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => {
    set((state) => {
      let changed = false;
      const threads = state.threads.map((thread) => {
        if (thread.id !== threadId) return thread;
        let threadChanged = false;
        const messages = thread.messages.map((message) => {
          if (message.id !== assistantMessageId) return message;
          threadChanged = true;
          changed = true;
          return updater(message);
        });
        if (!threadChanged) return thread;
        return {
          ...thread,
          messages,
          updatedAt: new Date().toISOString()
        };
      });

      if (!changed) return state;
      return { ...state, threads };
    });
  };

  chrome.runtime.onMessage.addListener((rawMessage) => {
    const message = rawMessage as BackgroundPush;
    if (!message || typeof message !== 'object' || !('type' in message)) return;

    switch (message.type) {
      case 'semantic-memory:query:chunk': {
        const delta = message.delta ?? '';
        if (!delta) return;
        updateAssistantMessage(message.threadId, message.assistantMessageId, (assistant) => ({
          ...assistant,
          status: 'streaming',
          content: `${assistant.content ?? ''}${delta}`
        }));
        break;
      }
      case 'semantic-memory:query:done': {
        const citations = message.contextPages.map((page) => ({
          label: page.title,
          href: `memory://page/${page.id}`
        }));
        const evidence = message.contextItems?.map((item) => ({ title: item.title, snippet: item.snippet })) ?? [];
        updateAssistantMessage(message.threadId, message.assistantMessageId, (assistant) => ({
          ...assistant,
          status: 'done',
          content: message.text?.trim() ? message.text : assistant.content,
          citations: citations.length ? citations : assistant.citations,
          evidence: evidence.length ? evidence : assistant.evidence
        }));
        break;
      }
      case 'semantic-memory:query:error': {
        updateAssistantMessage(message.threadId, message.assistantMessageId, (assistant) => ({
          ...assistant,
          status: 'error',
          content: `⚠️ Unable to reach Semantic Memory right now. ${message.error}`,
          citations: undefined
        }));
        break;
      }
      default:
        break;
    }
  });

  backgroundBridgeRegistered = true;
};

export const useChatStore = create<ChatStore>((set, get) => {
  return {
    threads: demoThreads,
    activeThreadId: demoThreads[0]?.id ?? '',
    composerValue: '',
    hydrated: false,
    hydrate: async () => {
      if (get().hydrated) return;
      
      // Register background bridge on first hydration
      registerBackgroundBridge(set);

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
        createdAt: nowIso,
        status: 'done'
      };

      const assistantId = `assistant-${createId()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: nowIso,
        status: 'streaming'
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

      const handleError = (errorText: string) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === activeThreadId
              ? {
                  ...t,
                  updatedAt: new Date().toISOString(),
                  messages: t.messages.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          status: 'error',
                          content: `⚠️ Unable to reach Semantic Memory right now. ${errorText}`,
                          citations: undefined
                        }
                      : message
                  )
                }
              : t
          )
        }));
      };

      try {
        chrome.runtime.sendMessage<BackgroundRequest, BackgroundResponse>(
          {
            type: 'semantic-memory:query',
            prompt: trimmed,
            threadId: activeThreadId,
            assistantMessageId: assistantId
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
  };
});

export type WithChildren<T = Record<string, never>> = T & { children: ReactNode };
