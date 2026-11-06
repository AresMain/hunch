# HUNCH --- Game & Product Specification

**Version:** 1.0\
**Purpose:** Implementation brief for Claude / engineering\
**Product scope:** Browser-first, real-time multiplayer word-decoding
game\
**Status:** Thematic direction is approved separately. This document
defines game rules, UX, logic, data, and acceptance criteria. Do not
redesign the approved visual direction.

------------------------------------------------------------------------

## 1. Product summary

HUNCH is a competitive word-decoding game. Players receive the same
secret word in each round and race to identify it before their personal
countdown expires. Every player starts each round with 500 points.
Incorrect guesses are free. After five incorrect guesses, the player may
purchase up to five progressively revealing clues. Each clue costs
points and adds 30 seconds to that player's timer.

A match contains 10 rounds. Players compete individually inside a shared
room. Their guesses, clue purchases, and exact remaining time are
private. Other players can see high-level progress and final round
results, but not private solving information.

**Core player fantasy:** You are one of several recruited "legends"
asked to decode a series of mysterious transmissions. The game should
feel urgent, clever, social, and satisfying.

## 2. Product principles

1.  **Deduction first:** Players should have a meaningful chance to
    solve the word before clues unlock.
2.  **Clues are a trade-off:** A clue costs score but grants information
    and 30 seconds.
3.  **Fair competition:** Everyone receives the same word and clue
    sequence, but each player's attempts, clues, timer extensions, and
    score are independent.
4.  **No pay-to-win or random advantage:** No boosts, purchasable
    power-ups, or luck-based scoring.
5.  **Fast feedback:** Every guess and action receives immediate, clear
    feedback.
6.  **Private solving, public competition:** Do not leak a player's
    guesses or clues to opponents.
7.  **Low-friction multiplayer:** A host can create a room and invite
    others with a link or room code. Guests can join with a nickname.

------------------------------------------------------------------------

## 3. Match structure

-   A match contains **10 rounds**.
-   All players in a room receive the same secret answer for a given
    round.
-   The host starts the match once the room is ready.
-   A round starts for all connected players at the same
    server-authoritative start event.
-   Each player has an independent round state:
    -   remaining time
    -   incorrect guess count
    -   clues purchased
    -   remaining round points
    -   completion status
-   A player finishes a round by solving correctly or running out of
    time.
-   A player who finishes early sees a waiting / spectating state while
    others continue.
-   The next round begins when every active player has completed the
    current round, or when the round's hard cap is reached.
-   A disconnected player should not block the room indefinitely. Apply
    the reconnect and timeout rules in section 12.
-   Match ends after round 10. Show individual totals and room
    leaderboard.

### 3.1 Round timer

-   Base timer: **120 seconds** per player, starting at the round start.
-   Each clue successfully purchased adds **30 seconds** to that
    player's remaining time.
-   Clue purchases add time immediately and visibly.
-   Maximum possible time if all five clues are purchased: **270
    seconds** (120 + 5 × 30).
-   Timer never resets to 60 seconds.
-   Timer cannot be extended by incorrect guesses.
-   Timer cannot go below zero.
-   The timer is personal, not shared. One player's clue purchase must
    never extend another player's timer.
-   Use server-authoritative timestamps/deadlines. The client may
    animate a local countdown, but the server determines whether an
    action happened before expiry.
-   If a clue purchase and timeout arrive nearly simultaneously, process
    actions by server receipt time. A clue is valid only if accepted
    before that player's deadline.

**Recommended display:** Show remaining seconds prominently. At 15
seconds, change the visual state to urgent and use restrained warning
haptics/sound. Do not make the interface unreadable or excessively
flashy.

### 3.2 Round completion and hard cap

A player's round ends when: - they submit the correct answer; or - their
personal timer reaches zero.

To prevent a match from stalling, set a **270-second maximum round
duration from the shared round start**. At that point, any unfinished
player is marked timed out. This accommodates the maximum possible
personal timer (120 seconds plus five clue extensions). The server then
advances when all players are complete or the hard cap is reached.

