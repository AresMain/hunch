// A room: lobby membership, host, settings, and the live Match. Owns no
// sockets; the server passes a `send` function per member.

import { Match } from '../engine/match';
import { RULES } from '../engine/rules';
import type { Lexicon } from '../engine/normalize';
import type {
  ActionFeedback,
  ClientMessage,
  CrewRecord,
  PublicView,
  RoomEvent,
  RoomSettings,
  ServerMessage,
} from '../shared/types';
import { TARGET_OPTIONS } from '../shared/types';
import { pickPuzzles } from './puzzles';

export const ROOM_CAPACITY = 8;
export const RECONNECT_GRACE_MS = 60_000;

export interface Member {
  id: string;
  nickname: string;
  ready: boolean;
  joinedAt: number;
  connected: boolean;
  disconnectedAt: number | null;
  send: ((msg: ServerMessage) => void) | null;
}

export class Room {
  readonly members = new Map<string, Member>();
  hostId: string | null = null;
  settings: RoomSettings = { collapse: true, targetScore: 2000 };
  match: Match | null = null;
  lastActiveAt: number;
  private readonly seenPuzzles = new Set<string>();
  /** Record across every match played in this room, keyed by player id. */
  private readonly board = new Map<string, CrewRecord>();
  private recorded = false;
  private lastPublicSig = '';

  constructor(
    readonly code: string,
    private readonly lexicon: Lexicon,
    now: number,
  ) {
    this.lastActiveAt = now;
  }

  // ---------------------------------------------------------------- membership

  join(id: string, rawNickname: string, now: number): string | null {
    if (this.members.has(id)) return null;
    if (this.match && this.match.phase !== 'complete') return 'That match has already started.';
    if (this.members.size >= ROOM_CAPACITY) return 'That room is full.';
    const nickname = this.uniqueNickname(rawNickname);
    if (!nickname) return 'Pick a nickname (letters or numbers).';
    this.members.set(id, { id, nickname, ready: false, joinedAt: now, connected: true, disconnectedAt: null, send: null });
    if (!this.hostId) this.hostId = id;
    this.lastActiveAt = now;
    return null;
  }

  private uniqueNickname(raw: string): string | null {
    const base = raw
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 16);
    if (!/[\p{L}\p{N}]/u.test(base)) return null;
    const taken = new Set([...this.members.values()].map((m) => m.nickname.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i++) {
      const n = `${base.slice(0, 13)} ${i}`;
      if (!taken.has(n.toLowerCase())) return n;
    }
    return null;
  }

  attach(id: string, send: (msg: ServerMessage) => void, now: number): void {
    const m = this.members.get(id);
    if (!m) return;
    m.send = send;
    m.connected = true;
    m.disconnectedAt = null;
    this.match?.setConnected(id, true);
    this.lastActiveAt = now;
    this.broadcast(now, true);
  }

  detach(id: string, now: number): void {
    const m = this.members.get(id);
    if (!m) return;
    m.send = null;
    m.connected = false;
    m.disconnectedAt = now;
    this.match?.setConnected(id, false);
    this.reassignHostIfNeeded();
    this.broadcast(now, true);
  }

  leave(id: string, now: number): void {
    if (!this.members.has(id)) return;
    if (this.match && this.match.phase !== 'complete') this.match.forfeit(id);
    this.members.delete(id);
    if (this.hostId === id) this.hostId = null;
    this.reassignHostIfNeeded();
    this.broadcast(now, true);
  }

  private reassignHostIfNeeded(): void {
    const host = this.hostId ? this.members.get(this.hostId) : null;
    if (host?.connected) return;
    const next = [...this.members.values()]
      .filter((m) => m.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) this.hostId = next.id;
    else if (!host) this.hostId = null;
  }

  get isEmpty(): boolean {
    return this.members.size === 0;
  }

  get anyoneConnected(): boolean {
    return [...this.members.values()].some((m) => m.connected);
  }

  // ---------------------------------------------------------------- messages

  handle(id: string, msg: ClientMessage, now: number): void {
    this.lastActiveAt = now;
    const m = this.members.get(id);
    if (!m) return;
    switch (msg.t) {
      case 'ready':
        if (!this.match) m.ready = !!msg.ready;
        break;
      case 'settings':
        if (id !== this.hostId || this.match) return;
        if (typeof msg.settings.collapse === 'boolean') this.settings.collapse = msg.settings.collapse;
        if ((TARGET_OPTIONS as readonly number[]).includes(msg.settings.targetScore as number)) {
          this.settings.targetScore = msg.settings.targetScore as number;
        }
        break;
      case 'start':
        if (id !== this.hostId || this.match) return;
        this.startMatch(now);
        break;
      case 'rematch':
        if (id !== this.hostId || this.match?.phase !== 'complete') return;
        this.match = null;
        for (const [mid, mem] of this.members) {
          if (!mem.connected) this.members.delete(mid);
          else mem.ready = mid === this.hostId;
        }
        break;
      case 'probe':
      case 'guess':
      case 'clue': {
        if (!this.match) return;
        const actionId = typeof msg.actionId === 'string' ? msg.actionId.slice(0, 64) : '';
        if (!actionId) return;
        let fb: ActionFeedback;
        if (msg.t === 'probe') fb = this.match.probe(id, String(msg.word ?? ''), actionId, now);
        else if (msg.t === 'guess') fb = this.match.guess(id, String(msg.word ?? ''), actionId, now);
        else fb = this.match.buyClue(id, actionId, now);
        if (fb.kind === 'rejected' && fb.reason === 'duplicate_action') return;
        m.send?.({ t: 'feedback', actionId, feedback: fb });
        this.flushEvents();
        break;
      }
      default:
        return;
    }
    this.broadcast(now, true);
  }

