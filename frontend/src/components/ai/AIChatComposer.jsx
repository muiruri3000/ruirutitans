import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ChevronUp, Bot, ShieldCheck } from 'lucide-react';

export default function AIChatComposer({
  onSendMessage,
  isLoading,
  selectedProvider,
  onChangeProvider,
  providers = [],
}) {
  const [content, setContent] = useState('');
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [content]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!content.trim() || isLoading) return;
    onSendMessage(content.trim(), selectedProvider);
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const currentProviderObj = providers.find((p) => p.id === selectedProvider) || {
    id: selectedProvider,
    name: selectedProvider === 'claude' ? 'Claude 3.5 Sonnet' : (selectedProvider === 'gemini' ? 'Gemini 2.0 Flash' : 'Auto Fallback Pool'),
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50/70 dark:bg-slate-800/80 shadow-sm focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask about standings, fixtures, top scorers, players, bans, or transfers (e.g. 'Show table for senior league')..."
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none max-h-48"
          />

          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200/40 dark:border-slate-700/40">
            {/* Provider selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
              >
                <Sparkles size={13} className="text-amber-500" />
                <span>{currentProviderObj.name}</span>
                <ChevronUp size={12} className={`transition-transform ${showProviderMenu ? '' : 'rotate-180'}`} />
              </button>

              {showProviderMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-1.5 z-50">
                  <div className="text-[10px] font-semibold uppercase text-slate-400 px-2 py-1">
                    AI Model Engine
                  </div>
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onChangeProvider(p.id);
                        setShowProviderMenu(false);
                      }}
                      className={`w-full flex flex-col text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                        selectedProvider === p.id
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{p.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Factual grounding status & Send */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400">
                <ShieldCheck size={12} className="text-emerald-500" /> Factual Guardrails
              </span>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!content.trim() || isLoading}
                className={`p-2 rounded-xl text-white shadow-sm transition-all ${
                  content.trim() && !isLoading
                    ? 'bg-gradient-to-r from-amber-500 to-red-600 hover:opacity-95 shadow-amber-500/20 cursor-pointer'
                    : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-2 text-center text-[11px] text-slate-400">
          Titans AI cross-verifies statistics against live database records. Press Enter to send, Shift+Enter for new line.
        </div>
      </div>
    </div>
  );
}
