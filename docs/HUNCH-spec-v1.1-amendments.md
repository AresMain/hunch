# HUNCH — v1.1 Amendments

**Base document:** `HUNCH-spec-v1.0.md` (unchanged sections still apply).
**Scope of this amendment:** adds the Probe phase and Signal Map, replaces the
scoring model (§4), and adds a Feel & Feedback section with world terminology.
The core loop stays the author's: one secret word per round for everyone,
private guesses, clues behind a five-miss gate, personal timers, +30 s per clue.

Where this document conflicts with v1.0, this document wins.

------------------------------------------------------------------------

## A. Round flow (replaces v1.0 §3.1 opening)

1. **Transmission incoming** (≈2 s): round number, word length shown as
   blanks.
2. **Probe phase** (shared, 20 s): every player submits up to **3 probe
   words**. The phase ends when the 20 s elapse or every active player has
   used all three probes.
3. **Fragment reveal** (≈3 s): each player privately sees their opening
   fragment (see §B).
4. **Main phase**: each player's personal **120 s** timer starts at the same
   server moment. Guessing and clues follow v1.0 rules as amended below.
5. **Round reveal** (≈8 s, auto-advance): answer, definition, every player's
   fragment, score breakdowns, standings.

### A.1 Signal Collapse (room setting, default ON)

When the first player in the room solves, every still-active player's deadline
becomes `min(current_deadline, now + 60 s)`. Clue purchases after the collapse
still add +30 s. The collapse fires once per round.

### A.2 Hard cap

Room-level hard cap = main phase start + 120 s + 5 × 30 s = **270 s** after
the main phase begins.

------------------------------------------------------------------------

## B. Probe phase and Signal Map (new)

### B.1 Signal Map

Every puzzle carries a hidden, editor-ranked **Signal Map** of related words:

- **Strong links** (target 8–12): close associations.
- **Weak links** (target 15–30): looser associations.
- The map is ordered: all strong links first, then weak, each in editorial
  rank order.
- The map never contains the answer, its aliases, or its own word forms.
- Plurals and simple inflections of map words count as hits (`mountains` →
  `mountain`).
- The map is **server-only**. Clients learn only the tier of a word they
  themselves typed.

### B.2 Probes

- Probes must be real words (dictionary check). Invalid input is rejected
  without consuming a probe.
- Duplicate probes are rejected without consuming a probe.
- A probe equal to the answer or an alias is a **Blind Hunch**: instant solve.
- Every other probe counts as an **incorrect guess** toward the five-miss clue
  gate.
- Probe results are not shown one by one; they resolve together at the
  fragment reveal.

### B.3 Fragment selection (deterministic, no randomness)

- If one or more probes hit the Signal Map, the **highest-ranked hit** is
  revealed as the player's fragment, labelled with its tier:
  `MOUNTAIN ↔ LINKED (weak)`.
- Only that one word is revealed, even if several probes hit.
- If no probe hits: **Dead Air**. The player receives the puzzle's fallback
  fragment (a broad category nudge) and no probe bonus.
- Players who submit no probes get Dead Air.

### B.4 Letter reveals

The blanks start empty. Letters are revealed privately per player, in their
correct positions, and never for free beyond these two:

1. **Probe letter (at the fragment reveal):** exactly **one** letter from all
   of the player's probes combined. Deterministic: scan probes in the order
   sent, letters left to right; the first letter that appears in the answer
   is revealed at its leftmost still-hidden position. No shared letter → no
   probe letter.
2. **Late letter (personal timer reaches 30 s):** a second letter. It is the
   next probe-matched letter if one exists, otherwise the leftmost hidden
   blank. It triggers on the player's own deadline, so clue extensions delay
   it. It never completes the word.

Main-phase guesses do not reveal letters. Letters are information only and
do not change scoring.

### B.5 Linked guesses in the main phase

During the main phase, a wrong guess that hits the Signal Map is flagged
**LINKED (strong/weak)** to that player. This is information only: no points.

------------------------------------------------------------------------

## C. Scoring (replaces v1.0 §4)

`round_score = solve + probe_bonus + speed_bonus + first_crack − clue_costs`

| Component | Value | Notes |
|---|---|---|
| Solve | 500 | Correct answer before the player's deadline |
| Probe bonus | strong **+75**, weak **+30**, Dead Air **0** | From the best hit only. **Kept even on timeout** |
| Blind Hunch | **+250** | Solved on a probe. Also receives full speed bonus (120) |
| Speed bonus | +1 per whole second left on the **base** 120 s timer, max 120 | Clue extensions do not count. 0 if solved during extension time |
| First Crack | +50 | First player in the room to solve this round |
| Clue costs | 40 / 60 / 80 / 100 / 120 | Total 400. Each clue adds +30 s |
| Timeout | probe bonus only | Solve, speed and First Crack are 0; clue costs still apply but the round score floors at 0 |

