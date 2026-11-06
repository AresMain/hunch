# HUNCH — Launch Checklist

Status as of 2026-11-06: **playable, not production-ready.** The game, rules,
multiplayer, puzzle bank and guest identity work and are tested (300 tests).
What's missing is mostly infrastructure, legal and polish.

Legend: 🔴 blocks launch · 🟠 needed within weeks of launch · 🟢 growth

------------------------------------------------------------------------

## 1. Hosting and reliability

- [x] Deploy setup for Fly.io: Dockerfile (tests run in the build),
      fly.toml (one machine, bluegreen, health checks, 300 s kill timeout),
      CI workflow with auto-deploy. Production build verified locally.
- [ ] 🔴 **Run the first deploy** (`fly launch --copy-config --no-deploy`,
      `fly deploy`, `fly scale count 1`; see README).
- [ ] 🔴 Domain + HTTPS: `fly certs add`, then set `ALLOWED_ORIGINS`.
- [x] Origin checks on the WebSocket upgrade (same host by default).
- [x] Graceful deploys: SIGTERM drains (no new rooms/matches, live matches
      finish, up to 4 min). A crash still ends live matches; Redis fixes that.
- [ ] 🔴 Error monitoring (Sentry or similar) on client and server.
- [ ] 🔴 Health check (`/health` exists) wired to the host's restarts and an
      uptime monitor.
- [ ] 🟠 Load test: 200+ concurrent rooms × 8 players. The tick loop and
      per-tick JSON broadcast are the hot spots.
- [ ] 🟠 Multiple server instances: room-code → instance routing (sticky
      by code) plus Redis for sessions and room state.
- [x] CI: typecheck, tests and build on every push; deploy only after.

## 2. Data and accounts

- [ ] 🔴 Database (Postgres; Supabase is fine) for anything that must
      survive: accounts, cloud records, daily results, reports.
- [ ] 🟠 Accounts (Google + email magic link). The UI gate already exists
      (`AccountSheet`): guests never see sign-in unless they choose cloud
      save, Daily Career or a public profile.
- [ ] 🟠 On first sign-in, upload the browser record (`hunch.profile` in
      localStorage) so guests don't lose history.
- [ ] 🟠 Data export and delete-my-account (GDPR/CCPA).

## 3. Game completeness

- [x] Mobile pass in a 375×812 phone viewport: every screen checked; fixes
      for scroll position, clipped controls, banner placement, cramped
      tables, keyboard covering the input, address-bar height, tap delay,
      audio after backgrounding, lighter rain, live crew ticker under the
      guess box.
- [x] Reconnect: instant redial on resume/focus/network change, dead-socket
      detection (client ping + server heartbeat), clock re-sync, screen
      wake lock during matches, "signal lost" bar. Verified: page reload
      mid-round restores seat, timer, letters, log and feed.
- [ ] 🔴 **Same pass on real phones** (iOS Safari 16+, Android Chrome):
      emulation can't reproduce the iOS keyboard, wake lock permissions or
      carrier network drops. Lock the phone 30 s mid-round and confirm the
      seat survives.
- [ ] 🟠 Daily Career: one deterministic descent per date for everyone
      (seed = date), streaks, global daily board. Needs accounts + DB.
- [ ] 🟠 QR code for invites (lobby).
- [ ] 🟠 Host controls: kick, transfer host, lock room.
- [ ] 🟢 Public matchmaking ("Quick play" into an open room).
- [ ] 🟢 PWA install (manifest + service worker for the shell).

## 4. Content and moderation

- [ ] 🔴 **Human review pass on the generated bank** (~2,840 puzzles). Start
      with Topside/The Lanes, since that's what everyone sees first. Block
      anything unpleasant or confusing; promote great words to hand-written
      puzzles with better clues.
- [ ] 🔴 Nickname filter (profanity/slurs, including leetspeak) and a
      "report name" button. Spec §8.1 / §14 require this.
- [ ] 🟠 In-game "this puzzle was bad" button feeding a review queue.
- [ ] 🟠 Analytics on solve rate per puzzle (spec §16) to retune depth
      automatically: words nobody cracks go deeper or get removed.

## 5. Legal

- [ ] 🔴 Privacy policy and terms of service.
- [ ] 🔴 **Consent banner (CMP)** before any ad or analytics script in the
      EU/UK (GDPR, ePrivacy) and a "Do not sell/share" link for California.
      Use a Google-certified CMP if you use AdSense/AdMob.
