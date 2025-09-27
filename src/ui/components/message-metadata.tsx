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
  return (
    <header className="mb-2 flex items-center gap-2 text-xs text-slate-400">
      <span className="font-medium text-slate-200">{roleLabel[message.role]}</span>
      <span>•</span>
      <span>{formatRelativeTime(message.createdAt)}</span>
    </header>
  );
};
