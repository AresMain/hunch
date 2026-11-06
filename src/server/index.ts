// HTTP + WebSocket entry point. In development Vite serves the client and
// proxies /ws here; in production this also serves the built client from dist/.
//
// Environment (all optional):
//   PORT             listen port (default 8787)
//   NODE_ENV         'production' enables origin checks and long-lived caching
//   ALLOWED_ORIGINS  comma-separated origins allowed to open a socket
//                    (default in production: the request's own host)
//   MAX_ROOMS        total live rooms (default 5000)
//   MAX_CONN_PER_IP  open sockets per address (default 40; party Wi-Fi shares one IP)
//   DRAIN_MAX_MS     how long a deploy waits for live matches (default 240000)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize as normalizePath } from 'node:path';
import { gzipSync } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types';
import { loadLexicon } from './lexicon';
import { ALL_PUZZLES } from './puzzles';
import { Room } from './room';

const PORT = Number(process.env.PORT ?? 8787);
const PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 5000);
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP ?? 40);
const DRAIN_MAX_MS = Number(process.env.DRAIN_MAX_MS ?? 240_000);
const ROOMS_PER_IP_PER_10MIN = 30;

const TICK_MS = 200;
const ROOM_IDLE_EXPIRY_MS = 15 * 60_000;
const SESSION_IDLE_MS = 6 * 60 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O
const RATE = { burst: 10, perSecond: 6 };

const lexicon = loadLexicon();
const rooms = new Map<string, Room>();
let draining = false;

interface Session {
  token: string;
  playerId: string;
  roomCode: string | null;
  /** The socket currently speaking for this identity (one tab at a time). */
  ws: WebSocket | null;
  lastSeen: number;
}

/** Browser identities are random, unguessable tokens kept in the browser's storage. */
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
const sessions = new Map<string, Session>();

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

function newRoomCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
}

function clientIp(req: IncomingMessage): string {
  const fly = req.headers['fly-client-ip'];
  if (typeof fly === 'string' && fly) return fly;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

// ------------------------------------------------------------------ static

const DIST = join(process.cwd(), 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt']);
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

/** Files are immutable once built, so cache them (and their gzip) in memory. */
const fileCache = new Map<string, { raw: Buffer; gz: Buffer | null }>();
function loadFile(file: string) {
  let hit = fileCache.get(file);
  if (!hit) {
    const raw = readFileSync(file);
    hit = { raw, gz: COMPRESSIBLE.has(extname(file)) && raw.length > 1024 ? gzipSync(raw) : null };
    fileCache.set(file, hit);
  }
  return hit;
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('HUNCH server running. In development open the Vite URL (npm run dev).');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://x');
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = normalizePath(join(DIST, path));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const ext = extname(file);
  const { raw, gz } = loadFile(file);
  const useGz = gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    // Vite fingerprints everything under /assets; the HTML must always revalidate.
    'cache-control': file.includes(`${DIST}/assets/`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...(useGz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : useGz ? gz : raw);
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, draining, rooms: rooms.size, sockets: wss.clients.size, puzzles: ALL_PUZZLES.length }));
    return;
  }
  serveStatic(req, res);
});

// ------------------------------------------------------------------ sockets

const connPerIp = new Map<string, number>();
const roomsCreatedByIp = new Map<string, number[]>();

function originAllowed(req: IncomingMessage): boolean {
  if (!PROD) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin);
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({
  server: http,
  path: '/ws',
  maxPayload: 4096,
  verifyClient: ({ req }, done) => {
    if (!originAllowed(req)) return done(false, 403, 'Origin not allowed');
    if ((connPerIp.get(clientIp(req)) ?? 0) >= MAX_CONN_PER_IP) return done(false, 429, 'Too many connections');
    done(true);
  },
});

