import { describe, expect, it } from 'vitest';
import { Match } from './match';
import { ACCEPT_ALL, normalize, wordForms } from './normalize';
import { RULES } from './rules';
import type { Puzzle } from '../shared/types';

const VOLCANO: Puzzle = {
  id: 't-volcano',
  answer: 'volcano',
  aliases: ['volcanoes'],
  definition: 'A rupture in a planet’s crust through which molten rock escapes.',
  category: 'Nature',
  depth: 1,
  fallback: 'Something the earth does when it loses its temper.',
  clues: ['c1', 'c2', 'c3'],
  strong: ['lava', 'magma', 'eruption', 'crater'],
  weak: ['mountain', 'fire', 'island', 'smoke', 'rock'],
};

const P = ['alice', 'bob'];

function match(opts: { collapse?: boolean; players?: string[]; puzzles?: Puzzle[]; target?: number } = {}) {
  return new Match(opts.puzzles ?? [VOLCANO, VOLCANO], opts.players ?? P, {
    collapse: opts.collapse ?? false,
    targetScore: opts.target ?? 0,
    lexicon: ACCEPT_ALL,
  });
}

let aid = 0;
const id = () => `a${aid++}`;

/** Starts at t=0 and advances into the probe phase. Returns the probe-phase start time. */
function toProbe(m: Match): number {
  m.start(0);
  m.tick(RULES.introMs);
  expect(m.phase).toBe('probe');
  return RULES.introMs;
}

/** Ends probing (by time) and the fragment beat. Returns main-phase start time. */
function toMain(m: Match, probeStart: number): number {
  const t1 = probeStart + RULES.probeMs;
  m.tick(t1);
  expect(m.phase).toBe('fragment');
  const t2 = t1 + RULES.fragmentMs;
  m.tick(t2);
  expect(m.phase).toBe('main');
  return t2;
}

let missSeq = 0;
const letters = (n: number) => n.toString(26).split('').map((c) => String.fromCharCode(97 + parseInt(c, 26))).join('');
function missN(m: Match, p: string, n: number, t: number) {
  for (let i = 0; i < n; i++) expect(m.guess(p, `zzmiss${letters(missSeq++)}`, id(), t).kind).toBe('static');
}

describe('normalize', () => {
  it('folds case, whitespace and punctuation', () => {
    expect(normalize('  Vol-Cano!! ')).toBe('volcano');
    expect(normalize('Ice   Cream')).toBe('ice cream');
  });
  it('de-inflects simple forms', () => {
    expect(wordForms('mountains')).toContain('mountain');
    expect(wordForms('berries')).toContain('berry');
    expect(wordForms('erupting')).toContain('erupt');
  });
});

