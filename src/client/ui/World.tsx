// Backdrop: undercity smog, a skyline of towers with flickering neon signs,
// neon rain with a puddle glow, and graffiti doodles scrawled around the edges. Windows light up
// as the leader closes in on the target; the whole skyline lights at victory.

import { useMemo } from 'react';
import { useSettings } from '../fx';
import { Rain } from './Rain';

export type Mood = 'calm' | 'urgent' | 'dead';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const SIGN_COLORS = ['#ff2d95', '#19f0ff', '#a855ff', '#ff2d95', '#19f0ff'];

/** Hand-scrawled marks: stars, arrows, zigzags, circles, crosses. */
function Doodles() {
  const pink = '#ff2d95';
  const cyan = '#19f0ff';
  const acid = '#c6ff3d';
  return (
    <div className="doodles" aria-hidden="true">
      <svg style={{ left: '3%', top: '12%', width: 70, height: 70, opacity: 0.55 }} viewBox="0 0 70 70">
        <path d="M35 4 L43 26 L66 27 L48 41 L55 64 L35 50 L15 64 L22 41 L4 27 L27 26 Z" stroke={pink} strokeWidth="3" />
      </svg>
      <svg className="wide" style={{ right: '4%', top: '18%', width: 120, height: 60, opacity: 0.5 }} viewBox="0 0 120 60">
        <path d="M4 40 C 30 10, 60 60, 90 22 L 110 12 M110 12 L 96 10 M110 12 L 104 26" stroke={cyan} strokeWidth="3" />
      </svg>
      <svg style={{ left: '5%', bottom: '30%', width: 110, height: 40, opacity: 0.45 }} viewBox="0 0 110 40">
        <polyline points="4,30 18,8 30,30 44,8 58,30 72,8 86,30 100,8" stroke={acid} strokeWidth="3" />
      </svg>
      <svg className="wide" style={{ right: '7%', bottom: '38%', width: 80, height: 80, opacity: 0.4 }} viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="30" stroke={pink} strokeWidth="3" />
        <circle cx="42" cy="38" r="22" stroke={pink} strokeWidth="2" />
        <path d="M22 22 L58 58 M58 22 L22 58" stroke={cyan} strokeWidth="3" />
      </svg>
      <svg className="wide" style={{ left: '44%', top: '3%', width: 60, height: 40, opacity: 0.35 }} viewBox="0 0 60 40">
        <path d="M6 20 L54 20 M30 4 L30 36 M12 8 L48 32 M48 8 L12 32" stroke={cyan} strokeWidth="2.5" />
      </svg>
      <svg style={{ right: '3%', top: '62%', width: 50, height: 50, opacity: 0.5 }} viewBox="0 0 50 50">
        <path d="M25 3 L30 19 L47 20 L33 30 L38 47 L25 37 L12 47 L17 30 L3 20 L20 19 Z" stroke={acid} strokeWidth="2.5" />
      </svg>
    </div>
  );
}

export function World({ mood = 'calm', lit = 0, allLit = false }: { mood?: Mood; lit?: number; allLit?: boolean }) {
  const { towers, windows, signs } = useMemo(() => {
    const r = rng(11);
    const towers: { x: number; w: number; h: number; spire: boolean }[] = [];
    const windows: { x: number; y: number; tower: number }[] = [];
    const signs: { x: number; y: number; w: number; h: number; c: string; b: boolean }[] = [];
    let x = 0;
    while (x < 1600) {
      const w = 40 + r() * 90;
      const h = 80 + r() * 220;
      towers.push({ x, w, h, spire: r() > 0.6 });
      const idx = towers.length - 1;
      for (let wy = 300 - h + 18; wy < 290; wy += 22) {
        for (let wx = x + 8; wx < x + w - 10; wx += 16) if (r() > 0.6) windows.push({ x: wx, y: wy, tower: idx });
      }
      if (r() > 0.55 && w > 60) {
        const vertical = r() > 0.5;
        signs.push({
          x: x + (vertical ? w * 0.7 : 6),
          y: 300 - h + 20 + r() * 40,
          w: vertical ? 8 : w - 12,
          h: vertical ? 50 + r() * 40 : 7,
          c: SIGN_COLORS[Math.floor(r() * SIGN_COLORS.length)],
          b: r() > 0.5,
        });
      }
      x += w + r() * 8;
    }
    return { towers, windows, signs };
  }, []);

  const litTowers = Math.round((Math.min(10, lit) / 10) * towers.length);
  const { reducedMotion } = useSettings();

  return (
    <>
      <div className="world" data-mood={mood} aria-hidden="true">
        <div className="smoke" />
        <div className="smoke b" />
        <svg className={`skyline ${allLit ? 'lit' : ''}`} viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice">
          <defs>
            <linearGradient id="tw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f1a1e" />
              <stop offset="1" stopColor="#040507" />
            </linearGradient>
          </defs>
          {towers.map((t, i) => (
            <g key={i}>
              <rect x={t.x} y={300 - t.h} width={t.w} height={t.h} fill="url(#tw)" />
              {t.spire && <rect x={t.x + t.w / 2 - 2} y={300 - t.h - 34} width="4" height="34" fill="#0f1a1e" />}
            </g>
          ))}
          {windows.map((w, i) => (
            <rect key={i} className={`win ${w.tower < litTowers ? 'on' : ''}`} x={w.x} y={w.y} width="6" height="9" />
          ))}
          {signs.map((s, i) => (
            <rect key={i} className={`sign ${s.b ? 'b' : ''}`} x={s.x} y={s.y} width={s.w} height={s.h} rx="2"
              fill={s.c} style={{ filter: `drop-shadow(0 0 6px ${s.c}) drop-shadow(0 0 14px ${s.c})` }} />
          ))}
        </svg>
        <div className="puddle" />
      </div>
      <Rain reduced={reducedMotion} heavy={mood === 'urgent'} />
      <Doodles />
      <div className="vignette" aria-hidden="true" />
    </>
  );
}