If all players finish early, the room can advance immediately after a
short results reveal (recommended 4--6 seconds), with a host-controlled
"Continue" option only if the room setting enables manual progression.
Default should be automatic to keep pace.

------------------------------------------------------------------------

## 4. Scoring system

### 4.1 Starting score

-   Each player starts every round with **500 round points**.
-   Round points are independent of the player's cumulative match score.
-   Maximum possible match score: **5,000 points** over 10 rounds.

### 4.2 Incorrect guesses

-   First five incorrect guesses are free.
-   Incorrect guesses do not deduct points.
-   Incorrect guesses do not add or remove time.
-   After five incorrect guesses, clues become available.
-   Further incorrect guesses remain free; there is no additional
    penalty.
-   Do not count blank submissions or invalid input as a guess.
-   Duplicate guesses should not consume an attempt; show "Already tried
    that."

### 4.3 Clue costs and sequence

Clues unlock only after the player has made five valid, unique,
incorrect guesses. They must be purchased sequentially.

  Clue     Cost   Time bonus   Cumulative points deducted
  ------ ------ ------------ ----------------------------
  1          50      +30 sec                           50
  2          75      +30 sec                          125
  3         100      +30 sec                          225
  4         125      +30 sec                          350
  5         150      +30 sec                          500

Rules: - Only the next unpurchased clue can be purchased. - A clue
purchase is optional. Players may keep guessing without buying clues. -
A clue purchase deducts its cost immediately and adds 30 seconds
immediately. - A player cannot purchase a clue if they cannot afford its
cost. - Round points cannot fall below zero. - Clues are private to the
purchasing player. - Each clue is revealed once and remains visible for
the rest of that player's round. - Clue content should be progressively
more revealing, but should not simply reveal the answer in the first
clues. - The clue sequence and wording are identical for all players in
a given round.

### 4.4 Correct answer and timeout

-   If the player solves correctly, award their remaining round points.
-   If the player times out, award zero round points for that round.
-   If the player solves after purchasing clues, their score is 500
    minus the sum of purchased clue costs.
-   No extra speed bonus in v1.0. This keeps scoring transparent and
    makes the clue/time trade-off the main strategic decision.
-   No negative score.

### 4.5 Match total

`match_total = sum(round_points_awarded for all completed rounds)`

Display: - current round points during play - cumulative match score -
round-by-round score history in final results

------------------------------------------------------------------------

## 5. Guessing rules and answer validation

-   Answers are curated English words or phrases appropriate to the
    selected difficulty.
-   Store the canonical answer and a list of accepted aliases for each
    puzzle.
-   Normalize input by:
    -   trimming leading/trailing whitespace
    -   case-folding
    -   normalizing repeated whitespace
    -   applying a defined punctuation normalization
-   Compare against canonical answer and accepted aliases.
-   Do not use fuzzy matching in v1.0; it can create false positives and
    disputes.
-   Ignore empty submissions.
-   Duplicate guesses do not consume an attempt.
-   Limit input length to a sensible maximum (e.g. 40 characters).
-   Support keyboard submission with Enter and an explicit submit
    control.
-   On mobile, provide a suitable on-screen keyboard and prevent
    accidental form submission.
-   Do not reveal whether a guess is close, contains particular letters,
    or has a particular edit distance. Incorrect feedback should not
    leak answer information.

### 5.1 Guess feedback states

-   Empty: prompt player to enter a guess.
-   Incorrect: short, clear feedback; increment incorrect guess count.
-   Duplicate: tell the player they already tried it; do not increment
    count.
-   Correct: resolve round immediately.
-   Timed out: lock input and show round-end state.
-   Network pending: disable duplicate submission while the request is
    pending and show a subtle loading state.
-   Server rejected due to timeout: show that time expired before the
    guess was received.

