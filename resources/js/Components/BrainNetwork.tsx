import React, { useEffect, useRef } from 'react';

const numParticles = 45;
const threshold = 40;

const BrainNetwork = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const particles = useRef<{x: number, y: number, vx: number, vy: number, r: number}[]>([]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        // Initialize particles in random locations
        particles.current = Array.from({ length: numParticles }).map(() => ({
            x: Math.random() * 200,
            y: Math.random() * 200,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            r: Math.random() * 1.5 + 0.5
        }));

        // Create DOM elements once to avoid React state re-renders (high performance)
        const circles = particles.current.map((p) => {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute("r", p.r.toString());
            c.setAttribute("fill", "currentColor");
            // No extra opacity class so circles are fully solid in color
            return c;
        });
        
        // Create a pool of lines for the connections
        const linesPool: SVGLineElement[] = [];
        const maxLines = 150;
        for (let i = 0; i < maxLines; i++) {
            const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
            l.setAttribute("stroke", "currentColor");
            l.setAttribute("stroke-width", "0.5");
            l.classList.add("opacity-60");
            linesPool.push(l);
        }

        svg.innerHTML = ''; // clear previous elements on strict mode re-mount
        linesPool.forEach(l => svg.appendChild(l));
        circles.forEach(c => svg.appendChild(c));

        let animationFrame: number;

        const render = () => {
            const pts = particles.current;
            
            // update positions and bounce off walls
            for (let i = 0; i < numParticles; i++) {
                const p = pts[i];
                p.x += p.vx;
                p.y += p.vy;
                
                // Keep within 200x200 viewBox
                if (p.x <= 0 || p.x >= 200) p.vx *= -1;
                if (p.y <= 0 || p.y >= 200) p.vy *= -1;
                
                circles[i].setAttribute("cx", p.x.toString());
                circles[i].setAttribute("cy", p.y.toString());
            }

            // draw lines based on proximity
            let lineIdx = 0;
            for (let i = 0; i < numParticles; i++) {
                for (let j = i + 1; j < numParticles; j++) {
                    const dx = pts[i].x - pts[j].x;
                    const dy = pts[i].y - pts[j].y;
                    
                    if (dx * dx + dy * dy < threshold * threshold) {
                        if (lineIdx < maxLines) {
                            const l = linesPool[lineIdx];
                            l.setAttribute("x1", pts[i].x.toString());
                            l.setAttribute("y1", pts[i].y.toString());
                            l.setAttribute("x2", pts[j].x.toString());
                            l.setAttribute("y2", pts[j].y.toString());
                            l.style.display = 'inline';
                            lineIdx++;
                        }
                    }
                }
            }
            
            // hide unused lines in the pool
            for (let i = lineIdx; i < maxLines; i++) {
                linesPool[i].style.display = 'none';
            }

            animationFrame = requestAnimationFrame(render);
        };

        render();

        return () => cancelAnimationFrame(animationFrame);
    }, []);

    return (
        <svg ref={svgRef} viewBox="0 0 200 200" className="w-full h-full text-current drop-shadow-lg" xmlns="http://www.w3.org/2000/svg" />
    );
};

export default React.memo(BrainNetwork);