describe('probe phase', () => {
  it('reveals the highest-ranked hit as the fragment and awards the tier bonus', () => {
    const m = match();
    const t = toProbe(m);
    expect(m.probe('alice', 'fire', id(), t).kind).toBe('probe_accepted');
    expect(m.probe('alice', 'ocean', id(), t).kind).toBe('probe_accepted');
    expect(m.probe('alice', 'Mountains', id(), t).kind).toBe('probe_accepted');
    // Results hidden during probing
    expect(m.privateView('alice')!.fragment).toBeNull();
    expect(m.privateView('alice')!.guesses.every((g) => g.result.kind === 'static')).toBe(true);
    toMain(m, t);
    // mountain (weak rank 4) beats fire (weak rank 5)
    expect(m.privateView('alice')!.fragment).toEqual({ kind: 'link', word: 'mountain', tier: 'weak' });
  });

  it('prefers strong links over weak ones regardless of probe order', () => {
    const m = match();
    const t = toProbe(m);
    m.probe('alice', 'rock', id(), t);
    m.probe('alice', 'crater', id(), t);
    toMain(m, t);
    expect(m.privateView('alice')!.fragment).toEqual({ kind: 'link', word: 'crater', tier: 'strong' });
  });

  it('gives Dead Air with the fallback fragment and no probe bonus on zero hits', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'banana', id(), t);
    const main = toMain(m, t);
    expect(m.privateView('alice')!.fragment).toEqual({ kind: 'dead_air', text: VOLCANO.fallback });
    m.tick(main + RULES.mainMs);
    expect(m.phase).toBe('reveal');
    expect(m.privateView('alice')!.breakdown!.total).toBe(0);
  });

  it('allows at most 3 probes and rejects duplicates and invalid input without consuming one', () => {
    const m = match();
    const t = toProbe(m);
    expect(m.probe('alice', 'fire', id(), t).kind).toBe('probe_accepted');
    expect(m.probe('alice', 'FIRE', id(), t).kind).toBe('duplicate');
    expect(m.probe('alice', '   ', id(), t).kind).toBe('invalid');
    expect(m.probe('alice', 'smoke', id(), t).kind).toBe('probe_accepted');
    expect(m.probe('alice', 'rock', id(), t).kind).toBe('probe_accepted');
    expect(m.probe('alice', 'lava', id(), t).kind).toBe('rejected');
    expect(m.privateView('alice')!.probes).toEqual(['fire', 'smoke', 'rock']);
  });

  it('counts wrong probes toward the five-miss clue gate', () => {
    const m = match();
    const t = toProbe(m);
    for (const w of ['a', 'b', 'c']) m.probe('alice', `probe${w}`, id(), t);
    const main = toMain(m, t);
    expect(m.privateView('alice')!.misses).toBe(3);
    missN(m, 'alice', 2, main + 1);
    expect(m.privateView('alice')!.cluesUnlocked).toBe(true);
  });

  it('resolves a Blind Hunch: +250, full speed bonus, first crack', () => {
    const m = match();
    const t = toProbe(m);
    m.probe('alice', 'lava', id(), t);
    expect(m.probe('alice', 'Volcano', id(), t + 5).kind).toBe('blind_hunch');
    const main = toMain(m, t);
    m.guess('bob', 'volcano', id(), main + 30_000);
    expect(m.phase).toBe('main');
    m.tick(main + 30_000);
    expect(m.phase).toBe('reveal');
    const b = m.privateView('alice')!.breakdown!;
    expect(b).toMatchObject({ solve: 500, blindHunch: 250, probe: 75, speed: 120, firstCrack: 50, clues: 0 });
    expect(b.total).toBe(995);
  });

  it('ends the probe phase early once every connected player is done', () => {
    const m = match();
    const t = toProbe(m);
    for (const p of P) for (const w of ['x', 'y', 'z']) m.probe(p, `probe${w}`, id(), t);
    m.tick(t + 1);
    expect(m.phase).toBe('fragment');
  });
});

describe('main phase scoring', () => {
  it('scores solve + probe + speed - clues', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'mountain', id(), t);
    const main = toMain(m, t);
    missN(m, 'alice', 4, main + 1_000);
    const clue = m.buyClue('alice', id(), main + 2_000);
    expect(clue).toEqual({ kind: 'clue', index: 0, text: 'c1', cost: 50 });
    expect(m.guess('alice', 'volcano', id(), main + 50_000).kind).toBe('correct');
    m.tick(main + 50_000);
    const b = m.privateView('alice')!.breakdown!;
    expect(b).toMatchObject({ solve: 500, probe: 30, speed: 70, firstCrack: 50, clues: -50 });
    expect(b.total).toBe(600);
  });

  it('awards no speed bonus when solving during clue extension time', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    const main = toMain(m, t);
    missN(m, 'alice', 5, main + 1);
    m.buyClue('alice', id(), main + 100_000);
    m.guess('alice', 'volcano', id(), main + 130_000);
    m.tick(main + 130_000);
    expect(m.privateView('alice')!.breakdown!.speed).toBe(0);
  });

  it('flags linked guesses in the main phase without awarding points', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    const main = toMain(m, t);
    expect(m.guess('alice', 'magma', id(), main + 1)).toEqual({ kind: 'linked', word: 'magma', tier: 'strong' });
    expect(m.guess('alice', 'magma', id(), main + 2).kind).toBe('duplicate');
    expect(m.privateView('alice')!.misses).toBe(1);
  });

  it('awards probe bonus only on timeout', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'lava', id(), t);
    const main = toMain(m, t);
    m.tick(main + RULES.mainMs);
    expect(m.privateView('alice')!.breakdown).toMatchObject({ solve: 0, probe: 75, speed: 0, total: 75 });
  });
});

