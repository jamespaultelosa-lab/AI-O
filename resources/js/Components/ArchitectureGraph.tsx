import React, { useEffect, useRef, useState } from 'react';

interface NodeItem {
    id: string;
    name: string;
    category: 'Controller' | 'Service' | 'Model' | 'React' | 'Event' | 'Migration';
    path: string;
    methods?: string[];
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    targetX: number;
    targetY: number;
}

interface EdgeItem {
    source: string;
    target: string;
}

interface ArchitectureGraphProps {
    data: any;
    isLightMode?: boolean;
}

export default function ArchitectureGraph({ data, isLightMode }: ArchitectureGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredNode, setHoveredNode] = useState<NodeItem | null>(null);
    const [totalNodesCount, setTotalNodesCount] = useState(0);
    const nodesRef = useRef<NodeItem[]>([]);
    const edgesRef = useRef<EdgeItem[]>([]);
    const draggedNodeRef = useRef<NodeItem | null>(null);

    useEffect(() => {
        if (!data) return;

        const nodes: NodeItem[] = [];
        const edges: EdgeItem[] = [];

        const width = 900;
        const height = 600;
        const centerX = width / 2;
        const centerY = height / 2;

        // Cluster Centers matching Obsidian Graph View
        const clusters: Record<string, { cx: number, cy: number, color: string }> = {
            Controller: { cx: centerX - 220, cy: centerY - 40,  color: '#ef4444' }, // Red
            Service:    { cx: centerX + 180, cy: centerY + 100, color: '#eab308' }, // Yellow/Gold
            Model:      { cx: centerX + 100, cy: centerY - 160, color: '#06b6d4' }, // Cyan
            React:      { cx: centerX - 180, cy: centerY + 140, color: '#a855f7' }, // Purple
            Event:      { cx: centerX + 240, cy: centerY - 40,  color: '#22c55e' }, // Green
            Migration:  { cx: centerX - 40,  cy: centerY - 220, color: '#94a3b8' }  // Silver
        };

        const addCategoryNodes = (items: any[], category: any, clusterKey: string) => {
            (items || []).forEach((item: any, idx: number) => {
                const conf = clusters[clusterKey];
                const isHub = idx === 0 || item.name === 'PayrollController' || item.name === 'Payroll' || item.name === 'DeductionCalculationService';
                const radius = isHub ? 10 : 3.5 + Math.random() * 2.5;
                const angle = Math.random() * Math.PI * 2;
                const dist = isHub ? 0 : 20 + Math.random() * 140;
                const targetX = conf.cx + Math.cos(angle) * dist;
                const targetY = conf.cy + Math.sin(angle) * dist;

                nodes.push({
                    id: `${category}-${item.name || idx}-${idx}`,
                    name: item.name || `${category}_${idx}`,
                    category: category,
                    path: item.path,
                    methods: item.methods,
                    x: targetX + (Math.random() - 0.5) * 60,
                    y: targetY + (Math.random() - 0.5) * 60,
                    vx: 0,
                    vy: 0,
                    radius,
                    color: conf.color,
                    targetX,
                    targetY
                });
            });
        };

        addCategoryNodes(data.controllers, 'Controller', 'Controller');
        addCategoryNodes(data.services, 'Service', 'Service');
        addCategoryNodes(data.models, 'Model', 'Model');
        addCategoryNodes(data.react, 'React', 'React');
        addCategoryNodes(data.events, 'Event', 'Event');
        addCategoryNodes(data.migrations?.slice(0, 35), 'Migration', 'Migration'); // Limit migrations to keep layout crisp

        // High Density Constellation Edges
        nodes.forEach((n1, i) => {
            nodes.forEach((n2, j) => {
                if (i >= j) return;

                const dx = n1.targetX - n2.targetX;
                const dy = n1.targetY - n2.targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Intra-cluster dense mesh
                if (n1.category === n2.category && dist < 85) {
                    if (Math.random() > 0.55) {
                        edges.push({ source: n1.id, target: n2.id });
                    }
                } 
                // Inter-cluster connections
                else if (dist < 120 && Math.random() > 0.82) {
                    edges.push({ source: n1.id, target: n2.id });
                }
            });
        });

        nodesRef.current = nodes;
        edgesRef.current = edges;
        setTotalNodesCount(nodes.length);
    }, [data]);

    useEffect(() => {
        let animationFrameId: number;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            const nodes = nodesRef.current;
            const edges = edgesRef.current;

            // Smooth physics & drift
            nodes.forEach(n => {
                if (n === draggedNodeRef.current) return;

                const dx = n.targetX - n.x;
                const dy = n.targetY - n.y;
                n.vx += dx * 0.025;
                n.vy += dy * 0.025;

                // Ambient floating vibration
                n.vx += (Math.random() - 0.5) * 0.25;
                n.vy += (Math.random() - 0.5) * 0.25;

                n.vx *= 0.85;
                n.vy *= 0.85;

                n.x += n.vx;
                n.y += n.vy;
            });

            // Draw Edges
            edges.forEach(edge => {
                const s = nodes.find(n => n.id === edge.source);
                const t = nodes.find(n => n.id === edge.target);
                if (!s || !t) return;

                const isConnectedToHover = hoveredNode && (hoveredNode.id === s.id || hoveredNode.id === t.id);

                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);

                if (isConnectedToHover) {
                    ctx.strokeStyle = isLightMode ? '#6366f1' : '#a855f7';
                    ctx.lineWidth = 1.8;
                } else {
                    ctx.strokeStyle = isLightMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(255, 255, 255, 0.07)';
                    ctx.lineWidth = 0.5;
                }
                ctx.stroke();
            });

            // Draw Nodes
            nodes.forEach(node => {
                const isHovered = hoveredNode?.id === node.id;

                ctx.beginPath();
                ctx.arc(node.x, node.y, isHovered ? node.radius + 3 : node.radius, 0, Math.PI * 2);

                if (isHovered || node.radius > 7) {
                    ctx.shadowColor = node.color;
                    ctx.shadowBlur = isHovered ? 15 : 6;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = node.color;
                ctx.fill();

                if (isHovered) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [hoveredNode, isLightMode]);

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (draggedNodeRef.current) {
            draggedNodeRef.current.x = mouseX;
            draggedNodeRef.current.y = mouseY;
            draggedNodeRef.current.targetX = mouseX;
            draggedNodeRef.current.targetY = mouseY;
            return;
        }

        const found = nodesRef.current.find(n => {
            const dx = n.x - mouseX;
            const dy = n.y - mouseY;
            return Math.sqrt(dx * dx + dy * dy) <= n.radius + 5;
        });

        setHoveredNode(found || null);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (hoveredNode) {
            draggedNodeRef.current = hoveredNode;
        }
    };

    const handleMouseUp = () => {
        draggedNodeRef.current = null;
    };

    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            <canvas
                ref={canvasRef}
                width={900}
                height={580}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                className="cursor-crosshair w-full h-full max-w-[900px] max-h-[580px]"
            />

            {/* Total Node Count Badge */}
            <div className="absolute top-4 right-4 text-[10px] font-mono font-bold tracking-widest px-3 py-1 rounded bg-black/60 border border-purple-500/40 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                NODES ACTIVE: {totalNodesCount}
            </div>

            {/* HUD Tooltip overlay on hover */}
            {hoveredNode && (
                <div
                    className={`absolute bottom-6 left-6 p-3 rounded-lg border backdrop-blur-md transition-all duration-300 pointer-events-none z-50 ${
                        isLightMode
                            ? 'bg-white/90 border-slate-300 text-slate-800 shadow-lg'
                            : 'bg-black/80 border-cyan-500/50 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                    }`}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredNode.color }} />
                        <span className="font-bold text-xs uppercase tracking-wider font-mono">{hoveredNode.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded border border-white/20 uppercase font-mono">
                            {hoveredNode.category}
                        </span>
                    </div>
                    <div className="text-[10px] font-mono opacity-70 break-all max-w-sm mb-1">
                        {hoveredNode.path}
                    </div>
                    {hoveredNode.methods && hoveredNode.methods.length > 0 && (
                        <div className="text-[9px] text-cyan-400 font-mono">
                            Methods: {hoveredNode.methods.slice(0, 3).join(', ')}
                            {hoveredNode.methods.length > 3 && ` +${hoveredNode.methods.length - 3} more`}
                        </div>
                    )}
                </div>
            )}

            {/* Legend Overlay */}
            <div className="absolute top-4 left-4 flex flex-wrap gap-3 text-[9px] font-mono uppercase tracking-wider p-2 rounded bg-black/50 border border-white/10 backdrop-blur-sm pointer-events-none max-w-lg">
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                    <span className="text-red-400 font-bold">Controllers</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_6px_#eab308]" />
                    <span className="text-yellow-400 font-bold">Services</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4]" />
                    <span className="text-cyan-400 font-bold">Models</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_6px_#a855f7]" />
                    <span className="text-purple-400 font-bold">React</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
                    <span className="text-green-400 font-bold">Events</span>
                </div>
            </div>
        </div>
    );
}
