import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import BrainNetwork from './BrainNetwork';

gsap.registerPlugin(useGSAP);

interface BrainNodeProps {
    name: string;
    status: string; // 'idle', 'thinking', 'consulting'
    anyActive?: boolean;
}

const BrainNode = ({ name, status, anyActive }: BrainNodeProps) => {
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
                scale: 1.15,
                opacity: 1,
                duration: 1,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
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

    const getPalette = () => {
        const normalizedName = name.replace(' ', '_');
        switch (normalizedName) {
            case 'Architect':
                return {
                    network: 'text-purple-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(168,85,247,1)] drop-shadow-[0_0_40px_rgba(168,85,247,0.9)] drop-shadow-[0_0_80px_rgba(168,85,247,0.7)] brightness-125',
                    mutedNetwork: 'text-purple-600 drop-shadow-[0_0_15px_rgba(168,85,247,1)] drop-shadow-[0_0_30px_rgba(168,85,247,0.6)]',
                    activeText: 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]',
                    mutedText: 'text-purple-800/60',
                    activeSubText: 'text-purple-300',
                    mutedSubText: 'text-purple-900/50'
                };
            case 'Senior_Dev':
                return {
                    network: 'text-blue-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(59,130,246,1)] drop-shadow-[0_0_40px_rgba(59,130,246,0.9)] drop-shadow-[0_0_80px_rgba(59,130,246,0.7)] brightness-125',
                    mutedNetwork: 'text-blue-600 drop-shadow-[0_0_15px_rgba(59,130,246,1)] drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]',
                    activeText: 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]',
                    mutedText: 'text-blue-800/60',
                    activeSubText: 'text-blue-300',
                    mutedSubText: 'text-blue-900/50'
                };
            case 'Junior_Dev':
                return {
                    network: 'text-green-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(34,197,94,1)] drop-shadow-[0_0_40px_rgba(34,197,94,0.9)] drop-shadow-[0_0_80px_rgba(34,197,94,0.7)] brightness-125',
                    mutedNetwork: 'text-green-600 drop-shadow-[0_0_15px_rgba(34,197,94,1)] drop-shadow-[0_0_30px_rgba(34,197,94,0.6)]',
                    activeText: 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]',
                    mutedText: 'text-green-800/60',
                    activeSubText: 'text-green-300',
                    mutedSubText: 'text-green-900/50'
                };
            case 'Security':
                return {
                    network: 'text-red-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(239,68,68,1)] drop-shadow-[0_0_40px_rgba(239,68,68,0.9)] drop-shadow-[0_0_80px_rgba(239,68,68,0.7)] brightness-125',
                    mutedNetwork: 'text-red-600 drop-shadow-[0_0_15px_rgba(239,68,68,1)] drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]',
                    activeText: 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]',
                    mutedText: 'text-red-800/60',
                    activeSubText: 'text-red-300',
                    mutedSubText: 'text-red-900/50'
                };
            default:
                return {
                    network: 'text-cyan-300 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)] drop-shadow-[0_0_15px_rgba(34,211,238,1)] drop-shadow-[0_0_40px_rgba(34,211,238,0.9)] drop-shadow-[0_0_80px_rgba(34,211,238,0.7)] brightness-125',
                    mutedNetwork: 'text-cyan-600 drop-shadow-[0_0_15px_rgba(34,211,238,1)] drop-shadow-[0_0_30px_rgba(34,211,238,0.6)]',
                    activeText: 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]',
                    mutedText: 'text-cyan-800/60',
                    activeSubText: 'text-cyan-300',
                    mutedSubText: 'text-cyan-900/50'
                };
        }
    };

    const palette = getPalette();
    const isActive = isThinking || isExecuting;

    const getNetworkClasses = () => isActive ? palette.network : palette.mutedNetwork;

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
        <div ref={containerRef} className="relative flex flex-col items-center justify-center w-40 h-40 md:w-80 md:h-80">

            {/* Brain Network SVG */}
            <div
                ref={networkRef}
                className={`absolute inset-0 z-10 flex items-center justify-center transition-colors duration-1000 ease-out will-change-transform ${getNetworkClasses()}`}
            >
                <div className="w-32 h-32 md:w-64 md:h-64">
                    <BrainNetwork />
                </div>
            </div>

            {/* Status Text (Holographic style) */}
            <div className="absolute -bottom-8 md:-bottom-12 flex flex-col items-center text-center">
                <span className={`text-xs md:text-xl font-bold tracking-widest uppercase transition-colors duration-1000 ease-out ${getTextClasses()}`}>
                    {name.replace('_', ' ')}
                </span>
                <span className={`text-[9px] md:text-xs tracking-wider uppercase mt-0 md:mt-1 transition-colors duration-1000 ease-out ${getSubTextClasses()}`}>
                    {status}
                </span>
            </div>
        </div>
    );
}

export default React.memo(BrainNode);