describe('clues', () => {
  it('stays locked until five misses', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 4, main + 1);
    expect(m.buyClue('alice', id(), main + 2).kind).toBe('rejected');
  });

  it('costs exactly 50/100/150, adds 30 s each, and is sequential', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    const a = m.buyClue('alice', id(), main + 10);
    const b = m.buyClue('alice', id(), main + 11);
    expect([a, b]).toEqual([
      { kind: 'clue', index: 0, text: 'c1', cost: 50 },
      { kind: 'clue', index: 1, text: 'c2', cost: 100 },
    ]);
    expect(m.privateView('alice')!.deadline).toBe(main + 180_000);
    const c = m.buyClue('alice', id(), main + 160_000);
    expect(c).toEqual({ kind: 'clue', index: 2, text: 'c3', cost: 150 });
    expect(m.buyClue('alice', id(), main + 160_001).kind).toBe('rejected');
    const v = m.privateView('alice')!;
    expect(v.deadline).toBe(main + 210_000);
    expect(v.roundPoints).toBe(200);
    expect(v.clues).toEqual(VOLCANO.clues);
  });

  it('holds the final clue until the last 20 seconds', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    m.buyClue('alice', id(), main + 2);
    m.buyClue('alice', id(), main + 3); // deadline main + 180 s
    expect(m.buyClue('alice', id(), main + 159_999).kind).toBe('rejected');
    expect(m.privateView('alice')!.cluesBought).toBe(2);
    expect(m.buyClue('alice', id(), main + 160_000).kind).toBe('clue');
  });

  it('solving after all three clues still beats timing out', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    m.buyClue('alice', id(), main + 2);
    m.buyClue('alice', id(), main + 3);
    m.buyClue('alice', id(), main + 165_000);
    m.guess('alice', 'volcano', id(), main + 200_000);
    m.tick(main + 200_000);
    expect(m.privateView('alice')!.breakdown!.total).toBe(500 + 50 - 300);
  });

  it('only extends the purchasing player', () => {
    const m = match();
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    m.buyClue('alice', id(), main + 2);
    expect(m.privateView('alice')!.deadline).toBe(main + 150_000);
    expect(m.privateView('bob')!.deadline).toBe(main + 120_000);
  });
});