------------------------------------------------------------------------

## 6. Clue content design

Each puzzle must have five clues, ordered from subtle to highly
revealing.

Suggested progression: 1. **Contextual nudge:** Broad category, setting,
or association. 2. **Conceptual clue:** What the word describes or where
it is used. 3. **Distinctive association:** A strong but not decisive
association. 4. **Structural / semantic clue:** More specific meaning,
origin, usage, or word property. 5. **Near-reveal:** A very strong clue,
but not the exact answer.

Guidelines: - Avoid clues that are ambiguous, misleading, or dependent
on specialist knowledge unless the puzzle is explicitly marked hard. -
Avoid giving the first letter too early. If used as the final clue, make
this consistent across the content set. - Clue difficulty should be
play-tested. A clue that gives away the answer immediately makes the
cost/time trade-off meaningless. - Store clues as structured data, not
hard-coded in UI. - Every puzzle must have canonical answer, aliases,
accepted spelling variants, difficulty, category, clue array, and
editorial notes.

------------------------------------------------------------------------

## 7. Difficulty and content

For v1.0: - Build an initial curated bank of at least **100 tested
puzzles** before public launch. - Each puzzle should include 5 clues and
accepted aliases. - Avoid obscure words with no reasonable path to
deduction. - Mix familiar concepts, interesting vocabulary, science,
culture, nature, language, and everyday phenomena. - Avoid culturally
narrow references unless the room selects a relevant category. - Add
difficulty labels internally: easy, medium, hard. - Suggested initial
match composition: 2 easy, 5 medium, 3 hard, shuffled within controlled
distribution. - Do not repeat a puzzle in the same match. - Avoid
repeating recently seen daily puzzles for a player where practical. -
Daily mode (future scope): same puzzle and clue sequence for everyone on
a calendar day.

------------------------------------------------------------------------

## 8. Multiplayer rooms

### 8.1 Room creation and joining

-   Host can create a private room.
-   Generate a short, human-readable room code (case-insensitive; avoid
    ambiguous characters such as O/0 and I/1).
-   Generate a shareable invite URL containing a secure room token or
    code.
-   QR code may be generated from the invite URL.
-   Guests can join with a nickname; account creation is not required
    for v1.
-   Optional email magic-link account support may be added, but should
    not block guest play.
-   Validate and sanitize nicknames. Set a maximum length (e.g. 16
    characters); reject offensive or impersonating names according to
    moderation policy.
-   Room capacity should be configurable. Recommended initial limit:
    2--8 players.
-   Host sees lobby roster and can start when at least 2 players are
    present. Solo practice can be a separate mode.

### 8.2 Lobby

Show: - room code and copy-invite action - player roster and ready
status - host indicator - selected match settings (10 rounds, language,
category/difficulty if enabled) - start button for host - waiting state
for guests

For v1, default to 10 rounds and standard puzzle mix. Avoid overloading
the lobby with settings.

### 8.3 In-round privacy and competition

Public to room: - player nickname/avatar - whether player is active,
solved, or timed out - optional coarse progress status (e.g. "decoding",
"solved") - cumulative score after each round result is revealed

Private to player: - guesses and guess history - incorrect guess count -
clue unlock state and purchased clue text - exact remaining timer -
remaining round points

Do not broadcast private guesses, clue text, or clue purchase state to
other players. Do not reveal the answer to the room until the round is
over for everyone or the server hard cap has elapsed.

### 8.4 Round reveal

When the round is complete: - reveal the answer and definition to
everyone - show each player's round score - show who solved and who
timed out - show clue count used only if product design chooses to
reveal it; recommended to show clue count in results for friendly
rivalry, but never show clue text - update cumulative leaderboard -
continue to next round automatically after 4--6 seconds by default

### 8.5 Final results

Show: - ranked leaderboard by cumulative points - each player's total
out of 5,000 - round-by-round breakdown - number of solves - average
solve time (only if calculated consistently) - optional "play again" /
rematch action - invite/share action

