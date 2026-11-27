import React from 'react';
import { Bot, Sparkles, Trophy, Users, ShieldAlert, ShieldCheck, Calendar, Swords, Video } from 'lucide-react';

const SUGGESTIONS = [
  {
    icon: Trophy,
    title: "League Standings",
    prompt: "Show me the current standings for the championship league with points and goal differences.",
  },
  {
    icon: ShieldCheck,
    title: "Clean Sheets & Cards",
    prompt: "Show the clean-sheet leaderboard and disciplinary yellow and red card totals.",
  },
  {
    icon: Swords,
    title: "Head-to-Head Analysis",
    prompt: "Compare head-to-head records and past encounters between Titans Red and Titans Blue.",
  },
  {
    icon: ShieldAlert,
    title: "Active Bans",
    prompt: "Are there any active player suspensions or bans in effect?",
  },
  {
    icon: Sparkles,
    title: "Team of the Week",
    prompt: "Who are the leaders in the Team of the Week voting and what is the current lineup?",
  },
  {
    icon: Calendar,
    title: "Upcoming Fixtures",
    prompt: "What are the upcoming scheduled fixtures this week?",
  },
];

export default function AIEmptyState({ onSelectPrompt, selectedProvider }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center max-w-2xl mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 mb-6">
        <Bot size={36} />
      </div>

      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Ruiru Titans FC AI Assistant
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
        Authoritative sports intelligence powered by Model Context Protocol (MCP) tools with factual grounding and cross-AI integration.
      </p>

      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 mb-8">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        Model Active: <span className="font-semibold text-amber-600 dark:text-amber-400">{selectedProvider === 'claude' ? 'Claude 3.5 Sonnet' : (selectedProvider === 'gemini' ? 'Gemini 2.0 Flash' : 'Auto Fallback Pool')}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {SUGGESTIONS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(s.prompt)}
              className="flex items-start gap-3 p-3.5 text-left rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-amber-500/50 dark:hover:border-amber-500/50 transition-all duration-200 group shadow-sm"
            >
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <Icon size={18} />
              </div>
              <div>
                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 mb-0.5">
                  {s.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {s.prompt}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
