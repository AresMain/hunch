// Server-authoritative match engine. Pure: no timers, sockets or clocks.
// Every mutating call takes `now` (server receipt time, ms) so races between
// actions and deadlines resolve deterministically.

import { RULES, hardCapMs, type Rules } from './rules';
import { normalize, wordForms, type Lexicon } from './normalize';
import type {
  FinalRow,
  RoundTrail,
  PublicGuess,
  ActionFeedback,
  Breakdown,
  Fragment,
  GuessEntry,
  LinkTier,
  MatchPhase,
  PlayerRoundStatus,
  PrivateView,
  Puzzle,
  RevealPlayer,
  RoomEvent,
} from '../shared/types';

interface MapEntry {
  tier: LinkTier;
  rank: number;
}

interface PlayerRound {
  status: PlayerRoundStatus;
  probes: string[];
  tried: Set<string>;
  guesses: GuessEntry[];
  bestHit: (MapEntry & { word: string }) | null;
  fragment: Fragment | null;
  /** Answer position → letter, revealed privately to this player. */
  letters: Map<number, string>;
  lateLetterGiven: boolean;
  misses: number;
  cluesBought: number;
  clueCostPaid: number;
  deadline: number | null;
  baseDeadline: number | null;
  solvedAt: number | null;
  blindHunch: boolean;
  firstCrack: boolean;
  breakdown: Breakdown | null;
  actionIds: Set<string>;
}

interface MatchPlayer {
  id: string;
  forfeited: boolean;
  connected: boolean;
  history: number[];
  roundsSolved: number;
  solveTimeMs: number;
  /** Podium place, set when the player crosses the target. */
  place: number | null;
}

interface Round {
  puzzle: Puzzle;
  answers: Set<string>;
  /** Canonical answer letters, used for letter reveals and blanks. */
  letters: string[];
  map: Map<string, MapEntry>;
  players: Map<string, PlayerRound>;
  mainStartedAt: number | null;
  collapsed: boolean;
  firstCrackId: string | null;
}

export interface MatchOptions {
  collapse: boolean;
  /** First to reach this total wins. 0 = play every puzzle. */
  targetScore: number;
  rules?: Rules;
  lexicon: Lexicon;
}

export class Match {
  readonly rules: Rules;
  phase: MatchPhase = 'lobby';
  phaseEndsAt: number | null = null;
  roundIndex = -1;
  readonly players = new Map<string, MatchPlayer>();
  private round: Round | null = null;
  private events: RoomEvent[] = [];
  private archive: RoundTrail[] = [];

  constructor(
    readonly puzzles: Puzzle[],
    playerIds: string[],
    private readonly opts: MatchOptions,
  ) {
    this.rules = opts.rules ?? RULES;
    for (const id of playerIds) {
      this.players.set(id, { id, forfeited: false, connected: true, history: [], roundsSolved: 0, solveTimeMs: 0, place: null });
    }
  }

  get totalRounds(): number {
    return this.puzzles.length;
  }

  get currentPuzzle(): Puzzle | null {
    return this.round?.puzzle ?? null;
  }

  drainEvents(): RoomEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- lifecycle

  start(now: number): void {
    if (this.phase !== 'lobby') return;
    this.beginRound(0, now);
  }

  private beginRound(index: number, now: number): void {
    const puzzle = this.puzzles[index];
    const answers = new Set([puzzle.answer, ...puzzle.aliases].map(normalize));
    const map = new Map<string, MapEntry>();
    const ordered: [string, LinkTier][] = [
      ...puzzle.strong.map((w) => [w, 'strong'] as [string, LinkTier]),
      ...puzzle.weak.map((w) => [w, 'weak'] as [string, LinkTier]),
    ];
    ordered.forEach(([w, tier], rank) => {
      const n = normalize(w);
      if (!answers.has(n) && !map.has(n)) map.set(n, { tier, rank });
    });

    const players = new Map<string, PlayerRound>();
    for (const p of this.players.values()) {
      players.set(p.id, {
        status: p.forfeited ? 'forfeited' : p.place !== null ? 'spectating' : 'probing',
        probes: [],
        tried: new Set(),
        guesses: [],
        bestHit: null,
        fragment: null,
        letters: new Map(),
        lateLetterGiven: false,
        misses: 0,
        cluesBought: 0,
        clueCostPaid: 0,
        deadline: null,
        baseDeadline: null,
        solvedAt: null,
        blindHunch: false,
        firstCrack: false,
        breakdown: null,
        actionIds: new Set(),
      });
    }

    this.roundIndex = index;
    const letters = normalize(puzzle.answer).replace(/[^a-z]/g, '').split('');
    this.round = { puzzle, answers, letters, map, players, mainStartedAt: null, collapsed: false, firstCrackId: null };
    this.phase = 'intro';
    this.phaseEndsAt = now + this.rules.introMs;
  }

