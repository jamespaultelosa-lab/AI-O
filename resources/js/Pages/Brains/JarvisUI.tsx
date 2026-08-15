import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
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

type TaskStatus = 'queued' | 'assigned' | 'running' | 'approval_required' | 'completed' | 'failed' | 'cancelled' | string;

interface TaskObservation {
    id: string;
    displaySummary: string;
    status: TaskStatus;
    safePhase: string | null;
    terminalReason: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string | null;
    elapsedSeconds: number | null;
}

interface ApprovalObservation {
    id: string;
    summary: string;
    status: string;
    requestingBrain: string;
}

interface Conversation {
    id: string;
    title: string;
    is_history: boolean;
    messages_count?: number;
    created_at?: string;
    updated_at?: string;
}

const ACTIVE_TASK_STATUSES = new Set(['queued', 'assigned', 'running', 'approval_required']);
const RETRY_ELIGIBLE_STATUSES = new Set(['failed', 'cancelled']);

const toTaskObservation = (value: unknown): TaskObservation | null => {
    if (!value || typeof value !== 'object') return null;

    const task = value as Record<string, unknown>;
    const id = typeof task.id === 'string' ? task.id : null;
    const displaySummary = typeof task.display_summary === 'string'
        ? task.display_summary
        : typeof task.safe_summary === 'string'
            ? task.safe_summary
            : null;

    if (!id || !displaySummary) return null;

    return {
        id,
        displaySummary,
        status: typeof task.status === 'string' ? task.status : 'queued',
        safePhase: typeof task.safe_phase === 'string' ? task.safe_phase : null,
        terminalReason: typeof task.terminal_reason === 'string' ? task.terminal_reason : null,
        startedAt: typeof task.started_at === 'string' ? task.started_at : null,
        completedAt: typeof task.completed_at === 'string' ? task.completed_at : null,
        createdAt: typeof task.created_at === 'string' ? task.created_at : null,
        elapsedSeconds: typeof task.elapsed_seconds === 'number' ? task.elapsed_seconds : null,
    };
};

const extractTaskObservations = (payload: unknown): TaskObservation[] => {
    const candidate = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object'
            ? (payload as { tasks?: unknown; data?: unknown }).tasks ?? (payload as { data?: unknown }).data
            : [];

    return Array.isArray(candidate)
        ? candidate.map(toTaskObservation).filter((task): task is TaskObservation => task !== null)
        : [];
};

const extractApprovals = (payload: unknown): ApprovalObservation[] => {
    const data = payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : [];
    return data.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const approval = value as Record<string, unknown>;
        if (typeof approval.id !== 'string' || typeof approval.summary !== 'string' || typeof approval.status !== 'string') return [];
        return [{ id: approval.id, summary: approval.summary, status: approval.status, requestingBrain: typeof approval.requesting_brain === 'string' ? approval.requesting_brain : 'SYSTEM' }];
    });
};

const formatElapsedTime = (task: TaskObservation, now: number) => {
    const seconds = task.elapsedSeconds ?? (() => {
        const start = Date.parse(task.startedAt ?? task.createdAt ?? '');
        const end = Date.parse(task.completedAt ?? '');
        if (Number.isNaN(start)) return null;
        return Math.max(0, Math.floor(((Number.isNaN(end) ? now : end) - start) / 1000));
    })();

    if (seconds === null) return 'Awaiting start';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return hours > 0
        ? `${hours}h ${minutes}m`
        : minutes > 0
            ? `${minutes}m ${remainingSeconds}s`
            : `${remainingSeconds}s`;
};

