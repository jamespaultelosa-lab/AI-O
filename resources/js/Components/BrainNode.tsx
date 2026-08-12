import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import BrainNetwork from './BrainNetwork';

gsap.registerPlugin(useGSAP);

interface BrainNodeProps {
    name: string;
    status: string; // 'idle', 'thinking', 'consulting'
    anyActive?: boolean;
    isLightMode?: boolean;
}

const BrainNode = ({ name, status, anyActive, isLightMode }: BrainNodeProps) => {
    const isThinking = status === 'thinking';
    const isExecuting = status === 'executing';
    const isStandby = status === 'standby';
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        // Kill existing animations to avoid conflicts on re-render
        gsap.killTweensOf(networkRef.current);

        if (isThinking) {
            gsap.to(networkRef.current, {
                scale: 1.1,
                opacity: 0.9,
                duration: 0.5,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                force3D: true
            });
        } else if (isExecuting) {
            gsap.to(networkRef.current, {
                scale: 1.25,
                opacity: 1,
                duration: 0.65,
                yoyo: true,
                repeat: -1,
                ease: "power2.inOut",
                force3D: true
            });
        } else if (isStandby) {
            gsap.to(networkRef.current, {
                scale: 0.95,
                opacity: 0.4,
                duration: 3,
                yoyo: true,
                repeat: -1,
                ease: "power1.inOut",
                force3D: true
            });
        } else {
            // Idle state pulse
            gsap.to(networkRef.current, {
                scale: 0.98,
                opacity: anyActive ? 0.4 : 1,
                duration: 2,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                force3D: true
            });
        }
    }, { dependencies: [isThinking, isExecuting, isStandby, anyActive], scope: containerRef });

    const isActive = isThinking || isExecuting;

    const getPalette = () => {
        const normalizedName = name.replace(' ', '_');
        if (isLightMode) {
            switch (normalizedName) {
                case 'Architect':
                    return {
                        network: 'text-purple-600 drop-shadow-[0_0_10px_rgba(168,85,247,0.4)]',
                        executingNetwork: 'text-purple-600 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(168,85,247,0.9)] drop-shadow-[0_0_40px_rgba(168,85,247,0.7)] brightness-125',
                        mutedNetwork: 'text-purple-300 drop-shadow-[0_0_5px_rgba(168,85,247,0.2)]',
                        activeText: 'text-purple-700',
                        mutedText: 'text-purple-400',
                        activeSubText: 'text-purple-500',
                        mutedSubText: 'text-purple-300'
                    };
                case 'Senior_Dev':
                    return {
                        network: 'text-blue-600 drop-shadow-[0_0_10px_rgba(59,130,246,0.4)]',
                        executingNetwork: 'text-blue-600 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(59,130,246,0.9)] drop-shadow-[0_0_40px_rgba(59,130,246,0.7)] brightness-125',
                        mutedNetwork: 'text-blue-300 drop-shadow-[0_0_5px_rgba(59,130,246,0.2)]',
                        activeText: 'text-blue-700',
                        mutedText: 'text-blue-400',
                        activeSubText: 'text-blue-500',
                        mutedSubText: 'text-blue-300'
                    };
                case 'Junior_Dev':
                    return {
                        network: 'text-green-600 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]',
                        executingNetwork: 'text-green-600 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(34,197,94,0.9)] drop-shadow-[0_0_40px_rgba(34,197,94,0.7)] brightness-125',
                        mutedNetwork: 'text-green-300 drop-shadow-[0_0_5px_rgba(34,197,94,0.2)]',
                        activeText: 'text-green-700',
                        mutedText: 'text-green-400',
                        activeSubText: 'text-green-500',
                        mutedSubText: 'text-green-300'
                    };
                case 'Security':
                    return {
                        network: 'text-red-600 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]',
                        executingNetwork: 'text-red-600 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(239,68,68,0.9)] drop-shadow-[0_0_40px_rgba(239,68,68,0.7)] brightness-125',
                        mutedNetwork: 'text-red-300 drop-shadow-[0_0_5px_rgba(239,68,68,0.2)]',
                        activeText: 'text-red-700',
                        mutedText: 'text-red-400',
                        activeSubText: 'text-red-500',
                        mutedSubText: 'text-red-300'
                    };
                default:
                    return {
                        network: 'text-cyan-600 drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]',
                        executingNetwork: 'text-cyan-600 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(6,182,212,0.9)] drop-shadow-[0_0_40px_rgba(6,182,212,0.7)] brightness-125',
                        mutedNetwork: 'text-cyan-300 drop-shadow-[0_0_5px_rgba(6,182,212,0.2)]',
                        activeText: 'text-cyan-700',
                        mutedText: 'text-cyan-400',
                        activeSubText: 'text-cyan-500',
                        mutedSubText: 'text-cyan-300'
                    };
            }
        } else {
            switch (normalizedName) {
                case 'Architect':
                    return {
                        network: 'text-purple-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(168,85,247,1)] drop-shadow-[0_0_40px_rgba(168,85,247,0.9)] drop-shadow-[0_0_80px_rgba(168,85,247,0.7)] brightness-125',
                        executingNetwork: 'text-purple-300 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(168,85,247,1)] drop-shadow-[0_0_50px_rgba(168,85,247,1)] drop-shadow-[0_0_90px_rgba(192,132,252,1)] brightness-150',
                        mutedNetwork: 'text-purple-600 drop-shadow-[0_0_15px_rgba(168,85,247,1)] drop-shadow-[0_0_30px_rgba(168,85,247,0.6)]',
                        activeText: 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]',
                        mutedText: 'text-purple-800/60',
                        activeSubText: 'text-purple-300',
                        mutedSubText: 'text-purple-900/50'
                    };
                case 'Senior_Dev':
                    return {
                        network: 'text-blue-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(59,130,246,1)] drop-shadow-[0_0_40px_rgba(59,130,246,0.9)] drop-shadow-[0_0_80px_rgba(59,130,246,0.7)] brightness-125',
                        executingNetwork: 'text-blue-300 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(59,130,246,1)] drop-shadow-[0_0_50px_rgba(59,130,246,1)] drop-shadow-[0_0_90px_rgba(96,165,250,1)] brightness-150',
                        mutedNetwork: 'text-blue-600 drop-shadow-[0_0_15px_rgba(59,130,246,1)] drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]',
                        activeText: 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]',
                        mutedText: 'text-blue-800/60',
                        activeSubText: 'text-blue-300',
                        mutedSubText: 'text-blue-900/50'
                    };
                case 'Junior_Dev':
                    return {
                        network: 'text-green-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(34,197,94,1)] drop-shadow-[0_0_40px_rgba(34,197,94,0.9)] drop-shadow-[0_0_80px_rgba(34,197,94,0.7)] brightness-125',
                        executingNetwork: 'text-green-300 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(34,197,94,1)] drop-shadow-[0_0_50px_rgba(34,197,94,1)] drop-shadow-[0_0_90px_rgba(74,222,128,1)] brightness-150',
                        mutedNetwork: 'text-green-600 drop-shadow-[0_0_15px_rgba(34,197,94,1)] drop-shadow-[0_0_30px_rgba(34,197,94,0.6)]',
                        activeText: 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]',
                        mutedText: 'text-green-800/60',
                        activeSubText: 'text-green-300',
                        mutedSubText: 'text-green-900/50'
                    };
                case 'Security':
                    return {
                        network: 'text-red-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(239,68,68,1)] drop-shadow-[0_0_40px_rgba(239,68,68,0.9)] drop-shadow-[0_0_80px_rgba(239,68,68,0.7)] brightness-125',
                        executingNetwork: 'text-red-300 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(239,68,68,1)] drop-shadow-[0_0_50px_rgba(239,68,68,1)] drop-shadow-[0_0_90px_rgba(248,113,113,1)] brightness-150',
                        mutedNetwork: 'text-red-600 drop-shadow-[0_0_15px_rgba(239,68,68,1)] drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]',
                        activeText: 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]',
                        mutedText: 'text-red-800/60',
                        activeSubText: 'text-red-300',
                        mutedSubText: 'text-red-900/50'
                    };
                default:
                    return {
                        network: 'text-cyan-300 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(34,211,238,1)] drop-shadow-[0_0_40px_rgba(34,211,238,0.9)] drop-shadow-[0_0_80px_rgba(34,211,238,0.7)] brightness-125',
                        executingNetwork: 'text-cyan-200 drop-shadow-[0_0_8px_rgba(255,255,255,1)] drop-shadow-[0_0_20px_rgba(34,211,238,1)] drop-shadow-[0_0_50px_rgba(34,211,238,1)] drop-shadow-[0_0_90px_rgba(34,211,238,1)] brightness-150',
                        mutedNetwork: 'text-cyan-600 drop-shadow-[0_0_15px_rgba(34,211,238,1)] drop-shadow-[0_0_30px_rgba(34,211,238,0.6)]',
                        activeText: 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]',
                        mutedText: 'text-cyan-800/60',
                        activeSubText: 'text-cyan-300',
                        mutedSubText: 'text-cyan-900/50'
                    };
            }
        }
    };

    const palette = getPalette();

    const getNetworkClasses = () => {
        if (isExecuting) return palette.executingNetwork;
        if (isThinking) return palette.network;
        return palette.mutedNetwork;
    };

    const getTextClasses = () => {
        if (isActive) return palette.activeText;
        if (anyActive) return palette.mutedText;
        return palette.activeText;
    };

    const getSubTextClasses = () => {
        if (isActive) return palette.activeSubText;
        if (anyActive) return palette.mutedSubText;
        return palette.activeSubText;
    };

    return (
        <div ref={containerRef} className="relative flex flex-col items-center justify-center w-[20vh] h-[20vh] min-w-[120px] min-h-[120px] max-w-[240px] max-h-[240px] sm:w-[22vh] sm:h-[22vh] md:w-[25vh] md:h-[25vh] lg:w-[28vh] lg:h-[28vh]">

            {/* Brain Network SVG */}
            <div
                ref={networkRef}
                className={`absolute inset-0 z-10 flex items-center justify-center transition-colors duration-1000 ease-out will-change-transform ${getNetworkClasses()}`}
            >
                <div className="w-[85%] h-[85%]">
                    <BrainNetwork />
                </div>
            </div>

            {/* Status Text (Holographic style) */}
            <div className="absolute -bottom-6 sm:-bottom-7 lg:-bottom-9 flex flex-col items-center text-center pointer-events-none">
                <span className={`text-[10px] sm:text-xs md:text-sm lg:text-base font-bold tracking-widest uppercase transition-colors duration-1000 ease-out ${getTextClasses()}`}>
                    {name.replace('_', ' ')}
                </span>
                <span className={`text-[8px] sm:text-[9px] md:text-xs tracking-wider uppercase mt-0 transition-colors duration-1000 ease-out ${getSubTextClasses()}`}>
                    {status}
                </span>
            </div>
        </div>
    );
};

export default React.memo(BrainNode);
