// Guest record, the optional sign-in sheet, and reserved ad slots.

import { useEffect, useState } from 'react';
import { summarize, useProfile } from '../profile';

// -------------------------------------------------------------- ads
//
// Slots are reserved outside active play only (home, lobby, between rounds,
// spectating, final). They hold their size so nothing jumps when an ad loads.
// VITE_ADS: 'off' hides them; 'placeholder' (default) shows labelled empty
// space; 'live' is where an ad network's tag gets mounted (not wired yet).

export type AdSize = 'banner' | 'rect' | 'leaderboard';
const ADS = (import.meta.env.VITE_ADS as string | undefined) ?? 'placeholder';
const DIMS: Record<AdSize, [number, number]> = { banner: [320, 50], rect: [300, 250], leaderboard: [728, 90] };

export function AdSlot({ slot, size }: { slot: string; size: AdSize }) {
  if (ADS === 'off') return null;
  const [w, h] = DIMS[size];
  return (
    <aside className={`ad-slot ${size}`} data-ad-slot={slot} aria-label="Advertisement" style={{ maxWidth: w, height: h }}>
      <span className="ad-label">Ad</span>
      {ADS === 'placeholder' && <span className="ad-ph">{w}×{h} · {slot}</span>}
    </aside>
  );
}

// -------------------------------------------------------------- sign-in (optional)

export type AccountReason = 'save' | 'daily' | 'profile';

const WHY: Record<AccountReason, { title: string; body: string }> = {
  save: {
    title: 'Keep your record everywhere',
    body: 'Your games already save in this browser. A free account backs them up and follows you to your phone, laptop and anywhere else you play.',
  },
  daily: {
    title: 'Daily Career',
    body: 'One shared descent a day, the same words for everyone. Keep a streak, climb the global board and collect depth badges. Needs a free account so your streak can’t be lost.',
  },
  profile: {
    title: 'Claim your name',
    body: 'Reserve your legend name, show your stats on a public profile and add friends you play with.',
  },
};

export function AccountSheet({ reason, onClose }: { reason: AccountReason; onClose: () => void }) {
  const w = WHY[reason];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={w.title} onClick={onClose}>
      <div className="panel sheet stack" onClick={(e) => e.stopPropagation()}>
        <h2>{w.title}</h2>
        <p className="muted" style={{ margin: 0 }}>{w.body}</p>
        <button className="btn primary" disabled>Continue with Google</button>
        <button className="btn" disabled>Email me a sign-in link</button>
        <p className="note" style={{ textAlign: 'left', margin: 0 }}>
          Accounts aren’t live yet. Everything you play is still saved in this browser.
        </p>
        <button className="btn ghost small" onClick={onClose}>Keep playing as a guest</button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- guest record

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;

export function GuestRecord() {
  const profile = useProfile();
  const [sheet, setSheet] = useState<AccountReason | null>(null);
  const s = summarize(profile);
  return (
    <>
      <div className="panel card stack record">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="eyebrow">Your record · this browser</span>
          <button className="btn ghost small" onClick={() => setSheet('save')}>Save across devices</button>
        </div>
        {s.matches === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>No matches yet. Play one and it’s saved here, no sign-up needed.</p>
        ) : (
          <>
            <div className="record-grid">
              <div><b>{s.matches}</b><span>played</span></div>
              <div><b style={{ color: 'var(--acid)' }}>{s.wins}</b><span>wins</span></div>
              <div><b>{s.podiums}</b><span>podiums</span></div>
              <div><b style={{ color: 'var(--danger)' }}>{s.losses}</b><span>losses</span></div>
              <div><b>{s.crackRate}%</b><span>cracked</span></div>
              <div><b>{s.fastestMs !== null ? fmt(s.fastestMs) : '—'}</b><span>fastest</span></div>
            </div>
            <ul className="recent" aria-label="Recent matches">
              {profile.matches.slice(0, 8).map((m) => (
                <li key={m.id} className={m.place === 1 ? 'win' : m.loser ? 'loss' : ''} title={new Date(m.at).toLocaleString()}>
                  {m.place && m.place <= 3 ? ['', '1st', '2nd', '3rd'][m.place] : m.loser ? 'L' : `#${m.rank}`}
                  <small>{m.total.toLocaleString()}</small>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="btn rune" onClick={() => setSheet('daily')}>Daily Career · solo challenge</button>
      </div>
      {sheet && <AccountSheet reason={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
