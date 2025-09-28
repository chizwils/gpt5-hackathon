import clsx from 'clsx';
import type { JSX } from 'react';
import type { ChatMessage } from '@ui/state';
import { SparkleIcon, UserIcon } from '@ui/components/tokens';
import { MessageMetadata } from './message-metadata';

interface Props {
  message: ChatMessage;
}

const avatarStyles: Record<ChatMessage['role'], string> = {
  user: 'bg-primary/20 text-primary',
  assistant: 'bg-accent/20 text-accent',
  system: 'bg-slate-500/20 text-slate-300'
};

const roleIcon: Record<ChatMessage['role'], JSX.Element> = {
  user: <UserIcon className="h-4 w-4" />,
  assistant: <SparkleIcon className="h-4 w-4" />,
  system: <SparkleIcon className="h-4 w-4" />
};

export const MessageBubble = ({ message }: Props) => {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';

  const content = message.content?.length
    ? message.content
    : isStreaming
      ? 'Thinking...'
      : message.content;

  return (
    <article
      className={clsx(
        'flex gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm',
        isUser
          ? 'self-end border-primary/30 bg-primary/10 text-slate-100'
          : 'self-start border-white/5 bg-surface text-slate-200',
        isError && 'border-red-500/40 bg-red-500/10 text-red-100'
      )}
    >
      <div className={clsx('flex h-8 w-8 items-center justify-center rounded-full', avatarStyles[message.role])}>
        {roleIcon[message.role]}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <MessageMetadata message={message} />
        <p className={clsx('whitespace-pre-line leading-relaxed', isError && 'text-red-200')}>
          {content}
        </p>
        {isStreaming ? (
          <span className="mt-2 text-xs text-primary/70">Streaming from your semantic memory...</span>
        ) : null}
        {message.citations?.length ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-primary">
            {message.citations.map((citation) => (
              <li
                key={citation.href}
                className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1"
              >
                <a href={citation.href} className="hover:underline" target="_blank" rel="noreferrer">
                  {citation.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {message.evidence?.length ? (
          <div className="mt-3 space-y-2 rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-slate-300">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Context used</p>
            <ul className="space-y-2">
              {message.evidence.map((item, index) => (
                <li key={`${item.title}-${index}`} className="leading-snug">
                  <span className="font-medium text-slate-200">{item.title}</span>
                  <span className="mx-1 text-slate-500">•</span>
                  <span>{item.snippet}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
};
