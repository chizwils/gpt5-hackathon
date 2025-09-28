import type { ChatMessage } from '@ui/state';
import { formatRelativeTime } from '@ui/hooks';

interface Props {
  message: ChatMessage;
}

const roleLabel: Record<ChatMessage['role'], string> = {
  user: 'You',
  assistant: 'Semantic Memory',
  system: 'System'
};

export const MessageMetadata = ({ message }: Props) => {
  const statusLabel =
    message.status === 'streaming' ? 'Streaming' : message.status === 'error' ? 'Error' : undefined;
  const statusColor = message.status === 'error' ? 'text-red-300' : 'text-primary';

  return (
    <header className="mb-2 flex items-center gap-2 text-xs text-slate-400">
      <span className="font-medium text-slate-200">{roleLabel[message.role]}</span>
      <span>•</span>
      <span>{formatRelativeTime(message.createdAt)}</span>
      {statusLabel ? (
        <>
          <span>•</span>
          <span className={statusColor}>{statusLabel}</span>
        </>
      ) : null}
    </header>
  );
};