  /** Advance time. Call frequently; idempotent for a given `now`. */
  tick(now: number): void {
    const r = this.round;
    if (!r) return;
    switch (this.phase) {
      case 'intro':
        if (now >= this.phaseEndsAt!) {
          this.phase = 'probe';
          this.phaseEndsAt = now + this.rules.probeMs;
        }
        break;
      case 'probe':
        if (now >= this.phaseEndsAt! || this.allDoneProbing()) this.endProbe(now);
        break;
      case 'fragment':
        if (now >= this.phaseEndsAt!) this.beginMain(now);
        break;
      case 'main': {
        for (const pr of r.players.values()) {
          if (pr.status !== 'active') continue;
          if (now >= pr.deadline!) pr.status = 'timed_out';
          else if (!pr.lateLetterGiven && pr.deadline! - now <= this.rules.lateLetterAtMs) this.giveLateLetter(pr);
        }
        const cap = r.mainStartedAt! + hardCapMs(this.rules);
        if (now >= cap) {
          for (const pr of r.players.values()) if (pr.status === 'active') pr.status = 'timed_out';
        }
        if (![...r.players.values()].some((pr) => pr.status === 'active')) this.endRound(now);
        break;
      }
      case 'reveal':
        if (now >= this.phaseEndsAt!) {
          if (!this.matchOver && this.roundIndex + 1 < this.puzzles.length) this.beginRound(this.roundIndex + 1, now);
          else {
            this.fillPlacesByScore();
            this.phase = 'complete';
            this.phaseEndsAt = null;
          }
        }
        break;
    }
  }

  private allDoneProbing(): boolean {
    const r = this.round!;
    let anyone = false;
    for (const [id, pr] of r.players) {
      if (pr.status === 'forfeited' || !this.players.get(id)!.connected) continue;
      anyone = true;
      if (pr.status === 'probing') return false;
    }
    return anyone;
  }

  private endProbe(now: number): void {
    const r = this.round!;
    for (const pr of r.players.values()) {
      if (pr.status === 'forfeited') continue;
      pr.fragment = pr.bestHit
        ? { kind: 'link', word: pr.bestHit.word, tier: pr.bestHit.tier }
        : { kind: 'dead_air', text: r.puzzle.fallback };
      if (pr.status !== 'solved') {
        const pos = this.probeLetterPosition(pr);
        if (pos !== null) pr.letters.set(pos, r.letters[pos]);
      }
      if (pr.status === 'probing') pr.status = 'waiting';
    }
    this.phase = 'fragment';
    this.phaseEndsAt = now + this.rules.fragmentMs;
  }

  private beginMain(now: number): void {
    const r = this.round!;
    r.mainStartedAt = now;
    const base = now + this.rules.mainMs;
    for (const pr of r.players.values()) {
      if (pr.status !== 'waiting') continue;
      pr.status = 'active';
      pr.baseDeadline = base;
      pr.deadline = r.collapsed ? Math.min(base, now + this.rules.collapseMs) : base;
    }
    this.phase = 'main';
    this.phaseEndsAt = now + hardCapMs(this.rules);
    this.tick(now); // handles a round where everyone blind-hunched
  }

  private endRound(now: number): void {
    const r = this.round!;
    for (const [id, pr] of r.players) {
      const mp = this.players.get(id)!;
      pr.breakdown = this.score(pr);
      mp.history.push(pr.breakdown.total);
      if (pr.status === 'solved') {
        mp.roundsSolved++;
        mp.solveTimeMs += this.solveMs(pr) ?? 0;
      }
    }
    this.archiveRound();
    this.assignPlaces();
    this.phase = 'reveal';
    this.phaseEndsAt = now + this.rules.revealMs;
  }

  // ---------------------------------------------------------------- podium

