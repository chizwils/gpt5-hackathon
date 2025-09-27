import { ChatLayout } from '../components/chat-layout';
import { useChatStore } from '../state/chat-store';

export const PopupApp = () => {
  const { activeThreadId } = useChatStore();

  return (
    <div className="flex h-[600px] w-[780px] flex-col overflow-hidden rounded-xl bg-surfaceLight text-slate-100 shadow-lg">
      <ChatLayout key={activeThreadId} />
    </div>
  );
};
