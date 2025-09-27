import { HistorySidebar } from './history-sidebar';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { Composer } from './composer';

export const ChatLayout = () => {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <HistorySidebar />
      <main className="flex flex-1 flex-col bg-surfaceLight">
        <ChatHeader />
        <MessageList />
        <Composer />
      </main>
    </div>
  );
};
