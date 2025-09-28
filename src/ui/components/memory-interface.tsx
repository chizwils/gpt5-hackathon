import { useState, useEffect } from 'react';
import { useChatStore } from '@ui/state';
import { useActivitySuggestions } from '@ui/hooks';
import { LightningIcon, SendIcon, SparkleIcon, UserIcon } from '@ui/components/tokens';
import { MessageBubble } from './message-bubble';
import clsx from 'clsx';

export const MemoryInterface = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showConversation, setShowConversation] = useState(false);
  
  const send = useChatStore((state) => state.sendMessage);
  const threads = useChatStore((state) => state.threads);
  const activeThreadId = useChatStore((state) => state.activeThreadId);
  const selectThread = useChatStore((state) => state.selectThread);
  const { suggestions, isLoading } = useActivitySuggestions();
  
  // Get messages from active thread
  const activeThread = threads.find(thread => thread.id === activeThreadId);
  const messages = activeThread?.messages || [];
  
  // Auto-show conversation when messages exist
  useEffect(() => {
    if (messages.length > 0) {
      setShowConversation(true);
    }
  }, [messages.length]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      // Ensure we have an active thread or select the first one
      if (!activeThreadId && threads.length > 0) {
        selectThread(threads[0].id);
      }
      send(query);
      setSearchQuery('');
    }
  };

  const handleNewSearch = () => {
    setShowConversation(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <SparkleIcon className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Semantic Memory</h1>
          </div>
        </div>
        
        {showConversation && (
          <button
            onClick={handleNewSearch}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            New chat
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {showConversation ? (
        // Conversation View - ChatGPT Style
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <div className="mx-auto max-w-4xl">
              {messages.filter(msg => msg.role !== 'system').map((message, index) => (
                <div
                  key={message.id}
                  className={clsx(
                    'border-b border-gray-100 px-4 py-6',
                    message.role === 'assistant' ? 'bg-gray-50' : 'bg-white'
                  )}
                >
                  <div className="mx-auto flex max-w-3xl gap-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
                      {message.role === 'assistant' ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600">
                          <SparkleIcon className="h-4 w-4 text-white" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800">
                          <UserIcon className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 space-y-3">
                      <div className="text-sm font-medium text-gray-900">
                        {message.role === 'assistant' ? 'Semantic Memory' : 'You'}
                      </div>
                      <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
                        <MessageBubble message={message} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Bottom Search Bar - ChatGPT Style */}
          <div className="border-t border-gray-200 bg-white px-4 py-4">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Message Semantic Memory..."
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-12 text-gray-900 placeholder-gray-500 shadow-sm transition focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <button
                  type="submit"
                  disabled={!searchQuery.trim()}
                  className={clsx(
                    'absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition',
                    searchQuery.trim()
                      ? 'bg-black text-white hover:bg-gray-800'
                      : 'bg-gray-200 text-gray-400'
                  )}
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        // Search Interface - ChatGPT Style
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
          {/* Welcome Message */}
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-3xl font-semibold text-gray-900">What would you like to remember?</h2>
            <p className="text-gray-600">Ask questions about your browsing history, research, or discoveries</p>
          </div>

          {/* Search Interface */}
          <div className="w-full max-w-2xl">
            <form onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Message Semantic Memory..."
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-4 pr-12 text-gray-900 placeholder-gray-500 shadow-sm transition focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <button
                  type="submit"
                  disabled={!searchQuery.trim()}
                  className={clsx(
                    'absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition',
                    searchQuery.trim()
                      ? 'bg-black text-white hover:bg-gray-800'
                      : 'bg-gray-200 text-gray-400'
                  )}
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              </div>
            </form>

            {/* Smart Suggestions */}
            <div className="mt-8">
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-600">Smart suggestions based on your activity</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {isLoading ? (
                  <div className="flex items-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-4 py-2 text-gray-600">
                    <LightningIcon className="h-4 w-4 animate-pulse" />
                    <span className="text-sm">Analyzing your memory...</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((suggestion) => (
                    <button
                      key={suggestion.text}
                      onClick={() => handleSearch(suggestion.text)}
                      className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 hover:border-gray-400"
                    >
                      <LightningIcon className="h-3.5 w-3.5" />
                      {suggestion.text}
                    </button>
                  ))
                ) : (
                  // Fallback suggestions while OpenAI loads
                  ['Summarize my recent activity', 'What did I research today?', 'Show my browsing patterns'].map((text) => (
                    <button
                      key={text}
                      onClick={() => handleSearch(text)}
                      className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 hover:border-gray-400"
                    >
                      <LightningIcon className="h-3.5 w-3.5" />
                      {text}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};