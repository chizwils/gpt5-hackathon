import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useChatStore } from '@ui/state';
import { getRecentTimelineEntries } from '@data/memory-service';
import type { TimelineEntryRecord } from '@data';
import { formatRelativeTime } from '@ui/hooks';

const getDomain = (url?: string) => {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
};

export const HistorySidebar = () => {
  const threads = useChatStore((state) => state.threads);
  const activeThreadId = useChatStore((state) => state.activeThreadId);
  const selectThread = useChatStore((state) => state.selectThread);
  const [activity, setActivity] = useState<TimelineEntryRecord[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const entries = await getRecentTimelineEntries(20);
        if (mounted) setActivity(entries);
      } catch (error) {
        console.debug('Failed to load timeline entries', error);
      }
    };

    load();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const payload = message as { type?: string; entry?: TimelineEntryRecord };
        if (payload.type === 'semantic-memory:timeline:new' && payload.entry) {
          setActivity((prev) => [payload.entry!, ...prev].slice(0, 8));
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

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [threads]
  );

  const highlightEntries = useMemo(
    () => activity.filter((entry) => entry.type === 'highlight'),
    [activity]
  );

  return (
    <aside className="hidden h-full w-64 flex-shrink-0 flex-col border-r border-white/5 bg-surface p-4 md:flex">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Memory Threads</h2>
        <button
          className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-300 transition hover:border-primary/60 hover:text-primary"
          type="button"
          title="Start a new memory chat (coming soon)"
        >
          New
        </button>
      </header>
      <nav className="flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {sortedThreads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          const preview = thread.messages[thread.messages.length - 1]?.content ?? 'No messages yet';
          const relative = formatRelativeTime(thread.updatedAt);

          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => selectThread(thread.id)}
              className={clsx(
                'group block w-full rounded-lg px-3 py-2 text-left transition',
                isActive
                  ? 'bg-surfaceLight/90 shadow-inner'
                  : 'border border-white/5 hover:border-white/20 hover:bg-surfaceLight/40'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-100">{thread.title}</span>
                <span className="text-xs text-slate-500">{relative}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{preview}</p>
              {thread.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {thread.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </nav>
      <section className="mt-6 border-t border-white/5 pt-4 text-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent Activity</h3>
        {activity.length ? (
          <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30">
            <ul className="space-y-3 text-xs pr-2">
              {activity.map((entry) => {
              const metadata = entry.metadata as {
                tabs?: Array<{ title?: string; url?: string }>;
                forms?: Array<{ type?: string; formId?: string; action?: string; fieldCount?: number }>;
                events?: Array<{ type?: string; mediaType?: string }>;
              } | undefined;
              const tabs = metadata?.tabs ?? [];
              const forms = metadata?.forms ?? [];
              const events = metadata?.events ?? [];
              return (
                <li key={entry.id} className="space-y-2 rounded-lg border border-white/5 bg-white/5 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-100">{entry.title}</span>
                    <span className="text-[11px] text-slate-500">{formatRelativeTime(entry.createdAt)}</span>
                  </div>
                  {entry.description ? (
                    <p className="text-[11px] text-slate-400">{entry.description}</p>
                  ) : null}
                  {tabs.length ? (
                    <ul className="space-y-1 rounded border border-white/10 bg-white/5 p-2">
                      {tabs.slice(0, 4).map((tab, idx) => (
                        <li key={`${entry.id}-tab-${idx}`} className="flex items-center gap-2 text-[11px] text-slate-300">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] uppercase text-primary">{getDomain(tab.url).slice(0, 2)}</span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">{tab.title ?? getDomain(tab.url)}</p>
                            <p className="truncate text-[10px] text-slate-500">{getDomain(tab.url)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {forms.length ? (
                    <ul className="space-y-1 rounded border border-primary/20 bg-primary/5 p-2">
                      {forms.map((form, idx) => (
                        <li key={`${entry.id}-form-${idx}`} className="text-[11px] text-primary">
                          {form.type === 'submit' ? 'Submitted form' : 'Form interaction'}
                          {form.fieldCount ? ` • ${form.fieldCount} fields` : ''}
                          {form.action ? ` • ${getDomain(form.action)}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {events.length ? (
                    <ul className="space-y-1 rounded border border-accent/20 bg-accent/5 p-2">
                      {events.map((event, idx) => (
                        <li key={`${entry.id}-event-${idx}`} className="text-[11px] text-accent">
                          {event.type === 'enter' ? 'Entered PiP' : 'Exited PiP'}
                          {event.mediaType ? ` • ${event.mediaType}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {entry.tags?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Behaviour insights will appear here as you browse.</p>
        )}
      </section>
      <section className="mt-4 space-y-3 border-t border-white/5 pt-4 text-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Highlights</h3>
        {highlightEntries.length ? (
          <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/30">
            <ul className="space-y-3 text-xs pr-2">
              {highlightEntries.map((entry) => {
                const metadata = entry.metadata as { url?: string } | undefined;
                return (
                  <li key={entry.id} className="space-y-2 rounded-lg border border-primary/20 bg-primary/10 p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{entry.title}</span>
                      <span className="text-[11px] text-primary/70">{formatRelativeTime(entry.createdAt)}</span>
                    </div>
                    {entry.description ? (
                      <p className="text-[11px] text-slate-100">{entry.description}</p>
                    ) : null}
                    {metadata?.url ? (
                      <p className="truncate text-[10px] text-primary/70">{getDomain(metadata.url)}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">No highlights captured yet.</p>
        )}
      </section>
      <footer className="pt-4 text-xs text-slate-500">
        <p>Capture is paused • Local-only mode</p>
      </footer>
    </aside>
  );
};
