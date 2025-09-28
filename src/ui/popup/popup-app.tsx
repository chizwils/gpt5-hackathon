import { useEffect } from 'react';
import { MemoryInterface } from '@ui/components';
import { useChatStore } from '@ui/state';

export const PopupApp = () => {
  const hydrate = useChatStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-[600px] w-[800px] flex-col overflow-hidden bg-white text-gray-900">
      <MemoryInterface />
    </div>
  );
};