describe('races, idempotency, timeouts', () => {
  it('rejects a guess received at or after the deadline', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    expect(m.guess('alice', 'volcano', id(), main + RULES.mainMs).kind).toBe('too_late');
    expect(m.privateView('alice')!.status).toBe('timed_out');
  });

  it('accepts a guess 1 ms before the deadline', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    expect(m.guess('alice', 'volcano', id(), main + RULES.mainMs - 1).kind).toBe('correct');
  });

  it('rejects a clue received after the deadline', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    expect(m.buyClue('alice', id(), main + RULES.mainMs).kind).toBe('too_late');
  });

  it('processes a replayed action id only once', () => {
    const m = match({ players: ['alice'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    const a = id();
    expect(m.buyClue('alice', a, main + 2).kind).toBe('clue');
    expect(m.buyClue('alice', a, main + 3).kind).toBe('rejected');
    expect(m.privateView('alice')!.cluesBought).toBe(1);
  });

  it('accepts no actions after solving', () => {
    const m = match();
    const main = toMain(m, toProbe(m));
    m.guess('alice', 'volcano', id(), main + 1);
    expect(m.guess('alice', 'lava', id(), main + 2).kind).toBe('rejected');
    expect(m.buyClue('alice', id(), main + 3).kind).toBe('rejected');
  });
});

describe('letter reveals', () => {
  // VOLCANO = v o l c a n o
  it('unlocks exactly one letter from all probes, in its correct position', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'storm', id(), t); // s,t not in answer; o is → position 1
    m.probe('alice', 'lava', id(), t);
    m.probe('alice', 'cave', id(), t);
    expect(m.privateView('alice')!.letters).toEqual([null, null, null, null, null, null, null]);
    toMain(m, t);
    expect(m.privateView('alice')!.letters).toEqual([null, 'o', null, null, null, null, null]);
  });

  it('reveals no probe letter when no probe shares a letter', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'gift', id(), t);
    toMain(m, t);
    expect(m.privateView('alice')!.letters.every((l) => l === null)).toBe(true);
  });

  it('reveals a second letter when the player reaches 30 s left', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'storm', id(), t);
    const main = toMain(m, t);
    m.tick(main + RULES.mainMs - 30_001);
    expect(m.privateView('alice')!.letters.filter(Boolean)).toHaveLength(1);
    m.tick(main + RULES.mainMs - 30_000);
    // next probe match: storm's 'o' again → the second o at position 6
    expect(m.privateView('alice')!.letters).toEqual([null, 'o', null, null, null, null, 'o']);
    m.tick(main + RULES.mainMs - 10_000);
    expect(m.privateView('alice')!.letters.filter(Boolean)).toHaveLength(2);
  });

  it('falls back to the leftmost hidden blank for the late letter', () => {
    const m = match({ players: ['alice'] });
    const t = toProbe(m);
    m.probe('alice', 'gift', id(), t);
    const main = toMain(m, t);
    m.tick(main + RULES.mainMs - 30_000);
    expect(m.privateView('alice')!.letters[0]).toBe('v');
  });

  it('times the late letter from the personal deadline, including clue extensions', () => {
    const m = match({ players: ['alice', 'bob'] });
    const main = toMain(m, toProbe(m));
    missN(m, 'alice', 5, main + 1);
    m.buyClue('alice', id(), main + 2); // alice deadline = main + 150 s
    m.tick(main + 90_000);
    expect(m.privateView('alice')!.letters.filter(Boolean)).toHaveLength(0);
    expect(m.privateView('bob')!.letters.filter(Boolean)).toHaveLength(1);
    m.tick(main + 120_000);
    expect(m.privateView('alice')!.letters.filter(Boolean)).toHaveLength(1);
  });
});

describe('race to the target score', () => {
  it('ends the match after the round in which someone reaches the target', () => {
    const m = match({ players: ['alice', 'bob'], target: 400, puzzles: [VOLCANO, VOLCANO, VOLCANO] });
    const main = toMain(m, toProbe(m));
    m.guess('alice', 'volcano', id(), main + 1_000);
    m.tick(main + RULES.mainMs);
    expect(m.phase).toBe('reveal');
    expect(m.targetReached).toBe(true);
    m.tick(main + RULES.mainMs + RULES.revealMs);
    expect(m.phase).toBe('complete');
    expect(m.winnerId).toBe('alice');
  });

  it('keeps descending while nobody has reached the target', () => {
    const m = match({ players: ['alice'], target: 5000, puzzles: [VOLCANO, VOLCANO] });
    const main = toMain(m, toProbe(m));
    m.guess('alice', 'volcano', id(), main + 1_000);
    m.tick(main + 1_000);
    m.tick(main + 1_000 + RULES.revealMs);
    expect(m.phase).toBe('intro');
    expect(m.roundIndex).toBe(1);
  });

  it('declares no single winner on a tie for first', () => {
    const m = match({ players: ['alice', 'bob'], target: 100, puzzles: [VOLCANO] });
    const main = toMain(m, toProbe(m));
    m.tick(main + RULES.mainMs);
    m.tick(main + RULES.mainMs + RULES.revealMs);
    expect(m.phase).toBe('complete');
    expect(m.winnerId).toBeNull();
  });
});

