import { useEffect } from 'react';
import { ChatLayout } from '@ui/components';
import { useChatStore } from '@ui/state';

export const PopupApp = () => {
  const activeThreadId = useChatStore((state) => state.activeThreadId);
  const hydrate = useChatStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-[600px] w-[780px] flex-col overflow-hidden rounded-xl bg-surfaceLight text-slate-100 shadow-lg">
      <ChatLayout key={activeThreadId} />
    </div>
  );
};
