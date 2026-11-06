// Types shared by engine, server and client. Nothing in here may carry the
// answer, the Signal Map or unpurchased clues except where marked server-only.

/** 1 Topside … 5 The Abyss. Deeper is harder. */
export type Depth = 1 | 2 | 3 | 4 | 5;

export const DEPTH_NAMES: Record<Depth, string> = {
  1: 'Topside',
  2: 'The Lanes',
  3: 'Undercity',
  4: 'The Sump',
  5: 'The Abyss',
};
export type LinkTier = 'strong' | 'weak';

/** Server-only. Never serialize to a client. */
export interface Puzzle {
  id: string;
  answer: string;
  aliases: string[];
  definition: string;
  category: string;
  depth: Depth;
  /** Shown on Dead Air. A broad category nudge. */
  fallback: string;
  /** Subtle → distinctive → near-reveal. The last one is a last-moments clue. */
  clues: [string, string, string];
  /** Editor-ranked, closest first. */
  strong: string[];
  weak: string[];
}

export type MatchPhase = 'lobby' | 'intro' | 'probe' | 'fragment' | 'main' | 'reveal' | 'complete';
/** `spectating`: already took a podium place; sits out while the rest fight on. */
export type PlayerRoundStatus = 'probing' | 'waiting' | 'active' | 'solved' | 'timed_out' | 'forfeited' | 'spectating';

export type Fragment =
  | { kind: 'link'; word: string; tier: LinkTier }
  | { kind: 'dead_air'; text: string };

export interface Breakdown {
  solve: number;
  blindHunch: number;
  probe: number;
  speed: number;
  firstCrack: number;
  clues: number; // negative or zero
  total: number;
}

export type GuessResult =
  | { kind: 'static' }
  | { kind: 'linked'; tier: LinkTier }
  | { kind: 'correct' };

export interface GuessEntry {
  word: string;
  result: GuessResult;
  phase: 'probe' | 'main';
  /** Server time the guess was accepted. */
  at: number;
}

/** One guess in a player's after-match trail. */
export interface TrailGuess {
  word: string;
  result: 'static' | 'strong' | 'weak' | 'cracked';
  phase: 'probe' | 'main';
  /** ms since decoding began; probes are negative. */
  t: number;
}

export interface RoundTrail {
  round: number;
  depth: Depth;
  answer: string;
  players: {
    id: string;
    /** False when the player sat the round out (spectating or gone). */
    played: boolean;
    guesses: TrailGuess[];
    solved: boolean;
    blindHunch: boolean;
    solveMs: number | null;
    cluesUsed: number;
    total: number;
    fragment: Fragment | null;
  }[];
}

/** A player's record across every match played in this room. */
export interface CrewRecord {
  id: string;
  nickname: string;
  matches: number;
  wins: number;
  podiums: number;
  losses: number;
  points: number;
}

export interface FinalRow {
  playerId: string;
  rank: number;
  total: number;
  history: number[];
  /** Podium place won by crossing the target (or filled by score if the bank ran out). */
  place: number | null;
  loser: boolean;
}

// ---------- views ----------

/** What the room sees of a player's guess. A correct guess never shows its word. */
export interface PublicGuess {
  word: string | null;
  result: 'static' | 'strong' | 'weak' | 'cracked';
  phase: 'probe' | 'main';
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  forfeited: boolean;
  totalScore: number;
  roundsSolved: number;
  /** Coarse round status only. */
  status: PlayerRoundStatus | null;
  /** Count only while probing; probe words appear once probing ends. */
  probesUsed: number;
  place: number | null;
  feed: PublicGuess[];
}

export interface RevealPlayer {
  id: string;
  fragment: Fragment | null;
  breakdown: Breakdown;
  cluesUsed: number;
  solved: boolean;
  blindHunch: boolean;
  solveMs: number | null;
}

export interface RoomSettings {
  collapse: boolean;
  /** First to reach this many points wins. */
  targetScore: number;
}

export const TARGET_OPTIONS = [1000, 2000, 3000, 5000] as const;

export interface PublicView {
  code: string;
  phase: MatchPhase;
  settings: RoomSettings;
  round: number; // 1-based, 0 in lobby
  /** Hard cap on rounds; the race usually ends earlier. */
  totalRounds: number;
  depth: Depth | null;
  targetScore: number;
  /** Set when the match completes. */
  winnerId: string | null;
  wordLength: number | null;
  phaseEndsAt: number | null;
  mainStartedAt: number | null;
  collapsed: boolean;
  firstCrackId: string | null;
  players: PublicPlayer[];
  /** Only during reveal / complete. */
  reveal: {
    answer: string;
    definition: string;
    category: string;
    players: RevealPlayer[];
  } | null;
  /** Only when complete. Ranked. */
  final: FinalRow[] | null;
  /** Only when complete: every player's guesses, round by round. */
  trails: RoundTrail[] | null;
  /** Room record across matches (rematches keep it). */
  board: CrewRecord[];
  /** Podium places still open in a live match. */
  placesLeft: number;
}

export interface PrivateView {
  playerId: string;
  status: PlayerRoundStatus | null;
  probes: string[];
  fragment: Fragment | null;
  guesses: GuessEntry[];
  misses: number;
  cluesBought: number;
  clues: string[];
  nextClueCost: number | null;
  cluesUnlocked: boolean;
  /** One entry per answer letter; null = still hidden. */
  letters: (string | null)[];
  deadline: number | null;
  baseDeadline: number | null;
  roundPoints: number; // 500 minus clue costs paid
  breakdown: Breakdown | null;
}

// ---------- protocol ----------

export type ClientMessage =
  | { t: 'hello'; token?: string }
  | { t: 'create'; nickname: string }
  | { t: 'join'; code: string; nickname: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'probe'; word: string; actionId: string }
  | { t: 'guess'; word: string; actionId: string }
  | { t: 'clue'; actionId: string }
  | { t: 'rematch' }
  | { t: 'leave' }
  | { t: 'ping'; at: number };

export type ActionFeedback =
  | { kind: 'probe_accepted'; word: string }
  | { kind: 'blind_hunch'; word: string }
  | { kind: 'static'; word: string }
  | { kind: 'linked'; word: string; tier: LinkTier }
  | { kind: 'correct'; word: string }
  | { kind: 'duplicate'; word: string }
  | { kind: 'invalid'; reason: string }
  | { kind: 'too_late' }
  | { kind: 'clue'; index: number; text: string; cost: number }
  | { kind: 'rejected'; reason: string };

export type RoomEvent =
  | { kind: 'crack'; playerId: string; nickname: string; elapsedMs: number; blindHunch: boolean }
  | { kind: 'collapse' }
  | { kind: 'place'; playerId: string; nickname: string; place: number; placesLeft: number };

export type ServerMessage =
  | { t: 'welcome'; token: string; playerId: string | null }
  | { t: 'state'; serverNow: number; pub: PublicView | null; me: PrivateView | null }
  | { t: 'feedback'; actionId: string | null; feedback: ActionFeedback }
  | { t: 'event'; event: RoomEvent }
  | { t: 'error'; message: string }
  /** This browser identity was opened in another tab, which now holds the seat. */
  | { t: 'displaced' }
  | { t: 'pong'; at: number; serverNow: number };
