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
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';

  const content = message.content?.length
    ? message.content
    : isStreaming
      ? 'Thinking...'
      : message.content;

  return (
    <div className="space-y-3">
      <div className={clsx('whitespace-pre-line leading-relaxed', isError && 'text-red-600')}>
        {content}
      </div>
      
      {isStreaming ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-1 w-1 animate-pulse rounded-full bg-gray-400"></div>
          <div className="h-1 w-1 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.1s' }}></div>
          <div className="h-1 w-1 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }}></div>
          <span>Searching your memory...</span>
        </div>
      ) : null}
      
      {message.citations?.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Sources:</p>
          <ul className="flex flex-wrap gap-2">
            {message.citations.map((citation) => (
              <li key={citation.href}>
                <a 
                  href={citation.href} 
                  className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100" 
                  target="_blank" 
                  rel="noreferrer"
                >
                  {citation.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      
      {message.evidence?.length ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Context Used</p>
          <ul className="space-y-2 text-sm">
            {message.evidence.map((item, index) => (
              <li key={`${item.title}-${index}`} className="text-gray-700">
                <span className="font-medium">{item.title}</span>
                <span className="mx-1 text-gray-400">•</span>
                <span className="text-gray-600">{item.snippet}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