  private startMatch(now: number): void {
    const ids = [...this.members.values()].filter((m) => m.connected).map((m) => m.id);
    if (ids.length === 0) return;
    const puzzles = pickPuzzles(RULES.maxRounds, this.seenPuzzles);
    this.recorded = false;
    this.match = new Match(puzzles, ids, {
      collapse: this.settings.collapse,
      targetScore: this.settings.targetScore,
      lexicon: this.lexicon,
    });
    this.match.start(now);
  }

  // ---------------------------------------------------------------- clock

  tick(now: number): void {
    // Forfeit players whose reconnect grace has expired.
    for (const m of [...this.members.values()]) {
      if (m.connected || m.disconnectedAt === null) continue;
      if (now - m.disconnectedAt < RECONNECT_GRACE_MS) continue;
      if (this.match && this.match.phase !== 'complete') {
        this.match.forfeit(m.id);
        m.disconnectedAt = null; // forfeited once; keep their score row
      } else {
        this.members.delete(m.id);
        this.reassignHostIfNeeded();
      }
    }
    if (this.match) {
      this.match.tick(now);
      const current = this.match.currentPuzzle;
      if (current) this.seenPuzzles.add(current.id);
      this.flushEvents();
      if (this.match.phase === 'complete' && !this.recorded) this.recordMatch();
    }
    this.broadcast(now, false);
  }

  private recordMatch(): void {
    this.recorded = true;
    for (const row of this.match!.standings()) {
      const nickname = this.members.get(row.playerId)?.nickname ?? this.board.get(row.playerId)?.nickname ?? '?';
      const rec = this.board.get(row.playerId) ?? { id: row.playerId, nickname, matches: 0, wins: 0, podiums: 0, losses: 0, points: 0 };
      rec.nickname = nickname;
      rec.matches++;
      rec.points += row.total;
      if (row.place === 1) rec.wins++;
      if (row.place !== null) rec.podiums++;
      if (row.loser) rec.losses++;
      this.board.set(row.playerId, rec);
    }
  }

  private flushEvents(): void {
    if (!this.match) return;
    for (const event of this.match.drainEvents()) {
      const e: RoomEvent =
        event.kind === 'crack' || event.kind === 'place'
          ? { ...event, nickname: this.members.get(event.playerId)?.nickname ?? '?' }
          : event;
      for (const m of this.members.values()) m.send?.({ t: 'event', event: e });
    }
  }

  // ---------------------------------------------------------------- views

  publicView(): PublicView {
    const match = this.match;
    const phase = match?.phase ?? 'lobby';
    const revealPlayers = match?.revealPlayers() ?? null;
    const puzzle = match?.currentPuzzle ?? null;
    return {
      code: this.code,
      phase,
      settings: this.settings,
      round: match ? match.roundIndex + 1 : 0,
      totalRounds: match?.totalRounds ?? RULES.maxRounds,
      depth: match?.depth ?? null,
      targetScore: this.settings.targetScore,
      winnerId: match?.winnerId ?? null,
      placesLeft: match?.placesLeft ?? 0,
      wordLength: match ? match.wordLength : null,
      phaseEndsAt: match?.phaseEndsAt ?? null,
      mainStartedAt: match?.mainStartedAt ?? null,
      collapsed: match?.collapsed ?? false,
      firstCrackId: match?.firstCrackId ?? null,
      players: [...this.members.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          id: m.id,
          nickname: m.nickname,
          isHost: m.id === this.hostId,
          ready: m.ready || m.id === this.hostId,
          connected: m.connected,
          forfeited: match?.players.get(m.id)?.forfeited ?? false,
          totalScore: match?.totalOf(m.id) ?? 0,
          roundsSolved: match?.players.get(m.id)?.roundsSolved ?? 0,
          status: match?.statusOf(m.id) ?? null,
          probesUsed: match?.probesUsed(m.id) ?? 0,
          feed: match?.publicFeed(m.id) ?? [],
          place: match?.placeOf(m.id) ?? null,
        })),
      reveal:
        revealPlayers && puzzle
          ? { answer: puzzle.answer, definition: puzzle.definition, category: puzzle.category, players: revealPlayers }
          : null,
      final: phase === 'complete' && match ? match.standings() : null,
      trails: phase === 'complete' && match ? match.trails : null,
      board: [...this.board.values()].sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.points - a.points),
    };
  }

  /** Sends state to everyone. Without `force`, only when the public view changed. */
  broadcast(now: number, force: boolean): void {
    const pub = this.publicView();
    const sig = JSON.stringify(pub);
    if (!force && sig === this.lastPublicSig) return;
    this.lastPublicSig = sig;
    for (const m of this.members.values()) {
      m.send?.({ t: 'state', serverNow: now, pub, me: this.match?.privateView(m.id) ?? null });
    }
  }
}
