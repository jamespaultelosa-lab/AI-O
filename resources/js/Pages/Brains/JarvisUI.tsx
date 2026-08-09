import React, { useEffect, useState, useRef } from 'react';
import { Head } from '@inertiajs/react';
import BrainNode from '@/Components/BrainNode';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import axios from 'axios';

// Setup global Pusher for Echo
window.Pusher = Pusher;

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

export default function JarvisUI({ brains: initialBrains }: JarvisUIProps) {
    const [brains, setBrains] = useState(initialBrains);
    const [messages, setMessages] = useState<{ id: number, brain: string, text: string, time: string }[]>([]);
    const [visibleCount, setVisibleCount] = useState(15);
    const [autoScroll, setAutoScroll] = useState(true);
    const [taskInput, setTaskInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(400);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
        switch (brainName) {
            case 'Architect': return 'bg-purple-950/20 border-purple-900/30';
            case 'Senior_Dev': return 'bg-blue-950/20 border-blue-900/30';
            case 'Junior_Dev': return 'bg-green-950/20 border-green-900/30';
            case 'Security': return 'bg-red-950/20 border-red-900/30';
            case 'USER': return 'bg-yellow-950/10 border-yellow-900/30';
            case 'SYSTEM': return 'bg-gray-800/40 border-gray-600/30';
            default: return 'bg-cyan-950/20 border-cyan-900/30';
        }
    };

    const handleTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!taskInput.trim() || isSubmitting) return;

        const taskText = taskInput;
        setTaskInput('');
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

        return () => {
            echo.leave('brains.status');
            echo.leave('brains.messages');
        };
    }, []);

    return (
        <>
            <Head title="FAIS Brains Visualizer" />

            <div className="h-screen w-full bg-black overflow-hidden flex flex-col relative font-mono text-cyan-500">

                {/* Aesthetic Dotted Grid Background */}
                <div className="absolute inset-0 bg-[radial-gradient(#0891b2_1px,transparent_1px)] [background-size:32px_32px] opacity-15" />
                {/* Radial fade mask to make it look focused in the center */}
                <div className="absolute inset-0 bg-black [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_90%)] pointer-events-none z-10" />

                {/* Header */}
                <header className="absolute top-0 w-full p-6 flex justify-between items-center z-40 border-b border-cyan-900/50 bg-black/50 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse" />
                        <h1 className="text-2xl font-bold tracking-[0.3em] uppercase text-cyan-500 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
                            F.A.I.S. Neural Core
                        </h1>
                    </div>
                    <div className="text-xs tracking-widest text-cyan-700 uppercase">
                        System Online • Monitoring
                    </div>
                </header>

                {/* Main Visualizer Area */}
                <main className="flex-1 flex overflow-hidden pt-[72px] pb-[40px] relative z-20">
                    {/* Brain Nodes Container */}
                    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 lg:gap-24 w-full max-w-4xl">
                            {(() => {
                                const anyExecuting = Object.values(brains).some(b => b.status === 'executing');
                                return Object.entries(brains).map(([key, brain]) => (
                                    <BrainNode
                                        key={key}
                                        name={brain.name}
                                        status={brain.status}
                                        anyExecuting={anyExecuting}
                                    />
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Thought Stream Sidebar */}
                    <aside
                        className="border-l border-cyan-900/50 bg-black/40 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] h-full overflow-hidden relative"
                        style={{ width: `${sidebarWidth}px`, minWidth: '300px', maxWidth: '800px' }}
                    >
                        {/* Drag Handle */}
                        <div
                            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-500/50 z-50 group"
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
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-cyan-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>

                        <div className="p-4 border-b border-cyan-900/50 flex justify-between items-center bg-cyan-950/20">
                            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-cyan-400">Thought Stream</h2>
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        </div>
                        <div
                            className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-cyan-900/50 scrollbar-track-transparent"
                            onScroll={handleScroll}
                        >
                            {messages.length === 0 ? (
                                <div className="text-xs text-cyan-800/50 text-center mt-10 tracking-widest italic">AWAITING THOUGHTS...</div>
                            ) : (
                                <>
                                    {visibleCount < messages.length && (
                                        <div className="text-[10px] text-cyan-600/50 text-center py-2 tracking-widest italic animate-pulse">
                                            SCROLL UP TO LOAD MORE...
                                        </div>
                                    )}
                                    {messages.slice(-visibleCount).map((msg) => (
                                        <div key={msg.id} className={`text-[11px] leading-relaxed break-words p-3 rounded border ${getBrainBgColor(msg.brain)}`}>
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className={`font-bold tracking-wider ${getBrainColor(msg.brain)}`}>[{msg.brain}]</span>
                                                <span className="text-cyan-800 text-[9px]">{msg.time}</span>
                                            </div>
                                            <div className="text-cyan-100 font-sans tracking-wide flex items-start gap-2">
                                                <div className="mt-0.5 shrink-0">
                                                    {msg.text.startsWith('[DONE] ') ? (
                                                        <svg className="w-4 h-4 text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)] animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : (
                                                        <span>&gt;</span>
                                                    )}
                                                </div>
                                                <div>
                                                    {msg.brain === 'USER' ? msg.text.replace('[DONE] ', '') : <TypingMessage text={msg.text.replace('[DONE] ', '')} />}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Terminal Input */}
                        <div className="p-4 border-t border-cyan-900/50 bg-black/60">
                            <form onSubmit={handleTaskSubmit} className="flex flex-col gap-2">
                                <div className="text-[10px] text-cyan-600 uppercase tracking-widest flex justify-between">
                                    <span>Command Terminal</span>
                                    {isSubmitting && <span className="text-yellow-500 animate-pulse">TRANSMITTING...</span>}
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-500 text-sm font-bold">&gt;</span>
                                    <input
                                        type="text"
                                        value={taskInput}
                                        onChange={(e) => setTaskInput(e.target.value)}
                                        placeholder="Enter task or instruction..."
                                        disabled={isSubmitting}
                                        className="w-full bg-cyan-950/30 border border-cyan-800/50 rounded-md py-2 pl-8 pr-4 text-xs text-cyan-300 placeholder:text-cyan-800/70 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all disabled:opacity-50"
                                    />
                                </div>
                            </form>
                        </div>
                    </aside>
                </main>

                {/* Footer overlay */}
                <footer className="absolute bottom-0 w-full p-4 flex justify-between items-end z-40 text-[10px] tracking-widest text-cyan-800">
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
