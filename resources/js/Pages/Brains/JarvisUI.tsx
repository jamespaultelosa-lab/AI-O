import React, { useEffect, useState, useRef } from 'react';
import { Head } from '@inertiajs/react';
import BrainNode from '@/Components/BrainNode';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import axios from 'axios';

// Setup global Pusher for Echo
(window as any).Pusher = Pusher;

interface BrainData {
    name: string;
    persona: string;
    status: string;
}

interface JarvisUIProps {
    brains: Record<string, BrainData>;
}

const TypingMessage = ({ text, onComplete }: { text: string, onComplete?: () => void }) => {
    const [displayedText, setDisplayedText] = useState('');

    useEffect(() => {
        const startTime = Date.now();
        const durationPerChar = 30; // 30ms per character

        const intervalId = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const charsToShow = Math.floor(elapsed / durationPerChar);
            
            if (charsToShow >= text.length) {
                setDisplayedText(text); // Finish
                clearInterval(intervalId);
                if (onComplete) onComplete();
            } else {
                setDisplayedText(text.slice(0, charsToShow));
            }
        }, 16); // Run every frame (16ms) to guarantee smooth updates without drift
        
        return () => clearInterval(intervalId);
    }, [text, onComplete]);

    return <>{displayedText}</>;
};

interface MemoryEntry {
    id: string;
    title: string;
    date: string;
    what_happened: string;
    root_cause: string;
    fix: string;
    lesson: string;
    severity: string;
}

