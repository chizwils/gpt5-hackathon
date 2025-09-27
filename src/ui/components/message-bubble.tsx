import type { ChatMessage } from '../state/chat-store';
import { SparkleIcon, UserIcon } from './tokens/icons';
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

  return (
    <article
      className={`flex gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm shadow-sm ${
        isUser ? 'self-end bg-primary/10 text-slate-100' : 'self-start bg-surface text-slate-200'
      }`}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${avatarStyles[message.role]}`}>
        {roleIcon[message.role]}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <MessageMetadata message={message} />
        <p className="whitespace-pre-line leading-relaxed">
          {message.content}
        </p>
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
      </div>
    </article>
  );
};
