// In-round screens: transmission intro, probe phase, fragment reveal and the
// main decoding phase (v1.0 §9.4 + v1.1 §A, §B). The server decides
// everything; this file only renders state and plays feedback.

import { useEffect, useRef, useState } from 'react';
import type { ActionFeedback, Fragment, PrivateView, PublicView } from '../../shared/types';
import { DEPTH_NAMES } from '../../shared/types';
import { RULES } from '../../engine/rules';
import { buzz, sfx } from '../fx';
import { actionId, net, useServerNow } from '../net';
import { Receiver, type ReceiverState } from './Receiver';
import { AdSlot } from './Extras';

const CLUE_BONUS_S = 30;

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Blanks({ length, word, known }: { length: number; word?: string | null; known?: (string | null)[] }) {
  const letters = word ? word.replace(/[^a-z]/gi, '').split('') : [];
  const label = word
    ? `Answer ${word}`
    : `${length} letters${known?.some(Boolean) ? `: ${known.map((l) => l ?? 'blank').join(' ')}` : ''}`;
  return (
    <div className={`blanks ${word ? 'locked' : ''}`} aria-label={label}>
      {Array.from({ length }, (_, i) => {
        const hint = !word ? known?.[i] : null;
        return (
          <span key={`${i}${hint ?? ''}${word ? 'w' : ''}`} className={hint ? 'hint' : undefined} style={word ? { animationDelay: `${i * 70}ms` } : undefined}>
            {letters[i] ?? hint ?? ''}
          </span>
        );
      })}
    </div>
  );
}

/** Plays the lock-in moment when a new letter is revealed to this player. */
function useLetterReveal(letters: (string | null)[], onReveal: (count: number) => void) {
  const count = letters.filter(Boolean).length;
  const prev = useRef(count);
  const cb = useRef(onReveal);
  cb.current = onReveal;
  useEffect(() => {
    if (count > prev.current) cb.current(count);
    prev.current = count;
  }, [count]);
}

export function FragmentLine({ fragment }: { fragment: Fragment | null }) {
  if (!fragment) return null;
  if (fragment.kind === 'dead_air') {
    return (
      <div className="fragment dead">
        <span className="chip">Dead air</span> “{fragment.text}”
      </div>
    );
  }
  return (
    <div className={`fragment ${fragment.tier}`}>
      <span className="word">{fragment.word}</span>
      <span>↔ linked</span>
      <span className={`chip ${fragment.tier}`}>{fragment.tier}</span>
    </div>
  );
}

