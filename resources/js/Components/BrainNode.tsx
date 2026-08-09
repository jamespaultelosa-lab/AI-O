import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

interface BrainNodeProps {
    name: string;
    status: string; // 'idle', 'thinking', 'consulting'
    anyExecuting?: boolean;
}

const BrainNode = ({ name, status, anyExecuting }: BrainNodeProps) => {
    const isThinking = status === 'thinking';
    const isExecuting = status === 'executing';
    const isStandby = status === 'standby';
    const containerRef = useRef<HTMLDivElement>(null);
    const coreRef = useRef<HTMLDivElement>(null);
    const wave1Ref = useRef<HTMLDivElement>(null);
    const wave2Ref = useRef<HTMLDivElement>(null);
    const wave3Ref = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        // Kill existing animations to avoid conflicts on re-render
        gsap.killTweensOf([coreRef.current, wave1Ref.current, wave2Ref.current, wave3Ref.current]);

        if (isThinking) {
            // Core node pulse (Fast)
            gsap.to(coreRef.current, {
                scale: 1.2,
                duration: 0.75,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                force3D: true
            });

            const waveAnim = (element: HTMLElement | null, delay: number) => {
                gsap.fromTo(element, 
                    { scale: 1, opacity: 0.5 },
                    { scale: 2.5, opacity: 0, duration: 2, repeat: -1, delay: delay, ease: "power1.out", force3D: true }
                );
            };

            waveAnim(wave1Ref.current, 0);
            waveAnim(wave2Ref.current, 0.6);
            waveAnim(wave3Ref.current, 1.2);
            
        } else if (isExecuting) {
            // Core node pulse (Strong & Steady)
            gsap.to(coreRef.current, {
                scale: 1.15,
                duration: 1,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                force3D: true
            });

            const waveAnimExec = (element: HTMLElement | null, delay: number) => {
                gsap.fromTo(element, 
                    { scale: 1, opacity: 0.4 },
                    { scale: 2.2, opacity: 0, duration: 2.5, repeat: -1, delay: delay, ease: "power2.out", force3D: true }
                );
            };

            waveAnimExec(wave1Ref.current, 0);
            waveAnimExec(wave2Ref.current, 0.8);
            waveAnimExec(wave3Ref.current, 1.6);
        } else if (isStandby) {
            // Standby state pulse (Very Slow, Scanning)
            gsap.to(coreRef.current, {
                scale: 1.02,
                duration: 3,
                yoyo: true,
                repeat: -1,
                ease: "power1.inOut",
                force3D: true
            });

            const waveAnimStandby = (element: HTMLElement | null, delay: number) => {
                gsap.fromTo(element, 
                    { scale: 1, opacity: 0.15 },
                    { scale: 4, opacity: 0, duration: 6, repeat: -1, delay: delay, ease: "linear", force3D: true }
                );
            };

            waveAnimStandby(wave1Ref.current, 0);
            waveAnimStandby(wave2Ref.current, 2);
            waveAnimStandby(wave3Ref.current, 4);
        } else {
            // Idle state pulse (Slow)
            gsap.to(coreRef.current, {
                scale: 1.1,
                duration: 1.5,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                force3D: true
            });

            const waveAnimIdle = (element: HTMLElement | null, delay: number) => {
                gsap.fromTo(element, 
                    { scale: 1, opacity: 0.4 },
                    { scale: 3, opacity: 0, duration: 3, repeat: -1, delay: delay, ease: "power1.out", force3D: true }
                );
            };

            waveAnimIdle(wave1Ref.current, 0);
            waveAnimIdle(wave2Ref.current, 1);
            waveAnimIdle(wave3Ref.current, 2);
        }
    }, { dependencies: [isThinking, isExecuting, isStandby], scope: containerRef });

    const getPalette = () => {
        const normalizedName = name.replace(' ', '_');
        switch (normalizedName) {
            case 'Architect': 
                return { 
                    activeCore: 'bg-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.7)]', 
                    mutedCore: 'bg-purple-900/40 shadow-lg shadow-gray-900/50',
                    wave: 'bg-purple-500',
                    mutedWave: 'bg-purple-900/30',
                    activeText: 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]',
                    mutedText: 'text-purple-800/60',
                    activeSubText: 'text-purple-300',
                    mutedSubText: 'text-purple-900/50'
                };
            case 'Senior_Dev': 
                return { 
                    activeCore: 'bg-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.7)]', 
                    mutedCore: 'bg-blue-900/40 shadow-lg shadow-gray-900/50',
                    wave: 'bg-blue-500',
                    mutedWave: 'bg-blue-900/30',
                    activeText: 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]',
                    mutedText: 'text-blue-800/60',
                    activeSubText: 'text-blue-300',
                    mutedSubText: 'text-blue-900/50'
                };
            case 'Junior_Dev': 
                return { 
                    activeCore: 'bg-green-500 shadow-[0_0_30px_rgba(34,197,94,0.7)]', 
                    mutedCore: 'bg-green-900/40 shadow-lg shadow-gray-900/50',
                    wave: 'bg-green-500',
                    mutedWave: 'bg-green-900/30',
                    activeText: 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]',
                    mutedText: 'text-green-800/60',
                    activeSubText: 'text-green-300',
                    mutedSubText: 'text-green-900/50'
                };
            case 'Security': 
                return { 
                    activeCore: 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.7)]', 
                    mutedCore: 'bg-red-900/40 shadow-lg shadow-gray-900/50',
                    wave: 'bg-red-500',
                    mutedWave: 'bg-red-900/30',
                    activeText: 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]',
                    mutedText: 'text-red-800/60',
                    activeSubText: 'text-red-300',
                    mutedSubText: 'text-red-900/50'
                };
            default: 
                return { 
                    activeCore: 'bg-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.7)]', 
                    mutedCore: 'bg-cyan-900/40 shadow-lg shadow-gray-900/50',
                    wave: 'bg-cyan-400',
                    mutedWave: 'bg-cyan-900/30',
                    activeText: 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]',
                    mutedText: 'text-cyan-800/60',
                    activeSubText: 'text-cyan-300',
                    mutedSubText: 'text-cyan-900/50'
                };
        }
    };

    const palette = getPalette();
    const isActive = isThinking || isExecuting;

    const getCoreClasses = () => isActive ? palette.activeCore : palette.mutedCore;
    const getWaveClasses = () => isActive ? palette.wave : palette.mutedWave;

    const getTextClasses = () => {
        if (isActive) return palette.activeText;
        if (anyExecuting) return palette.mutedText;
        return palette.activeText;
    };
    
    const getSubTextClasses = () => {
        if (isActive) return palette.activeSubText;
        if (anyExecuting) return palette.mutedSubText;
        return palette.activeSubText;
    };

    return (
        <div ref={containerRef} className="relative flex flex-col items-center justify-center w-64 h-64">
            {/* Core Node */}
            <div
                ref={coreRef}
                className={`absolute w-24 h-24 rounded-full z-10 flex items-center justify-center transition-colors duration-1000 ease-out will-change-transform ${getCoreClasses()}`}
            >
                <div className="w-16 h-16 bg-black rounded-full border border-gray-600/50" />
            </div>

            {/* Wave 1 */}
            <div
                ref={wave1Ref}
                className={`absolute w-24 h-24 rounded-full transition-colors duration-1000 ease-out will-change-transform ${getWaveClasses()}`}
            />

            {/* Wave 2 */}
            <div
                ref={wave2Ref}
                className={`absolute w-24 h-24 rounded-full transition-colors duration-1000 ease-out will-change-transform ${getWaveClasses()}`}
            />

            {/* Wave 3 */}
            <div
                ref={wave3Ref}
                className={`absolute w-24 h-24 rounded-full transition-colors duration-1000 ease-out will-change-transform ${getWaveClasses()}`}
            />

            {/* Status Text (Holographic style) */}
            <div className="absolute -bottom-12 flex flex-col items-center">
                <span className={`text-xl font-bold tracking-widest uppercase transition-colors duration-1000 ease-out ${getTextClasses()}`}>
                    {name.replace('_', ' ')}
                </span>
                <span className={`text-xs tracking-wider uppercase mt-1 transition-colors duration-1000 ease-out ${getSubTextClasses()}`}>
                    {status}
                </span>
            </div>
        </div>
    );
}

export default React.memo(BrainNode);