- [ ] 🔴 Age position: either 13+ with an age gate, or kid-safe ads only
      (COPPA). Ad networks require you to declare this.
- [ ] 🔴 Attribution: WordNet 3.1 license notice and SCOWL copyright in an
      About/credits page (both licenses are permissive but require notice).
- [ ] 🟠 Trademark search for "HUNCH" in games/apps before spending on brand.
- [ ] ✅ Fonts are Google Fonts (OFL), so they're fine to ship.

## 6. Security

- [x] WebSocket origin allow-list, sockets per IP (40), rooms per IP
      (30 / 10 min), total rooms (5,000), idle-session pruning.
- [ ] 🔴 Keep the rate limit (6 msgs/s burst 10, exists) and add IP-level
      connection limits at the proxy.
- [x] Runtime dependencies audited: 0 known vulnerabilities (`ws` upgraded
      to 8.22.1).
- [ ] 🟠 Dev-tool advisories (vitest, vite dev server, esbuild dev server):
      upgrade to current majors. They don't ship in the image.
- [ ] ✅ Server-authoritative scoring, answers never sent early, idempotent
      actions, unguessable browser identity tokens.

## 7. Performance and polish

- [ ] 🟠 Lighthouse on a mid-range Android: the rain canvas, glows and
      `backdrop-filter` are the costly bits; add a "low effects" auto-mode.
- [ ] 🟠 Self-host fonts (faster first paint, no third-party request).
- [ ] 🟠 Open Graph tags + share image so invite links preview nicely in
      chats.
- [ ] 🟠 Accessibility audit (screen reader labels on the live crew feed,
      contrast on muted text, focus order in the final screen).

## 8. Ads (slots are in place)

Reserved, size-locked slots, **never during probing or decoding**:

| Slot id | Size | Where |
|---|---|---|
| `home-footer` | 320×50 | Home, below the record |
| `lobby-side` | 300×250 | Lobby, under match settings (players wait here) |
| `between-rounds` | 320×50 | Round reveal (10 s natural break) |
| `spectating` | 300×250 | Players who already placed, watching |
| `final` | 300×250 | Final screen, above the crew record |

- [ ] 🔴 Choose a network (AdSense for web to start; consider a header-bidding
      partner later) and get approved (needs domain, privacy policy, content).
- [ ] 🔴 Mount the network tag in `AdSlot` when `VITE_ADS=live`; keep slots
      collapsed until consent is given.
- [ ] 🟠 `ads.txt` at the domain root.
- [ ] 🟠 Frequency cap: at most one between-rounds ad per two rounds.

------------------------------------------------------------------------

## Scaling plan

1. **One server** handles a lot: rooms are tiny and ticks are cheap. Launch on
   one well-sized instance plus a static CDN for the client.
2. **Split** when needed: client on a CDN, game servers behind a router that
   sends a room code to the same instance (consistent hashing), Redis for
   sessions and cross-instance presence.
3. **Daily Career is nearly free to scale**: the day's puzzles are fixed, so
   play can be validated per request and results written to Postgres.
4. **Regions**: run game servers in 2–3 regions; room creator's region hosts
   the room.

## Monetization (keep the no-pay-to-win promise)

| Stream | What | Notes |
|---|---|---|
| Ads | The five slots above | Main early income; never mid-round |
| **HUNCH+** subscription | Ad-free, full stats history and trails, custom target scores and room sizes, Daily archive, early depth packs | ~$2.99/mo; the cleanest model |
| Cosmetics | Spray-tag colors, avatar styles, Receiver skins, stats-card frames | Pure looks, no advantage |
| Themed word packs | Movies, science, sports, holidays; hosts unlock a pack for their room | One-time purchases; generator can produce packs fast |
| Custom packs (B2B) | Schools, team-building, streamers upload their own word lists | Per-event or monthly; big margin |
| Sponsored dailies | A brand sponsors a themed Daily ("Space Week") | Later, once Daily has an audience |

Avoid: rewarded ads for extra clues or time (pay-to-win), loot boxes, energy
timers.

## Growth levers

- Stats cards already make every match shareable; add the domain on the card
  and Open Graph previews on invite links.
- Daily Career streaks + one shared daily result ("I cracked today's Abyss in
  0:42") is the biggest retention driver.
- Streamer mode: hide words on stream, spectator view, Twitch chat as a crew.