Tie-breakers for v1: 1. Higher total score. 2. More rounds solved. 3.
Lower aggregate solve time among solved rounds. 4. If still tied,
declare a tie. Do not invent hidden tie-breakers.

------------------------------------------------------------------------

## 9. UX and screen requirements

The approved visual direction is handled separately. Preserve the
established dark, painterly, cinematic industrial-fantasy art direction.
This spec is not permission to replace it with a generic dashboard,
generic quiz UI, or unrelated theme.

### 9.1 First-time opening cinematic

The first visit to the game should open with a short cinematic briefing
(target 25--40 seconds, skippable immediately): - radio crackle /
incoming transmission - unknown voice asks whether anyone can hear -
establish that an encrypted message threatens a city or community -
receiver tower sends the transmission to selected "legends" - narrator
says a line in the spirit of: "We've sent it to the best minds we could
find. Yes. That means you." - call to action: "Accept the
transmission" - transition directly into lobby or solo start; avoid an
unnecessary menu after the cinematic

Returning players should see a short 3--5 second transmission sting or
be able to disable the intro entirely.

The narrator should be intelligent, eccentric, slightly sleep-deprived,
and under pressure. The tone is cinematic but lightly playful, not
grimdark parody.

### 9.2 Home / entry

-   Strong world scene and clear primary action.
-   Primary actions: create room, join room, solo practice (if
    included).
-   Explain the game in one concise line.
-   Do not force account creation before a player can try the game.

### 9.3 Lobby

-   Room code and invite controls.
-   Player roster / readiness.
-   Match settings summary.
-   Host-only start action.

### 9.4 Gameplay

Must show: - transmission/round number - personal countdown - remaining
round points - cumulative match score - answer input and submit action -
incorrect guess count / free attempt state - clue unlock status -
available next clue and its point cost / +30 sec reward - purchased
clues visible privately - high-level crew status without exposing
private information

The receiver / environment can visually respond to game states, but
gameplay information must remain legible and accessible.

### 9.5 Round results

-   reveal answer and definition
-   show points earned
-   show clue cost and time extension summary to that player
-   show room standings
-   transition to next round

### 9.6 Final results

-   full leaderboard
-   cumulative score and /5,000
-   round score breakdown
-   rematch and invite actions

------------------------------------------------------------------------

## 10. Feedback, sound, and haptics

Treat feedback as part of the core experience, but provide settings to
disable sound and haptics independently.

  -----------------------------------------------------------------------
  Event                   Haptic                  Sound / visual
  ----------------------- ----------------------- -----------------------
  Letter / key            Very light tap, if      Subtle mechanical key
  interaction             supported               sound

  Incorrect guess         Short double pulse      Low signal distortion;
                                                  brief restrained
                                                  red/orange flicker

  Duplicate guess         No or very light tap    Quiet informational
                                                  feedback

  Correct answer          Distinct success        Layered resolution;
                          pattern                 station lights activate

  Clue purchased          Distinct mechanical     Receiver tuning /
                          pulse                   lock-in sound; +30
                                                  timer animation

  15 seconds remaining    Subtle periodic warning Low urgency tone; timer
                          pulse                   shifts to warning state

  Timeout                 Firm descending pulse   Signal fades / receiver
                                                  powers down

  New round               Soft arrival pulse      Incoming transmission
                                                  sound

  Match victory           Celebratory but         Musical payoff and
                          restrained              environmental
                                                  activation
  -----------------------------------------------------------------------

Implementation notes: - Browser haptic support is inconsistent. Use the
Vibration API only when available and permitted; never make it a
requirement. - Provide a reduced-motion setting. - Respect device and
browser audio policies. Start audio only after a user gesture. - Do not
play warning haptics every second. Use restrained intervals. - Avoid
sensory overload: animations should reinforce meaning, not obscure
controls or text. - All important information must also be conveyed
visually and in text.