  private rankOrder = (a: MatchPlayer, b: MatchPlayer) =>
    this.totalOf(b.id) - this.totalOf(a.id) || b.roundsSolved - a.roundsSolved || a.solveTimeMs - b.solveTimeMs;

  private sameRank(a: MatchPlayer, b: MatchPlayer): boolean {
    return this.rankOrder(a, b) === 0;
  }

  private get placedCount(): number {
    return [...this.players.values()].filter((p) => p.place !== null).length;
  }

  /** Places that must be decided before the match ends: 1st, 2nd, 3rd, fewer in small rooms. */
  get placesNeeded(): number {
    const contenders = [...this.players.values()].filter((p) => !p.forfeited || p.place !== null).length;
    return Math.max(1, Math.min(this.rules.podiumSize, contenders - 1));
  }

  get placesLeft(): number {
    return Math.max(0, this.placesNeeded - this.placedCount);
  }

  /** Everyone who crossed the target this round takes the next place, best total first. */
  private assignPlaces(): void {
    if (this.opts.targetScore <= 0) return;
    const crossers = [...this.players.values()]
      .filter((p) => p.place === null && !p.forfeited && this.totalOf(p.id) >= this.opts.targetScore)
      .sort(this.rankOrder);
    for (const p of crossers) {
      p.place = this.placedCount + 1;
      this.events.push({ kind: 'place', playerId: p.id, nickname: '', place: p.place, placesLeft: this.placesLeft });
    }
  }

  /** The bank ran out before the podium filled: open places go by score, unless tied. */
  private fillPlacesByScore(): void {
    const rest = [...this.players.values()].filter((p) => p.place === null && !p.forfeited).sort(this.rankOrder);
    for (let i = 0; i < rest.length && this.placesLeft > 0; i++) {
      if (rest[i + 1] && this.sameRank(rest[i], rest[i + 1])) break;
      rest[i].place = this.placedCount + 1;
    }
  }

  get matchOver(): boolean {
    if (this.opts.targetScore <= 0) return false;
    const unplaced = [...this.players.values()].filter((p) => p.place === null && !p.forfeited).length;
    return this.placesLeft === 0 || unplaced === 0;
  }

  placeOf(playerId: string): number | null {
    return this.players.get(playerId)?.place ?? null;
  }

  // ---------------------------------------------------------------- trails

  private archiveRound(): void {
    const r = this.round!;
    const start = r.mainStartedAt ?? 0;
    this.archive.push({
      round: this.roundIndex + 1,
      depth: r.puzzle.depth,
      answer: r.puzzle.answer,
      players: [...r.players].map(([id, pr]) => ({
        id,
        played: pr.status !== 'spectating' && pr.status !== 'forfeited',
        guesses: pr.guesses.map((g) => ({
          word: g.word,
          result: g.result.kind === 'correct' ? 'cracked' : g.result.kind === 'linked' ? g.result.tier : 'static',
          phase: g.phase,
          t: g.at - start,
        })),
        solved: pr.status === 'solved',
        blindHunch: pr.blindHunch,
        solveMs: this.solveMs(pr),
        cluesUsed: pr.cluesBought,
        total: pr.breakdown?.total ?? 0,
        fragment: pr.fragment,
      })),
    });
  }

  get trails(): RoundTrail[] {
    return this.archive;
  }

  // ---------------------------------------------------------------- letters

  /**
   * Deterministic: scan probes in the order sent, letters left to right; the
   * first letter that appears in the answer is revealed at its leftmost
   * still-hidden position.
   */
  private probeLetterPosition(pr: PlayerRound): number | null {
    const answer = this.round!.letters;
    for (const probe of pr.probes) {
      for (const ch of probe.replace(/[^a-z]/g, '')) {
        const pos = answer.findIndex((a, i) => a === ch && !pr.letters.has(i));
        if (pos !== -1) return pos;
      }
    }
    return null;
  }

  /** Second letter: next probe match if any, otherwise the leftmost hidden blank. */
  private giveLateLetter(pr: PlayerRound): void {
    pr.lateLetterGiven = true;
    const answer = this.round!.letters;
    if (pr.letters.size >= answer.length - 1) return; // never reveal the whole word
    let pos = this.probeLetterPosition(pr);
    if (pos === null) pos = answer.findIndex((_, i) => !pr.letters.has(i));
    if (pos !== -1) pr.letters.set(pos, answer[pos]);
  }

