import { FormEvent } from 'react';
import clsx from 'clsx';
import { useChatStore } from '@ui/state';
import { LightningIcon, SendIcon } from '@ui/components/tokens';

const quickPrompts = [
  'Summarize the last 24h',
  'Show pages about GPT-5 vision',
  'Cluster research on browser OCR'
];

export const Composer = () => {
  const value = useChatStore((state) => state.composerValue);
  const setValue = useChatStore((state) => state.setComposerValue);
  const send = useChatStore((state) => state.sendMessage);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(value);
  };

  return (
    <footer className="border-t border-white/5 bg-surface px-6 py-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Ask Semantic Memory anything..."
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-2xl border border-white/10 bg-surfaceLight px-4 py-3 text-sm text-slate-100 shadow-inner focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="pointer-events-none absolute bottom-3 right-4 text-xs text-slate-500">
              {value.length}/500
            </div>
          </div>
          <button
            type="submit"
            className={clsx(
              'flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-primary/20 text-primary transition',
              value.trim() ? 'hover:border-primary hover:bg-primary hover:text-surface' : 'opacity-70'
            )}
            title="Send"
            disabled={!value.trim()}
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setValue(prompt)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300 transition hover:border-primary/50 hover:text-primary"
            >
              <LightningIcon className="h-3.5 w-3.5" />
              {prompt}
            </button>
          ))}
        </div>
      </form>
      <p className="mt-3 text-[11px] text-slate-500">
        Local-only mode active. Enable GPT-5 vision or OCR from Settings → Integrations to enhance recall.
      </p>
    </footer>
  );
};
