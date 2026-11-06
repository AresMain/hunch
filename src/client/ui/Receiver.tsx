// The Receiver: a gunmetal relay rig wrapped in neon tubing, with three probe
// slots, a central sigil that ignites on links, and a beam that fires on a crack.

export type ReceiverState = 'idle' | 'probe' | 'strong' | 'weak' | 'dead' | 'crack' | 'timeout';

export function Receiver({ state, probes = 0, size }: { state: ReceiverState; probes?: number; size?: number }) {
  const teeth = (r: number, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const x = 150 + Math.cos(a) * r;
      const y = 150 + Math.sin(a) * r;
      return <rect key={i} x={x - 4} y={y - 4} width="8" height="8" transform={`rotate(${(a * 180) / Math.PI} ${x} ${y})`} />;
    });

  return (
    <svg className="receiver" data-state={state} viewBox="0 0 300 330" style={size ? { width: size } : undefined} role="img" aria-label={`Receiver: ${state}`}>
      <defs>
        <radialGradient id="rc-glow">
          <stop offset="0" stopColor="#19f0ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#19f0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rc-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a4f5e" />
          <stop offset="0.5" stopColor="#23262f" />
          <stop offset="1" stopColor="#0e1015" />
        </linearGradient>
        <linearGradient id="rc-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#19f0ff" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#ff2d95" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ff2d95" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect className="beam" x="136" y="-400" width="28" height="550" fill="url(#rc-beam)" />
      {(state === 'strong' || state === 'crack') && <circle cx="150" cy="150" r="140" fill="url(#rc-glow)" />}

      {/* rig legs with hazard tape */}
      <path d="M110 330 L135 230 L165 230 L190 330" fill="none" stroke="url(#rc-metal)" strokeWidth="7" />
      <path d="M121 300 L179 300" stroke="#c6ff3d" strokeWidth="4" strokeDasharray="6 6" opacity="0.7" />
      <path d="M128 270 L172 270" stroke="#2c2f3a" strokeWidth="3" />

      <g className="gear" fill="#2a2d38">
        <circle cx="150" cy="150" r="108" fill="none" stroke="#2a2d38" strokeWidth="5" />
        {teeth(112, 36)}
      </g>
      <g className="gear rev" fill="#1c1e26">
        <circle cx="150" cy="150" r="84" fill="none" stroke="#3a3f4d" strokeWidth="2" strokeDasharray="6 8" />
        {teeth(80, 24)}
      </g>

      <circle cx="150" cy="150" r="68" fill="#07080d" stroke="url(#rc-metal)" strokeWidth="6" />
      <circle className="tube" cx="150" cy="150" r="61" fill="none" strokeWidth="2.5" />
      <g className="sigil" fill="none" strokeWidth="2.5">
        <circle cx="150" cy="150" r="48" strokeDasharray="70 8 20 8" />
        <path d="M150 100 L176 150 L150 200 L124 150 Z" />
        <path d="M100 150 H124 M176 150 H200" />
        <path d="M118 118 A45 45 0 0 1 182 118 M118 182 A45 45 0 0 0 182 182" strokeDasharray="4 5" />
        <circle cx="150" cy="150" r="16" />
      </g>
      <circle className="core" cx="150" cy="150" r="8" fill="#2a2433" />

      {[0, 1, 2].map((i) => {
        const a = (-90 + (i - 1) * 50) * (Math.PI / 180);
        return <circle key={i} className={`slot ${i < probes ? 'on' : ''}`} cx={150 + Math.cos(a) * 128} cy={150 + Math.sin(a) * 128} r="10" />;
      })}
    </svg>
  );
}
