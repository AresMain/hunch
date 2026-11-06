// Round reveal (v1.0 §8.4, §9.5) and final results with awards (§8.5, §9.6).

import { useEffect, useRef, useState } from 'react';
import type { Breakdown, CrewRecord, FinalRow, PublicView, RoundTrail } from '../../shared/types';
import { DEPTH_NAMES } from '../../shared/types';
import { sfx } from '../fx';
import { net, useServerNow } from '../net';
import { cardData, cardText, renderCard, shareCard } from '../share';
import { recordMatch } from '../profile';
import { AdSlot } from './Extras';
import { FragmentLine } from './Game';

function BreakdownTally({ b, blind }: { b: Breakdown; blind: boolean }) {
  const lines: [string, number][] = [
    ['Crack', b.solve],
    ['Blind Hunch', b.blindHunch],
    ['Probe link', b.probe],
    ['Speed', b.speed],
    ['First crack', b.firstCrack],
    ['Intel', b.clues],
  ].filter(([, v]) => v !== 0) as [string, number][];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown > lines.length) return;
    const t = setTimeout(() => {
      if (shown < lines.length) sfx.tally(shown);
      setShown(shown + 1);
    }, shown === 0 ? 500 : 280);
    return () => clearTimeout(t);
  }, [shown, lines.length]);
  return (
    <ul className="breakdown" aria-label="Your round score">
      {lines.length === 0 && <li><span>No signal this round</span><b>0</b></li>}
      {lines.slice(0, shown).map(([k, v]) => (
        <li key={k} className={v < 0 ? 'neg' : 'pos'}>
          <span>{k}{k === 'Blind Hunch' && blind ? ' ✦' : ''}</span>
          <b>{v > 0 ? `+${v}` : v}</b>
        </li>
      ))}
      {shown > lines.length && <li className="total"><span>Round</span><b>{b.total}</b></li>}
    </ul>
  );
}