describe('podium race', () => {
  /** Plays one full round from its intro: `crack` players solve at +1 s, everyone else times out. */
  function playRound(m: Match, t0: number, crack: string[]): number {
    m.tick(t0 + RULES.introMs);
    const main = toMain(m, t0 + RULES.introMs);
    for (const p of crack) m.guess(p, 'volcano', id(), main + 1_000);
    m.tick(main + RULES.mainMs);
    expect(m.phase).toBe('reveal');
    const next = main + RULES.mainMs + RULES.revealMs;
    m.tick(next);
    return next;
  }

  it('keeps going after 1st until 2nd is decided, then tags the rest losers', () => {
    const m = match({ players: ['alice', 'bob', 'cara'], target: 400, puzzles: [VOLCANO, VOLCANO, VOLCANO, VOLCANO] });
    m.start(0);
    let t = playRound(m, 0, ['alice']);
    expect(m.placeOf('alice')).toBe(1);
    expect(m.phase).toBe('intro'); // 3 players: 1st and 2nd must both be decided
    expect(m.statusOf('alice')).toBe('spectating');
    expect(m.drainEvents().some((e) => e.kind === 'place' && e.playerId === 'alice' && e.place === 1)).toBe(true);
    t = playRound(m, t, ['bob']);
    expect(m.phase).toBe('complete');
    const s = m.standings();
    expect(s.map((r) => [r.playerId, r.place, r.loser])).toEqual([
      ['alice', 1, false],
      ['bob', 2, false],
      ['cara', null, true],
    ]);
    expect(m.winnerId).toBe('alice');
  });

  it('decides 1st, 2nd and 3rd in bigger rooms', () => {
    const m = match({ players: ['a', 'b', 'c', 'd', 'e'], target: 400, puzzles: Array(6).fill(VOLCANO) });
    m.start(0);
    let t = playRound(m, 0, ['a', 'b']); // both cross in one round: higher total takes 1st
    expect([m.placeOf('a'), m.placeOf('b')]).toEqual([1, 2]);
    expect(m.phase).toBe('intro');
    t = playRound(m, t, []);
    expect(m.phase).toBe('intro');
    playRound(m, t, ['d']);
    expect(m.phase).toBe('complete');
    expect(m.placeOf('d')).toBe(3);
    expect(m.standings().filter((r) => r.loser).map((r) => r.playerId).sort()).toEqual(['c', 'e']);
  });

  it('lets a placed player watch but not play', () => {
    const m = match({ players: ['alice', 'bob', 'cara'], target: 400, puzzles: [VOLCANO, VOLCANO, VOLCANO] });
    m.start(0);
    const t = playRound(m, 0, ['alice']);
    m.tick(t + RULES.introMs);
    expect(m.probe('alice', 'lava', id(), t + RULES.introMs).kind).toBe('rejected');
  });

  it('fills open places by score when the bank runs out', () => {
    const m = match({ players: ['alice', 'bob', 'cara'], target: 5000, puzzles: [VOLCANO] });
    m.start(0);
    playRound(m, 0, ['bob']);
    expect(m.phase).toBe('complete');
    expect(m.placeOf('bob')).toBe(1);
    expect(m.winnerId).toBe('bob');
  });

  it('records every player’s trail with timings, round by round', () => {
    const m = match({ players: ['alice', 'bob', 'cara'], target: 400, puzzles: [VOLCANO, VOLCANO, VOLCANO] });
    m.start(0);
    m.tick(RULES.introMs);
    m.probe('cara', 'lava', id(), RULES.introMs + 500);
    const main = toMain(m, RULES.introMs);
    m.guess('cara', 'smoke', id(), main + 2_000);
    m.guess('alice', 'volcano', id(), main + 5_000);
    m.tick(main + RULES.mainMs);
    m.tick(main + RULES.mainMs + RULES.revealMs);
    playRound(m, main + RULES.mainMs + RULES.revealMs, ['bob']);
    const trails = m.trails;
    expect(trails).toHaveLength(2);
    const cara = trails[0].players.find((p) => p.id === 'cara')!;
    expect(cara.guesses.map((g) => [g.word, g.result, g.phase])).toEqual([
      ['lava', 'strong', 'probe'],
      ['smoke', 'weak', 'main'],
    ]);
    expect(cara.guesses[0].t).toBeLessThan(0);
    expect(cara.guesses[1].t).toBe(2_000);
    expect(trails[0].players.find((p) => p.id === 'alice')!.solveMs).toBe(5_000);
    expect(trails[1].players.find((p) => p.id === 'alice')!.played).toBe(false);
    expect(trails[0].answer).toBe('volcano');
  });
});

