// Briefing cinematic (v1.0 §9.1), home/entry (§9.2) and lobby (§9.3).

import { useEffect, useState } from 'react';
import type { PublicView } from '../../shared/types';
import { TARGET_OPTIONS } from '../../shared/types';
import { RULES } from '../../engine/rules';
import { buzz, setSettings, sfx, unlock } from '../fx';
import { net } from '../net';
import { Receiver } from './Receiver';
import { CrewBoard } from './Results';
import { AdSlot, GuestRecord } from './Extras';

const BRIEFING: { who: 'sys' | 'op'; text: string }[] = [
  { who: 'sys', text: '▌ INCOMING TRANSMISSION · BRASSHOLLOW RELAY' },
  { who: 'op', text: '…is this thing on? Hello? Can anyone hear me?' },
  { who: 'op', text: 'Right. Good. Don’t panic. I’ve been awake for three days, so I’m doing the panicking for all of us.' },
  { who: 'op', text: 'Someone is broadcasting into Brasshollow. Encrypted. Every message hides a single word, and every word brings them closer.' },
  { who: 'op', text: 'The Receiver catches the signal. It can’t read it. That part is on you.' },
  { who: 'op', text: 'We’ve sent it to the best minds we could find. Yes. That means you.' },
  { who: 'sys', text: '▌ LEGEND STATUS: PENDING' },
];

export function Briefing({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (n >= BRIEFING.length) return;
    const t = setTimeout(() => setN(n + 1), n === 1 ? 1800 : 2600);
    return () => clearTimeout(t);
  }, [n]);
  const finish = () => {
    unlock();
    sfx.transmission();
    buzz('arrival');
    setSettings({ introSeen: true });
    onDone();
  };
  return (
    <div className="briefing" role="dialog" aria-label="Opening briefing">
      <button className="btn ghost skip" onClick={finish}>Skip ›</button>
      <div className="stack" style={{ justifyItems: 'center', gap: 28 }}>
        <div className="lines" aria-live="polite">
          {BRIEFING.slice(0, n).map((l, i) => (
            <p key={i} className={`line ${l.who}`}>
              {l.who === 'op' && <span className="muted">OPERATOR: </span>}
              {l.text}
              {i === n - 1 && n < BRIEFING.length && <span className="cursor">&nbsp;</span>}
            </p>
          ))}
        </div>
        <button className="btn primary" onClick={finish} style={{ opacity: n >= BRIEFING.length ? 1 : 0.6 }}>
          Accept the transmission
        </button>
      </div>
    </div>
  );
}

/** Spray-tag wordmark with RGB-split glitch and paint drips. */
export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={`logo-wrap ${small ? 'small' : ''}`}>
      <h1 className="logo glitch-text" data-text="HUNCH">HUNCH</h1>
      <svg className="drips" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M40 0 v18 a5 5 0 0 0 10 0 V0 Z M118 0 v34 a6 6 0 0 0 12 0 V0 Z M205 0 v12 a4 4 0 0 0 8 0 V0 Z M262 0 v44 a6 6 0 0 0 12 0 V0 Z M335 0 v22 a5 5 0 0 0 10 0 V0 Z" />
      </svg>
    </div>
  );
}