export default function JarvisUI({ brains: initialBrains }: JarvisUIProps) {
    const [brains, setBrains] = useState(initialBrains);
    const [messages, setMessages] = useState<{ id: number, brain: string, text: string, time: string }[]>([]);
    const [activeTab, setActiveTab] = useState<'thoughts' | 'memory'>('thoughts');
    const [memories, setMemories] = useState<MemoryEntry[]>([]);
    const [expandedMemory, setExpandedMemory] = useState<string | null>(null);

    const clearMemories = () => {
        setMemories([]);
    };
    const [visibleCount, setVisibleCount] = useState(15);
    const [autoScroll, setAutoScroll] = useState(true);
    const [taskInput, setTaskInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(400);
    const [isLightMode, setIsLightMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('fais_theme') === 'light';
        }
        return false;
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('fais_theme', isLightMode ? 'light' : 'dark');
        }
    }, [isLightMode]);

    const getBrainColor = (brainName: string) => {
        switch (brainName) {
            case 'Architect': return 'text-purple-400';
            case 'Senior_Dev': return 'text-blue-400';
            case 'Junior_Dev': return 'text-green-400';
            case 'Security': return 'text-red-400';
            case 'USER': return 'text-yellow-400 font-extrabold';
            case 'SYSTEM': return 'text-white/80 font-bold';
            default: return 'text-cyan-300';
        }
    };

    const getBrainBgColor = (brainName: string) => {
        if (isLightMode) {
            switch (brainName) {
                case 'Architect': return 'bg-purple-100 border-purple-300';
                case 'Senior_Dev': return 'bg-blue-100 border-blue-300';
                case 'Junior_Dev': return 'bg-green-100 border-green-300';
                case 'Security': return 'bg-red-100 border-red-300';
                case 'USER': return 'bg-yellow-100 border-yellow-300';
                case 'SYSTEM': return 'bg-slate-200 border-slate-300';
                default: return 'bg-cyan-100 border-cyan-300';
            }
        } else {
            switch (brainName) {
                case 'Architect': return 'bg-purple-950/20 border-purple-900/30';
                case 'Senior_Dev': return 'bg-blue-950/20 border-blue-900/30';
                case 'Junior_Dev': return 'bg-green-950/20 border-green-900/30';
                case 'Security': return 'bg-red-950/20 border-red-900/30';
                case 'USER': return 'bg-yellow-950/10 border-yellow-900/30';
                case 'SYSTEM': return 'bg-gray-800/40 border-gray-600/30';
                default: return 'bg-cyan-950/20 border-cyan-900/30';
            }
        }
    };

    const dispatchTask = async (taskText: string) => {
        if (!taskText.trim() || isSubmitting) return;
        setIsSubmitting(true);

        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            brain: 'USER',
            text: taskText,
            time: new Date().toLocaleTimeString([], { hour12: false })
        }].slice(-500));

        if (autoScroll) {
            setVisibleCount(prev => Math.min(prev + 1, 500));
        }

        setTimeout(async () => {
            try {
                await axios.post('/api/brain/dispatch', { task: taskText });
            } catch (error) {
                console.error("Failed to dispatch task", error);
                setMessages(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    brain: 'SYSTEM',
                    text: 'ERROR: Failed to reach orchestrator.',
                    time: new Date().toLocaleTimeString([], { hour12: false })
                }].slice(-500));
            } finally {
                setIsSubmitting(false);
            }
        }, 1000);
    };

    const handleTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = taskInput;
        setTaskInput('');
        await dispatchTask(text);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (autoScroll) {
            scrollToBottom();
        }
    }, [messages, autoScroll]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

        // If near top, load older messages
        if (scrollTop < 50 && visibleCount < messages.length) {
            setVisibleCount(prev => Math.min(prev + 20, messages.length));
        }

        // If user scrolls up manually, disable auto-scroll. Enable if they scroll back to bottom.
        if (scrollHeight - scrollTop - clientHeight < 50) {
            setAutoScroll(true);
        } else {
            setAutoScroll(false);
        }
    };

    useEffect(() => {
        // Fetch message history on load
        const fetchHistory = async () => {
            try {
                const res = await axios.get('/api/brain/history');
                const history = res.data.map((msg: any) => ({
                    id: msg.id,
                    brain: msg.brain,
                    text: msg.message,
                    time: new Date(msg.created_at).toLocaleTimeString([], { hour12: false })
                }));
                setMessages(history);
                // Jump straight to bottom without animation to show latest
                setTimeout(() => {
                    if (messagesEndRef.current) {
                        messagesEndRef.current.scrollIntoView();
                    }
                }, 100);
            } catch (err) {
                console.error("Failed to load message history", err);
            }
        };
        fetchHistory();

        // Initialize Echo
        const echo = new Echo({
            broadcaster: 'reverb',
            key: import.meta.env.VITE_REVERB_APP_KEY,
            wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
            wsPort: import.meta.env.VITE_REVERB_PORT ?? 8081,
            wssPort: import.meta.env.VITE_REVERB_PORT ?? 8081,
            forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
            enabledTransports: ['ws', 'wss'],
        });

        // Listen for BrainStatusChanged events on public channel
        echo.channel('brains.status')
            .listen('BrainStatusChanged', (e: { brainName: string, status: string }) => {
                setBrains(prev => {
                    const brainKey = Object.keys(prev).find(
                        key => prev[key].name === e.brainName || key === e.brainName
                    );

                    if (brainKey) {
                        return {
                            ...prev,
                            [brainKey]: {
                                ...prev[brainKey],
                                status: e.status
                            }
                        };
                    }
                    return prev;
                });
            });

        // Listen for BrainMessageBroadcast events
        echo.channel('brains.messages')
            .listen('BrainMessageBroadcast', (e: { brainName: string, message: string, timestamp: string }) => {
                setMessages(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    brain: e.brainName,
                    text: e.message,
                    time: new Date(e.timestamp).toLocaleTimeString([], { hour12: false })
                }].slice(-500)); // Keep up to 500 in memory

                // If auto-scrolling is enabled, also bump the visible count so we don't hide new messages
                if (autoScroll) {
                    setVisibleCount(prev => Math.min(prev + 1, 500));
                }
            });

        // Fetch memory vault history
        const fetchMemories = async () => {
            try {
                const res = await axios.get('/api/brain/memory');
                if (res.data.status === 'success') {
                    setMemories(res.data.memories);
                }
            } catch (err) {
                console.error("Failed to load memory vault", err);
            }
        };
        fetchMemories();

        // Listen for BrainMemoryBroadcast events
        echo.channel('brains.memory')
            .listen('BrainMemoryBroadcast', (e: { memory: MemoryEntry }) => {
                setMemories(prev => [e.memory, ...prev]);
            });

        return () => {
            echo.leave('brains.status');
            echo.leave('brains.messages');
            echo.leave('brains.memory');
        };
    }, []);

    return (
        <>
            <Head title="FAIS Brains Visualizer" />

            <div className={`h-screen w-full overflow-hidden flex flex-col relative font-mono transition-colors duration-500 ${isLightMode ? 'bg-slate-50 text-slate-800' : 'bg-black text-cyan-500'}`}>

                {/* Aesthetic Dotted Grid Background */}
                <div className={`absolute inset-0 [background-size:32px_32px] opacity-15 ${isLightMode ? 'bg-[radial-gradient(#94a3b8_1px,transparent_1px)]' : 'bg-[radial-gradient(#0891b2_1px,transparent_1px)]'}`} />
                {/* Radial fade mask to make it look focused in the center */}
                <div className={`absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_90%)] pointer-events-none z-10 ${isLightMode ? 'bg-slate-50' : 'bg-black'}`} />

                {/* Header */}
                <header className={`absolute top-0 w-full p-6 flex justify-between items-center z-40 border-b backdrop-blur-sm transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-white/50' : 'border-cyan-900/50 bg-black/50'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full animate-pulse ${isLightMode ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]'}`} />
                        <h1 className={`text-2xl font-bold tracking-[0.3em] uppercase transition-colors duration-500 ${isLightMode ? 'text-slate-800' : 'text-cyan-500 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]'}`}>
                            AI-O
                        </h1>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className={`text-xs tracking-widest uppercase transition-colors duration-500 ${isLightMode ? 'text-slate-500' : 'text-cyan-700'}`}>
                            System Online • Monitoring
                        </div>
                        <button 
                            onClick={() => setIsLightMode(!isLightMode)}
                            className={`p-2 rounded-full border transition-all ${isLightMode ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100' : 'border-cyan-800 bg-cyan-950/30 text-cyan-400 hover:bg-cyan-900/50'}`}
                            title="Toggle Light Mode"
                        >
                            {isLightMode ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </header>

                {/* Main Visualizer Area */}
                <main className="flex-1 flex flex-col lg:flex-row overflow-hidden pt-[72px] pb-[40px] relative z-20">
                    {/* Brain Nodes Container */}
                    <div className="flex-1 flex items-center justify-center p-2 lg:p-8 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-2 md:gap-8 lg:gap-16 w-full max-w-4xl justify-items-center">
                            {(() => {
                                const anyActive = Object.values(brains).some(b => b.status === 'executing' || b.status === 'thinking');
                                return Object.entries(brains).map(([key, brain]) => (
                                    <BrainNode
                                        key={key}
                                        name={brain.name}
                                        status={brain.status}
                                        anyActive={anyActive}
                                        isLightMode={isLightMode}
                                    />
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Thought Stream Sidebar */}
                    <aside
                        className={`border-t lg:border-t-0 lg:border-l backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] h-1/2 lg:h-full w-full lg:w-[var(--sidebar-width)] min-w-full lg:min-w-[300px] max-w-full lg:max-w-[800px] overflow-hidden relative transition-colors duration-500 ${isLightMode ? 'border-slate-300 bg-white/80' : 'border-cyan-900/50 bg-black/40'}`}
                        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
                    >
                        {/* Drag Handle */}
                        <div
                            className={`hidden lg:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-50 group transition-colors ${isLightMode ? 'hover:bg-slate-300' : 'hover:bg-cyan-500/50'}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startWidth = sidebarWidth;

                                const onMouseMove = (moveEvent: MouseEvent) => {
                                    const deltaX = startX - moveEvent.clientX;
                                    setSidebarWidth(Math.max(300, Math.min(800, startWidth + deltaX)));
                                };

                                const onMouseUp = () => {
                                    document.removeEventListener('mousemove', onMouseMove);
                                    document.removeEventListener('mouseup', onMouseUp);
                                };

                                document.addEventListener('mousemove', onMouseMove);
                                document.addEventListener('mouseup', onMouseUp);
                            }}
                        >
                            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${isLightMode ? 'bg-slate-400' : 'bg-cyan-700'}`}></div>
                        </div>

                        <div className={`p-2 border-b flex justify-between items-center transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-100/50' : 'border-cyan-900/50 bg-cyan-950/20'}`}>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTab('thoughts')}
                                    className={`px-3 py-1 text-[11px] font-bold tracking-wider rounded uppercase transition-all ${
                                        activeTab === 'thoughts'
                                            ? (isLightMode ? 'bg-white text-slate-800 shadow-sm border border-slate-300' : 'bg-cyan-950 border border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]')
                                            : (isLightMode ? 'text-slate-400 hover:text-slate-600' : 'text-cyan-700 hover:text-cyan-400')
                                    }`}
                                >
                                    Thought Stream
                                </button>
                                <button
                                    onClick={() => setActiveTab('memory')}
                                    className={`px-3 py-1 text-[11px] font-bold tracking-wider rounded uppercase transition-all flex items-center gap-1.5 ${
                                        activeTab === 'memory'
                                            ? (isLightMode ? 'bg-white text-slate-800 shadow-sm border border-slate-300' : 'bg-purple-950 border border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]')
                                            : (isLightMode ? 'text-slate-400 hover:text-slate-600' : 'text-purple-700 hover:text-purple-400')
                                    }`}
                                >
                                    <span>Memory Vault</span>
                                    {memories.length > 0 && (
                                        <span className="px-1.5 py-0.2 text-[9px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                            {memories.length}
                                        </span>
                                    )}
                                </button>

                                {activeTab === 'memory' && memories.length > 0 && (
                                    <button
                                        onClick={clearMemories}
                                        className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all ml-1"
                                        title="Clear Memory Vault UI View"
                                    >
                                        Clear View
                                    </button>
                                )}
                            </div>
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        </div>
                        {/* Thought Stream Scroll Container */}
                        <div
                            className={`flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-transparent transition-colors duration-500 ${isLightMode ? 'scrollbar-thumb-slate-300' : 'scrollbar-thumb-cyan-900/50'} ${activeTab === 'thoughts' ? '' : 'hidden'}`}
                            onScroll={handleScroll}
                        >
                            {messages.length === 0 ? (
                                <div className={`text-xs text-center mt-10 tracking-widest italic ${isLightMode ? 'text-slate-400' : 'text-cyan-800/50'}`}>AWAITING THOUGHTS...</div>
                            ) : (
                                <>
                                    {visibleCount < messages.length && (
                                        <div className="text-[10px] text-cyan-600/50 text-center py-2 tracking-widest italic animate-pulse">
                                            SCROLL UP TO LOAD MORE...
                                        </div>
                                    )}
                                    {messages.slice(-visibleCount).map((msg) => {
                                        let cleanText = msg.text.replace('[DONE] ', '');
                                        let options: string[] = [];
                                        
                                        // Parse out [OPTIONS: A :: B :: C]
                                        const optionsMatch = cleanText.match(/\[OPTIONS:\s*(.+?)\]/i);
                                        if (optionsMatch) {
                                            options = optionsMatch[1].split('::').map(o => o.trim()).filter(Boolean);
                                            cleanText = cleanText.replace(/\[OPTIONS:\s*(.+?)\]/i, '').trim();
                                        }

                                        return (
                                            <div key={msg.id} className={`text-[11px] leading-relaxed break-words p-3 rounded border transition-colors duration-500 ${getBrainBgColor(msg.brain)}`}>
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className={`font-bold tracking-wider ${getBrainColor(msg.brain)}`}>[{msg.brain}]</span>
                                                    <span className={`text-[9px] ${isLightMode ? 'text-slate-400' : 'text-cyan-800'}`}>{msg.time}</span>
                                                </div>
                                                <div className={`font-sans tracking-wide flex items-start gap-2 ${isLightMode ? 'text-slate-700' : 'text-cyan-100'}`}>
                                                    <div className="mt-0.5 shrink-0">
                                                        {msg.text.startsWith('[DONE] ') ? (
                                                            <svg className="w-4 h-4 text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)] animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <span>&gt;</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 w-full overflow-hidden">
                                                        {msg.brain === 'USER' ? cleanText : <TypingMessage text={cleanText} />}
                                                        
                                                        {options.length > 0 && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {options.map((opt, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => dispatchTask(opt)}
                                                                        disabled={isSubmitting}
                                                                        className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                                                            isLightMode 
                                                                                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm'
                                                                                : 'bg-cyan-950/50 border border-cyan-700/50 text-cyan-300 hover:bg-cyan-900/80 hover:shadow-[0_0_10px_rgba(34,211,238,0.5)]'
                                                                        }`}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Memory Vault Scroll Container */}
                        <div
                            className={`flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-transparent transition-colors duration-500 ${isLightMode ? 'scrollbar-thumb-slate-300' : 'scrollbar-thumb-cyan-900/50'} ${activeTab === 'memory' ? '' : 'hidden'}`}
                        >
                            {memories.length === 0 ? (
                                <div className={`text-xs text-center mt-10 tracking-widest italic ${isLightMode ? 'text-slate-400' : 'text-purple-800/50'}`}>
                                    NO MEMORIES LOGGED YET...
                                </div>
                            ) : (
                                memories.map((mem) => (
                                    <div
                                        key={mem.id}
                                        className={`p-3 rounded-lg border transition-all duration-300 ${
                                            isLightMode
                                                ? 'bg-white border-purple-200 hover:border-purple-300 shadow-sm'
                                                : 'bg-purple-950/20 border-purple-900/50 hover:border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                                        }`}
                                    >
                                        <div
                                            className="flex justify-between items-center cursor-pointer select-none"
                                            onClick={() => setExpandedMemory(expandedMemory === mem.id ? null : mem.id)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                    {mem.id}
                                                </span>
                                                <span className={`text-xs font-semibold tracking-wide ${isLightMode ? 'text-slate-800' : 'text-purple-200'}`}>
                                                    {mem.title}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                mem.severity === 'CRITICAL'
                                                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                                                    : mem.severity === 'HIGH'
                                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                            }`}>
                                                {mem.severity}
                                            </span>
                                        </div>

                                        {expandedMemory === mem.id && (
                                            <div className="mt-3 pt-3 border-t border-purple-900/30 space-y-2 text-[11px] font-sans">
                                                {mem.what_happened && (
                                                    <div>
                                                        <span className="font-bold text-purple-400 uppercase tracking-wider block text-[10px]">What Happened:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-purple-200/80'}>{mem.what_happened}</p>
                                                    </div>
                                                )}
                                                {mem.root_cause && (
                                                    <div>
                                                        <span className="font-bold text-amber-400 uppercase tracking-wider block text-[10px]">Root Cause:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-amber-200/80'}>{mem.root_cause}</p>
                                                    </div>
                                                )}
                                                {mem.fix && (
                                                    <div>
                                                        <span className="font-bold text-green-400 uppercase tracking-wider block text-[10px]">Fix Applied:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-green-200/80'}>{mem.fix}</p>
                                                    </div>
                                                )}
                                                {mem.lesson && (
                                                    <div>
                                                        <span className="font-bold text-cyan-400 uppercase tracking-wider block text-[10px]">Lesson Learned:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-cyan-200/80'}>{mem.lesson}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Terminal Input */}
                        <div className={`p-4 border-t transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-50' : 'border-cyan-900/50 bg-black/60'}`}>
                            <form onSubmit={handleTaskSubmit} className="flex flex-col gap-2">
                                <div className={`text-[10px] uppercase tracking-widest flex justify-between ${isLightMode ? 'text-slate-500' : 'text-cyan-600'}`}>
                                    <span>Command Terminal</span>
                                    {isSubmitting && <span className="text-yellow-500 animate-pulse">TRANSMITTING...</span>}
                                </div>
                                <div className="relative">
                                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isLightMode ? 'text-slate-400' : 'text-cyan-500'}`}>&gt;</span>
                                    <input
                                        type="text"
                                        value={taskInput}
                                        onChange={(e) => setTaskInput(e.target.value)}
                                        placeholder="Enter task or instruction..."
                                        disabled={isSubmitting}
                                        className={`w-full border rounded-md py-2 pl-8 pr-4 text-xs focus:outline-none focus:ring-1 transition-all disabled:opacity-50 ${isLightMode ? 'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:ring-slate-500' : 'bg-cyan-950/30 border-cyan-800/50 text-cyan-300 placeholder:text-cyan-800/70 focus:border-cyan-400 focus:ring-cyan-400'}`}
                                    />
                                </div>
                            </form>
                        </div>
                    </aside>
                </main>

                {/* Footer overlay */}
                <footer className={`absolute bottom-0 w-full p-4 flex justify-between items-end z-40 text-[10px] tracking-widest transition-colors duration-500 ${isLightMode ? 'text-slate-500' : 'text-cyan-800'}`}>
                    <div>
                        DATA STREAM ACTIVE<br />
                        OBSIDIAN VAULT LINKED
                    </div>
                    <div className="text-right">
                        ORCHESTRATOR v1.0<br />
                        SECURE CONNECTION
                    </div>
                </footer>
            </div>
        </>
    );
}