------------------------------------------------------------------------

## 11. Game states and state machine

### 11.1 Match states

-   `room_created`
-   `lobby`
-   `match_starting`
-   `round_active`
-   `round_reveal`
-   `match_complete`
-   `cancelled`

### 11.2 Player round states

-   `active`
-   `solved`
-   `timed_out`
-   `disconnected`
-   `forfeited`

### 11.3 Player round data

At minimum: - `player_id` - `match_id` - `round_id` - `status` -
`started_at` - `deadline_at` - `remaining_points` -
`incorrect_guess_count` - `guesses` (private) - `purchased_clue_indices`
(private) - `revealed_clues` (private) - `solved_at` -
`time_remaining_at_finish` - `points_awarded`

### 11.4 Critical transitions

-   `round_active` → `solved` on accepted correct answer before
    deadline.
-   `round_active` → `timed_out` when server deadline passes.
-   `round_active` → clue purchase only if five incorrect guesses, next
    clue index is valid, player can afford it, and deadline has not
    passed.
-   A clue purchase deducts cost, increments deadline by 30 seconds, and
    records the clue reveal atomically.
-   A duplicate or invalid guess does not increment the incorrect count.
-   A correct guess and timeout race must be resolved by server receipt
    time.
-   Once a player is solved or timed out, no further guesses or clue
    purchases are accepted.

------------------------------------------------------------------------

## 12. Reconnects, disconnects, and fairness

-   A temporary disconnect must not pause the player's timer or the room
    timer.
-   On reconnect, restore the player's private round state and current
    server-derived time remaining.
-   Keep a player slot reserved for a configurable grace period
    (recommended 60 seconds).
-   If a player does not reconnect within the grace period, mark them
    forfeited for the current match; their score remains as already
    earned, and they do not block progression.
-   Reconnecting clients must not be able to replay a clue purchase or
    guess action twice.
-   Use idempotency keys or server-side action IDs for guess and clue
    requests.
-   If the host disconnects, transfer host role to the earliest
    remaining connected player.
-   Do not trust client-side score, timer, clue state, answer
    validation, or match progression.

------------------------------------------------------------------------

## 13. Technical architecture recommendation

Recommended implementation for a browser-first MVP: - **Frontend:**
Next.js + TypeScript + React. - **Backend / database / realtime:**
Supabase (Postgres, Auth, Realtime, Edge Functions or server-side API
routes). - **Authoritative game logic:** Server-side functions / API
endpoints. The browser is a presentation client only. - **Database:**
PostgreSQL. - **Realtime:** Supabase Realtime or a server-authoritative
WebSocket layer for room events. - **Guest identity:** Anonymous session
/ generated guest player identity with secure room membership token. -
**Hosting:** Vercel or equivalent for Next.js; Supabase hosted project
for backend. - **Asset delivery:** CDN / optimized image and audio
assets.

Important: Do not implement game scoring or answer validation
exclusively in client-side JavaScript. A modified browser must not be
able to award itself points, extend time, reveal clues, or submit an
answer after expiry.

### 13.1 Server-authoritative actions

Provide server endpoints / functions for: - create room - join room -
set ready state - start match - get player state - submit guess -
purchase clue - mark timeout / resolve round - reveal round result -
advance round - finish match - rematch

Each action must validate room membership, player identity, match state,
player state, and server time.

### 13.2 Suggested data model

**users / player_profiles** - id - display_name - created_at - optional
auth_user_id

**rooms** - id - room_code - host_player_id - status - settings_json -
created_at - expires_at

**room_members** - room_id - player_id - nickname - role - ready -
joined_at - connection_status

**puzzles** - id - canonical_answer - normalized_answer -
accepted_aliases (array or related table) - definition - category -
difficulty - language - active - editorial_notes

**puzzle_clues** - id - puzzle_id - clue_index (0--4) - clue_text

**matches** - id - room_id - status - current_round_number -
started_at - completed_at - hard_round_deadline_at

