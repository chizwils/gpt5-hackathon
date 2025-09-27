import { useMemo } from 'react';
import clsx from 'clsx';
import { useChatStore } from '@ui/state';
import { formatRelativeTime } from '@ui/hooks';

export const HistorySidebar = () => {
  const threads = useChatStore((state) => state.threads);
  const activeThreadId = useChatStore((state) => state.activeThreadId);
  const selectThread = useChatStore((state) => state.selectThread);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [threads]
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
      <footer className="pt-4 text-xs text-slate-500">
        <p>Capture is paused • Local-only mode</p>
      </footer>
    </aside>
  );
};
