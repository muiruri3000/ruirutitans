import React, { useEffect, useRef } from 'react';
import AIMessageItem from './AIMessageItem';
import { Loader2, Bot } from 'lucide-react';

export default function AIMessageList({ messages = [], isLoading = false }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2">
      {messages.map((msg, index) => (
        <AIMessageItem key={msg.id || index} message={msg} />
      ))}

      {isLoading && (
        <div className="flex gap-3 my-4 justify-start">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
            <Bot size={18} />
          </div>
          <div className="rounded-2xl p-4 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 shadow-sm rounded-tl-none">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin text-amber-500" />
              <span>Analyzing fixtures, stats, and records via MCP tools...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