const NICK_KEY = 'hunch.nickname';
function savedNick(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Home({ onReplayIntro }: { onReplayIntro: () => void }) {
  const params = new URLSearchParams(location.search);
  const [nickname, setNickname] = useState(savedNick);
  const [code, setCode] = useState((params.get('room') ?? '').toUpperCase());
  const [invited, setInvited] = useState(code.length === 4);
  const remember = () => {
    unlock();
    try {
      localStorage.setItem(NICK_KEY, nickname.trim());
    } catch {
      /* ignore */
    }
  };
  const nickOk = nickname.trim().length > 0;
  const create = () => {
    remember();
    net.send({ t: 'create', nickname });
  };
  const join = () => {
    remember();
    net.send({ t: 'join', code, nickname });
  };

  return (
    <div className="home">
      <div className="stack" style={{ justifyItems: 'center', width: '100%' }}>
        <Receiver state="idle" size={150} />
        <Logo />
        <p className="tagline">Someone is broadcasting into the undercity. Same word for everyone. Probe it, crack it, and get to the target score before your crew does.</p>
        <div className="panel card stack">
          <label className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Your legend name</span>
            <input className="field" maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Vex" autoComplete="nickname" />
          </label>
          {invited ? (
            <>
              <button className="btn primary" disabled={!nickOk} onClick={join}>Join room {code}</button>
              <button className="btn ghost small" onClick={() => { setInvited(false); setCode(''); }}>Create my own room instead</button>
            </>
          ) : (
            <>
              <button className="btn primary" disabled={!nickOk} onClick={create}>Create a room</button>
              <div className="divider">OR JOIN</div>
              <form className="row" onSubmit={(e) => { e.preventDefault(); if (nickOk) join(); }}>
                <input
                  className="field mono" style={{ flex: 1, letterSpacing: '0.3em', textTransform: 'uppercase' }} maxLength={4}
                  value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="CODE" aria-label="Room code"
                />
                <button className="btn" type="submit" disabled={!nickOk || code.length !== 4}>Join</button>
              </form>
            </>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>No sign-up. Solo practice: create a room and start it alone.</p>
        </div>
        <GuestRecord />
        <button className="btn ghost small" onClick={onReplayIntro}>Replay briefing</button>
        <AdSlot slot="home-footer" size="banner" />
      </div>
    </div>
  );
}

export function Lobby({ pub, playerId }: { pub: PublicView; playerId: string }) {
  const me = pub.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const invite = `${location.origin}/?room=${pub.code}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const connected = pub.players.filter((p) => p.connected).length;

  return (
    <div className="lobby">
      <section className="panel stack">
        <span className="eyebrow">Room code</span>
        <div className="code" aria-label={`Room code ${pub.code.split('').join(' ')}`}>{pub.code}</div>
        <div className="row">
          <button className="btn rune small" onClick={copy}>{copied ? 'Copied ✓' : 'Copy invite link'}</button>
          <span className="muted mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{invite}</span>
        </div>
        <h2 style={{ marginTop: 10 }}>Legends · {pub.players.length}/8</h2>
        <ul className="roster">
          {pub.players.map((p) => (
            <li key={p.id} style={{ opacity: p.connected ? 1 : 0.5 }}>
              <span className="avatar">{p.nickname[0]?.toUpperCase()}</span>
              <span style={{ fontWeight: 700 }}>{p.nickname}{p.id === playerId && <span className="muted"> (you)</span>}</span>
              <span className="spacer" />
              {p.isHost && <span className="chip host">Host</span>}
              {!p.connected ? <span className="chip">Reconnecting…</span> : <span className={`chip ${p.ready ? 'solved' : ''}`}>{p.ready ? 'Ready' : 'Not ready'}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel stack">
        <h2>Match</h2>
        <div className="toggle">
          <span>
            First to
            <br />
            <span className="muted" style={{ fontSize: 13 }}>{isHost ? 'You set the finish line' : 'Set by the host'}</span>
          </span>
          <div className="seg" role="group" aria-label="Target score">
            {TARGET_OPTIONS.map((n) => (
              <button key={n} aria-pressed={pub.settings.targetScore === n} disabled={!isHost} onClick={() => net.send({ t: 'settings', settings: { targetScore: n } })}>
                {n >= 1000 ? `${n / 1000}k` : n}
              </button>
            ))}
          </div>
        </div>
        <div className="toggle">
          <span>
            Signal Collapse
            <br />
            <span className="muted" style={{ fontSize: 13 }}>First crack caps everyone else at 60 s</span>
          </span>
          <button className="switch" role="switch" aria-checked={pub.settings.collapse} aria-label="Signal Collapse" disabled={!isHost}
            onClick={() => net.send({ t: 'settings', settings: { collapse: !pub.settings.collapse } })} />
        </div>
        <ul className="muted" style={{ margin: '4px 0 8px', paddingLeft: 18, fontSize: 14 }}>
          <li>Same word for everyone. Every round goes deeper, and harder.</li>
          <li>3 probes open each round: your best link and one letter are revealed.</li>
          <li>{RULES.mainMs / 1000} s to crack it. Everyone sees everyone’s guesses.</li>
          <li>After {RULES.missesToUnlockClues} misses: {RULES.clueCosts.length} intel clues. The last only in the final {RULES.finalClueAtMs / 1000} s.</li>
          <li>First to {pub.settings.targetScore} points wins.</li>
        </ul>
        {isHost ? (
          <button className="btn primary" onClick={() => { unlock(); net.send({ t: 'start' }); }} disabled={connected === 0}>
            {connected === 1 ? 'Start solo practice' : `Start match · ${connected} legends`}
          </button>
        ) : (
          <button className={`btn ${me?.ready ? 'rune' : 'primary'}`} onClick={() => { unlock(); net.send({ t: 'ready', ready: !me?.ready }); }}>
            {me?.ready ? 'Ready ✓ (waiting for host)' : 'I’m ready'}
          </button>
        )}
        <button className="btn ghost small" onClick={() => net.send({ t: 'leave' })}>Leave room</button>
        <AdSlot slot="lobby-side" size="rect" />
      </section>
      {pub.board.length > 0 && <div style={{ gridColumn: '1 / -1' }}><CrewBoard board={pub.board} playerId={playerId} /></div>}
    </div>
  );
}