**match_rounds** - id - match_id - puzzle_id - round_number -
started_at - reveal_at

**player_rounds** - id - match_round_id - player_id - status -
deadline_at - remaining_points - incorrect_guess_count -
purchased_clue_count - solved_at - points_awarded - finished_at

**player_guesses** (private) - id - player_round_id - normalized_guess -
is_correct - submitted_at - action_id

**player_clue_purchases** (private) - id - player_round_id -
clue_index - cost - purchased_at - action_id

**match_player_totals** - match_id - player_id - total_points -
rounds_solved - aggregate_solve_time

Use database constraints / transactions to enforce: - one clue purchase
per clue index per player-round - sequential clue purchase - no negative
points - no duplicate action processing - no score award more than
once - one player-round record per player per match-round

Do not expose private guesses or clue purchases through public realtime
subscriptions. Use separate public room events and authenticated private
player-state reads.

------------------------------------------------------------------------

## 14. Security and abuse prevention

-   Room codes are identifiers, not sufficient authorization by
    themselves. Use a secure membership token.
-   Validate every action server-side.
-   Rate-limit guess submissions to prevent spam (e.g. a modest
    per-player request limit; do not make normal fast play feel laggy).
-   Escape/sanitize nicknames and all user-generated text.
-   Avoid leaking puzzle answer in client payloads, HTML, JavaScript
    bundles, or public database queries before round reveal.
-   Keep answer validation server-side.
-   Keep clue text private until purchased.
-   Ensure realtime payloads do not include secret answer, private
    clues, or private guesses.
-   Add basic room abuse controls: host removal, leave room, report
    nickname, and room expiry.
-   Do not store unnecessary personal data for guest players.

------------------------------------------------------------------------

## 15. Accessibility and device support

-   Responsive desktop and mobile layouts.
-   Keyboard support for all essential actions.
-   Visible focus states.
-   Sufficient contrast for text and interactive controls.
-   Do not use colour alone to communicate correct/incorrect/urgent
    states.
-   Reduced-motion option.
-   Sound and haptics toggles.
-   Respect browser safe areas on mobile.
-   Handle browser tab backgrounding: server timer continues; when
    player returns, reconcile with server time.
-   Provide a functional experience if vibration or audio APIs are
    unavailable.
-   Avoid relying on hover for essential controls.

------------------------------------------------------------------------

## 16. Analytics and balancing

Track events without collecting unnecessary personal data: -
room_created - room_joined - match_started - round_started -
guess_submitted - guess_correct - guess_incorrect - duplicate_guess -
clue_unlocked - clue_purchased - round_solved - round_timed_out -
player_disconnected - player_reconnected - match_completed -
rematch_started

Useful balancing metrics: - solve rate by puzzle and difficulty - median
solve time - percentage solving before clue unlock - clue purchase rate
by clue index - percentage of players who buy all clues - timeout rate -
average points per round - match completion rate - disconnect rate

Use these metrics to tune puzzle difficulty and clue quality. Do not
change scoring silently after launch.

------------------------------------------------------------------------

## 17. MVP scope and delivery order

### Phase 1 --- Core playable game

-   puzzle bank and answer validation
-   single-player local / solo practice loop
-   120-second timer and +30-second clue extensions
-   five free incorrect guesses
-   sequential clue purchases and scoring
-   round results and 10-round match total
-   responsive UI

### Phase 2 --- Multiplayer rooms

-   create / join room
-   room code and invite URL
-   lobby and ready state
-   server-authoritative synchronized round start
-   private player state and public room status
-   round reveal and leaderboard
-   reconnect handling

### Phase 3 --- Polish

-   first-time cinematic and skip / replay settings
-   sound and haptic feedback
-   animation / reduced-motion support
-   final results and rematch
-   analytics and content balancing

Do not build all three phases as one untestable monolith. Keep the core
game engine independent from presentation and realtime transport.

