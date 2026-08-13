import React, { useEffect, useState, useRef } from 'react';
import { Head } from '@inertiajs/react';
import BrainNode from '@/Components/BrainNode';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import axios from 'axios';
import { buildBrainDispatchPayload } from '@/lib/cavemanPromptTransport';

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

const BACKGROUND_ACTIVITY_MESSAGES = new Set([
    'Reviewing the task approach...',
    'Running a workspace command...',
    'Preparing workspace changes...',
    'Using an integrated tool...',
    'Checking referenced information...',
]);

const parseMarkdownBold = (input: string, isLightMode = false) => {
    const parts = input.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            return <strong key={idx} className={`font-extrabold ${isLightMode ? 'text-cyan-800' : 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]'}`}>{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const TypingMessage = ({ text, onComplete, isLightMode = false }: { text: string, onComplete?: () => void, isLightMode?: boolean }) => {
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

    return <>{parseMarkdownBold(displayedText, isLightMode)}</>;
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
    const [sidebarWidth, setSidebarWidth] = useState(440);
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
        if (isLightMode) {
            switch (brainName) {
                case 'Architect': return 'text-purple-800';
                case 'Senior_Dev': return 'text-blue-800';
                case 'Junior_Dev': return 'text-green-800';
                case 'Security': return 'text-red-800';
                case 'USER': return 'text-amber-800 font-extrabold';
                case 'SYSTEM': return 'text-slate-800 font-bold';
                default: return 'text-cyan-800';
            }
        }
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
                case 'Architect': return 'bg-white/85 border-slate-200 border-l-4 border-l-purple-500';
                case 'Senior_Dev': return 'bg-white/85 border-slate-200 border-l-4 border-l-blue-500';
                case 'Junior_Dev': return 'bg-white/85 border-slate-200 border-l-4 border-l-emerald-500';
                case 'Security': return 'bg-white/85 border-slate-200 border-l-4 border-l-red-500';
                case 'USER': return 'bg-amber-50/90 border-amber-200 border-l-4 border-l-amber-500';
                case 'SYSTEM': return 'bg-slate-100/90 border-slate-200 border-l-4 border-l-slate-500';
                default: return 'bg-white/85 border-slate-200 border-l-4 border-l-cyan-500';
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

    interface AttachedImage {
        id: string;
        dataUrl: string;
        name: string;
    }

    const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processImageFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) {
            alert("Image size exceeds 5MB limit.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            if (result) {
                setAttachedImages(prev => [
                    ...prev,
                    { id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), dataUrl: result, name: file.name || 'Pasted Image' }
                ]);
            }
        };
        reader.readAsDataURL(file);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    processImageFile(file);
                }
            }
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => processImageFile(file));
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            Array.from(e.target.files).forEach(file => processImageFile(file));
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeAttachedImage = (id: string) => {
        setAttachedImages(prev => prev.filter(img => img.id !== id));
    };

    const dispatchTask = async (taskText: string) => {
        if ((!taskText.trim() && attachedImages.length === 0) || isSubmitting) return;
        setIsSubmitting(true);

        const imagesToUpload = attachedImages.map(img => img.dataUrl);
        const payload = buildBrainDispatchPayload(taskText, imagesToUpload);
        setAttachedImages([]);

        let userMsgText = payload.display_task;
        if (imagesToUpload.length > 0) {
            userMsgText += ' [IMAGES: ' + imagesToUpload.join(' :: ') + ']';
        }

        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            brain: 'USER',
            text: userMsgText,
            time: new Date().toLocaleTimeString([], { hour12: false })
        }].slice(-30));

        if (autoScroll) {
            setVisibleCount(prev => Math.min(prev + 1, 30));
        }

        try {
            await axios.post('/api/brain/dispatch', payload);
        } catch (error) {
            console.error("Failed to dispatch task", error);
            setTaskInput(payload.display_task);
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                brain: 'SYSTEM',
                text: 'ERROR: Failed to reach orchestrator.',
                time: new Date().toLocaleTimeString([], { hour12: false })
            }].slice(-30));
        } finally {
            setIsSubmitting(false);
        }
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
                }].slice(-30)); // Keep up to 30 in memory

                // If auto-scrolling is enabled, also bump the visible count so we don't hide new messages
                if (autoScroll) {
                    setVisibleCount(prev => Math.min(prev + 1, 30));
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

    const [queueCount, setQueueCount] = useState<number>(0);

    const handleAbortTask = async () => {
        try {
            await axios.post('/abort-task');
            setQueueCount(0);
            setAttachedImages([]);
        } catch (err) {
            console.error("Failed to abort task", err);
        }
    };

    const resolveApproval = async (approvalId: string, decision: 'accept' | 'decline') => {
        try {
            await axios.post(`/api/brain/approvals/${approvalId}`, { decision });
        } catch (err) {
            console.error('Failed to resolve approval', err);
        }
    };

    useEffect(() => {
        const checkQueue = async () => {
            try {
                const res = await axios.get('/task-queue');
                if (res.data && typeof res.data.count === 'number') {
                    setQueueCount(res.data.count);
                }
            } catch (err) { }
        };
        checkQueue();
        const interval = setInterval(checkQueue, 2000);
        return () => clearInterval(interval);
    }, []);

    const isTaskActive = Object.values(brains).some(b => b.status === 'executing' || b.status === 'thinking') || queueCount > 0;

    return (
        <>
            <Head title="Absolute Idiots Orchestra" />

            <div className={`h-screen w-full overflow-hidden flex flex-col relative font-mono transition-colors duration-500 ${isLightMode ? 'bg-[#e8eef5] text-slate-900' : 'bg-[#030608] text-cyan-400'}`}>

                {/* Aesthetic Dotted Grid Background */}
                <div className={`absolute inset-0 [background-size:32px_32px] ${isLightMode ? 'bg-[radial-gradient(#94a3b8_1px,transparent_1px)] opacity-20' : 'bg-[radial-gradient(#0e7490_1px,transparent_1px)] opacity-15'}`} />
                <div className={`absolute inset-0 pointer-events-none ${isLightMode ? 'bg-[radial-gradient(ellipse_at_22%_16%,rgba(14,165,233,0.08),transparent_35%),radial-gradient(ellipse_at_88%_88%,rgba(99,102,241,0.05),transparent_40%)]' : 'bg-[radial-gradient(ellipse_at_28%_40%,rgba(8,145,178,0.09),transparent_42%),radial-gradient(ellipse_at_82%_18%,rgba(59,130,246,0.07),transparent_30%)]'}`} />
                {/* Radial fade mask to make it look focused in the center */}
                <div className={`absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black_90%)] pointer-events-none z-10 ${isLightMode ? 'bg-[#e8eef5]/45' : 'bg-black'}`} />

                {/* Header */}
                <header className={`absolute top-0 w-full px-4 sm:px-6 py-4 flex justify-between items-center z-40 border-b backdrop-blur-xl transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-white/92 shadow-[0_8px_24px_rgba(15,23,42,0.08)]' : 'border-cyan-950/80 bg-[#030608]/80 shadow-[0_4px_24px_rgba(0,0,0,0.55)]'}`}>
                    <div className="flex items-center gap-3">
                        {/* Live Status Pulse */}
                        <div className="relative flex items-center justify-center w-3.5 h-3.5">
                            <div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${isLightMode ? 'bg-cyan-500' : 'bg-cyan-400'}`} />
                            <div className={`relative w-2.5 h-2.5 rounded-full ${isLightMode ? 'bg-cyan-600 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]'}`} />
                        </div>
                        <div className="flex flex-col">
                            <h1 className={`text-xl sm:text-2xl font-extrabold tracking-[0.25em] font-mono uppercase leading-tight transition-colors duration-500 ${isLightMode ? 'text-slate-900' : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]'}`}>
                                AIO
                            </h1>
                            <span className={`text-[10px] font-mono tracking-widest uppercase transition-colors duration-500 ${isLightMode ? 'text-slate-500' : 'text-cyan-600'}`}>
                                Absolute Idiots Orchestra
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-4">
                        {queueCount > 0 && (
                            <span className="text-xs font-mono px-2.5 py-1 rounded border border-amber-500/50 bg-amber-950/40 text-amber-400 tracking-widest uppercase animate-pulse">
                                Queue: {queueCount}
                            </span>
                        )}

                        <div className={`hidden sm:flex items-center gap-2 text-[11px] font-mono tracking-[0.15em] uppercase px-3 py-1 rounded-full border transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-100/80 text-slate-600' : 'border-cyan-900/50 bg-cyan-950/40 text-cyan-400/90'}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live Orchestration <span aria-hidden="true">&bull;</span> Autonomous
                        </div>
                        <button
                            onClick={() => setIsLightMode(!isLightMode)}
                            aria-label={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
                            className={`p-2 rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95 ${isLightMode ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]' : 'border-cyan-800/80 bg-cyan-950/50 text-cyan-300 hover:bg-cyan-900/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'}`}
                            title="Toggle Light Mode"
                        >
                            {isLightMode ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </header>

                {/* Main Visualizer Area */}
                <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden pt-[64px] lg:pt-[72px] pb-[32px] lg:pb-[40px] relative z-20">
                    {/* Brain Nodes Container */}
                    <section className={`flex-1 min-h-0 min-w-0 flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-hidden h-full relative ${isLightMode ? 'bg-slate-100/35' : ''}`} aria-label="Orchestration map">
                        <div className={`absolute left-5 top-4 sm:left-8 sm:top-6 z-20 ${isLightMode ? 'text-slate-500' : 'text-cyan-700'}`}>
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em]">Orchestration map</p>
                            <p className={`mt-1 text-[11px] tracking-wide ${isLightMode ? 'text-slate-500' : 'text-cyan-800'}`}>
                                {Object.keys(brains).length} specialist agents <span aria-hidden="true">·</span> {isTaskActive ? 'activity in progress' : 'standing by'}
                            </p>
                        </div>
                        <div className={`grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-10 lg:gap-x-12 lg:gap-y-12 w-full max-w-3xl justify-items-center items-center my-auto rounded-[2rem] ${isLightMode ? 'border border-slate-200/90 bg-white/72 shadow-[0_24px_64px_rgba(15,23,42,0.10)]' : ''}`}>
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
                    </section>

                    {/* Thought Stream Sidebar */}
                    <aside
                        className={`border-t lg:border-t-0 lg:border-l backdrop-blur-xl flex flex-col h-1/2 lg:h-full w-full lg:w-[var(--sidebar-width)] min-w-full lg:min-w-[340px] max-w-full lg:max-w-[800px] overflow-hidden relative transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-50/95 shadow-[-12px_0_36px_rgba(15,23,42,0.12)]' : 'border-cyan-900/50 bg-[#060b10]/80 shadow-[-10px_0_30px_rgba(0,0,0,0.45)]'}`}
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
                                    setSidebarWidth(Math.max(340, Math.min(800, startWidth + deltaX)));
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

                        <div className={`p-2 border-b flex justify-between items-center transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-100/85' : 'border-cyan-900/50 bg-cyan-950/20'}`}>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTab('thoughts')}
                                    className={`px-3 py-1 text-[11px] font-bold tracking-wider rounded uppercase transition-all ${activeTab === 'thoughts'
                                        ? (isLightMode ? 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-200' : 'bg-cyan-950 border border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]')
                                        : (isLightMode ? 'text-slate-500 hover:text-slate-800 hover:bg-white/70' : 'text-cyan-700 hover:text-cyan-400')
                                        }`}
                                >
                                    Thought Stream
                                </button>
                                <button
                                    onClick={() => setActiveTab('memory')}
                                    className={`px-3 py-1 text-[11px] font-bold tracking-wider rounded uppercase transition-all flex items-center gap-1.5 ${activeTab === 'memory'
                                        ? (isLightMode ? 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-200' : 'bg-purple-950 border border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]')
                                        : (isLightMode ? 'text-slate-500 hover:text-slate-800 hover:bg-white/70' : 'text-purple-700 hover:text-purple-400')
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
                            className={`flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 scrollbar-thin scrollbar-track-transparent transition-colors duration-500 ${isLightMode ? 'scrollbar-thumb-slate-300' : 'scrollbar-thumb-cyan-900/50'} ${activeTab === 'thoughts' ? '' : 'hidden'}`}
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
                                        let optionGroups: { question?: string, options: string[] }[] = [];
                                        const approvalMatch = cleanText.match(/\[APPROVAL:([a-z0-9-]+)\]/i);
                                        const approvalId = approvalMatch?.[1];
                                        if (approvalId) cleanText = cleanText.replace(/\s*\[APPROVAL:[a-z0-9-]+\]/i, '').trim();

                                        let imageList: string[] = [];

                                        // Parse out [IMAGES: url1 :: url2]
                                        const imagesMatch = cleanText.match(/\[IMAGES:\s*(.+?)\]/i);
                                        if (imagesMatch) {
                                            imageList = imagesMatch[1].split('::').map(s => s.trim()).filter(Boolean);
                                            cleanText = cleanText.replace(/\[IMAGES:\s*(.+?)\]/i, '').trim();
                                        }

                                        // Parse multiple decision groups: [QUESTION: ...][OPTIONS: A :: B]
                                        const groupedOptionsPattern = /\[QUESTION:\s*(.+?)\]\s*\[OPTIONS:\s*(.+?)\]/gi;
                                        let groupedMatch: RegExpExecArray | null;
                                        while ((groupedMatch = groupedOptionsPattern.exec(cleanText)) !== null) {
                                            const groupOptions = groupedMatch[2].split('::').map(o => o.trim()).filter(Boolean);
                                            if (groupOptions.length > 0) optionGroups.push({ question: groupedMatch[1].trim(), options: groupOptions });
                                        }
                                        cleanText = cleanText.replace(groupedOptionsPattern, '').trim();

                                        // Parse the legacy single group: [OPTIONS: A :: B :: C]
                                        const optionsMatch = cleanText.match(/\[OPTIONS:\s*(.+?)\]/i);
                                        if (optionsMatch) {
                                            const options = optionsMatch[1].split('::').map(o => o.trim()).filter(Boolean);
                                            if (options.length > 0) optionGroups.push({ options });
                                            cleanText = cleanText.replace(/\[OPTIONS:\s*(.+?)\]/i, '').trim();
                                        }

                                        const isBackgroundActivity = BACKGROUND_ACTIVITY_MESSAGES.has(cleanText)
                                            && !approvalId
                                            && optionGroups.length === 0
                                            && imageList.length === 0;

                                        if (isBackgroundActivity) {
                                            return (
                                                <div key={msg.id} className={`flex items-center gap-2 px-1.5 py-1 text-[10px] tracking-wide ${isLightMode ? 'text-slate-500' : 'text-cyan-700'}`}>
                                                    <span className={`h-1 w-1 rounded-full ${isLightMode ? 'bg-slate-400' : 'bg-cyan-700'}`} aria-hidden="true" />
                                                    <span>{cleanText}</span>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={msg.id} className={`text-xs leading-6 break-words p-3.5 rounded-lg border shadow-sm transition-colors duration-500 ${getBrainBgColor(msg.brain)}`}>
                                                <div className="flex justify-between items-baseline mb-1">
                                                    <span className={`font-bold tracking-wider ${getBrainColor(msg.brain)}`}>[{msg.brain}]</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] ${isLightMode ? 'text-slate-400' : 'text-cyan-800'}`}>{msg.time}</span>
                                                    </div>
                                                </div>
                                                <div className={`font-sans tracking-normal flex items-start gap-2 ${isLightMode ? 'text-slate-700' : 'text-cyan-50'}`}>
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
                                                        {msg.brain === 'USER' ? parseMarkdownBold(cleanText, isLightMode) : <TypingMessage text={cleanText} isLightMode={isLightMode} />}


                                                        {imageList.length > 0 && (
                                                            <div className="mt-2.5 flex flex-wrap gap-2">
                                                                {imageList.map((imgUrl, imgIdx) => (
                                                                    <a key={imgIdx} href={imgUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                                                                        <img
                                                                            src={imgUrl}
                                                                            alt="Attached Image"
                                                                            className="w-24 h-24 object-cover rounded border border-cyan-500/40 hover:border-cyan-300 transition-all shadow-[0_0_10px_rgba(34,211,238,0.2)] hover:scale-105"
                                                                        />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {optionGroups.map((group, groupIndex) => (
                                                            <div key={groupIndex} className="mt-3">
                                                                {group.question && <p className={`mb-1.5 text-[10px] font-bold ${isLightMode ? 'text-slate-600' : 'text-cyan-200'}`}>{group.question}</p>}
                                                                <div className="flex flex-wrap gap-2">
                                                                    {group.options.map((opt, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => dispatchTask(group.question ? `${group.question}: ${opt}` : opt)}
                                                                            disabled={isSubmitting}
                                                                            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isLightMode
                                                                                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm'
                                                                                : 'bg-cyan-950/50 border border-cyan-700/50 text-cyan-300 hover:bg-cyan-900/80 hover:shadow-[0_0_10px_rgba(34,211,238,0.5)]'
                                                                                }`}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {approvalId && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                <button onClick={() => resolveApproval(approvalId, 'accept')} disabled={isSubmitting} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded border disabled:opacity-50 ${isLightMode ? 'border-green-700 bg-green-100 text-green-900 hover:bg-green-200' : 'border-green-500/60 bg-green-950/40 text-green-300 hover:bg-green-900/70'}`}>Approve</button>
                                                                <button onClick={() => resolveApproval(approvalId, 'decline')} disabled={isSubmitting} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded border disabled:opacity-50 ${isLightMode ? 'border-red-700 bg-red-100 text-red-900 hover:bg-red-200' : 'border-red-500/60 bg-red-950/40 text-red-300 hover:bg-red-900/70'}`}>Deny</button>
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
                                        className={`p-3 rounded-lg border transition-all duration-300 ${isLightMode
                                            ? 'bg-white border-purple-200 hover:border-purple-300 shadow-sm'
                                            : 'bg-purple-950/20 border-purple-900/50 hover:border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                                            }`}
                                    >
                                        <div
                                            className="flex justify-between items-center cursor-pointer select-none"
                                            onClick={() => setExpandedMemory(expandedMemory === mem.id ? null : mem.id)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${isLightMode ? 'bg-purple-100 text-purple-900 border-purple-300' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'}`}>
                                                    {mem.id}
                                                </span>
                                                    <span className={`text-xs font-semibold tracking-wide ${isLightMode ? 'text-slate-800' : 'text-purple-200'}`}>
                                                    {mem.title}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${mem.severity === 'CRITICAL'
                                                ? (isLightMode ? 'bg-red-100 text-red-900 border border-red-400 animate-pulse' : 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse')
                                                : mem.severity === 'HIGH'
                                                    ? (isLightMode ? 'bg-amber-100 text-amber-900 border border-amber-400' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40')
                                                    : (isLightMode ? 'bg-cyan-100 text-cyan-900 border border-cyan-400' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40')
                                                }`}>
                                                {mem.severity}
                                            </span>
                                        </div>

                                        {expandedMemory === mem.id && (
                                            <div className={`mt-3 pt-3 border-t space-y-2 text-[11px] font-sans ${isLightMode ? 'border-purple-200' : 'border-purple-900/30'}`}>
                                                {mem.what_happened && (
                                                    <div>
                                                        <span className={`font-bold uppercase tracking-wider block text-[10px] ${isLightMode ? 'text-purple-800' : 'text-purple-400'}`}>What Happened:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-purple-200/80'}>{mem.what_happened}</p>
                                                    </div>
                                                )}
                                                {mem.root_cause && (
                                                    <div>
                                                        <span className={`font-bold uppercase tracking-wider block text-[10px] ${isLightMode ? 'text-amber-800' : 'text-amber-400'}`}>Root Cause:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-amber-200/80'}>{mem.root_cause}</p>
                                                    </div>
                                                )}
                                                {mem.fix && (
                                                    <div>
                                                        <span className={`font-bold uppercase tracking-wider block text-[10px] ${isLightMode ? 'text-green-800' : 'text-green-400'}`}>Fix Applied:</span>
                                                        <p className={isLightMode ? 'text-slate-600' : 'text-green-200/80'}>{mem.fix}</p>
                                                    </div>
                                                )}
                                                {mem.lesson && (
                                                    <div>
                                                        <span className={`font-bold uppercase tracking-wider block text-[10px] ${isLightMode ? 'text-cyan-800' : 'text-cyan-400'}`}>Lesson Learned:</span>
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
                        <div className={`p-4 border-t transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-100/90' : 'border-cyan-900/50 bg-black/60'}`}>
                            {/* Hidden File Input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileInputChange}
                                accept="image/*"
                                multiple
                                className="hidden"
                            />

                            {/* Thumbnail Preview Pills */}
                            {attachedImages.length > 0 && (
                                <div className={`flex flex-wrap gap-2 mb-2 p-2 rounded-lg border ${isLightMode ? 'border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]' : 'border-cyan-900/40 bg-cyan-950/30'}`}>
                                    {attachedImages.map((img) => (
                                        <div key={img.id} className={`relative group flex items-center gap-1.5 p-1 rounded border text-[10px] ${isLightMode ? 'border-cyan-300 bg-white text-cyan-900' : 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300'}`}>
                                            <img src={img.dataUrl} alt={img.name} className="w-8 h-8 object-cover rounded" />
                                            <span className="max-w-[100px] truncate">{img.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeAttachedImage(img.id)}
                                                className="w-4 h-4 rounded-full bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer"
                                                title="Remove Image"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <form onSubmit={handleTaskSubmit} className="flex flex-col gap-2">
                                <div className={`text-[10px] uppercase tracking-widest flex justify-between ${isLightMode ? 'text-slate-500' : 'text-cyan-600'}`}>
                                    <span>Command Terminal {attachedImages.length > 0 && `(${attachedImages.length} Image Attached)`}</span>
                                    {isSubmitting && <span className="text-yellow-500 animate-pulse">TRANSMITTING...</span>}
                                </div>
                                <div
                                    onPaste={handlePaste}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`flex items-center gap-2 p-1 rounded-md transition-all ${isDragging ? 'ring-2 ring-cyan-400 bg-cyan-950/40' : ''}`}
                                >
                                    {/* Paperclip Button */}
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isSubmitting}
                                        className={`p-2 rounded-md border text-xs shrink-0 transition-all cursor-pointer disabled:opacity-40 ${isLightMode
                                            ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
                                            : 'bg-cyan-950/40 border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/60 hover:text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                                            }`}
                                        title="Attach / Select Images (or paste from clipboard Ctrl+V)"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728l-7.07 7.07a6 6 0 01-8.486-8.486l7.07-7.07a4 4 0 015.657 5.657l-7.07 7.07a2 2 0 01-2.828-2.828l7.07-7.07" />
                                        </svg>
                                    </button>

                                    <div className="relative flex-1">
                                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isLightMode ? 'text-slate-400' : 'text-cyan-500'}`}>&gt;</span>
                                        <input
                                            type="text"
                                            value={taskInput}
                                            onChange={(e) => setTaskInput(e.target.value)}
                                            placeholder={attachedImages.length > 0 ? "Enter instructions for attached image(s)..." : "Enter task or paste/drag image..."}
                                            disabled={isSubmitting}
                                        className={`w-full border rounded-md py-2 pl-8 pr-4 text-xs focus:outline-none focus:ring-1 transition-all disabled:opacity-50 ${isLightMode ? 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] focus:border-cyan-600 focus:ring-cyan-500/30' : 'bg-cyan-950/30 border-cyan-800/50 text-cyan-300 placeholder:text-cyan-800/70 focus:border-cyan-400 focus:ring-cyan-400'}`}
                                        />
                                    </div>
                                    {isTaskActive || isSubmitting ? (
                                        <button
                                            type="button"
                                            onClick={handleAbortTask}
                                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md border font-mono text-xs tracking-wider uppercase transition-all shrink-0 cursor-pointer ${isLightMode ? 'border-red-700 bg-red-100 text-red-900 hover:bg-red-200' : 'border-red-500/60 bg-red-950/60 text-red-400 hover:bg-red-900/80 hover:text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.4)]'}`}
                                            title="Emergency Abort Current Task & Clear Queue"
                                        >
                                            <span className="w-2 h-2 rounded-sm bg-red-500 animate-ping" />
                                            <span>STOP</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={!taskInput.trim() && attachedImages.length === 0}
                                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md border text-xs font-mono tracking-wider uppercase shrink-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${isLightMode
                                                ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700 shadow-[0_3px_10px_rgba(15,23,42,0.16)]'
                                                : 'bg-cyan-950/60 border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/80 hover:shadow-[0_0_10px_rgba(34,211,238,0.4)]'
                                                }`}
                                        >
                                            <svg className="w-3.5 h-3.5 rotate-200 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h7" />
                                            </svg>
                                            <span>SEND</span>
                                        </button>
                                    )}
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
