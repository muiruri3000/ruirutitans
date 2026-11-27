import React from 'react';
import { User, Bot, ShieldCheck, Info, Sparkles } from 'lucide-react';
import AIToolExecutionList from './AIToolExecutionList';

function formatMarkdownText(content = '') {
  // Simple, resilient parser for markdown headings, bold, bullet points, tables, code
  const lines = content.split('\n');
  const elements = [];
  let inTable = false;
  let tableRows = [];

  const flushTable = (key) => {
    if (tableRows.length > 0) {
      const header = tableRows[0];
      const rows = tableRows.slice(2); // skip header and separator
      elements.push(
        <div key={`table-${key}`} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                {header.map((col, idx) => (
                  <th key={idx} className="px-3 py-2">{col.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-slate-800 bg-white dark:bg-slate-900/50">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
    inTable = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      const cells = trimmed.split('|').slice(1, -1);
      tableRows.push(cells);
      return;
    } else if (inTable) {
      flushTable(index);
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={index} className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3 mb-1">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={index} className="text-base font-bold text-slate-900 dark:text-slate-50 mt-4 mb-2">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={index} className="ml-4 list-disc text-xs text-slate-700 dark:text-slate-200 my-0.5">
          {trimmed.replace(/^[-*]\s+/, '')}
        </li>
      );
    } else if (trimmed) {
      elements.push(
        <p key={index} className="text-xs text-slate-700 dark:text-slate-200 my-1 leading-relaxed">
          {trimmed}
        </p>
      );
    }
  });

  if (inTable) {
    flushTable('end');
  }

  return elements;
}

export default function AIMessageItem({ message }) {
  const isUser = message.role === 'user';
  const isGrounded = message.grounding_status === 'grounded';
  const hasTools = (message.tool_executions || []).length > 0;

  return (
    <div className={`flex gap-3 my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5">
          <Bot size={18} />
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 shadow-sm border ${
        isUser
          ? 'bg-amber-600 text-white border-amber-600 rounded-tr-none'
          : 'bg-white dark:bg-slate-850 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-750 rounded-tl-none'
      }`}>
        {/* Header tags for assistant messages */}
        {!isUser && (
          <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px]">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Sparkles size={12} className="text-amber-500" />
              {message.model_name || message.provider_name || 'AI Assistant'}
            </span>

            {isGrounded && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
                <ShieldCheck size={12} /> Verified Grounded
              </span>
            )}

            {!isGrounded && message.grounding_status === 'direct' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <Info size={12} /> Direct Response
              </span>
            )}

            {message.total_tokens > 0 && (
              <span className="text-[10px] text-slate-400 ml-auto">
                {message.total_tokens} tokens
              </span>
            )}
          </div>
        )}

        {/* Message body */}
        <div className={isUser ? "text-xs text-white leading-relaxed whitespace-pre-wrap font-sans" : "space-y-1"}>
          {isUser ? message.content : formatMarkdownText(message.content)}
        </div>

        {/* MCP tool executions trace */}
        {!isUser && hasTools && (
          <AIToolExecutionList toolExecutions={message.tool_executions} />
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0 shadow-sm mt-0.5">
          <User size={18} />
        </div>
      )}
    </div>
  );
}
