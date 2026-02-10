import React, { useEffect, useRef } from 'react';
import { Terminal, Activity, CheckCircle2 } from 'lucide-react';

export const TelemetryPanel = ({ logs }) => {
    const scrollRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    if (!logs || logs.length === 0) return null;

    return (
        <div className="fixed bottom-8 left-8 w-96 bg-slate-900 text-green-400 rounded-xl shadow-2xl border border-slate-700 overflow-hidden z-40 font-mono text-xs opacity-90 hover:opacity-100 transition-opacity">
            {/* Header */}
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Terminal size={14} />
                    <span className="font-bold">Agent Telemetry</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                    <Activity size={12} className="animate-pulse text-green-500" />
                    <span>Live</span>
                </div>
            </div>

            {/* Log Stream */}
            <div ref={scrollRef} className="h-64 overflow-y-auto p-4 space-y-3 bg-slate-950">
                {logs.map((log, idx) => (
                    <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2 fade-in duration-300">
                        <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                        <div className="flex flex-col">
                            <span className={`font-bold ${log.color || 'text-green-400'}`}>{log.agent}</span>
                            <span className="text-slate-300">{log.message}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
