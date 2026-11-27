import React, { useState, useEffect } from 'react';
import AIConversationSidebar from './AIConversationSidebar';
import AIMessageList from './AIMessageList';
import AIChatComposer from './AIChatComposer';
import AIEmptyState from './AIEmptyState';
import { api } from '../../api/client';
import { Menu, Bot, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function AIChatView() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('pool');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');

  // Initial load: fetch providers & conversations
  useEffect(() => {
    async function init() {
      try {
        const [provList, convList] = await Promise.all([
          api.ai.listProviders().catch(() => [
            { id: 'pool', name: 'Auto Fallback (Gemini + Claude)', description: 'Multi-model pool' },
            { id: 'claude', name: 'Anthropic Claude 3.5 Sonnet', description: 'Claude Messages API' },
            { id: 'gemini', name: 'Google Gemini 2.0 Flash', description: 'Gemini Generative API' },
          ]),
          api.ai.listConversations().catch(() => []),
        ]);
        setProviders(provList);
        setConversations(convList);

        if (convList && convList.length > 0) {
          loadConversation(convList[0].id);
        }
      } catch (err) {
        console.error('Failed to initialize AI interface:', err);
      }
    }
    init();
  }, []);

  const loadConversation = async (convId) => {
    try {
      setErrorBanner('');
      const detail = await api.ai.getConversation(convId);
      setActiveConversation(detail);
      if (detail.provider_name) {
        setSelectedProvider(detail.provider_name);
      }
    } catch (err) {
      setErrorBanner(`Failed to load conversation: ${err.message}`);
    }
  };

  const handleNewConversation = async () => {
    try {
      setErrorBanner('');
      const created = await api.ai.createConversation({
        title: 'New Analysis',
        provider_name: selectedProvider,
      });
      setConversations((prev) => [created, ...prev]);
      setActiveConversation(created);
      setIsSidebarOpen(false);
    } catch (err) {
      setErrorBanner(`Failed to create conversation: ${err.message}`);
    }
  };

  const handleDeleteConversation = async (convId) => {
    try {
      await api.ai.deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversation?.id === convId) {
        setActiveConversation(null);
      }
    } catch (err) {
      setErrorBanner(`Failed to delete conversation: ${err.message}`);
    }
  };

  const handleSendMessage = async (text, providerOverride) => {
    setErrorBanner('');
    let conv = activeConversation;

    if (!conv) {
      try {
        conv = await api.ai.createConversation({
          title: text.slice(0, 50),
          provider_name: providerOverride || selectedProvider,
        });
        setConversations((prev) => [conv, ...prev]);
        setActiveConversation(conv);
      } catch (err) {
        setErrorBanner(`Failed to initialize session: ${err.message}`);
        return;
      }
    }

    // Optimistically append user message
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setActiveConversation((prev) => ({
      ...prev,
      messages: [...(prev?.messages || []), tempUserMsg],
    }));

    setIsLoading(true);

    try {
      const turnResp = await api.ai.sendMessage(conv.id, {
        content: text,
        provider_name: providerOverride || selectedProvider,
      });

      // Update active conversation with authoritative assistant message and tools
      setActiveConversation((prev) => ({
        ...prev,
        messages: [
          ...(prev?.messages || []).filter((m) => m.id !== tempUserMsg.id),
          turnResp.user_message,
          turnResp.assistant_message,
        ],
      }));

      // Refresh conversations list to update titles/timestamps
      api.ai.listConversations().then(setConversations).catch(() => {});
    } catch (err) {
      setErrorBanner(err.message || 'Failed to generate response. Check model configuration.');
      // Remove optimistic message on failure
      setActiveConversation((prev) => ({
        ...prev,
        messages: (prev?.messages || []).filter((m) => m.id !== tempUserMsg.id),
      }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white dark:bg-slate-900 overflow-hidden">
      {/* Sidebar */}
      <AIConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        onSelectConversation={(id) => {
          loadConversation(id);
          setIsSidebarOpen(false);
        }}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main chat surface */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950/40">
        {/* Top bar inside chat */}
        <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shadow-sm">
                <Bot size={18} />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
                  {activeConversation?.title || 'Ruiru Titans AI Assistant'}
                </h1>
                <p className="text-[10px] text-slate-400">
                  Model Context Protocol Grounding • Claude + Gemini
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck size={12} /> Guardrails Active
            </span>
          </div>
        </div>

        {/* Error notification banner */}
        {errorBanner && (
          <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">{errorBanner}</span>
            <button
              onClick={() => setErrorBanner('')}
              className="text-red-400 hover:text-red-600 font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Message stream or empty state */}
        {activeConversation && activeConversation.messages && activeConversation.messages.length > 0 ? (
          <AIMessageList
            messages={activeConversation.messages}
            isLoading={isLoading}
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <AIEmptyState
              onSelectPrompt={(prompt) => handleSendMessage(prompt, selectedProvider)}
              selectedProvider={selectedProvider}
            />
          </div>
        )}

        {/* Message Composer */}
        <AIChatComposer
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          selectedProvider={selectedProvider}
          onChangeProvider={setSelectedProvider}
          providers={providers}
        />
      </div>
    </div>
  );
}
