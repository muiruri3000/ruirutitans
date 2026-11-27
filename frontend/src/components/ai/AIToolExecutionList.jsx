import React, { useState } from 'react';
import { Wrench, CheckCircle2, AlertCircle, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';

export default function AIToolExecutionList({ toolExecutions = [] }) {
  const [openIds, setOpenIds] = useState(new Set());

  if (!toolExecutions || toolExecutions.length === 0) return null;

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400 mb-2">
        <Wrench size={13} className="text-amber-500" />
        <span>MCP Tool Executions ({toolExecutions.length})</span>
      </div>

      <div className="space-y-1.5">
        {toolExecutions.map((t, index) => {
          const isOpen = openIds.has(t.id || index);
          const isSuccess = t.status === 'success';
          const isBlocked = t.status === 'blocked';

          return (
            <div
              key={t.id || index}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(t.id || index)}
                className="w-full flex items-center justify-between p-2 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                    {t.tool_name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {t.duration_ms}ms
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isSuccess ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={12} /> Success
                    </span>
                  ) : isBlocked ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      <ShieldAlert size={12} /> Blocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                      <AlertCircle size={12} /> Error
                    </span>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="p-2.5 pt-0 border-t border-slate-200/50 dark:border-slate-800/50 space-y-2 bg-white/50 dark:bg-slate-950/40">
                  {t.arguments && Object.keys(t.arguments).length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">
                        Input Arguments
                      </div>
                      <pre className="text-[11px] font-mono p-2 rounded bg-slate-100 dark:bg-slate-900 overflow-x-auto text-slate-700 dark:text-slate-300">
                        {JSON.stringify(t.arguments, null, 2)}
                      </pre>
                    </div>
                  )}

                  {t.result_payload && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">
                        Sanitized Result Payload
                      </div>
                      <pre className="text-[11px] font-mono p-2 rounded bg-slate-100 dark:bg-slate-900 overflow-x-auto max-h-48 text-slate-700 dark:text-slate-300">
                        {JSON.stringify(t.result_payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {t.error_message && (
                    <div className="text-[11px] text-red-500 font-medium">
                      Error: {t.error_message}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