------------------------------------------------------------------------

## 18. Acceptance criteria

The implementation is not complete until all of the following pass.

### Core rules

-   [ ] Every player begins each round with exactly 500 points.
-   [ ] Every player begins with exactly 120 seconds.
-   [ ] Five unique incorrect guesses are required before the first clue
    is purchasable.
-   [ ] Incorrect guesses do not deduct points or time.
-   [ ] Duplicate guesses do not count as attempts.
-   [ ] Clues can only be purchased in order.
-   [ ] Clue costs are exactly 50, 75, 100, 125, and 150.
-   [ ] Every successful clue purchase adds exactly 30 seconds to that
    player's deadline.
-   [ ] A clue purchase deducts its cost and reveals only that clue to
    that player.
-   [ ] A player cannot buy a clue they cannot afford.
-   [ ] Correct answer awards the player's remaining round points.
-   [ ] Timeout awards zero points.
-   [ ] No player can receive negative points.
-   [ ] Maximum match score is 5,000.

### Multiplayer fairness

-   [ ] All players receive the same puzzle in each round.
-   [ ] Clue purchases and timer extensions affect only the purchasing
    player.
-   [ ] Guesses and clue text remain private.
-   [ ] Players cannot submit after their server deadline.
-   [ ] A player who finishes early cannot continue acting in that
    round.
-   [ ] One player's disconnect does not pause another player's timer.
-   [ ] Reconnect restores the correct private state.
-   [ ] Duplicate network requests cannot double-deduct points or
    double-award score.

### UX

-   [ ] First-time intro can be skipped immediately.
-   [ ] Returning-player intro can be shortened or disabled.
-   [ ] Gameplay clearly displays timer, points, guesses, clue state,
    and round.
-   [ ] Results reveal answer and definition only when the round is over
    for the room.
-   [ ] Essential gameplay works on mobile and desktop.
-   [ ] Sound, haptics, and motion can be disabled independently /
    reduced.

### Content

-   [ ] Every active puzzle has five reviewed clues.
-   [ ] Every puzzle has a canonical answer and accepted aliases.
-   [ ] No puzzle repeats within one match.
-   [ ] Every clue is tested for ambiguity and accidental answer
    leakage.

------------------------------------------------------------------------

## 19. Explicit non-goals for v1

Do not add these unless separately approved: - public matchmaking -
global player profiles and persistent progression - paid boosts or
power-ups - player-to-player chat - user-generated puzzles - fuzzy
answer matching - speed bonuses - complex ranking leagues - AI-generated
live clues - multiple languages - elaborate station upgrades or economy

These can distract from proving the core loop.

------------------------------------------------------------------------

## 20. Implementation instructions for Claude

Build from this specification. Before coding: 1. Restate the rules and
identify any contradictions or missing decisions. 2. Propose a clean
architecture and database schema. 3. Define server-authoritative state
transitions and transaction boundaries. 4. Write unit tests for scoring,
clue purchasing, timer extensions, duplicate guesses, and timeout races.
5. Implement the core game engine before polishing UI. 6. Keep puzzle
content separate from application logic. 7. Keep the approved art
direction intact; do not invent a new theme. 8. Clearly label simulated
features. Do not present simulated multiplayer as real multiplayer. 9.
Deliver runnable code, setup instructions, environment variable
examples, migrations, seed puzzles, and automated tests. 10. Do not
claim a feature is complete unless it is implemented and tested.

### Decisions that must remain configurable

-   room capacity
-   reconnect grace period
-   automatic versus host-controlled round progression
-   intro enabled / disabled
-   sound, haptics, reduced-motion settings
-   puzzle categories and difficulty distribution

### One important product assumption

This spec treats the timer as **personal per player**, with a shared
round start and a 270-second room-level hard cap. This avoids one
player's clue purchase granting extra time to opponents. If product
testing suggests a shared timer is preferable, do not silently change
it; propose the alternative and explain its competitive implications
first.
