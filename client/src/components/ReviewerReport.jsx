import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Info, GripHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

export const ReviewerReport = ({ report, onLogCanon, onReRun }) => {
    const isDetectable = report?.detectableFromBill;
    const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 500 });
    const [isDragging, setIsDragging] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false); // New State
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const reportRef = useRef(null);

    // Handle Window Resize to keep it on screen
    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => ({
                x: Math.min(prev.x, window.innerWidth - 400),
                y: Math.min(prev.y, window.innerHeight - 400)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Attach global listeners for smooth dragging outside the div (Needs to be conditional on drag, not report)
    // Actually, hooks always run.
    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]); // Added dragOffset to deps

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    if (!report) return null;

    return (
        <div
            ref={reportRef}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'auto'
            }}
            className="fixed w-96 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in duration-300"
        >
            {/* Draggable Header */}
            <div
                onMouseDown={handleMouseDown}
                className={`p-4 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none ${isDetectable ? 'bg-amber-50 border-b border-amber-100' : 'bg-slate-50 border-b border-slate-100'}`}
            >
                {isDetectable ? (
                    <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                        <AlertTriangle size={20} />
                    </div>
                ) : (
                    <div className="p-2 bg-slate-200 rounded-full text-slate-600">
                        <ShieldCheck size={20} />
                    </div>
                )}
                <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-sm">Truth Validity Report</h3>
                    <p className="text-xs text-slate-500">Phase 7: The Reviewer Agent</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-slate-400 hover:text-slate-600 transition"
                    >
                        {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </button>
                    <div className="text-slate-400 cursor-grab active:cursor-grabbing">
                        <GripHorizontal size={20} />
                    </div>
                </div>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-5 space-y-4">

                    {/* Detectability Status */}
                    <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDetectable ? 'text-amber-600' : 'text-slate-500'}`}>
                        {isDetectable ? "⚠️ Detectable Error" : "🔒 Hidden / Context Dependent"}
                    </div>

                    {/* Explanation */}
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Analysis</span>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            {report.explanation}
                        </p>
                    </div>

                    {/* Missing Info */}
                    {report.missingInfo && report.missingInfo !== "N/A" && (
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <div className="flex items-center gap-2 mb-1 text-blue-700">
                                <Info size={14} />
                                <span className="text-xs font-bold">Investigation Needs</span>
                            </div>
                            <p className="text-xs text-blue-800 italic">
                                "{report.missingInfo}"
                            </p>
                        </div>
                    )}
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={onReRun}
                            className="flex-1 bg-amber-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-amber-700 transition flex items-center justify-center gap-2"
                        >
                            <span>🔄 Re-Run Analysis</span>
                        </button>
                        <button
                            onClick={onLogCanon}
                            className="flex-1 bg-slate-800 text-white text-xs font-bold py-2 rounded-lg hover:bg-slate-900 transition flex items-center justify-center gap-2"
                        >
                            <span>📝 Log It</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
