// Neon rain: slanted streaks falling past the skyline, catching pink and cyan
// light, with small splashes along the bottom. Canvas, so it stays cheap.
// Reduced motion draws a single still frame.

import { useEffect, useRef } from 'react';

const COLORS = ['255,45,149', '25,240,255', '238,237,245', '25,240,255', '168,85,255'];
const SLANT = 0.18; // horizontal drift per unit of fall

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  color: string;
  width: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
  color: string;
}

export function Rain({ reduced, heavy = false }: { reduced: boolean; heavy?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const heavyRef = useRef(heavy);
  heavyRef.current = heavy;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let drops: Drop[] = [];
    const splashes: Splash[] = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const spawn = (anywhere: boolean): Drop => {
      const near = Math.random();
      return {
        x: Math.random() * (w + h * SLANT) - h * SLANT,
        y: anywhere ? Math.random() * h : -40 - Math.random() * h * 0.3,
        len: 10 + near * 26,
        speed: 7 + near * 11,
        alpha: 0.08 + near * 0.32,
        width: near > 0.85 ? 1.6 : 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    };

    const resize = () => {
      // Mobile address bars change the height while scrolling; only rebuild on real resizes.
      if (drops.length && window.innerWidth === w && Math.abs(window.innerHeight - h) < 140) return;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const small = w < 700 || matchMedia('(pointer: coarse)').matches;
      const count = Math.round(Math.min(small ? 110 : 260, (w * h) / (small ? 9000 : 7000)));
      drops = Array.from({ length: count }, () => spawn(true));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (const d of drops) {
        const grad = ctx.createLinearGradient(d.x, d.y, d.x + d.len * SLANT, d.y + d.len);
        grad.addColorStop(0, `rgba(${d.color},0)`);
        grad.addColorStop(1, `rgba(${d.color},${d.alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * SLANT, d.y + d.len);
        ctx.stroke();
      }
      for (const s of splashes) {
        const t = s.age / 18;
        ctx.strokeStyle = `rgba(${s.color},${0.35 * (1 - t)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 2 + t * 10, 0.6 + t * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    let raf = 0;
    const step = () => {
      const boost = heavyRef.current ? 1.5 : 1;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.y += d.speed * boost;
        d.x += d.speed * boost * SLANT;
        if (d.y > h) {
          if (d.alpha > 0.25 && Math.random() < 0.5) splashes.push({ x: d.x, y: h - 4 - Math.random() * 30, age: 0, color: d.color });
          drops[i] = spawn(false);
        }
      }
      for (let i = splashes.length - 1; i >= 0; i--) if (++splashes[i].age > 18) splashes.splice(i, 1);
      draw();
      raf = requestAnimationFrame(step);
    };

    resize();
    window.addEventListener('resize', resize);
    if (reduced) draw();
    else raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduced]);

  return <canvas ref={ref} className="rain" aria-hidden="true" />;
}