function Crew({ pub, playerId }: { pub: PublicView; playerId: string }) {
  const label = (st: string | null) =>
    st === 'probing' ? 'probing' : st === 'waiting' ? 'tuned' : st === 'active' ? 'decoding' : st === 'solved' ? 'cracked' : st === 'timed_out' ? 'lost signal' : st === 'forfeited' ? 'gone' : st === 'spectating' ? 'on podium' : '';
  return (
    <aside className="panel crew">
      <span className="eyebrow">Crew feed · first to {pub.targetScore}</span>
      <ul style={{ marginTop: 10 }}>
        {[...pub.players].sort((a, b) => b.totalScore - a.totalScore).map((p) => (
          <li key={p.id} className={p.connected ? '' : 'off'}>
            <div className="who">
              <span className="avatar">{p.nickname[0]?.toUpperCase()}</span>
              <span className="name">
                {p.nickname}{p.id === playerId ? ' ·you' : ''}
                <span className={`chip ${p.status ?? ''}`}>
                  {p.connected ? label(p.status) : 'reconnecting'}
                  {pub.phase === 'probe' && (
                    <span className="dots">{[0, 1, 2].map((k) => <i key={k} className={k < p.probesUsed ? 'on' : ''} />)}</span>
                  )}
                </span>
              </span>
              {p.place !== null && <span className="chip solved">{['', '1st', '2nd', '3rd'][p.place] ?? `#${p.place}`}</span>}
              <span className="score">{p.totalScore}</span>
            </div>
            <div className="race" aria-hidden="true"><i style={{ width: `${Math.min(100, (p.totalScore / pub.targetScore) * 100)}%` }} /></div>
            {p.feed.length > 0 && (
              <ul className="feed" aria-label={`${p.nickname}'s guesses`}>
                {[...p.feed].reverse().slice(0, 8).map((f, k) => (
                  <li key={`${f.word ?? 'x'}${k}`} className={f.result}>
                    {f.result === 'cracked' ? 'CRACKED' : `${f.phase === 'probe' ? '◆' : ''}${f.word}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Phones: the crew feed is below the fold, so show everyone's latest move under the input. */
function CrewTicker({ pub, playerId }: { pub: PublicView; playerId: string }) {
  const others = pub.players.filter((p) => p.id !== playerId && p.status !== 'spectating');
  if (others.length === 0) return null;
  return (
    <ul className="ticker" aria-label="Crew’s latest guesses">
      {others.map((p) => {
        const last = p.feed[p.feed.length - 1];
        return (
          <li key={p.id}>
            <b>{p.nickname}</b>{' '}
            {p.status === 'solved' ? (
              <span className="cracked">CRACKED</span>
            ) : p.status === 'timed_out' ? (
              <span className="lost">lost signal</span>
            ) : last ? (
              <span className={last.result}>{last.word}</span>
            ) : (
              <span className="muted">…</span>
            )}
            {p.feed.length > 1 && <small> · {p.feed.length}</small>}
          </li>
        );
      })}
    </ul>
  );
}

function useFeedback(onFb: (fb: ActionFeedback) => void) {
  const ref = useRef(onFb);
  ref.current = onFb;
  useEffect(() => net.onFeedback((_, fb) => ref.current(fb)), []);
}

// -------------------------------------------------------------- word input

function WordInput({ kind, disabled, onNote }: { kind: 'probe' | 'guess'; disabled: boolean; onNote: (n: { text: string; tone?: 'bad' | 'good' }, glitch?: boolean) => void }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [glitch, setGlitch] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);

  useFeedback((fb) => {
    setPending(null);
    if (fb.kind === 'static') {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 360);
      sfx.staticHit();
      buzz('double');
      onNote({ text: `Static. “${fb.word}” isn’t it.`, tone: 'bad' }, true);
    } else if (fb.kind === 'linked') {
      sfx.linked(fb.tier);
      buzz('medium');
      onNote({ text: `“${fb.word}” is LINKED (${fb.tier}). You’re circling it.`, tone: 'good' });
    } else if (fb.kind === 'duplicate') {
      sfx.info();
      onNote({ text: `Already tried “${fb.word}”.` });
    } else if (fb.kind === 'invalid') {
      sfx.info();
      onNote({ text: fb.reason });
    } else if (fb.kind === 'too_late') {
      onNote({ text: 'Time expired before that reached the Receiver.', tone: 'bad' });
    } else if (fb.kind === 'probe_accepted') {
      sfx.dial();
      buzz('tap');
      onNote({ text: `Probe “${fb.word}” sent. Results resolve together.` });
    } else if (fb.kind === 'rejected') {
      onNote({ text: fb.reason });
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const word = value.trim();
    if (!word || pending || disabled) return;
    setPending(word);
    setValue('');
    net.send({ t: kind, word, actionId: actionId() });
    input.current?.focus();
  };

  return (
    <form className={`guessform ${glitch ? 'glitch' : ''}`} onSubmit={submit}>
      <input
        ref={input} className="field" value={value} disabled={disabled} maxLength={40}
        onFocus={(e) => {
          // On phones the keyboard slides up over the bottom half: keep the box in view.
          const el = e.currentTarget;
          setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
        }}
        onChange={(e) => { setValue(e.target.value); sfx.key(); }}
        placeholder={kind === 'probe' ? 'Probe word…' : 'Your guess…'}
        aria-label={kind === 'probe' ? 'Probe word' : 'Guess'}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send"
      />
      <button className="btn primary" type="submit" disabled={disabled || !value.trim() || !!pending}>
        {pending ? '…' : kind === 'probe' ? 'Probe' : 'Send'}
      </button>
    </form>
  );
}

// -------------------------------------------------------------- phases

export function Game({ pub, me, playerId }: { pub: PublicView; me: PrivateView; playerId: string }) {
  const now = useServerNow(10);
  const [note, setNote] = useState<{ text: string; tone?: 'bad' | 'good' } | null>(null);

  const myPub = pub.players.find((p) => p.id === playerId);
  const solvedWord = me.guesses.find((g) => g.result.kind === 'correct')?.word ?? null;
  const phaseLeft = pub.phaseEndsAt ? pub.phaseEndsAt - now : 0;

  useEffect(() => setNote(null), [pub.phase, pub.round]);

  let receiver: ReceiverState = 'idle';
  if (pub.phase === 'probe') receiver = 'probe';
  if (me.fragment && pub.phase !== 'probe') receiver = me.fragment.kind === 'dead_air' ? 'dead' : me.fragment.tier;
  if (me.status === 'solved') receiver = 'crack';
  if (me.status === 'timed_out') receiver = 'timeout';

  const header = (
    <div className="stack" style={{ gap: 6, width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="depth">
          <b>Depth {pub.depth ?? pub.round}</b> {pub.depth ? DEPTH_NAMES[pub.depth] : ''}
        </span>
        <span className="eyebrow">
          <b className="mono" style={{ color: 'var(--paper)' }}>{myPub?.totalScore ?? 0}</b> / {pub.targetScore}
        </span>
      </div>
      <div className="race mine" aria-label={`${myPub?.totalScore ?? 0} of ${pub.targetScore} points`}>
        <i style={{ width: `${Math.min(100, ((myPub?.totalScore ?? 0) / pub.targetScore) * 100)}%` }} />
      </div>
    </div>
  );

  // ---- already on the podium: watch the rest fight
  if (me.status === 'spectating') {
    const place = myPub?.place ?? 0;
    return (
      <div className="game">
        <section className="panel center">
          {header}
          <div className="verdict">YOU TOOK {['', '1ST', '2ND', '3RD'][place] ?? `#${place}`}</div>
          <Receiver state="idle" size={150} />
          {pub.wordLength && <Blanks length={pub.wordLength} />}
          <p className="muted" style={{ margin: 0, maxWidth: 440 }}>
            You’re on the podium. Watch the crew feed: the rest keep fighting until {pub.placesLeft === 1 ? 'the last place is' : `${pub.placesLeft} more places are`} decided. Anyone who doesn’t make it is a loser.
          </p>
          <AdSlot slot="spectating" size="rect" />
        </section>
        <Crew pub={pub} playerId={playerId} />
      </div>
    );
  }

  // ---- intro
  if (pub.phase === 'intro') {
    return (
      <div className="game">
        <section className="panel center tear">
          {header}
          <Receiver state="idle" size={200} />
          <div className="incoming glitch-text" data-text={`DEPTH ${pub.depth ?? pub.round}`}><small>Descending · {pub.depth ? DEPTH_NAMES[pub.depth] : ''}</small>DEPTH {pub.depth ?? pub.round}</div>
          {pub.wordLength && <Blanks length={pub.wordLength} />}
          <p className="muted">{pub.wordLength} letters. Deeper means harder. Prepare three probes.</p>
        </section>
        <Crew pub={pub} playerId={playerId} />
      </div>
    );
  }

  // ---- probe
  if (pub.phase === 'probe') {
    const done = me.status !== 'probing';
    return (
      <div className="game">
        <section className="panel center">
          {header}
          <Receiver state={me.status === 'solved' ? 'crack' : 'probe'} probes={me.probes.length} size={200} />
          <h2>Probe the signal</h2>
          {pub.wordLength && <Blanks length={pub.wordLength} word={solvedWord} />}
          <p className="muted" style={{ margin: 0, maxWidth: 460 }}>
            Send 3 words. Any that link to the hidden word light the Receiver, and your strongest link is revealed. Nail the word itself for a <b className="marker" style={{ color: 'var(--graffiti)' }}>Blind Hunch</b>.
          </p>
          <div className="probes">
            {[0, 1, 2].map((i) => (
              <span key={i} className={me.probes[i] ? '' : 'empty'}>{me.probes[i] ?? `probe ${i + 1}`}</span>
            ))}
          </div>
          <div style={{ width: '100%', maxWidth: 480 }} className="stack">
            {me.status === 'solved' ? (
              <p className="note good">BLIND HUNCH. You cracked it before the signal even resolved.</p>
            ) : (
              <WordInput kind="probe" disabled={done} onNote={setNote} />
            )}
            <div className={`note ${note?.tone ?? ''}`} aria-live="polite">{done && me.status !== 'solved' ? 'Probes locked. Waiting for the crew…' : note?.text}</div>
            <div className="phasebar"><i style={{ width: `${Math.max(0, Math.min(100, (phaseLeft / 20000) * 100))}%` }} /></div>
            <span className="mono muted" style={{ fontSize: 13 }}>{fmt(phaseLeft)}</span>
          </div>
        </section>
        <Crew pub={pub} playerId={playerId} />
      </div>
    );
  }

  // ---- fragment reveal
  if (pub.phase === 'fragment') {
    return (
      <div className="game">
        <section className="panel center">
          {header}
          <Receiver state={receiver} probes={me.probes.length} size={220} />
          <span className="eyebrow">Signal resolved</span>
          {pub.wordLength && me.status !== 'solved' && <Blanks length={pub.wordLength} known={me.letters} />}
          {me.status === 'solved' ? (
            <div className="answer marker" style={{ color: 'var(--graffiti)', fontSize: 'clamp(32px,8vw,56px)' }}>Blind Hunch</div>
          ) : (
            <FragmentLine fragment={me.fragment} />
          )}
          <p className="muted" style={{ margin: 0 }}>
            {me.fragment?.kind === 'link'
              ? me.fragment.tier === 'strong'
                ? '+75 probe bonus banked. Strong link.'
                : '+30 probe bonus banked. Weak link.'
              : me.status === 'solved'
                ? 'Sit back and watch the crew sweat.'
                : 'No link. The Operator sends what little they have.'}
            {me.status !== 'solved' &&
              (me.letters.some(Boolean)
                ? ` A letter from your probes locked in.`
                : ' None of your probes shared a letter.')}
          </p>
          <p className="eyebrow">Decoding begins in {Math.max(0, Math.ceil(phaseLeft / 1000))}</p>
        </section>
        <Crew pub={pub} playerId={playerId} />
      </div>
    );
  }

  // ---- main
  return <MainPhase pub={pub} me={me} playerId={playerId} now={now} receiver={receiver} header={header} note={note} setNote={setNote} solvedWord={solvedWord} />;
}

function MainPhase(props: {
  pub: PublicView;
  me: PrivateView;
  playerId: string;
  now: number;
  receiver: ReceiverState;
  header: React.ReactNode;
  note: { text: string; tone?: 'bad' | 'good' } | null;
  setNote: (n: { text: string; tone?: 'bad' | 'good' } | null) => void;
  solvedWord: string | null;
}) {
  const { pub, me, playerId, now, receiver, header, note, setNote, solvedWord } = props;
  const [stamp, setStamp] = useState(0);
  const [pulled, setPulled] = useState(false);
  const [cluePending, setCluePending] = useState(false);
  const lastUrgent = useRef<number | null>(null);
  const seenGuesses = useRef(me.guesses.length);
  useEffect(() => {
    const t = setTimeout(() => (seenGuesses.current = me.guesses.length), 500);
    return () => clearTimeout(t);
  }, [me.guesses.length]);

  const left = me.deadline ? me.deadline - now : 0;
  const active = me.status === 'active';
  const secs = Math.ceil(left / 1000);
  const urgent = active && secs <= 15;

  useFeedback((fb) => {
    if (fb.kind === 'clue') {
      setCluePending(false);
      sfx.clunk();
      buzz('mechanical');
      setStamp((s) => s + 1);
      setPulled(true);
      setTimeout(() => setPulled(false), 400);
    } else if (fb.kind === 'rejected' || fb.kind === 'too_late') {
      setCluePending(false);
    }
  });

  // Urgency: tone + pulse at 15, 10, 5 s (restrained, not every second).
  useEffect(() => {
    if (!active || secs > 15 || secs <= 0) return;
    if (secs % 5 === 0 && lastUrgent.current !== secs) {
      lastUrgent.current = secs;
      sfx.urgent();
      buzz('warn');
    }
  }, [secs, active]);

  // Late letter at 30 s left.
  useLetterReveal(me.letters, () => {
    if (!active) return;
    sfx.letter();
    buzz('medium');
    setNote({ text: 'Static clears. A second letter locks in.', tone: 'good' });
  });

  // Clue unlock moment.
  const wasUnlocked = useRef(me.cluesUnlocked);
  useEffect(() => {
    if (me.cluesUnlocked && !wasUnlocked.current) {
      sfx.unlock();
      buzz('medium');
    }
    wasUnlocked.current = me.cluesUnlocked;
  }, [me.cluesUnlocked]);

  const buy = () => {
    if (cluePending) return;
    setCluePending(true);
    net.send({ t: 'clue', actionId: actionId() });
  };

  const isFinalClue = me.cluesBought === RULES.clueCosts.length - 1;
  const finalLockedFor = isFinalClue ? Math.max(0, left - RULES.finalClueAtMs) : 0;
  const canBuy = active && me.cluesUnlocked && me.nextClueCost !== null && !cluePending && finalLockedFor === 0;
  // Past the base 120 s you're living on intel time: no speed bonus left.
  const basePart = !!me.baseDeadline && now >= me.baseDeadline;

  return (
    <div className="game">
      <section className="panel stack">
        {header}
        <div className="hud">
          <div className="stat">
            <span className="eyebrow">Round pts</span>
            <b>{me.roundPoints}</b>
          </div>
          <div className={`timer ${urgent ? (secs <= 5 ? 'critical' : 'urgent') : ''}`} role="timer" aria-live="off" aria-label={`${secs} seconds left`}>
            {me.status === 'solved' ? <span style={{ color: 'var(--rune)' }}>CRACKED</span> : me.status === 'timed_out' ? <span style={{ color: 'var(--danger)', fontSize: '0.6em' }}>SIGNAL LOST</span> : fmt(left)}
            {stamp > 0 && <span className="stamp" key={stamp}>+{CLUE_BONUS_S}s</span>}
          </div>
          <div className="stat" style={{ textAlign: 'right' }}>
            <span className="eyebrow">Speed</span>
            <b style={{ color: 'var(--rune)' }}>
              +{active && me.baseDeadline ? Math.max(0, Math.min(120, Math.floor((me.baseDeadline - now) / 1000))) : 0}
            </b>
          </div>
        </div>
        {active && basePart && <p className="eyebrow" style={{ textAlign: 'center', margin: 0 }}>Intel time · speed bonus spent</p>}
        {pub.collapsed && active && <p className="eyebrow" style={{ textAlign: 'center', margin: 0, color: 'var(--ember)' }}>Signal collapse in effect</p>}

        <div className="main-rx"><Receiver state={receiver} probes={me.probes.length} size={130} /></div>
        {pub.wordLength && <Blanks length={pub.wordLength} word={solvedWord} known={me.letters} />}
        <FragmentLine fragment={me.fragment} />

        {active ? (
          <>
            <WordInput kind="guess" disabled={!active} onNote={(n) => setNote(n)} />
            <div className={`note ${note?.tone ?? ''}`} aria-live="polite">{note?.text}</div>
            <CrewTicker pub={pub} playerId={playerId} />
          </>
        ) : (
          <p className={`note ${me.status === 'solved' ? 'good' : 'bad'}`}>
            {me.status === 'solved' ? 'Word cracked. Watch the crew; the round resolves when everyone is done.' : 'Your signal is lost for this round. Waiting for the crew…'}
          </p>
        )}

        {me.guesses.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Signal log</span>
            <ul className="log">
              {[...me.guesses].reverse().map((g, i, arr) => {
                const idx = arr.length - 1 - i;
                const cls = g.result.kind === 'linked' ? `linked-${g.result.tier}` : g.result.kind;
                return (
                  <li key={g.word} className={`${cls} ${idx >= seenGuesses.current ? 'new' : ''}`} title={g.phase === 'probe' ? 'probe' : undefined}>
                    {g.phase === 'probe' ? '◆ ' : ''}{g.word}
                    {g.result.kind === 'linked' ? ` ↔ ${g.result.tier}` : ''}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="intel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="eyebrow">Intel {me.cluesUnlocked ? 'unlocked' : `locked · ${Math.min(me.misses, 5)}/5 misses`}</span>
            <div className="misses" aria-hidden="true">
              {Array.from({ length: RULES.missesToUnlockClues }, (_, i) => <i key={i} className={i < me.misses ? 'on' : ''} />)}
            </div>
          </div>
          {me.clues.length > 0 && <ul className="clues">{me.clues.map((c, i) => <li key={i}>{c}</li>)}</ul>}
          {me.nextClueCost !== null && active && (
            <button className={`lever ${pulled ? 'pulled' : ''}`} disabled={!canBuy} onClick={buy}>
              <span className="handle" aria-hidden="true" />
              <span>
                <b>{isFinalClue ? 'Last-ditch intel' : 'Pull the lever'} · {me.cluesBought + 1}/{RULES.clueCosts.length}</b>
                <br />
                <span className="muted" style={{ fontSize: 14 }}>
                  {!me.cluesUnlocked
                    ? `Miss ${RULES.missesToUnlockClues} times to unlock`
                    : finalLockedFor > 0
                      ? `Final clue only in the last ${RULES.finalClueAtMs / 1000} s · ${fmt(finalLockedFor)}`
                      : isFinalClue
                        ? 'The near-giveaway. Now or never.'
                        : 'Reveal the next clue'}
                </span>
              </span>
              <span className="cost"><b>−{me.nextClueCost}</b><i>+30s</i></span>
            </button>
          )}
        </div>
      </section>
      <Crew pub={pub} playerId={playerId} />
    </div>
  );
}