  // ---------------------------------------------------------------- scoring

  private score(pr: PlayerRound): Breakdown {
    const R = this.rules;
    const probe = pr.bestHit ? R.probeBonus[pr.bestHit.tier] : 0;
    const clues = pr.clueCostPaid ? -pr.clueCostPaid : 0;
    if (pr.status !== 'solved') {
      return { solve: 0, blindHunch: 0, probe, speed: 0, firstCrack: 0, clues, total: Math.max(0, probe + clues) };
    }
    const speed = pr.blindHunch
      ? R.speedBonusMax
      : Math.min(R.speedBonusMax, Math.max(0, Math.floor((pr.baseDeadline! - pr.solvedAt!) / 1000)));
    const b = {
      solve: R.solvePoints,
      blindHunch: pr.blindHunch ? R.blindHunchBonus : 0,
      probe,
      speed,
      firstCrack: pr.firstCrack ? R.firstCrackBonus : 0,
      clues,
    };
    const total = Math.max(0, b.solve + b.blindHunch + b.probe + b.speed + b.firstCrack + b.clues);
    return { ...b, total };
  }

  private solveMs(pr: PlayerRound): number | null {
    if (pr.status !== 'solved') return null;
    if (pr.blindHunch) return 0;
    return pr.solvedAt! - this.round!.mainStartedAt!;
  }

  // ---------------------------------------------------------------- actions

  private guard(playerId: string, actionId: string): PlayerRound | ActionFeedback {
    const pr = this.round?.players.get(playerId);
    if (!pr) return { kind: 'rejected', reason: 'Not in this match.' };
    if (pr.actionIds.has(actionId)) return { kind: 'rejected', reason: 'duplicate_action' };
    pr.actionIds.add(actionId);
    return pr;
  }

  private check(raw: string): { word: string } | ActionFeedback {
    if (raw.length > this.rules.maxGuessLength) return { kind: 'invalid', reason: 'Too long.' };
    const word = normalize(raw);
    if (!word) return { kind: 'invalid', reason: 'Type a word.' };
    return { word };
  }

  private lookupMap(word: string): (MapEntry & { word: string }) | null {
    const r = this.round!;
    let best: (MapEntry & { word: string }) | null = null;
    for (const f of wordForms(word)) {
      const e = r.map.get(f);
      if (e && (!best || e.rank < best.rank)) best = { ...e, word: f };
    }
    return best;
  }

  private isRealWord(word: string): boolean {
    const r = this.round!;
    if (r.answers.has(word)) return true;
    return wordForms(word).some((f) => r.map.has(f) || this.opts.lexicon.isWord(f));
  }

  private crack(playerId: string, pr: PlayerRound, now: number, blind: boolean): void {
    const r = this.round!;
    pr.status = 'solved';
    pr.solvedAt = now;
    pr.blindHunch = blind;
    if (!r.firstCrackId) {
      r.firstCrackId = playerId;
      pr.firstCrack = true;
      if (this.opts.collapse) {
        r.collapsed = true;
        if (this.phase === 'main') {
          for (const other of r.players.values()) {
            if (other.status === 'active') other.deadline = Math.min(other.deadline!, now + this.rules.collapseMs);
          }
        }
        this.events.push({ kind: 'collapse' });
      }
    }
    const elapsedMs = blind ? 0 : now - r.mainStartedAt!;
    this.events.push({ kind: 'crack', playerId, nickname: '', elapsedMs, blindHunch: blind });
  }