const BACKGROUND_ACTIVITY_MESSAGES = new Set([
    'Reviewing the task approach...',
    'Running a workspace command...',
    'Preparing workspace changes...',
    'Using an integrated tool...',
    'Checking referenced information...',
    'Still working on the current task (over one minute). You can safely choose Stop to cancel it.',
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

interface DiffBlock {
    filePath?: string;
    additions: number;
    deletions: number;
    content: string;
}

const extractDiffBlocks = (text: string): { textWithoutDiffs: string, diffBlocks: DiffBlock[] } => {
    const diffBlocks: DiffBlock[] = [];
    
    // Parse [DIFF: filepath\n```diff\n...\n```] or [DIFF: filepath]```diff\n...\n```
    const explicitDiffPattern = /\[DIFF:\s*([^\n\]]+)\]\s*```(?:diff)?\s*([\s\S]*?)```/gi;
    let cleanText = text.replace(explicitDiffPattern, (_, path, content) => {
        const lines = content.split('\n');
        let additions = 0;
        let deletions = 0;
        lines.forEach((l: string) => {
            if (l.startsWith('+') && !l.startsWith('+++')) additions++;
            if (l.startsWith('-') && !l.startsWith('---')) deletions++;
        });
        diffBlocks.push({ filePath: path.trim(), additions, deletions, content: content.trim() });
        return '';
    });

    // Parse standalone ```diff\n...\n``` blocks
    const fencedDiffPattern = /```diff\s*([\s\S]*?)```/gi;
    cleanText = cleanText.replace(fencedDiffPattern, (_, content) => {
        const lines = content.split('\n');
        let additions = 0;
        let deletions = 0;
        let detectedPath = '';
        lines.forEach((l: string) => {
            if (l.startsWith('+++ b/') || l.startsWith('+++ ')) detectedPath = l.replace(/^\+\+\+\s+(?:b\/)?/, '').trim();
            if (l.startsWith('+') && !l.startsWith('+++')) additions++;
            if (l.startsWith('-') && !l.startsWith('---')) deletions++;
        });
        diffBlocks.push({ filePath: detectedPath || 'File Changes', additions, deletions, content: content.trim() });
        return '';
    });

    return { textWithoutDiffs: cleanText.trim(), diffBlocks };
};

const DiffCard = ({ diff, isLightMode = false }: { diff: DiffBlock, isLightMode?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [copied, setCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(diff.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`mt-2 rounded-xl border overflow-hidden transition-all ${
            isLightMode 
                ? 'bg-slate-50 border-slate-200 shadow-sm' 
                : 'bg-black/40 border-cyan-900/60 shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
        }`}>
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer select-none border-b text-[11px] font-mono ${
                    isLightMode 
                        ? 'bg-slate-100/80 border-slate-200 text-slate-700 hover:bg-slate-200/50' 
                        : 'bg-cyan-950/40 border-cyan-900/40 text-cyan-200 hover:bg-cyan-900/30'
                }`}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="font-bold truncate">{diff.filePath || 'File Changes'}</span>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                        {diff.additions > 0 && <span className="text-emerald-400">+{diff.additions}</span>}
                        {diff.deletions > 0 && <span className="text-rose-400">-{diff.deletions}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        type="button" 
                        onClick={handleCopy}
                        className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold transition-all ${
                            isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-cyan-800/50 text-cyan-300'
                        }`}
                        title="Copy diff"
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            {isExpanded && (
                <div className="max-h-72 overflow-y-auto p-2.5 font-mono text-[10.5px] leading-5 space-y-0.5 scrollbar-thin scrollbar-thumb-cyan-900/50">
                    {diff.content.split('\n').map((line, lineIdx) => {
                        const isAddition = line.startsWith('+') && !line.startsWith('+++');
                        const isDeletion = line.startsWith('-') && !line.startsWith('---');
                        const isHeader = line.startsWith('@@') || line.startsWith('diff --git');

                        let lineClass = isLightMode ? 'text-slate-600' : 'text-cyan-100/70';
                        if (isAddition) {
                            lineClass = isLightMode ? 'bg-emerald-100/80 text-emerald-900 font-semibold px-1 rounded-sm' : 'bg-emerald-950/40 text-emerald-300 font-semibold px-1 rounded-sm';
                        } else if (isDeletion) {
                            lineClass = isLightMode ? 'bg-rose-100/80 text-rose-900 font-semibold px-1 rounded-sm' : 'bg-rose-950/40 text-rose-300 font-semibold px-1 rounded-sm';
                        } else if (isHeader) {
                            lineClass = isLightMode ? 'text-indigo-600 font-bold bg-indigo-50/50 px-1' : 'text-indigo-300 font-bold bg-indigo-950/30 px-1';
                        }

                        return (
                            <div key={lineIdx} className={`whitespace-pre overflow-x-auto ${lineClass}`}>
                                {line || ' '}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const QUICK_ACTIONS = [
    { label: 'Pre-Push & Commit', icon: '🚀', prompt: 'Run pre-push verification audit and commit changes', description: 'Run CI pre-flight and prepare commit' },
    { label: 'Run Test Suite', icon: '🧪', prompt: 'Run all PHPUnit and Node test suites and report results', description: 'Execute full testing suite' },
    { label: 'Evolve Skills', icon: '🧬', prompt: '/evolve-skills', description: 'Trigger autonomous skill evolution' },
    { label: 'Sync History', icon: '🔄', prompt: 'Sync Thought Stream history with git repository', description: 'Sync chat history across devices' },
    { label: 'Security Audit', icon: '🛡️', prompt: 'Perform security and permissions audit on active codebase', description: 'Run zero-trust security scan' },
    { label: 'Health Check', icon: '🩺', prompt: 'Check system processes, queue status, and orchestrator health', description: 'Check system health and status' },
];

export default function JarvisUI({ brains: initialBrains }: JarvisUIProps) {

    const [brains, setBrains] = useState(initialBrains);
    const [messages, setMessages] = useState<{ id: number, brain: string, text: string, time: string }[]>([]);

    // Conversations State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [isConversationDropdownOpen, setIsConversationDropdownOpen] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const conversationDisclosureRef = useRef<HTMLButtonElement>(null);
    const conversationControlRef = useRef<HTMLDivElement>(null);
    const conversationOptionRefs = useRef(new Map<string, HTMLButtonElement>());

    const [activeTab, setActiveTab] = useState<'thoughts' | 'memory'>('thoughts');
    const [memories, setMemories] = useState<MemoryEntry[]>([]);
    const [expandedMemory, setExpandedMemory] = useState<string | null>(null);
    const [tasks, setTasks] = useState<TaskObservation[]>([]);
    const [approvals, setApprovals] = useState<ApprovalObservation[]>([]);
    const [resolvingApprovalIds, setResolvingApprovalIds] = useState<Set<string>>(() => new Set());
    const [taskPollFailed, setTaskPollFailed] = useState(false);
    const [taskClock, setTaskClock] = useState(() => Date.now());

    const clearMemories = () => {
        setMemories([]);
    };
    const [visibleCount, setVisibleCount] = useState(15);
    const [autoScroll, setAutoScroll] = useState(true);
    const autoScrollRef = useRef(true);
    const thoughtStreamContainerRef = useRef<HTMLDivElement>(null);
    const scrollPosRef = useRef<{ prevHeight: number; prevScrollTop: number } | null>(null);
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
        autoScrollRef.current = autoScroll;
    }, [autoScroll]);

    // Engine Switcher State
    const [engine, setEngine] = useState<'codex' | 'antigravity'>('codex');
    const [isSwitchingEngine, setIsSwitchingEngine] = useState(false);

    useEffect(() => {
        axios.get('/api/brain/engine')
            .then(res => {
                if (res.data?.engine === 'antigravity' || res.data?.engine === 'codex') {
                    setEngine(res.data.engine);
                }
            })
            .catch(() => {});
    }, []);

    const toggleEngine = async () => {
        const next = engine === 'codex' ? 'antigravity' : 'codex';
        setEngine(next);
        setIsSwitchingEngine(true);
        try {
            await axios.post('/api/brain/engine', { engine: next });
        } catch {
        } finally {
            setIsSwitchingEngine(false);
        }
    };

    // Voice Synthesis (TTS) State & Natural Human Voice Engine
    const [ttsEnabled, setTtsEnabled] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('fais_tts_enabled') === 'true';
        }
        return false;
    });
    const ttsEnabledRef = useRef(ttsEnabled);
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

    useEffect(() => {
        ttsEnabledRef.current = ttsEnabled;
        if (typeof window !== 'undefined') {
            localStorage.setItem('fais_tts_enabled', ttsEnabled ? 'true' : 'false');
        }
    }, [ttsEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

        const updateVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                setAvailableVoices(voices);
            }
        };

        updateVoices();
        window.speechSynthesis.onvoiceschanged = updateVoices;

        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, []);

    const sanitizeTextForSpeech = (text: string): string => {
        return text
            .replace(/```[\s\S]*?```/g, ' [code block omitted] ')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[DIFF:[\s\S]*?\]/gi, '')
            .replace(/\[IMAGES:[\s\S]*?\]/gi, '')
            .replace(/\[QUESTION:[\s\S]*?\]/gi, '')
            .replace(/\[OPTIONS:[\s\S]*?\]/gi, '')
            .replace(/\[APPROVAL:[\s\S]*?\]/gi, '')
            .replace(/\[AUTONOMY\]/gi, '')
            .replace(/\[COLLABORATION\]/gi, '')
            .replace(/\[DONE\]/gi, 'Finished. ')
            .replace(/https?:\/\/\S+/gi, 'link')
            .replace(/\b(?:e\.g\.|eg)\b/gi, 'for example')
            .replace(/\b(?:i\.e\.|ie)\b/gi, 'that is')
            .replace(/\bTS\b/g, 'TypeScript')
            .replace(/\bJS\b/g, 'JavaScript')
            .replace(/\bPRs?\b/gi, 'pull request')
            .replace(/\bUI\b/g, 'U I')
            .replace(/\bUX\b/g, 'U X')
            .replace(/\bCLI\b/g, 'command line')
            .replace(/\bSRS\b/g, 'S R S')
            .replace(/\bIPC\b/g, 'I P C')
            .replace(/[*#_~>|]/g, ' ')
            .replace(/[\\/][a-zA-Z0-9_\-.]+/g, (match) => ' ' + match.replace(/^[\\/]/, ''))
            .replace(/\s+/g, ' ')
            .trim();
    };

    const getHumanVoiceForBrain = (brainName: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
        if (!voices || voices.length === 0) return null;

        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        const pool = englishVoices.length > 0 ? englishVoices : voices;

        // Helper to find voice matching priority keywords
        const findMatching = (keywords: string[]) => {
            for (const kw of keywords) {
                const found = pool.find(v => v.name.toLowerCase().includes(kw.toLowerCase()));
                if (found) return found;
            }
            return null;
        };

        switch (brainName) {
            case 'Architect':
                // Mature, articulate British / Mid-Atlantic male voice
                return findMatching([
                    'Ryan Online (Natural)',
                    'Oliver Online (Natural)',
                    'George',
                    'Google UK English Male',
                    'en-GB',
                    'Daniel',
                    'Arthur'
                ]) || pool.find(v => v.name.toLowerCase().includes('male')) || pool[0];

            case 'Security':
                // Steady, analytical, calm male voice
                return findMatching([
                    'Christopher Online (Natural)',
                    'Steffan Online (Natural)',
                    'David Desktop',
                    'David',
                    'Google US English',
                    'Guy Online (Natural)'
                ]) || pool.find(v => v.name.toLowerCase().includes('male')) || pool[0];

            case 'Junior_Dev':
                // Crisp, upbeat, friendly female/youthful voice
                return findMatching([
                    'Jenny Online (Natural)',
                    'Sonia Online (Natural)',
                    'Libby Online (Natural)',
                    'Google US English Female',
                    'Google UK English Female',
                    'Samantha',
                    'Victoria',
                    'Zira Desktop',
                    'Zira'
                ]) || pool.find(v => v.name.toLowerCase().includes('female')) || pool[0];

            case 'Senior_Dev':
            default:
                // Warm, confident, natural developer male voice
                return findMatching([
                    'Guy Online (Natural)',
                    'Eric Online (Natural)',
                    'Google US English',
                    'Alex',
                    'Mark',
                    'David'
                ]) || pool.find(v => v.name.toLowerCase().includes('male')) || pool[0];
        }
    };

    const speakMessage = (brainName: string, text: string) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const clean = sanitizeTextForSpeech(text);
        if (!clean) return;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
        const chosenVoice = getHumanVoiceForBrain(brainName, voices);

        if (chosenVoice) {
            utterance.voice = chosenVoice;
            utterance.lang = chosenVoice.lang || 'en-US';
        }

        // Natural human baseline tuning (prevent robotic formant pitch-shifting)
        switch (brainName) {
            case 'Architect':
                utterance.pitch = 0.96;
                utterance.rate = 0.98;
                break;
            case 'Security':
                utterance.pitch = 0.93;
                utterance.rate = 0.97;
                break;
            case 'Junior_Dev':
                utterance.pitch = 1.04;
                utterance.rate = 1.02;
                break;
            case 'Senior_Dev':
            default:
                utterance.pitch = 1.00;
                utterance.rate = 1.00;
                break;
        }

        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    };





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

    const submitTaskInput = async () => {
        if (isSubmitting || (!taskInput.trim() && attachedImages.length === 0)) return;

        const text = taskInput;
        setTaskInput('');
        await dispatchTask(text);
    };

    const handleTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await submitTaskInput();
    };

    const handleTaskInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;

        e.preventDefault();
        void submitTaskInput();
    };

    const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
        if (thoughtStreamContainerRef.current) {
            thoughtStreamContainerRef.current.scrollTo({
                top: thoughtStreamContainerRef.current.scrollHeight,
                behavior
            });
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior });
        }
    };

    useEffect(() => {
        if (autoScroll) {
            scrollToBottom("smooth");
        }
    }, [messages]);

    useLayoutEffect(() => {
        if (scrollPosRef.current && thoughtStreamContainerRef.current) {
            const delta = thoughtStreamContainerRef.current.scrollHeight - scrollPosRef.current.prevHeight;
            if (delta > 0) {
                thoughtStreamContainerRef.current.scrollTop = scrollPosRef.current.prevScrollTop + delta;
            }
            scrollPosRef.current = null;
        }
    }, [visibleCount]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

        // If user is near the bottom (within 60px), re-enable auto-scroll.
        // If user scrolled up, disable auto-scroll so the view stays steady.
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 60;
        setAutoScroll(isNearBottom);

        // If near top, load older messages and preserve scroll position
        if (scrollTop < 60 && visibleCount < messages.length) {
            scrollPosRef.current = {
                prevHeight: scrollHeight,
                prevScrollTop: scrollTop,
            };
            setVisibleCount(prev => Math.min(prev + 20, messages.length));
        }
    };

    const switchConversation = async (conversation: Conversation) => {
        setIsConversationDropdownOpen(false);
        try {
            const res = await axios.get(`/api/brain/conversations/${conversation.id}/messages`);
            const history = res.data.map((msg: any) => ({
                id: msg.id,
                brain: msg.brain,
                text: msg.message,
                time: new Date(msg.created_at).toLocaleTimeString([], { hour12: false })
            }));
            setMessages(history);
            setActiveConversation(conversation);

            // Jump straight to bottom without animation to show latest
            setTimeout(() => {
                scrollToBottom("auto");
            }, 100);
        } catch (err) {
            console.error("Failed to load conversation messages", err);
        }
    };

    const createConversation = async () => {
        setIsCreatingConversation(true);
        try {
            const res = await axios.post('/api/brain/conversations', { title: 'New chat' });
            const conversation = res.data as Conversation;
            setConversations(prev => [conversation, ...prev]);
            await switchConversation(conversation);
        } catch (err) {
            console.error("Failed to create conversation", err);
        } finally {
            setIsCreatingConversation(false);
        }
    };

    useEffect(() => {
        // Fetch conversations on load
        const fetchConversations = async () => {
            try {
                const res = await axios.get<Conversation[]>('/api/brain/conversations');
                setConversations(res.data);

                // Select first conversation (usually History or latest chat)
                if (res.data.length > 0) {
                    await switchConversation(res.data[0]);
                }
            } catch (err) {
                console.error("Failed to load conversations list", err);
            }
        };
        fetchConversations();

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

                if (ttsEnabledRef.current && e.brainName && e.brainName !== 'USER' && e.brainName !== 'SYSTEM') {
                    speakMessage(e.brainName, e.message);
                }

                // If auto-scrolling is enabled, also bump the visible count so we don't hide new messages
                if (autoScrollRef.current) {
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


    useEffect(() => {
        if (!isConversationDropdownOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!conversationControlRef.current?.contains(event.target as Node)) {
                setIsConversationDropdownOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsConversationDropdownOpen(false);
                conversationDisclosureRef.current?.focus();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        const focusTarget = activeConversation
            ? conversationOptionRefs.current.get(activeConversation.id)
            : conversationOptionRefs.current.values().next().value as HTMLButtonElement | undefined;
        focusTarget?.focus();

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isConversationDropdownOpen, activeConversation]);

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
        const previous = approvals.find(approval => approval.id === approvalId)?.status ?? 'pending';
        setResolvingApprovalIds(current => new Set(current).add(approvalId));
        setApprovals(current => current.map(approval => approval.id === approvalId ? { ...approval, status: decision === 'accept' ? 'accepted' : 'declined' } : approval));
        try {
            await axios.post(`/api/brain/approvals/${approvalId}`, { decision });
        } catch (err) {
            console.error('Failed to resolve approval', err);
            setApprovals(current => current.map(approval => approval.id === approvalId ? { ...approval, status: previous } : approval));
        } finally {
            setResolvingApprovalIds(current => {
                const next = new Set(current);
                next.delete(approvalId);
                return next;
            });
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

    useEffect(() => {
        let cancelled = false;
        let requestInFlight = false;

        const fetchTasks = async () => {
            if (requestInFlight) return;
            requestInFlight = true;
            try {
                const [response, approvalResponse] = await Promise.all([
                    axios.get('/api/brain/tasks'),
                    axios.get('/api/brain/approvals'),
                ]);
                if (!cancelled) {
                    setTasks(extractTaskObservations(response.data));
                    setApprovals(extractApprovals(approvalResponse.data));
                    setTaskPollFailed(false);
                }
            } catch (err) {
                if (!cancelled) setTaskPollFailed(true);
            } finally {
                requestInFlight = false;
            }
        };

        fetchTasks();
        const interval = setInterval(fetchTasks, 3000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => setTaskClock(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const isTaskActive = Object.values(brains).some(b => b.status === 'executing' || b.status === 'thinking') || queueCount > 0;
    const activeTask = tasks.find(task => ACTIVE_TASK_STATUSES.has(task.status.toLowerCase()));
    const latestTask = activeTask ?? tasks[0];
    const pendingApprovals = approvals.filter(approval => approval.status === 'pending');

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
                    <div className="flex items-center gap-2.5 sm:gap-3">
                        {queueCount > 0 && (
                            <span className="text-xs font-mono px-2.5 py-1 rounded border border-amber-500/50 bg-amber-950/40 text-amber-400 tracking-widest uppercase animate-pulse">
                                Queue: {queueCount}
                            </span>
                        )}

                        {/* Engine Switcher Toggle */}
                        <button
                            onClick={toggleEngine}
                            disabled={isSwitchingEngine}
                            title={engine === 'antigravity' ? 'Active Engine: Antigravity IDE Agent. Click to switch to Codex.' : 'Active Engine: Codex Brain Pool. Click to switch to Antigravity.'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer disabled:opacity-50 active:scale-95 ${
                                engine === 'antigravity'
                                    ? (isLightMode ? 'border-purple-300 bg-purple-100 text-purple-900 shadow-sm' : 'border-purple-500/60 bg-purple-950/50 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]')
                                    : (isLightMode ? 'border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm' : 'border-cyan-700/60 bg-cyan-950/50 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]')
                            }`}
                        >
                            <span>{engine === 'antigravity' ? '✨ Antigravity' : '⚡ Codex'}</span>
                        </button>

                        {/* TTS Voice Toggle */}
                        <button
                            onClick={() => setTtsEnabled(!ttsEnabled)}
                            title={ttsEnabled ? 'Voice Synthesis Active (Click to mute)' : 'Voice Synthesis Muted (Click to enable)'}
                            className={`p-2 rounded-lg border transition-all duration-200 hover:scale-105 active:scale-95 ${
                                ttsEnabled
                                    ? (isLightMode ? 'border-emerald-300 bg-emerald-100 text-emerald-900 shadow-sm' : 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.3)]')
                                    : (isLightMode ? 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600' : 'border-cyan-950/80 bg-cyan-950/20 text-cyan-700 hover:text-cyan-400')
                            }`}
                        >
                            {ttsEnabled ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-emerald-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-4.5l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
                                </svg>
                            )}
                        </button>

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
                                {Object.keys(brains).length} specialist agents <span aria-hidden="true">Ã‚Â·</span> {isTaskActive ? 'activity in progress' : 'standing by'}
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

                        <div className={`border-b p-3 transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-slate-100/85' : 'border-cyan-900/50 bg-cyan-950/20'}`}>
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className={`flex p-1 rounded-lg items-center ${isLightMode ? 'bg-slate-200/50' : 'bg-black/40 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] border border-cyan-900/30'}`} aria-label="Panel selection">
                                        <button type="button" onClick={() => setActiveTab('thoughts')} aria-pressed={activeTab === 'thoughts'} className={`flex items-center min-h-8 rounded-md px-3.5 py-1 text-[10px] font-bold tracking-wider uppercase transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98] ${activeTab === 'thoughts' ? (isLightMode ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'bg-cyan-900/40 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-cyan-700/50') : (isLightMode ? 'text-slate-500 hover:text-slate-800 hover:bg-white/50 border border-transparent' : 'text-cyan-700 hover:text-cyan-300 hover:bg-white/5 border border-transparent')}`}>
                                            Thought Stream
                                        </button>
                                        <button type="button" onClick={() => setActiveTab('memory')} aria-pressed={activeTab === 'memory'} className={`flex items-center min-h-8 gap-1.5 rounded-md px-3.5 py-1 text-[10px] font-bold tracking-wider uppercase transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 active:scale-[0.98] ${activeTab === 'memory' ? (isLightMode ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'bg-purple-900/40 text-purple-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-purple-700/50') : (isLightMode ? 'text-slate-500 hover:text-slate-800 hover:bg-white/50 border border-transparent' : 'text-purple-700 hover:text-purple-300 hover:bg-white/5 border border-transparent')}`}>
                                            <span>Memory Vault</span>
                                            {memories.length > 0 && <span className={`flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] ${activeTab === 'memory' ? (isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-purple-950 border border-purple-500/30 text-purple-200') : (isLightMode ? 'bg-slate-200 text-slate-500' : 'bg-purple-900/30 text-purple-400')}`}>{memories.length}</span>}
                                        </button>
                                    </div>
                                    {activeTab === 'memory' && memories.length > 0 && (
                                        <button type="button" onClick={clearMemories} aria-label="Clear memory vault view" className={`min-h-8 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400`}>Clear View</button>
                                    )}
                                </div>

                                <div className="flex min-w-0 items-center gap-2 sm:gap-3" ref={conversationControlRef}>
                                    <div className="relative min-w-0 flex-1">
                                        <button ref={conversationDisclosureRef} type="button" onClick={() => setIsConversationDropdownOpen((open) => !open)} aria-expanded={isConversationDropdownOpen} aria-controls="conversation-list" aria-label={`Current chat: ${activeConversation?.title ?? 'Loading chat'}`} title={activeConversation?.title ?? 'Loading chat'} className={`flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${isLightMode ? 'hover:bg-slate-200/50' : 'hover:bg-white/5'}`}>
                                            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] ${isLightMode ? 'text-slate-400' : 'text-cyan-700'}`}>Current chat</span>
                                            <span className={`min-w-0 flex-1 truncate text-xs font-bold tracking-wide ${isLightMode ? 'text-slate-700' : 'text-cyan-100'}`}>{activeConversation?.title ?? 'Loading chat'}</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${isLightMode ? 'text-slate-400' : 'text-cyan-600'}`}><path d="m6 9 6 6 6-6" /></svg>
                                        </button>
                                        {isConversationDropdownOpen && (
                                            <div id="conversation-list" className={`absolute right-0 top-full z-50 mt-2 w-full min-w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-2xl backdrop-blur-xl ${isLightMode ? 'bg-white/90 border-slate-200' : 'bg-black/80 border-cyan-900/50 shadow-[0_12px_40px_rgba(0,0,0,0.8)]'}`}>
                                                <div className="max-h-56 overflow-y-auto scrollbar-thin scrollbar-track-transparent">
                                                    {conversations.length === 0 ? (
                                                        <div className="p-4 text-center text-xs italic opacity-50">No chats found</div>
                                                    ) : conversations.map((conv) => (
                                                        <button key={conv.id} ref={(element) => { if (element) conversationOptionRefs.current.set(conv.id, element); else conversationOptionRefs.current.delete(conv.id); }} type="button" onClick={() => void switchConversation(conv)} aria-current={activeConversation?.id === conv.id ? 'true' : undefined} title={conv.title} className={`flex min-h-12 w-full items-center gap-3 border-b px-4 py-3 text-left text-xs transition-colors focus-visible:outline-none focus-visible:bg-white/5 ${isLightMode ? 'border-slate-100 hover:bg-slate-50' : 'border-white/5 hover:bg-white/5'} ${activeConversation?.id === conv.id ? (isLightMode ? 'bg-slate-100 font-bold' : 'bg-white/5 font-bold text-cyan-300') : (isLightMode ? 'text-slate-600' : 'text-cyan-500')}`}>
                                                            <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                                                            {activeConversation?.id === conv.id && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cyan-400"><path d="M20 6 9 17l-5-5" /></svg>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" onClick={createConversation} disabled={isCreatingConversation} aria-label="Create new chat" aria-busy={isCreatingConversation} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all active:scale-[0.92] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${isLightMode ? 'bg-slate-900 text-white shadow-sm hover:bg-slate-800' : 'bg-cyan-400 text-cyan-950 shadow-[0_0_12px_rgba(34,211,238,0.2)] hover:bg-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                                    </button>
                                    <div className={`hidden sm:flex shrink-0 items-center gap-2 pl-2 border-l ${isLightMode ? 'border-slate-200' : 'border-cyan-900/50'}`}>
                                        <span className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${isLightMode ? 'text-emerald-700' : 'text-emerald-400/80'}`}>
                                            <span aria-hidden="true" className={`h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none ${isLightMode ? 'bg-emerald-500' : 'bg-emerald-400'}`}></span>
                                            Connected
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>                        {/* Thought Stream Scroll Container */}
                        <div
                            ref={thoughtStreamContainerRef}
                            className={`flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 scrollbar-thin scrollbar-track-transparent transition-colors duration-500 ${isLightMode ? 'scrollbar-thumb-slate-300' : 'scrollbar-thumb-cyan-900/50'} ${activeTab === 'thoughts' ? '' : 'hidden'}`}
                            onScroll={handleScroll}
                        >
                            <section
                                aria-label="Task status"
                                aria-live="polite"
                                className={`rounded-lg border p-3 transition-colors duration-500 ${isLightMode ? 'border-slate-200 bg-white shadow-sm' : 'border-cyan-900/60 bg-cyan-950/20'}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${isLightMode ? 'text-slate-500' : 'text-cyan-600'}`}>Task observability</span>
                                    {latestTask ? (
                                        <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${latestTask.status.toLowerCase() === 'failed'
                                            ? (isLightMode ? 'border-red-300 bg-red-50 text-red-800' : 'border-red-500/40 bg-red-950/40 text-red-300')
                                            : latestTask.status.toLowerCase() === 'cancelled'
                                                ? (isLightMode ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-500/40 bg-amber-950/40 text-amber-300')
                                                : ACTIVE_TASK_STATUSES.has(latestTask.status.toLowerCase())
                                                    ? (isLightMode ? 'border-cyan-300 bg-cyan-50 text-cyan-800' : 'border-cyan-500/40 bg-cyan-950/50 text-cyan-300')
                                                    : (isLightMode ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300')
                                            }`}
                                        >
                                            {latestTask.status.replace(/_/g, ' ')}
                                        </span>
                                    ) : (
                                        <span className={`text-[10px] ${isLightMode ? 'text-slate-400' : 'text-cyan-800'}`}>No tasks yet</span>
                                    )}
                                </div>

                                {latestTask && (
                                    <div className="mt-2 space-y-1.5">
                                        <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-800' : 'text-cyan-100'}`}>{latestTask.displaySummary}</p>
                                        <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[10px] uppercase tracking-wide ${isLightMode ? 'text-slate-500' : 'text-cyan-700'}`}>
                                            <span>Elapsed: {formatElapsedTime(latestTask, taskClock)}</span>
                                            {latestTask.safePhase && <span>Phase: {latestTask.safePhase}</span>}
                                            {RETRY_ELIGIBLE_STATUSES.has(latestTask.status.toLowerCase()) && <span className={isLightMode ? 'text-amber-700 font-bold' : 'text-amber-400 font-bold'}>Retry eligible</span>}
                                        </div>
                                        {latestTask.terminalReason && (
                                            <p className={`border-l-2 pl-2 text-[11px] leading-relaxed ${isLightMode ? 'border-slate-300 text-slate-600' : 'border-cyan-800 text-cyan-300/80'}`}>
                                                Terminal reason: {latestTask.terminalReason}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {taskPollFailed && (
                                    <p className={`mt-2 text-[10px] ${isLightMode ? 'text-slate-500' : 'text-cyan-700'}`}>Task status is temporarily unavailable. Retrying automatically.</p>
                                )}
                                {pendingApprovals.length > 0 && (
                                    <p className={`mt-2 text-[10px] ${isLightMode ? 'text-amber-700' : 'text-amber-400'}`}>Approval inbox: {pendingApprovals.length} pending</p>
                                )}
                            </section>
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
                                        const { textWithoutDiffs, diffBlocks } = extractDiffBlocks(cleanText);
                                        cleanText = textWithoutDiffs;

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

                                        const isCollaborationActivity = cleanText.startsWith('[COLLABORATION] ');
                                        const isAutonomyActivity = cleanText.startsWith('[AUTONOMY] ');
                                        if (isCollaborationActivity) cleanText = cleanText.replace(/^\[COLLABORATION\]\s*/, '');
                                        if (isAutonomyActivity) cleanText = cleanText.replace(/^\[AUTONOMY\]\s*/, '');
                                        const isSystemMessage = msg.brain === 'SYSTEM';
                                        const isBackgroundActivity = (BACKGROUND_ACTIVITY_MESSAGES.has(cleanText) || isCollaborationActivity || isAutonomyActivity)
                                            && !approvalId
                                            && optionGroups.length === 0
                                            && imageList.length === 0
                                            && diffBlocks.length === 0;

                                        if (isBackgroundActivity || isSystemMessage) {
                                            return (
                                                <div key={msg.id} className={`flex items-start gap-2 px-1.5 py-1 text-[10px] tracking-wide ${isSystemMessage
                                                    ? (isLightMode ? 'text-slate-500 font-mono' : 'text-slate-400 font-mono')
                                                    : (isCollaborationActivity || isAutonomyActivity)
                                                        ? (isLightMode ? 'text-indigo-600' : 'text-violet-400')
                                                        : (isLightMode ? 'text-slate-500' : 'text-cyan-700')
                                                    }`}>
                                                    {isSystemMessage ? (
                                                        <div className="flex flex-col gap-1 w-full mt-2 mb-2">
                                                            <div className="flex items-center gap-2 opacity-60">
                                                                <span className="font-bold tracking-widest">[SYSTEM]</span>
                                                                <span>{msg.time}</span>
                                                            </div>
                                                            <div className="whitespace-pre-wrap pl-2.5 ml-1 border-l border-current opacity-80 py-0.5">
                                                                {cleanText}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className={`h-1 w-1 rounded-full shrink-0 ${isLightMode ? 'bg-slate-400' : 'bg-cyan-700'}`} aria-hidden="true" />
                                                            <span>{cleanText}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        const isUser = msg.brain === 'USER';
                                        return (
                                            <div key={msg.id} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] text-xs leading-6 break-words p-3.5 border shadow-sm transition-colors duration-500 ${isUser
                                                    ? (isLightMode ? 'bg-slate-800 text-white border-slate-900 rounded-2xl rounded-br-sm' : 'bg-cyan-900 text-cyan-50 border-cyan-700 rounded-2xl rounded-br-sm')
                                                    : `${getBrainBgColor(msg.brain)} rounded-2xl rounded-bl-sm`
                                                    }`}>
                                                    {!isUser && (
                                                        <div className={`flex items-baseline justify-between gap-2 mb-2 pb-1 border-b ${isLightMode ? 'border-slate-200/50' : 'border-cyan-900/50'}`}>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className={`font-bold tracking-wider ${getBrainColor(msg.brain)}`}>[{msg.brain}]</span>
                                                                <span className={`text-[9px] ${isLightMode ? 'text-slate-400' : 'text-cyan-800'}`}>{msg.time}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => speakMessage(msg.brain, msg.text)}
                                                                title={`Replay ${msg.brain}'s Voice`}
                                                                className={`p-1 rounded transition-colors ${isLightMode ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800' : 'hover:bg-cyan-900/60 text-cyan-500 hover:text-cyan-200'}`}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}


                                                    <div className={`font-sans tracking-normal flex flex-col gap-2 ${isUser ? (isLightMode ? 'text-slate-100' : 'text-cyan-50') : (isLightMode ? 'text-slate-700' : 'text-cyan-50')}`}>
                                                        <div className="flex-1 w-full overflow-hidden flex gap-2">
                                                            {!isUser && (
                                                                <div className="mt-0.5 shrink-0">
                                                                    {msg.text.startsWith('[DONE] ') ? (
                                                                        <svg className="w-4 h-4 text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)] animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    ) : (
                                                                        <span className="opacity-50">&gt;</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                {isUser ? parseMarkdownBold(cleanText, isLightMode) : <TypingMessage text={cleanText} isLightMode={isLightMode} />}
                                                            </div>
                                                        </div>

                                                        {diffBlocks.length > 0 && (
                                                            <div className="mt-1 space-y-2">
                                                                {diffBlocks.map((diff, diffIdx) => (
                                                                    <DiffCard key={diffIdx} diff={diff} isLightMode={isLightMode} />
                                                                ))}
                                                            </div>
                                                        )}

                                                        {imageList.length > 0 && (
                                                            <div className="mt-1 flex flex-wrap gap-2">
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
                                                            <div key={groupIndex} className="mt-2">
                                                                {group.question && <p className={`mb-1.5 text-[10px] font-bold ${isUser ? (isLightMode ? 'text-slate-300' : 'text-cyan-200') : (isLightMode ? 'text-slate-600' : 'text-cyan-200')}`}>{group.question}</p>}
                                                                <div className="flex flex-wrap gap-2">
                                                                    {group.options.map((opt, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => dispatchTask(group.question ? `${group.question}: ${opt}` : opt)}
                                                                            disabled={isSubmitting}
                                                                            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isUser
                                                                                ? (isLightMode ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600' : 'bg-cyan-800 border-cyan-600 text-cyan-100 hover:bg-cyan-700')
                                                                                : (isLightMode
                                                                                    ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm'
                                                                                    : 'bg-cyan-950/50 border border-cyan-700/50 text-cyan-300 hover:bg-cyan-900/80 hover:shadow-[0_0_10px_rgba(34,211,238,0.5)]')
                                                                                }`}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {approvalId && (
                                                            (approvals.find(approval => approval.id === approvalId)?.status ?? 'pending') === 'pending' ? (
                                                                <div className="mt-2 flex flex-wrap gap-2">
                                                                    <button onClick={() => resolveApproval(approvalId, 'accept')} disabled={isSubmitting || resolvingApprovalIds.has(approvalId)} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded border disabled:opacity-50 ${isLightMode ? 'border-green-700 bg-green-100 text-green-900 hover:bg-green-200' : 'border-green-500/60 bg-green-950/40 text-green-300 hover:bg-green-900/70'}`}>Approve</button>
                                                                    <button onClick={() => resolveApproval(approvalId, 'decline')} disabled={isSubmitting || resolvingApprovalIds.has(approvalId)} className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold rounded border disabled:opacity-50 ${isLightMode ? 'border-red-700 bg-red-100 text-red-900 hover:bg-red-200' : 'border-red-500/60 bg-red-950/40 text-red-300 hover:bg-red-900/70'}`}>Deny</button>
                                                                </div>
                                                            ) : <p className={`mt-2 text-[10px] uppercase tracking-wide ${isUser ? (isLightMode ? 'text-slate-300' : 'text-cyan-300') : (isLightMode ? 'text-slate-500' : 'text-cyan-700')}`}>Approval {(approvals.find(approval => approval.id === approvalId)?.status ?? 'resolved')}</p>
                                                        )}
                                                    </div>

                                                    {isUser && (
                                                        <div className="flex justify-end mt-1 pt-1 border-t border-white/10">
                                                            <span className={`text-[9px] ${isLightMode ? 'text-slate-400' : 'text-cyan-600'}`}>{msg.time}</span>
                                                        </div>
                                                    )}
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

                        {/* Floating Scroll to Bottom Indicator */}
                        {!autoScroll && activeTab === 'thoughts' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setAutoScroll(true);
                                    scrollToBottom('smooth');
                                }}
                                aria-label="Scroll to latest thoughts"
                                className={`absolute bottom-52 sm:bottom-48 right-6 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg transition-all transform hover:scale-105 active:scale-95 animate-bounce cursor-pointer ${
                                    isLightMode
                                        ? 'bg-slate-900 text-white shadow-slate-900/25 hover:bg-slate-800'
                                        : 'bg-cyan-400 text-cyan-950 shadow-[0_0_15px_rgba(34,211,238,0.5)] hover:bg-cyan-300'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>Scroll to latest</span>
                            </button>
                        )}

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

                            {/* Quick Actions Command Deck */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-1 scrollbar-none select-none">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1 shrink-0 ${isLightMode ? 'text-slate-400' : 'text-cyan-700'}`}>Deck:</span>
                                {QUICK_ACTIONS.map((action, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => dispatchTask(action.prompt)}
                                        disabled={isSubmitting}
                                        title={action.description}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] border shrink-0 ${
                                            isLightMode 
                                                ? 'bg-white border-slate-200 text-slate-700 hover:text-cyan-800 hover:border-cyan-400 hover:bg-cyan-50/50 shadow-sm'
                                                : 'bg-cyan-950/30 border-cyan-900/50 text-cyan-300 hover:text-cyan-100 hover:border-cyan-400/80 hover:bg-cyan-900/40 hover:shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                                        }`}
                                    >
                                        <span className="text-xs">{action.icon}</span>
                                        <span>{action.label}</span>
                                    </button>
                                ))}
                            </div>

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
                                <div className={`text-[10px] font-bold uppercase tracking-[0.15em] flex justify-between px-1 ${isLightMode ? 'text-slate-500' : 'text-cyan-700'}`}>
                                    <span>Command Terminal {attachedImages.length > 0 && <span className="text-cyan-400">({attachedImages.length} Attached)</span>}</span>
                                    {isSubmitting && <span className="text-amber-400 animate-pulse">TRANSMITTING...</span>}
                                </div>
                                <div
                                    onPaste={handlePaste}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`flex items-end gap-2.5 transition-all ${isDragging ? 'ring-2 ring-cyan-400/50 bg-cyan-950/20 rounded-xl p-2 -m-2' : ''}`}
                                >
                                    {/* Paperclip Button */}
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isSubmitting}
                                        className={`w-[48px] h-[48px] flex items-center justify-center rounded-xl border shrink-0 transition-all cursor-pointer disabled:opacity-40 active:scale-[0.96] ${isLightMode
                                            ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-[0_2px_8px_rgba(15,23,42,0.04)]'
                                            : 'bg-white/5 border-white/10 text-cyan-400 hover:bg-white/10 hover:border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                                            }`}
                                        title="Attach / Select Images (or paste from clipboard Ctrl+V)"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728l-7.07 7.07a6 6 0 01-8.486-8.486l7.07-7.07a4 4 0 015.657 5.657l-7.07 7.07a2 2 0 01-2.828-2.828l7.07-7.07" />
                                        </svg>
                                    </button>

                                    <div className="relative flex-1 group">
                                        <span className={`absolute left-4 top-[14px] text-sm font-bold select-none transition-colors ${isLightMode ? 'text-slate-400 group-focus-within:text-cyan-600' : 'text-cyan-600/50 group-focus-within:text-cyan-400'}`}>&gt;</span>
                                        <textarea
                                            value={taskInput}
                                            onChange={(e) => setTaskInput(e.target.value)}
                                            onKeyDown={handleTaskInputKeyDown}
                                            placeholder={attachedImages.length > 0 ? "Enter instructions for attached image(s)..." : "Enter task or paste/drag image..."}
                                            disabled={isSubmitting}
                                            rows={1}
                                            className={`w-full min-h-[48px] max-h-48 resize-y border rounded-xl py-3.5 pl-[38px] pr-4 text-xs font-medium leading-relaxed focus:outline-none transition-all disabled:opacity-50 ${isLightMode
                                                ? 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 shadow-[inset_0_2px_4px_rgba(15,23,42,0.02)] focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10'
                                                : 'bg-black/40 backdrop-blur-md border-cyan-900/50 text-cyan-50 placeholder:text-cyan-700 focus:bg-cyan-950/30 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]'
                                                }`}
                                        />
                                    </div>
                                    {isTaskActive || isSubmitting ? (
                                        <button
                                            type="button"
                                            onClick={handleAbortTask}
                                            className={`flex items-center justify-center gap-2 px-5 h-[48px] rounded-xl border font-bold text-xs tracking-widest uppercase transition-all shrink-0 cursor-pointer active:scale-[0.96] ${isLightMode ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/50'}`}
                                            title="Emergency Abort Current Task & Clear Queue"
                                        >
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                            <span>STOP</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={!taskInput.trim() && attachedImages.length === 0}
                                            className={`flex items-center justify-center gap-2 px-6 h-[48px] rounded-xl font-bold text-xs tracking-widest uppercase shrink-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96] ${isLightMode
                                                ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-[0_4px_12px_rgba(15,23,42,0.15)] disabled:shadow-none'
                                                : 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.3)] hover:shadow-[0_0_24px_rgba(34,211,238,0.5)] disabled:shadow-none disabled:bg-cyan-900/40 disabled:text-cyan-700'
                                                }`}
                                        >
                                            <span>SEND</span>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <div className="flex justify-end pr-1 mt-1">
                                    <p className={`text-[10px] font-medium tracking-wide ${isLightMode ? 'text-slate-400' : 'text-cyan-800/80'}`}>Enter sends. Shift + Enter adds a new line.</p>
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
