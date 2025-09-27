import { create } from 'zustand';
import type { ReactNode } from 'react';

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
  setComposerValue: (next: string) => void;
  sendMessage: (value: string) => void;
  selectThread: (id: string) => void;
  appendMessage: (message: ChatMessage | ((ctx: ChatThread) => ChatMessage)) => void;
}

const now = new Date();
const iso = (date: Date | number) => new Date(date).toISOString();

const createId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

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

export const useChatStore = create<ChatStore>((set, get) => ({
  threads: demoThreads,
  activeThreadId: demoThreads[0]?.id ?? '',
  composerValue: '',
  setComposerValue: (next) => set({ composerValue: next }),
  sendMessage: (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const { activeThreadId, threads } = get();
    const thread = threads.find((t) => t.id === activeThreadId);
    if (!thread) return;

    const userMessage: ChatMessage = {
      id: `user-${createId()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${createId()}`,
      role: 'assistant',
      content:
        'Processing request locally... (Mock response: the assistant will provide semantic recall once integrated).',
      createdAt: new Date().toISOString()
    };

    const updatedThreads = threads.map((t) =>
      t.id === activeThreadId
        ? {
            ...t,
            updatedAt: new Date().toISOString(),
            messages: [...t.messages, userMessage, assistantMessage]
          }
        : t
    );

    set({ threads: updatedThreads, composerValue: '' });
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