export function Reveal({ pub, playerId, prevRanks }: { pub: PublicView; playerId: string; prevRanks: Map<string, number> }) {
  const now = useServerNow(4);
  const r = pub.reveal!;
  const mine = r.players.find((p) => p.id === playerId);
  const byId = new Map(pub.players.map((p) => [p.id, p]));
  const ranked = [...pub.players].sort((a, b) => b.totalScore - a.totalScore);
  const next = pub.phaseEndsAt ? Math.max(0, Math.ceil((pub.phaseEndsAt - now) / 1000)) : 0;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="panel center">
        <span className="eyebrow">Depth {pub.depth} · {pub.depth ? DEPTH_NAMES[pub.depth] : ''} decoded · {r.category}</span>
        <div className="answer painted glitch-text" data-text={r.answer}>{r.answer}</div>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>{r.definition}</p>
        {mine && (
          <>
            <span className={`chip ${mine.solved ? 'solved' : 'timed_out'}`}>
              {mine.blindHunch ? 'Blind Hunch' : mine.solved ? `Cracked in ${((mine.solveMs ?? 0) / 1000).toFixed(1)}s` : 'Signal lost'}
              {mine.cluesUsed > 0 ? ` · ${mine.cluesUsed} intel` : ''}
            </span>
            <BreakdownTally b={mine.breakdown} blind={mine.blindHunch} />
          </>
        )}
      </section>

      <section className="panel stack">
        <h2>Crew fragments</h2>
        <table className="standings">
          <thead>
            <tr><th>Legend</th><th className="frag">Fragment</th><th style={{ textAlign: 'right' }}>Round</th><th style={{ textAlign: 'right' }}>Total</th></tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => {
              const rp = r.players.find((x) => x.id === p.id);
              const prev = prevRanks.get(p.id);
              const move = prev ? prev - (i + 1) : 0;
              return (
                <tr key={p.id} className={p.id === playerId ? 'me' : ''}>
                  <td>
                    <b>{i + 1}.</b> {byId.get(p.id)?.nickname}{' '}
                    {move !== 0 && <span className={`move ${move > 0 ? 'up' : 'down'}`}>{move > 0 ? `▲${move}` : `▼${-move}`}</span>}
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>
                      {rp?.blindHunch ? 'Blind Hunch ✦' : rp?.solved ? `cracked ${((rp.solveMs ?? 0) / 1000).toFixed(1)}s` : 'lost signal'}
                      {rp && rp.cluesUsed > 0 ? ` · ${rp.cluesUsed} intel` : ''}
                    </span>
                  </td>
                  <td className="frag" style={{ fontSize: 13 }}>{rp?.fragment && <FragmentLine fragment={rp.fragment} />}</td>
                  <td className="num">{rp?.breakdown.total ?? 0}</td>
                  <td className="num" style={{ color: 'var(--brass-hi)' }}>{p.totalScore}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="eyebrow" style={{ textAlign: 'center' }}>
          {(() => {
            const placed = pub.players.filter((p) => p.place !== null).sort((a, b) => a.place! - b.place!);
            if (pub.placesLeft === 0 || pub.round >= pub.totalRounds || placed.length === pub.players.length) return `Podium decided. Final results in ${next}`;
            if (placed.length === 0) return `Descending deeper in ${next}`;
            const nextPlace = ['', '1st', '2nd', '3rd'][placed.length + 1] ?? 'the last spot';
            return `${placed.map((p) => `${p.nickname} ${['', '1st', '2nd', '3rd'][p.place!]}`).join(' · ')}. The fight for ${nextPlace} goes on in ${next}`;
          })()}
        </p>
      </section>
      <AdSlot slot="between-rounds" size="banner" />
    </div>
  );
}

// -------------------------------------------------------------- final

interface Award {
  title: string;
  who: string;
  why: string;
}

function computeAwards(trails: RoundTrail[], names: Map<string, string>): Award[] {
  const all = trails.flatMap((t) => t.players.filter((p) => p.played).map((p) => ({ ...p, depth: t.depth })));
  if (all.length === 0) return [];
  const name = (id: string) => names.get(id) ?? 'Departed legend';
  const awards: Award[] = [];
  const count = (pred: (r: (typeof all)[number]) => boolean) => {
    const c = new Map<string, number>();
    for (const r of all) if (pred(r)) c.set(r.id, (c.get(r.id) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0];
  };
  const fastest = all.filter((r) => r.solved && !r.blindHunch && r.solveMs !== null).sort((a, b) => a.solveMs! - b.solveMs!)[0];
  if (fastest) awards.push({ title: 'Fastest Mind', who: name(fastest.id), why: `Cracked one in ${(fastest.solveMs! / 1000).toFixed(1)}s` });
  const blind = count((r) => r.blindHunch);
  if (blind) awards.push({ title: 'Blind Hunch', who: name(blind[0]), why: `${blind[1]} word${blind[1] > 1 ? 's' : ''} cracked on a probe` });
  const clean = count((r) => r.solved && r.cluesUsed === 0);
  if (clean) awards.push({ title: 'Clean Signal', who: name(clean[0]), why: `${clean[1]} crack${clean[1] > 1 ? 's' : ''} with zero intel` });
  const abyss = count((r) => r.solved && r.depth >= 4);
  if (abyss) awards.push({ title: 'Deep Diver', who: name(abyss[0]), why: `${abyss[1]} crack${abyss[1] > 1 ? 's' : ''} in the deep end` });
  const spammer = [...all].sort((a, b) => b.guesses.length - a.guesses.length)[0];
  if (spammer && spammer.guesses.length >= 8) awards.push({ title: 'Spray & Pray', who: name(spammer.id), why: `${spammer.guesses.length} guesses in one round` });
  return awards;
}

const fmtT = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** One player's full trail: every word they faced, every guess in order, with timings. */
function Trail({ trails, playerId }: { trails: RoundTrail[]; playerId: string }) {
  return (
    <ol className="trail">
      {trails.map((t) => {
        const me = t.players.find((p) => p.id === playerId);
        if (!me) return null;
        const outcome = !me.played
          ? 'sat out · already on the podium'
          : me.blindHunch
            ? 'blind hunch'
            : me.solved
              ? `cracked at ${fmtT(me.solveMs ?? 0)}`
              : 'lost signal';
        return (
          <li key={t.round}>
            <div className="trail-head">
              <span className="depth"><b>D{t.depth}</b> {t.answer.toUpperCase()}</span>
              <span className={`chip ${me.solved ? 'solved' : me.played ? 'timed_out' : ''}`}>{outcome}</span>
              {me.cluesUsed > 0 && <span className="chip">{me.cluesUsed} intel</span>}
              <span className="spacer" />
              <b className="mono">+{me.total}</b>
            </div>
            {me.guesses.length > 0 && (
              <ul className="feed">
                {me.guesses.map((g, i) => (
                  <li key={i} className={g.result} title={g.phase === 'probe' ? 'probe' : fmtT(g.t)}>
                    {g.phase === 'probe' ? '◆' : ''}{g.word}
                    <small>{g.phase === 'probe' ? ' probe' : ` ${fmtT(g.t)}`}</small>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function CrewBoard({ board, playerId }: { board: CrewRecord[]; playerId: string }) {
  if (board.length === 0) return null;
  return (
    <section className="panel stack">
      <h2>Crew record</h2>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Every match this crew has played in this room.</p>
      <table className="standings">
        <thead>
          <tr><th>Legend</th><th style={{ textAlign: 'right' }}>Wins</th><th style={{ textAlign: 'right' }}>Podiums</th><th style={{ textAlign: 'right' }}>Losses</th><th style={{ textAlign: 'right' }}>Points</th></tr>
        </thead>
        <tbody>
          {board.map((b, i) => (
            <tr key={b.id} className={b.id === playerId ? 'me' : ''}>
              <td><b>{i + 1}.</b> {b.nickname} <span className="muted" style={{ fontSize: 12 }}>· {b.matches} played</span></td>
              <td className="num" style={{ color: 'var(--acid)' }}>{b.wins}</td>
              <td className="num">{b.podiums}</td>
              <td className="num" style={{ color: 'var(--danger)' }}>{b.losses}</td>
              <td className="num">{b.points.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ShareCard({ pub, playerId, name }: { pub: PublicView; playerId: string; name: string }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const data = cardData(pub, playerId, name);
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);
  if (!data) return null;
  const text = cardText(data, location.origin);
  const make = async () => {
    setStatus('Painting your card…');
    const blob = await renderCard(data);
    setImg({ url: URL.createObjectURL(blob), blob });
    setStatus(null);
  };
  const share = async () => {
    if (!img) return;
    const r = await shareCard(img.blob, text, `hunch-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
    setStatus(r === 'shared' ? 'Sent.' : r === 'saved' ? 'Card saved and caption copied. Drop it in any chat or story.' : null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Caption copied.');
    } catch {
      setStatus('Could not copy.');
    }
  };
  return (
    <section className="panel stack share">
      <h2>Your card</h2>
      {img ? (
        <img src={img.url} alt={`HUNCH stats card for ${name}`} className="card-preview" />
      ) : (
        <p className="muted" style={{ margin: 0 }}>A poster of your run for stories, feeds and DMs.</p>
      )}
      <div className="row">
        {img ? (
          <button className="btn primary" onClick={share}>Share card</button>
        ) : (
          <button className="btn primary" onClick={make}>Make my card</button>
        )}
        <button className="btn small" onClick={copy}>Copy caption</button>
      </div>
      {status && <p className="note good" style={{ textAlign: 'left' }}>{status}</p>}
    </section>
  );
}

const MEDAL = ['', '1ST', '2ND', '3RD'];

export function Final({ pub, playerId }: { pub: PublicView; playerId: string }) {
  const names = new Map(pub.players.map((p) => [p.id, p.nickname]));
  for (const b of pub.board) if (!names.has(b.id)) names.set(b.id, b.nickname);
  const name = (id: string) => names.get(id) ?? 'Departed legend';
  const isHost = pub.players.find((p) => p.id === playerId)?.isHost;
  const final = pub.final ?? [];
  const trails = pub.trails ?? [];
  const podium = final.filter((f) => f.place !== null && f.place <= 3);
  const losers = final.filter((f) => f.loser);
  const winner = final.find((f) => f.place === 1);
  const mine = final.find((f) => f.playerId === playerId);
  const [open, setOpen] = useState<string | null>(null);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    sfx.victory();
    recordMatch(pub, playerId);
  }, []);
  const awards = computeAwards(trails, names);
  const solvedOf = (id: string) => trails.filter((t) => t.players.some((p) => p.id === id && p.solved)).length;
  // Podium order on screen: 2nd, 1st, 3rd.
  const stage = [2, 1, 3].map((pl) => podium.find((f) => f.place === pl)).filter(Boolean) as FinalRow[];

  return (
    <div className="stack" style={{ gap: 22 }}>
      <section className="panel center">
        <span className="eyebrow">Race to {pub.targetScore.toLocaleString()} · over</span>
        {mine && (
          <div className={`verdict ${mine.loser ? 'lose' : ''}`}>
            {mine.loser ? 'LOSER' : mine.place && mine.place <= 3 ? `YOU TOOK ${MEDAL[mine.place]}` : `#${mine.rank}`}
          </div>
        )}
        <div className="podium">
          {stage.map((f) => (
            <div key={f.playerId} className={`step p${f.place}`}>
              <span className="who">{name(f.playerId)}</span>
              <span className="pts">{f.total.toLocaleString()}</span>
              <div className="block"><span className="medal">{MEDAL[f.place!]}</span></div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {winner
            ? winner.total >= pub.targetScore
              ? `${name(winner.playerId)} broke ${pub.targetScore.toLocaleString()} first. The rest fought for the scraps.`
              : 'The transmissions ran dry. Highest scores take the podium.'
            : 'Dead heat at the top.'}
        </p>
        {losers.length > 0 && (
          <div className="losers">
            {losers.map((f) => (
              <span key={f.playerId} className="loser-tag">{name(f.playerId)} <b>LOSER</b></span>
            ))}
          </div>
        )}
      </section>

      <div className="final-grid">
        <section className="panel stack">
          <h2>Standings</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Tap a name to replay their trail, word by word.</p>
          <ul className="standings-list">
            {final.map((f) => {
              const max = Math.max(1, ...f.history);
              const isOpen = open === f.playerId;
              return (
                <li key={f.playerId} className={`${f.playerId === playerId ? 'me' : ''} ${f.loser ? 'lost' : ''}`}>
                  <button className="row-btn" onClick={() => setOpen(isOpen ? null : f.playerId)} aria-expanded={isOpen}>
                    <b className="rank">{f.place && f.place <= 3 ? MEDAL[f.place] : `#${f.rank}`}</b>
                    <span className="nm">{name(f.playerId)}{f.loser && <span className="loser-mini">LOSER</span>}</span>
                    <span className="history" aria-hidden="true">
                      {f.history.map((h, i) => <i key={i} style={{ height: `${(h / max) * 100}%` }} />)}
                    </span>
                    <span className="mono muted">{solvedOf(f.playerId)} cracked</span>
                    <b className="tot">{f.total.toLocaleString()}</b>
                    <span className="chev" aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                  </button>
                  {isOpen && <Trail trails={trails} playerId={f.playerId} />}
                </li>
              );
            })}
          </ul>
        </section>
        {mine && <ShareCard pub={pub} playerId={playerId} name={name(playerId)} />}
      </div>

      {awards.length > 0 && (
        <section className="panel stack">
          <h2>Commendations</h2>
          <div className="awards">
            {awards.map((a) => (
              <div className="award" key={a.title}>
                <div className="t">{a.title}</div>
                <b>{a.who}</b>
                <div className="muted" style={{ fontSize: 14 }}>{a.why}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AdSlot slot="final" size="rect" />

      <CrewBoard board={pub.board} playerId={playerId} />

      <div className="row" style={{ justifyContent: 'center' }}>
        {isHost ? (
          <button className="btn primary" onClick={() => net.send({ t: 'rematch' })}>Rematch · same crew</button>
        ) : (
          <span className="muted">Waiting for the host to call a rematch…</span>
        )}
        <button className="btn ghost" onClick={() => net.send({ t: 'leave' })}>Leave</button>
      </div>
    </div>
  );
}
