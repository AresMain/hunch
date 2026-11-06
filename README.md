# HUNCH

Real-time multiplayer word-decoding game. Brasshollow is under siege by
encrypted words: probe the signal, crack the word, beat your crew to it.

- Rules: `docs/HUNCH-spec-v1.0.md` + `docs/HUNCH-spec-v1.1-amendments.md`
  (v1.1 wins on conflicts: Probe phase, Signal Map, new scoring, Feel & Feedback).

## Run it

```bash
npm install
npm run dev
```

- Open the URL Vite prints (default http://localhost:5173).
- **Play with friends on the same Wi-Fi:** they open the `Network:` URL Vite
  prints (e.g. `http://192.168.x.x:5173`) or your invite link with that host.
- Each browser tab is its own player, so you can test multiplayer with two tabs.
- Solo practice: create a room and start it alone.

```bash
npm test          # engine + content tests (vitest)
npm run typecheck
```

Production locally (one process serving the client and the game):

```bash
npm run build && PORT=8787 npm start
```

## Deploy (Fly.io)

Everything is configured: `Dockerfile`, `fly.toml`, `.github/workflows/ci.yml`.
Fly builds the image on its own servers, so Docker isn't needed locally.

1. Install the CLI and sign in (creates a free account if you don't have one):
   ```bash
   brew install flyctl
   ```
   ```bash
   fly auth login
   ```
2. Create the app from the included config. Pick a unique name when asked, and
   answer **no** to adding databases:
   ```bash
   fly launch --copy-config --no-deploy
   ```
3. Deploy (runs typecheck + tests + build inside the image build):
   ```bash
   fly deploy
   ```
4. Keep exactly one machine (rooms live in memory):
   ```bash
   fly scale count 1
   ```
5. Open it: `https://<app-name>.fly.dev`. Check `/health`.

Custom domain: `fly certs add play.yourdomain.com`, point the DNS records Fly
prints, then set `ALLOWED_ORIGINS` in `fly.toml` to your domain(s) and deploy.

Automatic deploys: push this project to a GitHub repo, create a token with
`fly tokens create deploy`, and add it as the repo secret `FLY_API_TOKEN`.
Every push to `main` then runs checks and deploys.

How deploys behave: Fly starts the new version, waits for `/health`, then sends
the old one SIGTERM. The old server tells players an update is coming, refuses
new rooms and matches, lets live matches finish (up to 4 minutes), then exits.
A player whose phone reconnects during that window lands on the new version
and returns to the home screen.

Production settings (`fly.toml [env]`): `ALLOWED_ORIGINS`, `MAX_ROOMS`,
`MAX_CONN_PER_IP`, `DRAIN_MAX_MS`. Ads are hidden in production builds
(`VITE_ADS=off`) until a network is wired; see `.env.example`.

## Layout

| Path | What |
|---|---|
| `src/engine/` | Pure, deterministic game rules. No I/O; time is passed in. Fully unit-tested. |
| `src/server/` | Node HTTP + WebSocket server: rooms, sessions, reconnect, tick loop, puzzle bank, dictionary. |
| `src/shared/types.ts` | Protocol and view types shared by server and client. |
| `src/client/` | React client: screens, Receiver, reward FX, synthesized sound, haptics. |
| `docs/` | Specs. |

## Server authority

The browser is a display. The server owns: the answer, the Signal Map, clue
text until bought, all timers/deadlines, validation, and scoring. Actions carry
idempotency keys; replays are ignored. Probe results stay hidden until the
fragment reveal. The answer reaches clients only at round reveal.

## Sessions and reconnect

- A per-tab session token (sessionStorage) identifies the player; reloading
  the tab reconnects to the same seat and private state.
- Disconnects never pause timers. After 60 s away, a player is forfeited for
  the rest of the match (score kept). Host passes to the earliest connected
  player.
- Rooms live in memory and expire after 15 idle minutes. **A server restart
  ends all rooms** (no database yet).

## Puzzle bank

About **2,900 puzzles** across five depths:

- `src/server/puzzles.ts`: 62 hand-written puzzles (the best clues).
- `src/server/data/puzzles.generated.json`: ~2,840 puzzles generated from
  WordNet 3.1 with SCOWL word-frequency tiers by `scripts/build-puzzles.ts`.
  Each gets three clues (field + sister terms → "it is a…" + varieties/parts →
  redacted definition + first letter), a Dead Air hint, a definition and a
  ranked Signal Map. Depth comes from how common the word is and its length.
  Abstract, slang, offensive and proper-noun senses are filtered out, and
  concrete categories are favoured.

Regenerate after changing the generator:

```bash
npm run build:puzzles
```

Rotation: each match deals fresh words first, then words dealt recently in
other rooms (last 800), then words this room has already seen.

`npm test` checks every puzzle (hand-written and generated) for completeness
and for links or clues that leak the answer.

To hand-write a puzzle, add it to `src/server/puzzles.ts` and regenerate (the
generator skips answers that already have a hand-written puzzle).

## Not built yet

- Database persistence (Postgres/Supabase per spec §13) and accounts
- Generated clues are serviceable but plainer than hand-written ones; promote favourites to hand-written
- QR invite code, nickname reporting, host kick
- Commissioned painted art and recorded audio (current art is SVG/CSS; sound is synthesized)
- Analytics events (spec §16)
- Deployment
