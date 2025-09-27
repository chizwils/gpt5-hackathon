import { useEffect, useRef } from 'react';
import { useChatStore } from '@ui/state';
import { MessageBubble } from './message-bubble';

export const MessageList = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const thread = useChatStore((state) =>
    state.threads.find((t) => t.id === state.activeThreadId)
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [thread]);

  if (!thread) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 bg-surfaceLight px-6 py-8 text-center text-sm text-slate-400">
        <p>Select a memory thread to review captured knowledge.</p>
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className="flex-1 space-y-4 overflow-y-auto bg-surfaceLight px-6 py-4 text-sm"
    >
      {thread.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </section>
  );
};