/** Sockets that answered the last protocol ping. Dead phones never do. */
const alive = new WeakSet<WebSocket>();
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate(); // fires 'close' → the room marks the player reconnecting
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, 15_000);

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const ip = clientIp(req);
  connPerIp.set(ip, (connPerIp.get(ip) ?? 0) + 1);
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  let session: Session | null = null;
  let tokens = RATE.burst;
  let lastRefill = Date.now();

  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const fail = (message: string) => send({ t: 'error', message });

  const enterRoom = (room: Room) => {
    session!.roomCode = room.code;
    room.attach(session!.playerId, send, Date.now());
  };

  ws.on('message', (data) => {
    alive.add(ws);
    const now = Date.now();
    tokens = Math.min(RATE.burst, tokens + ((now - lastRefill) / 1000) * RATE.perSecond);
    lastRefill = now;
    if (tokens < 1) return fail('Slow down, Legend.');
    tokens -= 1;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return fail('Bad message.');
    }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return fail('Bad message.');
    if (session) session.lastSeen = now;

    if (msg.t === 'ping') return send({ t: 'pong', at: msg.at, serverNow: now });

    if (msg.t === 'hello') {
      const token = typeof msg.token === 'string' && TOKEN_RE.test(msg.token) ? msg.token : null;
      const existing = token ? sessions.get(token) : undefined;
      // An unknown but well-formed token is a returning browser (e.g. after a
      // server restart): keep its identity instead of minting a new one.
      session = existing ?? { token: token ?? newToken(), playerId: `p_${randomBytes(6).toString('hex')}`, roomCode: null, ws: null, lastSeen: now };
      session.lastSeen = now;
      if (session.ws && session.ws !== ws && session.ws.readyState === session.ws.OPEN) {
        session.ws.send(JSON.stringify({ t: 'displaced' } satisfies ServerMessage));
        session.ws.close(4001, 'displaced');
      }
      session.ws = ws;
      sessions.set(session.token, session);
      const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
      if (room?.members.has(session.playerId)) {
        send({ t: 'welcome', token: session.token, playerId: session.playerId });
        enterRoom(room);
      } else {
        session.roomCode = null;
        send({ t: 'welcome', token: session.token, playerId: null });
      }
      return;
    }

    if (!session) return fail('Say hello first.');
    const current = session.roomCode ? rooms.get(session.roomCode) : undefined;

    if (msg.t === 'create' || msg.t === 'join') {
      let room: Room | undefined;
      if (msg.t === 'create') {
        if (draining) return fail('HUNCH is updating. New rooms open again in a minute.');
        if (rooms.size >= MAX_ROOMS) return fail('Every receiver is busy. Try again in a minute.');
        const recent = (roomsCreatedByIp.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
        if (recent.length >= ROOMS_PER_IP_PER_10MIN) return fail('Too many rooms from this network. Try again soon.');
        roomsCreatedByIp.set(ip, [...recent, now]);
      } else {
        room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!room) return fail('No transmission on that code.');
      }
      if (current) current.leave(session.playerId, now);
      if (!room) {
        room = new Room(newRoomCode(), lexicon, now);
        rooms.set(room.code, room);
      }
      const err = room.join(session.playerId, String(msg.nickname ?? ''), now);
      if (err) {
        if (room.isEmpty) rooms.delete(room.code);
        return fail(err);
      }
      send({ t: 'welcome', token: session.token, playerId: session.playerId });
      enterRoom(room);
      return;
    }

    if (!current) return fail('You are not in a room.');

    if (msg.t === 'leave') {
      current.leave(session.playerId, now);
      session.roomCode = null;
      send({ t: 'state', serverNow: now, pub: null, me: null });
      return;
    }

    if (msg.t === 'start' && draining) return fail('HUNCH is updating. Matches can start again in a minute.');
    current.handle(session.playerId, msg, now);
  });

  ws.on('close', () => {
    const n = (connPerIp.get(ip) ?? 1) - 1;
    if (n <= 0) connPerIp.delete(ip);
    else connPerIp.set(ip, n);
    if (!session || session.ws !== ws) return; // another tab took over
    session.ws = null;
    if (!session.roomCode) return;
    const room = rooms.get(session.roomCode);
    room?.detach(session.playerId, Date.now());
  });
});

// ------------------------------------------------------------------ clock

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.tick(now);
    if (room.isEmpty || (!room.anyoneConnected && now - room.lastActiveAt > ROOM_IDLE_EXPIRY_MS)) {
      rooms.delete(code);
      for (const s of sessions.values()) if (s.roomCode === code) s.roomCode = null;
    }
  }
}, TICK_MS);

// Forget idle identities (the browser keeps its token; a returning one is re-created).
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (!s.ws && !s.roomCode && now - s.lastSeen > SESSION_IDLE_MS) sessions.delete(token);
  }
  for (const [ip, times] of roomsCreatedByIp) {
    const recent = times.filter((t) => now - t < 10 * 60_000);
    if (recent.length) roomsCreatedByIp.set(ip, recent);
    else roomsCreatedByIp.delete(ip);
  }
}, 60_000);

// ------------------------------------------------------------------ lifecycle

/** A match is live from its first round until the final screen. */
const liveMatches = () => [...rooms.values()].filter((r) => r.match && r.match.phase !== 'complete').length;

/**
 * On deploy the platform sends SIGTERM. Rooms live in memory, so: stop new
 * rooms and new matches, tell everyone, let live matches finish (up to
 * DRAIN_MAX_MS), then exit.
 */
function drain(signal: string): void {
  if (draining) return;
  draining = true;
  const started = Date.now();
  console.log(`[hunch] ${signal}: draining (${liveMatches()} live matches)`);
  // Only players mid-match need to know; everyone else just reconnects quietly.
  for (const s of sessions.values()) {
    const room = s.roomCode ? rooms.get(s.roomCode) : undefined;
    if (s.ws && s.ws.readyState === s.ws.OPEN && room?.match && room.match.phase !== 'complete') {
      s.ws.send(JSON.stringify({ t: 'error', message: 'Server restart after this match. Finish it out; new matches pause briefly.' } satisfies ServerMessage));
    }
  }
  const check = setInterval(() => {
    const live = liveMatches();
    if (live === 0 || Date.now() - started > DRAIN_MAX_MS) {
      clearInterval(check);
      console.log(`[hunch] exiting (${live} matches still live)`);
      for (const ws of wss.clients) ws.close(1012, 'restarting');
      http.close();
      setTimeout(() => process.exit(0), 500);
    }
  }, 1000);
}
// Development restarts (file watcher, Ctrl-C) should be instant.
const stop = (signal: string) => (PROD ? drain(signal) : process.exit(0));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[hunch] unhandled rejection', e));
process.on('uncaughtException', (e) => {
  console.error('[hunch] uncaught exception', e);
  process.exit(1); // the platform restarts the machine
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[hunch] ${PROD ? 'production' : 'development'} server on :${PORT} · ${ALL_PUZZLES.length} puzzles · origins: ${
      PROD ? (ALLOWED_ORIGINS.join(', ') || 'same host') : 'any'
    }`,
  );
});
