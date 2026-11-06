import { useEffect, useRef, useState } from 'react';
import type { RevealPlayer } from '../shared/types';
import { buzz, music, setSettings, sfx, unlock, useSettings } from './fx';
import { net, useNet, useServerNow } from './net';
import { Briefing, Home, Lobby } from './ui/Entry';
import { Game } from './ui/Game';
import { Banner, Impact, type ImpactSpec } from './ui/Impact';
import { Final, Reveal } from './ui/Results';
import { World, type Mood } from './ui/World';

let fxId = 0;

/** Brief whole-screen RGB tear. Skipped under reduced motion. */
export function glitchScreen(): void {
  if (document.documentElement.dataset.motion === 'reduced') return;
  document.body.dataset.glitch = '1';
  setTimeout(() => delete document.body.dataset.glitch, 240);
}

function SettingsMenu({ onClose, onReplay, inRoom }: { onClose: () => void; onReplay: () => void; inRoom: boolean }) {
  const s = useSettings();
  const row = (label: string, key: 'sound' | 'music' | 'haptics' | 'reducedMotion') => (
    <div className="toggle">
      <span>{label}</span>
      <button className="switch" role="switch" aria-checked={s[key]} aria-label={label} onClick={() => setSettings({ [key]: !s[key] })} />
    </div>
  );
  return (
    <div className="panel settings-pop" role="dialog" aria-label="Settings">
      {row('Sound', 'sound')}
      {row('Music', 'music')}
      {row('Haptics', 'haptics')}
      {row('Reduced motion', 'reducedMotion')}
      {inRoom && (
        <button
          className="btn small"
          style={{ width: '100%', marginTop: 8, borderColor: 'var(--danger)', color: 'var(--danger)' }}
          onClick={() => {
            if (confirm('Leave this room? In a live match you forfeit and count as a loser.')) {
              net.send({ t: 'leave' });
              onClose();
            }
          }}
        >
          Leave room
        </button>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={onReplay}>Replay briefing</button>
        <span className="spacer" />
        <button className="btn small ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export function App() {
  const { connected, displaced, playerId, pub, me, error } = useNet();
  const settings = useSettings();
  const now = useServerNow(4);
  const [briefing, setBriefing] = useState(!settings.introSeen);
  const [menu, setMenu] = useState(false);
  const [impact, setImpact] = useState<ImpactSpec | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: React.ReactNode; tone?: 'collapse' } | null>(null);
  const rounds = useRef(new Map<number, RevealPlayer[]>());
  const ranks = useRef(new Map<string, number>());
  const prevRanks = useRef(new Map<string, number>());
  const prev = useRef<{ phase: string | null; status: string | null; round: number }>({ phase: null, status: null, round: 0 });

  const fire = (kind: ImpactSpec['kind'], word: string) => setImpact({ id: ++fxId, kind, word });

  // Leaving a room clears the invite param so Home shows create/join again.
  const hadRoom = useRef(false);
  useEffect(() => {
    if (pub) hadRoom.current = true;
    else if (hadRoom.current) {
      hadRoom.current = false;
      history.replaceState(null, '', '/');
    }
  }, [pub]);

  // Phase / status transitions → feedback.
  useEffect(() => {
    const phase = pub?.phase ?? null;
    const status = me?.status ?? null;
    const p = prev.current;
    if (phase !== p.phase || (pub && pub.round !== p.round)) {
      if (phase === 'intro') {
        sfx.transmission();
        buzz('arrival');
      }
      if (phase === 'fragment' && me && status !== 'solved') {
        if (me.letters.some(Boolean)) setTimeout(sfx.letter, 700);
        const f = me.fragment;
        if (f?.kind === 'link') {
          fire(f.tier, 'LINKED');
          f.tier === 'strong' ? sfx.strongLink() : sfx.weakLink();
          buzz(f.tier === 'strong' ? 'strong' : 'medium');
        } else {
          fire('dead', '');
          sfx.deadAir();
          buzz('double');
        }
      }
      if (phase === 'reveal' && pub?.reveal) {
        prevRanks.current = new Map(ranks.current);
        rounds.current.set(pub.round, pub.reveal.players);
        sfx.reveal();
      }
      if (phase === 'lobby') rounds.current.clear();
    }
    if (status === 'timed_out' && p.status === 'active') {
      sfx.timeout();
      buzz('descending');
    }
    if (pub && phase !== 'reveal') {
      ranks.current = new Map([...pub.players].sort((a, b) => b.totalScore - a.totalScore).map((pl, i) => [pl.id, i + 1]));
    }
    prev.current = { phase, status, round: pub?.round ?? 0 };
  }, [pub, me]);

  // Keep the phone awake during a match: a screen that dims and locks drops the connection.
  const inMatch = !!pub && pub.phase !== 'lobby' && pub.phase !== 'complete';
  useEffect(() => {
    if (!inMatch || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible' && !cancelled) lock = await navigator.wakeLock.request('screen');
      } catch {
        /* denied or unsupported (low battery, iOS < 16.4) */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible); // the lock is dropped whenever the tab hides
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [inMatch]);

  // Mobile browsers suspend audio in the background; the next tap wakes it.
  useEffect(() => {
    const onTap = () => unlock();
    document.addEventListener('pointerdown', onTap, { passive: true });
    return () => document.removeEventListener('pointerdown', onTap);
  }, []);

  // Each new screen starts at the top (phones otherwise keep the old scroll position).
  const screenKey = `${pub?.code ?? ''}:${pub?.phase ?? 'home'}:${pub?.round ?? 0}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screenKey]);

  // Ambient glitch: a short tear every 7–16 s.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        glitchScreen();
        loop();
      }, 7000 + Math.random() * 9000);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Own action feedback with full-screen moments.
  useEffect(
    () =>
      net.onFeedback((_, fb) => {
        if (fb.kind === 'static') glitchScreen();
        else if (fb.kind === 'correct') {
          fire('crack', 'CRACKED!');
          sfx.crack();
          buzz('success');
        } else if (fb.kind === 'blind_hunch') {
          fire('blind', 'BLIND HUNCH!');
          sfx.blindHunch();
          buzz('celebrate');
        }
      }),
    [],
  );

  // Room events → banners.
  useEffect(
    () =>
      net.onEvent((e) => {
        if (e.kind === 'crack' && e.playerId !== net.state.playerId) {
          const t = e.blindHunch ? 'on a probe' : `${(e.elapsedMs / 1000).toFixed(1)}s`;
          setBanner({ id: ++fxId, text: <>⚡ <b>{e.nickname}</b> CRACKED IT · {t}</> });
          sfx.rivalCrack();
          buzz('tap');
        } else if (e.kind === 'place') {
          const ord = ['', '1ST', '2ND', '3RD'][e.place] ?? `#${e.place}`;
          const mine = e.playerId === net.state.playerId;
          const rest = e.placesLeft > 0 ? ` · fight for ${['', '1st', '2nd', '3rd'][e.place + 1] ?? 'the rest'} goes on` : ' · podium sealed';
          setTimeout(() => {
            if (mine) {
              fire('blind', `${ord}!`);
              sfx.victory();
              buzz('celebrate');
            } else {
              sfx.rivalCrack();
              buzz('strong');
            }
            setBanner({ id: ++fxId, text: <>🏆 <b>{mine ? 'YOU' : e.nickname}</b> TAKE{mine ? '' : 'S'} {ord}{rest}</> });
          }, 900);
        } else if (e.kind === 'collapse' && net.state.me?.status === 'active') {
          setTimeout(() => {
            setBanner({ id: ++fxId, text: <><b>SIGNAL COLLAPSE</b> · 60 s left at most</>, tone: 'collapse' });
            sfx.collapse();
            buzz('strong');
          }, 1400);
        }
      }),
    [],
  );

  // Adaptive music: one layer per stage of the match.
  useEffect(() => {
    const phase = pub?.phase;
    if (!pub || !phase || phase === 'lobby' || phase === 'complete') return music.stop();
    music.setLayers(pub.depth ?? 1);
  }, [pub?.phase, pub?.depth, settings.music, settings.sound]);

  let mood: Mood = 'calm';
  if (me?.status === 'active' && me.deadline && me.deadline - now <= 15_000) mood = 'urgent';
  if (me?.status === 'timed_out') mood = 'dead';
  // The city lights up as the leader closes in on the target.
  const lit = pub && pub.phase !== 'lobby' ? (Math.max(0, ...pub.players.map((p) => p.totalScore)) / pub.targetScore) * 10 : 0;

  let screen: React.ReactNode;
  if (displaced)
    screen = (
      <div className="home">
        <div className="panel card stack center">
          <h2>Playing in another tab</h2>
          <p className="muted" style={{ margin: 0 }}>HUNCH is open in another tab of this browser, and that tab has your seat.</p>
          <button className="btn primary" onClick={() => net.reclaim()}>Play here instead</button>
        </div>
      </div>
    );
  else if (!connected && !pub) screen = <div className="home"><p className="eyebrow">Tuning the Receiver…</p></div>;
  else if (!pub || !playerId) screen = <Home onReplayIntro={() => setBriefing(true)} />;
  else if (pub.phase === 'lobby') screen = <Lobby pub={pub} playerId={playerId} />;
  else if (pub.phase === 'reveal') screen = <Reveal pub={pub} playerId={playerId} prevRanks={prevRanks.current} />;
  else if (pub.phase === 'complete') screen = <Final pub={pub} playerId={playerId} />;
  else if (me) screen = <Game pub={pub} me={me} playerId={playerId} />;
  else screen = <div className="panel center"><p>Spectating this transmission…</p></div>;

  return (
    <>
      <World mood={mood} lit={lit} allLit={pub?.phase === 'complete'} />
      <div className="app">
        {pub && (
          <div className="topbar">
            <span className="brand">HUNCH</span>
            <span className="chip">Room {pub.code}</span>
            {!connected && <span className="chip timed_out">Reconnecting…</span>}
            <span className="spacer" />
            <button className="btn small ghost" onClick={() => setMenu(!menu)} aria-expanded={menu}>⚙ Settings</button>
          </div>
        )}
        {!pub && (
          <div className="topbar" style={{ position: 'absolute', right: 16, top: 16 }}>
            <button className="btn small ghost" onClick={() => setMenu(!menu)} aria-expanded={menu}>⚙</button>
          </div>
        )}
        {screen}
      </div>
      {menu && <SettingsMenu inRoom={!!pub} onClose={() => setMenu(false)} onReplay={() => { setMenu(false); setBriefing(true); }} />}
      {pub && !connected && !displaced && (
        <div className="netbar" role="status">Signal lost · reconnecting… your timer keeps running</div>
      )}
      <Impact spec={impact} />
      {banner && <Banner id={banner.id} text={banner.text} tone={banner.tone} />}
      {error && (
        <div className="toast" role="alert" onClick={() => net.clearError()}>
          {error}
        </div>
      )}
      {briefing && <Briefing onDone={() => setBriefing(false)} />}
    </>
  );
}
