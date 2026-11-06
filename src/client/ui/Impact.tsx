// Reward-only effects (spec v1.1 §E): ink impact frame with chalk scribbles
// and a marker word, plus a spark burst for Dead Air.

import { useEffect, useState } from 'react';

export type ImpactKind = 'strong' | 'weak' | 'crack' | 'blind' | 'dead';
export interface ImpactSpec {
  id: number;
  kind: ImpactKind;
  word: string;
}

const COLORS: Record<ImpactKind, string> = {
  strong: '#19f0ff',
  weak: '#ff8a2a',
  crack: '#19f0ff',
  blind: '#c6ff3d',
  dead: '#5b5870',
};
const PINK = '#ff2d95';

export function Impact({ spec }: { spec: ImpactSpec | null }) {
  const [shown, setShown] = useState<ImpactSpec | null>(null);
  useEffect(() => {
    if (!spec) return;
    setShown(spec);
    document.querySelector('.app')?.classList.remove('shake');
    if (spec.kind !== 'dead') requestAnimationFrame(() => document.querySelector('.app')?.classList.add('shake'));
    const t = setTimeout(() => setShown(null), 1700);
    return () => clearTimeout(t);
  }, [spec]);
  if (!shown) return null;

  const c = COLORS[shown.kind];
  if (shown.kind === 'dead') {
    return (
      <div className="impact sparks" key={shown.id} aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: '50%', top: '40%', ['--dx' as string]: `${(Math.random() - 0.5) * 260}px`, ['--dy' as string]: `${Math.random() * 200 - 40}px` }} />
        ))}
      </div>
    );
  }
  return (
    <div className={`impact ${shown.kind}`} key={shown.id} aria-hidden="true">
      <div className="flash" />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <path className="scrawl" d="M120 420 C 260 300, 420 520, 560 380 S 860 300, 900 460" stroke={c} strokeWidth="16" />
        <path className="scrawl" d="M160 600 C 300 680, 520 520, 700 640 S 880 700, 860 560" stroke={PINK} strokeWidth="9" style={{ animationDelay: '0.08s' }} />
        <path className="scrawl" d="M300 300 L 340 240 M 680 260 L 720 320 M 220 520 L 160 540 M 800 560 L 860 600" stroke="#eeedf5" strokeWidth="7" style={{ animationDelay: '0.15s' }} />
        {(shown.kind === 'crack' || shown.kind === 'blind') && (
          <>
            {[180, 300, 520, 640, 800].map((x, i) => (
              <rect key={x} className="drip" x={x} y={440 + (i % 2) * 30} width={10 + (i % 3) * 4} height={120 + i * 30} rx="6" fill={i % 2 ? PINK : c} style={{ animationDelay: `${0.1 + i * 0.05}s` }} />
            ))}
            <circle className="splat" cx="200" cy="250" r="70" fill={PINK} opacity="0.45" />
            <circle className="splat" cx="830" cy="720" r="95" fill={c} opacity="0.35" />
            <circle className="splat" cx="760" cy="190" r="34" fill={c} opacity="0.5" />
            <circle className="splat" cx="260" cy="760" r="26" fill="#eeedf5" opacity="0.4" />
          </>
        )}
      </svg>
      <div className="word">{shown.word}</div>
    </div>
  );
}

export function Banner({ text, tone, id }: { text: React.ReactNode; tone?: 'collapse'; id: number }) {
  return (
    <div className={`banner ${tone ?? ''}`} key={id} role="status">
      {text}
    </div>
  );
}