- Round score never goes below 0.
- Clue purchase requires `remaining_round_points ≥ cost`, where
  `remaining_round_points = 500 − clue costs paid`. With the new costs a player
  can always afford all five; the rule is kept for safety.
- Maximum round score: 500 + 250 + 120 + 75 + 50 = **995**
  (Blind Hunch on a strong-linked earlier probe, First Crack).
- Match score is the sum of round scores; there is no fixed match maximum.

### C.1 Tie-breakers (replaces v1.0 §8.5)

1. Higher total score. 2. More rounds solved. 3. Lower aggregate solve time.
4. Otherwise a tie.

------------------------------------------------------------------------

## D. World and terminology

Original setting. Do **not** use names, places, characters or terms from any
existing franchise. The look is painterly industrial fantasy: brass, smoke,
glowing runes, hand-drawn chalk and ink effects over painted scenes.

| Term | Meaning |
|---|---|
| **Brasshollow** | The city under threat; brass towers above, smog-lit undercity below |
| **The Receiver** | The great relay tower that catches the encrypted transmissions |
| **The Operator** | Narrator. Brilliant, eccentric, sleep-deprived, under pressure |
| **Legends** | The players, recruited decoders |
| **Transmission** | A round |
| **Probe** | One of the three opening words |
| **Signal Map / Link** | Hidden related words / a hit on one |
| **Fragment** | The revealed opening link |
| **Dead Air** | No probe hit |
| **Static** | Wrong guess feedback |
| **Lever / Intel** | Buying a clue |
| **Crack** | Solving |
| **Blind Hunch** | Solving with a probe |
| **Signal Collapse** | Others' timers capped after the first crack |

------------------------------------------------------------------------

## E. Feel & Feedback (extends v1.0 §10)

Principle: rewards are loud, everything else is quiet. Hand-drawn chalk/ink
effects appear **only on reward moments**. UI text sits on clean, high-contrast
panels in front of the art, never inside it.

| Event | Visual | Sound | Haptic |
|---|---|---|---|
| Round start | Receiver cranks on, gears turn, brief screen-tear, blanks type in | Crackle → rising carrier tone | Soft arrival pulse |
| Probe submitted | Rune slot fills with a dim glyph | Dial tick | Light tap |
| Fragment: strong link | Rune **ignites** cyan, particle burst, chalk circle scribbled around the word | Deep bass hit + bright shimmer | Strong single pulse |
| Letter locks in | Blank flips, letter drops in with brass glow | Click + bright two-note chime | Medium pulse |
| Fragment: weak link | Rune flickers, catches on second try, amber | Softer hit | Medium pulse |
| Dead Air | Sparks fizzle, needle drops | Hiss, music dips | Short double tick |
| Blind Hunch | Full-screen painted splash, ink impact frame, slow-motion zoom | Orchestral stab + choir swell | Celebration pattern |
| Wrong guess (Static) | Brief horizontal glitch on the input, guess drops into the static log | Low distortion blip | Short double pulse |
| Linked guess | Thin glowing thread draws from the guess toward the central sigil | Tuned ping (strong higher than weak) | Light pulse |
| Duplicate / invalid | Inline note, no glitch | Quiet click | None |
| Clue unlocked | Lever drops into reach, chalk arrow scribbled to it | Mechanical clunk | Medium pulse |
| Clue purchased | Lever pulls, gears lock, **+30** stamped in chalk on the timer, cost ticks off points | Heavy clunk + ratchet | Distinct mechanical pulse |
| 15 s left | Palette warms to orange, machine rattles | Low urgency tone every 5 s | Subtle pulse every 5 s |
| Crack (self) | Ink impact frame (2 frames), Receiver beam fires, letters lock in one by one, score breakdown counts up line by line | Layered resolution, each breakdown line its own tick | Success pattern |
| Crack (other player) | Banner: "⚡ NAME CRACKED IT — 0:38" | Alarm sting | Single pulse |
| Signal Collapse | Timer snaps to ≤60, red-orange chalk ring | Pressure drop | Firm pulse |
| Timeout | Glow drains, lights die one by one | Power-down | Descending pulse |
| Round reveal | Answer painted on, fragments shown side by side, leaderboard rows slide to new ranks | Reveal chord | None |
| Match end | City skyline lights up tower by tower | Full music arrangement | Celebration pattern |

### E.1 Adaptive music

The soundtrack adds one layer per round (percussion → bass → pads → lead →
voice). The final round plays the full arrangement.

### E.2 Constraints

- Sound, haptics and reduced motion toggle independently.
- Reduced motion replaces impact frames, shakes and particles with fades.
- All feedback is also conveyed as text.
- First meaningful screen in under 2 s on mobile; art and audio stream after.

------------------------------------------------------------------------

