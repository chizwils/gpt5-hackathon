import { useEffect, useRef, useState } from 'react';
import { getRecentTimelineEntries } from '@data/memory-service';
import type { TimelineEntryRecord } from '@data';
import { formatRelativeTime } from '@ui/hooks';
import { useChatStore } from '@ui/state';
import { MessageBubble } from './message-bubble';

const isHighlightEntry = (entry: TimelineEntryRecord) => entry.type === 'highlight';

const buildHighlightPrompt = (entry: TimelineEntryRecord) => {
  const metadata = entry.metadata as { highlight?: string; url?: string } | undefined;
  const snippet = entry.description || metadata?.highlight || entry.title;
  return `Summarize this highlight and related context: "${snippet}"`;
};

export const MessageList = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const thread = useChatStore((state) =>
    state.threads.find((t) => t.id === state.activeThreadId)
  );
  const setComposerValue = useChatStore((state) => state.setComposerValue);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const [highlightSuggestions, setHighlightSuggestions] = useState<TimelineEntryRecord[]>([]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [thread]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const entries = await getRecentTimelineEntries(20);
        if (mounted) {
          setHighlightSuggestions(entries.filter(isHighlightEntry).slice(0, 6));
        }
      } catch (error) {
        console.debug('Failed to load highlight suggestions', error);
      }
    };

    load();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const payload = message as { type?: string; entry?: TimelineEntryRecord };
        if (payload.type === 'semantic-memory:timeline:new' && payload.entry && isHighlightEntry(payload.entry)) {
          setHighlightSuggestions((prev) =>
            [payload.entry!, ...prev.filter((entry) => entry.id !== payload.entry?.id)].slice(0, 6)
          );
        }
      };
      chrome.runtime.onMessage.addListener(listener as any);
      return () => {
        mounted = false;
        chrome.runtime?.onMessage?.removeListener(listener as any);
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  const handleInsertHighlight = (entry: TimelineEntryRecord) => {
    const prompt = buildHighlightPrompt(entry);
    setComposerValue(prompt);
  };

  const handleAskHighlight = (entry: TimelineEntryRecord) => {
    const prompt = buildHighlightPrompt(entry);
    sendMessage(prompt);
  };

  if (!thread) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 bg-surfaceLight px-6 py-8 text-center text-sm text-slate-400">
        <p>Select a memory thread to review captured knowledge.</p>
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className="flex-1 space-y-4 overflow-y-auto bg-surfaceLight px-6 py-4 text-sm"
    >
      {highlightSuggestions.length ? (
        <div className="sticky top-0 z-10 -mx-2 mb-4 space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Highlight notebooks</span>
            <span className="text-[11px] text-primary/70">{highlightSuggestions.length} saved</span>
          </div>
          <div className="flex flex-col gap-2">
            {highlightSuggestions.slice(0, 3).map((entry) => {
              const metadata = entry.metadata as { url?: string } | undefined;
              return (
                <div key={entry.id} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{entry.title}</span>
                    <span className="text-[11px] text-primary/70">{formatRelativeTime(entry.createdAt)}</span>
                  </div>
                  {entry.description ? (
                    <p className="text-xs text-slate-200">{entry.description}</p>
                  ) : null}
                  {metadata?.url ? (
                    <p className="truncate text-[10px] uppercase tracking-wide text-primary/70">{metadata.url}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleInsertHighlight(entry)}
                      className="rounded-full border border-primary/40 px-3 py-1 text-primary transition hover:border-primary hover:bg-primary/10"
                    >
                      Insert prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAskHighlight(entry)}
                      className="rounded-full border border-white/10 px-3 py-1 text-slate-200 transition hover:border-primary/50 hover:text-primary"
                    >
                      Ask now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {thread.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </section>
  );
};
