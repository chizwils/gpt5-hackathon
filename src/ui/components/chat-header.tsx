import { useMemo } from 'react';
import { useChatStore } from '@ui/state';
import { formatRelativeTime } from '@ui/hooks';

const statusPill = {
  base: 'inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300',
  live: 'bg-primary/10 text-primary border-primary/30',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
};

export const ChatHeader = () => {
  const thread = useChatStore((state) =>
    state.threads.find((t) => t.id === state.activeThreadId)
  );

  const headerMeta = useMemo(() => {
    if (!thread) return null;
    return {
      title: thread.title,
      subtitle: `Updated ${formatRelativeTime(thread.updatedAt)}`,
      tags: thread.tags ?? []
    };
  }, [thread]);

  if (!thread) {
    return (
      <header className="flex items-center justify-between border-b border-white/5 bg-surface px-6 py-4 text-sm text-slate-300">
        <div>
          <h1 className="font-semibold text-slate-100">No conversation selected</h1>
          <p className="text-xs text-slate-500">Choose a memory thread on the left to continue.</p>
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between border-b border-white/5 bg-surface px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">{headerMeta?.title}</h1>
        <p className="text-sm text-slate-400">{headerMeta?.subtitle}</p>
        {headerMeta?.tags.length ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-slate-500">
            {headerMeta?.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span className={`${statusPill.base} ${statusPill.paused}`}>
          <span className="h-2 w-2 rounded-full bg-yellow-400" />
          Capture paused
        </span>
        <button
          type="button"
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-primary/60 hover:text-primary"
        >
          Export
        </button>
      </div>
    </header>
  );
};