describe('public guess feed', () => {
  it('hides probe words while probing, then shows every guess with its result', () => {
    const m = match();
    const t = toProbe(m);
    m.probe('alice', 'lava', id(), t);
    m.probe('alice', 'banana', id(), t);
    expect(m.publicFeed('alice')).toEqual([]);
    const main = toMain(m, t);
    expect(m.publicFeed('alice')).toEqual([
      { word: 'lava', result: 'strong', phase: 'probe' },
      { word: 'banana', result: 'static', phase: 'probe' },
    ]);
    m.guess('alice', 'smoke', id(), main + 1);
    expect(m.publicFeed('alice').at(-1)).toEqual({ word: 'smoke', result: 'weak', phase: 'main' });
  });

  it('never shows the word of a correct guess', () => {
    const m = match();
    const main = toMain(m, toProbe(m));
    m.guess('alice', 'volcano', id(), main + 1);
    const feed = m.publicFeed('alice');
    expect(feed.at(-1)).toEqual({ word: null, result: 'cracked', phase: 'main' });
    expect(JSON.stringify(feed)).not.toContain('volcano');
  });
});

describe('signal collapse', () => {
  it('caps other active players at 60 s after the first crack, once', () => {
    const m = match({ collapse: true, players: ['alice', 'bob', 'cara'] });
    const main = toMain(m, toProbe(m));
    m.guess('alice', 'volcano', id(), main + 10_000);
    expect(m.privateView('bob')!.deadline).toBe(main + 70_000);
    m.guess('bob', 'volcano', id(), main + 20_000);
    expect(m.privateView('cara')!.deadline).toBe(main + 70_000);
    expect(m.drainEvents().filter((e) => e.kind === 'collapse')).toHaveLength(1);
  });

  it('does not cap when the setting is off', () => {
    const m = match({ collapse: false });
    const main = toMain(m, toProbe(m));
    m.guess('alice', 'volcano', id(), main + 10_000);
    expect(m.privateView('bob')!.deadline).toBe(main + 120_000);
  });

  it('applies at main start after a Blind Hunch', () => {
    const m = match({ collapse: true });
    const t = toProbe(m);
    m.probe('alice', 'volcano', id(), t);
    const main = toMain(m, t);
    expect(m.privateView('bob')!.deadline).toBe(main + 60_000);
  });
});

describe('match flow', () => {
  it('runs all rounds and ranks by total', () => {
    const m = match();
    let t = toProbe(m);
    for (let round = 0; round < 2; round++) {
      if (round > 0) {
        t += 1;
        m.tick(t);
        expect(m.phase).toBe('probe');
      }
      const main = toMain(m, t);
      m.guess('alice', 'volcano', id(), main + 1_000);
      m.tick(main + RULES.mainMs);
      expect(m.phase).toBe('reveal');
      expect(m.revealPlayers()).toHaveLength(2);
      t = main + RULES.mainMs + RULES.revealMs;
      m.tick(t);
      if (round === 0) {
        expect(m.phase).toBe('intro');
        t += RULES.introMs - 1;
      }
    }
    expect(m.phase).toBe('complete');
    const s = m.standings();
    expect(s[0].playerId).toBe('alice');
    expect(s[0].history).toHaveLength(2);
    expect(s[1].total).toBe(0);
  });

  it('never leaks probe results before the fragment reveal', () => {
    const m = match();
    const t = toProbe(m);
    m.probe('alice', 'lava', id(), t);
    const view = JSON.stringify(m.privateView('alice'));
    expect(view).not.toContain('linked');
    expect(view).not.toContain('strong');
  });

  it('does not let a forfeited player block the round', () => {
    const m = match();
    const main = toMain(m, toProbe(m));
    m.forfeit('bob');
    m.guess('alice', 'volcano', id(), main + 1);
    m.tick(main + 2);
    expect(m.phase).toBe('reveal');
  });
});