  probe(playerId: string, raw: string, actionId: string, now: number): ActionFeedback {
    const g = this.guard(playerId, actionId);
    if ('kind' in g) return g;
    const pr = g;
    if (this.phase !== 'probe' || now >= this.phaseEndsAt!) return { kind: 'too_late' };
    if (pr.status !== 'probing') return { kind: 'rejected', reason: 'No probes left.' };
    const c = this.check(raw);
    if ('kind' in c) return c;
    const { word } = c;
    if (pr.tried.has(word)) return { kind: 'duplicate', word };
    if (!this.isRealWord(word)) return { kind: 'invalid', reason: 'Not in the Receiver’s lexicon.' };

    pr.tried.add(word);
    pr.probes.push(word);
    const r = this.round!;
    if (r.answers.has(word)) {
      pr.guesses.push({ word, result: { kind: 'correct' }, phase: 'probe', at: now });
      this.crack(playerId, pr, now, true);
      return { kind: 'blind_hunch', word };
    }
    pr.misses++;
    const hit = this.lookupMap(word);
    pr.guesses.push({ word, result: hit ? { kind: 'linked', tier: hit.tier } : { kind: 'static' }, phase: 'probe', at: now });
    if (hit && (!pr.bestHit || hit.rank < pr.bestHit.rank)) pr.bestHit = hit;
    if (pr.probes.length >= this.rules.probesPerRound) pr.status = 'waiting';
    // Probe results stay hidden until the fragment reveal.
    return { kind: 'probe_accepted', word };
  }

  guess(playerId: string, raw: string, actionId: string, now: number): ActionFeedback {
    const g = this.guard(playerId, actionId);
    if ('kind' in g) return g;
    const pr = g;
    if (this.phase !== 'main' || pr.status !== 'active') return { kind: 'rejected', reason: 'Not decoding right now.' };
    if (now >= pr.deadline!) {
      pr.status = 'timed_out';
      return { kind: 'too_late' };
    }
    const c = this.check(raw);
    if ('kind' in c) return c;
    const { word } = c;
    if (pr.tried.has(word)) return { kind: 'duplicate', word };
    if (!this.isRealWord(word)) return { kind: 'invalid', reason: 'Not in the Receiver’s lexicon.' };

    pr.tried.add(word);
    const r = this.round!;
    if (r.answers.has(word)) {
      pr.guesses.push({ word, result: { kind: 'correct' }, phase: 'main', at: now });
      this.crack(playerId, pr, now, false);
      return { kind: 'correct', word };
    }
    pr.misses++;
    const hit = this.lookupMap(word);
    if (hit) {
      pr.guesses.push({ word, result: { kind: 'linked', tier: hit.tier }, phase: 'main', at: now });
      return { kind: 'linked', word, tier: hit.tier };
    }
    pr.guesses.push({ word, result: { kind: 'static' }, phase: 'main', at: now });
    return { kind: 'static', word };
  }

  buyClue(playerId: string, actionId: string, now: number): ActionFeedback {
    const g = this.guard(playerId, actionId);
    if ('kind' in g) return g;
    const pr = g;
    const R = this.rules;
    if (this.phase !== 'main' || pr.status !== 'active') return { kind: 'rejected', reason: 'Not decoding right now.' };
    if (now >= pr.deadline!) {
      pr.status = 'timed_out';
      return { kind: 'too_late' };
    }
    if (pr.misses < R.missesToUnlockClues) return { kind: 'rejected', reason: 'Intel is still locked.' };
    const index = pr.cluesBought;
    if (index >= R.clueCosts.length) return { kind: 'rejected', reason: 'No intel left.' };
    if (index === R.clueCosts.length - 1 && pr.deadline! - now > R.finalClueAtMs) {
      return { kind: 'rejected', reason: `The last intel only comes through in the final ${R.finalClueAtMs / 1000} seconds.` };
    }
    const cost = R.clueCosts[index];
    if (R.solvePoints - pr.clueCostPaid < cost) return { kind: 'rejected', reason: 'Not enough points.' };

    pr.cluesBought++;
    pr.clueCostPaid += cost;
    const cap = this.round!.mainStartedAt! + hardCapMs(R);
    pr.deadline = Math.min(pr.deadline! + R.clueBonusMs, cap);
    return { kind: 'clue', index, text: this.round!.puzzle.clues[index], cost };
  }

