import { useEffect, useMemo, useState } from 'react';
import { getRecentTimelineEntries } from '@data/memory-service';
import type { TimelineEntryRecord } from '@data';
import { formatRelativeTime } from '@ui/hooks';

interface SessionRecapMetadata {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  pageCount: number;
  pages?: Array<{
    id: string;
    title: string;
    url: string;
    summary: string;
    capturedAt: string;
    lastInteractionAt: string;
    confidenceTags?: string[];
  }>;
}

const isSessionRecap = (entry: TimelineEntryRecord) =>
  entry.type === 'research_burst' && entry.tags?.includes('session-recap');
const isHighlight = (entry: TimelineEntryRecord) => entry.type === 'highlight';

const getDomain = (url?: string) => {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
};

export const SessionRecapPanel = () => {
  const [recaps, setRecaps] = useState<TimelineEntryRecord[]>([]);
  const [highlights, setHighlights] = useState<TimelineEntryRecord[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const entries = await getRecentTimelineEntries(50);
        if (!mounted) return;
        setRecaps(entries.filter(isSessionRecap));
        setHighlights(entries.filter(isHighlight));
      } catch (error) {
        console.debug('Failed to load recap entries', error);
      }
    };

    load();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        const payload = message as { type?: string; entry?: TimelineEntryRecord };
        if (payload.type === 'semantic-memory:timeline:new' && payload.entry) {
          setRecaps((prev) => [payload.entry!, ...prev.filter((entry) => entry.id !== payload.entry?.id)]
            .filter(isSessionRecap)
            .slice(0, 10));
          setHighlights((prev) => [payload.entry!, ...prev.filter((entry) => entry.id !== payload.entry?.id)]
            .filter(isHighlight)
            .slice(0, 10));
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

  const parsedRecaps = useMemo(
    () =>
      recaps.map((entry) => ({
        entry,
        metadata: entry.metadata as SessionRecapMetadata | undefined
      })),
    [recaps]
  );

  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col border-l border-white/5 bg-surfaceLight/80 p-4 lg:flex">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Session Recaps</h2>
        {parsedRecaps.length ? (
          <ul className="mt-3 space-y-3 text-xs">
            {parsedRecaps.slice(0, 6).map(({ entry, metadata }) => (
              <li key={entry.id} className="space-y-2 rounded-lg border border-white/5 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-100">{entry.title}</span>
                  <span className="text-[11px] text-slate-500">{formatRelativeTime(entry.createdAt)}</span>
                </div>
                <p className="text-[11px] text-slate-400">{entry.description}</p>
                {metadata?.pages?.length ? (
                  <ul className="space-y-2 rounded border border-white/10 bg-white/5 p-2">
                    {metadata.pages.slice(0, 3).map((page) => (
                      <li key={page.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-slate-100">{page.title}</span>
                          <span className="text-[10px] text-slate-500">{formatRelativeTime(page.lastInteractionAt)}</span>
                        </div>
                        {page.summary ? (
                          <p className="line-clamp-3 text-[11px] text-slate-400">{page.summary}</p>
                        ) : null}
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="truncate">{getDomain(page.url)}</span>
                          {page.confidenceTags?.length ? (
                            <span className="truncate text-primary/70">
                              {page.confidenceTags.slice(0, 2).join(', ')}
                              {page.confidenceTags.length > 2 ? '…' : ''}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">No recaps yet. Keep browsing!</p>
        )}
      </section>
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Highlights</h2>
        {highlights.length ? (
          <ul className="mt-3 space-y-3 text-xs">
            {highlights.slice(0, 8).map((entry) => {
              const metadata = entry.metadata as { url?: string } | undefined;
              return (
                <li key={entry.id} className="space-y-1 rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-100">{entry.title}</span>
                    <span className="text-[11px] text-primary/80">{formatRelativeTime(entry.createdAt)}</span>
                  </div>
                  {entry.description ? (
                    <p className="text-[11px] text-slate-100">{entry.description}</p>
                  ) : null}
                  {metadata?.url ? (
                    <p className="text-[10px] text-primary/70">{getDomain(metadata.url)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">No highlights yet.</p>
        )}
      </section>
    </aside>
  );
};
