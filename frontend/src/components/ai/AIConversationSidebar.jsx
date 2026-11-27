import React from 'react';
import { Plus, MessageSquare, Trash2, X, Bot, Sparkles } from 'lucide-react';

export default function AIConversationSidebar({
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isOpen,
  onClose,
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Bot size={18} />
          </div>
          <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
            Conversations
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X size={16} />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs shadow-sm shadow-amber-500/20 transition-all cursor-pointer"
        >
          <Plus size={16} />
          <span>New AI Conversation</span>
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center py-8 px-4 text-xs text-slate-400">
            No previous conversations. Start a new session!
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeConversationId;
            return (
              <div
                key={c.id}
                className={`group flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium border border-amber-200/60 dark:border-amber-800/60'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                onClick={() => onSelectConversation(c.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <MessageSquare size={14} className={isActive ? 'text-amber-600 dark:text-amber-400 shrink-0' : 'text-slate-400 shrink-0'} />
                  <span className="truncate">{c.title || 'Untitled Conversation'}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this conversation?')) {
                      onDeleteConversation(c.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
                  title="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-amber-500" />
          <span>MCP Gateway v1.0</span>
        </span>
        <span className="font-mono text-[10px] text-emerald-500">Live</span>
      </div>
    </aside>
  );
}