  // ---------------------------------------------------------------- presence

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (p) p.connected = connected;
  }

  forfeit(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.forfeited) return;
    p.forfeited = true;
    const pr = this.round?.players.get(playerId);
    if (pr && (pr.status === 'probing' || pr.status === 'waiting' || pr.status === 'active')) pr.status = 'forfeited';
  }

  // ---------------------------------------------------------------- views

  statusOf(playerId: string): PlayerRoundStatus | null {
    return this.round?.players.get(playerId)?.status ?? null;
  }

  probesUsed(playerId: string): number {
    return this.round?.players.get(playerId)?.probes.length ?? 0;
  }

  /** True once any player's total has reached the target score. */
  get targetReached(): boolean {
    if (this.opts.targetScore <= 0) return false;
    return [...this.players.keys()].some((id) => this.totalOf(id) >= this.opts.targetScore);
  }

  /** Whoever took 1st place, once the match is complete. */
  get winnerId(): string | null {
    if (this.phase !== 'complete') return null;
    return [...this.players.values()].find((p) => p.place === 1)?.id ?? null;
  }

  /**
   * The room-visible guess feed. Probe words stay hidden while probing; a
   * correct guess shows as "cracked" without the word.
   */
  publicFeed(playerId: string): PublicGuess[] {
    const pr = this.round?.players.get(playerId);
    if (!pr) return [];
    const probing = this.phase === 'intro' || this.phase === 'probe';
    return pr.guesses
      .filter((g) => !(probing && g.phase === 'probe'))
      .map((g) => ({
        word: g.result.kind === 'correct' ? null : g.word,
        result: g.result.kind === 'correct' ? 'cracked' : g.result.kind === 'linked' ? g.result.tier : 'static',
        phase: g.phase,
      }));
  }

  get depth(): Puzzle['depth'] | null {
    return this.round?.puzzle.depth ?? null;
  }

  totalOf(playerId: string): number {
    return this.players.get(playerId)?.history.reduce((a, b) => a + b, 0) ?? 0;
  }

  get mainStartedAt(): number | null {
    return this.round?.mainStartedAt ?? null;
  }

  get collapsed(): boolean {
    return this.round?.collapsed ?? false;
  }

  get firstCrackId(): string | null {
    return this.round?.firstCrackId ?? null;
  }

  get wordLength(): number | null {
    return this.round ? this.round.letters.length : null;
  }


  privateView(playerId: string): PrivateView | null {
    const pr = this.round?.players.get(playerId);
    if (!pr) return null;
    const R = this.rules;
    const showFragment = this.phase !== 'intro' && this.phase !== 'probe';
    return {
      playerId,
      status: pr.status,
      probes: pr.probes,
      fragment: showFragment ? pr.fragment : null,
      // Probe results are hidden until the fragment reveal.
      guesses: showFragment
        ? pr.guesses
        : pr.guesses.map((g) => (g.result.kind === 'correct' ? g : { ...g, result: { kind: 'static' } as const })),
      misses: pr.misses,
      cluesBought: pr.cluesBought,
      clues: this.round!.puzzle.clues.slice(0, pr.cluesBought),
      nextClueCost: pr.cluesBought < R.clueCosts.length ? R.clueCosts[pr.cluesBought] : null,
      cluesUnlocked: pr.misses >= R.missesToUnlockClues,
      letters: this.round!.letters.map((ch, i) => (showFragment ? pr.letters.get(i) ?? null : null)),
      deadline: pr.deadline,
      baseDeadline: pr.baseDeadline,
      roundPoints: R.solvePoints - pr.clueCostPaid,
      breakdown: pr.breakdown,
    };
  }

  revealPlayers(): RevealPlayer[] | null {
    if (this.phase !== 'reveal' && this.phase !== 'complete') return null;
    return [...this.round!.players].map(([id, pr]) => ({
      id,
      fragment: pr.fragment,
      breakdown: pr.breakdown ?? this.score(pr),
      cluesUsed: pr.cluesBought,
      solved: pr.status === 'solved',
      blindHunch: pr.blindHunch,
      solveMs: this.solveMs(pr),
    }));
  }

  /**
   * Podium places first (in the order they were won), then everyone else by
   * total, rounds solved, lower solve time. Unplaced players at the end of a
   * match are losers. Ties among them share a rank.
   */
  standings(): FinalRow[] {
    const all = [...this.players.values()];
    const placed = all.filter((p) => p.place !== null).sort((a, b) => a.place! - b.place!);
    const rest = all.filter((p) => p.place === null).sort(this.rankOrder);
    const done = this.phase === 'complete';
    let rank = 0;
    return [...placed, ...rest].map((p, i, rows) => {
      const prev = rows[i - 1];
      const tied = prev && prev.place === null && p.place === null && this.sameRank(prev, p);
      if (!tied) rank = i + 1;
      return { playerId: p.id, rank, total: this.totalOf(p.id), history: p.history, place: p.place, loser: done && p.place === null };
    });
  }
}