## F. Additional acceptance criteria

- [ ] Probe phase accepts at most 3 valid, unique probes per player.
- [ ] Fragment is the highest-ranked Signal Map hit; ties are impossible
      because the map is totally ordered.
- [ ] Dead Air yields the fallback fragment and 0 probe bonus.
- [ ] A probe matching the answer resolves as Blind Hunch with +250 and +120.
- [ ] Wrong probes count toward the five-miss gate.
- [ ] The Signal Map and answer never reach the client before reveal.
- [ ] Speed bonus uses only the base 120 s timer.
- [ ] Probe bonus is awarded on timeout; nothing else is.
- [ ] Signal Collapse caps other active players at 60 s once, when enabled.
- [ ] Exactly one probe letter is revealed, in its correct position, or none
      if no probe shares a letter with the answer.
- [ ] A second letter is revealed when the player's own remaining time
      reaches 30 s, and never completes the word.
- [ ] Clue costs are exactly 40, 60, 80, 100, 120; each adds exactly 30 s.

------------------------------------------------------------------------

## G. v1.2 changes (supersede anything above that conflicts)

### G.1 Depth ladder (replaces round count and difficulty mix)

Every round goes one step deeper and never gets easier. Puzzles carry a
**depth** from 1 to 5:

| Depth | Name | Rounds |
|---|---|---|
| 1 | Topside | 1 |
| 2 | The Lanes | 2–3 |
| 3 | Undercity | 4–5 |
| 4 | The Sump | 6–7 |
| 5 | The Abyss | 8–12 |

A match plays at most 12 rounds. If a depth runs out of unseen puzzles, the
nearest deeper depth is used first, then shallower. Soundtrack layers follow
depth.

### G.2 Race to a target score (replaces fixed 10 rounds)

- The host picks the target in the lobby: **1,000 / 2,000 / 3,000 / 5,000**
  (default 2,000).
- Scores are awarded at round end. The match ends after the round in which any
  player's total reaches the target.
- If several players cross it in the same round, the highest total wins; ties
  use the existing tie-breakers. If the 12 rounds run out first, the highest
  total wins.

### G.3 Three clues (replaces §C clue costs)

| Clue | Cost | Time | Available |
|---|---|---|---|
| 1 | 50 | +30 s | after 5 misses |
| 2 | 100 | +30 s | after clue 1 |
| 3 | 150 | +30 s | after clue 2, **only when 20 s or less remain** on the player's timer |

Clue 3 is the near-reveal, held back for the last moments. Hard cap becomes
120 + 3 × 30 = **210 s**. Solving after all three clues scores at least 200
before bonuses.

### G.4 Public guesses (overrides v1.0 §8.3 privacy for guesses)

Everyone in the room sees every player's guesses live, with their result
(static / strong link / weak link). Exceptions that stay private:

- Probe words are hidden until the probe phase ends.
- A correct guess shows as **CRACKED**, never the word.
- Fragments, revealed letters and clue text stay private.

### G.5 Look

Neon-punk undercity: near-black smog, hot pink `#ff2d95` and electric cyan
`#19f0ff` with acid-lime accents, spray-paint wordmark with drips, scrawled
doodles, masking-tape panels, misregistered print shadows, scanlines,
RGB-split glitching (ambient every 7–16 s, on wrong guesses, and on headings).
Inspired by the general visual language of neon-punk animation; no characters,
tattoos, logos or motifs from any existing franchise.

------------------------------------------------------------------------

## H. v1.3 changes

### H.1 Podium race (extends G.2)

- Crossing the target wins a **place**, in the order players cross it. If
  several cross in the same round, the higher total takes the higher place.
- A placed player **sits out** the remaining rounds as a spectator (status
  `spectating`): they watch the crew feed but cannot probe, guess or buy intel.
- Play continues until **1st, 2nd and 3rd** are decided. Rooms with fewer than
  four players need one fewer place than they have players (3 players → 1st
  and 2nd; 2 players → 1st only; solo → 1st).
- Everyone who never crosses the target is a **LOSER**.
- If the 20-round bank runs out first, open places go by score (unless tied);
  everyone else is a loser.
- A room event announces each place as it is won.

### H.2 Trails

At match end, every player's trail is public: for each round, the word, depth,
every guess in order with its result and time (probes marked), how the round
ended, intel used and points.

### H.3 Crew record

The room keeps a record across rematches: matches, wins (1st), podiums,
losses, points. Shown on the final screen and in the lobby after the first
match. It lives as long as the room does.

### H.4 Stats card

Each player can generate a 1080×1350 PNG card (place or LOSER stamp, name,
points, cracked/played, fastest crack, blind hunches, deepest depth, hardest
word cracked, round-by-round bars). It opens the system share sheet when the
device supports sharing images; otherwise the image downloads and a text
caption is copied for DMs.
