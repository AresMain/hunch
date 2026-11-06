// WebSocket client with reconnect, session token persistence and server
// clock-offset estimation. The server is authoritative; this only mirrors it.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ActionFeedback,
  ClientMessage,
  PrivateView,
  PublicView,
  RoomEvent,
  ServerMessage,
} from '../shared/types';

const TOKEN_KEY = 'hunch.identity';

/**
 * The browser remembers who you are (localStorage), so a guest keeps their
 * seat, name and record without signing in. `?fresh` uses a per-tab identity
 * instead, for testing several players on one machine.
 */
const FRESH = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh');
function store(key: string, value?: string): string | null {
  try {
    const s = FRESH ? sessionStorage : localStorage;
    if (value === undefined) return s.getItem(key);
    s.setItem(key, value);
  } catch {
    /* storage may be unavailable */
  }
  return null;
}

export interface NetState {
  connected: boolean;
  /** Another tab of this browser took the seat. */
  displaced: boolean;
  playerId: string | null;
  pub: PublicView | null;
  me: PrivateView | null;
  error: string | null;
}

type FeedbackListener = (actionId: string | null, fb: ActionFeedback) => void;
type EventListener = (e: RoomEvent) => void;

class Net {
  state: NetState = { connected: false, displaced: false, playerId: null, pub: null, me: null, error: null };
  /** serverNow ≈ Date.now() + offset */
  offset = 0;
  private bestRtt = Infinity;
  private ws: WebSocket | null = null;
  private retry = 0;
  private subs = new Set<() => void>();
  private fbSubs = new Set<FeedbackListener>();
  private evSubs = new Set<EventListener>();
  private queue: ClientMessage[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the last unanswered ping went out; null when the line is healthy. */
  private pingSentAt: number | null = null;

  connect(): void {
    if (this.state.displaced) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.bestRtt = Infinity; // re-sync the clock: phones drift while asleep
      this.pingSentAt = null;
      ws.send(JSON.stringify({ t: 'hello', token: store(TOKEN_KEY) ?? undefined }));
      this.ping();
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      this.onMessage(JSON.parse(e.data) as ServerMessage);
    };
    ws.onclose = (e) => {
      if (ws !== this.ws) return; // a replaced socket finishing up
      this.set({ connected: false });
      if (e.code === 4001 || this.state.displaced) return; // another tab holds the seat
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = Math.min(4000, 300 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  /** Drop the current socket (even a silently dead one) and dial again now. */
  private redial(): void {
    if (this.state.displaced) return;
    const old = this.ws;
    this.ws = null;
    if (old) {
      old.onclose = old.onmessage = old.onopen = null;
      try {
        old.close();
      } catch {
        /* already gone */
      }
    }
    this.set({ connected: false });
    this.retry = 0;
    this.connect();
  }

  private ping(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.pingSentAt ??= Date.now();
    this.ws.send(JSON.stringify({ t: 'ping', at: Date.now() } satisfies ClientMessage));
  }

  /**
   * Phones freeze sockets in the background and often hand back a socket that
   * looks open but is dead. Every few seconds: if a ping has gone unanswered
   * too long, redial. Called also on resume, focus and network changes.
   */
  check(urgent = false): void {
    if (this.state.displaced) return;
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return this.redial();
    if (ws.readyState === WebSocket.CONNECTING) return;
    const limit = urgent ? 2500 : 6000;
    if (this.pingSentAt !== null && Date.now() - this.pingSentAt > limit) return this.redial();
    this.ping();
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome': {
        store(TOKEN_KEY, msg.token);
        // We were in a room, reconnected, and the server no longer has it:
        // it restarted. Say so rather than silently dropping to the home screen.
        const lost = this.state.pub !== null && msg.playerId === null;
        this.set({
          connected: true,
          playerId: msg.playerId,
          ...(lost ? { pub: null, me: null } : {}),
          error: lost ? 'The server restarted and your room was closed. Start a new one or rejoin with a fresh code.' : null,
        });
        for (const q of this.queue.splice(0)) this.sendRaw(q);
        break;
      }
      case 'state':
        if (this.bestRtt === Infinity) this.offset = msg.serverNow - Date.now();
        this.set({ pub: msg.pub, me: msg.me, error: null });
        break;
      case 'pong': {
        this.pingSentAt = null;
        const now = Date.now();
        const rtt = now - msg.at;
        if (rtt < this.bestRtt) {
          this.bestRtt = rtt;
          this.offset = msg.serverNow + rtt / 2 - now;
        }
        break;
      }
      case 'feedback':
        for (const f of this.fbSubs) f(msg.actionId, msg.feedback);
        break;
      case 'event':
        for (const f of this.evSubs) f(msg.event);
        break;
      case 'error':
        this.set({ error: msg.message });
        break;
      case 'displaced':
        this.set({ displaced: true, connected: false });
        break;
    }
  }

  private sendRaw(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  send(msg: ClientMessage): void {
    if (this.state.connected) this.sendRaw(msg);
    else this.queue.push(msg);
  }

  now(): number {
    return Date.now() + this.offset;
  }

  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  private set(patch: Partial<NetState>): void {
    if (patch.error) {
      // Messages clear themselves; nothing should sit on screen forever.
      if (this.errorTimer) clearTimeout(this.errorTimer);
      this.errorTimer = setTimeout(() => this.set({ error: null }), 7000);
    }
    this.state = { ...this.state, ...patch };
    for (const s of this.subs) s();
  }

  /** Take the seat back from another tab. */
  reclaim(): void {
    this.set({ displaced: false });
    this.retry = 0;
    this.connect();
  }

  clearError(): void {
    this.set({ error: null });
  }

  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  };
  onFeedback(fn: FeedbackListener): () => void {
    this.fbSubs.add(fn);
    return () => void this.fbSubs.delete(fn);
  }
  onEvent(fn: EventListener): () => void {
    this.evSubs.add(fn);
    return () => void this.evSubs.delete(fn);
  }
}

export const net = new Net();
net.connect();
setInterval(() => net.check(), 5_000);
// Resume from background, refocus, or network back: verify the line right away.
const wake = () => net.check(true);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());
window.addEventListener('pageshow', wake);
window.addEventListener('focus', wake);
window.addEventListener('online', wake);
window.addEventListener('offline', () => net.check(true));

export function useNet(): NetState {
  return useSyncExternalStore(net.subscribe, () => net.state);
}

export function actionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Re-renders at `fps` while mounted; returns server-synced now. */
export function useServerNow(fps = 10): number {
  const [now, setNow] = useState(() => net.now());
  const raf = useRef(0);
  useEffect(() => {
    let last = 0;
    const loop = (t: number) => {
      if (t - last >= 1000 / fps) {
        last = t;
        setNow(net.now());
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [fps]);
  return now;
}
